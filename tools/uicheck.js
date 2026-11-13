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
        && inp.type === 'text' && inp.className === 'x-in' && inp.value === '3' && inp.min === '0' && inp.max === '5' && inp.style.width === '3ch' && box.children[1].textContent === '×' && mi.attrs['aria-label'] === 'One less' && w.input === inp && w.less === mi && w.more === pl);
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
    // the review of the sweep: + read as a number, the arrow keys, a box found again, a change the caller did not make put back, a press landing first
    const plus = [], pd = page(), pc = U.step({ value: 0, min: -99, max: 99, set: n => plus.push(n) }, pd), pin = pc.input;
    pin.value = '+3'; pin.fire('change'); pin.fire('keydown', { key: 'ArrowUp' }); pin.fire('keydown', { key: 'ArrowDown' }); pin.fire('keydown', { key: 'ArrowDown' });
    check('the review of the sweep: a typed +3 reads as 3 (a counter that may go below 0 types as text), and the arrow keys step it',
        J(plus) === J([3, 4, 3, 2]) && pin.attrs.inputmode === 'text', J(plus));
    const dd = page(), ds = U.step({ value: 1, data: { fid: 'f_x', part: 'q-w_1' } }, dd);
    check('the review of the sweep: a counter carries what a view that draws itself again finds its box by', ds.input.dataset.fid === 'f_x' && ds.input.dataset.part === 'q-w_1');
    const tr = page(); let real = 5; const tc = U.step({ value: 5, min: 0, truth: () => real, set: () => {} }, tr); tc.isConnected = true;
    tc.less.fire('click'); const shown = tc.input.value; await new Promise(r => setTimeout(r, 500));
    check('the review of the sweep: a change the caller did not make (a price window cancelled) puts the true figure back, and the next press steps from it',
        shown === '4' && tc.input.value === '5', J([shown, tc.input.value]));
    const src = read('scripts/uiparts.js');
    check('the review of the sweep: a figure typed is handed on only once a press that took the focus from it has landed, so that press is never lost under a redraw; a press of the counter\'s own button hands it on first; a slider dragged meanwhile wins',
        src.includes("function later(fn) { if (_down) _queue.push(fn); else fn(); }") && src.includes("mi.addEventListener('click', function() { if (pend) pend(); go(base() - st); });") && src.includes("if (ev && ev.isTrusted) pendS = null;")
        && src.includes("box.addEventListener('click', function(ev) { if (ev.target !== inp) ev.preventDefault(); });"));
    const fr = read('scripts/framer.js'), shS = read('scripts/sheets.js'), cssS = read('style.css');
    check('the review of the sweep: the token creator\'s keys and paste stand aside for its typed zoom; each sheet counter is found again after a redraw and puts its true figure back; a wrapped slider takes its share of a row that wraps',
        fr.includes("if (e.target && e.target.closest && e.target.closest('.ui-val')) {") && fr.includes("if (e.type === 'paste' && e.target && e.target.closest && e.target.closest('.ui-val')) { e.stopPropagation(); return; }")
        && ["data: { fid: f.id, part: 'q-' + rowIdOf(entry) }", "data: { fid: f.id, part: 'v-' + r.id }", "data: { fid: pf.id, part: 'p-' + prid }", "data: { fid: f.id, part: 'c-' + rid + '-' + t.key }"].every(s => shS.includes(s))
        && cssS.includes('.ui-slide-wide { display: flex; flex: 1 1 auto; min-width: 0; box-sizing: border-box; }'));
    // a slider: no browser here, so no value override; its box, its bounds and its events
    const d2 = page(), host = d2.createElement('div'), rg = d2.createElement('input'); rg.type = 'range'; rg.min = '10'; rg.max = '100'; rg.value = '50'; rg.closest = () => null; host.appendChild(rg);
    const evs = []; rg.addEventListener('input', () => evs.push('input:' + rg.value)); rg.addEventListener('change', () => evs.push('change'));
    const hid = d2.createElement('span'), vb = U.typed(rg, { unit: '%', hide: hid }), vin = vb.children[0];
    check('a slider standing on its own is put in a .ui-slide as wide as it stood, its typed value right after it with its unit, the figure shown before put away',
        host.children[0].className === 'ui-slide ui-slide-wide' && host.children[0].children[0] === rg && host.children[0].children[1] === vb && vin.value === '50' && vb.children[1].textContent === '%' && hid.style.display === 'none' && U.typed(rg) === vb);
    vin.value = '250'; vin.fire('change'); await new Promise(r => setTimeout(r, 5));
    check('a typed value is held to the slider\'s bounds and handed on as the slider\'s own input and change events', rg.value === '100' && J(evs) === J(['input:100', 'change']) && vin.value === '100', J([rg.value, evs]));
    const d3 = page(), h3 = d3.createElement('div'), sk = d3.createElement('input'); sk.min = '0'; sk.max = '300'; sk.value = '83'; sk.closest = () => null; h3.appendChild(sk);
    const tb = U.typed(sk, { fmt: U.fmtTime, parse: U.readTime }), tin = tb.children[0]; tin.value = '2:05'; tin.fire('change'); await new Promise(r => setTimeout(r, 5));
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
    // backlog 225, the page's own pairs: related buttons that stand side by side in index.html are one .ui-seg, nothing of theirs changed
    {
        const ix2 = read('index.html'), css2 = read('style.css');
        const seg = (cls, ids) => new RegExp('<span class="' + cls + '"><button[^>]*id="' + ids.join('"[^]*?</button><button[^>]*id="') + '"[^]*?</button></span>').test(ix2);
        const pairs = [['ui-seg', ['plannerUndoBtn', 'plannerRedoBtn']], ['ui-seg', ['plannerFindPrev', 'plannerFindNext']], ['ui-seg', ['docPanelFindPrev', 'docPanelFindNext']],
            ['ui-seg', ['dicePaintDraw', 'dicePaintUpload']], ['ui-seg', ['dicePaintThin', 'dicePaintThick']], ['ui-seg ui-seg-wide', ['setProfSaveBtn', 'setProfOpenBtn']], ['ui-seg ui-seg-wide', ['setProfCopyBtn', 'setProfPasteBtn']],
            ['ui-seg ui-seg-wide', ['setUpdateNowBtn', 'setUpdateInstallerBtn']], ['ui-seg', ['imgLibAddBtn', 'imgLibAddDirBtn']], ['ui-seg ui-seg-col', ['imgLibPreviewAdd', 'imgLibPreviewScene']],
            ['ui-seg', ['furnPackImportFile', 'furnPackImportFolder']], ['ui-seg', ['furnMakerExportFile', 'furnMakerExportFolder']]];
        const off = pairs.filter(q => !seg(q[0], q[1])).map(q => q[1][0]);
        // the review of the pairs: a button with no way back stands apart from the safe one beside it, never joined
        const apart = [['sceneAgain', 'sceneEnd'], ['sysLayoutAuto', 'sysLayoutClear']].filter(q => seg('ui-seg', q)).map(q => q[0]);
        check('the review of the pairs: Show it again | Close for everyone and the Layout tab\'s two automatic-layout buttons stand apart, since one of each has no way back', apart.length === 0, J(apart));
        const qk = ix2.slice(ix2.indexOf('<div class="dice-quick">')).split('</div>')[0];
        check('the page\'s related buttons are joined (backlog 225): planner Undo | Redo and its Find arrows, the page panel\'s Find arrows, the scene box\'s two, the dice painter\'s Draw | Upload and Thin | Thick, the profile\'s two pairs, Update now | Get installer, the Image Library\'s two adds and its preview\'s two, the furnishing packs\' imports and the maker\'s exports, the Layout tab\'s two automatic layouts; Imperial | Metric fills its row; Host | Join is #netPaneBar itself; the token creator\'s outlines; the roller\'s quick dice d4 to d20, with d100, the coin and the operators outside',
            off.length === 0 && /<span class="ui-seg ui-seg-wide"><button class="tool ghost set-unit-btn" data-unit="imperial"[^]*?<\/button><button class="tool ghost set-unit-btn" data-unit="metric"[^]*?<\/button><\/span>/.test(ix2)
            && ix2.includes('<div id="netPaneBar" class="ui-seg ui-seg-wide" role="group"') && /<span class="frame-lbl">Outline<\/span><span class="ui-seg">(<button class="tool ghost frame-shape"[^]*?<\/button>){3}<\/span><\/div>/.test(ix2)
            && /^<div class="dice-quick"><span class="ui-seg">(<button data-die="d(4|6|8|10|12|20)">[^]*?<\/button>){6}<\/span><button data-die="d100">/.test(qk) && qk.split('<span class="ui-seg">').length === 2 && qk.indexOf('data-op=') > qk.indexOf('</span>')
            && ix2.includes('</span><input type="file" id="imgLibAddFile" accept="image/*" multiple hidden><input type="file" id="imgLibAddDir" webkitdirectory multiple hidden>'), J(off));
        check('a seg\'s shared rules (backlog 225): the one that is on is tinted gold inside the frame, a wide seg fills its row with even halves, a column seg stands its buttons in one frame; the quick dice drop their own frames, an empty update seg goes, and the selection\'s four layer buttons are joined in place',
            css2.includes('  .ui-seg > .tool.on, .ui-seg > .tool.active, .ui-seg > .tool.sel, .ui-seg > .tool[aria-pressed="true"] { background: rgba(227,166,59,.12); color: var(--gold); border-color: var(--edge); }')
            && css2.includes('  .ui-seg.ui-seg-wide { display: flex; width: 100%; flex: 1 1 auto; box-sizing: border-box; }') && css2.includes('  .ui-seg.ui-seg-wide > * { flex: 1 1 0; min-width: 0; white-space: normal; }')
            && css2.includes('  .ui-seg.ui-seg-col > * + *, .ui-seg.ui-seg-col > .tool + .tool, .ui-seg.ui-seg-col > button + button { border-left: 0; border-top: 0; box-shadow: 0 -1px 0 var(--edge); }')
            && css2.includes('  .ui-seg > * + *, .ui-seg > .tool + .tool, .ui-seg > button + button { border-left: 0; box-shadow: -1px 0 0 var(--edge); }') && css2.includes('  .ui-seg.ui-seg-wide > * { flex: 1 1 0; min-width: 0; white-space: normal; }')
            && css2.includes('  .sheet-paletted .ui-seg > .tool.on { background: var(--gold); color: var(--gold-ink, #1a1a1a); }') && css2.includes('.dp-chips > .tool.dp-chip.on { background: rgba(227,166,59,.12); color: var(--gold); border-color: var(--gold); }')
            && css2.includes('  .ui-seg:not(:has(> :not(:disabled):not([style*="pointer-events: none"]):not([style*="display: none"]):not([hidden]))) { opacity: .45; }') && css2.includes('  .dice-quick .ui-seg > button { border: 0; border-radius: 0; padding: 2px 6px; }')
            && css2.includes('  #setUpdateRow > .ui-seg:not(:has(> button:not([style*="none"]))) { display: none; }') && css2.includes('  #multiBringFwdBtn, #multiSendBwdBtn, #multiSendBackBtn { margin-top: -1px; border-top-left-radius: 0; border-top-right-radius: 0; }'));
    }
    // backlog 225, the sheets' own pairs (sheets.js): a System editor row's move buttons through segPut, which btnRow and every inline copy ask; a list's
    // Open all | Close all, a set strip's All on | All off, Tiles | List, the tile drawer's four arrows and the stale bar's Review | Mark current, each one .ui-seg
    {
        const sh = read('scripts/sheets.js'), css3 = read('style.css');
        const a = sh.indexOf('var SEG_MOVE = '), b = sh.indexOf('\n', sh.indexOf('function btnRow(list) {'));
        const d = page(), mkEl = (tag, cls, text) => { const e = d.createElement(tag); e.className = cls || ''; if (text !== undefined) e.textContent = String(text); Object.defineProperty(e, 'lastChild', { get() { return e.children[e.children.length - 1] || null; } }); return e; };
        const R = a >= 0 && b > a ? new Function('el', sh.slice(a, b) + '\nreturn { segPut: segPut, btnRow: btnRow };')(mkEl) : null;
        const kids = n => n.children.map(k => k.tagName === 'SPAN' ? k.className + '[' + k.children.map(x => x.dataset.act).join(',') + ']' : k.dataset.act);
        const br = R ? R.btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '<i class="wib wi-dup"></i>'], ['del', 'Delete', '&times;']]) : null;
        const pin = R ? R.btnRow([['pinleft', 'Move left', '&#9664;'], ['pinright', 'Move right', '&#9654;'], ['pindel', 'Take off', '&times;']]) : null;
        const rw = mkEl('div', 'sys-flags'); if (R) [['statup', '\u25b2'], ['statdown', '\u25bc'], ['statdel', '\u00d7']].forEach(q => { const x = mkEl('button', 'tool ghost sys-btn', q[1]); x.dataset.act = q[0]; R.segPut(rw, x); });
        const inline = (sh.match(/\(typeof segPut === 'function' \? segPut\((\w+), bb\) : \1\.appendChild\(bb\)\); \}\);/g) || []).length;
        check('the System editor\'s move buttons are joined (backlog 225): btnRow puts each row\'s \u25b2 \u25bc (a pin\'s \u25c0 \u25b6) in one .ui-seg sys-moves through segPut, its Duplicate and \u00d7 beside it and every act kept; segPut does the same for a row built inline, by the glyph; the 17 inline copies and the tables\' box ask it, and a harness with no segPut appends as before',
            !!R && J(kids(br)) === J(['ui-seg sys-moves[up,down]', 'dup', 'del']) && br.className === 'sys-btns' && J(kids(pin)) === J(['ui-seg sys-moves[pinleft,pinright]', 'pindel']) && J(kids(rw)) === J(['ui-seg sys-moves[statup,statdown]', 'statdel'])
            && inline === 17 && sh.includes("var tbB = tableBtn(bd[1], 'table' + bd[0], bd[2]); (typeof segPut === 'function' ? segPut(head, tbB) : head.appendChild(tbB));"), J([R ? kids(br) : null, inline]));
        check('the sheet\'s own pairs are joined (backlog 225): Open all | Close all (a list and a rich table), All on | All off, Tiles | List with Edit layout beside it, the tile drawer\'s four arrows with Back to its place outside, the stale bar\'s Review | Mark current with Mark all current outside; the pointer shows on a framed button\'s fill',
            sh.includes("    var sg = el('span', 'ui-seg'); sg.appendChild(oa); sg.appendChild(ca); bar.appendChild(sg); return bar;")
            && sh.includes("var sgS = el('span', 'ui-seg sheet-set-seg'); sgS.appendChild(bOn); sgS.appendChild(bOff); ln.appendChild(sgS);")
            && sh.includes("var bar = el('div', 'body-switch'), sgV = el('span', 'ui-seg');") && sh.includes("sgV.appendChild(b); }); bar.appendChild(sgV);")
            && sh.includes("mvBar = el('div', 'body-switch body-move'), mvSeg = el('span', 'ui-seg');") && sh.includes("mvSeg.appendChild(q); }); mvBar.appendChild(mvSeg); if (byId[open].tp) {")
            && sh.includes("var sgR = el('span', 'ui-seg sheet-rv-seg');") && sh.includes("function() { markCurrent(c.id); }, sgR);\n        bar.appendChild(sgR);")
            && css3.includes('  .ui-seg.sys-moves > .sys-btn { padding: 1px 6px; }') && css3.includes('.sheet-rv-seg > .tool:hover:not(:disabled):not(.on) { background: rgba(255,255,255,.06); color: var(--ink); }'));
    }
    // backlog 225, the other scripts' pairs: each joined in one .ui-seg where it is built, every class, title, data attribute and handler kept;
    // a page window's Find arrows joined by the style sheet alone, since popout.js is binary to git
    {
        const S2 = f => read('scripts/' + f), c4 = read('style.css');
        check('pagenav.js (backlog 225): Back and Forward stand in one .ui-seg pagenav-hists, made by name right before each place\'s Outline button and filled in their order; in a page window of its own the bar\'s own frame takes its border and its buttons drop their own',
            S2('pagenav.js').includes("        var seg = doc.createElement('span'); seg.className = 'ui-seg pagenav-hists'; btn.parentNode.insertBefore(seg, btn);") && S2('pagenav.js').includes("            seg.appendChild(b);\n        });\n    });")
            && !S2('pagenav.js').includes('btn.parentNode.insertBefore(b, btn);') && c4.includes('  #popoutBar .ui-seg > .pagenav-hist { border: 0; border-radius: 0; }') && c4.includes('  #popoutBar .ui-seg > .pagenav-hist + .pagenav-hist { border-left: 1px solid var(--border); }'));
        check('inspector.js (backlog 225): a layer\'s \u25b2 \u25bc in the Layers list stand in one .ui-seg el-moves, Rename and Delete outside',
            /\(visual \? '<span class="ui-seg el-moves"><button class="tool ghost el-up" aria-label="Move up a layer"[^\n]*\n[^\n]*class="tool ghost el-down" aria-label="Move down a layer"[^\n]*&#9660;<\/button><\/span>' : ''\) \+\n\s*'<button class="tool ghost danger el-del"/.test(S2('inspector.js')));
        check('whiteboard.js (backlog 225): the combat roster\'s \u25b2 \u25bc stand in one .ui-seg combat-moves, the custom row\'s \u00d7 outside; a redraw still finds the focus by class',
            /\+ '<span class="ui-seg combat-moves"><button class="tool ghost combat-up" title="Move up">&#9650;<\/button><button class="tool ghost combat-down" title="Move down">&#9660;<\/button><\/span>'\n\s*\+ \(r\.custom \? '<button class="tool ghost danger combat-del"/.test(S2('whiteboard.js'))
            && S2('whiteboard.js').includes("['combat-on', 'combat-init', 'combat-roll', 'combat-up', 'combat-down'].filter(function(c) { return fa.classList.contains(c); })[0]"));
        check('dice.js (backlog 225): the \u00b1 window\'s Dis | Normal | Adv stand in one wide seg of equal thirds, and its quick chips \u22125 | \u22121 | +1 | +5 in another; the typed counter stays its own',
            S2('dice.js').includes("var advRow = el('div', 'dice-modadv'), advSeg = advRow.appendChild(el('span', 'ui-seg ui-seg-wide'));") && S2('dice.js').includes('advBtns[m[0]] = b; advSeg.appendChild(b); });')
            && S2('dice.js').includes("var chips = el('div', 'dice-modpop-chips'), chipSeg = chips.appendChild(el('span', 'ui-seg ui-seg-wide'));") && S2('dice.js').includes('mod = clampMod(mod + q[1]); refresh(); }); chipSeg.appendChild(b); });'));
        const cS = S2('calendar.js');
        check('calendar.js (backlog 225): the waiting list\'s Apply and Skip apart (its review), Active | Rest, the steps (a seg that wraps) and the clock\'s Runs | Held each stand in one .ui-seg; the one picked keeps cal-kind-on, tinted inside the frame, and Runs while it waits keeps its dashed look',
            cS.includes("var pseg = top;   /* 1.6.2 (backlog 225, its review): Skip lets the time pass with no rule run, so it stands apart from Apply, never joined to it */") && cS.includes("    pseg.appendChild(cbtn('cal-pend-apply', 'Apply',") && cS.includes("    pseg.appendChild(cbtn('cal-pend-skip', 'Skip',")
            && cS.includes("} else { var kseg = kd.appendChild(cel('span', 'ui-seg cal-seg cal-kind-seg'));") && cS.includes("b.dataset.kind = k[0]; kseg.appendChild(b); }); }")
            && cS.includes("var sseg = st.appendChild(cel('span', 'ui-seg ui-seg-wrap cal-seg cal-step-seg'));") && cS.includes('b.dataset.secs = String(s.secs); sseg.appendChild(b); });')
            && cS.includes("var lseg = row.appendChild(cel('span', 'ui-seg cal-seg cal-live-seg'));") && cS.includes('b.dataset.live = k[0]; lseg.appendChild(b);')
            && c4.includes('  .ui-seg > .tool.cal-kind-on { background: rgba(227,166,59,.12); color: var(--gold); border-color: var(--edge); }') && c4.includes('  .ui-seg > .tool.cal-live-wait { outline: 1px dashed var(--gold); outline-offset: -3px; }')
            && c4.includes('  .ui-seg.ui-seg-wrap > *, .ui-seg.ui-seg-wrap > .tool + .tool { flex: 1 0 auto; border-left: 0; box-shadow: -1px 0 0 var(--edge), 0 -1px 0 var(--edge); }'));
        check('timeline.js, storyview.js, timepanel.js (backlog 225): the timeline\'s zoom out | in stand in one .ui-seg tl-zoom with Now and Everything beside; a beat\'s Played | Tonight | Ahead is its own group made a seg, the one on tinted; the time panel\'s four filters stand in one rounded seg',
            S2('timeline.js').includes("var zs = bar.appendChild(el('span', 'ui-seg tl-zoom')); zs.appendChild(mkb('\u2212', 'Zoom out', function() { zoom(2); })); zs.appendChild(mkb('+', 'Zoom in', function() { zoom(0.5); }));")
            && S2('timeline.js').includes("    mkb('Now', 'Back to where the clock stands',") && S2('storyview.js').includes("var ss = mk('span', 'sv-sess ui-seg'); ss.setAttribute('role', 'group');")
            && S2('timepanel.js').includes("    var fseg = tools.appendChild(el('span', 'ui-seg tp-filt'));") && S2('timepanel.js').includes('b.dataset.tpfilt = f[0]; fseg.appendChild(b); });')
            && c4.includes('  .sv-sess.ui-seg > .sv-s.on { background: rgba(227,166,59,.12); color: var(--gold); border-color: var(--edge); }') && c4.includes('  #timePanel .tp-filt.ui-seg > .tp-chip.on { background: rgba(227,166,59,.12); color: var(--gold); }'));
        check('music.js (backlog 225): previous, play, next and stop stand in one .ui-seg music-trans taking four shares of the row, loop and shuffle apart with their own on look',
            S2('music.js').includes("    var trans = btns.appendChild(el('span', 'ui-seg music-trans'));") && /trans\.appendChild\(tb\('music-prev [^\n]*\n\s*trans\.appendChild\(tb\('music-play [^\n]*\n\s*trans\.appendChild\(tb\('music-next [^\n]*\n\s*trans\.appendChild\(tb\('music-stop /.test(S2('music.js'))
            && /btns\.appendChild\(tb\('music-loop /.test(S2('music.js')) && /btns\.appendChild\(tb\('music-shuf /.test(S2('music.js')) && c4.includes('  .music-btns > .music-trans { flex: 4 4 0; display: flex; min-width: 0; }'));
        check('popout.js by the style sheet alone (backlog 225): a page window\'s Find \u25b2 \u25bc are joined in place, their facing corners square and the second over the first\'s edge; popout.js itself is untouched',
            c4.includes('  #popoutBar #popoutFindPrev { border-radius: 5px 0 0 5px; }') && c4.includes('  #popoutBar #popoutFindNext { margin-left: -6px; border-radius: 0 5px 5px 0; }')
            && read('scripts/popout.js').includes('<button id="popoutFindPrev" type="button" aria-label="Previous match" title="Previous match (Shift+Enter)">&#9650;</button><button id="popoutFindNext" type="button"'));
    }
    {   // backlog 225, the item card (sites A): each place builds its card through wpUi.card and keeps today's markup where wpUi is not there
        const S3 = f => read('scripts/' + f), c5 = read('style.css'), A = c5.indexOf('  /* ui-card sites A */'), cA = A < 0 ? '' : c5.slice(A, c5.indexOf('\n  /*', A + 5) < 0 ? undefined : c5.indexOf('\n  /*', A + 5));
        const lp = S3('libpicker.js'), lw = S3('librarywin.js'), mo = S3('mapobjects.js'), dw = S3('deckwin.js'), tr = S3('trade.js');
        check('the item card (backlog 225): the library picker\'s preview, the Library window\'s entry head, a map object open for editing, the deck in view and a trade\'s lines each build the app\'s own card through window.wpUi.card, today\'s markup kept as the fallback, and their rules stand after the sites A marker alone',
            lp.includes("UI = typeof window !== 'undefined' && window.wpUi && window.wpUi.card ? window.wpUi : null;") && lp.includes("var cd = UI.card({ name: e.name, sub: [e.category || 'No category', x.p.name].join(' · '),") && lp.includes("var h = el('div', 'lib-pick-name', ")
            && lw.includes("var UIc = typeof window !== 'undefined' && window.wpUi && window.wpUi.card ? window.wpUi : null;") && lw.includes("var cdh = UIc.card({ name: st.draftNew && !e.name ? 'New entry' : e.name,") && lw.includes("} else form.appendChild(el('div', 'lib-fhead', st.draftNew && !e.name ? 'New entry' : e.name));")
            && mo.includes("var UI = window.wpUi && window.wpUi.card ? window.wpUi : null;") && mo.includes("var cd = UI.card({ name: o.name, sub: C.objWords(o), pic: thumb(o), cls: 'obj-card' });") && mo.includes("formInto(cd.body, o, kind, list, cd.acts); r.appendChild(cd.el); return r;") && mo.includes("var bar = acts || el('div', 'obj-formbar');")
            && dw.includes("var UI = window.wpUi && window.wpUi.card ? window.wpUi : null;") && dw.includes("cls: 'dk-view' });") && dw.includes("drawRow(cd.acts, camp, it); p.appendChild(cd.el);") && dw.includes("} else if (it) { if (list.length === 1) p.appendChild(el('div', 'dk-title',")
            && tr.includes("var UIt = typeof window !== 'undefined' && window.wpUi && window.wpUi.card ? window.wpUi : null, row, put;") && tr.includes("cls: 'trade-line trade-lcard' }, doc);") && tr.includes("else { row = twEl(doc, 'div', 'trade-line'); put = row;")
            && ['.ui-card.lib-pick-card', '.ui-card.lib-fcard', '.ui-card.obj-card', '.dk-view .ui-card-acts', '.ui-card.trade-lcard'].every(s => cA.includes(s)),
            J({ A: A >= 0 }));
    }
    {   // backlog 225, the item card (sites B): Buy and Sell, a body tile's drawer, a waiting token and Properties' head for one piece or a room, each through wpUi.card, today's markup kept as the fallback
        const S4 = f => read('scripts/' + f), c6 = read('style.css'), B = c6.indexOf('  /* ui-card sites B */'), cB = B < 0 ? '' : c6.slice(B, c6.indexOf('\n  /*', B + 5) < 0 ? undefined : c6.indexOf('\n  /*', B + 5));
        const shB = S4('sheets.js'), inB = S4('inspector.js'), hA = inB.indexOf('  function cardHead(o){'), hZ = hA < 0 ? -1 : inB.indexOf('\n  }', hA);
        let cardHead = null, hOut = '', hPic = '', hErr = '';
        try {
            const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'), picRef = p => /^\/saves\/images\/[^"<>]+$/.test(p) ? p : '';
            cardHead = new Function('esc', 'picRef', 'window', inB.slice(hA, hZ + 4) + '\nreturn cardHead;')(esc, picRef, {});
            hOut = cardHead({ name: '<img src=x onerror=1>"', sub: '<b>kind</b>', src: 'https://evil.example/x.png' }); hPic = cardHead({ name: 'Lamp', sub: 'Image', src: '/saves/images/lamp.png' });
        } catch (e) { hErr = e.message; }
        check('the item card (backlog 225, sites B): Buy and Sell puts the row in a card with the price lines in its body, a body tile\'s drawer heads with a card (its drawing, name, state and close), a waiting token and Properties\' head for one piece or a room are card heads; each asks window.wpUi.card and keeps today\'s markup where it is not there; Properties writes the card\'s markup with every value through esc() and a picture through picRef only, a web address giving the first letter; the rules stand after their marker',
            shB.includes("var UIp = typeof window !== 'undefined' && window.wpUi && window.wpUi.card ? window.wpUi : null, host = body;") && shB.includes("var kP = UIp.card({ name: o.name, sub: (o.buy ? 'Buying ' : 'Selling ') + o.n,") && shB.includes("host.appendChild(way); host.appendChild(line);") && shB.includes("    host.appendChild(mk('div', 'price-held',")
            && shB.includes("UIt = typeof window !== 'undefined' && window.wpUi && window.wpUi.card ? window.wpUi : null;") && shB.includes("var kT = UIt.card({ name: openBox ? openBox.label : drO.name, sub: stO ? stO.label : '', pic: drP || undefined,") && shB.includes("kT.side.appendChild(shut); head = kT.el;") && shB.includes("} else { head.appendChild(el('span', 'body-drawer-name', openBox ? openBox.label : byId[open].name)); if (stO) head.appendChild(el('span', 'body-drawer-state', stO.label)); head.appendChild(shut); }")
            && inB.includes("var UIw = window.wpUi && window.wpUi.card ? window.wpUi : null, wpK = UIw ? UIw.card({ name: String(w.name || 'A player'), sub: 'Waiting token', cls: 'insp-card' }) : null;") && inB.includes("else { var wpH = document.createElement('h2'); wpH.textContent = String(w.name || 'A player') + '\\u2019s waiting token'; wpP.appendChild(wpH); }") && inB.includes("(wpK ? wpK.acts : wpP).appendChild(bt);")
            && inB.includes("(window.wpUi && window.wpUi.card ? cardHead({ name: w.name ? w.name : typeLabel, sub: w.name ? typeLabel : '',") && inB.includes(": '<h2>' + esc(w.name ? w.name : typeLabel) +") && inB.includes("typeof cardHead === 'function' ? cardHead({ name: r.name || '(unnamed)', sub: 'Data Node', src: picRef(r.image) ? r.image : '' }) : '<h2>Data Node</h2>'+")
            && !hErr && !/<img src=x|<b>/.test(hOut) && hOut.includes('&lt;img src=x onerror=1&gt;&quot;') && hOut.includes('<span class="ui-card-ch">&lt;</span>') && hPic.includes('<img src="/saves/images/lamp.png" alt="">') && hPic.includes('<h2 class="ui-card-name">Lamp</h2><small class="ui-card-sub">Image</small>')
            && ['#inspector .insp-card', '.body-drawer-card'].every(s => cB.includes(s) && c6.indexOf(s) > B),
            J({ B: B >= 0, hErr, hOut, hPic }));
    }
    // the review of the item card: a bundled icon is the file glyphPath answers, drawn as the sheet draws one; a name's first whole character
    {
        const SC = await import(url('systemcore.js')), gp = SC.glyphPath('icon:star'), cd = page();
        const k1 = U.card({ name: 'Star', glyph: gp }, cd), g1 = k1.pic.children[0];
        const k2 = U.card({ name: '🗡 Sword' }, cd), k3 = U.card({ name: 'x', glyph: '"><script>' }, cd), k4 = U.card({ name: '  ' }, cd);
        const bx = read('scripts/boxes.js'), cssR = read('style.css');
        check('the review of the item card: a bundled icon is drawn from the file glyphPath answers (solid/star), as the sheet draws one, never as an svg path; anything else is no icon and the first letter shows; a name that begins with an emoji shows that whole emoji; a blank name a question mark; the containers window draws its icons the same way; a narrow trade column puts a line\'s controls under its name, and an object\'s picture fills its box',
            /^(solid|regular|brands)\//.test(gp) && g1 && g1.className === 'wp-glyph ui-card-glyph' && g1.style.maskImage === 'url("/assets/icons/fa/' + gp + '.svg")' && g1.style.webkitMaskImage === g1.style.maskImage && g1.attrs['aria-hidden'] === 'true'
            && k2.pic.children[0].textContent === '🗡' && k3.pic.children[0].className === 'ui-card-ch' && k3.pic.children[0].textContent === 'X' && k4.pic.children[0].textContent === '?'
            && bx.includes("if (g && /^(solid|regular|brands)\\/[a-z0-9-]{1,40}$/.test(g)) { var s = el('span', 'box-glyph wp-glyph'), u = 'url(\"/assets/icons/fa/' + g + '.svg\")';") && !/createElementNS\(NS, 'path'\)/.test(bx)
            && cssR.includes('.trade-lcard .ui-card-top { flex-wrap: wrap; row-gap: 4px; }') && cssR.includes('.obj-card .ui-card-pic > .obj-thumb { flex: 0 0 48px; width: 48px; height: 48px; border-radius: 6px; }'),
            J([gp, g1 && g1.className, k2.pic.children[0].textContent, k3.pic.children[0].textContent]));
    }
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
