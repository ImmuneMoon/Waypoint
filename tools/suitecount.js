/* suitecount.js: counts what every test suite checks, so that a fold which moves tests from one suite to another can show that no
   check was lost (docs/REFACTOR_SPLIT_PLAN.md, "Tests move with their area", 2026-11-18). It is a tool, not a suite: its name does
   not end in check.js, so no CI step runs it and the loop over tools/*check.js passes it by.

   What it does. It runs every tools/*check.js with plain Node (a few at a time), and keeps, for each suite, the sorted list of its
   result lines (a line that begins with "ok" or "FAIL" and then a space), its last summary line and its exit code. A result line is
   kept with its run of spaces after the word squeezed to one, so that two suites that print the same check with a different number
   of spaces after "ok" count as the same line, and with a time a suite measured written as "# ms", since a timing differs from one
   run to the next. Only a measured time is so written: one in parentheses at the end of the line ("(12 ms)"), a ceiling ceilingcheck
   works out from how fast the machine runs ("stays under 340 ms", on its "at the ceilings:" lines), a time a check says it took on
   this machine, anywhere in its words ("takes 134 ms here", "139 ms here)", fogcheck's "built in 412 ms and"; found by the review of
   area 2, 2026-11-18, where two such lines of timerulecheck read as lost), and any time in a failure's detail after its "->". A figure in milliseconds that is part of a check's own words ("within 700 ms of the last") is kept as it
   is, so a check whose figure changed is a check that left (the review of area 1's tests, 2026-11-18). A count written before that
   review (it holds no "__norm" key) read every figure in milliseconds as "# ms", and is compared with this run read the same way.

   Usage:
     node tools/suitecount.js --write <file.json>       runs every suite and writes what each one checked
     node tools/suitecount.js --compare <before.json>   runs every suite and compares with a file written before: it fails (exit 1)
                                                        unless every result line of before is still printed by some suite (each as
                                                        many times as before), the total of "ok" lines is at least what it was, and
                                                        no suite fails that passed before (each such suite with the checks that
                                                        failed, by name, up to 20). It prints the lines that left a suite and
                                                        the suite that prints them now: that list is what a commit says it moved.
     --only a,b,c   runs only the suites named (their file names without .js), for a quick look; a compare then reads only those.
     --jobs N       how many suites run at once (4 unless named). */
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');

const TOOLS = __dirname;
const args = process.argv.slice(2);
const opt = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const only = opt('--only') ? opt('--only').split(',').map(s => s.trim()).filter(Boolean) : null;
const jobs = Math.max(1, Number(opt('--jobs')) || 4);

// The suites, by file name, in name order.
function suites() {
    return fs.readdirSync(TOOLS).filter(f => /check\.js$/.test(f)).map(f => f.slice(0, -3)).filter(n => !only || only.includes(n)).sort();
}

// A result line as it is compared: one space after its word, no trailing space, a measured time as "# ms" (above: at the end in
// parentheses, ceilingcheck's ceilings, a time taken "here" or "built in", and the detail after "->"), and a count of suites as
// "# suites" (splitcheck names how many suites it read, which a new suite moves). A line already so written reads the same again, so
// a count file written before a rule was added compares as one written after it.
const MS = /\d[\d.,]*\s*ms\b/g;
const norm = l => {
    l = l.replace(/^(ok|FAIL)\s+/, '$1 ').replace(/\s+$/, '').replace(/\(\d+ suites\)/g, '(# suites)');
    const k = l.indexOf(' -> '), head = k < 0 ? l : l.slice(0, k), tail = k < 0 ? '' : l.slice(k).replace(MS, '# ms');
    let h = head.replace(/\(\d[\d.,]*\s*ms\)$/, '(# ms)');
    // a time the check measured on this machine and names in its own words: "134 ms here" and "built in 412 ms"
    h = h.replace(/\d[\d.,]*\s*ms here\b/g, '# ms here').replace(/\bbuilt in \d[\d.,]*\s*ms\b/g, 'built in # ms');
    if (/^(ok|FAIL) at the ceilings: /.test(h)) h = h.replace(/ under \d[\d.,]*\s*ms\b/g, ' under # ms');
    return h + tail;
};
// what a count written before the review read as a time: every figure in milliseconds, wherever it stood
const normWide = l => norm(l).replace(MS, '# ms');

// One suite's run: its result lines (squeezed and sorted), its summary line and its exit code.
function runOne(name) {
    return new Promise(resolve => {
        const t0 = Date.now();
        const child = cp.spawn(process.execPath, [path.join(TOOLS, name + '.js')], { cwd: path.join(TOOLS, '..'), env: process.env });
        let out = '';
        child.stdout.on('data', d => { out += d; });
        child.stderr.on('data', d => { out += d; });
        child.on('close', code => {
            const lines = out.replace(/\r\n/g, '\n').split('\n');
            const res = lines.filter(l => /^(ok|FAIL)\s/.test(l)).map(norm).sort();
            const summary = lines.map(l => l.trim()).filter(Boolean).pop() || '';
            resolve({ name, code, lines: res, ok: res.filter(l => l.startsWith('ok ')).length, failed: res.filter(l => l.startsWith('FAIL ')).length, summary, ms: Date.now() - t0 });
        });
    });
}

async function runAll() {
    const names = suites(), out = {};
    let next = 0;
    const worker = async () => { while (next < names.length) { const n = names[next++]; const r = await runOne(n); out[n] = r; process.stderr.write((r.code ? 'FAIL ' : 'ok   ') + n + ' (' + r.ok + ' ok, ' + r.failed + ' failed, ' + Math.round(r.ms / 1000) + ' s)\n'); if (r.code) r.lines.filter(l => l.startsWith('FAIL ')).slice(0, 5).forEach(l => process.stderr.write('       ' + l.slice(0, 300) + '\n')); } };   // a suite that fails names its first failed checks at once
    await Promise.all(Array.from({ length: jobs }, worker));
    return out;
}

// A multiset of lines as a map from line to count.
function countOf(list) { const m = new Map(); list.forEach(l => m.set(l, (m.get(l) || 0) + 1)); return m; }

(async () => {
    const wr = opt('--write'), cmp = opt('--compare');
    if (!wr && !cmp) { console.log('usage: node tools/suitecount.js --write <file> | --compare <file> [--only a,b] [--jobs N]'); process.exit(2); }
    const now = await runAll();
    if (wr) {
        fs.writeFileSync(wr, JSON.stringify(Object.assign({ __norm: 2 }, now)));
        const tot = Object.values(now).reduce((a, r) => a + r.ok, 0);
        console.log('wrote ' + wr + ': ' + Object.keys(now).length + ' suites, ' + tot + ' ok lines');
        return;
    }
    const before = JSON.parse(fs.readFileSync(cmp, 'utf8')), wide = before.__norm !== 2;
    delete before.__norm;
    // a file an older count wrote is read as this one writes; one written before the review, with every figure in ms read as "# ms"
    const nm = wide ? normWide : norm;
    Object.values(before).forEach(r => { r.lines = r.lines.map(nm).sort(); });
    if (wide) Object.values(now).forEach(r => { r.lines = r.lines.map(normWide).sort(); });
    const names = Object.keys(before).filter(n => !only || only.includes(n));
    let bad = 0;
    // every line of before, as many times as before, somewhere now
    const allNow = countOf([].concat(...Object.values(now).map(r => r.lines)));
    const allBefore = countOf([].concat(...names.map(n => before[n].lines)));
    allBefore.forEach((c, l) => { const h = allNow.get(l) || 0; if (h < c) { bad++; console.log('LOST      ' + l + '  (' + c + ' before, ' + h + ' now)'); } });
    // the lines that left a suite, and where they are now
    const moved = [];
    names.forEach(n => {
        const b = countOf(before[n].lines), a = countOf(now[n] ? now[n].lines : []);
        b.forEach((c, l) => {
            const h = a.get(l) || 0;
            if (h < c) { const to = Object.keys(now).filter(m => m !== n && (now[m].lines || []).includes(l)); moved.push({ from: n, to: to.join(',') || '?', line: l, n: c - h }); }
        });
    });
    // suites
    Object.keys(now).forEach(n => {
        const b = before[n];
        if (now[n].code && (!b || !b.code)) {
            bad++; console.log('FAILS     ' + n + ' (' + now[n].summary + ')');
            // the checks that failed, by name, so that a failure of one run can be told apart from another (the review of area 3)
            now[n].lines.filter(l => l.startsWith('FAIL ')).slice(0, 20).forEach(l => console.log('  ' + l.slice(0, 400)));
        }
        console.log('suite     ' + n + ': ' + (b ? b.ok : '-') + ' -> ' + now[n].ok + ' ok' + (now[n].failed ? ', ' + now[n].failed + ' failed' : ''));
    });
    const totB = names.reduce((a, n) => a + before[n].ok, 0), totA = Object.values(now).reduce((a, r) => a + r.ok, 0);
    console.log('total     ' + totB + ' -> ' + totA + ' ok lines');
    if (totA < totB) { bad++; console.log('FAIL      fewer ok lines than before'); }
    if (moved.length) {
        console.log('\nmoved     ' + moved.length + ' lines:');
        moved.forEach(m => console.log('  ' + m.from + ' -> ' + m.to + (m.n > 1 ? ' (x' + m.n + ')' : '') + ': ' + m.line));
    }
    if (bad) { console.log('\nsuitecount: ' + bad + ' problem(s).'); process.exit(1); }
    console.log('\nsuitecount: every check of before still runs.');
})();
