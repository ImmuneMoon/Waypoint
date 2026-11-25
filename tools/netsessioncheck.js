/* netsessioncheck.js: what a session keeps in step at a table, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 4, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: doc theming mid-session, the joined player's top bar and a campaign renamed
   mid-session, the fog defaults changed mid-session (play areas), the library on the wire (L3 and L3b), security R2 cluster E (a player's
   app not yet at the table, and the plan-aware mode's writes), security R2 cluster F (journals, handouts, shares and the notepad), the
   Multiplayer panel's two parts, Leave session, the table trackers on the wire (backlog 29), sounds on actions, a row's look and work
   line on the wire (206), and a chat line's mentions. With step 5 (2026-11-19): the VTT ceiling on the wire (R2 #18, broadcastStance)
   and the item library's manifest kept out of the players' snapshot (L1c).
   It reads the joined net.js through srcjoin, as netcheck did, and the broadcast slice (netfog.js, a part of net.js, read by its own
   name) from tools/checkkit.js (netGate).
   Run: node tools/netsessioncheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, tryBetween, fnSrc, lineOf, ordersSrc } = kit.netSlices('netsessioncheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { helpersSrc, storage, H, ownKeySrc } = kit.netHarness('netsessioncheck');
// the admission gate's harness netcheck kept at its top, the very code (checkkit netGate)
const { broadcastSrc } = kit.netGate('netsessioncheck');
const j = JSON.stringify;

/* ================= doc theming mid-session ================= */
check('docStyle: the campaign look syncs on every host save like the system (once per change, admitted peers only)', /net\.syncDocStyle = function\(force\)/.test(src) && /net\.syncDocStyle\(\);/.test(src) && /if \(c\.open && own\(net\.roster, c\.peer\)\) \{ try \{ c\.send\(msg\); \}/.test(src) && /net\._lastDocStyleSig = quickHash\(JSON\.stringify\(dsm\.docStyle\)\)/.test(src));
check('docStyle: a client takes it from the synced host only, for the hosted campaign, re-validated; a host has no branch for it', /msg\.type === 'docStyle' && net\.role === 'client'/.test(src) && /conn\.peer !== net\.syncedPeer \|\| net\.stream\) return;\n\s*if \(typeof msg\.campId !== 'string' \|\| msg\.campId !== state\.appState\.activeCampaignId\) return;\n\s*var campDS = campOf/.test(src) && /cleanDocStyle\(msg\.docStyle\)/.test(src) && !/msg\.type === 'docStyle' && net\.role === 'host'/.test(src));
{   // the joined player's top bar (1.5.0): "<campaign> › <map>" from the host's strings — the real whereName / tableWhere / paintWhere, sliced from net.js
    const whereSrc = between('// [netcheck:where-start]', '// [netcheck:where-end]', 'where');
    const WH = new Function('localStorage', 'crypto', helpersSrc + '\n' + whereSrc + '\nreturn { whereName, tableWhere, paintWhere };')(storage, globalThis.crypto);
    // A DOM stand-in that records every write: markup (innerHTML, outerHTML, insertAdjacentHTML, document.write) is a failure, and so is any attribute but the separator's constant aria-hidden
    function fakeDom() {
        const log = [];
        function node(tag) {
            const n = { tag, children: [], className: '', _text: '', _title: '', classes: new Set(), attrs: {} };
            Object.defineProperty(n, 'textContent', { get() { return n.children.length ? n.children.map(c => c.textContent).join('') : n._text; }, set(v) { n.children = []; n._text = String(v); log.push(['text', tag, String(v)]); } });
            Object.defineProperty(n, 'title', { get() { return n._title; }, set(v) { n._title = String(v); } });
            ['innerHTML', 'outerHTML'].forEach(k => Object.defineProperty(n, k, { get() { return ''; }, set(v) { log.push(['markup', k, String(v)]); } }));
            n.insertAdjacentHTML = (pos, v) => log.push(['markup', 'insertAdjacentHTML', String(v)]);
            n.setAttribute = (k, v) => { n.attrs[k] = String(v); log.push(['attr', k, String(v)]); };
            n.appendChild = c => { n.children.push(c); return c; };
            n.append = (...cs) => { cs.forEach(c => n.children.push(typeof c === 'string' ? { tag: '#text', textContent: c, children: [], attrs: {} } : c)); };
            n.replaceChildren = (...cs) => { n.children = []; n._text = ''; n.append(...cs); };
            n.classList = { toggle: (c, on) => { const want = on === undefined ? !n.classes.has(c) : !!on; if (want) n.classes.add(c); else n.classes.delete(c); return want; }, add: c => n.classes.add(c), remove: c => n.classes.delete(c), contains: c => n.classes.has(c) };
            return n;
        }
        return { log, box: node('div'), mapBox: node('div'), doc: { createElement: t => node(String(t).toLowerCase()), createTextNode: t => ({ tag: '#text', textContent: String(t), children: [], attrs: {} }), write: v => log.push(['markup', 'document.write', String(v)]) } };
    }
    const joined = { role: 'client', syncedPeer: 'room-peer', foreign: true, active: true };
    const HOST_C = '<img src=x onerror=alert(1)>', HOST_M = '<script>alert(1)</script>\u202e\u200b evil\u0007\nline"><b onclick=x>';
    const wantM = '<script>alert(1)</script> evil line"><b onclick=x>';
    const camp = { id: 'c_host', name: HOST_C, activeItemId: 'map_city', items: {
        map_world: { id: 'map_world', type: 'map', meta: { title: 'Parent World' } },
        map_region: { id: 'map_region', type: 'map', meta: { title: 'Parent Region', parentId: 'map_world' } },
        map_city: { id: 'map_city', type: 'map', meta: { title: HOST_M, parentId: 'map_region' } },
        doc_1: { id: 'doc_1', type: 'doc', meta: { title: 'A page' } } } };
    const w = WH.tableWhere(joined, camp);
    check('where (client): the top bar reads the host\'s campaign name and the map the player is on as plain strings — controls to spaces, bidi and zero-width out, never escaped into markup (text nodes need none)',
        !!w && w.camp === HOST_C && w.map === wantM && w.title === HOST_C + ' \u203a ' + wantM, j(w));
    const D = fakeDom(); WH.paintWhere(D.box, D.mapBox, w, D.doc);
    const kids = D.box.children, mkids = D.mapBox.children;
    check('where (client): hostile names reach the page as text only — no innerHTML / outerHTML / insertAdjacentHTML / document.write, no attribute but the separator\'s constant aria-hidden, the whole line in the title property',
        !D.log.some(e => e[0] === 'markup') && !D.log.some(e => e[0] === 'attr') && D.box.title === HOST_C && D.mapBox.title === wantM
        && kids.concat(mkids).every(k => k.children.length === 0 && !Object.keys(k.attrs).length), j(D.log));
    check('where (client): the campaign in its box and the map in the next section\'s (owner, 2026-09-26) — one span each, no separator, both switched on',
        kids.length === 1 && kids[0].className === 'tw-camp' && kids[0].textContent === HOST_C && mkids.length === 1 && mkids[0].className === 'tw-map' && mkids[0].textContent === wantM
        && D.box.textContent === HOST_C && D.mapBox.textContent === wantM && D.box.classes.has('on') && D.mapBox.classes.has('on'), j([kids.map(k => [k.className, k.textContent]), mkids.map(k => [k.className, k.textContent])]));
    check('where (client): a nested map shows its own title only — no parent map anywhere in the text, the title or the result, and nothing but the one separator',
        !/Parent/.test(D.box.textContent + '|' + D.box.title + '|' + D.mapBox.textContent + '|' + D.mapBox.title + '|' + j(w)), D.mapBox.textContent);
    WH.paintWhere(D.box, D.mapBox, null, D.doc);
    check('where (client): with nothing to show both boxes are emptied, their titles cleared and switched off', [D.box, D.mapBox].every(b => b.children.length === 0 && b.textContent === '' && b.title === '' && !b.classes.has('on')), j([D.box.textContent, D.box.title, [...D.box.classes], D.mapBox.textContent]));
    const off = [
        ['left the session', Object.assign({}, joined, { role: null, active: false }), camp],
        ['waiting for admission (no synced host, own campaign on screen)', Object.assign({}, joined, { syncedPeer: null, foreign: false }), camp],
        ['reconnecting (the host\'s campaign still on screen, no synced host)', Object.assign({}, joined, { syncedPeer: null }), camp],
        ['own campaign back (not foreign)', Object.assign({}, joined, { foreign: false }), camp],
        ['the stream window', { role: 'client', foreign: true, stream: true, syncedPeer: 'x' }, camp],
        ['the GM', { role: 'host', active: true, syncedPeer: null, foreign: false }, camp],
        ['no state at all', null, camp],
        ['no campaign yet', joined, null],
        ['a campaign with no items', joined, { name: 'C' }],
        ['a campaign with no map', joined, { name: 'C', items: {}, activeItemId: null }],
        ['an active page instead of a map', joined, Object.assign({}, camp, { activeItemId: 'doc_1' })],
        ['a prototype key for the active item', joined, Object.assign({}, camp, { activeItemId: 'constructor' })],
        ['__proto__ for the active item', joined, Object.assign({}, camp, { activeItemId: '__proto__' })],
        ['an active item that is gone', joined, Object.assign({}, camp, { activeItemId: 'map_gone' })],
    ];
    const shown = off.filter(o => WH.tableWhere(o[1], o[2]) !== null).map(o => o[0]);
    check('where (client): nothing is shown when left, waiting for admission, reconnecting, back on the own campaign, in the stream window, on the GM\'s side, or with no campaign / map on screen', shown.length === 0, shown);
    const blank = WH.tableWhere(joined, { name: '  \u200b ', activeItemId: 'm', items: { m: { type: 'map', meta: { title: { toString: 1 } } } } });
    const noMeta = WH.tableWhere(joined, { name: 42, activeItemId: 'm', items: { m: { type: 'map', meta: 'x' } } });
    const long = WH.tableWhere(joined, { name: 'c'.repeat(5000), activeItemId: 'm', items: { m: { type: 'map', meta: { title: 'm'.repeat(1e6) } } } });
    check('where (client): a blank or non-string name reads as the GM\'s own fallbacks (Unnamed Campaign, Untitled); each name is capped at 200 characters',
        !!blank && blank.camp === 'Unnamed Campaign' && blank.map === 'Untitled' && !!noMeta && noMeta.camp === 'Unnamed Campaign' && noMeta.map === 'Untitled' && !!long && long.camp.length === 200 && long.map.length === 200, j([blank, noMeta, long && [long.camp.length, long.map.length]]));
    const rd = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', f), 'utf8').replace(/\r\n/g, '\n');
    const mainSrc = rd(path.join('scripts', 'main.js')), htmlSrc = rd('index.html'), cssSrc = rd('style.css');
    check('where (client): wired — renderWhere paints only through paintWhere with the real document, off the synced host\'s campaign; main.js render() calls it before its no-map return, and the clock in the header after it (item 20 K2); renderRoster calls it as the session class changes',
        /function renderWhere\(\) \{[^}]*tableWhere\(net, campOf\(state\.appState && state\.appState\.activeCampaignId\)\);[^}]*paintWhere\(box, mapBox, w, document\);\n\}/.test(src) && /var box = ui\('tableWhere'\), mapBox = ui\('tableWhereMap'\); if \(!box \|\| !mapBox\) return;/.test(src)
        && /export function render\(\) \{\s*if \(window\.wpHideTooltip\)[^\n]*\n\s*if \(window\.wpNet && window\.wpNet\.renderWhere\) window\.wpNet\.renderWhere\(\);[^\n]*\n\s*if \(window\.wpCalendar && window\.wpCalendar\.refresh\) window\.wpCalendar\.refresh\(\);[^\n]*\n\s*if \(window\.wpVideo && window\.wpVideo\.refresh\) window\.wpVideo\.refresh\(\);[^\n]*\n\s*var activeMap = getActiveMap\(\);\s*if \(!activeMap\) activeMap = firstMapOf\(getActiveCampaign\(\)\);[^\n]*\n(\s*\/\/[^\n]*\n)*\s*document\.body\.classList\.toggle\('no-map', !activeMap && !!getActiveCampaign\(\)\);\s*if\(!activeMap\) \{ renderNoMap\(\); return; \}/.test(mainSrc)
        && /classList\.toggle\('net-client'[^\n]*\n\s*renderWhere\(\);/.test(src));
    check('where (client): the campaign\'s box sits beside the campaign\'s name, right after the wrap that holds the campaign menu and the page\'s own campaign list, and a player\'s app hides that wrap whole; the map\'s box is in the next section (right after the map tabs\' box, which holds the breadcrumb); both hidden unless a joined player has something to show',
        /<header>[\s\S]*<div class="row-menu-wrap" id="campMenuWrap">\n[\s\S]*?<select id="campaignSelect"[^\n]*\n\s*<\/div>\n\s*<div id="tableWhere" class="table-where"><\/div>[\s\S]*<div class="header-sep"><\/div>[\s\S]*<div id="mapTabs"[^\n]*\n[^\n]*<div id="mapBreadcrumb"><\/div>[^\n]*\n[^\n]*\n[^\n]*\n\s*<\/div>\n\s*<div id="tableWhereMap" class="table-where"><\/div>[\s\S]*<\/header>/.test(htmlSrc)
        && /\n\s*body\.net-client #campMenuWrap \{ display: none !important; \}/.test(cssSrc) && /\n\s*#tableWhere, #tableWhereMap \{ display: none;/.test(cssSrc) && /\n\s*body\.net-client #tableWhere\.on, body\.net-client #tableWhereMap\.on \{ display: inline-flex; \}/.test(cssSrc) && !/#tableWhere(Map)?[^{\n]*\{[^}]*[{;\s]content\s*:/.test(cssSrc)
        && /\n\s*body\.net-client #tableWhereMap\.on \{ flex: 1 1 0; justify-content: center; max-width: none; min-width: 108px; \}/.test(cssSrc) /* moved on purpose (1.6.3, the release click test): the map's name keeps 100 px and its padding, so a short row folds icons before the name goes */ && /\n\s*body\.net-client #tableWhereMap\.on \+ \.spacer \{ display: none; \}/.test(cssSrc) && /<div id="tableWhereMap" class="table-where"><\/div>\n\s*<div class="spacer"><\/div>/.test(htmlSrc));   // centered in its section: the box takes the spacer's place
}

// 1.6.3 (the release click test): the Multiplayer window of a player who is no longer at a table (removed, or the table gone) says nothing of
// connected players and no longer shows the old table's switches: renderRoster's empty branch and net.refreshUi, run for real; and the map
// switch's notice says the setting as a step
{
    const S = src.replace(/\r\n/g, '\n'), rA = S.indexOf('function renderRoster() {'), rZ = S.indexOf('\n}\n', rA), rrSrc = rA < 0 || rZ < 0 ? 'throw new Error("renderRoster");' : S.slice(rA, rZ + 3);
    const uA = S.indexOf('net.refreshUi = function() {'), uZ = S.indexOf('\n};\n', uA), ruSrc = uA < 0 || uZ < 0 ? 'throw new Error("refreshUi");' : S.slice(uA, uZ + 4);
    const run = (netR) => { const el = { textContent: 'was', style: { display: '' } }, log = [];
        new Function('net', 'ui', 'syncLastMaps', 'updateSidebarNav', 'rosterSeat', 'refreshStageSelect', 'syncSessionButtons', 'window', 'document', 'renderWhere', "'use strict';\n" + rrSrc + ruSrc + '\nnet.refreshUi();')(
            netR, id => (id === 'netRoster' ? el : null), () => {}, () => {}, () => {}, () => log.push('stage'), () => log.push('buttons'), { wpSettingsSync: () => log.push('vtt') }, { body: { classList: { toggle() {} } } }, () => {});
        return [el.textContent, el.style.display, log.join()]; };
    const host = run({ active: true, role: 'host', roster: {} }), gone = run({ active: false, role: null, roster: {} }), seated = run({ active: true, role: 'client', roster: {} });
    check('1.6.3 (the release click test): an empty roster says No players connected yet only while this app hosts; a player no longer at a table reads nothing there and the line takes no room; refreshing the window\'s parts as the own campaign comes back draws the VTT line again too',
        JSON.stringify([host, gone, seated]) === JSON.stringify([['No players connected yet.', '', 'buttons,vtt'], ['', 'none', 'stage,buttons,vtt'], ['', '', 'buttons,vtt']])
        && S.includes("toast('Your players stay where they are. Summon All brings them to this map. To have the table move with you, set Players arrive at to Follow me.');")
        && !S.includes('Players arrive at \\u25B8 Follow me makes'), JSON.stringify([host, gone, seated]));
}

// 1.5.0 the player's top bar: a campaign renamed mid-session reaches admitted players once per change (the real host sync, sliced), and a
// client takes it only from its synced host, for the hosted campaign, as a string cut to 200 (the real client branch, sliced)
{
    const syncSrc = between('// [netcheck:campnamesync-start]', '// [netcheck:campnamesync-end]', 'campnamesync'), rcvSrc = between('// [netcheck:campname-start]', '// [netcheck:campname-end]', 'campname');
    const sent = { a: [], w: [] }, campH = { id: 'k_1', name: 'Old <b>' };
    const netH = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sent.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sent.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', syncSrc)(netH, () => campH, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; });
    netH.syncCampName(); const n1 = sent.a.length; netH.syncCampName(); const n2 = sent.a.length; campH.name = 'New Name'; netH.syncCampName(); campH.name = 'x'.repeat(300); netH.syncCampName();
    netH.role = 'client'; netH.syncCampName(); const n5 = sent.a.length;
    check('1.5.0 top bar: a campaign renamed mid-session goes to admitted players once per change (a waiting peer gets nothing), cut to 200; a client never sends one; it follows every host save and the snapshot sets its signature',
        n1 === 1 && n2 === 1 && n5 === 3 && sent.w.length === 0 && JSON.stringify(sent.a[0]) === JSON.stringify({ type: 'campName', campId: 'k_1', name: 'Old <b>' }) && sent.a[1].name === 'New Name' && sent.a[2].name.length === 200
        && /net\.syncDocStyle\(\); \/\/ [^\n]*\n\s*net\.syncCampName\(\);/.test(src) && /var cnm = net\.campNameMessage\(\); if \(cnm\) net\._lastCampNameSig = cnm\.campId \+ '\\n' \+ cnm\.name;/.test(src)
        && !/msg\.type === 'campName' && net\.role === 'host'/.test(src), JSON.stringify(sent));
    const run = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', name: 'Old' } } } }; let painted = 0;
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'renderWhere', rcvSrc)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), () => { painted++; });
        return [st.appState.campaigns.k_1.name, painted]; };
    const okC = { role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, mk = n => ({ type: 'campName', campId: 'k_1', name: n });
    const r1 = run(okC, mk('<img src=x onerror=alert(1)>'), 'host1'), r2 = run(okC, mk('New'), 'evil'), r3 = run(Object.assign({}, okC, { stream: true }), mk('New'), 'host1'), r4 = run(Object.assign({}, okC, { foreign: false }), mk('New'), 'host1');
    const r5 = run(okC, { type: 'campName', campId: 'k_2', name: 'New' }, 'host1'), r6 = run(okC, { type: 'campName', campId: 'k_1', name: { toString: 1 } }, 'host1'), r7 = run(okC, mk('y'.repeat(500)), 'host1'), r8 = run(okC, { type: 'campName', campId: '__proto__', name: 'New' }, 'host1');
    check('1.5.0 top bar: a client takes a campaign rename only from its synced host, for the hosted campaign, as a string cut to 200 (stored as it is: the top bar paints text) and repaints; another peer, the stream window, a machine not showing the host\'s campaign, another campaign, a non-string or a prototype id changes nothing',
        JSON.stringify(r1) === JSON.stringify(['<img src=x onerror=alert(1)>', 1]) && JSON.stringify([r2, r3, r4, r5, r6, r8]) === JSON.stringify(Array(6).fill(['Old', 0])) && r7[0].length === 200 && r7[1] === 1, JSON.stringify([r1, r2, r3, r4, r5, r6, r7[1], r8]));
}

// Fog play areas (review follow-up a): a campaign's fog defaults changed mid-session reach admitted players once per change (the real host
// sync, sliced), and a client takes them only from its synced host, for the hosted campaign, cleaned again, then redraws (the real branch)
pendingChecks.push((async () => {
    const FCx = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'fogcore.js')).split(String.fromCharCode(92)).join('/'));
    const syncF = between('// [netcheck:campfogsync-start]', '// [netcheck:campfogsync-end]', 'campfogsync'), rcvF = between('// [netcheck:campfog-start]', '// [netcheck:campfog-end]', 'campfog');
    const sentF = { a: [], w: [] }, campF = { id: 'k_1', fog: { defaults: { sight: 6 } } };
    const netF = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentF.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sentF.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', 'window', syncF)(netF, () => campF, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; }, { wpFogCore: FCx });
    netF.syncCampFog(); const f1 = sentF.a.length; netF.syncCampFog(); const f2 = sentF.a.length; campF.fog = { defaults: { sight: 6, emptyFog: 'none', vision: 'nope' }, fields: { sight: 'x y' } }; netF.syncCampFog(); netF.role = 'client'; netF.syncCampFog();
    check('Fog play areas: a campaign\'s fog defaults changed mid-session go to admitted players once per change (a waiting peer gets nothing), cleaned (a malformed field or vision dropped); a client never sends them; every host save sends them, the snapshot sets their signature',
        f1 === 1 && f2 === 1 && sentF.a.length === 2 && sentF.w.length === 0 && j(sentF.a[1]) === j({ type: 'campFog', campId: 'k_1', fog: { fields: {}, defaults: { sight: 6, emptyFog: 'none' } } })
        && /net\.syncNewPlayers\(\); \/\/ [^\n]*\n\s*net\.syncCampFog\(\);/.test(src) && /var cfm = net\.campFogMessage\(\); if \(cfm\) net\._lastCampFogSig = cfm\.campId \+ '\\n' \+ JSON\.stringify\(cfm\.fog\);/.test(src)
        && !/msg\.type === 'campFog' && net\.role === 'host'/.test(src), j(sentF));
    // lighting review: a change to the vision rules re-sends every fogged map of the hosted campaign, filtered per player (the real resendFogged)
    const rsF = between('// [netcheck:resendfogged-start]', '// [netcheck:resendfogged-end]', 'resendfogged'), sentR = [];
    const campR = { id: 'k_r', items: { mA: { id: 'mA', type: 'map', fog: { on: true } }, mB: { id: 'mB', type: 'map', fog: { on: false } }, mC: { id: 'mC', type: 'map', fog: { on: 'yes' } }, dD: { id: 'dD', type: 'doc', fog: { on: true } }, mE: { id: 'mE', type: 'map' }, mF: { id: 'mF', type: 'map', fog: { on: true } } } };
    const netR = { active: true, role: 'host', broadcastItemFiltered: (cid, id) => sentR.push(cid + '/' + id) };
    new Function('net', 'getActiveCampaign', rsF)(netR, () => campR);
    netR.resendFogged(); const r1 = sentR.slice(); netR.role = 'client'; netR.resendFogged(); netR.role = 'host'; netR.active = false; netR.resendFogged();
    check('Lighting: a change to the table\'s vision rules (the fog, lighting or facing switch, the master, the fog defaults) re-sends every fogged map of the hosted campaign to the players, filtered for each (not only the map on screen); nothing from a client or off a session',
        j(r1) === j(['k_r/mA', 'k_r/mF']) && sentR.length === 2
        && /net\.broadcastStance\(\);\n\s*if \(net\.resendFogged\) net\.resendFogged\(\);/.test(src) && /try \{ c\.send\(msg\); \} catch \(e\) \{ sendFailed\(e\); \} \} \}\);\n\s*if \(net\.resendFogged\) net\.resendFogged\(\);   \/\/ a default sight changed/.test(src), j(sentR));
    // senses S2a: a change to the system's senses re-sends the system (a no-op where the save already sent it) and then every fogged map; nothing
    // while they stand still, even as the rest of the system changes (the real syncSenses, sliced by its markers)
    {
        const ssS = between('// [netcheck:syncsenses-start]', '// [netcheck:syncsenses-end]', 'syncsenses'), logS = [];
        let msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: { senses: { list: [{ id: 'sn_ether001' }] } } } };
        const netS = { active: true, role: 'host', systemMessage: () => msgS, syncSystem: f => logS.push('system' + (f ? ':forced' : '')), resendFogged: () => logS.push('maps') };
        new Function('net', ssS)(netS);
        const at = () => logS.length, runS = () => { const n0 = at(); netS.syncSenses(); return logS.slice(n0); };
        const s1 = runS(), s2 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [{ id: 'f_new' }], combat: { senses: { list: [{ id: 'sn_ether001' }] } } } }; const s3 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: { senses: { list: [{ id: 'sn_ether001', walls: 'pass' }] } } } }; const s4 = runS();
        msgS = { type: 'system', campId: 'k_s', system: { fields: [], combat: {} } }; const s5 = runS(), s6 = runS();
        msgS = { type: 'system', campId: 'k_other', system: { fields: [], combat: {} } }; const s7 = runS();
        netS.role = 'client'; msgS.system.combat.senses = { list: [] }; const s8 = runS(); netS.role = 'host'; netS.active = false; const s9 = runS(); netS.active = true;
        const msgKeep = msgS; msgS = null; const s10 = runS(); msgS = msgKeep;
        check('senses S2a: a change to the system\'s senses sends the system first and then every fogged map; nothing again while they stand still, even as the rest of the system changes (the system goes by its own sync); a change of campaign counts; nothing from a client, off a session or with no system',
            j([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]) === j([['system', 'maps'], [], [], ['system', 'maps'], ['system', 'maps'], [], ['system', 'maps'], [], [], []]), j([s1, s2, s3, s4, s5, s6, s7, s8, s9, s10]));
        // the eyes' arc: the key is part of the senses the signature holds, so naming the field, changing it or taking it away sends the system and then every fogged map
        const arcMsg = sn => ({ type: 'system', campId: 'k_s', system: { fields: [], combat: sn ? { senses: sn } : {} } });
        msgS = arcMsg(null); runS(); msgS = arcMsg({ arc: { field: 'f_arc' } }); const e1 = runS(), e2 = runS(); msgS = arcMsg({ arc: { field: 'f_other' } }); const e3 = runS(); msgS = arcMsg({ arc: { field: 'f_other' }, list: [{ id: 'sn_ether001' }] }); const e4 = runS(); msgS = arcMsg({ list: [{ id: 'sn_ether001' }] }); const e5 = runS(), e6 = runS();
        check('eyes\' arc: the system\'s arc key moves the senses\' signature — naming the field, naming another, with senses beside it and taking it away each send the system and then every fogged map; nothing while it stands still',
            j([e1, e2, e3, e4, e5, e6]) === j([['system', 'maps'], [], ['system', 'maps'], ['system', 'maps'], ['system', 'maps'], []]), j([e1, e2, e3, e4, e5, e6]));
        check('senses S2a (source): every host save runs it right after the system\'s own sync; the snapshot sets its signature with the system\'s, and hosting afresh clears it',
            /net\.syncSystem\(\);   \/\/ and the system \(character sheets\), the same way\r?\n\s*net\.syncSenses\(\);/.test(src)
            && /var sysm = net\.systemMessage\(\); if \(sysm\) \{ net\._lastSystemSig = quickHash\(JSON\.stringify\(sysm\.system\)\); net\._lastSensesSig = sensesSigOf\(sysm\); \}/.test(src)
            && /net\._lastSystemSig = null;   \/\/ and the system\r?\n\s*net\._lastSensesSig = null;/.test(src) && (src.match(/net\.syncSenses = function/g) || []).length === 1);
    }
    // lighting L3: one player's copy of a fogged map (the real fogDrop / fogFilterClean / fogCopyFor): the creatures they cannot see dropped, the lit
    // cells only they get (never on the shared clone), the host's light cap; the host's own map never carries either
    const flF = between('// [netcheck:foglit-start]', '// [netcheck:foglit-end]', 'foglit', 'netfog.js');
    // the stub answers only for the host's own map and campaign, and the lit cells only for the drop worked out for that player (never the clone)
    const hostM = { type: 'map', id: 'm1', whiteboard: [{ id: 'foe', light: { bright: 2, dim: 4 } }, { id: 'me' }] }, campFL = { id: 'k_f' };
    const fwin = { wpFog: { fogDropIds: (rid, camp, map) => camp === campFL && map === hostM && rid === 'u_a' ? { foe: 1 } : null,
        fogLitFor: (rid, camp, map, drop) => camp !== campFL || map !== hostM ? null : rid === 'u_a' && drop && drop.foe === 1 ? { lit: [{ c: 3, r: 2, t: 2 }, { c: 4, r: 2, t: 1 }], capped: false } : rid === 'u_c' && drop === null ? { lit: [], capped: true } : null } };
    const FL = new Function('window', flF + '\nreturn fogCopyFor;')(fwin);
    const cleanM = { type: 'map', id: 'm1', whiteboard: [{ id: 'foe' }, { id: 'me' }] }, cA = FL(cleanM, campFL, hostM, 'u_a'), cB = FL(cleanM, campFL, hostM, 'u_b'), cC = FL(cleanM, campFL, hostM, 'u_c');
    const srcL = src.replace(/\r\n/g, '\n');
    check('Lighting: a player\'s copy of a fogged map carries only their own lit cells (a torch round a corner) and the host\'s light cap, always on a copy made for them — the shared clone and another player\'s copy never gain them; nothing extra, nothing copied',
        j(cA.whiteboard.map(w => w.id)) === j(['me']) && j(cA.fogLit) === j([{ c: 3, r: 2, t: 2 }, { c: 4, r: 2, t: 1 }]) && !('lightsCapped' in cA) && !('fogLit' in hostM) && !('lightsCapped' in hostM) && cB === cleanM && !('fogLit' in cleanM) && !('lightsCapped' in cleanM)
        && cC !== cleanM && cC.lightsCapped === true && !('fogLit' in cC) && cC.whiteboard === cleanM.whiteboard
        && /delete m\.fogLit; delete m\.lightsCapped;/.test(srcL) && (srcL.match(/var out = fogCopyFor\(clean, camp, it, pr\.id\);/g) || []).length === 2
        && /it = fogCopyFor\(it, \(s\.campaigns && s\.campaigns\[camp\.id\]\) \|\| camp, orig, recipientId\);/.test(require('./checkkit').part('netfog.js')) && !/fogFilterClean\(clean, fogDrop\(/.test(srcL)
        && /var flC = window\.wpFogCore && window\.wpFogCore\.cleanFogLit \? window\.wpFogCore\.cleanFogLit\(m\.fogLit\) : null; if \(flC\) m\.fogLit = flC; else delete m\.fogLit;/.test(srcL) && /if \(m\.lightsCapped !== true\) delete m\.lightsCapped;/.test(srcL), j([cA, cC]));
    const runF = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', fog: { defaults: { sight: 2 } } } } } }, calls = [];
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', rcvF)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpFogCore: FCx, wpFog: { invalidateVision: () => calls.push('inv'), redraw: () => calls.push('draw') } });
        return [st.appState.campaigns.k_1.fog, calls]; };
    const okF = { role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, mkF = fog => ({ type: 'campFog', campId: 'k_1', fog });
    const g1 = runF(okF, mkF({ defaults: { sight: 9, emptyFog: 'none', on: true }, fields: { sight: 'f_sight' } }), 'host1'), g2 = runF(okF, mkF({ defaults: { sight: 9 } }), 'evil'), g3 = runF(Object.assign({}, okF, { stream: true }), mkF({ defaults: { sight: 9 } }), 'host1');
    const g4 = runF(okF, { type: 'campFog', campId: 'k_2', fog: {} }, 'host1'), g5 = runF(okF, mkF('<img>'), 'host1'), g6 = runF(okF, { type: 'campFog', campId: '__proto__', fog: {} }, 'host1');
    check('Fog play areas: a client takes the campaign\'s fog defaults only from its synced host, for the hosted campaign, cleaned again, then works the fog out afresh and redraws; another peer, the stream window, another campaign or a prototype id changes nothing; garbage cleans to the plain default',
        j(g1) === j([{ fields: { sight: 'f_sight' }, defaults: { sight: 9, on: true, emptyFog: 'none' } }, ['inv', 'draw']]) && j([g2, g3, g4, g6]) === j(Array(4).fill([{ defaults: { sight: 2 } }, []])) && j(g5) === j([{ fields: {}, defaults: { sight: 0 } }, ['inv', 'draw']]), j([g1, g2, g4, g5]));
})());

// Stage 6 library L3: the library on the wire, host side — the manifest players get (the real syncLibrary), a pack's index and entries by id
// (the real lib-idx / lib-get handler, over a real players' index), and a player's pick of a library entry through the real char-item handler
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify;
    const lmSrc = between('// [netcheck:libmansync-start]', '// [netcheck:libmansync-end]', 'libmansync');
    const sentM = { a: [], w: [] }; let man = null;
    const netM = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentM.a.push(JSON.parse(J(m))); } }, { peer: 'pW', open: true, send: m => sentM.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'window', 'sendFailed', lmSrc)(netM, { wpLibrary: { playerManifest: () => man } }, e => { throw e; });
    netM.syncLibrary(); man = { campId: 'k', packs: [] }; netM.syncLibrary();
    man = { campId: 'k', packs: [{ id: 'p_a', name: 'Gear', count: 2, hash: 'abcdef12' }] }; netM.syncLibrary(); netM.syncLibrary();
    man = { campId: 'k', packs: [{ id: 'p_a', name: 'Gear', count: 3, hash: '12345678' }] }; netM.syncLibrary();
    man = { campId: 'k', packs: [] }; netM.syncLibrary(); netM.syncLibrary();
    netM.role = 'client'; man = { campId: 'k', packs: [{ id: 'p_z', name: 'Z', count: 1, hash: '00000000' }] }; netM.syncLibrary();
    check('L3 the manifest (host): sent to admitted players once per change (a waiting peer gets nothing), nothing while a campaign never had a pack, an empty one once when the last is gone; a client never sends one; it follows every host save, and a joining player gets it after the snapshot when it holds a pack',
        J(sentM.a.map(m => m.packs.map(p => p.count))) === J([[2], [3], []]) && sentM.a.every(m => m.type === 'libManifest' && m.campId === 'k') && sentM.w.length === 0
        && /net\.syncTurnRules\(\); \/\/ [^\n]*\n\s*net\.syncLibrary\(\);/.test(src) && /var lbm = net\.libManifestMessage\(\); if \(lbm && lbm\.packs\.length\) \{ try \{ conn\.send\(lbm\); \}/.test(src), J(sentM));

    const rqSrc = between('// [netcheck:libreq-start]', '// [netcheck:libreq-end]', 'libreq');
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [{ id: 'f_wp', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { cats: ['Gear'], stats: [{ key: 'Wt', label: 'Weight' }] } }] }, { F: Fx, gmView: true });
    const plCtx = Lx.libCtx(Sx.cleanSystem(sysL, { F: Fx, gmView: false }), Fx, false);
    const gmE = { i_rope: { id: 'i_rope', name: 'Rope', category: 'Gear', damage: '1d4', gmNotes: 'Cursed rope', rm: 'bound', rmMsg: 'Tied fast', desc: 'A rope.', stats: { Wt: 10 } }, i_hid: { id: 'i_hid', name: 'Hidden', category: 'Gear', vis: 'gm' }, i_sec: { id: 'i_sec', name: 'Secret pack item', category: 'Gear' }, i_ski: { id: 'i_ski', name: 'Skis', category: 'Sport' } };
    const many = Array.from({ length: 450 }, (_, i) => ({ id: 'i_m' + i, name: 'Many ' + i, category: 'Gear' }));
    const ixA = Lx.playerIndex([gmE.i_rope, gmE.i_hid, gmE.i_ski].concat(many), plCtx);   // the pack players may see (its GM-only entry never in it); p_g, a GM-only pack, has none
    const libFake = { size: () => 4, entry: id => (Object.prototype.hasOwnProperty.call(gmE, id) ? gmE[id] : null), playerIndexOf: id => (id === 'p_a' ? ixA : null), playerEntry: id => (Object.prototype.hasOwnProperty.call(ixA.byId, id) ? ixA.byId[id] : null) };
    const spent = Object.create(null), lim = { ok: true }, netQ = { active: true, role: 'host', roster: { pA: { id: 'u_a' }, pB: { id: 'u_a' }, pC: { id: 'u_c' } } }, campQ = { id: 'k', system: sysL };
    const runQ = (msg, peer) => { const got = []; new Function('net', 'conn', 'msg', 'window', 'getActiveCampaign', 'allow', 'sendFailed', '_libSpent', rqSrc)(netQ, { peer, send: m => { packCheck(m); got.push(JSON.parse(J(m))); } }, msg, { wpLibrary: libFake, wpLibraryCore: Lx }, () => campQ, () => lim.ok, e => { throw e; }, spent); return got; };
    const IDX = o => Object.assign({ type: 'lib-idx', rid: 'r1', campId: 'k', packId: 'p_a', page: 0 }, o), GET = o => Object.assign({ type: 'lib-get', rid: 'g1', campId: 'k', packId: 'p_a', ids: ['i_rope'] }, o);
    const q0 = runQ(IDX({ rid: undefined }), 'pA'), q0b = runQ(IDX({ rid: 'bad rid!' }), 'pA'), q1 = runQ(IDX(), 'pX');
    lim.ok = false; const q2 = runQ(IDX(), 'pA'); lim.ok = true;
    const q3 = runQ(IDX({ campId: 'k2' }), 'pA'), q4 = runQ(IDX({ packId: 'p_g' }), 'pA'), q5 = runQ(IDX({ packId: '__proto__' }), 'pA'), q6 = runQ(IDX({ page: 2 }), 'pA'), q7 = runQ(IDX({ page: '0' }), 'pA');
    const p0 = runQ(IDX(), 'pA'), p1 = runQ(IDX({ page: 1 }), 'pA');
    check('L3 lib-idx (host): nothing without a well-formed ask id; an unadmitted peer gets none, a flood busy, another campaign camp, a pack players may not see (or a bad id) pack, a page out of range page; a page answers with the players\' index rows (400 at most), its number, how many and the pack hash — never a GM-only entry or any GM text',
        q0.length === 0 && q0b.length === 0 && J(q1) === J([{ err: 'none', type: 'lib-idx-ans', rid: 'r1' }]) && q2[0].err === 'busy' && q3[0].err === 'camp' && q4[0].err === 'pack' && q5[0].err === 'pack' && q6[0].err === 'page' && q7[0].err === 'page'
        && p0[0].type === 'lib-idx-ans' && p0[0].rid === 'r1' && p0[0].rows.length === 400 && p0[0].pages === 2 && p0[0].page === 0 && p0[0].hash === ixA.hash && p1[0].rows.length === 52 && !/i_hid|Hidden|Cursed|1d4|bound|Tied/.test(J(p0.concat(p1))), J([q1, q2, q3, q4, q6, p0[0].pages, p1[0].rows.length]));
    const g1 = runQ(GET({ ids: ['i_rope', 'i_hid', 'i_sec', 'i_zz', 'i_rope'] }), 'pA'), g2 = runQ(GET({ ids: [] }), 'pA'), g3 = runQ(GET({ ids: Array.from({ length: 51 }, (_, i) => 'i_m' + i) }), 'pA'), g4 = runQ(GET({ ids: 'i_rope' }), 'pA');
    check('L3 lib-get (host): the asked entries of that pack in the players\' view (its description, no GM notes, formula text or lock), a GM-only entry, another pack\'s or an unknown id left out silently; no ids, more than 50 or not a list: ids',
        g1[0].type === 'lib-get-ans' && g1[0].rid === 'g1' && J(g1[0].entries.map(e => e.id)) === J(['i_rope']) && g1[0].entries[0].desc === 'A rope.' && !/Cursed|1d4|bound|Tied|gmNotes|i_hid|i_sec/.test(J(g1)) && g2[0].err === 'ids' && g3[0].err === 'ids' && g4[0].err === 'ids', J([g1, g2, g3]));
    spent.u_a = Lx.LIB.hostBudget - 50; const b1 = runQ(IDX(), 'pB'), bAfter = spent.u_a, b2 = runQ(IDX(), 'pC');
    check('L3 the budget (host): at most ' + (Lx.LIB.hostBudget / 1048576) + ' MB drawn by a profile in a session — a second connection of the same player shares it (budget, nothing counted), another player has their own',
        b1[0].err === 'budget' && bAfter === Lx.LIB.hostBudget - 50 && Array.isArray(b2[0].rows) && spent.u_c > 0, J([b1, bAfter, spent.u_c]));

    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const campC = { id: 'k', system: sysL, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [] } } } };
    const outC = { answer: [], owner: [], mate: [] };
    const netC = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); outC.owner.push(JSON.parse(J(m))); } }, { peer: 'pM', open: true, send: m => { packCheck(m); outC.mate.push(JSON.parse(J(m))); } }], roster: { pA: { id: 'u_a' }, pM: { id: 'u_m' } } };
    const winC = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: libFake };
    Sx.setLibraryFind(id => (Object.prototype.hasOwnProperty.call(gmE, id) ? gmE[id] : null));
    const HC = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        netC, () => Sx, winC, () => false, () => campC, () => {}, e => { throw e; }, c => (netC.roster[c.peer] ? netC.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const ADD = (rid, defId) => { outC.answer = []; outC.owner.length = 0; outC.mate.length = 0; HC.handle({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'add', defId, rowId: 'w_' + rid, qty: 1 }, { peer: 'pA', send: m => { packCheck(m); outC.answer.push(JSON.parse(J(m))); } }); return { answer: outC.answer.slice(), owner: outC.owner.slice(), mate: outC.mate.slice() }; };
    let a1, a2, a3, a4, a5, stored;
    try { a1 = ADD('a1', 'i_rope'); stored = campC.chars.c_1.values.f_wp.find(r => r.id === 'w_a1'); a2 = ADD('a2', 'i_hid'); a3 = ADD('a3', 'i_sec'); a4 = ADD('a4', 'i_ski'); a5 = ADD('a5', 'i_zz'); } finally { Sx.setLibraryFind(null); }
    const denied = (r, rid) => J(r.answer) === J([{ type: 'char-deny', rid, reason: 'missing' }]);
    check('L3 a player picks a library entry (host, the real char-item handler): an entry of a pack players may see is added — the row keeps the host\'s own copy (its lock and all), the owner\'s delta carries it inline in their view with no GM text; a GM-only entry, one of a GM-only pack, one outside the list\'s categories, an unknown one: missing, nothing stored',
        a1.answer[0].type === 'char-ack' && !!stored && stored.defId === 'i_rope' && stored.snap.rm === 'bound' && stored.snap.damage === '1d4' && a1.owner.some(m => /"lnk":1/.test(J(m)) && /Rope/.test(J(m)))
        && denied(a2, 'a2') && denied(a3, 'a3') && denied(a4, 'a4') && denied(a5, 'a5') && campC.chars.c_1.values.f_wp.length === 1 && !/Cursed|1d4|bound|Tied/.test(J(a1.owner.concat(a1.mate, a1.answer))), J([a1, a2 && a2.answer, stored]));
})());

// Stage 6 library L3b: the library on the wire, player side — the manifest taken (the real handler), and the real client code (asks one at
// a time, answers matched and cleaned again, a busy host asked again, a timeout, paging with a pack that changes mid-load, entries fetched
// and cached, the budget), driven with a recording connection and hand-fired timers
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify, tick = () => new Promise(r => setImmediate(r));
    const lmSrc = between('// [netcheck:libman-start]', '// [netcheck:libman-end]', 'libman');
    const runMan = (netC, msg, peer, active) => { const took = []; let drawn = 0; const st = { appState: { activeCampaignId: active || 'k', campaigns: { k: { id: 'k' } } } };
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', lmSrc)(Object.assign({ libTake: m => took.push(m) }, netC), { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpLibraryCore: Lx, wpSheetsSync: () => { drawn++; } });
        return [took, drawn]; };
    const cl = { foreign: true, syncedPeer: 'h', stream: false }, MAN = { type: 'libManifest', campId: 'k', dir: 'l_abcd1234', packs: [{ id: 'p_a', name: '<b>Gear</b>', count: 2, hash: 'aaaaaaaa', rev: 9, vis: 'all' }, { id: 'nope', hash: 'aaaaaaaa' }] };
    const m1 = runMan(cl, MAN, 'h'), m2 = runMan(cl, MAN, 'x'), m3 = runMan(Object.assign({}, cl, { stream: true }), MAN, 'h'), m4 = runMan(cl, Object.assign({}, MAN, { campId: 'k2' }), 'h'), m5 = runMan(cl, MAN, 'h', 'k2'), m6 = runMan(cl, { type: 'libManifest', campId: 'k', packs: 'x' }, 'h');
    check('L3b the manifest (player): taken from the synced host only, for the hosted campaign, cleaned (no folder, revision or visibility; a bad pack left out; a name stays text) and the sheets redrawn; anything else changes nothing',
        J(m1) === J([[{ campId: 'k', packs: [{ id: 'p_a', name: '<b>Gear</b>', count: 2, hash: 'aaaaaaaa' }] }], 1]) && [m2, m3, m4, m5, m6].every(r => J(r) === J([[], 0]))
        && /\} else if \(\(msg\.type === 'lib-idx-ans' \|\| msg\.type === 'lib-get-ans'\) && net\.role === 'client'\) \{\n\s*if \(!net\.foreign \|\| conn\.peer !== net\.syncedPeer \|\| net\.stream\) return;[^\n]*\n\s*net\.libAnswer\(msg\);/.test(src), J([m1, m2, m4]));

    const lcSrc = between('// [netcheck:libclient-start]', '// [netcheck:libclient-end]', 'libclient');
    const timers = [], fakeSet = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, fakeClear = id => { if (timers[id - 1]) timers[id - 1].fn = null; }, fire = ms => { const t = timers.filter(x => x.fn && x.ms === ms); t.forEach(x => { const f = x.fn; x.fn = null; f(); }); return t.length; };
    const sent = [], conn = { peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(J(m))); } };
    const netL = { active: true, role: 'client', syncedPeer: 'h', conns: [conn] }, stL = { appState: { activeCampaignId: 'k' } };
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }] }, { F: Fx, gmView: false }), campL = { id: 'k', system: sysP };
    const Lc = new Function('net', 'state', 'window', 'getActiveCampaign', 'setTimeout', 'clearTimeout', lcSrc + '\nreturn { lib: function() { return _lib; } };')(netL, stL, { wpLibraryCore: Lx, wpFormula: Fx }, () => campL, fakeSet, fakeClear);
    const last = () => sent[sent.length - 1], ans = (o) => netL.libAnswer(Object.assign({ type: last().type + '-ans', rid: last().rid }, o));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 3, hash: 'aaaaaaaa' }, { id: 'p_b', name: 'B', count: 1, hash: 'bbbbbbbb' }] });
    const noMan = (() => { stL.appState.activeCampaignId = 'k2'; const r = netL.libManifest(); stL.appState.activeCampaignId = 'k'; return r; })();
    const row = (id, name) => [id, '', name, 'Gear', '', [], '12345678'];
    const loadA = netL.libLoad('p_a'); await tick();
    const ask1 = J(last()), n1 = sent.length;
    netL.libAnswer({ type: 'lib-idx-ans', rid: 'wrong', packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 2, rows: [row('i_x', 'X')] }); await tick();
    ans({ err: 'busy' }); await tick(); const afterBusy = sent.length; fire(800); await tick(); const retried = sent.length === afterBusy + 1 && last().rid !== JSON.parse(ask1).rid && last().page === 0;
    ans({ packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 2, rows: [row('i_1', 'One'), ['bad'], row('i_1', 'Dup'), row('i_2', '<img src=x>')] }); await tick();
    const ask2 = last(); ans({ packId: 'p_a', hash: 'cccccccc', page: 1, pages: 2, rows: [row('i_3', 'Three')] }); await tick();   // the pack moved mid-load: read again from page 0
    const ask3 = last(); ans({ packId: 'p_a', hash: 'cccccccc', page: 0, pages: 1, rows: [row('i_1', 'One'), ['bad'], row('i_1', 'Dup'), row('i_3', 'Three'), row('i_2', '<img src=x>'), 'x'] }); await tick();
    const loadedA = await loadA;
    check('L3b paging (player): one ask at a time; an answer to another ask is ignored; busy is asked again after 800 ms with a new id; each index row cleaned again (a malformed one and a repeated id left out, a name stays text); a pack that changes mid-load is read again from its first page',
        n1 === 1 && JSON.parse(ask1).type === 'lib-idx' && JSON.parse(ask1).campId === 'k' && JSON.parse(ask1).packId === 'p_a' && JSON.parse(ask1).page === 0 && retried && ask2.page === 1 && ask3.page === 0 && loadedA === true
        && J(netL.libRows('p_a').map(r => r[0])) === J(['i_1', 'i_3', 'i_2']) && netL.libRows('p_a')[0][2] === 'One' && netL.libRows('p_a')[2][2] === '<img src=x>' && netL.libLoaded('p_a') === 3, J([sent.map(s => [s.type, s.page]), netL.libRows('p_a')]));
    const loadB = netL.libLoad('p_b'); await tick(); const nB = sent.length; fire(20000); await tick(); const loadedB = await loadB;
    const loadX = await netL.libLoad('p_zz');
    check('L3b a host that never answers: the ask gives up after 20 s (the load reports it, the next ask can go); a pack the manifest does not list is never asked for; another campaign on screen hides the manifest',
        nB === sent.length && loadedB === false && loadX === false && noMan === null, J([loadedB, loadX]));
    const getP = netL.libGet('p_a', ['i_1', 'i_3', 'bad id', 'i_1']); await tick();
    const g1 = last(); ans({ packId: 'p_a', hash: 'cccccccc', entries: [{ id: 'i_1', name: 'One', category: 'Gear', gmNotes: 'secret', damage: '9d9', desc: 'Long', stats: { Wt: 2, Nope: 5 } }, { id: 'i_9', name: 'Not asked' }] }); await tick();
    const g2 = last(); ans({ packId: 'p_a', hash: 'cccccccc', entries: [] }); await tick();
    const got = await getP, e1 = netL.libEntry('i_1');
    check('L3b entries (player): asked for 50 at a time (bad ids never asked, each once), what is held answered for each id asked, taken only if asked for, cleaned again in the players\' view (no GM notes or formula text, stats under the players\' keys only), what an answer left out asked for again once; the cache answers applyRowOp\'s lookup',
        g1.type === 'lib-get' && J(g1.ids) === J(['i_1', 'i_3']) && J(g2.ids) === J(['i_3']) && J(got.map(e => e.id)) === J(['i_1', 'i_1']) && e1.name === 'One' && !('gmNotes' in e1) && e1.damage === '' && J(e1.stats) === J({ Wt: 2 }) && e1.desc === 'Long' && netL.libEntry('i_9') === null && netL.libEntry('toString') === null, J([g1, g2, e1]));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 2, hash: 'dddddddd' }, { id: 'p_b', name: 'B', count: 1, hash: 'bbbbbbbb' }] });
    const afterMove = [netL.libRows('p_a').length, netL.libEntry('i_1')];
    Lc.lib().spent = Lx.LIB.clientBudget - 10; const getB = netL.libGet('p_a', ['i_1']); await tick(); ans({ packId: 'p_a', hash: 'dddddddd', entries: [{ id: 'i_1', name: 'One' }] }); await tick(); const overB = await getB;
    netL.libTake({ campId: 'k9', packs: [] }); const afterCamp = Lc.lib().idx;
    const pendR = netL.libLoad('p_zz'); netL.libTake({ campId: 'k', packs: [{ id: 'p_r', name: 'R', count: 1, hash: 'eeeeeeee' }] }); const loadR = netL.libLoad('p_r'); await tick(); netL.libReset(); const resetR = await loadR;
    check('L3b a pack whose hash moves is read again (its index and entries dropped); past ' + (Lx.LIB.clientBudget / 1048576) + ' MB a session nothing more is taken; another campaign clears everything; leaving the table ends the asks waiting',
        afterMove[0] === 0 && afterMove[1] === null && overB.length === 0 && netL.libEntry('i_1') === null && Object.keys(afterCamp).length === 0 && resetR === false && (await pendR) === false, J([afterMove, overB.length, resetR]));
    netL.libTake({ campId: 'k', packs: [{ id: 'p_q', name: 'Q', count: 1, hash: 'ffffffff' }, { id: 'p_w', name: 'W', count: 1, hash: '11111111' }] });
    const nQ0 = sent.length, lq = netL.libLoad('p_q'), lw = netL.libLoad('p_w'), gq = netL.libGet('p_q', ['i_q1']); await tick(); const oneAtATime = sent.length === nQ0 + 1 && last().packId === 'p_q';
    for (let i = 1; i <= 5; i++) { ans({ err: 'busy' }); await tick(); fire(800 * i); await tick(); }
    const asksQ = sent.slice(nQ0).filter(s => s.packId === 'p_q' && s.type === 'lib-idx').length; ans({ err: 'busy' }); await tick(); const gaveUp = (await lq) === false, nextWent = last().packId === 'p_w';
    ans({ packId: 'p_w', hash: '11111111', page: 0, pages: 1, rows: [row('i_w1', 'W1')] }); await tick(); const lwOk = await lw; ans({ packId: 'p_q', hash: 'ffffffff', entries: [{ id: 'i_q1', name: 'Q1' }] }); await tick(); const gqOk = (await gq).length === 1;
    check('L3b one ask in flight at the table (the rest wait their turn); a host still busy after five more tries is given up on and the next ask goes',
        oneAtATime && asksQ === 6 && gaveUp && nextWent && lwOk === true && gqOk, J([oneAtATime, asksQ, gaveUp, nextWent, lwOk, gqOk]));
    check('L3b a player\'s pick reads the entry they fetched (charItem and the changes worked out again pass the client\'s cache as opts.lib); the session end clears it and what players drew from the host',
        /S\.applyRowOp\(camp\.system, c, fieldId, q, window\.wpFormula, \{ player: true, view: camp\.system, lib: net\.libEntry, copy: true \}\)/.test(src) && /var o = \{ player: true, view: camp\.system, lib: net\.libEntry, copy: true \}/.test(src) && /net\.libReset\(\); _libSpent = Object\.create\(null\);/.test(src));
})());

// R2 security, cluster E (2026-10-01): a player's app that has joined a room but is not yet admitted (waiting for the GM's Allow, or for the
// snapshot after a reconnect) still shows its own campaign. Nothing of it may go to the host it is waiting on — not the map on a save, not a
// token's drag or its marks, not a travel or a map request, not a picture's path — and what the player changes on it meanwhile is saved to
// their own disk, never lost. The real senders are sliced and run on a stub client in each state; the client branches that write into a
// campaign (item, itemDelta, stage, a live pos) and io.js's save are run the same way.
{
    const lsSrc = between('// [netcheck:localsave-start]', '// [netcheck:localsave-end]', 'localsave');
    const asSrc = between('// [netcheck:assetsrc-start]', '// [netcheck:assetsrc-end]', 'assetsrc');
    const wE = k => { const i = src.indexOf(k), e = src.indexOf('\n};\n', i); if (i < 0 || e < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, e + 4); };
    const sendersSrc = ['var _lastPatchHash = {}, _posLast = 0, assetCache = Object.create(null), assetPending = Object.create(null);',
        fnSrc('function activeItemPatch(', '\n}\n', 'activeItemPatch', 'netfog.js') + '\n}\n', fnSrc('function quickHash(', '\n}\n', 'quickHash', 'netfog.js') + '\n}\n', broadcastSrc, lsSrc, asSrc,
        wE('net.streamPos = function('), wE('net.sendThreats = function('), wE('net.requestTravel = function('), wE('net.needItem = function('), require('./checkkit').cut('netfight.js', 'net.setTarget = function(', '\n};\n') + '\n};\n',
        'return { pending: function() { return Object.keys(assetPending); }, hashes: function() { return Object.keys(_lastPatchHash); } };'].join('\n');
    const build = new Function('net', 'window', 'own', 'getActiveCampaign', 'sendFailed', 'scheduleStageFollow', 'getActiveMap', 'checkRoomHandouts', 'SC', 'toast', 'broadcastPos', 'Date', 'applyTarget', 'getProfile', sendersSrc);
    const PIC = '/saves/images/m1/villain.png';
    // the player's app, one open connection to the room's host. state: 'wait' (own campaign on screen, no snapshot), 'retry' (the host's campaign
    // still on screen between a reconnect's attempts, not yet admitted again), 'seated' (the snapshot in, this host the synced one), 'other'
    // (seated, but the open connection is not the synced host's)
    const mkCli = st => {
        const sent = [], toasts = [], conn = { peer: 'room', open: true, send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'client', stream: false, foreign: st !== 'wait', syncedPeer: st === 'seated' ? 'room' : st === 'other' ? 'elsewhere' : null, myId: 'u_me', paused: false, selfPaused: false, applyingRemote: false, roster: Object.create(null), targets: Object.create(null), conns: [conn] };
        const tok = { id: 't_me', isChar: true, ownerId: 'u_me', x: 3, y: 4, rot: 0, front: 0 };
        const camp = { id: 'mine', activeItemId: 'm1', items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'villain', type: 'rect', hidden: true, gmInfo: 'the twist', x: 1, y: 2, w: 3, h: 4 }, tok], rooms: [] } } };
        let clock = 1000;
        const targeted = [];
        const win = { wpFog: { invalidateVision() {} } };
        const api = build(net, win, H.own, () => camp, e => { throw e; }, () => {}, () => camp.items.m1, () => {}, () => ({ cleanThreats: l => l }), t => toasts.push(t), () => {}, { now: () => (clock += 100) }, (who, name, t) => targeted.push([who, t && t.id]), () => ({ name: 'Me' }));
        return { net, conn, sent, toasts, camp, tok, api, targeted, win, tick(n) { clock += n; }, all() { net.onLocalSave(); net.streamPos(tok, true, 'm1'); net.sendThreats('mine', 'm1', 't_me', [90]); net.requestTravel('door1'); net.needItem('mine', 'm1'); net.setTarget('villain', 'm1', 'Villain'); return net.assetSrc(PIC); } };
    };
    const W = mkCli('wait'), wPic = W.all(), wPic2 = W.net.assetSrc(PIC);
    check('R2 E: waiting for the GM\'s Allow with their own campaign on screen (no snapshot yet), a player\'s app sends nothing — a save, a token\'s drag, its marks, a travel, a map request, a target pointer at one of its tokens and a picture all stay home, nothing targeted and nothing said; their own pictures read from their own server, as before the join; the save leaves no mark, so the first save at the table still goes out',
        W.sent.length === 0 && wPic === PIC && wPic2 === PIC && W.api.pending().length === 0 && W.api.hashes().length === 0 && W.toasts.length === 0 && W.targeted.length === 0, j([W.sent, wPic, W.api.pending(), W.api.hashes(), W.targeted, W.toasts]));
    const R = mkCli('retry'), rPic = R.all();
    check('R2 E: between a reconnect\'s attempts (the host\'s campaign still on screen, this connection not yet admitted again) nothing goes out either; a picture not yet cached shows the placeholder and is not marked as asked, so the first draw after the snapshot asks for it',
        R.sent.length === 0 && rPic === R.net.ASSET_PLACEHOLDER && R.api.pending().length === 0 && R.api.hashes().length === 0 && R.targeted.length === 0, j([R.sent, rPic, R.api.pending(), R.targeted]));
    const Dn = mkCli('retry'); Dn.net.active = false; const dnPic = Dn.net.assetSrc(PIC);
    check('1.6.0 a table\'s copy stays the table\'s while the link is down: a picture of the host\'s shows the placeholder, and this machine\'s own server is never asked for it', dnPic === Dn.net.ASSET_PLACEHOLDER && Dn.sent.length === 0 && Dn.api.pending().length === 0, j([dnPic, Dn.sent]));
    const O = mkCli('other'), oPic = O.all();
    check('R2 E: an open connection that is not the synced host\'s gets nothing of these either, and no picture is asked of it', O.sent.length === 0 && oPic === O.net.ASSET_PLACEHOLDER && O.api.pending().length === 0 && O.targeted.length === 0, j([O.sent, oPic, O.targeted]));
    const S = mkCli('seated'), sPic = S.all(); S.net.onLocalSave(); S.tok.x = 30; S.net.onLocalSave(); const sPic2 = S.net.assetSrc(PIC);
    const sTypes = S.sent.map(m => m.type);
    check('R2 E: seated (the snapshot in, this connection the synced host\'s) every one of them goes out as before — one map patch per changed save (the same map twice sends once), the drag\'s pos, the marks, the travel, the request, the target pointer (shown at once, said in a toast) and one picture ask (then the placeholder until the bytes come, asked once)',
        j(sTypes) === j(['item', 'pos', 'threats', 'travel', 'needItem', 'target', 'asset-req', 'item']) && sPic === S.net.ASSET_PLACEHOLDER && sPic2 === sPic && j(S.api.pending()) === j([PIC]) && S.sent[0].itemId === 'm1' && S.sent[0].campId === 'mine' && S.sent[1].wbId === 't_me' && S.sent[5].id === 'villain' && S.sent[5].mapId === 'm1' && j(S.targeted) === j([['u_me', 'villain']]) && S.toasts.length === 1 && /Targeting Villain/.test(S.toasts[0]) && S.sent[6].path === PIC && S.sent[7].item.whiteboard[1].x === 30, j([sTypes, sPic, S.api.pending(), S.targeted, S.toasts]));
    {   // 1.6.2 (backlog 70, the review): a player's map copy waits while a turn gesture of their own is open
        const Hd = mkCli('seated'); Hd.win.wpTurnGesture = 1001; Hd.net.onLocalSave(); Hd.net.streamPos(Hd.tok, false, 'm1'); const hd1 = [Hd.sent.map(m => m.type), Hd.net._heldSave];
        Hd.win.wpTurnGesture = 0; Hd.net.onLocalSave(); const hd2 = [Hd.sent.map(m => m.type), Hd.net._heldSave];
        const Hs = mkCli('seated'); Hs.win.wpTurnGesture = 1001; Hs.tick(20000); Hs.net.onLocalSave(); const hs = [Hs.sent.map(m => m.type), Hs.net._heldSave];
        const Hn = mkCli('seated'); Hn.win.wpTurnGesture = 'yes'; Hn.net.onLocalSave(); const hn = Hn.sent.map(m => m.type);
        check('1.6.2 a turn gesture holds a player\'s map copy (backlog 70, the review; run for real): while their own token is being turned the save sends no copy and is marked as waiting, the turn itself still streams; once the gesture is over the copy goes; a gesture older than ten seconds, or a mark that is no time, holds nothing',
            j(hd1) === j([['pos'], true]) && j(hd2) === j([['pos', 'item'], false]) && j(hs) === j([['item'], false]) && j(hn) === j(['item']), j([hd1, hd2, hs, hn]));
    }
    const C = mkCli('seated'); C.conn.open = false; const cPic = C.all();
    check('R2 E: a closed connection gets nothing, and no picture is marked as asked of it', C.sent.length === 0 && cPic === C.net.ASSET_PLACEHOLDER && C.api.pending().length === 0 && C.targeted.length === 0, j([C.sent, C.targeted]));

    // the client branches that write into a campaign apply nothing before the snapshot, nor from a peer that is not the synced host
    const branch = (type, next) => { const a = "    } else if (msg.type === '" + type + "'", i = src.indexOf(a), k = src.indexOf("\n    } else if (msg.type === '" + next + "'", i); if (i < 0 || k < 0 || src.indexOf(a, i + 1) >= 0) throw new Error('netcheck: branch ' + type + ' not found once'); return src.slice(src.indexOf('\n', i) + 1, k); };
    const itemB = branch('item', 'threats'), deltaB = branch('itemDelta', 'itemGone'), stageB = branch('stage', 'pause');
    const runB = (body, netC, msg) => { const log = []; new Function('msg', 'conn', 'net', 'applyItem', 'applyItemDelta', 'applyStage', 'toast', (tryBetween('// [netcheck:fromhost-start]', '// [netcheck:fromhost-end]') || '') + '\n' + body)(msg, { peer: 'room' }, netC, () => log.push('item'), () => log.push('delta'), () => log.push('stage'), () => log.push('toast')); return log.join(); };
    const posB = fnSrc('function handlePos(msg, conn) {', '\n}\n', 'handlePos') + '\n}\n';
    const runPosC = netC => { const w = { id: 't1', ownerId: 'u_me', x: 0, y: 0, rot: 0, front: 0 }, st = { appState: { campaigns: { mine: { id: 'mine', items: { m1: { type: 'map', whiteboard: [w] } } } } } }, dom = [];
        new Function('state', 'net', 'msg', 'conn', 'applyPosToDom', 'window', ownKeySrc + posB + '\nhandlePos(msg, conn);')(st, netC, { type: 'pos', campId: 'mine', itemId: 'm1', wbId: 't1', x: 7, y: 8, rot: 0, front: 0, final: true }, { peer: 'room' }, m => dom.push(m.wbId), {});
        return w.x + ':' + dom.join(); };
    const states = { wait: { role: 'client', foreign: false, syncedPeer: null, myId: 'u_me' }, retry: { role: 'client', foreign: true, syncedPeer: null, myId: 'u_me' }, other: { role: 'client', foreign: true, syncedPeer: 'elsewhere', myId: 'u_me' }, seated: { role: 'client', foreign: true, syncedPeer: 'room', myId: 'u_me' } };
    const outB = {}; Object.keys(states).forEach(s => { outB[s] = [runB(itemB, states[s], { type: 'item' }), runB(deltaB, states[s], { type: 'itemDelta' }), runB(stageB, states[s], { type: 'stage', stage: {} }), runPosC(states[s])].join('|'); });
    check('R2 E: a whole map, a delta, a stage and a live pos from the host are applied only after the snapshot and only from the synced host (the real client branches, run on each state) — before it the campaign on screen is the player\'s own and nothing a host says reaches it; seated, each lands as before',
        outB.wait === '|||0:' && outB.retry === '|||0:' && outB.other === '|||0:' && outB.seated === 'item|delta|stage,toast|7:t1', j(outB));

    // io.js: a save while waiting goes to this player's own disk (the campaign on screen is theirs), never to the host; seated, to the host as before
    const ioE = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
    const fnIo = (start, end, label, optional) => { const i = ioE.indexOf(start); if (i < 0 && optional) return ''; const k = ioE.indexOf(end, i + 1); if (i < 0 || k < 0 || ioE.indexOf(start, i + 1) >= 0) throw new Error('netcheck: io.js ' + label + ' not found once'); return ioE.slice(i, k + end.length); };
    const saveSrc = ['var saveTimeout, savePending = false;', fnIo('  function canPersistLocal() {', '\n  }\n', 'canPersistLocal'), fnIo('  function ownWhileWaiting() {', '\n  }\n', 'ownWhileWaiting', true), fnIo('  function saveAnswer(raw) {', '\n  }\n', 'saveAnswer'), fnIo('  function save(immediate) {', '\n  }\n', 'save'), 'return save;'].join('\n');
    const runSaveE = (netS, o) => { o = o || {}; const log = [], st = { appState: Object.assign({ activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } }, o.marked ? { _foreign: { at: 1 } } : {}) }, note = { innerHTML: '' };
        if (netS) netS.onLocalSave = () => log.push('wire');
        const save = new Function('window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', saveSrc)(
            { wpNet: netS, wpStream: !!o.stream, wpPopout: !!o.popout, __wpNoSave: !!o.noSave }, st, () => ({ meta: {} }), note, () => log.push('history'), (url, opts) => { log.push('disk:' + url + ':' + JSON.parse(opts.body).activeCampaignId); return { then(f) { f({ ok: true }); return { catch() {} }; } }; }, () => 0, () => {});
        save(true); return log.join() + ' / ' + note.innerHTML.replace(/<[^>]*>/g, ''); };
    const cliS = o => Object.assign({ active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'room' }, o || {});
    const sv = { wait: runSaveE(cliS({ foreign: false, syncedPeer: null })), seated: runSaveE(cliS()), retry: runSaveE(cliS({ syncedPeer: null })), marked: runSaveE(cliS({ foreign: false, syncedPeer: null }), { marked: true }),
        stream: runSaveE(cliS({ foreign: false, syncedPeer: null }), { stream: true }), streamNet: runSaveE(cliS({ foreign: false, syncedPeer: null, stream: true })), popout: runSaveE(cliS({ foreign: false, syncedPeer: null }), { popout: true }), noSave: runSaveE(cliS({ foreign: false, syncedPeer: null }), { noSave: true }),
        solo: runSaveE(null), host: runSaveE({ active: true, role: 'host', foreign: false }) };
    check('R2 E: a save while waiting for the GM (io.js save, run for real: a client with no snapshot, the state unmarked) writes the player\'s own campaign to their own disk and says so, and calls the wire hook not at all; seated or between a reconnect\'s attempts it goes to the wire hook as before (Synced to host) and never to disk; a state marked as another table\'s, the stream and pop-out windows and a restore under way write nothing; solo and the GM save as ever',
        /^(history,)?disk:\/api\/data:mine \/ Saved to disk &#10003;$/.test(sv.wait) && !/wire/.test(sv.wait) && sv.seated === 'wire / Synced to host &#10003;' && sv.retry === 'wire / Synced to host &#10003;' && !/disk/.test(sv.marked) && !/disk/.test(sv.stream) && !/disk/.test(sv.streamNet) && !/disk/.test(sv.popout) && sv.noSave === ' / ' && /^history,disk:\/api\/data:mine \/ Saved to disk/.test(sv.solo) && /^history,wire,disk:/.test(sv.host), j(sv));
    // The owed review, 2026-10-09 (backlog 138): a failed save was said only in the row's saved note, which is out of sight while the row is
    // hidden. It is said in a notice too: once when saving begins to fail, and again only after a save has gone through in between. io.js save
    // with its notice, run for real on answers of the test's own
    pendingChecks.push((async () => {
        const failSrc = ['var saveTimeout, savePending = false;', fnIo('  function canPersistLocal() {', '\n  }\n', 'canPersistLocal'), fnIo('  function ownWhileWaiting() {', '\n  }\n', 'ownWhileWaiting', true),
            ioE.slice(ioE.indexOf('  var _saveFailSaid = false'), ioE.indexOf('  function save(immediate) {')), fnIo('  function save(immediate) {', '\n  }\n', 'save'), 'return save;'].join('\n');
        const runFail = async (answers, gaps) => { const toasts = [], notes = [], note = { innerHTML: '' }, st = { appState: { activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } } }; let n = 0, clkF = 1000000;
            const save = new Function('Date', 'window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', 'toast', failSrc)({ now: () => clkF },
                { wpNet: null }, st, () => ({ meta: {} }), note, () => {}, () => { const a = answers[n++]; return a === 'throw' ? Promise.reject(new Error('x')) : Promise.resolve({ ok: a === 'ok' }); }, () => 0, () => {}, t => toasts.push(t));
            for (let i = 0; i < answers.length; i++) { save(true); for (let k = 0; k < 6; k++) await new Promise(r => setImmediate(r)); notes.push(note.innerHTML.replace(/<[^>]*>/g, '').trim()); clkF += gaps && gaps[i] !== undefined ? gaps[i] : 1000; }
            return { toasts, notes }; };
        const SAID = 'Saving failed. The campaign is not reaching the disk.', BACK = 'Saving works again. The campaign is on the disk.';
        // two saves in flight (the review of 2026-10-10): only the newest one's answer speaks, in whatever order the answers come
        const runRace = async order => { const toasts = [], note = { innerHTML: '' }, st = { appState: { activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } } }, pend = [];
            const save = new Function('Date', 'window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', 'toast', failSrc)({ now: () => 1000000 },
                { wpNet: null }, st, () => ({ meta: {} }), note, () => {}, () => new Promise(res => { pend.push(res); }), () => 0, () => {}, t => toasts.push(t));
            save(true); save(true); const sent = pend.length;
            for (const step of order) { pend[step[0]]({ ok: step[1] }); for (let k = 0; k < 6; k++) await new Promise(r => setImmediate(r)); }
            return [sent, toasts]; };
        const races = [await runRace([[1, false], [0, true]]), await runRace([[1, true], [0, false]]), await runRace([[0, false], [1, false]]), await runRace([[0, true], [1, true]])];
        const f1 = await runFail(['ok', 'bad', 'bad', 'throw', 'ok', 'throw', 'bad', 'ok', 'ok']), f2 = await runFail(['ok', 'ok']), f3 = await runFail(['throw']);
        const f4 = await runFail(['bad', 'bad', 'bad', 'bad', 'bad'], [59000, 1000, 1000, 60000, 1000]);   // a minute of failing: said again (the review of 2026-10-09: one notice in an hour of edits was all)
        check('a failed save is said in a notice (the owed review of 2026-10-09; io.js save, run for real): a save the disk refuses and one that cannot be sent are each said in the saved note as ever and in a notice too, once when saving begins to fail, again each minute while it goes on failing and never more often, and at once when it fails after a save has gone through in between; a save that goes through says nothing, but for the first after a failure that was said, which says that saving works again; with two saves on their way only the newest one\'s answer speaks, so an older save that answers late says nothing of where the disk stands; the words are fixed',
            j(f1.notes) === j(['Saved to disk ✓', 'Error saving.', 'Error saving.', 'Network error saving.', 'Saved to disk ✓', 'Network error saving.', 'Error saving.', 'Saved to disk ✓', 'Saved to disk ✓'].map(s => s.replace('✓', '&#10003;'))) && j(f1.toasts) === j([SAID, BACK, SAID, BACK])
            && j(f2.toasts) === j([]) && j(f3.toasts) === j([SAID]) && j(f4.toasts) === j([SAID, SAID, SAID]) && j(races) === j([[2, [SAID]], [2, []], [2, [SAID]], [2, []]]) && failSrc.includes("toast('Saving failed. The campaign is not reaching the disk.');") && failSrc.includes("if (!bad) { if (_saveFailSaid) toast('Saving works again. The campaign is on the disk.'); _saveFailSaid = false; return; }"), j([f1, f2, f3, f4]));
    })());
    // 1.6.3 (the improvement week's review, finding 25): a save sent JSON.stringify(state.appState) as one string, written and encoded whole at every
    // save. io.js saveBody (its savebody slice) with pushHistory (the history slice), run for real with a JSON that counts what it writes and a Blob that
    // counts the characters it is handed to encode: over seeded campaigns and a run of saves with every kind of change between them (an item's content
    // in place, its live meta only, a key taken away, put back at the end or given undefined or a function, its meta made null, an own __proto__ key, an
    // item that reads itself through toJSON, items that are no object, words that hold the save's own mark, integer-like ids, a campaign added and its
    // items taken away), each body read back is exactly JSON.stringify(state.appState) of that moment. And the cost: after the first save, a save with
    // nothing changed writes no item again on the GM's own machine (the pass's projections say them) and encodes only the state around the items; one
    // item changed, that item alone is written and encoded; a host's save (no projections: its table sync runs between the pass and the body) writes
    // each item to compare and encodes only what changed. The plain string a save sent before encoded every character every time
    pendingChecks.push((async () => {
        const slT = n => { const A = '  // [textcheck:' + n + '-start]', Z = '  // [textcheck:' + n + '-end]', a = ioE.indexOf(A), z = ioE.indexOf(Z); return a >= 0 && z > a ? ioE.slice(a, z) : ''; };
        const slN = n => { const A = '  // [netcheck:' + n + '-start]', Z = '  // [netcheck:' + n + '-end]', a = ioE.indexOf(A), z = ioE.indexOf(Z); return a >= 0 && z > a ? ioE.slice(a, z) : ''; };
        const histS = slT('history'), bodyS = slN('savebody');
        const realJ = JSON, cnt = { items: 0, enc: 0, blobs: 0, proj: 0 };
        let itemSet = new WeakSet();
        // proj: a projection written (project's own { c, m }), which is what a save with no pass's projections works out to compare (the review of finding 25)
        const isProj = v => !!v && typeof v === 'object' && !itemSet.has(v) && Object.keys(v).length === 2 && Object.prototype.hasOwnProperty.call(v, 'c') && Object.prototype.hasOwnProperty.call(v, 'm');
        const JC = { parse: realJ.parse, stringify: function(v) { if (v && typeof v === 'object' && itemSet.has(v)) cnt.items++; else if (isProj(v)) cnt.proj++; return realJ.stringify.apply(realJ, arguments); } };
        class BlobC extends Blob { constructor(parts, o) { (parts || []).forEach(p => { if (typeof p === 'string') cnt.enc += p.length; }); cnt.blobs++; super(parts, o); } }
        const mk = (appState, camp) => new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout', 'mergeLivePlayerState', 'Blob', 'JSON',
            histS + '\n' + bodyS + '\nreturn { pushHistory: pushHistory, passTake: passTake, saveBody: saveBody, kept: _bodyKept };')(
            { wpNet: null }, { appState }, () => camp, () => null, { getItem: () => null }, { getElementById: () => null, activeElement: null }, () => 0, () => {}, Date, () => {}, () => {}, () => {}, undefined, () => {}, BlobC, JC);
        let seedB = 7; const rnd = () => { seedB = (seedB * 1103515245 + 12345) & 0x7fffffff; return seedB / 0x7fffffff; };
        const WORDS = ['Torch', 'gate', '\u0001wpb', '"quoted"', 'café', '\u{1F600}', '\\', '12'];
        const piece = n => ({ id: 'p' + n, type: rnd() < 0.5 ? 'rect' : 'circle', x: Math.floor(rnd() * 900), y: Math.floor(rnd() * 900), name: WORDS[Math.floor(rnd() * WORDS.length)] });
        const mapOf = (id, n) => { const wb = []; for (let i = 0; i < n; i++) wb.push(piece(i)); return { id, type: 'map', meta: { title: 'Map ' + id, updated: 1, lastWbX: 10, gridType: 'square', fog: { mode: 'auto' } }, whiteboard: wb, rooms: [], links: [] }; };
        const offB = []; let savesB = 0;
        const sameBody = async (S, appState, pp, tag) => { const b = S.saveBody(pp), txt = typeof b === 'string' ? b : await b.text(); savesB++; if (txt !== realJ.stringify(appState) && offB.length < 4) offB.push(tag); return b; };
        for (let s = 0; s < 40; s++) {
            const items = {}; ['m1', '12', 'm2', '3', 'pl'].forEach((k, i) => { items[k] = k === 'pl' ? { id: 'pl', type: 'planner', meta: { title: 'Plan', status: 'next' }, blocks: [{ type: 'text', html: WORDS[s % WORDS.length] }] } : mapOf(k, 3 + (s + i) % 5); });
            items.nul = null; items.arr = [1, 2];
            const camp = { id: 'c' + s, name: 'Camp \u0001wpb', activeItemId: 'm1', items, chars: { c1: { id: 'c1', name: 'Kael', values: { hp: 7 } } }, system: { v: 1 } };
            const appState = { activeCampaignId: camp.id, campaigns: { [camp.id]: camp, other: { id: 'other', items: { o1: mapOf('o1', 2) } } }, _schema: 1 };
            itemSet = new WeakSet(); [items.m1, items['12'], items.m2, items['3'], items.pl, appState.campaigns.other.items.o1].forEach(x => itemSet.add(x));
            const S = mk(appState, camp), pass = () => { S.pushHistory(); return S.passTake(); };
            await sameBody(S, appState, pass(), s + ' first');
            const steps = [
                () => { items.m1.whiteboard[0].x += 5; }, () => { items.m2.meta.lastWbX = 99; }, () => { delete items['3'].rooms; }, () => { items['3'].rooms = []; },
                () => { items.m1.extra = undefined; }, () => { items.m1.fn = function() {}; }, () => { items.pl.meta = null; }, () => { items.pl.meta = { title: 'Plan' }; },
                () => { items.m2.whiteboard.push(piece(77)); }, () => { const o = realJ.parse('{"__proto__": {"x": 1}}'); items['12'].bag = o; }, () => { Object.defineProperty(items['12'], '__proto__', { value: 5, enumerable: true, configurable: true, writable: true }); },
                () => { items.m2.toJSON = () => ({ m2: 'as JSON' }); }, () => { delete items.m2.toJSON; }, () => { items.m1.whiteboard[1].name = '\u0001wpb' + 'x:0'; }, () => { items.m1.meta.title = 'Renamed'; },
                () => { appState.campaigns.late = { id: 'late', items: { l1: mapOf('l1', 1) } }; itemSet.add(appState.campaigns.late.items.l1); }, () => { appState.campaigns.late.items = null; }, () => {},
                () => { Object.defineProperty(items['12'], '__proto__', { value: 6, enumerable: true, configurable: true, writable: true }); }, () => { items.m1.id = 'm1x'; }, () => { items.m1.id = undefined; }, () => { items.m1.id = null; },
                () => { items.m2.type = 'room'; }, () => { items.m2.meta.lastWbX = undefined; }, () => { items.m2.meta.lastWbX = null; }, () => { items.m2.meta.lastWbX = function() {}; }
            ];
            for (let k = 0; k < steps.length; k++) { steps[k](); await sameBody(S, appState, pass(), s + ' step ' + k + ' pass'); if ((k + s) % 3 === 0) await sameBody(S, appState, null, s + ' step ' + k + ' host'); }   // the GM's own saves in a row, a host's now and then
        }
        // words that ARE one of the save's own marks (a save's random word made known by a fixed clock and a fixed Math.random): the body is the plain
        // string, still exactly the state, never a part put where the words stood
        {
            const MF = Object.assign(Object.create(Math), { random: () => 0.123 }), word = '\u0001wpb' + (0.123).toString(36).slice(2) + (1000).toString(36) + ':';
            const itemsF = { m1: mapOf('m1', 2), m2: mapOf('m2', 2) }, campF = { id: 'cf', name: word + '0', activeItemId: 'm1', items: itemsF }, stF = { activeCampaignId: 'cf', campaigns: { cf: campF } };
            const SF = new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout', 'mergeLivePlayerState', 'Blob', 'JSON', 'Math',
                histS + '\n' + bodyS + '\nreturn { pushHistory: pushHistory, passTake: passTake, saveBody: saveBody };')(
                { wpNet: null }, { appState: stF }, () => campF, () => null, { getItem: () => null }, { getElementById: () => null, activeElement: null }, () => 0, () => {}, { now: () => 1000 }, () => {}, () => {}, () => {}, undefined, () => {}, BlobC, JC, MF);
            SF.pushHistory(); const bF = SF.saveBody(SF.passTake()); if ((typeof bF === 'string' ? bF : await bF.text()) !== realJ.stringify(stF)) offB.push('planted mark');
            campF.name = 'Camp'; itemsF.m2.whiteboard[0].name = word + '1'; SF.pushHistory(); const bG = SF.saveBody(SF.passTake()); if ((typeof bG === 'string' ? bG : await bG.text()) !== realJ.stringify(stF)) offB.push('planted mark in an item');
        }
        // the cost on one campaign of five big maps
        const itemsC = {}; ['a', 'b', 'c', 'd', 'e'].forEach(k => { itemsC[k] = mapOf(k, 400); });
        const campC = { id: 'cc', activeItemId: 'a', items: itemsC, chars: { c1: { id: 'c1', name: 'Kael' } } }, stC = { activeCampaignId: 'cc', campaigns: { cc: campC } };
        itemSet = new WeakSet(); Object.values(itemsC).forEach(x => itemSet.add(x));
        const SC = mk(stC, campC), passC = () => { SC.pushHistory(); return SC.passTake(); }, whole = realJ.stringify(stC).length, rest = whole - Object.values(itemsC).reduce((n, x) => n + realJ.stringify(x).length, 0);   // rest: the state around the items
        const costOf = async (pp, tag) => { const was = { items: cnt.items, enc: cnt.enc, proj: cnt.proj }; const b = await sameBody(SC, stC, pp, tag); return [cnt.items - was.items, cnt.enc - was.enc, typeof b, cnt.proj - was.proj]; };
        const firstC = await costOf(passC(), 'cost first');
        const twoC = await costOf(passC(), 'cost again');                                             // nothing changed, the GM's own save
        itemsC.c.whiteboard[3].x += 1; const pieceC = realJ.stringify(itemsC.c).length;
        const oneC = await costOf(passC(), 'cost one');                                               // one map changed
        const hostC = await costOf(null, 'cost host');                                                // a host's save: no projections
        itemsC.d.whiteboard[0].y += 1; const hostOne = await costOf(null, 'cost host one');
        const keptKeys = Object.keys(SC.kept.get(itemsC.a) || {}).join();   // the review of finding 25: no item's whole JSON is kept beside its part
        // the review of finding 25: an own key named __proto__ on the state, its list of campaigns, a campaign or a campaign's list of items, each
        // with a value that is no plain object (JSON.parse of a file makes such a key): the body is the plain string, which keeps the key. PROTO_OLD
        // is the slice without its bodyProto test, which loses the key at a campaign and at the state and writes the rest wrong
        const PROTO_OLD = bodyS.split("      if (bodyProto(all) || bodyProto(all.campaigns)) return JSON.stringify(all);\n").join('').split("      for (var q = 0; q < cids.length; q++) { var cq = all.campaigns[cids[q]]; if (plain(cq) && (bodyProto(cq) || (plain(cq.items) && bodyProto(cq.items)))) return JSON.stringify(all); }\n").join('');
        const protoRun = async (body, where) => {
            const itemsP = { m1: mapOf('m1', 2), m2: mapOf('m2', 2) }, campP = { id: 'cp', activeItemId: 'm1', items: itemsP }, stP = { activeCampaignId: 'cp', campaigns: { cp: campP } };
            const own = (o, v) => Object.defineProperty(o, '__proto__', { value: v, enumerable: true, configurable: true, writable: true });
            if (where === 'state') own(stP, null); else if (where === 'campaigns') own(stP.campaigns, [1, 2]); else if (where === 'camp') own(campP, { toJSON: () => 'as JSON' }); else if (where === 'items') own(itemsP, null);
            const SP = new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout', 'mergeLivePlayerState', 'Blob', 'JSON',
                histS + '\n' + body + '\nreturn { pushHistory: pushHistory, passTake: passTake, saveBody: saveBody };')(
                { wpNet: null }, { appState: stP }, () => campP, () => null, { getItem: () => null }, { getElementById: () => null, activeElement: null }, () => 0, () => {}, Date, () => {}, () => {}, () => {}, undefined, () => {}, BlobC, JC);
            SP.pushHistory(); const b = SP.saveBody(SP.passTake()), txt = typeof b === 'string' ? b : await b.text();
            return txt === realJ.stringify(stP) && txt.indexOf('"__proto__"') >= 0; };
        // the review of 1.6.3 (finding 13): a campaign's fogMem (the players' explored ground) is a part of its own, written again only when fog.js
        // says a fogMem was written since (wpFog.memVer), wherever it stands among the campaign's keys; with no fog.js it stays in the skeleton
        {
            let ver = 1, fmJ = 0; const fmA = { mA: { u_a: { k: 'square:50|0', t: 1, c: '1,1;2,2' } } }, fmB = { mB: { u_b: { k: 'k', t: 2, c: '3,3' } } };
            const JF = { parse: realJ.parse, stringify: function(v) { if (v === fmA || v === fmB) fmJ++; return realJ.stringify.apply(realJ, arguments); } };
            const campA = { id: 'ca', fogMem: fmA, items: { m1: mapOf('m1', 2) }, name: 'A' }, campB = { id: 'cb', items: { m2: mapOf('m2', 1) }, fogMem: fmB }, stF = { activeCampaignId: 'ca', campaigns: { ca: campA, cb: campB } };
            const mkF = winF => new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout', 'mergeLivePlayerState', 'Blob', 'JSON',
                histS + '\n' + bodyS + '\nreturn { pushHistory: pushHistory, passTake: passTake, saveBody: saveBody };')(
                winF, { appState: stF }, () => campA, () => null, { getItem: () => null }, { getElementById: () => null, activeElement: null }, () => 0, () => {}, Date, () => {}, () => {}, () => {}, undefined, () => {}, BlobC, JF);
            const SFm = mkF({ wpNet: null, wpFog: { memVer: () => ver } }), SFn = mkF({ wpNet: null });
            const bodyOf = async S => { S.pushHistory(); const b = S.saveBody(S.passTake()), txt = typeof b === 'string' ? b : await b.text(); return [typeof b, txt === realJ.stringify(stF)]; };
            const f1 = await bodyOf(SFm), n1 = fmJ, f2 = await bodyOf(SFm), n2 = fmJ;
            fmA.mA.u_a.c += ';4,4'; ver++; const f3 = await bodyOf(SFm), n3 = fmJ;
            fmB.mB.u_b.c += ';5,5'; const stale = await bodyOf(SFm);   // written with no word from fog.js: the part kept still stands (fog.js moves the version at every write it makes)
            ver++; const f4 = await bodyOf(SFm), fn = await bodyOf(SFn), n4 = fmJ;
            check('the review of 1.6.3 (finding 13): a campaign\'s fogMem is a part of the save of its own (io.js saveBody, run for real): the body is still exactly JSON.stringify of the state, a fogMem before or after the campaign\'s items alike; it is written again only when fog.js says a fogMem was written since (wpFog.memVer), and a save with no word from fog.js keeps it in the skeleton, as before',
                j(f1) === j(['object', true]) && n1 === 2 && j(f2) === j(['object', true]) && n2 === 2 && j(f3) === j(['object', true]) && n3 === 4 && j(stale) === j(['object', false]) && j(f4) === j(['object', true]) && j(fn) === j(['object', true]) && n4 === 6,
                j([f1, n1, f2, n2, f3, n3, stale, f4, fn, n4]));
        }
        const protoNow = [], protoOld = [];
        for (const wh of ['state', 'campaigns', 'camp', 'items']) { protoNow.push(await protoRun(bodyS, wh)); protoOld.push(await protoRun(PROTO_OLD, wh)); }
        check('1.6.3 (finding 25) a save\'s body is put together from parts (io.js saveBody with pushHistory, run for real): over 40 seeded campaigns and every kind of change between saves, on the GM\'s own machine and on a host\'s, the body read back is exactly JSON.stringify(state.appState) of that moment; and after the first save a save with nothing changed writes no item again and encodes only the state around the items, one map changed is the only one written and encoded, and a host\'s save writes each item to compare and encodes only the one that changed, where the plain string encoded every character every time',
            !offB.length && savesB > 900 && firstC[0] === 5 && firstC[1] === whole && firstC[3] === 0 && twoC[0] === 0 && twoC[1] === rest && twoC[2] === 'object' && twoC[3] === 0 && rest < whole / 50
            && oneC[0] === 1 && oneC[1] === rest + pieceC && oneC[3] === 0 && hostC[0] === 0 && hostC[1] === rest && hostC[3] === 5 && hostOne[0] === 1 && hostOne[1] === rest + realJ.stringify(itemsC.d).length && hostOne[3] === 5 && !!histS && !!bodyS,
            j([offB, savesB, firstC, twoC, oneC, hostC, hostOne, whole, rest, pieceC]));
        check('1.6.3 (the review of finding 25) what a save keeps of each item is its part and its projection, never its whole JSON (a host\'s save works out each item\'s projection to compare, as the GM\'s own save reads the pass\'s, and writes only what changed); and an own key named __proto__ on the state, its campaigns, a campaign or a campaign\'s items, each with a value that is no plain object, is kept: the body is the plain string. The slice without that test loses the key',
            keptKeys === 'p,sig,blob' && j(protoNow) === j([true, true, true, true]) && protoOld.some(x => !x) && PROTO_OLD !== bodyS, j([keptKeys, protoNow, protoOld]));
    })());
    // 1.6.3 (the review of finding 26): the save after a map switch is no edit of the GM's (io.js saveSwitch, which sidebar.js navigateToMap asks, run
    // for real with pushHistory, the history slice, and save itself, on a clock of the suite's own). A map switched to, then a player's change to that
    // map saved by the table within the half second (a remote save, as net.js saveRemoteSoon makes it): no step of the GM's undo is recorded and the
    // map's redo list stays. The commit before (navigateToMap asking save(), which marks the GM's own edit as waiting) recorded that change as the
    // GM's step and emptied the redo list. And: an edit of the GM's already waiting is saved at once at the switch, as every switch did before; a map
    // with no undo history yet (one just made) is saved at once; a switch still waiting is written at pagehide, carried by any save before its time
    // (its timer cleared), and otherwise written by its own timer half a second later
    {
        const slT = n => { const A = '  // [textcheck:' + n + '-start]', Z = '  // [textcheck:' + n + '-end]', a = ioE.indexOf(A), z = ioE.indexOf(Z); return a >= 0 && z > a ? ioE.slice(a, z) : ''; };
        const swS = ioE.slice(ioE.indexOf('  var _saveFailSaid = false'), ioE.indexOf('  function save(immediate) {'));
        const runSw = how => {
            const timers = [], disk = [], heard = {};
            const mapA = { id: 'mA', type: 'map', meta: { title: 'A', updated: 1 }, whiteboard: [{ id: 'd1', type: 'rect', x: 0 }] }, mapB = { id: 'mB', type: 'map', meta: { title: 'B', updated: 1 }, whiteboard: [{ id: 'door', type: 'rect', x: 0, doorOpen: false }] };
            const camp = { id: 'cp', activeItemId: 'mA', items: { mA: mapA, mB: mapB } }, st = { appState: { activeCampaignId: 'cp', campaigns: { cp: camp } } };
            const win = { wpNet: null, addEventListener: (t, f) => { heard[t] = f; } };
            const api = new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'toast', 'mergeLivePlayerState', 'saveNote', 'fetch',
                slT('history') + '\nvar saveTimeout;\n' + swS + fnIo('  function save(immediate) {', '\n  }\n', 'save') + '\nreturn { save: save, saveSwitch: typeof saveSwitch === "function" ? saveSwitch : null, hist: function() { return histories; }, pending: function() { return savePending; } };')(
                win, st, () => camp, () => camp.items[camp.activeItemId] || null, { getItem: () => null }, { getElementById: () => null, activeElement: null },
                (fn, ms) => { timers.push({ fn, ms, on: true }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].on = false; }, Date, () => {}, () => {}, () => {}, { innerHTML: '' },
                () => { disk.push(camp.activeItemId); return { then() { return { then() {}, catch() {} }; } }; });
            const fire = () => { timers.forEach(t => { if (t.on) { t.on = false; t.fn(); } }); };
            const armed = () => timers.filter(t => t.on).length;
            const sw = how === 'old' ? () => api.save() : () => api.saveSwitch();   // old: the commit before, navigateToMap asking save()
            api.save(true);                                                         // a first save: every map has its undo history
            const hB = api.hist()['cp/mB']; hB.redo = ['R'];                         // map B has a step to redo
            camp.activeItemId = 'mB'; sw();                                         // the GM opens map B
            const atSwitch = [api.pending(), armed(), disk.length];
            win.wpNet = { active: true, role: 'host', applyingRemote: true, onLocalSave() {} }; mapB.whiteboard[0].doorOpen = true; api.save(true); win.wpNet.applyingRemote = false;   // a player opens B's door within the half second
            const afterRemote = [api.hist()['cp/mB'].undo.length, api.hist()['cp/mB'].redo.join(), armed()];
            fire(); win.wpNet = null;
            // an edit of the GM's waiting at the switch: saved at once, and its own step
            mapB.whiteboard[0].x = 40; api.save(); camp.activeItemId = 'mA'; const dW = disk.length; sw();
            const editWaiting = [disk.length - dW, api.pending(), api.hist()['cp/mB'].undo.length, armed()]; fire();
            // a map just made (no undo history): saved at once
            camp.items.mC = { id: 'mC', type: 'map', meta: { title: 'C' }, whiteboard: [] }; camp.activeItemId = 'mC'; const dN = disk.length; sw(); const fresh = [disk.length - dN, armed()]; fire();
            // a switch still waiting at pagehide is written then; one carried by a save before its time; one written by its own timer
            camp.activeItemId = 'mA'; const dP = disk.length; sw(); const armedP = armed(); if (heard.pagehide) heard.pagehide(); const atHide = [armedP, disk.length - dP, armed()];
            camp.activeItemId = 'mB'; const dC = disk.length; sw(); api.save(true); const carried = [disk.length - dC, armed()];
            camp.activeItemId = 'mA'; const dT = disk.length; sw(); const before = disk.length - dT; fire(); const byTimer = [before, disk.length - dT, timers.filter(t => t.ms === 500).length > 0];
            return { atSwitch, afterRemote, editWaiting, fresh, atHide, carried, byTimer };
        };
        let swNow = null, swOld = null, swErr = '';
        try { swNow = runSw('now'); swOld = runSw('old'); } catch (e) { swErr = String(e && e.stack); }
        check('1.6.3 (the review of finding 26) a map switch\'s save is no edit of the GM\'s (io.js saveSwitch with pushHistory and save, run for real): a player\'s change to the map just opened, saved by the table within the half second, records no step of the GM\'s undo and keeps the map\'s redo list, where the switch saving through save() recorded it and emptied the list; an edit already waiting is saved at once at the switch as its own step; a map with no undo history yet is saved at once; a switch still waiting is written at pagehide, carried by a save before its time, and else written by its own timer',
            !swErr && !!swS && j(swNow.atSwitch) === j([false, 1, 1]) && j(swNow.afterRemote) === j([0, 'R', 0])
            && j(swOld.afterRemote) === j([1, '', 0])
            && j(swNow.editWaiting) === j([1, false, 1, 0]) && j(swNow.fresh) === j([1, 0]) && j(swNow.atHide) === j([1, 1, 0]) && j(swNow.carried) === j([1, 0]) && j(swNow.byTimer) === j([0, 1, true]),
            j([swErr, swNow, swOld]));
    }
    // The camera is no change to the campaign (the owner, 2026-10-04: "seems the whole map lags at a distance"): io.js saveView, run for real, and
    // main.js's scroll handler pinned to it
    const viewSrc = ['var saveTimeout, viewTimeout, savePending = false;', fnIo('  function canPersistLocal() {', '\n  }\n', 'canPersistLocal'), fnIo('  function saveView() {', '\n  }\n', 'saveView'), 'return { saveView: saveView, pending: function(v) { savePending = v; } };'].join('\n');
    const runViewE = (netS, o) => { o = o || {}; const log = [], timers = [], map = { meta: { updated: 111 } }, st = { appState: Object.assign({ activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } }, o.marked ? { _foreign: { at: 1 } } : {}) }, note = { innerHTML: 'as it was' };
        if (netS) netS.onLocalSave = () => log.push('wire');
        const win = { wpNet: netS, wpStream: !!o.stream, wpPopout: !!o.popout, __wpNoSave: !!o.noSave };
        const api = new Function('window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', viewSrc)(
            win, st, () => map, note, () => log.push('history'), (url, opts) => { log.push('disk:' + url + ':' + JSON.parse(opts.body).activeCampaignId); return { then() {} }; }, (fn, ms) => { timers.push({ fn, ms, on: true }); return timers.length; }, id => { if (timers[id - 1]) timers[id - 1].on = false; });
        const moves = o.moves || 1; for (let i = 0; i < moves; i++) api.saveView();
        const armed = timers.filter(t => t.on), wait = armed.map(t => t.ms).join();
        if (o.pending) api.pending(true); if (o.handOver) { win.wpNet = { active: true, role: 'client', foreign: true }; }
        armed.forEach(t => t.fn());
        return [log.join(), wait, map.meta.updated, note.innerHTML].join(' / '); };
    const vw = { solo: runViewE(null), host: runViewE({ active: true, role: 'host', foreign: false }), many: runViewE({ active: true, role: 'host', foreign: false }, { moves: 40 }), pending: runViewE(null, { pending: true }), handOver: runViewE(null, { handOver: true }),
        seated: runViewE(cliS()), waiting: runViewE(cliS({ foreign: false, syncedPeer: null })), retry: runViewE(cliS({ syncedPeer: null })), marked: runViewE(null, { marked: true }), stream: runViewE(null, { stream: true }), popout: runViewE(null, { popout: true }), noSave: runViewE(null, { noSave: true }) };
    const mainE = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, '\n'), ufA = mainE.indexOf('    function updateFocusCoord(fromScroll) {'), ufB = mainE.indexOf("    document.getElementById('canvasWrap').addEventListener('scroll'", ufA), ufSrc = ufA >= 0 && ufB > ufA ? mainE.slice(ufA, ufB) : '';
    check('the camera is no change to the campaign (io.js saveView, run for real): a pan or a zoom on the GM\'s machine, solo or hosting, stamps nothing on the map, runs no undo pass, calls the table\'s hook not at all and leaves the save note alone; the view is written to this machine\'s own file once, two seconds after the last of any number of moves, and not at all while a real save is on its way or once the table has changed hands; a player\'s app (seated, waiting for the GM or between a reconnect\'s attempts), a state marked as another table\'s, the stream and pop-out windows and a restore under way arm no timer and write nothing; the play map\'s and the data map\'s scroll go through it and never through save()',
        vw.solo === 'disk:/api/data:mine / 2000 / 111 / as it was' && vw.host === 'disk:/api/data:mine / 2000 / 111 / as it was' && vw.many === 'disk:/api/data:mine / 2000 / 111 / as it was' && vw.pending === ' / 2000 / 111 / as it was' && vw.handOver === ' / 2000 / 111 / as it was'
        && [vw.seated, vw.waiting, vw.retry, vw.marked, vw.stream, vw.popout, vw.noSave].every(x => x === ' /  / 111 / as it was')
        && ufSrc.includes('saveView();') && !/\bsave\(/.test(ufSrc) && ufSrc.includes('am.meta.lastWbX = cx;') && /import \{[^}]*\bsaveView\b[^}]*\} from '\.\/io\.js';/.test(mainE) && /\n    saveView,\n/.test(ioE.replace(/\n\n/g, '\n'))
        && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').includes('- Moving around a map no longer lags it.')), j(vw));
    // 1.5.5, a plan-aware mode (the owner, 2026-10-23: "a plan-aware mode, read from the site's /api/version answer, with the Player plan join-only"):
    // on a website whose plan joins tables and nothing else (webmode.js), nothing of the player's is kept and no campaign of their own is loaded or made.
    // io.js canPersistLocal, ownWhileWaiting, save, saveView, load and loadJoinOnly, each run for real
    pendingChecks.push((async () => {
        const webW = (joinOnly) => (joinOnly === undefined ? undefined : { joinOnly: () => joinOnly });
        const cplSrc = fnIo('  function canPersistLocal() {', '\n  }\n', 'canPersistLocal') + '\nreturn canPersistLocal;';
        const cpl = (W, netC) => new Function('window', 'state', cplSrc)({ wpNet: netC || null, wpWebMode: W }, { appState: { campaigns: {} } })();
        const cplOut = [cpl(webW(true)), cpl(webW(false)), cpl(undefined), cpl({ joinOnly: () => 'yes' }), cpl({}), cpl(webW(true), { active: true, role: 'host' })];
        const runSaveW = (netS, joinOnly) => { const log = [], st = { appState: { activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } } }, note = { innerHTML: '' };
            if (netS) netS.onLocalSave = () => log.push('wire');
            const saveW = new Function('window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', saveSrc)(
                { wpNet: netS, wpWebMode: webW(joinOnly) }, st, () => ({ meta: {} }), note, () => log.push('history'), (url, opts) => { log.push('disk:' + url); return { then(f) { f({ ok: true }); return { catch() {} }; } }; }, () => 0, () => {});
            saveW(true); return log.join() + ' / ' + note.innerHTML.replace(/<[^>]*>/g, ''); };
        const svW = { solo: runSaveW(null, true), waiting: runSaveW(cliS({ foreign: false, syncedPeer: null }), true), seated: runSaveW(cliS(), true), notYet: runSaveW(null, false), full: runSaveW(null, undefined) };
        const runViewW = joinOnly => { const timers = [], log = [];
            const api = new Function('window', 'state', 'getActiveMap', 'saveNote', 'pushHistory', 'fetch', 'setTimeout', 'clearTimeout', viewSrc)(
                { wpNet: null, wpWebMode: webW(joinOnly) }, { appState: { activeCampaignId: 'mine', campaigns: { mine: { id: 'mine' } } } }, () => ({ meta: {} }), { innerHTML: '' }, () => {}, url => { log.push('disk:' + url); return { then() {} }; }, fn => { timers.push(fn); return timers.length; }, () => {});
            api.saveView(); timers.forEach(fn => fn()); return timers.length + ':' + log.join(); };
        check('1.5.5 plan-aware mode, nothing kept (io.js canPersistLocal, save and saveView, run for real): on a website whose plan joins tables alone this computer writes nothing for the player — canPersistLocal answers no, a save on the join screen and while waiting for the GM\'s Allow reaches no disk, and the camera is never written — while at the table a save goes to the host as before; only an answer of true counts, so before the site\'s answer is in, and on a desktop, every one of them is as it was',
            j(cplOut) === j([false, true, true, true, true, false]) && !/disk/.test(svW.solo) && !/disk/.test(svW.waiting) && svW.seated === 'wire / Synced to host &#10003;' && svW.waiting === 'wire / Synced to host &#10003;'
            && /^history,disk:\/api\/data \/ Saved to disk/.test(svW.notYet) && /^history,disk:\/api\/data \/ Saved to disk/.test(svW.full) && runViewW(true) === '0:' && runViewW(false) === '1:disk:/api/data' && runViewW(undefined) === '1:disk:/api/data', j([cplOut, svW, runViewW(true), runViewW(false)]));
        // load: the site's word first. A join-only answer fetches nothing and seeds nothing; any other answer loads the save exactly as before
        const loadSrcW = fnIo('  function load() {', '\n  }\n', 'load');
        const runLoadW = async (ready, data, netL) => {
            const log = [], st = { appState: { activeCampaignId: null, campaigns: {} } }, note = { innerHTML: '' };
            const fetchL = url => { log.push('fetch:' + url); return Promise.resolve({ json: () => Promise.resolve(JSON.parse(JSON.stringify(data))) }); };
            const loadW = new Function('resetHistory', 'window', 'webReady', 'loadJoinOnly', 'fetch', 'cleanupOnLoad', 'cleanupHooks', 'migrateAppState', 'state', 'dropWaiting', '_bindNotes', 'canPersistLocal', 'noteBindings', 'setTimeout', 'save', 'sweepRecents',
                'createNewCampaign', 'createNewMap', 'CATS', 'updateCampaignSelect', 'updateSidebarNav', 'applyRememberedView', 'render', 'document', 'restoreCameraPosition', 'pushHistory', 'updateUndoBtn', 'toast', 'saveNote', loadSrcW + '\nreturn load;')(
                () => log.push('reset'), { wpNet: netL || null }, ready, ov => log.push('joinOnly:' + (typeof ov === 'function' ? ov() : 'none')), fetchL, d => Promise.resolve(d), {}, d => ({ data: d, changed: false }), st, () => {}, [], () => true, () => {}, () => 0, () => log.push('save'), () => {},
                n => ({ id: 'c_seed', name: n, items: {} }), n => ({ id: 'm_seed', type: 'map', meta: { title: n }, rooms: [], whiteboard: [], cats: { default: {} } }), {}, () => log.push('select'), () => log.push('nav'), () => {}, () => log.push('render'), { getElementById: () => ({ clientWidth: 100 }) }, () => {}, () => log.push('history'), () => {}, () => {}, note);
            loadW();
            const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r)); };
            await settle();
            return { log: log.join(), logArr: log, camps: Object.values(st.appState.campaigns).map(c => c.name), note: note.innerHTML, settle };
        };
        let openGate = null; const gate = new Promise(r => { openGate = r; });
        const pend = await runLoadW(gate, {}), pendBefore = pend.log; openGate({ mode: 'full', plan: '', can: [] }); await pend.settle(); const pendAfter = pend.logArr.join();
        const lw = { full: await runLoadW(Promise.resolve({ mode: 'full', plan: '', can: [] }), {}), none: await runLoadW(Promise.resolve(null), {}), join: await runLoadW(Promise.resolve({ mode: 'join-only', plan: 'player', can: ['join'] }), {}),
            joinSaved: await runLoadW(Promise.resolve({ mode: 'join-only', plan: 'player', can: ['join'] }), { activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', name: 'Mine', items: {} } } }) };
        check('1.5.5 plan-aware mode, no campaign of the player\'s own (io.js load, run for real): load waits for the site\'s word before it reads anything; a join-only answer fetches nothing, seeds no Default Campaign, saves nothing and hands the way back to the join screen (loadJoinOnly, with the test of a join that overtook it); no answer, or one that is the full app, reads the save and seeds a fresh one exactly as before',
            pendBefore === 'reset' && pendAfter === 'reset,fetch:/api/data,select,nav,render,history' && lw.full.log === 'reset,fetch:/api/data,select,nav,render,history' && j(lw.full.camps) === j(['Default Campaign']) && lw.none.log === lw.full.log && j(lw.none.camps) === j(['Default Campaign'])
            && lw.join.log === 'reset,joinOnly:false' && j(lw.join.camps) === j([]) && lw.joinSaved.log === 'reset,joinOnly:false' && j(lw.joinSaved.camps) === j([]) && [lw.full, lw.join].every(r => r.note === ''), j([pendBefore, pendAfter, lw]));
        // loadJoinOnly (the webload slice): the table on screen is let go of as load() lets it go, and the welcome's Join a game comes up
        const ljSrc = (() => { const a = '// [netcheck:webload-start]', b = '// [netcheck:webload-end]', i = ioE.indexOf(a), k = ioE.indexOf(b); return i >= 0 && k > i && ioE.indexOf(a, i + 1) < 0 ? ioE.slice(i + a.length, k) : ''; })();
        const runLJ = o => {
            const log = [], st = { appState: { activeCampaignId: 'gm', campaigns: { gm: { id: 'gm', name: 'The GM\'s', _foreign: { at: 1 } } } }, selId: 'r', selWbId: 'w', selWbIds: ['w'] };
            const netL = o.net === null ? null : Object.assign({ active: false, role: null, foreign: true, stance: { a: 1 }, stanceCamps: { gm: 1 }, gmId: 'u_gm', sounds: [1], soundNow: 's1', refreshUi: () => log.push('refreshUi') }, o.net || {});
            const nm = { style: { display: 'flex' } };
            const win = { wpNet: netL, wpStream: !!o.stream, wpPopout: !!o.popout, wpDocForeign: v => log.push('doc:' + v), wpSound: { foreign: v => log.push('sound:' + v) }, wpFx: { foreign: v => log.push('fx:' + v) }, wpShowWelcome: () => log.push('welcome') };
            let fn = null; try { fn = new Function('window', 'state', 'updateCampaignSelect', 'updateSidebarNav', 'render', 'updateUndoBtn', 'document', 'fetch', ljSrc + '\nreturn loadJoinOnly;')(win, st, () => log.push('select'), () => log.push('nav'), () => log.push('render'), () => log.push('undo'), { getElementById: id => (id === 'netModal' ? nm : null) }, () => log.push('FETCH')); } catch (e) { return 'threw: ' + e.message; }
            fn(() => !!o.overtaken);
            return { log: log.join(), camps: Object.keys(st.appState.campaigns), act: st.appState.activeCampaignId, sel: [st.selId, st.selWbId, st.selWbIds.length], net: netL && [netL.foreign, netL.stance, netL.stanceCamps, netL.gmId, netL.sounds, netL.soundNow], nm: nm.style.display };
        };
        const lj = { left: runLJ({}), over: runLJ({ overtaken: true }), stream: runLJ({ stream: true }), pop: runLJ({ popout: true }), noNet: runLJ({ net: null }) };
        check('1.5.5 plan-aware mode, the way back from a table (io.js loadJoinOnly, the webload slice run for real): the GM\'s campaign is let go of and nothing takes its place, the selection is cleared, the table\'s ceiling, sounds and GM go as load() lets them go, the reader, sound and effects are told the campaign is no table\'s, the panels are drawn again, the Multiplayer window a lost table opened is put away and the welcome comes up; nothing is fetched; a join that overtook it changes nothing; the stream and pop-out windows bring up no welcome',
            typeof lj.left === 'object' && lj.left.log === 'doc:false,sound:false,fx:false,select,nav,render,refreshUi,undo,welcome' && j(lj.left.camps) === '[]' && lj.left.act === null && j(lj.left.sel) === j([null, null, 0]) && j(lj.left.net) === j([false, null, null, '', null, null]) && lj.left.nm === 'none'
            && lj.over.log === '' && j(lj.over.camps) === j(['gm']) && lj.over.nm === 'flex' && !/welcome/.test(lj.stream.log) && !/welcome/.test(lj.pop.log) && j(lj.pop.camps) === '[]' && lj.noNet.log === 'doc:false,sound:false,fx:false,select,nav,render,undo,welcome' && !/FETCH/.test(j(lj)),
            j(lj));
        // net.js: the one judge (the webjoin slice), a snapshot putting the welcome away, no hosting, a refresh's rejoin and the words of leaving
        const wjSrc = tryBetween('// [netcheck:webjoin-start]', '// [netcheck:webjoin-end]') || '';
        const wj = W => { try { return new Function('window', wjSrc + '\nreturn webJoinOnly();')({ wpWebMode: W }); } catch (e) { return 'threw'; } };
        const wjOut = [wj({ joinOnly: () => true }), wj({ joinOnly: () => false }), wj(undefined), wj({ joinOnly: () => 1 }), wj({ joinOnly: 'yes' })];
        const hideLine = (require('./checkkit').part('netfog.js').match(/\n    (if \(net\.fromWelcome \|\| \(typeof webJoinOnly === 'function' && webJoinOnly\(\)\)\) \{ net\.fromWelcome = false; if \(window\.wpHideWelcome\) window\.wpHideWelcome\(\); \})/) || [])[1] || '';
        const runHide = (from, joinOnly) => { const n = { fromWelcome: from }, log = []; new Function('net', 'window', 'webJoinOnly', hideLine)(n, { wpHideWelcome: () => log.push('hide') }, () => joinOnly); return log.join() + ':' + n.fromWelcome; };
        const hideOut = hideLine ? [runHide(true, false), runHide(false, true), runHide(false, false)] : ['no line'];
        const shA = src.indexOf('function startHosting(forceFresh) {'), shB = src.indexOf('\n', src.indexOf('fogForgetAll();', shA)), shHead = shA >= 0 && shB > shA ? src.slice(shA, shB) + '\n}\nreturn startHosting;' : '';
        const runHost = joinOnly => { const log = []; const sh = new Function('_lastSent', 'sensesReset', 'webJoinOnly', '_dragFrom', '_refusedAt', 'fogForgetAll', 'log', shHead.replace('    fogForgetAll();', '    log.push("went on"); fogForgetAll();'))(null, () => {}, () => joinOnly, null, null, () => {}, log); sh(false); return log.join() || 'stopped'; };
        const hostOut = shHead ? [runHost(true), runHost(false)] : ['no head'];
        const rfA = src.indexOf('// after a refresh: straight back to where you were\n'), rfB = src.indexOf('}, 1200);', rfA), rfSrc = rfA >= 0 && rfB > rfA ? src.slice(rfA, rfB + '}, 1200);'.length) : '';
        const runRefresh = async (store, joinOnly, gateR) => {
            const timers = [], log = [], n = { fromWelcome: false }, els = { netCodeInput: { value: '' }, netNameInput: { value: '' }, netJoinPassInput: { value: '' } };
            const ss = { getItem: k => (k in store ? store[k] : null), removeItem: k => { delete store[k]; } };
            new Function('setTimeout', 'sessionStorage', 'ui', 'toast', 'joinSession', 'startHosting', 'net', 'window', 'webJoinOnly', rfSrc)(fn => timers.push(fn), ss, id => els[id] || null, t => log.push('toast'), (c, nm) => log.push('join:' + c + ':' + nm + ':' + n.fromWelcome), () => log.push('host'), n, { wpWebMode: gateR === undefined ? undefined : { ready: gateR } }, () => joinOnly);
            timers.forEach(fn => fn());
            for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r));
            return log;
        };
        const RJ = () => ({ wp_rejoin: JSON.stringify({ code: 'ABCDEFGHJK', name: 'Kael', pass: '' }) });
        check('1.6.2 a player\'s own pointer comes back with a reload: the mark names it, the rejoin keeps it, the table\'s word sends it again where nothing stands there, and the host keeps a pointer while another connection of that player is open',
            (() => { const a = src.indexOf('function refreshMark() {'), b = src.indexOf('\n}\n', a), st = {}; new Function('net', 'sessionStorage', 'getProfile', 'ui', src.slice(a, b + 2) + '\nrefreshMark();')({ active: true, role: 'client', code: 'C', myId: 'u_a', targets: { u_a: { id: 't_1', mapId: 'm_1' }, u_b: { id: 't_2', mapId: 'm_1' } } }, { setItem: (k, v) => { st[k] = v; } }, () => ({ name: 'Kael' }), () => ({ value: '' })); return JSON.stringify(JSON.parse(st.wp_rejoin).point) === '{"id":"t_1","mapId":"m_1"}'; })()
            && src.includes("net._pointBack = { id: j.point.id, mapId: j.point.mapId };") && src.includes("net.setTarget(pbS.id, pbS.mapId);") && src.includes("!net.conns.some(function(c2) { return c2.peer !== conn.peer && c2.open && net.roster[c2.peer] && net.roster[c2.peer].id === p.id; })"), '');
        let openR = null; const gateR = new Promise(r => { openR = r; });
        const rfPend = await runRefresh(RJ(), true, gateR), rfBefore = rfPend.join();
        const rf = { webJoin: (await runRefresh(RJ(), true, Promise.resolve({ mode: 'join-only' }))).join(), desk: (await runRefresh(RJ(), false, Promise.resolve({ mode: 'full' }))).join(), noMod: (await runRefresh(RJ(), false, undefined)).join(), rehost: (await runRefresh({ wp_rehost: '1' }, false, undefined)).join() };
        openR({ mode: 'join-only' }); for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); const rfLate = rfPend.join();
        const markA = src.indexOf('function refreshMark() {'), markB = src.indexOf('\n}\n', markA), markS = markA >= 0 && markB > markA ? src.slice(markA, markB + 2) : '';
        const runMark = n => { const st = {}, ss = { setItem: (k, v) => { st[k] = v; } }; new Function('net', 'sessionStorage', 'getProfile', 'ui', markS + '\nrefreshMark();')(n, ss, () => ({ name: 'Kael' }), () => ({ value: 'pw' })); return st; };
        const markC = runMark({ active: true, role: 'client', code: 'ABCDEFGHJK' }), markH = runMark({ active: true, role: 'host', code: 'ABCDEFGHJK' }), markN = runMark({ active: false, role: 'client', code: 'ABCDEFGHJK' });
        check('a reload by the browser\'s own key comes back to the table as the app\'s Refresh does (found live, 2026-10-30: F5 left a player at the welcome screen): the page going away marks a player\'s rejoin with their code, name and password, a host\'s return, and nothing once they left the table; the button and the page\'s going away ask the one function',
            j(JSON.parse(markC.wp_rejoin)) === j({ code: 'ABCDEFGHJK', name: 'Kael', pass: 'pw' }) && !('wp_rehost' in markC) && markH.wp_rehost === '1' && !('wp_rejoin' in markH) && j(markN) === '{}'
            && src.includes("window.addEventListener('pagehide', refreshMark);") && src.includes('function refreshNow() { refreshMark(); location.reload(); }') && src.includes("_refreshBtn.addEventListener('click', refreshGo);"), j([markC, markH, markN]));
        {   // a reload at a table that finds no table goes on as a reconnect does, the rejoin slice run for real
            const rjS = src.slice(src.indexOf('// [netcheck:rejoin-start]'), src.indexOf('// [netcheck:rejoin-end]'));
            const mkR = joinOnly => { const reconn = { tries: 7, gen: 2 }, log = []; const f = new Function('reconn', 'scheduleReconnect', 'webJoinOnly', rjS + '\nreturn { arm: rejoinArm, done: rejoinDone, keep: rejoinKeep };')(reconn, () => log.push('again'), () => joinOnly); return { f, reconn, log }; };
            const R1 = mkR(false); const none = R1.f.keep(); R1.f.arm('ABCDEFGHJK', 'Kael'); const kept = R1.f.keep(), twice = R1.f.keep();
            const R2 = mkR(false); R2.f.arm('ABCDEFGHJK', 'Kael'); R2.f.done(); const answered = R2.f.keep();
            const R3 = mkR(true); R3.f.arm('ABCDEFGHJK', 'Kael'); const web = R3.f.keep();
            check('a reload at a table that finds no table goes on as a reconnect does, from its first try and once, never for a join the player began, once the table answers, or on a website whose plan joins tables alone',
                none === false && kept === true && twice === false && R1.log.length === 1 && R1.reconn.code === 'ABCDEFGHJK' && R1.reconn.name === 'Kael' && R1.reconn.tries === 0 && R1.reconn.gen === 0 && answered === false && R2.log.length === 0 && web === false
                && src.includes("if (!_joinTrust.refused && typeof rejoinKeep === 'function' && rejoinKeep()) return;") && src.includes("if (!net.active && typeof rejoinKeep === 'function' && rejoinKeep())") && src.includes("if (!isRetry && !probe && typeof rejoinDone === 'function') rejoinDone();") && src.includes("if (typeof rejoinArm === 'function') rejoinArm(j.code, j.name);"), j([R1.reconn, R1.log]));
        }
        {   // a trade's steps (found live: Confirm pressed right after a number was dropped, since the two arrive together)
            const m = /allow\('trade', (\{ perMs: \d+, burst: \d+, windowMs: \d+, table: \d+ \})/.exec(src), Dt = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'dicecore.js')).href);
            const cfg = m ? new Function('return ' + m[1])() : {}, rl = Dt.RateLimit(cfg), got = []; for (let i = 0; i < 21; i++) got.push(rl.allow('p', 1000));
            check('a trade\'s steps: two sent in the same moment both land, as a number left by a press on Confirm sends them, and a flood past the burst is refused in words and never dropped without one', m && got.slice(0, 20).every(x => x === true) && got[20] !== true && src.includes("refused: 'Too many steps at once. Try again in a moment.'"), j(got));
        }
        {   // 1.6.0 Off a character's turn, the host's half, the offturn slice run for real on a world of plain objects with the real system core
            const orA = src.indexOf('// [netcheck:offturn-start]'), orB = src.indexOf('// [netcheck:offturn-end]'), orS = src.slice(orA, orB), Sf = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js')).href);
            const sysT = off => ({ combat: { turn: off ? { off } : {} }, rolls: [{ id: 'r_hit', label: 'Hit', formula: '1' }, { id: 'r_any', label: 'Spot', formula: '1', free: true }], fields: [{ id: 'f_g', list: { rolls: [{ label: 'Swing' }, { label: 'Dodge', resist: true }] } }] });
            const world = (off, turn, held, role) => {
                const log = { toast: [], notes: [], events: [] }, camp = { system: sysT(off), chars: { c_a: { id: 'c_a', name: 'Ava' }, c_b: { id: 'c_b', name: 'Bram' }, c_x: { id: 'c_x', name: 'Out' } }, items: { m1: { whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a' }, { id: 't_b', isChar: true, charId: 'c_b' }] } } };
                const net = { role: role || 'host', combats: { f_a: { mapId: 'm1', turn: turn, rows: [{ id: 'r1', tokId: 't_a' }, Object.assign({ id: 'r2', tokId: 't_b' }, held ? { held: 1 } : {})] } } };
                const orderOfIn = (cp, id) => (id === 'c_x' ? null : 'f_a'), own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
                const api = new Function('net', 'window', 'SC', 'orderOfIn', 'own', 'logEvent', 'toast', 'turnNote', 'getActiveCampaign', orS + '\nreturn { bar: offTurnBar, warn: offTurnWarn };')(net, { wpVtt: { on: () => true } }, () => Sf, orderOfIn, own, (a, s) => log.events.push(s), s => log.toast.push(s), (c, s) => log.notes.push(s), () => camp);
                return { log, camp, net, bar: api.bar, warn: api.warn };
            };
            const R = world('refuse', 0), r1 = R.bar(R.camp, R.camp.chars.c_b, 'r_hit', undefined, 'Hit', {}), r2 = R.bar(R.camp, R.camp.chars.c_a, 'r_hit', undefined, 'Hit', {}), r3 = R.bar(R.camp, R.camp.chars.c_b, 'r_any', undefined, 'Spot', {}), r4 = R.bar(R.camp, R.camp.chars.c_b, undefined, { f: 'f_g', i: 1 }, 'Dodge', {}), r5 = R.bar(R.camp, R.camp.chars.c_b, undefined, { f: 'f_g', i: 0 }, 'Swing', {}), r6 = R.bar(R.camp, R.camp.chars.c_x, 'r_hit', undefined, 'Hit', {}), r7 = R.bar(R.camp, R.camp.chars.c_b, undefined, undefined, 'typed', {});
            check('1.6.0 Off a character\'s turn under Refuse (offTurnBar, run for real): a chosen roll off its character\'s turn is refused in plain words and the GM told, a list\'s too; on their turn it goes ahead; one ticked Any time, one that resists, a character in no fight and a typed roll go ahead',
                r1 === 'It is not your turn.' && r2 === '' && r3 === '' && r4 === '' && r5 === 'It is not your turn.' && r6 === '' && r7 === '' && R.log.events.length === 2 && R.log.events[0] === 'Bram tried Hit out of turn.' && R.log.events[1] === 'Bram tried Swing out of turn.' && R.log.toast.length === 1, j([r1, r2, r3, r4, r5, r6, r7, R.log]));
            const W = world('warn', 0), w1 = W.bar(W.camp, W.camp.chars.c_b, 'r_hit', undefined, 'Hit', {}), wSaid = j([W.log.notes, W.log.events, W.log.toast]); W.warn(W.camp, W.camp.chars.c_b, 'r_hit', undefined, 'Hit', {}); W.warn(W.camp, W.camp.chars.c_a, 'r_hit', undefined, 'Hit', {}); W.warn(W.camp, W.camp.chars.c_b, 'r_any', undefined, 'Spot', {}); const RW = world('refuse', 0); RW.warn(RW.camp, RW.camp.chars.c_b, 'r_hit', undefined, 'Hit', {}); const H = world('refuse', 0, true), h1 = H.bar(H.camp, H.camp.chars.c_b, 'r_hit', undefined, 'Hit', {}), N = world('', 0), n1 = N.bar(N.camp, N.camp.chars.c_b, 'r_hit', undefined, 'Hit', {});
            check('1.6.0 Off a character\'s turn: under Warn the bar lets a chosen roll by and says nothing (found live: the GM was told of a roll another rule then refused), and offTurnWarn, asked once nothing refused it, gives its player a word and tells the GM, on their own turn or for a roll ticked Any time nothing, under Refuse nothing; a row holding its turn may act, which is a held action\'s way through; a system that names none holds nothing back and says nothing',
                w1 === '' && wSaid === j([[], [], []]) && RW.log.events.length === 0 && RW.log.notes.length === 0 && j(W.log.notes) === j(['It is not your turn. The GM is told.']) && j(W.log.events) === j(['Bram used Hit out of turn.']) && h1 === '' && H.log.events.length === 0 && n1 === '' && N.log.events.length === 0, j([w1, W.log, h1, n1]));
            check('1.6.0 Off a character\'s turn, the wiring: a player\'s roll is judged before it is rolled, an answer to an attempt passing, a player\'s action before it moves anything; a warning is said after what it costs, the last thing that may refuse it, in both; and the GM\'s own roll says so once nothing refused it', /if \(chQ && !q\.att && typeof offTurnBar === 'function'\) \{ var offQ = offTurnBar\(/.test(src) && src.indexOf('var offQ = offTurnBar(') < src.indexOf('var resQ = Fq.evaluate(q.expr') && src.indexOf('var offA = typeof offTurnBar') < src.indexOf('var resA = Sa.applyAct(') && src.indexOf('var costQ = actSpend(') < src.indexOf('offTurnWarn(campQ,') && src.indexOf('offTurnWarn(campQ,') < src.indexOf("var recQ = { type: 'roll'") && src.indexOf('var costA = typeof actSpend') < src.indexOf('offTurnWarn(campA,') && src.indexOf('offTurnWarn(campA,') < src.indexOf('saveRemoteSoon();', src.indexOf('offTurnWarn(campA,')) && src.indexOf('var moR = hvR') < src.indexOf('net.offTurnSay(chR,') && src.indexOf('net.offTurnSay(chR,') < src.indexOf("var rec = { type: 'roll', id: D.uid()"));
        }
        {   // 1.6.0 a running fight kept in the save (the owner, by prompt: "Yes, save it (Recommended)"), the fightsave slice run for real on a page of plain objects
            const fsA = src.indexOf('// [netcheck:fightsave-start]'), fsB = src.indexOf('// [netcheck:fightsave-end]'), fsS = src.slice(fsA, fsB);
            const CCf = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'calendarcore.js')).href), bodyA = src.indexOf('function cleanFightBody(k, mapId) {'), bodyS = src.slice(bodyA, src.indexOf('}\n// [netcheck', bodyA) >= 0 && src.indexOf('}\n// [netcheck', bodyA) < bodyA + 6000 ? src.indexOf('}\n// [netcheck', bodyA) + 2 : src.indexOf('    return f;\n}', bodyA) + 15);
            const ctP = require('./checkkit').part('netfight.js'), ctA = ctP.indexOf('function cleanTargets(raw) {'), cleanT = new Function(ctP.slice(ctA, ctP.indexOf('\n}\n', ctA) + 3) + '\nreturn cleanTargets;')();   // cleanTargets stands in netfight.js, a part of net.js
            const mkW = (camp, role) => {
                const log = { saves: 0, toasts: [], events: [], turns: [], marks: [], bank: [], sent: 0 }, w = { wpStepLog: () => {}, setTimeout: null };
                const net = { role: role || 'host', stream: false, combats: {}, fightOn: null, targets: {} };
                const fightIds = () => Object.keys(net.combats), own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
                const api = new Function('net', 'window', 'getActiveCampaign', 'saveRemoteSoon', 'own', 'fightIds', 'FIGHT_ID', 'timeCore', 'toast', 'logEvent', 'mapTitleOf', 'marksStart', 'fxCombatEdge', 'broadcastCombats', 'combatRefresh', 'turnStarted', 'setTimeout', 'clearTimeout', 'cleanTargets', 'broadcastTargets',
                    'var _fightN = 0;\n' + bodyS + '\n' + fsS + '\nreturn { keep: fightsKeep, soon: fightsKeepSoon, read: fightsRead, back: fightsBack, hold: typeof fightsHold === \'function\' ? fightsHold : null, n: () => _fightN };')(
                    net, w, () => camp, () => log.saves++, own, fightIds, /^f_[a-z0-9]{8}$/, () => CCf, s => log.toasts.push(s), (a, s) => log.events.push(s), id => camp.items[id].meta.title, id => log.marks.push(id), (m, f, k) => log.bank.push(k), () => log.sent++, () => {}, (m, f) => log.turns.push(f.id), (fn) => { log.timer = fn; return 1; }, () => {}, cleanT, () => { log.tgSent = (log.tgSent || 0) + 1; });
                return { log, net, api, w };
            };
            const campF = () => ({ items: { m1: { meta: { title: 'Harbor' }, whiteboard: [{ id: 't1' }, { id: 't2' }] }, m2: { meta: { title: 'Gone soon' }, whiteboard: [] } } });
            const fight = (o) => Object.assign({ id: 'f_aaaaaaa1', mapId: 'm1', round: 3, turn: 1, n: 2, rows: [{ id: 'r1', tokId: 't1', name: 'Ava', init: 12 }, { id: 'r2', tokId: 't2', name: 'Raider', init: 9 }], rh: 3, th: { r1: 1, r2: 1 }, turned: { c_a: 3 }, fxEnded: { c_a: 2 }, eh: 3, et: { r1: 1 }, rr: 3, ps: ['r1'], pp: [['r1', 'r2']], at: { s: 120, ms: 0 } }, o || {});
            const a = campF(), A = mkW(a); A.net.combats.f_aaaaaaa1 = fight(); A.net.fightOn = 'f_aaaaaaa1'; const k1 = A.api.keep(), held = JSON.parse(JSON.stringify(a.fights)), k2 = A.api.keep();
            A.net.combats = {}; const k3 = A.api.keep(), gone = 'fights' in a;
            const cli = campF(), B = mkW(cli, 'client'); B.net.combats.f_aaaaaaa1 = fight(); B.api.keep(); const sn = mkW(campF()); sn.net.stream = true; sn.net.combats.f_aaaaaaa1 = fight(); const snK = sn.api.keep();
            check('1.6.0 a running fight kept (fightsKeep): on the host alone, never on a player\'s app or in the stream window, whole with the fight played and how far it has gone; nothing written where nothing changed; let go with the last fight',
                k1 === true && j(held) === j({ on: 'f_aaaaaaa1', list: { f_aaaaaaa1: fight() } }) && k2 === false && k3 === true && gone === false && !('fights' in cli) && snK === false && A.log.saves === 2, j([k1, k2, k3, gone, A.log.saves]));
            const c = campF(); c.fights = { on: 'f_aaaaaaa1', list: { f_aaaaaaa1: fight() } }; const C = mkW(c), nB = C.api.back(), f = C.net.combats.f_aaaaaaa1, nB2 = C.api.back();
            check('1.6.0 a running fight comes back as the host\'s table opens (fightsBack): its round, its order, whose turn it is and how far it has gone, the fight played, its effects\' clocks stopped and its marks held, sent to the table, the turn on hand given its move and actions through turnStarted, said once, and never a second time',
                nB === 1 && nB2 === 0 && f.round === 3 && f.turn === 1 && f.rows.length === 2 && f.rh === 3 && f.th.r2 === 1 && f.turned.c_a === 3 && f.fxEnded.c_a === 2 && f.eh === 3 && f.et.r1 === 1 && f.rr === 3 && j(f.ps) === j(['r1']) && j(f.pp) === j([['r1', 'r2']]) && C.net.fightOn === 'f_aaaaaaa1' && C.api.n() === 2
                && j(C.log.marks) === j(['m1']) && j(C.log.bank) === j(['bank']) && C.log.sent === 1 && j(C.log.turns) === j(['f_aaaaaaa1']) && j(C.log.toasts) === j(['The fight on Harbor came back at round 3.']) && j(C.log.events) === j(['The fight on Harbor came back at round 3.']), j([nB, nB2, f, C.log]));
            const d = campF(); d.fights = { on: 'f_zzzzzzz9', list: { f_aaaaaaa1: fight({ rows: [{ id: 'r1', tokId: 't_gone', name: 'Lost' }, { id: 'r2', tokId: 't2', name: 'Raider', init: 9 }, { id: 'r3', tokId: null, name: 'Custom' }], turn: 2 }), f_bbbbbbb2: fight({ id: 'f_bbbbbbb2', mapId: 'm_gone' }), f_ccccccc3: fight({ id: 'f_ccccccc3', mapId: 'm2', rows: [{ id: 'r9', tokId: 't9', name: 'Only' }], turn: 0 }), bad_id: fight({ id: 'bad_id' }), ['__proto__x']: fight() } };
            const D = mkW(d), dn = D.api.back(), df = D.net.combats.f_aaaaaaa1, hostile = D.api.read({ on: 7, list: { f_aaaaaaa1: fight({ rh: 'x', th: { __proto__: null, r1: 'no', r2: 1 }, ps: 'no', at: 'x', n: -1 }) } }, campF()).list.f_aaaaaaa1;
            const e = campF(); e.fights = { list: 'x' }; const E = mkW(e), eN = E.api.back(), eGone = 'fights' in e; const P = mkW(Object.assign(campF(), { fights: { list: { f_aaaaaaa1: fight() } } }), 'client'), pN = P.api.back();
            check('1.6.0 a running fight, read back as data (fightsRead): a fight whose map is gone, one that keeps no row on its map and an id that is none stay out, a row whose token is gone goes with the turn staying on its row, a row with no token stays, a fight played that is gone gives way to the first; what a host figure holds that is no number is left out; a save that holds nothing sound is let go; a player\'s app brings nothing back',
                dn === 1 && df.rows.map(r => r.id).join() === 'r2,r3' && df.turn === 1 && D.net.fightOn === 'f_aaaaaaa1' && !('rh' in hostile) && !('n' in hostile) && !('ps' in hostile) && !('at' in hostile) && j(Object.keys(hostile.th)) === j(['r2']) && Object.getPrototypeOf(hostile.th) === null && eN === 0 && eGone === false && pN === 0 && !P.net.combats.f_aaaaaaa1, j([dn, df, hostile, eN, eGone, pN]));
            {   // 1.6.3 (the combat review, finding 8): what a reload lost of a round under way comes back with the fight, read as data
                const r8 = { list: { f_aaaaaaa1: fight({ turn: 0, rows: [{ id: 'r1', tokId: 't1', name: 'Ava' }, { id: 'rg', tokId: 't_gone', name: 'Lost' }, { id: 'r2', tokId: 't2', name: 'Raider', hk: 1 }, { id: 'r3', tokId: null, name: 'Card' }],
                    endAt: 3, ckNext: 'r2', ckBack: [{ id: 'r1', was: 5 }, { id: 7, was: 1 }, { id: 'r2', was: 'x' }], ckUsed: { n: 2, press: 1, named: 'yes' }, mvUsed: { r1: 1.5, r2: 'x', r3: -1 }, tn: 7 }) } };
                const g8 = mkW(campF()).api.read(r8, campF()).list.f_aaaaaaa1, bad8 = mkW(campF()).api.read({ list: { f_aaaaaaa1: fight({ endAt: 'x', ckNext: 'r_none', ckBack: 'x', ckUsed: { n: 'x' }, mvUsed: 'x', tn: -2 }) } }, campF()).list.f_aaaaaaa1;
                check('1.6.3 (the combat review, finding 8): a reload keeps the round under way: where a drawn card ends the round (counted by the rows that came back before it, one whose token is gone shifting it), the row a hold puts next under a counting clock, the counts a step back gives back, what the turn on hand has spent of its count, a move taken once a round, a row whose hold took a lost action, and the turn\'s serial; each read as data, what is no sound figure left out',
                    g8.endAt === 2 && g8.ckNext === 'r2' && j(g8.ckBack) === j([{ id: 'r1', was: 5 }]) && j(g8.ckUsed) === j({ n: 2, press: 1 }) && j(g8.mvUsed) === j({ r1: 1.5 }) && Object.getPrototypeOf(g8.mvUsed) === null && g8.rows.filter(r => r.hk === 1).map(r => r.id).join() === 'r2' && g8.tn === 7
                    && ['endAt', 'ckNext', 'ckBack', 'ckUsed', 'mvUsed', 'tn'].every(k => !(k in bad8)), j([g8, bad8]));
            }
            {   // the review of combat state (2026-11-20): a fight of several turns a round may hold up to 600 rows of 12 turns each, so its order of turns comes back
                // whole up to 7200 (at the old 2000 a large such fight lost every later turn of each row after a reload), and past that bound it is no order
                const seqOf = n => Array.from({ length: n }, (_, i) => 'r' + (i % 2 + 1) + '#' + Math.floor(i / 2));
                const sq3 = mkW(campF()).api.read({ list: { f_aaaaaaa1: fight({ seq: seqOf(3000) }) } }, campF()).list.f_aaaaaaa1.seq, sqMax = mkW(campF()).api.read({ list: { f_aaaaaaa1: fight({ seq: seqOf(7200) }) } }, campF()).list.f_aaaaaaa1.seq;
                const sqOver = mkW(campF()).api.read({ list: { f_aaaaaaa1: fight({ seq: seqOf(7201) }) } }, campF()).list.f_aaaaaaa1.seq;
                const scT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8'), sevM = /sevTurns: ([0-9]+),/.exec(scT);
                check('1.6.3, the review of combat state: a fight read back keeps its order of turns up to 600 rows times the most turns a row has in a round (7200), so a large fight of several turns a round keeps every later turn of each row over a reload; past that bound it is no order',
                    Array.isArray(sq3) && sq3.length === 3000 && Array.isArray(sqMax) && sqMax.length === 7200 && sqOver === undefined && !!sevM && Number(sevM[1]) * 600 === 7200, j([sq3 && sq3.length, sqMax && sqMax.length, sqOver && sqOver.length, sevM && sevM[1]]));
            }
            {   // 1.6.3 (the combat review, finding 1; Fulllion's pick: "keep them live"): the records behind the cards in chat and what a blast still owes are kept with
                // the fight and handed back as the table opens, before its cards are judged (fightsKeep, fightsRead, fightsBack, run for real)
                const k1c = campF(), K1 = mkW(k1c); K1.net.combats.f_aaaaaaa1 = fight(); K1.net.fightOn = 'f_aaaaaaa1'; K1.net.attsKeep = () => [{ id: 'a_owe00001', charId: 'c_a', act: 'r_def', m: 2 }]; K1.w.wpBlastKeep = () => ({ owed: [{ id: 'a_blast001' }], def: [], kept: {} }); K1.api.keep();
                const keptA = JSON.parse(JSON.stringify(k1c.fights)), K2 = mkW(k1c), backs = []; K2.net.attsBack = (l, c) => { backs.push(['atts', l.length, c === k1c]); return l.length; }; K2.w.wpBlastBack = (b, c) => { backs.push(['blasts', b.owed.length, c === k1c]); return 1; }; const n2 = K2.api.back();
                const k3c = campF(), K3 = mkW(k3c); K3.net.combats.f_aaaaaaa1 = fight(); K3.net.attsKeep = () => []; K3.w.wpBlastKeep = () => null; K3.api.keep();
                check('1.6.3 (the combat review, finding 1): a running fight keeps the records behind its cards (net.attsKeep) and what a blast still owes (wpBlastKeep) beside its landings, and hands each back to its own reader as the table opens; a fight with none keeps neither key',
                    j(keptA.atts) === j([{ id: 'a_owe00001', charId: 'c_a', act: 'r_def', m: 2 }]) && j(keptA.blasts) === j({ owed: [{ id: 'a_blast001' }], def: [], kept: {} }) && n2 === 1 && j(backs) === j([['atts', 1, true], ['blasts', 1, true]]) && !('atts' in k3c.fights) && !('blasts' in k3c.fights), j([keptA, backs]));
            }
            const tgK = campF(), TK = mkW(tgK); TK.net.combats.f_aaaaaaa1 = fight(); TK.net.fightOn = 'f_aaaaaaa1'; TK.net.targets = { p_ava: { id: 't2', mapId: 'm1', name: 'Ava' }, 'tk:t2': { id: 't1', mapId: 'm1', name: 'Raider', from: 't2' }, p_gone: { id: 't_gone', mapId: 'm1', name: 'Bram' } }; TK.api.keep(); const heldT = JSON.parse(JSON.stringify(tgK.fights.targets));
            const TB = mkW(tgK), nTB = TB.api.back(); const noT = campF(), NT = mkW(noT); NT.net.combats.f_aaaaaaa1 = fight(); NT.api.keep();
            check('1.6.0 what a fight aims at comes back with it: a pointer is kept with a running fight, the player\'s and one of the GM\'s characters\' alike, and read back where its token still stands, sent to the table once; a fight with no pointer is kept key for key as it was',
                heldT.p_ava.id === 't2' && nTB === 1 && j(Object.keys(TB.net.targets).sort()) === j(['p_ava', 'tk:t2']) && TB.net.targets['tk:t2'].from === 't2' && TB.log.tgSent === 1 && !('targets' in noT.fights) && A.log.tgSent === undefined, j([heldT, TB.net.targets, TB.log.tgSent]));
            const dcC = campF(), DC = mkW(dcC); DC.net.combats.f_aaaaaaa1 = fight({ dec: { round: 3, lines: { r1: 'Charges', r2: 'Holds' }, open: 1 } }); DC.net.fightOn = 'f_aaaaaaa1'; DC.api.keep();
            const DB = mkW(dcC), nDB = DB.api.back(), dB = DB.net.combats.f_aaaaaaa1.dec;
            const dRd = (dec, extra) => mkW(campF()).api.read({ list: { f_aaaaaaa1: fight(Object.assign({ dec }, extra || {})) } }, campF()).list.f_aaaaaaa1.dec;
            const dOld = dRd({ round: 2, lines: { r1: 'x' }, open: 1 }), dShut = dRd({ round: 3, lines: {}, open: 0 }), dHost = dRd({ round: 3, lines: { r1: 'Fires\n\u0007 twice', r2: 7, r9: 'Not here', __proto__: 'no' }, open: 1 }), dLong = dRd({ round: 3, lines: { r1: 'y'.repeat(500) }, open: 1 });
            check('the viewing of 2026-11-09 (the owner, by prompt: "Save it with the fight (Recommended)"): a round\'s open declaration is kept with its fight and comes back with its lines, who is in and the round it is for; one for a round the fight has gone past and one already shown read as nothing; a line read as text with no control character, 200 at most, only for a row the fight still holds',
                nDB === 1 && !!dB && dB.open === 1 && dB.round === 3 && j(dB.lines) === j({ r1: 'Charges', r2: 'Holds' }) && Object.getPrototypeOf(dB.lines) === null && dOld === undefined && dShut === undefined && j(dHost.lines) === j({ r1: 'Fires  twice' }) && dLong.lines.r1.length === 200, j([dB, dOld, dShut, dHost, dLong && dLong.lines && dLong.lines.r1 && dLong.lines.r1.length, { back: nDB, bare: !!dB && !!dB.lines && Object.getPrototypeOf(dB.lines) === null, old: typeof dOld, shut: typeof dShut }]));   // the last part names what did not hold. This check was seen failing once (2026-11-10) with every figure before it as expected, in a run of 1637 checks; the review of 2026-11-11 found 1637 to be the whole count of the file as it stood the day before, so that run was most likely of an older file, and 60 runs under load since have not failed
            {   // 1.6.3 (the review of the combat roster, finding 3; Fulllion's ruling of 2026-11-20 that the GM may always reverse anyone's turn, and his pick that a reload keeps a
                // fight live): a counting clock's own record comes back with its fight, so the clock's Previous turn still takes a turn back after the GM's reload
                const ckF = () => fight({ ck0: { r1: 6.5, r2: 4, r_x: 'no' }, ckUsed: { n: 2, named: 1, z: 1 }, ckBack: [{ id: 'r1', was: 6.5 }, { id: 'r_gone', was: 3 }, { id: 'r2', was: 'x' }, 'junk'], ckPrevs: [{ init: { r1: 1, r2: -2 }, back: [{ id: 'r2', was: 4 }] }, 'junk'], ckStarts: [{ round: 2, init: { r1: 6.5 } }, { round: 'x', init: {} }] });
                const ckC = campF(), CK = mkW(ckC); CK.net.combats.f_aaaaaaa1 = ckF(); CK.net.combats.f_aaaaaaa1.rows[0].init = 0.5; CK.net.fightOn = 'f_aaaaaaa1'; CK.api.keep();
                const CB = mkW(ckC), nCB = CB.api.back(), fCB = CB.net.combats.f_aaaaaaa1;
                const kept = fCB ? [j(fCB.ck0), j(fCB.ckUsed), j(fCB.ckBack), j(fCB.ckPrevs), j(fCB.ckStarts)] : [];
                const ccA = src.indexOf('// [netcheck:countclock-start]'), ccB = src.indexOf('// [netcheck:countclock-end]');
                const KC = new Function('net', 'SC', 'window', 'own', 'initRulesOf', 'broadcastCombats', 'combatRefresh', src.slice(ccA, ccB) + 'return { clockStep };')({ combats: {} }, () => ({}), {}, (o, k) => Object.prototype.hasOwnProperty.call(o, k), c => c.rule, () => {}, () => {});
                const tBack = fCB ? KC.clockStep({ rule: { clock: { cost: 3 } }, items: ckC.items }, fCB, -1, { cost: 3 }) : -1;
                check('1.6.3 (the review of the combat roster, finding 3, run for real): a counting clock comes back with its fight after the GM reloads, where each row began (a fraction kept), what the turn on hand has spent, the steps a correction takes back, the cycles before and where each cycle began, each read as data (a row gone, a figure that is no number and junk left out); and Previous turn on the clock then takes the last turn back',
                    nCB === 1 && j(kept) === j([j({ r1: 6.5, r2: 4 }), j({ n: 2, named: 1 }), j([{ id: 'r1', was: 6.5 }]), j([{ init: { r1: 1, r2: -2 }, back: [{ id: 'r2', was: 4 }] }]), j([{ round: 2, init: { r1: 6.5 } }])])
                    && tBack === 0 && fCB.rows[0].init === 6.5 && fCB.ckBack.length === 0, j([nCB, kept, tBack, fCB && fCB.rows]));
            }
            {   // 1.6.2 (the click test of the campaign before 1.6.2, 2026-11-14): the GM's reload in a fight lost it. The fight came back on the GM's machine alone, asked for a keep, and the table that opened emptied net.combats before that keep ran, so the keep let the save's fight go and the table's fightsBack found none
                const hc = campF(), H = mkW(hc); H.net.combats.f_aaaaaaa1 = fight(); H.net.fightOn = 'f_aaaaaaa1'; H.api.soon(); const queued = typeof H.log.timer === 'function';
                if (H.api.hold) H.api.hold(); const heldH = !!(hc.fights && hc.fights.list && hc.fights.list.f_aaaaaaa1);
                H.net.combats = {}; H.net.fightOn = null;   // leaveSession(true), as startHosting runs it
                const kQ = queued ? H.log.timer() : null, kE = H.api.keep(), still = !!(hc.fights && hc.fights.list && hc.fights.list.f_aaaaaaa1);
                const nH = H.api.back(), backH = !!H.net.combats.f_aaaaaaa1 && H.net.combats.f_aaaaaaa1.round === 3;
                H.net.combats = {}; const kEnd = H.api.keep(), goneEnd = !('fights' in hc);
                check('1.6.2 a fight survives the GM\'s reload at a table (fightsHold): as a table opens, the fight running on the GM\'s machine goes in the save at once; the keep it had asked for, and any other, lets nothing go while net.combats is empty for the opening; the table\'s fightsBack brings it back at its round, and after that the last fight\'s end lets the save go as ever',
                    !!H.api.hold && queued && heldH && kQ === false && kE === false && still && nH === 1 && backH && kEnd === true && goneEnd,
                    j({ hold: !!H.api.hold, queued, heldH, kQ, kE, still, nH, backH, kEnd, goneEnd }));
                {   // 1.6.2 (the review of the click test's fixes): a table that never opens (offline, or the website refusing the key) gives the held fight back on this machine, or the save kept it unseen and the next fight the GM began wrote over it
                    const fc = campF(), F3 = mkW(fc); F3.net.combats.f_aaaaaaa1 = fight(); F3.net.fightOn = 'f_aaaaaaa1'; F3.api.hold(); const heldF = !!(fc.fights && fc.fights.list && fc.fights.list.f_aaaaaaa1);
                    F3.net.combats = {}; F3.net.fightOn = null;   // leaveSession(true); net.role stays 'host', and the peer's 'open' never comes
                    const nF = F3.api.back(), backF = !!F3.net.combats.f_aaaaaaa1 && F3.net.combats.f_aaaaaaa1.round === 3 && F3.net.role === 'host' && F3.net.fightOn === 'f_aaaaaaa1';
                    F3.net.combats.f_aaaaaaa1.round = 4; const kF = F3.api.keep(), keptF = !!(fc.fights && fc.fights.list && fc.fights.list.f_aaaaaaa1 && fc.fights.list.f_aaaaaaa1.round === 4);
                    F3.net.combats = {}; const kF2 = F3.api.keep(), goneF = !('fights' in fc);
                    const hpE = (() => { const a = src.indexOf("peer.on('error', function(err) {"), z = src.indexOf('// [netcheck:hostpeer-end]', a); return a > 0 && z > a ? src.slice(a, z) : ''; })();
                    check('1.6.2 a held fight comes back where hosting fails before it opens (fightsBack, run for real): held, net.combats emptied by leaveSession, the table never opening, fightsBack reads the save back on this machine with the role still the host\'s and lets the wait go, so a later keep keeps the fight as it then stands and its end lets the save go as ever; the peer\'s error handler asks it in the invalid-key branch and before it says Host error, both after the table that opened has returned',
                        heldF && nF === 1 && backF && kF === true && keptF && kF2 === true && goneF
                        && /if \(type === 'invalid-key' && !opened\) \{[^\n]*try \{ peer\.destroy\(\); \} catch \(e\) \{\} if \(typeof fightsBack === 'function'\) fightsBack\(\); setStatus\(planW\);/.test(hpE)
                        && /\n            return;\n        \}\n        if \(typeof fightsBack === 'function'\) fightsBack\(\);[^\n]*\n        if \(typeof netErrLog === 'function'\) netErrLog\('host', type\);[^\n]*\n        setStatus\(typeof hostErrWords === 'function' \? hostErrWords\(type\) : 'Host error: ' \+ type\);/.test(hpE.replace(/\r\n/g, '\n')),
                        j({ heldF, nF, backF, kF, keptF, kF2, goneF, hp: hpE.length }));
                }
                {   // 1.6.3 (the combat review, finding 1, found live): startHosting empties the store of records before it holds the fights, so the hold's keep found
                    // none and wrote the save without them, and the GM's reload ended every card all the same. What the save held stays where the keep has none
                    const hk = campF(); hk.fights = { on: 'f_aaaaaaa1', list: { f_aaaaaaa1: fight() }, atts: [{ id: 'a_owe00001', charId: 'c_a' }], blasts: { owed: [{ id: 'a_blast001' }] } };
                    const HK = mkW(hk); HK.net.combats.f_aaaaaaa1 = fight(); HK.net.fightOn = 'f_aaaaaaa1'; HK.net.attsKeep = () => []; HK.w.wpBlastKeep = () => null; HK.api.hold();
                    const hk2 = campF(); hk2.fights = { list: { f_aaaaaaa1: fight() }, atts: [{ id: 'a_old00001', charId: 'c_a' }] }; const HN = mkW(hk2); HN.net.combats.f_aaaaaaa1 = fight(); HN.net.attsKeep = () => [{ id: 'a_new00001', charId: 'c_a' }]; HN.api.hold();
                    check('1.6.3 (the combat review, finding 1): holding the fights as a table opens keeps what the save held of the records behind the cards and of the blasts where the store has none now; a store that holds its own keeps its own',
                        j(hk.fights.atts) === j([{ id: 'a_owe00001', charId: 'c_a' }]) && j(hk.fights.blasts) === j({ owed: [{ id: 'a_blast001' }] }) && j(hk2.fights.atts) === j([{ id: 'a_new00001', charId: 'c_a' }]), j([hk.fights, hk2.fights]));
                }
                check('1.6.2 the wiring of fightsHold: startHosting holds the fights before its leaveSession(true) empties them',
                    /if \(typeof fightsHold === 'function'\) fightsHold\(\);[^\n]*\n    leaveSession\(true\);\n    defaultStageMode/.test(src), '');
            }
            check('1.6.0 what a fight aims at, the wiring: a change of the pointers is kept with the fight as they are sent',/function broadcastTargets\(\) \{\s+var camp = getActiveCampaign\(\);\s+if \(typeof fightsKeepSoon === 'function'\) fightsKeepSoon\(\);/.test(src), '');
            {   // 1.6.0 Table Chat moves by its header (the chatdrag slice run for real on a page of plain objects)
                const cdA = src.indexOf('// [netcheck:chatdrag-start]'), cdB = src.indexOf('// [netcheck:chatdrag-end]'), hs = {}, caught = [], fired = [];
                const pC = { style: { right: '20px', bottom: '20px' }, getBoundingClientRect: () => ({ left: 300, top: 200 }), dispatchEvent: e => fired.push(e.type) }, hd = { addEventListener: (k, f) => { hs[k] = f; }, setPointerCapture: id => caught.push(id) };
                const uiC = id => id === 'chatPanel' ? pC : id === 'chatHead' ? hd : null, winC = { innerWidth: 1000, innerHeight: 700 }, on = { closest: () => null }, btn = { closest: () => ({}) };
                new Function('ui', 'window', 'Event', src.slice(cdA, cdB))(uiC, winC, function(t) { this.type = t; });
                hs.pointerdown({ target: btn, clientX: 310, clientY: 210, pointerId: 1, preventDefault() {} }); const noBtn = caught.length;
                hs.pointerdown({ target: on, clientX: 310, clientY: 210, pointerId: 2, preventDefault() {} }); hs.pointermove({ clientX: 110, clientY: 110 }); const moved = [pC.style.left, pC.style.top, pC.style.right, pC.style.bottom];
                hs.pointermove({ clientX: 5000, clientY: 5000 }); const kept = [pC.style.left, pC.style.top]; hs.pointerup({}); hs.pointermove({ clientX: 50, clientY: 50 }); const after = pC.style.left;
                check('1.6.0 Table Chat moves by its header: a press on a button of the header does not drag, the box follows the pointer from where it was held and leaves its corner, it stays on the window, the dice roller is told once, and a pointer let go moves it no more',
                    noBtn === 0 && j(caught) === j([2]) && j(moved) === j(['100px', '100px', 'auto', 'auto']) && j(kept) === j(['880px', '660px']) && j(fired) === j(['wpfloatmoved']) && after === '880px', j([moved, kept, fired, after]));
            }
            {   // 1.6.0 a card made as an NPC reaches only a player who can see it (the npcseen slice run for real)
                const nsA = src.indexOf('// [netcheck:npcseen-start]'), nsB = src.indexOf('// [netcheck:npcseen-end]'), sends = [], mkC = p => ({ open: true, peer: p, send: m => sends.push([p, m]) });
                const campN = { chars: { c_npc: { id: 'c_npc', name: 'Brannoch', npc: true }, c_pl: { id: 'c_pl', name: 'Ava', ownerId: 'p_a' } }, items: { m1: { whiteboard: [{ id: 't_n', isChar: true, charId: 'c_npc' }] }, m2: { whiteboard: [{ id: 't_h', isChar: true, charId: 'c_npc', hidden: true }] }, m3: { whiteboard: [{ id: 't_f', isChar: true, charId: 'c_npc' }] } } };
                const netN = { conns: [mkC('a'), mkC('b'), mkC('c'), mkC('d')], roster: { a: { id: 'p_a', location: 'm1' }, b: { id: 'p_b', location: 'm2' }, c: { id: 'p_c', location: 'm3' }, d: { id: 'p_d', location: 'm_none' } } };
                const fnN = new Function('net', 'own', 'fogDrop', 'getActiveCampaign', 'sendFailed', src.slice(nsA, nsB) + '\nreturn { npcShown, npcByOf, sendTableAs, historySeen };')(netN, (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), (c, m, pid) => pid === 'p_c' ? { t_f: true } : null, () => campN, () => {});
                const rec = { type: 'roll', id: 'r1', as: 'Brannoch', from: { name: 'GM' } }; fnN.sendTableAs(rec, campN.chars.c_npc);
                const asOf = p => sends.filter(s => s[0] === p).map(s => s[1].as), recP = { type: 'roll', as: 'Ava' }; sends.length = 0; fnN.sendTableAs(rec, campN.chars.c_npc); const npcAs = ['a', 'b', 'c', 'd'].map(asOf); sends.length = 0; fnN.sendTableAs(recP, campN.chars.c_pl); const plAs = ['a', 'b', 'c', 'd'].map(asOf);
                const hist = fnN.historySeen([{ roll: rec }, { roll: recP }, { text: 'hello' }]), byN = ['p_a', 'p_b', 'p_c', 'p_d', 'p_gone'].map(p => fnN.npcByOf(campN, campN.chars.c_npc, p)), byP = fnN.npcByOf(campN, campN.chars.c_pl, 'p_b');
                check('1.6.0 a card made as an NPC reaches only a player who sees one of its tokens on the map they are on (never a hidden token, one their fog drops or another map), a player\'s character reaches all, a card of theirs keeps its name, a Defend card names such an NPC only to a player who can see it, and a latecomer\'s history drops the card',
                    j(npcAs) === j([['Brannoch'], [], [], []]) && j(plAs) === j([['Ava'], ['Ava'], ['Ava'], ['Ava']]) && rec.as === 'Brannoch' && hist.length === 2 && hist[0].roll === recP && hist[1].text === 'hello' && j(byN) === j(['Brannoch', '', '', '', '']) && byP === 'Ava', j([npcAs, plAs, byN, byP]));
                sends.length = 0; const recL = { type: 'roll', id: 'r2', label: 'Beam damage', from: { name: 'GM' } }; fnN.sendTableAs(recL, campN.chars.c_pl, { ch: campN.chars.c_npc, name: 'Brannoch' }); const seenL = ['a', 'b', 'c', 'd'].map(p => sends.filter(s => s[0] === p).map(s => s[1].onName)), histL = fnN.historySeen([{ roll: Object.assign({}, recL, { onName: 'Brannoch' }) }]);
                check('1.6.0 ... a hit on someone a player cannot see tells that player nothing (the owner, 2026-11-01: "A hidden target should stay fully hidden"; moved on purpose from a card with no name): the card reaches only a player who can see them, named, the record itself stays nameless, and a latecomer\'s history holds no such card',
                    j(seenL) === '[["Brannoch"],[],[],[]]' && !('onName' in recL) && histL.length === 0, j([seenL, histL]));
                const recS = { type: 'roll', id: 'r3', label: 'Beam damage', from: { name: 'GM' } }; fnN.sendTableAs(recS, campN.chars.c_pl, { ch: campN.chars.c_npc, name: 'Brannoch' }); recS.onName = 'Brannoch';
                const histOn = ['a', 'b', 'c', 'd'].map(p => fnN.historySeen([{ roll: recS }], netN.roster[p]).length), histAs = ['a', 'b', 'c', 'd'].map(p => fnN.historySeen([{ roll: rec }], netN.roster[p]).length);
                check('1.6.2 a latecomer\'s history keeps a card that landed on someone they can see, and one made as an NPC they can see, by the very rule the table\'s copy goes by; for one who cannot see them it goes, and a card it cannot judge goes (historySeen, run for real)',
                    j(histOn) === '[1,0,0,0]' && j(histAs) === '[1,0,0,0]' && fnN.historySeen([{ roll: recS }]).length === 0, j([histOn, histAs]));
                const bbS = src.slice(src.indexOf('net.broadcastBlast = function(blast, mapId, charId, only)'), src.indexOf('// [netcheck:blast-end]')), sentB = [], connsB = [{ open: true, peer: 'a', send: m => sentB.push(['a', m.blast.by]) }, { open: true, peer: 'b', send: m => sentB.push(['b', m.blast.by]) }];
                const netB = { active: true, role: 'host', conns: connsB, roster: { a: { id: 'p_a', location: 'm1' }, b: { id: 'p_b', location: 'm1' } } };
                new Function('net', 'getActiveCampaign', 'sendFailed', 'npcShown', bbS)(netB, () => ({ id: 'k', chars: campN.chars }), () => {}, (c, ch, p) => p.id === 'p_a');
                netB.broadcastBlast({ x: 1, y: 2, ft: 9, by: 'Brannoch' }, 'm1', 'c_npc');
                check('1.6.0 a thrown blast names its thrower only to a player who can see them, and the blast itself still reaches both', j(sentB) === j([['a', 'Brannoch'], ['b', '']]), j(sentB));
                const wbB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
                check('1.6.0 a thrown blast\'s circle goes with the map\'s last fight (source): combatOver asks the board only once no fight is left on a map that still stands, the board keeps the Radius tool\'s own and one that waits on its fuse and tells the table for that map, a player\'s app takes the word for the map on screen alone, and a table taken afresh holds no circle of the table before it',
                    src.includes("if (had && !gone && !fightsOn(mapId).length && typeof window !== 'undefined' && window.wpFightBlastsGo)") && require('./checkkit').part('wbblast.js').includes('return ownCircle(b) || fz.some(function(f) { return f.b === b; });') && require('./checkkit').part('wbblast.js').includes('window.wpNet.broadcastBlastClear(mapId);') && src.includes("if (typeof msg.mapId === 'string' && amC && amC.id !== msg.mapId) return;") && require('./checkkit').part('netfog.js').includes("window.wpClearSharedBlasts();   // 1.6.0: a table taken afresh"), '');
            }
            const iA = src.indexOf('function broadcastCombats() {'), keepW = src.slice(iA, src.indexOf('\n', src.indexOf('getActiveCampaign', iA) + 40)).includes('fightsKeepSoon'), snapD = /delete camp\.fights;/.test((sa => sa.slice(sa.indexOf('function sanitizeAppState('), sa.indexOf('delete camp.sessionLog;')))(require('./checkkit').part('netfog.js')));   // sanitizeAppState stands in netfog.js
            check('1.6.0 a running fight, the wiring: every change ends in broadcastCombats, which keeps it; the session\'s end lets it go at once; the host\'s table asks for it as it opens, once; a player\'s copy of a campaign holds none of it', keepW && snapD && require('./checkkit').part('netfight.js').includes("if (typeof fightsKeep === 'function') fightsKeep();   // 1.6.0: the session's end") && (src.match(/fightsBack\(\);/g) || []).length === 4 && src.includes("if (net.role !== 'host') { net.role = 'host'; if (typeof fightsBack === 'function') try { fightsBack(); } catch (e) {} }"), j([keepW, snapD]));   // 1.6.2 (the owner: "Fight without hosting"): and once more as a GM with no table open becomes its own host, moved on purpose; and (the review of the click test's fixes) twice more where a table fails before it opens, in the invalid-key branch and at the end of the peer's error handler, moved on purpose
            {   // 1.6.2 (the owner: "Fight without hosting"): with no table open, the GM's own machine is its own host for fights (soloOk, soloHost, solo, run for real)
                const sA = src.indexOf('function soloOk() {'), sZ = src.indexOf('function broadcastCombats() {'), sSrc = sA > 0 && sZ > sA ? src.slice(sA, sZ) : '';
                const mk = (o) => { const net = { active: !!o.active, role: o.role || null, foreign: !!o.foreign }, win = { wpStream: !!o.stream, wpPopout: !!o.popout, wpCanPersistLocal: () => o.own !== false }; let back = 0;
                    new Function('net', 'window', 'fightsBack', 'webJoinOnly', sSrc)(net, win, () => { back++; }, () => !!o.web); return { net, back: () => back }; };
                const a1 = mk({}), r1 = a1.net.soloHost(), r1b = a1.net.soloHost();
                const vv = [r1, a1.net.role, a1.net.solo, a1.back(), r1b, a1.back()];
                const no = [mk({ foreign: true }), mk({ stream: true }), mk({ popout: true }), mk({ own: false }), mk({ web: true })].map(w => [w.net.soloHost(), w.net.role, w.net.solo, w.back()]);
                const atT = mk({ active: true, role: 'host' }), atC = mk({ active: true, role: 'client' });
                check('1.6.2 a fight with no table open (the owner: "Fight without hosting"; net.js soloOk, soloHost and solo, run for real): the GM\'s own machine on its own campaign becomes its own host once, bringing back the fights its campaign kept, and says it is solo; never at someone else\'s table, in the stream window or a window of its own, on a campaign it may not write or on a website that joins tables alone; at a table the role decides as ever; the roster, the strip, the GM\'s fight rows, the sheet\'s round and the Round pill ask it',
                    JSON.stringify(vv) === JSON.stringify([true, 'host', true, 1, true, 1]) && no.every(x => JSON.stringify(x) === JSON.stringify([false, null, false, 0])) && atT.net.soloHost() === true && atT.net.solo === false && atC.net.soloHost() === false
                    && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').split('n.soloHost').length >= 3 && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'pills.js'), 'utf8').includes('net.solo === true'), JSON.stringify([vv, no]));
            }
            {   // 1.6.2, found by the owner ("the option is there but im not targeting anymore"): the GM's Target rows show with no table open, so the pointers work there too
                const wbT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
                const soloG = "!(net.active ? net.role === 'host' : (typeof net.soloHost === 'function' && net.soloHost()))";
                check('1.6.2 targeting with no table open (found by the owner: the Target rows showed and set nothing): net.setTarget, setTargetAs and clearTargetOf make the GM\'s own machine its own host as a fight does (soloHost), and the GM\'s T key and menu rows judge it as the fight rows do',
                    require('./checkkit').part('netfight.js').includes("if (!net.active && !(typeof net.soloHost === 'function' && net.soloHost())) return;") && src.split(soloG).length - 1 >= 2
                    && wbT.includes("function gmCanTarget(tok) { var n = window.wpNet; return !!(tok && tok.isChar && !tok.hidden && !tok.waiting && n && (n.active ? n.role === 'host' : (n.solo === true || (typeof n.soloOk === 'function' && n.soloOk()))) && !window.wpStream); }"));
            }
            const ixF = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), ntF = [path.join(__dirname, '..', 'WHATSNEW.txt'), path.join(__dirname, '..', 'system', 'app', 'assets', 'whatsnew.txt')].map(p => fs.readFileSync(p, 'utf8'));
            check('1.6.0 a running fight kept: Help and both release notes say it', ixF.includes('<li><b>A running fight</b> is kept in the save.') && ntF.every(t => t.includes('- A running fight is kept in the save.')));
        }
        {   // found live, 2026-10-30: a table more than 15 minutes old came back under a new code, and a Refresh wiped a running fight in silence
            const goA = src.indexOf('function refreshGo() {'), goB = src.indexOf('\n}\n', goA), goS = goA >= 0 && goB > goA ? src.slice(goA, goB + 2).replace("import('./dialogs.js')", 'dlg()') : '';
            const runGo = n => { const log = []; const go = new Function('net', 'refreshNow', 'fightsKeep', 'setTimeout', goS + '\nreturn refreshGo;')(n, () => log.push('reload'), () => log.push('keep'), (fn, ms) => { log.push('wait:' + ms); fn(); }); go(); return log.join(); };
            const goPlain = runGo({ active: true, role: 'host', combats: {} }), goFight = runGo({ active: true, role: 'host', combats: { f_a: {} } }), goPlayer = runGo({ active: true, role: 'client', combats: { f_a: {} } });
            const hbG = src.slice(src.indexOf('function hbTick() {'), src.indexOf('\n// Where each player was last seen', src.indexOf('function hbTick() {')));
            const beats = (n, clock) => { const seen = []; const realNow = Date.now; Date.now = () => clock; try { new Function('net', 'setIndicator', 'lastSeen', 'HB_DEAD', 'HB_STALE', 'toast', 'renderRoster', 'sendFailed', 'broadcast', 'rememberHostCode', 'hostLastSeen', 'hostHoldUntil', hbG + '\nreturn hbTick();')(n, () => {}, {}, 20000, 8000, () => {}, () => {}, () => {}, () => {}, c2 => seen.push(c2), clock, 0); } finally { Date.now = realNow; } return seen.join(); };
            const nH = { active: true, role: 'host', code: 'abcde12345', conns: [], roster: {} }, b1 = beats(nH, 1000000), b2 = beats(nH, 1004000), b3 = beats(nH, 1300000), b4 = /if \(net\.role === 'host'\) \{\r?\n[^\n]*\r?\n\s*if \(net\.code && typeof rememberHostCode/.test(hbG);
            check('a host\'s room code stays recent while its table runs, however long, so a crash or a Refresh comes back under the same code (the heartbeat renews it, at most once in five minutes, never on a player\'s app); and a GM\'s Refresh at a running fight puts the fight in the save and then reloads, while with no fight, or for a player, it reloads at once',
                b1 === 'abcde12345' && b2 === '' && b3 === 'abcde12345' && b4 === true && goPlain === 'reload' && goFight === 'keep,wait:800,reload' && goPlayer === 'reload', j([b1, b2, b3, b4, goPlain, goFight, goPlayer]));
        }
        const leaveA = src.indexOf('net.leaveSessionConfirm = function() {'), leaveS = leaveA < 0 ? '' : src.slice(leaveA, src.indexOf('\n};\n', leaveA));
        check('1.5.5 plan-aware mode in net.js (each run for real): webJoinOnly answers yes only to an answer of true; a table\'s snapshot puts the welcome away for a join begun from it and, on a website whose plan joins tables alone, for every join, a refresh\'s among them; that website hosts no table (startHosting stops before anything of a table is begun); a refresh\'s rejoin waits for the site\'s word and there goes through the welcome\'s line, as a join begun from it does, a desktop\'s as before; leaving says the player goes back to Join a game there, and that their own campaign comes back elsewhere',
            j(wjOut) === j([true, false, false, false, false]) && j(hideOut) === j(['hide:false', 'hide:false', ':false']) && j(hostOut) === j(['stopped', 'went on'])
            && rf.webJoin === 'toast,join:ABCDEFGHJK:Kael:true' && rf.desk === 'toast,join:ABCDEFGHJK:Kael:false' && rf.noMod === rf.desk && rf.rehost === 'toast,host' && rfBefore === '' && rfLate === 'toast,join:ABCDEFGHJK:Kael:true'
            && /var byeQ = typeof webJoinOnly === 'function' && webJoinOnly\(\) \? 'Leave the session\? You go back to Join a game\. You can rejoin with the same room code\.' : 'Leave the session\? Your own campaign comes back on screen\. You can rejoin with the same room code\.';[^\n]*\n\s*d\.showConfirm\(byeQ, function\(yes\) \{/.test(leaveS),
            j([wjOut, hideOut, hostOut, rf, rfBefore, rfLate]));
        // the words at the table: no campaign of the player's own is spoken of on such a website (the snapshot branch's two statements, run for real)
        const sayA = src.indexOf("        var webJ = typeof webJoinOnly === 'function' && webJoinOnly();"), sayB = src.indexOf('\n', src.indexOf("        toast(backS ? 'Reconnected", sayA)), saySrc = sayA >= 0 && sayB > sayA ? src.slice(sayA, sayB) : '';
        const runSay = (joinOnly, retry) => { const said = []; const conn = { wpRetry: retry, wpBackSaid: false }; new Function('webJoinOnly', 'setStatus', 'toast', 'conn', saySrc)(() => joinOnly, s => said.push('status:' + s), t => said.push('toast:' + t), conn); return said; };
        check('1.5.5 plan-aware mode, the words of a join (the snapshot branch run for real): on a website whose plan joins tables alone the player is told they are at the GM\'s table and nothing of a campaign of their own; on a desktop the words are as before; a reconnect is said as before either way',
            j(runSay(true, false)) === j(['status:Connected. You are at the GM’s table.', 'toast:Campaign synced from host.']) && j(runSay(false, false)) === j(['status:Connected. You are at the GM’s table. Your own campaigns are untouched and come back when you leave the session.', 'toast:Campaign synced from host. Your own campaigns come back when you leave.'])
            && j(runSay(true, true)) === j(['status:Connected. You are at the GM’s table.', 'toast:Reconnected ✓']), j([runSay(true, false), runSay(false, false), runSay(true, true)]));
        // what a player is told on such a website when the host turns them away, ends the table or is lost, and when they leave: no step of an update
        // (the Updates part is put away there: the deploy is the update) and no campaign of their own to come back; on a desktop as before. The denied
        // and end branches run for real, and the toast statements of giveUpAndRestore and leaveSession
        const W2 = (() => { try { return new Function(wjSrc + '\nreturn typeof webOlderWords === "function" ? webOlderWords : null;')(); } catch (e) { return null; } })();
        const denW = tryBetween('// [netcheck:denied-start]', '// [netcheck:denied-end]') || '';
        const updW = (() => { const i = src.indexOf('function updateMessage(theirs, ours) {'); return i < 0 ? '' : src.slice(i, src.indexOf('\n}\n', i) + 3); })();
        const DW = ['net', 'setStatus', 'showConfirm', 'toast', 'ui', 'window', 'setTimeout', 'updateMessage', 'APP_VERSION', 'webJoinOnly', 'webOlderWords'];
        const runDenW = (joinOnly, msg) => { const h = { status: [], toasts: [], confirms: 0, failed: 0 }; const conn = { peer: 'host-x', open: true, close() {} };
            const env = { net: { role: 'client', conns: [conn], leaving: false, fromWelcome: true }, setStatus: s => h.status.push(s), showConfirm: () => h.confirms++, toast: t => h.toasts.push(t), ui: () => ({ style: {} }), window: { wpJoinFailed: () => h.failed++ }, setTimeout: () => 0,
                updateMessage: new Function(updW + '\nreturn updateMessage;')(), APP_VERSION: '1.5.5', webJoinOnly: () => joinOnly, webOlderWords: W2 };
            try { new Function('env', 'msg', 'conn', 'var ' + DW.map(n => n + ' = env.' + n).join(', ') + ';\n' + denW + '\nreturn "ran";')(env, msg, conn); } catch (e) { return 'threw: ' + e.message; }
            return h; };
        const OLDER = 'The GM’s Waypoint 1.5.6 is newer than this website’s. Try again once the website is updated.';
        const dW = [runDenW(true, { type: 'denied', update: true, v: '1.5.6', reason: 'Run this.' }), runDenW(true, { type: 'denied', update: true, v: '<b>9</b>' }), runDenW(true, { type: 'kicked' }), runDenW(true, { type: 'denied', reason: 'Not tonight.' })];
        const dD = [runDenW(false, { type: 'denied', update: true, v: '1.5.6' }), runDenW(false, { type: 'kicked' })];
        const plainW = s => typeof s === 'string' && !/[()–—;]|Settings|Update now|Waypoint_Setup|own campaign/.test(s) && s.split('. ').every(x => x.length <= 140);
        const endW = tryBetween('// [netcheck:end-start]', '// [netcheck:end-end]') || '';
        const runEndW = joinOnly => { const h = { status: [], toasts: [] }; const conn = { peer: 'h', open: true };
            try { new Function('net', 'conn', 'msg', 'diceSessionReset', 'setStatus', 'ui', 'toast', 'webJoinOnly', endW)({ role: 'client', leaving: false, conns: [conn] }, conn, { type: 'end' }, () => {}, s => h.status.push(s), () => ({ style: {} }), t => h.toasts.push(t), () => joinOnly); } catch (e) { return 'threw: ' + e.message; }
            return h.status.concat(h.toasts).join('|'); };
        const guA = src.indexOf('function giveUpAndRestore(msg) {'), guLine = guA < 0 ? '' : ((src.slice(guA, src.indexOf('\n}\n', guA)).match(/\n(    toast\([^\n]*)/) || [])[1] || '');
        const runGu = joinOnly => { const t = []; try { new Function('webJoinOnly', 'toast', 'msg', guLine)(() => joinOnly, x => t.push(x), 'Could not reconnect to the GM.'); } catch (e) { return 'threw: ' + e.message; } return t.join('|'); };
        const lvA = src.indexOf('function leaveSession(silent) {'), lvLine = lvA < 0 ? '' : ((src.slice(lvA, src.indexOf('\n}\n', lvA)).match(/\n(        toast\(wasClient \?[^\n]*)/) || [])[1] || '');
        const runLv = (joinOnly, wasClient, wasHost) => { const t = []; try { new Function('wasClient', 'wasHost', 'fightsOver', 'webJoinOnly', 'toast', lvLine)(wasClient, wasHost, 0, () => joinOnly, x => t.push(x)); } catch (e) { return 'threw: ' + e.message; } return t.join('|'); };
        const wordsW = { dW: dW.map(h => typeof h === 'string' ? h : [h.status.join(), h.toasts.join(), h.confirms, h.failed].join(' / ')), dD: dD.map(h => typeof h === 'string' ? h : [h.status.join(), h.toasts.join()].join(' / ')),
            end: [runEndW(true), runEndW(false)], gu: [runGu(true), runGu(false)], lv: [runLv(true, true, false), runLv(false, true, false), runLv(true, false, true)] };
        check('1.5.5 plan-aware mode, the words of a table that is lost (net.js run for real): on a website whose plan joins tables alone a host that turns the player away as older is said in plain words with the GM\'s version and no step of an update, the Updates part being put away there, and no toast speaks of a campaign of the player\'s own coming back, when they are turned away or removed, when the GM ends the table, when it is lost or when they leave; on a desktop every one of them is as before',
            !!W2 && W2('1.5.6') === OLDER && plainW(W2('1.5.6')) && plainW(W2(''))
            && j(wordsW.dW) === j([OLDER + ' / ' + OLDER + ' / 0 / 1', 'The GM’s Waypoint is newer than this website’s. Try again once the website is updated. / The GM’s Waypoint is newer than this website’s. Try again once the website is updated. / 0 / 1', 'Removed from the session by the GM. / Removed from the session by the GM. / 0 / 1', 'Not tonight. / Not tonight. / 0 / 1'])
            && /^Your Waypoint \(1\.5\.5\) is older than the GM's \(1\.5\.6\)\. Update Waypoint, then rejoin: open Settings/.test(wordsW.dD[0]) && / \/ Your Waypoint \(1\.5\.5\)[^/]* Restoring your own campaign\.$/.test(wordsW.dD[0]) && wordsW.dD[1] === 'Removed from the session by the GM. / Removed from the session by the GM. Restoring your own campaign.'
            && j(wordsW.end) === j(['Session ended by the GM.|The GM ended the session.', 'Session ended by the GM.|The GM ended the session. Restoring your own campaign.'])
            && j(wordsW.gu) === j(['Could not reconnect to the GM.', 'Could not reconnect to the GM. Restoring your own campaign.'])
            && j(wordsW.lv) === j(['You left the session.', 'Left the session. Restoring your own campaign.', 'Session ended for everyone. The room code is retired.']), j(wordsW));
        // the stream window is the GM's (stream.js run for real): a website's page that joins tables alone opens none and is the join page, and a stream
        // window open before the site's answer said so asks the server for nothing once it has; elsewhere as before
        const stJs = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'stream.js'), 'utf8').replace(/\r\n/g, '\n');
        const swA = stJs.indexOf('// [netcheck:streamweb-start]'), swB = stJs.indexOf('// [netcheck:streamweb-end]'), swSrc = swA >= 0 && swB > swA && stJs.indexOf('// [netcheck:streamweb-start]', swA + 1) < 0 ? stJs.slice(swA, swB) : '';
        const onLine = (stJs.match(/\nconst on = [^\n]*\n/) || [''])[0];
        const onRun = (search, Wm) => { try { return new Function('window', 'location', 'URLSearchParams', swSrc + onLine + '\nreturn on;')({ wpWebMode: Wm }, { search }, URLSearchParams); } catch (e) { return 'threw: ' + e.message; } };
        const ons = [onRun('?stream=1', undefined), onRun('?stream=1', { joinOnly: () => true }), onRun('?stream=1', { joinOnly: () => false }), onRun('', undefined), onRun('', { joinOnly: () => true }), onRun('?stream=1', { joinOnly: () => 'yes' })];
        // 1.6.3 (the multiplayer review, finding 25), moved on purpose: the tick reads the save through streamRead (its slice, with the guard that runs
        // one tick at a time) and goes on in tickRun; the fetch hands back the save's text
        const srA = stJs.indexOf('    // [videocheck:streamread-start]'), srB = stJs.indexOf('    // [videocheck:streamread-end]'), srSrc = srA >= 0 && srB > srA ? stJs.slice(srA, srB) : '';
        const tkA = stJs.indexOf('    async function tickRun() {\n'), tkB = stJs.indexOf('        var data = rd.data', tkA), tickHead = tkA >= 0 && tkB > tkA ? stJs.slice(tkA, tkB) : '';
        const tickRun = async Wm => { const asked = []; try { const tk = new Function('window', 'fetch', 'net', swSrc + srSrc + tickHead + "        return 'went on';\n    }\n    return tickRun;")({ wpWebMode: Wm }, u => { asked.push(u); return Promise.resolve({ text: () => Promise.resolve('{"campaigns":{"k":{}}}') }); }, { sanitizeAppState: d => d }); const r = await tk(); return (r || 'stopped') + ':' + asked.join(); } catch (e) { return 'threw: ' + e.message; } };
        const ticks = [await tickRun({ joinOnly: () => true }), await tickRun({ joinOnly: () => false }), await tickRun(undefined)];
        check('1.5.5 plan-aware mode, no stream window (stream.js run for real): ?stream=1 opens the GM\'s stream window on a desktop as before and none on a website whose plan joins tables alone, only an answer of true counting; a stream window opened before the site\'s answer said so asks the server for nothing at its next tick; main.js shows such a page the join page',
            !!swSrc && j(ons) === j([true, false, true, false, false, true]) && j(ticks) === j(['stopped:', 'went on:/api/data', 'went on:/api/data'])
            && /if \(\/\[\?&\]stream=1\/\.test\(location\.search\) && !wcJoinOnly\(\)\) return;/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8')), j([ons, ticks]));
    })());
}
// R2 security pass, cluster F (2026-10-01): journals, handouts and shares. The host's relayShare (sliced by its share markers, run with the real
// RateLimit and the host's own allow() on an injected clock), the player's 'handout' and 'notepad' branches and applyNotepad (the handoutmsg,
// notepadmsg and notepad slices), and the Journal's own receiving side in handouts.js (sliced by its journal markers and run on a stubbed shell:
// a fetch that keeps every upload-exact body and serves it back, a localStorage with a quota, a counting clock)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Dx = await import(url('dicecore.js'));
    const j = v => JSON.stringify(v);
    const bw = (n, file) => between('// [netcheck:' + n + '-start]', '// [netcheck:' + n + '-end]', n, typeof file === 'string' ? file : undefined);   // file: a part of net.js, read by its own name
    const hoT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'handouts.js'), 'utf8').replace(/\r\n/g, '\n');
    const hoBetween = (a, b) => { const i = hoT.indexOf(a), k = hoT.indexOf(b); if (i < 0 || k < 0 || k <= i || hoT.indexOf(a, i + 1) >= 0 || hoT.indexOf(b, k + 1) >= 0) throw new Error('netcheck: handouts.js journal markers not found once'); return hoT.slice(i + a.length, k); };
    const journalSrc = hoBetween('// [netcheck:journal-start]', '// [netcheck:journal-end]');
    const shareSrc = bw('share');

    /* ---- the host: relayShare on a table of stub connections, the real limiter on this world's clock ---- */
    const mkHost = () => {
        const w = { now: 1e6, sent: [], gmGot: [], toasts: [], logs: [], roster: Object.create(null), conns: [] };
        const L = new Function('window', 'Date', lineOf('var _lim = Object.create(null);') + '\n' + lineOf('function allow(') + '\nreturn { allow: allow, lim: _lim };')({ wpDiceCore: Dx }, { now: () => w.now });
        const env = { net: { myId: 'u_gm', roster: w.roster, conns: w.conns }, allow: L.allow, _shareBytes: Object.create(null), _shareCount: Object.create(null), getActiveCampaign: () => ({ id: 'camp1', name: 'The Camp' }), getProfile: () => ({ id: 'u_gm', name: 'Gina' }),
            toast: m => w.toasts.push(m), logEvent: (k, m) => w.logs.push(m), sendFailed: () => {}, window: { wpJournalReceive: m => w.gmGot.push(m) } };
        const names = Object.keys(env);
        w.relay = new Function(...names, "'use strict';\n" + shareSrc + '\nreturn relayShare;')(...names.map(n => env[n]));
        w.env = env;
        w.join = (peer, id, name) => { const c = { peer, open: true, send: m => { packCheck(m); w.sent.push([peer, m]); } }; w.conns.push(c); w.roster[peer] = { id, name }; return c; };
        // the close handler as it stood at 7226cb4: the connection and its roster row go, the limiters forget the peer id, and so did the share budget
        w.leave = c => { w.conns.splice(w.conns.indexOf(c), 1); delete w.roster[c.peer]; Object.keys(L.lim).forEach(k => L.lim[k].forget(c.peer)); delete env._shareBytes[c.peer]; };
        w.share = (c, msg, step) => { w.now += step === undefined ? 60000 : step; return w.relay(Object.assign({ type: 'share' }, msg), c); };
        w.to = peer => w.sent.filter(s => s[0] === peer).length;
        return w;
    };
    const textShare = (i, more) => Object.assign({ to: '*', entry: { kind: 'text', id: 'n' + i, text: 'x', title: 't' + i } }, more || {});

    // #2 (b): the budget belongs to the player, not the connection — a reconnect (a new peer id, the same profile) carries it on, and the
    // session allows a player 100 shares
    const W1 = mkHost(); const a1 = W1.join('pA', 'u_p1', 'Pat'); W1.join('pV', 'u_v', 'Vic');
    for (let i = 0; i < 60; i++) W1.share(a1, textShare(i));
    W1.leave(a1); const b1 = W1.join('pB', 'u_p1', 'Pat');
    for (let i = 60; i < 110; i++) W1.share(b1, textShare(i));
    const carried = [W1.to('pV'), W1.to('pB'), W1.to('pA')];
    const W2 = mkHost(); const a2 = W2.join('pA', 'u_p1', 'Pat'); W2.join('pV', 'u_v', 'Vic');
    for (let i = 0; i < 7; i++) W2.share(a2, textShare(i), 1000);   // six in a minute pass, the seventh is slowed
    W2.leave(a2); const b2 = W2.join('pB', 'u_p1', 'Pat'); W2.share(b2, textShare(7), 1000);   // back on a new connection within the same minute: still slowed
    const burst = W2.to('pV');
    const W3 = mkHost(); const a3 = W3.join('pA', 'u_p1', 'Pat'); W3.join('pV', 'u_v', 'Vic'); W3.join('pX', 'u_x', 'Xan');
    for (let i = 0; i < 3; i++) W3.share(a3, textShare(i, { to: 'u_x' }));
    const toOne = [W3.to('pX'), W3.to('pV'), W3.gmGot.length, W3.env._shareCount.u_p1, W3.env._shareBytes.u_p1];
    check('cluster F #2 (host): a player\'s share budget is the player\'s for the session, not the connection\'s — a reconnect under a new peer id carries the count and the burst on, 100 shares a session reach the table and the 101st reaches no one; a share to one player counts once',
        j(carried) === j([100, 0, 0]) && burst === 6 && j(toOne) === j([3, 0, 0, 3, 3]) && W1.env._shareCount.u_p1 === 100 && W1.env._shareBytes.pA === undefined && W1.env._shareBytes.pB === undefined, j([carried, burst, toOne, W1.env._shareCount]));
    // #26 (c): what a share carries beside its text or picture — the notes and the caption — counts toward the 60 MB a player may send a session
    const big = new ArrayBuffer(6 * 1024 * 1024), imgShare = (i, notes) => ({ to: '*', entry: { kind: 'image', id: 'p' + i, mime: 'image/png', data: big, title: 'pic', notes: notes || '', caption: '' } });
    const W4 = mkHost(); const a4 = W4.join('pA', 'u_p1', 'Pat'); W4.join('pV', 'u_v', 'Vic');
    for (let i = 0; i < 11; i++) W4.share(a4, imgShare(i));
    const W5 = mkHost(); const a5 = W5.join('pA', 'u_p1', 'Pat'); W5.join('pV', 'u_v', 'Vic');
    const notes = 'n'.repeat(20000); for (let i = 0; i < 11; i++) W5.share(a5, imgShare(i, notes));
    const W6 = mkHost(); const a6 = W6.join('pA', 'u_p1', 'Pat'); W6.join('pV', 'u_v', 'Vic');
    W6.share(a6, { to: '*', entry: { kind: 'text', id: 'c', text: '', notes: 'n'.repeat(20000), caption: 'c'.repeat(4000), title: 't' } });
    check('cluster F #26 (host): a player\'s 60 MB a session counts the notes and the caption of a share with its picture or text — ten 6 MB pictures pass and the eleventh is dropped, with 20,000 characters of notes on each only nine pass; a share with no text spends its notes and caption',
        W4.to('pV') === 10 && W5.to('pV') === 9 && W6.env._shareBytes.u_p1 === 24000, j([W4.to('pV'), W5.to('pV'), W6.env._shareBytes.u_p1]));
    // #30 (host): the id a share lands under names its sender without ambiguity — the sender part encodes every character outside [A-Za-z0-9],
    // a long id is hashed behind a marker no encoded id can hold, the entry part keeps no '_', and '__' stands between them once
    const W7 = mkHost(); const cBob = W7.join('pB', 'u_abc12345', 'Bob'), cMal = W7.join('pM', 'u_.abc12345', 'Mal'), cMel = W7.join('pL', 'u', 'Mel'), cLong = W7.join('pG', 'u_' + 'x'.repeat(70), 'Gus'), cCol = W7.join('pC', 'u:abc12345', 'Col');
    W7.share(cBob, { to: 'gm', entry: { kind: 'text', id: 'e1', text: 'Bob text', title: 'Bob' } }); W7.share(cMal, { to: 'gm', entry: { kind: 'text', id: 'e1', text: 'Mal text', title: 'Mal' } });
    W7.share(cMel, { to: 'gm', entry: { kind: 'text', id: 'abc12345_e1', text: 'Mel text', title: 'Mel' } }); W7.share(cLong, { to: 'gm', entry: { kind: 'text', id: 'e1', text: 'Gus text', title: 'Gus' } }); W7.share(cCol, { to: 'gm', entry: { kind: 'text', id: 'e1', text: 'Col text', title: 'Col' } });
    W7.share(cBob, { to: 'gm', entry: { kind: 'text', id: 'sh_u_abc12345_e1', text: 'again', title: 'Bob' } });   // a share of a share: its id holds the old separator and survives distinct
    const ids = W7.gmGot.map(m => m.id), senders = ids.map(id => id.slice(3, id.lastIndexOf('__')));
    check('cluster F #30 (host): the ids of shares from \'u_abc12345\', \'u_.abc12345\', \'u\' (sharing \'abc12345_e1\'), \'u:abc12345\' and an 80-character id are five different ids, each at most 60 characters of [A-Za-z0-9_-], the sender and the entry parted by one \'__\'; a long id\'s part begins with \'--\' and no encoded part holds it; the sender\'s exact id travels as sharedById',
        new Set(ids).size === ids.length && ids.length === 6 && ids.every(id => id.length <= 60 && /^sh_[A-Za-z0-9-]+__[A-Za-z0-9-]*$/.test(id) && id.split('__').length === 2) && ids[0] === 'sh_u-5fabc12345__e1' && ids[1] === 'sh_u-5f-2eabc12345__e1' && ids[2] === 'sh_u__abc12345e1'
        && senders[3].indexOf('--') === 0 && senders.slice(0, 3).concat(senders.slice(4)).every(s => s.indexOf('--') < 0) && W7.gmGot[1].sharedById === 'u_.abc12345' && W7.gmGot[4].sharedById === 'u:abc12345', j([ids, W7.gmGot.map(m => m.sharedById)]));
    check('cluster F #2 (source): the close handler no longer forgets a peer\'s share budget; a new table forgets every player\'s; the limiter and the budget are keyed by the sender\'s profile id',
        !/delete _shareBytes\[conn\.peer\]/.test(src) && /_shareBytes = Object\.create\(null\); _shareCount = Object\.create\(null\);/.test(src) && /allow\('share', \{ perMs: 1000, burst: 6, windowMs: 60000, table: 300 \}, kS\)/.test(shareSrc) && /var kS = String\(sp\.id\);/.test(shareSrc));

    /* ---- the player: the 'handout' and 'notepad' branches and applyNotepad ---- */
    const hmSrc = bw('handoutmsg'), nmSrc = bw('notepadmsg'), npSrc = bw('notepad');
    const hear = (netO, msg, peer) => { const got = []; new Function('net', 'conn', 'msg', 'state', 'window', "'use strict';\n" + hmSrc)(Object.assign({ foreign: true, syncedPeer: 'room-a', stream: false, gmId: 'gmA' }, netO), { peer: peer || 'room-a' }, msg, { appState: { activeCampaignId: 'c1' } }, { wpJournalReceive: m => got.push(m) }); return got; };
    const hMsg = { type: 'handout', campId: 'c1', gmId: 'gmA', id: 'h1', kind: 'text', text: 'x' };
    const hGot = [hear({ foreign: false, syncedPeer: null, gmId: '' }, hMsg), hear({}, hMsg, 'room-b'), hear({ stream: true }, hMsg), hear({ gmId: '' }, hMsg), hear({}, Object.assign({}, hMsg, { gmId: 'gmB' })), hear({}, Object.assign({}, hMsg, { campId: 'c2' })), hear({}, Object.assign({}, hMsg, { campId: 7 })), hear({}, hMsg)];
    check('cluster F #10 / #29 (player): a handout is taken from the synced host only, after its snapshot, never in the stream window, and only for the table played — the campaign on screen and the GM the snapshot named; one before the snapshot, from another peer, with no GM known, or naming another GM or campaign writes nothing into the Journal',
        j(hGot.slice(0, 7).map(g => g.length)) === j([0, 0, 0, 0, 0, 0, 0]) && hGot[7].length === 1 && hGot[7][0].gmId === 'gmA' && hGot[7][0].campId === 'c1', j(hGot.map(g => g.length)));
    const hearNote = (netO, peer) => { const got = []; new Function('net', 'conn', 'msg', 'applyNotepad', "'use strict';\n" + nmSrc)(Object.assign({ foreign: true, syncedPeer: 'room-a', stream: false }, netO), { peer: peer || 'room-a' }, { type: 'notepad', on: true, text: 'hi' }, m => got.push(m)); return got.length; };
    const noteGot = [hearNote({ foreign: false, syncedPeer: null }), hearNote({}, 'room-b'), hearNote({ stream: true }), hearNote({})];
    const npNet = { notepad: { on: false, text: '' }, gmId: 'gmA' }, npToasts = [];
    new Function('net', 'state', 'toast', 'renderNotepad', 'm', "'use strict';\n" + npSrc + '\napplyNotepad(m);')(npNet, { appState: { activeCampaignId: 'c1' } }, t => npToasts.push(t), () => {}, { on: true, text: 'the notes', campId: 'otherCamp', gmId: 'otherGM', campaign: 'Renamed', gm: 'Mallory' });
    check('cluster F #29 (player): the table notepad is heard from the synced host only, after the snapshot and never in the stream window, and what it keeps for "save to Journal" is the table played — the campaign on screen and the GM the snapshot named, whatever the message says — so the saved page is filed under the real table; the player\'s Journal keys the page by it',
        j(noteGot) === j([0, 0, 0, 1]) && npNet.notepad.on === true && npNet.notepad.text === 'the notes' && npNet.notepad.campId === 'c1' && npNet.notepad.gmId === 'gmA' && npNet.notepad.campaign === 'Renamed' && npNet.notepad.gm === 'Mallory' && npToasts.length === 1
        && /var meta = net\.role === 'host' \? notepadMsg\(\) : net\.notepad;/.test(src) && /else key = journalKey\(meta \|\| \{\}\) \|\| 'personal';/.test(hoT) && /\} else if \(msg\.type === 'handout' && net\.role === 'client'\) \{\n\s*\/\/ \[netcheck:handoutmsg-start\]/.test(src) && (src.match(/msg\.type === 'handout'/g) || []).length === 1, j([noteGot, npNet.notepad]));

    // item 35, fold 3a: the pad's look on a player's app (applyNotepad, run for real with lookcore): cleaned here again, for the text as kept, by the
    // rule of the pad. And how the pad is wired, pinned
    pendingChecks.push((async () => {
        const LKn = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'lookcore.js')).href), PAD = LKn.RULES.PAD, TP = 'Meet at dusk', sigP = LKn.textSig(TP);
        const apply = (m, win, was) => { const n = { notepad: was || { on: false, text: '' }, gmId: 'gmA' }, args = ['net', 'state', 'toast', 'renderNotepad', 'm'].concat(win === undefined ? [] : ['window']);
            new Function(...args, "'use strict';\n" + npSrc + '\napplyNotepad(m);')(n, { appState: { activeCampaignId: 'c1' } }, () => {}, () => {}, m, win); return n.notepad; };
        const W = { wpLook: LKn }, base = { on: true, text: TP, campaign: 'C', gm: 'G' }, withL = look => Object.assign({}, base, { look }), KEYS6 = ['on', 'text', 'campId', 'gmId', 'campaign', 'gm'];
        const goodP = LKn.makeRec({ spans: [{ s: 0, e: 4, b: true, size: 'large' }] }, 'Cinzel', TP, PAD), LONGP = 'q'.repeat(20010);
        const got = { good: apply(withL(goodP), W), none: apply(base, W), linked: apply(withL({ fmt: { spans: [{ s: 0, e: 4, b: true, link: 'https://a.example/' }] }, sig: sigP }), W), fonted: apply(withL({ fmt: { i: true }, font: 'Comic Sans MS', sig: sigP }), W),
            stale: apply(withL(LKn.makeRec({ b: true }, '', 'Other words', PAD)), W), hostile: apply(withL({ fmt: { spans: [{ s: 0, e: 4, link: 'javascript:alert(1)', color: 'red', onclick: 'x' }] }, font: 'X"; y', sig: sigP, junk: 1 }), W), bytes: apply(withL(new Uint8Array(4)), W), word: apply(withL('bold'), W),
            off: apply(Object.assign({}, withL(goodP), { on: false }), W, { on: true, text: 'was open' }), cut: apply({ on: true, text: LONGP, look: { fmt: { b: true }, sig: LKn.textSig(LONGP) } }, W), noCore: apply(withL(goodP), {}), noWindow: apply(withL(goodP)), noRules: apply(withL(goodP), { wpLook: { cleanRec: () => ({ evil: 1 }) } }) };
        const keys = k => j(Object.keys(got[k])), look = k => ('look' in got[k] ? j(got[k].look) : null);
        const ixN = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8');
        check('item 35, fold 3a, the pad on a player\'s app (net.js applyNotepad, run for real with lookcore): the look the GM gave the pad is kept only as the cleaner gives it for the text as kept, by the rule of the pad: a link is dropped and the rest of the look stays, a font of the host\'s own computer is dropped, a look made for other words, a hostile record, bytes and a word are no look, a pad that is put away keeps none, and a look made for a text longer than is kept is none; a message with no look, and an app without lookcore, keep exactly the keys the pad always had; the pad is wired as the fold says: the pad\'s listeners are added once through padWire, Save hands the look on, Clear takes the words and what styled them, Put away and a session\'s end reset the look, the pad\'s drag has the bar placed again, the page holds a plain box for it, and there is still no host branch for a notepad message',
            keys('good') === j(KEYS6.concat('look')) && look('good') === j(goodP) && keys('none') === j(KEYS6) && look('linked') === j({ fmt: { spans: [{ s: 0, e: 4, b: true }] }, sig: sigP }) && look('fonted') === j({ fmt: { i: true }, sig: sigP })
            && ['stale', 'hostile', 'bytes', 'word', 'off', 'cut', 'noCore', 'noWindow', 'noRules'].every(k => keys(k) === j(KEYS6)) && got.off.on === false && got.cut.text.length === 20000
            && src.includes("    if (!ta) return;\n    padWire(ta, p);\n    if (close) close.addEventListener('click', function() { net.notepadToggle(); });") && src.split('padWire(').length === 3 && src.split('function padKey(').length === 2 && src.split("addEventListener('keydown', padKey)").length === 2
            && /window\.wpJournalAddNote\(meta, 'Table notes, ' \+ new Date\(\)\.toLocaleDateString\(\), text, meta && meta\.look\);/.test(src) && src.includes("            net.notepad.text = ''; _pad.fmt = undefined;") && src.split("if (typeof padReset === 'function') padReset();").length === 4
            && src.includes("    if (typeof text === 'string') net.notepad.text = text.slice(0, 20000);\n") && src.includes("if (window.wpTextBox && typeof window.wpTextBox.place === 'function') window.wpTextBox.place(); });")
            && ixN.includes('<div id="notepadText" class="field"></div>') && !/<textarea[^>]*id="notepadText"/.test(ixN) && (src.match(/msg\.type === 'notepad'/g) || []).length === 1 && /msg\.type === 'notepad' && net\.role === 'client'/.test(src) && !/ta\.value/.test(src.slice(src.indexOf('// [netcheck:padbox-end]'), src.indexOf('/* ---------- combat / turn order ----------'))),
            j([Object.keys(got).map(k => [k, keys(k), look(k)])]));
    })());

    // the thirteenth review, seen live: the pad's own questions are answered by keys the document hears, and the focus rests on the button that
    // raised them, so Enter answered Yes and pressed the button again (Put away then opened a new pad at once). The button gives the focus up first
    {
        const ntI = src.indexOf('net.notepadToggle = function() {'), ntSrc = ntI < 0 ? '' : src.slice(ntI, src.indexOf('\n};\n', ntI) + 4);
        const toggle = (active, inPanel) => { const log = [], panel = { contains: x => inPanel && x === btn }, btn = { blur() { log.push('blur'); } }, netT = { role: 'host', notepad: { on: true, text: 'words' } };
            new Function('net', 'ui', 'window', 'document', 'showConfirm', 'broadcast', 'notepadMsg', 'renderNotepad', 'toast', 'logEvent', 'setTimeout', 'padReset', "'use strict';\n" + ntSrc + '\nnet.notepadToggle();')(
                netT, id => (id === 'notepadPanel' ? panel : null), {}, { activeElement: active ? btn : null }, (q, cb) => { log.push('ask'); cb(true); }, () => log.push('send'), () => ({}), () => {}, () => {}, () => {}, () => {}, () => log.push('reset'));
            return [log.join(), netT.notepad.on]; };
        const noDoc = (() => { const log = [], netT = { role: 'host', notepad: { on: true, text: '' } }; new Function('net', 'ui', 'window', 'showConfirm', 'broadcast', 'notepadMsg', 'renderNotepad', 'toast', 'logEvent', 'setTimeout', "'use strict';\n" + ntSrc + '\nnet.notepadToggle();')(netT, () => ({}), {}, (q, cb) => { log.push('ask'); cb(false); }, () => {}, () => ({}), () => {}, () => {}, () => {}, () => {}); return [log.join(), netT.notepad.on]; })();
        // the fourteenth review: Clear's own handler run for real, sliced from the pad's wiring
        const clA = src.indexOf("    if (clearB) clearB.addEventListener('click', function() {\n        if (net.role !== 'host' || !net.notepad.on) return;"), clZ = clA < 0 ? -1 : src.indexOf("    if (minB) minB.addEventListener('click'", clA), clSrc = clZ < 0 ? '' : src.slice(clA, clZ);
        const clearRun = (text, yes, role) => { const log = [], padS = { fmt: { b: true }, font: 'Lora' }, netC = { role: role || 'host', notepad: { on: true, text } }; let handler = () => { log.push('no handler'); };
            const clearB = { addEventListener: (ev, fn) => { if (ev === 'click') handler = fn; }, blur() { log.push('blur'); } };
            new Function('net', 'clearB', 'toast', 'showConfirm', 'clearTimeout', 'notepadTimer', '_pad', 'broadcast', 'notepadMsg', 'renderNotepad', 'logEvent', "'use strict';\n" + clSrc)(netC, clearB, t => log.push('toast:' + t), (q, cb) => { log.push('ask'); cb(yes); }, () => {}, 0, padS, () => log.push('send'), () => ({}), () => log.push('draw'), () => {});
            handler(); return [log.join(), netC.notepad.text, padS.fmt !== undefined, padS.font]; };
        const cleared = [clearRun('words', true), clearRun('words', false), clearRun('  ', true), clearRun('words', true, 'client')];
        check('item 35, the thirteenth review, the pad\'s own questions (net.js notepadToggle, run for real): a button of the pad that has the focus gives it up before Put away is asked, so the Enter that answers the question presses nothing again; a focus outside the pad is left where it is; with no page at hand the question is asked as before; Clear\'s own handler, run for real, gives the focus up and asks, clears the words and what styled them on a yes and keeps the pad\'s font, changes nothing on a no, says an empty pad is empty without asking, and does nothing on a player\'s app',
            j(toggle(true, true)) === j(['blur,ask,reset,send', false]) && j(toggle(true, false)) === j(['ask,reset,send', false]) && j(toggle(false, true)) === j(['ask,reset,send', false]) && j(noDoc) === j(['ask', true])
            && clSrc.length > 300 && j(cleared) === j([['blur,ask,send,draw,toast:Notepad cleared.', '', false, 'Lora'], ['blur,ask', 'words', true, 'Lora'], ['toast:The notepad is already empty.', '  ', true, 'Lora'], ['', 'words', true, 'Lora']]),
            j([toggle(true, true), toggle(true, false), toggle(false, true), noDoc, cleared]));
    }

    /* ---- the Journal's receiving side, run for real on a stubbed shell ---- */
    const mkJournal = (o) => {
        o = o || {};
        const files = new Map(), ls = new Map(), quota = o.quota || Infinity;
        const used = () => { let n = 0; ls.forEach((v, k) => { n += k.length + v.length; }); return n; };
        const localStorage = { getItem: k => ls.has(k) ? ls.get(k) : null, setItem: (k, v) => { v = String(v); if (used() - (ls.has(k) ? k.length + ls.get(k).length : 0) + k.length + v.length > quota) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; } ls.set(k, v); }, removeItem: k => { ls.delete(k); }, get length() { return ls.size; }, key: i => Array.from(ls.keys())[i] };
        const fetch = async (u, init) => {
            u = String(u);
            if (u.indexOf('/api/upload-exact?path=') === 0) { if (o.uploadFails) return { ok: false, status: 500 }; files.set(decodeURIComponent(u.slice('/api/upload-exact?path='.length)), init.body); return { ok: true }; }
            if (u === '/api/list-images') return o.listed ? { ok: true, json: async () => o.listed } : { ok: false, status: 404, json: async () => { throw new Error('no list'); } };
            if (u === '/api/delete-image') { const b = JSON.parse(init.body); w.deleted.push(b); const p = String(b.path).replace(/^\/saves\//, ''); if (!files.has(p)) return { ok: false, status: 404 }; files.delete(p); return { ok: true, status: 200 }; }
            if (u.indexOf('/saves/images/journal/') === 0) { const p = 'images/journal/' + u.slice('/saves/images/journal/'.length); if (!files.has(p)) return { ok: false, status: 404 }; const b = files.get(p); return { ok: true, headers: { get: h => (h === 'content-length' ? String(o.indexLen && o.indexLen[p] !== undefined ? o.indexLen[p] : String(b).length) : null) }, json: async () => JSON.parse(String(b)) }; }
            return { ok: false, status: 404 };
        };
        const w = { files, ls, localStorage, used, toasts: [], deleted: [], shown: [], now: 1700000000000, o };
        const env = { fetch, localStorage, document: { getElementById: () => null }, toast: m => w.toasts.push(m), esc: s => String(s), showHandout: h => { w.shown.push(h); }, handoutPopup: () => o.popup === true, window: o.window || {}, FileReader: function() {}, Blob: function() {}, Date: { now: () => (w.now += 7) } };
        const names = Object.keys(env);
        w.api = new Function(...names, "'use strict';\n" + journalSrc + '\nreturn { receive: receiveHandout, readIndex: readIndex, stampHead: stampHead, registerJournal: registerJournal, budget: handoutBudget, dropEntryFiles: typeof dropEntryFiles === "function" ? dropEntryFiles : null };')(...names.map(n => env[n]));
        w.idx = key => w.api.readIndex(key);
        return w;
    };
    const gmMsg = (id, text, more) => Object.assign({ type: 'handout', campId: 'camp1', gmId: 'u_gm', campaign: 'The Camp', gm: 'Gina', id, kind: 'text', title: 'T ' + id, caption: '', text, tags: [] }, more || {});
    const shMsg = (id, text, who, whoId, more) => gmMsg(id, text, Object.assign({ sharedBy: who, sharedById: whoId, sharedNotes: '' }, more || {}));
    // 1.5.5: the Journal saves one file at a time (found live at a player's join: two saves of one journal file in the same moment, the second
    // answered 500, as two moves onto one file collide on Windows, and only the next save wrote it whole). The Journal's receiving side, run for
    // real on a shell of the suite's own whose save of a file stays under way a few milliseconds and answers 500 to a second save of that path
    // while one is under way, as the core did; a save of another path runs beside it
    pendingChecks.push((async () => {
        const mkSlow = () => {
            const files = new Map(), busy = new Map(), log = [], ls = new Map();
            const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); } };
            const fetch = (u, init) => {
                u = String(u);
                if (u.indexOf('/api/upload-exact?path=') === 0) {
                    const p = decodeURIComponent(u.slice('/api/upload-exact?path='.length)); log.push('start ' + p);
                    if (busy.has(p)) { log.push('500 ' + p); return Promise.resolve({ ok: false, status: 500 }); }
                    busy.set(p, 1);
                    return new Promise(res => setTimeout(() => { busy.delete(p); files.set(p, init.body); log.push('end ' + p); res({ ok: true, status: 200 }); }, 4));
                }
                if (u.indexOf('/saves/images/journal/') === 0) { const p = 'images/journal/' + u.slice('/saves/images/journal/'.length); if (!files.has(p)) return Promise.resolve({ ok: false, status: 404 }); const b = files.get(p); return Promise.resolve({ ok: true, headers: { get: () => String(String(b).length) }, json: async () => JSON.parse(String(b)) }); }
                return Promise.resolve({ ok: false, status: 404 });
            };
            const env = { fetch, localStorage, document: { getElementById: () => null }, toast: () => {}, esc: s => String(s), showHandout: () => {}, handoutPopup: () => false, window: {}, FileReader: function() {}, Blob: function() {}, Date: { now: () => 1700000000000 } };
            const names = Object.keys(env);
            const api = new Function(...names, "'use strict';\n" + journalSrc + '\nreturn { writeIndex: writeIndex, readIndex: readIndex, withIndex: withIndex, registerJournal: registerJournal, readRegistry: readRegistry };')(...names.map(n => env[n]));
            return { api, files, log, ls };
        };
        // two saves of one journal's index at once: both go through, one after the other, and the file holds the newer
        const A = mkSlow(), okA = await Promise.all([A.api.writeIndex('camp1__gm', { campId: 'camp1__gm', entries: [{ id: 'older' }] }), A.api.writeIndex('camp1__gm', { campId: 'camp1__gm', entries: [{ id: 'newer' }] })]);
        const readA = await A.api.readIndex('camp1__gm'), pA = 'images/journal/camp1__gm/journal.json';
        // a save of another journal's index runs beside them
        const B = mkSlow(); await Promise.all([B.api.writeIndex('camp1__gm', { entries: [{ id: 'a' }] }), B.api.writeIndex('camp2__gm', { entries: [{ id: 'b' }] })]);
        // two journals registered at once: the registry is read, added to and written in turn, so it keeps both
        const C = mkSlow(); await Promise.all([C.api.registerJournal('camp1__gm'), C.api.registerJournal('camp2__gm'), C.api.registerJournal('camp3__gm')]);
        const regC = JSON.parse(String(C.files.get('images/journal/journals.json') || '{}')).keys || [];
        // two changes of one index under two spellings of its key (safeId makes them one file): read, changed and written in turn, so neither is lost
        const D = mkSlow(); await Promise.all([D.api.withIndex('camp1__gm', idx => { idx.entries.push({ id: 'one' }); }), D.api.withIndex('camp1__gm!', idx => { idx.entries.push({ id: 'two' }); })]);
        const readD = await D.api.readIndex('camp1__gm');
        const order = log => { const s = log.filter(x => x.indexOf('journal.json') > 0 || x.indexOf('journals.json') > 0); return s.join(' | '); };
        check('1.5.5 the Journal saves one file at a time (handouts.js, its journal slice run for real on a shell of the suite\'s own that answers 500 to a second save of a path while one is under way, as the core did on Windows): two saves of one journal\'s index at once both go through, the second starting only once the first has ended, so the file holds the newer and nothing falls back to the browser\'s storage; a save of another journal\'s index runs beside them; three journals registered at once are all kept in the registry; two changes of one index under two spellings of its key are read, changed and written in turn, so neither is lost',
            j(okA) === j([true, true]) && !A.log.some(x => x.indexOf('500 ') === 0) && j(readA.entries) === j([{ id: 'newer' }]) && A.ls.size === 0
            && order(A.log) === 'start ' + pA + ' | end ' + pA + ' | start ' + pA + ' | end ' + pA
            && B.log[0] === 'start images/journal/camp1__gm/journal.json' && B.log[1] === 'start images/journal/camp2__gm/journal.json' && !B.log.some(x => x.indexOf('500 ') === 0)
            && j(regC.slice().sort()) === j(['camp1__gm', 'camp2__gm', 'camp3__gm']) && !C.log.some(x => x.indexOf('500 ') === 0)
            && j(readD.entries.map(e => e.id).sort()) === j(['one', 'two']) && !D.log.some(x => x.indexOf('500 ') === 0)
            && hoT.includes("function saveFile(rel, init) { return inTurn(rel, function() { return fetch('/api/upload-exact?path=' + encodeURIComponent(rel), init); }); }") && hoT.split("fetch('/api/upload-exact").length === 3,
            j([okA, A.log, readA.entries, A.ls.size, B.log, regC, C.log, readD.entries]));
    })());
    // item 35, fold 2b: a shared note's look. On the host (relayShare, run for real with lookcore): by its shape alone until the text is cut,
    // counted with the words it styles, cleaned for the text as relayed. In the reader's Journal (receiveTextHandout, run for real): cleaned again
    pendingChecks.push((async () => {
        const LKb = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'lookcore.js')).href), NOTE = LKb.RULES.NOTE, T = 'Shared words here';
        const good = LKb.makeRec({ spans: [{ s: 0, e: 6, b: true, link: 'https://a.example/' }] }, 'Lora', T, NOTE), stale = LKb.makeRec({ b: true }, '', 'Other words', NOTE), LONG = 'y'.repeat(60010), forLong = { fmt: { spans: [{ s: 0, e: 3, b: true }] }, sig: LKb.textSig(LONG) }, fonted = { fmt: { b: true }, font: 'Comic Sans MS', sig: LKb.textSig(T) };
        const KEYS = ['type', 'campId', 'gmId', 'campaign', 'gm', 'id', 'title', 'caption', 'sharedBy', 'sharedById', 'sharedNotes', 'tags', 'kind', 'text'];
        const relay = (look, o) => { o = o || {}; const w = mkHost(); if (!o.noCore) w.env.window.wpLook = LKb; const a = w.join('pA', 'u_a', 'Ann'); w.join('pB', 'u_b', 'Bo');
            const entry = Object.assign({ kind: 'text', id: 'n1', text: T, title: 'A note' }, look === undefined ? {} : { look }, o.entry || {}), msg = { type: 'share', to: o.to || '*', entry };
            if (o.gm) w.relay(msg, null, { id: 'u_gm', name: 'Gina' }); else { w.now += 60000; w.relay(msg, a); }
            const m = o.to === 'gm' ? w.gmGot[0] : (w.sent.find(s => s[0] === 'pB') || [])[1];
            return [m ? (m.kind === 'text' ? j(Object.keys(m)) === j(KEYS.concat('look' in m ? ['look'] : [])) : 'image') : 'none', m && 'look' in m ? j(m.look) : null, w.env._shareBytes.u_a || 0]; };
        const W = r => LKb.lookWeight(r), host = { styled: relay(good), plain: relay(undefined), stale: relay(stale), font: relay(fonted), typed: relay(new Uint8Array(8)), word: relay('x'), nul: relay(null), junk: relay(Object.assign({}, good, { junk: 1 })),
            cut: relay(forLong, { entry: { text: LONG } }), image: relay(good, { entry: { kind: 'image', data: new Uint8Array(4), mime: 'image/png' } }), gm: relay(good, { gm: true }), toGm: relay(good, { to: 'gm' }), noCore: relay(good, { noCore: true }) };
        const hostWant = { styled: [true, j(good), T.length + W(good)], plain: [true, null, T.length], stale: [true, null, T.length], font: [true, j({ fmt: { b: true }, sig: LKb.textSig(T) }), T.length + W({ fmt: { b: true }, sig: LKb.textSig(T) })], typed: [true, null, T.length], word: [true, null, T.length], nul: [true, null, T.length], junk: [true, null, T.length],
            cut: [true, null, LONG.length], image: ['image', null, 4], gm: [true, j(good), 0], toGm: [true, j(good), T.length + W(good)], noCore: [true, null, T.length] };
        // the reader: whatever the host says it cleaned, the look is cleaned here again for the text as kept
        const rcv = async (msgs, o) => { const J2 = mkJournal(Object.assign({ window: { wpLook: LKb }, popup: true }, o || {})); for (const m of msgs) await J2.api.receive(m); const idx = await J2.idx('camp1__u_gm'); return [idx.entries.map(e => [e.id, e.kind, e.kind === 'text' ? e.text : '', 'look' in e ? j(e.look) : null]), J2.shown.map(h => ('look' in h ? j(h.look) : null))]; };
        const hostile = { fmt: { spans: [{ s: 0, e: 6, link: 'javascript:alert(1)', color: 'red', onclick: 'x' }] }, font: 'Comic Sans MS"; x', sig: LKb.textSig(T) };
        const reader = { styled: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: good })]), plain: await rcv([shMsg('sh1', T, 'Pat', 'u_p1')]), hostile: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: hostile })]), stale: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: stale })]),
            font: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: fonted })]), fromGm: await rcv([gmMsg('h1', T, { look: good })]), replaced: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: good }), shMsg('sh1', 'New words', 'Pat', 'u_p1')]),
            relooked: await rcv([shMsg('sh1', T, 'Pat', 'u_p1'), shMsg('sh1', T, 'Pat', 'u_p1', { look: good })]), image: await rcv([Object.assign(gmMsg('p1', ''), { kind: 'image', data: new Uint8Array(4), mime: 'image/png', look: good })]),
            noCore: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: good })], { window: {} }), typed: await rcv([shMsg('sh1', T, 'Pat', 'u_p1', { look: new Uint8Array(8) })]) };
        // the twelfth review: a look is weighed AS CLEANED, on the host and on the reader. A cleaned record can be many times the one that arrived
        // (each part of one link holds the address), and the cleaned one is what is relayed and kept
        const BIG = 'z'.repeat(60000), LINKB = 'https://a.example/' + 'p'.repeat(1982), heavy = { fmt: { spans: [{ s: 0, e: 59999, link: LINKB }].concat(Array.from({ length: 300 }, (_, i) => ({ s: 2 * i, e: 2 * i + 1, b: true }))) }, sig: LKb.textSig(BIG) };
        const heavyClean = LKb.cleanRec(heavy, BIG, NOTE), grew = [LKb.recShapeOk(heavy), W(heavyClean) > 10 * W(heavy), W(heavyClean) >= j(heavyClean).length];
        const heavyHost = relay(heavy, { entry: { text: BIG } }), CAP = 100 * 1024 * 1024;
        const bud = (msg, first) => { const J3 = mkJournal({ window: { wpLook: LKb } }); if (first) J3.api.budget(first); return J3.api.budget(Object.assign({ kind: 'text' }, msg)); };
        const fill = n => ({ kind: 'image', data: { byteLength: CAP - n }, sharedBy: 'Pat' }), page = (text, look, more) => Object.assign({ text, sharedBy: 'Pat' }, look === undefined ? {} : { look }, more || {}), X = 'x'.repeat(60010);
        const readerBud = [bud(page(BIG, heavy), fill(BIG.length + W(heavy) + 10)), bud(page(BIG, heavy), fill(BIG.length + W(heavyClean))), bud(page(BIG, heavy), fill(BIG.length + W(heavyClean) - 1)),
            bud(page(T, stale), fill(T.length + 10)), bud({ look: good, sharedBy: 'Pat' }, fill(10)), bud(page(T, good), fill(T.length + 10)), bud(page(X, forLong), fill(60000)), bud(page(T, good), fill(T.length + W(good))), bud(page(T, good), fill(T.length + W(good) - 1)),
            bud(page([BIG], heavy), fill(BIG.length + W(heavyClean))), bud(page([BIG], heavy), fill(BIG.length + W(heavyClean) - 1)), bud({ kind: 'image', data: { byteLength: 10 }, text: T, look: good, sharedBy: 'Pat' }, fill(10)),
            bud(page([BIG]), fill(BIG.length)), bud(page([BIG]), fill(BIG.length - 1)), bud(page(BIG, undefined, { data: { byteLength: 1 } }), fill(BIG.length)), bud(page(BIG, undefined, { data: { byteLength: 1 } }), fill(BIG.length - 1)), bud(page(X), fill(60000)), bud(page(X), fill(59999))];
        check('item 35, the twelfth review, a look weighed as cleaned (net.js relayShare and handouts.js handoutBudget, run for real with lookcore): one long address under three hundred small parts is a record of the right shape that grows more than tenfold when cleaned, and its weight is never less than the characters JSON gives it; the host relays the cleaned look and charges the sender for exactly that weight with the words; the reader counts a page\'s look as cleaned for the text as kept: the look as it arrived would have fitted the budget and the cleaned one does not, to the very byte; a look that cleans to nothing, one with no text beside it and one made for a text longer than is kept cost nothing, and a small look with its link and its font costs its own weight to the byte; a text page is weighed as the reader will read it, whatever shape its text came in, its words and its look alike, and a picture weighs no look; a text page that also carries bytes is charged its words and never the bytes, and a text longer than is kept is charged what is kept',
            j(grew) === j([true, true, true]) && j(heavyHost) === j([true, j(heavyClean), BIG.length + W(heavyClean)]) && j(readerBud) === j([false, true, false, true, true, false, true, true, false, true, false, true, true, false, true, false, true, false]), [grew, heavyHost.map(x => String(x).length), readerBud]);
        const E = (id, text, look) => [[[id, 'text', text, look === undefined ? null : j(look)]], [look === undefined ? null : j(look)]];
        const hoB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'handouts.js'), 'utf8').replace(/\r\n/g, '\n');
        check('item 35, fold 2b, a shared note\'s look (net.js relayShare and handouts.js receiveTextHandout, each run for real with lookcore): the host relays a styled note with exactly the keys an unstyled one has and its look after them, cleaned for the text as relayed by the rule of a note; an unstyled share has the keys it always had; a look made for other words, or for a text the relay cut, is dropped and the share delivered; a font of the sender\'s own computer is dropped and the rest of the look kept; a look that is no record (bytes, a word, nothing, a record with an unknown key) is no look, and the share is neither refused nor charged for it; a look counts with the words it styles in the sender\'s budget by its weight AS CLEANED, which is what is relayed, so one that cleans to nothing costs nothing and a font that is dropped is not paid for; a picture carries none; the GM\'s own share and a share to the GM carry it; a host with no lookcore relays the words alone; the reader cleans the look again for the text as kept, so a hostile host\'s look (a script address, a color word, a handler, a font with a quote) leaves a plain page and bytes leave none; a page replaced in place loses its old look, and the same words sent again with a look gain it; the picture\'s own path names no look; the page shown at once carries the look the index does; without lookcore the page is stored and shown plain; the sender names the look only for a note of its own, and the three ways a page is written each set or drop it',
            j(host) === j(hostWant)
            && j(reader.styled) === j(E('sh1', T, good)) && j(reader.plain) === j(E('sh1', T)) && j(reader.hostile) === j(E('sh1', T)) && j(reader.stale) === j(E('sh1', T)) && j(reader.font) === j(E('sh1', T, { fmt: { b: true }, sig: LKb.textSig(T) })) && j(reader.fromGm) === j(E('h1', T, good))
            && j(reader.replaced[0]) === j([['sh1', 'text', 'New words', null]]) && j(reader.replaced[1]) === j([j(good), null]) && j(reader.relooked[0]) === j([['sh1', 'text', T, j(good)]])
            && (() => { const a = hoB.indexOf('async function receiveHandout(msg) {'), z = hoB.indexOf('async function receiveTextHandout('); return a > 0 && z > a && hoB.slice(a, z).indexOf('look') < 0; })() && j(reader.noCore) === j(E('sh1', T)) && j(reader.typed) === j(E('sh1', T))
            && hoB.includes("    if (e.kind === 'note' && e.look && typeof e.look === 'object') entry.look = e.look;") && hoB.split('if (look) existing.look = look; else delete existing.look;').length === 3 && hoB.includes("        if (look) en.look = look;\n        stampShared(en, msg);")
            && hoB.includes("if (Lb && tB !== null && Lb.recShapeOk(msg.look)) { var lkB = Lb.cleanRec(msg.look, tB, Lb.RULES.NOTE); if (lkB) n += Lb.lookWeight(lkB); }") && hoB.includes("+ 1024 + (look ? Lr.lookWeight(look) : 0))) { journalFull(); return; }") && hoB.includes("en && en.look && typeof en.look === 'object' ? { look: en.look } : {})); });")
            && /\n    var LKs = typeof window !== 'undefined' && window\.wpLook && typeof window\.wpLook\.recShapeOk === 'function' \? window\.wpLook : null, lkS = LKs && en\.kind !== 'image' && LKs\.recShapeOk\(en\.look\) \? en\.look : null;\n    var lkO = null, lookOut = function\(\) \{ if \(lkO === null\) \{ lkO = \(lkS && LKs\.cleanRec\(lkS, String\(en\.text \|\| ''\)\.slice\(0, 60000\), LKs\.RULES\.NOTE\)\) \|\| undefined; if \(lkO && typeof unkeepLinks === 'function'\) lkO = unkeepLinks\(lkO\); \} return lkO; \};[^\n]*\n    if \(conn\) \{/.test(shareSrc)   /* the review of pages reveal (finding 2) moved this pin on purpose: a link or a mention of a block kept back from players keeps only its page, before the look is weighed, so what is charged is still what is relayed */
            && /if \(!allow\('share', [^\n]*\) return;\n[^\n]*\n[^\n]*\n        var lkW = lookOut\(\); if \(lkW\) szS \+= LKs\.lookWeight\(lkW\);/.test(shareSrc) && shareSrc.split('lookOut()').length === 3 && shareSrc.split('lookWeight(').length === 2,
            j([host, reader]));
    })());

    // links (1.5.0): nothing new on the wire or on disk. A handout's text, a caption and a share travel and are stored as the plain text they are —
    // a web address in them is drawn as a link only where the text is read (handouts.js showHandout through linkgate.js); the viewer is only told who a page came from
    {
        const ADDR = 'Meet at https://a.example/x?y=1&z=2 (see https://b.example/wiki/A_(b)). <a href="https://c.example/">c</a> javascript:alert(1)\nhttps://аррӏе.example/', CAPL = 'cap https://cap.example/.';
        const WL = mkHost(), plL = WL.join('pA', 'u_p1', 'Pat'); WL.join('pV', 'u_v', 'Vic');
        WL.share(plL, { to: '*', entry: { kind: 'text', id: 'n1', title: 'T https://t.example/', caption: CAPL, text: ADDR, notes: 'mine https://n.example/', tags: ['a'] } });
        WL.share(plL, { to: 'gm', entry: { kind: 'text', id: 'n2', title: 'T2', caption: '', text: ADDR, notes: '', tags: [] } });
        const toVic = (WL.sent.find(s => s[0] === 'pV') || [])[1] || {}, toGm = WL.gmGot[0] || {}, KEYS = 'campId,campaign,caption,gm,gmId,id,kind,sharedBy,sharedById,sharedNotes,tags,text,title,type';
        check('links (the wire): a player\'s share whose text, caption and notes hold web addresses is relayed by the host exactly as before — the same fields and no other, each the plain text that was typed (no markup, no link, nothing cut out); to another player and to the GM alike',
            Object.keys(toVic).sort().join() === KEYS && toVic.text === ADDR && toVic.caption === CAPL && toVic.sharedNotes === 'mine https://n.example/' && toVic.title === 'T https://t.example/' && toVic.kind === 'text'
            && Object.keys(toGm).sort().join() === KEYS && toGm.text === ADDR && j(Object.keys(toVic).map(k => typeof toVic[k]).sort()) === j(Object.keys(toGm).map(k => typeof toGm[k]).sort()), j([Object.keys(toVic).sort().join(), toVic.text === ADDR]));
        const JL = mkJournal({ popup: true });
        await JL.api.receive(gmMsg('h1', ADDR, { caption: CAPL }));
        await JL.api.receive(shMsg('sh1', ADDR, 'Pat', 'u_p1', { caption: CAPL, sharedNotes: 'mine https://n.example/' }));
        await JL.api.receive(shMsg('sh2', ADDR, 'Gina', 'u_gm'));
        await JL.api.receive(shMsg('sh3', ADDR, 'x'.repeat(99), 'u_long'));
        const ixL = await JL.idx('camp1__u_gm'), eG = ixL.entries.find(e => e.id === 'h1') || {}, eS = ixL.entries.find(e => e.id === 'sh1') || {}, onDisk = String(JL.files.get('images/journal/camp1__u_gm/journal.json') || '');
        check('links (the Journal\'s store): a received handout and a received share are stored as before — the same keys and no other, the text, the caption and the sender\'s notes each the plain text that came; the index on disk holds no link, no href and no markup of the app\'s',
            eG.text === ADDR && eG.caption === CAPL && Object.keys(eG).sort().join() === 'caption,id,kind,notes,receivedAt,tags,text,title' && eS.text === ADDR && eS.caption === CAPL && eS.sharedNotes === 'mine https://n.example/' && Object.keys(eS).sort().join() === 'caption,id,kind,notes,receivedAt,sharedBy,sharedById,sharedNotes,tags,text,title'
            && onDisk.length > 400 && !/target=|rel=|noopener|"href"|"link"/.test(onDisk) && (onDisk.match(/<a /g) || []).length === 4, j([Object.keys(eG).sort().join(), Object.keys(eS).sort().join()]));
        check('links (who a received page came from): the viewer is told with each page that arrives — a handout from the GM and a page the GM shared are the GM\'s, a player\'s share is that player\'s by the name the Journal shows (cut to 60) — and is handed the text and the caption as the plain text they are',
            JL.shown.length === 4 && j(JL.shown.map(h => h.from)) === j([{ gm: true }, { who: 'Pat' }, { gm: true }, { who: 'x'.repeat(60) }]) && JL.shown.every(h => h.text === ADDR && h.fresh === true) && JL.shown[0].caption === CAPL, j(JL.shown.map(h => h.from)));
        // 1.6.3 (the release click test): handouts shown while a player was away come back one after another as they rejoin, and each popped up
        // over the last, so most flashed past unseen. A replay the Journal did not hold is saved as before and never opened; once the replays
        // stop coming, one notice says how many came; a handout shown live still opens (the journal slice, run for real)
        const JR = mkJournal({ popup: true });
        for (const k of ['r1', 'r2', 'r3']) await JR.api.receive(gmMsg(k, 'words ' + k, { replay: true }));
        await JR.api.receive(gmMsg('r1', 'words r1', { replay: true }));   // one it already holds: refreshed quietly, as before
        const shownEarly = JR.shown.length, toastsEarly = JR.toasts.slice();
        await new Promise(r => setTimeout(r, 1700));
        const JR1 = mkJournal({ popup: true }); await JR1.api.receive(gmMsg('o1', 'only', { replay: true })); await new Promise(r => setTimeout(r, 1700));
        await JR.api.receive(gmMsg('j1', 'for joiners', { join: true })); await new Promise(r => setTimeout(r, 1700));
        await JR.api.receive(gmMsg('live', 'shown now'));
        const ixR = await JR.idx('camp1__u_gm');
        check('1.6.3 (the release click test): handouts sent as a player joins (those missed while away, and those the host marks join) are saved to the Journal and never popped up one over another; one notice says how many came once they stop coming, one of them by its title; a handout shown during play still opens',
            shownEarly === 0 && toastsEarly.length === 0 && JR.toasts.length === 2 && JR.toasts[0] === '3 handouts came as you joined. They are in your Journal.' && JR.toasts[1] === '"T j1" came as you joined. It is in your Journal.'
            && JR1.toasts.length === 1 && JR1.toasts[0] === '"T o1" came as you joined. It is in your Journal.' && JR1.shown.length === 0
            && JR.shown.length === 1 && JR.shown[0].title === 'T live' && ['r1', 'r2', 'r3', 'j1', 'live'].every(id => ixR.entries.some(e => e.id === id)) && src.includes('net.revealHandout(h.id, [prof.id], { join: true });'), j([shownEarly, toastsEarly, JR.toasts, JR1.toasts, JR.shown.map(h => h.title)]));
        const hoL = hoBetween('// [netcheck:journal-start]', '// [netcheck:journal-end]'), hoWhole = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'handouts.js'), 'utf8').replace(/\r\n/g, '\n'), netWhole = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
        check('links (pinned): what a GM\'s text handout sends is its text and nothing else; nothing in the wire code or in the Journal\'s receiving and storing code knows about links — they are made only where a text is drawn to be read',
            /if \(h\.kind === 'text'\) return Promise\.resolve\(\{ kind: 'text', text: String\(h\.text \|\| ''\)\.slice\(0, 60000\) \}\);/.test(hoWhole) && !/linkParts|fillLinked|linkgate|typedLink/.test(netWhole) && !/linkParts|fillLinked|<a /.test(hoL)
            && /if \(e\.kind === 'note'\) entry = \{ id: e\.id, kind: 'text', title: e\.title \|\| 'A note', caption: '', text: e\.text \|\| '', notes: '', tags: e\.tags \|\| \[\] \};/.test(hoWhole));
    }

    // #2 (a): a player's shares never spend what the GM's handouts live on
    const JB = mkJournal();
    for (let i = 0; i < 1001; i++) await JB.api.receive(shMsg('sh_mal__n' + i, 'junk', 'Mallory', 'u_mal'));
    await JB.api.receive(gmMsg('h1', 'the real clue'));
    const ixB = await JB.idx('camp1__u_gm'), shB = ixB.entries.filter(e => e.sharedBy).length, gmB = ixB.entries.filter(e => !e.sharedBy).map(e => e.id);
    check('cluster F #2 (journal): the pages other players share have a budget of their own — 200 a run — so a thousand of them leave the GM\'s own handouts untouched: the GM\'s page still lands, the toast names the players\' shares and never blames the GM',
        shB === 200 && j(gmB) === j(['h1']) && JB.toasts.some(t => /Players are sharing more than this session can hold/.test(t)) && !JB.toasts.some(t => /The GM is sending more handouts/.test(t)), j([shB, gmB, JB.toasts.filter(t => /hold/.test(t)).slice(0, 2)]));
    const JG = mkJournal(); let gmOk = 0; for (let i = 0; i < 1001; i++) if (JG.api.budget({ kind: 'text', text: 'x' })) gmOk++;
    const shAfter = JG.api.budget({ kind: 'text', text: 'x', sharedBy: 'Mal' });
    check('cluster F #2 (journal): the GM\'s own budget stands as it was — 1000 handouts a run — and a share is still taken once it is spent', gmOk === 1000 && shAfter === true && JG.toasts.filter(t => /The GM is sending/.test(t)).length === 1, j([gmOk, shAfter]));

    // #29: a journal keeps the GM and campaign names it was given; a message naming another GM does not relabel it
    const JS = mkJournal(); await JS.api.receive(Object.assign(gmMsg('h1', 'Real clue'), { campId: 'campA', gmId: 'alice1', gm: 'Alice', campaign: 'Alice camp' }));
    const ixS = await JS.idx('campA__alice1'); JS.api.stampHead(ixS, { gm: 'Mallory', gmId: 'gmB', campaign: 'Bob renamed' }); const relabel = [ixS.gm, ixS.gmId, ixS.campaign];
    JS.api.stampHead(ixS, { gm: 'Alice R.', gmId: 'alice1', campaign: 'Alice camp II' }); const renamed = [ixS.gm, ixS.gmId, ixS.campaign];
    const ixN = { gm: '', gmId: '', campaign: '', entries: [] }; JS.api.stampHead(ixN, { gm: 'Alice', gmId: 'alice1', campaign: 'Alice camp' });
    check('cluster F #29 (journal): a journal\'s GM id is set once; its GM and campaign names follow only a message from that GM (an honest GM still renames their campaign), never one naming another GM; a new journal takes its names',
        j(relabel) === j(['Alice', 'alice1', 'Alice camp']) && j(renamed) === j(['Alice R.', 'alice1', 'Alice camp II']) && j([ixN.gm, ixN.gmId, ixN.campaign]) === j(['Alice', 'alice1', 'Alice camp']), j([relabel, renamed]));

    // #30 (journal): a share replaces an entry in place only when it comes from the same sender; another sender's share under the same id is a page of its own
    const JC = mkJournal(), sid = 'sh_u_abc12345_e1';
    await JC.api.receive(shMsg(sid, 'Bob text', 'Bob', 'u_abc12345')); await JC.api.receive(shMsg(sid, 'Mal text', 'Mal', 'u_.abc12345')); await JC.api.receive(shMsg(sid, 'Mel text', 'Mel', 'u'));
    await JC.api.receive(shMsg(sid, 'Bob v2', 'Bob', 'u_abc12345'));
    const ixC = await JC.idx('camp1__u_gm'), bob = ixC.entries.find(e => e.id === sid), others = ixC.entries.filter(e => e.id !== sid);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]), png2 = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 9, 9, 9]), pid = 'sh_u_abc12345_p1';   // a PNG's whole signature, then bytes that tell the two apart
    await JC.api.receive(shMsg(pid, undefined, 'Bob', 'u_abc12345', { kind: undefined, mime: 'image/png', data: png })); await JC.api.receive(shMsg(pid, undefined, 'Mal', 'u_.abc12345', { kind: undefined, mime: 'image/png', data: png2 }));
    const ixP = await JC.idx('camp1__u_gm'), bobPic = ixP.entries.find(e => e.id === pid), malPic = ixP.entries.find(e => e.sharedBy === 'Mal' && e.mime);
    const bobFile = JC.files.get('images/journal/camp1__u_gm/' + pid + '.png');
    check('cluster F #30 (journal): Bob\'s shared page keeps his text, his name and his exact id when another sender shares under the same entry id — their pages land as entries of their own with their exact sender ids (a \'.\' kept) — while Bob\'s own re-share still replaces his page in place; his picture file is never overwritten by another sender\'s',
        ixC.entries.length === 3 && bob && bob.text === 'Bob v2' && bob.sharedBy === 'Bob' && bob.sharedById === 'u_abc12345' && others.length === 2 && j(others.map(e => [e.sharedBy, e.sharedById, e.text]).sort()) === j([['Mal', 'u_.abc12345', 'Mal text'], ['Mel', 'u', 'Mel text']]) && new Set(ixC.entries.map(e => e.id)).size === 3
        && bobPic && bobPic.sharedBy === 'Bob' && bobFile && bobFile[8] === 1 && malPic && malPic.id !== pid && JC.files.get('images/journal/camp1__u_gm/' + malPic.id + '.png')[8] === 9, j([ixC.entries.map(e => [e.id, e.sharedBy, e.text]), bobPic && bobPic.hash, malPic && malPic.id]));

    // The owed review, 2026-10-09 (backlog 138). (c) A page the player wrote themselves has no sender, so it read as the GM's, and a host that sent
    // a handout under the note's id replaced the player's own words with it. A named sender with no id that reads matched the GM's pages and
    // every other such sender's the same way. (d) A note's save waits half a second, and a redraw of the Journal inside that wait drew the older
    // words, which the next key saved over the new. (i) The notepad's box followed the GM only while it had no focus, on a player's app too
    {
        const JN = mkJournal(), nPath = 'images/journal/camp1__u_gm/journal.json'; await JN.api.receive(gmMsg('h0', 'first')); await JN.api.receive(gmMsg('h0', 'second'));   // the GM's own page, sent again: replaced in place, as ever
        const jxN = JSON.parse(String(JN.files.get(nPath))); jxN.entries.push({ id: 'nabc123xyz', kind: 'note', title: 'My secret plan', text: 'my own words, hours of them', receivedAt: 5, notes: '' }); JN.files.set(nPath, JSON.stringify(jxN));
        await JN.api.receive(gmMsg('nabc123xyz', 'replaced by the host', { title: 'x' }));                         // a handout under the note's own id
        await JN.api.receive(shMsg('nabc123xyz', 'a share under it', 'Pat', 'u_p1'));                              // and a share
        await JN.api.receive(shMsg('q1', 'nameless one', 'Jo', '')); await JN.api.receive(shMsg('q1', 'nameless two', 'Jo', 'bad id!')); await JN.api.receive(shMsg('q1', 'nameless three', 'Jo', undefined));   // a named sender with no id that reads
        await JN.api.receive(gmMsg('q1', 'the GM under that id'));
        await JN.api.receive(gmMsg('g9', 'the GM first')); await JN.api.receive(shMsg('g9', 'a share over the GM', 'Jo', ''));   // and such a share under the id of a page of the GM's
        const ixN2 = await JN.idx('camp1__u_gm'), notesN = ixN2.entries.filter(e => e.kind === 'note'), byText = t => ixN2.entries.filter(e => e.text === t), nameless = ixN2.entries.filter(e => /^nameless/.test(e.text || ''));
        // (d) the waiting saves, handouts.js sliced by its notesave markers and run on timers of the test's own
        const nsSrc = hoBetween('// [netcheck:notesave-start]', '// [netcheck:notesave-end]'), timers = [], cleared = [], ran = [];
        const NS = new Function('setTimeout', 'clearTimeout', "'use strict';\n" + nsSrc + '\nreturn { later: noteLater, flush: flushNotes, waiting: function() { return Object.keys(noteTimers); } };')((fn, ms) => { timers.push({ fn, ms }); return timers.length; }, id => { cleared.push(id); });
        const run = (name, how) => () => { ran.push(name); if (how === 'throw') throw new Error('x'); return how === 'reject' ? Promise.reject(new Error('y')) : new Promise(r => setImmediate(() => { ran.push(name + ' written'); r(); })); };
        NS.later('a', run('a1')); NS.later('a', run('a2')); NS.later('b', run('b1')); const ns1 = [NS.waiting().slice(), timers.map(t => t.ms), cleared.slice()];   // a second key for the same note takes the first save's place
        const flushed = NS.flush(), ns2 = [ran.slice(), NS.waiting().slice(), cleared.slice()]; await flushed; const ns3 = ran.slice();                              // a redraw: every waiting save runs at once, and is waited for
        timers.forEach((t, i) => { if (cleared.indexOf(i + 1) < 0) t.fn(); }); const ns4 = ran.slice();                                                                                                     // the timers that were cleared would run nothing new
        NS.later('c', run('c1')); timers[timers.length - 1].fn(); const ns5 = [ran.slice(-1)[0], NS.waiting().slice()]; await new Promise(r => setImmediate(r));  // a save whose time has come runs and waits no longer
        NS.later('x', run('x1')); NS.later('y', run('y1')); NS.later('x', run('x2')); const nsOrder = NS.waiting().slice(); ran.length = 0; await NS.flush(); const nsRan = ran.filter(r => !/written/.test(r));   // a note typed in again goes to the end: the newest save runs last, as its timer would
        NS.later('d', run('d1', 'throw')); NS.later('e', run('e1', 'reject')); NS.later('f', run('f1')); let flushOk = false; await NS.flush().then(() => { flushOk = true; }); const ns6 = [flushOk, NS.waiting().slice(), ran.slice(-4)];   // a save that fails stops no other, nor the redraw
        const flushEmpty = await NS.flush().then(() => true);
        // (i) the notepad's box (item 35, fold 3a): net.js sliced by its padbox markers and run for real on the page of plain objects (tools/boxdom.js).
        // The GM's box is the text box module's (a recording stand-in here: textcheck runs the module itself); a player's box is drawn by the reader
        // (a stand-in that draws the text in pieces of five characters, a span a piece, and loses its scroll as a browser's box does)
        const LKp = await import(require('url').pathToFileURL(path.join(__dirname, '..', 'system', 'app', 'scripts', 'lookcore.js')).href), { makeDom: mkPadDom } = require('./boxdom.js');
        const pbA = src.indexOf('// [netcheck:padbox-start]'), pbZ = src.indexOf('// [netcheck:padbox-end]'), rnSrc = pbA < 0 || pbZ < pbA ? '' : src.slice(pbA, pbZ);
        const padWorld = (role, o) => { o = o || {};
            const dom = mkPadDom(), doc = dom.document, W = dom.window, panel = doc.createElement('div'), el = doc.createElement('div'), calls = { fill: 0, dress: [], hosts: [], read: [], input: 0 }, els = { notepadPanel: panel, notepadText: el };
            panel.appendChild(el); doc.body.appendChild(panel); el.id = 'notepadText'; panel.id = 'notepadPanel';
            if (!o.noBox) W.wpTextBox = { host: rec => { calls.hosts.push(rec); return o.refuse !== true; }, dress: (b, d) => { calls.dress.push(j(d)); b.classList.add('ts-box'); b.classList.add('ts-multi'); b.dataset.tsk = d.key; b.setAttribute('contenteditable', 'plaintext-only'); return true; }, fill: () => { calls.fill++; }, pending: () => w.pending === true };
            if (!o.noLook) W.wpLook = LKp;
            if (!o.noReader) W.wpTextRead = { fill: (e, t, r, d, opt) => { calls.read.push([t, r ? j(r) : null, j(opt)]); while (e.firstChild) e.removeChild(e.firstChild); e.scrollTop = 0; for (let i = 0; i < t.length; i += 5) { const sp = d.createElement('span'); sp.appendChild(d.createTextNode(t.slice(i, i + 5))); e.appendChild(sp); } } };
            const selP = W.getSelection(), sbeP = selP.setBaseAndExtent; selP.setBaseAndExtent = function(a, ao, f, fo) { sbeP.call(this, a, ao, f, fo); const ce = el.attrs.contenteditable; if (el.contains(a) && ce && ce !== 'false') dom.page.active = el; };   // as a browser does: a selection set inside an editable box takes the focus there
            const net = { active: true, role, notepad: { on: true, text: '', gm: 'Gina' }, notepadInput: () => { calls.input++; } };
            const api = new Function('net', 'ui', 'window', 'document', 'getActiveCampaign', 'getProfile', "'use strict';\n" + rnSrc + '\nreturn { renderNotepad, padMoved, padAt, padPoint, padSelOf, padSelect, padRead, padDress, padField, padOn, padRec, padReset, padWire, padKey, notepadMsg, state: _pad };')(net, id => els[id] || null, W, doc, () => ({ id: 'c1', name: 'The Camp' }), () => ({ id: 'u_gm', name: 'Gina' }));
            const w = { dom, doc, W, panel, el, calls, net, api, sel: W.getSelection(), pending: false }; return w; };
        // places in the drawn text, worked out by the suite itself (never by the app's own maps): a place at a piece's edge is the START of the next piece
        const padTexts = el => { const out = []; (function walk(x) { if (x.nodeType === 3) out.push(x); else x.childNodes.forEach(walk); })(el); return out; };
        const padPlace = (el, at) => { const ts = padTexts(el); let left = at; for (let i = 0; i < ts.length; i++) { const len = ts[i].nodeValue.length; if (left < len || i === ts.length - 1) return [ts[i], Math.min(left, len)]; left -= len; } return [el, 0]; };
        const padOff = (el, node, off) => { let n = 0; for (const t of padTexts(el)) { if (t === node) return n + off; n += t.nodeValue.length; } return -1; };
        const padNow = w => { const s = w.sel, a = padOff(w.el, s.anchorNode, s.anchorOffset), f = padOff(w.el, s.focusNode, s.focusOffset); return [Math.min(a, f), Math.max(a, f), a === f ? 'none' : f < a ? 'backward' : 'forward']; };
        // a player reading or copying while the GM writes: the selection and the place in a long text stay, as far as the new text reaches
        const padGo = (text, s, e, old, back) => { const w = padWorld('client'); w.net.notepad.text = old === undefined ? 'the old words, long enough' : old; w.api.renderNotepad();
            const n = w.net.notepad.text.length, a = padPlace(w.el, Math.min(n, s === undefined ? 4 : s)), f = padPlace(w.el, Math.min(n, e === undefined ? 40 : e));
            if (back) w.sel.setBaseAndExtent(f[0], f[1], a[0], a[1]); else w.sel.setBaseAndExtent(a[0], a[1], f[0], f[1]);
            w.dom.page.active = w.el; w.el.scrollTop = 77; w.sel.sets = 0; w.net.notepad.text = text; w.api.renderNotepad(); return w; };
        const padSel = (role, text, s, e, old) => { const w = padGo(text, s, e, old); return [w.el.textContent, w.sel.sets ? [padNow(w).slice(0, 2)] : [], w.el.scrollTop]; };
        const sels = [padSel('client', 'the old words, long enough, and more'), padSel('client', 'short')];
        // the selection moves with the words (the review of 2026-10-10: kept by its offsets it slid onto other words when the GM typed before it): text put in before
        // it, text taken out before it, a change that reaches into it (a caret at the end of what changed), a change of exactly what was selected, a caret at the end
        const moved = [padSel('client', 'NEW the old words, long enough', 4, 13)[1], padSel('client', 'old words, long enough', 8, 13)[1], padSel('client', 'the old WORDS, long enough', 4, 10)[1], padSel('client', 'the old WORDS, long enough', 8, 13)[1], padSel('client', 'the old words, long enough!', 26, 26)[1]];
        // a selection that begins exactly where the GM typed begins after what was typed (the review of 2026-10-10: it took the GM's words in); one that ends there is as it was; a lone caret
        // there stays before what was typed; repeated line breaks do not pull a line break in; and no place lies between the two halves of one character
        const GRIN = String.fromCharCode(0xd83d, 0xde00), OTHER = String.fromCharCode(0xd83e, 0xde00);
        const edge = [padSel('client', 'abcXDEFghi', 3, 6, 'abcDEFghi')[1], padSel('client', 'see the the old map', 8, 11, 'see the old map')[1], padSel('client', 'Meet at noon.\n\n\nBring rope.', 15, 26, 'Meet at noon.\n\nBring rope.')[1],
            padSel('client', 'abcXDEFghi', 0, 3, 'abcDEFghi')[1], padSel('client', 'abcXDEFghi', 3, 3, 'abcDEFghi')[1], padSel('client', 'X' + OTHER, 1, 1, 'ab' + GRIN)[1], padSel('client', 'ab' + OTHER + 'c', 4, 5, 'ab' + GRIN + 'c')[1]];
        // the first character of a selection deleted, or replaced: the rest stays selected (the review of 2026-10-10: it became a caret); an emoji typed right before a
        // selection that begins with an emoji is not taken in, though the two share their first half
        const BEAM = String.fromCharCode(0xd83d, 0xde01), JOY = String.fromCharCode(0xd83d, 0xde02);
        const edge2 = [padSel('client', 'abcEFghi', 3, 9, 'abcDEFghi')[1], padSel('client', 'abcXEFghi', 3, 9, 'abcDEFghi')[1], padSel('client', 'abcghi', 3, 6, 'abcDEFghi')[1], padSel('client', 'ab' + GRIN + JOY + BEAM, 4, 6, 'ab' + GRIN + BEAM)[1], padSel('client', 'hi ' + JOY + BEAM + ' there', 3, 11, 'hi ' + BEAM + ' there')[1], padSel('client', 'abcEFghi', 2, 9, 'abcDEFghi')[1]];
        // a change INSIDE a selection, or ending exactly at its end (the review of 2026-10-10: the GM's new words were left selected): the last word replaced leaves the
        // words before it selected; words typed or put strictly inside make it a caret; words only taken out from inside leave the rest; and an insertion that
        // cannot be told from one inside (the letter typed is the one before the selection) is read as inside
        const inside = [padSel('client', 'ab', 0, 2, 'aa')[1], padSel('client', 'Meet at d', 0, 12, 'Meet at noon')[1], padSel('client', 'aba', 0, 2, 'aa')[1], padSel('client', 'aab', 0, 2, 'ab')[1], padSel('client', 'the old WORDS, long enough', 4, 13)[1], padSel('client', 'the old WORDS, long enough', 4, 20)[1], padSel('client', 'the old , long enough', 4, 20)[1]];
        // a player reading with no selection in the box: their place in a long text stays (the box goes back to its top when it is drawn), and no selection is made
        const unfocused = (() => { const w = padWorld('client'); w.net.notepad.text = 'old words'; w.api.renderNotepad(); w.el.scrollTop = 77; w.sel.sets = 0; w.net.notepad.text = 'the GM wrote on'; w.api.renderNotepad(); return [w.el.textContent, w.el.scrollTop, w.sel.sets]; })();
        // a selection made backwards stays backwards (the review of 2026-10-10): the next Shift and arrow goes on from the player's own end of it
        const padDir = (text, s, e, back, old) => padNow(padGo(text, s, e, old, back));
        const OLDW = 'the old words', dirs = [padDir('NEW ' + OLDW, 4, 7, true, OLDW), padDir(OLDW + '!', 4, 7, true, OLDW), padDir(OLDW + '!', 4, 7, false, OLDW), padDir('the oXld words', 4, 7, true, OLDW), padDir(OLDW + '!', 5, 5, true, OLDW), padDir('the WORDS', 4, 13, true, OLDW)];
        // the pure map by itself gives what the box shows, and the two maps between a place and a count of characters agree with the suite's own
        const pw = padWorld('client'); pw.net.notepad.text = 'abcdefghijklmnop'; pw.api.renderNotepad();
        const maps = [j(pw.api.padMoved('abcDEFghi', 'abcXDEFghi', 3, 6)), j(pw.api.padMoved('aa', 'ab', 0, 2)), j(pw.api.padMoved('same', 'same', 1, 3)), j(pw.api.padMoved('', 'new', 0, 0)), j(pw.api.padMoved('old', '', 1, 2)),
            [0, 3, 5, 7, 10, 16].every(at => { const p = pw.api.padPoint(pw.el, at); return p.node.nodeType === 3 && padOff(pw.el, p.node, p.offset) === at; }), j([pw.api.padPoint(pw.el, 99).offset, pw.api.padPoint(pw.el, -4).offset, pw.api.padPoint(pw.doc.createElement('div'), 3).offset]),
            [0, 4, 5, 9, 16].every(at => { const p = padPlace(pw.el, at); return pw.api.padAt(pw.el, p[0], p[1]) === at; }), pw.api.padAt(pw.el, pw.el, 2), pw.api.padAt(pw.el, pw.el.childNodes[1], 1), pw.api.padAt(pw.el, pw.el, 99), pw.api.padSelOf(pw.el), (() => { const out = pw.doc.createElement('div'); out.appendChild(pw.doc.createTextNode('x')); pw.doc.body.appendChild(out); pw.sel.setBaseAndExtent(out.firstChild, 0, out.firstChild, 1); return pw.api.padSelOf(pw.el); })()];
        // the box for its part: a player's only reads (and is drawn by the reader with the rule of the pad, never with typed addresses as links); the GM's is the text box
        // module's, dressed once, filled at every draw unless a composition or a control of the bar is in use for it, and never drawn by the reader
        const rw = padWorld('client'); rw.net.notepad.text = 'the GM wrote on'; rw.net.notepad.look = { any: 1 }; rw.api.renderNotepad(); rw.api.renderNotepad(); const readA = j(rw.el.attrs), readCalls = rw.calls.read.slice();
        rw.net.notepad.look = { any: 2 }; rw.api.renderNotepad(); rw.net.notepad.text = ''; rw.api.renderNotepad();
        const reads = [rw.el.attrs.contenteditable, rw.el.attrs['aria-readonly'], rw.el.attrs.role, rw.el.attrs.spellcheck, rw.el.attrs['data-placeholder'], rw.el.classList.contains('ts-box'), j(readCalls), rw.calls.read.length, rw.el.textContent, rw.calls.fill, rw.calls.hosts.length, rw.panel.style.display, readA === j(rw.el.attrs)];
        const hw = padWorld('host'); hw.net.notepad.text = 'my typing'; hw.api.renderNotepad(); hw.api.renderNotepad(); hw.pending = true; hw.api.renderNotepad(); hw.pending = false;
        const h0 = hw.calls.hosts[0] || {}, hf = hw.api.padField('pad'), writes = [hw.calls.hosts.length, h0.id, h0.roots && h0.roots.length === 1 && h0.roots[0] === hw.panel, h0.links && h0.links('pad'), h0.sizes && h0.sizes('pad'), h0.fonts && h0.fonts('pad'), h0.barHost && h0.barHost() === hw.panel, h0.barBy && h0.barBy() === hw.panel, h0.barUnder && h0.barUnder(), h0.doc && h0.doc(),
            j(hw.calls.dress), hw.calls.fill, hw.calls.read.length, hw.el.attrs['aria-readonly'] === undefined, hw.el.classList.contains('ts-box'), hw.api.padField('other'), hw.api.padField('__proto__')];
        hf.setText('x'.repeat(20010)); const cutLen = hf.text().length; hf.setText(null); const nul = hf.text(); hf.setText('Styled words'); hf.setFmt('x'); const f1 = hf.fmt(); hf.setFmt({ spans: [{ s: 0, e: 6, b: true, link: 'https://a.example/' }] }); hf.setFont(7); const fo1 = hf.font(); hf.setFont('Cinzel'); h0.changed('pad', 'look');
        const field = [hf.ident, cutLen, nul, f1, fo1, hf.font(), hw.calls.input], sent = hw.api.notepadMsg(), wantLook = LKp.makeRec({ spans: [{ s: 0, e: 6, b: true }] }, 'Cinzel', 'Styled words', LKp.RULES.PAD);
        hw.net.notepad.on = false; const offMsg = hw.api.notepadMsg(); hw.net.notepad.on = true; hw.api.padReset(); const plainMsg = hw.api.notepadMsg();
        hw.net.role = 'client'; const gone = hw.api.padField('pad'); hw.net.notepad = { on: true, text: 'now a player', gm: 'Ann' }; hw.api.renderNotepad(); const flipped = [gone, hw.el.classList.contains('ts-box'), hw.el.dataset.tsk === undefined, hw.el.attrs['aria-readonly'], hw.el.textContent, hw.calls.hosts.length];
        hw.net.role = 'host'; hw.net.notepad = { on: true, text: 'hosting again' }; hw.api.renderNotepad(); const flippedBack = [hw.el.classList.contains('ts-box'), hw.el.attrs['aria-readonly'] === undefined, hw.el.childNodes.length, hw.calls.hosts.length, hw.calls.dress.length];
        // where the box cannot serve, the pad still shows its words, read-only; a panel put away draws nothing
        const none = [padWorld('host', { noBox: true }), padWorld('host', { noLook: true }), padWorld('host', { refuse: true }), padWorld('client', { noReader: true }), padWorld('client', { noLook: true })].map(w => { w.net.notepad.text = 'plain words'; w.api.renderNotepad(); w.api.renderNotepad(); return [w.el.textContent, w.el.attrs['aria-readonly'], w.el.classList.contains('ts-box'), w.calls.fill, w.calls.read.length, w.calls.hosts.length]; });
        const offW = padWorld('client'); offW.net.notepad.on = false; offW.api.renderNotepad(); const putAway = [offW.panel.style.display, offW.calls.read.length, offW.el.attrs.role === undefined];
        // the thirteenth review. A selection is put back only while the pad holds the focus: one that lies in the pad while the focus is on a
        // button elsewhere is left alone, since setting a selection inside an editable box takes the focus there
        const elsewhere = (() => { const w = padWorld('client'), other = w.doc.createElement('button'); w.doc.body.appendChild(other); w.net.notepad.text = 'old words here'; w.api.renderNotepad();
            const a = padPlace(w.el, 4), f = padPlace(w.el, 9); w.sel.setBaseAndExtent(a[0], a[1], f[0], f[1]); w.dom.page.active = other; w.el.scrollTop = 77; w.sel.sets = 0; w.net.notepad.text = 'the GM wrote on'; w.api.renderNotepad();
            return [w.el.textContent, w.el.scrollTop, w.sel.sets, w.dom.page.active === other]; })();
        // a last line break opens a line only when something stands on it: the reading pad ends in one line break element then, as the GM's own box does
        const tailW = o => { const w = padWorld('client', o); return t => { w.net.notepad.text = t; w.api.renderNotepad(); const kids = w.el.childNodes, last = kids[kids.length - 1]; return [!!last && last.nodeName === 'BR', kids.filter(c => c.nodeName === 'BR').length, w.el.textContent === t, w.api.padAt(w.el, w.el, kids.length) === t.length]; }; };
        const tailOf = tailW(), tailPlain = tailW({ noReader: true }), tails = [tailOf('abc\n'), tailOf('abc\n\n'), tailOf('abc\nd'), tailOf(''), tailOf('\n'), tailPlain('abc\n'), tailPlain('abc')];
        // a pad that is put away is another pad: its field says so, and the text box module drops the steps kept for the one before
        const iw = padWorld('host'), idents = [iw.api.padField('pad').ident, (iw.api.padReset(), iw.api.padField('pad').ident), (iw.api.padReset(), iw.api.padField('pad').ident)];
        // the pad's own listeners, run for real (padWire): a player's box cancels every edit and is drawn again after what cannot be canceled, the GM's is
        // left to the text box module; a key in the box or on a control of the bar stops at the panel, a key on one of the pad's own buttons goes on
        const wired = role => { const w = padWorld(role), foot = w.doc.createElement('button'), bar = w.doc.createElement('div'), barBtn = w.doc.createElement('button'), heard = []; bar.className = 'ts-bar'; bar.appendChild(barBtn); w.panel.appendChild(bar); w.panel.appendChild(foot);
            w.doc.addEventListener('keydown', e => { heard.push(e.key); }); w.api.padWire(w.el, w.panel); w.net.notepad.text = 'the words'; w.api.renderNotepad();
            const cancelled = ['beforeinput', 'paste', 'cut', 'drop', 'copy'].map(ev => w.dom.fire(w.el, ev, {}).defaultPrevented === true), drawn0 = w.calls.read.length;
            const t0 = padTexts(w.el)[0]; if (t0) t0.nodeValue = 'TAMPERED'; w.dom.fire(w.el, 'input', {}); const afterInput = [w.el.textContent, w.calls.read.length - drawn0]; const t1 = padTexts(w.el)[0]; if (t1) t1.nodeValue = 'AGAIN'; w.dom.fire(w.el, 'compositionend', {}); const afterComp = w.el.textContent;
            const key = t => { const n = heard.length, e = w.dom.fire(t, 'keydown', { key: 'Delete' }); return [e.stopped === true, heard.length > n]; };
            return [cancelled, afterInput, afterComp, key(w.el), key(w.el.firstChild || w.el), key(barBtn), key(foot)]; };
        const wiredAs = [wired('client'), wired('host')];
        const padMore = [elsewhere, tails, idents, wiredAs];
        const pads = [reads, writes, field, j(Object.keys(sent)), j(sent.look) === j(wantLook), wantLook !== undefined, j(Object.keys(offMsg)), j(Object.keys(plainMsg)), flipped, flippedBack, none, putAway];
        check('the Journal, the notes that wait and the notepad (the owed review of 2026-10-09; handouts.js and net.js, run for real): a page the player wrote themselves is never replaced by a handout or a share sent under its id, which becomes a page of its own beside it, while the GM\'s own page sent again is still replaced in place; a named sender whose id is none or does not read matches no page, the GM\'s and its own earlier ones alike, so each such share is a page of its own; a note\'s save waits half a second and a later key for the same note takes its place, a redraw runs every waiting save at once and waits for them, a save that throws or fails stops neither the others nor the redraw, and one whose time has come waits no longer; the notepad\'s box (item 35, fold 3a: net.js sliced by its padbox markers, run on the page of plain objects) is for the GM a box of the text box module, the pad registered once as its host with its own panel as root, as the bar\'s place and as what the bar stands by, taking sizes and fonts and never a link, dressed once and filled at every draw unless a composition or a control of the bar is in use, never drawn by the reader; its field cuts a text at 20,000 and takes a format only as an object and a font only as a text, and the message carries the look made for the very text sent, by the rule of the pad, only while the pad is open and only when a look is left, so a plain pad\'s message has the keys it always had; for a player the box only reads: editable for its caret alone and marked read-only, drawn by the reader with the rule of the pad and no typed address as a link, once for each text and look, never a host of the text box; a pad that changes hands is emptied and dressed for its new part; without the box module, lookcore or the reader the pad shows its words read-only, and a refused registration is asked once however often the pad is drawn; a selection is put back only while the pad holds the focus, and one that lies in the pad while the focus is elsewhere is left alone; a text that ends in a line break ends in one line break element, with the reader or without; a pad that is put away is another field, its name moving with every reset; the pad\'s own listeners, run for real, cancel a player\'s every edit and never a copy, draw the box again after an input or a composition, leave the GM\'s box to the text box module, and stop a key in the box or on a control of the bar while a key on one of the pad\'s own buttons goes on to the document; on a player\'s app it follows the GM with or without a selection in it, keeping the player\'s selection and place in the text: a selection after what the GM changed moves with its words, one before it stays, one the change reaches into, or whose very words were changed, becomes a caret at the end of what changed, and one that begins where the GM typed begins after what was typed, also when what was typed shares half its code with the selection\'s first character; one whose first character the GM deletes or replaces keeps the rest, one whose last word the GM replaces keeps the words before it, words typed or put strictly inside it make it a caret, and words only taken out from inside leave the rest selected; no place is ever between the halves of one character; a player reading without the focus keeps their place too; a selection keeps the way it was made, backwards or forwards, where it survives, moved or not, and one that became a caret has no direction; a note typed in again is saved after the ones that were waiting',
            notesN.length === 1 && notesN[0].id === 'nabc123xyz' && notesN[0].text === 'my own words, hours of them' && notesN[0].title === 'My secret plan' && byText('replaced by the host').length === 1 && byText('replaced by the host')[0].id !== 'nabc123xyz' && byText('a share under it').length === 1 && byText('a share under it')[0].id !== 'nabc123xyz'
            && byText('second').length === 1 && byText('first').length === 0 && nameless.length === 3 && new Set(nameless.map(e => e.id)).size === 3 && byText('the GM under that id').length === 1 && byText('the GM first').length === 1 && byText('a share over the GM').length === 1 && new Set(ixN2.entries.map(e => e.id)).size === ixN2.entries.length
            && j(ns1) === j([['a', 'b'], [500, 500, 500], [1]]) && j(ns2) === j([['a2', 'b1'], [], [1, 2, 3]]) && j(ns3) === j(['a2', 'b1', 'a2 written', 'b1 written']) && j(ns4) === j(ns3) && j(ns5) === j(['c1', []])
            && j(ns6) === j([true, [], ['d1', 'e1', 'f1', 'f1 written']]) && flushEmpty === true
            && rnSrc.length > 2000 && j(pads) === j([['true', 'true', 'textbox', 'false', 'The GM has not written anything yet.', false, j([['the GM wrote on', j({ any: 1 }), j({ rule: LKp.RULES.PAD, typed: false })]]), 3, '', 0, 0, 'flex', true],
                [1, 'pad', true, false, true, true, true, true, true, 'pad', j([j({ key: 'pad', multi: true, placeholder: "Notes for the whole table. Everyone sees this as you type. Gone when you put it away or the session ends; anyone can save it to their Journal.", label: 'Table notepad' })]), 2, 0, true, true, null, null],
                ['pad:0', 20000, '', null, '', 'Cinzel', 1], j(['type', 'on', 'text', 'campId', 'gmId', 'campaign', 'gm', 'look']), true, true, j(['type', 'on', 'text', 'campId', 'gmId', 'campaign', 'gm']), j(['type', 'on', 'text', 'campId', 'gmId', 'campaign', 'gm']),
                [null, false, true, 'true', 'now a player', 1], [true, true, 0, 1, 2], [['plain words', 'true', false, 0, 1, 0], ['plain words', 'true', false, 0, 0, 0], ['plain words', 'true', false, 0, 1, 1], ['plain words', 'true', false, 0, 0, 0], ['plain words', 'true', false, 0, 0, 0]], ['none', 0, true]])
            && j(maps) === j(['[4,7]', '[0,1]', '[1,3]', '[0,0]', '[0,0]', true, '[1,0,0]', true, 10, 10, 16, null, null])
            && j(padMore) === j([['the GM wrote on', 77, 0, true], [[true, 1, true, true], [true, 1, true, true], [false, 0, true, true], [false, 0, true, true], [true, 1, true, true], [true, 1, true, true], [false, 0, true, true]], ['pad:0', 'pad:1', 'pad:2'],
                [[[true, true, true, true, false], ['the words', 1], 'the words', [true, false], [true, false], [true, false], [false, true]], [[false, false, false, false, false], ['', 0], '', [true, false], [true, false], [true, false], [false, true]]]])
            && j(sels) === j([['the old words, long enough, and more', [[4, 26]], 77], ['short', [[5, 5]], 77]]) && j(moved) === j([[[8, 17]], [[4, 9]], [[13, 13]], [[13, 13]], [[26, 26]]]) && j(edge) === j([[[4, 7]], [[12, 15]], [[16, 27]], [[0, 3]], [[3, 3]], [[3, 3]], [[4, 5]]]) && j(edge2) === j([[[3, 8]], [[4, 9]], [[3, 3]], [[6, 8]], [[5, 13]], [[2, 8]]]) && j(inside) === j([[[0, 1]], [[0, 8]], [[2, 2]], [[2, 2]], [[4, 8]], [[13, 13]], [[4, 15]]]) && j(unfocused) === j(['the GM wrote on', 77, 0]) && j(dirs) === j([[8, 11, 'backward'], [4, 7, 'backward'], [4, 7, 'forward'], [6, 6, 'none'], [5, 5, 'none'], [9, 9, 'none']]) && j(nsOrder) === j(['y', 'x']) && j(nsRan) === j(['y1', 'x2'])
            && hoT.includes("noteLater('viewer:' + en.campId + '/' + en.id, function() {\n            return withIndex(en.campId, function(idx) {") && hoT.includes("noteLater(campId + '/' + id, function() {\n            return withIndex(campId, function(idx) {") && hoT.includes("noteLater('own:' + campId + '/' + id, function() {\n        return withIndex(campId, function(idx) {")   // each of the three hands its save's promise back, which is what a redraw waits for
            && hoT.includes("    if (typeof flushNotes === 'function') await flushNotes();") && (hoT.match(/noteLater\(/g) || []).length === 4 && !/noteTimers\[[^\]]+\] = setTimeout/.test(hoT)
            && hoT.includes("Array.prototype.filter.call(secC.querySelectorAll('.journal-from[data-for=\"inbox\"]'), function(c) { return !!c.dataset && c.dataset.from === fromC; })[0] || null") && !/data-from="' \+ fromC/.test(hoT),   // a sender's chip found by its own value, never through a selector built from a name
            j([notesN, ixN2.entries.map(e => [e.id, e.kind, e.sharedBy || '', e.text]), ns1, ns2, ns3, ns4, ns5, ns6, pads]));
    }

    // #26: the Journal's index lives in its file; the browser's storage holds a copy only where there is no shell, and a small one
    const JL = mkJournal({ quota: 1000000 }); JL.ls.set('journal_camp1__u_gm', 'j'.repeat(900000));
    const full = (i) => shMsg('sh_mal__f' + i, 'a'.repeat(60000), 'Mallory', 'u_mal', { caption: 'c'.repeat(4000), sharedNotes: 'n'.repeat(20000) });
    for (let i = 0; i < 11; i++) await JL.api.receive(full(i));
    await JL.api.receive(shMsg('sh_mal__last', 'a'.repeat(60000), 'Mallory', 'u_mal'));
    let profileOk = true; try { JL.localStorage.setItem('wp_profile', 'p'.repeat(150000)); } catch (e) { profileOk = false; }
    const ixL = await JL.idx('camp1__u_gm');
    check('cluster F #26 (journal): with the shell writing the file, no copy of the index stays in the browser\'s storage — a stale copy already there goes with the first write — so twelve large shares leave a 150,000-character profile write room; the file holds every entry',
        !JL.ls.has('journal_camp1__u_gm') && profileOk && ixL.entries.length === 12 && JL.files.has('images/journal/camp1__u_gm/journal.json'), j([JL.ls.has('journal_camp1__u_gm'), profileOk, ixL.entries.length, JL.used()]));
    const JF = mkJournal({ uploadFails: true }); for (let i = 0; i < 4; i++) await JF.api.receive(full(i));
    const mirror = JF.ls.get('journal_camp1__u_gm'), mirrorN = mirror ? JSON.parse(mirror).entries.length : -1, ixF = await JF.idx('camp1__u_gm');
    const JF2 = mkJournal({ uploadFails: true }); await JF2.api.receive(gmMsg('h1', 'small')); const m2 = JF2.ls.get('journal_camp1__u_gm');
    check('cluster F #26 (journal): with no shell the browser\'s storage is the fallback — an index up to 256 KB is kept there and read back; past it nothing more is written, the copy that fit stays',
        m2 && JSON.parse(m2).entries.length === 1 && mirrorN === 3 && ixF.entries.length === 3, j([mirrorN, ixF.entries.length, !!m2]));
    const JR = mkJournal(); for (let i = 0; i < 230; i++) await JR.api.registerJournal('camp' + i + '__gm');
    const reg = JSON.parse(JR.ls.get('journal_registry') || '[]'), regFile = JSON.parse(String(JR.files.get('images/journal/journals.json') || '{"keys":[]}')).keys;
    check('cluster F #26 (journal): the registry of journals kept in the browser\'s storage holds the 200 newest keys; the file holds them all', reg.length === 200 && reg[reg.length - 1] === 'camp229__gm' && reg.indexOf('camp0__gm') < 0 && regFile.length === 230, j([reg.length, reg.slice(-2), regFile.length]));
    // the outside audit of 2026-10-01 (cluster V): what a host can leave on a player's disk through the Journal, and what an index from disk may do
    const PNG = [137, 80, 78, 71, 13, 10, 26, 10], JPG = [255, 216, 255, 224, 0, 16], WEBP = [82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 86, 80];
    const picMsg = (id, bytes, mime, more) => gmMsg(id, undefined, Object.assign({ kind: undefined, mime: mime, data: new Uint8Array(bytes) }, more || {}));
    const pics = W => Array.from(W.files.keys()).filter(k => /\.(png|jpg|webp)$/.test(k)).sort();
    // the type comes from the bytes
    const JT = mkJournal();
    await JT.api.receive(picMsg('t_exe', [77, 90, 144, 0, 60, 115, 99, 114, 105, 112, 116, 62], 'image/png'));        // a program's first bytes and a script tag, called a PNG
    await JT.api.receive(picMsg('t_html', Array.from(Buffer.from('<html><script>1</script></html>')), 'image/jpeg'));
    await JT.api.receive(picMsg('t_short', [137, 80, 78, 71, 1, 2, 3], 'image/png'));                                   // not the whole signature
    await JT.api.receive(picMsg('t_riff', [82, 73, 70, 70, 4, 0, 0, 0, 87, 65, 86, 69], 'image/webp'));                 // a RIFF file that is no WebP
    const noneT = [JT.files.size, (await JT.idx('camp1__u_gm')).entries.length];
    await JT.api.receive(picMsg('t_jpg', JPG, 'image/png')); await JT.api.receive(picMsg('t_png', PNG.concat([1]), 'image/jpeg')); await JT.api.receive(picMsg('t_webp', WEBP, 'text/html'));
    const typedT = (await JT.idx('camp1__u_gm')).entries.map(e => [e.id, e.mime, e.src]);
    check('cluster V (journal): a handout\'s type is read from its own first bytes, never from what the sender calls it — bytes that are no PNG, JPEG or WebP (a program, a page, half a signature, another RIFF file) are not stored at all, no file and no page; a JPEG sent as a PNG lands as .jpg, a PNG sent as a JPEG as .png, a WebP sent as a page as .webp, each page naming its real type',
        j(noneT) === j([0, 0]) && j(typedT) === j([['t_jpg', 'image/jpeg', '/saves/images/journal/camp1__u_gm/t_jpg.jpg'], ['t_png', 'image/png', '/saves/images/journal/camp1__u_gm/t_png.png'], ['t_webp', 'image/webp', '/saves/images/journal/camp1__u_gm/t_webp.webp']])
        && j(pics(JT)) === j(['images/journal/camp1__u_gm/t_jpg.jpg', 'images/journal/camp1__u_gm/t_png.png', 'images/journal/camp1__u_gm/t_webp.webp']), j([noneT, typedT, pics(JT)]));
    // a total that outlives the run: the Journal's folder is measured at the first handout (the pictures by the saves folder's list, each index by its length)
    const GBj = 1024 * 1024 * 1024, bigPic = i => PNG.concat(new Array(30000).fill(i));
    const JD = mkJournal({ listed: [{ path: '/saves/images/journal/old__gm/h.png', folder: 'journal/old__gm', name: 'h.png', size: GBj - 100000 }, { path: '/saves/images/m_abc/map.png', folder: 'm_abc', name: 'map.png', size: 5 * GBj }, { path: '/saves/images/journalx/y.png', folder: 'journalx', name: 'y.png', size: GBj }] });
    for (let i = 0; i < 53; i++) await JD.api.receive(picMsg('d' + i, bigPic(i), 'image/png'));
    await JD.api.receive(gmMsg('dtext', 'x'.repeat(40000)));
    const ixD = await JD.idx('camp1__u_gm'), fullToasts = JD.toasts.filter(t => /Your Journal on this computer is full/.test(t)).length;
    const JE = mkJournal({ listed: [{ path: '/saves/images/journal/old__gm/h.png', folder: 'journal/old__gm', name: 'h.png', size: GBj }] });
    for (let i = 0; i < 50; i++) await JE.api.receive(picMsg('e' + i, PNG.concat([i]), 'image/png'));
    await JE.api.receive(gmMsg('etext', 'short')); await JE.api.receive(shMsg('sh_mal__e', 'short', 'Mallory', 'u_mal'));
    check('cluster V (journal): what the Journal holds on this disk has a total that outlives the run — 1 GB for every journal together, measured at a run\'s first handout from the saves folder (a picture outside the Journal\'s folder is not counted) and kept in step after — so a fresh run with 100 KB of room takes three 30 KB pictures and refuses the rest, a text too; a run that starts full writes nothing at all — no picture, no page, no index — from the GM or from a player; the refusal is said once a run, not once per handout',
        j(pics(JD)) === j(['images/journal/camp1__u_gm/d0.png', 'images/journal/camp1__u_gm/d1.png', 'images/journal/camp1__u_gm/d2.png']) && j(ixD.entries.map(e => e.id)) === j(['d0', 'd1', 'd2']) && fullToasts === 1
        && JE.files.size === 0 && JE.toasts.length === 1 && /Your Journal on this computer is full\. Nothing more is saved to it until you clear some pages: open the Journal and use Clear\./.test(JE.toasts[0]), j([pics(JD), ixD.entries.map(e => e.id), fullToasts, JE.files.size, JE.toasts]));
    // one journal's index, and the number of journals
    const JI = mkJournal({ indexLen: { 'images/journal/camp1__u_gm/journal.json': 16 * 1024 * 1024 - 3000 } });
    JI.files.set('images/journal/journals.json', JSON.stringify({ keys: ['camp1__u_gm'] })); JI.files.set('images/journal/camp1__u_gm/journal.json', JSON.stringify({ campId: 'camp1__u_gm', gm: 'Gina', entries: [] }));
    await JI.api.receive(gmMsg('i_long', 'x'.repeat(5000))); const afterLong = (await JI.idx('camp1__u_gm')).entries.length;
    await JI.api.receive(gmMsg('i_short', 'ok')); const afterShort = (await JI.idx('camp1__u_gm')).entries.map(e => e.id);
    const JN = mkJournal(); JN.files.set('images/journal/journals.json', JSON.stringify({ keys: Array.from({ length: 500 }, (x, i) => 'k' + i + '__gm') }));
    await JN.api.receive(gmMsg('n_new', 'a new table')); const newKept = (await JN.idx('camp1__u_gm')).entries.length;
    await JN.api.receive(Object.assign(gmMsg('n_old', 'a table already here'), { campId: 'k7', gmId: 'gm' })); const oldKept = (await JN.idx('k7__gm')).entries.map(e => e.id);
    check('cluster V (journal): one journal\'s index stays under 16 MB of text — a handout that would pass it is refused, a short one still lands — and a machine keeps at most 500 journals: a handout that would start the 501st is refused while one for a journal already here lands; each refusal says the Journal is full',
        afterLong === 0 && j(afterShort) === j(['i_short']) && JI.toasts.filter(t => /Journal on this computer is full/.test(t)).length === 1 && newKept === 0 && j(oldKept) === j(['n_old']) && JN.toasts.filter(t => /Journal on this computer is full/.test(t)).length === 1, j([afterLong, afterShort, JI.toasts, newKept, oldKept, JN.toasts]));
    // removing a page removes its file
    const JX = mkJournal(); await JX.api.receive(picMsg('x1', PNG.concat([5]), 'image/png')); await JX.api.receive(gmMsg('x2', 'words'));
    const ixX = await JX.idx('camp1__u_gm'), hadX = pics(JX);
    const nDrop = JX.api.dropEntryFiles ? await JX.api.dropEntryFiles('camp1__u_gm', ixX.entries.concat([{ id: 'x9', kind: 'note', text: 'mine' }, { id: 'evil', mime: 'image/png', src: '/saves/images/m1/x.png' }, { id: '../../m1/x', mime: 'image/jpeg', src: '/saves/data.json' }, { id: 'nomime', src: '/saves/images/m1/y.png' }, { id: 'odd', mime: 'text/html', src: '/saves/images/m1/z.png' }, null, 'x'])) : -1;
    const JY = mkJournal(); await JY.api.receive(picMsg('y1', PNG.concat([1]), 'image/png')); await JY.api.receive(picMsg('y1', JPG, 'image/png')); const ixY = await JY.idx('camp1__u_gm');
    check('cluster V (journal): pages removed from a journal take their picture files with them — each file named from the page\'s own id and type inside that journal\'s folder, asked of the saves folder as the Journal\'s own delete; never the address a page carries (one naming a map\'s picture or the save deletes nothing there), nothing for a text page or a note; and a page whose picture is replaced by one of another type drops the file under its old type; Clear and the × both go through it (source)',
        j(hadX) === j(['images/journal/camp1__u_gm/x1.png']) && nDrop === 1 && pics(JX).length === 0 && j(JX.deleted) === j([{ path: '/saves/images/journal/camp1__u_gm/x1.png', journal: true }, { path: '/saves/images/journal/camp1__u_gm/evil.png', journal: true }, { path: '/saves/images/journal/camp1__u_gm/m1x.jpg', journal: true }])
        && j(pics(JY)) === j(['images/journal/camp1__u_gm/y1.jpg']) && j(JY.deleted) === j([{ path: '/saves/images/journal/camp1__u_gm/y1.png', journal: true }]) && ixY.entries.length === 1 && ixY.entries[0].mime === 'image/jpeg' && ixY.entries[0].src === '/saves/images/journal/camp1__u_gm/y1.jpg'
        && /await dropEntryFiles\(campC, goneC\);/.test(hoT) && /dropEntryFiles\(cId, goneD\);/.test(hoT) && !/journalRoom\(/.test(hoT.slice(hoT.indexOf('window.wpJournalAddNote = '), hoT.indexOf('// The GM\'s own campaign, keyed'))), j([hadX, nDrop, JX.deleted, pics(JY), JY.deleted]));
    // an index read from disk is taken as data
    const JK = mkJournal(); JK.files.set('images/journal/camp1__u_gm/journal.json', JSON.stringify({ campId: 'personal', gm: 5, campaign: ['x'], gmId: { a: 1 }, sentNotes: 'x', updated: 7, entries: [null, 'x', 7, [1], { id: 'ok', kind: 'text', text: 't' }] }));
    const ixK = await JK.idx('camp1__u_gm'); JK.ls.set('journal_camp2', JSON.stringify({ campId: 'camp1__u_gm', entries: [null, { id: 'ls' }] })); const ixK2 = await JK.idx('camp2');
    check('cluster V (journal): an index read back from disk (or from the browser\'s storage) is taken as data — it is the journal of the key it was read by, whatever it calls itself; its rows are the objects among them; a GM, campaign or GM id that is no text is none; notes on sends that are no object are dropped — so a planted or damaged index cannot stand in for another journal or keep the Journal from opening',
        ixK.campId === 'camp1__u_gm' && j(ixK.entries) === j([{ id: 'ok', kind: 'text', text: 't' }]) && ixK.gm === '' && ixK.campaign === '' && ixK.gmId === '' && !('sentNotes' in ixK) && ixK.updated === 7 && ixK2.campId === 'camp2' && j(ixK2.entries) === j([{ id: 'ls' }]), j([ixK, ixK2]));
    check('cluster V (journal): each budget\'s refusal is said once a run — a thousand shares past the players\' budget raise one toast, not eight hundred', JB.toasts.filter(t => /Players are sharing more than this session can hold/.test(t)).length === 1, JB.toasts.length);
    // #26 (b): the table keys a player holds, one per GM id, are the 50 newest
    for (let i = 0; i < 500; i++) H.rememberTableKey('u_g' + i, 'k' + i);
    const nKeys = Object.keys(H.tableKeys()).length, newest = H.tableKeyFor('u_g499'), oldest = H.tableKeyFor('u_g0');
    H.rememberTableKey('u_g450', 'k450b'); H.rememberTableKey('u_new1', 'kn');   // a key remembered again is the newest: the one after it goes first
    const moved = [H.tableKeyFor('u_g450'), H.tableKeyFor('u_g451'), H.tableKeyFor('u_new1'), Object.keys(H.tableKeys()).length];
    check('cluster F #26 (client): the table keys remembered per GM id are capped at the 50 newest — a snapshot that keeps naming new GM ids cannot grow the browser\'s storage without end — the newest kept, the oldest gone, and a key remembered again moved to the newest place',
        nKeys === 50 && newest === 'k499' && oldest === '' && j(moved) === j(['k450b', '', 'kn', 50]), j([nKeys, newest, oldest, moved]));
})());
// The Multiplayer panel's two parts (the owner, 2026-10-02): Host and Join each behind its own button, one shown at a time.
{
    const paneSrc = between('// [netcheck:netpane-start]', '// [netcheck:netpane-end]', 'netpane');
    const mk = () => { const el = () => ({ style: { display: '?' }, cls: new Set(), attrs: {}, disabled: null, classList: null, setAttribute(k, v) { this.attrs[k] = v; } }); const els = { netPaneHost: el(), netPaneJoin: el(), netPaneHostBtn: el(), netPaneJoinBtn: el() }; Object.values(els).forEach(e => { e.classList = { toggle: (n, on) => { if (on) e.cls.add(n); else e.cls.delete(n); } }; }); const net = { active: false, role: null }; const api = new Function('net', 'ui', paneSrc + '\nreturn { netPaneWant, netPaneSync, netPanePick, netPaneShow, pane: function() { return _netPane; } };')(net, id => els[id] || null); return { els, net, api }; };
    const view = w => [w.els.netPaneHost.style.display, w.els.netPaneJoin.style.display, w.els.netPaneHostBtn.cls.has('on'), w.els.netPaneJoinBtn.cls.has('on'), w.els.netPaneHostBtn.attrs['aria-expanded'], w.els.netPaneJoinBtn.attrs['aria-expanded'], w.els.netPaneHostBtn.disabled, w.els.netPaneJoinBtn.disabled].join(',');
    const w = mk(), seen = [];
    w.api.netPaneSync(); seen.push(view(w));                       // nothing pressed: both closed
    w.api.netPanePick('host'); seen.push(view(w));                 // Host a table
    w.api.netPanePick('join'); seen.push(view(w));                 // Join a table: the other closes
    w.api.netPanePick('join'); seen.push(view(w));                 // the open one's button again: closed
    w.api.netPaneShow('join'); w.net.active = true; w.net.role = 'host'; w.api.netPaneSync(); seen.push(view(w));   // hosting: the host's part, whatever was picked, and Join is off
    w.api.netPanePick('join'); seen.push(view(w));                 // a press in a session changes nothing
    w.net.role = 'client'; w.api.netPaneSync(); seen.push(view(w)); // at someone's table: the join part, Host off
    w.net.active = false; w.net.role = null; w.api.netPaneSync(); seen.push(view(w));   // the session over: the part last picked again
    const want = ['none,none,false,false,false,false,false,false', 'block,none,true,false,true,false,false,false', 'none,block,false,true,false,true,false,false', 'none,none,false,false,false,false,false,false', 'block,none,true,false,true,false,false,true', 'block,none,true,false,true,false,false,true', 'none,block,false,true,false,true,true,false', 'none,block,false,true,false,true,false,false'];
    const html = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    const iBar = html.indexOf('id="netPaneBar"'), iName = html.indexOf('id="netNameInput"'), iHost = html.indexOf('<div id="netPaneHost" class="net-pane" style="display:none;">'), iJoin = html.indexOf('<div id="netPaneJoin" class="net-pane" style="display:none;">'),   /* 1.6.4 (Fulllion, 2026-11-25, "Move the inline styles"): the style moved to the style sheet, moved on purpose */
        paneCss = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8').replace(/\r\n/g, '\n').includes('\n.net-pane:not(.help-chip-in) { border: 1px solid var(--edge); border-radius: 8px; padding: 12px; margin-bottom: 12px; }'), iHostBtn = html.indexOf('id="netHostBtn"'), iJoinBtn = html.indexOf('id="netJoinBtn"');
    const wired = /\['netPaneHostBtn', 'netPaneJoinBtn'\]\.forEach\(function\(id\) \{ var b = ui\(id\); if \(b\) b\.addEventListener\('click', function\(\) \{ netPanePick\(b\.dataset\.pane\); \}\); \}\);/.test(src) && /function syncSessionButtons\(\) \{\n    netPaneSync\(\);/.test(src) && /netPaneShow\('host'\); if \(!ensureNamed\(\)\) return; startHosting\(false\);/.test(src) && /addEventListener\('click', function\(\) \{\n    netPaneShow\('join'\);\n    if \(typeof joinLocked === 'function' && joinLocked\(\)\)[^\n]*\n    var code = typedCode\(/.test(src);   // 1.6.3 (finding 28): Join refuses at a table first, moved on purpose
    check('the Multiplayer panel shows one part at a time, each behind its own button (the netpane slice run for real on a page of plain objects): nothing pressed, both closed; Host a table opens the host\'s part, Join a table opens the join part and closes the other, the open one\'s button again closes it; in a session the part of this app\'s role is shown whatever was picked — the room code and the table\'s controls for a GM, the join fields for a player — and the other button is off, a press changing nothing; after the session the part last picked again; the open part\'s button marked on and expanded; in the page both parts start closed, the name sits above the two buttons (it is needed to host and to join) and each part holds its own action; Host and Join presses keep their own part shown, and every refresh of the session buttons refreshes the parts',
        JSON.stringify(seen) === JSON.stringify(want) && w.api.netPaneWant(false, null, 'x') === null && w.api.netPaneWant(true, undefined, 'host') === 'join'
        && iName > 0 && iBar > iName && iHost > iBar && iHostBtn > iHost && iJoin > iHostBtn && iJoinBtn > iJoin && html.split('id="netNameInput"').length === 2 && html.split('id="netJoinAvatar"').length === 2 && /data-pane="host" aria-expanded="false" aria-controls="netPaneHost"/.test(html) && /data-pane="join" aria-expanded="false" aria-controls="netPaneJoin"/.test(html) && wired && paneCss,
        JSON.stringify([seen, iName, iBar, iHost, iHostBtn, iJoin, iJoinBtn, wired]));
}
// 1.6.3 (the improvement week's review of multiplayer, finding 28): at a table, or while a join is under way, the join part shows the code in use
// read only and Join is off with a line saying why, so a second press never drops the table. The netpane slice, run for real
{
    const paneSrc = between('// [netcheck:netpane-start]', '// [netcheck:netpane-end]', 'netpane');
    const el = () => ({ style: { display: '?' }, cls: new Set(), attrs: {}, disabled: null, readOnly: false, value: '', classList: { toggle() {} }, setAttribute(k, v) { this.attrs[k] = v; } });
    const els = { netPaneHost: el(), netPaneJoin: el(), netPaneHostBtn: el(), netPaneJoinBtn: el(), netJoinBtn: el(), netCodeInput: el(), netJoinAt: el() };
    const net = { active: false, role: null, peer: null, code: null };
    const api = new Function('net', 'ui', 'showCode', paneSrc + '\nreturn { netPaneSync, joinLocked };')(net, id => els[id] || null, c => c.toUpperCase());
    const view = () => [els.netJoinBtn.disabled, els.netCodeInput.readOnly, els.netCodeInput.value, els.netJoinAt.style.display].join('|');
    const seen = [];
    els.netCodeInput.value = 'typed'; api.netPaneSync(); seen.push(view());                                   // no table: Join live, the box as typed
    net.role = 'client'; net.peer = {}; net.code = 'abcdefghjk'; api.netPaneSync(); seen.push(view());          // a join under way
    net.active = true; api.netPaneSync(); seen.push(view());                                                    // at the table
    net.active = false; net.role = null; net.peer = null; api.netPaneSync(); seen.push(view());                 // the join failed, or the session ended: live again
    net.active = true; net.role = 'host'; net.peer = {}; api.netPaneSync(); seen.push(view());                  // hosting: the join part is not the GM's, and nothing locks it
    const htmlJ = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
    check('1.6.3 finding 28 (the netpane slice, run for real): with no table Join is live and the box keeps what was typed; while a join is under way and at the table Join is off, the box shows the code in use read only, and a line says to leave the session first; once the join fails or the session ends Join is live again; the Join button\'s press refuses at a table in words, and joinSession and a failed join draw the part again',
        j(seen) === j(['false|false|typed|none', 'true|true|ABCDEFGHJK|block', 'true|true|ABCDEFGHJK|block', 'false|false|ABCDEFGHJK|none', 'false|false|ABCDEFGHJK|none'])
        && /<div id="netJoinAt" class="set-line" style="display:none;">You are at this table\. To join another, leave the session first\.<\/div>/.test(htmlJ)
        && /if \(typeof joinLocked === 'function' && joinLocked\(\)\) \{ toast\('You are already at a table, or joining one\. Leave the session first to join another\.'\); return; \}/.test(src)
        && /net\.peer = peer; net\.role = 'client'; net\.code = code;\n    if \(typeof netPaneSync === 'function'\) netPaneSync\(\);/.test(src.replace(/\r\n/g, '\n'))
        && /if \(!net\.active && net\.peer === peer\) \{ try \{ peer\.destroy\(\); \} catch \(e\) \{\} net\.peer = null; net\.role = null; net\.code = null; \}[^\n]*\n\s*if \(!net\.active && typeof netPaneSync === 'function'\) netPaneSync\(\);/.test(src.replace(/\r\n/g, '\n')), j(seen));   // found live: a code that found no table left the join's peer standing, and Join stayed off
}
// 1.6.3 (the improvement week's review of multiplayer, findings 30 and 34): while hosting, who is connected stands right under the room code
// (rosterSeat in the netpane slice, run for real on a page of plain nodes), and goes back to its home before the VTT line otherwise; a player the
// GM paused alone says Paused on their roster chip beside a resume button (renderRoster, run for real), which lets them play again
{
    const paneSrc = between('// [netcheck:netpane-start]', '// [netcheck:netpane-end]', 'netpane');
    const node = id => ({ id, parentNode: null, style: {}, classList: { toggle() {} }, setAttribute() {}, get previousElementSibling() { const s = this.parentNode.kids, i = s.indexOf(this); return i > 0 ? s[i - 1] : null; }, get nextElementSibling() { const s = this.parentNode.kids, i = s.indexOf(this); return i >= 0 && i < s.length - 1 ? s[i + 1] : null; }, get nextSibling() { return this.nextElementSibling; } });
    const box = id => { const b = node(id); b.kids = []; b.insertBefore = (n, ref) => { if (n.parentNode) n.parentNode.kids.splice(n.parentNode.kids.indexOf(n), 1); const at = ref ? b.kids.indexOf(ref) : -1; if (at < 0) b.kids.push(n); else b.kids.splice(at, 0, n); n.parentNode = b; return n; }; return b; };
    const hostInfo = box('netHostInfo'), modal = box('netModal'), els = {};
    ['netCode', 'netCodeWhere', 'tipLine', 'netSummonBtn'].forEach(id => { els[id] = node(id); hostInfo.insertBefore(els[id], null); });
    ['netPaneJoin', 'netRoster', 'netVttLine', 'netPlayersBtn'].forEach(id => { els[id] = node(id); modal.insertBefore(els[id], null); });
    const net = { active: false, role: null, peer: null, code: null };
    const api = new Function('net', 'ui', 'showCode', paneSrc + '\nreturn { rosterSeat, netPaneSync };')(net, id => els[id] || null, c => c);
    const order = () => [hostInfo.kids.map(n => n.id).join(','), modal.kids.map(n => n.id).join(',')].join(' | ');
    const seen = [order()];
    net.active = true; net.role = 'host'; api.rosterSeat(); seen.push(order()); api.rosterSeat(); seen.push(order());
    net.role = 'client'; api.rosterSeat(); seen.push(order());
    net.role = 'host'; api.netPaneSync(); seen.push(order());
    net.active = false; net.role = null; api.netPaneSync(); seen.push(order());
    // renderRoster, run for real: Mira paused alone wears Paused and a resume button; Trevor plays on with neither; a player's own app shows neither
    const rrA = src.indexOf('function renderRoster() {'), rrSrc = rrA < 0 ? '' : src.slice(rrA, src.indexOf('\n}\n', rrA) + 2);
    const roster = (role, paused) => { const el = { textContent: '', innerHTML: '' }; const n2 = { role, active: true, roster: { pM: { id: 'u_m', name: 'Mira' }, pT: { id: 'u_t', name: 'Trevor' } } };
        new Function('net', 'ui', 'syncLastMaps', 'updateSidebarNav', 'rosterSeat', 'getActiveCampaign', 'own', 'escTextRoster', 'safeAvatar', 'window', 'playerHue', 'pausedById', 'renderWhere', 'document', rrSrc + '\nrenderRoster();')(
            n2, id => id === 'netRoster' ? el : null, () => {}, () => {}, () => {}, () => null, () => false, s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), () => false, {}, () => 1, id => paused.indexOf(id) >= 0, () => {}, { body: { classList: { toggle() {} } } });
        return el.innerHTML; };
    const hostH = roster('host', ['u_m']), noneH = roster('host', []), clientH = roster('client', ['u_m']);
    const chips = hostH.split('<span class="roster-chip').slice(1);
    const resumeWired = /var resumeBtn = e\.target\.closest\('\[data-resume\]'\);[^\n]*\r?\n\s+if \(resumeBtn && net\.role === 'host'\) \{\r?\n\s+e\.stopPropagation\(\);\r?\n[^\n]*\r?\n\s+if \(resP && resP\.id\) net\.pausePlayer\(resP\.id, false\);/.test(src);
    check('1.6.3 (findings 30 and 34): while hosting, the list of who is connected stands right under the room code (rosterSeat, run for real: moved once and left where it stands, back before the VTT line for a player and after the session); a player paused alone wears Paused and a resume button on their roster chip (renderRoster, run for real), which lets them play again through net.pausePlayer; nobody else does, and a player\'s own app shows neither',
        j(seen) === j(['netCode,netCodeWhere,tipLine,netSummonBtn | netPaneJoin,netRoster,netVttLine,netPlayersBtn', 'netCode,netCodeWhere,netRoster,tipLine,netSummonBtn | netPaneJoin,netVttLine,netPlayersBtn', 'netCode,netCodeWhere,netRoster,tipLine,netSummonBtn | netPaneJoin,netVttLine,netPlayersBtn',
            'netCode,netCodeWhere,tipLine,netSummonBtn | netPaneJoin,netRoster,netVttLine,netPlayersBtn', 'netCode,netCodeWhere,netRoster,tipLine,netSummonBtn | netPaneJoin,netVttLine,netPlayersBtn', 'netCode,netCodeWhere,tipLine,netSummonBtn | netPaneJoin,netRoster,netVttLine,netPlayersBtn'])
        && chips.length === 2 && /roster-held/.test(chips[0]) && /<span class="roster-paused">Paused<\/span><button class="roster-resume" data-resume="pM" title="Paused by you\. Press to let them play again\.">/.test(chips[0]) && !/roster-paused|roster-resume/.test(chips[1])
        && !/roster-paused|roster-resume/.test(noneH) && !/roster-paused|roster-resume/.test(clientH) && resumeWired, j([seen, hostH, clientH, resumeWired]));
}
// 1.5.4 (found live): Leave session showed outside every session, where it did nothing (net.leaveSessionConfirm asks nothing with no table)
{
    const ssA = src.indexOf('function syncSessionButtons() {'), ssSrc = ssA < 0 ? '' : src.slice(ssA, src.indexOf('\n}\n', ssA) + 2);
    const runSS = netS => { const el = () => ({ style: { display: '?' }, dataset: {}, classList: { toggle() {} }, removeAttribute() {} }), els = { netEndBtn: el(), netLeaveBtn: el(), sessionPauseBtn: el(), chatBtn: el() };
        new Function('net', 'ui', 'netPaneSync', 'refreshPauseUi', 'window', ssSrc + '\nsyncSessionButtons();')(netS, id => els[id] || null, () => {}, () => {}, {}); return [els.netEndBtn.style.display, els.netLeaveBtn.style.display]; };
    const ssStates = [runSS({ active: false, role: null }), runSS({ active: true, role: 'host' }), runSS({ active: true, role: 'client' }), runSS({ active: false, role: null, foreign: true }), runSS({ active: true, role: 'client', foreign: true }), runSS({ active: false, role: 'client' })];
    const lcA = src.indexOf('net.leaveSessionConfirm = function() {'), lcSrc = lcA < 0 ? '' : src.slice(lcA, src.indexOf('\n};\n', lcA));
    check('Leave session is in the Multiplayer panel only where it does something (syncSessionButtons run for real): never outside a session, where it showed and did nothing; never for the GM hosting, who has End Session; at someone else\'s table, and on the way back from one whose link is down; not while a join has not yet reached its table',
        JSON.stringify(ssStates) === JSON.stringify([['none', 'none'], ['block', 'none'], ['none', 'block'], ['none', 'block'], ['none', 'block'], ['none', 'none']]) && /\n    if \(!net\.active && !net\.foreign\) return;\n/.test(lcSrc),
        JSON.stringify(ssStates));
}
// Backlog 29 (1.6.0): the table trackers on the wire — the host's sync (sliced by its trksync markers) and a player's branch (trkmsg), each run
// for real over the real trackcore. A GM-only tracker is in no message, a player is sent their map's and every map's, a host has no branch
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const TKx = await import(url('trackcore.js')), ownT = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null;
    const syncT = between('// [netcheck:trksync-start]', '// [netcheck:trksync-end]', 'trksync'), rcvT = between('// [netcheck:trkmsg-start]', '// [netcheck:trkmsg-end]', 'trkmsg');
    const campT = { id: 'k_1', clock: { t: 1000 }, trackers: [
        { id: 'fear', kind: 'count', name: 'Fear', v: 2, vis: 'all' },
        { id: 'secret', kind: 'count', name: 'Ambush', v: 5 },
        { id: 'alarm', kind: 'clock', name: 'Alarm', parts: 6, fill: 1, vis: 'all', map: 'mA' },
        { id: 'rit', kind: 'timer', name: 'Ritual', total: 60000, run: true, end: 40000, vis: 'all' }] };
    const mkT = () => {
        const sent = { a: [], b: [], w: [], c: [] }, logs = [];
        const net = { active: true, role: 'host', conns: [
            { peer: 'pA', open: true, send: m => { packCheck(m); sent.a.push(JSON.parse(JSON.stringify(m))); } },
            { peer: 'pB', open: true, send: m => { packCheck(m); sent.b.push(JSON.parse(JSON.stringify(m))); } },
            { peer: 'pW', open: true, send: m => sent.w.push(m) }, { peer: 'pC', open: false, send: m => sent.c.push(m) }],
            roster: { pA: { id: 'u_a', location: 'mA' }, pB: { id: 'u_b', location: 'mB' }, pC: { id: 'u_c', location: 'mA' } } };
        const win = { wpTrackCore: TKx, wpStepLog: (a, s, f) => logs.push([a, s, f]) };
        new Function('net', 'getActiveCampaign', 'own', 'validKey', 'sendFailed', 'window', syncT)(net, () => campT, ownT, k => typeof k === 'string' && k.length > 0 && !(k in Object.prototype), e => { throw e; }, win);
        return { net, sent, logs };
    };
    const h = mkT(), n1 = h.net.syncTrackers(10000), n2 = h.net.syncTrackers(20000);
    const firstA = h.sent.a[0], firstB = h.sent.b[0], txt = JSON.stringify(h.sent);
    check('backlog 29 the table trackers on the wire (net.syncTrackers, sliced by its trksync markers, run for real): each admitted open player is sent the trackers they may see, those shown to the table on every map and on the map the roster says they stand on; a waiting peer and a closed connection get nothing',
        n1 === 2 && j(firstA.list.map(t => t.id)) === j(['fear', 'alarm', 'rit']) && j(firstB.list.map(t => t.id)) === j(['fear', 'rit']) && firstA.type === 'trackers' && firstA.campId === 'k_1' && h.sent.w.length === 0 && h.sent.c.length === 0, txt);
    check('backlog 29 a GM-only tracker is in no message, and neither is a tracker\'s map, its vis or a countdown\'s end: a running countdown goes as its time left when sent',
        !/Ambush|secret|"map"|"vis"|"end"|mA|mB/.test(txt) && j(firstA.list[2]) === j({ id: 'rit', kind: 'timer', name: 'Ritual', color: 'gold', total: 60000, left: 30000, run: true }), txt);
    const before = h.sent.a.length; campT.trackers[0].v = 3; const n3 = h.net.syncTrackers(25000);
    h.net.roster.pB.location = 'mA'; const n4 = h.net.syncTrackers(26000);
    check('backlog 29 nothing is sent again while nothing a player sees has changed (a running countdown is not sent every second); a change goes to each player who sees it; a player on another map is sent that map\'s list',
        n2 === 0 && n3 === 2 && h.sent.a.length === before + 1 && h.sent.a[before].list[0].v === 3 && n4 === 1 && j(h.sent.b[h.sent.b.length - 1].list.map(t => t.id)) === j(['fear', 'alarm', 'rit'])
        && h.logs.length === 3 && h.logs.every(l => l[0] === 'trackers v1' && l[1] === 'sent' && typeof l[2].to === 'number'), j([n2, n3, n4, h.logs]));
    const savedL = campT.trackers; campT.trackers = savedL.map(t => Object.assign({}, t, { vis: undefined })); const n5 = h.net.syncTrackers(27000); campT.trackers = savedL;
    const e = mkT(), saved = campT.trackers; campT.trackers = [{ id: 's', kind: 'count', name: 'Only me' }]; const n6 = e.net.syncTrackers(1); campT.trackers = saved;
    const c = mkT(); c.net.role = 'client'; const n7 = c.net.syncTrackers(1); const o = mkT(); o.net.active = false; const n8 = o.net.syncTrackers(1);
    const f = mkT(); f.net.syncTrackers(1); f.net.trackersForget('pA'); const n9 = f.net.syncTrackers(1); f.net.trackersForget(); const n10 = f.net.syncTrackers(1);
    check('backlog 29 every tracker kept to the GM again sends each player an empty list; a campaign whose trackers are all the GM\'s own sends no message at all (a first empty list is never sent); a client or a host off its table sends nothing; a forgotten player is sent their list again',
        n5 === 2 && h.sent.a[h.sent.a.length - 1].list.length === 0 && n6 === 0 && e.sent.a.length === 0 && e.sent.b.length === 0 && n7 === 0 && c.sent.a.length === 0 && n8 === 0 && n9 === 1 && n10 === 2, j([n5, n6, n7, n8, n9, n10]));
    const runT = (msg, peer, o2) => { o2 = o2 || {}; const got = [];
        new Function('net', 'conn', 'msg', 'state', 'window', rcvT)(Object.assign({ role: 'client', foreign: true, syncedPeer: 'host1', stream: false }, o2.net || {}), { peer }, msg, { appState: { activeCampaignId: 'k_1' } },
            { wpTrackCore: TKx, wpTrackers: { receive: (l, at) => got.push(l) } });
        return got; };
    const good = runT({ type: 'trackers', campId: 'k_1', list: [{ id: 'a', kind: 'count', name: 'Fear', v: 2, map: 'mA', vis: 'all', junk: '<img>' }, { id: '__proto__', kind: 'count' }, { id: 'r', kind: 'timer', total: 9000, left: 4000, run: true, end: 5 }, 'x'] }, 'host1');
    const nos = [runT({ type: 'trackers', campId: 'k_1', list: [] }, 'other'), runT({ type: 'trackers', campId: 'k_2', list: [] }, 'host1'), runT({ type: 'trackers', campId: 'k_1', list: [] }, 'host1', { net: { stream: true } }),
        runT({ type: 'trackers', campId: 'k_1', list: [] }, 'host1', { net: { foreign: false } }), runT({ type: 'trackers', campId: 'k_1', list: 'x' }, 'host1'), runT({ type: 'trackers', campId: 5, list: [] }, 'host1')];
    check('backlog 29 a player\'s app takes the trackers (the trkmsg branch, run for real) from the synced host only, for the campaign on screen only, never in the stream window, cleaned again as a player\'s copy: no map, no vis, no end, nothing else; a list that is no list is nothing',
        good.length === 1 && j(good[0]) === j([{ id: 'a', kind: 'count', name: 'Fear', color: 'gold', v: 2 }, { id: 'r', kind: 'timer', name: 'Countdown', color: 'gold', total: 9000, left: 4000, run: true }]) && nos.every(g => g.length === 0), j([good, nos]));
    check('backlog 29 a host has NO branch for \'trackers\' (a player never sets one), the join snapshot never carries them (sanitizeAppState deletes them) and a host starting afresh forgets what it sent',
        !/msg\.type === 'trackers' && net\.role === 'host'/.test(src) && /delete camp\.videos;[^\n]*\n\s*delete camp\.trackers;/.test(require('./checkkit').part('netfog.js')) && /net\._lastClockSig = null;[^\n]*\n\s*net\.trackersForget\(\);/.test(src)
        && src.includes("if (snapOk && typeof net.trackersForget === 'function') { net.trackersForget(conn.peer); trkSendTo(conn, Date.now()); }"));
    // the owner, 2026-10-29: "gm but for the whole table or specific players" — Table trackers switched off (vtt.js), or a player kept from them
    const mkV = () => {
        const sent = { a: [], b: [] }, sw = { on: true }, cT = Object.assign({}, campT);
        const net = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => sent.a.push(JSON.parse(JSON.stringify(m))) }, { peer: 'pB', open: true, send: m => sent.b.push(JSON.parse(JSON.stringify(m))) }],
            roster: { pA: { id: 'u_a', location: 'mA' }, pB: { id: 'u_b', location: 'mA' } } };
        const win = { wpTrackCore: TKx, wpStepLog: () => {}, wpVtt: { campaignOn: (id, c) => id !== 'trackers' || (c === cT && sw.on) } };
        new Function('net', 'getActiveCampaign', 'own', 'validKey', 'sendFailed', 'window', syncT)(net, () => cT, ownT, k => typeof k === 'string' && k.length > 0 && !(k in Object.prototype), e => { throw e; }, win);
        return { net, sent, sw, cT };
    };
    const v = mkV(); v.cT.trkHide = ['u_b', '<bad>']; const v1 = v.net.syncTrackers(1);
    const vA1 = v.sent.a.length, vB1 = v.sent.b.length; delete v.cT.trkHide; const v2 = v.net.syncTrackers(2);
    v.sw.on = false; const v3 = v.net.syncTrackers(3); const v4 = v.net.syncTrackers(4); v.sw.on = true; const v5 = v.net.syncTrackers(5);
    v.cT.trkHide = ['u_a']; const v6 = v.net.syncTrackers(6);
    const lastA = v.sent.a[v.sent.a.length - 1], lastB = v.sent.b[v.sent.b.length - 1];
    check('backlog 29 Table trackers on the wire: a player the GM keeps them from (camp.trkHide by profile id) is sent nothing while the others get theirs, and gets the list once let back in; the switch off sends every player an empty list once, and on again their lists; hiding one player later sends them an empty list',
        v1 === 1 && vA1 === 1 && vB1 === 0 && v2 === 1 && v.sent.b[0].list.length === 3 && v3 === 2 && v.sent.a[1].list.length === 0 && v.sent.b[1].list.length === 0 && v4 === 0 && v5 === 2 && v.sent.a[2].list.length === 3
        && v6 === 1 && lastA.list.length === 0 && lastB.list.length === 3 && !/u_a|u_b|trkHide/.test(JSON.stringify(v.sent)), j([v1, v2, v3, v4, v5, v6, v.sent]));
    check('backlog 29 the join snapshot never names who the trackers are kept from (sanitizeAppState deletes camp.trkHide)', /delete camp\.trackers;[^\n]*\n\s*delete camp\.trkHide;/.test(require('./checkkit').part('netfog.js')));
})());
// 1.6.2 sounds on actions: who hears one. net.js's soundhear slice run for real on a table of plain objects, then the real roll-req branch with the
// real core behind it, a press from the button naming only which button it was. Those on the map hear it and the GM always does; a hidden act is
// silent for players; nothing of the list goes with the cue, and no message is new
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), Cs = await import(url('soundoncore.js'));
    const hear = between('// [netcheck:soundhear-start]', '// [netcheck:soundhear-end]', 'soundhear'), J = JSON.stringify, ownS = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && o[k] != null;
    const mk = o => {
        o = o || {};
        const sent = { a: [], b: [], c: [], w: [], x: [] }, drop = o.drop || {}, conn = (peer, k, open) => ({ peer, open: open !== false, send: m => { packCheck(m); sent[k].push(JSON.parse(JSON.stringify(m))); } });
        const net = { active: o.active !== false, role: o.role || 'host', conns: [conn('pA', 'a'), conn('pB', 'b'), conn('pC', 'c'), conn('pW', 'w'), conn('pX', 'x', false)], roster: { pA: { id: 'u_a', location: 'mA' }, pB: { id: 'u_b', location: 'mA' }, pC: { id: 'u_c', location: 'mB' }, pX: { id: 'u_x', location: 'mA' } } };
        const camp = { id: 'k', activeItemId: 'mA', items: { mA: { id: 'mA', whiteboard: [{ id: 't_npc', isChar: true, charId: 'c_n' }, { id: 't_pc', isChar: true, charId: 'c_p' }, { id: 't_hid', isChar: true, charId: 'c_h', hidden: true }, { id: 't_ph', isChar: true, charId: 'c_ph', hidden: true }] }, mB: { id: 'mB', whiteboard: [] } } };
        const win = { wpFog: { canSeePoint: (pid, c, m, x, y) => (o.seen || {})[pid] !== false } };
        new Function('net', 'own', 'fogDrop', 'fogLanded', 'getActiveCampaign', 'sendFailed', 'window', 'SC', hear)(net, ownS, (c, m, pid) => drop[pid] || null, (id, fn) => fn(), () => camp, e => { throw e; }, win, () => Sx);
        const fn = new Function('net', 'own', 'fogDrop', 'fogLanded', 'getActiveCampaign', 'sendFailed', 'window', 'SC', hear + '\nreturn soundHears;')(net, ownS, (c, m, pid) => drop[pid] || null, (id, fn2) => fn2(), () => camp, e => { throw e; }, win, () => Sx);
        return { net, camp, sent, win, hears: fn };
    };
    const npc = { id: 'c_n', npc: true }, pc = { id: 'c_p', ownerId: 'u_a' }, cue = { act: 'cue', id: 's_bang', gain: 1 }, who = (h, w) => { const n = h.net.soundCueFor(cue, w); return [n, h.sent.a.length, h.sent.b.length, h.sent.c.length, h.sent.w.length, h.sent.x.length]; };
    const a = mk(), wa = who(a, { map: 'mA', ch: pc, secret: false });
    check('1.6.2 sounds on actions: a shown act reaches those on its map, an admitted open connection each; a player on another map, one not yet admitted and a closed one hear nothing (net.soundCueFor, the soundhear slice run for real)', J(wa) === J([2, 1, 1, 0, 0, 0]), wa);
    check('1.6.2 what a player gets is the Sound panel\'s own cue and nothing else: no event, no line, no name, no new kind of message', J(a.sent.a[0]) === J({ type: 'sound', act: 'cue', id: 's_bang', gain: 1 }));
    const b = [mk(), mk(), mk(), mk()], wb = [who(b[0], { map: 'mA', ch: pc, secret: true }), who(b[1], { map: 'mA', secret: true }), who(b[2], { map: 'mA', ch: { id: 'c_h', npc: true } }), who(b[3], { map: 'mA', ch: { id: 'c_ph', ownerId: 'u_a' } })];
    check('1.6.2 a hidden act is the GM\'s alone: a private roll, a secret door or a hidden piece, a hidden NPC\'s token, and a hidden token of a player\'s own character too: no player is sent anything', wb.every(x => x[0] === 0 && x[1] + x[2] + x[3] === 0), wb);
    const c = mk({ drop: { u_b: { t_npc: 1 } } }), wc = who(c, { map: 'mA', ch: npc }), d = mk({ drop: { u_b: { t_pc: 1 } } }), wd = who(d, { map: 'mA', ch: pc }), e = mk({ drop: { u_b: { t_npc: 1 } } }), we = who(e, { map: 'mA', tok: 't_npc' });
    check('1.6.2 a player who cannot see the token that acted hears nothing, by what their own copy drops: an NPC, another player\'s character and a token named alone; the one who can see it hears it', J(wc) === J([1, 1, 0, 0, 0, 0]) && J(wd) === J([1, 1, 0, 0, 0, 0]) && J(we) === J([1, 1, 0, 0, 0, 0]), [wc, wd, we]);
    const f = mk(), wf = who(f, { map: 'mA', ch: { id: 'c_none', npc: true } }), g = mk(), wg = who(g, { map: 'mA', ch: { id: 'c_none', ownerId: 'u_a' } }), h = mk(), wh = who(h, { map: 'mA', tok: 'gone' });
    check('1.6.2 with no token on that map an NPC is as hidden as npcShown has it and a player\'s character is no secret; a token that is gone hides what it did', wf[0] === 0 && wg[0] === 2 && wh[0] === 0, [wf, wg, wh]);
    const i = mk({ seen: { u_b: false } }), wi = who(i, { map: 'mA', at: { x: 5, y: 5 }, by: 'u_c' }), k = mk({ seen: { u_a: false } }), wk = who(k, { map: 'mA', at: { x: 5, y: 5 }, by: 'u_a' });
    check('1.6.2 a door under a player\'s fog is not heard by them, and whoever moved it hears it whatever their fog says', J(wi) === J([1, 1, 0, 0, 0, 0]) && J(wk) === J([2, 1, 1, 0, 0, 0]), [wi, wk]);
    const l = mk(), wl = who(l, { map: 'mA', ch: pc, only: 'u_a' });
    check('1.6.2 an action whose card goes to its owner alone reaches its owner alone', J(wl) === J([1, 1, 0, 0, 0, 0]), wl);
    const m = [mk({ role: 'client' }), mk({ active: false })], wm = m.map(x => x.net.soundCueFor(cue, { map: 'mA', ch: pc })), n2 = mk(), bad = [null, 'x', {}, { map: 5 }, { map: 'nope' }, { map: '__proto__' }].map(w => n2.net.soundCueFor(cue, w)), n3 = mk().net.soundCueFor({ act: 'ambient', id: 's' }, { map: 'mA' });
    check('1.6.2 only a host sends one, a cue alone goes this way, and a who that does not read reaches nobody', wm.join() === '0,0' && bad.every(x => x === 0) && n3 === 0, [wm, bad, n3]);
    // the real roll-req branch: a plain press names only which button it was
    const gmSys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: true }); gmSys.rolls.push({ id: 'r_keptgm', label: 'Kept', formula: '1d20', vis: 'gm' });
    const rollId = gmSys.rolls.filter(r => r && r.vis !== 'gm' && typeof r.formula === 'string')[0].id;
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i2 = src.indexOf(k); if (i2 < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i2, src.indexOf('\n', i2)); }).join('\n') + '\n';
    const press = o => {
        o = o || {}; const fired = [], tok = { id: 't1', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 };
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, soundOn: [{ ev: { k: 'roll', r: rollId }, snd: 's_bang' }, { ev: { k: 'roll', r: 'r_keptgm' }, snd: 's_bang' }], chars: { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_str: 14, f_level: 5 } } }, items: { m1: { type: 'map', whiteboard: [tok] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, conns: [] }, conn = { peer: 'pA', send() {} };
        const win = { wpFormula: Fx, wpSoundOnCore: Cs, wpSoundOn: { on: () => o.off !== true, fire: (w, h2) => fired.push([w, h2.map, h2.secret, h2.ch && h2.ch.id]) }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpVtt: { on: () => true, rulesOn: () => true } };
        const msg = Object.assign({ type: 'roll-req', rid: 'q1', expr: 'd20', charId: 'c_a', label: 'Attack' }, o.msg || {});
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'fogDrop', 'fogLanded', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + hear + '\n' + rqSrc)(
            msg, conn, net, () => Dx, () => Sx, win, () => camp, () => false, e2 => { throw e2; }, () => {}, () => {}, () => {}, () => null, (id, fn) => fn());
        return fired;
    };
    const p1 = press({ msg: { src: { r: rollId } } }), p2 = press({ msg: { src: { r: rollId }, priv: 'gm' } }), p3 = press(), p4 = press({ msg: { src: { r: rollId } }, off: true }), p5 = press({ msg: { src: { r: 'r_keptgm' } } });
    check('1.6.2 a player\'s plain press (the real roll-req branch): the button\'s word finds the roll though it names no entry, on the map they stand on; a private one is marked so for the GM\'s ears alone; a press with no word and a campaign with no line ask nothing; a roll their view does not hold is no press of theirs',
        J(p1) === J([[{ k: 'roll', r: rollId }, 'm1', false, 'c_a']]) && J(p2) === J([[{ k: 'roll', r: rollId }, 'm1', true, 'c_a']]) && p3.length === 0 && p4.length === 0 && p5.length === 0, [p1, p2, p3, p4, p5]);
})());
// 1.6.0, backlog 206: a row's look and a work line on the wire. A player's own app sends both and waits (the real net.charItem); the host's real
// char-item branch cleans them through the one cleaner, stores them, pays a fee from the character's money and tells the owner alone
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const raw = { v: 1, name: 'L', rolls: [], fields: [
        { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, cats: ['Credit Chip'], lvl: { label: 'Stored', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'gm', vis: 'all', list: { look: {}, workLog: true } },
        { id: 'f_plain', key: 'Plain', label: 'Plain', kind: 'item-list', edit: 'owner', vis: 'all', list: {} }],
        items: [{ id: 'i_chip', name: 'Chip' }, { id: 'i_gun', name: 'Blaster' }] };
    const sys = Sx.cleanSystem(raw, { F: Fx, gmView: true }), view = Sx.cleanSystem(sys, { F: Fx, gmView: false });
    const hostChar = () => ({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 100 }], f_gear: [{ id: 'w_g1', defId: 'i_gun', qty: 1 }, { id: 'w_k1', defId: 'i_gun', qty: 1, hid: 1 }], f_plain: [{ id: 'w_p1', defId: 'i_gun', qty: 1 }] } });
    // a player's own app
    const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentC = [];
    const campC = { id: 'k', system: view, chars: { c_1: JSON.parse(J(Sx.charFor(hostChar(), view, 'u_a', { full: sys }))) } }, before = J(campC.chars.c_1.values);
    const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const look = { overall: { colors: ['#AA0000', 'url(x)'], finish: 'matte', markings: '<b>stripe</b>' }, parts: [{ part: 'Grip', finish: { colors: ['#000000'] } }] };
    const r1 = netC.charItem('c_1', 'f_gear', { op: 'look', rowId: 'w_g1', look }), r2 = netC.charItem('c_1', 'f_gear', { op: 'work', rowId: 'w_g1', work: { kind: 'repair', by: 'hired', fee: 40, note: 'Kessa' } });
    check('backlog 206 on the wire: a player\'s own app sends a look and a work line and waits for the host (the real net.charItem): nothing is laid over their copy first, and only the op\'s own keys travel',
        r1.pending === true && r2.pending === true && J(campC.chars.c_1.values) === before && J(sentC.map(m => Object.keys(m).sort())) === J([['charId', 'fieldId', 'look', 'op', 'rid', 'rowId', 'type'], ['charId', 'fieldId', 'op', 'rid', 'rowId', 'type', 'work']]), J(sentC));
    // the host
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const campH = { id: 'k', system: sys, chars: { c_1: hostChar() } }, out = { answer: [], owner: [], mate: [], saves: 0, log: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
    const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
        netH, () => Sx, winH, () => false, () => campH, () => { out.saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, (k, s) => out.log.push(k + ': ' + s));
    const SEND = m => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.log.length = 0; const s0 = out.saves, b0 = J(campH.chars.c_1.values); H(Object.assign({ type: 'char-item', charId: 'c_1' }, m), { peer: 'pA', send: box(out.answer) }); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(campH.chars.c_1.values) === b0, log: out.log.slice() }; };
    const gun = () => campH.chars.c_1.values.f_gear.find(r => r.id === 'w_g1'), chips = () => campH.chars.c_1.values.f_chips.map(r => r.lvl);
    const h1 = SEND(sentC[0]), g1 = J(gun().look), d1 = h1.owner[0] && h1.owner[0].values ? h1.owner[0].values : {};
    check('backlog 206 on the wire: the host takes a player\'s look on a list only the GM changes (the owner, 2026-10-29: "Owner and GM"), through the one cleaner (a color that is none dropped, markup kept as plain characters), saves once, and sends it in its owner\'s delta alone; a teammate is sent nothing of the list',
        J(h1.answer) === J([{ type: 'char-ack', rid: sentC[0].rid }]) && h1.saves === 1 && g1 === J({ overall: { colors: ['#aa0000'], finish: 'matte', markings: '<b>stripe</b>' }, parts: [{ part: 'Grip', finish: { colors: ['#000000'] } }] }) && J((d1.f_gear || [])[0].look) === g1 && !/f_gear|stripe/.test(J(h1.mate)), J([h1, gun()]));
    const h2 = SEND(sentC[1]), d2 = h2.owner[0] && h2.owner[0].values ? h2.owner[0].values : {};
    check('backlog 206 on the wire: a hired job\'s fee of 40 is paid on the host from the character\'s money (100 to 60), the line on the row with its note, both lists in the owner\'s delta, and the GM\'s log says who paid what for which item',
        J(h2.answer) === J([{ type: 'char-ack', rid: sentC[1].rid }]) && J(chips()) === J([60]) && J(gun().workLog) === J([{ kind: 'repair', by: 'hired', fee: 40, note: 'Kessa' }]) && J(Object.keys(d2).sort()) === J(['f_chips', 'f_gear']) && J(h2.log) === J(['char: Ana paid 40 for work on Blaster']), J(h2));
    const h3 = SEND({ rid: 'q3', fieldId: 'f_gear', op: 'work', rowId: 'w_g1', work: { kind: 'repair', by: 'hired', fee: 500 } });
    const h4 = SEND({ rid: 'q4', fieldId: 'f_gear', op: 'work', rowId: 'w_g1', drop: 0 }), h5 = SEND({ rid: 'q5', fieldId: 'f_gear', op: 'look', rowId: 'w_k1', look });
    const h6 = SEND({ rid: 'q6', fieldId: 'f_plain', op: 'look', rowId: 'w_p1', look }), h7 = SEND({ rid: 'q7', fieldId: 'f_gear', op: 'look', rowId: 'w_g1', look: 'x' }), h8 = SEND({ rid: 'q8', fieldId: 'f_gear', op: 'work', rowId: 'w_g1', log: [{ kind: 'build', by: 'self' }] });
    const h9 = SEND({ rid: 'q9', fieldId: 'f_gear', op: 'work', rowId: 'w_g1', work: { kind: 'build', by: 'self' }, log: [{ kind: 'build', by: 'hired', fee: 9 }], pay: 3 });
    check('backlog 206 on the wire: a fee past what is held is refused in the money\'s words with nothing stored; a player never takes a line off (field); a row the GM keeps from them reads as gone; a list with no look is not one to set; a look that is no object, and a whole log, are dropped unanswered; a line sent with a log and a pay beside it is stored alone and moves no money',
        J(h3.answer) === J([{ type: 'char-deny', rid: 'q3', reason: 'money', msg: 'Not enough money: 60 held, 500 needed.' }]) && h3.same && h3.saves === 0
        && J(h4.answer) === J([{ type: 'char-deny', rid: 'q4', reason: 'field' }]) && h4.same && J(h5.answer) === J([{ type: 'char-deny', rid: 'q5', reason: 'missing' }]) && h5.same && J(h6.answer) === J([{ type: 'char-deny', rid: 'q6', reason: 'field' }])
        && h7.answer.length === 0 && h7.same && h8.answer.length === 0 && h8.same && J(h9.answer) === J([{ type: 'char-ack', rid: 'q9' }]) && J(chips()) === J([60]) && J(gun().workLog.slice(-1)) === J([{ kind: 'build', by: 'self', fee: 0 }]) && gun().workLog.length === 2,
        J([h3.answer, h4.answer, h5.answer, h6.answer, h7.answer, h8.answer, h9.answer]));
    const flat = src.replace(/\r\n/g, '\n');
    check('backlog 206 on the wire (source): the host\'s char-item branch sends a look\'s and a work line\'s refusal with its words, logs each step by its structure alone, and never names a look in any other branch',
        flat.includes("qi.op === 'look' || qi.op === 'work' || resI.cap === true || ((qi.op === 'add' || qi.op === 'custom') && qi.in !== undefined)) && resI.msg)") /* 205 (5) beside it (moved on purpose) */ && flat.includes("window.wpStepLog('rowlook v1', 'host', { op: qi.op, fee: !!(qi.work && qi.work.fee > 0) });") && (flat.match(/rowlook v1/g) || []).length === 1);
})());
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const J = JSON.stringify;
    {   // 1.6.2 (backlog 166 f, fold 3): a chat line's mentions (net.js chatmen slice, run for real with the real textfmt)
        const TFn = await import(url('textfmt.js')), painted = [];
        const node = tag => ({ tag, kids: [], at: {}, appendChild(k) { this.kids.push(k); return k; }, setAttribute(k, v) { this.at[k] = v; }, set textContent(v) { this.kids = [{ nodeType: 3, nodeValue: String(v) }]; }, get textContent() { return this.kids.map(k => k.nodeValue !== undefined ? k.nodeValue : k.textContent).join(''); } });
        const doc = { createElement: node, createTextNode: v => ({ nodeType: 3, nodeValue: v }) }, win = { wpTextFmt: TFn, wpPageShelf: { mentionPaint: (el, soft) => painted.push(soft) }, wpPopout: false };
        const cmS = src.slice(src.indexOf('// [netcheck:chatmen-start]'), src.indexOf('// [netcheck:chatmen-end]'));
        const CM = new Function('window', 'document', cmS + '\nreturn { chatMen, chatTextInto };')(win, doc);
        const T = 'Meet at Hill Road, <b>Bren</b>', tx1 = node('span'), tx2 = node('span'), tx3 = node('span');
        CM.chatTextInto(tx1, T, [{ s: 8, e: 17, h: '#wp:@:map:m1' }, { s: 19, e: 30, h: 'javascript:x' }]); CM.chatTextInto(tx2, T, undefined); CM.chatTextInto(tx3, T, [{ s: 19, e: 99, h: '#wp:@:char:c1' }]);
        const shape = t => t.kids.map(k => k.tag ? ['a', k.at.href, k.textContent] : k.nodeValue);
        check('166 f, fold 3, a chat line\u2019s mentions drawn (chatTextInto, run for real): the words as text nodes and each stretch an <a> of the mention\u2019s own address with its words as text, painted as a chip; a stretch that is no mention, or outside the words, leaves them plain text, never markup',
            J(shape(tx1)) === J(['Meet at ', ['a', '#wp:@:map:m1', 'Hill Road'], ', <b>Bren</b>']) && J(shape(tx2)) === J([T]) && J(shape(tx3)) === J([T]) && J(painted) === J([false]), J([shape(tx1), shape(tx2), shape(tx3), painted]));
        check('166 f, fold 3, on the wire (pinned): a player\u2019s mentions are cleaned by the host against the very words it relays, cleaned again by a player\u2019s app from the synced host and in the join\u2019s history, carried by a pop-out with its words, and sent only as stretches; Table Chat\u2019s box is marked for the @ list',
            src.includes("var menH = typeof chatMen === 'function' ? chatMen(menIn, msg.text) : undefined; if (menH) msg.men = menH;") && src.includes("var menC = typeof chatMen === 'function' ? chatMen(msg.men, lineH.text) : undefined; if (menC) lineH.men = menC;")
            && src.includes("hmn = typeof chatMen === 'function' ? chatMen(m.men, hl.text) : undefined; if (hmn) hl.men = hmn;") && src.includes("postMessage({ type: 'chatSend', text: text, men: menT })") && src.includes("sendChat(Array.isArray(d.men) ? d.men : [])")
            && src.includes("var menS = chatMen(menT, text); if (menS) msg.men = menS;") && src.includes("links: no, mentions: yes, sizes: yes,") && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8').includes('<input type="text" id="chatInput" data-mentions '));
    }
})());


// secrets (R2 #18): the VTT ceiling on the wire — net.broadcastStance (run for real) with vtt.js's own hostCamps (sliced, over a state of three
// campaigns) names the hosted campaign alone: a session is one campaign, and the GM's other games (their ids, their switches) never reach a player
{
    const bsSrc = fnSrc('net.broadcastStance = function', '\n// The one place the ceiling is re-sent from', 'broadcastStance');
    const vttSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'vtt.js'), 'utf8').replace(/\r\n/g, '\n'), hcAt = vttSrc.indexOf('function hostCamps() {');
    const hcSrc = hcAt < 0 ? '' : vttSrc.slice(hcAt, vttSrc.indexOf('\n', hcAt));
    const stanceOf = (active, camps) => {
        const state = { appState: { activeCampaignId: active, campaigns: camps } }, sent = [];
        const hostCamps = new Function('state', 'flagsOf', hcSrc + '\nreturn hostCamps;')(state, c => ({ fog: c.vtt.features.fog }));
        const conns = [{ peer: 'pA', open: true, send: m => { packCheck(m); sent.push(['pA', JSON.parse(JSON.stringify(m))]); } }, { peer: 'pW', open: true, send: m => sent.push(['pW', m]) }, { peer: 'pS', open: false, send: m => sent.push(['pS', m]) }];
        const net = { active: true, role: 'host', conns, roster: { pA: { id: 'u_a' }, pS: { id: 'u_s' } }, stanceFlags: () => ({ fog: true }) };
        new Function('net', 'getActiveCampaign', 'window', 'sendFailed', bsSrc + '\nnet.broadcastStance();')(net, () => (active && camps[active]) || null, { wpVtt: { hostCamps, hostFlags: () => ({ fog: true }) } }, e => { throw e; });
        return sent;
    };
    const three = { camp_1700000000000: { id: 'camp_1700000000000', vtt: { features: { fog: true } } }, camp_1700000000001: { id: 'camp_1700000000001', vtt: { features: { fog: false } } }, camp_1700000000002: { id: 'camp_1700000000002', vtt: { features: { fog: false } } } };
    const st1 = stanceOf('camp_1700000000000', three), stNone = stanceOf('camp_9', three), stOff = stanceOf(null, three);
    check('secrets: the stance message goes to admitted open connections alone and its camps name the hosted campaign alone, its flags; the other campaigns\' ids appear nowhere in it; a hosted id the save does not hold, or none, gives an empty map; the join snapshot takes its stanceCamps from the same hostCamps',
        st1.length === 1 && st1[0][0] === 'pA' && st1[0][1].type === 'stance' && j(Object.keys(st1[0][1].camps)) === j(['camp_1700000000000']) && st1[0][1].camps.camp_1700000000000.fog === true && st1[0][1].campId === 'camp_1700000000000'
        && !/camp_1700000000001|camp_1700000000002/.test(JSON.stringify(st1)) && stNone.length === 1 && j(stNone[0][1].camps) === '{}' && stOff.length === 1 && j(stOff[0][1].camps) === '{}' && hcSrc.length > 0
        && /stanceCamps: window\.wpVtt \? window\.wpVtt\.hostCamps\(\) : null, targets: targetsFor\(prof\.id\)/.test(src) && /camps: window\.wpVtt \? window\.wpVtt\.hostCamps\(\) : null \};/.test(src), j([st1, stNone, stOff]));
}

// Stage 6 library L1c: the item library's manifest never goes in the players' snapshot, and the host's projections read the library through
// a lookup (itemLib, run for real): the system's items as a map while there is no library on this machine, a lookup once there is
{
    const T = src.replace(/\r\n/g, '\n'), il = (T.match(/function itemLib\(sys\) \{[^\n]*\}/) || [''])[0];
    const mk = win => new Function('window', il + '\nreturn itemLib;')(win);
    const sysI = { items: [{ id: 'i_a', name: 'A' }, { id: 'bad', name: 'X' }] }, libE = { id: 'i_l', name: 'L' };
    const noLib = mk({})(sysI), empty = mk({ wpLibrary: { size: () => 0, entry: () => libE } })(sysI), withLib = mk({ wpLibrary: { size: () => 3, entry: id => (id === 'i_l' ? libE : null) } })(sysI);
    check('L1c itemLib: a map of the system\'s items (well-formed ids only) with no library here or an empty one; with one, a lookup — the system\'s own item first, then the library, else nothing',
        typeof noLib === 'object' && j(Object.keys(noLib)) === j(['i_a']) && typeof empty === 'object' && typeof withLib === 'function' && withLib('i_a').name === 'A' && withLib('i_l') === libE && withLib('i_x') === null && withLib('bad') === null);
    check('L1c the players\' snapshot drops the item library\'s manifest beside the sounds and music (a player holds only the copies on their rows)',
        /        delete camp\.music;[^\n]*\n        delete camp\.library;/.test(require('./checkkit').part('netfog.js')));
}

// 1.6.3 (the improvement week's review of sheets and rolls, finding 24): the GM's Table Chat comes back with a reload
{
    const ckSrc = between('// [netcheck:chatkeep-start]', '// [netcheck:chatkeep-end]', 'chatkeep');
    const hoAt = src.indexOf('function chatHistoryOf(log) {'), hoSrc = src.slice(hoAt, src.indexOf('\n', hoAt));
    let drawn = 0; const held = { a_kkkkkkkk: {} };
    const mk = log => new Function('chatLog0', 'DC', 'window', 'renderChatSoon', 'attemptRec', 'figOf', '_npcCards', 'var chatLog = chatLog0;\n' + ckSrc + '\n' + hoSrc + '\nreturn { out: chatKeepOut, back: chatKeepIn, settle: chatKeptSettle, hist: chatHistoryOf, log: function() { return chatLog; } };')(
        log, () => ({ replay: rec => (rec.bad ? { ok: false, reason: 'version' } : { ok: true, result: { v: rec.v } }) }), { wpFormula: { VERSION: 1 } }, () => { drawn++; }, id => held[id] || null, undefined, null);
    const from = { id: 'gm', name: 'GM', gm: true };
    const gm = [
        { from, text: 'hello', scope: 'global', ts: 1 },
        { from, text: '', scope: 'global', ts: 2, roll: { id: 'r1', v: 7, dmgUsed: true }, res: { v: 7, big: 'x' } },
        { from, text: '', scope: 'whisper', ts: 3, due: { att: 'a_kkkkkkkk', label: 'Defend' } },
        { from, text: '', scope: 'whisper', ts: 4, due: { att: 'a_gggggggg', label: 'Dodge' } },
        { from, text: '', scope: 'whisper', ts: 5, due: { att: 'b_ssssssss', label: 'Shock' } },
        { from, text: '', scope: 'whisper', ts: 6, due: { label: 'Each round' } },
        { from, text: '', scope: 'global', ts: 7, help: { id: 'h1' } },
        { from, text: '', scope: 'global', ts: 8, roll: { id: 'r2', v: 3, pend: true } }
    ];
    const A = mk(gm), txt = A.out(), kept = JSON.parse(txt);
    const B = mk([{ from, text: 'after', scope: 'global', ts: 9 }]); const nBack = B.back(txt), log = B.log();
    const before = log.map(m => m.over ? 'over' : 'live'); B.settle(); const after = log.map(m => (m.over ? m.overSay : 'live'));
    const roll = log.find(m => m.roll), hist = B.hist(log);
    const big = mk(Array.from({ length: 220 }, (x, i) => ({ from, text: 'x'.repeat(10000), scope: 'global', ts: i }))).out();
    const bad = [mk([]).back('not json'), mk([]).back('{"a":1}'), mk([]).back(JSON.stringify([7, null, { text: 'no from' }, { from, help: {} }]))];
    check('1.6.3 (finding 24): the GM\'s Table Chat is kept in this tab\'s session storage as the page goes (refreshMark, beside wp_rehost) and laid back before the table opens again: a help card and a roll held for its card actions are left out, a roll\'s worked-out result made again from its record with its marks (Applied) kept, at most 200 messages and 1.5 MB, the newest kept; each message comes back marked kept and never rides in a latecomer\'s history; once the table has opened a kept card whose attempt the host no longer holds is over (a soft record\'s and a reminder\'s stay live); a text that is no list of messages lays nothing back',
        kept.length === 6 && !kept.some(m => m.help || (m.roll && m.roll.pend)) && kept[1].res === undefined && nBack === 6 && log.length === 7 && log[6].text === 'after' && log.slice(0, 6).every(m => m.kept === 1) && !log[6].kept
        && roll.res && roll.res.v === 7 && roll.roll.dmgUsed === true && j(before) === j(['live', 'live', 'live', 'live', 'live', 'live', 'live']) && j(after) === j(['live', 'live', 'live', 'reload', 'live', 'live', 'live']) && drawn >= 2
        && hist.length === 1 && hist[0].text === 'after' && JSON.parse(big).length < 200 && big.length <= 1500000 && JSON.parse(big).pop().ts === 219 && j(bad) === j([0, 0, 0])
        && src.includes("else if (net.active && net.role === 'host') { sessionStorage.setItem('wp_rehost', '1'); var ckM = typeof chatKeepOut === 'function' ? chatKeepOut() : ''; if (ckM) sessionStorage.setItem(CHAT_KEEP, ckM); }")
        && src.includes("ck = sessionStorage.getItem(CHAT_KEEP);") && src.includes("sessionStorage.removeItem(CHAT_KEEP);") && /if \(ck\) net\._chatBack = ck;[^\n]*\n\s*startHosting\(false\);/.test(src) && /diceSessionReset\(true\); if \(typeof net\._chatBack === 'string'\) \{ var cbH = net\._chatBack; net\._chatBack = null; if \(typeof chatKeepIn === 'function'\) chatKeepIn\(cbH\); \}/.test(src)
        && /fightsBack\(\);   \/\/ 1\.6\.0: a fight its campaign kept comes back with the table\n\s*if \(typeof chatKeptSettle === 'function'\) chatKeptSettle\(\);/.test(src)
        && fs.readFileSync(path.join(kit.APP, 'scripts', 'dice.js'), 'utf8').includes("m.overSay === 'reload' ?"), j({ kept: kept.length, nBack, before, after, hist: hist.length, bad }));
}

// 1.6.3 (the combat review, finding 1; Fulllion's pick: "keep them live"): after the GM's reload a kept card whose roll a blast still owes stays live; one
// that could not come back is over, the GM is told once who still owed a roll, and each player whose own card it was is told as they come back (chatkeep, run for real)
{
    const ckSrc = between('// [netcheck:chatkeep-start]', '// [netcheck:chatkeep-end]', 'chatkeep');
    const said = [], logged = [], camp = { chars: { c_a: { id: 'c_a', name: 'Ava', ownerId: 'p_a' }, c_n: { id: 'c_n', name: 'Raider', npc: true } } };
    const api = new Function('chatLog0', 'DC', 'window', 'renderChatSoon', 'attemptRec', 'getActiveCampaign', 'toast', 'logEvent', 'var chatLog = chatLog0;\n' + ckSrc + '\nreturn { settle: chatKeptSettle, tell: reloadOverTell, log: function() { return chatLog; } };')(
        [], () => null, { wpBlastOwedHas: id => id === 'a_owedheld' }, () => {}, id => (id === 'a_attheld' ? {} : null), () => camp, s => said.push(s), (k, s) => logged.push(s));
    const from = { id: 'gm', name: 'GM', gm: true }, log = api.log();
    log.push({ from, kept: 1, due: { att: 'a_owedheld', charId: 'c_a', label: 'Blast: 2 dice at 1 yd', theirs: 1 } }, { from, kept: 1, due: { att: 'a_attheld', charId: 'c_a', label: 'Defend' } },
        { from, kept: 1, due: { att: 'a_owedgone', charId: 'c_a', label: 'Blast: 3 dice at 2 yd', theirs: 1 } }, { from, kept: 1, due: { att: 'a_bighitgo', charId: 'c_n', label: 'Big Hit' } }, { from, due: { att: 'a_notkeptx', charId: 'c_a', label: 'Live' } });
    api.settle();
    const states = log.map(m => (m.over ? m.overSay : 'live')), sentA = [], sentB = [], cA = { open: true, send: m => sentA.push(m) }, cB = { open: true, send: m => sentB.push(m) };
    api.tell(cA, 'p_a'); api.tell(cB, 'p_b');
    check('1.6.3 (the combat review, finding 1): after the GM\'s reload a kept card whose roll a blast still owes (wpBlastOwedHas) and one whose record came back stay live; one that could not come back is over, said once to the GM by character and card (a notice and the Game Record) so what is owed is rolled by hand; a player whose own card it was is told it is over as they come back, another player nothing; the player\'s app takes the word reload',
        j(states) === j(['live', 'live', 'reload', 'reload', 'live']) && said.length === 1 && /2 cards are over/.test(said[0]) && said[0].indexOf('Ava: Blast: 3 dice at 2 yd') >= 0 && said[0].indexOf('Raider: Big Hit') >= 0 && j(logged) === j(said)
        && j(sentA) === j([{ type: 'due-over', att: 'a_owedgone', say: 'reload' }]) && sentB.length === 0
        && /msg\.say === 'missed' \|\| msg\.say === 'reload' \|\| msg\.say === 'answered'\) m\.overSay = msg\.say;/.test(src) /* 1.6.3 (the release click test): and answered, a card its roll answered (moved on purpose) */ && /if \(typeof reloadOverTell === 'function'\) reloadOverTell\(conn, prof\.id\);/.test(src), j({ states, said, sentA, sentB }));
}

// 1.6.3 (the review of input): chatKeepOut writes each message out once, never every tail of the list again, and keeps the very text it kept before
{
    const ckSrc = between('// [netcheck:chatkeep-start]', '// [netcheck:chatkeep-end]', 'chatkeep');
    let calls = 0; const JC = { stringify: v => { calls++; return JSON.stringify(v); }, parse: JSON.parse };
    const mkO = log => new Function('chatLog', 'DC', 'window', 'renderChatSoon', 'attemptRec', 'JSON', ckSrc + '\nreturn chatKeepOut;')(log, () => null, {}, () => {}, () => null, JC);
    function oldOut(chatLog) {   // the text kept before, written out the old way: the longest tail of the list that fits
        var list = chatLog.filter(function(m) { return m && typeof m === 'object' && !m.help && !(m.roll && m.roll.pend); }).slice(-200).map(function(m) { if (!m.roll) return m; var o = Object.assign({}, m); delete o.res; return o; }), txt = '';
        for (var i = 0; i <= list.length; i++) { txt = JSON.stringify(list.slice(i)); if (txt.length <= 1500000) return txt; }
        return '';
    }
    const from = { id: 'gm', name: 'GM', gm: true }; let seed = 7; const rnd = n => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
    const lists = [[], [{ from, text: 'one', ts: 1 }], [{ from, text: 'x'.repeat(1600000), ts: 1 }], [{ from, text: 'x'.repeat(1600000), ts: 1 }, { from, text: 'last', ts: 2 }]];
    for (let s = 0; s < 6; s++) lists.push(Array.from({ length: 150 + rnd(120) }, (x, i) => ({ from, text: 'y'.repeat(rnd(30000)), ts: i, roll: rnd(3) ? undefined : { id: 'r' + i, v: i, pend: !rnd(9) }, res: { v: i }, help: !rnd(17) ? { id: 'h' } : undefined })));
    const same = lists.map(l => mkO(l)() === oldOut(l));
    const big = lists[lists.length - 1]; calls = 0; const outB = mkO(big)(); const callsB = calls, keptB = JSON.parse(outB).length;
    check('1.6.3 (the review of input): the GM\'s chat kept as the page goes is the very text it was (the newest messages that fit in 1.5 MB, as JSON of that list), each message written out once and no more (it was every tail of the list again, some 300 MB of work on a long chat)',
        same.every(Boolean) && callsB <= Math.min(200, big.length) && keptB > 0 && outB.length <= 1500000 && mkO(lists[2])() === '[]' && JSON.parse(mkO(lists[3])()).length === 1, j({ same, callsB, keptB }));
}

// 1.6.3 (the multiplayer review, finding 9): a rejoin sent every picture handout a player was ever shown again. The host now lists them
// (wpHandoutHave) and the player's app answers with the ids whose page its Journal lacks or holds otherwise (wpHandoutWants); the host sends
// only those (the handoutsig slice of handouts.js and the handouthave and handoutwant branches of net.js, each run for real)
pendingChecks.push((async () => { try {
    const J = JSON.stringify;
    const hoT9 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'handouts.js'), 'utf8').replace(/\r\n/g, '\n');
    const cut9 = (a, b) => { const i = hoT9.indexOf(a), k = hoT9.indexOf(b); if (i < 0 || k < i) throw new Error('handouts.js markers ' + a); return hoT9.slice(i + a.length, k); };
    const jSrc = cut9('// [netcheck:journal-start]', '// [netcheck:journal-end]'), sigSrc = cut9('// [netcheck:handoutsig-start]', '// [netcheck:handoutsig-end]');
    const files = new Map(), ls = new Map(), pay = Object.create(null);
    const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); } };
    const fetch = async (u, init) => { u = String(u);
        if (u.indexOf('/api/upload-exact?path=') === 0) { files.set(decodeURIComponent(u.slice('/api/upload-exact?path='.length)), init.body); return { ok: true }; }
        if (u.indexOf('/saves/images/journal/') === 0) { const p = 'images/journal/' + u.slice('/saves/images/journal/'.length); if (!files.has(p)) return { ok: false, status: 404 }; const b = files.get(p); return { ok: true, headers: { get: () => String(String(b).length) }, json: async () => JSON.parse(String(b)) }; }
        return { ok: false, status: 404 }; };
    let now9 = 1700000000000;
    const win9 = { wpHandoutPayload: h => Promise.resolve(pay[h.id]) };
    const env = { fetch, localStorage, document: { getElementById: () => null }, toast() {}, esc: s => String(s), showHandout() {}, handoutPopup: () => false, window: win9, FileReader: function() {}, Blob: function() {}, Date: { now: () => (now9 += 7) } };
    const names = Object.keys(env);
    const api = new Function(...names, "'use strict';\n" + jSrc + '\n' + sigSrc + '\nreturn { receive: receiveHandout };')(...names.map(n => env[n]));
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]), png2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 9, 9, 9]);
    const base = { type: 'handout', campId: 'camp1', gmId: 'u_gm', campaign: 'The Camp', gm: 'Gina' };
    await api.receive(Object.assign({}, base, { id: 'h_pic', title: 'Map of Riv', caption: 'Old', mime: 'image/png', data: png, tags: ['maps'] }));
    await api.receive(Object.assign({}, base, { id: 'h_txt', kind: 'text', title: 'Letter', caption: '', text: 'Dear Kael', tags: [] }));
    const H9 = (id, o) => Object.assign({ id, title: '', caption: '', tags: [] }, o);
    pay.h_pic = { mime: 'image/png', data: png }; pay.h_txt = { kind: 'text', text: 'Dear Kael' }; pay.h_new = { kind: 'text', text: 'New' };
    const have = async hs => Promise.all(hs.map(h => win9.wpHandoutHave(h)));
    const list1 = await have([H9('h_pic', { title: 'Map of Riv', caption: 'Old', tags: ['maps'], src: '/x.png' }), H9('h_txt', { kind: 'text', title: 'Letter', text: 'Dear Kael' }), H9('h_new', { kind: 'text', title: 'Fresh', text: 'New' })]);
    const want1 = await win9.wpHandoutWants({ campId: 'camp1', gmId: 'u_gm', list: list1 });
    const list2 = await have([H9('h_pic', { title: 'Map of Riv', caption: 'New caption', tags: ['maps'], src: '/x.png' })]);
    const want2 = await win9.wpHandoutWants({ campId: 'camp1', gmId: 'u_gm', list: list2 });
    pay.h_pic = { mime: 'image/png', data: png2 }; const list3 = await have([H9('h_pic', { title: 'Map of Riv', caption: 'Old', tags: ['maps'], src: '/y.png' })]);
    const want3 = await win9.wpHandoutWants({ campId: 'camp1', gmId: 'u_gm', list: list3 });
    const want4 = await win9.wpHandoutWants({ campId: 'camp1', gmId: 'u_other', list: list1 });   // another GM's journal holds none of them
    check('1.6.3 (the multiplayer review, finding 9) a rejoin\'s list of handouts (handouts.js wpHandoutHave and wpHandoutWants, run for real on a Journal that received a picture and a page): the player\'s app asks only for what its Journal lacks or holds in another form, a new handout, one whose caption changed, one whose picture changed, every one in another GM\'s journal, and none it holds as shown',
        J(want1) === J(['h_new']) && J(want2) === J(['h_pic']) && J(want3) === J(['h_pic']) && J(want4) === J(['h_pic', 'h_txt', 'h_new']) && list1.every(x => typeof x.s === 'string' && x.s.length < 400), J({ want1, want2, want3, want4, list1 }));
    // the host's handoutwant branch: only ids it showed that very player, each once, 400 ms apart
    const hwSrc = between('// [netcheck:handoutwant-start]', '// [netcheck:handoutwant-end]', 'handoutwant');
    const sentH = [], timers = [];
    const campW = { id: 'camp1', handouts: { a: { id: 'a' }, b: { id: 'b' }, c: { id: 'c' } }, handoutReveals: { u_a: { a: 1, b: 1 }, u_b: { c: 1 } } };
    const netW = { roster: { pA: { id: 'u_a', name: 'Ana' } } };
    const runW = (msg, peer, allowOk) => new Function('msg', 'conn', 'net', 'getActiveCampaign', 'allow', 'own', 'handoutReplay', 'setTimeout', "'use strict';\n" + hwSrc)(msg, { peer }, netW, () => campW, () => allowOk !== false, H.own, (c, cp, h) => sentH.push(c.peer + ':' + h.id), (fn, ms) => timers.push([fn, ms]));
    runW({ campId: 'camp1', ids: ['b', 'c', 'zz', 'a', 'b', 7, '__proto__'] }, 'pA'); const gaps = timers.map(x => x[1]); timers.splice(0).forEach(x => x[0]());
    const one = sentH.splice(0);
    runW({ campId: 'other', ids: ['a'] }, 'pA'); runW({ campId: 'camp1', ids: ['a'] }, 'pStranger'); runW({ campId: 'camp1', ids: ['a'] }, 'pA', false); runW({ campId: 'camp1', ids: 'a' }, 'pA');
    timers.splice(0).forEach(x => x[0]());
    check('1.6.3 (finding 9) the host\'s handout-want branch (net.js, run for real): it sends again only the handouts its own record says it showed that very player, each once, 400 ms apart; nothing for another campaign, a connection not at the table, an ask past the limit or an ask that is no list',
        J(one) === J(['pA:b', 'pA:a']) && J(gaps) === J([0, 400]) && sentH.length === 0, J({ one, gaps, more: sentH }));
    const hhSrc = between('// [netcheck:handouthave-start]', '// [netcheck:handouthave-end]', 'handouthave');
    const asks = [];
    const runH = async (msg, netO, wants) => { const out = []; new Function('msg', 'conn', 'net', 'state', 'window', 'sendFailed', "'use strict';\n" + hhSrc)(msg, { peer: 'room', open: true, send: m => out.push(m) }, netO, { appState: { activeCampaignId: 'camp1' } }, { wpHandoutWants: async m => { asks.push(m.list.length); return wants; } }, () => {}); await new Promise(r => setTimeout(r, 0)); return out.map(m => m.type + ':' + m.ids.join()); };
    const okNet = { foreign: true, syncedPeer: 'room', stream: false, gmId: 'u_gm' }, hv = { campId: 'camp1', gmId: 'u_gm', list: [{ id: 'a', s: 'x' }, { id: 'b', s: 'y' }, { id: 7, s: 'z' }] };
    const gate = [await runH(hv, okNet, ['a']), await runH(hv, okNet, []), await runH(hv, Object.assign({}, okNet, { syncedPeer: 'other' }), ['a']), await runH(Object.assign({}, hv, { gmId: 'u_x' }), okNet, ['a']), await runH(Object.assign({}, hv, { campId: 'nope' }), okNet, ['a']), await runH(hv, Object.assign({}, okNet, { stream: true }), ['a'])];
    check('1.6.3 (finding 9) a player\'s handout-have branch (net.js, run for real): from the synced host, for the campaign on screen and the GM of the snapshot, it answers with the ids its Journal wants and nothing where it wants none; an entry that is no id is left out; nothing from another host, GM or campaign, nor in the stream window',
        J(gate) === J([['handout-want:a'], [], [], [], [], []]) && J(asks) === J([2, 2]), J({ gate, asks }));
    const nw = src.replace(/\r\n/g, '\n');
    check('1.6.3 (finding 9, wired): a rejoin lists the handouts shown, one after another, and sends no picture by itself; the picture\'s bytes are made once a run (wpHandoutPayload keeps them)',
        /if \(window\.wpHandoutHave\) \{\n\s*setTimeout\(function\(\) \{\n\s*var listH = \[\], i = 0, step = function\(\) \{/.test(nw) && /conn\.send\(\{ type: 'handout-have', campId: camp\.id, gmId: /.test(nw) && /var _payKept = new Map\(\), PAY_KEPT = 64;/.test(hoT9) && /if \(_payKept\.has\(pk\)\) return _payKept\.get\(pk\);/.test(hoT9));
} catch (e) { check('1.6.3 (finding 9) the handout checks ran', false, String(e && e.stack || e)); } })());
// 1.6.3, the multiplayer review, lane A batch 2 (the session): findings 1, 6, 11, 13 and 15, each on the real slices
{
    const J = JSON.stringify;
    /* finding 1: the table's own state over a reload and a crash (the sesskeep and sessgate slices, run for real) */
    const ssSrc = between('// [netcheck:sesskeep-start]', '// [netcheck:sesskeep-end]', 'sesskeep'), sgSrc = between('// [netcheck:sessgate-start]', '// [netcheck:sessgate-end]', 'sessgate');
    const world = (o) => {
        const els = { netPassInput: { value: o.pass || '' } }, store = {}, log = [];
        const net = { active: true, role: 'host', code: 'abcdefghjk', conns: [], roster: {}, paused: !!o.paused, pausedPlayers: o.pp || {}, travelLocked: !!o.travel, stagePicked: o.picked || {}, stageMode: null, stageFallback: null, stageOverride: o.over || null, notepad: o.pad || { on: false, text: '' } };
        const camp = { id: o.campId || 'c1', items: { m1: { type: 'map' }, m2: { type: 'map' }, p1: { type: 'planner' } } };
        const env = { net, ui: id => els[id] || null, getActiveCampaign: () => camp, own: (x, k) => !!x && Object.prototype.hasOwnProperty.call(x, k), validProfileId: H.validProfileId, validKey: k => typeof k === 'string' && k.length > 0 && k.length <= 160 && !(k in Object.prototype),
            bannedIds: Object.assign({}, o.banned || {}), lastSeen: {}, HB_STALE: 8000, _pad: { fmt: o.fmt, font: o.font || '' }, recentHostCode: () => 'abcdefghjk', showCode: c => c.toUpperCase(),
            setPausedLocal: on => { net.paused = !!on; log.push('pause ' + on); }, setTravelLockLocal: on => { net.travelLocked = !!on; log.push('travel ' + on); }, refreshStageSelect: () => log.push('stage drawn'), renderNotepad: () => log.push('pad drawn'),
            setTimeout: f => f(), localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, window: { wpVoice: { on: () => !!o.voice } } };
        const names = Object.keys(env);
        const api = new Function(...names, 'function rememberHostCode(code) { var recH = { code: code, ts: 1 }; recH.sess = sessOut(); localStorage.setItem("wp_lastHost", JSON.stringify(recH)); }\n' + sgSrc + '\n' + ssSrc + '\nreturn { sessOut, sessClean, sessIn, lastHostSess, sessKeepTick, noKey: function() { return _noKeyOut; }, outNote, outList, rec: net.lastHostRec, sat: function() { return _satIds; }, satNote, satDrop };')(...names.map(n => env[n]));
        return { api, net, els, env, store, log, camp };
    };
    const A = world({ pass: ' mango ', paused: true, pp: { u_p: true, u_q: false }, travel: true, picked: { c1: { mode: null, fallback: 'm2' } }, over: 'm1', pad: { on: true, text: 'Clue: the bell' }, fmt: { spans: [] }, font: 'Inter', banned: { u_rm: true }, voice: true });
    A.api.outNote('u_rm', '<b>Rex</b>', 'removed'); A.api.noKey().u_nk = true; A.api.outNote('u_nk', 'Nia', 'nokey');
    const kept = A.api.sessOut(), keptText = J(kept);
    const B = world({}); const said = B.api.sessIn(JSON.parse(keptText));
    const back = [B.els.netPassInput.value, J(B.env.bannedIds), J(Object.keys(B.api.noKey())), J(B.api.outList().map(x => [x.id, x.name, x.how]).sort()), B.net.paused, J(B.net.pausedPlayers), B.net.travelLocked, J(B.net.stagePicked), B.net.stageOverride, B.net.stageFallback, J(B.net.notepad), B.env._pad.font, J(B.env._pad.fmt)];
    const backOk = J(back) === J(['mango', '{"u_rm":true}', '["u_nk"]', J([['u_nk', 'Nia', 'nokey'], ['u_rm', '<b>Rex</b>', 'removed']]), true, '{"u_p":true}', true, '{"c1":{"mode":null,"fallback":"m2"}}', 'm1', 'm2', '{"on":true,"text":"Clue: the bell"}', 'Inter', '{"spans":[]}'])
        && said === 'It came back with the session password, the 2 players you kept out, the pause, the player you paused, the travel lock, where players arrive and the table notepad. Voice chat did not come back. Join it again from its button.';
    const C = world({ campId: 'c2' }); const saidC = C.api.sessIn(JSON.parse(keptText));   // another campaign hosted: the password and those kept out alone
    const otherOk = C.els.netPassInput.value === 'mango' && C.env.bannedIds.u_rm === true && C.net.paused === false && C.net.travelLocked === false && !C.net.notepad.on && J(C.net.stagePicked) === '{}' && /^It came back with the session password and the 2 players you kept out\./.test(saidC);
    const D = world({ pass: 'typed' }); D.api.sessIn(JSON.parse(keptText)); const typedWins = D.els.netPassInput.value === 'typed';
    const junk = [null, 7, 'x', [], { v: 2 }, { v: 1, out: [{ id: 'constructor', how: 'removed' }, { id: 'u_a', how: 'boss' }, 5], pausedPlayers: ['u_b', '__proto__', 3], stage: { picked: { mode: 'x', fallback: '__proto__' }, over: 9 }, pad: { text: 5 }, pass: { a: 1 } }];
    const cleaned = junk.map(x => J(A.api.sessClean(x)));
    const junkOk = cleaned.slice(0, 5).every(c => c === 'null') && J(JSON.parse(cleaned[5])) === J({ campId: '', pass: '', out: [], sat: [], paused: false, pausedPlayers: ['u_b'], travelLocked: false, stage: { picked: { mode: null, fallback: null }, over: null }, pad: null, voice: false });   // sat (1.6.3, a password set mid-session), moved on purpose
    const E = world({}); const noneSaid = E.api.sessIn(null) === '' && E.api.sessIn({ v: 1 }) === '';
    const F = world({ pass: 'pw' }); F.api.sessKeepTick(); const first = F.store.wp_lastHost; F.api.sessKeepTick(); const writes1 = F.store.wp_lastHost === first;
    F.els.netPassInput.value = 'other'; F.api.sessKeepTick(); const tickOk = !!first && JSON.parse(first).sess.pass === 'pw' && writes1 && JSON.parse(F.store.wp_lastHost).sess.pass === 'other' && J(F.api.lastHostSess('abcdefghjk')) === J(JSON.parse(F.store.wp_lastHost).sess) && F.api.lastHostSess('zzz') === null;
    const recOk = J(F.api.rec()) === J({ code: 'ABCDEFGHJK', campId: 'c1' });
    const wired = src.includes("if (net.active && net.role === 'host' && typeof sessOut === 'function') { sessionStorage.setItem(SESS_KEEP, JSON.stringify(sessOut())); if (net.code) rememberHostCode(net.code); }")
        && src.includes("var sk = null; try { sk = sessionStorage.getItem(SESS_KEEP); sessionStorage.removeItem(SESS_KEEP); } catch (e) {}") && /if \(sk\) \{ try \{ net\._sessBack = JSON\.parse\(sk\); \} catch \(e\) \{\} \}[^\n]*\n[^\n]*if \(ck\) net\._chatBack = ck;/.test(src.replace(/\r\n/g, '\n'))
        && src.includes("if (resumed && !net._sessBack && typeof lastHostSess === 'function') net._sessBack = lastHostSess(resumed);")
        && /var sbH = net\._sessBack; net\._sessBack = null; _sessLast = '';\n\s*var sbW = sbH && typeof sessIn === 'function' \? sessIn\(sbH\) : '';[^\n]*\n\s*startHeartbeat\(\);/.test(src.replace(/\r\n/g, '\n'))
        && src.includes("if (typeof sessKeepTick === 'function') sessKeepTick();") && src.includes("_noKeyOut = Object.create(null); _outNames = Object.create(null);");
    check('1.6.3 (the multiplayer review, finding 1) a reload or a crash brings the table back as the GM left it (the sesskeep slice run for real): the session password, those kept out by name and why, the pause, the players paused, the travel lock, where players arrive and the table notepad with its look, kept as plain data and laid back as the table opens, said in one sentence that also says voice chat must be joined again; for another campaign only the password and those kept out; a password typed again wins; what is read back is data, junk cleaned away; the heartbeat writes the record beside the code only when it changed; a reload keeps it in session storage and a resumed code takes the crash record',
        backOk && otherOk && typedWins && junkOk && noneSaid && tickOk && recOk && wired, J([back, said, saidC, typedWins, cleaned[5], noneSaid, tickOk, recOk, wired]));
    /* 1.6.3 (a password set mid-session): who sat at the table comes back with a reload or a crash, beside the password, and never someone kept out */
    {
        const SA = world({ pass: 'pw', banned: { u_rm: true } }); SA.api.satNote('u_s1'); SA.api.satNote('u_s2'); SA.api.satNote('u_s3'); SA.api.satDrop('u_s3'); SA.api.satNote('constructor');
        const satKept = J(SA.api.sessOut().sat);
        const SB = world({}); const satSaid = SB.api.sessIn(Object.assign(JSON.parse(J(SA.api.sessOut())), { sat: ['u_s1', 'u_s2', 'u_rm', 'u_s1', '__proto__', 7] }));
        const satBack = J(Object.keys(SB.api.sat()).sort());
        const SC = world({}); SC.api.sessIn({ v: 1, pass: 'pw', sat: 'u_s1' }); const satJunk = Object.keys(SC.api.sat()).length;
        check('1.6.3 (a password set mid-session, the sesskeep and sessgate slices run for real): the players seated this session are kept as plain ids beside the password (a removed one is not, nor an id the rule refuses), laid back as the table opens, each once, never one the session keeps out, and said in no sentence; a list that is no list brings none',
            satKept === J(['u_s1', 'u_s2']) && satBack === J(['u_s1', 'u_s2']) && satSaid === 'It came back with the session password and the player you kept out.' && satJunk === 0, J([satKept, satBack, satSaid, satJunk]));
    }
    /* findings 6 and 15: the reconnect holds the board under a bar of its own, keeps trying slowly for five minutes, and offers Rejoin (the reconnbar slice and scheduleReconnect run for real) */
    const rbSrc = between('// [netcheck:reconnbar-start]', '// [netcheck:reconnbar-end]', 'reconnbar'), schedSrc = (() => { const i = src.indexOf('function scheduleReconnect() {'); return src.slice(i, src.indexOf('\n}\n', i) + 2); })();
    const rw = (o) => {
        const els = {}, el = id => els[id] || (els[id] = { id, style: {}, hidden: false, textContent: '', value: '' }), log = [];
        els.netJoinPassInput = { value: o.pass || '' };
        const net = { reconnecting: false, role: 'client', code: o.code || 'abcdefghjk' }, reconn = { tries: 0, timer: null, code: o.code || 'abcdefghjk', name: 'Mira', pending: false, gen: 0, since: 0 };
        let clock = o.now || 1000000;
        const env = { net, reconn, ui: el, RECONNECT_TRIES: 30, getProfile: () => ({ name: 'Mira' }), showCode: c => c.toUpperCase(), refreshPauseUi: () => { log.push('ui ' + net.reconnecting); if (typeof api !== 'undefined') api.draw(); },
            giveUpAndRestore: m => { reconn.pending = false; log.push('gaveup ' + m); api.hold(false); }, leaveSession: s => log.push('leave ' + s), joinSession: (c, n, r) => log.push('join ' + c + ' ' + n + ' ' + !!r), toast: t => log.push('toast ' + t),
            setIndicator: () => {}, setStatus: s => log.push('status ' + s.slice(0, 20)), setTimeout: (f, ms) => { log.push('wait ' + ms); return 1; }, Date: { now: () => clock }, getComputedStyle: () => ({ top: '87px' }) };
        const names = Object.keys(env); let api;
        api = new Function(...names, rbSrc + '\n' + schedSrc + '\nreturn { sched: scheduleReconnect, hold: reconnHold, draw: reconnDraw, stop: reconnStop, giveUp: reconnGiveUp, go: rejoinGo, drop: rejoinDrop, wait: reconnWait, over: reconnOver, WORDS: RECONN_WORDS };')(...names.map(n => env[n]));
        return { api, els, net, reconn, log, tick: ms => { clock += ms; } };
    };
    const R = rw({ pass: 'pw' }); R.api.sched();
    const held = R.net.reconnecting === true && R.els.reconnBar.style.display === 'flex' && R.els.reconnText.textContent === 'Reconnecting to the GM. What you do now will not reach the table.' && R.els.reconnStop.hidden === false && R.els.reconnRejoin.hidden === true && R.els.reconnBar.style.top === '87px';
    const waits = [1, 2, 30, 31, 32, 35, 36, 99].map(n => R.api.wait(n));
    const overs = [R.api.over(29, 0, 10 ** 9), R.api.over(30, 1000, 1000 + 299999), R.api.over(30, 1000, 1000 + 300000), R.api.over(45, 1, 300001)];
    R.reconn.tries = 30; R.tick(200000); R.api.sched(); const slowGoing = R.reconn.pending === true && R.log.includes('wait 5000') && !R.log.some(l => /^gaveup/.test(l));
    R.tick(100001); R.api.sched();
    const gaveUp = R.log.some(l => l === 'gaveup Could not get back to the GM\u2019s table for five minutes. It may have closed, or a network is down. Join again with the room code when it is back.')   /* 1.6.3: the words of finding 10, which guess nothing of the session, joined to finding 6's five minutes at the merge, moved on purpose */ && R.net.reconnecting === false && R.els.reconnBar.style.display === 'flex' && R.els.reconnRejoin.hidden === false && R.els.reconnStop.hidden === true && /five minutes/.test(R.els.reconnText.textContent);
    R.els.netJoinPassInput.value = ''; R.api.go();
    const rejoined = R.log[R.log.length - 1] === 'join abcdefghjk Mira false' && R.els.netJoinPassInput.value === 'pw' && R.els.netCodeInput.value === 'ABCDEFGHJK' && R.els.reconnBar.style.display === 'none' && R.reconn.since === 0;
    const S = rw({}); S.api.sched(); S.api.stop();
    const stopped = J(S.log.filter(l => /^(leave|gaveup)/.test(l))) === J(['leave true', 'gaveup You stopped trying to reach the GM\u2019s table.']) && S.els.reconnRejoin.hidden === false && S.els.reconnText.textContent === 'You stopped trying to reach the GM\u2019s table.';
    S.api.drop(); const dropped = S.els.reconnBar.style.display === 'none';
    const Q = rw({}); Q.api.stop(); const quietStop = !Q.log.some(l => /^(leave|gaveup)/.test(l));
    /* the review of findings 6 and 15: a player whose link dropped and who then hosts. The hold and a Rejoin left behind never show on the
       hosting screen, Stop trying there does nothing (it ended the new table and dropped every player), and startHosting lets both go beside
       its cancelReconnect */
    const HB = rw({}); HB.api.sched(); HB.net.role = 'host'; HB.api.draw(); const hbHidden = HB.els.reconnBar.style.display === 'none';
    const hbLog = HB.log.length; HB.api.stop(); const hbNoStop = HB.log.length === hbLog && HB.net.reconnecting === true;
    const HO = rw({}); HO.api.sched(); HO.api.giveUp('gone'); HO.net.role = 'host'; HO.api.draw(); const hoHidden = HO.els.reconnBar.style.display === 'none';
    HO.net.role = 'client'; HO.api.draw(); const hoBack = HO.els.reconnBar.style.display === 'flex';   // the same offer, on a player's screen again: drawn as before
    const shSrc = (() => { const shN = src.replace(/\r\n/g, '\n'), i = shN.indexOf('function startHosting(forceFresh) {'); return i < 0 ? '' : shN.slice(i, shN.indexOf('\n}\n', i)); })();
    const shLets = /\n\s*cancelReconnect\(\);[^\n]*\n\s*if \(typeof reconnHold === 'function' && net\.reconnecting\) reconnHold\(false\);[^\n]*\n\s*if \(typeof rejoinDrop === 'function'\) rejoinDrop\(\);[^\n]*\n\s*if \(net\.foreign\) \{/.test(shSrc);
    const hostSafe = hbHidden && hbNoStop && hoHidden && hoBack && shLets;
    check('the review of 1.6.3 (findings 6 and 15): a player who hosts after their link dropped is no longer held: startHosting lets the hold and a Rejoin offer go beside cancelReconnect, before the foreign path, and a hosting screen never shows the bar nor acts on Stop trying, which ended the new table and dropped every player (the reconnbar slice run for real)',
        hostSafe, J([hbHidden, hbNoStop, hoHidden, hoBack, shLets]));
    const nsrc = src.replace(/\r\n/g, '\n');
    const gates = (nsrc.match(/\.selfPaused \|\| [\w.]+\.selfHeld \|\| [\w.]+\.reconnecting/g) || []).length === 7 && /var frozenMe = \(net\.paused \|\| net\.selfPaused \|\| net\.selfHeld \|\| net\.reconnecting\) && isClient;/.test(nsrc)
        && /var reconMe = !!net\.reconnecting && isClient;[^\n]*\n\s*if \(banner\) \{\n\s*banner\.style\.display = frozenMe && !reconMe \? 'block' : 'none';/.test(nsrc)
        && nsrc.includes("if (typeof reconnHold === 'function' && net.reconnecting) reconnHold(false);") && nsrc.includes("if (typeof reconnHold === 'function') reconnHold(false);   // 1.6.3 (finding 15): the board is let go")
        && J([['whiteboard.js', 7], ['datamap.js', 1], ['sheets.js', 2]].map(([f, n]) => (fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').match(/\.selfPaused \|\| [\w.]+\.selfHeld \|\| [\w.]+\.reconnecting/g) || []).length === n)) === J([true, true, true])
        && /<div id="reconnBar" role="status" aria-live="polite" style="display:none;"><span id="reconnText"><\/span><button class="tool ghost" id="reconnStop"/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'));
    check('1.6.3 (the multiplayer review, findings 6 and 15) a player\'s reconnect: the board is held as a paused table is, under a bar of its own in the owner\'s words with Stop trying, where the pause banner stands; the fast tries then slower ones (5, 10, 15, 20 and 30 s) until five minutes have passed since the link dropped, then this app gives up and the bar offers a one-press Rejoin that dials the same code, name and password; Stop trying lets the dial go and offers the same, and does nothing when nothing is under way; every client gate that holds a paused player holds a reconnecting one, the snapshot and a give-up let the board go',
        held && J(waits) === J([1200, 2500, 2500, 5000, 10000, 30000, 30000, 30000]) && J(overs) === J([false, false, true, true]) && slowGoing && gaveUp && rejoined && stopped && dropped && quietStop && gates,
        J([held, waits, overs, slowGoing, gaveUp, rejoined, stopped, dropped, quietStop, gates, R.log.slice(-6)]));
    /* finding 11: closing Waypoint while hosting asks first (the closeask slice, run for real) */
    const caSrc = between('// [netcheck:closeask-start]', '// [netcheck:closeask-end]', 'closeask');
    const cw = (host, ua) => {
        const log = [], asks = [], win = { addEventListener: (k, f) => { win['on' + k] = f; } };
        const net = { active: !!host, role: host ? 'host' : 'client', code: 'abcdefghjk' };
        const env = { net, window: win, navigator: { userAgent: ua || 'Mozilla/5.0 Chrome/140' }, showConfirm: (t, cb, o) => asks.push({ t, cb, o }), leaveSession: () => { log.push('end'); net.active = false; }, rememberHostCode: c => log.push('kept ' + c), setTimeout: f => f() };
        const names = Object.keys(env); new Function(...names, caSrc)(...names.map(n => env[n]));
        return { win, net, log, asks };
    };
    const ans = async (a) => { const W = cw(true); const p = W.win.wpCloseAsk(); W.asks[0].cb(a); return { a: await p, log: W.log, t: W.asks[0].t, o: W.asks[0].o, W }; };
    pendingChecks.push((async () => {
        const end = await ans(true), wait = await ans('alt'), cancel = await ans(false), off = cw(false), offA = await off.win.wpCloseAsk();
        const be = (W, ok) => { const e = { prevented: false, preventDefault() { this.prevented = true; }, returnValue: 'x' }; W.win.onbeforeunload(e); return [e.prevented, e.returnValue]; };
        const brow = cw(true), electron = cw(true, 'Mozilla/5.0 Waypoint Electron/37.2.0'), after = end.W;
        const beOk = J(be(brow)) === J([true, '']) && J(be(electron)) === J([false, 'x']) && J(be(after)) === J([false, 'x']) && J(be(off)) === J([false, 'x']);
        check('1.6.3 (the multiplayer review, finding 11) closing Waypoint while hosting asks first (the closeask slice, run for real): three answers by their buttons alone, End the session for everyone (the clean end, then the window closes), Close and let players wait (the code kept fresh beside the table\'s state) and Cancel; nothing is asked off a table; in a browser beforeunload gives the browser\'s question while hosting, never in the desktop app (its shell asks: shellguard.closeGuard), never once the answer was to close, never off a table; the app\'s own Refresh asks nothing',
            end.a === 'close' && J(end.log) === J(['end']) && wait.a === 'close' && J(wait.log) === J(['kept abcdefghjk']) && cancel.a === 'cancel' && cancel.log.length === 0 && offA === 'close' && off.asks.length === 0
            && end.t === 'You are hosting a table. Close Waypoint?' && J(end.o) === J({ noEnter: true, yes: 'End the session for everyone', alt: 'Close and let players wait', no: 'Cancel' }) && beOk && /function refreshGo\(\) \{[^\n]*\n\s*_unloadOk = true;/.test(nsrc),
            J([end.a, end.log, wait.a, wait.log, cancel.a, offA, beOk, end.o]));
    })());
    /* finding 13: Copy invite (the invite slice, run for real) */
    const inv = new Function(between('// [netcheck:invite-start]', '// [netcheck:invite-end]', 'invite') + '\nreturn inviteLine;')();
    const ixh = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8');
    check('1.6.3 (the multiplayer review, finding 13) Copy invite copies one short plain line that names the room code, never the password, and says one is sent apart where it is set; the button stands beside Copy code in one frame of the app\'s own parts',
        inv('AB2CD-EF3GH', false) === 'Join my Waypoint VTT table at https://waypointvtt.com/join/AB2CD-EF3GH or press Join a game in Waypoint VTT and type the room code AB2CD-EF3GH.' && inv('WP-AB2CD-EF3GH', true) === 'Join my Waypoint VTT table at https://waypointvtt.com/join/WP-AB2CD-EF3GH or press Join a game in Waypoint VTT and type the room code WP-AB2CD-EF3GH. I will send you the password.'
        && /^[^.]*https:\/\/waypointvtt\.com\/join\/AB2CD-EF3GH /.test(inv('AB2CD-EF3GH', false)) && inv('A B/C?', false).includes('/join/A%20B%2FC%3F ')
        && /<span class="ui-seg"><button class="tool ghost net-copy-btn" id="netCopyBtn"[^>]*>[^\n]*<\/button><button class="tool ghost net-invite-btn" id="netInviteBtn"[^>]*><i class="wib wi-chain"><\/i> Copy invite<\/button><\/span>/.test(ixh) && !/id="net(Copy|Invite)Btn"[^>]* style=/.test(ixh) && ['\n.net-copy-btn { padding: 2px 8px; }', '\n.net-invite-btn { padding: 2px 10px; }'].every(r => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8').replace(/\r\n/g, '\n').includes(r)) /* 1.6.4 (Fulllion, 2026-11-25, "Move the inline styles"): the style moved to the style sheet, moved on purpose */ /* 1.6.4 (Fulllion, 2026-11-25, "Use these drawings"): Copy invite wears the chain before its words (moved on purpose) */ && src.includes("var _inviteBtn = ui('netInviteBtn');"), J([inv('X', false), inv('X', true)]));
}
T.finish();
