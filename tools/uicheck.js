// The app's own controls (1.6.2; the owner, 2026-11-13: "lets make good styling a part of the design so we dont have to keep going back and
// correcting things please", and "any slider, or increment control should allow the typing of values"): uiparts.js imported and run on a
// page of plain objects (a counter's presses, its typed value held to its bounds, setValue, a figure written by its caller; a slider's typed
// value both ways, a time as m:ss), and every site that builds one pinned. Plain Node, no dependencies, exits 1 on any failure.
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? ' -> ' + detail : '')); } }
process.on('exit', () => { if (!summed) { console.log('FAIL      uicheck: an asynchronous check never finished'); process.exitCode = 1; } });
const app = path.join(__dirname, '..', 'system', 'app'), read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).split(String.fromCharCode(92)).join('/');
const J = JSON.stringify;
// A page of plain objects: elements with children, attributes, listeners, a class list and the focus
function page() {
    const doc = { activeElement: null };
    function mk(tag) {
        const e = { tagName: tag.toUpperCase(), children: [], attrs: {}, on: {}, style: {}, dataset: {}, value: '', disabled: false, readOnly: false, ownerDocument: doc, parentNode: null, className: '', textContent: '',
            classList: { contains: c => (' ' + e.className + ' ').includes(' ' + c + ' ') },
            appendChild(c) { c.parentNode = e; e.children.push(c); return c; },
            insertBefore(c, ref) { c.parentNode = e; const i = ref ? e.children.indexOf(ref) : -1; if (i < 0) e.children.push(c); else e.children.splice(i, 0, c); return c; },
            setAttribute(k, v) { e.attrs[k] = String(v); }, getAttribute(k) { return k in e.attrs ? e.attrs[k] : null },
            addEventListener(t, f) { (e.on[t] = e.on[t] || []).push(f); },
            fire(t, ev) { (e.on[t] || []).forEach(f => f(Object.assign({ type: t, target: e, preventDefault() {}, stopPropagation() {} }, ev || {}))); },
            dispatchEvent(ev) { e.fire(ev.type, ev); return true; }, closest() { return null; }, focus() { doc.activeElement = e; }, select() {} };
        return e;
    }
    doc.createElement = mk; return doc;
}
(async () => {
    global.Event = global.Event || function(t, o) { this.type = t; Object.assign(this, o || {}); };
    const U = await import(url('uiparts.js'));
    check('the pure rules: a value held to its bounds (none where it is no number), rounded to its places; a time as m:ss and back',
        U.clampTo(5, 0, 3) === 3 && U.clampTo(-2, 0, 3) === 0 && U.clampTo(2, null, null) === 2 && U.clampTo(NaN, 0, 3) === null && U.roundTo(1.256, 2) === 1.26 && U.roundTo(7.6, 0) === 8
        && U.fmtTime(83) === '1:23' && U.fmtTime(5) === '0:05' && U.fmtTime(-3) === '0:00' && U.readTime('1:23') === 83 && U.readTime('45') === 45 && U.readTime(' 2:05 ') === 125 && U.readTime('a:b') === null);
    const doc = page(), got = [];
    const w = U.step({ value: 3, min: 0, max: 5, label: 'How many', lessCls: 'x-less', moreCls: 'x-more', valCls: 'x-in', unit: '×', set: n => got.push(n) }, doc);
    const [mi, box, pl] = w.children, inp = box.children[0];
    check('a counter is one frame of three parts: −, a typed value with its unit, +, each saying what it does',
        w.className === 'ui-step' && w.attrs.role === 'group' && mi.textContent === '−' && pl.textContent === '+' && mi.className === 'x-less' && pl.className === 'x-more' && box.className === 'ui-val'
        && inp.type === 'number' && inp.className === 'x-in' && inp.value === '3' && inp.min === '0' && inp.max === '5' && box.children[1].textContent === '×' && mi.attrs['aria-label'] === 'One less' && w.input === inp && w.less === mi && w.more === pl);
    mi.fire('click'); pl.fire('click'); pl.fire('click'); pl.fire('click');
    check('its − and + step by one from where it stands and stop at its bounds, + going off at the top', J(got) === J([2, 3, 4, 5]) && pl.disabled === true && mi.disabled === false, J(got));
    got.length = 0; inp.value = '9'; inp.fire('change'); inp.value = 'x'; inp.fire('change'); inp.value = '1'; inp.fire('keydown', { key: 'Enter' }); inp.value = '1'; inp.fire('change');
    check('a typed value is held to its bounds and handed on once; one that is no number puts the figure back; Enter hands it on as a change does; the same value is not handed on again',
        J(got) === J([1]) && inp.value === '1', J([got, inp.value]));
    got.length = 0; w.setValue(4); const after = inp.value; mi.fire('click'); inp.value = '1'; pl.fire('click');
    check('setValue shows a figure that changed without the counter being made again, and the buttons step from it; a figure the caller wrote into the box counts too',
        after === '4' && J(got) === J([3, 2]) && mi.disabled === false, J([after, got]));
    const off = U.step({ value: 2, off: true }, page());
    check('a counter that may not be changed is read only, its buttons off', off.input.readOnly === true && off.less.disabled && off.more.disabled);
    const dec = []; const sp = U.step({ value: 1, min: 0.5, max: 2, step: 0.1, dec: 2, set: n => dec.push(n) }, page()); sp.more.fire('click'); sp.input.value = '1.234'; sp.input.fire('change');
    check('a counter of decimals steps by its own step and rounds to its places', J(dec) === J([1.1, 1.23]) && sp.input.step === '0.01', J(dec));
    // a slider: no browser here, so no value override; its box, its bounds and its events
    const d2 = page(), host = d2.createElement('div'), rg = d2.createElement('input'); rg.type = 'range'; rg.min = '10'; rg.max = '100'; rg.value = '50'; rg.closest = () => null; host.appendChild(rg);
    const evs = []; rg.addEventListener('input', () => evs.push('input:' + rg.value)); rg.addEventListener('change', () => evs.push('change'));
    const hid = d2.createElement('span'), vb = U.typed(rg, { unit: '%', hide: hid }), vin = vb.children[0];
    check('a slider standing on its own is put in a .ui-slide as wide as it stood, its typed value right after it with its unit, the figure shown before put away',
        host.children[0].className === 'ui-slide ui-slide-wide' && host.children[0].children[0] === rg && host.children[0].children[1] === vb && vin.value === '50' && vb.children[1].textContent === '%' && hid.style.display === 'none' && U.typed(rg) === vb);
    vin.value = '250'; vin.fire('change');
    check('a typed value is held to the slider\'s bounds and handed on as the slider\'s own input and change events', rg.value === '100' && J(evs) === J(['input:100', 'change']) && vin.value === '100', J([rg.value, evs]));
    const d3 = page(), h3 = d3.createElement('div'), sk = d3.createElement('input'); sk.min = '0'; sk.max = '300'; sk.value = '83'; sk.closest = () => null; h3.appendChild(sk);
    const tb = U.typed(sk, { fmt: U.fmtTime, parse: U.readTime }), tin = tb.children[0]; tin.value = '2:05'; tin.fire('change');
    check('a time is typed as m:ss in a text box', tin.type === 'text' && sk.value === '125' && tin.value === '2:05', J([sk.value, tin.value]));
    // every site
    const S = f => read('scripts/' + f), ix = read('index.html');
    const asks = s => (s.match(/window\.wpUi && window\.wpUi\.step \? window\.wpUi : null/g) || []).length;
    check('every counter of the app is built from it (the sweep of backlog 225): a container\'s count and its Take count, the dice roller\'s modifier, music speed, a sheet row\'s count, an effect\'s value, a part\'s count, a counter chip, a tracker; each asks window.wpUi first',
        asks(S('boxes.js')) === 2 && asks(S('dice.js')) === 1 && asks(S('music.js')) === 1 && asks(S('sheets.js')) === 4 && asks(S('trackers.js')) === 1
        && S('boxes.js').includes("lessCls: 'box-less', moreCls: 'box-more', valCls: 'box-qin'") && S('dice.js').includes('if (numEl.setValue) numEl.setValue(mod);') && S('music.js').includes("valCls: 'music-speed-val'")
        && S('sheets.js').includes("valCls: 'sheet-item-qtyin'") && S('sheets.js').includes("valCls: 'sheet-fx-valin'") && S('sheets.js').includes("valCls: 'sheet-part-in'") && S('sheets.js').includes("valCls: 'sheet-item-ctin'") && S('trackers.js').includes("stt.input.dataset.trkval = t.id;"));
    const ranges = ['drawOpacity', 'eraserSize', 'shapeOpacity', 'gridLabelsOpacity', 'setGridOpacity', 'setOpacity', 'setUndoDepth', 'soundVolume', 'videoVol', 'frameZoom'];
    check('every slider of the app takes a typed value: the page\'s ten marked data-typed with their units, music\'s two volumes and its place in a song, a person\'s voice volume, a sheet look\'s Dim; uiparts.js loads with io.js',
        ranges.every(id => new RegExp('id="' + id + '"[^>]*data-typed').test(ix)) && (S('music.js').match(/wpUi\.typed\(/g) || []).length === 3 && S('voice.js').includes("window.wpUi.typed(vol, { unit: '%' })") && S('sheets.js').includes("window.wpUi.typed(dim, { unit: '%', label: 'Dim in percent' })")
        && S('io.js').includes("import './uiparts.js';") && S('trackers.js').includes("document.activeElement.closest('#trkStrip .ui-val')"));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
