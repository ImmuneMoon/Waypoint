'use strict';
// A system at its ceilings (the owner, 2026-11-01, by prompt: "Safety ceilings only", of "why have caps? what if someone wants to create a bigger system
// than mine?"). A limit on how much a system holds is there to stop a broken or hostile file from freezing the app, and no real game should meet one, so
// this suite builds a system at every ceiling at once and times what a table does with it: the cleaners, the sheet's figures, the System editor, a sheet's
// rows, the messages that carry it and the rules that run by the clock. Times are CPU time of this process, held against a figure of the machine's own
// speed (`speedOf`), so a busy machine does not fail it and a slow runner is not held to a fast one's numbers. A bound is some four times what was measured
// when it was set, so it fails where a change makes something far worse, and the growth checks fail where a linear walk has become a quadratic one.
const fs = require('fs'), path = require('path');
const { makeDom } = require('./boxdom.js');
let passed = 0, failed = 0, summed = false;
const check = (name, ok, extra) => { if (ok) { passed++; console.log('ok        ' + name); } else { failed++; console.log('FAIL      ' + name + (extra === undefined ? '' : ' -> ' + String(extra).slice(0, 1200))); } };
const app = path.join(__dirname, '..', 'system', 'app'), scripts = path.join(app, 'scripts'), url = f => 'file:///' + path.resolve(path.join(scripts, f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(scripts, f), 'latin1').replace(/\r\n/g, '\n');
const cpu = f => { const a = process.cpuUsage(), r = f(), b = process.cpuUsage(a); return [r, (b.user + b.system) / 1000]; };
const REF_MS = 55;   // what speedOf gave where the bounds were set, on a machine under load
const speedOf = () => { let best = Infinity; for (let i = 0; i < 5; i++) { const t = cpu(() => { const o = []; for (let k = 0; k < 100000; k++) o.push({ a: k, b: 'x' + k }); return JSON.parse(JSON.stringify(o)).length; })[1]; if (t < best) best = t; } return best; };
const j = JSON.stringify;

(async () => {
    const S = await import(url('systemcore.js')), F = await import(url('formula.js')), D = await import(url('dicecore.js')), L = S.LIMITS;
    const slow = Math.max(1, speedOf() / REF_MS), said = [];
    const timed = (name, bound, f) => { const [r, ms] = cpu(f), lim = bound * slow; said.push([name, Math.round(ms), Math.round(lim)]); check('at the ceilings: ' + name + ' stays under ' + Math.round(lim) + ' ms (' + Math.round(ms) + ' ms)', ms < lim, Math.round(ms)); return r; };

    /* ---------- the figures, one place ---------- */
    const HOLDS = { fields: 6000, rolls: 1600, sections: 1000, placements: 8000, items: 2000, carried: 1500, effects: 2000, listStats: 640, entryStats: 640, listCols: 200, rowCounters: 120, rowRolls: 160, applyChanges: 120, labels: 640, pickOpts: 480, tables: 240, tableCols: 160, tableRows: 640, tableCells: 120000, links: 80, env: 80, senses: 80, budgets: 80, postures: 120, rollCalls: 40, needs: 80 };
    check('the ceilings stand in one place (systemcore LIMITS), and the figures below are the ones this suite was set at', Object.keys(HOLDS).every(k => L[k] === HOLDS[k]), j(Object.keys(HOLDS).filter(k => L[k] !== HOLDS[k]).map(k => [k, L[k]])));
    check('what stays a shape stays small: three tie steps, sixteen places', L.initTies === 3 && /\bOVER_PLACES = 16\b/.test(read('systemcore.js')), L.initTies);
    const dc = read('dicecore.js'), dcNum = k => Number((new RegExp('\\b' + k + ': (\\d+)').exec(dc) || [])[1]);
    check('dicecore keeps its own figures, the same as the core\'s', dcNum('applyLines') === L.applyChanges && dcNum('rowRolls') === L.rowRolls && dcNum('resistOr') === S.RESIST_OR, j([dcNum('applyLines'), dcNum('rowRolls'), dcNum('resistOr')]));

    const nums = (f, re) => Number((re.exec(read(f)) || [])[1]);
    const dbx = read('sheets.js'), dbxF = (/DBX_LIM = typeof DMG_LIM === 'object' \? DMG_LIM : (\{[^}]*\})/.exec(dbx) || [])[1] || '{}', dbxV = new Function('return ' + dbxF)();
    check('a figure kept apart, for a file that imports nothing or a slice that runs alone, says what the core says', nums('librarywin.js', /var NEED_MAX = (\d+)/) === L.needs && nums('librarywin.js', /var GRANT_LINES = (\d+)/) === S.GRANT_MAX && nums('sheets.js', /typeof COVER_HIT_ROWS === 'number' \? COVER_HIT_ROWS : (\d+)/) === S.COVER_HIT_ROWS && nums('net.js', /more\.rows\.slice\(0, (\d+)\)\.map/) === nums('dicecore.js', /var RESIST_ROWS = (\d+)/) && nums('fogcore.js', /\bsenses: (\d+),/) === L.senses && Object.keys(dbxV).every(k => dbxV[k] === S.DMG_LIM[k]), j(dbxV));

    /* ---------- a system at every ceiling ---------- */
    const mk = (scale) => {
        const n = x => Math.max(1, Math.round(x * scale)), nFields = n(L.fields), nStats = n(L.listStats), fields = [];
        const stats = Array.from({ length: nStats }, (_, i) => i % 16 === 15 ? { key: 'P' + i, label: 'Pick ' + i, kind: 'pick', opts: Array.from({ length: n(L.pickOpts) }, (_, k) => ({ label: 'Choice ' + k, name: 'A0' })) } : { key: 'S' + i, label: 'Stat ' + i });
        const cols = Array.from({ length: n(L.listCols) }, (_, i) => ({ key: 'C' + i, label: 'Col ' + i, formula: 'Row.S' + (i % Math.min(15, nStats - 1)) + ' + Row.lvl + ' + (i ? 'Row.C' + (i - 1) % 5 : 'A0') }));
        const counters = Array.from({ length: n(L.rowCounters) }, (_, i) => ({ key: 'T' + i, label: 'Ct ' + i, max: '3' }));
        const lrolls = Array.from({ length: n(L.rowRolls) }, (_, i) => ({ label: 'Roll ' + i, formula: '1d20 + Row.S' + (i % 3) }));
        for (let i = 0; i < 20; i++) fields.push({ id: 'f_list' + i, key: 'List' + i, label: 'List ' + i, kind: 'item-list', vis: 'all', edit: 'owner', list: i === 0 ? { cats: ['A', 'B'], lvl: { min: 0, max: 20 }, on: { label: 'On' }, stats, cols, counters, rolls: lrolls } : { cats: ['A'], stats: stats.slice(0, 4) } });
        fields.push({ id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: 'A0 + 10', vis: 'all', edit: 'owner' }, { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all' });
        for (let i = 0; fields.length < nFields; i++) { const k = i % 4, id = 'f_a' + i, key = 'A' + i; fields.push(k === 0 ? { id, key, label: 'Number ' + i, kind: 'number', def: i % 7, vis: 'all' } : k === 1 ? { id, key, label: 'Formula ' + i, kind: 'formula', formula: 'A' + (i - 1) + ' + 1', vis: 'all' } : k === 2 ? { id, key, label: 'Skill ' + i, kind: 'skill', base: 'A' + (i - 2), vis: 'all' } : { id, key, label: 'Named ' + i, kind: 'number', def: 1, vis: 'all', labels: i % 40 === 3 ? Array.from({ length: n(L.labels) }, (_, k) => 'Name ' + k) : undefined }); }
        const rolls = Array.from({ length: n(L.rolls) }, (_, i) => i === 0 ? { id: 'r_tick', label: 'Tick', apply: [{ f: 'f_hp', formula: '1', add: true }], every: { n: 1, u: 'hours' } } : { id: 'r_r' + i, label: 'Roll ' + i, formula: '1d20 + A' + (i * 4 % Math.max(4, nFields - 40)) });
        const effects = Array.from({ length: n(L.effects) }, (_, i) => ({ id: 'e_e' + i, name: 'Effect ' + i, vis: 'all', mods: Array.from({ length: n(L.effectMods) }, (_, k) => ({ f: 'f_a' + (k * 4), op: 'add', v: 1 })) }));
        const items = Array.from({ length: n(L.items) }, (_, i) => { const st = {}; stats.forEach((s, k) => { if (!s.kind && k < 200) st[s.key] = k; }); return { id: 'i_i' + i, name: 'Item ' + i, key: 'It' + i, category: i % 2 ? 'A' : 'B', vis: 'all', stats: st }; });
        const sections = Array.from({ length: n(L.sections) }, (_, i) => ({ id: 's_' + i, title: 'Section ' + i, fields: [] })), ids = fields.map(f => f.id);
        ids.forEach((id, p) => sections[p % sections.length].fields.push({ id, w: 1 })); rolls.forEach((r, p) => sections[p % sections.length].fields.push({ roll: r.id, w: 1 }));   // a field or a roll stands once a layout, so these fill it short of LIMITS.placements
        return { raw: { v: 1, name: 'Ceiling', fields, rolls, effects, items, combat: {}, sheet: { sections } }, nItems: items.length, nFields };
    };
    const big = mk(1), rawJ = j(big.raw);
    const gm = timed('cleanSystem, the GM\'s view', 2400, () => S.cleanSystem(big.raw, { F, gmView: true }));
    check('the system at its ceilings is kept whole: every field, roll, effect, item and section, a list with every stat, column, counter and roll', gm.fields.length === L.fields && gm.rolls.length === L.rolls && gm.effects.length === L.effects && gm.items.length === L.items && gm.sheet.sections.length === L.sections && gm.fields[0].list.stats.length === L.listStats && gm.fields[0].list.cols.length === L.listCols && gm.fields[0].list.counters.length === L.rowCounters && gm.fields[0].list.rolls.length === L.rowRolls, j([gm.fields.length, gm.rolls.length, gm.effects.length, gm.items.length, gm.sheet.sections.length]));
    const pv = timed('cleanSystem, the players\' view', 2400, () => S.cleanSystem(gm, { F, gmView: false }));
    timed('a player\'s app cleaning the view again', 2400, () => S.cleanSystem(pv, { F, gmView: false, libCats: {} }));
    const v = timed('validateSystem', 2600, () => S.validateSystem(gm, F));
    check('the system at its ceilings has no error of its own', v.errors.length === 0, j(v.errors.slice(0, 3)));
    timed('capsAt', 40, () => S.capsAt(gm));
    {   // 1.6.2 (body fold 2): a body of thirty tiles and fifty worn rows, every one reading Fits where, Reaches and Counts where, and a tile reading what stands there
        const tiles = [], worn = [], items = [{ id: 'i_tile', name: 'Tile', stats: { Z: 1 } }, { id: 'i_worn', name: 'Worn', stats: { Z: 1, D: 2 } }]; for (let i = 0; i < 30; i++) tiles.push({ id: 'w_t' + i, defId: 'i_tile', qty: 1 }); for (let i = 0; i < 50; i++) worn.push(i % 2 ? { id: 'w_r' + i, defId: 'i_worn', qty: 1, pl: 'w_t' + (i % 30) } : { id: 'w_r' + i, defId: 'i_worn', qty: 1 });
        const sys = S.cleanSystem({ v: 1, name: 'Body', fields: [{ id: 'f_t', key: 'Tt', kind: 'item-list', list: { multi: true, stats: [{ key: 'Z', label: 'Z' }], cols: [{ key: 'C', label: 'C', formula: 'Here.Ww.sum.D' }] } }, { id: 'f_w', key: 'Ww', kind: 'item-list', list: { multi: true, stats: [{ key: 'Z', label: 'Z' }, { key: 'D', label: 'D' }], stand: { from: 'f_t', fits: 'Row.Z = At.Z', reach: 'Tile.Z = At.Z', counts: 'Row.D > 0' } } }], items }, { F, gmView: true });
        timed('where fifty rows stand on thirty tiles, and each tile\'s total', 900, () => S.resolveAll(sys, { id: 'c_b', values: { f_t: tiles, f_w: worn } }, F));
    }
    timed('droppedCounts', 600, () => S.droppedCounts(big.raw, gm));
    check('capsAt names what stands at its limit, and droppedCounts says nothing of a system that lost nothing', S.capsAt(gm).length > 0 && !S.droppedWords(S.droppedCounts(big.raw, gm)), j(S.droppedCounts(big.raw, gm)));
    const pvJ = j(pv);
    console.log('          the system as a file ' + (rawJ.length / 1048576).toFixed(1) + ' MB, the players\' view ' + (pvJ.length / 1048576).toFixed(1) + ' MB');
    check('the players\' view at the ceilings stays a message the table can carry (the transport takes some 66 MB to a host and 133 MB to a player)', pvJ.length < 30 * 1048576, pvJ.length);
    const half = mk(0.5), g2 = cpu(() => S.cleanSystem(half.raw, { F, gmView: true }))[1], g1 = cpu(() => S.cleanSystem(big.raw, { F, gmView: true }))[1];
    check('cleanSystem grows with the system: twice the system costs less than four times the work', g1 < g2 * 4, j([g1, g2]));

    /* ---------- a character at the ceilings ---------- */
    const rowsOf = (n, f) => Array.from({ length: n }, (_, i) => ({ id: f + i, defId: 'i_i' + (i % big.nItems), qty: 1, lvl: 1 + i % 5, on: i % 2 === 0 }));
    const valsOf = n => { const o = { f_list0: rowsOf(n, 'w_'), f_hp: { cur: 5 }, f_fx: [] }; for (let i = 0; i < 400; i++) o['f_a' + (i * 4)] = i % 9; return o; };
    const ch0 = { id: 'c_big', name: 'Pebbles', ownerId: 'u_a', values: valsOf(L.carried) };
    const ch = timed('cleanChar', 300, () => S.cleanChar(ch0, gm));
    check('the character keeps every row', ch.values.f_list0.length === L.carried, ch.values.f_list0.length);
    timed('resolveAll on the GM\'s copy', 5000, () => S.resolveAll(gm, ch, F));
    const itemsG = Object.fromEntries(gm.items.map(i => [i.id, i])), own = timed('a player\'s own copy of the character', 2000, () => S.charFor(ch, pv, 'u_a', { items: itemsG }));
    timed('resolveAll on a player\'s app', 5000, () => S.resolveAll(pv, own, F));
    timed('one name read of a character', 100, () => S.makeResolver(gm, ch, F)('A400'));
    const sysW = S.cleanSystem({ v: 1, name: 'W', rolls: [], sheet: { sections: [] }, items: [{ id: 'i_a', name: 'Pebble', vis: 'all' }], fields: Array.from({ length: 22 }, (_, i) => ({ id: 'f_w' + i, key: 'W' + i, label: 'W', kind: 'item-list', vis: 'all', edit: 'owner', list: {} })) }, { F, gmView: true }), valsW = {};
    for (let i = 0; i < 22; i++) valsW['f_w' + i] = Array.from({ length: L.carried }, (_, k) => ({ id: 'w_' + i + 'x' + k, defId: 'i_a', qty: 1 }));
    const wide = S.cleanChar({ id: 'c_w', name: 'W', ownerId: 'u_a', values: valsW }, sysW), wideN = Object.keys(wide.values).map(k => wide.values[k].length);
    check('a character holds at most LIMITS.charRows rows in all, so lists times rows stays a bound on what a file or a table can ask of a sheet: 22 full lists keep the first twenty', wideN.reduce((a, b) => a + b, 0) === L.charRows && L.charRows === 20 * L.carried && !('f_w20' in wide.values), j(wideN));
    const ch4 = S.cleanChar({ id: 'c_q', name: 'Q', ownerId: 'u_a', values: valsOf(400) }, gm), best3 = (a, b) => { let x = Infinity, y = Infinity; for (let i = 0; i < 3; i++) { x = Math.min(x, cpu(a)[1]); y = Math.min(y, cpu(b)[1]); } return [x, y]; }, [r4, r15] = best3(() => S.resolveAll(gm, ch4, F), () => S.resolveAll(gm, ch, F));   // the best of three for each size, taken turn about: one timing of each tipped the ratio on a busy machine (2026-11-11, 5.85 in a full gate, 3.9 alone)
    check('the sheet\'s figures grow with the rows: 1500 rows cost at most five times what 400 do, where the list\'s columns and rolls are the same (a linear walk gives 3.75)', r15 < r4 * 5, j([r15, r4]));
    const copyJ = j(own); console.log('          a player\'s own copy of that character ' + (copyJ.length / 1048576).toFixed(1) + ' MB');
    check('that character\'s own copy stays a message the table can carry', copyJ.length < 30 * 1048576, copyJ.length);

    /* ---------- the join snapshot, the real sanitizeAppState ---------- */
    {
        const src = fs.readFileSync(path.join(scripts, 'net.js'), 'latin1'), cut = (a, b) => { const i = src.indexOf(a), k = src.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('slice ' + a); return src.slice(i, k); };
        const a = src.indexOf('function sanitizeItem('), b = src.indexOf('\n}\n', src.indexOf('function wireWbItem(', a));
        const saSrc = src.slice(src.indexOf('function cleanElevation('), a) + '\n' + (src.match(/function wireNum\(k, v\) \{[^\n]*\}/) || [''])[0] + '\n' + src.slice(a, b + 3) + '\n' + cut('function sanitizeAppState(', '\nfunction fogNow()');
        const own1 = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null;
        const SA = new Function('own', 'window', 'fxLib', 'itemLib', 'withHoverLines', 'fogCopyFor', 'fogPartyCopy', "'use strict';\n" + saSrc + '\nreturn sanitizeAppState;')(own1, { wpSystemCore: S, wpFormula: F, wpLibrary: { catsFor: () => ({ show: [], hide: [] }) } }, () => ({}), () => ({}), x => x, it => it, it => it);
        const gmSave = () => ({ activeCampaignId: 'k1', _schema: 2, campaigns: { k1: { id: 'k1', name: 'Hosted', activeItemId: null, items: {}, system: gm, chars: { c_big: ch } } } });
        const snap = timed('the join snapshot', 6000, () => SA(gmSave(), 'u_a')), snapJ = j(snap);
        console.log('          the join snapshot ' + (snapJ.length / 1048576).toFixed(1) + ' MB');
        check('the join snapshot stays a message the table can carry', snapJ.length < 40 * 1048576 && !!snap.campaigns.k1.chars.c_big, snapJ.length);
    }

    /* ---------- a time rule's run ---------- */
    {
        const rule = gm.rolls.find(r => r.id === 'r_tick'), dice = { random: () => 0.5 };
        const chs = Array.from({ length: 20 }, (_, i) => S.cleanChar({ id: 'c_' + i, name: 'C' + i, ownerId: 'u_a', values: { f_hp: { cur: 1 } } }, gm));
        const rs = timed('a time rule run on 20 characters', 3000, () => chs.map(c => S.timeRuleRun(gm, c, rule, 1, F, dice, null, {})));
        check('a time rule at the ceilings still runs', rs.every(r => r && r.ok !== false), j(rs[0]).slice(0, 200));
    }

    /* ---------- what Save says: the real refreshErrors ---------- */
    {
        const sh = read('sheets.js'), cutS = (a, b) => { const i = sh.indexOf(a), k = sh.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('slice ' + a); return sh.slice(i, k); };
        const dr = JSON.parse(j(gm)), re = cutS('function refreshErrors(', 'function errorCell('), noop = () => null;
        const out = timed('refreshErrors, what Save says under the rows', 7000, () => new Function('draft', 'F', 'validKey', 'KINDS', 'cleanItemKey', 'cleanSystem', 'validateSystem', 'statKey', 'LIMITS', 'getActiveCampaign', 'systemOf', 'var errorsById = {}, warningsById = {};\n' + re + '\nrefreshErrors(); return { errorsById: errorsById };')(dr, () => F, S.validKey, S.KINDS, S.cleanItemKey, S.cleanSystem, S.validateSystem, S.statKey, L, noop, c => (c && c.system) || null));
        check('Save says nothing of a system at its ceilings but what it should', Object.keys(out.errorsById).length < 50, j(Object.keys(out.errorsById).slice(0, 8)));

        /* ---------- the System editor: the real renderAll on a page of plain objects (as sysuicheck runs it) ---------- */
        const d = makeDom(), { document, window } = d;
        Object.defineProperty(d.El.prototype, 'options', { get() { return this.childNodes; } });
        const cut = name => { const a = sh.indexOf('\nfunction ' + name + '('); if (a < 0) return ''; if (name === 'listCard') return sh.slice(a + 1, sh.indexOf('    return card;\n}\n', a) + 18); const line = sh.slice(a + 1, sh.indexOf('\n', a + 1)); if (/\}\s*(\/\/.*)?$/.test(line) && (line.match(/\{/g) || []).length === (line.match(/\}/g) || []).length) return line; const m = /\n\}/g; m.lastIndex = a + 1; return sh.slice(a + 1, m.exec(sh).index + 2); };
        const names = ['el', 'input', 'numInput', 'numField', 'select', 'opt', 'labeledNum', 'labeledSelect', 'capBox', 'capInline', 'checkLabel', 'lazySelect', 'lineUnder', 'fieldRow', 'buildDefCell', 'roundCells', 'spillCtl', 'rollRow', 'effectRow', 'itemRow', 'listCard', 'renderAll', 'renderLists', 'renderCombat', 'combatBody'];
        const code = names.map(cut).join('\n') + '\n' + sh.slice(sh.indexOf('// [sysuicheck:rows-start]'), sh.indexOf('// [sysuicheck:rows-end]'));
        window.wpSoundOn = { btn: () => document.createElement('button') }; window.wpSystemCore = {};
        const made = {}, stub = k => { if (!(k in made)) made[k] = () => { const e = document.createElement('div'); e.className = 'stub-' + k; return e; }; return made[k]; };
        const base = { document, window, console, draft: dr, Object, Array, String, Number, Math, JSON, RegExp, isFinite, parseFloat, parseInt, Date, Set, Map, WeakMap, Boolean, Error, Symbol, undefined, Infinity, NaN,
            KIND_LABEL: { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list', effects: 'Status effects' }, KIND_HELP: {}, STORED: { number: 1, resource: 1, skill: 1, toggle: 1, text: 1, notes: 1, select: 1, 'item-list': 1, effects: 1 }, ITEM_COL_LABEL: { category: 'C', cost: 'C', damage: 'D', area: 'A', notes: 'N' }, LIMITS: L, GRANT_MAX: S.GRANT_MAX, ROUND_WORDS: [['', 'None'], ['near', 'N'], ['from', 'F']],
            btnRow: l => { const b = document.createElement('span'); b.className = 'sys-btns'; l.forEach(x => { const q = document.createElement('button'); q.className = 'tool ghost sys-btn'; q.dataset.act = x[0]; b.appendChild(q); }); return b; },
            turnActs: () => [], costOptions: () => [['', 'x']], fxTargets: () => [['f_a0|add', 'x']], modVal: () => 'f_a0|add', itemStatDefs: () => [], errorCell: () => { const e = document.createElement('div'); e.className = 'sys-err'; return e; }, listNamesText: () => 'x', PLACES: [['', 'x']], postureList: () => [], swSays: () => '', affSays: () => '', iconText: () => '', lvlOnlyText: () => '', AFF_WHO: [['', 'x']], AFF_UNITS_ED: [['turns', 't']], draftRowOf: () => null, tab: 'fields', _tabPress: false, errorsById: {}, warningsById: {}, ui: id => document.getElementById(id), rowFocusOf: () => null, rowFocusBack: () => {}, markDirty: () => {}, errPrefix: () => '', DBX_LIM: S.DMG_LIM, DBX_DIE: [] };
        const env = new Proxy(base, { has: (t, k) => typeof k === 'string', get: (t, k) => (k in t ? t[k] : (k === Symbol.unscopables ? undefined : stub(k))) });
        const R = new Function('env', 'with (env) {\n' + code + '\nreturn { renderAll, pickOpen, setTab: function(t) { tab = t; } };\n}')(env);
        const modal = d.mk('div', '', null, 'sysModal'); document.body.appendChild(modal);
        const pane = d.mk('div', '', null, 'sysInt'); modal.appendChild(pane);
        const put = (id, cls, parent) => { const e = d.mk('div', cls || '', null, id); e.style = {}; (parent || pane).appendChild(e); return e; };
        ['sysFields', 'sysChars', 'sysItems', 'sysEffects', 'sysLists', 'sysLayout', 'sysCalendar', 'sysCombat', 'sysRules', 'sysListRules', 'sysCharRows', 'sysAddRoll', 'sysFeatureNote', 'sysBudgets', 'sysEnv', 'sysLinks', 'sysTables', 'sysRolls'].forEach(id => put(id));
        [['Field', 'sysFields'], ['Roll', 'sysRolls'], ['Item', 'sysItems'], ['List', 'sysLists'], ['Effect', 'sysEffects']].forEach(w => { const box = document.getElementById(w[1]), pk = d.mk('div', 'sys-pick'), f = d.mk('input', 'sys-find', null, 'sys' + w[0] + 'Find'), l = d.mk('div', 'sys-pick-list', null, 'sys' + w[0] + 'List'), n = d.mk('div', 'sys-pick-none'); pk.appendChild(f); pk.appendChild(l); pk.appendChild(n); box.appendChild(pk); put('sys' + w[0] + 'Rows', 'sys-rows', box); });
        const store = { getItem: () => null, setItem() {} }; window.localStorage = store; window.wpStepLog = () => {}; document.readyState = 'complete';
        new Function('window', 'document', 'localStorage', read('sysui.js'))(window, document, store); window.wpSysUi.host({ pick: R.pickOpen, move: () => {} });
        // its time is a figure of this page of plain objects, which walks its whole tree for an id, so what is held here is the work: the times are read in a browser
        let madeN = 0; const makeEl = document.createElement.bind(document); document.createElement = t => { madeN++; return makeEl(t); };
        R.setTab('fields'); R.renderAll();
        const listN = document.getElementById('sysFieldList').childNodes.length, rowN = document.getElementById('sysFieldRows').querySelectorAll('.sys-row').length;
        check('the System editor draws a line of the list a field and one row of the 6,000: elements made grow with the list, never with the list times what a row holds', listN >= L.fields - 20 && rowN === 1 && madeN < L.fields * 8 + 4000, j([listN, rowN, madeN]));

        /* ---------- a sheet's rows: the real item widgets, and the window that keeps a long list usable ---------- */
        const itSrc = cutS('// ---- item-list widgets', '// 5h: an effect\'s changes as short text');
        const fe = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined || text === null ? '' : String(text), children: [], title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, classList: { add() {} }, on: {}, get childNodes() { return this.children; }, appendChild(x) { this.children.push(x); return x; }, insertBefore(x) { this.children.unshift(x); return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const opt1 = (v, t, s) => { const o = fe('option', null, t); o.value = v; if (s) o.selected = true; return o; }, docF = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) };
        const deps = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView'];
        const mkW = (live, win) => new Function(...deps, itSrc + '\nreturn { itemListInto: itemListInto, itemTableInto: itemTableInto, rowsDrawn: typeof rowsDrawn === "function" ? rowsDrawn : null };')(fe, (v, cls) => fe('span', cls, v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, () => {}, opt1, S.fmtNum, x => x || '', L, live, docF, () => {}, () => {}, () => {}, win, () => gm, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, 'sheet');
        const count = n => { let c = 0; const walk = x => { c++; (x.children || []).forEach(walk); }; walk(n); return c; };
        const W = mkW(true, {}), fL = S.fieldById(gm, 'f_list0'), rowsL = ch.values.f_list0, rowsIn = n => n.children.filter(k => / ?sheet-item( |$)/.test(String(k.className)));
        const box = fe('div'), res = S.resolveAll(gm, ch, F).f_list0;
        timed('a list of 1500 rows drawn on a sheet', 3000, () => W.itemListInto(box, fL, ch, rowsL, gm, false, true, true, res));
        const drawnN = rowsIn(box).length, nodes = count(box);
        console.log('          ' + drawnN + ' rows drawn of ' + rowsL.length + ', ' + nodes + ' nodes');
        check('a very long list draws its first rows and offers the rest: a row of 160 rolls keeps the sheet to 150 rows, and Show all stands under them', drawnN === 150 && box.children.some(k => /sheet-rows-more/.test(String(k.className))), j([drawnN, box.children.length]));
        const small = fe('div'); W.itemListInto(small, fL, ch, rowsL.slice(0, 149), gm, false, true, true, res);
        check('a list of 150 rows or fewer draws every row, as it always did', rowsIn(small).length === 149 && !small.children.some(k => /sheet-rows-more/.test(String(k.className))), rowsIn(small).length);
        const win2 = { wpPrintCopy: true }, P = mkW(true, win2), paper = fe('div'); P.itemListInto(paper, fL, ch, rowsL.slice(0, 200), gm, false, true, true, res);
        check('a print draws every row, however long the list', rowsIn(paper).length === 200, rowsIn(paper).length);
    }

    /* ---------- a table the editor could not draw ---------- */
    {
        const cols = Array.from({ length: L.tableCols }, (_, k) => ({ key: 'c' + k })), rows = Array.from({ length: L.tableRows }, (_, k) => ({ key: 'r' + k, vals: { c0: k } }));
        const one = S.cleanTables(Array.from({ length: 1 }, () => ({ key: 'T', cols, rows })), true), two = S.cleanTables(Array.from({ length: 2 }, (x, i) => ({ key: 'T' + i, cols, rows })), true);
        check('a table may hold every column and row, and tables together hold LIMITS.tableCells: the one that would pass it is left out, since the editor draws a box a cell', one[0].cols.length * one[0].rows.length <= L.tableCells && two.length === 1, j([one.length, two.length]));
    }

    console.log('\n' + said.map(x => x[0].padEnd(52) + String(x[1]).padStart(7) + ' ms   (bound ' + x[2] + ')').join('\n') + '\n');
    summed = true;
    console.log(passed + ' passed, ' + failed + ' failed.');
    if (failed) process.exitCode = 1;
})().catch(e => { console.log('FAIL      ceilingcheck stopped: ' + (e && e.stack || e)); process.exitCode = 1; summed = true; });
process.on('exit', () => { if (!summed) { console.log('FAIL      a check never finished'); process.exitCode = 1; } });
