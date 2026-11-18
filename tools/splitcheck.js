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
      no module in an import cycle with the root reaches a name bound from a part in its top-level code (splitlib.cycleRisks).
   3. Every suite reads the giants through tools/srcjoin.js, installed as its first statement; the private bridge's three entry files
      install it too where that folder is there; no suite imports a split root with a query (a fresh instance comes from
      srcjoin.freshUrl). The scans of what ships (updatercheck's list of names, sinkcheck's scans) read the real bytes through
      srcjoin.raw. A name a root exports through a glue line is imported by no script but its own parts.
   4. systemcore.js, when it is split: the real module graph and the joined text, each imported, give the same API object (the same
      keys in the same order, the same kind of value for each, the same name and length for each function and the same JSON for each
      other value), and the same exports but for the names the root re-exports to its parts.
   5. net.js, when it is split: fuzzcheck runs twice, once on the joined text and once on a bundle of the real wiring, in which each
      part sees only the names it imports (srcjoin.bundle); both give the same lines, each as many times, and the same exit code. That
      is the behavior pass: a part function that misses an import throws only when its path runs, and fuzzcheck's world runs the paths.
      It is the whole of fuzzcheck, its seeded mutations included, twice at once (some 40 seconds). It runs each part in sloppy mode
      (a scope made with `with` cannot be strict), while the browser runs it as a strict module; what only strict mode would refuse is
      judged statically in 2.
   6. Under the wrap a part reads as one neutral line, and each marker of a suite in a part's body stands in the joined root as often
      as in the part.
   7. A part's area's tests read it by name: in tools/*.js (but srcjoin, splitlib, splitcheck, checkkit and suitecount), a line that
      holds the literal of a marker only a part holds also names that part's file, so the slice is cut from the part itself
      (tools/checkkit.js netSlices with the file, or srcjoin.raw) and never from the joined root alone (docs/REFACTOR_SPLIT_PLAN.md,
      "Tests move with their area"). So does a line that names such a marker as a quoted string (a suite may build the marker at run
      time from 'netcheck:swpay'), and a line where a slice's anchor (a quoted string in a call of fnSrc, cut, indexOf, range,
      between, tryBetween or lineOf) holds a definition that only a part holds: a function, a net. function or a var declared at the
      left margin of the part's body and nowhere in its root's own text (the review of area 1's tests, 2026-11-18).
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
    const firstStmt = s => { let i = 0; const n = s.length; for (;;) { while (i < n && /\s/.test(s[i])) i++; if (s.startsWith('#!', i) || s.startsWith('//', i)) { i = s.indexOf('\n', i); if (i < 0) i = n; continue; } if (s.startsWith('/*', i)) { i = s.indexOf('*/', i) + 2; continue; } break; } let t = s.slice(i); const m = /^(['"])use strict\1;[^\n]*\n\s*/.exec(t); if (m) t = t.slice(m[0].length); return t; };
    const noInstall = tools.filter(f => firstStmt(fs.readFileSync(path.join(__dirname, f), 'utf8')).indexOf("require('./srcjoin').install();") !== 0);
    check('every suite but parsecheck and splitcheck installs srcjoin as its first statement (' + tools.length + ' suites)', tools.length >= 80 && noInstall.length === 0, noInstall);
    const allRoots = new Set(roots.concat(['systemcore.js', 'net.js', 'sheets.js', 'whiteboard.js']));
    const queried = [];
    fs.readdirSync(__dirname).filter(f => /\.(js|mjs|cjs)$/.test(f) && f !== 'splitcheck.js').forEach(f => {
        const s = fs.readFileSync(path.join(__dirname, f), 'utf8');
        allRoots.forEach(r => { const e = r.replace('.', '\\.'); if (new RegExp(e + "(\\?|['\"`]\\)\\s*\\+\\s*['\"`]\\?)").test(s)) queried.push(f + ': ' + r); });
    });
    check('no suite imports a split root (or a giant that may be split) with a query: a fresh instance comes from srcjoin.freshUrl', queried.length === 0, queried);
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
    const anchorCall7 = /\b(?:fnSrc|cut|indexOf|range|between|tryBetween|lineOf)\(/;
    const quoted7 = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"/g;
    const unnamed7 = [];
    fs.readdirSync(__dirname).filter(f => /\.js$/.test(f) && !own7.has(f)).forEach(f => {
        fs.readFileSync(path.join(__dirname, f), 'utf8').split('\n').forEach((line, i) => {
            byPart7.forEach(([n, p]) => {
                const tag = line.indexOf('[' + n + '-start]') >= 0 || line.indexOf('[' + n + '-end]') >= 0, said = line.indexOf("'" + n + "'") >= 0 || line.indexOf('"' + n + '"') >= 0;
                if ((tag || said) && line.indexOf(p) < 0) unnamed7.push(f + ':' + (i + 1) + ' reads [' + n + ']' + (tag ? '' : ' (a quoted marker)') + ' without naming ' + p);
            });
            if (!anchorCall7.test(line)) return;
            // the line's quoted strings, as written (an escaped quote stays inside its string); a definition is matched on its own text
            const lits = []; let m; quoted7.lastIndex = 0;
            while ((m = quoted7.exec(line))) lits.push(m[1] !== undefined ? m[1] : m[2]);
            defs7.forEach(([d, p]) => { if (lits.some(s => s.indexOf(d) >= 0) && line.indexOf(p) < 0) unnamed7.push(f + ':' + (i + 1) + ' cuts at "' + d + '", which only ' + p + ' holds, without naming it'); });
        });
    });
    check('7. a line of a tool that holds the literal of a marker only a part holds (' + byPart7.length + ' such markers), names one as a quoted string, or cuts a slice at a definition only a part holds (' + defs7.length + ' such definitions), names that part\'s file, so the area\'s tests read it by name', byPart7.length > 0 && defs7.length > 0 && unnamed7.length === 0, unnamed7.slice(0, 20));

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
