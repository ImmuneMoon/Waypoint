/* splitcheck.js: the giant scripts split into parts stay wired as the single file they were (docs/REFACTOR_SPLIT_PLAN.md 2.4,
   Fulllion's approval of 2026-11-18: split by area, one area at a time, with no change in behavior).

   What is held, for each split file (a "root") and each of its parts:
   1. The shape: a root names each part once by a `// [split:x.js]` line, and the line right after it binds the part's names from its
      install; a part names its root back in a `// [split:of x.js]` header line, after comments alone, then its import from the root,
      its install function's first line, its body between `// [split:body-start]` and `// [split:body-end]`, its return and its closing
      line, and nothing more. Every glue line matches one strict pattern, carries no marker of a suite, and the root imports each part
      after all its other imports. A part is named in lower case letters and digits, and has its root's git attributes; a root git
      keeps byte for byte has a -text line of its own in .gitattributes.
   2. The names, judged on the joined text (the old file) by a real parser: what a part uses that is declared outside it is in its
      import line, what the root uses of the part is in its return line (and so in the root's binding line), every word of a part's
      text that names a top-level name counts as a use too, and the root exports all a part imports. No name is assigned across a cut,
      none is declared on both sides, and no top-level statement that runs before a part is installed reaches one of its names,
      directly or through the functions it calls. No part assigns a name declared nowhere (what only strict mode refuses; see 5), and
      no module in an import cycle with the root reaches a name bound from a part in its top-level code (splitlib.cycleRisks). A name
      a part declares and assigns again later is never read outside it (the root reads a part's name through a copy made at install).
   3. Every suite reads the giants through tools/srcjoin.js, installed as its first statement (after a 'use strict' directive); the private bridge's three entry files
      install it too where that folder is there; no suite imports a split root with a query (a fresh instance comes from
      srcjoin.freshUrl). The scans of what ships (updatercheck's list of names, sinkcheck's scans) read the real bytes through
      srcjoin.raw. A name a root exports through a glue line is imported by no script but its own parts. No script of the app imports
      a part with import(): a part is loaded only by its root's static import, so that a page holds one release's root and parts
      together (the website pins a release per tab, and a dynamic import of a part could load a newer release's part; the website
      session's ask of 2026-11-18). An import( of anything but one plain quoted path (a name, a sum, a template with a part in it) is
      refused in every script of the app too, since no scan can say what file it names (the review of next area 1). Both rules are tried
      on a text of their own first.
   4. systemcore.js, when it is split: the real module graph and the joined text, each imported, give the same API object (the same
      keys in the same order, the same kind of value for each, the same name and length for each function and the same JSON for each
      other value), and the same exports but for the names the root re-exports to its parts.
   5. net.js, when it is split: fuzzcheck runs twice, once on the joined text and once on a bundle of the real wiring, in which each
      part sees only the names it imports (srcjoin.bundle); both give the same lines, each as many times, and the same exit code. That
      is the behavior pass: a part function that misses an import throws only when its path runs, and fuzzcheck's world runs the paths.
      It is the whole of fuzzcheck, its seeded mutations included, twice at once (some 40 seconds). It runs each part in sloppy mode
      (a scope made with `with` cannot be strict), while the browser runs it as a strict module; what only strict mode would refuse is
      judged statically in 2.
   5b. sheets.js, which no suite loads as a module: its joined text and its real wiring each load in a page of stubs, set the same window
      globals and the same window.wpSheets, bind every name a part returns, and each such name, called in both alike, ends alike.
   5c. whiteboard.js, the same way (before its first cut, docs/REFACTOR_SPLIT_PLAN.md "Next areas", step 0): the same window globals,
      each object among them key for key, every name a part returns bound, and each such name, called in both alike, ending alike.
   6. Under the wrap a part reads as one neutral line, and each marker of a suite in a part's body stands in the joined root as often
      as in the part.
   7. A part's area's tests read it by name: in tools/*.js (but srcjoin, splitlib, splitcheck, checkkit and suitecount), a line that
      holds the literal of a marker only a part holds also names that part's file, so the slice is cut from the part itself
      (tools/checkkit.js netSlices with the file, or srcjoin.raw) and never from the joined root alone (docs/REFACTOR_SPLIT_PLAN.md,
      "Tests move with their area"). So does a line that names such a marker as a quoted string (a suite may build the marker at run
      time from 'netcheck:swpay'), and a line where a slice's anchor (a quoted string in a call of fnSrc, cut, indexOf, range,
      between, tryBetween or lineOf) holds a definition that only a part holds: a function, a net. function or a var declared at the
      left margin of the part's body and nowhere in its root's own text (the review of area 1's tests, 2026-11-18). A line names a part
      only by a string or a template that holds the part's file name, or where every receiver of its indexOf is a name that stands, by
      the scopes, for a read whose path names the part; a comment never names it (the review of next area 2, 2026-11-18). A cut at a
      definition that a script of another family also holds at its left margin (net.js's own var FACE_PICS) passes only where every
      receiver stands for a read of such a script. A line is excused only by naming the very part that holds the marker or the
      definition, never another part of the same root (the review of next area 3, 2026-11-18). The rules are tried on texts of their own
      first.
   7b. A source pin (an includes or a split of a quoted string, or a plain regex's test) on a root's joined text, read directly or
      through a name the tool set to such a read, holds no text that only one of the root's parts holds: it reads that part by name
      (the review of area 3, 2026-11-18). The src that tools/checkkit.js netSlices hands back, destructured (const { src } or
      { src: name }), is the joined net.js (the review of next area 3, 2026-11-18). The rule is tried on a text of its own first.
   7c. The same, judged by the parser Node ships on each tool's own tree (the review of next area 1, 2026-11-18), so that what 7b's
      patterns cannot see is judged too: a pin is a literal (a string of 6 characters or more, or a regex) handed to a call on a root's
      joined text, read through any reader of a quoted path (rootRead, rdN, a name set to another such name), as the text of an includes,
      a match, a split, a search, a replace, a startsWith or an endsWith, of an indexOf compared with 0 or -1, of a regex's test or exec,
      of any helper of the tool's own handed that text (a count, an after), or of a function whose body reads it (a wbFn of a head), the src
      destructured from netSlices among them. No line is excused for naming a part: a pin on the joined text is judged whatever else the
      line reads (a kit.part('netlink.js') beside it covers nothing nettrade.js holds). A
      slice's anchors (between, fnSrc, cut and any helper named cut..., range, lineOf, an indexOf not compared) are point 7's to judge,
      and a slice that crosses from a root into a part reads the joined text on purpose. The rule is tried on a text of its own first.
   `node tools/splitcheck.js --against <commit>` also proves the joined text of each root equal to that commit's (joined) root: the raw
   bytes for a root git keeps byte for byte (net.js), the text with CRLF read as LF for the others, with one line ending throughout.
   It needs the parser Node ships, so it runs itself again with --expose-internals. */
'use strict';
const cp = require('child_process'), path = require('path');
if (!process.execArgv.includes('--expose-internals')) {
    const r = cp.spawnSync(process.execPath, ['--expose-internals', __filename].concat(process.argv.slice(2)), { stdio: 'inherit' });
    process.exit(r.status === null ? 1 : r.status);
}
require('./srcjoin').install();
const fs = require('fs'), os = require('os'), url = require('url');
const srcjoin = require('./srcjoin'), L = require('./splitlib');
const ROOT = path.join(__dirname, '..'), SCRIPTS = srcjoin.SCRIPTS;
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 1200) : ''); } }
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
const argAgainst = (() => { const i = process.argv.indexOf('--against'); return i > 0 ? process.argv[i + 1] : (process.env.CI ? 'HEAD' : null); })();   // on CI (a fresh checkout, where a part's line endings may differ from Windows) the proof runs against HEAD by itself
const bare = l => l.replace(/\r$/, '');
const git = (args, enc) => { const r = cp.spawnSync('git', args, { cwd: ROOT, encoding: enc === 'buffer' ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024 }); return r.status === 0 ? r.stdout : null; };

// ---- a page of stubs, for a giant script that is only ever tested as text (5b) ----
// pageStub(name) is a value that takes anything: any property is another stub, a call or a new answers a stub, a write is kept nowhere,
// and it reads as 0 or '' where a number or text is wanted. A script's imports are made stubs (its other modules are not loaded), and so
// are the page's document, storage, observers and channels; timers never fire. The window keeps what the script writes on it.
const vm = require('vm');
// A loop that empties an element ends: a stub has no first or last child, so whiteboard.js's while (el.firstChild) el.removeChild(el.firstChild)
// ends at once (step 0 of area 4, 2026-11-18; with a stub child it ran for good). Only the four child links answer null (the review of next
// area 1): a walk up or along the tree reads stubs as before, so a part function compared in 5b and 5c runs as far as it did, and any other
// walk that never ends is stopped by the load's and each call's timeout. sheets.js's 52 calls end line for line alike under the stub with
// no null link, with all eleven and with these four, and whiteboard.js's 62 under the eleven and the four.
const TREE_WALK = /^(firstChild|lastChild|firstElementChild|lastElementChild)$/;
function pageStub(nm) {
    const f = function() {};
    return new Proxy(f, {
        get(o, k) { if (k === Symbol.toPrimitive) return () => 0; if (k === 'then' || k === Symbol.iterator) return undefined; if (k === 'toString' || k === 'valueOf') return () => ''; if (k === 'length') return 0; if (TREE_WALK.test(String(k))) return null; return pageStub(nm + '.' + String(k)); },
        set() { return true; }, apply() { return pageStub(nm + '()'); }, construct() { return pageStub('new ' + nm); }, has() { return true; }
    });
}
// Loads a script's joined text, or (bundle true) srcjoin.bundle's real wiring, as one function in a page of stubs. Answers the context,
// the window, and what the script's own scope holds: each name its parts return, by kind, and those names themselves (a function or null).
function pageLoad(name, bundle) {
    let t = bundle ? srcjoin.bundle(name) : (srcjoin.isRoot(name) ? srcjoin.joinRoot(name).text : srcjoin.raw(name, 'latin1'));
    t = Buffer.from(t, 'latin1').toString('utf8');
    t = t.replace(/^import \{([^}]*)\} from '\.\/([A-Za-z0-9_.-]+\.js)';[^\n]*$/gm, (a, names, mod) => 'var ' + names.split(',').map(s => s.trim()).filter(Boolean).map(s => { const p = s.split(/\s+as\s+/); return (p[1] || p[0]) + ' = __stub(' + JSON.stringify(mod + ':' + p[0]) + ')'; }).join(', ') + ';');
    // a namespace import is a stub too, and the script's own export statements are dropped (whiteboard.js ends in a multi-line export {),
    // since the text runs as a function body: a declaration it exports stays, without its export
    t = t.replace(/^import \* as ([A-Za-z_$][\w$]*) from '\.\/([A-Za-z0-9_.-]+\.js)';[^\n]*$/gm, (a, ns, mod) => 'var ' + ns + ' = __stub(' + JSON.stringify(mod + ':*') + ');');
    t = t.replace(/^export \{[^}]*\};?[^\n]*$/gm, '').replace(/^export (?=(?:async )?function |var |let |const |class )/gm, '');
    const win = {};
    const ctx = { console: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, Object, JSON, Math, Array, String, Number, Boolean, Date, RegExp, Error, TypeError, RangeError, SyntaxError, Map, Set, WeakMap, WeakSet, Promise, Symbol, Proxy, Reflect,
        parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent, Infinity, NaN, undefined,
        setTimeout() { return 0; }, setInterval() { return 0; }, clearTimeout() {}, clearInterval() {}, requestAnimationFrame() { return 0; }, cancelAnimationFrame() {},
        document: pageStub('document'), location: { search: '', origin: 'http://localhost', href: 'http://localhost/' }, navigator: pageStub('navigator'), localStorage: pageStub('localStorage'), sessionStorage: pageStub('sessionStorage'),
        BroadcastChannel: pageStub('BroadcastChannel'), ResizeObserver: pageStub('ResizeObserver'), MutationObserver: pageStub('MutationObserver'), getComputedStyle: pageStub('getComputedStyle'), performance: { now: () => 0 }, __stub: pageStub };
    ctx.window = new Proxy(win, { get(o, k) { if (k in o) return o[k]; if (k in ctx && k !== 'window') return ctx[k]; return pageStub('window.' + String(k)); }, set(o, k, v) { o[k] = v; return true; } });
    ctx.self = ctx.window;
    vm.createContext(ctx);
    const names = []; srcjoin.partsOf(name).forEach(p => (L.partGlue(p).returns || []).forEach(n => names.push(n)));
    const tail = '\n;return { names: {' + names.map(n => JSON.stringify(n) + ': typeof ' + n).join(', ') + '}, fns: {' + names.map(n => JSON.stringify(n) + ': typeof ' + n + " === 'function' ? " + n + ' : null').join(', ') + '} };';
    const out = vm.runInContext('(function(){' + t + tail + '\n})()', ctx, { filename: name + (bundle ? ' (real wiring)' : ' (joined)'), timeout: 60000 });   // a load that runs for good fails, never hangs the suite
    return { ctx, win, names: Object.keys(out.names).map(n => n + ' ' + out.names[n]), fns: out.fns, order: names };
}
// What the window holds after the load (each global's kind, and the keys of window[key], or with no key of every object among the
// window's globals, each by its kind), and how each call of a part's names ends.
function pageCalls(name, bundle, key) {
    const r = pageLoad(name, bundle), calls = [];
    const kind = v => (typeof v === 'function' ? 'function ' + v.name + '/' + v.length : typeof v);
    const objs = key ? [key] : Object.keys(r.win).sort().filter(k => r.win[k] && typeof r.win[k] === 'object');
    const shape = Object.keys(r.win).sort().map(k => 'window.' + k + ' = ' + kind(r.win[k]));
    objs.forEach(o => Object.keys(r.win[o] || {}).forEach(k => shape.push(o + '.' + k + ' = ' + kind(r.win[o][k]))));
    r.ctx.__fns = r.fns;
    [false, true].forEach(withArgs => r.order.forEach(n => {
        let o;
        try { r.ctx.__n = n; const v = vm.runInContext('__fns[__n] ? (' + (withArgs ? '__fns[__n](__stub("a"), __stub("b"), __stub("c"), __stub("d"))' : '__fns[__n]()') + ') : "not a function"', r.ctx, { timeout: 500 }); o = 'answers ' + typeof v; }
        catch (e) { o = 'throws ' + (e && e.name) + ': ' + String(e && e.message).slice(0, 120); }
        calls.push(n + (withArgs ? ' (stubs)' : ' ()') + ' ' + o);
    }));
    return { shape, names: r.names, calls };
}

(async () => {
    check('the parser Node ships is reachable (node --expose-internals)', !!L.acorn());
    const roots = srcjoin.roots(), files = fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js'));
    const parts = files.filter(f => srcjoin.isPart(f));
    console.log('note      roots: ' + (roots.length ? roots.map(r => r + ' (' + srcjoin.partsOf(r).join(', ') + ')').join('; ') : 'none yet'));

    // ---- 1. the shape ----
    const attrs = (() => { try { return fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } })();
    const SUITE_MARK = /\[(?!split:)[a-z0-9]+:[A-Za-z0-9_-]+\]/;
    // A root git keeps byte for byte says so by a line of its own in .gitattributes (net.js: git would keep it so by itself today, only
    // because it holds two control bytes, and a later cut could move them into a part). Its parts then need the same line.
    const attrLine = n => attrs.split('\n').map(l => l.trim()).indexOf('system/app/scripts/' + n + ' -text') >= 0;
    const gitBinary = n => (git(['ls-files', '--eol', 'system/app/scripts/' + n]) || '').indexOf('i/-text') >= 0;
    parts.forEach(p => {
        const root = srcjoin.rootOf(p), bad = [];
        if (!/^[a-z0-9]+\.js$/.test(p)) bad.push('its name');
        if (!root || roots.indexOf(root) < 0 || srcjoin.partsOf(root).filter(x => x === p).length !== 1) bad.push('its root does not name it once');
        const g = L.partGlue(p), lines = g.lines;
        const ofAt = lines.findIndex(l => srcjoin.OF.test(l));
        const head = lines.slice(0, ofAt).join('\n');
        if (!/^\s*(?:(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*)\s*)*$/.test(head)) bad.push('its header is more than comments');
        const after = lines.slice(ofAt + 1);
        while (after.length && after[after.length - 1] === '') after.pop();
        const ibs = after.indexOf(srcjoin.BODY_START), ibe = after.lastIndexOf(srcjoin.BODY_END);
        if (!(L.GLUE_IMPORT.test(after[0] || '') && g.from === root)) bad.push('its first line after the header is not its import from ' + root);
        if (!/^export function [A-Za-z_$][\w$]*\(\) \{   \/\/ \[split:glue\]$/.test(after[1] || '')) bad.push('its second line is not the install\'s first');
        if (ibs !== 2 || ibe !== after.length - 3) bad.push('its body is not where it belongs');
        if (!/^return \{ ([A-Za-z_$][\w$]*: [A-Za-z_$][\w$]*(, [A-Za-z_$][\w$]*: [A-Za-z_$][\w$]*)*)? \};   \/\/ \[split:glue\]$/.test(after[after.length - 2] || '')) bad.push('its return line');
        if (after[after.length - 1] !== '}   // [split:glue]') bad.push('its closing line');
        (g.returns || []).forEach(n => { if (!new RegExp('(^|, )' + n.replace(/\$/g, '\\$') + ': ' + n.replace(/\$/g, '\\$') + '(,|$)').test((/^return \{ (.*) \};/.exec(after[after.length - 2] || '') || [])[1] || '')) bad.push('return ' + n); });
        const body = after.slice(ibs + 1, ibe);
        if (body.some(l => l.indexOf('// [split:') >= 0)) bad.push('a split line in its body');
        [after[0], after[1], after[after.length - 2], after[after.length - 1]].forEach(l => { if (SUITE_MARK.test(String(l))) bad.push('a suite marker in glue'); });
        const rootBin = !!root && attrLine(root);
        if (rootBin && !attrLine(p)) bad.push('.gitattributes has no -text line for it');
        check('the shape of ' + p + ': named in lower case, its root ' + root + ' names it once, a header of comments, its import from the root, its install, its body, its return and its closing line, no suite marker in its glue' + (rootBin ? ', and -text in .gitattributes as its root is' : ''), bad.length === 0, bad);
    });
    roots.forEach(r => {
        const lines = srcjoin.raw(r, 'latin1').split('\n').map(bare), bad = [];
        const ps = srcjoin.partsOf(r);
        let lastPlainImport = -1, firstPartImport = Infinity;
        lines.forEach((l, i) => { if (/^import /.test(l)) { if (l.indexOf('// [split:glue]') >= 0) firstPartImport = Math.min(firstPartImport, i); else lastPlainImport = i; } });
        if (!(firstPartImport > lastPlainImport)) bad.push('a part\'s import stands before another import');
        ps.forEach(p => {
            const g = L.partGlue(p), inst = g.install;
            const at = lines.findIndex(l => l === '// [split:' + p + ']');
            const bind = lines[at + 1] || '';
            const m = new RegExp('^var _' + inst + ' = ' + inst + '\\(\\)((, [A-Za-z_$][\\w$]* = _' + inst + '\\.[A-Za-z_$][\\w$]*)*);   // \\[split:glue\\]$').exec(bind);
            if (!m) bad.push(p + ': the line after its marker does not bind its names');
            else {
                const bound = m[1] ? m[1].slice(2).split(', ').map(x => x.split(' = ')) : [];
                if (bound.some(x => x[1] !== '_' + inst + '.' + x[0])) bad.push(p + ': a name bound under another name');
                const want = (g.returns || []).slice().sort().join(','), got = bound.map(x => x[0]).sort().join(',');
                if (want !== got) bad.push(p + ': the binding line is not its return line');
            }
            if (lines.filter(l => l === 'import { ' + inst + ' } from \'./' + p + '\';   // [split:glue]').length !== 1) bad.push(p + ': not imported once');
        });
        lines.forEach(l => {
            if (l.indexOf('// [split:glue]') < 0) return;
            if (/^import \{ [A-Za-z_$][\w$]* \} from '\.\/[a-z0-9]+\.js';   \/\/ \[split:glue\]$/.test(l)) return;
            if (/^export \{ [A-Za-z_$][\w$]*(, [A-Za-z_$][\w$]*)* \};   \/\/ \[split:glue\]$/.test(l)) return;
            if (/^var _[A-Za-z_$][\w$]* = /.test(l)) return;
            bad.push('a glue line of no known form: ' + l.slice(0, 120));
        });
        lines.forEach(l => { if (l.indexOf('// [split:glue]') >= 0 && SUITE_MARK.test(l)) bad.push('a suite marker in glue'); });
        if (gitBinary(r) && !attrLine(r)) bad.push('git keeps it byte for byte, but .gitattributes has no -text line of its own to keep it so');
        check('the shape of ' + r + ': each part named once by its marker line, the line after it binding exactly the names the part returns, each part imported once and after every other import, every glue line of a known form with no suite marker, and a -text line of its own in .gitattributes where git keeps it byte for byte', bad.length === 0, bad);
    });

    // ---- 2. the names ----
    // The rule that a part's name which changes is never read through the root's copy of it (splitlib.judge, added by area 3 on 2026-11-18,
    // when linked sheets' sources would have read null for good), tried on a small text of its own: a part assigns its own var, the
    // root reads it, so judge must name it; and the same text with the var assigned only where it is declared names nothing.
    {
        const txt = ['var a = 1;', '// p', 'var src = null;', 'function setSrc(f) { src = f; }', '// q', 'function read() { return src; }', ''].join('\n');
        const quiet = txt.replace('function setSrc(f) { src = f; }', 'function setSrc(f) { return f; }');
        let r1 = null, r2 = null, e1 = null;
        try { r1 = L.judge(txt, [{ part: 'p.js', from: 2, to: 4 }]); r2 = L.judge(quiet, [{ part: 'p.js', from: 2, to: 4 }]); } catch (e) { e1 = e; }
        const named = r1 && r1.problems.filter(x => x.rule === 'a part name that changes is read through a copy' && x.name === 'src');
        check('splitlib: a name a part assigns again later and its root reads (through a copy made at install) is named, and one never assigned again is not', !e1 && named && named.length === 1 && r2 && r2.problems.length === 0, e1 ? String(e1) : { r1: r1 && r1.problems, r2: r2 && r2.problems });
    }
    roots.forEach(r => {
        const J = srcjoin.joinRoot(r), regions = L.regionsOf(r);
        let res = null, err = null;
        try { res = L.judge(J.text, regions); } catch (e) { err = e; }
        check(r + ': the joined text parses and every name is judged (' + regions.length + ' parts)', !err, err && String(err.stack || err).slice(0, 400));
        if (!res) return;
        check(r + ': no name is assigned across a cut, none is declared on both sides, and no statement that runs before a part is installed reaches one of its names', res.problems.length === 0, res.problems.slice(0, 10));
        // The behavior pass runs each part in sloppy mode (srcjoin.bundle cannot be strict), so what only strict mode refuses is
        // judged here: no part assigns a name declared nowhere (a strict module throws there; sloppy code would make a global).
        const starts = L.lineStarts(J.text), undeclared = res.A.refs.filter(x => x.write && !x.at).map(x => ({ name: x.name, line: L.lineOf(starts, x.start) })).filter(x => regions.some(g => x.line >= g.from && x.line <= g.to));
        check(r + ': no part assigns a name declared nowhere (what only strict mode would refuse, which the sloppy behavior pass cannot see)', undeclared.length === 0, undeclared.slice(0, 10));
        // A module in an import cycle with the root may run its top-level code before a part is installed (splitlib.cycleRisks).
        let cyc = null, cycErr = null;
        try { cyc = L.cycleRisks(r, res); } catch (e) { cycErr = e; }
        check(r + ': no module in an import cycle with it' + (cyc ? ' (' + cyc.inCycle.length + ': ' + cyc.inCycle.slice(0, 6).join(', ') + (cyc.inCycle.length > 6 ? ', ...' : '') + ')' : '') + ' reaches, in its top-level code, a name the root binds from a part, directly or through a root function it calls', !cycErr && cyc.risks.length === 0, cycErr ? String(cycErr.stack || cycErr).slice(0, 400) : cyc.risks.slice(0, 10));
        const RA = L.analyze(srcjoin.raw(r, 'utf8')), exported = new Set(RA.exports.map(e => e.exported)), rootNames = RA.mod.names;
        regions.forEach(reg => {
            const g = L.partGlue(reg.part), imp = new Set(g.imports || []), ret = new Set(g.returns || []);
            const missImp = [...res.need[reg.part]].filter(n => !imp.has(n)), missRet = [...res.give[reg.part]].filter(n => !ret.has(n));
            check(reg.part + ': it imports every name it uses that is declared outside it (' + res.need[reg.part].size + '), and returns every name of it used outside it (' + res.give[reg.part].size + ')', !missImp.length && !missRet.length, { imports: missImp, returns: missRet });
            const wImp = [...res.wordNeed[reg.part]].filter(n => !imp.has(n)), wRet = [...res.wordGive[reg.part]].filter(n => !ret.has(n));
            check(reg.part + ': by the word rule too (every word of its text that names a top-level name outside it is imported, every word outside it that names one of its names is returned)', !wImp.length && !wRet.length, { imports: wImp, returns: wRet });
            const notExp = [...imp].filter(n => !exported.has(n)), notBound = [...imp].filter(n => !rootNames.has(n));
            check(reg.part + ': ' + r + ' exports every name the part imports, and binds each', !notExp.length && !notBound.length, { notExported: notExp, notBound: notBound });
        });
    });

    // ---- 3. every suite reads through srcjoin, no queried root ----
    const tools = fs.readdirSync(__dirname).filter(f => /check\.js$/.test(f) && f !== 'parsecheck.js' && f !== 'splitcheck.js');
    // A suite's first statement, past white space, comments and a 'use strict' directive wherever it stands among them: the review of
    // area 2 (2026-11-18) put the directive back as the very first line of the suites that came out of systemcheck, since one written
    // after the install line is only a string and leaves the suite in sloppy mode
    const firstStmt = s => { let i = 0; const n = s.length; for (;;) { while (i < n && /\s/.test(s[i])) i++; if (s.startsWith('#!', i) || s.startsWith('//', i)) { i = s.indexOf('\n', i); if (i < 0) i = n; continue; } if (s.startsWith('/*', i)) { i = s.indexOf('*/', i) + 2; continue; } const m = /^(['"])use strict\1;[^\n]*(\n|$)/.exec(s.slice(i, i + 200)); if (m) { i += m[0].length; continue; } break; } return s.slice(i); };
    const noInstall = tools.filter(f => firstStmt(fs.readFileSync(path.join(__dirname, f), 'utf8')).indexOf("require('./srcjoin').install();") !== 0);
    // a 'use strict' line at the left margin past the first statement is no directive, only a string: such a suite runs sloppy, so it
    // is named too (one inside a function built from text stands in a string of its own, never at the left margin)
    const lateStrict = tools.filter(f => /^(['"])use strict\1;/m.test(firstStmt(fs.readFileSync(path.join(__dirname, f), 'utf8'))));
    check('every suite but parsecheck and splitcheck installs srcjoin as its first statement (' + tools.length + ' suites)', tools.length >= 80 && noInstall.length === 0, noInstall);
    check('no suite writes \'use strict\' after its install line, where it is only a string and the suite runs in sloppy mode (the review of area 2)', lateStrict.length === 0, lateStrict);
    const allRoots = new Set(roots.concat(['systemcore.js', 'net.js', 'sheets.js', 'whiteboard.js']));
    const queried = [];
    fs.readdirSync(__dirname).filter(f => /\.(js|mjs|cjs)$/.test(f) && f !== 'splitcheck.js').forEach(f => {
        const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
        allRoots.forEach(r => { const e = r.replace('.', '\\.'); if (new RegExp(e + "(\\?|['\"`]\\)\\s*\\+\\s*['\"`]\\?)").test(s)) queried.push(f + ': ' + r); });
    });
    check('no suite imports a split root (or a giant that may be split) with a query: a fresh instance comes from srcjoin.freshUrl', queried.length === 0, queried);
    // No script of the app loads a part with import(): a part is loaded only through its root's static import (the website pins one
    // release per tab, and a dynamic import of a part, made later than the root's load, could fetch a newer release's part; the
    // website session's ask of 2026-11-18). dynParts names each import( of a quoted path whose file is a part (any file whose header
    // says // [split:of), wherever it stands, a comment included; it is tried first on a text of its own.
    const dynParts = (txt, isPart) => { const out = [], re = /\bimport\s*\(\s*(['"`])([^'"`\n]*)\1/g; let m; while ((m = re.exec(txt))) { const f = m[2].split('/').pop(); if (isPart(f)) out.push(m[2]); } return out; };
    {
        const fake = f => f === 'netattack.js';
        const t1 = dynParts("x.then(function() { return import('./netattack.js'); }); import( \"./netattack.js\" ); import(`/scripts/netattack.js`);", fake);
        const t2 = dynParts("import('./io.js'); import { netAttack } from './netattack.js'; import('/private/index.js');", fake);
        check('3. the rule against a dynamic import of a part, tried on a text of its own: three import( of a part are named, a static import of one and an import( of a script that is no part are not', t1.length === 3 && t2.length === 0, { t1, t2 });
    }
    const dyn = [];
    files.forEach(f => dynParts(srcjoin.raw(f, 'latin1'), g => srcjoin.isPart(g)).forEach(p => dyn.push(f + ': import(' + p + ')')));
    // ... and an import( whose argument is not one plain quoted path (a name, a sum, a template with a part in it) is refused in every
    // script, since no scan can say what it loads (the review of next area 1, 2026-11-18). Judged on each script's tree, so a comment or a
    // string that holds the word is no import; tried first on a text of its own
    const dynLoose = (txt) => {
        const A = L.acorn(); let ast = null;
        for (const st of ['module', 'script']) { try { ast = A.parse(txt, { ecmaVersion: 'latest', sourceType: st, allowHashBang: true, locations: true }); break; } catch (e) { ast = null; } }
        if (!ast) return ['does not parse'];
        const out = [], st = [ast];
        while (st.length) { const n = st.pop(); if (n.type === 'ImportExpression') { const s = n.source, plain = (s.type === 'Literal' && typeof s.value === 'string') || (s.type === 'TemplateLiteral' && s.expressions.length === 0); if (!plain) out.push('line ' + n.loc.start.line); }
            for (const k in n) { if (k === 'loc') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => { if (x && typeof x.type === 'string') st.push(x); }); else if (v && typeof v.type === 'string') st.push(v); } }
        return out; };
    {
        const t1 = dynLoose("var n = './netattack.js'; import(n); import('./' + n); import(`./${n}`); import(cond ? './a.js' : './b.js');");
        const t2 = dynLoose("// import (one) in a comment\nvar s = 'import(x)'; import('./io.js'); import(\"./zip.js\"); import(`./dialogs.js`); import('/private/index.js').catch(function() {});");
        check('3. the rule against an import( of anything but one plain quoted path, tried on a text of its own: a name, a sum, a template with a part in it and a choice are named; a quoted path, a template with no part and the word in a comment or a string are not', t1.length === 4 && t2.length === 0, { t1, t2 });
    }
    const loose = []; let loosed = 0;
    files.forEach(f => { const t = srcjoin.raw(f, 'utf8'); if (!/\bimport\s*\(/.test(t)) return; loosed++; dynLoose(t).forEach(w => loose.push(f + ': ' + w)); });
    check('3. every import( in the app\'s scripts takes one plain quoted path, so the rule above can read what it loads (' + loosed + ' scripts that hold the word)', loosed > 0 && loose.length === 0, loose.slice(0, 10));
    check('3. no script of the app imports a part with import() (' + files.length + ' scripts, ' + parts.length + ' parts): a part is a static import of its root alone', parts.length > 0 && dyn.length === 0, dyn.slice(0, 10));
    const priv = [process.env.WP_PRIVATE_DIR, path.join(ROOT, '..', 'Waypoint-private'), path.join(ROOT, '..', '..', '..', '..', 'Waypoint-private')].filter(Boolean).map(p => path.resolve(p)).find(p => fs.existsSync(path.join(p, 'tools', 'overlay.js')));
    if (priv) {
        const miss = ['overlay.js', 'sbscan.js', 'sbv2.js'].filter(f => { try { return fs.readFileSync(path.join(priv, 'tools', f), 'utf8').indexOf("require(path.join(ROOT, 'tools', 'srcjoin.js')).install();") < 0; } catch (e) { return true; } });
        check('the private bridge\'s overlay.js, sbscan.js and sbv2.js install srcjoin (' + priv + ')', miss.length === 0, miss);
    } else console.log('note      the private bridge folder is not here: its three entry files are not judged');
    // A scan of what ships reads the real bytes: under the wrap a part reads as one neutral line, so its header comment and its glue
    // lines, which ship, would be read by nothing. The website's list of names (updatercheck) and the page's security scans (sinkcheck)
    // read every script through srcjoin.raw; the line each reads with is held here, and raw is proven to answer a part's real bytes.
    const SHIPPED = [['updatercheck.js', "let b = null; try { b = require('./srcjoin').raw(path.join(ROOT, f)); } catch (e) { continue; }"], ['sinkcheck.js', "allScripts = scriptNames.map(f => [f, require('./srcjoin').raw(path.join(dir, f), 'utf8').replace(/\\r\\n/g, '\\n')]);"]];
    const plainRead = SHIPPED.filter(s => { try { return fs.readFileSync(path.join(__dirname, s[0]), 'utf8').indexOf(s[1]) < 0; } catch (e) { return true; } }).map(s => s[0]);
    const rawReal = parts.every(p => { const t = srcjoin.raw(path.join(SCRIPTS, p), 'latin1'); return t.indexOf('// [split:of ' + srcjoin.rootOf(p) + ']') >= 0 && t.indexOf('// [split:glue]') >= 0 && t.indexOf(srcjoin.BODY_START) >= 0; });
    check('the scans of what ships (updatercheck\'s list of names the website refuses, sinkcheck\'s scans of every script) read each script through srcjoin.raw, which answers a part\'s real bytes, its header and glue included', plainRead.length === 0 && rawReal, { plainRead: plainRead, rawReal: rawReal });

    // ---- 3b. a name a root exports through a glue line is for its own parts alone ----
    // The glue re-exports some of the root's private names (a sink, a helper) so that a part can import them. Any module may import
    // what is exported, so this holds that only the root's own parts do, through a static import or a namespace import's member.
    roots.forEach(r => {
        const rawR = srcjoin.raw(r, 'latin1'), glueNames = new Set();
        rawR.split('\n').map(bare).forEach(l => { const m = /^export \{ (.*) \};   \/\/ \[split:glue\]$/.exec(l); if (m) m[1].split(', ').forEach(n => glueNames.add(n)); });
        // names the joined text (the old file) exports already are no new door
        L.parse(srcjoin.joinRoot(r).text).body.forEach(s => {
            if (s.type !== 'ExportNamedDeclaration') return;
            s.specifiers.forEach(sp => glueNames.delete(sp.exported.name || sp.exported.value));
            const d = s.declaration; if (!d) return;
            if (d.id) glueNames.delete(d.id.name);
            (d.declarations || []).forEach(x => { if (x.id && x.id.type === 'Identifier') glueNames.delete(x.id.name); });
        });
        const own = new Set(srcjoin.partsOf(r)), esc = r.replace('.', '\\.'), bad = [];
        files.filter(f => f !== r && !own.has(f)).forEach(f => {
            const t = srcjoin.raw(f, 'latin1');
            const named = new RegExp("import\\s*\\{([^}]*)\\}\\s*from\\s*['\"]\\./" + esc + "['\"]", 'g'); let m;
            while ((m = named.exec(t))) m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0].trim()).filter(n => glueNames.has(n)).forEach(n => bad.push(f + ' imports ' + n));
            const ns = new RegExp("import\\s*\\*\\s*as\\s+([A-Za-z_$][\\w$]*)\\s+from\\s*['\"]\\./" + esc + "['\"]", 'g');
            while ((m = ns.exec(t))) { const a = m[1]; glueNames.forEach(n => { if (new RegExp('\\b' + a.replace(/\$/g, '\\$') + '\\s*\\.\\s*' + n.replace(/\$/g, '\\$') + '\\b').test(t)) bad.push(f + ' reads ' + a + '.' + n); }); }
        });
        check(r + ': the ' + glueNames.size + ' names it exports through a glue line alone (for its parts) are imported by no other script', bad.length === 0, bad.slice(0, 10));
    });

    // ---- 4. systemcore: the real graph against the joined text ----
    if (srcjoin.isRoot('systemcore.js')) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-splitcheck-')), realDir = url.pathToFileURL(SCRIPTS).href + '/';
        try {
            const jt = srcjoin.joinRoot('systemcore.js').text.replace(/(\bfrom\s+|\bimport\s*\(\s*|^import\s+)(['"])\.\/([a-z0-9_.-]+\.js)\2/gm, (a, lead, q, mod) => lead + q + realDir + mod + q);
            fs.writeFileSync(path.join(tmp, 'systemcore.js'), Buffer.from(jt, 'latin1'));
            globalThis.window = {};
            const R = await import(url.pathToFileURL(path.join(SCRIPTS, 'systemcore.js')).href), apiR = globalThis.window.wpSystemCore;
            globalThis.window = {};
            const Jm = await import(url.pathToFileURL(path.join(tmp, 'systemcore.js')).href), apiJ = globalThis.window.wpSystemCore;
            delete globalThis.window;
            const shape = o => Object.keys(o || {}).map(k => { const v = o[k]; let s; if (typeof v === 'function') s = 'function ' + v.name + '/' + v.length; else { try { s = typeof v + ' ' + JSON.stringify(v); } catch (e) { s = typeof v + ' (no JSON)'; } } return k + ' = ' + s; });
            const a = shape(apiR), b = shape(apiJ), diff = a.filter((x, i) => x !== b[i]).slice(0, 8);
            check('systemcore.js: the real module graph and the joined text give the same API object (' + a.length + ' keys, the same order, kind, function name and length, and JSON)', !!apiR && a.length === b.length && diff.length === 0, diff);
            const glueExp = new Set(); srcjoin.raw('systemcore.js', 'latin1').split('\n').map(bare).forEach(l => { const m = /^export \{ (.*) \};   \/\/ \[split:glue\]$/.exec(l); if (m) m[1].split(', ').forEach(n => glueExp.add(n)); });
            const kr = Object.keys(R).filter(k => !glueExp.has(k)), kj = Object.keys(Jm);
            const ex = shape(Object.fromEntries(kr.map(k => [k, R[k]]))), ej = shape(Object.fromEntries(kj.map(k => [k, Jm[k]])));
            check('systemcore.js: the same exports as the joined text, but for the names it re-exports to its parts (' + glueExp.size + '), each the same kind, name, length and JSON', ex.length === ej.length && ex.every((x, i) => x === ej[i]), ex.filter((x, i) => x !== ej[i]).slice(0, 6));
        } catch (e) { check('systemcore.js: the real graph and the joined text load', false, String(e && e.stack || e)); }
        finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {} }
    }

    // ---- 5. net.js: fuzzcheck on the joined text and on the real wiring ----
    if (srcjoin.isRoot('net.js')) {
        const run = bundleMode => new Promise(res => {
            const p = cp.spawn(process.execPath, [path.join(__dirname, 'fuzzcheck.js')], { cwd: ROOT, env: Object.assign({}, process.env, { WP_SPLIT_BUNDLE: bundleMode ? '1' : '' }) });
            const out = []; p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => out.push(d));
            p.on('close', code => res({ code, text: Buffer.concat(out).toString('utf8') }));
        });
        const [j, b] = await Promise.all([run(false), run(true)]);
        const norm = s => s.replace(/\r\n/g, '\n').replace(/\b\d+(\.\d+)?\s*(ms|s)\b/g, '<t>').replace(/(tools[\\\/][a-z0-9]+\.js):\d+:\d+/g, '$1').split('\n').filter(Boolean).sort();
        // compared as counts, line by line: a line printed twice in one run and once in the other is a difference
        const counts = a => { const m = new Map(); a.forEach(x => m.set(x, (m.get(x) || 0) + 1)); return m; };
        const nj = norm(j.text), nb = norm(b.text), cj = counts(nj), cb = counts(nb);
        const over = (x, y) => [...x].filter(([k, n]) => (y.get(k) || 0) !== n).map(([k, n]) => n + 'x ' + k + ' (other run ' + (y.get(k) || 0) + 'x)');
        const onlyJ = over(cj, cb).slice(0, 5), onlyB = over(cb, cj).slice(0, 5);
        check('net.js: fuzzcheck gives the same lines and exit code on the joined text and on the real wiring, each part seeing only what it imports (' + nj.length + ' lines, exit ' + j.code + ')', j.code === b.code && !onlyJ.length && !onlyB.length && /net\.js loads whole/.test(b.text), { exit: [j.code, b.code], joinedOnly: onlyJ, realOnly: onlyB });
    }

    // ---- 5b. sheets.js: its joined text and its real wiring load alike, and its parts' functions run alike ----
    // sheets.js is only ever tested as text, so this is the one place its real wiring runs (docs/REFACTOR_SPLIT_PLAN.md, area 2's
    // prerequisite). Both texts load in a page of stubs (pageLoad): the joined text, and srcjoin.bundle's real wiring, in which each part
    // sees only the names it imports. They must set the same window globals, give window.wpSheets the same keys (each the same kind, and
    // a function the same name and length), and bind every name a part returns, each the same kind. Then each name a part returns is
    // called in both, in the same order, once with no arguments and once with stubs for its arguments, and each call must end alike
    // (the kind of what it answers, or the same error): a part function that misses an import throws a ReferenceError only in the
    // real wiring, and only when its path runs. Before sheets.js is split the bundle is its own text, and the check shows the harness runs.
    {
        const name = 'sheets.js', split = srcjoin.isRoot(name);
        let a = null, b = null, err = null;
        try { a = pageCalls(name, false, 'wpSheets'); b = pageCalls(name, true, 'wpSheets'); } catch (e) { err = e; }
        if (err) check(name + ': the joined text and the real wiring load in a page of stubs', false, String(err && err.stack || err).slice(0, 600));
        else {
            const diff = (x, y) => x.filter((v, i) => v !== y[i]).slice(0, 8);
            const shapeA = a.shape, shapeB = b.shape;
            check(name + (split ? '' : ' (not split yet)') + ': the joined text and the real wiring set the same window globals and give window.wpSheets the same ' + shapeA.length + ' keys, each the same kind, function name and length', shapeA.length > 20 && shapeA.length === shapeB.length && diff(shapeA, shapeB).length === 0, diff(shapeA, shapeB));
            const unbound = b.names.filter(x => / undefined$/.test(x));
            check(name + ': the real wiring binds every name its parts return (' + b.names.length + '), each the same kind as in the joined text', unbound.length === 0 && a.names.length === b.names.length && diff(a.names, b.names).length === 0, { unbound: unbound.slice(0, 8), differ: diff(a.names, b.names) });
            check(name + ': each name its parts return, called in the same order in both (with no arguments, then with stubs), ends alike: the same kind of answer or the same error (' + a.calls.length + ' calls)', a.calls.length === b.calls.length && diff(a.calls, b.calls).length === 0, diff(b.calls, a.calls));
        }
    }

    // ---- 5c. whiteboard.js: its joined text and its real wiring load alike, and its parts' functions run alike ----
    // As 5b, for whiteboard.js, which is also only ever tested as text (docs/REFACTOR_SPLIT_PLAN.md, "Next areas", step 0, before its
    // first cut). It sets many window globals of its own, so every object among them is compared key for key.
    {
        const name = 'whiteboard.js', split = srcjoin.isRoot(name);
        let a = null, b = null, err = null;
        try { a = pageCalls(name, false, null); b = pageCalls(name, true, null); } catch (e) { err = e; }
        if (err) check(name + ': the joined text and the real wiring load in a page of stubs', false, String(err && err.stack || err).slice(0, 600));
        else {
            const diff = (x, y) => x.filter((v, i) => v !== y[i]).slice(0, 8);
            check(name + (split ? '' : ' (not split yet)') + ': the joined text and the real wiring set the same window globals, each object among them with the same keys (' + a.shape.length + ' in all), each the same kind, function name and length', a.shape.length > 20 && a.shape.length === b.shape.length && diff(a.shape, b.shape).length === 0, diff(a.shape, b.shape));
            const unbound = b.names.filter(x => / undefined$/.test(x));
            check(name + ': the real wiring binds every name its parts return (' + b.names.length + '), each the same kind as in the joined text', unbound.length === 0 && a.names.length === b.names.length && diff(a.names, b.names).length === 0, { unbound: unbound.slice(0, 8), differ: diff(a.names, b.names) });
            check(name + ': each name its parts return, called in the same order in both (with no arguments, then with stubs), ends alike: the same kind of answer or the same error (' + a.calls.length + ' calls)', a.calls.length === b.calls.length && diff(a.calls, b.calls).length === 0, diff(b.calls, a.calls));
        }
    }

    // ---- 6. sweeps ----
    parts.forEach(p => {
        const w = fs.readFileSync(path.join(SCRIPTS, p), 'utf8'), root = srcjoin.rootOf(p);
        const marks = (srcjoin.raw(p, 'latin1').match(/\/\/ \[[a-z0-9]+:[A-Za-z0-9_-]+\]/g) || []).filter(m => m.indexOf('[split:') < 0);
        const J = srcjoin.joinRoot(root).text, rawRoot = srcjoin.raw(root, 'latin1');
        const off = [...new Set(marks)].filter(m => J.split(m).length - 1 !== (rawRoot.split(m).length - 1) + (marks.filter(x => x === m).length));
        check(p + ': under the wrap it reads as one neutral line, and each of its ' + marks.length + ' suite markers stands in the joined ' + root + ' as often as in the part and the root together', w === '// [split:part of ' + root + ']\n' && off.length === 0, off);
    });

    // ---- 7. a part's markers are read by the part's name ----
    // A suite that cuts a moved region out by its markers reads it from the part by name (tools/checkkit.js netSlices with the file, or
    // srcjoin.raw), never from the joined root alone: a line that holds the literal of a marker only a part holds names that part's file
    const own7 = new Set(['srcjoin.js', 'splitlib.js', 'splitcheck.js', 'checkkit.js', 'suitecount.js']);
    const byPart7 = [];   // [the marker's words, e.g. "netcheck:attempt", the part that holds it]
    parts.forEach(p => {
        const rootRaw = srcjoin.raw(srcjoin.rootOf(p), 'latin1');
        const names = new Set((srcjoin.raw(p, 'latin1').match(/\/\/ \[([a-z0-9]+:[A-Za-z0-9_]+)-(?:start|end)\]/g) || []).map(m => m.slice(4, m.lastIndexOf('-'))));
        names.forEach(n => { if (n.indexOf('split:') !== 0 && rootRaw.indexOf('[' + n + '-') < 0) byPart7.push([n, p]); });   // a suite's markers, never the split's own body lines
    });
    // the definitions only a part holds: each line of its body that begins a function, a net. function or a var at the left margin,
    // up to and including its "(" or "=", where the root's own text (its lines that stayed) holds no such text
    const defs7 = [];   // [the definition's text, e.g. "function attRowAlts(", the part that holds it]
    parts.forEach(p => {
        const rootRaw = srcjoin.raw(srcjoin.rootOf(p), 'latin1').replace(/\r\n/g, '\n'), body = srcjoin.raw(p, 'latin1').replace(/\r\n/g, '\n');
        const seen = new Set();
        (body.match(/^(?:function [A-Za-z0-9_$]+\(|net\.[A-Za-z0-9_$]+ = function\(|var [A-Za-z0-9_$]+ =)/gm) || []).forEach(d => {
            if (seen.has(d)) return; seen.add(d);
            if (rootRaw.indexOf(d) < 0) defs7.push([d, p]);
        });
    });
    // A definition a part holds may also stand at the left margin of a script of another family: net.js keeps its own var FACE_PICS, as
    // systemcore.js's part cleancore.js does. A line that cuts at such a definition is excused only where every text it cuts is read
    // from such a script: each receiver of its indexOf is a name bound (below, binds7) to a read whose path names that script, as
    // netcheck's src is to net.js, so the line reads that script's own definition and no part's (the review of next area 2)
    const famOf7 = p => { const r = srcjoin.rootOf(p); return new Set([r].concat(srcjoin.partsOf(r))); };
    // A literal cuts at a part's definition only where the part's own text holds the whole literal: "async function close()" holds the
    // words "function close(", which sysedbox.js defines, yet a tool that cuts at it (catalogcheck, at the Library window's own close)
    // reads another script, since no part holds that literal (area 7, 2026-11-19, where the System editor's parts define open, close,
    // select and input, whose words other scripts hold inside longer anchors). The literal is a string's value, so an escaped line
    // break is a real one, as the part's text read with CRLF as LF holds it.
    const partTxt7 = {}, partHas7 = (p, s) => (partTxt7[p] = partTxt7[p] || srcjoin.raw(p, 'latin1').replace(/\r\n/g, '\n')).indexOf(s) >= 0;
    const elsewhere7 = new Map();   // "the definition|its part" -> the scripts of other families that hold it at the left margin too
    defs7.forEach(([d, p]) => {
        const fam = famOf7(p);
        elsewhere7.set(d + '|' + p, fs.readdirSync(SCRIPTS).filter(f => /\.js$/.test(f) && !fam.has(f)
            && fs.readFileSync(path.join(SCRIPTS, f), 'latin1').replace(/\r\n/g, '\n').split('\n').some(l => l.indexOf(d) === 0)));
    });
    // binds7: which script files a name of a tool stands for, where it is read. A name set by a declaration stands for every file a string
    // of its value names (kit.part('cleancore.js'), a readFileSync of a path ending in net.js) and every file a name in its value stands
    // for; a function's parameter stands for every file its call sites hand it (netcheck's faceRule(scF) and faceRule(ps)). A name is
    // read at a place by the scopes, as the language reads it: of the declarations of that name whose scope holds the place and that stand
    // before it, the innermost scope's, and in that scope the latest (a var's scope is its function, a let's, a const's and a class's its
    // block, a parameter's its function). resolve(name, at) answers a Set of file names, empty for a name it does not know.
    function binds7(acorn, src) {
        let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowHashBang: true, locations: true }); } catch (e) { return null; }
        const kids = n => { const o = []; for (const k in n) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => { if (x && typeof x.type === 'string') o.push(x); }); else if (v && typeof v.type === 'string') o.push(v); } return o; };
        const each = (n, f) => { const st = [n]; while (st.length) { const x = st.pop(); f(x); const k = kids(x); for (let i = k.length - 1; i >= 0; i--) st.push(k[i]); } };
        const isFn = n => n && /^(ArrowFunctionExpression|FunctionExpression|FunctionDeclaration)$/.test(n.type);
        const decls = [];   // { name, at: where it is declared, s0, s1: its scope, files: Set }
        const resolve = (name, at) => {
            let best = null;
            decls.forEach(d => { if (d.name === name && d.s0 <= at && at < d.s1 && d.at <= at && (!best || d.s0 > best.s0 || (d.s0 === best.s0 && d.at >= best.at))) best = d; });
            return best ? best.files : new Set();
        };
        const filesIn = (n, at) => { const s = new Set(); each(n, y => {
            const t = y.type === 'Literal' && typeof y.value === 'string' ? y.value : y.type === 'TemplateElement' ? y.value.cooked : null;
            if (t) (t.match(/[A-Za-z0-9_-]+\.js\b/g) || []).forEach(x => s.add(x));
            if (y.type === 'Identifier') resolve(y.name, at).forEach(x => s.add(x));
        }); return s; };
        const fns = [];   // [the function's name, its scope, its parameters' declarations]
        const later = [];   // [a declaration, the value it is set to], worked out in source order once every declaration is known
        const walk = (n, fnScope, block) => {
            if (isFn(n)) {
                const sc = [n.start, n.end], ps = n.params.map(q => q.type === 'Identifier' ? { name: q.name, at: n.start, s0: sc[0], s1: sc[1], files: new Set() } : null);
                ps.forEach(q => { if (q) decls.push(q); });
                if (n.type === 'FunctionDeclaration' && n.id) fns.push([n.id.name, block, ps]);
                kids(n).forEach(k => walk(k, sc, sc));
                return;
            }
            if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier') {
                const sc = n.kind === 'var' ? fnScope : block;
                if (isFn(n.init)) {
                    walk(n.init, fnScope, block);
                    const ps = decls.filter(d => d.s0 === n.init.start && d.at === n.init.start);
                    fns.push([n.id.name, sc, n.init.params.map(q => q.type === 'Identifier' ? ps.find(d => d.name === q.name) : null)]);
                    return;
                }
                const d = { name: n.id.name, at: n.start, s0: sc[0], s1: sc[1], files: new Set() }; decls.push(d);
                if (n.init) { later.push([d, n.init]); walk(n.init, fnScope, block); }
                return;
            }
            if (n.type === 'VariableDeclaration') { n.declarations.forEach(x => { x.kind = n.kind; walk(x, fnScope, block); }); return; }
            const nb = /^(BlockStatement|ForStatement|ForInStatement|ForOfStatement|SwitchStatement|CatchClause|StaticBlock)$/.test(n.type) ? [n.start, n.end] : block;
            kids(n).forEach(k => walk(k, fnScope, nb));
        };
        const whole = [ast.start, ast.end];
        try { walk(ast, whole, whole); } catch (e) { return null; }
        later.sort((a, b) => a[0].at - b[0].at).forEach(([d, v]) => filesIn(v, d.at).forEach(x => d.files.add(x)));
        const fnAt = (name, at) => { let best = null; fns.forEach(f => { if (f[0] === name && f[1][0] <= at && at < f[1][1] && (!best || f[1][0] > best[1][0])) best = f; }); return best; };
        each(ast, n => { if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
            const f = fnAt(n.callee.name, n.start); if (!f) return;
            n.arguments.forEach((a, i) => { if (f[2][i]) filesIn(a, n.start).forEach(x => f[2][i].files.add(x)); });
        } });
        return resolve;
    }
    const bindSrc7 = "var a = kit.part('cleancore.js');\nconst b = fs.readFileSync(path.join(d, 'net.js'));\nconst f = s => s.indexOf('x');\nf(a); f(b);\nconst a2 = a;\n{ const b = raw('wbbuild.js'); b.indexOf('y'); }\nb.indexOf('z');\n";
    const bindTry7 = binds7(L.acorn(), bindSrc7), at7 = t => bindSrc7.indexOf(t), set7 = (n, t) => bindTry7 ? [...bindTry7(n, at7(t))].sort().join() : null;
    check('7. the rule that a name stands for the files its read names, tried on a text of its own: a part read by name, a path, a name set to another name, a function\'s parameter by its call sites, a name declared again in an inner block read there and the outer one read outside it, and a name read before it is declared standing for nothing',
        !!bindTry7 && set7('a', 'const b') === 'cleancore.js' && set7('b', 'const f') === 'net.js' && set7('s', "s.indexOf('x')") === 'cleancore.js,net.js'
        && set7('a2', '{ const b') === 'cleancore.js' && set7('b', "b.indexOf('y')") === 'wbbuild.js' && set7('b', "b.indexOf('z')") === 'net.js' && set7('b', 'var a') === '' && set7('zz', 'f(a)') === '');
    const anchorCall7 = /\b(?:fnSrc|cut|indexOf|range|between|tryBetween|lineOf)\(/;
    // A part is named on a line only by a string or a template that holds its file's name (a path, kit.part('x.js'), srcjoin.raw): a
    // comment never names it, or a comment could quiet point 7 on a real pin (the review of next area 2, 2026-11-18). Each tool is read by
    // the parser's tokenizer, which tells strings and templates from comments and regexes, each string's text by the lines it spans; a
    // slice's anchor is matched on those strings too. The rule is tried on a text of its own first.
    function lineStrs7(acorn, src) {
        const by = new Map();
        try {
            for (const t of acorn.tokenizer(src, { ecmaVersion: 'latest', allowHashBang: true, locations: true })) {
                if (t.type.label !== 'string' && t.type.label !== 'template') continue;
                for (let l = t.loc.start.line; l <= t.loc.end.line; l++) { if (!by.has(l)) by.set(l, []); by.get(l).push(String(t.value)); }
            }
        } catch (e) { return null; }
        return by;
    }
    const try7 = lineStrs7(L.acorn(), "x.indexOf('a'); // kit.part('cleancore.js')\nkit.part('cleancore.js').indexOf('b');\nconst r = /'cleancore.js'/; y(`${z}cleancore.js`);\n");
    const try7has = l => ((try7 && try7.get(l)) || []).filter(v => v.indexOf('cleancore.js') >= 0).length;
    check('7. the rule that only a string names a part, tried on a text of its own: a comment that names the part names nothing, a string and a template do, and a regex that holds the name does not',
        !!try7 && try7has(1) === 0 && try7has(2) === 1 && try7has(3) === 1, try7 && [...try7]);
    // unnamed7In: the lines of one tool's text that read a part's marker or cut at a part's definition without naming that very part
    function unnamed7In(f, toolSrc, unnamed7) {
        const strs = lineStrs7(L.acorn(), toolSrc), bind = binds7(L.acorn(), toolSrc);
        if (!strs || !bind) { unnamed7.push(f + ' does not parse'); return; }
        // each receiver of an indexOf on a line, with where it stands in the tool; a line names a part where a string on it does, or
        // where every such receiver stands for that part (a name set to kit.part('netattack.js') on a line before)
        let off = 0;
        const recvOf = (line, at) => { const o = []; let m; const re = /\b([A-Za-z0-9_$]+)\.(?:indexOf|lastIndexOf)\(/g; while ((m = re.exec(line))) o.push([m[1], at + m.index]); return o; };
        const names = (i, p, recv) => (strs.get(i + 1) || []).some(v => v.indexOf(p) >= 0) || (recv.length > 0 && recv.every(([r, at]) => bind(r, at).has(p)));
        toolSrc.split('\n').forEach((line, i) => {
            const at = off; off += line.length + 1;
            const recv = recvOf(line, at);
            byPart7.forEach(([n, p]) => {
                const tag = line.indexOf('[' + n + '-start]') >= 0 || line.indexOf('[' + n + '-end]') >= 0, said = line.indexOf("'" + n + "'") >= 0 || line.indexOf('"' + n + '"') >= 0;
                if ((tag || said) && !names(i, p, recv)) unnamed7.push(f + ':' + (i + 1) + ' reads [' + n + ']' + (tag ? '' : ' (a quoted marker)') + ' without naming ' + p);
            });
            if (!anchorCall7.test(line)) return;
            const lits = strs.get(i + 1) || [];
            defs7.forEach(([d, p]) => {
                if (!lits.some(s => s.indexOf(d) >= 0 && partHas7(p, s)) || names(i, p, recv)) return;
                const other = elsewhere7.get(d + '|' + p) || [];
                if (other.length && recv.length && recv.every(([r, ra]) => other.some(x => bind(r, ra).has(x)))) return;
                unnamed7.push(f + ':' + (i + 1) + ' cuts at "' + d + '", which only ' + p + ' holds, without naming it');
            });
        });
    }
    // tried on a text of its own: a line that names netlink.js does not name the part that holds the trade marker or tradeDo's
    // definition (nettrade.js), and a line that names nettrade.js does (the review of next area 3, 2026-11-18)
    const tryNames7 = () => {
        const mk = byPart7.filter(x => x[1] === 'nettrade.js')[0], df = defs7.filter(x => x[1] === 'nettrade.js' && x[0] === 'function tradeDo(')[0];
        if (!mk || !df) return false;
        const q = s => JSON.stringify(s), tag = '// [' + mk[0] + '-start]';
        const txt = ["const t = kit.part('netlink.js'); t.indexOf(" + q(tag) + ');', "kit.part('nettrade.js').indexOf(" + q(tag) + ');',
            "const u = kit.part('netlink.js'); u.indexOf(" + q(df[0]) + ');', "const w = kit.part('nettrade.js'); w.indexOf(" + q(df[0]) + ');'].join('\n') + '\n';
        const got = []; unnamed7In('try', txt, got);
        return got.length === 2 && got[0].indexOf('try:1 ') === 0 && got[0].indexOf('nettrade.js') >= 0 && got[1].indexOf('try:3 ') === 0 && got[1].indexOf('nettrade.js') >= 0;
    };
    check('7. the rule that a line is excused only by naming the very part that holds its marker or its definition, tried on a text of its own: a line that names netlink.js does not cover nettrade.js\'s trade marker or tradeDo, a line that names nettrade.js does', tryNames7());
    // tried on a text of its own: a literal that holds a part's definition only inside a longer anchor no part holds cuts at nothing,
    // and the definition itself cut on a read of another part is named (area 7, 2026-11-19)
    const tryLit7 = () => {
        const df = defs7.filter(x => x[1] === 'nettrade.js' && x[0] === 'function tradeDo(')[0]; if (!df) return false;
        const got = []; unnamed7In('try', "const w = kit.part('netlink.js'); w.indexOf('async function tradeDo(x, y, z) {');\nconst u = kit.part('netlink.js'); u.indexOf('function tradeDo(');\n", got);
        return got.length === 1 && got[0].indexOf('try:2 ') === 0;
    };
    check('7. the rule that a literal cuts at a part\'s definition only where the part holds the whole literal, tried on a text of its own: an anchor no part holds is no cut at the definition its words contain, and the definition itself is', tryLit7());
    const unnamed7 = [];
    fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !own7.has(f)).forEach(f => unnamed7In(f, fs.readFileSync(path.join(__dirname, f), 'utf8'), unnamed7));
    check('7. a line of a tool that holds the literal of a marker only a part holds (' + byPart7.length + ' such markers), names one as a quoted string, or cuts a slice at a definition only a part holds (' + defs7.length + ' such definitions), names that part\'s file, so the area\'s tests read it by name', byPart7.length > 0 && defs7.length > 0 && unnamed7.length === 0, unnamed7.slice(0, 20));

    // ---- 7b. a source pin on a root's text holds no text only a part holds ----
    // A pin is an includes(...) or a split(...) with a quoted string, or a plain regex's .test(...), whose text is a root's: a call that
    // reads the root (readFileSync, read, joined or readSrc of a path that ends in the root's name, which srcjoin answers joined), or a
    // name a line of the same tool last set to such a read. Where the pinned text stands in no line of the root's own text but in one of
    // its parts, the pin reads the part by name instead (kit.part or srcjoin.raw), so the area's tests say where the code lives (the
    // review of area 3, 2026-11-18). A slice cut by indexOf between two anchors is not judged here: one that crosses from the root into
    // a part reads the joined text on purpose (point 7 judges a slice cut at a definition only a part holds).
    const rootTxt7b = {}, partsTxt7b = {};
    roots.forEach(r => { rootTxt7b[r] = srcjoin.raw(r, 'utf8').replace(/\r\n/g, '\n'); partsTxt7b[r] = srcjoin.partsOf(r).map(p => [p, srcjoin.raw(p, 'utf8').replace(/\r\n/g, '\n')]); });
    const rootAlt7b = roots.map(r => r.replace(/\./g, '\\.')).join('|'), reads7b = '(?:readFileSync|read|joined|readSrc|rootRead|rdN)';   // rootRead, rdN: lookcheck's and netcheck's own readers (the review of next area 1)
    const assign7b = new RegExp('\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:[\\w$.]+\\.)?' + reads7b + '\\((?:(?!,\\s*[A-Za-z_$][\\w$]*\\s*=)[^;])*?[\'"/](' + rootAlt7b + ')[\'"]', 'g');
    const other7b = /\b([A-Za-z_$][\w$]*)\s*=\s*(?:[\w$.]+\.|require\([^)]*\)\.)?(?:part|cut|raw)\(/g;   // a name set to a part's text, or any other text, is no root's
    const direct7b = new RegExp(reads7b + '\\((?:[^()]|\\([^()]*\\))*?[\'"/](' + rootAlt7b + ')[\'"](?:[^()]|\\([^()]*\\))*\\)\\)?(?:\\.replace\\([^()]*\\))?\\.(?:includes|split)\\(\\s*(\'(?:[^\'\\\\\\n]|\\\\.)*\'|"(?:[^"\\\\\\n]|\\\\.)*")', 'g');
    // the src that netSlices (tools/checkkit.js) hands back is the joined net.js: const { src, between } = kit.netSlices('x'), or { src: nS }
    const slices7b = /\{([^{}]*)\}\s*=\s*(?:[\w$.]+\.|require\([^)]*\)\.)?netSlices\(/g;
    const srcOf7b = (inner, vars) => inner.split(',').forEach(x => { const kv = x.split(':').map(s => s.trim()); if (kv[0] === 'src' && /^[A-Za-z_$][\w$]*$/.test(kv[1] || 'src')) vars.set(kv[1] || 'src', 'net.js'); });
    const pin7b = /([A-Za-z_$][\w$]*)\.(?:includes|split)\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
    const rx7b = /\/((?:[^/\\\n[]|\\.|\[(?:[^\]\\\n]|\\.)*\])+)\/[gimsuy]*\.test\(\s*([A-Za-z_$][\w$]*)\s*\)/g;
    const lit7b = s => { try { const v = Function('"use strict"; return (' + s + ');')(); return typeof v === 'string' ? v : null; } catch (e) { return null; } };
    const bad7b = []; let pins7b = 0;
    const judge7b = (where, root, s) => {
        if (typeof s !== 'string' || s.length < 6) return; pins7b++;
        if (rootTxt7b[root].indexOf(s) >= 0) return;
        const holders = partsTxt7b[root].filter(x => x[1].indexOf(s) >= 0).map(x => x[0]);
        if (holders.length) bad7b.push(where + ' pins the joined ' + root + ' on text only ' + holders.join(' and ') + ' holds: ' + JSON.stringify(s).slice(0, 100));
    };
    fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !own7.has(f)).forEach(f => {
        const vars = new Map();
        fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').forEach((line, i) => {
            const where = f + ':' + (i + 1); let m;
            assign7b.lastIndex = 0; while ((m = assign7b.exec(line))) vars.set(m[1], m[2]);
            other7b.lastIndex = 0; while ((m = other7b.exec(line))) vars.delete(m[1]);
            slices7b.lastIndex = 0; while ((m = slices7b.exec(line))) srcOf7b(m[1], vars);
            direct7b.lastIndex = 0; while ((m = direct7b.exec(line))) judge7b(where, m[1], lit7b(m[2]));
            pin7b.lastIndex = 0; while ((m = pin7b.exec(line))) { const r = vars.get(m[1]); if (r) judge7b(where, r, lit7b(m[2])); }
            rx7b.lastIndex = 0; while ((m = rx7b.exec(line))) {
                const r = vars.get(m[2]), b = m[1]; if (!r) continue;
                if (/(^|[^\\])[.*+?()[\]{}|^$]/.test(b.replace(/\\\\/g, ''))) continue;   // a regex that is no plain text once its escapes are read
                judge7b(where, r, b.replace(/\\(.)/g, '$1'));
            }
        });
    });
    // the rule tried on a text of its own: a pin on the joined sheets.js of a line only sheetlink.js holds, by a name and by a direct read
    const try7b = () => {
        const keep = bad7b.length, line = (partsTxt7b['sheets.js'].filter(x => x[0] === 'sheetlink.js')[0] || [null, ''])[1].split('\n').filter(l => /^function [A-Za-z]+\(/.test(l) && rootTxt7b['sheets.js'].indexOf(l) < 0)[0] || '';
        const q = JSON.stringify(line), vars = new Map([['shT', 'sheets.js']]);
        const a = 'const shT = fs.readFileSync(path.join(app, \'scripts\', \'sheets.js\'), \'utf8\');', b = 'check(\'x\', shT.includes(' + q + '));', c = 'check(\'y\', read(\'scripts/sheets.js\').includes(' + q + '));';
        let m; assign7b.lastIndex = 0; const set = (m = assign7b.exec(a)) && m[1] === 'shT' && m[2] === 'sheets.js';
        pin7b.lastIndex = 0; while ((m = pin7b.exec(b))) { const r = vars.get(m[1]); if (r) judge7b('try:b', r, lit7b(m[2])); }
        direct7b.lastIndex = 0; while ((m = direct7b.exec(c))) judge7b('try:c', m[1], lit7b(m[2]));
        const got = bad7b.splice(keep);
        return !!line && set && got.length === 2 && got[0].indexOf('sheetlink.js') >= 0 && got[1].indexOf('sheetlink.js') >= 0;
    };
    check('7b. the rule tried on a text of its own: a pin on the joined sheets.js of a line only sheetlink.js holds is named, set by a name and read directly', try7b());
    // through the src netSlices hands back, plain and renamed, with a part of another name read on the same line (the review of next area 3)
    const try7bSlices = () => {
        const keep = bad7b.length; let m;
        const nt = (partsTxt7b['net.js'].filter(x => x[0] === 'nettrade.js')[0] || [null, ''])[1].split('\n').filter(l => /^function [A-Za-z]+\(/.test(l) && rootTxt7b['net.js'].indexOf(l) < 0)[0] || '';
        const nq = JSON.stringify(nt), nv = new Map();
        const d = "const { src, between } = kit.netSlices('x'), other = 1; const { src: nS } = require('./checkkit').netSlices('y');", e = "check('z', src.includes(" + nq + ") && kit.part('netlink.js').includes('x') && nS.includes(" + nq + '));';
        slices7b.lastIndex = 0; while ((m = slices7b.exec(d))) srcOf7b(m[1], nv);
        pin7b.lastIndex = 0; while ((m = pin7b.exec(e))) { const r = nv.get(m[1]); if (r) judge7b('try:e', r, lit7b(m[2])); }
        const got = bad7b.splice(keep);
        return !!nt && got.length === 2 && got.every(g => g.indexOf('try:e') === 0 && g.indexOf('nettrade.js') >= 0) && nv.get('src') === 'net.js' && nv.get('nS') === 'net.js' && !nv.has('between') && !nv.has('other');
    };
    check('7b. the rule tried on a text of its own: a pin on the joined net.js of a line only nettrade.js holds, through the src netSlices hands back (plain and renamed), is named whatever else the line reads', try7bSlices());
    check('7b. a source pin (includes, split or a plain regex) on the joined text of a root holds no text that only one of its parts holds, so it reads that part by name (' + pins7b + ' pins on a root judged)', pins7b > 0 && bad7b.length === 0, bad7b.slice(0, 20));

    // ---- 7c. the same, on each tool's own tree ----
    // 7b reads a line with patterns, so a pin made through a helper of the tool's own (count(wbSrc, ...), after(wbS, ...), a wbFn that reads
    // the joined text), a regex's match, an indexOf compared with -1, a name set to another (nj = src) or a reader it does not know passed
    // it by (the review of next area 1, 2026-11-18: seven such pins on wbbuild.js's and wbgen.js's text, two on net.js's parts). pins7c reads
    // each tool with the parser, in source order, and follows what holds a root's joined text: a name set to a call that reads a root's path
    // (never a part's, a raw read or a slice), a name set to such a name, and a function whose body reads one. Each literal handed to a pin
    // on that text (above, in the header) is judged as 7b judges: text the root's own lines lack and a part holds is named.
    function pins7c(acorn, src, roots, rootTxt, partsTxt, minLen) {
        const out = [];
        let ast; try { ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowAwaitOutsideFunction: true, allowReturnOutsideFunction: true, allowHashBang: true, locations: true }); } catch (e) { return [{ line: 0, root: '', holders: [], what: 'does not parse: ' + e.message }]; }
        const NOREAD = /^(part|partOf|raw|isPart|isRoot|rootOf|partsOf|joinRoot|url|freshUrl|fresh|require|pathToFileURL|existsSync|statSync|join|resolve|dirname|basename)$/;
        const SLICERS = /^(between|tryBetween|fnSrc|cut\w*|range|lineOf|slice|substring|substr|sliceOf|slicer|netSlices|sheetsSlicer)$/;
        const PINS = /^(includes|match|matchAll|split|search|replace|replaceAll|startsWith|endsWith)$/;
        const kids = n => { const o = []; for (const k in n) { if (k === 'loc' || k === 'start' || k === 'end' || k === 'type') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(x => { if (x && typeof x.type === 'string') o.push(x); }); else if (v && typeof v.type === 'string') o.push(v); } return o; };
        const each = (n, f) => { const st = [n]; while (st.length) { const x = st.pop(); f(x); const k = kids(x); for (let i = k.length - 1; i >= 0; i--) st.push(k[i]); } };
        // the names a function's body reads: every Identifier but a property's key and a member's name, which are words and no reads (a
        // function that builds { sheet: [] } reads no `sheet` a tool set to sheets.js: found by area 7, 2026-11-19)
        const readsIn = (body, f) => { const keys = new Set(); each(body, y => { if ((y.type === 'Property' && !y.computed && !y.shorthand) || (y.type === 'MethodDefinition' && !y.computed)) keys.add(y.key); else if (y.type === 'MemberExpression' && !y.computed) keys.add(y.property); }); each(body, y => { if (y.type === 'Identifier' && !keys.has(y)) f(y); }); };
        const nameOf = c => c.type === 'Identifier' ? c.name : (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' ? c.property.name : null);
        const rootIn = s => { if (typeof s !== 'string') return null; const b = s.split(/[\\/]/).pop(); return roots.indexOf(b) >= 0 ? b : null; };
        // a call that reads a root: any call but a part's or a raw read, a path call or a slice, with a quoted path among its arguments that ends in a root's name
        const readsRoot = x => {
            if (!x || x.type !== 'CallExpression') return null;
            const nm = nameOf(x.callee); if (!nm || NOREAD.test(nm) || SLICERS.test(nm) || PINS.test(nm)) return null;
            let hit = null; x.arguments.forEach(a => each(a, y => { if (hit) return; if (y.type === 'Literal') hit = rootIn(y.value); else if (y.type === 'TemplateElement') hit = rootIn(y.value.cooked); }));
            return hit;
        };
        const strip = x => { while (x && x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && !x.callee.computed && /^(replace|toString|trim)$/.test(x.callee.property.name)) x = x.callee.object; return x; };
        const vars = new Map(), fns = new Map();
        const rootOf = x => { x = strip(x); if (!x) return null; if (x.type === 'Identifier') return vars.get(x.name) || null; return readsRoot(x); };
        const lits = [];   // [literal node, root]
        const judgeArgs = (n, root) => n.arguments.forEach(a => { if (a.type === 'Literal' && (a.regex || typeof a.value === 'string')) lits.push([a, root]); });
        // a walk in source order, with each node's parent
        const walk = (n, parent) => {
            if (n.type === 'VariableDeclarator' && n.id.type === 'ObjectPattern' && n.init) {
                // const { src, between } = kit.netSlices('x'): its src is the joined net.js (tools/checkkit.js); any other name it binds holds no root
                const ns = strip(n.init), fromSlices = ns && ns.type === 'CallExpression' && nameOf(ns.callee) === 'netSlices';
                n.id.properties.forEach(p => {
                    if (p.type !== 'Property' || p.value.type !== 'Identifier') return;
                    const key = !p.computed && (p.key.type === 'Identifier' ? p.key.name : p.key.value);
                    if (fromSlices && key === 'src' && roots.indexOf('net.js') >= 0) vars.set(p.value.name, 'net.js'); else vars.delete(p.value.name);
                });
            } else if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.init) {
                const nm = n.id.name;
                if (/Function/.test(n.init.type)) { let r = null; readsIn(n.init.body, y => { if (!r && vars.has(y.name)) r = vars.get(y.name); }); if (r && !SLICERS.test(nm)) fns.set(nm, r); else fns.delete(nm); }
                else { const r = rootOf(n.init); if (r) vars.set(nm, r); else vars.delete(nm); }
            } else if (n.type === 'AssignmentExpression' && n.left.type === 'Identifier') {
                const r = rootOf(n.right); if (r) vars.set(n.left.name, r); else vars.delete(n.left.name);
            } else if (n.type === 'FunctionDeclaration' && n.id) {
                let r = null; readsIn(n.body, y => { if (!r && vars.has(y.name)) r = vars.get(y.name); }); if (r && !SLICERS.test(n.id.name)) fns.set(n.id.name, r); else fns.delete(n.id.name);
            } else if (n.type === 'CallExpression') {
                const c = n.callee, nm = nameOf(c);
                if (c.type === 'MemberExpression' && !c.computed && nm && PINS.test(nm)) { const r = rootOf(c.object); if (r) judgeArgs(n, r); }
                else if (c.type === 'MemberExpression' && !c.computed && (nm === 'indexOf' || nm === 'lastIndexOf')) {
                    // a pin, where it is compared with 0 or -1; an anchor of a slice otherwise, which point 7 judges
                    const r = rootOf(c.object), num = x => x && ((x.type === 'Literal' && (x.value === 0 || x.value === -1)) || (x.type === 'UnaryExpression' && x.operator === '-' && x.argument.type === 'Literal' && x.argument.value === 1));
                    if (r && parent && parent.type === 'BinaryExpression' && /^(<|>=|===|!==|==|!=|>)$/.test(parent.operator) && num(parent.left === n ? parent.right : parent.left)) judgeArgs(n, r);
                }
                else if (c.type === 'MemberExpression' && !c.computed && (nm === 'test' || nm === 'exec') && c.object.type === 'Literal' && c.object.regex) { const r = n.arguments[0] && rootOf(n.arguments[0]); if (r) lits.push([c.object, r]); }
                else if (c.type === 'Identifier' && fns.has(c.name)) judgeArgs(n, fns.get(c.name));
                else if (nm && !SLICERS.test(nm) && !PINS.test(nm) && nm !== 'indexOf' && nm !== 'lastIndexOf') { const r = n.arguments.map(a => a.type === 'Identifier' ? vars.get(a.name) : null).filter(Boolean)[0]; if (r) judgeArgs(n, r); }
            }
            kids(n).forEach(k => walk(k, n));
        };
        walk(ast, null);
        lits.forEach(([l, root]) => {
            const parts = partsTxt[root] || [];
            if (l.regex) {
                let re; try { re = new RegExp(l.regex.pattern, l.regex.flags.replace(/[gy]/g, '')); } catch (e) { return; }
                if (re.test(rootTxt[root])) return;
                const h = parts.filter(p => re.test(p[1])).map(p => p[0]); if (h.length) out.push({ line: l.loc.start.line, root, holders: h, what: '/' + l.regex.pattern.slice(0, 90) + '/' });
            } else if (l.value.length >= minLen) {
                if (rootTxt[root].indexOf(l.value) >= 0) return;
                const h = parts.filter(p => p[1].indexOf(l.value) >= 0).map(p => p[0]); if (h.length) out.push({ line: l.loc.start.line, root, holders: h, what: JSON.stringify(l.value.slice(0, 90)) });
            }
        });
        return out;
    }
    const tryOwn7c = () => {
        const only = (partsTxt7b['sheets.js'].filter(x => x[0] === 'sheetlink.js')[0] || [null, ''])[1].split('\n').filter(l => /^function [A-Za-z]+\(/.test(l) && rootTxt7b['sheets.js'].indexOf(l) < 0)[0] || '';
        const q = JSON.stringify(only), rx = '/' + only.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '/';
        const txt = ["const shT = rootRead('system/app/scripts/sheets.js'), alias = shT, pt = kit.part('sheetlink.js');", 'const count = (s, x) => s.split(x).length - 1, fnOf = h => shT.indexOf(h);',
            'check(1, count(shT, ' + q + ') === 1);', 'check(2, (alias.match(' + rx + 'g) || []).length === 1);', 'check(3, ' + rx + '.test(shT));', 'check(4, fnOf(' + q + ') >= 0);', 'check(5, shT.indexOf(' + q + ') < 0);',
            'check(6, pt.includes(' + q + ') && count(pt, ' + q + ') === 1 && shT.slice(shT.indexOf(' + q + '), 9));'].join('\n');
        const got = pins7c(L.acorn(), txt, roots, rootTxt7b, partsTxt7b, 6);
        return !!only && got.length === 5 && j7c(got.map(o => o.line)) === j7c([3, 4, 5, 6, 7]) && got.every(o => o.root === 'sheets.js' && o.holders.join() === 'sheetlink.js');
    };
    const tryOwn7cSlices = () => {
        // the src netSlices hands back, plain and renamed, beside a read of a part of another name; and the part read by its own name
        const nt = (partsTxt7b['net.js'].filter(x => x[0] === 'nettrade.js')[0] || [null, ''])[1].split('\n').filter(l => /^function [A-Za-z]+\(/.test(l) && rootTxt7b['net.js'].indexOf(l) < 0)[0] || '', nq = JSON.stringify(nt);
        const txt2 = ["const { src, between } = kit.netSlices('x'), { src: nS } = require('./checkkit').netSlices('y');",
            'check(1, src.includes(' + nq + ") && kit.part('netlink.js').includes('function x('));", 'check(2, nS.indexOf(' + nq + ') >= 0);', "check(3, kit.part('nettrade.js').includes(" + nq + '));'].join('\n');
        const got2 = pins7c(L.acorn(), txt2, roots, rootTxt7b, partsTxt7b, 6);
        return !!nt && got2.length === 2 && j7c(got2.map(o => o.line)) === j7c([2, 3]) && got2.every(o => o.root === 'net.js' && o.holders.join() === 'nettrade.js');
    };
    const j7c = JSON.stringify;
    check('7c. the rule tried on a text of its own: a line only sheetlink.js holds, pinned on the joined sheets.js through a count of the tool\'s own, a match on a name set to the read, a regex\'s test, a function whose body reads it and an indexOf compared with -1, is named five times; on the part read by name, and as a slice\'s anchor, it is not', tryOwn7c());
    check('7c. the rule tried on a text of its own: a line only nettrade.js holds, pinned on the src netSlices hands back (plain and renamed, a read of netlink.js beside it), is named twice; on nettrade.js read by name it is not', tryOwn7cSlices());
    // tried on a text of its own: a function whose body only names a property `sheet` reads no `sheet` set to sheets.js, and one whose
    // body reads it does (area 7, 2026-11-19)
    const tryKeys7c = () => {
        const only = (partsTxt7b['sheets.js'].filter(x => x[0] === 'sheetlink.js')[0] || [null, ''])[1].split('\n').filter(l => /^function [A-Za-z]+\(/.test(l) && rootTxt7b['sheets.js'].indexOf(l) < 0)[0] || '';
        const q = JSON.stringify(only), txt = ["const sheet = rootRead('system/app/scripts/sheets.js');", 'const mkA = r => ({ sheet: { sections: [r] }, o: r.sheet });', 'const mkB = r => sheet.indexOf(r) >= 0;',
            'check(1, mkA(' + q + '));', 'check(2, mkB(' + q + '));'].join('\n');
        const got = pins7c(L.acorn(), txt, roots, rootTxt7b, partsTxt7b, 6);
        return !!only && got.length === 1 && got[0].line === 5;
    };
    check('7c. the rule tried on a text of its own: a property\'s key or a member\'s name in a function\'s body is no read of a name a tool set to a root\'s text, and a read of it is', tryKeys7c());
    const bad7c = []; let tools7c = 0;
    fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !own7.has(f)).forEach(f => { tools7c++; pins7c(L.acorn(), fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n'), roots, rootTxt7b, partsTxt7b, 6).forEach(o => bad7c.push(f + ':' + o.line + ' pins the joined ' + o.root + ' on text only ' + o.holders.join(' and ') + ' holds: ' + o.what)); });
    check('7c. no tool pins a root\'s joined text, through a name, a helper of its own or a function that reads it, on text only one of its parts holds (' + tools7c + ' tools read by the parser)', tools7c > 50 && bad7c.length === 0, bad7c.slice(0, 20));

    // ---- --against <commit>: the joined text equals the old file ----
    if (argAgainst) {
        roots.concat(files.filter(f => !srcjoin.isRoot(f) && !srcjoin.isPart(f) && /^(systemcore|net|sheets|whiteboard)\.js$/.test(f))).forEach(r => {
            const old = git(['show', argAgainst + ':system/app/scripts/' + r], 'buffer');
            if (!old) { check(r + ': read at ' + argAgainst, false); return; }
            // the commit's own joined text, its parts read at the same commit
            let oldTxt = old.toString('latin1');
            if (/^\/\/ \[split:[a-z0-9]+\.js\]\r?$/m.test(oldTxt)) {
                const eol = oldTxt.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
                oldTxt = oldTxt.split('\n').map(l => {
                    const t = bare(l), m = srcjoin.MARK.exec(t);
                    if (m) { const pt = (git(['show', argAgainst + ':system/app/scripts/' + m[1]], 'buffer') || Buffer.alloc(0)).toString('latin1'); const a = pt.indexOf('\n', pt.indexOf(srcjoin.BODY_START)) + 1, b = pt.lastIndexOf('\n', pt.indexOf(srcjoin.BODY_END)) + 1; let body = pt.slice(a, b); body = body.replace(/\r\n/g, '\n'); if (eol === '\r\n') body = body.replace(/\n/g, '\r\n'); return body.slice(0, -1); }   // the line's own LF comes back from the join; a CR, where the root has one, stays
                    return t.indexOf('// [split:glue]') >= 0 ? null : l;
                }).filter(l => l !== null).join('\n');
            }
            const now = srcjoin.isRoot(r) ? srcjoin.joinRoot(r).text : srcjoin.raw(r, 'latin1');
            const keptBytes = attrLine(r) || gitBinary(r);
            if (keptBytes) check(r + ': its joined text is the one at ' + argAgainst + ', byte for byte (git keeps it so)', now === oldTxt, 'joined ' + now.length + ' bytes, old ' + oldTxt.length);
            else {
                const eolNow = now.indexOf('\r\n') >= 0, mixed = eolNow ? /[^\r]\n/.test(now) : false;
                check(r + ': its joined text is the one at ' + argAgainst + ' (CRLF read as LF), with one line ending throughout', now.replace(/\r\n/g, '\n') === oldTxt.replace(/\r\n/g, '\n') && !mixed, 'joined ' + now.length + ', old ' + oldTxt.length + (mixed ? ', mixed line endings' : ''));
            }
        });
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
