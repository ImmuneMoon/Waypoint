/* srcjoin.js: how the test suites read a giant script that has been split into parts (docs/REFACTOR_SPLIT_PLAN.md, 2026-11-18).

   Why it exists. The app's four giant files (net.js, systemcore.js, sheets.js, whiteboard.js) are split into smaller files by area,
   one area at a time, with no change in behavior. The suites cut code out of those files by text: by marker pairs such as
   `// [netcheck:attempt-start]` and `// [netcheck:attempt-end]`, by raw ranges between two anchors, and by counts over the whole
   file. Editing the hundreds of read sites by hand would surely miss one, and a missed raw range passes silently. So every suite
   calls install() as its first statement, and from then on a read of a split file (a "root") answers the JOINED text: the root
   with each part's body put back where its marker line stands and every glue line dropped. At the commit that makes a split the
   joined text equals the old file byte for byte (tools/splitcheck.js --against proves it), so every slice, range, count and line
   number a suite sees is exactly what it saw before.

   The shape of a split, which tools/splitcheck.js holds:
   - A root keeps one line `// [split:netattack.js]` where each moved region stood. A line of either file that exists only to wire
     the two together ends in `// [split:glue]` (an import, an export, the install function's first and last lines, its return).
   - A part names its root in a header line `// [split:of net.js]` and keeps the moved lines, unchanged, between
     `// [split:body-start]` and `// [split:body-end]`.
   A read of a part answers one neutral comment line and nothing else, so a sweep over every file of the folder reads each byte of
   the old file exactly once and no glue line's names trip a sweep that forbids them outside the root.

   What it offers:
   - install(): wraps fs.readFileSync once. It must be the innermost wrap: it refuses to go over another wrap (the private bridge's
     overlay calls install() before it wraps the function itself).
   - joined(path, enc), raw(path, enc): the joined text, and the real bytes (for a scan that must see the shipped glue too).
   - partsOf(rootName), rootOf(partName), isRoot(name), isPart(name).
   - freshUrl(name, tag): a file URL to a private copy of a root and its parts, for a suite that wants a fresh instance of the module
     (a `?query` import would make the root's parts bind to the plain instance of the root). The copy's other imports point at the
     real folder, as a queried import's did.
   - bundle(rootName): one script text that runs the REAL split wiring, each part in a scope that sees only what it imports (used by
     tools/splitcheck.js, which runs fuzzcheck with WP_SPLIT_BUNDLE=1 so that fuzzcheck's whole world exercises the real wiring).
   - On the command line: `node tools/srcjoin.js where net.js 12500` says which real file and line hold joined line 12500, and
     `node tools/srcjoin.js where netattack.js 40` says which joined line holds that part's line 40. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), url = require('url');

const SCRIPTS = path.resolve(__dirname, '..', 'system', 'app', 'scripts');
const REAL = fs.readFileSync;   // the function as Node gives it (checked in install: nobody may have wrapped it before)
const MARK = /^\/\/ \[split:([a-z0-9]+\.js)\][ \t]*$/;   // a root's line where a part's body stands
const GLUE = '// [split:glue]';
const OF = /^\/\/ \[split:of ([a-z0-9]+\.js)\][ \t]*$/;   // a part's header line naming its root
const BODY_START = '// [split:body-start]', BODY_END = '// [split:body-end]';

const key = p => path.resolve(String(p)).toLowerCase();
const scriptsKey = key(SCRIPTS) + path.sep;
const cache = new Map();   // file name -> { sig, kind: 'plain' | 'root' | 'part', ... }

// The real bytes of a file of the scripts folder, by its name.
function rawBytes(name) { return REAL.call(fs, path.join(SCRIPTS, name)); }
function sigOf(name) { try { const s = fs.statSync(path.join(SCRIPTS, name)); return s.mtimeMs + ':' + s.size; } catch (e) { return 'none'; } }
const lineText = l => (l.endsWith('\r') ? l.slice(0, -1) : l);

// What a file of the folder is: a plain file, a root (and its parts, in the order its markers stand), or a part (and its root).
function info(name) {
    const sig = sigOf(name), had = cache.get(name);
    if (had && had.sig === sig) return had;
    let rec = { sig: sig, kind: 'plain' };
    let txt = null;
    try { txt = rawBytes(name).toString('latin1'); } catch (e) { txt = null; }
    if (txt !== null && txt.indexOf('// [split:') >= 0) {
        const lines = txt.split('\n'), parts = [];
        let of = null;
        lines.forEach(l => { const t = lineText(l); const m = MARK.exec(t); if (m) parts.push(m[1]); const o = OF.exec(t); if (o && !of) of = o[1]; });
        if (of) rec = { sig: sig, kind: 'part', root: of };
        else if (parts.length) rec = { sig: sig, kind: 'root', parts: parts };
    }
    cache.set(name, rec);
    return rec;
}

// A part's body: the exact text between its body-start line and its body-end line (both lines left out).
function bodyOf(partTxt, partName) {
    const a = partTxt.indexOf(BODY_START), b = partTxt.indexOf(BODY_END);
    if (a < 0 || b < 0 || b < a) throw new Error('srcjoin: ' + partName + ' has no body-start / body-end pair');
    const from = partTxt.indexOf('\n', a) + 1, to = partTxt.lastIndexOf('\n', b) + 1;
    return partTxt.slice(from, to);
}
const eolOf = t => (t.indexOf('\r\n') >= 0 ? '\r\n' : '\n');
function toEol(t, eol) { const n = t.replace(/\r\n/g, '\n'); return eol === '\n' ? n : n.replace(/\n/g, '\r\n'); }

// The joined text of a root, as a latin1 string (every byte kept), with a map of its lines: [joinedLine, file, fileLine] runs.
const joinCache = new Map();
function joinRoot(name) {
    const inf = info(name);
    const sig = inf.sig + '|' + (inf.parts || []).map(p => p + '=' + sigOf(p)).join(',');
    const had = joinCache.get(name);
    if (had && had.sig === sig) return had;
    const txt = rawBytes(name).toString('latin1'), eol = eolOf(txt);
    const lines = txt.split('\n'), out = [], map = [];
    let jl = 1;   // the joined text's next line number
    lines.forEach((l, i) => {
        const last = i === lines.length - 1, t = lineText(l), m = MARK.exec(t);
        if (m) {
            const ptxt = rawBytes(m[1]).toString('latin1');
            let body = bodyOf(ptxt, m[1]);
            if (eolOf(body) !== eol) body = toEol(body, eol);
            const startLine = ptxt.slice(0, ptxt.indexOf(BODY_START)).split('\n').length + 1;   // the part's line of the body's first line
            const n = body.split('\n').length - 1;
            map.push({ j: jl, file: m[1], line: startLine, n: n });
            jl += n;
            out.push(body);
            return;
        }
        if (t.indexOf(GLUE) >= 0) return;
        map.push({ j: jl, file: name, line: i + 1, n: 1 });
        jl += 1;
        out.push(last ? l : l + '\n');
    });
    const rec = { sig: sig, text: out.join(''), map: map };
    joinCache.set(name, rec);
    return rec;
}

const neutral = root => '// [split:part of ' + root + ']\n';

// Encode a latin1 string (the bytes) the way readFileSync would answer for the options asked.
function answer(latin1, opts) {
    const buf = Buffer.from(latin1, 'latin1');
    const enc = typeof opts === 'string' ? opts : (opts && typeof opts === 'object' ? opts.encoding : null);
    return enc ? buf.toString(enc) : buf;
}

// The name of a scripts-folder file a path names, or null. The folder is found ignoring case (Windows paths come in any case), but
// the name handed back keeps the case the path wrote: on a disk whose names have case (Linux, as on CI) the file is opened by that
// very name, and a lowered one would not be found.
function scriptName(p) {
    if (p instanceof URL) { try { p = url.fileURLToPath(p); } catch (e) { return null; } }
    if (typeof p !== 'string') return null;
    const full = path.resolve(String(p)), k = full.toLowerCase();
    if (k.indexOf(scriptsKey) !== 0) return null;
    const rest = full.slice(scriptsKey.length);
    return /^[A-Za-z0-9._-]+\.js$/.test(rest) ? rest : null;
}

function joined(p, opts) {
    const name = scriptName(p) || (typeof p === 'string' && !/[\\/]/.test(p) ? p : null);
    if (!name) return REAL.apply(fs, arguments);
    const inf = info(name);
    if (inf.kind === 'root') return answer(process.env.WP_SPLIT_BUNDLE === '1' ? bundle(name) : joinRoot(name).text, opts);
    if (inf.kind === 'part') return answer(neutral(inf.root), opts);
    return REAL.call(fs, path.join(SCRIPTS, name), opts);
}
function raw(p, opts) {
    const name = scriptName(p) || (typeof p === 'string' && !/[\\/]/.test(p) ? p : null);
    return name ? REAL.call(fs, path.join(SCRIPTS, name), opts) : REAL.call(fs, p, opts);
}

function install() {
    const cur = fs.readFileSync;
    if (cur && cur.__srcjoin) return;
    if (cur !== REAL || cur.__sbOverlay) throw new Error('srcjoin.install() must run before anything else wraps fs.readFileSync');
    const wrapped = function readFileSync(p, opts) {
        if (scriptName(p)) return joined(p, opts);
        return REAL.apply(fs, arguments);
    };
    wrapped.__srcjoin = true;
    fs.readFileSync = wrapped;
}

function names() { try { return fs.readdirSync(SCRIPTS).filter(f => f.endsWith('.js')); } catch (e) { return []; } }
function partsOf(root) { const i = info(root); return i.kind === 'root' ? i.parts.slice() : []; }
function rootOf(part) { const i = info(part); return i.kind === 'part' ? i.root : null; }
const isRoot = n => info(n).kind === 'root', isPart = n => info(n).kind === 'part';
function roots() { return names().filter(isRoot); }

// A private copy of a root and its parts, for a fresh instance of the module. The root's imports of other modules point at the real
// folder (so they are the plain shared instances, as a queried import's were); its parts' imports of the root stay relative, so the
// copied parts bind to the copied root.
const freshDirs = [];
function freshUrl(name, tag) {
    const dir = path.join(os.tmpdir(), 'wp-srcjoin-' + process.pid, String(tag || 'x').replace(/[^A-Za-z0-9_-]/g, '_'));
    if (!freshDirs.length) process.on('exit', () => { try { fs.rmSync(path.join(os.tmpdir(), 'wp-srcjoin-' + process.pid), { recursive: true, force: true }); } catch (e) {} });
    freshDirs.push(dir);
    fs.mkdirSync(dir, { recursive: true });
    const own = [name].concat(partsOf(name)), realDir = url.pathToFileURL(SCRIPTS).href + '/';
    own.forEach(f => {
        let t = rawBytes(f).toString('latin1');
        t = t.replace(/(\bfrom\s+|\bimport\s*\(\s*|^import\s+)(['"])\.\/([a-z0-9_.-]+\.js)\2/gm, (all, lead, q, mod) => (own.indexOf(mod) >= 0 ? all : lead + q + realDir + mod + q));
        fs.writeFileSync(path.join(dir, f), Buffer.from(t, 'latin1'));
    });
    return url.pathToFileURL(path.join(dir, name)).href;
}

// One script text that runs the real split wiring (for a loader that runs the root's text as one function, as fuzzcheck does):
// the root's real text, its part import line replaced by a factory that builds the part in a scope of its own, where a free name
// resolves only through the names the part imports (a getter for each, so the bindings stay live) and then through the globals.
// A name the part uses but does not import is then a ReferenceError there, as it would be in the browser. The root's glue export
// lines are dropped (a function body can hold no export); everything else of the root is as it is.
// One thing the bundle does NOT give: strict mode. A scope made with `with` cannot be strict, so each part runs here in sloppy mode,
// while the browser runs every part as a strict module. A failure that only strict mode raises (an assignment to a name declared
// nowhere, a write to an import binding, which is a getter here and fails in silence) is not caught by the behavior pass. The static
// rules of splitcheck 2 cover the writes across a cut, and fuzzcheck's own run of the joined text was sloppy too, so little rests on it.
function bundle(name) {
    const txt = rawBytes(name).toString('latin1');
    const lines = txt.split('\n');
    const out = lines.map(l => {
        const t = lineText(l), cr = l.endsWith('\r') ? '\r' : '';
        if (t.indexOf(GLUE) < 0) return l;
        const im = /^import \{([^}]*)\} from '\.\/([a-z0-9]+\.js)';/.exec(t);
        if (im && info(im[2]).kind === 'part') {
            const part = im[2], ptxt = rawBytes(part).toString('latin1');
            const pim = /^import \{([^}]*)\} from '\.\/[a-z0-9]+\.js';[^\n]*\/\/ \[split:glue\]/m.exec(ptxt);
            const wanted = pim ? pim[1].split(',').map(s => s.trim()).filter(Boolean) : [];
            const getters = wanted.map(w => 'get ' + w + '() { return ' + w + '; }').join(', ');
            // The part's text as a function body: its import line dropped, its `export function` made the value it returns.
            const ptLines = ptxt.split('\n').map(pl => {
                const pt = lineText(pl);
                if (pt.indexOf(GLUE) >= 0 && /^import /.test(pt)) return '';
                if (pt.indexOf(GLUE) >= 0 && /^export function /.test(pt)) return pt.replace(/^export function /, 'return function ');
                return pl;
            });
            const src = 'with (__imp) {\n' + ptLines.join('\n') + '\n}';
            return 'var ' + im[1].trim() + ' = Function("__imp", ' + JSON.stringify(src) + ')({ ' + getters + ' });' + cr;
        }
        if (/^export \{/.test(t)) return '' + cr;
        return l;
    });
    return out.join('\n');
}

// Which real file and line hold a joined line (where(root, n)), or which joined line holds a part's line (where(part, n)).
function where(file, n) {
    const inf = info(file);
    if (inf.kind === 'root') {
        const j = joinRoot(file);
        for (const r of j.map) if (n >= r.j && n < r.j + r.n) return { file: r.file, line: r.line + (n - r.j) };
        return null;
    }
    if (inf.kind === 'part') {
        const j = joinRoot(inf.root);
        for (const r of j.map) if (r.file === file && n >= r.line && n < r.line + r.n) return { file: inf.root, line: r.j + (n - r.line), joined: true };
        return null;
    }
    return { file: file, line: n };
}

module.exports = { install, joined, raw, partsOf, rootOf, isRoot, isPart, roots, freshUrl, bundle, where, SCRIPTS, BODY_START, BODY_END, GLUE, MARK, OF, joinRoot };

if (require.main === module) {
    const a = process.argv.slice(2);
    if (a[0] === 'where' && a[1] && a[2]) { const r = where(a[1], +a[2]); console.log(r ? (r.joined ? 'joined ' : '') + r.file + ':' + r.line : 'no such line'); }
    else if (a[0] === 'roots') roots().forEach(r => console.log(r + ': ' + partsOf(r).join(', ')));
    else console.log('Usage: node tools/srcjoin.js where <file.js> <line>   |   node tools/srcjoin.js roots');
}
