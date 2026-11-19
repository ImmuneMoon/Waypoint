/* checkkit.js: what the test suites that came out of systemcheck.js and netcheck.js share, so that no suite keeps its own copy
   (docs/REFACTOR_SPLIT_PLAN.md, "Tests move with their area", 2026-11-18). It is not a suite: its name does not end in check.js, so
   no CI step runs it.

   Why it exists. The two giant suites grew with the app's giant scripts, and as each area of the app moves into a part of its own
   (tools/srcjoin.js says what a part is), that area's tests move too, into a suite named for the area that reads the part by its
   own name. The moved tests keep their own words and harnesses; what they took from the giant suite's top (the check function, the
   slice helpers, the wire's packer emulation) comes from here.

   Requiring it installs srcjoin first, so that a read of a split script answers its joined text, exactly as in the giant suites.

   What it offers:
   - suite(style): { check, pending, finish, counts }. check(name, ok, detail) prints one line exactly as the suite it came from did
     ('system' for systemcheck's form, 'net' for netcheck's, 'whole' for a suite holding both, whose failures keep their whole
     detail). pending is a list a suite pushes its asynchronous checks onto, and
     finish() waits for them, prints the summary and exits 1 on any failure. A suite that never reaches finish() (a promise nothing
     answers) is caught by the exit guard both giants have: it prints a failure and exits 1.
   - joined(name): a script's text as srcjoin answers it (a split root's joined text), with CRLF read as LF.
   - part(name): a part's own text, read by its name (srcjoin.raw), with CRLF read as LF. It throws for a file that is not a part, so
     a test that says it reads a part really does. cut(name, a, b): that text from a up to the first b after it, as a suite's own
     slicer of the joined sheets.js cut it before the lines moved into the part. cutEnd(name, a): that text from a to the end of the
     part's body, for a slice of the joined text that ran from a in the part to the root's first line after it (area 7: refreshErrors
     ends sysederr.js, and a slice from it to errorCell, which stayed in sheets.js, is the part from refreshErrors to its end).
   - familyCount(root, x): how often a string, or a regex (read as global), stands in a split root's whole family: its joined text,
     which is the root's own lines and every part's body, so the figure is the one the count gave before the cut. A count that a
     check compares with an exact figure is made over the family, never over one part or the root's own lines: there a new
     occurrence in another file of the family would pass unseen (the review of next area 4, 2026-11-19; splitcheck point 7d holds it).
   - defOf(root, name): the text (CRLF read as LF) of the one file of a split root's family that holds the top-level definition
     "function name(": the root's own lines, or a part read by its name, found where the joined text first holds it at a line's
     start, however far indented (the least indented such line: whiteboard.js's code keeps a two-space indent; the review of next
     area 5); null where no file does. A helper that cuts a function out by a name built at run time ('function ' + name) cuts it from
     this text, so the area's tests read the code where it now lives (the review of next area 4; splitcheck point 7e holds it).
   - wbState(which), netState(which): a split root's own state lines that a part reads and sets through setters (whiteboard.js's blasts and
     Image Library, net.js's fights), for a harness that runs one of the part's slices on its own.
   - sheetsSlicer(label), plainPage(): systemcheck's slicer of the joined sheets.js and its page of plain objects, as its lighting
     block defines them, for the blocks that came out of it (timerulecheck's K5 scope).
   - netSlices(who): the slice helpers netcheck has at its top, over the joined net.js, each also able to read a part by name:
     between(a, b, label, file), tryBetween(a, b, file), fnSrc(start, end, label, file), range(file, a, b) (the text from a up to b,
     both in the part) and lineOf(k). A call that names a part's file reads that part; one that names none reads the joined net.js.
     ordersSrc beside them is the fights' orders slice (netfight.js, read by its name), which every net suite that runs a fight loads.
   - netHarness(who): the harness pieces netcheck keeps at its top (helpersSrc, storage, H, ownKeySrc, siSrc, fightIn, mkConn), made once a
     run, which netcheck and the suites that came out of it with area 9 share.
   - netGate(who): the admission gate's harness netcheck kept at its top (the gate's and its neighbours' slices, hmacRef, the fingerprints,
     runGate and the other slices made functions, harness(opts)), made once a run, which netjoincheck and nettransportcheck share.
   - packCheck(v): PeerJS's BinaryPack refusals, which netcheck runs on every send of a harness (moved here from netcheck).
   - url(name): a file URL of a script, for import(). fresh(root, tag): the file URLs of a private copy of a split root and its
     parts, by name, so that an import runs the real split wiring (a part as a module of its own). APP and SCRIPTS: the app's folders.
   - sysCore(), starterFile(n), flatKids(node), presets(), sevenList(), ownLines(src), css0911(): systemcheck.js's top (systemcore.js
     and formula.js, the names it unpacks, the presets, and its helpers), which it and the suites that came out of it start from. */
'use strict';
const srcjoin = require('./srcjoin');
srcjoin.install();
const fs = require('fs'), path = require('path');

const APP = path.join(__dirname, '..', 'system', 'app');
const SCRIPTS = path.join(APP, 'scripts');
const lf = t => String(t).replace(/\r\n/g, '\n');

// One suite's counts and its check function. The forms differ only in spacing and in how a failure's detail is written: 'net' as
// netcheck writes it (a string as it is, anything else as JSON, whole), 'system' as systemcheck writes it (cut at 300 characters), and
// 'whole' for a suite whose checks came from both giants (linkcheck): an ok line as both write it, a failure's detail as netcheck
// writes it, so the host's blocks, whose details are the long JSON of every message sent, keep all of it (the review of area 3).
function suite(style) {
    let pass = 0, fail = 0, summed = false;
    const pending = [];
    process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
    const check = style === 'net' || style === 'whole'
        ? (name, ok, detail) => { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }
        : (name, ok, detail) => { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } };
    // Waits for every pending check, then prints the summary line both giants print and exits 1 on a failure.
    async function finish() {
        // A pending check may push another while it runs (netsessioncheck's Journal block pushes one from inside the cluster F block): wait
        // again until no new one was added, so that a check landing late is counted before the summary and a failure there still exits 1
        // (found at step 4 of "Finishing the test split", 2026-11-19: in netcheck it landed before the summary only because other work was slower)
        let seen = -1;
        while (seen !== pending.length) { seen = pending.length; await Promise.all(pending); }
        summed = true;
        console.log('\n' + pass + ' passed, ' + fail + ' failed.');
        if (fail) process.exit(1);
    }
    return { check, pending, finish, counts: () => ({ pass, fail }) };
}

function joined(name) { return lf(fs.readFileSync(path.join(SCRIPTS, name), 'utf8')); }
function part(name) {
    if (!srcjoin.isPart(name)) throw new Error('checkkit: ' + name + ' is not a part of a split script');
    return lf(srcjoin.raw(path.join(SCRIPTS, name), 'utf8'));
}
// The text of a part read by its name, from a (included) up to b (not included, the first b after a): what each suite's own sheets.js
// slicer (cutL, cutN, cutV and their kin) cuts from the joined text, cut instead from the part that now holds both anchors.
function cut(name, a, b) {
    const t = part(name), i = t.indexOf(a), k = t.indexOf(b, i + 1);
    if (i < 0 || k < 0) throw new Error('checkkit: ' + a + ' to ' + b + ' not found in ' + name);
    return t.slice(i, k);
}

// The text of a part read by its name, from a (included) to the end of its body (the line break before `// [split:body-end]` included):
// what a slice of the joined text from a up to the root's first line after the part held, cut from the part that holds a.
function cutEnd(name, a) {
    const t = part(name), i = t.indexOf(a), k = t.indexOf('\n// [split:body-end]', i + 1);
    if (i < 0 || k < 0) throw new Error('checkkit: ' + a + ' to the end of ' + name + ' not found');
    return t.slice(i, k + 1);
}

// The joined text of a root, read once a run (no suite changes a script while it runs).
const famText = new Map(), famOf = r => { if (!famText.has(r)) famText.set(r, joined(r)); return famText.get(r); };
// How often x (a string, or a regex read as global) stands in the whole family of a split root: its joined text, which is the root's
// own lines and every part's body in their old order, with no glue line, header or install wrapper. So the figure is the one the count
// gave before the root was cut, and no file of the family can gain an occurrence unseen. Throws for a name that is no split root.
function familyCount(root, x) {
    if (!srcjoin.isRoot(root)) throw new Error('checkkit: ' + root + ' is not a split root');
    const t = famOf(root);
    if (x instanceof RegExp) return (t.match(new RegExp(x.source, x.flags.indexOf('g') >= 0 ? x.flags : x.flags + 'g')) || []).length;
    return t.split(String(x)).length - 1;
}

// The text of the file of a split root's family that holds the top-level definition "function name(": where the joined text first
// holds it at a line's start, srcjoin.where says which real file that line stands in, and that file's own text is answered (the
// root's own lines through srcjoin.raw, a part by its name), CRLF read as LF; null where no line of the family begins so. A helper
// that slices a function out by a name it is handed slices it from this text: the same slice, read where the code lives.
const defCache = new Map();
// A line's start may be indented (whiteboard.js's code keeps a two-space indent, in its own lines and in its parts): of the lines that
// begin, after spaces or tabs, with "function name(", the least indented is the definition, the first of those where several are (the
// review of next area 5, 2026-11-19); for a family whose definitions stand at the left margin that is the first line there, as before.
function defOf(root, name) {
    if (!srcjoin.isRoot(root)) throw new Error('checkkit: ' + root + ' is not a split root');
    const t = famOf(root), need = 'function ' + name + '(';
    let at = -1, ind = Infinity;   // the definition's line start, or -1 for none, and its indent
    for (let i = t.indexOf(need); i >= 0 && ind > 0; i = t.indexOf(need, i + 1)) {
        const ls = t.lastIndexOf('\n', i - 1) + 1, pre = t.slice(ls, i);
        if (/^[ \t]*$/.test(pre) && pre.length < ind) { ind = pre.length; at = ls; }
    }
    if (at < 0) return null;
    const w = srcjoin.where(root, t.slice(0, at).split('\n').length);
    if (!w) return null;
    if (!defCache.has(w.file)) defCache.set(w.file, w.file === root ? lf(srcjoin.raw(path.join(SCRIPTS, root), 'utf8')) : part(w.file));
    return defCache.get(w.file);
}

// systemcheck's slicer of the joined sheets.js, as its blocks define it (cutL in the lighting L4 block): shL the text with CRLF read as
// LF, cutL(a, b) the text from a up to the first b after it, oneL(a) the line that begins at a. label names the slicer in its error.
function sheetsSlicer(label) {
    const shL = joined('sheets.js'), NL = '\n';
    const cutL = (a, b) => { const i = shL.indexOf(a), k = shL.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error(label + ' slice: ' + a); return shL.slice(i, k); }, oneL = a => cutL(a, NL);
    return { shL, cutL, oneL };
}
// systemcheck's page of plain objects, as its blocks define it (the lighting L4 block): feL(tag, text) an element that keeps its children,
// docL a document that makes them, walkL and findL the elements under one (findL by a class), pickedL the values of a select's picked options
function plainPage() {
    const feL = (tag, text) => ({ tag, className: '', textContent: text === undefined ? '' : String(text), children: [], title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, get childNodes() { return this.children; }, appendChild(x) { this.children.push(x); return x; } });
    const docL = { createElement: t => feL(t), createTextNode: t => feL('#text', t) }, walkL = (n, p, acc) => { if (p(n)) acc.push(n); (n.children || []).forEach(k => walkL(k, p, acc)); return acc; }, findL = (n, c) => walkL(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []), pickedL = s => s.children.filter(o => o.selected).map(o => o.value);
    return { feL, docL, walkL, findL, pickedL };
}

// The state a split root keeps for a part and the setters the part sets it through (area 8 of docs/REFACTOR_SPLIT_PLAN.md: whiteboard.js
// keeps the blasts' and the Image Library's state above the slices that once declared it). A harness that runs such a slice on its own
// puts these lines of the root's real text before it, so the slice finds the names it reads and the setters it calls. 'blast': blasts,
// coneAim, blastDrag, blastsSet and coneAimSet, which stand above the line `// [split:wbblast.js]`; 'imglib':
// _imgLibPick, _castSel, _castOrder, imgLibPickSet and castSelSet, which stand above the line `// [split:wbimglib.js]`.
const STATE_AT = { blast: ['  var blasts = [], coneAim = null, blastDrag = null;', '// [split:wbblast.js]'],
    imglib: ['  var _imgLibPick = null, _castSel = {}, _castOrder = [];', '// [split:wbimglib.js]'] };   // each up to its part's marker in the root's own lines
function wbState(which) {
    const ab = STATE_AT[which]; if (!ab) throw new Error('checkkit: no state ' + which);
    const t = lf(srcjoin.raw(path.join(SCRIPTS, 'whiteboard.js'), 'utf8')), i = t.indexOf(ab[0]), k = t.indexOf(ab[1], i + 1);
    if (i < 0 || k < 0 || t.indexOf(ab[0], i + 1) >= 0) throw new Error('checkkit: the ' + which + ' state of whiteboard.js not found');
    return t.slice(i, k);
}
// The same for net.js (area 9): 'fight' is _fightN, fightNSet, the three limiters (hitLimit, deckLimit, declareLimit), _hitAsk and hitAskSet, which
// stand in net.js's own lines above the fights' code (`// [split:netfight.js]`, or before the cut `// [netcheck:holds-start]`). A harness that runs
// the holds, orders or targethit slice, or a branch of handleMessage that reads one of them, puts these lines before it.
const NET_STATE_AT = { fight: ['var _fightN = 0;', ['// [split:netfight.js]', '// [netcheck:holds-start]']] };
function netState(which) {
    const ab = NET_STATE_AT[which]; if (!ab) throw new Error('checkkit: no net.js state ' + which);
    const t = lf(srcjoin.raw(path.join(SCRIPTS, 'net.js'), 'latin1')), i = t.indexOf(ab[0]);
    const ks = ab[1].map(e => t.indexOf(e, i + 1)).filter(k => k > i), k = ks.length ? Math.min(...ks) : -1;
    if (i < 0 || k < 0 || t.indexOf(ab[0], i + 1) >= 0) throw new Error('checkkit: the ' + which + ' state of net.js not found');
    return Buffer.from(t.slice(i, k), 'latin1').toString('utf8');
}

// netcheck's slice helpers. Each takes the text it cuts by the file it names: a part by its name, else the joined net.js.
function netSlices(who) {
    who = who || 'netcheck';
    const src = joined('net.js'), parts = {};
    const textOf = file => (file ? (parts[file] || (parts[file] = part(file))) : src);
    const where = file => (file || 'net.js');
    function between(a, b, label, file) {
        const t = textOf(file), i = t.indexOf(a), k = t.indexOf(b);
        if (i < 0 || k < 0 || k <= i) throw new Error(who + ': marker ' + label + ' not found in ' + where(file));
        if (t.indexOf(a, i + 1) >= 0 || t.indexOf(b, k + 1) >= 0) throw new Error(who + ': marker ' + label + ' is not unique');
        return t.slice(i + a.length, k);
    }
    const tryBetween = (a, b, file) => { try { return between(a, b, a, file); } catch (e) { return null; } };
    const fnSrc = (start, end, label, file) => { const t = textOf(file), i = t.indexOf(start), k = t.indexOf(end, i + 1); if (i < 0 || k < 0) throw new Error(who + ': ' + label + ' not found in ' + where(file)); return t.slice(i, k); };
    // The text from a up to (not including) b, both found in the part named: src.slice(src.indexOf(a), src.indexOf(b)) on the part.
    const range = (file, a, b) => { const t = textOf(file), i = t.indexOf(a), k = t.indexOf(b); if (i < 0 || k < 0 || k < i) throw new Error(who + ': ' + a + ' to ' + b + ' not found in ' + where(file)); return t.slice(i, k); };
    // only a string names a part, as netcheck's own lineOf read it: a lineOf handed to map() is given each index as its second argument
    const lineOf = (k, file) => { const t = textOf(typeof file === 'string' ? file : undefined), i = t.indexOf(k); return i < 0 ? '' : t.slice(i, t.indexOf('\n', i)); };
    // fold 2 (backlog 152): fights by id. Every reader of a fight asks the orders slice (fightsOn, fightOfTok, the one judge orderOfIn, the
    // API by id), so every harness that runs one loads it and none passes on an old path. It stands in netfight.js, a part of net.js, and is
    // read here once for every net suite (the review of "Finishing the test split" step 5: thirteen suites had each kept a copy of this line).
    const ordersSrc = between('// [netcheck:orders-start]', '// [netcheck:orders-end]', 'orders', 'netfight.js');
    // broadcast() as it runs on both ends (netfog.js, a part of net.js): the one-module worlds, a player's page and the admission gate's harness
    // all load it, so it is read here once (step 6 of "Finishing the test split", 2026-11-19: netGate, netfogcheck and netcheck each kept a line)
    const broadcastSrc = between('// [netcheck:broadcast-start]', '// [netcheck:broadcast-end]', 'broadcast', 'netfog.js');
    return { src, between, tryBetween, fnSrc, range, lineOf, ordersSrc, broadcastSrc };
}

// The harness pieces netcheck keeps at its top, which the suites that came out of it with area 9 (netfogcheck, netfightcheck) share, made
// once a run and handed to each the same (docs/REFACTOR_SPLIT_PLAN.md, area 9). helpersSrc: net.js's helpers slice; storage: a localStorage
// of plain objects, and H: the helpers built over it (own, validProfileId, the table keys, the faces, the key proof's hmacHex and authData);
// ownKeySrc: the real own-key one-liners (own, validKey, campOf); siSrc(): sanitizeItem as it runs, with wireNum (netfog.js, a part of
// net.js, read by its own name) and wireWbItem; fightIn(cs, mapId): a fight by its map in a copy keyed by the fights' own ids; mkConn(peer,
// open): a connection that keeps what it was sent. Each is the very code netcheck held, so a block moved out of it runs as it ran there.
let netH = null;
function netHarness(who) {
    if (netH) return netH;
    who = who || 'netcheck';
    const { src, between, lineOf } = netSlices(who);
    const helpersSrc = between('// [netcheck:helpers-start]', '// [netcheck:helpers-end]', 'helpers');
    const storage = (() => { let m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, clear: () => { m = {}; } }; })();
    const H = new Function('localStorage', 'crypto', helpersSrc + '\nreturn { own, validProfileId, newKey, tableKeys, tableKeyFor, rememberTableKey, safeAvatar, cleanRosterName, cleanWaitingItem, cleanFace, faceView, FACE_PICS, charFacePlan, hmacHex: typeof hmacHex === "function" ? hmacHex : null, authData: typeof authData === "function" ? authData : null, sameStr: typeof sameStr === "function" ? sameStr : null, retryGen: typeof retryGen === "function" ? retryGen : null };')(storage, globalThis.crypto);
    const ownKeySrc = [lineOf('function own('), lineOf('function validKey('), lineOf('function campOf(')].join('\n') + '\n';   // the real own-key one-liners
    const siSrc = () => {
        const a = src.indexOf('function sanitizeItem('), b = src.indexOf('\n}\n', src.indexOf('function wireWbItem(', a));
        if (a < 0 || b < a) throw new Error(who + ': sanitizeItem and wireWbItem not found in net.js');
        return (part('netfog.js').match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0] + '\n' + src.slice(a, b + 3);   // wireNum stands in netfog.js, a part of net.js
    };
    const fightIn = (cs, mapId) => { if (!cs || typeof cs !== 'object') return undefined; const k = Object.keys(cs).find(x => !!cs[x] && cs[x].mapId === mapId); return k === undefined ? undefined : cs[k]; };   // a fight by its map, in a copy keyed by the fights' own ids
    const mkConn = (peer, open) => ({ peer, open: open !== false, sent: [], send(m) { this.sent.push(m); } });
    netH = { helpersSrc, storage, H, ownKeySrc, siSrc, fightIn, mkConn };
    return netH;
}

// The admission gate's harness that netcheck kept at its top, which netjoincheck and nettransportcheck share (docs/REFACTOR_SPLIT_PLAN.md,
// "Finishing the test split", step 4, 2026-11-19), made once a run and handed to each the same: the slices of the gate, the join queue,
// broadcast, chat, the roster, its cleaner and the away map (gateSrc to awaySrc), the suite's own HMAC (hmacRef), the helpers built over
// netHarness's storage (HS, RC, HT), the names a slice is given (ENV_NAMES, pre), the two certificate fingerprints a harness connection
// carries (FPP, FPH, FPTAIL, pcStub), each slice made a function (runGate to runAway), and harness(opts), a fresh host per scenario. Each is
// the very code netcheck held, word for word, so a block moved out of it runs as it ran there; tryBetween is netSlices' own, which is the
// same one-liner netcheck had beside them.
let netG = null;
function netGate(who) {
    if (netG) return netG;
    who = who || 'netcheck';
    const { between, broadcastSrc } = netSlices(who);
    const { helpersSrc, storage, H } = netHarness(who);
    const gateSrc = between('// [netcheck:gate-start]', '// [netcheck:gate-end]', 'gate') + '\n}';   // the slice ends inside the client auth branch: close it
    const queueSrc = between('// [netcheck:queue-start]', '// [netcheck:queue-end]', 'queue');
    const chatSrc = between('// [netcheck:chat-start]', '// [netcheck:chat-end]', 'chat');
    const rosterSrc = between('// [netcheck:roster-start]', '// [netcheck:roster-end]', 'roster');
    const rosterCleanSrc = between('// [netcheck:rosterclean-start]', '// [netcheck:rosterclean-end]', 'rosterclean');
    const awaySrc = between('// [netcheck:away-start]', '// [netcheck:away-end]', 'away');

    /* ---- the sliced code, built once ---- */
    const hmacRef = (key, data) => require('crypto').createHmac('sha256', key).update(data).digest('hex');   // the suite's own HMAC: the app's proof is checked against it, never against itself
    const HS = new Function('localStorage', 'crypto', helpersSrc + '\nreturn { validCn: typeof validCn === "function" ? validCn : null };')(storage, globalThis.crypto);   // security S: the nonce rule the hello gate reads
    const RC = new Function('localStorage', 'crypto', helpersSrc + '\n' + rosterCleanSrc + '\nreturn { cleanHostRoster, cleanHostAway, validKey };')(storage, globalThis.crypto);

    const ENV_NAMES = ['net', 'own', 'validProfileId', 'cleanFace', '_connMeta', 'UNADMITTED_TTL', 'noteSeen', 'denyJoin', 'lastSeen', 'HB_STALE', 'bannedIds', 'getActiveCampaign', 'APP_VERSION', 'versionCmp', 'updateMessage', 'toast', 'logEvent', 'newerSeen', 'ui', '_pwFails', 'PW_LOCK_FAILS', 'PW_LOCK_MS', 'admitPlayer', 'queueJoin', 'setTimeout', 'clearTimeout', 'tableKeyFor', 'getProfile', 'showConfirm', 'pendingJoins', 'processNextApproval', 'allow', 'pushChat', 'broadcast', 'safeAvatar', 'cleanRosterName', 'awayMap', 'validKey', 'sendFailed', 'newKey', 'hmacHex', 'authData', 'sameStr', 'validCn', 'gmPresign'];
    // the env supplies every name a slice references — except the function the slice itself DEFINES (a var of the same name would overwrite the hoisted declaration)
    const pre = (except) => 'var ' + ENV_NAMES.filter(n => except.indexOf(n) < 0).map(n => n + ' = env.' + n).join(', ') + ';\n';
    // transport T (2026-10-01): the proof names the two certificate fingerprints of the connection it travels on (the player's, then the host's). Every harness
    // connection carries a stub RTCPeerConnection whose two descriptions hold one each — a host's connection the host's as its own and the player's as the
    // other side's, a player's the reverse — and the suite's reference proofs name the same pair (FPTAIL)
    const HT = new Function('localStorage', 'crypto', helpersSrc + '\nreturn { dtlsPrint: typeof dtlsPrint === "function" ? dtlsPrint : null, chanPrints: typeof chanPrints === "function" ? chanPrints : null, saidPrints: typeof saidPrints === "function" ? saidPrints : null };')(storage, globalThis.crypto);
    const FPP = 'sha-256 0A:1B:2C:3D', FPH = 'sha-256 4E:5F:60:71', FPTAIL = '|' + FPP + '|' + FPH;
    const pcStub = (mine, theirs) => { const d = f => ({ type: 'x', sdp: 'v=0\r\ns=-\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:' + f + '\r\n' }); return { localDescription: d(mine), remoteDescription: d(theirs) }; };
    ENV_NAMES.push('chanPrints', 'saidPrints');
    ENV_NAMES.push('gmHail', 'unboundNotice');   // H2 (2026-10-01): the host's early proof (none in a plain harness, as its snapshot is unsigned) and the GM's notice of a right key over another connection (recorded: h.unbound)
    const runGate = new Function('env', 'msg', 'conn', pre([]) + gateSrc + '\nreturn "ran";');
    const runQueue = new Function('env', 'conn', 'prof', 'why', pre(['queueJoin']) + queueSrc + '\nreturn queueJoin(conn, prof, why);');
    const runBroadcast = new Function('env', 'msg', 'exceptConn', pre(['broadcast']) + broadcastSrc + '\nreturn broadcast(msg, exceptConn);');
    const runChat = new Function('env', 'msg', 'conn', pre([]) + chatSrc + '\nreturn "ran";');
    const runRoster = new Function('env', pre([]) + rosterSrc + '\nreturn { rosterPayload, broadcastRoster };');
    const runAway = new Function('env', pre(['awayMap']) + awaySrc + '\nreturn awayMap();');

    /* ---- a fresh host harness per scenario ---- */
    function versionCmp(a, b) { const pa = String(a).split('-')[0].split('.').map(Number), pb = String(b).split('-')[0].split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; }
    function harness(opts) {
        opts = opts || {};
        const h = {
            sent: [], admitted: [], closed: [], toasts: [], confirms: [], timers: [], pushed: [], bcast: [], seen: [], pending: [], unbound: [],
            camp: { id: 'c1', players: opts.players || {}, bannedPlayers: opts.bannedPlayers || {} },
        };
        const env = {
            net: { role: opts.role || 'host', myId: 'u_gm', conns: [], roster: Object.create(null), gmId: '', roomPeer: opts.roomPeer || 'waypoint-c1', syncedPeer: null },
            own: H.own, validProfileId: H.validProfileId, tableKeyFor: H.tableKeyFor, newKey: H.newKey,
            authData: H.authData || ((n, r) => 'wp-auth|' + n + '|' + r), sameStr: H.sameStr || ((a, b) => a === b),
            hmacHex: (k, d) => { const p = (H.hmacHex || ((k2, d2) => Promise.resolve(hmacRef(k2, d2))))(k, d); h.pending.push(p); return p; },   // the proof's HMAC, its promise kept so a check can wait for the gate's asynchronous half
            _connMeta: Object.create(null), UNADMITTED_TTL: 10 * 60 * 1000, HB_STALE: 8000, lastSeen: {},
            noteSeen: p => h.seen.push(p),
            denyJoin: (conn, reason) => { conn.send({ type: 'denied', reason }); conn.close(); },
            bannedIds: {}, newerSeen: {}, _pwFails: Object.create(null), PW_LOCK_FAILS: 5, PW_LOCK_MS: 60000, pendingJoins: [],
            getActiveCampaign: () => h.camp, APP_VERSION: '1.5.0', versionCmp, updateMessage: () => 'update',
            toast: m => h.toasts.push(String(m)), logEvent: () => {}, showConfirm: m => h.confirms.push(m),
            ui: () => ({ value: opts.password || '' }),
            admitPlayer: (conn, prof, key) => { h.admitted.push({ peer: conn.peer, prof, key }); env.net.roster[conn.peer] = prof; },
            processNextApproval: () => {},
            getProfile: () => ({ id: 'u_me', name: 'Me' }),
            setTimeout: (fn, ms) => { const id = h.timers.length + 1; h.timers.push({ id, fn, ms }); return id; },
            clearTimeout: id => { h.timers = h.timers.filter(t => t.id !== id); },
            allow: () => true,
            pushChat: m => h.pushed.push(m),
            broadcast: (m, ex) => { packCheck(m); h.bcast.push({ m, ex }); },
            safeAvatar: H.safeAvatar, cleanRosterName: H.cleanRosterName, cleanFace: H.cleanFace, awayMap: () => ({ u_a: 'map_1' }), validKey: RC.validKey, sendFailed: () => {},
            gmHail: () => null, unboundNotice: p => { h.unbound.push(p && p.id); },
            validCn: HS.validCn || (() => false), gmPresign: () => null,   // security S: no signing key in a plain harness (a snapshot goes unsigned, as to an older app); the S checks give a host its real one
        };
        env.queueJoin = (conn, prof, why) => runQueue(env, conn, prof, why);
        env.chanPrints = HT.chanPrints || (() => null); env.saidPrints = HT.saidPrints || (() => null);   // transport T: the gate reads a connection's two fingerprints through the real helpers
        h.env = env;
        h.conn = (peer, pc) => { const c = { peer, open: true, send: m => { packCheck(m); h.sent.push({ peer, m }); }, close: () => { c.open = false; h.closed.push(peer); } }; if (pc !== null) c.peerConnection = pc || (env.net.role === 'client' ? pcStub(FPP, FPH) : pcStub(FPH, FPP)); env.net.conns.push(c); env._connMeta[peer] = { openedAt: Date.now(), hellos: 0 }; return c; };
        h.hello = (conn, profile, extra) => runGate(env, Object.assign({ type: 'hello', profile, version: '1.5.0' }, extra || {}), conn);
        h.fireTimers = () => { const t = h.timers.splice(0); t.forEach(x => x.fn()); return t.length; };
        h.lastSent = (peer, type) => h.sent.filter(s => s.peer === peer && s.m.type === type).pop();
        h.settle = async () => { while (h.pending.length) { const ps = h.pending.splice(0); await Promise.all(ps); } await new Promise(r => setImmediate(r)); };   // every proof check the gate started has landed
        return h;
    }
    netG = { gateSrc, queueSrc, broadcastSrc, chatSrc, rosterSrc, rosterCleanSrc, awaySrc, hmacRef, HS, RC, ENV_NAMES, pre, HT, FPP, FPH, FPTAIL, pcStub,
        runGate, runQueue, runBroadcast, runChat, runRoster, runAway, versionCmp, harness };
    return netG;
}

// A player's page as the fogDiff branch and applyFogDiff see it (fold M3), which netfogcheck and netdragcheck share (docs/REFACTOR_SPLIT_PLAN.md,
// "Finishing the test split", step 6, 2026-11-19: it stood at netfogcheck's top, and fold M4 left for netdragcheck.js with the blocks that use
// it). mkFogClient(FCx, o) is the very function netfogcheck held, word for word; it closes over the joined net.js, its slices, H and packCheck.
let netFC = null;
function netFogClient(who) {
    if (netFC) return netFC;
    who = who || 'netcheck';
    const { src, between, fnSrc, broadcastSrc } = netSlices(who);
    const { H } = netHarness(who);
    // fold M3: a player's page as the 'fogDiff' branch and applyFogDiff see it, both sliced by their markers and run for real with the real
    // cleaners (cleanHostWbItem, cleanHostLight and cleanWaitingItem from net.js, sanitizeRichText as it runs under Node, fogcore's cleanFogLit
    // and cleanLight) and the real client broadcast. Each page keeps its own state, net and recorders
    function mkFogClient(FCx, o) {
        o = o || {};
        const lnM = k => { const i = src.indexOf(k); if (i < 0 || src.indexOf(k, i + 1) >= 0) throw new Error('netcheck: ' + k + ' not found once'); return src.slice(i, src.indexOf('\n', i)); };
        const branch = between('// [netcheck:fogdiff-start]', '// [netcheck:fogdiff-end]', 'fogdiff'), apply = between('// [netcheck:fogdiffapply-start]', '// [netcheck:fogdiffapply-end]', 'fogdiffapply', 'netfog.js');
        const rich = lnM('function escAttr(s) {') + '\n' + fnSrc('function sanitizeRichText(', '\n}\n', 'sanitizeRichText') + '\n}\n';
        const rec = { asked: [], renders: 0, redraws: 0, invalidated: 0, saves: 0, other: [] };
        const hostConn = { peer: 'h', open: true, send(m) { packCheck(m); rec.asked.push(JSON.parse(JSON.stringify(m))); } };
        const net = { role: 'client', active: true, foreign: true, syncedPeer: 'h', stream: false, applyingRemote: false, myId: o.myId || 'u_me', conns: [hostConn], roster: {} };
        const state = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', activeItemId: o.active === undefined ? 'mA' : o.active, items: o.items || {} } } } };
        if (o.other) state.appState.campaigns.k2 = { id: 'k2', activeItemId: null, items: o.other };
        const win = { wpFogCore: o.core || FCx, wpFog: { invalidateVision() { rec.invalidated++; }, redraw() { rec.redraws++; } }, save() { rec.saves++; } };
        const recv = new Function('net', 'state', 'window', 'getActiveCampaign', 'render', 'cleanWaitingItem', 'onLocalSave', 'save',
            '"use strict";\n' + lnM('function own(o, k) {') + '\n' + lnM('function validKey(k) {') + '\n' + lnM('function campOf(id) {') + '\n' + broadcastSrc + '\n' + rich
            + lnM('function cleanHostWbItem(w) {') + '\n' + lnM('function cleanHostLight(w) {') + '\n' + lnM('function cleanHostTokSenses(w) {') + '\n' + fnSrc('function ownCellKeysOf(', '\n}\n', 'ownCellKeysOf') + '\n}\n' + fnSrc('function ownTokIdsOf(', '\n}\n', 'ownTokIdsOf') + '\n}\n' + apply + '\nreturn function(msg, conn) {\n' + branch + '\n};')(
            net, state, win, () => state.appState.campaigns[state.appState.activeCampaignId], () => { rec.renders++; }, H.cleanWaitingItem, () => { rec.saves++; }, () => { rec.saves++; });
        return { net, state, rec, camp: () => state.appState.campaigns.k, map: id => state.appState.campaigns.k.items[id], recv: (msg, peer) => recv(JSON.parse(JSON.stringify(msg)), { peer: peer === undefined ? 'h' : peer }) };
    }
    netFC = { mkFogClient };
    return netFC;
}

// PeerJS 1.5.2's default serializer is BinaryPack (inside the bundled library file, assets/vendor/peerjs.min.js, which the suites do not load): its pack() reads value.constructor for every
// object and throws on one it does not know — an object with no prototype, or an own "constructor" / "hasOwnProperty" — and the real
// broadcast() swallows the throw. Every harness send runs this emulation, so a payload production could not deliver never passes here.
function packCheck(v) {
    if (typeof v === 'number') { if (Math.floor(v) === v && (v > 18446744073709551615 || v < -9223372036854775808)) throw new Error('Invalid integer'); return; }   // an "integer" past 64 bits (1e300, Infinity)
    if (typeof v === 'function') throw new Error('Type "function" not yet supported');
    if (v === null || typeof v !== 'object') return;
    if ('BYTES_PER_ELEMENT' in v && !ArrayBuffer.isView(v)) throw new Error('an object with BYTES_PER_ELEMENT is packed as an (empty) typed array');
    const C = v.constructor;
    if (C === undefined) throw new TypeError("Cannot read properties of undefined (reading 'toString')");
    if (Array.isArray(v)) { v.forEach(packCheck); return; }
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || C === Date) return;
    if (C !== Object) throw new Error('Type "' + String(C) + '" not yet supported');
    if (typeof v.hasOwnProperty !== 'function') throw new TypeError('obj.hasOwnProperty is not a function');
    for (const k in v) if (v.hasOwnProperty(k)) packCheck(v[k]);
}

const url = f => 'file:///' + path.resolve(path.join(SCRIPTS, f)).replace(/[\\]/g, '/');

// systemcheck.js's top, which it and the suites that came out of it with the lists, rolls and sheet start from (docs/REFACTOR_SPLIT_PLAN.md,
// "Finishing the test split", 2026-11-19), so that no suite keeps its own copy. starterFile names a system file for the tests: the two
// starters frozen in tools/fixtures (Basic 3d6, out of the app since 1.5.6, and Basic d20 as it stood before its gear and coins, 1.6.2,
// backlog 147, for the folds' own baselines), else one of the app's own systems. sysCore() imports systemcore.js and formula.js from the
// real folder, as systemcheck.js always has (under srcjoin the root runs as its joined text, its parts' lines in place), and answers
// { S, F, err } with, once both loaded, the fifteen names systemcheck.js unpacks from S, the d20 and 3d6 presets, and flatKids. A suite
// checks err itself, in its own words. flatKids reads every box under a node of a page of plain objects at any depth (1.6.2, the owner:
// "Folds by part, answer shown": the Combat tab's Blasts and throws stands in folds).
const starterFile = n => n === '3d6' ? path.join(__dirname, 'fixtures', 'starter-3d6.json') : n === 'd20' ? path.join(__dirname, 'fixtures', 'starter-d20.json') : path.join(APP, 'assets', 'systems', n + '.json');
function flatKids(n) { return (n && Array.isArray(n.kids) ? n.kids : []).reduce(function(a, k) { return a.concat([k], flatKids(k)); }, []); }
// The rest of systemcheck.js's top, word for word, so that no suite keeps a copy (the review of test step 1, 2026-11-19): presets() reads
// the d20 system and the frozen 3d6 starter afresh each call (a suite that imports a private copy of systemcore.js takes them from here);
// sevenList is a posture list for the tests, ownLines net.js's own-key lookups for a sliced gate, css0911 the style sheet as it stands.
const presets = () => ({ d20: JSON.parse(fs.readFileSync(path.join(APP, 'assets', 'systems', 'd20.json'), 'utf8')), g3d6: JSON.parse(fs.readFileSync(starterFile('3d6'), 'utf8')) });
const sevenList = () => ['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up'].map(id => ({ id, name: id }));   // 1.6.0, backlog 183 (3): a system's own list for the tests, none being a default
const ownLines = src => ['function own(', 'function validKey(', 'function campOf('].map(k => { const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';   // net.js's own-key lookups (the real one-liners) for a sliced gate that uses them
function css0911() { return require('fs').readFileSync(require('path').join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8'); }   // the viewing of 2026-11-09: the HUD fits what it holds
const SYS_NAMES = ['LIMITS', 'validKey', 'cleanField', 'cleanSystem', 'cleanValue', 'cleanChar', 'cleanCharEdit', 'makeResolver', 'resolveAll', 'hoverLines', 'validateSystem', 'charFor', 'applyEdit', 'autoLayout', 'emptySystem'];
async function sysCore() {
    let S = null, F = null, err = null;
    try { S = await import(url('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    const out = { S, F, err, flatKids };
    if (!S || !F) return out;
    SYS_NAMES.forEach(k => { out[k] = S[k]; });
    Object.assign(out, presets());
    return out;
}

// The file URLs of a private copy of a split root and its parts (srcjoin.freshUrl), by name. An import of the real folder's root
// runs the joined text srcjoin answers (the parts' lines put back in place), and an import of a real part answers its one neutral
// line; an import from the copy runs the real split wiring instead, as the browser does: the part is a module of its own, read by
// its own name, and the root installs it. So a suite that tests an area imports that area's part from here, and through it the
// root. The copy's imports of other modules point at the real folder.
function fresh(root, tag) {
    const u = srcjoin.freshUrl(root, tag);
    return name => u.slice(0, u.lastIndexOf('/') + 1) + name;
}

module.exports = { suite, joined, part, cut, cutEnd, familyCount, defOf, sheetsSlicer, plainPage, wbState, netState, netSlices, netHarness, netGate, netFogClient, packCheck, url, fresh, sysCore, starterFile, flatKids, presets, sevenList, ownLines, css0911, APP, SCRIPTS, lf };
