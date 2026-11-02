/* Offline check of a campaign's safety net (1.6.0; the owner, 2026-10-26, by prompt: "best of all options combo"): restore points, a trial
   run and a test copy. The pure half (system/app/scripts/campsafecore.js) is imported and run; the flows of campsafe.js are sliced by their
   [campsafecheck:flows-*] markers and run for real on stand-ins of the page, the save and the local server: a restore point written after
   the save, a roll back that takes ONE campaign from a snapshot (refused while hosting, refused for a snapshot without the campaign, its
   library's gone revisions written back first and nothing replaced when one fails), a trial run kept or put back, a test copy with its packs
   in a folder of its own (nothing kept when a pack fails), the Restore points window drawn as text, and the step log's words. No browser, no
   network. Usage: node tools/campsafecheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 1500) : '')); } }
const tick = async (n) => { for (let i = 0; i < (n || 40); i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let C = null, err = null;
    try { C = await import(url('campsafecore.js')); } catch (e) { err = e; }
    check('campsafecore loads in Node with no window', !!C && !err, err && err.message);
    if (!C) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }

    /* ================= the pure half ================= */
    const notesIn = { 'keep-2026-10-26-10-00-00.json': { camp: 'camp_1', kind: 'trial', at: 300, extra: 'x' }, 'data-2026-10-26-09-00-00.json': { camp: 'camp_2', kind: 'point', at: 200 },
        'keep-a.json': { camp: 'camp 1', kind: 'point', at: 1 }, 'keep-b.json': { camp: 'camp_1', kind: 'other', at: 1 }, 'keep-c.json': { camp: 'camp_1', kind: 'point', at: 0 }, '../data.json': { camp: 'camp_1', kind: 'point', at: 5 },
        'keep-d.json': null, 'keep-e.json': { camp: 'camp_1', kind: 'before', at: 400 } };
    const many = {}; for (let i = 0; i < 250; i++) many['keep-n' + i + '.json'] = { camp: 'c', kind: 'point', at: 1000 + i };
    const cn = C.cleanNotes(notesIn), cm = C.cleanNotes(many);
    check('cleanNotes keeps a note only under a snapshot\'s own name, for a campaign id, of the three kinds, with a time, and nothing else of it; the newest 200 stay; what is no object is none',
        j(cn) === j({ 'keep-e.json': { camp: 'camp_1', kind: 'before', at: 400 }, 'keep-2026-10-26-10-00-00.json': { camp: 'camp_1', kind: 'trial', at: 300 }, 'data-2026-10-26-09-00-00.json': { camp: 'camp_2', kind: 'point', at: 200 } })
        && Object.keys(cm).length === 200 && !cm['keep-n0.json'] && !!cm['keep-n249.json'] && j(C.cleanNotes(null)) === '{}' && j(C.cleanNotes([1])) === '{}' && j(C.cleanNotes(JSON.parse('{"__proto__":{"camp":"c","kind":"point","at":5}}'))) === '{}', j([cn, Object.keys(cm).length]));
    const ct = C.cleanTrials({ camp_1: { file: 'keep-x.json', at: 9 }, 'bad id': { file: 'keep-x.json', at: 9 }, camp_2: { file: 'x.json', at: 9 }, camp_3: { file: 'keep-y.json', at: -1 }, camp_4: 'keep-z.json' });
    check('cleanTrials keeps a trial run only by a campaign id, with a snapshot\'s name and a time', j(ct) === j({ camp_1: { file: 'keep-x.json', at: 9 } }) && j(C.cleanTrials(undefined)) === '{}', j(ct));
    const list = [{ file: 'data-2026-10-26-09-00-00.json', size: 9, at: 200 }, { file: 'keep-2026-10-26-10-00-00.json', size: 9, at: 300 }, { file: 'keep-2026-10-26-11-00-00-before-restore.json', size: 9, at: 350 },
        { file: 'keep-e.json', size: 9, at: 400 }, { file: 'keep-f.json', size: 9, at: 100 }, { file: 'evil.txt', at: 500 }, { file: 'keep-g.json', at: 0 }, null];
    const rows = C.pointRows(list, cn, 'camp_1'), rows2 = C.pointRows(list, cn, 'camp_2');
    check('pointRows lists the snapshots newest first, good names only, each said for this campaign: Before a roll back, Start of a trial run and Restore point where it was made for it, else Before a restore, At launch or Taken by hand; one made for another campaign is said by how the save took it',
        j(rows.map(r => [r.file, r.label, r.mine])) === j([['keep-e.json', 'Before a roll back', true], ['keep-2026-10-26-11-00-00-before-restore.json', 'Before a restore', false], ['keep-2026-10-26-10-00-00.json', 'Start of a trial run', true], ['data-2026-10-26-09-00-00.json', 'At launch', false], ['keep-f.json', 'Taken by hand', false]])
        && rows2[3].label === 'Restore point' && rows2[3].mine === true && rows2[2].label === 'Taken by hand' && C.pointRows(Array.from({ length: 90 }, (_, i) => ({ file: 'keep-' + i + '.json', at: i + 1 })), {}, 'c').length === 60 && j(C.pointRows('x', {}, 'c')) === '[]', j(rows));
    const snapLib = { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 3 }, { id: 'p_b', rev: 1 }, { id: 'p_c', rev: 0 }, { id: 'p_d', rev: 2 }] };
    const lr = C.libRepair(snapLib, { p_a: [7, 6, 5, 4, 3], p_b: [9, 8, 7, 6, 5], p_d: [] });
    check('libRepair: a pinned revision still on disk is kept; one that is gone is written back past every revision on disk (or past its own where none is) and pinned so; a pack never written needs nothing; the snapshot\'s own manifest is never changed; no library is null',
        j(lr.uploads) === j([{ pack: 'p_b', from: 1, to: 10 }, { pack: 'p_d', from: 2, to: 3 }]) && j(lr.manifest.packs.map(p => p.rev)) === j([3, 10, 0, 3]) && snapLib.packs[1].rev === 1
        && C.libRepair(null, {}) === null && C.libRepair({ dir: 'l_x' }, {}) === null && j(C.libRepair(snapLib, null).uploads.map(u => u.to)) === j([4, 2, 3]), j(lr));
    const orig = { id: 'camp_1', name: 'Saga', items: { m1: { id: 'm1', type: 'map' } }, library: { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 3 }, { id: 'p_c', rev: 0 }] } };
    const cp = C.testCopy(orig, 'camp_2', 'Saga (test)', 'l_zzzzzzzz'), cp0 = C.testCopy({ id: 'camp_1', name: 'Bare', items: {} }, 'camp_3', '', ''), cp1 = C.testCopy(orig, 'camp_4', 'X', '');
    check('testCopy: the campaign whole under a new id and name, its library in the new folder at the revisions it pins (a pack never written copies nothing), the original untouched; no name gives (test) after the old one; with no folder the copy keeps no library; a bad id is null',
        cp.camp.id === 'camp_2' && cp.camp.name === 'Saga (test)' && cp.camp.library.dir === 'l_zzzzzzzz' && j(cp.uploads) === j([{ pack: 'p_a', rev: 3, fromDir: 'l_abcdefgh', toDir: 'l_zzzzzzzz' }]) && orig.library.dir === 'l_abcdefgh' && orig.id === 'camp_1' && cp.camp.items !== orig.items
        && cp0.camp.name === 'Bare (test)' && !cp0.uploads.length && !('library' in cp1.camp) && C.testCopy(orig, 'bad id', 'x', 'l_zzzzzzzz') === null && C.testCopy(null, 'camp_5') === null, j([cp, cp0.camp.name]));
    const ln = C.logLine('rollback-fail', { at: 'library', status: 404, file: 'keep-a.json', name: 'Secret Campaign Name', n: 2, ok: true, obj: {}, 'weird key!': 'x' });
    check('logLine: one line, the step and the facts that say where it stood (a word, a number, a truth value, a snapshot\'s name), and nothing that reads like a name with spaces or anything else',
        ln === 'campsafe v1 rollback-fail at=library status=404 file=keep-a.json name=? n=2 ok=true obj=? weirdkey=x' && C.logLine('<b>x</b>') === 'campsafe v1 bxb' && !/Secret/.test(ln), ln);

    /* ================= the flows, run for real ================= */
    const src = read('scripts/campsafe.js'), a = src.indexOf('// [campsafecheck:flows-start]'), z = src.indexOf('// [campsafecheck:flows-end]');
    const flowsSrc = a > 0 && z > a ? src.slice(a, z) : '';
    const csFlows = new Function(flowsSrc + '\nreturn csFlows;')();
    const resp = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => (typeof body === 'string' ? JSON.parse(body) : body), text: async () => (typeof body === 'string' ? body : j(body)) });
    const mkEl = tag => { const el = { tag, kids: [], className: '', textContent: '', title: '', type: '', on: {}, appendChild(k) { this.kids.push(k); return k; }, addEventListener(t, fn) { this.on[t] = fn; } };
        Object.defineProperty(el, 'innerHTML', { set() { throw new Error('markup written'); } }); return el; };
    // a world: the save, the server's files (data.json, backups, library folders), the questions asked and answered from a queue
    const world = o => {
        o = o || {};
        const W = { calls: [], toasts: [], asked: [], answers: (o.answers || []).slice(), logs: [], saves: 0, refreshed: [], switched: [], dismissed: 0, n: 0, clock: 1793000000000,
            disk: { data: null, backups: Object.assign({}, o.backups || {}), lib: JSON.parse(j(o.lib || {})) }, failPost: o.failPost || {} };
        W.state = { appState: o.app || { activeCampaignId: 'camp_1', campaigns: { camp_1: { id: 'camp_1', name: 'Saga', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Now' } } } }, camp_2: { id: 'camp_2', name: 'Other', items: {} } } } };
        W.fetch = async (u, op) => {
            const m = (op && op.method) || 'GET'; W.calls.push(m + ' ' + u);
            if (u === '/api/log') { W.logs.push(op.body); return resp(200, ''); }
            if (u === '/api/data' && m === 'POST') { if (W.failPost.data) return resp(500, {}); W.disk.data = op.body; return resp(200, { success: true }); }
            if (u === '/api/backup-now') { if (W.failPost.backup) return resp(500, {}); const f = 'keep-2026-10-26-21-00-' + String(10 + W.n++) + '.json'; W.disk.backups[f] = W.disk.data; return resp(200, { ok: true, file: f }); }
            if (u === '/api/backups') return o.noList ? resp(404, {}) : resp(200, Object.keys(W.disk.backups).map((f, i) => ({ file: f, size: 1, at: 1000 + i })));
            if (u.indexOf('/saves/backups/lib-') === 0) { const p = u.slice('/saves/backups/'.length); return o.libSnap && o.libSnap[p] ? resp(200, o.libSnap[p]) : resp(404, 'no'); }
            if (u.indexOf('/saves/backups/') === 0) { const f = u.slice('/saves/backups/'.length); return W.disk.backups[f] !== undefined ? resp(200, W.disk.backups[f]) : resp(404, 'no'); }
            if (u.indexOf('/api/library?') === 0) {
                const q = new URLSearchParams(u.slice(13)), dir = q.get('dir'), pack = q.get('pack'), rev = q.get('rev');
                if (m === 'DELETE') { delete W.disk.lib[dir]; return resp(200, { ok: true }); }
                if (m === 'POST') { if (W.failPost.lib) return resp(500, { error: 'write failed' }); const d = (W.disk.lib[dir] = W.disk.lib[dir] || {}); d[pack + '.' + rev] = op.body; return resp(200, { ok: true }); }
                const d = W.disk.lib[dir] || {};
                if (!pack) { const packs = {}; Object.keys(d).forEach(k => { const [p, r] = k.split('.'); (packs[p] = packs[p] || []).push(Number(r)); }); return resp(200, { packs }); }
                return d[pack + '.' + rev] !== undefined ? resp(200, d[pack + '.' + rev]) : resp(404, { error: 'no such pack' });
            }
            return resp(404, {});
        };
        W.D = { core: C, doc: { createElement: mkEl }, fetch: W.fetch, state: () => W.state, camp: () => W.state.appState.campaigns[W.state.appState.activeCampaignId] || null, now: () => W.clock++,
            debug: () => false, usable: () => o.usable !== false, hosting: () => !!o.hosting, save: () => { W.saves++; }, toast: t => W.toasts.push(t),
            confirm: (q, cb, opts) => { W.asked.push([q, opts && opts.yes || '', opts && opts.alt || '', opts && opts.body || null]); const ans = W.answers.length ? W.answers.shift() : false; if (typeof ans === 'function') ans(cb, opts); else cb(ans); },
            alert: t => W.toasts.push('alert: ' + t), uniqueName: s => s, dismiss: () => { W.dismissed++; }, migrate: d => (o.migrate ? o.migrate(d) : d), newDir: () => 'l_newnewnw',
            redraw: () => {}, list: () => {}, refresh: id => W.refreshed.push(id), switchTo: (id, done) => { W.switched.push(id); W.state.appState.activeCampaignId = id; done(); } };
        W.cs = csFlows(W.D);
        return W;
    };
    // a restore point: the save written first, then the snapshot, then the note
    const P = world(), fP = await P.cs.makePoint('camp_1', 'point');
    const Pf = world({ failPost: { data: true } }), fPf = await Pf.cs.makePoint('camp_1', 'point'), Pb = world({ failPost: { backup: true } }), fPb = await Pb.cs.makePoint('camp_1', 'point');
    check('a restore point (makePoint, run for real): the save as it is in memory is written, then snapshotted, then noted for its campaign and saved; a save or a snapshot that fails makes none and notes nothing; each step is a line of the log',
        fP === 'keep-2026-10-26-21-00-10.json' && j(P.calls.filter(c => c !== 'POST /api/log')) === j(['POST /api/data', 'POST /api/backup-now']) && P.state.appState.restorePts[fP].camp === 'camp_1' && P.state.appState.restorePts[fP].kind === 'point' && P.saves === 1
        && JSON.parse(P.disk.backups[fP]).campaigns.camp_1.items.m1.meta.title === 'Now' && j(P.logs) === j(['campsafe v1 point-start kind=point', 'campsafe v1 point-done file=' + fP + ' kind=point'])
        && fPf === '' && !Pf.state.appState.restorePts && Pf.logs[1] === 'campsafe v1 point-fail at=save' && fPb === '' && Pb.logs[1] === 'campsafe v1 point-fail at=snapshot status=500' && !Pb.state.appState.restorePts, j([fP, P.calls, P.logs, Pf.logs, Pb.logs]));
    // a roll back: one campaign, from a snapshot, the other campaigns as they are
    const snapSave = j({ activeCampaignId: 'camp_1', campaigns: { camp_1: { id: 'camp_1', name: 'Saga', items: { m1: { id: 'm1', type: 'map', meta: { title: 'Then' } } } }, camp_2: { id: 'camp_2', name: 'Other OLD', items: {} } } });
    const R = world({ backups: { 'keep-old.json': snapSave }, migrate: d => { d.migrated = true; return d; } }), okR = await R.cs.rollBack('keep-old.json', 'camp_1');
    check('a roll back (rollBack, run for real): the snapshot read through the static path and shaped by the load\'s normaliser, a restore point of the campaign as it is now made first, then that one campaign put in place and the others left as they are, the page told and the save saved',
        okR === true && R.state.appState.campaigns.camp_1.items.m1.meta.title === 'Then' && R.state.appState.campaigns.camp_2.name === 'Other' && R.calls[1] === 'GET /saves/backups/keep-old.json'
        && Object.keys(R.state.appState.restorePts).length === 1 && R.state.appState.restorePts['keep-2026-10-26-21-00-10.json'].kind === 'before' && JSON.parse(R.disk.backups['keep-2026-10-26-21-00-10.json']).campaigns.camp_1.items.m1.meta.title === 'Now'
        && j(R.refreshed) === j(['camp_1']) && R.logs[0] === 'campsafe v1 rollback-start file=keep-old.json' && R.logs[R.logs.length - 1] === 'campsafe v1 rollback-done file=keep-old.json packs=0', j([R.calls, R.logs, R.state.appState.campaigns.camp_1]));
    const Rh = world({ hosting: true, backups: { 'keep-old.json': snapSave } }), okRh = await Rh.cs.rollBack('keep-old.json', 'camp_1');
    const Rm = world({ backups: { 'keep-old.json': j({ campaigns: { camp_2: { id: 'camp_2', items: {} } } }) } }), okRm = await Rm.cs.rollBack('keep-old.json', 'camp_1');
    const Rg = world({ backups: { 'keep-old.json': 'not json' } }), okRg = await Rg.cs.rollBack('keep-old.json', 'camp_1'), Rn = world(), okRn = await Rn.cs.rollBack('keep-gone.json', 'camp_1'), okRx = await Rn.cs.rollBack('../data.json', 'camp_1');
    const still = W => W.state.appState.campaigns.camp_1.items.m1.meta.title === 'Now' && !W.state.appState.restorePts && W.saves === 0;
    check('a roll back is refused, nothing changed and nothing snapshotted: while this machine hosts a table (said, and no file read), for a snapshot that does not hold the campaign, one that is not JSON, one that is not there, and a name that is no snapshot\'s (not even asked for)',
        okRh === false && still(Rh) && !Rh.calls.some(c => c.indexOf('/saves/') >= 0) && /End the table first/.test(Rh.toasts[0]) && Rh.logs[0] === 'campsafe v1 rollback-refused why=hosting'
        && okRm === false && still(Rm) && /does not hold this campaign/.test(Rm.toasts[0]) && okRg === false && still(Rg) && okRn === false && still(Rn) && okRx === false && !Rn.calls.some(c => c.indexOf('data.json') >= 0)
        && Rm.logs.indexOf('campsafe v1 rollback-fail at=campaign file=keep-old.json') >= 0 && Rn.logs.indexOf('campsafe v1 rollback-fail at=read status=404 file=keep-gone.json') >= 0, j([Rh.toasts, Rm.toasts, Rg.toasts, Rn.toasts, Rm.logs]));
    // the library: a pinned revision gone from disk comes back from the snapshot's copy as a new revision
    const libSnapSave = j({ campaigns: { camp_1: { id: 'camp_1', name: 'Saga', items: {}, library: { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 1 }, { id: 'p_b', rev: 2 }] } } } });
    const packText = j({ format: 'waypoint-pack', id: 'p_a', rev: 1, entries: [{ id: 'i_1', name: 'Old' }] });
    const L = world({ backups: { 'keep-old.json': libSnapSave }, lib: { l_abcdefgh: { 'p_a.5': '{}', 'p_a.6': '{}', 'p_b.2': '{}' } }, libSnap: { 'lib-keep-old/l_abcdefgh/p_a.1.json': packText } }), okL = await L.cs.rollBack('keep-old.json', 'camp_1');
    const written = L.disk.lib.l_abcdefgh['p_a.7'] ? JSON.parse(L.disk.lib.l_abcdefgh['p_a.7']) : null;
    const Lf = world({ backups: { 'keep-old.json': libSnapSave }, lib: { l_abcdefgh: { 'p_a.5': '{}' } }, libSnap: {} }), okLf = await Lf.cs.rollBack('keep-old.json', 'camp_1');
    check('a roll back\'s library: a pack whose pinned revision is gone is read from the snapshot\'s own copy, written back as the revision past every one on disk with that number inside it, and pinned; a revision still on disk is left; one that cannot be brought back leaves the campaign as it is, said',
        okL === true && !!written && written.rev === 7 && written.entries[0].name === 'Old' && j(L.state.appState.campaigns.camp_1.library.packs.map(p => p.id + '.' + p.rev)) === j(['p_a.7', 'p_b.2']) && L.logs[L.logs.length - 1] === 'campsafe v1 rollback-done file=keep-old.json packs=1'
        && okLf === false && Lf.state.appState.campaigns.camp_1.items.m1.meta.title === 'Now' && /library pack/.test(Lf.toasts[0]) && Lf.logs.indexOf('campsafe v1 rollback-fail at=library file=keep-old.json n=0') >= 0, j([okL, written, L.logs, Lf.toasts]));
    // a trial run: started, kept; started, put back
    const T = world({ answers: [true] }); T.cs.startTrial(); await tick();
    const tOn = T.cs.trialOn(), tFile = T.state.appState.trials && T.state.appState.trials.camp_1 && T.state.appState.trials.camp_1.file, tAsk = T.asked[0];
    T.state.appState.campaigns.camp_1.items.m1.meta.title = 'Tried'; T.answers.push('alt'); T.cs.endTrial(); await tick();
    const kept = [T.cs.trialOn(), T.state.appState.campaigns.camp_1.items.m1.meta.title, 'trials' in T.state.appState, T.asked[1] && T.asked[1].slice(1, 3)];
    const T2 = world({ answers: [true] }); T2.cs.startTrial(); await tick(); T2.state.appState.campaigns.camp_1.items.m1.meta.title = 'Tried'; T2.state.appState.campaigns.camp_2.name = 'Other changed too';
    T2.answers.push(true); T2.cs.endTrial(); await tick();
    const T3 = world({ answers: [false] }); T3.cs.startTrial(); await tick();
    check('a trial run (startTrial and endTrial, run for real): asked first with Start, a restore point made for it and the trial noted, so its pill shows; ended with Keep the changes, the changes stay and the trial goes; ended with Put it back, the campaign is as it was when the trial began and the other campaigns keep their changes; a Cancel starts nothing',
        tOn === true && /^keep-/.test(tFile) && tAsk[1] === 'Start' && T.state.appState.restorePts[tFile].kind === 'trial' && j(kept) === j([false, 'Tried', false, ['Put it back', 'Keep the changes']]) && T.logs.indexOf('campsafe v1 trial-keep file=' + tFile) >= 0
        && T2.cs.trialOn() === false && T2.state.appState.campaigns.camp_1.items.m1.meta.title === 'Now' && T2.state.appState.campaigns.camp_2.name === 'Other changed too' && T2.logs.some(l => /^campsafe v1 trial-putback file=keep-/.test(l))
        && T3.cs.trialOn() === false && !T3.calls.length && T3.asked.length === 1, j([tOn, tFile, kept, T2.logs, T2.state.appState.campaigns.camp_1.items.m1.meta.title]));
    const Th = world({ answers: [true], hosting: true }); Th.cs.startTrial(); await tick(); Th.answers.push(true); Th.cs.endTrial(); await tick();
    check('a trial run under a hosted table starts, and its Put it back waits for the table to end: the trial stays on and the campaign as it is',
        Th.cs.trialOn() === true && /End the table first/.test(Th.toasts.join(' ')) && Th.logs.some(l => /^campsafe v1 trial-putback-fail/.test(l)), j([Th.toasts, Th.logs]));
    // a new campaign that starts with another's system
    const appS = () => ({ activeCampaignId: 'camp_1', campaigns: {
        camp_1: { id: 'camp_1', name: 'Saga', system: { v: 1, fields: [{ id: 'f_a' }], rolls: [] }, fog: { fields: { sight: 'f_a' } }, library: { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 2 }] }, chars: { c_1: { id: 'c_1' } },
            items: { d1: { id: 'd1', type: 'doc', meta: { title: 'Rules', parentId: 'd2' } }, d2: { id: 'd2', type: 'doc', meta: { title: 'Top', parentId: 'pl1' } }, pl1: { id: 'pl1', type: 'planner', meta: {} }, m1: { id: 'm1', type: 'map', meta: {} } } },
        camp_2: { id: 'camp_2', name: 'Bare', items: {} }, camp_3: { id: 'camp_3', name: 'Table', _foreign: true, system: { v: 1, fields: [{ id: 'f_b' }] }, items: {} }, camp_4: { id: 'camp_4', name: 'Empty', system: { v: 1, fields: [] }, items: {} } } });
    const rowsS = C.systemRows(appS().campaigns, 'camp_2'), plS = C.systemCopy(appS().campaigns.camp_1, 'l_newnewnw', true), plN = C.systemCopy(appS().campaigns.camp_1, '', false);
    check('systemRows and systemCopy: only your own campaigns that hold fields are offered, never a copy of someone else\'s table; the system, its fog settings, its library in a new folder at the revisions it pins and with the tick its handbook pages under the same ids; a page under something that does not come stands at the top, one under a page keeps its place; never a map, a planner or a character; the source untouched',
        j(rowsS.map(r => [r.id, r.pages])) === j([['camp_1', 2]]) && j(Object.keys(plS.items).sort()) === j(['d1', 'd2']) && plS.items.d1.meta.parentId === 'd2' && !('parentId' in plS.items.d2.meta) && plS.library.dir === 'l_newnewnw' && j(plS.uploads) === j([{ pack: 'p_a', rev: 2, fromDir: 'l_abcdefgh', toDir: 'l_newnewnw' }]) && plS.fog.fields.sight === 'f_a' && !('chars' in plS)
        && !Object.keys(plN.items).length && !plN.library && C.systemCopy({ id: 'x' }, '', true) === null, j([rowsS, plS]));
    const packT = '{"entries":[]}', worldS = o => world(Object.assign({ app: appS(), lib: { l_abcdefgh: { 'p_a.2': packT } } }, o || {}));
    let pSys = 'none'; const WS = worldS({ answers: [(cb, opts) => { const sel = opts.body.kids.filter(k => k.tag === 'select')[0], tick = opts.body.kids.filter(k => k.tag === 'label')[0]; sel.value = 'camp_1'; sel.on.change(); WS.tickSeen = [tick.hidden, tick.kids[1].textContent]; cb(true); }] }); WS.cs.pickSystem(p => { pSys = p; });
    const into = { id: 'camp_9', name: 'New', items: {} }, doneS = await WS.cs.fillFrom(into, pSys);
    check('a new campaign takes a copy of the system (pickSystem and fillFrom, run for real): the choice names the page count and goes with the tick, the pack is copied to a folder of its own, the system and the pages land, and changing the copy leaves the source as it was',
        doneS === true && pSys.from === 'camp_1' && pSys.pages === true && WS.tickSeen[0] === false && /handbook pages \(2\)/.test(WS.tickSeen[1]) && WS.disk.lib.l_newnewnw['p_a.2'] === packT && into.system.fields[0].id === 'f_a' && !!into.items.d1 && !into.items.m1 && into.library.dir === 'l_newnewnw' && (into.system.fields[0].id = 'x') && WS.state.appState.campaigns.camp_1.system.fields[0].id === 'f_a', j([doneS, pSys, into]));
    const WN = worldS({ answers: [true] }); let pN = 'none'; WN.cs.pickSystem(p => { pN = p; }); const WC = worldS({ answers: [false] }); let pC = 'none'; WC.cs.pickSystem(p => { pC = p; }); const WO = world({ app: { activeCampaignId: 'camp_2', campaigns: { camp_2: { id: 'camp_2', items: {} } } } }); let pO = 'none'; WO.cs.pickSystem(p => { pO = p; });
    const WF = worldS({ failPost: { lib: true } }), intoF = { id: 'camp_9', name: 'New', items: {} }, doneF = await WF.cs.fillFrom(intoF, { from: 'camp_1', pages: true });
    check('New campaign\'s question: No system yet is what is pSys by default, Cancel makes nothing, with no system to offer nothing is asked, and a pack that cannot be copied leaves a campaign with no system, its folder taken away, says so and logs where',
        pN === null && pC === 'none' && pO === null && !WO.asked.length && doneF === false && !intoF.system && WF.calls.indexOf('DELETE /api/library?dir=l_newnewnw') >= 0 && /no system yet/.test(WF.toasts[0]) && WF.logs.some(l => /system-fail/.test(l)), j([pN, pC, pO, doneF, WF.toasts]));
    // a test copy
    const Cw = world({ app: { activeCampaignId: 'camp_1', campaigns: { camp_1: { id: 'camp_1', name: 'Saga', items: { m1: { id: 'm1' } }, library: { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 2 }] } } } }, lib: { l_abcdefgh: { 'p_a.2': packText } } });
    await Cw.cs.makeTestCopy();
    const cId = Object.keys(Cw.state.appState.campaigns).filter(k => k !== 'camp_1')[0], cC = Cw.state.appState.campaigns[cId];
    const Cf = world({ failPost: { lib: true }, app: { activeCampaignId: 'camp_1', campaigns: { camp_1: { id: 'camp_1', name: 'Saga', items: {}, library: { v: 1, dir: 'l_abcdefgh', packs: [{ id: 'p_a', rev: 2 }] } } } }, lib: { l_abcdefgh: { 'p_a.2': packText } } });
    await Cf.cs.makeTestCopy();
    check('a test copy (makeTestCopy, run for real): the campaign whole as Name (test) under a new id, its packs copied into a folder of its own at the revisions it pins, then saved and opened, the original untouched; a pack that cannot be copied leaves no copy and takes the half-made folder away, said',
        !!cC && cC.name === 'Saga (test)' && cC.library.dir === 'l_newnewnw' && Cw.disk.lib.l_newnewnw['p_a.2'] === packText && Cw.state.appState.campaigns.camp_1.library.dir === 'l_abcdefgh' && j(Cw.switched) === j([cId]) && /Made Saga \(test\)/.test(Cw.toasts[0])
        && Object.keys(Cf.state.appState.campaigns).length === 1 && Cf.calls.indexOf('DELETE /api/library?dir=l_newnewnw') >= 0 && /copy was not made/.test(Cf.toasts[0]) && Cf.logs.indexOf('campsafe v1 copy-fail at=library n=0') >= 0, j([cC && cC.name, Cw.calls, Cf.toasts]));
    // the Restore points window: text only, Roll back asks again
    let picked = null;
    const Wn = world({ backups: { 'keep-old.json': snapSave, 'keep-2026-10-26-21-00-99.json': snapSave }, answers: [(cb, opts) => { picked = opts.body; const row = opts.body.kids.filter(k => k.className.indexOf('cs-row') === 0)[1]; row.kids[2].on.click(); cb(false); }, true] });
    Wn.state.appState.restorePts = { 'keep-2026-10-26-21-00-99.json': { camp: 'camp_1', kind: 'point', at: 5 } };
    await Wn.cs.openPoints(); await tick();
    const rowsW = picked ? picked.kids.filter(k => k.className.indexOf('cs-row') === 0) : [];
    const Wl = world({ noList: true }); await Wl.cs.openPoints();
    const Wu = world({ usable: false }); await Wu.cs.openPoints(); Wu.cs.startTrial(); await Wu.cs.makeTestCopy();
    check('the Restore points window (openPoints, run for real): every snapshot newest first as a row of text, its time, its kind (a point made for this campaign marked as its own) and a Roll back button; a press puts the window away and asks again with Roll back, and a yes rolls back; a list that cannot be read is said; on someone else\'s table nothing is asked',
        rowsW.length === 2 && rowsW.every(r => r.kids.length === 3 && r.kids[2].textContent === 'Roll back' && r.kids[2].tag === 'button') && rowsW[0].kids[1].textContent === 'Restore point' && rowsW[0].className === 'cs-row mine' && rowsW[1].kids[1].textContent === 'Taken by hand'
        && Wn.dismissed === 1 && Wn.asked[1][1] === 'Roll back' && Wn.asked[0][1] === 'Make a restore point' && Wn.state.appState.campaigns.camp_1.items.m1.meta.title === 'Then'
        && /could not be listed/.test(Wl.toasts[0]) && Wu.asked.length === 0 && Wu.calls.length === 0 && Wu.toasts.length === 3, j([rowsW.map(r => r.kids.map(k => k.textContent)), Wn.asked.map(x => x.slice(0, 3)), Wl.toasts, Wu.toasts]));

    /* ================= the page, the words, the wiring ================= */
    const ix = read('index.html'), css = read('style.css'), csSrc = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''), coreSrc = read('scripts/campsafecore.js');
    check('the page loads the pure half and then the module, just before the developer console; the three rows of the campaign menu are wired by their ids and nothing else; the module writes no markup and keeps nothing of its own outside the save',
        ix.indexOf('<script type="module" src="scripts/campsafecore.js"></script>\n<script type="module" src="scripts/campsafe.js"></script>\n<script type="module" src="scripts/devconsole.js"></script>\n') > 0
        && ['pointsCampBtn', 'trialCampBtn', 'testCopyCampBtn'].every(id => (ix.match(new RegExp('id="' + id + '"', 'g')) || []).length === 1)
        && csSrc.includes("[['trialCampBtn', CS.startTrial], ['testCopyCampBtn', CS.makeTestCopy], ['pointsCampBtn', CS.openPoints]].forEach(")
        && !/innerHTML|outerHTML|insertAdjacentHTML|document\.write|localStorage|sessionStorage/.test(csSrc) && !/document\.|window\.|fetch\(|localStorage/.test(coreSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace("if (typeof window !== 'undefined') window.wpCampSafeCore = API;", ''))
        && csSrc.includes('usable: canPersistLocal') && csSrc.includes("hosting: function() { var n = window.wpNet; return !!(n && n.active); }") && /\.cs-list \{[^}]*max-height: 50vh; overflow-y: auto;/.test(css));
    const help = ix.slice(ix.indexOf('id="helpModal"'));
    const notesA = readRoot('WHATSNEW.txt'), notesB = read('assets/whatsnew.txt'), top = t => t.slice(0, t.indexOf('WAYPOINT 1.5.9'));
    const ci = readRoot('.github/workflows/checks.yml');
    check('said: Help has Restore points under Saving and backups with its three ways, and the Trial run pill among the pills; both release notes of 1.6.0 carry it; CI runs this suite',
        help.includes('<li><b>Restore points:</b> try something out without keeping it. The campaign menu has three ways.') && help.includes('<li><b>Trial run</b> is filled while a trial run of this campaign is on. Press it to end the trial.</li>')
        && help.includes('Each step is written to <b>saves/error.log</b>.') && [notesA, notesB].every(t => /Restore points, a trial run and a test copy/.test(top(t))) && ci.includes('run: node tools/campsafecheck.js'));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
