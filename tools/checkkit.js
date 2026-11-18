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
     ('system' for systemcheck's form, 'net' for netcheck's). pending is a list a suite pushes its asynchronous checks onto, and
     finish() waits for them, prints the summary and exits 1 on any failure. A suite that never reaches finish() (a promise nothing
     answers) is caught by the exit guard both giants have: it prints a failure and exits 1.
   - joined(name): a script's text as srcjoin answers it (a split root's joined text), with CRLF read as LF.
   - part(name): a part's own text, read by its name (srcjoin.raw), with CRLF read as LF. It throws for a file that is not a part, so
     a test that says it reads a part really does. cut(name, a, b): that text from a up to the first b after it, as a suite's own
     slicer of the joined sheets.js cut it before the lines moved into the part.
   - netSlices(who): the slice helpers netcheck has at its top, over the joined net.js, each also able to read a part by name:
     between(a, b, label, file), tryBetween(a, b, file), fnSrc(start, end, label, file), range(file, a, b) (the text from a up to b,
     both in the part) and lineOf(k). A call that names a part's file reads that part; one that names none reads the joined net.js.
   - packCheck(v): PeerJS's BinaryPack refusals, which netcheck runs on every send of a harness (moved here from netcheck).
   - url(name): a file URL of a script, for import(). fresh(root, tag): the file URLs of a private copy of a split root and its
     parts, by name, so that an import runs the real split wiring (a part as a module of its own). APP and SCRIPTS: the app's folders. */
'use strict';
const srcjoin = require('./srcjoin');
srcjoin.install();
const fs = require('fs'), path = require('path');

const APP = path.join(__dirname, '..', 'system', 'app');
const SCRIPTS = path.join(APP, 'scripts');
const lf = t => String(t).replace(/\r\n/g, '\n');

// One suite's counts and its check function. The two forms differ only in spacing and in how a failure's detail is written.
function suite(style) {
    let pass = 0, fail = 0, summed = false;
    const pending = [];
    process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
    const check = style === 'net'
        ? (name, ok, detail) => { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }
        : (name, ok, detail) => { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } };
    // Waits for every pending check, then prints the summary line both giants print and exits 1 on a failure.
    async function finish() {
        await Promise.all(pending);
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
    const lineOf = (k, file) => { const t = textOf(file), i = t.indexOf(k); return i < 0 ? '' : t.slice(i, t.indexOf('\n', i)); };
    return { src, between, tryBetween, fnSrc, range, lineOf };
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

// The file URLs of a private copy of a split root and its parts (srcjoin.freshUrl), by name. An import of the real folder's root
// runs the joined text srcjoin answers (the parts' lines put back in place), and an import of a real part answers its one neutral
// line; an import from the copy runs the real split wiring instead, as the browser does: the part is a module of its own, read by
// its own name, and the root installs it. So a suite that tests an area imports that area's part from here, and through it the
// root. The copy's imports of other modules point at the real folder.
function fresh(root, tag) {
    const u = srcjoin.freshUrl(root, tag);
    return name => u.slice(0, u.lastIndexOf('/') + 1) + name;
}

module.exports = { suite, joined, part, cut, netSlices, packCheck, url, fresh, APP, SCRIPTS, lf };
