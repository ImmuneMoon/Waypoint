/* Offline check of saving a file the person names (1.6.4; Fulllion, 2026-11-25: "Yes, wait for the save"). savefile.js run for real in
   Node on stand-ins of the page: a save dialog that saves (the words come only after the file is written), one the person cancels (nothing
   saved, nothing said, nothing downloaded), one that refuses to open (SecurityError: the file goes as a download, as before), a window with
   no dialog at all (exactly the old download), a dialog that answers with no file to write, a write that fails (said in plain words, the
   half-written file put down), a download that fails, and the step log, which never names a file. Then every export that used to hand its
   file over with a hidden <a download> click is read: each opens the save dialog at its press, before the first thing it waits for, and
   says it was saved only after the save; and no script but savefile.js makes a download link or opens the dialog itself.
   Usage: node tools/savecheck.js   (exit 1 on any failure) */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const { check, pending, finish } = kit.suite('save');
const SCRIPTS = path.join(__dirname, '..', 'system', 'app', 'scripts');
const lf = (s) => s.replace(/\r\n/g, '\n');
// a part of a split script (sysedtabs.js is a part of sheets.js) is read by its own name; any other script as it is
const read = (f) => require('./srcjoin').isPart(f) ? kit.part(f) : lf(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
const j = JSON.stringify;

/* ---- the stand-in page: a document whose links record their clicks, a URL that hands out addresses, fetch that keeps the log lines ---- */
const W = { clicks: [], logs: [], said: [], made: 0, linkThrows: false };
global.window = {};
global.document = {
    body: { appendChild: function() {} },
    createElement: function(tag) {
        if (W.linkThrows) throw new Error('no links here');
        const a = { tag: tag, href: '', download: '', remove: function() {} };
        a.click = function() { W.clicks.push({ name: a.download, href: a.href }); };
        return a;
    }
};
const realMake = URL.createObjectURL, realLetGo = URL.revokeObjectURL;   // the class itself stays (srcjoin.js reads it): only its two methods are the suite's
URL.createObjectURL = function() { return 'blob:u' + (++W.made); }; URL.revokeObjectURL = function() {};
global.fetch = function(u, o) { if (u === '/api/log') W.logs.push(String(o && o.body)); return Promise.resolve({ ok: true }); };
const realTimeout = global.setTimeout;
global.setTimeout = function(fn) { return 0; };   // a link's address is let go later: nothing to wait for here

// A save dialog of the suite's own: how it answers, and what is written through the file it gives
function dialog(how) {
    const D = { asked: [], writes: [], closed: 0, aborted: 0, order: [], removed: 0, size: 0 };
    window.showSaveFilePicker = function(o) {
        D.asked.push(o); D.order.push('asked');
        if (how === 'throw-now') throw Object.assign(new Error('no press'), { name: 'SecurityError' });
        if (how === 'cancel') return Promise.reject(Object.assign(new Error('canceled'), { name: 'AbortError' }));
        if (how === 'refuse') return Promise.reject(Object.assign(new Error('no press'), { name: 'SecurityError' }));
        if (how === 'odd') return Promise.resolve({ name: 'x' });
        return Promise.resolve({ name: 'Picked name.md', getFile: async function() { if (how === 'unreadable') throw Object.assign(new Error('gone'), { name: 'NotFoundError' }); return { size: D.size || 0 }; },
            remove: how === 'no-remove' ? undefined : async function() { if (how === 'remove-fails') throw Object.assign(new Error('locked'), { name: 'NoModificationAllowedError' }); D.removed++; },
            createWritable: async function() {
            return { write: async function(b) { if (how === 'write-fails') throw new Error('disk full'); D.writes.push(b); D.order.push('write'); },
                close: async function() { D.closed++; D.order.push('close'); }, abort: async function() { D.aborted++; } };
        } });
    };
    return D;
}
function reset() { W.clicks = []; W.logs = []; W.said = []; W.linkThrows = false; delete window.showSaveFilePicker; }

pending.push((async function() {
    const SF = await import(pathToFileURL(path.join(SCRIPTS, 'savefile.js')).href);
    SF.saySet(function(w) { W.said.push(w); });
    const blob = new Blob(['# Notes\n'], { type: 'text/markdown' });

    /* a dialog that saves: opened at the call, before anything is waited for; the words only after the file is written and closed */
    reset(); let D = dialog('save');
    let t = SF.saveStart({ name: 'Hall of Kings.md', type: 'text/markdown', desc: 'Markdown' });
    const openedAtCall = D.asked.length === 1;
    const said = [];
    const how1 = await t.save(blob).then(function(how) { said.push(D.order.slice()); return how; });
    check('a dialog that saves: it opens at the call itself (before any await), suggests the file\'s own name and its kind, and the save answers "saved" only once the file was written and closed; nothing is downloaded and nothing said by the module',
        openedAtCall && D.asked[0].suggestedName === 'Hall of Kings.md' && j(D.asked[0].types) === j([{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }])
        && how1 === 'saved' && j(said[0]) === j(['asked', 'write', 'close']) && D.writes[0] === blob && W.clicks.length === 0 && W.said.length === 0 && t.state === 'picked' && SF.saved(how1) === true, j([how1, said, D.asked]));

    /* the caller's notice comes after the write, never before */
    reset(); D = dialog('save'); const notes = [];
    t = SF.saveStart({ name: 'Gear.wppack.json', type: 'application/json' });
    t.save(new Blob(['{}'])).then(function(how) { if (SF.saved(how)) notes.push(['notice', D.order.slice()]); });
    notes.push(['right after the call', D.order.slice()]);
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    check('a caller that says it saved inside the save\'s answer says it after the write: nothing is said in the turn of the press, and the notice sees the file written and closed',
        notes.length === 2 && notes[0][0] === 'right after the call' && j(notes[0][1]) === j(['asked']) && notes[1][0] === 'notice' && j(notes[1][1]) === j(['asked', 'write', 'close'])
        && j(D.asked[0].types) === j([{ description: 'JSON file', accept: { 'application/json': ['.json'] } }]), j(notes));

    /* canceled: nothing saved, nothing downloaded, nothing said */
    reset(); D = dialog('cancel');
    t = SF.saveStart({ name: 'Notes.md', type: 'text/markdown' });
    const st2 = await t.ready, how2 = await t.save(blob);
    check('the person cancels the dialog: the save answers "cancel", nothing is written, nothing is downloaded and nothing is said, so no notice claims a save',
        st2 === 'cancel' && how2 === 'cancel' && SF.saved(how2) === false && D.writes.length === 0 && W.clicks.length === 0 && W.said.length === 0 && t.state === 'cancel', j([st2, how2, W.clicks, W.said]));

    /* refused (the press ran out): today's download, with the caller's own name */
    for (const how of ['refuse', 'throw-now', 'odd']) {
        reset(); D = dialog(how);
        t = SF.saveStart({ name: 'Notes.md', type: 'text/markdown' });
        const st3 = await t.ready, how3 = await t.save(blob);
        check('a dialog that ' + (how === 'odd' ? 'answers with no file to write' : how === 'throw-now' ? 'throws as it is called' : 'refuses to open (SecurityError: the press had run out)') + ' falls back to the download every export made before, under the file\'s own name, and the save answers "download", which a caller says as it always did',
            st3 === 'fallback' && how3 === 'download' && SF.saved(how3) === true && j(W.clicks) === j([{ name: 'Notes.md', href: W.clicks[0] && W.clicks[0].href }]) && /^blob:/.test(W.clicks[0].href) && W.said.length === 0 && D.writes.length === 0, j([st3, how3, W.clicks]));
    }

    /* no dialog in this window: exactly today's behavior */
    reset();
    t = SF.saveStart({ name: 'Hall.html', type: 'text/html' });
    const st4 = await t.ready, how4 = await t.save(new Blob(['<p>'], { type: 'text/html' }));
    check('a window with no save dialog (Firefox, Safari): the file goes out as the download it always was, at once, with its own name, and "download" lets the caller say what it always said',
        st4 === 'none' && t.state === 'none' && how4 === 'download' && W.clicks.length === 1 && W.clicks[0].name === 'Hall.html' && W.said.length === 0, j([st4, how4, W.clicks]));

    /* a name known only once the file is made: the download takes it */
    reset();
    t = SF.saveStart({ name: 'Journal - guess.html', type: 'text/html' });
    await t.save(new Blob(['x']), 'Journal - Kael - 2026-11-25.html');
    check('where the file\'s own name is known only once it is made, the dialog showed the best guess and a download takes the name as made', W.clicks.length === 1 && W.clicks[0].name === 'Journal - Kael - 2026-11-25.html', j(W.clicks));

    /* a write that fails: put down, said in plain words, never called saved */
    reset(); D = dialog('write-fails');
    t = SF.saveStart({ name: 'Hall of Kings.md', type: 'text/markdown' });
    const how5 = await t.save(blob);
    check('a write that fails answers "failed", puts the half-written file down, and says so in plain words with the file\'s name; no download is made in its place and no notice may say saved',
        how5 === 'failed' && SF.saved(how5) === false && D.aborted === 1 && D.closed === 0 && j(W.said) === j(['Hall of Kings.md could not be saved.']) && W.clicks.length === 0, j([how5, W.said, D]));
    reset(); D = dialog('write-fails');
    await SF.saveStart({ name: 'Me.json', type: 'application/json', fail: 'The profile could not be saved.' }).save(blob);
    const sayOwn = W.said.slice();
    reset(); D = dialog('write-fails');
    await SF.saveStart({ name: 'Map.png', type: 'image/png', fail: false }).save(blob);
    check('a caller may give the failure its own words, or say it itself (fail: false, as Save picture says it in its dialog\'s line)', j(sayOwn) === j(['The profile could not be saved.']) && W.said.length === 0, j([sayOwn, W.said]));

    /* a download that fails */
    reset(); W.linkThrows = true;
    const how6 = await SF.saveStart({ name: 'Notes.md', type: 'text/markdown' }).save(blob);
    const dlNow = (W.linkThrows = true, SF.downloadNow('x.md', blob));
    check('a download the window refuses answers "failed" and says so in plain words; downloadNow answers false', how6 === 'failed' && j(W.said) === j(['Notes.md could not be saved.']) && dlNow === false, j([how6, W.said]));

    /* drop (the review of a92c0d93, finding 2): the dialog made the picked file empty the moment the person confirmed it, so a file that will
       not be made after all takes that empty file away, never one that holds anything, and says so in one line where it cannot */
    reset(); D = dialog('save');
    t = SF.saveStart({ name: 'Template.zip', type: 'application/zip' }); const dr1 = await t.drop();
    check('a file that will not be made after all (the export failed, or the host said no) is dropped: nothing written, nothing downloaded, and the empty file the dialog made is taken away so no empty file looks like a saved one',
        dr1 === 'removed' && D.removed === 1 && D.writes.length === 0 && D.closed === 0 && W.clicks.length === 0 && W.said.length === 0, j([dr1, D.removed, W.said]));
    const dr1b = await t.drop();
    check('a second drop of the same ticket does nothing more', dr1b === 'none' && D.removed === 1, j([dr1b, D.removed]));
    reset(); D = dialog('save'); D.size = 42;
    const dr2 = await SF.saveStart({ name: 'Old.zip', type: 'application/zip' }).drop();
    check('a picked file that holds anything is never taken away by a drop', dr2 === 'kept' && D.removed === 0 && W.said.length === 0, j([dr2, D.removed]));
    reset(); D = dialog('no-remove');
    const dr3 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop();
    reset(); D = dialog('remove-fails');
    const dr4 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop();
    const said4 = W.said.slice(), logs4 = W.logs.slice();
    check('where the window cannot take the empty file away (no remove, or a remove that fails), one plain line says it was left empty, and the step log names no file',
        dr3 === 'empty' && dr4 === 'empty' && j(said4) === j(['Kael.json was left empty. Nothing was written to it.']) && logs4.some(l => /^savefile v1 remove-failed ext=json why=NoModificationAllowedError$/.test(l)) && !logs4.some(l => /Kael/.test(l)), j([dr3, dr4, said4, logs4]));
    reset(); D = dialog('no-remove');
    const dr5 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop({ quiet: true });
    check('a quiet drop says nothing itself (its caller folds the empty file into its own words)', dr5 === 'empty' && W.said.length === 0, j([dr5, W.said]));
    reset(); D = dialog('unreadable');
    const dr6 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop();
    check('a picked file that cannot be read is left alone', dr6 === 'kept' && D.removed === 0 && W.said.length === 0, j([dr6]));
    reset(); D = dialog('save');
    t = SF.saveStart({ name: 'Kael.json', type: 'application/json' }); await t.save(blob); const dr7 = await t.drop();
    reset(); D = dialog('cancel'); const dr8 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop();
    reset(); const dr9 = await SF.saveStart({ name: 'Kael.json', type: 'application/json' }).drop();
    check('a drop after the save wrote to the file, after a cancel, or in a window with no dialog takes nothing away', dr7 === 'none' && dr8 === 'none' && dr9 === 'none' && D.removed === 0, j([dr7, dr8, dr9]));

    /* the kinds the dialog offers, and what it never is handed */
    check('the dialog is offered the file\'s kind from its last extension and type alone, parameters taken off; a type it would not take, or a name with no extension, offers no kind (the dialog then offers any file) rather than a dialog that throws',
        j(SF.typesOf('a.wpchar.json', 'application/json; charset=utf-8', 'Sheet')) === j([{ description: 'Sheet', accept: { 'application/json': ['.json'] } }])
        && SF.typesOf('README', 'text/plain') === null && SF.typesOf('a.md', 'not a type') === null && SF.typesOf('a.md', '') === null
        && j(SF.typesOf('Furnishing pack template.zip', 'application/zip')) === j([{ description: 'ZIP file', accept: { 'application/zip': ['.zip'] } }]));

    /* the step log names no file */
    reset(); dialog('cancel'); await SF.saveStart({ name: 'Secret plans of Kael.md', type: 'text/markdown' }).save(blob);
    const cLog = W.logs.slice(); reset(); dialog('refuse'); await SF.saveStart({ name: 'Secret plans of Kael.md', type: 'text/markdown' }).save(blob);
    const rLog = W.logs.slice(); reset(); dialog('save'); await SF.saveStart({ name: 'Secret plans of Kael.md', type: 'text/markdown' }).save(blob);
    const sLog = W.logs.slice(); reset(); dialog('write-fails'); await SF.saveStart({ name: 'Secret plans of Kael.md', type: 'text/markdown' }).save(blob);
    const fLog = W.logs.slice();
    check('each step that can fail writes one line to the step log as savefile v1 (canceled, picker-refused with why, saved with its size, write-failed), with the file\'s kind and never its name',
        cLog.length === 1 && /^savefile v1 canceled ext=md$/.test(cLog[0]) && rLog.length === 1 && /^savefile v1 picker-refused ext=md why=SecurityError$/.test(rLog[0])
        && sLog.length === 1 && /^savefile v1 saved ext=md kb=\d+$/.test(sLog[0]) && fLog.length === 1 && /^savefile v1 write-failed ext=md$/.test(fLog[0])
        && !cLog.concat(rLog, sLog, fLog).some(l => /Secret|Kael|plans/.test(l)), j([cLog, rLog, sLog, fLog]));
    check('published as window.wpSaveFile for the parts that import their root alone (sysedtabs.js), saveTo a ticket\'s save as a function of its own', typeof window.wpSaveFile.start === 'function' && typeof window.wpSaveFile.saveTo === 'function' && window.wpSaveFile.saved('saved') === true && window.wpSaveFile.saved('cancel') === false && typeof window.wpSaveFile.downloadNow === 'function');

    global.setTimeout = realTimeout; URL.createObjectURL = realMake; URL.revokeObjectURL = realLetGo;
})());

/* ---- every export reads as it should: the dialog opened at its press, before its first wait; its notice only after the save ---- */
// The text of one function or handler: from its first line to the next text given
function body(src, a, b) { const i = src.indexOf(a); if (i < 0) return ''; const k = b ? src.indexOf(b, i + a.length) : -1; return k < 0 ? src.slice(i) : src.slice(i, k); }
// Where the first thing a function waits for stands: an await, a then, or a call that answers later
function firstWait(s, extra) { const all = [/\bawait\b/, /\.then\(/].concat(extra || []); return Math.min.apply(null, all.map(r => { const m = r.exec(s); return m ? m.index : Infinity; })); }
const SITES = [
    ['docimport.js', 'Save Markdown (exportMarkdown)', 'async function exportMarkdown(', '/* ---------- wiring', /saveStart\(/, null, ["toast('Markdown saved.'", "toast('Markdown saved with"]],
    ['docimport.js', 'the handbook template (Help)', "var b5 = ui('helpMdTemplateBtn');", '\n', /saveStart\(/, null, ["toast('Template saved.')"]],
    ['furnpack.js', 'a pack as one file (Export a file)', 'async function exportFile(p) {', '\n', /looksTicket\(/, null, []],
    ['furnpack.js', 'the pack maker\'s file (Export a folder picks its own folder, before this)', '    var ticket = looksTicket(nm);', '\nfunction ', /looksTicket\(/, /await makerLooks\(\)/, []],
    ['furnpack.js', 'a pack\'s one file written', 'function exportLooksFile(name, looks, ticket) {', '\nasync function exportLooksFolder', /looksTicket\(/, null, ["toast('Exported ' + name + ' as one file"]],
    ['furnpack.js', 'the furnishing template', 'async function template() {', '\n// ---- the pack maker', /saveStart\(/, null, ["toast('The template is downloaded"]],
    ['handouts.js', 'the Journal saved as one page', 'async function journalDownload(only) {', '\n// The app\'s own question', /saveStart\(/, null, ["toast('Saved ' + name"]],
    ['io.js', 'Export (exportScope)', '  async function exportScope(scope, share, files) {', '\n  window.wpExportScope', /saveStart\(/, null, ["toast('Exported ' + r.name + '.' + exportLeftWords(r));"]],
    ['librarywin.js', 'a library pack', 'function exportPack(which) {', '\n/* ---- import', /saveStart\(/, null, ["exported: ' + plural("]],
    ['main.js', 'Save HTML', "askK(activeMap, showConfirm, function(players) {", "_el_exportImgBtn", /saveStart\(/, /run\(function|fetch\(/, ["toast(players === true ? 'HTML exported as players read it.' : 'HTML exported.')"]],
    ['main.js', 'Save as Image', "var title = exportTitle();\n\n      var opts", "var _el_", /saveStart\(/, /html2canvas\(/, ["toast('Image exported.')"]],
    ['mapshot.js', 'Save Map as Picture', 'function shotGo() {', '\nfunction shotStops', /saveStart\(/, /Promise\.all\(/, ['toast(shotDoneWords(p, r.lost, r.cut))']],
    ['record.js', 'the Game Record as text', 'function saveText() {', '\nfunction delSession', /saveStart\(/, null, []],
    ['settings.js', 'Save profile to a file', "if (save) save.addEventListener('click', function() {", '\n    if (open && file)', /saveStart\(/, null, ["toast('Profile saved."]],
    ['sheets.js', 'a sheet\'s file (Download)', 'function downloadChar(charId, kind, gmAll) {', '\n// Onboarding F2b', /saveTextStart\(|saveTextFile\(/, /pictureData\(/, ["toast('Saved ' + nm)"]],
    ['sysedtabs.js', 'a system alone', 'function exportAlone(clean) {', '\nfunction importFile', /sysSaveStart\(/, null, ["toast('System exported.')"]],
    ['sysedtabs.js', 'a whole system', "if (ans !== true) return;", "}, { noEnter: true, yes: 'Whole system'", /sysSaveStart\(/, /Z\.buildWhole\(/, ['toast(Z.exportWords(r))']],
];
// One site's check on a text: the dialog opened before the first wait, no download link of its own, its notices after the save
function siteOk(b, s) {
    const m = s[4].exec(b), open = m ? m.index : -1, wait = firstWait(b, s[5] ? [s[5]] : []);
    const save = b.search(/\.save\(|saveExport\(|shotSave\(|sysDownload\(|saveTextFile\(/);
    const notices = s[6].map(n => b.indexOf(n));
    const ok = !!b && open >= 0 && open < wait && notices.every(n => n > save && save >= 0 && n >= 0) && b.indexOf('.download') < 0 && b.indexOf('createObjectURL') < 0;
    return { ok, found: !!b, open, wait, save, notices };
}
SITES.forEach(function(s) {
    const r = siteOk(body(read(s[0]), s[2], s[3]), s);
    check('pinned, ' + s[0] + ': ' + s[1] + ' opens the save dialog at its press, before the first thing it waits for, makes no download link of its own, and says it was saved only after the save', r.ok, j(r));
});
// (the review of a92c0d93, finding 3) exportLooksFile is handed the ticket its callers opened at their press (exportFile and makerExport,
// pinned above), and opens one itself only where none was handed: it must wait for nothing at all, so its fallback dialog is still opened
// at the press. Tried first on broken texts of the suite's own, each of which the pin must refuse
(function() {
    const s = SITES.filter(x => x[2] === 'function exportLooksFile(name, looks, ticket) {')[0];
    const src = read('furnpack.js'), b = body(src, s[2], s[3]);
    const elfOk = function(t, whole) { const inner = t.slice(t.indexOf('\n')); return siteOk(t, s).ok && !/\bawait\b/.test(inner) && !new RegExp('async ' + s[2].replace(/[()]/g, '\\$&')).test(whole) && inner.indexOf('(ticket || looksTicket(name)).save(') >= 0 && inner.indexOf('(ticket || looksTicket(name)).save(') < inner.indexOf('.then('); };
    const broken = [
        b.replace('    (ticket || looksTicket(name))', '    var w = await Promise.resolve(1);\n    (ticket || looksTicket(name))'),
        b.replace('    (ticket || looksTicket(name)).save(new Blob([JSON.stringify(out)], { type: \'application/json\' }))', '    Promise.resolve().then(function() { return (ticket || looksTicket(name)).save(new Blob([JSON.stringify(out)], { type: \'application/json\' })); })'),
    ];
    check('the pin of exportLooksFile refuses a wait before its dialog and a dialog behind a then (tried on broken texts first), and the function as written waits for nothing before it',
        broken.every(t => t !== b && !elfOk(t, src)) && !elfOk(b, 'async ' + b) && elfOk(b, src), j(broken.map(t => [t !== b, elfOk(t, src)])));
})();
// Each save of a site goes through the dialog its press opened, and a notice sits inside the save's answer, so a cancel says nothing
const tight = [
    ['docimport.js', "if (saved(await ticket.save(new Blob([out.text], { type: 'text/markdown' })))) toast('Markdown saved.' + leftW); return; }"],
    ['docimport.js', "if ((await ticket.ready) === 'cancel') return;"],
    ['docimport.js', "if (!saved(await ticket.save(zipCreate(entries)))) return;"],
    ['furnpack.js', "if (!saved(how)) { log('export-not-saved', { as: 'file', how: how }); return; }"],
    ['furnpack.js', "var how = await ticket.save(zip.zipCreate(ents));\n        if (!saved(how)) { log('template-not-saved', { how: how }); return; }"],
    ['handouts.js', "var how = await ticket.save(blob, name);\n        if (how === 'cancel') { jdlLog('download-cancel', { one: !!only }); return; }\n        if (!saved(how)) { jdlLog('download-fail', { at: at }); return; }"],
    ['io.js', "if (st === 'cancel') return;   // canceled: no export"],
    ['io.js', "var how = await ticket.save(new Blob([r.text], { type: 'application/json' }));\n              if (!saveDone(how)) return null;"],
    ['librarywin.js', "if (saveDone(how)) toast((players ? 'A players’ copy of “' : '“') + p.name"],
    ['main.js', "ticket.save(blob).then(function(how) { if (saveDone(how)) then(); });"],
    ['mapshot.js', "if (how === 'cancel') { _shot.busy = false; shotSync(); return; }"],
    ['settings.js', "if (how === 'cancel') { profStep('save-canceled', {}); return; }\n                if (!saveDone(how)) { profStep('failed', { at: 'save' }); return; }"],
    ['sheets.js', "if (!saveDone(how)) return false;"],
    ['sysedtabs.js', "window.wpSaveFile.saveTo(ticket, blob).then(function(how) { if (window.wpSaveFile.saved(how)) done(); });"],
];
check('pinned: each save waits for the person\'s answer, and a cancel says nothing', tight.every(t => read(t[0]).includes(t[1])), j(tight.filter(t => !read(t[0]).includes(t[1]))));
// No script but savefile.js makes a download link or opens the save dialog itself: one rule for how a file is saved
const own = fs.readdirSync(SCRIPTS).filter(f => /\.js$/.test(f) && f !== 'savefile.js').filter(f => { const s = read(f); return /\.download\s*=/.test(s) || /setAttribute\(\s*['"]download['"]/.test(s) || /showSaveFilePicker/.test(s); });
check('no script but savefile.js makes a download link or opens the save dialog itself (one rule for how a file is saved)', own.length === 0, j(own));
check('savefile.js loads with the page: io.js imports it statically and hands it the app\'s notice; it is no import() of anyone', /import \{ saveStart, saved as saveDone, downloadNow, saySet \} from '\.\/savefile\.js';/.test(read('io.js')) && /\nsaySet\(toast\);/.test(read('io.js'))
    && !fs.readdirSync(SCRIPTS).filter(f => /\.js$/.test(f)).some(f => /import\(\s*['"]\.\/savefile\.js/.test(read(f))));
check('io.js downloadBlob and download stay, as thin users of savefile.js downloadNow with the words they always said', /function downloadBlob\(name, blob\) \{\n      if \(downloadNow\(name, blob\)\) return true;\n      toast\('Export failed\.'\); return false;\n  \}/.test(read('io.js'))
    && /if \(downloadNow\(name, new Blob\(\[text\],\{type:'application\/json'\}\)\)\) toast\('Exported '\+name\);\n    else toast\('Export blocked here\.'\);/.test(read('io.js')));
check('pinned, furnpack.js: the pack maker waits for nothing before its dialog but Export a folder, which picks a folder of its own', /async function makerExport\(asFolder\) \{\n    var F = FU\(\); if \(!_m\) return;\n    var nm = [^\n]*\n    if \(asFolder\) \{ await exportLooksFolder\(nm, makerLooks\); return; \}\n    var ticket = looksTicket\(nm\);/.test(read('furnpack.js')));
check('the share sheet hands Export its count of the files the export would carry, so the dialog names a .zip or a .json at the press', read('share.js').includes('var p = typeof window.wpExportScope === \'function\' ? window.wpExportScope(scope, share, files) : null;'));

/* ---- (the review of a92c0d93, finding 1) an export that turned out a .zip after a .json was picked at the press: io.js exportScope run
   for real on stand-ins. The picked .json is never left empty beside a second dialog that comes up by itself: it is taken away where it is
   still empty, and the .zip waits for the notice's own button ---- */
pending.push((async function() {
    // from the .zip's own helpers where they stand, else from exportScope's own comment (so the suite runs, and fails, on a build without them)
    const src = read('io.js'), to = src.indexOf('\n  window.wpExportScope'), zipAt = src.indexOf('  // The .zip an export turned out');
    const from = zipAt >= 0 ? zipAt : src.indexOf('  // files (optional): the share sheet');
    const deps = ['canPersistLocal', 'toast', 'exportPayload', 'exportKindNow', 'saveStart', 'buildExport', 'saveDone', 'download', 'exportLeftWords', 'downloadBlob', 'exportDoneWords', 'toastAction'];
    const world = function(o) {
        const E = { said: [], dl: [], tickets: [], acts: [], downloads: [] };
        const mk = function(opts) {
            const t = { opts: opts, state: o.st, handle: { name: o.picked || opts.name }, dropped: [], saves: [] };
            t.ready = Promise.resolve(o.st);
            t.drop = function(d) { t.dropped.push(d || {}); return Promise.resolve(o.drop || 'removed'); };
            t.save = function(b) { t.saves.push(b); return Promise.resolve(o.how || 'saved'); };
            E.tickets.push(t); return t;
        };
        const f = new Function(deps.join(','), src.slice(from, to) + '\nreturn { exportScope: exportScope };');
        const api = f(function() { return true; }, function(w) { E.said.push(w); },
            function() { return { base: 'mycamp-campaign', payload: {} }; }, function() { return o.kind; }, mk,
            function() { return Promise.resolve(o.r); }, function(h) { return h === 'saved' || h === 'download'; },
            function(n, t) { E.downloads.push(['text', n]); }, function() { return ''; },
            function(n, b) { E.downloads.push(['blob', n]); return true; }, function(r) { return 'Exported ' + r.name + ' (1 picture).'; },
            function(m, label, fn, ms) { E.acts.push({ m: m, label: label, fn: fn }); });
        E.api = api; return E;
    };
    const zipR = { name: 'mycamp-campaign.zip', blob: new Blob(['PK']), images: 1, videos: 0 };
    // the review's case: the share sheet counted no file, a .json was picked, and the export found the campaign's own pictures after all
    let E = world({ kind: '.json', st: 'picked', picked: 'mycamp-campaign.json', r: zipR });
    let r = await E.api.exportScope('campaign', undefined, 0);
    const before = { tickets: E.tickets.length, downloads: E.downloads.slice(), dropped: E.tickets[0].dropped.slice(), said: E.said.slice(), acts: E.acts.map(a => [a.m, a.label]) };
    check('a .json picked at the press for what turned out a .zip: nothing is handed over as a download (no second dialog comes up by itself), the picked file is dropped quietly (taken away where still empty), and a notice says it is a .zip with a button of its own',
        r === zipR && before.tickets === 1 && before.downloads.length === 0 && j(before.dropped) === j([{ quiet: true }]) && before.said.length === 0
        && j(before.acts) === j([['This export holds pictures, so it is a .zip file. Nothing was saved yet.', 'Save the .zip']]), j(before));
    if (E.acts[0]) await E.acts[0].fn(); await new Promise(rr => setImmediate(rr));
    check('the notice\'s button opens the dialog again for the .zip itself, under the .zip\'s own name, writes the very archive made, and says it was exported only after that save',
        E.tickets.length === 2 && E.tickets[1].opts.name === 'mycamp-campaign.zip' && E.tickets[1].opts.type === 'application/zip' && E.tickets[1].saves[0] === zipR.blob && j(E.said) === j(['Exported mycamp-campaign.zip (1 picture).']), j([E.tickets.map(t => t.opts), E.said]));
    E = world({ kind: '.json', st: 'picked', r: zipR, drop: 'empty' });
    await E.api.exportScope('campaign', undefined, 0);
    check('where the picked file could not be taken away, the same notice says the .json file named was left empty', E.acts.length === 1 && /The \.json file you named was left empty\.$/.test(E.acts[0].m), j(E.acts.map(a => a.m)));
    // a .json export saved through the dialog says it once
    E = world({ kind: '.json', st: 'picked', picked: 'Hall.json', r: { name: 'mycamp.json', text: '{}' } });
    await E.api.exportScope('item');
    check('a .json saved through the dialog says "Exported" once, under the name picked (finding 4: no second notice in the bell)', j(E.said) === j(['Exported Hall.json.']) && E.downloads.length === 0, j(E.said));
    // no dialog in this window: the old download, unchanged
    E = world({ kind: '', st: 'none', r: zipR });
    await E.api.exportScope('campaign');
    check('with no dialog the .zip goes out as the download it always was, with the words it always said', j(E.downloads) === j([['blob', 'mycamp-campaign.zip']]) && j(E.said) === j(['Exported mycamp-campaign.zip (1 picture).']) && E.acts.length === 0, j([E.downloads, E.said]));
})());
check('the share sheet hands Export no count where its plan could not list the pictures no map uses (finding 1): the kind is then not known at the press', read('share.js').includes('var files = _s.plan && Array.isArray(_s.plan.paths) && !_s.plan.unlisted ? _s.plan.paths.length : undefined;'));

/* ---- (finding 2) a file the host's reader writes: sheets.js outFile run for real on stand-ins. The host is asked first, and the dialog
   opens only once the file came back, so a refusal leaves no empty file behind ---- */
(function() {
    const src = read('sheets.js'), from = src.indexOf('var OUT_SAYS = '), to = src.indexOf('// [netcheck:sheetoutgo-end]', from);
    const run = function(answer) {
        const E = { order: [], said: [], cb: null };
        const n = { sheetOut: function(id, cid, cb) { E.order.push('ask'); E.cb = cb; } };
        const f = new Function('net', 'charById', 'fileBase', 'saveTextStart', 'saveTextFile', 'toast', src.slice(from, to) + '\nreturn outFile;');
        const outFile = f(function() { return n; }, function() { return { name: 'Kael' }; }, function(s) { return String(s); },
            function() { E.order.push('dialog'); return { drop: function() { E.order.push('drop'); } }; },
            function(name, text, type, ticket) { E.order.push(['save', name, !!ticket]); return { then: function(fn) { fn(name); } }; },
            function(w) { E.said.push(w); });
        outFile('o1', 'c1');
        E.atPress = E.order.slice();
        if (answer) E.cb(answer.file, answer.why);
        return E;
    };
    const no = run({ file: null, why: 'slow' }), yes = run({ file: { name: 'Kael-reader.json', text: '{}' } });
    check('outFile asks the host before any save dialog opens, and a refusal opens none, so no empty file is left (finding 2)',
        j(no.atPress) === j(['ask']) && j(no.order) === j(['ask']) && no.said[no.said.length - 1] === 'Wait a few seconds, then ask again.', j(no));
    check('outFile opens the dialog only once the host\'s file came back, under the host\'s own name for it, and says saved after',
        j(yes.order) === j(['ask', ['save', 'Kael-reader.json', false]]) && yes.said[yes.said.length - 1] === 'Saved Kael-reader.json.', j(yes));
})();

finish();
