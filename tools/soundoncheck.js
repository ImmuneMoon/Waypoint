/* Offline check of sounds on actions (1.6.2; the owner, 2026-11-01: "I would like to assign some of the sound bites to character actions or
   environmental actions", set in a list under the Sound panel and by a small button where the thing is, heard by those on the map and the GM
   always, a hidden act silent for players with no tick to override it). The pure half (soundoncore.js) is imported and run. soundon.js is
   sliced by its [soundoncheck:*] markers and run on a page of plain objects that refuses markup, with a Sound engine of the suite's own. The
   press itself runs from the button: sheets.js sheetRoll sliced, the real dicecore cleaner after it. Who hears is netcheck's (soundhear), a name
   from a file sinkcheck's and a file's list cleanupcheck's. The page, the Sound panel's hook, Help, both release notes and the CI step are pinned.
   Usage: node tools/soundoncheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs'), url = require('url');
const NL = String.fromCharCode(10);
const root = path.join(__dirname, '..'), app = path.join(root, 'system', 'app');
const readU = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const readRoot = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 400) : '')); } }
function slice(src, tag) {
    const a = src.indexOf('// [' + tag + '-start]'), b = src.indexOf('// [' + tag + '-end]');
    if (a < 0 || b < a) throw new Error('no slice ' + tag);
    return src.slice(src.indexOf(NL, a) + 1, b);
}
const scriptUrl = f => url.pathToFileURL(path.join(app, 'scripts', f)).href;
process.on('exit', code => { if (!summed && !code) { console.log('FAIL      the asynchronous checks never finished'); process.exitCode = 1; } });

// A page of plain objects: elements, text and a selection of what is pressed. Setting innerHTML throws, so a name can only arrive as text
function mkPage() {
    const made = [];
    class EL {
        constructor(tag) { this.tagName = String(tag).toUpperCase(); this.className = ''; this.children = []; this.parentNode = null; this.style = {}; this.attrs = {}; this.on = {}; this.value = ''; this.disabled = false; this.title = ''; this._t = ''; this.label = ''; made.push(this); }
        get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }
        set textContent(v) { this._t = String(v); this.children.forEach(c => { c.parentNode = null; }); this.children = []; }
        get innerHTML() { throw new Error('innerHTML read'); }
        set innerHTML(v) { throw new Error('markup written: ' + v); }
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); if (this.tagName === 'SELECT' || this.tagName === 'OPTGROUP') { if (c.selected) this.top().value = c.value; else if (this.top().value === '' && this.top().opts().length === 1) this.top().value = c.value; } return c; }
        top() { return this.tagName === 'OPTGROUP' && this.parentNode ? this.parentNode : this; }
        opts() { const o = []; const w = e => e.children.forEach(c => { if (c.tagName === 'OPTION') o.push(c); else w(c); }); w(this); return o; }
        insertBefore(c, at) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; const i = this.children.indexOf(at); this.children.splice(i < 0 ? this.children.length : i, 0, c); return c; }
        removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
        setAttribute(k, v) { this.attrs[k] = String(v); }
        addEventListener(t, f) { (this.on[t] = this.on[t] || []).push(f); }
        fire(t, ev) { (this.on[t] || []).forEach(f => f.call(this, Object.assign({ target: this, stopPropagation() {}, preventDefault() {} }, ev || {}))); }
        contains(x) { return x === this || this.children.some(c => c.contains(x)); }
        all(test, out) { out = out || []; this.children.forEach(c => { if (test(c)) out.push(c); c.all(test, out); }); return out; }
        byClass(k) { return this.all(c => String(c.className).split(' ').indexOf(k) >= 0); }
        querySelector(q) { return (q.indexOf('.') >= 0 ? this.byClass(q.split('.').pop()) : this.all(c => c.tagName === q.toUpperCase()))[0] || null; }
        querySelectorAll(q) { const qs = q.toUpperCase().split(', '); return this.all(c => qs.indexOf(c.tagName) >= 0); }
        getBoundingClientRect() { return { left: 10, top: 10, right: 40, bottom: 30 }; }
        focus() { doc.activeElement = this; }
    }
    const byId = {}, listeners = {}, body = new EL('body');
    const doc = { body, activeElement: null, createElement: t => new EL(t), getElementById: id => byId[id] || null, addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter(x => x !== f); }, listeners };
    return { doc, EL, byId, made };
}
// sound.js as far as these calls see it
const engine = () => ({ played: [], heard: [], list: [{ id: 's_shot', name: 'Gunshot' }, { id: 's_door', name: 'Creak' }], action(id, who) { this.played.push([id, who]); return { to: 1 }; }, cues() { return this.list; }, hear(id) { this.heard.push(id); return true; } });

(async () => {
    const C = await import(scriptUrl('soundoncore.js'));
    const J = o => j(o);
    /* ================= what a campaign keeps ================= */
    const P = JSON.parse('{"ev":{"k":"roll","r":"__proto__"},"snd":"s_a"}');
    check('a line as it is kept: what happens, a sound by its id, and the words each had, each kind of event by its own keys and nothing else',
        J(C.cleanLine({ ev: { k: 'roll', r: 'r_a', x: 1 }, snd: 's_a', n: ' Attack ', sn: 'Bang', y: 2 })) === J({ ev: { k: 'roll', r: 'r_a' }, snd: 's_a', n: 'Attack', sn: 'Bang' })
        && J(C.cleanEv({ k: 'list', f: 'f_g', i: 1, l: 'Fire', key: 'pistol', kn: 'Pistol', cat: 'Beam' })) === J({ k: 'list', f: 'f_g', i: 1, l: 'Fire', key: 'pistol', kn: 'Pistol' })
        && J(C.cleanEv({ k: 'list', f: 'f_g', i: 1, cat: 'Beam' })) === J({ k: 'list', f: 'f_g', i: 1, cat: 'Beam' })
        && J(C.cleanEv({ k: 'blast', map: 'm' })) === J({ k: 'blast' }) && J(C.cleanEv({ k: 'door', on: 'open', map: 'm', pc: 'p' })) === J({ k: 'door', on: 'open', map: 'm', pc: 'p' })
        && J(C.cleanEv({ k: 'door', on: 'ajar' })) === J({ k: 'door' }) && J(C.cleanEv({ k: 'zone', map: 'm' })) === J({ k: 'zone' }));
    check('what is no line is none: no event, a kind the list lacks, a prototype\'s key for an id, a sound that is no id, a list roll with neither place nor label, a thing of any other type',
        [null, 1, 'x', [], {}, { ev: { k: 'roll' }, snd: 's' }, { ev: { k: 'nope' }, snd: 's' }, P, { ev: { k: 'roll', r: 'r' }, snd: '<b>' }, { ev: { k: 'roll', r: 'r' }, snd: 'constructor' }, { ev: { k: 'list', f: 'f' }, snd: 's' }, { ev: { k: 'list', f: 'f', i: -1 }, snd: 's' }, { ev: { k: 'list', f: 'f', i: 1.5 }, snd: 's' }, { ev: { k: 'roll', r: 'a\nb' }, snd: 's' }].every(x => C.cleanLine(x) === null)
        && J(C.cleanSoundOn('x')) === '[]' && J(C.cleanSoundOn({ a: 1 })) === '[]');
    const many = Array.from({ length: 300 }, (_, i) => ({ ev: { k: 'roll', r: 'r_' + i }, snd: 's' }));
    check('a list: one line an event, 200 at most, a gone line kept (nothing but its shape is judged here), a list roll known by its label and not its place',
        C.cleanSoundOn(many).length === 200 && C.LIMITS.lines === 200
        && C.cleanSoundOn([{ ev: { k: 'door' }, snd: 'a' }, { ev: { k: 'door' }, snd: 'b' }, { ev: { k: 'door', on: 'open' }, snd: 'c' }]).map(l => l.snd).join() === 'a,c'
        && C.cleanSoundOn([{ ev: { k: 'list', f: 'f', i: 1, l: 'Fire' }, snd: 'a' }, { ev: { k: 'list', f: 'f', i: 0, l: 'Fire' }, snd: 'b' }]).length === 1
        && C.cleanSoundOn([{ ev: { k: 'roll', r: 'r_gone' }, snd: 's_gone' }]).length === 1);
    const mg = C.mergeLines([{ ev: { k: 'door' }, snd: 'a' }, { ev: { k: 'blast' }, snd: 'b' }], [{ ev: { k: 'door' }, snd: 'z' }, { ev: { k: 'mine' }, snd: 'y' }, 'junk']);
    check('a file merged in: its line of the same event takes the file\'s sound, a new one is added, junk is none, nothing of the campaign is lost', J(mg.map(l => l.ev.k + ':' + l.snd)) === J(['door:z', 'blast:b', 'mine:y']) && C.mergeLines(undefined, undefined).length === 0);

    /* ================= which line plays ================= */
    const sys = { rolls: [{ id: 'r_a', label: 'Dodge', formula: '1d20' }, { id: 'r_b', label: 'Swing {Row.x}', formula: '1d20' }],
        fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [{ label: 'Fire', formula: '1d6' }, { label: 'Swing', formula: '1d6' }] } }, { id: 'f_e', kind: 'item-list', label: 'Empty', list: { rolls: [] } }, { id: 'f_n', kind: 'number', label: 'Str' }] };
    const li = (ev, snd) => ({ ev, snd });
    const L = [li({ k: 'list', f: 'f_g', i: 0, l: 'Fire' }, 'any'), li({ k: 'list', f: 'f_g', i: 0, l: 'Fire', cat: 'Beam' }, 'cat'), li({ k: 'list', f: 'f_g', i: 0, l: 'Fire', key: 'pistol' }, 'key')];
    const W = (w) => { const p = C.pick(L, w, sys); return p ? p.snd : ''; };
    check('the most particular line plays: an entry over its category over the roll, and one line never two; an entry\'s id reads as its key; another entry falls back; another roll has none',
        W({ k: 'list', f: 'f_g', i: 0, key: 'pistol', cat: 'Beam' }) === 'key' && W({ k: 'list', f: 'f_g', i: 0, id: 'pistol' }) === 'key' && W({ k: 'list', f: 'f_g', i: 0, key: 'rifle', cat: 'beam' }) === 'cat' && W({ k: 'list', f: 'f_g', i: 0, key: 'rifle', cat: 'Slug' }) === 'any' && W({ k: 'list', f: 'f_g', i: 1 }) === '' && W({ k: 'list', f: 'f_x', i: 0 }) === '');
    check('the order of the list decides nothing: the most particular line plays wherever it stands', C.pick(L.slice().reverse(), { k: 'list', f: 'f_g', i: 0, key: 'pistol', cat: 'Beam' }, sys).snd === 'key' && C.pick(L.slice().reverse(), { k: 'list', f: 'f_g', i: 0, cat: 'Beam' }, sys).snd === 'cat');
    const moved = { fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [{ label: 'Reload' }, { label: 'Fire' }] } }] }, renamed = { fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [{ label: 'Shoot' }] } }] }, none = { fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [] } }] };
    check('a list\'s roll is followed when the list is edited: by its label to its new place, by its place where it was renamed, gone where neither stands', C.linePlace(moved, { f: 'f_g', i: 0, l: 'Fire' }) === 1 && C.linePlace(renamed, { f: 'f_g', i: 0, l: 'Fire' }) === 0 && C.linePlace(none, { f: 'f_g', i: 0, l: 'Fire' }) === -1 && C.linePlace(sys, { f: 'f_x', i: 0 }) === -1);
    const M = [li({ k: 'blast' }, 'b'), li({ k: 'door' }, 'd'), li({ k: 'door', on: 'open' }, 'do'), li({ k: 'door', map: 'm', pc: 'p' }, 'one'), li({ k: 'door', on: 'open', map: 'm', pc: 'p' }, 'oneopen'), li({ k: 'zone' }, 'z'), li({ k: 'zone', map: 'm', pc: 'q' }, 'zq')];
    const WM = w => { const p = C.pick(M, w, sys); return p ? p.snd : ''; };
    check('on the map: a mine with no line of its own plays the blast\'s and one with a line its own; one door over every door, an opening over either, a door of another map no match; one zone over any',
        WM({ k: 'blast' }) === 'b' && WM({ k: 'mine' }) === 'b' && C.pick(M.concat([li({ k: 'mine' }, 'm')]), { k: 'mine' }, sys).snd === 'm' && C.pick([li({ k: 'mine' }, 'm')], { k: 'blast' }, sys) === null
        && WM({ k: 'door', on: 'open', map: 'm', pc: 'p' }) === 'oneopen' && WM({ k: 'door', on: 'close', map: 'm', pc: 'p' }) === 'one' && WM({ k: 'door', on: 'open', map: 'x', pc: 'p' }) === 'do' && WM({ k: 'door', on: 'close', map: 'x', pc: 'p' }) === 'd'
        && WM({ k: 'zone', map: 'm', pc: 'q' }) === 'zq' && WM({ k: 'zone', map: 'm', pc: 'r' }) === 'z');

    /* ================= what a press was ================= */
    const S = await import(scriptUrl('systemcore.js'));
    const SS = { rowIdOf: r => r.id, rowDef: (s, r) => ({ def: r.def || { key: 'lib_' + r.defId, category: 'Beam' } }), rollPlace: S.rollPlace };
    const ch = { id: 'c', values: { f_g: [{ id: 'w_1', defId: 'i_pistol' }, { id: 'w_2', def: { name: 'Own', category: 'Slug' } }] } };
    check('a press from the button\'s own word: a system roll by its id, a list\'s roll by its place on the row, with the row\'s entry and category; the word wins over nothing else being named',
        J(C.pressOf(sys, { src: { r: 'r_a' } }, ch, SS)) === J({ k: 'roll', r: 'r_a' }) && J(C.pressOf(sys, { src: { l: 'f_g', row: 'w_1', i: 0 } }, ch, SS)) === J({ k: 'list', f: 'f_g', i: 0, id: 'i_pistol', key: 'lib_i_pistol', cat: 'Beam' })
        && J(C.pressOf(sys, { src: { l: 'f_g', row: 'w_2', i: 1 } }, ch, SS)) === J({ k: 'list', f: 'f_g', i: 1, cat: 'Slug' }));
    check('a press that names itself as a roll with consequences does, and an entry nobody holds by its key; a press naming nothing is nothing; what the system does not hold is nothing',
        J(C.pressOf(sys, { act: 'r_b' }, ch, SS)) === J({ k: 'roll', r: 'r_b' }) && J(C.pressOf(sys, { row: { f: 'f_g', r: 'w_1', i: 1 } }, ch, SS)) === J({ k: 'list', f: 'f_g', i: 1, id: 'i_pistol', key: 'lib_i_pistol', cat: 'Beam' })
        && J(C.pressOf(sys, { row: { f: 'f_g', k: 'i_x', i: 0 } }, ch, SS)) === J({ k: 'list', f: 'f_g', i: 0, id: 'i_x', key: 'lib_i_x', cat: 'Beam' })
        && C.pressOf(sys, {}, ch, SS) === null && C.pressOf(sys, { row: { f: 'f_g', r: 'w_1' } }, ch, SS) === null && C.pressOf(sys, { act: 'r_no' }, ch, SS) === null && C.pressOf(sys, { row: { f: 'f_g', r: 'w_1', i: 9 } }, ch, SS) === null && C.pressOf(sys, { row: { f: 'f_n', r: 'w_1', i: 0 } }, ch, SS) === null && C.pressOf(null, { act: 'r_a' }, ch, SS) === null);
    const gmSys = { rolls: [{ id: 'r_gm', label: 'Secret', formula: '1d6' }, { id: 'r_a', label: 'Dodge', formula: '1d20' }], fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [{ label: 'Hidden', formula: '1d4', gm: true }, { label: 'Fire', formula: '1d6' }] } }] };
    const view = { rolls: [{ id: 'r_a', label: 'Dodge', formula: '1d20' }], fields: [{ id: 'f_g', kind: 'item-list', label: 'Gear', list: { rolls: [{ label: 'Fire', formula: '1d6' }] } }] };
    check('a player\'s press is judged in their own view and read on the GM\'s list: a roll their view does not hold is no press of theirs, and a list\'s roll is found at its place on the GM\'s list',
        J(C.pressOf(gmSys, { src: { l: 'f_g', row: 'w_1', i: 0 } }, ch, SS, view)) === J({ k: 'list', f: 'f_g', i: 1, id: 'i_pistol', key: 'lib_i_pistol', cat: 'Beam' }) && C.pressOf(gmSys, { src: { r: 'r_gm' } }, ch, SS, view) === null && C.pressOf(gmSys, { src: { l: 'f_g', row: 'w_1', i: 1 } }, ch, SS, view) === null && J(C.pressOf(gmSys, { src: { r: 'r_a' } }, ch, SS, view)) === J({ k: 'roll', r: 'r_a' }));
    const zmap = { whiteboard: [{ id: 'z1', type: 'trigger', x: 0, y: 0, w: 200, h: 200 }, { id: 'mine', type: 'trigger', x: 300, y: 0, w: 100, h: 100, mine: {}, hidden: true }, { id: 'hid', type: 'trigger', x: 500, y: 0, w: 100, h: 100, hidden: true }] };
    const tk = x => ({ id: 't', x, y: 20, w: 60, h: 60 });
    check('the zone a move carried a token into, by the test the zone\'s message goes by: none where it stood in it already, a hidden zone and a mine no zone',
        (C.zoneOf(zmap, tk(20), { x: 900, y: 0 }) || {}).id === 'z1' && (C.zoneOf(zmap, tk(20), null) || {}).id === 'z1' && C.zoneOf(zmap, tk(20), { x: 40, y: 20 }) === null && C.zoneOf(zmap, tk(320), null) === null && C.zoneOf(zmap, tk(520), null) === null && C.zoneOf(zmap, tk(800), null) === null && C.zoneOf(null, tk(0)) === null);
    const camp = { items: { m: { meta: { title: 'Cellar' }, whiteboard: [{ id: 'p', name: 'Vault door' }, { id: 'q' }] } } };
    check('its words: a roll by its own words with no captions, a list\'s with its kind, a named door and zone by name and map, each kind in a plain sentence',
        C.whatWords({ k: 'roll', r: 'r_b' }, sys).text === 'Swing' && C.whatWords({ k: 'list', f: 'f_g', i: 0, l: 'Fire' }, sys).text === 'Gear: Fire' && C.whatWords({ k: 'list', f: 'f_g', i: 0, l: 'Fire', cat: 'Beam' }, sys).text === 'Gear: Fire for Beam' && C.whatWords({ k: 'list', f: 'f_g', i: 0, l: 'Fire', key: 'k', kn: 'Pistol' }, sys).text === 'Gear: Fire for Pistol'
        && C.whatWords({ k: 'door', map: 'm', pc: 'p' }, sys, camp).text === 'Vault door on Cellar opens or closes' && C.whatWords({ k: 'door', on: 'close', map: 'm', pc: 'q' }, sys, camp).text === 'The door on Cellar closes' && C.whatWords({ k: 'zone', map: 'm', pc: 'q' }, sys, camp).text === 'The trigger zone on Cellar is entered' && C.whatWords({ k: 'blast' }).text === 'A blast goes off' && C.whatWords({ k: 'mine' }).text === 'A mine goes off');
    const gone = [C.whatWords({ k: 'roll', r: 'r_no' }, sys, null, 'Old roll'), C.whatWords({ k: 'list', f: 'f_no', i: 0 }, sys, null, 'Old list'), C.whatWords({ k: 'list', f: 'f_e', i: 3, l: 'X' }, sys, null, 'Old row'), C.whatWords({ k: 'door', map: 'm', pc: 'x' }, sys, camp, 'Old door'), C.whatWords({ k: 'zone', map: 'x', pc: 'x' }, sys, camp, 'Old zone')];
    check('what is gone says so, in the words the line had: a roll, a list, a list\'s roll, a door, a zone', gone.every(g => !!g.gone) && gone.map(g => g.text).join() === 'Old roll,Old list,Old row,Old door,Old zone' && gone.every(g => !/[()[\];]/.test(g.gone)), gone);
    const ch1 = C.choices(sys);
    check('the form\'s choices: what happens on the map, then the system\'s rolls and actions, then each list that has rolls, by name, each an event that cleans', ch1.map(g => g.name).join() === 'On the map,Rolls and actions,Gear' && ch1[0].rows.length === 6 && ch1.every(g => g.rows.every(r => C.cleanEv(r.ev))) && ch1[2].rows.map(r => r.words).join() === 'Fire,Swing' && J(C.choices({}).map(g => g.name)) === J(['On the map']));

    /* ================= fire ================= */
    const soundonJs = readU('scripts/soundon.js');
    const mkFire = (o) => {
        o = o || {};
        const logs = [], snd = engine(), cmp = Object.assign({ system: sys, items: { m: { id: 'm', whiteboard: [] } }, soundOn: [{ ev: { k: 'roll', r: 'r_a' }, snd: 's_shot' }, { ev: { k: 'door' }, snd: 's_door' }, { ev: { k: 'zone' }, snd: 's_door' }] }, o.camp || {});
        const win = Object.assign({ wpSound: snd, wpCanPersistLocal: () => o.write !== false, wpNet: o.net || { active: true, role: 'host' }, wpStepLog: (a, s, f) => logs.push([a, s, f]) }, o.win || {});
        const fns = new Function('window', 'C', 'getActiveCampaign', 'getActiveMap', 'log', slice(soundonJs, 'soundoncheck:fire') + '\nreturn { fire, door, zoneDrop, on, mine };')(win, C, () => cmp, () => cmp.items.m, (s, f) => logs.push(['soundon v1', s, f]));
        return { fns, snd, logs, cmp };
    };
    const f1 = mkFire(), hit = f1.fns.fire({ k: 'roll', r: 'r_a' }, { map: 'm', secret: true }), miss = f1.fns.fire({ k: 'roll', r: 'r_b' }, { map: 'm' });
    check('fire: a line that fits is played by the Sound engine with whom it may reach handed on whole, and one that does not fit plays nothing', hit === true && miss === false && f1.snd.played.length === 1 && f1.snd.played[0][0] === 's_shot' && f1.snd.played[0][1].secret === true);
    const quiet = [{ net: { active: true, role: 'client' } }, { net: { active: false, foreign: true } }, { net: { active: true, role: 'host', stream: true } }, { win: { wpStream: true } }, { write: false }, { camp: { soundOn: [] } }, { camp: { soundOn: undefined } }].map(o => { const h = mkFire(o); return [h.fns.fire({ k: 'roll', r: 'r_a' }, { map: 'm' }), h.snd.played.length]; });
    check('fire runs on the machine that owns the campaign alone: never at someone else\'s table, its link up or down, never the stream window, and a campaign with no line asks nothing', quiet.every(q => q[0] === false && q[1] === 0), quiet);
    const f2 = mkFire({ win: { wpSound: { action() { throw new Error('boom'); } } } }), thr = f2.fns.fire({ k: 'roll', r: 'r_a' }, { map: 'm' });
    check('a Sound engine that throws never reaches what called it: a roll goes on, and the failure is logged in structure alone', thr === false && j(f2.logs[0]) === j(['soundon v1', 'failed', { kind: 'roll' }]));
    const f3 = mkFire(); f3.fns.fire({ k: 'roll', r: 'r_a' }, { map: 'm', ch: { name: 'Kael' } });
    check('a played sound logs its step in structure alone: the kind, how many it went to, whether it was secret, never a name', f3.logs.length === 1 && j(f3.logs[0]) === j(['soundon v1', 'played', { kind: 'roll', to: 1, secret: false }]), f3.logs);
    const f4 = mkFire(), dOpen = { id: 'd1', doorOpen: true, x: 10, y: 20, w: 30, h: 40 }; f4.fns.door(f4.cmp.items.m, dOpen, false, 'u_a'); f4.fns.door(f4.cmp.items.m, { id: 'd2', hidden: true }, false); f4.fns.door(null, { id: 'd3' }, true);
    const pl = f4.snd.played.map(p => p[1]);
    check('a door: its place, the player who moved it, a hidden door and a secret door the GM\'s alone', pl.length === 3 && j(pl[0]) === j({ map: 'm', secret: false, at: { x: 25, y: 40 }, by: 'u_a' }) && pl[1].secret === true && pl[2].secret === true && pl[2].map === 'm', pl);
    const f5 = mkFire(); f5.cmp.items.m.whiteboard = [{ id: 'z', type: 'trigger', x: 0, y: 0, w: 200, h: 200 }];
    const zo = f5.fns.zoneDrop(f5.cmp.items.m, { id: 't1', x: 10, y: 10, w: 60, h: 60 }, { x: 900, y: 0 }), zs = f5.fns.zoneDrop(f5.cmp.items.m, { id: 't1', x: 10, y: 10, w: 60, h: 60 }, { x: 20, y: 20 }), zh = f5.fns.zoneDrop(f5.cmp.items.m, { id: 't2', hidden: true, x: 10, y: 10, w: 60, h: 60 }, null);
    check('a zone: the token that entered is whom a player must see, a hidden token the GM\'s alone, and a move inside the zone plays nothing', zo === true && zs === false && zh === true && j(f5.snd.played[0][1]) === j({ map: 'm', tok: 't1', secret: false }) && f5.snd.played[1][1].secret === true && f5.snd.played.length === 2);

    /* ================= the list ================= */
    const mkList = (o) => {
        o = o || {};
        const pg = mkPage(), toasts = [], logs = [], saves = [], snd = engine(), body = new pg.EL('div'), foot = new pg.EL('div'); foot.className = 'snd-foot'; body.appendChild(foot); pg.byId.soundBody = body;
        const cmp = Object.assign({ system: sys, items: camp.items, chars: { c: { values: { f_g: [{ id: 'w_1', def: { name: 'Pistol', key: 'pistol', category: 'Beam' } }] } } } }, o.camp || {});
        const win = { wpSound: snd, wpCanPersistLocal: () => true, wpNet: { active: true, role: 'host' }, wpSystemCore: { rowDef: (s, r) => (r.def ? { def: r.def } : null) }, innerWidth: 800, innerHeight: 600 };
        const fns = new Function('window', 'document', 'C', 'getActiveCampaign', 'getActiveMap', 'save', 'toast', 'log', 'ui', 'el', "'use strict';\n" + slice(soundonJs, 'soundoncheck:fire') + slice(soundonJs, 'soundoncheck:list') + slice(soundonJs, 'soundoncheck:ask') + '\nreturn { draw, fill, setLine, ask, btn, popClose, popKey };')(
            win, pg.doc, C, () => cmp, () => cmp.items.m, q => saves.push(q), t => toasts.push(t), (s, f) => logs.push([s, f]), id => pg.byId[id] || null,
            (tag, cls, text) => { const e = pg.doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; });
        pg.byId.soundOnBox = null;
        const realDraw = fns.draw;
        return { pg, fns, cmp, body, toasts, logs, saves, snd, win, draw: () => { const r = realDraw(body); pg.byId.soundOnBox = body.byClass('snd-on')[0]; fns.fill(); return r; } };
    };
    const l1 = mkList({ camp: { soundOn: [{ ev: { k: 'roll', r: 'r_a' }, snd: 's_shot' }, { ev: { k: 'roll', r: 'r_gone' }, snd: 's_shot', n: 'Old roll' }, { ev: { k: 'door' }, snd: 's_lost', sn: 'Old bang' }] } }); l1.draw();
    const rows = l1.body.byClass('snd-on-row'), box = l1.body.byClass('snd-on')[0];
    check('the list stands above the panel\'s foot: a line each, its event, a list of sounds, a play button and a remove button, then + Add a sound on an action', l1.body.children[0] === box && l1.body.children[1].className === 'snd-foot' && rows.length === 3 && rows[0].byClass('snd-on-name')[0].textContent === 'Dodge' && rows[0].byClass('snd-on-snd').length === 1 && rows[0].byClass('wi-play').length === 1 && rows[0].byClass('wi-close').length === 1 && box.byClass('snd-on-add')[0].textContent === '+ Add a sound on an action');
    check('a line whose roll or sound has gone stays in the list and says so, in the words it had, and can be taken away', /Old roll/.test(rows[1].textContent) && /gone from the system/.test(rows[1].textContent) && /gone from the library: Old bang/.test(rows[2].textContent) && rows[2].byClass('snd-on-snd')[0].opts()[0].textContent === 'Old bang (gone)' && rows[2].byClass('wi-play')[0].disabled === true);
    rows[1].byClass('wi-close')[0].fire('click');
    check('Remove takes that line alone away, saves and draws the list again', l1.cmp.soundOn.length === 2 && l1.cmp.soundOn.every(x => x.ev.r !== 'r_gone') && l1.saves.length === 1 && l1.body.byClass('snd-on-row').length === 2);
    const r2 = l1.body.byClass('snd-on-row')[0]; r2.byClass('wi-play')[0].fire('click');
    check('Play is this machine\'s alone: nothing is sent', j(l1.snd.heard) === j(['s_shot']) && l1.snd.played.length === 0);
    const sel = r2.byClass('snd-on-snd')[0]; sel.value = 's_door'; sel.fire('change');
    check('a line\'s list of sounds changes its sound and keeps its event', l1.cmp.soundOn[0].snd === 's_door' && l1.cmp.soundOn[0].sn === 'Creak' && l1.cmp.soundOn[0].ev.r === 'r_a');
    l1.body.byClass('snd-on-row').forEach(() => {}); l1.body.byClass('snd-on-row')[0].byClass('wi-close')[0].fire('click'); l1.body.byClass('snd-on-row')[0].byClass('wi-close')[0].fire('click');
    check('the last line away leaves no key on the campaign', !('soundOn' in l1.cmp));
    const l2 = mkList(); l2.draw(); l2.body.byClass('snd-on-add')[0].fire('click');
    let form = l2.body.byClass('snd-on-form')[0], whatSel = form.byClass('snd-on-what-sel')[0], og = whatSel.children.map(c => c.label);
    check('+ Add opens the form: what happens in groups, then a sound, then Add and Cancel', j(og) === j(['On the map', 'Rolls and actions', 'Gear']) && form.byClass('snd-on-snd').length === 1 && form.byClass('snd-on-go').length === 1 && form.byClass('snd-on-no').length === 1);
    const pickOpt = t => whatSel.opts().filter(o => o.textContent === t)[0];
    whatSel.value = pickOpt('Fire').value; whatSel.fire('change');
    form = l2.body.byClass('snd-on-form')[0];
    const whichS = form.byClass('snd-on-which')[0], opWords = whichS.opts().map(o => o.textContent);
    check('a list\'s roll offers every row, the list\'s categories and the entries the campaign\'s characters carry', opWords.join('|') === 'Any row|Category: Beam|Pistol', opWords);
    whichS.value = 'k:pistol'; whichS.fire('change'); form = l2.body.byClass('snd-on-form')[0]; form.byClass('snd-on-go')[0].fire('click');
    check('Add makes the line, narrowed to that entry, with the words it had, and the form goes', j(l2.cmp.soundOn) === j([{ ev: { k: 'list', f: 'f_g', i: 0, l: 'Fire', key: 'pistol', kn: 'Pistol' }, snd: 's_shot', n: 'Gear: Fire for Pistol', sn: 'Gunshot' }]) && l2.body.byClass('snd-on-form').length === 0 && l2.logs.some(x => x[0] === 'added'), l2.cmp.soundOn);
    const w2 = l2.body.byClass('snd-on-row')[0].byClass('snd-on-which')[0]; w2.value = 'c:Beam'; w2.fire('change');
    check('a line of a list changes its kind in place', l2.cmp.soundOn[0].ev.cat === 'Beam' && !l2.cmp.soundOn[0].ev.key && l2.cmp.soundOn[0].n === 'Gear: Fire for Beam', l2.cmp.soundOn);
    const lfull = mkList({ camp: { soundOn: many.map(x => Object.assign({}, x, { snd: 's_shot' })) } }); const refused = lfull.fns.setLine(lfull.cmp, { k: 'blast' }, 's_shot');
    check('a full list refuses in words and loses nothing', refused === false && lfull.cmp.soundOn.length === 300 && lfull.toasts.length === 1 && !/[()[\];]/.test(lfull.toasts[0]));
    const lfc = mkList(); lfc.draw(); lfc.body.byClass('snd-on-add')[0].fire('click'); const wf0 = lfc.body.byClass('snd-on-what-sel')[0]; wf0.focus(); wf0.value = '2'; wf0.fire('change'); const wf1 = lfc.body.byClass('snd-on-what-sel')[0], doF = wf1.ownerDoc || null;
    check('a list stepped by its arrow keys keeps the focus though the form is drawn again (found by hand: the next keys went to the map)', wf1 !== wf0 && lfc.pg.doc.activeElement === wf1, String(doF));
    const lnc = mkList(); lnc.snd.list = []; lnc.draw(); lnc.body.byClass('snd-on-add')[0].fire('click');
    check('with no cues the form says so and Add is off', lnc.body.byClass('snd-on-go')[0].disabled === true && /No cues yet/.test(lnc.body.textContent));

    /* ================= the small button ================= */
    const a1 = mkList(); const b1 = a1.fns.btn({ k: 'roll', r: 'r_a' }, 'A sound on this roll');
    check('the small button wears the speaker, says what it does, and is lit where a line stands', /wib wi-sound/.test(b1.className) && b1.title === 'A sound on this roll' && b1.attrs['aria-label'] === 'A sound on this roll' && b1.className.indexOf(' on') < 0);
    b1.fire('click');
    let pop = a1.pg.doc.body.byClass('snd-on-pop')[0];
    check('its pop names the event and lists the cues by name, with No sound first', !!pop && pop.byClass('snd-on-pophead')[0].textContent === 'Dodge' && pop.byClass('snd-on-poprow').map(b => b.textContent).join() === 'No sound,Gunshot,Creak' && a1.pg.doc.activeElement === pop.byClass('snd-on-poprow')[0]);
    pop.byClass('snd-on-poprow')[1].fire('click');
    check('a press sets that same list, one line, and the pop goes', j(a1.cmp.soundOn) === j([{ ev: { k: 'roll', r: 'r_a' }, snd: 's_shot', n: 'Dodge', sn: 'Gunshot' }]) && a1.pg.doc.body.byClass('snd-on-pop').length === 0 && a1.saves.length === 1);
    const b2 = a1.fns.btn({ k: 'roll', r: 'r_a' }, 'x'); b2.fire('click'); pop = a1.pg.doc.body.byClass('snd-on-pop')[0];
    check('pressed again it marks the sound in use and the button is lit', /\bon\b/.test(b2.className) && pop.byClass('on').length === 1 && pop.byClass('on')[0].textContent === 'Gunshot' && a1.pg.doc.activeElement === pop.byClass('on')[0]);
    const kp = []; a1.fns.popKey({ key: 'Escape', preventDefault() { kp.push('p'); }, stopPropagation() { kp.push('s'); } });
    check('Esc puts the pop away, goes no further and gives the focus back to its button', a1.pg.doc.body.byClass('snd-on-pop').length === 0 && kp.join() === 'p,s' && a1.pg.doc.activeElement === b2 && (a1.pg.doc.listeners.keydown || []).length === 0);
    b2.fire('click'); a1.pg.doc.body.byClass('snd-on-pop')[0].byClass('snd-on-poprow')[0].fire('click');
    check('No sound takes the line away', !('soundOn' in a1.cmp));
    const a2 = mkList(); a2.win.wpNet = { active: true, role: 'client' }; const nb = a2.fns.btn({ k: 'roll', r: 'r_a' }, 'x'); a2.fns.ask(new a2.pg.EL('button'), { k: 'roll', r: 'r_a' });
    check('no button and no pop at someone else\'s table', nb === null && a2.pg.doc.body.byClass('snd-on-pop').length === 0 && a2.toasts.length === 1);

    const insJs = readU('scripts/inspector.js'), rowFns = w2o => new Function('window', 'getActiveMap', slice(insJs, 'soundoncheck:row') + '\nreturn { soundOnRow, soundOnEv };')(w2o, () => ({ id: 'm' }));
    const rw = rowFns({ wpSoundOn: {} }), rowsOf = [rw.soundOnRow({ type: 'rect' }), rw.soundOnRow({ type: 'trigger' }), rw.soundOnRow({ type: 'trigger', mine: {} })];
    check('Properties\' button on a door, a zone and a mine: fixed words with the speaker, naming that door or zone on its map, and nothing with the module not there',
        /A sound on this door/.test(rowsOf[0]) && /A sound on this zone/.test(rowsOf[1]) && /A sound on a mine/.test(rowsOf[2]) && rowsOf.every(h => h.includes('wib wi-sound') && h.includes('id="wbSoundOnBtn"'))
        && j(rw.soundOnEv({ id: 'd', type: 'rect' })) === j({ k: 'door', map: 'm', pc: 'd' }) && j(rw.soundOnEv({ id: 'z', type: 'trigger' })) === j({ k: 'zone', map: 'm', pc: 'z' }) && j(rw.soundOnEv({ id: 'z', type: 'trigger', mine: {} })) === j({ k: 'mine' }) && rowFns({}).soundOnRow({ type: 'rect' }) === '');

    /* ================= the press, from the button ================= */
    const sheets = readU('scripts/sheets.js'), a0 = sheets.indexOf('function sheetRoll(e, charId, expr, label, opts, swRef) {'), b0 = sheets.indexOf('// 1.6.0 An attack on a line: the words for the aim of a roll with an area', a0);
    const sr = (ref, opts) => { const got = []; const fn = new Function('window', 'pressOf', sheets.slice(a0, b0) + '\nreturn sheetRoll;')({ wpDice: { rollFor: (c, x, l, o) => got.push(o), rollWithMod: (c, x, l, o) => got.push(o) } }, e => e); fn({ currentTarget: {} }, 'c', '1d20', 'L', opts, ref); return got[0]; };
    check('every roll button says which it is (sheets.js sheetRoll, run for real), whatever else it names: a plain roll keeps its formula alone for the rules, with no act and no index, and a field\'s own roll says nothing here',
        j(sr({ r: 'r_a' }, undefined)) === j({ src: { r: 'r_a' } }) && j(sr({ l: 'f_g', row: 'w_1', i: 0 }, { row: { f: 'f_g', r: 'w_1' } })) === j({ row: { f: 'f_g', r: 'w_1' }, src: { l: 'f_g', row: 'w_1', i: 0 } }) && sr({ f: 'f_s' }, undefined) === undefined && sr(undefined, undefined) === undefined);
    const D = await import(scriptUrl('dicecore.js')), req = o => D.cleanRollReq(Object.assign({ rid: 'q1', expr: '1d20', charId: 'c_1' }, o));
    check('the host\'s cleaner keeps it only as that word, and one that does not read is left out with the roll going on: no key of it is a rule, so a plain press stays unnamed',
        j(req({ src: { r: 'r_a' } })) === j({ rid: 'q1', expr: '1d20', charId: 'c_1', src: { r: 'r_a' } }) && j(req({ src: { l: 'f_g', row: 'w_1', i: 2 } }).src) === j({ l: 'f_g', row: 'w_1', i: 2 })
        && ['x', 1, [], { r: '<b>' }, { l: 'f', row: 'nope', i: 0 }, { l: 'f', row: 'w_1', i: 999 }, { l: '__proto__ x', row: 'w_1', i: 0 }].every(s => { const q = req({ src: s }); return !!q && q.src === undefined; }) && req({ src: { r: 'r_a' } }).act === undefined && D.cleanRollReq({ rid: 'q1', expr: '1d20', src: { r: 'r_a' } }).src === undefined);

    /* ================= the wiring and the words ================= */
    const ix = readU('index.html'), css = readU('style.css'), snd = readU('scripts/sound.js'), net = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1').replace(/\r\n/g, NL), wb = readU('scripts/whiteboard.js'), fog = readU('scripts/fog.js'), ins = readU('scripts/inspector.js'), dm = readU('scripts/datamap.js'), io = readU('scripts/io.js'), mn = readU('scripts/main.js'), cl = readU('scripts/cleanup.js'), esc = readU('scripts/esckey.js'), sh = readU('scripts/sharecore.js');
    const dj = readU('scripts/dice.js');
    check('the button\'s word goes the whole way: dice.js hands it on from rollFor and from its roll, and a player\'s app puts it on the request, beside a character only', (dj.match(/src: opts\.src \|\| undefined,/g) || []).length === 2 && net.includes('if (o.src && o.charId) req.src = o.src;'));
    check('the page loads the core and the module, and the Sound panel draws the list', ix.includes('src="scripts/soundoncore.js"') && ix.includes('src="scripts/soundon.js"') && snd.includes("if (window.wpSoundOn) window.wpSoundOn.draw(ui('soundBody'));") && soundonJs.includes('window.wpSoundOn = {'));
    check('the Sound engine plays it here and hands the cue to net.js, which sends it to those it lets hear, by the very message the panel sends', /function actionCue\(id, who\) \{\n    if \(!featureOn\(\)\) return false;/.test(snd) && snd.includes("n.soundCueFor({ act: 'cue', id: e.id, gain: effGainHost(e) }, who)") && /net\.soundCueFor = function\(cue, who\)/.test(net) && !/type: 'sound-on'|type: 'soundon'/.test(net));
    check('the host tells it of every roll and action, both ways, and of a door and a zone: a player\'s and the GM\'s own',
        /net\.soundAfter\(campQ, \{ src: q\.src, act: q\.act, row: q\.row, view: viewQ \}, chQ, locQ, !!recQ\.priv\)/.test(net) && /net\.soundAfter\(campR, \{ src: o\.src, act: o\.act, row: o\.row \}, chR, '', !!rec\.priv \|\| !!rec\.to\)/.test(net) && /net\.soundAfter\(campA, \{ act: qa\.act, row: qa\.row, view: viewA \}, chA, locA, scSo === 'gm', scSo === 'owner' \? profA\.id : undefined\)/.test(net)
        && sheets.includes("n.soundAfter(camp, row ? { row: row } : { act: r.id }, c, '', scope === 'gm', scope === 'owner' ? c.ownerId : undefined)") && net.includes('window.wpSoundOn.door(amDR, doorEl, false, profDR.id)') && net.includes('window.wpSoundOn.zoneDrop(map, w, frW)') && dm.includes('window.wpSoundOn.zoneDrop(am, item,'));
    check('every way a door moves says so, with whether it was a secret door until now', fog.includes('var wasS = !!(typeof C.secretOn') && fog.includes('window.wpSoundOn.door(map, w, wasS)') && ins.includes('window.wpSoundOn.door(null, w, wasSd)') && wb.includes("window.wpSoundOn.door(null, w, !!(window.wpFogCore && typeof window.wpFogCore.secretOn === 'function' && window.wpFogCore.secretOn(w)))"));
    check('a blast says so as it goes off, a fuse\'s when it does, and a mine as a mine', wb.includes("window.wpSoundOn.fire({ k: opts.mine === true ? 'mine' : 'blast' }, { map: map.id })") && wb.includes("if (window.wpSoundOn) window.wpSoundOn.fire({ k: 'blast' }, { map: mapId }); resolveThrow(f.b, f.opts, f.n, map);") && (wb.match(/goOff: true, mine: true,/g) || []).length === 2 && /window\.wpSoundOn\.fire\(\{ k: 'blast' \}, \{ map: map\.id \}\);   \/\/ 1\.6\.2/.test(wb));
    check('the small buttons stand where the things are: a roll, a list\'s roll, a door, a zone, the Radius tool', sheets.includes("window.wpSoundOn.btn({ k: 'roll', r: r.id }") && sheets.includes("window.wpSoundOn.btn({ k: 'list', f: f.id, i: ri, l: window.wpSoundOnCore.labelOf(rr) }") && ins.includes('id="wbSoundOnBtn"') && /id="blastSoundBtn"/.test(ix) && soundonJs.includes("ui('blastSoundBtn')"));
    check('nothing of the list leaves the host, and it is cleaned on every way in', /delete camp\.soundOn;/.test(net) && io.includes("import './soundoncore.js';") && io.includes('window.wpSoundOnCore.cleanSoundOn(c.soundOn)') && mn.includes('window.wpSoundOnCore.mergeLines(existing.soundOn, ic.soundOn)') && /'sounds', 'soundOn', 'library'\]/.test(cl) && sh.includes('delete c.soundOn;'));
    check('Escape closes the pop by its own listener, and its look is the app\'s own', esc.includes('.snd-on-pop,') && /\.snd-on-pop \{ position: fixed;/.test(css) && /\.snd-on-sel \{/.test(css) && /\.snd-on-btn\.on \{/.test(css));
    const help = ix.slice(ix.indexOf('<b>On actions</b> ties a cue'), ix.indexOf('</ul>', ix.indexOf('<b>On actions</b> ties a cue')));
    check('Help says what it does, where it is set and who hears it', help.includes('+ Add a sound on an action') && help.includes('Those on the map where it happens hear it, and you always do.') && help.includes('A private roll, a hidden token and a secret door play for you alone.') && help.includes('A line whose roll or sound has gone stays and says so.'), help.slice(0, 200));
    const nA = readRoot('WHATSNEW.txt'), nB = readU('assets/whatsnew.txt');
    check('both release notes say it, under a heading of its own after At the table in 1.6.2', [nA, nB].every(n => { const v = n.slice(0, n.indexOf('WAYPOINT 1.6.1')); return v.indexOf('At the table') >= 0 && v.indexOf('Sounds on actions') > v.indexOf('At the table') && v.includes('A hidden act stays silent for players.'); }));
    check('the integration guide names the key', readRoot('CAMPAIGN_INTEGRATION.md').includes('"soundOn": [{ "ev":'));
    const ci = readRoot('.github/workflows/checks.yml');
    check('the CI step is there', ci.includes('run: node tools/soundoncheck.js'));

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed');
    if (fail) process.exitCode = 1;
})().catch(e => { summed = true; console.log('FAIL      ' + (e && e.stack || e)); process.exitCode = 1; });
