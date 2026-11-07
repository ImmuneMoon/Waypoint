/* Offline check of a starter system with its own library packs (1.6.2; the owner, 2026-11-07, by prompt: "Replace with CORE", "System and all ten
   packs", "Wire it now, CORE files later"). The starters' list (assets/systems/starters.json) and sheets.js's starters slice: the list's cleaner,
   the Start from list as option elements, a starter's packs fetched with it. library.js's starterpacks slice run on stand-ins with the real
   librarycore: a starter's packs written into the campaign's library at Save, made or merged by id into a pack of the same name, nothing
   removed. Every name and entry here is invented. Usage: node tools/startercheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + String(detail).slice(0, 300) : '')); } }
process.on('exit', function() { if (!summed) { console.log('FAIL      the suite never reached its summary (a check left waiting)'); process.exitCode = 1; } });
const APP = path.join(__dirname, '..', 'system', 'app'), SCRIPTS = path.join(APP, 'scripts');
const read = (f) => fs.readFileSync(path.join(SCRIPTS, f), 'utf8').replace(/\r\n/g, '\n');
function slice(src, name) { const a = src.indexOf('// [' + name + '-start]'), b = src.indexOf('// [' + name + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + name); return src.slice(a, b); }
const j = JSON.stringify;

(async function() {
    const LC = await import(pathToFileURL(path.join(SCRIPTS, 'librarycore.js')).href);
    const SYS = await import(pathToFileURL(path.join(SCRIPTS, 'systemcore.js')).href);
    const FM = await import(pathToFileURL(path.join(SCRIPTS, 'formula.js')).href);
    const sh = read('sheets.js'), lib = read('library.js');

    /* ---- the list ---- */
    const listed = JSON.parse(fs.readFileSync(path.join(APP, 'assets', 'systems', 'starters.json'), 'utf8'));
    check('the bundled list names Basic d20 alone until CORE’s files are cleared, and each starter it names has its system file', j(listed.starters.map(s => s.id)) === j(['d20']) && listed.starters.every(s => fs.existsSync(path.join(APP, 'assets', 'systems', s.id + '.json'))));
    const W = { fetched: [], toasts: [], lib: null, renders: 0 };
    const doc = { createElement: (t) => ({ tag: t, value: '', textContent: '' }) };
    const fS = new Function('W', 'document', 'var draft = { fields: [] }; function toast(t) { W.toasts.push(t); } function renderAll() { W.renders++; } var window = { get wpLibrary() { return W.lib; } };\nfunction fetch(u) { W.fetched.push(u); var b = W.files[u]; return Promise.resolve(b === undefined ? { ok: false } : { ok: true, text: function() { return Promise.resolve(b); }, json: function() { return Promise.resolve(JSON.parse(b)); } }); }\n' + slice(sh, 'systemcheck:starters') + '\nreturn { cleanStarters: cleanStarters, startersLoad: startersLoad, startersFill: startersFill, starterOf: starterOf, starterPacksGet: starterPacksGet, starterSaved: starterSaved, setWaiting: function(v) { _starterPacks = v; }, waiting: function() { return _starterPacks; } };');
    const S = fS(W, doc);
    const cl = S.cleanStarters({ starters: [
        { id: 'tinker', name: '  Tinker\u0007 Tactics ', packs: ['tinker/Tinker-Gear.wppack.json', '../escape.wppack.json', 'http://x/y.wppack.json', 'tinker/a b.wppack.json', 'Tinker-Skills.wppack.json', 'tinker/Notes.json'] },
        { id: 'tinker', name: 'Again' }, { id: 'blank', name: 'Blank twice' }, { id: 'Bad Id', name: 'X' }, { id: 'quiet', name: '' }, { id: 'plain', name: 'Plain' }, null, 'x'] });
    check('the list’s cleaner: an id once by its pattern and never Blank’s, a plain name, packs only as file names of the app’s own folder ending .wppack.json, none that walks', j(cl) === j([{ id: 'tinker', name: 'Tinker Tactics', packs: ['tinker/Tinker-Gear.wppack.json', 'Tinker-Skills.wppack.json'] }, { id: 'plain', name: 'Plain' }]), j(cl));
    check('the list’s cleaner: anything that is no list is none', j(S.cleanStarters(null)) === '[]' && j(S.cleanStarters({ starters: 'x' })) === '[]' && S.cleanStarters({ starters: Array.from({ length: 40 }, (x, i) => ({ id: 's' + i, name: 'S' + i })) }).length === 16);
    const sel = { options: [{ value: '' }, { value: 'blank' }, { value: 'd20' }], remove(i) { this.options.splice(i, 1); }, appendChild(o) { this.options.push(o); } };
    S.startersFill(sel, [{ id: 'tinker', name: '<b>Tinker</b>' }, { id: 'plain', name: 'Plain' }]);
    check('Start from: Start from and Blank stay, then each starter by its name as an option’s text', j(sel.options.map(o => o.value)) === j(['', 'blank', 'tinker', 'plain']) && sel.options[2].textContent === '<b>Tinker</b>');
    S.startersFill(sel, null); S.startersFill(sel, []);
    check('Start from: with no list the page’s own options stand', sel.options.length === 4);
    W.files = { 'assets/systems/starters.json': j({ starters: [{ id: 'tinker', name: 'Tinker', packs: ['tinker/A.wppack.json', 'tinker/B.wppack.json'] }] }), 'assets/systems/tinker/A.wppack.json': 'A', 'assets/systems/tinker/B.wppack.json': 'B' };
    const l1 = await S.startersLoad(), l2 = await S.startersLoad();
    check('the list is read once', l1.length === 1 && l1 === l2 && W.fetched.filter(u => u === 'assets/systems/starters.json').length === 1 && S.starterOf('tinker').name === 'Tinker' && S.starterOf('nope') === null);
    const texts = await S.starterPacksGet(S.starterOf('tinker'));
    check('a starter’s packs are fetched from its own folder, in order', j(texts) === j(['A', 'B']));
    W.files['assets/systems/tinker/B.wppack.json'] = undefined; let failed = false; try { await S.starterPacksGet(S.starterOf('tinker')); } catch (e) { failed = true; }
    check('a pack that cannot be fetched fails the starter, all or none', failed);
    // Save writes them and says so
    W.lib = { starterPacks: function(t) { W.wrote = t; return Promise.resolve({ packs: 2, add: 5, update: 1, skip: 2, bad: 0 }); } };
    S.setWaiting({ name: 'Tinker', texts: ['A', 'B'] }); S.starterSaved(); await new Promise(r => setTimeout(r, 0));
    check('at Save the waiting packs go to the library once, and what came in is said', j(W.wrote) === j(['A', 'B']) && S.waiting() === null && /Tinker’s library: 2 packs, 5 entries added, 1 updated, 2 passed over, their ids already in another pack\./.test(W.toasts[W.toasts.length - 1]), W.toasts[W.toasts.length - 1]);
    W.wrote = null; S.starterSaved(); await new Promise(r => setTimeout(r, 0));
    check('a Save with nothing waiting writes nothing', W.wrote === null);

    /* ---- the library writes a starter's packs ---- */
    const F = FM;
    const sys = SYS.cleanSystem({ name: 'Tinker', fields: [{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, custom: true, cats: ['Gear'], stats: [{ key: 'wt', label: 'Weight' }] } }] }, { F: F, gmView: true });
    const packFile = (name, entries) => j({ format: 'waypoint-pack', name: name, vis: 'all', entries: entries });
    const ent = (id, name, wt) => ({ id: id, key: name.replace(/\s+/g, ''), name: name, category: 'Gear', stats: { wt: wt } });
    function world(existing) {
        const Wl = { camp: { id: 'c1', system: sys, library: existing ? { dir: 'l_x', packs: existing.map(p => ({ id: p.id, name: p.name, rev: 1 })) } : null }, packs: {}, created: [], saved: [], meta: [] };
        (existing || []).forEach(p => { Wl.packs[p.id] = p.entries; });
        const fL = new Function('W', 'readPackImport', 'packImportPlan', 'libCtx', 'FX', 'var cur = { campId: "c1", state: "ready" }; var window = { wpStepLog: function(k, s, o) { (W.log = W.log || []).push(s); } };\nfunction getActiveCampaign() { return W.camp; } function gmHere() { return !W.player; } function F() { return FX; } function load() { return Promise.resolve(); }\nfunction createPack(name) { if (W.full) return Promise.resolve({ error: "full" }); var id = "p_" + (W.created.length + 1); W.created.push(name); W.camp.library = W.camp.library || { dir: "l_x", packs: [] }; W.camp.library.packs.push({ id: id, name: name }); W.packs[id] = []; return Promise.resolve({ ok: true, id: id }); }\nfunction setMeta(id, m) { W.meta.push([id, m]); } function ready(id) { return Object.prototype.hasOwnProperty.call(W.packs, id); } function entriesOf(id) { return W.packs[id] || []; }\nfunction savePack(id, entries) { W.saved.push([id, entries.length]); W.packs[id] = entries; return Promise.resolve({ ok: true }); }\n' + slice(lib, 'librarycheck:starterpacks') + '\nreturn starterPacks;');
        Wl.run = fL(Wl, LC.readPackImport, LC.packImportPlan, LC.libCtx, F);
        return Wl;
    }
    const A = world(null);
    const r1 = await A.run([packFile('Tinker Gear', [ent('i_spanner', 'Spanner', 2), ent('i_rope', 'Rope coil', 1)]), packFile('Tinker Tricks', [ent('i_fix', 'Quick fix', 0)]), 'not a pack']);
    check('a campaign with no library gets each pack made, its entries cleaned and written, its icon and who sees it set, a file that is no pack counted apart', j(r1) === j({ packs: 2, add: 3, update: 0, skip: 0, bad: 1 }) && j(A.created) === j(['Tinker Gear', 'Tinker Tricks']) && A.packs.p_1.length === 2 && A.packs.p_1[0].stats.wt === 2 && A.meta.length === 2 && A.meta[0][1].vis === 'all', j(r1));
    check('its steps go to the log as starter v1, counts alone', j(A.log) === j(['start', 'refused', 'done']));
    const B = world([{ id: 'p_9', name: 'tinker gear', entries: [Object.assign(ent('i_spanner', 'Spanner', 9), { name: 'My spanner' }), ent('i_charm', 'Lucky charm', 0)] }]);
    const r2 = await B.run([packFile('Tinker Gear', [ent('i_spanner', 'Spanner', 2), ent('i_rope', 'Rope coil', 1)])]);
    check('a pack of the same name, case aside, is merged into by id: the starter’s entry of that id updated, a new one added, the GM’s own kept, no pack made', j(r2) === j({ packs: 1, add: 1, update: 1, skip: 0, bad: 0 }) && B.created.length === 0 && j(B.packs.p_9.map(e => e.id).sort()) === j(['i_charm', 'i_rope', 'i_spanner']) && B.packs.p_9.find(e => e.id === 'i_spanner').stats.wt === 2);
    const r3 = await B.run([packFile('Tinker Gear', [ent('i_spanner', 'Spanner', 2), ent('i_rope', 'Rope coil', 1)])]);
    check('the same starter again changes nothing and writes nothing', j(r3) === j({ packs: 1, add: 0, update: 0, skip: 0, bad: 0 }) && B.saved.length === 1);
    const C2 = world(null); C2.full = true; const r4 = await C2.run([packFile('Tinker Gear', [ent('i_spanner', 'Spanner', 2)])]);
    check('a pack that cannot be made is counted apart and nothing else is written', j(r4) === j({ packs: 0, add: 0, update: 0, skip: 0, bad: 1 }) && C2.saved.length === 0);
    const D = world(null); D.player = true; const r5 = await D.run([packFile('Tinker Gear', [ent('i_spanner', 'Spanner', 2)])]);
    check('away from the GM’s own campaign nothing is written', !!r5.error && D.saved.length === 0);

    /* ---- wired ---- */
    check('wired (pinned): Save writes the waiting packs after the system is stored, the editor’s open and close let them go, the list fills Start from, the library publishes the function', sh.includes("    save(true);\n    starterSaved();") && sh.includes("_starterPacks = null; startersLoad().then(function(l) { startersFill(ui('sysStartSel'), l); });") && sh.includes("m.style.display = 'none'; draft = null; _starterPacks = null;") && lib.includes(' importFiles: importFiles, starterPacks: starterPacks,'));
    check('no CORE file is in the app before the lawyer clears it', !fs.existsSync(path.join(APP, 'assets', 'systems', 'core.json')) && !fs.readdirSync(path.join(APP, 'assets', 'systems')).some(f => /^core/i.test(f)));

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(function(e) { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
