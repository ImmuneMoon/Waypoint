'use strict';
/* hudcheck.js: the HUD: the HUD frame HF0 to HF5 (the section options dispatched by class, the HUD as a second layout of the sheet, its
   window, the docked roll history, inline rows and the counter, Reset all, values in roll labels, the built-in CombatRound and the
   review's party strip, labels, rollInit and turnView), and a redraw keeping the sheet's and a HUD's place (from needcheck.js).
   These are the tests that came out of systemcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split",
   step 3, 2026-11-19). Their code is systemcore.js's own lines and the parts and slices each block reads by name, so the suite
   imports systemcore.js as systemcheck.js does (kit.sysCore, the top every suite out of it starts from). Each block is as it stood
   in systemcheck.js, word for word, with the comment that heads it.
   Usage: node tools/hudcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const { css0911 } = kit;   // the style sheet
const T = kit.suite('system'), check = T.check;
const j = v => JSON.stringify(v);

(async () => {
    const core = await kit.sysCore();   // systemcore.js and formula.js imported, the names systemcheck.js unpacks, the two presets and flatKids
    const { S, F, err } = core;
    check('hudcheck: systemcore.js and formula.js load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, cleanSystem, validateSystem, autoLayout } = core;

    /* ---- Stage 6 HUD frame (HF0): the section options dispatch by exact class token ---- */
    {
        const shH0 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const body = h => { const i = shH0.indexOf(h); return shH0.slice(i, shH0.indexOf('\n}\n', i)); };
        const inp0 = require('./checkkit').cut('sysedlayout.js', 'function onLayoutInput(t) {', '\n}\n'), chg0 = require('./checkkit').cut('sysedlayout.js', 'function onLayoutChange(t) {', '\n}\n');
        check('HUD frame HF0: no section option is matched by substring any more ("sys-sec-pinned" contains "sys-sec-pin": the Above-the-tabs select set a Pin and never pinned); both use the exact class token',
            !/c\.indexOf\('sys-sec-/.test(inp0) && !/c\.indexOf\('sys-sec-/.test(chg0) && /if \(t\.classList\.contains\('sys-sec-pinned'\)\) \{ if \(t\.value\) sec\.pinned = true;/.test(chg0) && /if \(t\.classList\.contains\('sys-sec-pin'\)\) \{ if \(t\.value && PIN_GID\.test\(t\.value\)\) sec\.pin = t\.value;/.test(chg0));
    }
    /* ---- Stage 6 HUD frame (HF1): the HUD as a second layout of the sheet — cleaners, views, the editor's Sheet | HUD switch ---- */
    {
        const crypto = require('crypto'), Hh = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
        const fxr = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const PRE = {   // pinned at c2f49a7, before the cleaner was factored: [GM view, players' view, players' view re-cleaned, autoLayout of the GM view]
            'look-d20': ['e46258b85f4df4533bd53ee7064205bd18d293839f2cf6df405b5344e6df2efb', '78dcf72d18152dfad687a5a1a3d87a38fbaa393c3418fce820b4a04389339274', '78dcf72d18152dfad687a5a1a3d87a38fbaa393c3418fce820b4a04389339274', 'd3e733be3aaf6440c1730d2a7493f341ae36fc60ce538982ef3c0e8c76301a1f'],
            'look-3d6': ['26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '800aebd280bb7aacdb6a84b6c8b6888c2c14edd1bb0ff8accd49ff889e483cb7']
        };
        const now = Object.keys(PRE).map(n => { const raw = fxr(n), gm = cleanSystem(raw, { F, gmView: true }), pv = cleanSystem(raw, { F, gmView: false }); return [Hh(gm), Hh(pv), Hh(cleanSystem(pv, { F, gmView: false })), Hh(autoLayout(gm))]; });
        check('HUD frame HF1: factoring the sheet cleaner is behavior-preserving — both look fixtures clean byte-for-byte as before (GM view, players\' view, a re-clean, the automatic layout)', j(now) === j(Object.keys(PRE).map(n => PRE[n])), j(now));

        const hD = fxr('hud-d20'), h3 = fxr('hud-3d6'), hB = fxr('hud-bare');
        const gD = cleanSystem(hD, { F, gmView: true }), pD = cleanSystem(hD, { F, gmView: false }), g3 = cleanSystem(h3, { F, gmView: true }), p3 = cleanSystem(h3, { F, gmView: false }), gB = cleanSystem(hB, { F, gmView: true });
        const base = cleanSystem(fxr('look-d20'), { F, gmView: true });
        const withHud = h => { const s = JSON.parse(JSON.stringify(fxr('look-d20'))); s.sheet.hud = h; return s; };
        const cl = (h, gv) => cleanSystem(withHud(h), { F, gmView: gv !== false }).sheet;
        check('HUD frame HF1: absent — no hud key, the sheet\'s keys in their order; {} and a HUD of junk leave no key either',
            !('hud' in base.sheet) && j(Object.keys(base.sheet)) === j(['tabs', 'sections', 'band', 'bandGroups', 'identity', 'ledger', 'look'])
            && !('hud' in cl({})) && !('hud' in cl({ band: [{ id: 'f_nope' }], ledger: 'x', sections: 'y', tabs: [{ id: 'bad id' }], title: '   ' })) && !('hud' in cl([1, 2])) && !('hud' in cl('hud')));
        check('HUD frame HF1: the GM view keeps a HUD with only a title, only tabs or an empty section (nothing set is lost on Save); the players\' view drops each',
            j(cl({ title: 'Combat HUD' }).hud) === j({ title: 'Combat HUD', tabs: [], sections: [] }) && cl({ tabs: [{ id: 't_x', label: 'X' }] }).hud.tabs.length === 1 && cl({ sections: [{ id: 's_e', title: 'Empty', fields: [] }] }).hud.sections.length === 1
            && !('hud' in cl({ title: 'Combat HUD' }, false)) && !('hud' in cl({ tabs: [{ id: 't_x', label: 'X' }] }, false)) && !('hud' in cl({ sections: [{ id: 's_e', title: 'Empty', fields: [] }] }, false)));
        const secOf = (sh, id) => sh.sections.find(s => s.id === id), ids = s => s.fields.map(p => p.id || p.roll || p.kind);
        const tabX = cl({ tabs: [{ id: 't_hx', label: 'X' }], sections: [{ id: 's_a', title: 'A', tab: 't_main', fields: [{ id: 'f_str' }] }, { id: 's_b', title: 'B', tab: 't_hx', fields: [{ id: 'f_dex' }] }] });
        const many = []; for (let i = 0; i < LIMITS.sections; i++) many.push({ id: 's_m' + i, title: 'M', fields: Array.from({ length: 10 }, () => ({ id: 'f_str' })).concat([{ kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }]) });
        const capH = cl({ sections: many }), capCount = capH.hud.sections.reduce((n, s) => n + s.fields.length, 0);
        check('HUD frame HF1: once per layout — f_st and f_hp sit on the sheet AND in the HUD; within the HUD a second f_sl1 is dropped; a HUD section\'s tab resolves against the HUD\'s own tabs only; the placement cap is counted per layout',
            ids(secOf(g3.sheet, 's_attr')).includes('f_st') && ids(secOf(g3.sheet.hud, 's_hattr')).includes('f_st')
            && ids(secOf(gD.sheet, 's_combat')).includes('f_hp') && ids(secOf(gD.sheet.hud, 's_hstat')).includes('f_hp')
            && j(ids(secOf(gD.sheet.hud, 's_hstat'))) === j(['f_hp', 'f_fx', 'f_dsv', 'pin']) && j(ids(secOf(gD.sheet.hud, 's_hslots'))) === j(['f_sl1', 'f_sl2', 'f_sl3'])
            && !('tab' in secOf(tabX.hud, 's_a')) && secOf(tabX.hud, 's_b').tab === 't_hx'
            && capCount === LIMITS.placements && gD.sheet.sections.reduce((n, s) => n + s.fields.length, 0) > 0, j({ capCount, a: secOf(tabX.hud, 's_a') }));
        const pinPl = s => s.fields.filter(p => p.kind === 'pin').map(p => p.g);
        const gmOnly = cl({ band: [{ id: 'f_gmfig' }], sections: [{ id: 's_g', title: 'G', fields: [{ id: 'f_gmfig' }] }] }, false);
        const pagesSys = o => { const s = withHud({ sections: [{ id: 's_l', title: 'L', fields: [{ kind: 'link', page: 'p_open', text: 'Open' }, { kind: 'link', page: 'p_secret', text: 'Secret' }, { id: 'f_str' }] }] }); return cleanSystem(s, Object.assign({ F, gmView: false }, o)); };
        const pg = pagesSys({ pages: ['p_open'] });
        const re1 = cleanSystem(pg, { F, gmView: false, pages: ['p_open'] }), re2 = cleanSystem(pg, { F, gmView: false });
        const pDb = pD.sheet.hud.band.map(q => q.id || q.roll), pDg = pD.sheet.bandGroups.map(g => g.id);
        check('HUD frame HF1: the players\' view — the GM-only figure leaves the HUD band and its GM section; g_gm is pruned; g_hud (on the HUD band only, pinned only in the HUD) survives with its Pin; g_slots and its section Pin survive; a HUD of GM-only content is dropped; a link to a page they cannot read is dropped; idempotent under both client re-cleans',
            !pDb.includes('f_gmfig') && j(ids(secOf(pD.sheet.hud, 's_hgm'))) === j([]) && !pDg.includes('g_gm') && pDg.includes('g_hud') && j(pinPl(secOf(pD.sheet.hud, 's_hstat'))) === j(['g_hud'])
            && pDg.includes('g_slots') && secOf(pD.sheet.hud, 's_hslots').pin === 'g_slots' && !('hud' in gmOnly)
            && j(secOf(pg.sheet.hud, 's_l').fields.map(p => p.page || p.id)) === j(['p_open', 'f_str']) && j(re1) === j(pg) && j(re2) === j(pg)
            && j(cleanSystem(pD, { F, gmView: false })) === j(pD) && j(cleanSystem(p3, { F, gmView: false })) === j(p3), j({ pDb, pDg }));
        const before = j(gD), hv = S.hudView(gD), after = j(gD);
        check('HUD frame HF1: hudView — the HUD\'s layout in the sheet\'s place; fields and rolls shared by reference; the input untouched; the look without portrait and sticky but with its palette; the groups shared',
            before === after && hv.fields === gD.fields && hv.rolls === gD.rolls && hv.sheet.sections === gD.sheet.hud.sections && hv.sheet.band === gD.sheet.hud.band && hv.sheet.ledger === gD.sheet.hud.ledger && hv.sheet.bandGroups === gD.sheet.bandGroups
            && !('portrait' in hv.sheet.look) && !('sticky' in hv.sheet.look) && j(hv.sheet.look.palette) === j(gD.sheet.look.palette) && hv.sheet.look.accent === gD.sheet.look.accent && gD.sheet.look.portrait === true && !('identity' in hv.sheet));
        const pT = S.pinTargets(gD.sheet.sections), pA = S.pinTargetsAll(gD.sheet), bandG = sh => (sh.band || []).filter(q => q.id === 'f_hp').map(q => q.g || '');
        const bareH = cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_a', key: 'A', label: 'A', kind: 'number' }], rolls: [] }, { F, gmView: true }), autoH = S.hudView(base);   // 1.6.2 (the owner: "A plain default HUD"), moved on purpose
        check('HUD frame HF1: hudHasContent / pinTargetsAll — a system that sets no HUD has the plain default where it has a pool or a roll in its first section (1.6.2, moved on purpose), and none where it has neither; the bare system (fields only) has one; the sheet\'s Pins alone lack g_hud and both layouts\' have it; in the 3d6 HUD f_hp is ungrouped where the sheet\'s band groups it',
            S.hudView(bareH) === null && S.hudHasContent(bareH) === false && !!autoH && autoH.sheet.sections.length === 1 && autoH.sheet.sections[0].id === 's_hudauto' && autoH.sheet.sections[0].fields.length > 0 && S.hudHasContent(base) === true && S.hudHasContent(null) === false && S.hudHasContent(gB) === true && S.hudHasContent(gD) === true
            && pT.g_hud !== 1 && pA.g_hud === 1 && pA.g_slots === 1 && pA.g_gm === 1 && Object.getPrototypeOf(pA) === null
            && j(bandG(g3.sheet)) === j(['g_pools']) && j(bandG(g3.sheet.hud)) === j(['']));
        const heSys = withHud({ ledger: [{ id: 'f_gold' }, { id: 'f_prof' }], sections: [{ id: 's_x', title: 'Wallet', fields: [{ id: 'f_gold' }] }] });
        const heG = cleanSystem(heSys, { F, gmView: true }), heH = S.headerEdits(heG, heG.sheet.hud), heV = validateSystem(heG, F);
        const errsN = [gD, g3, gB].map(s => validateSystem(s, F).errors.length);
        check('HUD frame HF1: headerEdits(sys, layout) — the HUD\'s plain ledger number is edited in its header (a formula is not); no argument still means the sheet; the duplicate warning names the HUD; no "no Pin" warning for g_hud; the three HUD fixtures validate with no errors',
            j(Object.keys(heH)) === j(['f_gold']) && Object.keys(S.headerEdits(heG)).indexOf('f_gold') < 0 && Object.keys(S.headerEdits(null)).length === 0 && Object.keys(S.headerEdits({ fields: heG.fields }, null)).length === 0
            && heV.warnings.some(w => w.id === 'f_gold' && /placed again in the HUD\u2019s Wallet\./.test(w.message))
            && !validateSystem(gD, F).warnings.some(w => w.id === 'g_hud') && j(errsN) === j([0, 0, 0]), j({ heH: Object.keys(heH), errsN, w: heV.warnings }));

        // the editor and the drawing (source checks; the live preview is verified in the browser)
        const shH1 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const bodyH = h => { const i = shH1.indexOf(h); return i < 0 ? '' : shH1.slice(i, shH1.indexOf('\n}\n', i)); };
        const clickH = require('./checkkit').cut('sysedlayout.js', 'function onLayoutClick(b) {', '\n}\n'), inputH = require('./checkkit').cut('sysedlayout.js', 'function onLayoutInput(t) {', '\n}\n'), layH = require('./checkkit').cut('sysedlayout.js', 'function renderLayout() {', '\n}\n'), prevH = require('./checkkit').cut('sysedlayout.js', 'function renderPreview() {', '\n}\n');
        const iHa = clickH.indexOf("if (b.id === 'sysLayoutAuto' && layoutView === 'hud')"), iHc = clickH.indexOf("if (b.id === 'sysLayoutClear' && layoutView === 'hud')"), iSa = clickH.indexOf("if (b.id === 'sysLayoutAuto') {"), iSc = clickH.indexOf("if (b.id === 'sysLayoutClear') {");
        check('HUD frame HF1: buildSections draws the HUD without an automatic-layout fallback; a Pin in either view drives the band (vctx.targets, else both layouts); the sheet\'s regexes and counts still hold',
            /var sheet = \(hudV \|\| \(sys\.sheet && sys\.sheet\.sections && sys\.sheet\.sections\.length\)\) \? sys\.sheet : autoLayout\(sys\);/.test(shH1) && /targets: \(vctx && vctx\.targets\) \|\| pinTargetsAll\(sys\.sheet\), vctx: vctx,/.test(shH1)
            && (shH1.match(/(?:_fxLive = false|fxLiveSet\(false\)); try \{ buildSections\(/g) || []).length === 2 && (shH1.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars, pl)?\)/g) || []).length === 2
            && /var secKey = \(hudV \? 'h:' : ''\) \+ sec\.id;/.test(shH1) && /if \(\(_fxForm\.view \|\| 'sheet'\) === fxV\)/.test(shH1)
            && /import \{[^}]*pinTargetsAll, hudView, hudHasContent[, A-Za-z]* \} from '\.\/systemcore\.js';/.test(shH1));
        check('HUD frame HF1: the Layout tab — layoutRoot routes the sections, the tabs and the band / ledger boxes; the switch never dirties the draft; the HUD\'s Copy / Remove come before the sheet\'s Auto / Clear, which keep the HUD; deleteGroup cleans both layouts; the HUD title is handled before the section lookup; the Identity box is the sheet\'s alone; the preview draws hudView',
            /function layoutSections\(\) \{ var r = layoutRoot\(\);/.test(require('./checkkit').part('sysedlayout.js')) && /function layoutTabs\(\) \{ var r = layoutRoot\(\);/.test(require('./checkkit').part('sysedlayout.js')) && /var lroot = layoutRoot\(\), list = Array\.isArray\(lroot\[cfg\.key\]\)/.test(layH) && !/draft\.sheet\[cfg\.key\]/.test(layH)
            && /var draft = null, dirty = false, tab = 'fields', errorsById = \{\}, warningsById = \{\}, layoutView = 'sheet';/.test(shH1) && /tabSet\(which \|\| 'fields'\); layoutViewSet\('sheet'\);/.test(require('./checkkit').part('sysedbox.js'))
            && /if \(b\.closest && b\.closest\('#sysLayoutView'\)[^\n]*renderLayout\(\); \} return true; \}/.test(clickH) && !/if \(b\.closest && b\.closest\('#sysLayoutView'\)[^\n]*markDirty/.test(clickH)
            && iHa > 0 && iHc > iHa && iSa > iHc && iSc > iSa && /if \(keepHud\) draft\.sheet\.hud = keepHud;/.test(clickH) && /if \(keepHud\) \{ draft\.sheet\.hud = keepHud;/.test(clickH) && /the Sheet look box and the HUD are kept/.test(clickH)
            && /var hd = draft\.sheet\.hud; if \(hd && typeof hd === 'object'\)/.test(layH) && /var targetsG = pinTargetsAll\(draft\.sheet\);/.test(layH)
            && inputH.indexOf("contains('sys-hud-title')") > 0 && inputH.indexOf("contains('sys-hud-title')") < inputH.indexOf('if (!lsec)') && /if \(!hudOn\) pinBox\(\{ key: 'identity'/.test(layH)
            && /var pv = layoutView === 'hud' \? hudView\(clean\) : clean;/.test(prevH) && /view: layoutView, preview: true, targets: pinTargetsAll\(clean\.sheet\)/.test(prevH) && /box\.classList\.toggle\('sys-layout-preview-hud', layoutView === 'hud'\)/.test(prevH), j({ iHa, iHc, iSa, iSc }));
        const htmlH1 = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), cssH1 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const iBlk = cssH1.indexOf('/* ---- Stage 6 HUD frame:'), iPort = cssH1.indexOf('#sheetPanel.sheet-has-headportrait #sheetTitle');
        check('HUD frame HF1: the Sheet | HUD switch leads the Layout toolbar; the note is addressable; the CSS lives in one block after the look fold\'s; Help names the switch',
            /<div class="sys-toolbar"><span id="sysLayoutView" class="sys-seg"[^>]*><button class="tool ghost sys-btn on" data-view="sheet" aria-pressed="true">Sheet<\/button><button class="tool ghost sys-btn" data-view="hud" aria-pressed="false">HUD<\/button><\/span><button class="tool" id="sysAddSection"/.test(htmlH1) && /<span class="sys-note" id="sysLayoutNote">/.test(htmlH1)
            && iPort > 0 && iBlk > iPort && !/\/\* Stage 6 look fold \(L/.test(cssH1.slice(iBlk)) && /\.sys-seg \{/.test(cssH1.slice(iBlk)) && /\.sys-layout-preview-hud \{ max-width: 470px; \}/.test(cssH1.slice(iBlk)) && /The <b>Sheet \| HUD<\/b> switch at the top of the tab lays out a second view, the <b>HUD<\/b>/.test(htmlH1));
    }
    /* ---- Stage 6 HUD frame (HF2a): the HUD window — one per character, drawn from sys.sheet.hud by the sheet's own renderer ---- */
    {
        const sh2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), html2 = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const css2 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), tut2 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n'), wb2 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        const hudSlice = sh2.slice(sh2.indexOf('// [systemcheck:hud-start]'), sh2.indexOf('// [systemcheck:hud-end]'));
        const tpl = (html2.match(/<template id="hudTpl">([\s\S]*?)<\/template>/) || [])[1] || '';
        const iSheet = html2.indexOf('<div id="sheetPanel"'), iLayer = html2.indexOf('<div id="hudLayer"></div>'), iDoc = html2.indexOf('<div id="docPanel"');
        check('HUD frame HF2a: the markup — #hudLayer and the template sit between the sheet panel and the doc panel (the handbook still lands on top by DOM order); the template holds the head, body, foot and grip and no id; the sheet head\'s HUD button starts hidden',
            ['hud-panel', 'hud-head', 'hud-portrait', 'hud-name', 'hud-sub', 'hud-sheet', 'hud-close', 'hud-body', 'hud-foot', 'hud-resize'].every(c => new RegExp('class="[^"]*\\b' + c + '\\b').test(tpl)) && !/\sid=/.test(tpl)
            && iSheet > 0 && iLayer > iSheet && html2.indexOf('<template id="hudTpl">') > iLayer && iDoc > html2.indexOf('<template id="hudTpl">')
            && /<button class="tool ghost notepad-btn" id="sheetHud" title="Open the HUD" style="display:none;">/.test(html2), j({ iSheet, iLayer, iDoc }));
        check('HUD frame HF2a: the HUD slice writes no markup; one window per character (opening it again brings it forward); openHud gates on the character id, canOpen and a HUD with content; a tab is checked before it reaches the body; the panel\'s character id is checked before it is stored; the place and size are one record',
            hudSlice.length > 3000 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(hudSlice)
            && /function openHud\(charId, opts\) \{\n    if \(!HUD_CID\.test\(String\(charId\)\)\) return;\n    if \(!canOpen\(charId\)\) \{[^\n]*\n    if \(!hudHasContent\(systemOf\(getActiveCampaign\(\)\)\)\) \{/.test(hudSlice)
            && /if \(opts && typeof opts\.tab === 'string' && HUD_TAB\.test\(opts\.tab\)\) v\.body\.dataset\.wpTab = opts\.tab;/.test(hudSlice) && /HUD_TAB = \/\^t_\[A-Za-z0-9_\]\{1,24\}\$\//.test(hudSlice)
            && /!HUD_CID\.test\(String\(charId\)\)\) return null;\n    var p = tpl\.content\.firstElementChild\.cloneNode\(true\); p\.dataset\.cid = charId;/.test(hudSlice)
            && /var v = huds\[charId\];\n    if \(!v\) \{/.test(hudSlice) && (hudSlice.match(/setPref\('wp_hudPanel'/g) || []).length === 2 && !/wp_sheetPanel/.test(hudSlice)
            && /var sys = hudView\(full\)/.test(hudSlice) && /\{ campId: camp\.id, view: 'hud', preview: false, targets: pinTargetsAll\(full\.sheet\) \}/.test(hudSlice) && /v\.name\.textContent = c\.name; v\.sub\.textContent = /.test(hudSlice));
        {   // 1.6.2 (the owner, by prompt: "Last opened in front"): Table Chat and the dice roller are boxes of the one order; a box covered by one in front comes forward at its button (boxCovered, wpBoxFront)
            const zS = sh2.slice(sh2.indexOf('var _zTop = 9000;'), sh2.indexOf('// Where a handbook page opens beside')), R = (x, y, w, h) => () => ({ left: x, top: y, right: x + w, bottom: y + h });
            const box = (n, r, z, disp, cls) => ({ n, style: { zIndex: z, display: disp || 'flex' }, className: cls || '', getBoundingClientRect: r });
            const chat = box('chat', R(700, 600, 300, 200), '9001'), sheet = box('sheet', R(600, 100, 450, 800), '9002'), fx = box('fx', R(10, 10, 100, 100), '9003'), dice = box('dice', R(200, 600, 300, 200), '9001');
            const reg = { chatPanel: chat, sheetPanel: sheet, fxPanel: fx, dicePanel: dice }, W = {};
            const Zb = new Function('ui', 'huds', 'window', zS + '\nreturn { covered: boxCovered, top: function() { return _zTop; }, set: function(v) { _zTop = v; } };')(id => reg[id] || null, Object.create(null), W);
            Zb.set(9003);
            const c1 = Zb.covered(chat), d1 = Zb.covered(dice), f1 = W.wpBoxFront(chat), chatTop = chat.style.zIndex === String(Zb.top()), c2 = Zb.covered(chat), f2 = W.wpBoxFront(chat);
            chat.style.zIndex = '9001'; const backC = Zb.covered(chat) === true; sheet.className = 'wp-away'; const awayNo = backC && Zb.covered(chat) === false; sheet.className = ''; sheet.style.display = 'none'; const goneNo = Zb.covered(chat) === false;
            check('Table Chat and the dice roller in the boxes\' one order (1.6.2, the owner, by prompt: "Last opened in front"; sheets.js boxCovered and wpBoxFront, run for real): both are in Z_BOXES and start one below the first place a box is raised to, so their first showing raises them; a box is covered only where a box that shows in front of it overlaps it, never by one put away or closed nor one beside it; its button then brings it in front (true), and once in front the next press closes it (false); the chat and the roller buttons ask it before closing',
                c1 === true && d1 === false && f1 === true && chatTop && c2 === false && f2 === false && awayNo && goneNo
                && /var Z_BOXES = \[[^\]]*'chatPanel', 'dicePanel'\]/.test(sh2) && /<div id="chatPanel" style="[^"]*z-index:8999;/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')) && /#dicePanel \{ position: fixed; z-index: 8999;/.test(css2),
                JSON.stringify([c1, d1, f1, chatTop, c2, f2, awayNo, goneNo]));
        }
        // raisePanel / floatPanels / raiseWire / focusPanel / hudFocus, run for real
        const zSrc = sh2.slice(sh2.indexOf('var _zTop = 9000;'), sh2.indexOf('// Where a handbook page opens beside'));
        const mkP = n => ({ n, style: { zIndex: '' } }), sp = mkP('sheet'), dp = mkP('doc'), h1 = mkP('hud1'), h2 = mkP('hud2'), hudsZ = Object.create(null);
        const boxP = { soundPanel: mkP('sound'), musicPanel: mkP('music'), videoPanel: mkP('video'), fxPanel: mkP('fx'), notepadPanel: mkP('notepad') };
        const Z = new Function('ui', 'huds', zSrc + '\nreturn { raisePanel: raisePanel, floatPanels: floatPanels, raiseWire: raiseWire, focusPanel: focusPanel, hudFocus: hudFocus, top: function() { return _zTop; } };')(id => id === 'sheetPanel' ? sp : id === 'docPanel' ? dp : boxP[id] || null, hudsZ);
        // 1.5.4 (found live): with no HUD open a box comes forward too, Effects over the sheet and the page panel that stand later in the page
        Z.raisePanel(boxP.fxPanel); const noHud = boxP.fxPanel.style.zIndex === '9001' && sp.style.zIndex === '' && dp.style.zIndex === '' && Z.top() === 9001;
        Z.raisePanel(sp); Z.raisePanel(sp); const zqAgain = sp.style.zIndex === '9002' && Z.top() === 9002;   // the box in front raised zqAgain stays as it is
        hudsZ.c_a = { panel: h1 }; Z.raisePanel(sp); Z.raisePanel(h1); Z.raisePanel(dp);
        const order0 = [sp, h1, dp].sort((a, b) => +a.style.zIndex - +b.style.zIndex).map(p => p.n).join(',');
        let maxZ = 0, topOk = true; const seq = [sp, h1, dp];
        for (let k = 0; k < 1000; k++) { const p = seq[k % 3]; Z.raisePanel(p); maxZ = Math.max(maxZ, +sp.style.zIndex, +dp.style.zIndex, +h1.style.zIndex); if (+p.style.zIndex !== Math.max(+sp.style.zIndex, +dp.style.zIndex, +h1.style.zIndex)) topOk = false; }
        const all7 = [sp, dp, h1].concat(Object.values(boxP)); let topAll = true, maxAll = 0;
        for (let k = 0; k < 1500; k++) { const p = all7[(k * 5) % all7.length]; Z.raisePanel(p); const zs = all7.map(x => +x.style.zIndex || 9000); maxAll = Math.max(maxAll, ...zs); if ((+p.style.zIndex || 9000) !== Math.max(...zs) || zs.filter(z => z === +p.style.zIndex).length !== 1) topAll = false; }
        Z.raisePanel(dp); Z.raisePanel(sp); const before = [h1, dp, sp].map(p => +p.style.zIndex); for (let k = 0; k < 500; k++) Z.raisePanel(k % 2 ? h1 : h1 === h1 ? h1 : h1);
        const keptOrder = +dp.style.zIndex < +sp.style.zIndex;   // raising only the HUD, renumbering keeps the others' order (doc under sheet)
        hudsZ.c_b = { panel: h2 }; const fl = Z.floatPanels().map(p => p.n).join(',');
        // a box comes forward when pressed (a capture listener, so before its own controls) and when its own module shows it, never at a move
        const mkBox = n => ({ n, style: { zIndex: '', display: 'none' }, ls: [], addEventListener(t, f, c) { this.ls.push([t, f, c]); } }), obs = [];
        function MO(cb) { this.cb = cb; obs.push(this); } MO.prototype.observe = function(t, o) { this.t = t; this.o = o; };
        const wb = mkBox('wired'); Z.raiseWire(wb, MO); const mo = obs[0];
        const press = wb.ls.length === 1 && wb.ls[0][0] === 'pointerdown' && wb.ls[0][2] === true, seen = !!mo && mo.t === wb && j(mo.o) === j({ attributes: true, attributeFilter: ['style', 'class'] });
        Z.raisePanel(sp); wb.style.display = 'flex'; mo.cb([]); const shownUp = +wb.style.zIndex === Z.top();
        Z.raisePanel(sp); const wz = wb.style.zIndex; wb.style.left = '40px'; mo.cb([]); const movedStill = wb.style.zIndex === wz && sp.style.zIndex === String(Z.top());   // still up: a move is no showing
        wb.ls[0][1](); const pressedUp = +wb.style.zIndex === Z.top();
        Z.raisePanel(sp); wb.style.display = 'none'; mo.cb([]); wb.style.display = 'flex'; mo.cb([]); let reshown = +wb.style.zIndex === Z.top();
        Z.raisePanel(sp); wb.className = 'x wp-away'; mo.cb([]); const awayStill = +wb.style.zIndex !== Z.top(); wb.className = 'x'; mo.cb([]); reshown = reshown && awayStill && +wb.style.zIndex === Z.top();   // 1.6.2, found live: put away with floats.js's class and back is a showing too (Table Chat)
        const nob = mkBox('noMO'); Z.raiseWire(nob, undefined); Z.raiseWire(null, MO); Z.raiseWire({ style: {} }, MO); const quiet = nob.ls.length === 1 && obs.length === 1;
        // the window a button opens takes the focus, the panel itself, once marked to take it and never scrolled to
        const mkF = has => { const e = { attrs: has ? { tabindex: '0' } : {}, focused: [], ls: [], hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; }, focus(o) { this.focused.push(o); },
            addEventListener(t, f) { this.ls.push([t, f]); }, removeEventListener(t, f) { this.ls = this.ls.filter(l => !(l[0] === t && l[1] === f)); }, fire(t) { this.ls.filter(l => l[0] === t).forEach(l => l[1]()); } }; return e; };
        const f1 = mkF(false), f2 = mkF(true); Z.focusPanel(f1); Z.focusPanel(f1); const held = [f1.attrs.tabindex, f1.ls.length]; f1.fire('blur'); const let1 = ['tabindex' in f1.attrs, f1.ls.length];
        Z.focusPanel(f1); const again1 = [f1.attrs.tabindex, f1.ls.length]; Z.focusPanel(f2); f2.fire('blur'); Z.focusPanel(null); Z.focusPanel({});
        // marked to take the focus while it holds it, once, and let go of at its blur, so a press on its own ground later focuses nothing; a panel that takes the focus of itself is left as it is
        const focusOk = j(held) === j(['-1', 1]) && j(let1) === j([false, 0]) && j(again1) === j(['-1', 1]) && j(f1.focused) === j([{ preventScroll: true }, { preventScroll: true }, { preventScroll: true }]) && f2.attrs.tabindex === '0' && f2.ls.length === 0 && f2.focused.length === 1;
        const fh = mkF(false); hudsZ.c_f = { panel: fh }; Z.hudFocus('c_f'); Z.hudFocus('c_none'); const hudF = fh.focused.length === 1;
        // the two buttons that open the other window, their handlers run for real: the sheet's HUD button and the HUD's Sheet button
        const lineOf = s => { const i = sh2.indexOf(s); return i < 0 ? '' : sh2.slice(i, sh2.indexOf('\n', i)); };
        const hdLine = lineOf("var hdB = ui('sheetHud'); if (hdB) hdB.addEventListener('click', function() {"), hsLine = lineOf("q('hud-sheet').addEventListener('click', function() {");
        const runHd = sOpen => { const bt = mkBox('btn'), hp = mkF(false), hz = Object.create(null), opened = []; new Function('ui', 'huds', 'sheetOpen', 'openHud', zSrc + '\n' + hdLine)(id => id === 'sheetHud' ? bt : null, hz, sOpen, id => { opened.push(id); hz[id] = { panel: hp }; }); const cl = bt.ls.find(l => l[0] === 'click'); if (cl) cl[1](); return [opened.join(), hp.focused.length, hp.attrs.tabindex || '']; };
        const runHs = ok => { const bt = mkBox('btn'), spF = mkF(false), opened = []; new Function('ui', 'huds', 'q', 'charId', 'R', zSrc + '\nvar sheetOpen = null; function openSheet(id) { R.push(id); if (R.ok) sheetOpen = id; }\n' + hsLine)(id => id === 'sheetPanel' ? spF : null, Object.create(null), c => c === 'hud-sheet' ? bt : null, 'c_a', Object.assign(opened, { ok })); const cl = bt.ls.find(l => l[0] === 'click'); if (cl) cl[1](); return [opened.join(), spF.focused.length]; };
        const hdR = [runHd('c_a'), runHd(null)], hsR = [runHs(true), runHs(false)];
        const fm = /\nvar FLOAT_IDS = (\[[^\]]*\]);/.exec(fs.readFileSync(path.join(app, 'scripts', 'floats.js'), 'utf8').replace(/\r\n/g, '\n')), zb = /\nvar Z_BOXES = (\[[^\]]*\]);/.exec(sh2);
        const boxesAll = !!fm && !!zb && j(JSON.parse(fm[1].replace(/'/g, '"')).slice().sort()) === j(JSON.parse(zb[1].replace(/'/g, '"')).slice().sort());   // 1.6.2 (the owner, by prompt: "Last opened in front"): Table Chat and the dice roller are among them, moved on purpose
        check('HUD frame HF2a: click-to-raise (the owner\'s Q5), 1.5.4 for every floating box with or without a HUD (found live: Effects, Sound, Music, Video and the notepad came up under an open sheet or page panel, and a press left them there) — a box raised with no HUD open comes in front; the raised panel is on top, 1000 raises never pass 9400, renumbering keeps the others\' order; the seven boxes at the panels\' level and every HUD are floating panels, the same boxes floats.js names, Table Chat and the dice roller among them since 1.6.2 (the owner, by prompt: "Last opened in front", moved on purpose); a box comes forward when pressed (in the capture phase) and when shown, never at a move; closing the last HUD leaves the stacking as it is',
            noHud && zqAgain && order0 === 'sheet,hud1,doc' && topOk && maxZ <= 9400 && maxZ > 9000 && keptOrder && topAll && maxAll <= 9400 && fl === 'sheet,doc,sound,music,video,fx,notepad,hud1,hud2' && boxesAll && before.length === 3
            && press && seen && shownUp && movedStill && pressedUp && reshown && quiet && !/resetZ/.test(sh2) && /delete huds\[charId\]; if \(v\.panel && v\.panel\.parentNode\) v\.panel\.parentNode\.removeChild\(v\.panel\); \}\n/.test(sh2)
            && (sh2.match(/\n    Z_BOXES\.forEach\(function\(id\) \{ raiseWire\(ui\(id\), window\.MutationObserver\); \}\);/g) || []).length === 1 && /\n  #videoPanel\.vid-max \{[^}\n]*z-index: 100001 !important; \}/.test(css2),
            j({ noHud, zqAgain, order0, topOk, maxZ, keptOrder, topAll, maxAll, fl, boxesAll, press, seen, shownUp, movedStill, pressedUp, reshown, quiet }));
        check('HUD frame HF2a, 1.5.4 (found live: the HUD opened from the sheet left the focus on the sheet, so Escape closed the sheet behind and left the HUD): the window a button opens takes the focus — the sheet\'s HUD button focuses the HUD it opened and the HUD\'s Sheet button the sheet (their handlers run for real), the panel itself, marked to take it once and only while it holds it (a press on its own ground later focuses nothing, as before) and never scrolled to, a panel that already takes it left as it is; nothing focused where nothing opened; the HUD button on the sheet asks the same; the panels show no ring of their own for it',
            focusOk && hudF && j(hdR) === j([['c_a', 1, '-1'], ['', 0, '']]) && j(hsR) === j([['c_a', 1], ['c_a', 0]])
            && /openHud\(c\.id, pl\.tab \? \{ tab: pl\.tab \} : null\); if \(typeof hudFocus === 'function'\) hudFocus\(c\.id\); \}\);/.test(sh2) && /\n  #sheetPanel:focus, \.hud-panel:focus \{ outline: none; \}/.test(css2),
            j({ focusOk, hudF, hdR, hsR }));
        // 1.5.4: the GM's sheet in a window of its own follows its token (popout.js tickSheet, sliced by its popsheet markers and run for real
        // on plain objects): it redraws when the character or the system changes, and when what the sheet reads of its token does
        const poS = fs.readFileSync(path.join(app, 'scripts', 'popout.js'), 'utf8'), poA = poS.indexOf('// [systemcheck:popsheet-start]'), poZ = poS.indexOf('// [systemcheck:popsheet-end]');
        const tickSrc = poA > 0 && poZ > poA ? poS.slice(poA, poZ) : '';
        const runPop = (withSig, steps) => {
            const R = { renders: 0 }, body = { className: '', scrollTop: 0 }, st = {}, doc = { title: '' };
            const WS = { renderSheetInto: () => { R.renders++; return { title: 'Bren' }; }, charById: (id, camp) => (camp.chars || []).find(c => c.id === id) || null };
            if (withSig) WS.dialSig = (id, camp) => { const t = camp.items.m1.whiteboard.find(w => w.charId === id); return t ? [t.facing, t.posture, t.elevation].join('|') : ''; };   // a stand-in for the sheet's own dialSigOf
            const tick = new Function('body', 'arg', 'msg', 'titleEl', 'state', 'window', 'document', "var lastSig = '';\n" + tickSrc + '\nreturn tickSheet;')(body, 'k1/c_a', () => {}, { textContent: '' }, st, { wpSheets: WS }, doc);
            const tok = { id: 't1', charId: 'c_a', facing: 0, posture: 'standing', elevation: 0 }, data = { activeCampaignId: 'k1', campaigns: { k1: { id: 'k1', system: { v: 1 }, chars: [{ id: 'c_a', name: 'Bren' }], items: { m1: { type: 'map', whiteboard: [tok] } } } } };
            return steps.map(f => { f(tok, data); tick(JSON.parse(JSON.stringify(data))); return R.renders; }).concat([doc.title, body.className, st.appState && st.appState.activeCampaignId]);
        };
        const popSteps = [() => {}, () => {}, t => { t.facing = 90; }, () => {}, t => { t.posture = 'prone'; }, t => { t.elevation = 2; }, t => { t.x = 400; }, (t, d) => { d.campaigns.k1.chars[0].name = 'Bren Hal'; }];
        const popR = runPop(true, popSteps), popOld = runPop(false, popSteps);
        check('a character sheet in a window of its own follows its token (1.5.4, backlog Stage 5h\'s known limit, the GM\'s alone; popout.js tickSheet, sliced and run for real): it draws once, not again while nothing changes, again when the token turns, takes another posture or another height, as the sheet reads them (window.wpSheets.dialSig, the sheet\'s own dialSigOf for that character), not for a move the sheet reads nothing of, and when the character changes; a sheet module with no dialSig redraws for the character alone, as before; the sheet exports it; 1.5.4 (a field\'s display unit and the reconcile of the unit switch): dialSigOf names the viewer\'s Measurement system (unitSig), so the window follows the setting too',
            j(popR) === j([1, 1, 2, 2, 3, 4, 4, 5, 'Waypoint \u2014 Bren', 'sheet-view', 'k1']) && j(popOld) === j([1, 1, 1, 1, 1, 1, 1, 2, 'Waypoint \u2014 Bren', 'sheet-view', 'k1'])
            && /\nfunction dialSigFor\(charId, camp\) \{ var c = charById\(charId, camp\); return c \? dialSigOf\(c, camp\) : ''; \}/.test(sh2) && /tokenCtxFor: tokenCtxFor, dialSig: dialSigFor, /.test(sh2) && /, typeof unitSig === 'function' \? unitSig\(\) : ''\]\.join\('#'\);   \/\/ 1\.5\.4: the viewer's Measurement system/.test(sh2)
            && /fc \? fc\.deg \+ '\|' \+ fc\.sides \+ '\|' \+ fc\.threats\.join\(','\) : '', st \? st\.posture \+ '\|' \+ st\.elevation : ''/.test(sh2),
            j({ popR, popOld, slice: tickSrc.length }));
        // renderViews, run for real
        const rvSrc = sh2.slice(sh2.indexOf('function renderViews(charId, skip) {'), sh2.indexOf('// A token turned (tokenTurned)'));
        const painted = [], sb = { n: 'sheetBody' }, hb1 = { n: 'b1' }, hb2 = { n: 'b2' }, hudsV = Object.create(null); hudsV.c_a = { body: hb1 }; hudsV.c_b = { body: hb2 };
        const RV = so => new Function('ui', 'huds', 'sheetOpen', 'renderSheet', 'renderHud', rvSrc + '\nreturn renderViews;')(() => sb, hudsV, so, () => painted.push('sheet'), id => painted.push(id));
        const run = (so, ...a) => { painted.length = 0; RV(so)(...a); return painted.join(','); };
        const rv = [run('c_a', null), run('c_a'), run('c_b', 'c_a'), run('c_a', 'c_a'), run('c_a', 'c_a', sb), run('c_a', null, hb2), run(null, null)];
        check('HUD frame HF2a: renderViews — null or nothing paints every view; a character paints its sheet and its HUD only; the body that just painted itself is skipped',
            j(rv) === j(['sheet,c_a,c_b', 'sheet,c_a,c_b', 'c_a', 'sheet,c_a', 'c_a', 'sheet,c_a', 'c_a,c_b']), j(rv));
        const body = h => { const i = sh2.indexOf(h); return i < 0 ? '' : sh2.slice(i, sh2.indexOf('\n}\n', i)); };
        const commits = ['function commit(c, f, value) {', 'function commitEffect(c, f, q) {', 'function commitItem(c, f, q) {'].map(body);
        check('HUD frame HF2a: one refresh path — no sheetOpen guard wraps a repaint any more; a change, an Undo expiring, a result, a save, a pin in another window, the feature and the campaign reach the HUDs with or without a sheet; a lost or deleted character closes its HUD (one notice)',
            !/sheetOpen[^;\n]{0,40}\)\s*(renderViews|renderSheet)\(/.test(sh2.replace(/function renderViews[\s\S]*?\n\}\n/, '')) && commits.every(b => b.length > 100 && !/renderSheet\(\)/.test(b) && /renderViews\(c\.id\)/.test(b))
            && /if \(window\.appRender\) boardRedraw\(c\.id, whole \|\| posA\.length > 0 \|\| ownM > 0\);[^\n]*\n    renderViews\(c\.id\);/.test(body('function afterCharChange(')) && /delete _undo\[k\]; renderViews\(c\.id\);/.test(sh2)
            && /'That value was not accepted\.'\); renderViews\(null\); \}/.test(sh2) && /renderAll\(\); renderViews\(null\);/.test(sh2) && /if \(!e \|\| e\.key !== PIN_KEY\) return; renderViews\(null\);/.test(sh2)
            && /if \(!featureOn\(\)\) \{ if \(sheetOpen\) closeSheet\(\); closeHuds\(\); \}/.test(sh2) && /if \(_lastCamp !== null && id !== _lastCamp\) \{ if \(sheetOpen\) closeSheet\(\); closeHuds\(\); \}/.test(sh2)
            && /if \(sheetOpen === id\) closeSheet\(\);\n    closeHud\(id\);/.test(sh2) && /if \(typeof id === 'string' && huds\[id\]\) \{ closeHud\(id\); shown = true; \}/.test(sh2)
            && /if \(isClient\(\)\) Object\.keys\(huds\)\.forEach\(function\(hid\) \{[^\n]*closeHud\(hid\); if \(!lost\[hid\]\)/.test(sh2) && /lost\[gone\.id\] = 1; closeSheet\(\);/.test(sh2)
            && /if \(!\(ctx\.vctx && ctx\.vctx\.preview\)\) renderViews\(ctx\.c\.id, ctx\.body\);/.test(sh2) && /var hp = tb\.closest\('\.hud-panel'\); if \(hp\) closeHud\(hp\.dataset\.cid\); else closeSheet\(\);/.test(sh2)
            && /Object\.keys\(huds\)\.forEach\(function\(id\) \{ syncFramePad\(huds\[id\]\.body\); \}\)/.test(sh2) && /if \(!sheetOpen && !Object\.keys\(huds\)\.length\) return false;/.test(sh2) && /sh\.sections\.concat\(sh\.hud && Array\.isArray\(sh\.hud\.sections\) \? sh\.hud\.sections : \[\]\)/.test(sh2));
        const tt = body('function tokenTurned(tokId, final) {'), rf = body('function redrawForFacing(v) {');
        check('HUD frame HF2a: a turn reaches every HUD first, whatever the sheet does; the dial and stance swap is one function for both; a HUD\'s redraw waits for its own focus and repaints the HUD, with its own timer',
            /^function tokenTurned\(tokId, final\) \{\n    try \{ Object\.keys\(huds\)\.forEach\(function\(id\) \{ turnView\(huds\[id\], final\); \}\); \} catch \(e\) \{\}[^\n]*\n    try \{ if \(typeof rulerUnitShown === 'function'[^\n]*\n    try \{\n        if \(!sheetOpen\) return;/.test(tt) && /swapTokenControls\(p, c, camp\);/.test(tt) && /swapTokenControls\(v\.panel, c, camp\);/.test(hudSlice)
            && sh2.indexOf('function swapTokenControls(') > sh2.indexOf('function facingNode(') && sh2.indexOf('function swapTokenControls(') < sh2.indexOf('function tokenTurned(')
            && /var body = v \? v\.body : ui\('sheetBody'\)/.test(rf) && /setTimeout\(function\(\) \{ redrawForFacing\(v\); \}, 0\)/.test(rf) && /if \(v\) \{ if \(huds\[v\.charId\] === v\) renderHud\(v\.charId\); \} else renderSheet\(\);/.test(rf) && /if \(v\) v\.redraw = tmr; else _dialRedraw = tmr;/.test(rf));
        check('HUD frame HF2a: the entries and exports — the sheet head\'s HUD button shows only for a HUD they can open; the sheet and the doc panel come forward when clicked or shown; a page opens beside the view in front; window.wpSheets carries openHud/closeHud/closeHuds/hudFor and renderSheet repaints every view; a click inside a HUD keeps the map\'s selection',
            /var hOn = hudHasContent\(sys\) && canOpen\(c\.id\); hb\.style\.display = hOn \? '' : 'none';/.test(sh2) && /if \(hdB\) hdB\.addEventListener\('click', function\(\) \{ var id = sheetOpen; if \(!id\) return; openHud\(id\); hudFocus\(id\); \}\);/.test(sh2)
            && /p\.addEventListener\('pointerdown', function\(\) \{ raisePanel\(p\); \}, true\);/.test(sh2) && /Z_BOXES\.forEach\(function\(id\) \{ raiseWire\(ui\(id\), window\.MutationObserver\); \}\);/.test(sh2) && /placeSheet\(\); raisePanel\(p\); renderSheet\(\);/.test(sh2)
            && /var dp = ui\('docPanel'\), sp = frontView\(\);/.test(sh2) && /\n    raisePanel\(dp\);/.test(sh2)
            && /openHud: openHud, closeHud: closeHud, closeHuds: closeHuds, hudFor: hudFor,/.test(sh2) && /renderSheet: renderViews,/.test(sh2) && !/renderSheet: renderSheet/.test(sh2)
            && /\[id\$="Modal"\], #sheetPanel, \.hud-panel, #soundPanel,/.test(wb2));
        const iBlk2 = css2.indexOf('/* ---- Stage 6 HUD frame:'), blk = css2.slice(iBlk2);
        check('HUD frame HF2a: the window\'s CSS lives in the HUD block (after the look fold\'s): the panel, the grip strip, the twins of the sheet panel\'s field rules, the palette on its head, GM-only fields hidden from players as on the sheet; the glyph files exist',
            iBlk2 > 0 && /\.hud-panel \{ position: fixed;[^}]*width: 470px;[^}]*max-height: min\(760px, calc\(100vh - 140px\)\);/.test(blk) && /\.hud-panel\[style\*="height"\] \{ max-height: none; \}/.test(css0911()) && /\.hud-panel:not\(\[style\*="height"\]\) > \.hud-body:has\(\+ \.hud-foot:not\(:empty\)\) \{ flex-basis: auto; \}/.test(css0911()) && /\.hud-foot:empty \{ display: none; \}/.test(blk) && /body\.net-client \.hud-panel \.sheet-gm \{ display: none; \}/.test(blk)
            && /\.hud-panel input\.field, \.hud-panel select\.field, \.hud-panel textarea\.field \{ padding: 3px 6px; font-size: 12\.5px; \}/.test(blk) && /\.hud-panel\.sheet-paletted \.hud-name \{ color: var\(--sheet-primary\); \}/.test(blk)
            && ['wave-square'].every(g => fs.existsSync(path.join(app, 'assets', 'icons', 'fa', 'solid', g + '.svg')) && blk.indexOf('assets/icons/fa/solid/' + g + '.svg') > 0) && !/Stage 6 look fold \(L/.test(blk)
            && /\.hud-ico-user \{ -webkit-mask-image: url\("data:image\/svg\+xml,%3Csvg xmlns='http:\/\/www\.w3\.org\/2000\/svg' viewBox='8 16 84 84'%3E%3Ccircle cx='50' cy='40' r='24'\/%3E%3Cpath d='M24 70 L76 70 L92 100 L8 100 Z'\/%3E%3C\/svg%3E"\); mask-image: url\("data:image\/svg\+xml,/.test(blk));   // the sheet button: the default avatar's figure (owner, 2026-09-26)
        // the tour: its seed, run for real on an older campaign, and the step that opens its own target
        const fnT = name => { const i = tut2.indexOf('function ' + name + '('); let d = 0; const k = tut2.indexOf('{', i); for (let p = k; p < tut2.length; p++) { if (tut2[p] === '{') d++; else if (tut2[p] === '}') { d--; if (d === 0) return tut2.slice(i, p + 1); } } return ''; };
        const T = new Function(['tutorialPostures', 'tutorialEffects', 'tutorialHud', 'tutorialSenses', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const older = { system: T.sys(), chars: { c_tut_bren: T.ch('/x/') }, items: {} }; delete older.system.sheet.hud;
        const pre = JSON.parse(JSON.stringify(older)), ch1 = T.ensure(older), post = JSON.parse(JSON.stringify(older)); delete post.system.sheet.hud; delete post.tutorialSeed;   // HF4a: the one-shot seed marker, checked below
        const built = { system: T.sys(), chars: {}, items: {} }; delete built.system.sheet.hud; built.system.sheet.sections = [{ id: 's_mine', title: 'Mine', fields: [] }]; T.ensure(built);
        const again = T.ensure(older);
        const noCb = { system: T.sys(), chars: { c_tut_bren: T.ch('/x/') }, items: {} }; delete noCb.system.combat; const chCb = T.ensure(noCb), strCb = { system: T.sys(), chars: {}, items: {} }; strCb.system.combat = 'none'; T.ensure(strCb);
        check('lighting L6: a Tutorial whose system holds no combat block is given the whole block a new Tutorial has, its light rules included (the one the upgrade of the lights gives too), each its own copy',
            chCb === true && j(noCb.system.combat) === j(T.sys().combat) && j(strCb.system.combat) === j(T.sys().combat) && !!noCb.system.combat.light && noCb.system.combat.light.presets.length === 2 && noCb.system.combat !== strCb.system.combat
            && j(older.system.combat) === j(T.sys().combat), j([chCb, noCb.system.combat]));
        check('HUD frame HF2a: the tour\'s HUD seed — an older Tutorial (band present, no HUD, no sections) gains exactly the HUD and nothing else, once; a layout someone built there is left alone; the seed validates',
            ch1 === true && j(older.system.sheet.hud) === j(T.hud()) && j(post) === j(pre) && older.tutorialSeed === 2 && again === false && !('hud' in built.system.sheet)
            && validateSystem(cleanSystem(T.sys(), { F, gmView: true }), F).errors.length === 0 && S.hudHasContent(cleanSystem(T.sys(), { F, gmView: false })), j({ ch1, again }));
        check('HUD frame HF2a: the tour step opens its own target (show() does not skip it for a missing target before its setup runs); every other step starts with no HUD floating, and ending the tour closes them',
            /STEPS\[i\]\.target && !STEPS\[i\]\.opens && !document\.querySelector\(STEPS\[i\]\.target\)/.test(tut2) && /if \(!step\.opens && window\.wpSheets && window\.wpSheets\.closeHuds\) window\.wpSheets\.closeHuds\(\);[^\n]*\n    try \{ if \(step\.before\) step\.before\(\); \}/.test(tut2)
            && /\{ target: '#hudLayer \.hud-panel', opens: true, title: 'The HUD',/.test(tut2) && /window\.wpSheets\.openSheet\('c_tut_bren'\); if \(window\.wpSheets\.openHud\) window\.wpSheets\.openHud\('c_tut_bren'\);/.test(tut2)
            && /window\.wpSheets\.closeSheet\(\); if \(window\.wpSheets\.closeHuds\) window\.wpSheets\.closeHuds\(\); window\.wpSheets\.close\(true\);/.test(tut2)
            && tut2.indexOf("{ target: '#hudLayer .hud-panel'") > tut2.indexOf("{ target: '#sheetPanel', title: 'A character sheet'") && tut2.indexOf("{ target: '#hudLayer .hud-panel'") < tut2.indexOf("target: '#netBtn'")
            && /<li><b>The HUD\.<\/b> When the saved system has a HUD/.test(html2));
    }
    /* ---- Stage 6 HUD frame (HF2b review): hudFor run for real, the placement's dispatch and editor, a tab asked of an open HUD, window stacking ---- */
    {
        const sh4 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx4 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const hfSrc = sh4.slice(sh4.indexOf('function hudFor(charId) {'), sh4.indexOf('function openHud('));
        const cidRe = new Function('return ' + ((sh4.match(/HUD_CID = (\/[^\n]*?\/),/) || [])[1] || 'null'))();
        const HF = (can, sys) => new Function('HUD_CID', 'canOpen', 'hudHasContent', 'systemOf', 'getActiveCampaign', hfSrc + '\nreturn hudFor;')(cidRe, () => can, S.hudHasContent, () => sys, () => ({}));
        const gD4 = cleanSystem(fx4('hud-d20'), { F, gmView: true }), lk = fx4('look-d20'); lk.sheet.hud = { title: 'Only a title' };
        const bare4 = () => ({ v: 1, name: 'B', fields: [{ id: 'f_a', key: 'A', label: 'A', kind: 'number' }], rolls: [] }), lk4 = bare4(); lk4.sheet = { hud: { title: 'Only a title' } };   // 1.6.2: a system with a pool has the plain default, so these are bare, moved on purpose
        const titleOnly = cleanSystem(lk4, { F, gmView: true }), noHud = cleanSystem(bare4(), { F, gmView: true }), autoHud = cleanSystem(fx4('look-d20'), { F, gmView: true });
        check('HUD frame HF2b review: hudFor — the one gate every way in asks — is true only for a character id they may open, in a system whose saved HUD holds something (a title alone is not enough)',
            cidRe instanceof RegExp && HF(true, gD4)('c_a') === true && HF(true, titleOnly)('c_a') === false && HF(true, noHud)('c_a') === false && HF(true, autoHud)('c_a') === true && HF(false, gD4)('c_a') === false && HF(true, null)('c_a') === false
            && ['x', '__proto__', '', null, undefined, 'c_' + 'a'.repeat(25), 'c_a b'].every(id => HF(true, gD4)(id) === false));
        const dhSrc = (require('./checkkit').part('sysedlayout.js').match(/function draftHasHud\(\) \{[^\n]*\}/) || [''])[0];
        const DH = draft => new Function('draft', dhSrc + '\nreturn draftHasHud();')(draft);
        check('HUD frame HF2b review: draftHasHud — the editor offers a HUD button (and Remove the HUD acts) only when the draft\'s HUD holds something: a title, a tab, a section, a band or a ledger figure; never for the empty one the HUD view makes by looking',
            dhSrc.length > 50 && DH({ sheet: { hud: { tabs: [], sections: [] } } }) === false && DH({ sheet: {} }) === false && DH(null) === false && DH({ sheet: { hud: [] } }) === false
            && [{ title: 'T' }, { tabs: [{ id: 't_a' }] }, { sections: [{ id: 's_a' }] }, { band: [{ id: 'f_a' }] }, { ledger: [{ id: 'f_a' }] }].every(h => DH({ sheet: { hud: h } }) === true)
            && /if \(!draftHasHud\(\)\) return true;   \/\/ nothing set/.test(require('./checkkit').part('sysedlayout.js')));
        const oh = sh4.slice(sh4.indexOf('function openHud(charId, opts) {'), sh4.indexOf('function makeHud('));
        check('HUD frame HF2b review: the placement is drawn by the section renderer; the editor\'s tab picker lists the HUD\'s tabs (a lost one marked) and says what no tab means; another tab asked of an open, scrolled HUD starts at its own top, measured before the change and only while the window is still the same',
            /else if \(pl\.kind === 'hud'\) node = printV \? null : hudButton\(pl, c, sys, vctx\);/.test(sh4) && /hOpts = \[\['', 'Its current tab \(first when closed\)'\]\];/.test(require('./checkkit').part('sysedlayout.js')) && /hOpts\.push\(\[x\.id, 'Tab: ' \+ \(x\.label \|\| 'Tab'\)\]\)/.test(require('./checkkit').part('sysedlayout.js')) && /hOpts\.push\(\[pl\.tab, '\(tab not found\)'\]\)/.test(require('./checkkit').part('sysedlayout.js'))
            && /var existed = !!huds\[charId\];\n    var v = huds\[charId\];/.test(oh) && oh.indexOf('var was = v.body.dataset.wpTab') < oh.indexOf('v.body.dataset.wpTab = opts.tab') && /if \(stuck && huds\[charId\] === v && v\.body\.dataset\.wpTab !== was\) v\.body\.scrollTop = frameFlowTop\(v\.body\);/.test(oh));
        const css4 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), zOf = re => { const m = css4.match(re); return m ? +m[1] : NaN; };
        const zSel = zOf(/#selToolbar \{\n\s*position: absolute; z-index: (\d+);/), zBar = zOf(/\.floating-toolbar \{[^}]*?z-index: (\d+);/), zSheet = zOf(/#sheetPanel \{[^}]*?z-index: (\d+);/), zHud = zOf(/\.hud-panel \{[^}]*?z-index: (\d+);/), zDoc = zOf(/#docPanel \{[^}]*?z-index: (\d+);/), zStrip = zOf(/#combatStrip \{[^}]*?z-index: (\d+);/);
        check('HUD frame HF2b: the floating windows (the sheet, a HUD, the doc panel) sit over the token\'s selection toolbar, and the map\'s tool bars at rest stand over every window (the owner, 2026-10-17, by prompt: "The toolbar always stays over windows"), all of them over the party and combat strips',
            [zSel, zBar, zSheet, zHud, zDoc, zStrip].every(isFinite) && zSel < Math.min(zSheet, zHud, zDoc) && zBar > Math.max(zSheet, zHud, zDoc) && zSel > zStrip && zBar > zStrip && zBar > zSel, j({ zSel, zBar, zSheet, zHud, zDoc, zStrip }));
        const zOpen = zOf(/\.floating-toolbar:has\(\.shape-menu\.show\) \{[^}]*?z-index: (\d+);/), zDrop = zOf(/\.floating-toolbar \{[^}]*?transition: z-index 0s ([\d.]+)s;/), menuFade = zOf(/\.floating-toolbar \.shape-menu \{[^}]*?transition: opacity ([\d.]+)s;/);
        check('Tool bar flyouts: a tool bar with a flyout open (the fog menu, the pen\'s, snap, measure…) rises over the token\'s selection toolbar, so a selected token\'s bar never covers the menu in use, and over every floating window too (backlog 143, found live 2026-10-16: the Pages shelf opened under the page panel; lookcheck holds the whole ladder); it rises at once and drops back only once the closed flyout has faded',
            isFinite(zOpen) && zOpen > zSel && zOpen > Math.max(zSheet, zHud, zDoc) && /\.floating-toolbar:has\(\.shape-menu\.show\) \{[^}]*?transition-delay: 0s;/.test(css4)
            && isFinite(zDrop) && zDrop === menuFade, j({ zOpen, zSel, zSheet, zHud, zDoc, zDrop, menuFade }));
    }
    /* ---- Stage 6 HUD frame (HF3): the docked roll history — the footer run for real on a tiny DOM, its gate, NEW, Clear, depth, the hook ---- */
    {
        const sh5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx5 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const ftSrc = sh5.slice(sh5.indexOf('var _histCleared = '), sh5.indexOf('// One refresh path for every view of a character'));
        // a DOM just big enough for the footer: elements with classes, text, children, attributes, listeners and focus
        const mkDoc = () => {
            const doc = { activeElement: null };
            const E = tag => { const e = { tag, className: '', children: [], attrs: {}, on: {}, style: {}, title: '', type: '', value: '', scrollTop: 0, _t: '', parent: null,
                get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }, set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._t = String(v); },
                appendChild(c) { c.parent = this; this.children.push(c); if (c.tag === 'option' && !this.value) this.value = c.value; return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; },
                get classList() { const s = this; return { contains: k => s.className.split(/\s+/).includes(k) }; },
                all() { return this.children.flatMap(c => [c, ...c.all()]); }, querySelector(q) { return this.all().find(c => c.classList.contains(q.slice(1))) || null; }, querySelectorAll(q) { return this.all().filter(c => c.classList.contains(q.slice(1))); },
                contains(x) { return x === this || this.all().includes(x); }, focus() { doc.activeElement = this; }, click() { if (this.on.click) this.on.click({ preventDefault() {} }); } }; return e; };
            doc.E = E; return doc;
        };
        // o: { sys, rolls, diceOff, open, prefs, label } — read at call time, so a test can switch dice or the system between repaints
        const run = o => {
            const doc = mkDoc(), prefs = Object.assign({}, o.prefs), calls = [];
            const el = (t, c, x) => { const e = doc.E(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
            const iconNode = (v, c) => el('span', c + ' wp-glyph');
            const chars = { c_a: { id: 'c_a', name: 'Bren' }, c_b: { id: 'c_b', name: 'Ana' } };
            const netS = { myId: 'u_me', rollSeq: () => 42, rollsFor: (cid, name, since, max) => { calls.push([cid, name, since, max]); return (o.rolls || []).filter(r => !since || r.seq > since).slice(0, max); } };
            const win = { wpVtt: { on: k => k !== 'dice' || !o.diceOff }, wpDice: { renderCard: m => { const c = el('div', 'chat-roll'); c.textContent = 'card ' + m.roll.id; return c; } }, wpDiceCore: { LIMITS: { label: o.label || 60 } } };
            const huds = {}, fresh = id => (huds[id] = { charId: id, foot: el('div', 'hud-foot'), histOpen: !!o.open });
            ['c_a', 'c_b'].forEach(fresh);
            const api = new Function('el', 'iconNode', 'pref', 'setPref', 'getActiveCampaign', 'charById', 'net', 'systemOf', 'huds', 'document', 'window', ftSrc + '\nreturn { renderHudFoot, rolled, histDepth, rollName, cleared: _histCleared };')(
                el, iconNode, (k, d) => (k in prefs ? prefs[k] : d), (k, v) => { prefs[k] = String(v); }, () => ({ id: 'k1' }), id => chars[id] || null, () => netS, () => o.sys, huds, doc, win);
            return { api, huds, doc, prefs, calls, fresh, cls: (v, q) => v.foot.querySelectorAll(q) };
        };
        const sD = cleanSystem(fx5('hud-d20'), { F, gmView: true }), sB = cleanSystem(fx5('hud-bare'), { F, gmView: true }), s3 = cleanSystem(fx5('hud-3d6'), { F, gmView: true });
        const rollsOf = n => Array.from({ length: n }, (_, i) => ({ roll: { id: 'r' + i }, seq: i + 1 }));
        const bare = run({ sys: sB, rolls: rollsOf(2) }), off = run({ sys: sD, diceOff: true, rolls: rollsOf(2) }), none = run({ sys: null, rolls: rollsOf(2) });
        [bare, off, none].forEach(r => r.api.renderHudFoot(r.huds.c_a));
        check('HUD frame HF3: the footer builds NOTHING (the foot hides) when the system the viewer holds has nothing to roll (hud-bare), the table cannot roll (dice off), or there is no system',
            [bare, off, none].every(r => r.huds.c_a.foot.children.length === 0) && sB.rolls.length === 0 && sD.rolls.length > 0 && s3.fields.some(f => f.roll), j([bare, off, none].map(r => r.huds.c_a.foot.children.length)));
        const gO = { sys: sD, rolls: rollsOf(2) }, gt = run(gO), gv = gt.huds.c_a, bars = [];
        gt.api.renderHudFoot(gv); bars.push(gt.cls(gv, '.hud-hist-bar').length);
        gO.diceOff = true; gt.api.renderHudFoot(gv); bars.push(gv.foot.children.length);
        gO.diceOff = false; gt.api.renderHudFoot(gv); bars.push(gt.cls(gv, '.hud-hist-bar').length);
        gO.sys = sB; gt.api.rolled(null, ''); bars.push(gv.foot.children.length);
        check('HUD frame HF3: a drawer already drawn goes at the next repaint once Dice is switched off or the system has nothing to roll, and comes back with Dice',
            j(bars) === j([1, 0, 1, 0]), j(bars));
        const f3 = fx5('hud-3d6'); f3.rolls = []; const sF = cleanSystem(f3, { F, gmView: true }), f3n = fx5('hud-3d6'); f3n.rolls = []; f3n.fields.forEach(f => { delete f.roll; }); const sN = cleanSystem(f3n, { F, gmView: true });
        const fr = run({ sys: sF, rolls: rollsOf(1) }), frn = run({ sys: sN, rolls: rollsOf(1) }); fr.api.renderHudFoot(fr.huds.c_a); frn.api.renderHudFoot(frn.huds.c_a);
        check('HUD frame HF3: a system whose only rolls are fields\' own Roll buttons has the drawer; with those gone too it has none',
            sF.rolls.length === 0 && sF.fields.some(f => f.roll) && fr.cls(fr.huds.c_a, '.hud-hist-bar').length === 1 && !sN.fields.some(f => f.roll) && frn.huds.c_a.foot.children.length === 0);
        const cl = run({ sys: s3, rolls: rollsOf(3) }), v = cl.huds.c_a; cl.api.renderHudFoot(v);
        const tg = () => v.foot.querySelector('.hud-hist-toggle');
        check('HUD frame HF3: closed, with rolls — the bar holds the toggle (history glyph, ROLL HISTORY, a NEW pill, a chevron), aria-expanded false, and no list, Clear or depth; it asked net.rollsFor for this character by the name its rolls carry, with no Clear mark and the default depth 10',
            v.foot.children.length === 1 && v.foot.children[0].className === 'hud-hist-bar' && tg() && tg().attrs['aria-expanded'] === 'false' && cl.cls(v, '.hud-hist-new').length === 1 && cl.cls(v, '.hud-hist-new')[0].textContent === 'NEW'
            && cl.cls(v, '.hud-hist-ico').length === 1 && cl.cls(v, '.hud-hist-chev').length === 1 && cl.cls(v, '.hud-hist-list').length === 0 && cl.cls(v, '.hud-hist-clear').length === 0 && cl.cls(v, '.hud-hist-depth').length === 0
            && j(cl.calls[0]) === j(['c_a', 'Bren', 0, 10]), j(cl.calls));
        tg().focus(); tg().click();
        check('HUD frame HF3: the toggle opens the drawer — no NEW, aria-expanded true, Clear and the depth (10/25/50/100, showing the saved 10) in the tools, one dice card per roll in the list, newest first as net.rollsFor gives them, and focus back on the new toggle',
            v.histOpen === true && cl.cls(v, '.hud-hist-new').length === 0 && tg().attrs['aria-expanded'] === 'true' && cl.cls(v, '.hud-hist-clear').length === 1
            && j(cl.cls(v, '.hud-hist-depth')[0].children.map(o => o.value)) === j(['10', '25', '50', '100']) && cl.cls(v, '.hud-hist-depth')[0].value === '10'
            && j(cl.cls(v, '.chat-roll').map(c => c.textContent)) === j(['card r0', 'card r1', 'card r2']) && cl.doc.activeElement === tg());
        const lst = cl.cls(v, '.hud-hist-list')[0]; lst.scrollTop = 120; cl.api.rolled(null, '');
        check('HUD frame HF3: a repaint keeps the open list where the reader had scrolled it', cl.cls(v, '.hud-hist-list')[0] !== lst && cl.cls(v, '.hud-hist-list')[0].scrollTop === 120);
        cl.cls(v, '.hud-hist-clear')[0].focus(); cl.cls(v, '.hud-hist-clear')[0].click();
        check('HUD frame HF3: Clear marks this viewer\'s history for that character at the ring\'s seq (the next list asks for rolls after it; the other character\'s is untouched); with the list now empty, Clear itself goes and focus lands on the toggle (never on the page)',
            cl.api.cleared.c_a === 42 && !('c_b' in cl.api.cleared) && cl.calls[cl.calls.length - 1][2] === 42 && cl.cls(v, '.hud-hist-clear').length === 0 && cl.cls(v, '.hud-hist-empty').length === 1 && cl.doc.activeElement === tg());
        const v2 = cl.fresh('c_a'); cl.api.renderHudFoot(v2);
        check('HUD frame HF3: Clear lasts the session — the same character\'s HUD closed and opened again (a new window) still lists only what came after it, with no NEW; nothing but the Clear button writes the mark',
            cl.calls[cl.calls.length - 1][0] === 'c_a' && cl.calls[cl.calls.length - 1][2] === 42 && cl.cls(v2, '.hud-hist-new').length === 0
            && (ftSrc.match(/_histCleared\[/g) || []).length === 2 && /_histCleared\[v\.charId\] = n\.rollSeq\(\);/.test(ftSrc) && !/delete _histCleared|_histCleared = /.test(sh5.replace('var _histCleared = Object.create(null)', '')));
        cl.huds.c_a = v;   // the first window again
        const dep = cl.cls(v, '.hud-hist-depth')[0]; dep.focus(); dep.value = '50'; dep.on.change(); const bad = cl.calls.length; const dep2 = cl.cls(v, '.hud-hist-depth')[0];
        const depOk = dep2 !== dep && dep2.value === '50' && cl.doc.activeElement === dep2; dep2.value = '7'; dep2.on.change();
        const dp = p => run({ sys: sD, prefs: { wp_hudHistDepth: p } }).api.histDepth(), seeded = run({ sys: sD, open: true, rolls: rollsOf(1), prefs: { wp_hudHistDepth: '25' } }); seeded.api.renderHudFoot(seeded.huds.c_a);
        check('HUD frame HF3: the depth is the shared pref wp_hudHistDepth (every open HUD repaints with it; the rebuilt select shows it and keeps the focus); only 10/25/50/100 are taken, anything else reads as 10; a drawer opened later shows the saved depth',
            depOk && cl.prefs.wp_hudHistDepth === '50' && cl.calls[bad - 1][3] === 50 && cl.calls[bad - 2][3] === 50 && cl.calls.length === bad && dp('25') === 25 && dp('100') === 100 && dp('7') === 10 && dp('abc') === 10 && dp('1e2') === 10
            && seeded.cls(seeded.huds.c_a, '.hud-hist-depth')[0].value === '25', j([depOk, cl.calls.slice(-3)]));
        const em = run({ sys: sD, rolls: [], open: true }); em.api.renderHudFoot(em.huds.c_b);
        const emC = run({ sys: sD, rolls: [] }); emC.api.renderHudFoot(emC.huds.c_b);
        check('HUD frame HF3: open and empty — the text names the character, no Clear; closed and empty — no NEW',
            em.cls(em.huds.c_b, '.hud-hist-empty')[0].textContent === 'No rolls as Ana yet this session.' && em.cls(em.huds.c_b, '.hud-hist-clear').length === 0 && emC.cls(emC.huds.c_b, '.hud-hist-new').length === 0);
        const hk = run({ sys: sD, rolls: rollsOf(1), label: 3 }), mark = () => ['c_a', 'c_b'].forEach(id => { hk.huds[id].foot.textContent = ''; hk.huds[id].foot.appendChild(hk.doc.E('i')); }), hit = () => ['c_a', 'c_b'].filter(id => hk.huds[id].foot.children[0].tag !== 'i');
        const hits = [], GMf = { id: 'u_gm', gm: true };
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_mate', gm: false } }, 'c_b'); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_me', gm: false } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_mate', gm: false } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Zed' }, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: {}, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled(null, ''); hits.push(hit());
        check('HUD frame HF3: the hook repaints the foot of the HUD a roll was made as — by its tag, else by the name it carries (capped as a roll\'s "as" is) only for the GM\'s roll or this machine\'s own, never a teammate\'s — and every foot for a repaint with no roll',
            j(hits) === j([['c_b'], ['c_a'], ['c_a'], [], [], [], [], ['c_a', 'c_b']]) && hk.api.rollName({ name: 'Brennan' }) === 'Bre', j(hits));
        const hs = sh5.slice(sh5.indexOf('// [systemcheck:hud-start]'), sh5.indexOf('// [systemcheck:hud-end]')), rd = (ftSrc.match(/function rolled\(m, cid\) \{[\s\S]*?\n\}/) || [''])[0];
        check('HUD frame HF3: the footer is inside the HUD slice and writes no markup (el/textContent and the dice card only); the hook repaints the foot, never the body; renderHud gives the panel the look\'s accent (the foot is the body\'s sibling) and ends by drawing its foot; makeHud starts the drawer closed; wpSheets exports rolled; Help names it',
            hs.indexOf('function renderHudFoot(v)') > 0 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(ftSrc) && /D\.renderCard\(m\)/.test(ftSrc) && rd.length > 50 && /renderHudFoot\(v\)/.test(rd) && !/renderHud\(|renderViews\(/.test(rd)
            && /    syncFramePad\(v\.body\);\n    \['--sheet-accent', '--sheet-accent-ink'\]\.forEach\(function\(k\) \{ var a = v\.body\.style\.getPropertyValue\(k\); if \(a\) v\.panel\.style\.setProperty\(k, a\); else v\.panel\.style\.removeProperty\(k\); \}\);[^\n]*\n    if \(v\.body\.scrollTop !== stH\) v\.body\.scrollTop = stH;[^\n]*\n    restoreFocus\(v\.body, fk\);\n    renderHudFoot\(v\);\n    try \{ syncEndTurn\(\); \} catch \(e\) \{\}[^\n]*\n\}/.test(hs)
            && /v\.foot = q\('hud-foot'\); v\.histOpen = false;/.test(hs) && /hudFor: hudFor, rolled: rolled,/.test(sh5) && /<b>Roll history<\/b>, when the system has rolls, is the drawer at its foot\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        const css5 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b5 = css5.slice(css5.indexOf('/* ---- Stage 6 HUD frame:')), rx5 = (b5.match(/\.hud-hist-list \.roll-expr \{([^}]*)\}/) || [])[1];
        check('HUD frame HF3: the drawer\'s CSS lives in the HUD block — the 44px bar, NEW still under reduced motion, the list at 18rem; the history\'s label-and-formula line is never uppercased (the formula\'s keys would shout)',
            /\.hud-hist-bar \{ flex: none; height: 44px;/.test(b5) && /@media \(prefers-reduced-motion: reduce\) \{ \.hud-hist-new \{ animation: none; \} \}/.test(b5) && /\.hud-hist-list \{ max-height: 18rem; flex: 1 1 auto; min-height: 0; overflow: auto;/.test(b5)
            && typeof rx5 === 'string' && !/text-transform/.test(rx5) && !/\.roll-expr[^{]*\{[^}]*text-transform/.test(b5), rx5);
        check('HUD frame HF3: in a short window the open drawer gives way instead of being clipped — the foot shrinks as a column over a body that keeps a floor, the list shrinks and scrolls; the grip\'s strip stays under an open list (never over its scrollbar)',
            /\.hud-foot \{ flex: 0 1 auto; min-height: 45px; display: flex; flex-direction: column;/.test(b5) && /\.hud-body:has\(\+ \.hud-foot:not\(:empty\)\) \{ margin-bottom: 0; flex-basis: 0; min-height: 4\.5rem; \}/.test(b5)
            && /\.hud-foot:has\(> \.hud-hist-list\) \{ padding-bottom: 12px; \}/.test(b5) && /\.hud-body \{ flex: 1 1 auto; min-height: 0;[^}]*margin-bottom: 12px;/.test(b5));
    }
    /* ---- Stage 6 HUD frame (HF4a): inline rows (H2) and the counter (H8) — the cleaner, both run for real, the editor, the tour's seed ---- */
    {
        const sh6 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx6 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const GV = { F, gmView: true }, PV = { F, gmView: false };
        const gD = cleanSystem(fx6('hud-d20'), GV), pD = cleanSystem(fx6('hud-d20'), PV), g3 = cleanSystem(fx6('hud-3d6'), GV), p3 = cleanSystem(fx6('hud-3d6'), PV);
        const secIn = (sh, id) => sh.sections.find(s => s.id === id), fld = (sys, id) => sys.fields.find(f => f.id === id);
        const mkS = (secs, flds) => cleanSystem({ v: 1, name: 'I', fields: flds || [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all' }], rolls: [], sheet: { bandGroups: [{ id: 'g_a', label: 'A' }], band: [{ id: 'f_a', g: 'g_a' }], sections: secs } }, GV);
        const inl = [true, 'yes', 1, false, null].map(v => mkS([{ id: 's_a', title: 'A', pin: 'g_a', inline: v, fields: [{ id: 'f_a' }] }]).sheet.sections[0]);
        check('HUD frame HF4a: a section\'s Inline rows is kept only as true, after its Pin; in the sheet\'s layout and the HUD\'s, in the players\' view too (d20 Checks, 3d6 Core and Attributes; their other sections stay stacked)',
            inl[0].inline === true && Object.keys(inl[0]).indexOf('inline') === Object.keys(inl[0]).indexOf('pin') + 1 && inl.slice(1).every(s => !('inline' in s))
            && secIn(gD.sheet.hud, 's_hchk').inline === true && secIn(pD.sheet.hud, 's_hchk').inline === true && secIn(g3.sheet.hud, 's_hcore').inline === true && secIn(g3.sheet.hud, 's_hattr').inline === true && secIn(p3.sheet.hud, 's_hattr').inline === true
            && !('inline' in secIn(gD.sheet.hud, 's_hatk')) && !('inline' in secIn(g3.sheet.hud, 's_hpools')) && gD.sheet.sections.every(s => !('inline' in s)), j(inl));
        const cf = (kind, extra) => { const f = Object.assign({ id: 'f_c', key: 'C', kind, def: 0, vis: 'all', counter: true }, extra || {}); return fld(cleanSystem({ v: 1, name: 'C', fields: [f], rolls: [] }, GV), 'f_c'); };
        const cOn = [cf('number'), cf('skill'), cf('number', { min: 0, max: 3 })], cOff = [cf('number', { labels: ['a', 'b'] }), cf('number', { slider: {}, min: 0, max: 5 }), cf('number', { counter: 'yes' }), cf('formula', { formula: '1' }), cf('resource', { max: 5 }), cf('text'), cf('toggle', { def: false })];
        check('HUD frame HF4a: Counter is kept on a number or a skill only as true, and never with value names or a slider (a number is a dropdown, a range or a counter); both fixtures\' counters survive in the GM\'s and the players\' view and sit on their HUD band',
            cOn.every(f => f && f.counter === true) && cOff.every(f => f && !('counter' in f)) && cf('number', { slider: {}, min: 0, max: 5 }).slider
            && fld(gD, 'f_dsv').counter === true && fld(pD, 'f_dsv').counter === true && fld(g3, 'f_turn').counter === true && fld(p3, 'f_turn').counter === true
            && gD.sheet.hud.band.some(q => q.id === 'f_dsv') && pD.sheet.hud.band.some(q => q.id === 'f_dsv') && g3.sheet.hud.band.some(q => q.id === 'f_turn') && p3.sheet.hud.band.some(q => q.id === 'f_turn')
            && fld(gD, 'f_ac').tile === true && fld(g3, 'f_st').tile === true && S.validateSystem(gD, F).errors.length === 0 && S.validateSystem(g3, F).errors.length === 0, j([cOn, cOff]));
        // inlineRow, run for real on a small fake DOM
        const irSrc = sh6.slice(sh6.indexOf('var INLINE_KINDS = '), sh6.indexOf('// Stage 6 look fold (L8): a number box'));
        const mkE = (cls, text) => { const e = { className: cls || '', textContent: text || '', children: [], parent: null,
            get classList() { const s = this; return { add: k => { if (!s.className.split(' ').includes(k)) s.className = (s.className + ' ' + k).trim(); }, remove: k => { s.className = s.className.split(' ').filter(x => x && x !== k).join(' '); }, contains: k => s.className.split(' ').includes(k) }; },
            appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); return c; },
            insertBefore(c, ref) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
            all() { return this.children.flatMap(c => [c, ...c.all()]); }, querySelector(q) { return this.all().find(c => c.classList.contains(q.slice(1))) || null; } }; return e; };
        const inlineRow = new Function(irSrc + '\nreturn inlineRow;')();
        const mkField = (kind, o) => { o = o || {}; const box = mkE('sheet-field sheet-kind-' + kind + (o.tile ? ' sheet-tile' : '') + (o.drawnSlider ? ' sheet-has-slider' : '')), lab = box.appendChild(mkE('sheet-label', 'AC')); if (o.roll) lab.appendChild(mkE('tool ghost sheet-field-roll', 'die')); box.appendChild(mkE(kind === 'formula' ? 'sheet-value' : 'sheet-ctl')); if (o.cap) box.appendChild(mkE('sheet-caption', 'cap')); return box; };
        const n1 = mkField('formula', { tile: true, roll: true, cap: true }); inlineRow(n1, { kind: 'formula' });
        const n2 = mkField('number', { roll: true }); inlineRow(n2, { kind: 'number' });
        const n3 = mkField('number', { tile: true, drawnSlider: true }); inlineRow(n3, { kind: 'number', slider: {}, min: 0, max: 5 });
        const n4 = mkField('formula', { tile: true }), n5 = mkField('number'), n6 = mkField('number', { tile: true }), n7 = mkField('number');
        let threw = ''; try { inlineRow(n4, { kind: 'formula' }); inlineRow(n5, { kind: 'number' }); inlineRow(n6, { kind: 'number', slider: {}, min: 0, max: 2, labels: ['a', 'b', 'c'] }); inlineRow(n7, { kind: 'number', slider: {} }); } catch (e) { threw = e.message; }
        const others = ['resource', 'effects', 'notes', 'item-list', 'constructor', '__proto__'].map(k => { const n = mkField(k, { tile: true, roll: true }); inlineRow(n, { kind: k }); return n; });
        const kids = n => n.children.map(c => c.className.split(' ').filter(x => /^sheet-(label|value|ctl|caption|field-roll)$/.test(x))[0]);
        check('HUD frame HF4a: inlineRow (run for real) makes a field one line — the row class on, a stat tile\'s class off (the section beats the tile), its own roll moved out of the label to the end of the line reading "Roll", before any caption; a field without a roll (the f_ac tile, a plain number) only gains the class, without throwing; a slider that was not drawn (no range, or a named number) becomes a row; a drawn slider and the kinds a line cannot hold (a pool) are left alone',
            n1.classList.contains('sheet-inline-row') && !n1.classList.contains('sheet-tile') && j(kids(n1)) === j(['sheet-label', 'sheet-value', 'sheet-field-roll', 'sheet-caption']) && n1.children[2].textContent === 'Roll' && n1.children[2].classList.contains('sheet-inline-roll') && n1.children[0].children.length === 0
            && j(kids(n2)) === j(['sheet-label', 'sheet-ctl', 'sheet-field-roll']) && n2.children[2].textContent === 'Roll'
            && !threw && [n4, n5, n6, n7].every(n => n.classList.contains('sheet-inline-row') && !n.classList.contains('sheet-tile') && n.children[0].children.length === 0) && j(kids(n4)) === j(['sheet-label', 'sheet-value']) && j(kids(n5)) === j(['sheet-label', 'sheet-ctl'])
            && !n3.classList.contains('sheet-inline-row') && n3.classList.contains('sheet-tile') && others.every(n => !n.classList.contains('sheet-inline-row') && n.classList.contains('sheet-tile') && n.children[0].children.length === 1)
            && /Object\.freeze\(\{ number: 1, formula: 1, skill: 1, toggle: 1, select: 1, text: 1 \}\)/.test(irSrc) && /Object\.prototype\.hasOwnProperty\.call\(INLINE_KINDS, f\.kind\) \|\| node\.classList\.contains\('sheet-has-slider'\)\) return;/.test(irSrc), j([kids(n1), kids(n2)]));
        check('HUD frame HF4a: the renderer marks an inline section by comparison and makes each FIELD placement a line (a roll placement stays a button); a counter is drawn before the look\'s arrows (and never also gets them)',
            /'sheet-section' \+ \(collap \? ' sheet-collap' : ''\) \+ \(isChild \? ' sheet-subsection' : ''\) \+ \(sec\.inline === true \? ' sheet-inline' : ''\)/.test(sh6)
            && /\n            if \(!node\) return;\n            if \(sec\.inline === true && pl\.id && byId\[pl\.id\]\) inlineRow\(node, byId\[pl\.id\]\);[^\n]*\n            if \(pl\.w === 'row'\)/.test(sh6)
            && /\n        if \(f\.counter\) row\.appendChild\(stepWrap\(inp, f, c, use, true\)\);[^\n]*\n        else if \(lkS\.steppers === 'inside' && [^\n]*\n        else row\.appendChild\(inp\);/.test(sh6) && (sh6.match(/inlineRow\(/g) || []).length === 2);
        // stepWrap's counter path, run for real (the L8 harness's fake DOM: classList has add() only)
        const swSrc6 = sh6.slice(sh6.indexOf('function stepWrap('), sh6.indexOf('// Stage 6 look fold (L7): a badge'));
        const fakeEl6 = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text || '', dataset: {}, children: [], disabled: false, title: '', type: '', listeners: {}, appendChild(x) { this.children.push(x); return x; }, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); } }; e.classList = { add: k => { if (!e.className.split(' ').includes(k)) e.className = (e.className + ' ' + k).trim(); } }; e.fire = t => (e.listeners[t] || []).forEach(fn => fn()); return e; };
        // a clock: setTimeout keeps its callback under an id until due; clearTimeout removes only that id; advance(t) runs what is due, in order
        const mkClock = () => { let now = 0, seq = 0; const q = new Map(); return { set: (fn, ms) => { q.set(++seq, { at: now + ms, fn }); return seq; }, clear: id => { q.delete(id); }, pending: () => q.size, advance(t) { for (;;) { const due = [...q].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; q.delete(due[0]); now = due[1].at; due[1].fn(); } now = t; } }; };
        const mkStep = () => { const clock = mkClock(), commits = []; const stepWrap = new Function('el', 'commit', 'setTimeout', 'clearTimeout', swSrc6 + '\nreturn stepWrap;')(fakeEl6, (c, f, v) => commits.push(v), (fn, ms) => clock.set(fn, ms), id => clock.clear(id)); return { stepWrap, clock, commits }; };
        // acts: +1 / -1 a click, 'n' a value typed into the box; clicks 50 ms apart (one burst) unless an act is { wait: ms }
        const runCnt = (field, start, acts, editable) => {
            const { stepWrap, clock, commits } = mkStep(); let t = 0;
            const inp = fakeEl6('input', 'field sheet-num'); inp.value = String(start);
            const w = stepWrap(inp, field, { id: 'c_1' }, editable !== false, true), down = w.children[0], up = w.children[2];
            acts.forEach(a => { if (a && a.wait) { t += a.wait; clock.advance(t); return; } if (typeof a === 'string') { inp.value = a; inp.fire('change'); } else (a > 0 ? up : down).fire('click'); t += 50; clock.advance(t); });
            const shown = inp.value, pend = clock.pending(); clock.advance(t + 1000);
            return { w, shown, commits, down, up, pend, inp, inpMid: w.children[1] === inp };
        };
        const k1 = runCnt({ id: 'f_dsv', min: 0, max: 3 }, 1, [1, 1, 1]), k2 = runCnt({ id: 'f_turn', min: 0 }, 4, [1, -1]), k3 = runCnt({ id: 'f_turn', min: 0 }, 0, [-1, -1]), k4 = runCnt({ id: 'f_dsv', min: 0, max: 3 }, 1, [1], false);
        const k5 = runCnt({ id: 'f_turn', min: 0 }, 5, ['7', -1, -1]), k6 = runCnt({ id: 'f_turn', min: 0 }, 5, ['7', 1, -1]), k7 = runCnt({ id: 'f_turn', min: 0 }, 5, [1, { wait: 250 }, 1]), k8 = runCnt({ id: 'f_turn', min: 0 }, 5, [1, '9']);   // k8: a value typed mid-burst ends the burst (the box commits it itself); the click's timer must not overwrite it
        // a redraw in the middle of a burst (a player's own edit comes back as an ack and a delta within a round trip): the pending value survives,
        // the next click carries on from it under the one timer — and a band copy and a section copy of one counter share the burst
        const rd = (() => { const { stepWrap, clock, commits } = mkStep(), f = { id: 'f_turn', min: 0 }, c = { id: 'c_1' }; let stored = 0, t = 0; const draw = () => { const i = fakeEl6('input', 'field sheet-num'); i.value = String(stored); const w = stepWrap(i, f, c, true, true); return { i, up: w.children[2], down: w.children[0] }; };
            const at = (ms, fn) => { clock.advance(ms); t = ms; fn(); }; let v = draw(); const band = draw(); const seen = [];
            at(0, () => v.up.fire('click')); at(120, () => v.up.fire('click')); at(150, () => { v = draw(); seen.push(v.i.value); }); at(200, () => v.up.fire('click')); at(230, () => band.up.fire('click')); clock.advance(2000);
            return { commits: commits.slice(), seen, pend: clock.pending() }; })();
        const stepped = (() => { const { stepWrap } = mkStep(), a = fakeEl6('input', 'field sheet-num'), b = fakeEl6('input', 'field sheet-num'); stepWrap(a, { id: 'f_a' }, { id: 'c_1' }, true, true); stepWrap(b, { id: 'f_b' }, { id: 'c_1' }, true); return [a.className, b.className]; })();
        check('HUD frame HF4a: the counter (the real stepWrap, flank) — span.sheet-counter holding [\u2212, the box, +] with the field id and parts down/up, titled One less / One more, disabled with the box, the box without native arrows (num-stepped, both paths); a burst of three clicks shows 3 at once (0\u20133 clamps) and sends ONE commit (one timer pending); clicks more than 200 ms apart are two commits; up then down sends nothing; the min holds at 0; a value typed into the box ends a burst in flight and is the new start; a redraw in the middle of a burst keeps the pending value and the burst is still ONE commit, shared by the band copy and a section copy',
            k1.w.className === 'sheet-counter' && k1.inpMid && k1.w.children.length === 3 && k1.down.className === 'tool ghost sheet-count' && k1.up.className === 'tool ghost sheet-count' && k1.down.dataset.part === 'down' && k1.up.dataset.part === 'up' && k1.down.dataset.fid === 'f_dsv'
            && k1.down.title === 'One less' && k1.up.title === 'One more' && k1.up.textContent === '+' && k1.down.textContent === '\u2212' && !k1.up.disabled && k4.up.disabled && k4.down.disabled
            && k1.shown === '3' && j(k1.commits) === j([3]) && k1.pend === 1 && k2.shown === '4' && k2.commits.length === 0 && k3.shown === '0' && k3.commits.length === 0 && k5.shown === '5' && j(k5.commits) === j([5]) && k6.shown === '7' && k6.commits.length === 0
            && j(k7.commits) === j([6, 7]) && k8.commits.length === 0 && k8.shown === '9' && k8.pend === 0 && j(rd.commits) === j([4]) && j(rd.seen) === j(['2']) && rd.pend === 0 && stepped.every(cn => /\bnum-stepped\b/.test(cn)),
            j([k1.commits, k1.pend, k2.commits, k3.commits, k5.commits, k6.commits, k7.commits, rd, stepped]));
        check('HUD frame HF4a: the editor — a section\'s Stacked fields / Inline rows select (set or cleared by its exact class); a Counter box on a number without value names or a slider and on a skill; ticking one of Counter and Slider clears the other in the draft (a set slider keeps its box so it can be turned off); giving or clearing value names brings the Counter box or takes it away; the new classes contain no other editor class and none contains them',
            /top\.appendChild\(select\('sys-sec-inline', \[\['', 'Stacked fields'\], \['1', 'Inline rows'\]\], sec\.inline \? '1' : '',/.test(require('./checkkit').part('sysedlayout.js'))
            && /if \(t\.classList\.contains\('sys-sec-inline'\)\) \{ if \(t\.value\) sec\.inline = true; else delete sec\.inline; markDirty\(\); renderPreview\(\); return true; \}/.test(require('./checkkit').part('sysedlayout.js'))
            && /if \(\(f\.kind === 'number' && !f\.slider && !\(Array\.isArray\(f\.labels\) && f\.labels\.length\)\) \|\| f\.kind === 'skill'\) \{ var cnl = [^\n]*cnc\.className = 'sys-counter-chk';/.test(sh6) && /if \(f\.kind === 'number' && \(!f\.counter \|\| f\.slider\)\) \{ var sl = /.test(sh6)
            && /else if \(c\.indexOf\('sys-slider-chk'\) >= 0\) \{ if \(t\.checked\) \{ f\.slider = f\.slider \|\| \{\}; delete f\.counter; \} else delete f\.slider;/.test(require('./checkkit').part('sysedtabs.js'))
            && /wantCnt = !f\.slider && !\(Array\.isArray\(f\.labels\) && f\.labels\.length\); if \(rwV && !!rwV\.querySelector\('\.sys-counter-chk'\) !== wantCnt\) \{ if \(Array\.isArray\(f\.labels\) && f\.labels\.length\) delete f\.counter; markDirty\(\); renderAll\(\); return; \}/.test(require('./checkkit').part('sysedtabs.js'))
            && /else if \(c\.indexOf\('sys-counter-chk'\) >= 0\) \{ if \(t\.checked\) \{ f\.counter = true; delete f\.slider; \} else delete f\.counter; markDirty\(\); renderAll\(\); return; \}/.test(require('./checkkit').part('sysedtabs.js'))
            && (() => { const disp = (sh6.match(/c\.indexOf\('sys-[a-z0-9-]+'\)/g) || []).map(m => m.slice(11, -2)), cls = new Set(sh6.match(/sys-[a-z0-9-]+/g) || []); return disp.length > 50 && ['sys-sec-inline', 'sys-counter-chk'].every(n => disp.every(t => t === n || n.indexOf(t) < 0) && [...cls].every(o => o === n || o.indexOf(n) < 0)); })());
        // the tour's seed and its guarded migration, run for real
        const tut6 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n');
        const fnT6 = name => { const i = tut6.indexOf('function ' + name + '('); let d = 0; const k = tut6.indexOf('{', i); for (let p = k; p < tut6.length; p++) { if (tut6[p] === '{') d++; else if (tut6[p] === '}') { d--; if (d === 0) return tut6.slice(i, p + 1); } } return ''; };
        const T6 = new Function(['tutorialPostures', 'tutorialEffects', 'tutorialHud', 'tutorialSenses', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT6).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const hf2a = () => { const s = T6.sys(); const h = s.sheet.hud.sections.find(x => x.id === 's_tut_hchk'); delete h.inline; return { system: s, chars: { c_tut_bren: T6.ch('/x/') }, items: {} }; };
        const mig = hf2a(), migC = hf2a(), cleanedH = cleanSystem(migC.system, GV); migC.system.sheet.hud = JSON.parse(JSON.stringify(cleanedH.sheet.hud)); delete migC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline;
        const edited = [s => { s.title = 'My checks'; }, s => { s.cols = 2; }, s => { s.fields.push({ id: 'f_tut_dex', w: 1 }); }, s => { s.collapsible = true; }, s => { s.inline = false; }, s => { s.tab = 't_tut_hstat'; }].map(fn => { const c = hf2a(); fn(c.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk')); const before = JSON.stringify(c.system.sheet.hud); T6.ensure(c); return before === JSON.stringify(c.system.sheet.hud); });
        const r1 = T6.ensure(mig), r2 = T6.ensure(mig), rC = T6.ensure(migC);
        // the owner sets it back to Stacked fields (the editor deletes inline) and Saves (the cleaner writes the HF2a shape again): it stays stacked
        const back = JSON.parse(JSON.stringify(mig)); back.system = cleanSystem(back.system, GV); delete back.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; back.system = cleanSystem(back.system, GV); const rB = T6.ensure(back);
        const freshC = { system: T6.sys(), chars: { c_tut_bren: T6.ch('/x/') }, items: {}, tutorialSeed: 1 }; delete freshC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; T6.ensure(freshC); const fresh = 'inline' in freshC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk');
        check('HUD frame HF4a: the tour\'s HUD Checks section draws as inline rows; an older tutorial gains it once (a one-shot marker a fresh build carries) and only on the untouched HF2a seed (as seeded or as a Save cleaned it); a Checks section someone changed (its title, columns, fields, tab, collapsing) or later set back to Stacked fields is left alone',
            T6.hud().sections.find(x => x.id === 's_tut_hchk').inline === true && r1 === true && r2 === false && mig.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true
            && rC === true && migC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true && edited.every(Boolean) && mig.tutorialSeed === 2
            && rB === false && !('inline' in back.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk')) && fresh === false && /camp\.tutorialSeed = [1-9];[^\n]*\n    camp\.vtt = tutorialVtt\(\);/.test(tut6)
            && j(cleanSystem(mig.system, GV).sheet.hud) === j(cleanSystem(T6.sys(), GV).sheet.hud), j({ r1, r2, rC, edited }));
        const css6 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b6 = css6.slice(css6.indexOf('/* ---- Stage 6 HUD frame:')), i6 = b6.indexOf('/* HF4a (H2)'), r6 = i6 >= 0 ? b6.slice(i6, b6.indexOf('/* HF4b (H13)')).split('\n').filter(l => /^  [.@]/.test(l)) : [];
        check('HUD frame HF4a: the CSS lives in the HUD block, every rule gated by an HF4a class (the inline row, its Roll, the counter and its buttons), none touching the L8 arrows; Help describes inline rows and counters',
            r6.length >= 10 && r6.every(l => l.split('{')[0].split(',').every(m => /\.sheet-(inline-row|inline-roll|counter|count)\b/.test(m))) && !r6.some(l => /sheet-step\b|sheet-steps/.test(l)) && r6.filter(l => /sheet-numwrap/.test(l)).every(l => /^  \.sheet-field\.sheet-inline-row > \.sheet-ctl > input\.sheet-num, \.sheet-field\.sheet-inline-row > \.sheet-ctl > \.sheet-numwrap > input\.sheet-num \{ width: 4\.5em; flex: none; \}/.test(l))
            && /\.sheet-field\.sheet-tile \.sheet-counter \{ display: grid;/.test(b6) && /\.sheet-count \{ flex: none;/.test(b6)
            && /<li><b>Inline rows and counters\.<\/b> A section set to <b>Inline rows<\/b> draws each field on one line[^\n]*\s*<ul>\s*<li>A number, formula or skill shown as a stat tile draws as a row there\. A pool, and a number drawn as a slider, keep their own look\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j(r6.filter(l => !l.split('{')[0].split(',').every(m => /\.sheet-(inline-row|inline-roll|counter|count)\b/.test(m)))));
    }
    /* ---- Stage 6 HUD frame (HF4b): Reset all (H13) — the cleaner, its targets and commitMany run for real, a batch's rollback, the editor, the tour's seed ---- */
    {
        const sh7 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt7 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const fx7 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV7 = { F, gmView: true }, PV7 = { F, gmView: false };
        const gD7 = cleanSystem(fx7('hud-d20'), GV7), pD7 = cleanSystem(fx7('hud-d20'), PV7), g37 = cleanSystem(fx7('hud-3d6'), GV7), p37 = cleanSystem(fx7('hud-3d6'), PV7);
        const sec7 = (lay, id) => lay.sections.find(s => s.id === id), BEL = String.fromCharCode(7), noCtrl = t => ![...t].some(ch => ch.charCodeAt(0) < 32);
        const mkR = o => cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_p', key: 'P', kind: 'resource', maxFormula: '5', def: 'max', min: 0, vis: 'all', edit: 'owner' }], rolls: [], sheet: { sections: [Object.assign({ id: 's_r', title: 'R', fields: [{ id: 'f_p' }] }, o)] } }, GV7).sheet.sections[0];
        const rA = mkR({ inline: true, resetAll: true, resetText: '  Long rest  ' }), rB = mkR({ resetAll: 'yes', resetText: 'x' }), rC = mkR({ resetText: 'orphan' }), rD = mkR({ resetAll: true, resetText: 'a'.repeat(80) + BEL }), rE = mkR({ resetAll: true, resetText: 'Long' + BEL + 'rest' }), rF = mkR({ resetAll: true, resetText: '   ' });
        check('HUD frame HF4b: a section\'s Reset all is kept only as true, after Inline rows; its own words only with it — trimmed, control characters out, cut to the label cap; the players\' view keeps both (d20: the sheet\'s Spellcasting, the HUD\'s Long rest slots and Status; 3d6: Resource Pools)',
            rA.resetAll === true && rA.resetText === 'Long rest' && Object.keys(rA).indexOf('resetAll') === Object.keys(rA).indexOf('inline') + 1 && !('resetAll' in rB) && !('resetText' in rB) && !('resetText' in rC)
            && rD.resetText.length === 60 && noCtrl(rD.resetText) && rE.resetText === 'Long rest' && !('resetText' in rF) && rF.resetAll === true
            && sec7(gD7.sheet, 's_spell').resetAll === true && sec7(pD7.sheet, 's_spell').resetAll === true && sec7(gD7.sheet.hud, 's_hslots').resetText === 'Long rest' && sec7(pD7.sheet.hud, 's_hslots').resetText === 'Long rest'
            && sec7(pD7.sheet.hud, 's_hstat').resetAll === true && sec7(p37.sheet.hud, 's_hpools').resetAll === true && sec7(g37.sheet.hud, 's_hpools').resetAll === true, j([rA, rB, rC, rD, rE, rF]));
        // the targets, worked out for real (systemcore's resetTargets, as the chip calls it)
        const chD = { id: 'c_d', ownerId: 'u_p', values: { f_level: 5, f_sl1: { cur: 0 }, f_sl2: { cur: 1 }, f_sl3: { cur: 2 }, f_hp: { cur: 3 }, f_dsv: 2 } };
        const RT = (sys, sc, ch, who) => S.resetTargets(sys, ch, sc, F, who), tv = r => j(r.targets.map(t => [t.fieldId, t.value]));
        const tSl = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), chD, { gm: true }), tSp = RT(gD7, sec7(gD7.sheet, 's_spell'), chD, { gm: true }), tSt = RT(pD7, sec7(pD7.sheet.hud, 's_hstat'), chD, { own: true });
        const t3 = RT(p37, sec7(p37.sheet.hud, 's_hpools'), { id: 'c_3', values: { f_st: 12, f_hp: { cur: 4 }, f_ep: { cur: 10 } } }, { own: true });
        const full = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), { id: 'c_f', values: { f_level: 5 } }, { gm: true }), noPools = RT(gD7, sec7(gD7.sheet.hud, 's_hchk'), chD, { gm: true });
        const gmEd = JSON.parse(JSON.stringify(fx7('hud-d20'))); gmEd.fields.find(f => f.id === 'f_sl1').edit = 'gm'; const gGm = cleanSystem(gmEd, GV7);
        const asOwner = RT(gGm, sec7(gGm.sheet.hud, 's_hslots'), chD, { own: true }), asGm = RT(gGm, sec7(gGm.sheet.hud, 's_hslots'), chD, { gm: true }), part = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), Object.assign({ partial: true }, chD), { own: true }), nobody = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), chD, {});
        const f12 = Array.from({ length: 102 }, (_, i) => ({ id: 'f_c' + i, key: 'C' + i, kind: 'number', def: 0, min: 0, max: 9, vis: 'all', edit: 'owner', counter: true }));
        const s12 = cleanSystem({ v: 1, name: 'C', fields: f12, rolls: [], sheet: { sections: [{ id: 's_many', title: 'Tallies', resetAll: true, fields: f12.map(f => ({ id: f.id })) }], hud: { sections: [{ id: 's_hm', title: 'Many', resetAll: true, fields: f12.map(f => ({ id: f.id })) }] } } }, GV7);
        const v12 = {}; f12.forEach(f => { v12[f.id] = 3; }); const t12 = RT(s12, sec7(s12.sheet, 's_many'), { id: 'c_m', values: v12 }, { gm: true }), w12 = S.validateSystem(s12, F).warnings.filter(w => w.prop === 'resetAll').map(w => w.message);
        check('HUD frame HF4b: Reset all\'s targets (run for real) — a pool not full goes back to its max, a counter away from its start back to its default; full pools and counters at their start are left; the viewer\'s rights (a GM-edit pool is the GM\'s, a teammate\'s copy and a stranger reset nothing); a section with no pool or counter has no button; at most 100 (10 before 1.6.2), and validateSystem says so in either layout',
            tv(tSl) === j([['f_sl1', { cur: 2 }], ['f_sl2', { cur: 2 }]]) && tv(tSp) === tv(tSl) && tv(tSt) === j([['f_dsv', 0], ['f_hp', { cur: 10 }]]) && tSt.targets[1].label === 'Hit points' && tSt.targets[0].label === 'Death saves' && tSt.allowed === 2 && asOwner.allowed === 2 && part.allowed === 0 && nobody.allowed === 0 && tv(t3) === j([['f_hp', { cur: 12 }]])
            && full.any === true && full.targets.length === 0 && noPools.any === false && tSl.any === true
            && tv(asOwner) === j([['f_sl2', { cur: 2 }]]) && tv(asGm) === tv(tSl) && part.targets.length === 0 && nobody.targets.length === 0
            && t12.targets.length === 100 && t12.targets[99].fieldId === 'f_c99' && j(w12) === j(['Reset all resets the first 100 in Tallies.', 'Reset all resets the first 100 in the HUD' + String.fromCharCode(8217) + 's Many.'])
            && S.validateSystem(gD7, F).warnings.every(w => w.prop !== 'resetAll'), j([tSl, tSt, t3, asOwner, w12]));
        // one press leaves nothing to reset: a default off the step grid and a fractional max are sent as the field stores them; a counter that feeds
        // a pool's max is reset first, and the pool fills to the max it will have (raised or lowered)
        const mk2 = (fields, secFields) => cleanSystem({ v: 1, name: 'M', fields, rolls: [], sheet: { sections: [{ id: 's_x', title: 'X', resetAll: true, fields: secFields.map(id => ({ id })) }] } }, GV7);
        const press = (sys, ch) => { const r1 = RT(sys, sys.sheet.sections[0], ch, { gm: true }), after = { id: ch.id, values: Object.assign({}, ch.values) }; r1.targets.forEach(t => { const e = S.applyEdit(sys, after, t.fieldId, t.value, F, {}); if (e.ok) after.values[t.fieldId] = e.value; }); return { r1, again: RT(sys, sys.sheet.sections[0], after, { gm: true }), after }; };
        const grid = mk2([{ id: 'f_am', key: 'Ammo', kind: 'number', def: 2, min: 1, step: 2, max: 9, vis: 'all', counter: true }], ['f_am']), pG = press(grid, { id: 'c', values: { f_am: 5 } });
        const frac = mk2([{ id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'ST / 3', def: 'max', min: 0, vis: 'all' }], ['f_hp']), pF = press(frac, { id: 'c', values: { f_hp: { cur: 1 } } });
        const up = mk2([{ id: 'f_aid', key: 'Aid', kind: 'number', def: 0, min: 0, max: 9, vis: 'all', counter: true }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '20 + Aid', def: 'max', min: 0, vis: 'all' }], ['f_hp', 'f_aid']), pU = press(up, { id: 'c', values: { f_hp: { cur: 10 }, f_aid: 5 } });
        const down = mk2([{ id: 'f_ex', key: 'Exh', kind: 'number', def: 0, min: 0, max: 6, vis: 'all', counter: true }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '20 - 2 * Exh', def: 'max', min: 0, vis: 'all' }], ['f_hp', 'f_ex']), pDn = press(down, { id: 'c', values: { f_hp: { cur: 5 }, f_ex: 3 } });
        const skill = mk2([{ id: 'f_sk', key: 'Tally', kind: 'skill', def: 0, min: 0, max: 5, vis: 'all', counter: true }], ['f_sk']), pS = press(skill, { id: 'c', values: { f_sk: 4 } });
        const atStart = RT(skill, skill.sheet.sections[0], { id: 'c', values: { f_sk: 0 } }, { gm: true }), unsetC = RT(skill, skill.sheet.sections[0], { id: 'c', values: {} }, { gm: true });
        const warnN = n => { const fl = Array.from({ length: n }, (_, i) => ({ id: 'f_n' + i, key: 'N' + i, kind: 'number', def: 0, min: 0, max: 9, vis: 'all', counter: true })); return S.validateSystem(cleanSystem({ v: 1, name: 'N', fields: fl, rolls: [], sheet: { sections: [{ id: 's_n', title: 'N', resetAll: true, fields: fl.map(f => ({ id: f.id })) }] } }, GV7), F).warnings.filter(w => w.prop === 'resetAll').length; };
        check('HUD frame HF4b: one press leaves nothing to reset — a default off the step grid (Ammo def 2, step 2 from 1: 3) and a fractional max (ST / 3: 3) are sent as the field stores them; a counter feeding a pool\'s max is reset first and the pool fills to the max it will have (20 + Aid at Aid 5: 20, not 25; 20 - 2 x Exh at Exh 3: 20, not 14); a skill counter resets; a counter at its start, or never set, is not a target; the warning starts at 101',
            tv(pG.r1) === j([['f_am', 3]]) && pG.again.targets.length === 0 && tv(pF.r1) === j([['f_hp', { cur: 3 }]]) && pF.again.targets.length === 0
            && tv(pU.r1) === j([['f_aid', 0], ['f_hp', { cur: 20 }]]) && pU.again.targets.length === 0 && j(pU.after.values.f_hp) === j({ cur: 20 })
            && tv(pDn.r1) === j([['f_ex', 0], ['f_hp', { cur: 20 }]]) && pDn.again.targets.length === 0 && tv(pS.r1) === j([['f_sk', 0]]) && pS.again.targets.length === 0 && atStart.targets.length === 0 && unsetC.targets.length === 0
            && warnN(100) === 0 && warnN(101) === 1, j([pG.r1, pF.r1, pU.r1, pU.again, pDn.r1, pDn.again, pS.r1, warnN(100), warnN(101)]));
        // commitMany and revertLast, run for real on a fake GM (and a fake player)
        const cmSrc = sh7.slice(sh7.indexOf('function commitMany('), sh7.indexOf('// One inventory change on the open sheet'));
        const rvSrc = (sh7.match(/function revertLast\(\) \{[\s\S]*?\n\}/) || [''])[0];
        const mkCM = (client, sys, ch, cw) => {
            const log = { deltas: [], toasts: [], sent: [] }, camp = { system: sys, chars: { [ch.id]: ch } };
            const api = new Function('getActiveCampaign', 'systemOf', 'isClient', 'canWrite', 'applyEdit', 'F', 'clone', 'afterCharChange', 'toast', 'renderViews', 'net', 'LIMITS', 'charById', 'fieldById', 'ownerSeesSame', 'var lastChange = null;\n' + cmSrc + '\n' + rvSrc + '\nreturn { commitMany: commitMany, revertLast: revertLast, last: function() { return lastChange; } };')(
                () => camp, () => sys, () => client, () => cw !== false, S.applyEdit, () => F, x => JSON.parse(JSON.stringify(x)), (c, whole, d) => log.deltas.push(JSON.parse(JSON.stringify(d))), m => log.toasts.push(m), () => {},
                () => ({ charEdits: (id, list) => { log.sent.push([id, JSON.parse(JSON.stringify(list))]); return { ok: true }; } }), LIMITS, id => camp.chars[id], S.fieldById, () => false);   // F4b review: Revert asks whether an item list's owner saw the change (these fields are not lists)
            return { api, ch, log };
        };
        const g1 = mkCM(false, gD7, JSON.parse(JSON.stringify(chD))); g1.api.commitMany(g1.ch, tSt.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));
        const after1 = j([g1.ch.values.f_hp, g1.ch.values.f_dsv]), last1 = g1.api.last(); g1.api.revertLast(); const back1 = j([g1.ch.values.f_hp, g1.ch.values.f_dsv]);
        const g2 = mkCM(false, s12, { id: 'c_m', values: Object.assign({}, v12) }); g2.api.commitMany(g2.ch, f12.map(f => ({ fieldId: f.id, value: 0 })));
        const g3b = mkCM(false, gD7, JSON.parse(JSON.stringify(chD))); g3b.api.commitMany(g3b.ch, [{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_nope', value: 1 }]);
        const pl = mkCM(true, gD7, JSON.parse(JSON.stringify(chD))); pl.api.commitMany(pl.ch, f12.map(f => ({ fieldId: f.id, value: 0 })));
        const gG = mkCM(false, gGm, JSON.parse(JSON.stringify(chD))); gG.api.commitMany(gG.ch, asGm.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));   // a pool set to GM edits: the GM's own rules
        const nw = mkCM(false, gD7, JSON.parse(JSON.stringify(chD)), false); nw.api.commitMany(nw.ch, tSt.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));   // a view that cannot write
        check('HUD frame HF4b: commitMany (run for real) — the GM\'s Reset all is ONE change (one delta with every value) and ONE Revert brings every value back; at most 100 values; one value that is not allowed changes nothing; the GM resets a pool set to GM edits by the GM\'s rules; a view that cannot write changes nothing; a player\'s goes as one batched edit of at most 100',
            g1.log.deltas.length === 2 && j(Object.keys(g1.log.deltas[0])) === j(['f_dsv', 'f_hp']) && after1 === j([{ cur: 10 }, 0]) && last1.fieldId === 'f_dsv' && last1.prev === 2 && j(last1.extra) === j({ f_hp: { cur: 3 } }) && back1 === j([{ cur: 3 }, 2]) && g1.log.toasts.includes('Reverted.')
            && g2.log.deltas.length === 1 && Object.keys(g2.log.deltas[0]).length === 100 && g2.ch.values.f_c100 === 3 && g2.ch.values.f_c0 === 0
            && g3b.log.deltas.length === 0 && j(g3b.ch.values.f_hp) === j({ cur: 3 }) && g3b.log.toasts.length === 1
            && pl.log.sent.length === 1 && pl.log.sent[0][0] === 'c_d' && pl.log.sent[0][1].length === 100 && pl.log.deltas.length === 0
            && gG.log.deltas.length === 1 && j(Object.keys(gG.log.deltas[0]).sort()) === j(['f_sl1', 'f_sl2']) && gG.log.toasts.length === 0 && nw.log.deltas.length === 0 && j(nw.ch.values.f_hp) === j({ cur: 3 }) && nw.api.last() === null, j([g1.log, last1, g2.log.deltas, g3b.log, pl.log.sent.length]));
        // the client's batch (the pending slice from net.js): applied at once; a refusal takes every value of it back to the host's copy, the changes still waiting laid over again
        const pend7 = nt7.slice(nt7.indexOf('// [netcheck:pending-start]'), nt7.indexOf('// [netcheck:pending-end]'));
        const mkPend7 = new Function('getActiveCampaign', 'SC', 'window', 'toast', '_charPending', '_charHost', pend7 + '\nreturn { charPendingDone: charPendingDone, reapplyPending: reapplyPending, noteHostCopy: noteHostCopy };');
        const campB = { id: 'camp1', system: pD7, chars: { c_d: { id: 'c_d', ownerId: 'u_p', values: { f_hp: { cur: 3 }, f_dsv: 2, f_sl1: { cur: 0 } } } } }, pendB = {}, hostB = {}, seenB = [];
        const PB = mkPend7(() => campB, () => S, { wpFormula: F, wpSheets: { charChanged: id => seenB.push(['ok', id]), editResult: (rid, ok, reason) => seenB.push([rid, ok, reason]) } }, () => {}, pendB, hostB), cb = campB.chars.c_d;
        PB.noteHostCopy('c_d', cb.values);
        cb.values.f_hp = { cur: 10 }; cb.values.f_dsv = 0; pendB.b1 = { charId: 'c_d', fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 3 }, batch: [{ fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 3 } }, { fieldId: 'f_dsv', value: 0, prev: 2 }], timer: null };
        cb.values.f_sl1 = { cur: 1 }; pendB.v2 = { charId: 'c_d', fieldId: 'f_sl1', value: { cur: 1 }, prev: { cur: 0 }, timer: null };
        cb.values = { f_hp: { cur: 5 }, f_dsv: 1, f_sl1: { cur: 0 } }; PB.noteHostCopy('c_d', cb.values); PB.reapplyPending('c_d');   // a newer copy: everything still waiting is laid over it
        const midB = j(cb.values); PB.charPendingDone('b1', false, 'slow'); const afterB = j(cb.values);
        pendB.b2 = { charId: 'c_d', fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 5 }, batch: [{ fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 5 } }], timer: null }; PB.charPendingDone('b2', true);
        check('HUD frame HF4b: a player\'s batch (the real pending code) — a newer host copy gets every waiting value laid over it again; a refused batch takes ALL its values back to the host\'s last copy (never the one it was made on), the other changes still waiting kept; one answer for the batch; an ok answer draws nothing (1.6.3, finding 23: nothing in the copy moved, and the delta that follows draws), moved on purpose',
            midB === j({ f_hp: { cur: 10 }, f_dsv: 0, f_sl1: { cur: 1 } }) && afterB === j({ f_hp: { cur: 5 }, f_dsv: 1, f_sl1: { cur: 1 } }) && !pendB.b1 && !!pendB.v2 && !pendB.b2 && j(seenB) === j([['b1', false, 'slow']]), j([midB, afterB, seenB]));
        check('HUD frame HF4b: the chip — drawn only behind sec.resetAll === true, in the header after the Pin; live decided when drawn (the real sheet or HUD, never the Layout preview or a pop-out), inert with nothing to reset; the client sends ONE char-edits message and keeps ONE pending entry for the batch',
            /var rsCh = !printV && sec\.resetAll === true \? resetChip\(sec, pctx\) : null;/.test(sh7) && /if \(pinCh\) head\.appendChild\(pinCh\);\n            if \(rsCh\) head\.appendChild\(rsCh\);/.test(sh7) && /\|\| chipNode \|\| pinCh \|\| rsCh \|\| cntN !== null \|\| \(sec\.explain && !printV\)\) \{/.test(sh7)   /* 1.6.0, backlog 180 R9: a count alone also draws the header; 1.6.2 (backlog 218 fold 3) and an (i), both moved on purpose */
            && /var live = _fxLive && !\(ctx\.vctx && ctx\.vctx\.preview\) && !window\.wpPopout, targets = rt\.targets, barred = typeof fillBarred === 'function' && fillBarred\(\), on = live && targets\.length > 0 && !barred;/.test(sh7)
            && /ch\.setAttribute\('aria-disabled', on \? 'false' : 'true'\);/.test(sh7)
            && /import \{[^}]*resetTargets[^}]*\} from '\.\/systemcore\.js';/.test(sh7) && (sh7.match(/resetChip\(/g) || []).length === 2
            && /try \{ net\.conns\[0\]\.send\(\{ type: 'char-edits', rid: rid, charId: charId, values: batch\.map\(/.test(nt7) && /_charPending\[rid\] = \{ charId: charId, fieldId: batch\[0\]\.fieldId, value: batch\[0\]\.value, prev: batch\[0\]\.prev, batch: batch, timer:/.test(nt7));
        // the chip, run for real on a small fake DOM
        const rcSrc = sh7.slice(sh7.indexOf('function resetChip('), sh7.indexOf('// Stage 5c / Stage 6 (L4): the pinned band'));
        const fe = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text || '', children: [], attrs: {}, dataset: {}, title: '', tabIndex: -1, on: {}, inModal: false, appendChild(x) { this.children.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; }, closest(q) { return q === '#systemModal' && e.inModal ? {} : null; } }; return e; };
        const chipRun = (sys, sc, ch, o) => { o = o || {}; const calls = [], redraws = [], pend = o.pend || {};
            const make = new Function('resetTargets', 'F', '_fxLive', 'window', 'el', 'iconNode', 'commitMany', 'renderViews', '_stepPend', rcSrc + '\nreturn resetChip;')(S.resetTargets, () => F, o.fxLive !== false, { wpPopout: o.popout || null }, fe, (v, c) => fe('span', c + ' wp-glyph'), (c, list) => calls.push(JSON.parse(JSON.stringify(list))), id => redraws.push(id), pend);
            const chip = make(sc, { sys, c: ch, gm: !!o.gm, own: !!o.own, vctx: { preview: !!o.preview } }), ev = k => ({ key: k, preventDefault() {}, stopPropagation() {} });
            return { chip, calls, redraws, pend, click() { chip.on.click(ev()); }, key(k) { chip.on.keydown(ev(k)); }, text: chip && chip.children[1] ? chip.children[1].textContent : null }; };
        const hst = sec7(gD7.sheet.hud, 's_hstat'), cln = () => JSON.parse(JSON.stringify(chD));
        const cGm = chipRun(gD7, hst, cln(), { gm: true, pend: { 'c_d|f_dsv': { timer: null, value: '1' }, 'c_x|f_dsv': { timer: null, value: '1' } } }), a0 = j([cGm.chip.attrs, cGm.chip.tabIndex, cGm.chip.dataset.reset, cGm.text, cGm.chip.title]);
        cGm.key('a'); const k0 = cGm.calls.length; cGm.key('Enter');
        const chT = cln(), cT = chipRun(gD7, hst, chT, { gm: true }); chT.values.f_hp = { cur: 10 }; cT.click();   // the values moved after the chip was drawn
        const chN = cln(), cN = chipRun(gD7, hst, chN, { gm: true }); chN.values.f_hp = { cur: 10 }; chN.values.f_dsv = 0; cN.click();
        const cM = chipRun(gD7, hst, cln(), { gm: true }); cM.chip.inModal = true; cM.click();
        const cP = chipRun(gD7, hst, cln(), { gm: true, preview: true }); cP.click(); const cO = chipRun(gD7, hst, cln(), { gm: true, popout: {} }), cF = chipRun(gD7, hst, cln(), { gm: true, fxLive: false });
        const allGm = JSON.parse(JSON.stringify(fx7('hud-d20'))); ['f_sl1', 'f_sl2', 'f_sl3'].forEach(id => { allGm.fields.find(f => f.id === id).edit = 'gm'; }); const sAll = cleanSystem(allGm, GV7);
        const cOnlyGm = chipRun(sAll, sec7(sAll.sheet.hud, 's_hslots'), cln(), { own: true }), cFull = chipRun(gD7, sec7(gD7.sheet.hud, 's_hslots'), { id: 'c_d', values: { f_level: 5 } }, { gm: true }), cNone = chipRun(gD7, sec7(gD7.sheet.hud, 's_hchk'), cln(), { gm: true }), cLong = chipRun(pD7, sec7(pD7.sheet.hud, 's_hslots'), cln(), { own: true });
        check('HUD frame HF4b: the chip (run for real) — a button chip with its words, focusable, marked with its section; Enter or a click resets the targets as they are AT THE CLICK (a minus/plus burst of this character\'s counters dropped first, another character\'s kept) and a click with nothing left only redraws; nothing in the System editor; inert and saying why in the Layout preview, a pop-out, a view whose pools are the GM\'s alone, and when everything is full; no chip without a pool or a counter; a player\'s Long rest is live',
            a0 === j([{ role: 'button', 'aria-disabled': 'false' }, 0, 's_hstat', 'Reset all', 'Resets Death saves, Hit points']) && k0 === 0 && j(cGm.calls) === j([[{ fieldId: 'f_dsv', value: 0 }, { fieldId: 'f_hp', value: { cur: 10 } }]]) && !('c_d|f_dsv' in cGm.pend) && ('c_x|f_dsv' in cGm.pend)
            && j(cT.calls) === j([[{ fieldId: 'f_dsv', value: 0 }]]) && cN.calls.length === 0 && j(cN.redraws) === j(['c_d']) && cM.calls.length === 0
            && cP.chip.attrs['aria-disabled'] === 'true' && /on the sheet itself/.test(cP.chip.title) && cP.calls.length === 0 && cO.chip.attrs['aria-disabled'] === 'true' && cF.chip.attrs['aria-disabled'] === 'true'
            && cOnlyGm.chip.attrs['aria-disabled'] === 'true' && cOnlyGm.chip.title === 'Only the GM resets these' && cOnlyGm.chip.tabIndex === 0 && cFull.chip.tabIndex === 0 && cFull.chip.attrs['aria-disabled'] === 'true' && /^Nothing to reset/.test(cFull.chip.title) && cNone.chip === null
            && cLong.text === 'Long rest' && cLong.chip.attrs['aria-disabled'] === 'false' && cLong.chip.tabIndex === 0, j([a0, cGm.calls, cT.calls, cN.redraws, cOnlyGm.chip && cOnlyGm.chip.title, cFull.chip && cFull.chip.title]));
        // the focus: a Reset all pressed from the keyboard keeps it (focusKeyOf / restoreFocus, run for real)
        const fkSrc = (sh7.match(/function focusKeyOf\(root\) \{[^\n]*/) || [''])[0], rfSrc = (sh7.match(/function restoreFocus\(root, k\) \{[^\n]*/) || [''])[0], doc7 = { activeElement: null }, focused = [];
        const FK = new Function('document', 'PIN_GID', fkSrc + '\n' + rfSrc + '\nreturn { focusKeyOf: focusKeyOf, restoreFocus: restoreFocus };')(doc7, /^g_[A-Za-z0-9_]{1,24}$/);
        doc7.activeElement = { dataset: { reset: 's_hstat' }, closest: () => null }; const fk7 = FK.focusKeyOf({ contains: () => true });
        FK.restoreFocus({ querySelector: q => (q === '.sheet-sec-title [data-reset="s_hstat"]' ? { focus: () => focused.push('chip') } : null) }, fk7);
        doc7.activeElement = { dataset: { reset: 's_x"] body' }, closest: () => null }; const fkBad = FK.focusKeyOf({ contains: () => true });
        check('HUD frame HF4b: the focus stays on Reset all after the redraw it causes (its section is the key); a key that is not a section id is never used in a selector',
            j(fk7) === j({ reset: 's_hstat' }) && j(focused) === j(['chip']) && fkBad === null, j([fk7, focused, fkBad]));
        check('HUD frame HF4b: the editor — a Reset row under a section that places a pool or a counter (or already has Reset all): its checkbox, and while it is ticked its own words; each set or cleared by its exact class; more than 10 of them says so in the row itself',
            /if \(canReset \|\| sec\.resetAll\) \{/.test(require('./checkkit').part('sysedlayout.js')) && /var rsc = el\('input', 'sys-sec-resetall'\); rsc\.type = 'checkbox'; rsc\.checked = !!sec\.resetAll;/.test(require('./checkkit').part('sysedlayout.js')) && /if \(sec\.resetAll\) rsRow\.appendChild\(input\('sys-sec-resettext field', sec\.resetText,/.test(require('./checkkit').part('sysedlayout.js'))
            && /if \(t\.classList\.contains\('sys-sec-resetall'\)\) \{ if \(t\.checked\) sec\.resetAll = true; else delete sec\.resetAll; markDirty\(\); renderLayout\(\); return true; \}/.test(require('./checkkit').part('sysedlayout.js'))
            && /else if \(t\.classList\.contains\('sys-sec-resettext'\)\) \{ if \(t\.value\.trim\(\)\) sec\.resetText = t\.value\.slice\(0, LIMITS\.label\); else delete sec\.resetText; \}/.test(require('./checkkit').part('sysedlayout.js'))
            && /if \(sec\.resetAll && nRs > LIMITS\.editBatch\) rsRow\.appendChild\(el\('span', 'sys-warn-line sys-reset-note', 'Reset all resets the first ' \+ LIMITS\.editBatch \+ ' of these ' \+ nRs \+ '\.'\)\);/.test(require('./checkkit').part('sysedlayout.js'))
            && (() => { const disp = (sh7.match(/c\.indexOf\('sys-[a-z0-9-]+'\)/g) || []).map(m => m.slice(11, -2)), cls = new Set(sh7.match(/sys-[a-z0-9-]+/g) || []); return ['sys-sec-resetall', 'sys-sec-resettext'].every(n => disp.every(t => n.indexOf(t) < 0) && [...cls].every(o => o === n || o.indexOf(n) < 0)); })());
        // the tour's seed and its one-shot migration (seed 2), run for real
        const tut7 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n');
        const fnT7 = name => { const i = tut7.indexOf('function ' + name + '('); let d = 0; const k = tut7.indexOf('{', i); for (let p = k; p < tut7.length; p++) { if (tut7[p] === '{') d++; else if (tut7[p] === '}') { d--; if (d === 0) return tut7.slice(i, p + 1); } } return ''; };
        const T7 = new Function(['tutorialPostures', 'tutorialEffects', 'tutorialHud', 'tutorialSenses', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT7).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const hfx = sys => sys.sheet.hud.sections.find(x => x.id === 's_tut_hfx');
        const old7 = () => { const s = T7.sys(); delete s.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; delete hfx(s).resetAll; return { system: s, chars: { c_tut_bren: T7.ch('/x/') }, items: {} }; };
        const m1 = old7(), r71 = T7.ensure(m1), m2 = old7(); hfx(m2.system).title = 'My condition'; T7.ensure(m2); const m3 = old7(); m3.tutorialSeed = 1; T7.ensure(m3); const m4 = old7(); m4.tutorialSeed = 2; T7.ensure(m4);
        const edits7 = [s => { s.collapsible = true; }, s => { s.tab = 't_tut_hact'; }, s => { s.cols = 2; }, s => { s.fields.pop(); }].map(fn => { const m = old7(); fn(hfx(m.system)); T7.ensure(m); return !('resetAll' in hfx(m.system)); });
        check('HUD frame HF4b: the tour\'s HUD Condition section carries Reset all (HP back to full); an older tutorial gains it once (seed 2, which a fresh build carries) and only on the untouched seed; a section someone changed, or a tutorial already past it, is left alone',
            T7.hud().sections.find(x => x.id === 's_tut_hfx').resetAll === true && r71 === true && hfx(m1.system).resetAll === true && m1.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true && m1.tutorialSeed === 2
            && !('resetAll' in hfx(m2.system)) && edits7.every(Boolean) && m2.tutorialSeed === 2 && hfx(m3.system).resetAll === true && m3.tutorialSeed === 2 && !('resetAll' in hfx(m4.system))
            && /camp\.tutorialSeed = 2;[^\n]*\n    camp\.vtt = tutorialVtt\(\);/.test(tut7), j([r71, m1.tutorialSeed, hfx(m2.system), hfx(m4.system)]));
        // window.wpSystemCore (what net.js and the other plain scripts call) carries every name the module exports, and nothing else — a new
        // export missing there fails only on a live table (the host's char-edits handler did, before this check)
        const core7 = fs.readFileSync(path.join(app, 'scripts', 'systemcore.js'), 'utf8').replace(/\r\n/g, '\n');
        const apiKeys = ((core7.match(/\nvar API = \{([^\n]*)\};/) || [])[1] || '').split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort(), expKeys = ((core7.match(/\nexport \{([^}]*)\};/) || [])[1] || '').split(',').map(x => x.trim()).filter(Boolean).sort();
        check('HUD frame HF4b: window.wpSystemCore carries exactly the names systemcore exports (cleanCharEdits and resetTargets among them), so the host\'s handlers find every helper they call',
            apiKeys.length >= 90 && j(apiKeys) === j(expKeys) && apiKeys.includes('cleanCharEdits') && apiKeys.includes('resetTargets'), j([apiKeys.filter(k => !expKeys.includes(k)), expKeys.filter(k => !apiKeys.includes(k))]));
        const css7 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b7 = css7.slice(css7.indexOf('/* HF4b (H13)')), r7 = b7.split('\n').filter(l => /^  [.@]/.test(l));
        check('HUD frame HF4b: the chip\'s CSS lives in the HUD block, gated by the reset chip (grayed and unlit when inert); Help describes Reset all',
            r7.length >= 1 && r7.every(l => l.split('{')[0].split(',').every(m => /\.sheet-sec-reset\b/.test(m))) && /\[aria-disabled="true"\]/.test(r7[0])
            && /<b>Reset all<\/b>: a section holding pools or counters can show a button in its header\. Its text is yours, such as <i>Long rest<\/i>\. It fills the section&rsquo;s pools back to full and sets its counters back to their start\. Players reset their own\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j(r7));
    }
    /* ---- Stage 6 HUD frame (HF5a): values in roll labels (H3) — the label and the button run for real, the players' scrub, the validator, the privacy names ---- */
    {
        const sh8 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), DC8 = await import(url('dicecore.js'));
        const BS8 = String.fromCharCode(92), PM8 = String.fromCharCode(0xB1), DASH8 = String.fromCharCode(0x2014), BEL8 = String.fromCharCode(7), EMO8 = String.fromCharCode(0xD83D, 0xDE00);
        const fx8 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV8 = { F, gmView: true }, PV8 = { F, gmView: false };
        const gD8 = cleanSystem(fx8('hud-d20'), GV8), pD8 = cleanSystem(fx8('hud-d20'), PV8), g38 = cleanSystem(fx8('hud-3d6'), GV8), p38 = cleanSystem(fx8('hud-3d6'), PV8);
        const rl8 = (sys, id) => sys.rolls.find(r => r.id === id), lone8 = s => [...s].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDFFF);
        // the real slice — rollLabel, labelSecret and rollNode — on a fake DOM
        const rnSrc = sh8.slice(sh8.indexOf('var LABEL_CTRL_G = '), sh8.indexOf('// A roll from this character\'s sheet: the dice feature on'));
        const fe8 = (tag, cls, text) => ({ tag, className: cls || '', _t: text || '', get textContent() { return this._t + this.children.map(c => c.textContent || '').join(''); }, set textContent(v) { this._t = v; this.children = []; }, children: [], title: '', disabled: false, firstChild: null, on: {}, appendChild(x) { this.children.push(x); if (!this.firstChild) this.firstChild = x; return x; }, insertBefore(x) { this.children.unshift(x); this.firstChild = x; return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const btn = (sys, r, ch, o) => { o = o || {}; const rolls = [], toasts = [], all = S.resolveAll(sys, ch, F, null);
            const mk = new Function('F', 'net', 'isClient', 'captionParts', 'labelNames', 'labelGmNames', 'gmDerivedNames', 'gmEffectNames', 'el', 'iconNode', 'canRoll', 'sheetRoll', 'toast', 'ROLL_TONE_CLS', 'getActiveCampaign', 'charById', 'resolveAll', 'tokenCtxFor', rnSrc + '\nreturn { rollLabel: rollLabel, labelSecret: labelSecret, rollNode: rollNode };')(
                () => (o.noF ? null : F), () => o.net || null, () => !!o.client, S.captionParts, S.labelNames, S.labelGmNames, S.gmDerivedNames, S.gmEffectNames, fe8, (v, c) => fe8('span', c), () => true, (e, cid, expr, label, opts) => rolls.push([cid, expr, label, opts]), t => toasts.push(t), { primary: ' p' }, () => ({ chars: {} }), () => null, S.resolveAll, () => null);
            const box = mk.rollNode(r, ch, sys, all.vars), b = box.children[0]; return { text: b.textContent, rolls, toasts, click() { b.on.click({}); }, secret: mk.labelSecret(sys, all.vars, r.label) }; };
        const chA = { id: 'c_a', values: { f_str: 14, f_level: 5 } }, host = { active: true, role: 'host' };
        const bAtk = btn(gD8, rl8(gD8, 'r_atk'), chA), bAtkH = btn(gD8, rl8(gD8, 'r_atk'), chA, { net: host }), bTrap = btn(gD8, rl8(gD8, 'r_trap'), chA, { net: host }), bTrapOff = btn(gD8, rl8(gD8, 'r_trap'), chA), bTrapP = btn(pD8, rl8(pD8, 'r_trap'), chA, { net: { active: true, role: 'client' }, client: true });
        bAtk.click(); bAtkH.click(); bTrap.click(); bTrapOff.click(); bTrapP.click();
        const b3 = btn(g38, rl8(g38, 'r_punch'), { id: 'c_3', values: { f_dx: 12, f_brawl: 2 } }), bNoF = btn(gD8, rl8(gD8, 'r_atk'), chA, { noF: true }), bPlain = btn(gD8, rl8(gD8, 'r_dmg'), chA, { net: host }); bPlain.click();
        check('HUD frame HF5a: a roll\'s label shows its value (run for real) — d20 Attack ({' + PM8 + 'AtkBonus}) reads "Attack (+5)" at STR 14, Level 5 (signed), 3d6 Attack ({Skill.Brawling}) "Attack (10)" (ranks 2 + DX 12 - 4, unsigned); the click rolls the formula under the label as shown; a plain label and a label without the engine are as written',
            bAtk.text === 'Attack (+5)' && j(bAtk.rolls) === j([['c_a', 'd20 + STRmod + Prof', 'Attack (+5)', undefined]]) && bAtk.toasts.length === 0 && b3.text === 'Attack (10)' && bNoF.text === 'Attack ({' + PM8 + 'AtkBonus})' && bPlain.text === 'Damage' && j(bPlain.rolls) === j([['c_a', '1d8 + STRmod', 'Damage', undefined]]), j([bAtk.text, bAtk.rolls, b3.text, bNoF.text, bPlain.rolls]));
        check('HUD frame HF5a: a public roll never carries a GM-only value — on the host in a session, Trap save ({GMFig}) rolls PRIVATE with a toast naming the field, while Attack (+5) stays public; with no table nothing is private; a player holds the scrubbed "Trap save" (nothing left to judge)',
            bTrap.text === 'Trap save (0)' && j(bTrap.rolls) === j([['c_a', 'd20 + DEXmod', 'Trap save (0)', { priv: true }]]) && bTrap.toasts.length === 1 && /GM-only value \(GMFig\)/.test(bTrap.toasts[0]) && bTrap.secret === 'GMFig'
            && j(bAtkH.rolls) === j([['c_a', 'd20 + STRmod + Prof', 'Attack (+5)', undefined]]) && bAtkH.secret === '' && bAtkH.toasts.length === 0 && bTrapOff.secret === '' && bTrapOff.rolls[0][3] === undefined && bTrapOff.toasts.length === 0
            && bTrapP.text === 'Trap save' && bTrapP.secret === '' && j(bTrapP.rolls) === j([['c_a', 'd20 + DEXmod', 'Trap save', undefined]]), j([bTrap.text, bTrap.rolls, bTrap.toasts, bAtkH.rolls, bTrapOff.rolls, bTrapP.text]));
        // a GM-only effect on a value the label shows makes the GM's roll private too (gmEffectNames through the render's resolver)
        const fxSys = cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 3, vis: 'all' }, { id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all' }], rolls: [{ id: 'r_a', label: 'Swing ({A})', formula: 'd6 + A', vis: 'all' }], effects: [{ id: 'e_g', name: 'Blessed', vis: 'gm', mods: [{ f: 'f_a', op: 'add', v: 2 }] }, { id: 'e_p', name: 'Rage', mods: [{ f: 'f_a', op: 'add', v: 1 }] }] }, GV8);
        const chG = () => ({ id: 'c_e', values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } }), bFxG = btn(fxSys, fxSys.rolls[0], chG(), { net: host }), bFxP = btn(fxSys, fxSys.rolls[0], { id: 'c_e', values: { f_fx: [{ id: 'x_2', ref: 'e_p', on: true }] } }, { net: host });
        const bFxC = btn(fxSys, fxSys.rolls[0], chG(), { net: { active: true, role: 'client' }, client: true }), bFxI = btn(fxSys, fxSys.rolls[0], chG(), { net: { active: false, role: 'host' } }); bFxG.click(); bFxP.click(); bFxC.click(); bFxI.click();
        check('HUD frame HF5a: a value a GM-only effect changed makes the host\'s roll private (Swing ({A}) at A 3 + 2 reads "Swing (5)" and goes to the GM alone); a public effect leaves it public; a player\'s own copy, and a host whose table is not up, never mark a roll private (the host judges a player\'s roll)',
            bFxG.text === 'Swing (5)' && bFxG.secret === 'A' && j(bFxG.rolls[0][3]) === j({ priv: true }) && bFxP.text === 'Swing (4)' && bFxP.secret === '' && bFxP.rolls[0][3] === undefined
            && bFxC.text === 'Swing (5)' && bFxC.secret === '' && bFxC.rolls[0][3] === undefined && bFxC.toasts.length === 0 && bFxI.secret === '' && bFxI.rolls[0][3] === undefined, j([bFxG.text, bFxG.secret, bFxP.text, bFxP.secret, bFxC.secret, bFxI.secret]));
        // what the dice path must accept: a text or select value prints a dash (the engine yields numbers and booleans only, as in a caption), a long
        // result is cut to 60, a label whose own cap split a surrogate pair loses the lone half, a value that fails prints a dash
        const ctlSys = cleanSystem({ v: 1, name: 'C', fields: [{ id: 'f_m', key: 'Mode', kind: 'select', options: ['a' + BEL8 + 'b' + BEL8 + 'c'] }, { id: 'f_a', key: 'A', kind: 'number', def: 5 }, { id: 'f_on', key: 'On', kind: 'toggle', def: true }], rolls: [{ id: 'r_m', label: 'Do {Mode}', formula: 'd6' }, { id: 'r_l', label: 'x'.repeat(48) + ' {A} {A} {A}', formula: 'd6' }, { id: 'r_e', label: 'Zap ({Nope})', formula: 'd6' }, { id: 'r_b', label: '{On} {A}', formula: 'd6' }] }, GV8);
        const lbOf = (id, vals) => btn(ctlSys, rl8(ctlSys, id), { id: 'c_c', values: vals || {} }).text, capM = S.captionParts(ctlSys, { id: 'c_c', values: {} }, F, 'Do {Mode}', null);
        const lMode = lbOf('r_m'), lLong = lbOf('r_l', { f_a: 1000000 }), rawS8 = { id: 'r_s', label: '{A}' + EMO8.repeat(28) + String.fromCharCode(0xD83D), formula: 'd6' }, lSurr = btn(ctlSys, rawS8, { id: 'c_c', values: {} }).text, lErr = lbOf('r_e'), lBool = lbOf('r_b');
        check('HUD frame HF5a: the label the dice path gets — a text or select value prints a dash, as a caption does; a long result is cut to 60; a label whose own 60 cap split a surrogate pair loses the lone half; a value that fails prints a dash; a toggle reads yes; each one passes dicecore.cleanLabel',
            capM.length === 2 && !!capM[1].error && lMode === 'Do ' + DASH8 && lLong.length === 60 && lLong.indexOf('x'.repeat(48) + ' 1000000 ') === 0 && rawS8.label.length === 60 && lone8(rawS8.label) && lSurr === '5' + EMO8.repeat(28) && !lone8(lSurr)
            && lErr === 'Zap (' + DASH8 + ')' && lBool === 'yes 5' && [lMode, lLong, lSurr, lErr, lBool].every(l => DC8.cleanLabel(l) !== null && DC8.cleanLabel(l) !== ''), j([lMode, lLong, lSurr.length, lErr, lBool]));
        // the players' scrub
        const scrub = labels => cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: labels.map((lb, i) => ({ id: 'r_' + i, label: lb, formula: 'd6' })) }, PV8).rolls.map(r => r.label);
        const eight = Array.from({ length: 8 }, () => '{A}').join(''), eight80 = '{A}'.repeat(80);
        const scr = scrub(['Trap ({G})', 'Hit {G', 'Fire ' + eight + ' {G}', '{G}', 'Plain {A}', 'Both [{A}] - {G}', 'X: {G.max}', 'Sign ({' + PM8 + 'G})', 'Hi {!}']);
        check('HUD frame HF5a: the players\' view keeps only the plain text before a {...} that names a GM-only value (a trailing separator dropped; an unclosed "{" and a value past the 8th count too; "Roll" when nothing is left); a label naming no GM-only value is kept, brace and all; a second clean changes nothing (d20 Trap save ({GMFig}) reads "Trap save")',
            j(scr) === j(['Trap', 'Hit', 'Fire', 'Roll', 'Plain {A}', 'Both', 'X', 'Sign', 'Hi {!}']) && rl8(pD8, 'r_trap').label === 'Trap save' && rl8(gD8, 'r_trap').label === 'Trap save ({GMFig})' && rl8(pD8, 'r_atk').label === 'Attack ({' + PM8 + 'AtkBonus})' && rl8(p38, 'r_punch').label === 'Attack ({Skill.Brawling})'
            && j(cleanSystem(pD8, PV8).rolls) === j(pD8.rolls) && j(cleanSystem(p38, PV8).rolls) === j(p38.rolls) && j(scrub(scr)) === j(scr)
            && [gD8, pD8].every(s => s.sheet.hud.sections.find(x => x.id === 's_hatk').fields.some(p => p.roll === 'r_trap')) && rl8(gD8, 'r_trap').vis === 'all', j([scr, rl8(pD8, 'r_trap')]));
        // the validator
        const lw = sys => S.validateSystem(sys, F).warnings.filter(w => w.prop === 'label').map(w => w.message), vD = S.validateSystem(gD8, F), v3 = S.validateSystem(g38, F);
        const vSys = labels => cleanSystem({ v: 1, name: 'V', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_m', key: 'Mode', kind: 'select', options: ['a'] }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: labels.map((lb, i) => Object.assign({ id: 'r_' + i, formula: 'd6' }, lb)) }, GV8);
        const vw = lw(vSys([{ label: 'Hi {!}' }, { label: '{d6}' }, { label: '{Nope}' }, { label: '{Mode}' }, { label: 'Trap ({G})' }, { label: 'Secret {G}', vis: 'gm' }, { label: 'Nine ' + eight }, { label: 'Fine {A} {Facing}' }, { label: 'No brace' }]));
        check('HUD frame HF5a: validateSystem checks a label\'s {...} like a caption\'s — a parse error, dice, an unknown name, a value that is not a number, a GM-only name in a visible roll (saying what players see instead), a ninth value is read as any other; a GM-only roll, a facing name and a plain label pass; both fixtures validate with no error, the d20 one warning about Trap save',
            vw.length === 5 && /^Label: /.test(vw[0]) && vw[1] === 'Label: dice are not worked out in a label; put them in the formula.' && vw[2] === 'Label: unknown name "Nope".' && vw[3] === 'Label: "Mode" is not a number.' && vw[4] === 'Label: "G" is GM only, so players see only "Trap".'
            && vD.ok && j(lw(gD8)) === j(['Label: "GMFig" is GM only, so players see only "Trap save".']) && v3.ok && lw(g38).length === 0, j([vw, vD.errors, v3.errors]));
        // labelNames and the cleaner's control characters
        check('HUD frame HF5a: labelNames reads the first 80 {...} of a label as [{ name }], each name once (case folded), the sign stripped, dice and a parse error skipped, nothing without the engine; gmOnlyNames picks the GM-only ones from it; cleanRollDef now replaces EVERY control character in a label (the dice path refused a second one)',
            j(S.labelNames(F, 'A ({' + PM8 + 'AtkBonus}) {STRmod} {atkbonus} {1d6 + Prof} {!}')) === j([{ name: 'AtkBonus' }, { name: 'STRmod' }, { name: 'Prof' }]) && j(S.labelNames(F, eight80 + '{STRmod}')) === j([{ name: 'A' }]) && S.labelNames(F, 'no braces').length === 0 && S.labelNames(null, '{A}').length === 0
            && j(S.gmOnlyNames(gD8, S.labelNames(F, 'x {GMFig} {STRmod}'))) === j(['GMFig']) && S.cleanRollDef({ id: 'r_x', label: 'a' + BEL8 + 'b' + BEL8 + 'c', formula: 'd6' }, true).label === 'a b c' && DC8.cleanLabel(S.cleanRollDef({ id: 'r_x', label: 'a' + BEL8 + 'b' + BEL8 + 'c', formula: 'd6' }, true).label) === 'a b c');
        // namesFacing, run for real: a label showing a facing or stance value redraws on a finished turn
        const nfSrc = sh8.slice(sh8.indexOf('function namesFacing(sys) {'), sh8.indexOf('// A finished turn redraws the numbers that read facing'));
        const NF = new Function('F', 'capExpr', nfSrc + '\nreturn namesFacing;')(() => F, S.capExpr), nfSys = (rolls, fields) => ({ fields: fields || [{ key: 'A', formula: 'A' }], rolls });
        check('HUD frame HF5a: namesFacing (run for real) sees a roll label that shows a facing or stance value, so a finished turn redraws it; a plain label, no rolls, or a label naming a field of the system\'s own called Facing do not; a formula naming Facing still does',
            NF(nfSys([{ label: 'Hit ({Arc.front})' }])) === true && NF(nfSys([{ label: 'Hit ({' + PM8 + 'Posture})' }])) === true && NF(nfSys([{ label: 'Hit ({A})' }])) === false && NF(nfSys([{ label: 'Hit' }])) === false && NF(nfSys([])) === false && NF({ fields: [{ key: 'A', formula: 'A' }] }) === false
            && NF(nfSys([{ label: '{Facing}' }], [{ key: 'Facing', kind: 'number' }])) === false && NF({ fields: [{ key: 'X', formula: 'Facing + 1' }], rolls: [] }) === true);
        check('HUD frame HF5a (source): both roll buttons (the band and a section) are drawn with the system and the render\'s resolver, and nothing else builds one; the initiative roll resolves its label and its privacy the same way; the privacy check is the host\'s alone; the label input says so; Help describes it',
            /rollNode\(rollById\[q\.roll\], c, sys, all\.vars\)/.test(sh8) && /rollNode\(rollById\[pl\.roll\], c, sys, all\.vars\)/.test(sh8) && (sh8.match(/rollNode\(/g) || []).length === 4 && /var nodeR = rollNode\(rl, c, sys, null\)/.test(sh8)
            && /lbI = allI \? rollLabel\(r, sys, c, allI\.vars\) : r\.label, whyI = allI \? labelSecret\(sys, allI\.vars, r\.label\) : ''/.test(sh8) && /rollFor\(charId, r\.formula, lbI \|\| 'Initiative', \{ source: 'combat', priv: !!whyI \|\| !!\(opts && opts\.priv === true\), gmOnly: r\.vis === 'gm' \}\)/.test(sh8)
            && /if \(isClient\(\) \|\| !\(n && n\.active && n\.role === 'host'\)/.test(sh8) && /import \{[^}]*labelGmNames, gmEffectNames, labelNames[^}]*\} from '\.\/systemcore\.js';/.test(sh8) && sh8.indexOf('{formula} shows a value: Attack ({' + BS8 + 'u00b1AtkBonus})') > 0
            && /<b>Values in labels<\/b>: a roll&rsquo;s label can carry <code>\{formula\}<\/code> values like a caption/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }
    /* ---- Stage 6 HUD frame (HF5b): the built-in CombatRound (H8) — withRound and the resolver run for real, the validator, the fixtures, the views' round signature ---- */
    {
        const sh9 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt9 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const fx9 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV9 = { F, gmView: true }, PV9 = { F, gmView: false };
        const gD9 = cleanSystem(fx9('hud-d20'), GV9), pD9 = cleanSystem(fx9('hud-d20'), PV9), g39 = cleanSystem(fx9('hud-3d6'), GV9), p39 = cleanSystem(fx9('hud-3d6'), PV9), gB9 = cleanSystem(fx9('hud-bare'), GV9);
        const tc0 = { facing: null, stance: { posture: 0, elevation: 0 } }, tcJ = j(tc0);
        const w4 = S.withRound(tc0, { round: 4.7 }), wBig = S.withRound(tc0, { round: 1e9 }), wNeg = S.withRound(tc0, { round: -2 });
        check('HUD frame HF5b: withRound (run for real) — a NEW context carrying the combat\'s round, floored and kept within 0..9999, the facing and stance as they were, the input untouched; the context itself comes back for no context, no combat, or a round that is not a finite number',
            j(w4) === j({ facing: null, stance: { posture: 0, elevation: 0 }, combat: { round: 4 } }) && w4 !== tc0 && j(tc0) === tcJ && wBig.combat.round === 9999 && wNeg.combat.round === 0
            && S.withRound(null, { round: 2 }) === null && S.withRound(tc0, null) === tc0 && S.withRound(tc0, {}) === tc0 && S.withRound(tc0, { round: 'x' }) === tc0 && S.withRound(tc0, { round: NaN }) === tc0 && S.withRound(tc0, { round: Infinity }) === tc0 && S.withRound(undefined, { round: 2 }) === undefined, j([w4, wBig, wNeg]));
        // the built-in through the resolver and resolveAll: the round, 0 without one, a field of the system's own keeps the name, Round is no name and round() the function
        const cSys = cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }, { id: 'f_t', key: 'Tally', kind: 'formula', formula: 'CombatRound * 2 + round(2.5)' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, caption: 'round {CombatRound}' }], rolls: [] }, GV9);
        const own9 = cleanSystem({ v: 1, name: 'O', fields: [{ id: 'f_cr', key: 'CombatRound', kind: 'number', def: 7 }, { id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }], rolls: [] }, GV9);
        const ch9 = { id: 'c_9', values: {} }, ctx3 = S.withRound(tc0, { round: 3 });
        const r3 = S.resolveAll(cSys, ch9, F, ctx3), r0 = S.resolveAll(cSys, ch9, F, tc0), rN = S.resolveAll(cSys, ch9, F, null), rO = S.resolveAll(own9, ch9, F, ctx3);
        const vars3 = S.makeResolver(cSys, ch9, F, ctx3), evR = F.evaluate('Round', { vars: vars3 }), evF = F.evaluate('round(2.5)', { vars: vars3 }), evC = F.evaluate('CombatRound', { vars: vars3 }), evM = F.evaluate('CombatRound.max', { vars: vars3 });
        const fxR = cleanSystem({ v: 1, name: 'X', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }, { id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_b', name: 'Haste', mods: [{ f: 'f_r', op: 'add', v: 2 }] }] }, GV9);
        const rFx = S.resolveAll(fxR, { id: 'c_x', values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true }] } }, F, ctx3);
        check('HUD frame HF5b: CombatRound reads the round of the context (3), 0 with a context without a combat and 0 with none; a field of the system\'s own keyed CombatRound keeps the name (7, and its formula reads it); Round is still an unknown name, round(2.5) still the function, CombatRound.max no name; a caption reads it; an effect on a value reading it shows its base from the same round; validKey allows CombatRound and refuses Round',
            r3.f_r.value === 3 && r3.f_t.value === 9 && r0.f_r.value === 0 && rN.f_r.value === 0 && rO.f_cr.value === 7 && rO.f_r.value === 7 && evC.ok && evC.value === 3 && !evR.ok && /Unknown name/.test(evR.error.message) && evF.ok && evF.value === 3 && !evM.ok
            && j(S.captionParts(cSys, ch9, F, 'round {CombatRound}', r3.vars).map(p => p.text)) === j(['round ', '3']) && j(S.captionParts(cSys, ch9, F, 'round {CombatRound}', rN.vars).map(p => p.text)) === j(['round ', '0'])
            && rFx.f_r.value === 5 && rFx.f_r.base === 3 && S.validKey('CombatRound', F) && !S.validKey('Round', F) && !S.validKey('round', F), j([r3.f_r, r3.f_t, r0.f_r, rO.f_cr, rO.f_r, evR.error, evM.error, rFx.f_r]));
        const vC = S.validateSystem(cSys, F), vO = S.validateSystem(own9, F), vBad = S.validateSystem(cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_r', key: 'R', kind: 'formula', formula: 'Round + 1' }], rolls: [] }, GV9), F);
        check('HUD frame HF5b: validateSystem knows CombatRound as a number (a formula, a caption and a label may read it; a system\'s own field of that name is that field); Round alone is still an unknown name',
            vC.ok && vC.warnings.every(w => w.prop !== 'caption') && vO.ok && !vBad.ok && /Unknown name "Round"/.test(vBad.errors[0].message) && S.TOKEN_NAMES.indexOf('CombatRound') >= 0 && S.TOKEN_NAMES.indexOf('Round') < 0, j([vC.errors, vO.errors, vBad.errors]));
        // the fixtures: d20 RoundNow on the HUD band, 3d6 Turn's caption; 0 without a combat; the bare fixture reads 0 and never errs
        const chD9 = { id: 'c_d', values: {} }, dR = S.resolveAll(gD9, chD9, F, S.withRound(tc0, { round: 5 })), dP = S.resolveAll(pD9, chD9, F, S.withRound(tc0, { round: 5 })), d0 = S.resolveAll(gD9, chD9, F, tc0);
        const t3 = S.resolveAll(g39, { id: 'c_3', values: {} }, F, S.withRound(tc0, { round: 2 })), t3c = g39.fields.find(f => f.id === 'f_turn').caption, cap3 = S.captionParts(g39, { id: 'c_3', values: {} }, F, t3c, t3.vars).map(p => p.text).join(''), cap0 = S.captionParts(p39, { id: 'c_3', values: {} }, F, p39.fields.find(f => f.id === 'f_turn').caption, S.resolveAll(p39, { id: 'c_3', values: {} }, F, null).vars).map(p => p.text).join('');
        const bare9 = S.resolveAll(gB9, { id: 'c_b', values: {} }, F, S.withRound(tc0, { round: 9 })), bareR = S.makeResolver(gB9, { id: 'c_b', values: {} }, F, null)('CombatRound');
        check('HUD frame HF5b (both fixtures + bare): d20 RoundNow (a formula CombatRound) sits on the HUD band in the Quick figures group and reads 5 in a combat at round 5 (the players\' view too), 0 without; 3d6 Turn\'s caption "round {CombatRound}" reads "round 2" and "round 0"; the bare fixture resolves with a combat context without error and CombatRound reads 0 there; all three validate',
            gD9.fields.some(f => f.id === 'f_round' && f.formula === 'CombatRound') && j(gD9.sheet.hud.band.find(b => b.id === 'f_round')) === j({ id: 'f_round', g: 'g_hud' }) && j(pD9.sheet.hud.band.find(b => b.id === 'f_round')) === j({ id: 'f_round', g: 'g_hud' }) && dR.f_round.value === 5 && dP.f_round.value === 5 && d0.f_round.value === 0 && !dR.f_round.error
            && t3c === 'round {CombatRound}' && cap3 === 'round 2' && cap0 === 'round 0' && Object.keys(bare9).every(k => !bare9[k].error) && bareR === 0
            && S.validateSystem(gD9, F).ok && S.validateSystem(g39, F).ok && S.validateSystem(gB9, F).ok, j([dR.f_round, d0.f_round, cap3, cap0, bareR]));
        // namesFacing (run for real) treats CombatRound as built in, so a round change (or a turn) redraws a sheet that reads it
        const nfSrc9 = sh9.slice(sh9.indexOf('function namesFacing(sys) {'), sh9.indexOf('// A finished turn redraws the numbers that read facing'));
        const NF9 = new Function('F', 'capExpr', nfSrc9 + '\nreturn namesFacing;')(() => F, S.capExpr);
        check('HUD frame HF5b: namesFacing (run for real) sees CombatRound in a formula, a caption or a roll label; a system whose own field is CombatRound, or one only calling round(), is left alone',
            NF9({ fields: [{ key: 'X', formula: 'CombatRound' }], rolls: [] }) === true && NF9({ fields: [{ key: 'X', formula: '1', caption: 'round {CombatRound}' }], rolls: [] }) === true && NF9({ fields: [{ key: 'X', formula: '1' }], rolls: [{ label: 'Hit ({CombatRound})' }] }) === true
            && NF9({ fields: [{ key: 'CombatRound', formula: '1' }, { key: 'X', formula: 'CombatRound' }], rolls: [] }) === false && NF9({ fields: [{ key: 'X', formula: 'round(2.5)' }], rolls: [] }) === false);
        check('HUD frame HF5b (source): the sheet\'s and the hover card\'s token context carry the round through withRound; every view keeps a round signature beside its dial\'s and marks itself stale when it changes; the host\'s roll for a player merges the combat on the map they are on, right after its token context and before the resolver; no fin() outside systemcore; Help says what reads 0',
            /function combatOn\(mapId, tokId\) \{ var n = net\(\); if \(!n \|\| typeof mapId !== 'string'\) return null; if \(typeof n\.combatRoundOf === 'function'\) return \(n\.active \|\| n\.solo\) \? n\.combatRoundOf\(mapId, typeof tokId === 'string' \? tokId : null\) : null; return n\.combatFor \? n\.combatFor\(mapId\) : null; \}/.test(sh9)   // fold 2: the fight that holds the token (a deliberate change of this pin and the three after it); fold 2's review: else the first begun there, as the host reads it (net.combatRoundOf, a deliberate change of this pin)
            && /function tokenCtxFor\(charId, camp\) \{ var c = charById\(charId, camp\), t = c \? facingTarget\(c, camp\) : null; return t \? withRange\(withRound\(tokenCtx\(t\.map, t\.tok, tokenFlags\(\)\), combatOn\(t\.mapId, t\.tok && t\.tok\.id\)\), rangeFor\(c, t\.mapId, t\.map, t\.tok, camp\)\) : null; \}/.test(sh9)   // range R2: the range to the target merged after the round (a deliberate change of this pin)
            && /ctxH = withRange\(withRound\(tokenCtx\(amH, w, tokenFlags\(\)\), combatOn\(midH, w && w\.id\)\), rangeFor\(c, midH, amH, w, camp\)\); return typeof hlKept === 'function' \? hlKept\(w, sys, c, ctxH\) : hoverLines\(sys, c, F\(\), ctxH\); \} catch \(e\) \{ return \[\]; \}/.test(sh9)
            && /function roundSigOf\(c, camp\) \{ var t = c \? facingTarget\(c, camp\) : null, cb = t \? combatOn\(t\.mapId, t\.tok && t\.tok\.id\) : null; return cb && typeof cb\.round === 'number' \? String\(cb\.round\) : ''; \}/.test(sh9)
            && /_dialOn = JSON\.stringify\(tokenFlags\(\)\); _roundSig = roundSigOf\(c, camp\);/.test(sh9) && /v\.dialOn = JSON\.stringify\(tokenFlags\(\)\); v\.roundSig = roundSigOf\(c, camp\);/.test(sh9) && /dialOn: null, roundSig: '', rangeSig: '', redraw: null \}/.test(sh9)
            && /swapTokenControls\(p, c, camp\);\n        \}\n        var rsS = roundSigOf\(c, camp\); if \(rsS !== _roundSig\) \{ _roundSig = rsS; _dialStale = true; \}[^\n]*\n        var rgS = [^\n]*\n        if \(final && _dialStale\)/.test(sh9)   // range R2: its own signature between (a deliberate change of this pin and the next)
            && /swapTokenControls\(v\.panel, c, camp\);\n    \}\n    var rs = roundSigOf\(c, camp\); if \(rs !== v\.roundSig\) \{ v\.roundSig = rs; v\.dialStale = true; \}[^\n]*\n    var rg = [^\n]*\n    if \(final && v\.dialStale\)/.test(sh9)
            && /import \{[^}]*labelNames, withRound, rangeCtx, withRange, rowLvl, rowOn, cleanItemKey, charForView, secretFieldIds, gmViewFields \} from '\.\/systemcore\.js';/.test(sh9)   // senses S2a: the editor's Senses box reads the secret set (a deliberate change of this pin)
            && /elevation: ruleQ\('elevation'\), viewer: pidQ \}\);[^\n]*\n            tcQ = SQ\.withRound\(tcQ, mapQ \? net\.combatRoundOf\(locQ, \(SQ\.charTokenOn\(mapQ, q\.charId, tokOwnQ, tokOptQ\) \|\| \{\}\)\.id\) : null\);[^\n]*\n            if \(typeof rangeTo === 'function' && SQ\.withRange\) tcQ = SQ\.withRange\(tcQ, rangeTo\(campQ, mapQ, locQ, SQ\.charTokenOn\(mapQ, q\.charId, tokOwnQ, tokOptQ\), pidQ\)\);[^\n]*\n            if \(pressQ && q\.att\) delete q\.att;\n            if \(pressQ && SQ\.withPresser\)[^\n]*\n            chQ = srcQ; varsQ = SQ\.makeResolver\(viewQ, chvQ, Fq, tcQ\);/.test(nt9)   // range R2: the range merged after the round, before the resolver (a deliberate change of this pin)
            && !/\bfin\(/.test(nt9) && !/\bfin\(/.test(sh9)
            && /net\.combats = \{\}; combatAsked = \{\};\n[^\n]*\n[^\n]*\n    if \(window\.wpSheets && window\.wpSheets\.tokenTurned\) setTimeout\(function\(\) \{ window\.wpSheets\.tokenTurned\(null, true\); \}, 0\);/.test(nt9)
            && /Formulas can read <b>CombatRound<\/b>, the round of the combat on the map of the character&rsquo;s token\. It reads 0 with no token, no combat, or offline\. A pool&rsquo;s maximum, sight ranges and teammates&rsquo; lines always read 0, as they read Facing neutral\. A field of your own named CombatRound keeps the name\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        // fold 2 (backlog 152, docs/FIGHT_CLOCK_DESIGN.md): a sheet reads CombatRound from the fight that holds its token (sheets.js combatOn, run for
        // real over net.js's own orders slice, which holds net.combatOfTok and net.combatFor): two fights on one map each give their own round
        const ntO9 = require('./checkkit').part('netfight.js'), ordA9 = ntO9.indexOf('// [netcheck:orders-start]'), ordZ9 = ntO9.indexOf('// [netcheck:orders-end]'), coA9 = sh9.indexOf('function combatOn(');
        const co9 = (() => { try {
            const net9 = { active: true, role: 'client', combats: { f_dock0001: { id: 'f_dock0001', mapId: 'm1', round: 2, turn: 0, rows: [{ id: 'r_a', tokId: 't_a' }] }, f_dock0002: { id: 'f_dock0002', mapId: 'm1', round: 7, turn: 0, rows: [{ id: 'r_b', tokId: 't_b' }] } } };
            new Function('net', 'getActiveCampaign', ntO9.slice(ordA9, ordZ9))(net9, () => null);
            const CO = new Function('net', sh9.slice(coA9, sh9.indexOf('\n', coA9)) + '\nreturn combatOn;')(() => net9);
            const out = [CO('m1', 't_a').round, CO('m1', 't_b').round, CO('m1', 't_x').round, CO('m1').round, CO('m2', 't_a'), CO(5, 't_a')];
            // fold 2's review: on the GM's own screen, where the fight played is the second, a token in neither and no token still read the first begun,
            // as the host's roll reads it for a player (net.combatRoundOf): the fight played is the host's own and never sent, so it read 7 here and 2 there
            const net9h = { active: true, role: 'host', combats: JSON.parse(JSON.stringify(net9.combats)) };
            new Function('net', 'getActiveCampaign', ntO9.slice(ordA9, ordZ9))(net9h, () => null); net9h.fightOn = 'f_dock0002';   // the GM plays the second (set after the slice, which starts with none)
            const COh = new Function('net', sh9.slice(coA9, sh9.indexOf('\n', coA9)) + '\nreturn combatOn;')(() => net9h);
            out.push(COh('m1', 't_x').round, COh('m1').round, COh('m1', 't_b').round, COh('m1', 't_x').round === CO('m1', 't_x').round);
            net9h.active = false; out.push(COh('m1', 't_a'));   // offline: none
            return out;
        } catch (e) { return String(e && e.message); } })();
        check('fold 2 (backlog 152): a sheet reads CombatRound from the fight that holds its token (sheets.js combatOn, run for real over net.js\'s own orders slice): two fights on one map, round 2 for the token in the first and round 7 for the token in the second; a token in neither, and no token, read the first begun there, on a player\'s app and on the GM\'s own screen alike, where the fight the GM plays is the second (fold 2\'s review: as the host reads it for a roll, never the fight played, which only the host knows); a map with no fight, a map that is no id and a screen not at a table read none',
            ordA9 > 0 && ordZ9 > ordA9 && j(co9) === j([2, 7, 2, 2, null, null, 2, 2, 7, true, null]), j(co9));
    }
    /* ---- Stage 6 HUD frame (HF5 review): the party strip reads the token's own map; a GM-only name anywhere in a label; the label at the click; rollInit, turnView, tokenTurned and the band run for real ---- */
    {
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const fxR = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GVR = { F, gmView: true }, PVR = { F, gmView: false };
        const gDR = cleanSystem(fxR('hud-d20'), GVR), g3R = cleanSystem(fxR('hud-3d6'), GVR), PMR = String.fromCharCode(0xB1);
        const tcR = { facing: null, stance: { posture: 0, elevation: 0 } }, flagsR = { turning: true, posture: true, elevation: true };
        // the hover card and the party strip: hoverLines carries the round; the strip reads the combat on the map the token stands on
        const hSys = cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_r', key: 'RoundNow', label: 'Round', kind: 'formula', formula: 'CombatRound', hover: true }], rolls: [] }, GVR), chH = { id: 'c_h', name: 'H', values: {} };
        const hl3 = S.hoverLines(hSys, chH, F, S.withRound(tcR, { round: 3 })), hl0 = S.hoverLines(hSys, chH, F, tcR), hlN = S.hoverLines(hSys, chH, F, null);
        const hlSrc = shR.slice(shR.indexOf('function hoverLinesForToken(w, camp'), shR.indexOf('/* ---------- the facing dial'));
        const campH = { id: 'k', activeItemId: 'm_a', system: hSys, chars: { c_h: chH }, items: { d_1: { type: 'doc' }, m_a: { type: 'map', whiteboard: [{ id: 't_x', isChar: true, charId: 'c_h', x: 0, y: 0 }] }, m_b: { type: 'map', whiteboard: [{ id: 't_h', isChar: true, charId: 'c_h', x: 0, y: 0 }] } } };
        const cmbH = { m_a: { round: 5 }, m_b: { round: 3 } };
        const HL = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', 'withRange', 'rangeFor', hlSrc + '\nreturn { byTok: hoverLinesForToken, byId: hoverLinesForTokenId };')(
            () => true, () => F, () => campH, c => c.system, (id, c) => c.chars[id] || null, () => false, S.hoverLines, S.withRound, S.tokenCtx, () => flagsR, id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(cmbH, id) ? cmbH[id] : null), S.withRange, () => null);   // range R2: no target here
        const onB = HL.byId(campH, 't_h'), onA = HL.byId(campH, 't_x'), card = HL.byTok(campH.items.m_a.whiteboard[0]), junkMap = HL.byTok(campH.items.m_b.whiteboard[0], campH, '__proto__'), gone = HL.byId(campH, 't_zz');
        delete cmbH.m_b; const offB = HL.byId(campH, 't_h');
        check('HUD frame HF5 review: the hover lines carry the round (hoverLines with a combat context reads it, 0 without one); the party strip reads the combat on the map the token stands on (round 3 on B while the GM views A at round 5), the map\'s own hover card the viewed map\'s; a map id that is not a map falls back to the viewed one; a token on no map has no lines',
            j(hl3) === j(['Round 3']) && j(hl0) === j(['Round 0']) && j(hlN) === j(['Round 0']) && j(onB) === j(['Round 3']) && j(onA) === j(['Round 5']) && j(card) === j(['Round 5']) && j(junkMap) === j(['Round 5']) && j(gone) === j([]) && j(offB) === j(['Round 0']), j([hl3, hl0, hlN, onB, onA, card, junkMap, offB]));
        // 1.6.3 (the game of 2026-11-15): the party strip's lines are worked out once a pass (sheets.js hlKept, in the same slice, with a counting hoverLines):
        // asked again in the same pass the kept lines come back as a copy, and a fight that ends, a stamp, new values or passForget reads them afresh
        let hlCalls = 0; const cmbK = { m_b: { round: 3 } };
        const HLK = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', 'withRange', 'rangeFor', 'window', hlSrc + '\nreturn { byId: hoverLinesForTokenId, forget: passForget };')(
            () => true, () => F, () => campH, c => c.system, (id, c) => c.chars[id] || null, () => false, function() { hlCalls++; return S.hoverLines.apply(null, arguments); }, S.withRound, S.tokenCtx, () => flagsR, id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(cmbK, id) ? cmbK[id] : null), S.withRange, () => null, {});
        const k1 = HLK.byId(campH, 't_h'), n1 = hlCalls, k2 = HLK.byId(campH, 't_h'), n2 = hlCalls; k2.push('x'); const k3 = HLK.byId(campH, 't_h'), n3 = hlCalls;
        cmbK.m_b = { round: 4 }; const k4 = HLK.byId(campH, 't_h'), n4 = hlCalls; chH.updated = 9; HLK.byId(campH, 't_h'); const n5 = hlCalls; chH.values = {}; HLK.byId(campH, 't_h'); const n6 = hlCalls; HLK.forget(); HLK.byId(campH, 't_h'); const n7 = hlCalls;
        await Promise.resolve(); HLK.byId(campH, 't_h'); const n8 = hlCalls;
        check('1.6.3 the party strip\'s hover lines kept for one pass of the app (sheets.js hlKept, run for real): asked again in the same pass they are worked out once and each caller gets its own copy; a fight whose round moved, the sheet stamped, new values and passForget read them afresh, and so does the next pass',
            j(k1) === j(['Round 3']) && n1 === 1 && n2 === 1 && j(k3) === j(['Round 3']) && n3 === 1 && j(k4) === j(['Round 4']) && n4 === 2 && n5 === 3 && n6 === 4 && n7 === 5 && n8 === 6, j([k1, k3, k4, n1, n2, n3, n4, n5, n6, n7, n8]));
        {   // 1.6.3 (the improvement week's review, finding 26): where a token stands, kept for one draw of the party strip (sheets.js tokFind beside the walk it replaces,
            // tokWalk, in the same slice, run for real). Over seeded campaigns (maps in any order of the campaign's items, integer-like ids among them,
            // items that are no map, pieces that are none, a hole in a list, one id on several maps) and the changes the app makes between two asks in one
            // pass (a piece pushed onto an earlier map under an id that stands later, a list spliced, a list replaced, the found piece put in another's
            // place, a whole map taken away or added), tokFind answers exactly what the walk answers, piece for piece and map for map. Asked for every
            // member of a party in one pass, it reads the campaign's pieces once where the walk read them once an ask
            const HT = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', 'withRange', 'rangeFor', 'window', hlSrc + '\nreturn { find: tokFind, walk: tokWalk, forget: passForget, byId: hoverLinesForTokenId };')(
                () => true, () => F, () => null, c => c.system, () => null, () => false, () => [], S.withRound, S.tokenCtx, () => flagsR, () => null, S.withRange, () => null, {});
            let seedT = 42; const rnd = () => { seedT = (seedT * 1103515245 + 12345) & 0x7fffffff; return seedT / 0x7fffffff; }, pickT = a => a[Math.floor(rnd() * a.length)];
            const POOL = ['a', 'b', 'c', 'd', 'e', 'f', 'g', '7', '__proto__'];
            const mkCampT = () => { const items = {}, keys = ['m1', '12', 'doc', 'm0', '3', 'mz', 'gone'].filter(() => rnd() < 0.85);
                keys.forEach(k => { if (k === 'doc') items[k] = { type: 'planner', whiteboard: [{ id: 'a' }] }; else if (k === 'gone') items[k] = null; else { const wb = []; const n = Math.floor(rnd() * 7); for (let i = 0; i < n; i++) wb.push(rnd() < 0.12 ? null : { id: pickT(POOL), n: i }); if (rnd() < 0.1) wb.length += 2; items[k] = rnd() < 0.08 ? { type: 'map' } : { type: 'map', whiteboard: wb }; } });
                return { items }; };
            const same = (a, b) => a.w === b.w && a.onMap === b.onMap;
            const offT = []; let askedT = 0;
            for (let s = 0; s < 400; s++) {
                const campT = mkCampT(); HT.forget(); let ixT = {};   // ixT: one draw's own index (the party strip hands one in a draw)
                const askAll = tag => POOL.concat(['zz']).forEach(id => { askedT++; const f = HT.find(campT, id, ixT), w = HT.walk(campT, id); if (!same(f, w) && offT.length < 4) offT.push([s, tag, id, f.onMap, w.onMap]); });
                askAll('first'); askAll('again');
                const maps = Object.keys(campT.items).filter(k => campT.items[k] && campT.items[k].type === 'map' && Array.isArray(campT.items[k].whiteboard));
                const kind = Math.floor(rnd() * 8), mk = maps.length ? campT.items[pickT(maps)] : null;
                if (kind === 0 && mk) mk.whiteboard.unshift({ id: pickT(POOL), n: 99 });
                else if (kind === 1 && mk && mk.whiteboard.length) mk.whiteboard.splice(Math.floor(rnd() * mk.whiteboard.length), 1);
                else if (kind === 2 && mk) mk.whiteboard = mk.whiteboard.filter(x => !x || x.id !== pickT(POOL));
                else if (kind === 3 && mk && mk.whiteboard.length) { const at = Math.floor(rnd() * mk.whiteboard.length); mk.whiteboard[at] = { id: mk.whiteboard[at] && mk.whiteboard[at].id || 'q', n: 77 }; }
                else if (kind === 4 && maps.length) delete campT.items[pickT(maps)];
                // the review of finding 26: one piece taken out and a new one put in, the list of the same length (its id one the index never held:
                // answered by the walk, where the first cut answered no token); and another id put in a piece's place, which only a new draw (a
                // fresh index) can read rightly, since nothing tells a list of the same length apart: the strip makes a new one each draw
                else if (kind === 6 && mk && mk.whiteboard.length) { mk.whiteboard.splice(Math.floor(rnd() * mk.whiteboard.length), 1); mk.whiteboard.push({ id: 'zz', n: 66 }); }
                else if (kind === 7 && mk && mk.whiteboard.length) { mk.whiteboard[Math.floor(rnd() * mk.whiteboard.length)] = { id: pickT(POOL), n: 55 }; ixT = {}; }
                else campT.items['m' + s] = { type: 'map', whiteboard: [{ id: pickT(POOL), n: 5 }] };
                askAll('changed');
            }
            // the cost: a party of eight in one pass over a campaign of 40 maps of 60 pieces each, its pieces counted as they are read
            let readsT = 0; const bigT = { items: {} };
            for (let m = 0; m < 40; m++) { const wb = []; for (let i = 0; i < 60; i++) wb.push({ id: 'p' + m + '_' + i }); bigT.items['map' + m] = { type: 'map', whiteboard: new Proxy(wb, { get(t, k) { if (typeof k === 'string' && /^\d+$/.test(k)) readsT++; return t[k]; } }) }; }
            const party = ['p39_59', 'p38_1', 'p20_30', 'p0_0', 'p5_5', 'p33_3', 'p12_40', 'p27_8'];
            HT.forget(); readsT = 0; const ixB = {}, foundT = party.map(id => HT.find(bigT, id, ixB).onMap); const readFind = readsT;
            readsT = 0; party.forEach(id => HT.find(bigT, id)); const readNoIx = readsT;   // with no draw's own index handed in, the walk itself
            // why the index is a draw's and never the pass's (the review of finding 26): another id put in an earlier piece's place, the lists of the
            // same length; an index made before that answers the later place, the walk and a new draw's index the earlier one
            const campK = { items: { m1: { type: 'map', whiteboard: [{ id: 'a' }] }, m2: { type: 'map', whiteboard: [{ id: 't' }] } } }, ixK = {};
            const k0 = HT.find(campK, 't', ixK).onMap; campK.items.m1.whiteboard[0] = { id: 't' };
            const kOld = HT.find(campK, 't', ixK).onMap, kNew = HT.find(campK, 't', {}).onMap, kWalk = HT.walk(campK, 't').onMap, kNone = HT.find(campK, 't').onMap;
            readsT = 0; party.forEach(id => HT.walk(bigT, id)); const readWalk = readsT;
            check('1.6.3 (finding 26) where a token stands is kept for one draw of the party strip (sheets.js tokFind, run for real beside the walk it replaces, with the draw\'s own index handed in): over 400 seeded campaigns and changes made between two asks (one piece taken out and a new one put in, a list of the same length, among them: the walk answers an id the index never held), it answers what the walk answers, the same piece on the same map, every time; and asked for a party of eight on a campaign of 40 maps it reads the pieces once (and each piece it hands back once more, to see it still stands there), where the walk read them for every ask; with no index handed in it walks, and a new draw reads another id put in an earlier piece\'s place where an index made before answers the later one (the review of finding 26)',
                !offT.length && askedT > 10000 && foundT.join() === 'map39,map38,map20,map0,map5,map33,map12,map27' && readFind === 2400 + party.length && readWalk > 4 * readFind && readNoIx === readWalk
                && k0 === 'm2' && kOld === 'm2' && kNew === 'm1' && kWalk === 'm1' && kNone === 'm1', j([offT, askedT, foundT, readFind, readWalk, readNoIx, k0, kOld, kNew, kWalk, kNone]));
        }
        {   // 1.6.3 (finding 26) the party strip asks each member's hover lines once a draw (whiteboard.js renderPartyStrip, run for real on a page of
            // plain objects, with a counting wpSheets): the signature and the chip's tooltip read the one answer, and the markup is what the two asks wrote
            // before (the strip drawn by the source before the fix, which asked twice, gives the same markup). And a map switch saves on io.js saveSwitch's own timer
            // (sidebar.js navigateToMap, run for real): the map opened, the selection cleared and the board drawn as before, the save asked with no word
            // that it is at once
            const wbP = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), pA = wbP.indexOf('  function renderPartyStrip() {'), pZ = wbP.indexOf('\n  window.wpRenderPartyStrip = renderPartyStrip;', pA), psS = pA >= 0 && pZ > pA ? wbP.slice(pA, pZ) : '';
            const OLD_PS = psS.split("      var hlOf = function(c) { if (c.hl === undefined) c.hl = window.wpSheets && c.tokId ? window.wpSheets.hoverLinesForTokenId(camp, c.tokId, tokIx) : []; return c.hl; };\n").join('')
                .split("hlOf(c).join(',')").join("window.wpSheets.hoverLinesForTokenId(camp, c.tokId).join(',')").split("var hlT = hlOf(c);").join("var hlT = window.wpSheets.hoverLinesForTokenId(camp, c.tokId);");
            const stripRun = src => { let asks = 0; const ixs = []; const strip = { innerHTML: '', dataset: {} };
                const campP = { id: 'k', items: { mA: { id: 'mA', type: 'map', meta: { title: 'A' } }, mB: { id: 'mB', type: 'map', meta: { title: 'B' } } } };
                const list = [{ key: 'o:p1', ownerId: 'p1', tokId: 't1', name: 'Ana', mapId: 'mA', map: 'A', src: null, color: '#336699' }, { key: 'o:p2', ownerId: 'p2', tokId: 't2', name: 'Bo', mapId: 'mB', map: 'B', src: null, color: null }, { key: 'i:t3', ownerId: null, tokId: 't3', name: 'Cy', mapId: 'mA', map: 'A', src: null }];
                const win = { wpSheets: { hoverLinesForTokenId: (c, id, ix) => { asks++; ixs.push(ix); return id === 't2' ? [] : ['HP 7/9', 'Guard ' + id]; } }, wpDefaultAvatar: c => 'data:' + c };
                const run = new Function('getActiveCampaign', 'getActiveMap', 'state', 'characterList', 'chipPlace', 'playerNow', 'window', 'document', 'cssColor', 'esc', 'resolveImg', 'wbHashHue', 'PARTY_SHOWN', src + '\nreturn renderPartyStrip;')(
                    () => campP, () => campP.items.mA, { viewMode: 'visual' }, () => list.map(c => Object.assign({}, c)), (camp, c) => c, () => null, win, { getElementById: id => id === 'partyStrip' ? strip : null }, c => c, s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'), s => s, () => 200, 4);
                run(); const first = asks, html = strip.innerHTML; run();
                // the review of finding 26: every ask of one draw hands the same object of that draw's own, and the next draw another
                const ixOne = ixs.length === 6 && !!ixs[0] && typeof ixs[0] === 'object' && ixs[1] === ixs[0] && ixs[2] === ixs[0] && ixs[3] !== ixs[0] && ixs[4] === ixs[3] && ixs[5] === ixs[3];
                return { first, again: asks - first, html, same: strip.innerHTML === html, ixOne }; };
            let psNow = null, psOld = null, psErr = '';
            try { psNow = stripRun(psS); psOld = stripRun(OLD_PS); } catch (e) { psErr = String(e && e.message); }
            const sbP = fs.readFileSync(path.join(app, 'scripts', 'sidebar.js'), 'utf8').replace(/\r\n/g, NL), nA = sbP.indexOf('  function navigateToMap(mapId, landRoomId, now) {'), nZ = sbP.indexOf('\n  }\n', nA), navS = nA >= 0 && nZ > nA ? sbP.slice(nA, nZ + 4) : '';
            const navRun = () => { const log = [], campN = { activeItemId: 'm1', items: { m1: { type: 'map', meta: {} }, m2: { type: 'map', meta: {} } } }, stN = { selWbIds: ['x'], selWbId: 'x', selId: 'r', linkStart: 1, viewMode: 'visual' };
                const nav = new Function('window', 'getActiveCampaign', 'state', 'landingPoint', 'updateSidebarNav', 'render', 'save', 'restoreCameraPosition', 'saveSwitch', navS + '\nreturn navigateToMap;')(
                    { wpApplyRememberedView: () => log.push('view') }, () => campN, stN, () => ({}), () => log.push('nav'), () => log.push('render'), function() { log.push('save' + (arguments.length ? ':' + arguments[0] : '')); }, () => log.push('camera'), () => log.push('switch'));
                const ok = nav('m2'), plain = log.join(); log.length = 0; nav('m1', null, true); const atOnce = log.join(); log.length = 0; nav('m2', null, 'yes'); return [ok, campN.activeItemId, stN.selWbIds.length, plain, atOnce, log.join()]; };
            let navOut = null; try { navOut = navRun(); } catch (e) { psErr += ' nav: ' + String(e && e.message); }
            check('1.6.3 (finding 26) the party strip asks each member\'s hover lines once a draw (whiteboard.js renderPartyStrip, run for real with a counting wpSheets): three members, three asks, where the source before the fix asked six times, with the same markup; drawn again with nothing changed it asks once a member and writes nothing new. A map switch saves on saveSwitch\'s own timer (sidebar.js navigateToMap, run for real; netcheck runs saveSwitch), and at once only for a caller that says now as true (the three generators, whose new map takes its undo baseline before their pieces are laid; buildcheck runs them with a navigation that saves only then)',
                !psErr && !!psS && psNow.first === 3 && psOld.first === 6 && psNow.html === psOld.html && psNow.html.indexOf('Guard t1') > 0 && psNow.again === 3 && psNow.same && psNow.ixOne
                && j(navOut) === j([true, 'm2', 0, 'view,nav,render,switch,camera', 'view,nav,render,save:true,camera', 'view,nav,render,switch,camera']), j([psErr, psNow && [psNow.first, psNow.again], psOld && psOld.first, navOut]));
        }
        {   // 1.6.3: a token's effects kept for one pass of the app (systemcore tokenEffectsPass and tokenEffectsForget, run for real): every token of one sheet
            // shows the same list, worked out once a pass by the character object and whether the GM reads it, and read afresh where anything it reads is another
            const sysE = cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_a', name: 'Blessed', tone: 'buff', vis: 'all', mods: [] }, { id: 'e_g', name: 'Cursed', tone: 'debuff', vis: 'gm', mods: [] }] }, GVR);
            const chE = { id: 'c_e', updated: 1, values: { f_fx: [{ id: 'r1', ref: 'e_a', on: true }, { id: 'r2', ref: 'e_g', on: true }] } };
            const p1 = S.tokenEffectsPass(sysE, chE, true, F), p2 = S.tokenEffectsPass(sysE, chE, true, F), pl = S.tokenEffectsPass(sysE, chE, false, F), same = j(p1) === j(S.tokenEffects(sysE, chE, true, F)) && j(pl) === j(S.tokenEffects(sysE, chE, false, F)) && p1.length === 2 && pl.length === 1;
            chE.values = { f_fx: [{ id: 'r1', ref: 'e_a', on: false }] }; const p3 = S.tokenEffectsPass(sysE, chE, true, F); chE.updated = 2; const p4 = S.tokenEffectsPass(sysE, chE, true, F), p5 = S.tokenEffectsPass(sysE, chE, true, F);
            S.tokenEffectsForget(); const p6 = S.tokenEffectsPass(sysE, chE, true, F); await Promise.resolve(); const p7 = S.tokenEffectsPass(sysE, chE, true, F), p8 = S.tokenEffectsPass(Object.assign({}, sysE), chE, true, F);
            check('1.6.3 a token\'s effects kept for one pass (systemcore tokenEffectsPass, run for real): what tokenEffects gives, for the GM and for the players apart, the very list asked again in the same pass; new values, a new stamp, tokenEffectsForget, the next pass and another system read it afresh',
                same && p1 === p2 && pl !== p1 && j(p3) === j([]) && p3 !== p1 && p4 !== p3 && p5 === p4 && p6 !== p5 && p7 !== p6 && p8 !== p7, j([p1, pl, p3]));
        }
        {   // 1.6.3 (the improvement week's review of sheets and rolls, finding 2): a token's effects also kept from one pass to the next by the content key
            // its caller hands in (systemcore tokenEffectsPass's fifth argument, run for real): the very list while the key, the system and its stamp
            // are the same and it is young; another key, a new system stamp, tokenEffectsForget(true) or age past FX_KEPT_MS work it out again; with no
            // key nothing is kept past the pass, as before; the GM's and the players' lists are kept apart
            const sysK = cleanSystem({ v: 1, name: 'K', fields: [{ id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_a', name: 'Blessed', tone: 'buff', vis: 'all', mods: [] }] }, GVR);
            const chK = { id: 'c_k', updated: 1, values: { f_fx: [{ id: 'r1', ref: 'e_a', on: true }] } }, tick = () => Promise.resolve();
            S.tokenEffectsForget(true);
            const k1 = S.tokenEffectsPass(sysK, chK, true, F, 'K1'); await tick(); const k2 = S.tokenEffectsPass(sysK, chK, true, F, 'K1'); await tick();
            const k3 = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); await tick(); const k4 = S.tokenEffectsPass(sysK, chK, true, F); await tick(); const k5 = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); await tick();
            const kp = S.tokenEffectsPass(sysK, chK, false, F, 'K2'); await tick(); const kp2 = S.tokenEffectsPass(sysK, chK, false, F, 'K2'); await tick();
            sysK.updated = 99; const k6 = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); await tick(); const k6b = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); await tick();
            S.tokenEffectsForget(true); const k7 = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); await tick();
            const realNow = Date.now; let k8; try { Date.now = () => realNow() + 31000; k8 = S.tokenEffectsPass(sysK, chK, true, F, 'K2'); } finally { Date.now = realNow; } await tick();
            check('1.6.3 (finding 2) a token\'s effects kept across passes by their content key (systemcore tokenEffectsPass, run for real): the same key the next pass hands back the very list; another key, no key, a new system stamp, tokenEffectsForget(true) and an age past 30 s work it out again; the players\' list kept apart from the GM\'s',
                j(k1) === j(S.tokenEffects(sysK, chK, true, F)) && k2 === k1 && k3 !== k2 && k4 !== k3 && k5 === k3 && kp !== k5 && kp2 === kp && k6 !== k5 && k6b === k6 && k7 !== k6b && k8 !== k7, j([k1, kp]));
        }
        {   // 1.6.3 (findings 2 and 14): the content key (sheets.js keptKey, in the hlpass slice, with the real outsideKey) and what it keeps, run for real:
            // tokenFx hands the key to tokenEffectsPass, so the next pass gives the very list until the sheet, a sheet it links to, the campaign's library
            // or the library's state moves; the party strip's lines (hlKept) are kept across passes by the same key with the token as self and their context
            const shK = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
            const hlK = shK.slice(shK.indexOf('function hoverLinesForToken(w, camp'), shK.indexOf('/* ---------- the facing dial'));
            const sysL = cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', hover: true }, { id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects' }], rolls: [], effects: [] }, GVR);
            const chA = { id: 'c_a', name: 'A', updated: 1, values: { f_hp: 3 }, links: { k_m: 'c_b' } }, chB = { id: 'c_b', name: 'B', updated: 1, values: { f_hp: 9 } };
            const campL = { id: 'k', activeItemId: 'm', system: sysL, library: { packs: [] }, chars: { c_a: chA, c_b: chB }, items: { m: { type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', x: 0, y: 0 }] } } };
            let hlN = 0; const libW = { st: 1 }, winL = { wpSystemCore: S, wpLibrary: { state: () => libW.st, size: () => 0 } };
            const API = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', 'withRange', 'rangeFor', 'window', hlK + '\nreturn { fx: tokenFx, byId: hoverLinesForTokenId, key: keptKey, forget: passForget };')(
                () => true, () => F, () => campL, c => c.system, (id, c) => (c.chars[id] || null), () => false, function() { hlN++; return S.hoverLines.apply(null, arguments); }, S.withRound, S.tokenCtx, () => ({ turning: true, posture: true, elevation: true }), () => null, S.withRange, () => null, winL);
            S.setLinkSource((id) => campL.chars[id] || null); const tick = () => Promise.resolve(), w = campL.items.m.whiteboard[0];
            try {
                S.tokenEffectsForget(true);
                const f1 = API.fx(w); await tick(); const f2 = API.fx(w); const kA = API.key(sysL, chA, campL, ''); await tick();
                chB.values = { f_hp: 4 }; const kB = API.key(sysL, chA, campL, ''); const f3 = API.fx(w); await tick();
                campL.library = { packs: [{ id: 'p1' }] }; const f4 = API.fx(w); await tick();
                libW.st = 2; const f5 = API.fx(w); await tick(); const f6 = API.fx(w); await tick();
                chA.values = { f_hp: 2 }; const f7 = API.fx(w); await tick();
                const h1 = API.byId(campL, 't_a'), n1 = hlN; await tick(); const h2 = API.byId(campL, 't_a'), n2 = hlN; await tick();
                chB.values = { f_hp: 5 }; API.byId(campL, 't_a'); const n3 = hlN; await tick();
                const realNow = Date.now; try { Date.now = () => realNow() + 31000; API.byId(campL, 't_a'); } finally { Date.now = realNow; } const n4 = hlN; await tick();
                check('1.6.3 (findings 2 and 14) the content key (sheets.js keptKey, with the real outsideKey): tokenFx hands it on, and the next pass gives the very list until a linked sheet, the campaign\'s library, the library\'s state or the sheet itself moves; the party strip\'s lines are kept across passes the same way, worked out again when a linked sheet moves and when they are older than 30 s',
                    typeof kA === 'string' && f2 === f1 && kB !== kA && f3 !== f2 && f4 !== f3 && f5 !== f4 && f6 === f5 && f7 !== f6 && j(h1) === j(h2) && n2 === n1 && n3 === n2 + 1 && n4 === n3 + 1, j([n1, n2, n3, n4, h1]));
            } finally { S.setLinkSource(null); }
        }
        {   // 1.6.3 (finding 14): a tab press hands back the figures worked out for the draw before (sheets.js allFor, sliced by its allkept markers and run
            // for real with a counting resolveAll and a key of the test's own): only while a tab press draws, and only where the key, the context, the
            // system, the character and the formula engine are the same; any other draw works them out afresh, and no key keeps nothing
            const shT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
            const akS = shT.slice(shT.indexOf('// [systemcheck:allkept-start]'), shT.indexOf('// [systemcheck:allkept-end]'));
            let rN = 0, keyNow = 'k1'; const T = new Function('F', 'resolveAll', 'keptKey', 'KEPT_MS', akS + '\nreturn { allFor: allFor, tab: function(v) { _sheetTabPress = v; } };')(() => F, () => ({ n: ++rN }), () => keyNow, 30000);
            const sysT = { fields: [] }, cT = { id: 'c' }, ctxA = { self: 't', facing: { deg: 0 } };
            const a1 = T.allFor('sheet', sysT, cT, {}, ctxA), a2 = T.allFor('sheet', sysT, cT, {}, ctxA); T.tab(1); const a3 = T.allFor('sheet', sysT, cT, {}, ctxA), a3b = T.allFor('sheet', sysT, cT, {}, ctxA); T.tab(1);
            const a4 = T.allFor('sheet', sysT, cT, {}, { self: 't', facing: { deg: 90 } }); keyNow = 'k2'; const a5 = T.allFor('sheet', sysT, cT, {}, { self: 't', facing: { deg: 90 } });
            const a6 = T.allFor('sheet', sysT, { id: 'c' }, {}, { self: 't', facing: { deg: 90 } }); const a7 = T.allFor('h:c', sysT, cT, {}, ctxA); keyNow = null; const a8 = T.allFor('h:c', sysT, cT, {}, ctxA), a9 = T.allFor('h:c', sysT, cT, {}, ctxA); T.tab(0);
            check('1.6.3 (finding 14) a sheet\'s tab press reuses the figures worked out for the draw before (sheets.js allFor, run for real): only for the draw a tab press asks for (the next draw works them out again) and only for the same key, context, system and character; a draw that is no tab press, another context, key or character, another view and no key work them out afresh',
                a2 !== a1 && a3 === a2 && a3b !== a3 && a4 !== a3b && a5 !== a4 && a6 !== a5 && a7 !== a6 && a8 !== a7 && a9 !== a8 && rN === 9, j([rN]));
        }
        {   // 1.6.3 (finding 2): one character's change draws the whole app only where the board draws something of it that moved (sheets.js boardRedraw,
            // sliced by its boardskip markers and run for real with stubs): the light path only where the key is the one last drawn whole and no whole draw
            // happened since; a change of its marks, a whole draw in between, a selected token of it, a sheet tied to it, another view and force draw whole
            const shB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
            const bsS = shB.slice(shB.indexOf('// [systemcheck:boardskip-start]'), shB.indexOf('// [systemcheck:boardskip-end]'));
            const sysB = { fields: [], links: [] }, cB = { id: 'c_b', name: 'B', values: { hp: 3 } }, cO = { id: 'c_o', name: 'O', values: {} };
            const campB = { id: 'k', activeItemId: 'm', system: sysB, chars: { c_b: cB, c_o: cO }, items: { m: { type: 'map', whiteboard: [{ id: 't_b', charId: 'c_b' }, { id: 't_o', charId: 'c_o' }] } } };
            const st = { viewMode: 'visual', selWbId: null, selWbIds: [] }, fxNow = { t_b: ['Hurt'] }, ev = [];
            const winB = { wpRenderN: 0, appRender() { winB.wpRenderN++; ev.push('whole'); }, wpHideTooltip() { ev.push('tip'); }, wpRenderPartyStrip() { ev.push('party'); }, wpRenderCombatStrip() { ev.push('strip'); }, wpCharList: { sync() { ev.push('chars'); } }, wpPills: { sync() {} }, wpTrackers: { draw() {} }, wpSystemCore: { sheetsAny: () => false } };
            const B = new Function('state', 'getActiveCampaign', 'systemOf', 'charById', 'tokenFx', 'tokenBars', 'tokenEnv', 'window', bsS + '\nreturn { redraw: boardRedraw };')(
                st, () => campB, c => c.system, (id, c) => (c.chars[id] || null), w => fxNow[w.id] || [], () => [], () => null, winB);
            const run = (id, force) => { ev.length = 0; B.redraw(id, force); return ev.join(','); };
            const r1 = run('c_b'), r2 = run('c_b'); cB.values = { hp: 2 }; const r3 = run('c_b');
            fxNow.t_b = ['Hurt', 'Down']; const r4 = run('c_b'), r5 = run('c_b');
            winB.appRender(); const r6 = run('c_b'), r7 = run('c_b');
            st.selWbId = 't_b'; const r8 = run('c_b'), r9 = run('c_b'); st.selWbId = null; run('c_b');
            cB.name = 'Bee'; const r10 = run('c_b'), r11 = run('c_b', true), r12 = run('c_b');
            cO.links = { k_m: 'c_b' }; sysB.links = [{ id: 'k_m', kind: 'mount' }]; const r13 = run('c_b'), r14 = run('c_b'); delete cO.links; sysB.links = [];
            st.viewMode = 'data'; const r15 = run('c_b'), r16 = run('c_b'); st.viewMode = 'visual'; run('c_b'); const r17 = run(null), r18 = run('c_b'), r19 = run('c_b'); campB.items.m.whiteboard[0].ownerId = 'u_x'; const r20 = run('c_b'), r21 = run('c_b');
            const LIGHT = 'tip,party,strip,chars';
            check('1.6.3 (finding 2) a character\'s change draws the whole app only where the board draws something of it that moved (sheets.js boardRedraw, run for real): its values alone take the light path once the board was drawn whole; a change of its marks, a whole draw since, a selected token of it, its name, a token of it changed (its owner), force, a sheet tied to it, another view and every character draw whole',
                r1 === 'whole' && r2 === LIGHT && r3 === LIGHT && r4 === 'whole' && r5 === LIGHT && r6 === 'whole' && r7 === LIGHT && r8 === 'whole' && r9 === 'whole' && r10 === 'whole' && r11 === 'whole' && r12 === LIGHT
                    && r13 === 'whole' && r14 === 'whole' && r15 === 'whole' && r16 === 'whole' && r17 === 'whole' && r18 === 'whole' && r19 === LIGHT && r20 === 'whole' && r21 === LIGHT, j([r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12, r13, r14, r15, r16, r17, r18, r19, r20, r21]));
        }
        // a GM-only name anywhere in a label: the host's check fails closed exactly where the players' view scrubs
        const lgSys = cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '5', def: 'max', vis: 'gm' }], rolls: [] }, GVR);
        const E8R = Array.from({ length: 8 }, () => '{A}').join('');
        const cases = [['Trap {GMFig', ['GMFig']], ['Nine ' + E8R + '{GMFig}', ['GMFig']], ['Bad ({GMFig +})', ['GMFig']], ['Max {HP.max}', ['HP.max']], ['Sign ({' + PMR + 'GMFig})', ['GMFig']], ['Twice {GMFig} {gmfig}', ['GMFig']], ['Plain {A}', []], ['GMFig first {A}', []], ['No brace', []], ['{}', []]];
        const lgOut = cases.map(([t]) => S.labelGmNames(lgSys, F, t));
        const scrubbed = cleanSystem({ v: 1, name: 'L', fields: lgSys.fields, rolls: cases.map(([t], i) => ({ id: 'r_' + i, label: t, formula: 'd6' })) }, PVR).rolls.map(r => r.label);
        const rnSrcR = shR.slice(shR.indexOf('var LABEL_CTRL_G = '), shR.indexOf('// A roll from this character\'s sheet: the dice feature on'));
        const feR = (tag, cls, text) => ({ tag, className: cls || '', _t: text || '', get textContent() { return this._t + this.children.map(c => c.textContent || '').join(''); }, set textContent(v) { this._t = v; this.children = []; }, children: [], title: '', disabled: false, firstChild: null, on: {}, appendChild(x) { this.children.push(x); if (!this.firstChild) this.firstChild = x; return x; }, insertBefore(x) { this.children.unshift(x); this.firstChild = x; return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const mkR = o => { o = o || {}; const sent = [], toasts = [];
            const api = new Function('rollNeedsFails', 'F', 'net', 'isClient', 'captionParts', 'labelNames', 'labelGmNames', 'gmDerivedNames', 'gmEffectNames', 'el', 'iconNode', 'canRoll', 'sheetRoll', 'toast', 'ROLL_TONE_CLS', 'getActiveCampaign', 'charById', 'resolveAll', 'tokenCtxFor', rnSrcR + '\nreturn { rollLabel: rollLabel, labelSecret: labelSecret, rollNode: rollNode };')(
                S.rollNeedsFails, () => F, () => (o.net === undefined ? { active: true, role: 'host' } : o.net), () => !!o.client, S.captionParts, S.labelNames, S.labelGmNames, S.gmDerivedNames, S.gmEffectNames, feR, (v, c) => feR('span', c), () => true, (e, cid, expr, label, opts) => sent.push([label, opts]), t => toasts.push(t), {},
                () => (o.camp || { chars: {} }), (id, c) => (c && c.chars && c.chars[id]) || null, S.resolveAll, () => (o.tctx ? o.tctx() : null));
            api.sent = sent; api.toasts = toasts; return api; };
        const hostR = mkR(), varsL = S.resolveAll(lgSys, { id: 'c_l', values: {} }, F, null).vars, secR = cases.map(([t]) => hostR.labelSecret(lgSys, varsL, t));
        const fxG = cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_g', name: 'Veil', vis: 'gm', mods: [{ f: 'f_g', op: 'add', v: 2 }] }] }, GVR);
        const secFx = hostR.labelSecret(fxG, S.resolveAll(fxG, { id: 'c_e', values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } }, F, null).vars, 'X {G}');
        const secOff = mkR({ net: null }).labelSecret(lgSys, varsL, 'Trap {GMFig'), secCl = mkR({ client: true, net: { active: true, role: 'client' } }).labelSecret(lgSys, varsL, 'Trap {GMFig');
        check('HUD frame HF5 review: a GM-only name ANYWHERE in a label (a "{" left open, past the 8th value, a {...} that is not a formula, a reserved suffix, with the sign) makes the host\'s public roll private — exactly the labels the players\' view scrubs, and no others; each name once (a GM-only field a GM-only effect moved named once); never offline or on a client',
            j(lgOut) === j(cases.map(c => c[1])) && cases.every(([t], i) => (scrubbed[i] !== t) === (lgOut[i].length > 0)) && j(secR) === j(cases.map(c => c[1].join(', '))) && secFx === 'G' && secOff === '' && secCl === ''
            && j(S.labelGmNames(lgSys, null, 'x {GMFig}')) === j([]) && j(S.labelGmNames(null, F, 'x {GMFig}')) === j([]), j([lgOut, scrubbed, secR, secFx]));
        // the validator: a "{" left open, and a GM-only name no {...} draws, each said once per label
        const vwR = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [{ id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: [{ id: 'r_1', label: 'Trap {GMFig', formula: 'd6' }, { id: 'r_2', label: 'Odd {A', formula: 'd6' }, { id: 'r_3', label: 'Two {GMFig} {GMFig}', formula: 'd6' }, { id: 'r_4', label: 'Hid {GMFig', formula: 'd6', vis: 'gm' }, { id: 'r_5', label: 'Ok {A} {' + PMR + 'A}', formula: 'd6' }, { id: 'r_6', label: 'Bad {GMFig +}', formula: 'd6' }] }, GVR), F).warnings.filter(w => w.prop === 'label').map(w => w.id + ' ' + w.message);
        const UNC = 'Label: a "{" without its "}" shows as written.', GMW = h => 'Label: "GMFig" is GM only, so players see only "' + h + '".', r6 = vwR.filter(w => /^r_6 /.test(w));
        check('HUD frame HF5 review: validateSystem says when a label leaves a "{" open and names a GM-only value no {...} draws — once per label (the same name twice is one warning); a GM-only roll is told only of the open brace; a {...} that does not parse names its GM-only word too',
            j(vwR.filter(w => !/^r_6 /.test(w))) === j(['r_1 ' + UNC, 'r_1 ' + GMW('Trap'), 'r_2 ' + UNC, 'r_3 ' + GMW('Two'), 'r_4 ' + UNC]) && r6.length === 2 && r6[1] === 'r_6 ' + GMW('Bad'), j(vwR));
        // the 3d6 Turn caption is drawn: a caption needs a section (the band draws none)
        const placedR = sys => { const s = new Set(); [sys.sheet].concat(sys.sheet.hud ? [sys.sheet.hud] : []).forEach(l => (l.sections || []).forEach(sc => (sc.fields || []).forEach(p => { if (p.id) s.add(p.id); }))); return s; };
        const capsR = sys => sys.fields.filter(f => typeof f.caption === 'string' && f.caption.indexOf('{') >= 0);
        check('HUD frame HF5 review: every caption holding a {...} value in both HUD fixtures sits in a section (the band draws no captions), so 3d6 Turn\'s "round {CombatRound}" is drawn: Turn is in Core & Defenses as well as on the band',
            capsR(g3R).some(f => f.id === 'f_turn') && [gDR, g3R].every(sys => capsR(sys).every(f => placedR(sys).has(f.id))) && g3R.sheet.hud.sections.find(sc => sc.id === 's_hcore').fields.some(p => p.id === 'f_turn') && g3R.sheet.hud.band.some(p => p.id === 'f_turn'), j([capsR(g3R).map(f => f.id), capsR(gDR).map(f => f.id)]));
        // the label is worked out again at the click
        const rSys = cleanSystem({ v: 1, name: 'K', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }], rolls: [{ id: 'r_k', label: 'Hit ({RoundNow})', formula: 'd20 + RoundNow' }] }, GVR);
        let roundK = 2; const chK = { id: 'c_k', values: {} }, apiK = mkR({ net: null, camp: { chars: { c_k: chK } }, tctx: () => S.withRound(tcR, { round: roundK }) });
        const btnK = apiK.rollNode(rSys.rolls[0], chK, rSys, S.resolveAll(rSys, chK, F, S.withRound(tcR, { round: 2 })).vars).children[0];
        roundK = 3; btnK.on.click({}); const apiP = mkR({ net: null }); apiP.rollNode({ id: 'r_p', label: 'Plain', formula: 'd6' }, chK, rSys, S.resolveAll(rSys, chK, F, null).vars).children[0].on.click({});
        check('HUD frame HF5 review: a label is worked out again at the click, so it matches what the roll reads then: drawn "Hit (2)", a round later the click sends "Hit (3)"; a label without a value goes as drawn',
            btnK.textContent === 'Hit (2)' && j(apiK.sent) === j([['Hit (3)', undefined]]) && j(apiP.sent) === j([['Plain', undefined]]), j([btnK.textContent, apiK.sent, apiP.sent]));
        // rollInit, run for real
        const riSrc = shR.slice(shR.indexOf('function rollInit(charId, opts) {'), shR.indexOf('// One value changed on the open sheet'));
        const runInit = (label, o) => { o = o || {}; const sysI = JSON.parse(JSON.stringify(gDR)); sysI.rolls.find(r => r.init).label = label;
            const calls = [], toasts = [], ch = { id: 'c_i', name: 'I', values: { f_dex: 14 } }, camp = { id: 'k', system: sysI, chars: { c_i: ch } }, api = mkR({ net: o.net === undefined ? { active: true, role: 'host' } : o.net });
            const ri = new Function('getActiveCampaign', 'systemOf', 'charById', 'initRoll', 'window', 'F', 'resolveAll', 'tokenCtxFor', 'rollLabel', 'labelSecret', 'toast', riSrc + '\nreturn rollInit;')(
                () => camp, c => c.system, (id, c) => (c.chars[id] || null), S.initRoll, { wpDice: { rollFor: (...a) => { calls.push(a); return { ok: true }; } }, wpVtt: { on: () => true } }, () => (o.noF ? null : F), S.resolveAll, () => null, api.rollLabel, api.labelSecret, t => toasts.push(t));
            ri('c_i'); return { calls, toasts }; };
        const iA = runInit('Init ({' + PMR + 'DEXmod})'), iG = runInit('Init ({GMFig})'), iOff = runInit('Init ({GMFig})', { net: null }), iNoF = runInit('Init ({' + PMR + 'DEXmod})', { noF: true });
        check('HUD frame HF5 review: rollInit (run for real) sends the label as worked out ("Init (+2)" at DEX 14) from the combat roster; one naming a GM-only value goes private with one toast on a hosting GM and public offline; with no formula engine the label goes as written',
            j(iA.calls) === j([['c_i', 'd20 + DEXmod', 'Init (+2)', { source: 'combat', priv: false, gmOnly: false }]]) && iA.toasts.length === 0 && j(iG.calls[0].slice(2)) === j(['Init (0)', { source: 'combat', priv: true, gmOnly: false }]) && iG.toasts.length === 1 && /GMFig/.test(iG.toasts[0])
            && j(iOff.calls[0].slice(2)) === j(['Init (0)', { source: 'combat', priv: false, gmOnly: false }]) && iOff.toasts.length === 0 && j(iNoF.calls[0].slice(2)) === j(['Init ({' + PMR + 'DEXmod})', { source: 'combat', priv: false, gmOnly: false }]), j([iA.calls, iG.calls, iG.toasts, iOff.calls, iNoF.calls]));
        // turnView and the sheet's branch of tokenTurned, run for real: a round change marks the view stale and the final call redraws it once
        const flJ = JSON.stringify(flagsR); let rNow = '', nfR = true, swapsR = 0; const redrawsV = [], redrawsS = [];
        const tvSrc = shR.slice(shR.indexOf('function turnView(v, final) {'), shR.indexOf('// The floating panels'));
        const TV = new Function('getActiveCampaign', 'charById', 'dialSigOf', 'tokenFlags', 'swapTokenControls', 'roundSigOf', 'namesFacing', 'systemOf', 'redrawForFacing', tvSrc + '\nreturn turnView;')(() => ({}), () => ({ id: 'c_a' }), () => 'd', () => flagsR, () => { swapsR++; }, () => rNow, () => nfR, () => ({}), v => redrawsV.push(v));
        const vT = { charId: 'c_a', dialSig: 'd', dialStale: false, dialOn: flJ, roundSig: '', rangeSig: '', panel: {} };
        const stepV = (r, fin, nf) => { rNow = r; nfR = nf !== false; TV(vT, fin); return redrawsV.length; };
        const seqV = [stepV('', true), stepV('1', true), stepV('1', true), stepV('2', false), vT.dialStale, stepV('2', true), stepV('', true, false), vT.roundSig, stepV('3', true), stepV('', true)];
        const ttSrc = shR.slice(shR.indexOf('function tokenTurned(tokId, final) {'), shR.indexOf('/* ---------- the sheet panel'));
        const TT = new Function('huds', 'turnView', 'sheetOpen', 'ui', 'getActiveCampaign', 'charById', 'dialSigOf', 'tokenFlags', 'swapTokenControls', 'roundSigOf', 'namesFacing', 'systemOf', 'redrawForFacing', 'var _dialSig = "d", _dialStale = false, _dialOn = ' + JSON.stringify(flJ) + ', _roundSig = "", _rangeSig = "";\n' + ttSrc + '\nreturn tokenTurned;')(
            {}, () => {}, 'c_a', () => ({ style: { display: 'flex' } }), () => ({}), () => ({ id: 'c_a' }), () => 'd', () => flagsR, () => { swapsR++; }, () => rNow, () => nfR, () => ({}), v => redrawsS.push(v === undefined ? 'sheet' : v));
        const stepS = (r, fin) => { rNow = r; nfR = true; TT(null, fin); return redrawsS.length; };
        const seqS = [stepS('', true), stepS('1', true), stepS('1', true), stepS('2', false), stepS('2', true), stepS('', true)];
        check('HUD frame HF5 review: turnView and the sheet\'s branch of tokenTurned (run for real) — a round change marks the view stale and the final call redraws it once (a combat starting, a new round, the combat ending so CombatRound falls to 0); the same round, or a system reading no built-in name, redraws nothing; the dial is left alone',
            j(seqV) === j([0, 1, 1, 1, true, 2, 2, '', 3, 4]) && redrawsV.every(v => v === vT) && j(seqS) === j([0, 1, 1, 1, 2, 3]) && redrawsS.every(v => v === 'sheet') && swapsR === 0, j([seqV, seqS, swapsR]));
        // the band, run for real: its rolls get the system and the render's own resolver
        const biSrc = shR.slice(shR.indexOf('function bandInto(frame, bandDef, ctx) {'), shR.indexOf('var _glyphPop = null;'));
        const fe2 = (tag, cls) => { const e = { tag, className: cls || '', children: [], childNodes: [], dataset: {}, classList: { add(k) { e.className += ' ' + k; }, remove() {} }, querySelectorAll: () => [], appendChild(x) { e.children.push(x); e.childNodes.push(x); return x; }, addEventListener() {} }; return e; };
        const chB = { id: 'c_b', values: { f_str: 14, f_level: 5 } }, allB = S.resolveAll(gDR, chB, F, S.withRound(tcR, { round: 4 })), rnCalls = [];
        const BI = new Function('el', 'PIN_GID', 'groupShown', 'fieldNode', 'rollNode', 'iconNode', 'pinToggle', biSrc + '\nreturn bandInto;')(fe2, /^g_[A-Za-z0-9_]{1,24}$/, () => true, () => fe2('div', 'sheet-field'),
            (r, c, sys, vars) => { rnCalls.push([r.id, sys === gDR, typeof vars === 'function' ? [vars('AtkBonus'), vars('RoundNow')] : null]); return fe2('div', 'sheet-field'); }, () => fe2('span'), () => {});
        const byIdB = {}, rollByIdB = {}; gDR.fields.forEach(f => { byIdB[f.id] = f; }); gDR.rolls.forEach(r => { rollByIdB[r.id] = r; });
        const frameB = fe2('div'); BI(frameB, [{ roll: 'r_atk' }, { id: 'f_hp' }, { roll: 'r_init' }], { c: chB, all: allB, gm: true, own: true, sys: gDR, byId: byIdB, rollById: rollByIdB, grpById: {}, targets: {}, vctx: {} });
        check('HUD frame HF5 review: the band (bandInto, run for real) draws each roll with the system and the render\'s own resolver, the one the sections use (AtkBonus 5, RoundNow 4 in a round-4 combat); the section context hands the band that result by reference, never a copy (whose hidden resolver a copy would lose)',
            j(rnCalls) === j([['r_atk', true, [5, 4]], ['r_init', true, [5, 4]]]) && frameB.children.length === 1 && /var pctx = \{ byId: byId, rollById: rollById, c: c, all: all, /.test(shR), j(rnCalls));
    }
    /* ---- 1.5.4: a redraw keeps the sheet's place ---- */
    {
        const sh9 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL);
        check('1.5.4 a redraw puts the sheet and a HUD back where they were scrolled to, before the focus is restored (a guard: every redraw rebuilds the whole body)',
            sh9.includes("    if (body.scrollTop !== st0) body.scrollTop = st0;   // a redraw never moves the sheet: where it was read is where it stays\n    restoreFocus(body, fk);")
            && sh9.includes("    if (v.body.scrollTop !== stH) v.body.scrollTop = stH;   // as the sheet: a redraw never moves the HUD\n    restoreFocus(v.body, fk);")
            && sh9.includes("fk = focusKeyOf(body), st0 = body ? body.scrollTop : 0;") && sh9.includes("fk = focusKeyOf(v.body), stH = v.body.scrollTop, gm = !isClient()"));
    }

    await T.finish();
})();
