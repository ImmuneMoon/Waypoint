/* sysedlist.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 7, the System editor; split 2026-11-19 with no change in behavior).
   What it holds: the Lists tab: renderLists and a list's card (listCard) with its boxes:
   a stat's tick, a counter's key, caps at a level, Counted once, parts, needs, a station's roll, an area, money and currencies, price,
   a list's apply editor, a blast's box with its Defense roll, a body, and where a hit behind cover lands (coverHit).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sysedList() at
   its line `// [split:sysedlist.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (tools/splitcheck.js holds it): the editor's own state (draft, dirty, tab, layoutView and
   the rest) stands in sheets.js and a part sets it through the setters beside `var draft`. Change the code here as if it still stood
   in sheets.js. */
// [split:of sheets.js]
import { GIVE_TIP, giveTargets, giveValue, giveWhenBox, APPLY_KINDS, CHAMBER_CAP, COVER_HIT_ROWS, F, FEEDS_MAX, LIMITS, ROW_LOOK, altBox, answersBox, badgeBox, bandWhens, buyOffBox, callsBox, capInline, catChoices, charsOf, cleanCover, cleanListSpec, clockBox, costHow, moveCostBox, dbxBtn, dbxCap, dieSel, draft, el, errorCell, explainBox, fxHolds, getActiveCampaign, helpBox, input, kindSel, kindsNamed, labeledNum, labeledSelect, landDmgSel, lazySelect, lineUnder, listCrossRow, lossOpts, markDirty, markOpts, markVal, metricSel, numField, numInput, onRemoveBox, opVal, open, ownSwBox, partCapsBox, partFitsBox, patchErrors, pickOne, placeSel, pressHold, refreshErrors, renderAll, renderCombat, resistBySel, resistOrBox, rollExtras, rolled, segPut, select, standThenBox, startsBox, statKey, state, swWordsBox, switchChangesBox, tab, tileBoxesBox, tileStatesBox, toast, toneRow, tradeRulesBox, twinNamer, ui, unitWordsOn, upkeepBox, whyBox } from './sheets.js';   // [split:glue]
export function sysedList() {   // [split:glue]
// [split:body-start]
// Stage 6 F4b: the Lists tab — one card per item-list field: the categories its picker offers, the same item more than once, no quantity, a
// level per row (names count from its minimum) and a switch per row. Changes go to the draft; Save cleans them
function renderLists() {
    var box = ui('sysListRows'); if (!box) return; var stL = box.scrollTop; box.textContent = '';
    var lists = (draft.fields || []).filter(function(f) { return f.kind === 'item-list'; }), rules = ui('sysListRules'), oneL = typeof pickOne === 'function' ? pickOne('lists', lists) : lists;   // 1.6.2: the list picked alone
    if (rules) { rules.textContent = ''; if (lists.length) rules.appendChild(labeledSelect('sys-listrules-stats', 'Item stats on players’ sheets', [['', 'GM only'], ['owner', 'Players may change them'], ['ask', 'Players ask, the GM approves']], draft.listRules && draft.listRules.statsAsk === true ? 'ask' : draft.listRules && draft.listRules.ownerStats === true ? 'owner' : '', 'Players may change the stats of their own copies with the row\u2019s pencil (a dot marks each; Follow the library takes them back; a stat you set on a copy holds). Turning it off keeps what they set. With Players ask, each change waits for you in the Review, of a library entry they may see too')); if (lists.length) rules.appendChild(labeledSelect('sys-listrules-upload', 'A player’s sheet upload', [['', 'Everything waits for you'], ['facts', 'Their row facts apply at once']], draft.listRules && draft.listRules.uploadFacts === true ? 'facts' : '', 'When a player sends their sheet file (Import JSON on their sheet): everything waits for your review, or the levels, switches and quantities of rows they already carry apply at once (the rest still waits)')); }   // Stage 6 F4c2: the Rules box (Setting A), per system
    if (!lists.length) { box.appendChild(el('div', 'sys-empty', 'No item lists yet. Add an Item list field in Fields (Skills, Weapons, Gear\u2026), then shape it here.')); return; }
    // 1.6.3 (the review of the System editor and the Library window, finding 7): the categories a list may tick come from the system's items, its
    // core and the library's entries (sheets.js catChoices, which every other picker of a list's categories asks), each once ignoring case, the
    // first spelling met kept. A system built on a library has no items of its own, and the list could then tick no category at all
    var cats = [], seen = Object.create(null);
    var catCs = typeof catChoices === 'function' ? catChoices(draft) : null; (Array.isArray(catCs) ? catCs : (draft.items || []).map(function(it) { return it && it.category; })).forEach(function(c0) { var cc = String(c0 || '').trim(); if (cc && !seen[cc.toLowerCase()]) { seen[cc.toLowerCase()] = 1; cats.push(cc); } });
    var tgL = draft.fields.filter(function(x) { return x && APPLY_KINDS[x.kind] === 1; });   // R2b: what a list's actions may move (APPLY_KINDS); 1.6.3 (gap 2 of docs/EDITOR_COVERAGE.md): a toggle too, as the Rolls tab offers one. The cleaner always kept a toggle here, but the picker left it out, so a stored toggle read as a field that is gone
    oneL.forEach(function(f) { box.appendChild(listCard(f, cats, tgL, draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.acts) ? draft.combat.turn.acts.filter(function(a) { return a && typeof a.key === 'string' && a.key; }) : [])); var le = errorCell('list:' + f.id); le.dataset.errFor = 'list:' + f.id; box.appendChild(le); });   // F4c1: the list's stat messages under its card
    if (typeof window !== 'undefined' && window.wpSysUi) window.wpSysUi.arrangeIn(box, 'lists', 'sys-list-card');   // 1.6.2: in named groups
    if (stL) box.scrollTop = stL;
}
// [systemcheck:stattick-start]
// A list stat's two ticks (1.5.4): On the row and Hidden are one or the other, in the draft and in the card's own boxes
function statTick(d, which, on, row) {
    if (!d || typeof d !== 'object' || (which !== 'show' && which !== 'hide')) return;
    if (!on) { delete d[which]; return; }
    var other = which === 'show' ? 'hide' : 'show';
    d[which] = true; delete d[other];
    var ob = row && typeof row.querySelector === 'function' ? row.querySelector('.sys-list-stat' + other) : null; if (ob) ob.checked = false;
}
// [systemcheck:stattick-end]
function listCard(f, allCats, targets, acts) {   // acts (turn-based combat T1): the actions a list roll may cost   // targets (R2b): the pools and numbers an action or a consequence may move
    var sp = f.list && typeof f.list === 'object' ? f.list : {}, card = el('div', 'sys-list-card'); card.dataset.lid = f.id;
    var ttl = el('div', 'sys-list-title'); ttl.appendChild(input('sys-list-name field', f.label || '', 'The list\u2019s name, as the sheet shows it', 'Name the list')); card.appendChild(ttl);   // 1.6.2 (the owner, by prompt: "New list from the Lists tab"): named where it is made
    var cl = el('div', 'sys-list-cats'); cl.appendChild(el('span', 'sys-num-cap', 'Categories'));
    var mine = Array.isArray(sp.cats) ? sp.cats.map(String) : [], low = mine.map(function(x) { return x.toLowerCase(); }), shown = allCats.slice();
    mine.forEach(function(x) { if (!shown.some(function(y) { return y.toLowerCase() === x.toLowerCase(); })) shown.push(x); });   // one no item has any more stays tickable
    if (!shown.length) cl.appendChild(el('span', 'sys-note', 'Categories come from the items in Items and from the library\u2019s entries. Give one a category and it shows here to tick.'));
    shown.forEach(function(x) { var lb = el('label', 'sys-list-cat'), cb = el('input', 'sys-list-catcb'); cb.type = 'checkbox'; cb.checked = low.indexOf(x.toLowerCase()) >= 0; cb.dataset.cat = x; if (!cb.checked && mine.length >= LIMITS.listCats) { cb.disabled = true; lb.title = 'At most ' + LIMITS.listCats + ' categories a list'; } lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + x)); cl.appendChild(lb); });   // review: the cap Save keeps, shown
    if (shown.length && !mine.length) cl.appendChild(el('span', 'sys-note', 'None ticked: every category.'));
    card.appendChild(cl);
    if (typeof startsBox === 'function') card.appendChild(startsBox(f));   // 1.6.0 Starts with
    var fl = el('div', 'sys-flags');
    fl.appendChild(checkLabel('sys-list-multi', sp.multi === true, 'Same item more than once', 'Adding an item it already holds makes a new row (a skill twice, with two specialties) instead of raising the quantity'));
    fl.appendChild(checkLabel('sys-list-noqty', sp.noQty === true, 'No quantity', 'Rows have no quantity (skills, powers): the \u2212/+ and \u00d7n go, and an item is on the list once unless the same item may be there more than once. Quantities already stored come back if you untick it'));
    fl.appendChild(checkLabel('sys-list-sheets', !!(sp.sheets && typeof sp.sheets === 'object'), 'Rows are sheets', 'Each row may be joined to a character sheet of the campaign, as a vehicle\u2019s row to the vehicle\u2019s own sheet. The sheet\u2019s picture and name stand on the row and open it, and a column of this list can read that sheet\u2019s figures'));   // 1.6.2 (vehicles, fold (a))
    if (sp.sheets && typeof sp.sheets === 'object') {   // what a new sheet made from a row starts as: a copy of a template sheet, else the system's defaults, with a toggle switched on
        var shW = el('div', 'sys-row'), shCs = charsOf(getActiveCampaign()), shTp = el('select', 'sys-list-sheettpl'), shOn = el('select', 'sys-list-sheeton'), shO = function(sel, v, tx, on) { var o = el('option', null, tx); o.value = v; if (on) o.selected = true; sel.appendChild(o); };
        shO(shTp, '', 'The system\u2019s defaults', !sp.sheets.tpl); Object.keys(shCs).map(function(id) { return shCs[id]; }).filter(function(x) { return x && !x.partial; }).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); }).slice(0, 200).forEach(function(x) { shO(shTp, x.id, 'A copy of ' + (x.name || 'Character'), sp.sheets.tpl === x.id); });
        if (sp.sheets.tpl && !Object.prototype.hasOwnProperty.call(shCs, sp.sheets.tpl)) shO(shTp, sp.sheets.tpl, 'A sheet that is not here now', true);
        shO(shOn, '', 'Nothing more', !sp.sheets.on); (draft.fields || []).filter(function(g) { return g && g.kind === 'toggle'; }).forEach(function(g) { shO(shOn, g.id, g.label || g.key || 'A toggle', sp.sheets.on === g.id); });
        var shL1 = el('label', 'sys-check'); shL1.appendChild(document.createTextNode('A new sheet starts as ')); shL1.appendChild(shTp); shTp.title = 'What a sheet made from a row of this list starts as. Either way it takes the row\u2019s name and belongs to whoever owns the row';
        var shL2 = el('label', 'sys-check'); shL2.appendChild(document.createTextNode(' and switches on ')); shL2.appendChild(shOn); shOn.title = 'A toggle a new sheet starts switched on, so a section can show only on such sheets';
        shW.appendChild(shL1); shW.appendChild(shL2); fl.appendChild(shW);
    }
    fl.appendChild(checkLabel('sys-list-hang', sp.hang === true, 'Rows hang from a row', 'A row may stand under another row of this list, as a hand under its arm. You set it on the row, or a grant does, and a formula of the row can read the row it hangs from'));   // 1.6.2 (body fold 1)
    fl.appendChild(checkLabel('sys-list-graise', sp.grantRaise === true, 'A grant raises a held row', 'A grant of an entry this list already holds raises that row to the grant\u2019s level and adds none. When the row that granted it goes, the held row falls back to its own level. A list with no quantity always does this'));   // 1.6.0 (a builder audit)
    if (sp.custom === true && typeof ownSwBox === 'function') fl.appendChild(ownSwBox(sp));
    fl.appendChild(checkLabel('sys-list-custom', sp.custom === true, 'Custom rows', 'Players may add rows of their own with + Custom\u2026 on their sheet (a name, an icon, a category, notes, a key and stats) and change the ones they made; you can add them on any shaped list'));   // Stage 6 F4c3
    fl.appendChild(checkLabel('sys-list-open', sp.open === true, 'Rows open', 'Each row gets an arrow before its name that opens its details: what each part set to Shows In the details holds, its description and its note. Open all and Close all stand over the list.'));   // 1.6.0 R1
    if (sp.trade === true && typeof tradeRulesBox === 'function') fl.appendChild(tradeRulesBox(sp));
    fl.appendChild(checkLabel('sys-list-hand', !!sp.hand, 'A hand of cards', 'Rows of this list are cards a character holds, drawn as a fan. Only its owner sees them, and everyone else sees how many')); if (sp.hand) fl.appendChild(checkLabel('sys-list-handgm', sp.hand.gm === true, 'The GM sees hands', 'Lets the GM read these hands. Leave it off for a game the GM plays at too'));   // 1.6.2 (G9)
    { var tlS = el('select', 'sys-list-togm'); tlS.title = 'Its rolls go to the GM: a player sees only that each was sent, and you get the roll privately. Its Then runs at once, or waits for your Apply. A roll may say otherwise'; [['', 'Players see its rolls'], ['run', 'Its rolls go to the GM'], ['wait', 'Its rolls go to the GM, Then waits']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if ((sp.toGm || '') === o[0]) op.selected = true; tlS.appendChild(op); }); fl.appendChild(tlS); }   // HR1
    fl.appendChild(checkLabel('sys-list-trade', sp.trade === true, 'Tradable', 'Rows of this list can be put on the table in a trade between two characters: gear and money, never skills'));   // 1.5.6 trading
    var miW = el('label', 'sys-check'), miI = el('input', 'field sys-list-modsif'); miI.type = 'text'; miI.value = typeof sp.modsIf === 'string' ? sp.modsIf : ''; miI.placeholder = 'always'; miI.spellcheck = false; miI.autocomplete = 'off'; miW.appendChild(document.createTextNode('Changes apply where ')); miW.appendChild(miI);   // 1.6.0 Changes apply where (the campaign build's ask)
    miW.title = 'A test of the character and of each row. A row where it does not hold gives none of its changes. It reads the sheet before any item or effect changes it. Blank: always'; fl.appendChild(miW);
    { var lyS = sp.lay && typeof sp.lay === 'object' ? sp.lay : null, lyW = el('label', 'sys-check'), lyP = el('select', 'sys-list-layfrom');   // 1.6.2 Laid from: each row of another list lays one row here, kept in step, its name, count and copied stats nobody's to change
    var lyN = el('option', null, 'Nothing'); lyN.value = ''; lyP.appendChild(lyN);
    (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (!x || x.kind !== 'item-list' || x.id === f.id) return; var o = el('option', null, x.label || x.key || 'A list'); o.value = x.id; if (lyS && lyS.from === x.id) o.selected = true; lyP.appendChild(o); });
    lyW.appendChild(document.createTextNode('Rows laid from ')); lyW.appendChild(lyP); lyW.title = 'Each row of the list picked lays one row here, named as that row and kept in step as it comes, changes and goes. Nobody changes a laid row’s name, count or copied stats, or removes it, the GM included'; fl.appendChild(lyW);
    if (lyS && lyS.from) {
        var lySrc = null; (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (x && x.id === lyS.from) lySrc = x; });
        var lyIW = el('label', 'sys-check'), lyI = el('input', 'field sys-list-layif'); lyI.type = 'text'; lyI.value = typeof lyS['if'] === 'string' ? lyS['if'] : ''; lyI.placeholder = 'every row'; lyI.spellcheck = false; lyI.autocomplete = 'off'; lyI.dataset.rl = lyS.from;
        lyIW.appendChild(document.createTextNode('Only where ')); lyIW.appendChild(lyI); lyIW.title = 'A test of each row of the list it lays from. A row where it does not hold lays nothing. Blank: every row'; fl.appendChild(lyIW);
        var lySt = lySrc && lySrc.list && Array.isArray(lySrc.list.stats) ? lySrc.list.stats.filter(function(s2) { return s2 && typeof s2.key === 'string' && s2.key; }) : [];
        var lyMine = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s2) { return s2 && typeof s2.key === 'string' && s2.key; });
        if (lyMine.length && lySt.length) {
            var lyRow = el('div', 'sys-lock-cells'); lyRow.appendChild(el('span', 'sys-lock-cap', 'Copied from its row:'));
            lyMine.forEach(function(s2) {
                var cw = el('label', 'sys-check'), cs = el('select', 'sys-list-laystat'); cs.dataset.to = s2.key;
                var had = (Array.isArray(lyS.stats) ? lyS.stats : []).filter(function(p) { return p && String(p.to).toLowerCase() === s2.key.toLowerCase(); })[0];
                var n0 = el('option', null, 'Its own'); n0.value = ''; cs.appendChild(n0);
                lySt.forEach(function(t2) { var o = el('option', null, t2.label || t2.key); o.value = t2.key; if (had && String(had.from).toLowerCase() === t2.key.toLowerCase()) o.selected = true; cs.appendChild(o); });
                cw.appendChild(document.createTextNode((s2.label || s2.key) + ' ')); cw.appendChild(cs); cw.title = 'What this stat of a laid row reads: its own, or the stat picked of the row that lays it, kept in step'; lyRow.appendChild(cw);
            });
            fl.appendChild(lyRow);
        }
        var lyR = el('div', 'sys-lock-cells sys-lay-rules'), lyRu = Array.isArray(lyS.rules) ? lyS.rules : [], lyRe = function() { markDirty(); renderAll(); }, lyStop = function(e) { e.stopPropagation(); };   // 1.6.2: rules by the source row's category
        lyR.appendChild(el('span', 'sys-lock-cap', 'By category:'));
        if (lyRu.length > 1) { var alW = checkLabel('sys-list-layall', lyS.all === true, 'Each rule that takes it lays', 'A source row lays a row by every rule that names its category, each by its own Only where, such as a head laying a Head and a Face. Unticked: by the first rule alone'); var alI = alW.querySelector ? alW.querySelector('input') : null; if (alI) alI.addEventListener('change', function(e) { lyStop(e); if (alI.checked) lyS.all = true; else delete lyS.all; lyRe(); }); lyR.appendChild(alW); }   // 1.6.2
        lyRu.forEach(function(ru, i) {
            var rw = el('div', 'sys-flags sys-lay-rule'), cI = el('input', 'field sys-list-layrcats'); cI.type = 'text'; cI.value = Array.isArray(ru.cats) ? ru.cats.join(', ') : ''; cI.placeholder = 'Categories, such as Arm'; cI.title = 'The source rows of these categories, by commas, lay by this rule. Two categories here lay one row between them where it lays one between them';
            cI.addEventListener('change', function(e) { lyStop(e); ru.cats = cI.value.split(',').map(function(c) { return c.trim(); }).filter(Boolean); lyRe(); }); rw.appendChild(cI);
            var nI = el('input', 'field sys-list-layrname'); nI.type = 'text'; nI.value = typeof ru.name === 'string' ? ru.name : ''; nI.placeholder = 'Its name, such as {side} Arm'; nI.title = 'The laid row\u2019s name. {side} is its side\u2019s word, such as Right, and {n} its number among the rows this rule lays on that side. Two rows that would share a name are numbered, such as Right Arm 1 and Right Arm 2. Empty: the name of the row that lays it';
            nI.addEventListener('change', function(e) { lyStop(e); if (nI.value.trim()) ru.name = nI.value.slice(0, 240); else delete ru.name; lyRe(); }); rw.appendChild(nI);
            var rI = el('input', 'field sys-list-layrif'); rI.type = 'text'; rI.value = typeof ru['if'] === 'string' ? ru['if'] : ''; rI.placeholder = 'every row'; rI.spellcheck = false; rI.autocomplete = 'off'; rI.dataset.rl = lyS.from; rI.title = 'A test of each source row this rule takes. A row where it does not hold lays nothing by this rule. Blank: every row';   // 1.6.2: a rule's own Only where
            rI.addEventListener('change', function(e) { lyStop(e); var rv = String(rI.value || '').trim(); if (rv) ru['if'] = rv.slice(0, LIMITS.formula); else delete ru['if']; lyRe(); }); rw.appendChild(rI);
            var eS = select('sys-list-layreach', [['row', 'One a row'], ['unit', 'One a unit'], ['kind', 'One between them']], ru.each === 'unit' || ru.each === 'kind' ? ru.each : 'row', 'One a row: as ever. One a unit: a row of quantity 2 lays two, their sides in order. One between them: rows of these categories lay one row, kept while any is there');
            eS.addEventListener('change', function(e) { lyStop(e); ru.each = eS.value; lyRe(); }); rw.appendChild(eS);
            if (ru.each !== 'kind') { var rsI = el('input', 'field sys-list-layrsides'); rsI.type = 'text'; rsI.value = Array.isArray(ru.sides) ? (ru.sides.length ? ru.sides.join(', ') : 'none') : ''; rsI.placeholder = 'Sides: the list\u2019s'; rsI.title = 'This rule\u2019s own sides in order, such as 2, 1, repeated over its units. None: no side. Blank: the list\u2019s Sides in order'; rsI.addEventListener('change', function(e) { lyStop(e); var tv = rsI.value.trim(); if (!tv) delete ru.sides; else if (/^none$/i.test(tv)) ru.sides = []; else { var ns2 = tv.split(',').map(function(x) { return Math.round(Number(x.trim())); }).filter(function(n2) { return isFinite(n2); }).slice(0, 8); ru.sides = ns2; } lyRe(); }); rw.appendChild(rsI);
                var sdSt = lyS.side && Array.isArray(sp.stats) ? sp.stats.filter(function(s2) { return s2 && typeof s2.key === 'string' && s2.key.toLowerCase() === String(lyS.side).toLowerCase(); })[0] : null, sdL = sdSt && Array.isArray(sdSt.labels) ? sdSt.labels : [];   // 1.6.2 (asked by a campaign's build): the side a lone unit takes
                if (sdL.length > 1) { var loO = [['', 'Alone: as the others']]; sdL.forEach(function(lb, j) { if (j > 0 && typeof lb === 'string' && lb.trim()) loO.push([String(j), 'Alone: ' + lb.trim()]); }); if (typeof ru.lone === 'number' && !(typeof sdL[ru.lone] === 'string' && sdL[ru.lone].trim())) loO.push([String(ru.lone), 'Alone: side ' + ru.lone]);
                    var loS = select('sys-list-layrlone', loO, typeof ru.lone === 'number' ? String(ru.lone) : '', 'Where this rule lays only one with a side, the side that one takes, such as Center for a lone leg'); loS.addEventListener('change', function(e) { lyStop(e); if (loS.value === '') delete ru.lone; else ru.lone = Number(loS.value); lyRe(); }); rw.appendChild(loS); }
            }   // 1.6.2: a rule's own sides
            if (ru.each !== 'kind' && lyRu.length > 1) {   // 1.6.2: Sided only as many as another rule lays, the rest under a second name
                var upO = [['', 'Sided: all of them']].concat(lyRu.map(function(o2, j) { return j === i ? null : [String(j), 'Sided: as many as ' + (o2 && o2.name ? o2.name.replace(/\{side\}|\{n\}/gi, '').replace(/\s+/g, ' ').trim() || 'rule ' + (j + 1) : 'rule ' + (j + 1))]; }).filter(Boolean)), upS = select('sys-list-layrupto', upO, typeof ru.upTo === 'number' ? String(ru.upTo) : '', 'Only as many of these as another rule lays take a side and this name, such as as many Feet as Legs. The rest take the second name, with no side');
                upS.addEventListener('change', function(e) { lyStop(e); if (upS.value === '') { delete ru.upTo; delete ru.rest; } else ru.upTo = Number(upS.value); lyRe(); }); rw.appendChild(upS);
                if (typeof ru.upTo === 'number') { var rtI = el('input', 'field sys-list-layrrest'); rtI.type = 'text'; rtI.value = typeof ru.rest === 'string' ? ru.rest : ''; rtI.placeholder = 'The rest, such as Motive System {n}'; rtI.title = 'The name of the units past that count, with no side. {n} is its number among them. Blank: this rule\u2019s own name'; rtI.addEventListener('change', function(e) { lyStop(e); if (rtI.value.trim()) ru.rest = rtI.value.slice(0, 240); else delete ru.rest; lyRe(); }); rw.appendChild(rtI); }
            }
            var dB = el('button', 'tool ghost sys-btn sys-list-layrdel', '\u00d7'); dB.type = 'button'; dB.title = 'Remove this rule'; dB.addEventListener('click', function(e) { lyStop(e); lyRu.splice(i, 1); if (!lyRu.length) delete lyS.rules; lyRe(); }); rw.appendChild(dB);
            lyR.appendChild(rw);
        });
        // 1.6.3 (Fulllion's rulings of 2026-11-20): a rule's Categories box is required, since a rule that names none lays nothing and Save drops it with
        // all set on it. A new rule starts on the source list's first category, else the first category an item of the system holds, else none (said under the list)
        var layCatFirst = function(ly) { var src = (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).filter(function(x) { return x && x.id === ly.from; })[0], sc = src && src.list && Array.isArray(src.list.cats) ? src.list.cats.filter(function(c) { return typeof c === 'string' && c.trim(); }) : [];
            if (sc.length) return [sc[0].trim()]; var it = (typeof draft !== 'undefined' && draft && Array.isArray(draft.items) ? draft.items : []).filter(function(x) { return x && typeof x.category === 'string' && x.category.trim(); })[0]; return it ? [it.category.trim()] : []; };
        var aB = el('button', 'tool ghost sys-btn sys-list-layradd', '+ Rule'); aB.type = 'button'; aB.title = 'Lay rows of some categories by a rule of their own: their name, and one a row, a unit or between them. With rules, a category no rule names lays nothing'; aB.addEventListener('click', function(e) { lyStop(e); if (!Array.isArray(lyS.rules)) lyS.rules = []; lyS.rules.push({ cats: layCatFirst(lyS), each: 'row' }); lyRe(); }); lyR.appendChild(aB);   // 1.6.3: a new rule starts on a category, as a rule with none lays nothing
        var lyNum = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s2) { return s2 && typeof s2.key === 'string' && s2.key && s2.kind !== 'pick'; }), sdP = select('sys-list-layside', [['', 'No side']].concat(lyNum.map(function(s2) { return [s2.key, 'Side in ' + (s2.label || s2.key)]; })), typeof lyS.side === 'string' ? lyS.side : '', 'The stat of a laid row its side goes into, as hit locations read a side');
        sdP.addEventListener('change', function(e) { lyStop(e); if (sdP.value) lyS.side = sdP.value; else { delete lyS.side; delete lyS.sides; } lyRe(); }); lyR.appendChild(sdP);
        if (lyS.side) { var ssI = el('input', 'field sys-list-laysides'); ssI.type = 'text'; ssI.value = Array.isArray(lyS.sides) ? lyS.sides.join(', ') : ''; ssI.placeholder = 'Sides in order, such as 2, 1'; ssI.title = 'The side each unit gets, in order: the figures of the side stat, such as 2 for Right then 1 for Left. Past them a unit gets 0'; ssI.addEventListener('change', function(e) { lyStop(e); var ns = ssI.value.split(',').map(function(x) { return Number(x.trim()); }).filter(function(n) { return isFinite(n) && String(n) !== ''; }); if (ns.length) lyS.sides = ns.slice(0, 8); else delete lyS.sides; lyRe(); }); lyR.appendChild(ssI); }
        fl.appendChild(lyR);
    } }
    { var lkS = sp.lock && typeof sp.lock === 'object' ? sp.lock : {}, lkW = el('label', 'sys-check'), lkI = el('input', 'field sys-list-lockif');   // 1.6.2 Locked while: chosen cells of its rows while a test of the character holds, for everyone, the GM too
    lkI.type = 'text'; lkI.value = typeof lkS['if'] === 'string' ? lkS['if'] : ''; lkI.placeholder = 'never'; lkI.spellcheck = false; lkI.autocomplete = 'off';
    lkW.appendChild(document.createTextNode('Locked while ')); lkW.appendChild(lkI); lkW.title = 'A test of the character. While it holds, the cells ticked under it are drawn as they read and nobody changes them on the sheet, the GM included. A file that fills a character still lays them. Blank: never locked'; fl.appendChild(lkW);
    if (typeof lkS['if'] === 'string' && lkS['if']) {
        var lkHas = function(k) { return (Array.isArray(lkS.cells) ? lkS.cells : []).some(function(x) { return String(x).toLowerCase() === String(k).toLowerCase(); }); }, lkRow = el('div', 'sys-lock-cells');
        lkRow.appendChild(el('span', 'sys-lock-cap', 'What it locks:'));
        var lkCells = [['name', 'Name']]; if (sp.lvl && typeof sp.lvl === 'object') lkCells.push(['lvl', sp.lvl.label || 'Level']); if (sp.noQty !== true) lkCells.push(['qty', 'Count']);
        (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s2) { if (s2 && typeof s2.key === 'string' && s2.key) lkCells.push([s2.key, s2.label || s2.key]); });
        lkCells.forEach(function(lc) { var lw = el('label', 'sys-check'), li = el('input', 'sys-list-lockcell'); li.type = 'checkbox'; li.checked = lkHas(lc[0]); li.dataset.cell = lc[0]; lw.appendChild(li); lw.appendChild(document.createTextNode(' ' + lc[1])); lw.title = 'While the test holds, nobody changes this on the sheet'; lkRow.appendChild(lw); });
        fl.appendChild(lkRow);
        var lsW = el('label', 'sys-check'), lsI = el('input', 'field sys-list-locksays'); lsI.type = 'text'; lsI.maxLength = 200; lsI.value = typeof lkS.says === 'string' ? lkS.says : ''; lsI.placeholder = 'This row’s name cannot be changed while its rule holds.';
        lsW.appendChild(document.createTextNode('Refused with ')); lsW.appendChild(lsI); lsW.title = 'What the sheet says when someone tries to change a locked cell, and its tooltip. Blank: the words above'; fl.appendChild(lsW);
    } }
    var spcOn = !!(sp.specs && typeof sp.specs === 'object' && !Array.isArray(sp.specs));   // 1.6.0 Specialties (the core handbook session's skill reference)
    fl.appendChild(checkLabel('sys-list-specs', spcOn, 'Specialties', 'Each row is a specialty of a parent, as Blade (Longsword). A rule reads one by its parent and specialty: the row held, else the best row of that parent plus its Fallback, else the parent untrained'));
    if (spcOn) {
        var spO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }, spSt = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.key; }), spCl = (Array.isArray(sp.cols) ? sp.cols : []).filter(function(x) { return x && typeof x.key === 'string' && x.key; });
        var soW = el('label', 'sys-check'), soS = el('select', 'sys-list-specof'); soW.appendChild(document.createTextNode('Parent from ')); soS.appendChild(spO('', 'Its key or name', !sp.specs.of));
        spSt.filter(function(s) { return s.kind === 'pick'; }).forEach(function(s) { soS.appendChild(spO(s.key, s.label || s.key, sp.specs.of === s.key)); });
        soW.title = 'Where a row says its parent: its entry\u2019s key, the part before two underscores as in Blade__Longsword, its own name, or a choice stat of this list whose options are the parents'; soW.appendChild(soS); fl.appendChild(soW);
        var scW = el('label', 'sys-check'), scS = el('select', 'sys-list-speccover'); scW.appendChild(document.createTextNode('Covers ')); scS.appendChild(spO('', 'None', !sp.specs.cover));
        spSt.filter(function(s) { return s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length; }).forEach(function(s) { scS.appendChild(spO(s.key, s.label || s.key, sp.specs.cover === s.key)); });
        scW.title = 'A number stat with value names, read as a set as has() reads one. A row whose set holds a value counts as that specialty, as a row of every sense counts as Smell'; scW.appendChild(scS); fl.appendChild(scW);
        var saW = el('label', 'sys-check'), saS = el('select', 'sys-list-specapart'); saW.appendChild(document.createTextNode('Stands apart ')); saS.appendChild(spO('', 'None', !sp.specs.apart));   // 1.6.2: the specialties of a parent that neither give nor take a fallback
        spSt.filter(function(s) { return s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length; }).forEach(function(s) { saS.appendChild(spO(s.key, s.label || s.key, sp.specs.apart === s.key)); });
        saW.title = 'A number stat with value names, set on the parent\u2019s entry. A specialty it holds is learned on its own: another specialty of the parent is not read in its place, and it is not read in place of another'; saW.appendChild(saS); fl.appendChild(saW);
        var sbW = el('label', 'sys-check'), sbS = el('select', 'sys-list-specby'); sbW.appendChild(document.createTextNode('Specialty from ')); sbS.appendChild(spO('', 'Its name', !sp.specs.by));
        spSt.filter(function(s) { return s.kind === 'pick'; }).forEach(function(s) { sbS.appendChild(spO(s.key, s.label || s.key, sp.specs.by === s.key)); });
        sbW.title = 'Where a row says its specialty: its own name, as Blade (Longsword) or Blade: Longsword, or a choice stat of this list'; sbW.appendChild(sbS); fl.appendChild(sbW);
        var sfW = el('label', 'sys-check'), sfS = el('select', 'sys-list-specfall'); sfW.appendChild(document.createTextNode('Fallback ')); sfS.appendChild(spO('', 'None', !sp.specs.fall));
        spSt.filter(function(s) { return s.kind !== 'pick'; }).concat(spCl).forEach(function(s) { sfS.appendChild(spO(s.key, s.label || s.key, sp.specs.fall === s.key)); });
        sfW.title = 'A number stat or a column added where another specialty of the parent is read in place of the one named, such as -2. None: nothing is added'; sfW.appendChild(sfS); fl.appendChild(sfW);
        var snW = el('label', 'sys-check'), snS = el('select', 'sys-list-specnever'); snW.appendChild(document.createTextNode('Never untrained ')); snS.appendChild(spO('', 'None', !sp.specs.never));
        spSt.filter(function(s) { return s.kind !== 'pick'; }).concat(spCl).forEach(function(s) { snS.appendChild(spO(s.key, s.label || s.key, sp.specs.never === s.key)); });
        snW.title = 'A number stat or a column read on the parent as not held: where it is not 0, the parent cannot be tried untrained, and a roll that reads it is refused with those words'; snW.appendChild(snS); fl.appendChild(snW);
        var spW = el('label', 'sys-check'), spS2 = el('select', 'sys-list-specpen'); spW.appendChild(document.createTextNode('Untrained shows ')); spS2.appendChild(spO('', 'No penalty', !sp.specs.pen));
        spSt.filter(function(s) { return s.kind !== 'pick'; }).concat(spCl).forEach(function(s) { spS2.appendChild(spO(s.key, s.label || s.key, sp.specs.pen === s.key)); });
        spW.title = 'A number stat or a column read on the parent as not held, said on a roll\u2019s card as the untrained penalty, as untrained Blade (\u22125). It changes no figure'; spW.appendChild(spS2); fl.appendChild(spW);
        var ssW = el('label', 'sys-check'), ssS = el('select', 'sys-list-specsum'); ssW.appendChild(document.createTextNode('Subject reads ')); ssS.appendChild(spO('', 'Best row', sp.specs.sum !== true)); ssS.appendChild(spO('add', 'Add the rows', sp.specs.sum === true));   // gap 20
        ssW.title = 'Where several rows are held for a subject, such as a sense held alone and one held for every sense: the best of them, or all of them added up. Has reads alike either way'; ssW.appendChild(ssS); fl.appendChild(ssW);
        var sdW = el('label', 'sys-check'), sdS = el('select', 'sys-list-specdflt'); sdW.appendChild(document.createTextNode('Untrained ')); sdS.appendChild(spO('', 'The figure read', !sp.specs.dflt));
        spCl.forEach(function(x) { sdS.appendChild(spO(x.key, x.label || x.key, sp.specs.dflt === x.key)); });
        sdW.title = 'What is read where no row of the parent is held: the figure named, worked out on the parent as not held, or a column of its own'; sdW.appendChild(sdS); fl.appendChild(sdW);
    }
    var pbChoices = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.key && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length : Array.isArray(s.labels) && s.labels.length); });   // 1.6.0, backlog 180 R13
    var ptLists = typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields.filter(function(x) { return x && x.kind === 'item-list'; }) : [];   // 1.6.0, backlog 180 R14: Parts from
    if (ptLists.length) {
        var ptW = el('span', 'sys-check sys-list-partsrow'), ptIds = sp.parts ? [sp.parts.from].concat(Array.isArray(sp.parts.also) ? sp.parts.also : []) : [];   // 1.6.2 (the owner, by prompt: "Several lists. Parts from becomes ticks"): a tick a list
        ptW.appendChild(document.createTextNode('Parts from '));
        ptLists.forEach(function(x) { var ptL = el('label', 'sys-check'), ptC = el('input', 'sys-list-partsfrom'); ptC.type = 'checkbox'; ptC.dataset.pf = x.id; ptC.checked = ptIds.indexOf(x.id) >= 0; ptL.appendChild(ptC); ptL.appendChild(document.createTextNode(' ' + (x.label || x.key || 'List') + (x.id === f.id ? ' (this list)' : ''))); ptW.appendChild(ptL); });
        ptW.title = 'Each row of this list can hold parts, rows of the lists you tick: purchases on a power, upgrades in a limb, a scope and an attachment on one gun. They show as pills under the row, and its rules can count them and add them up';
        fl.appendChild(ptW);
        if (sp.parts) {
            var pcW = el('label', 'sys-check'), pcI = el('input', 'field sys-list-partscats'); pcI.type = 'text'; pcI.value = Array.isArray(sp.parts.cats) ? sp.parts.cats.join(', ') : ''; pcI.placeholder = 'every category'; pcW.appendChild(document.createTextNode('Parts fit ')); pcW.appendChild(pcI); pcW.title = 'The categories a part may be, with commas between them. Empty: any entry of that list'; fl.appendChild(pcW);
            var phW = el('label', 'sys-check'), phI = el('input', 'field sys-list-partshosts'); phI.type = 'text'; phI.value = Array.isArray(sp.parts.hosts) ? sp.parts.hosts.join(', ') : ''; phI.placeholder = 'every row'; phW.appendChild(document.createTextNode('Held by ')); phW.appendChild(phI); phW.title = 'The categories of this list\u2019s rows that may hold parts, with commas between them. Empty: every row that is not a part itself'; fl.appendChild(phW);   // 198
            var pkW = el('label', 'sys-check'), pkS = el('select', 'sys-list-partscap'), pkN = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; }), pkC = typeof sp.parts.capBy === 'string' ? sp.parts.capBy.toLowerCase() : '', pkHit = false;   // 1.6.0 (v2, B6)
            pkW.appendChild(document.createTextNode('Holds ')); var pko = el('option', null, 'any number of parts'); pko.value = ''; pkS.appendChild(pko);
            pkN.forEach(function(s) { var o = el('option', null, 'as many as the row\u2019s ' + (s.label || s.key)); o.value = s.key; if (!pkHit && pkC && s.key.toLowerCase() === pkC) { o.selected = true; pkHit = true; } pkS.appendChild(o); });
            if (pkC && !pkHit) { var pkx = el('option', null, sp.parts.capBy + ' (not a number stat of this list)'); pkx.value = sp.parts.capBy; pkx.selected = true; pkS.appendChild(pkx); }
            pkW.title = 'Where a row\u2019s figure in this stat is set, the row holds that many parts at most, their quantities added. Adding one more is refused with a word of why'; pkW.appendChild(pkS); fl.appendChild(pkW);
            if (sp.parts.from === f.id) fl.appendChild(checkLabel('sys-list-partsdeep', sp.parts.deep === true, 'Parts hold parts', 'A part may hold parts of its own, as a hand fitted to an arm. its rules can add up every level under a row, and removing a row takes all that is fitted to it'));   // 205 (4): only where the parts come from this list
            if (typeof partCapsBox === 'function') fl.appendChild(partCapsBox(sp));   // 205 (5): a cap per kind
            var pfW = el('label', 'sys-check'), pfI = el('input', 'field sys-list-partsfitif'); pfI.type = 'text'; pfI.value = typeof sp.parts.fitIf === 'string' ? sp.parts.fitIf : ''; pfI.placeholder = 'every part fits'; pfI.spellcheck = false; pfI.autocomplete = 'off'; pfW.appendChild(document.createTextNode('Fits where ')); pfW.appendChild(pfI);   // 1.6.0 Fits where (the core handbook session's ask 18)
            pfW.title = 'A test a part must meet to be fitted to a row, reading the part, the row it goes on and the character, such as a grip no wider than the hand it goes in. A player is refused where it does not hold, and you are told. Blank: every part fits'; fl.appendChild(pfW);
            var pwW = el('label', 'sys-check'), pwI = el('input', 'field sys-list-partsfitwords'); pwI.type = 'text'; pwI.value = typeof sp.parts.fitIfSays === 'string' ? sp.parts.fitIfSays : ''; pwI.placeholder = 'That part does not fit there.'; pwW.appendChild(document.createTextNode('Refused with ')); pwW.appendChild(pwI); pwW.title = 'The words a player is told when a part does not fit. It must be filled in while it says when a part fits, or a player is told only that the part does not fit'; fl.appendChild(pwW);
            if (typeof partFitsBox === 'function') fl.appendChild(partFitsBox(sp));   // 1.6.2: further rules, each with its own words
            var plW = el('label', 'sys-check'), plI = el('input', 'field sys-list-partslabel'); plI.type = 'text'; plI.value = sp.parts.label || ''; plI.placeholder = 'Part'; plW.appendChild(document.createTextNode('Add button says ')); plW.appendChild(plI); plW.title = 'The word on the button that adds a part, such as Option or Upgrade'; fl.appendChild(plW);
        }
    }
    if (ptLists.length > 1 && (pbChoices.length || sp.at)) {   // 1.6.0 Stands at (asked by the campaign build's session): a row reads the row of another list its choice stat names, as Row.<stat>.<name>
        var atA = sp.at && typeof sp.at === 'object' ? sp.at : null, atW = el('label', 'sys-check'), atS = el('select', 'sys-list-atfrom'), atO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; };
        atW.appendChild(document.createTextNode('Stands at a row of ')); atS.appendChild(atO('', 'None', !atA));
        ptLists.forEach(function(x) { if (x.id !== f.id) atS.appendChild(atO(x.id, x.label || x.key || 'List', !!atA && atA.from === x.id)); });
        atW.title = 'Each row stands at a row of the list you pick, such as an implant at a hit location: the row its choice stat names. Its rules then read that row\u2019s figures, and 0 where none is held';
        atW.appendChild(atS); fl.appendChild(atW);
        if (atA) {
            var abW = el('label', 'sys-check'), abS = el('select', 'sys-list-atby'), abC = typeof atA.by === 'string' ? atA.by.toLowerCase() : '', abHit = false;
            abW.appendChild(document.createTextNode('named by ')); pbChoices.forEach(function(s) { var on = !abHit && abC === s.key.toLowerCase(); if (on) abHit = true; abS.appendChild(atO(s.key, s.label || s.key, on)); });
            if (!abHit) abS.appendChild(atO(atA.by || '', (atA.by || 'Nothing') + ' (not a choice stat of this list)', true));
            abW.title = 'The choice stat whose value names the row it stands at, such as Location'; abW.appendChild(abS); fl.appendChild(abW);
        }
    }
    var lkSp = sp.look && typeof sp.look === 'object' ? sp.look : null;   // 1.6.0, backlog 206 (the owner, 2026-10-29, by prompt: "In the list's Look box"): Rows carry a look, then its Main part, Shade by and Shades
    fl.appendChild(checkLabel('sys-list-rowlook', !!lkSp, 'Rows carry a look', 'Each row may carry up to four colors, a finish and markings, overall and part by part, set by its owner or you at any time. They show as small swatches beside its name. A look never changes a figure'));
    if (lkSp) {
        var lmW = el('label', 'sys-check'), lmI = el('input', 'field sys-list-lkmain'); lmI.type = 'text'; lmI.value = typeof lkSp.main === 'string' ? lkSp.main : ''; lmI.placeholder = 'none'; lmW.appendChild(document.createTextNode('Main part ')); lmW.appendChild(lmI); lmW.title = 'A part category, such as Grip: a row with no look of its own shows the look it gives that part'; fl.appendChild(lmW);
        var lbW = el('label', 'sys-check'), lbS = el('select', 'sys-list-lkby'), lbO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }, lbC = typeof lkSp.by === 'string' ? lkSp.by.toLowerCase() : '', lbHit = false;
        lbW.appendChild(document.createTextNode('Shade by ')); lbS.appendChild(lbO('', 'None', !lbC));
        (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(st) { if (!st || typeof st.key !== 'string' || !st.key || st.set === true) return; var on = !lbHit && lbC === st.key.toLowerCase(); if (on) lbHit = true; lbS.appendChild(lbO(st.key, st.label || st.key, on)); });
        if (lbC && !lbHit) lbS.appendChild(lbO(lkSp.by, lkSp.by + ' (not a stat of this list)', true));
        lbW.title = 'A stat whose value names the material, such as Material: a row with no look shows that material\u2019s shade'; lbW.appendChild(lbS); fl.appendChild(lbW);
        if (lbC) { var lsW = el('label', 'sys-check'), lsT = el('textarea', 'field sys-list-lkshades'); lsT.rows = 3; lsT.spellcheck = false; lsT.value = (Array.isArray(lkSp.shades) ? lkSp.shades : []).map(function(x) { return x && typeof x === 'object' ? x.v + ' = ' + x.c : ''; }).filter(Boolean).join('\n'); lsT.placeholder = 'Steel = #8a8f99'; lsW.appendChild(document.createTextNode('Shades ')); lsW.appendChild(lsT); lsW.title = 'One line for each value of that stat: its name, an equals sign, then its color as #rrggbb'; fl.appendChild(lsW); }
    }
    fl.appendChild(checkLabel('sys-list-worklog', sp.workLog === true, 'Rows keep a work log', 'Each row keeps a log of the work done on it: a repair, a fit, a restyle or a build, its owner\u2019s own or hired. A fee is paid from the character\u2019s money where the sheet keeps money. You alone take a line off'));
    if (sp.on && (pbChoices.length || sp.sets)) { var stW = el('label', 'sys-check'), stS = el('select', 'sys-list-sets'), stO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }; stW.appendChild(document.createTextNode('Sets by ')); stS.appendChild(stO('', 'None', !sp.sets)); pbChoices.forEach(function(s) { stS.appendChild(stO(s.key, s.label || s.key, !!sp.sets && String(sp.sets).toLowerCase() === s.key.toLowerCase())); }); stW.title = 'Rows whose stat names the same set are switched on together: the sheet shows each set with All on and All off, and a rule can read whether a row\u2019s whole set is on'; stW.appendChild(stS); fl.appendChild(stW); }   // 1.6.0, backlog 180 R15
    if (pbChoices.length || sp.placeBy) { var pbW = el('label', 'sys-check'), pbS = el('select', 'sys-list-placeby'), pbO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }; pbW.appendChild(document.createTextNode('Places split by ')); pbS.appendChild(pbO('', 'Category', !sp.placeBy)); pbChoices.forEach(function(s) { pbS.appendChild(pbO(s.key, s.label || s.key, !!sp.placeBy && String(sp.placeBy).toLowerCase() === s.key.toLowerCase())); }); pbW.title = 'A list placed in several places shows each place\u2019s rows by their category, or by a choice stat\u2019s value: a body slot, a container'; pbW.appendChild(pbS); fl.appendChild(pbW); }
    if (pbChoices.length || sp.arc) {   // 1.6.2 (vehicles, fold (b), rebuilt): Arcs by a choice stat, each value naming an arc of the Combat tab
        var arcSp = sp.arc && typeof sp.arc === 'object' ? sp.arc : {}, arcW = el('label', 'sys-check'), arcS = el('select', 'sys-list-arcby'), arcO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }, arcHit = null;
        arcW.appendChild(document.createTextNode('Arcs by ')); arcS.appendChild(arcO('', 'Nothing', !arcSp.by));
        pbChoices.forEach(function(s) { if (s.vis === 'gm') return; var on = !!arcSp.by && String(arcSp.by).toLowerCase() === s.key.toLowerCase(); if (on) arcHit = s; arcS.appendChild(arcO(s.key, s.label || s.key, on)); });
        if (arcSp.by && !arcHit) arcS.appendChild(arcO(arcSp.by, arcSp.by + ' (not a choice stat of this list)', true));
        arcW.title = 'A stat whose values name the arcs a row can reach, such as Mount: Front, Rear, Turret. The arcs themselves are named on the Combat tab. A roll\u2019s needs then read whether its target stands in that row\u2019s arc'; arcW.appendChild(arcS); fl.appendChild(arcW);
        if (arcHit) {
            var arcBox = el('div', 'sys-arcs'), arcVals = arcHit.kind === 'pick' ? (arcHit.opts || []).map(function(o) { return o && typeof o.label === 'string' ? o.label : ''; }) : (arcHit.labels || []).slice(), arcNm = draft.combat && Array.isArray(draft.combat.arcs) ? draft.combat.arcs : [];
            var arcFind = function(nm) { var l = nm.toLowerCase(); return arcNm.filter(function(a) { return a && typeof a.key === 'string' && a.key.toLowerCase() === l; })[0] || arcNm.filter(function(a) { return a && typeof a.label === 'string' && a.label.toLowerCase() === l; })[0] || null; };
            arcBox.appendChild(el('div', 'sys-note', arcNm.length ? 'Each value reaches the arc of its own name, as the Combat tab sets them out under Arcs.' : 'Name the arcs on the Combat tab, under Arcs. Each value then reaches the arc of its own name.'));
            arcVals.forEach(function(nm) { if (!nm) return; var a = arcFind(nm); arcBox.appendChild(el('div', 'sys-note sys-arc', nm + ': ' + (!a ? 'names no arc yet, so it reaches nowhere.' : a.all ? 'all round.' : 'the ' + a.label + ' arc, from ' + a.f + ' to ' + a.t + '.'))); });
            fl.appendChild(arcBox);
        }
    }
    if (pbChoices.length || sp.groupBy) { var gbW = el('label', 'sys-check'), gbL = el('select', 'sys-list-groupby'), gbO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }; gbW.appendChild(document.createTextNode('Rows gather by ')); gbL.appendChild(gbO('', 'Nothing', !sp.groupBy)); pbChoices.forEach(function(s) { gbL.appendChild(gbO(s.key, s.label || s.key, !!sp.groupBy && String(sp.groupBy).toLowerCase() === s.key.toLowerCase())); }); gbW.title = 'Rows stand under a heading for each value of this stat, in its own order'; gbW.appendChild(gbL); fl.appendChild(gbW); }
    var sjbW = el('label', 'sys-check'), sjbI = el('input', 'field sys-list-subject'); sjbI.type = 'text'; sjbI.value = Array.isArray(sp.subject) ? sp.subject.join(', ') : ''; sjbI.placeholder = 'none'; sjbW.appendChild(document.createTextNode('Subjects ')); sjbW.appendChild(sjbI); sjbW.title = 'Short words a row may hold one of, split by commas, up to ' + LIMITS.subjects + '. A row picks its word on the sheet. Its rules can read which word a row holds, and add up, or take the highest or the lowest of, the rows that hold one'; fl.appendChild(sjbW);   // 1.6.0 Subjects
    var twW = el('label', 'sys-check'), twI = el('input', 'field sys-list-throwif'); twI.type = 'text'; twI.value = typeof sp.throwIf === 'string' ? sp.throwIf : ''; twI.placeholder = 'every row'; twI.spellcheck = false; twI.autocomplete = 'off'; twW.appendChild(document.createTextNode('Thrown only where ')); twW.appendChild(twI); twW.title = 'Which rows of this list may be thrown or placed. Read on each row, with no dice. Empty: every row with an area'; fl.appendChild(twW);   // 1.6.2
    if (typeof sp.throwIf === 'string' && sp.throwIf.trim()) { var tsW = el('label', 'sys-check'), tsI = el('input', 'field sys-list-throwsays'); tsI.type = 'text'; tsI.value = typeof sp.throwSays === 'string' ? sp.throwSays : ''; tsI.placeholder = 'This cannot be thrown now.'; tsW.appendChild(document.createTextNode('A refused throw says ')); tsW.appendChild(tsI); tsW.title = 'The words shown where a row cannot be thrown or placed'; fl.appendChild(tsW); }
    if (Array.isArray(sp.subject) && sp.subject.length) { var sjiW = el('label', 'sys-check'), sjiI = el('input', 'field sys-list-sjif'); sjiI.type = 'text'; sjiI.value = typeof sp.subjectIf === 'string' ? sp.subjectIf : ''; sjiI.placeholder = 'every row'; sjiI.spellcheck = false; sjiI.autocomplete = 'off'; sjiW.appendChild(document.createTextNode('Subject only where ')); sjiW.appendChild(sjiI); sjiW.title = 'A formula of the row with no dice, such as Row.Takes > 0. Only a row where it holds shows the menu, and any other reads subject 0. Empty: every row'; fl.appendChild(sjiW); }   // 1.6.0 Subject only where
    var tlPick = function(cls, cap, val, tip, words) { var w = el('label', 'sys-check'), s = el('select', cls), o0 = el('option', null, 'Nothing'); o0.value = ''; if (!val) o0.selected = true; s.appendChild(o0); (Array.isArray(words) ? words : []).forEach(function(x) { var o = el('option', null, x[1]); o.value = x[0]; if (val === x[0]) o.selected = true; s.appendChild(o); }); w.appendChild(document.createTextNode(cap + ' ')); w.appendChild(s); w.title = tip; fl.appendChild(w); }, tlSt = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.key; }).map(function(s) { return [s.key, s.label || s.key]; }), tlCl = (Array.isArray(sp.cols) ? sp.cols : []).filter(function(s) { return s && typeof s.key === 'string' && s.key; }).map(function(s) { return [s.key, s.label || s.key]; }), tlSp = sp.tiles && typeof sp.tiles === 'object' ? sp.tiles : {};   // 1.6.2 (body fold 3)
    tlPick('sys-list-tileside', 'Tile side from', tlSp.side || '', 'The stat that says a tile is on the left or the right, in its words or as 1 and 2', tlSt);
    tlPick('sys-list-tiletop', 'Tile figure', tlSp.top || '', 'A figure each tile shows, such as its aim penalty', tlSt.concat(tlCl));
    tlPick('sys-list-tiledraw', 'Tile drawing from', tlSp.draw || '', 'A stat whose words name the drawing a tile wears, such as Wing. With none, a word of the row\u2019s name is used, such as Left Arm', tlSt);
    tlPick('sys-list-tilemake', 'Tile make from', tlSp.make || '', 'A stat that says a part is organic, prosthetic or robotic. Its tile wears the mark for it', tlSt);
    if (typeof tileBoxesBox === 'function') fl.appendChild(tileBoxesBox(sp));
    if (typeof tileStatesBox === 'function') fl.appendChild(tileStatesBox(sp));
    var sdL = (typeof draft !== 'undefined' && draft && draft.fields || []).filter(function(x) { return x && x.kind === 'item-list' && x.id !== f.id; }), sdS = sp.stand && typeof sp.stand === 'object' ? sp.stand : null;   // 1.6.2 (body fold 2)
    if (sdL.length || sdS) {
        var sdW = el('label', 'sys-check'), sdF = el('select', 'sys-list-standfrom'), sdO = function(v, tx, sl) { var o = el('option', null, tx); o.value = v; if (sl) o.selected = true; return o; }; sdW.appendChild(document.createTextNode('Rows stand at a row of ')); sdF.appendChild(sdO('', 'No other list', !sdS));
        sdL.forEach(function(x) { sdF.appendChild(sdO(x.id, x.label || x.key || 'A list', !!sdS && sdS.from === x.id)); }); if (sdS && !sdL.some(function(x) { return x.id === sdS.from; })) sdF.appendChild(sdO(sdS.from, 'A list that is gone', true));
        sdW.title = 'Each row of this list stands at a row of that one, as armor stands on a part of the body. Formulas read the place it stands, and a row of that list reads what stands there'; sdW.appendChild(sdF); fl.appendChild(sdW);
        if (sdS) {
            var sdT = function(cls, cap, ph, val, tip) { var w = el('label', 'sys-check'), i = el('input', 'field ' + cls); i.type = 'text'; i.value = typeof val === 'string' ? val : ''; i.placeholder = ph; i.spellcheck = false; i.autocomplete = 'off'; w.appendChild(document.createTextNode(cap + ' ')); w.appendChild(i); w.title = tip; fl.appendChild(w); };
            sdT('sys-list-standfits', 'Fits where', 'it fits anywhere', sdS.fits, 'A row may go only where this holds. A player is refused where it does not, and you are told when you move one there yourself. A row with no place stands at the first place this allows');
            if (sdS.fits) sdT('sys-list-standsays', 'Refused with', 'It does not fit there.', sdS.fitSays, 'The words a player reads when it does not fit');
            sdT('sys-list-standreach', 'Reaches', 'only where it stands', sdS.reach, 'Other places a row covers from where it stands, as one pair of boots covers both feet');
            sdT('sys-list-standcounts', 'Counts where', 'always', sdS.counts, 'A placed row counts as worn only while this holds. It stays placed, and fills no place, when it does not');
            if (sdS.counts) sdT('sys-list-standoff', 'Otherwise it says', 'Not worn', sdS.offWord, 'What a placed row says while it does not count. It must be filled in while it says when a placed row counts');
            var sdF2 = (typeof draft !== 'undefined' && draft && draft.fields || []).filter(function(x) { return x && x.id === sdS.from; })[0], sdB = sdF2 && sdF2.list && sdF2.list.tiles && Array.isArray(sdF2.list.tiles.boxes) ? sdF2.list.tiles.boxes.filter(function(b) { return b && !b.strip && typeof b.key === 'string'; }) : []; if (sdB.length || sdS.box) tlPick('sys-list-standbox', 'Stands in', sdS.box || '', 'A box of the tile rather than its face, as a held weapon stands under a hand', sdB.map(function(b) { return [b.key, b.label || b.key]; }));
            fl.appendChild(checkLabel('sys-list-standpieces', sdS.pieces === true, 'Each row is one piece', 'Placing one of a stack splits it off first, so one boot or one glove stands alone'));
            var sdTh = typeof standThenBox === 'function' ? standThenBox(sdS, sdF2, sp) : null; if (sdTh) fl.appendChild(sdTh);
        }
    }
    fl.appendChild(checkLabel('sys-list-edge', sp.edge === true, 'Edge follows its state', 'A row\u2019s left edge takes the color of its strongest badge, or the accent while it is switched on. Its words always stand beside it'));   // 1.6.0 R16
    fl.appendChild(checkLabel('sys-list-menus', sp.menus === true, 'Choices as menus', 'A choice stat on a row, or in its boxes, is a menu for whoever may set that copy\u2019s stats: you, or its owner where players set their copies\u2019 stats. Off: its value name'));   // 1.6.0 R10
    fl.appendChild(checkLabel('sys-list-boxes', sp.boxes === true, 'Figures as boxes', 'A row\u2019s details show its figures as small boxes, each its label above its figure: every stat, the columns placed in the details, and Paid. Off: one line, as Acc 2 \u00b7 Wt 1'));   // 1.6.0 R3
    card.appendChild(fl);
    var lv = sp.lvl && typeof sp.lvl === 'object' ? sp.lvl : null, lr = el('div', 'sys-flags sys-list-lvl');
    lr.appendChild(checkLabel('sys-list-haslvl', !!lv, 'Rows have a level', 'Each row carries a level its owner sets: a skill\u2019s level, a power\u2019s rank, a language\u2019s fluency'));
    if (lv) {
        lr.appendChild(input('sys-list-lvllabel field', lv.label || '', 'The level\u2019s name on the sheet', 'Level'));
        lr.appendChild(numField('sys-list-lvlmin', lv.min, 'The lowest level (blank: none)', 'min'));
        if (typeof placeSel === 'function') lr.appendChild(placeSel('lvl', lv.place));   // 1.6.0 R2
        lr.appendChild(numField('sys-list-lvlmax', lv.max, 'The highest level (blank: none; with value names, the names set it)', 'max'));
        lr.appendChild(numField('sys-list-lvlstep', lv.step, 'The step between levels', 'step'));
        lr.appendChild(numField('sys-list-lvldef', lv.def, 'The level a new row starts at (an item\u2019s own Level in Items comes first); a row with no level of its own reads it', 'default'));
        lr.appendChild(input('sys-list-lvlnames field', (lv.labels || []).join(', '), 'Names for the levels from the minimum up, separated by commas (Broken, Accented, Fluent): the level becomes a dropdown', 'Value names (optional)'));
        lr.appendChild(checkLabel('sys-list-unheldon', typeof sp.unheld === 'string', 'Rolls unheld entries', 'The library picker gets Roll unheld: a roll of this list on an entry the character does not hold, at the Unheld level. You and the character\u2019s owner may roll it'));   // 1.6.0
        if (typeof sp.unheld === 'string') lr.appendChild(input('sys-list-unheldlvl field', sp.unheld, 'The level an entry nobody holds is rolled at: a formula of the entry\u2019s own names, such as Row.Dflt or -5. Row.has reads 0 there', 'Unheld level'));
        lr.appendChild(checkLabel('sys-list-lvlstart', lv.start === true, 'Keeps the starting level', 'Each new row remembers the level it starts at, and its rules can read it. A level changed in play can then be priced, as a drawback bought down. While a character is being made, the start follows the level'));   // 1.6.0
        if (typeof labeledSelect === 'function') lr.appendChild(labeledSelect('sys-list-lvltone', 'Level tags\u2019 color', [['', 'Plain'], ['good', 'Good (green)'], ['warn', 'Warning (amber)'], ['danger', 'Danger (red)'], ['accent', 'Accent'], ['primary', 'Primary']], typeof sp.lvlTone === 'string' ? sp.lvlTone : '', 'The color of the small tag beside each level in an entry\u2019s By level rows. A level line in the Library may set its own.'));   // 1.6.2 (180)
        lr.appendChild(checkLabel('sys-list-lvlentry', lv.entry === true, 'Levels from the entry', 'A row\u2019s level is a menu of its entry\u2019s own By level rows, each with its words beside it in a box: Level 2 (10 pts). An entry with none keeps the level box'));   // 1.6.0 R8
        if (!(Array.isArray(lv.labels) && lv.labels.length)) lr.appendChild(checkLabel('sys-list-lvlsplit', lv.split === true, 'Split in trades', 'A trade may give part of this figure, as money from a chip. A row of quantity 1 only'));   // 1.5.6 trading: a chip's stored money as its level
    }
    card.appendChild(lr);
    if (lv) lvlCapsBox(card, lv);   // 1.6.0 At most at a level
    var sw = sp.on && typeof sp.on === 'object' ? sp.on : null, orow = el('div', 'sys-flags sys-list-on');
    orow.appendChild(checkLabel('sys-list-hason', !!sw, 'Rows have a switch', 'Each row can be switched on and off: Readied, Equipped, Active, Stowed\u2026 In Layout a placement of the list can show only the rows switched on'));
    if (sw) {
        orow.appendChild(input('sys-list-onlabel field', sw.label || '', 'The switch\u2019s name on the sheet', 'On'));
        if (typeof swWordsBox === 'function') swWordsBox(orow, sw);   // 1.6.0 R6: its word while off and its icon
        if (typeof placeSel === 'function') orow.appendChild(placeSel('on', sw.place));   // 1.6.0 R2
        orow.appendChild(checkLabel('sys-list-ondef', sw.def === true, 'Starts on', 'A new row starts switched on; a row from before the list had its switch reads it until it is switched'));
        var oneOn = sw.one === true || (typeof sw.per === 'string' && !!sw.per) || (typeof sw.over === 'string' && !!sw.over);   // 1.6.0 O1: or where places meet   // 1.5.4 One at a time: switching a row on switches the others off, for the whole list or for each value of a stat
        orow.appendChild(checkLabel('sys-list-onone', oneOn, 'One at a time', 'Only one row is switched on at a time. Switching one on switches the others off. A row you keep on for a curse stays on. While a bound row is on, a player cannot switch another of its group on. A new row that would start on starts off while another is on, and so does a row whose stat moves it into such a group.'));
        if (oneOn) {
            var opS = el('select', 'sys-list-onper'); opS.title = 'One row on for the whole list, or one for each value of a stat, as one armor on for each location: rows whose stat reads the same value are one group';
            perOptions(opS, sp);
            orow.appendChild(opS);
            // 1.6.3 Layers under a list's places (the campaign build's ask of 2026-11-20, a thin garment worn under armor; Fulllion, by prompt: "One Layer
            // formula"): only where the switch goes by where rows sit. The tick shows the box, which starts empty and is said under the list until it is
            // filled (by the errors part, sysederr.js), since Row.covered and the rule both read it; unticking it, or picking another grouping, takes it away
            // (sysedtabs.js). The switch rule and Row.covered in systemcore.js read what Save keeps of it (the cleaners, cleancore.js)
            if (typeof sw.over === 'string' && sw.over) {
                orow.appendChild(checkLabel('sys-list-layered', typeof sw.layer === 'string', 'Worn in layers', 'Rows on different layers may be worn at the same place, as a shirt under armor. A higher layer covers a lower one, and rows on the same layer still take each other off. Row.covered reads the places a higher layer covers on a row'));
                if (typeof sw.layer === 'string') orow.appendChild(input('sys-list-layerof field', sw.layer, 'How high is each row worn? A formula of the row with no dice that gives a number, such as Row.Weight > 1, which puts a thin garment under anything heavier. A row whose layer cannot be worked out takes off every row it meets', 'How high it is worn, such as Row.Weight > 1'));
            }
        }
        orow.appendChild(input('sys-list-swshow field', typeof sw.showIf === 'string' ? sw.showIf : '', 'Shown only on rows where this is true, such as Row.Kind = 2. Row names are read. No dice. Elsewhere the row has no switch', 'Shown where (optional)'));   // 1.6.0
        orow.appendChild(input('sys-list-swneeds field', typeof sw.needs === 'string' ? sw.needs : '', 'A formula that must be true before a row is switched on, such as Row.Charge > 0. Row names are read. No dice. A player is refused while it does not hold. You may still switch it on, and are told', 'Needs to switch on'));   // 1.5.8
        orow.appendChild(input('sys-list-swwords field', typeof sw.needsText === 'string' ? sw.needsText : '', 'What a player is told when the switch is refused, in plain words. It must be filled in while it says when a row can be switched on, or a player is told only Not now', 'Its words'));
    }
    card.appendChild(orow);
    if (sw && typeof upkeepBox === 'function') upkeepBox(card, sp);   // 1.6.0 (CORE gap 13) (a suite's slice of the card holds no box)
    if (typeof onRemoveBox === 'function') onRemoveBox(card, sp);   // 1.6.0: When a row is taken off
    if (typeof buyOffBox === 'function') buyOffBox(card, sp);   // 1.6.4: Can be bought off
    if (sw && typeof switchChangesBox === 'function') { switchChangesBox(card, sp, 'switchOn'); switchChangesBox(card, sp, 'switchOff'); }   // 1.6.2 (167 B): When switched on, When switched off
    // Stage 6 F4c1: the list's stats — a number every item of it carries (Acc, Wt, Cost), ten at most — and the one that is its price
    var sts = Array.isArray(sp.stats) ? sp.stats : [], sb = el('div', 'sys-list-stats');
    sb.appendChild(el('span', 'sys-num-cap', 'Stats'));
    sts.forEach(function(s0, si) {
        var s = s0 && typeof s0 === 'object' ? s0 : {}, sr = el('div', 'sys-flags sys-list-stat'); sr.dataset.si = String(si);
        var ki = input('sys-list-statkey field', typeof s.key === 'string' ? s.key : '', 'The stat’s key: a letter, then letters, digits and _ (up to 24); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, min, cur, ranks, base; a function or reserved word such as floor, and, true). The key is the stat’s identity: renaming or removing it drops its values at Save. A column reads it as Row.key, any formula as List.key (the list\u2019s total)', 'Key'); ki.maxLength = 24; sr.appendChild(ki);
        sr.appendChild(input('sys-list-statlabel field', typeof s.label === 'string' ? s.label : '', 'The stat’s name on the sheet (blank: its key)', 'Label'));
        var kS = el('select', 'sys-list-statkind'); kS.title = 'Number: each item holds a number. Choice: each item picks one of the options you name, such as Iron or Bronze';   // Stage 6 F5a2
        [['', 'Number'], ['pick', 'Choice']].forEach(function(o) { var ko = el('option', null, o[1]); ko.value = o[0]; if ((s.kind === 'pick' ? 'pick' : '') === o[0]) ko.selected = true; kS.appendChild(ko); }); sr.appendChild(kS);
        if (s.kind === 'pick') {
            sr.appendChild(input('sys-list-statopts field', (Array.isArray(s.opts) ? s.opts : []).map(function(o) { return o && o.label === o.name ? o.label : (o ? o.label + ' = ' + o.name : ''); }).join(', '), 'The options, separated by commas, such as Iron, Bronze. To have an option stand for a figure of the sheet, write the option = the figure. An item stores the label, never the name. Rename a label here and Save, and what holds it follows', 'Options (Strength = ST, Dexterity = DX)'));
            var pdS = el('select', 'sys-list-statpdef'); pdS.title = 'What an item without its own choice reads'; var pd0 = el('option', null, 'No default'); pd0.value = ''; pdS.appendChild(pd0);
            (Array.isArray(s.opts) ? s.opts : []).forEach(function(o) { if (!o || typeof o.label !== 'string' || !o.label) return; var po = el('option', null, o.label); po.value = o.label; if (typeof s.def === 'string' && s.def.toLowerCase() === o.label.toLowerCase()) po.selected = true; pdS.appendChild(po); }); sr.appendChild(pdS);
        } else {
            sr.appendChild(numField('sys-list-statdef', typeof s.def === 'number' ? s.def : '', 'What an item without its own value reads (blank: 0)', 'default', 'any'));
            sr.appendChild(input('sys-list-statnames field', Array.isArray(s.labels) ? s.labels.join(', ') : '', 'Names for the values 0, 1, 2… separated by commas (E, A, H, VH): a row shows the name, Items a dropdown; the value stays a number', 'Value names (optional)'));
            var suI = input('sys-list-statunit field', typeof s.unit === 'string' ? s.unit : '', 'A unit after the figure (lb, yd). yd, ft, in, lb, mi and yd/s are imperial measures and m, cm, kg, km and m/s metric ones: a viewer set to the other system sees that figure', 'Unit'); suI.maxLength = LIMITS.unit; if (typeof unitWordsOn === 'function') unitWordsOn(suI); sr.appendChild(suI);   // 1.5.4
            if (typeof metricSel === 'function') { sr.appendChild(metricSel('sys-list-statmetric', s.unitShow)); sr.appendChild(numField('sys-list-statdec', typeof s.decMax === 'number' ? s.decMax : '', 'The most decimals a measure shows, 0 to 5, its zeros taken off. Blank: four under Instead or Bare, and as before Beside. An implant\u2019s 0.11438 lbs needs five', 'decimals', '1')); }   // 1.5.4: how a measure reads under Metric, and its most decimals
        }
        if (s.kind !== 'pick' && s.vis !== 'gm') sr.appendChild(checkLabel('sys-list-statsplit', s.split === true, 'Split in trades', 'A trade may give part of this figure, as money from a chip. A row of quantity 1 only'));   // 1.5.6 trading
        sr.appendChild(checkLabel('sys-list-statshow', s.show === true && s.hide !== true, 'On the row', 'Shown beside the name on each row (a column in a rich table); every stat that is not Hidden reads in the row’s details'));
        if (s.kind !== 'pick' && typeof toneRow === 'function') { var stR = toneRow(s); if (stR) sr.appendChild(stR); }   // 1.6.0 R5: a tone per value name
        sr.appendChild(checkLabel('sys-list-statgm', s.vis === 'gm', 'GM only', 'You set it on a row, and that row\u2019s players never get it. A formula that reads it stays on your side, and a critical range that names it is worked out on your machine'));   // 1.6.0
        if (s.kind === 'pick' || (Array.isArray(s.labels) && s.labels.length)) sr.appendChild(checkLabel('sys-list-statown', s.own === true, 'Player sets this', 'Its owner may set this on their own row, and nothing else of the row. Never on a GM-only or Hidden stat'));
        sr.appendChild(checkLabel('sys-list-stathide', s.hide === true, 'Hidden', 'A figure the row only works with, such as a cost per level. It is never shown on a row or in its details. Formulas still read it, and the row\u2019s pencil still shows it. It is no secret: use a GM-only list for that'));
        [['statup', '▲', 'Move up'], ['statdown', '▼', 'Move down'], ['statdel', '×', 'Remove this stat (Save drops its values)']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(sr, bb) : sr.appendChild(bb)); });
        if (typeof explainBox === 'function') sr.appendChild(explainBox(s));   // 1.6.2 (backlog 218 fold 3)
        sb.appendChild(sr);
    });
    var sadd = el('button', 'tool ghost sys-btn sys-list-statadd', '+ Stat'); sadd.dataset.act = 'statadd'; sadd.disabled = sts.length >= LIMITS.listStats; sadd.title = sadd.disabled ? 'At most ' + LIMITS.listStats + ' stats a list' : 'A number each item of this list carries (Acc, Wt, Cost), set on the item in Items'; sb.appendChild(sadd);
    if (sts.length) { var pr = el('label', 'sys-num sys-price-box'), ps = el('select', 'sys-list-price'); pr.appendChild(el('span', 'sys-num-cap', 'Price')); ps.title = 'A row records it as Paid when added: what one cost (yours to correct on the sheet)'; priceOptions(ps, sp); pr.appendChild(ps); sb.appendChild(pr); if (sp.price && Array.isArray(sp.cols) && sp.cols.length && typeof priceColOptions === 'function') { var pcb = el('label', 'sys-num sys-paycol-box'), pcs = el('select', 'sys-list-paycol'); pcb.appendChild(el('span', 'sys-num-cap', 'Price from')); pcs.title = 'The price a row records when added: the Price stat, or a column worked out for that row on that sheet, so a price can follow the character'; priceColOptions(pcs, sp); pcb.appendChild(pcs); sb.appendChild(pcb); }   /* 1.6.2, backlog 234 */  if (sp.price && typeof placeSel === 'function') sb.appendChild(placeSel('paid', sp.paidPlace)); if (sp.price && typeof curBoxes === 'function') curBoxes(sb, sp, true); if (sp.price && typeof rateBoxes === 'function') rateBoxes(sb, sp); if (sp.price && typeof condBox === 'function') condBox(sb, sp); if (sp.price && typeof draft !== 'undefined' && draft && draft.trading && draft.trading.hot === true && typeof hotBox === 'function') hotBox(sb, sp); }   // 1.6.0 R2: where Paid stands
    { var mb = el('label', 'sys-num sys-money-box'), msel = el('select', 'sys-list-money'); mb.appendChild(el('span', 'sys-num-cap', 'Holds money')); msel.title = 'Rows of this list are money: each row holds its level, as a chip holds its amount, or each piece is worth a stat, as a bar is worth its denomination. Buying and selling pay from and into these rows'; if (typeof moneyOptions === 'function') moneyOptions(msel, sp); mb.appendChild(msel); sb.appendChild(mb); if (typeof curBoxes === 'function') curBoxes(sb, sp); if (typeof moneyEditBox === 'function') moneyEditBox(sb, sp); }   // 1.5.6 the Money box
    card.appendChild(sb);
    if (typeof badgeBox === 'function') card.appendChild(badgeBox(sp));   // 1.6.0 R4: its row badges
    // Stage 6 F5a1: the list's columns — a formula worked out for each row (Row.lvl, Row.<stat>, another column), LIMITS.listCols at most — and the names it offers
    var cls = Array.isArray(sp.cols) ? sp.cols : [], cb2 = el('div', 'sys-list-cols');
    cb2.appendChild(el('span', 'sys-num-cap', 'Columns'));
    cls.forEach(function(c0, ci) {
        var cc = c0 && typeof c0 === 'object' ? c0 : {}, cr = el('div', 'sys-flags sys-list-col'); cr.dataset.ci = String(ci);
        var ckI = input('sys-list-colkey field', typeof cc.key === 'string' ? cc.key : '', 'The column\u2019s key, as a stat\u2019s: a letter, then letters, digits and _ (up to 24); not a stat\u2019s key of this list or a word formulas already use. Totals read it as List.key', 'Key'); ckI.maxLength = 24; cr.appendChild(ckI);
        cr.appendChild(input('sys-list-collabel field', typeof cc.label === 'string' ? cc.label : '', 'The column\u2019s name on the sheet (blank: its key)', 'Label'));
        var cfI = input('sys-list-colformula field', typeof cc.formula === 'string' ? cc.formula : '', 'Worked out for each row, no dice: Row.lvl, Row.qty, Row.on, Row.has, Row.paid, Row.<stat> and Row.<another column> read the row; any other name reads the character', 'Formula (Row.lvl * 2 + Row.Rel)'); cfI.maxLength = LIMITS.formula; cr.appendChild(cfI);
        var cuI = input('sys-list-colunit field', typeof cc.unit === 'string' ? cc.unit : '', 'A unit after the value (pts, lb). yd, ft, in, lb, mi and yd/s are imperial measures and m, cm, kg, km and m/s metric ones: a viewer set to the other system sees that figure', 'Unit'); cuI.maxLength = LIMITS.unit; if (typeof unitWordsOn === 'function') unitWordsOn(cuI); cr.appendChild(cuI);
        if (typeof metricSel === 'function') { cr.appendChild(metricSel('sys-list-colmetric', cc.unitShow)); cr.appendChild(numField('sys-list-coldec', typeof cc.decMax === 'number' ? cc.decMax : '', 'The most decimals a measure shows, 0 to 5, its zeros taken off. Blank: four under Instead or Bare, and as before Beside', 'decimals', '1')); }   // 1.5.4: how a measure reads under Metric, and its most decimals
        cr.appendChild(input('sys-list-colnames field', Array.isArray(cc.labels) ? cc.labels.join(', ') : '', 'Names for the values 0, 1, 2\u2026 separated by commas: the row shows the name, formulas read the number', 'Value names (optional)'));
        var cpI = input('sys-list-colplus field', Array.isArray(cc.plus) ? cc.plus.join(', ') : '', 'Number stats of this list that add to this column in a case of their own, by their keys, separated by commas. Where such a stat is not 0 the row shows the two added, with the stat\u2019s label: DR 15 (35 vs. energy)', 'With stats (optional)'); cpI.maxLength = 240; cr.appendChild(cpI);   // 1.5.4 With
        if (typeof placeSel === 'function') cr.appendChild(placeSel('col:' + ci, cc.hide === true ? 'hide' : cc.place));   // 1.6.0 R2: on the row, in the details, or Hidden (worked out for totals and other columns, not shown)
        cr.appendChild(checkLabel('sys-list-colfoot', cc.foot === true, 'Total', 'Its total shows under the list'));
        cr.appendChild(input('sys-list-colshow field', typeof cc.showIf === 'string' ? cc.showIf : '', 'On which rows it shows. Formulas read it on every row', 'Every row'));
        if (typeof toneRow === 'function') { var ctR = toneRow(cc); if (ctR) cr.appendChild(ctR); }   // 1.6.0 R5
        [['colup', '\u25b2', 'Move up'], ['coldown', '\u25bc', 'Move down'], ['coldel', '\u00d7', 'Remove this column']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(cr, bb) : cr.appendChild(bb)); });
        if (typeof explainBox === 'function') cr.appendChild(explainBox(cc));   // 1.6.2 (backlog 218 fold 3)
        cb2.appendChild(cr);
    });
    var cadd = el('button', 'tool ghost sys-btn sys-list-coladd', '+ Column'); cadd.dataset.act = 'coladd'; cadd.disabled = cls.length >= LIMITS.listCols; cadd.title = cadd.disabled ? 'At most ' + LIMITS.listCols + ' columns a list' : 'A formula worked out for each row (a skill\u2019s cost from its level, a weapon\u2019s to-hit)'; cb2.appendChild(cadd);
    // The core handbook session's ask (a), 2026-10-29: what Save drops of a list counter's key, as cleanListSpec reads it (statKey: never a word formulas
// already use, paid among them; never a stat's or a column's key of the list, nor another counter's). Words for each, as text
function ctKeySays(sp, F0) {
    var out = [], seen = Object.create(null); (Array.isArray(sp && sp.stats) ? sp.stats : []).concat(Array.isArray(sp && sp.cols) ? sp.cols : []).forEach(function(x) { if (x && typeof x.key === 'string') seen[x.key.toLowerCase()] = 'stat'; });
    (Array.isArray(sp && sp.counters) ? sp.counters : []).forEach(function(t, i) {
        var k = t && typeof t === 'object' && typeof t.key === 'string' ? t.key.trim() : ''; if (!k) { out.push('Counter ' + (i + 1) + ' needs a name: Save drops it.'); return; }
        // 1.6.3 (finding 28): a counter said by its name, and a short name Save cannot use said in words
        var cw = 'Counter \u201c' + (typeof t.label === 'string' && t.label.trim() ? t.label.trim() : k) + '\u201d';
        if (!statKey(k, F0)) { out.push(cw + ': its short name cannot be used. Type another name, or tick \u201cShort names\u201d at the foot and type one. Save drops it.'); return; }
        var l = k.toLowerCase(); if (seen[l]) { out.push(cw + ' has the same short name as ' + (seen[l] === 'stat' ? 'a stat or a column of this list' : 'another counter') + ': Save drops it.'); return; }
        seen[l] = 'counter';
    });
    return out;
}
// Stage 6 HUD R2: the list's counters — a whole number each row keeps (Charges, Hits), LIMITS.rowCounters at most: its key (Row.<key>), label, start and most
    var ctsL = Array.isArray(sp.counters) ? sp.counters : [];
    cb2.appendChild(el('span', 'sys-num-cap', 'Counters'));
    ctsL.forEach(function(t0, ti) {
        var tt = t0 && typeof t0 === 'object' ? t0 : {}, rw = el('div', 'sys-flags sys-list-ct'); rw.dataset.ti = String(ti);
        var tk = input('sys-list-ctkey field', typeof tt.key === 'string' ? tt.key : '', 'Its name in formulas: Row.<key> (Charges, Hits)', 'Key'); tk.maxLength = 24; rw.appendChild(tk);
        var tl = input('sys-list-ctlabel field', typeof tt.label === 'string' ? tt.label : '', 'What the row shows (blank: the key)', 'Label'); tl.maxLength = LIMITS.label; rw.appendChild(tl);
        if (typeof altBox === 'function') rw.appendChild(altBox(tt, 'The row shows this name for the counter while its test holds, such as Jammed on a jammed row. The first that holds wins.'));   // 1.6.0: its other names
        var tdf = el('input', 'field sys-list-ctdef'); tdf.type = 'number'; tdf.min = '0'; tdf.step = '1'; tdf.value = typeof tt.def === 'number' ? String(tt.def) : ''; tdf.placeholder = 'Starts at 0'; tdf.title = 'Where a new row starts'; rw.appendChild(tdf);
        var tmx = input('sys-list-ctmax field', typeof tt.max === 'string' ? tt.max : '', 'Its most, worked out for each row (no dice): 20, Row.Shots; empty: no most', 'Most (e.g. Row.Shots)'); tmx.maxLength = LIMITS.formula; rw.appendChild(tmx); if (typeof placeSel === 'function') rw.appendChild(placeSel('ct:' + ti, tt.place));   // 1.6.0 R2
        rw.appendChild(checkLabel('sys-list-ctroll', tt.roll === true, 'Set by rolls only', 'Rolls, actions and you set it. A player cannot change it by hand: their sheet shows it with no \u2212 or +'));   // 1.5.7
        rw.appendChild(checkLabel('sys-list-ctnewturn', tt.turn === true, 'Starts again each turn', 'At its character\u2019s turn start in a fight, it goes back to where a row starts, such as the attacks made this turn'));   // 1.6.0
        if (tt.turn === true) {   // 1.6.0 (the core's gap 14): Passes its count to, another counter of this list, at that turn start
            var tpo = [['', 'Passes its count to nothing']].concat(ctsL.filter(function(o2, oi) { return oi !== ti && o2 && typeof o2.key === 'string' && o2.key.trim(); }).map(function(o2) { return [o2.key.trim(), 'Passes its count to ' + (typeof o2.label === 'string' && o2.label.trim() ? o2.label.trim() : o2.key.trim())]; }));
            var tpc = typeof tt.pass === 'string' ? tt.pass : ''; if (tpc && !tpo.some(function(o) { return o[0] === tpc; })) tpo.push([tpc, 'Passes its count to ' + tpc + ' (no such counter)']);
            var tps = el('select', 'sys-list-ctpass'); tpo.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === tpc) op.selected = true; tps.appendChild(op); }); tps.value = tpc;
            tps.title = 'At the turn start, before it starts again, its count goes into this counter, such as Swung last turn. So what was done last turn lasts one turn more'; rw.appendChild(tps);
        }
        {   // 1.6.0 Counts by the game clock: down to 0 and its word, or up; Only while on and Starts again when off where the list has a switch
            var tmr = tt.timer && typeof tt.timer === 'object' && !Array.isArray(tt.timer) ? tt.timer : null;
            var tsel = function(cls, os, cur, title) { var sl = el('select', cls); os.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0] === cur) op.selected = true; sl.appendChild(op); }); sl.value = cur; sl.title = title; return sl; };   // values and text only, as Loads from's
            rw.appendChild(tsel('sys-list-cttimer', [['', 'Not by the clock'], ['down', 'Counts down by the clock'], ['up', 'Counts up by the clock']], tmr ? (tmr.dir === 'up' ? 'up' : 'down') : '', 'By the clock, the counter moves one step every so often of its character\u2019s own game time, a fight\u2019s rounds too: down to 0, where the row stays, or up. A player cannot change it by hand'));
            if (tmr) {
                var tpn = el('input', 'field sys-list-cttn'); tpn.type = 'number'; tpn.min = '1'; tpn.max = '1000'; tpn.step = '1'; tpn.placeholder = 'Every'; tpn.value = tmr.per && typeof tmr.per.n === 'number' ? String(tmr.per.n) : ''; tpn.title = 'One step every so many of the unit beside, 1 to 1000'; rw.appendChild(tpn);
                var tus2 = (typeof draft !== 'undefined' && draft && draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units : []).filter(function(u) { return u && typeof u.key === 'string' && u.key; });
                var tuo = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']].concat(tus2.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; })), tuc = tmr.per && typeof tmr.per.u === 'string' && tmr.per.u ? tmr.per.u : 'day'; if (!tuo.some(function(o) { return o[0] === tuc; })) tuo.push([tuc, tuc + ' (no such unit)']);
                rw.appendChild(tsel('sys-list-cttu', tuo, tuc, 'What it counts in: the calendar\u2019s minutes, hours, days and weeks, or one of your time units (the Combat tab\u2019s Turns box)'));
                if (sp.on && typeof sp.on === 'object') { rw.appendChild(checkLabel('sys-list-ctton', tmr.on === true, 'Only while on', 'It counts only while its row is switched on, and waits while it is off')); if (tmr.on === true) rw.appendChild(checkLabel('sys-list-cttreset', tmr.reset === true, 'Starts again when off', 'A row switched off goes back to where a new row starts')); }
                if (tmr.dir !== 'up') { var tew = input('sys-list-ctend field', typeof tmr.end === 'string' ? tmr.end : '', 'What the row shows once the count reaches 0, such as Spoiled. The row stays', 'At 0 it shows (e.g. Spoiled)'); tew.maxLength = LIMITS.label; rw.appendChild(tew); }
            }
        }
        [['ctup', '\u25b2', 'Move up'], ['ctdown', '\u25bc', 'Move down'], ['ctdel', '\u00d7', 'Remove this counter']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        cb2.appendChild(rw);
    });
    var tadd = el('button', 'tool ghost sys-btn sys-list-ctadd', '+ Counter'); tadd.dataset.act = 'ctadd'; tadd.disabled = ctsL.length >= LIMITS.rowCounters; tadd.title = tadd.disabled ? 'At most ' + LIMITS.rowCounters + ' counters a list' : 'A number each row keeps and shows with \u2212 and + (a weapon\u2019s Charges, its Hits)'; cb2.appendChild(tadd);
    {   // 1.5.8 Loads from: a row of this list loads one unit of a row of another list (a gun a magazine), and a counter holds what it has left
        var ldS = sp.load && typeof sp.load === 'object' ? sp.load : null, lrw = el('div', 'sys-flags sys-list-load'), lsel = el('select', 'sys-list-loadfrom');
        lrw.appendChild(el('span', 'sys-num-cap', 'Loads from'));
        lsel.title = 'A row of this list loads one unit of a row of another list, as a gun loads a magazine. What the unit holds, its level, goes into a counter of this list. A swap or an unload puts it back with what is left';
        var lo0 = el('option', null, 'Nothing'); lo0.value = ''; lsel.appendChild(lo0);
        (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (!x || x.kind !== 'item-list' || x.id === f.id) return; var o = el('option', null, (x.label || x.key || x.id) + (x.list && x.list.lvl ? '' : ' (its rows have no level)')); o.value = x.id; if (ldS && ldS.from === x.id) o.selected = true; lsel.appendChild(o); });
        lrw.appendChild(lsel);
        if (ldS) {
            var csel = el('select', 'sys-list-loadct'); csel.title = 'The counter that holds what the loaded row has left. Its most may read the loaded row\u2019s full level';
            var co0 = el('option', null, 'Pick a counter'); co0.value = ''; csel.appendChild(co0);
            ctsL.forEach(function(x) { if (!x || typeof x.key !== 'string' || !x.key) return; var o = el('option', null, (x.label || x.key) + ' (' + x.key + ')'); o.value = x.key; if (ldS.ct === x.key) o.selected = true; csel.appendChild(o); });
            lrw.appendChild(csel);
            var jbs = (Array.isArray(sp.rolls) ? sp.rolls : []).filter(function(r) { return r && r.job && typeof r.job.ct === 'string'; });   // 1.6.2 Load takes a job: a job of this list's that makes the load at its last press
            if (jbs.length || ldS.job) { var jsel = el('select', 'sys-list-loadjob'); jsel.title = 'A job of this list. A Load picked then waits, and the job\u2019s last press makes it, as a reload that takes turns'; var jo0 = el('option', null, 'Loads at once'); jo0.value = ''; jsel.appendChild(jo0); jbs.forEach(function(r) { var o = el('option', null, 'Takes the job ' + String(r.label || 'Job').split('{')[0].trim()); o.value = r.job.ct; if (ldS.job === r.job.ct) o.selected = true; jsel.appendChild(o); }); if (ldS.job && !jbs.some(function(r) { return r.job.ct === ldS.job; })) { var jg = el('option', null, 'A job that is gone'); jg.value = ldS.job; jg.selected = true; jsel.appendChild(jg); } lrw.appendChild(jsel); }
            lrw.appendChild(input('sys-list-loadcats field', Array.isArray(ldS.cats) ? ldS.cats.join(', ') : '', 'The categories of that list a row may load, separated by commas. Blank: any of its rows', 'Categories it takes (blank: any)'));
            var tkLi = input('sys-list-ldtake field', typeof ldS.takeIf === 'string' ? ldS.takeIf : '', 'Which rows of that list it may take, each read with its own figures. Blank: every row it fits. A row that does not pass is not offered', 'Takes rows where (blank: every row)'); tkLi.dataset.rl = ldS.from || ''; lrw.appendChild(tkLi);   // 1.6.2
            lrw.appendChild(input('sys-list-loadneeds field', typeof ldS.needs === 'string' ? ldS.needs : '', 'What a row must meet to load, read on the row itself, with no dice. Blank: every row. A row that does not meet it shows no Load', 'Loads only where (blank: every row)'));
            lrw.appendChild(statPick('sys-list-loadby', sp, ldS.by, 'A stat of this list. A row loads only what reads the same figure in the stat beside, as a gun takes its own kind of magazine. None: anything the categories take', 'Matched by: this list\u2019s stat'));
            lrw.appendChild(statPick('sys-list-loadto', statListOf(ldS.from), ldS.to, 'The stat of the list it loads from that must read the same figure', 'and that list\u2019s stat'));
            var ldW = input('sys-list-loadneedstext field', typeof ldS.needsText === 'string' ? ldS.needsText : '', 'What a player is told when a load is refused, in plain words. It must be filled in while it says when a row can load, or a player is told only Not now', 'Its words'); ldW.maxLength = LIMITS.needsWords; lrw.appendChild(ldW);   // 1.6.3: required beside its needs
        }
        cb2.appendChild(lrw);
    }
    {   // 1.6.0 Feeds: up to FEEDS_MAX things a row loads apart, each with a counter of its own, that a roll's Then spends together
        var fdsL = Array.isArray(sp.feeds) ? sp.feeds : [], fdsM = typeof FEEDS_MAX === 'number' ? FEEDS_MAX : 20;
        fdsL.forEach(function(fd0, fi) {
            var fdS = fd0 && typeof fd0 === 'object' ? fd0 : {}, frw = el('div', 'sys-flags sys-list-feed'), fsel = el('select', 'sys-list-feedfrom'), fct = el('select', 'sys-list-feedct'); frw.dataset.fi = String(fi);
            frw.appendChild(el('span', 'sys-num-cap', 'Feed ' + (fi + 1)));
            // 1.6.3 (finding 17): a feed's short name is made for it as it is added (Feed1, Feed2), and stands out of sight with the other short names
            // until Short names is ticked at the foot. A rule names what the feed holds by it, and a form offers it there by the feed's place
            var fkI = input('sys-list-feedkey field', typeof fdS.key === 'string' ? fdS.key : '', 'This feed\u2019s short name, made for you as it was added. A rule names what the feed holds by it', 'Short name'); fkI.maxLength = 24; frw.appendChild(fkI);
            fsel.title = 'The list it loads from. What a unit holds, its level, goes into the counter beside. Changing this feed moves nothing of another';
            var fo0 = el('option', null, 'Loads from\u2026'); fo0.value = ''; fsel.appendChild(fo0);
            (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (!x || x.kind !== 'item-list' || x.id === f.id) return; var o = el('option', null, (x.label || x.key || x.id) + (x.list && x.list.lvl ? '' : ' (its rows have no level)')); o.value = x.id; if (fdS.from === x.id) o.selected = true; fsel.appendChild(o); });   // 1.6.2: said here, beside the feed, as well as in the card's line
            frw.appendChild(fsel);
            fct.title = 'The counter that holds what this feed has left, one of its own. Its most is how much the feed holds, so Add knows the room';
            var fc0 = el('option', null, 'Pick a counter'); fc0.value = ''; fct.appendChild(fc0);
            ctsL.forEach(function(x) { if (!x || typeof x.key !== 'string' || !x.key) return; var o = el('option', null, x.label || x.key); o.value = x.key; if (fdS.ct === x.key) o.selected = true; fct.appendChild(o); });   // 1.6.3 (finding 17): by its name alone
            frw.appendChild(fct);
            frw.appendChild(input('sys-list-feedturns field', typeof fdS.turns === 'string' ? fdS.turns : '', 'The turns a change of this feed takes, worked out on the row with no dice. The Load menu says it, and a rule can read it. Blank: says nothing', 'Turns to change (blank: none said)'));
            frw.appendChild(input('sys-list-feedif field', typeof fdS['if'] === 'string' ? fdS['if'] : '', 'A formula of the row\u2019s own names, no dice. On a row where it does not hold there is no chip, a shot takes nothing from this feed, and an empty one stops nothing. What was loaded still comes out. Blank: every row', 'Only where (blank: every row)'));
            frw.appendChild(input('sys-list-feedcats field', Array.isArray(fdS.cats) ? fdS.cats.join(', ') : '', 'The categories of that list this feed takes, separated by commas. Blank: any of its rows', 'Categories it takes (blank: any)'));
            frw.appendChild(statPick('sys-list-feedby', sp, fdS.by, 'A stat of this list. A row loads only what reads the same figure in the stat beside. None: anything the categories take', 'Matched by: this list\u2019s stat'));
            frw.appendChild(statPick('sys-list-feedto', statListOf(fdS.from), fdS.to, 'The stat of the list it loads from that must read the same figure', 'and that list\u2019s stat'));
            var fdB = el('button', 'tool ghost sys-btn', '\u00d7'); fdB.dataset.act = 'feeddel'; fdB.title = 'Remove this feed'; frw.appendChild(fdB);
            cb2.appendChild(frw);
        });
        var fdA = el('button', 'tool ghost sys-btn sys-list-feedadd', '+ Feed'); fdA.dataset.act = 'feedadd'; fdA.disabled = fdsL.length >= fdsM; fdA.title = fdA.disabled ? 'At most ' + fdsM + ' feeds a list' : 'Something a row loads apart from its other load, with a counter of its own, as a weapon takes a cell and a clip. A roll\u2019s Then can take a shot from every feed, and any feed at 0 stops the shot'; cb2.appendChild(fdA);
    }
    {   // 1.5.9 Chambers from: a row of this list holds rounds in a chamber, one unit at a time, from an item list (this one too); a roll's Then fires them
        var chS = sp.chamber && typeof sp.chamber === 'object' ? sp.chamber : null, crw = el('div', 'sys-flags sys-list-chamber'), csl = el('select', 'sys-list-chamberfrom');
        crw.appendChild(el('span', 'sys-num-cap', 'Chambers from'));
        csl.title = 'A row of this list holds rounds in a chamber, one unit at a time, from an item list, this one too, as a launcher holds its grenades. A roll\u2019s Then can fire the next one. Its rules can read how many are in, the next one and the one last fired';
        var cso = el('option', null, 'Nothing'); cso.value = ''; csl.appendChild(cso);
        (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(x) { if (!x || x.kind !== 'item-list') return; var o = el('option', null, (x.label || x.key || x.id) + (x.id === f.id ? ' (this list)' : '')); o.value = x.id; if (chS && chS.from === x.id) o.selected = true; csl.appendChild(o); });
        crw.appendChild(csl);
        if (chS) {
            var hsl = el('select', 'sys-list-chambercap'); hsl.title = 'How many rounds a row holds at once';
            var capC = typeof chS.cap === 'number' && isFinite(chS.cap) ? Math.max(1, Math.min(CHAMBER_CAP || 320, Math.round(chS.cap))) : 1;
            for (var hc = 1; hc <= (CHAMBER_CAP || 320); hc++) { var ho = el('option', null, 'Holds ' + hc); ho.value = String(hc); if (capC === hc) ho.selected = true; hsl.appendChild(ho); }
            crw.appendChild(hsl);
            var hbs = el('select', 'sys-list-chamberholdsby'), hbN = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick'; }), hbC = typeof chS.capBy === 'string' ? chS.capBy.toLowerCase() : '', hbHit = false;   // the review of fold 2: a row may hold as many as one of its stats reads
            hbs.title = 'Where the row\u2019s figure in this stat is 1 or more, the row holds that many, ' + (CHAMBER_CAP || 320) + ' at most, as a mortar holds four. Else it holds as set';
            var hbo = el('option', null, 'Every row holds as set'); hbo.value = ''; hbs.appendChild(hbo);
            hbN.forEach(function(s) { var o = el('option', null, 'Or as many as the row\u2019s ' + (s.label || s.key)); o.value = s.key; if (!hbHit && hbC && s.key.toLowerCase() === hbC) { o.selected = true; hbHit = true; } hbs.appendChild(o); });
            if (hbC && !hbHit) { var hbx = el('option', null, chS.capBy + ' (not a number stat of this list)'); hbx.value = chS.capBy; hbx.selected = true; hbs.appendChild(hbx); }
            crw.appendChild(hbs);
            crw.appendChild(input('sys-list-chambercats field', Array.isArray(chS.cats) ? chS.cats.join(', ') : '', 'The categories of that list a row may chamber, separated by commas. Blank: any of its rows', 'Categories it takes (blank: any)'));
            crw.appendChild(input('sys-list-chamberreach field', typeof chS.reach === 'string' ? chS.reach : '', 'The yards a round that flies straight goes, worked out on the row itself with no dice, such as its longest range. Blank: to the map\u2019s edge', 'Flies at most (blank: to the map\u2019s edge)'));   // 1.5.9 (es)
            var tkCi = input('sys-list-chtake field', typeof chS.takeIf === 'string' ? chS.takeIf : '', 'Which rows of that list it may take a round from, each read with its own figures. Blank: every row it fits. A row that does not pass is not offered', 'Takes rows where (blank: every row)'); tkCi.dataset.rl = chS.from || ''; crw.appendChild(tkCi);   // 1.6.2
            crw.appendChild(input('sys-list-chamberneeds field', typeof chS.needs === 'string' ? chS.needs : '', 'What a row must meet to chamber, read on the row itself, with no dice. Blank: every row. A row that does not meet it shows no chamber, and one that still holds rounds can only unchamber them', 'Chambers only where (blank: every row)'));
            crw.appendChild(statPick('sys-list-chamberby', sp, chS.by, 'A stat of this list. A row chambers only what reads the same figure in the stat beside, as a launcher takes only its own kind of round. None: anything the categories take', 'Matched by: this list\u2019s stat'));
            crw.appendChild(statPick('sys-list-chamberto', statListOf(chS.from), chS.to, 'The stat of the round\u2019s list that must read the same figure', 'and that list\u2019s stat'));
            crw.appendChild(input('sys-list-chamberlabel field', typeof chS.label === 'string' ? chS.label : '', 'The word on the button that chambers a round. Blank: Chamber', 'Button word (blank: Chamber)'));
            var chW = input('sys-list-chamberneedstext field', typeof chS.needsText === 'string' ? chS.needsText : '', 'What a player is told when a chamber is refused, in plain words. It must be filled in while it says when a row can chamber a round, or a player is told only Not now', 'Its words'); chW.maxLength = LIMITS.needsWords; crw.appendChild(chW);   // 1.6.3: required beside its needs
        }
        cb2.appendChild(crw);
    }
    if (typeof onceBox === 'function') onceBox(cb2, sp);   // 1.5.8 Counted once
    // Stage 6 F5b: the list's rolls — a button on each row, the formula rolled with the row's names (dice allowed), LIMITS.rowRolls at most
    var rls = Array.isArray(sp.rolls) ? sp.rolls : [];
    cb2.appendChild(el('span', 'sys-num-cap', 'Rolls'));
    rls.forEach(function(r0, ri) {
        var rr = r0 && typeof r0 === 'object' ? r0 : {}, rw = el('div', 'sys-flags sys-list-roll'); rw.dataset.ri = String(ri);
        var rl = input('sys-list-rolllabel field', typeof rr.label === 'string' ? rr.label : '', 'The button\u2019s name on each row (Attack, Check)', 'Label'); rl.maxLength = LIMITS.label; rw.appendChild(rl);
        var rApply = Array.isArray(rr.apply), rk = el('select', 'sys-list-rollkind'); rk.title = 'Roll: dice for the row. Apply: moves pools or numbers by an amount the row works out (such as a cost taken off a pool)';   // Stage 6 HUD H7b
        [['roll', 'Roll'], ['apply', 'Apply']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; rk.appendChild(op); }); rk.value = rApply ? 'apply' : 'roll'; rw.appendChild(rk); if (typeof placeSel === 'function') rw.appendChild(placeSel('roll:' + ri, rr.place));   // 1.6.0 R2
        var actsL = Array.isArray(acts) ? acts : [];   // turn-based combat T1: what one press costs
        if (actsL.length || rr.cost) { var rco = el('select', 'sys-list-rollcost'); rco.title = 'What one press costs in turn-based combat: one of the actions a turn allows'; var rcOpts = [['', 'Costs nothing']].concat(actsL.map(function(a) { return [a.key, 'Costs: ' + (a.label || a.key)]; })); if (rr.cost && !actsL.some(function(a) { return a.key.toLowerCase() === String(rr.cost).toLowerCase(); })) rcOpts.push([rr.cost, 'Costs: ' + rr.cost + ' (no such action)']); rcOpts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; rco.appendChild(op); }); rco.value = rr.cost || ''; rw.appendChild(rco); if (rr.cost) rw.appendChild(costHow('sys-list-costhow', rr.costN)); }
        if (typeof moveCostBox === 'function') rw.appendChild(moveCostBox(rr));   // 1.6.4 (gap #22): what it costs of the turn's move
        if (typeof draft !== 'undefined' && draft && draft.combat && draft.combat.initiative && draft.combat.initiative.clock) rw.appendChild(clockBox('sys-list-clockn', rr.clockN));
        var rnr = el('select', 'sys-list-near'); rnr.title = 'Applies to: whom its changes go on. With an adjacent character, a press asks who it is for when someone stands next to you, your target first. With their target, it asks whether it is for your target, at any range, or for you. A row\u2019s own counters stay with the user. Its rules can ask whether it is used on yourself or on another'; [['', 'Applies to the user'], ['near', 'Applies to the user or an adjacent character'], ['target', 'Applies to the user or their target']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; rnr.appendChild(op); }); rnr.value = (rr.to === 'near' || rr.to === 'target') ? rr.to : ''; rw.appendChild(rnr);   // 1.5.9 (book es/et plan, section 3): Applies to
        if (!rApply) rw.appendChild(checkLabel('sys-list-rsist', rr.resist === true, 'Resists an attempt', 'This roll answers an attempt made on its character. Another roll\u2019s Or resisted by can name it, and the target\u2019s card then has a button for each row that holds it. It can read how far the attempt succeeded, to be that much harder'));   // 1.6.0
        if (!rApply && rr.resist === true) rw.appendChild(checkLabel('sys-list-thru', rr.thru === true, 'Takes the blow on this row', 'A parry or a block with this row: where it resists the attempt, the attacker\u2019s damage meets this row first. Its listed Dur stops that much and the rest goes on. The row\u2019s list must be a weapon list of the Combat tab\u2019s Taking damage box'));   // 1.6.2
        rw.appendChild(checkLabel('sys-list-anytime', rr.free === true, 'Any time', 'Called for off a character\u2019s turn, whatever Off a character\u2019s turn says, as a check you ask for. A roll that resists, the initiative roll, a roll due at a turn or a round and a roll from a card need no tick'));   // 1.6.0
        if (!rApply && typeof resistBySel === 'function') rw.appendChild(resistBySel('sys-list-rsby', rr.resistBy, typeof draft !== 'undefined' ? draft : null));   // 1.6.0 (B2)
        if (!rApply && rr.dmg !== true && !rr.area && typeof landDmgSel === 'function') rw.appendChild(landDmgSel('sys-list-lnddmg', rr.landDmg, (draft.rolls || []).filter(function(x) { return x && x.dmg === true && !Array.isArray(x.apply); }).map(function(x) { return [x.id, x.label || 'Roll']; }), (Array.isArray(sp.rolls) ? sp.rolls : []).map(function(x, xi) { return x && x.dmg === true && x !== rr && !Array.isArray(x.apply) ? [String(xi), x.label || 'Roll'] : null; }).filter(Boolean)));   // 1.6.3 (defense fold 1): Its damage
        if (!rApply && typeof areaBox === 'function') rw.appendChild(areaBox(rr, (Array.isArray(sp.rolls) ? sp.rolls : []).map(function(x, xi) { return x && x.dmg === true && x !== rr ? [String(xi), x.label || 'Roll'] : null; }).filter(Boolean)));   // 1.6.0: a line it hits
        if (!rApply && rr.resistBy && typeof resistOrBox === 'function') rw.appendChild(resistOrBox('sys-list-rsor', rr.resistBy, rr.resistOr, typeof draft !== 'undefined' ? draft : null));   // 1.6.0 (the core's gap 5)
        if (!rApply && rr.resistBy) rw.appendChild(checkLabel('sys-list-rsnocrit', rr.noResistOnCrit === true, 'Not resisted on a critical', 'A critical success sends its target nothing to resist. Leave it off where a critical is resisted as any success is'));   // 1.6.0
        if (!rApply && rr.resistBy && typeof kindSel === 'function') rw.appendChild(kindSel(rr, sp));   // 1.6.0 An attempt's kind
        if (!rApply && rr.resistBy && typeof input === 'function') { var atI = input('sys-list-rsatype field', typeof rr.attemptType === 'string' ? rr.attemptType : '', 'What type of attack it is, worked out from this row as it is made, such as a column that reads its parts. Rolls that resist it can read that type, none where it gives no number', 'Attempt type'); atI.maxLength = LIMITS.formula; rw.appendChild(atI); }   // 1.6.2 (the CORE session)
        rw.appendChild(checkLabel('sys-list-gmonly', rr.gm === true, 'GM only', 'Only you press it. Players never see its button, and the table refuses theirs'));   // 1.6.0
        var rsI = input('sys-list-rollshow field', typeof rr.showIf === 'string' ? rr.showIf : '', 'Its button stands only on rows where this holds, and nowhere else. It says nothing where it is left out. Empty: on every row', 'Shown on rows where (optional)'); rsI.maxLength = LIMITS.formula;   // 1.6.0; 1.6.2 (the owner, by prompt: "When a roll is offered"): it stands beside Needs, in one place for when the roll is offered
        if (typeof altBox === 'function') rw.appendChild(altBox(rr, 'Its button reads this name on rows where its test holds, such as Fix malfunction on a jammed row. The first that holds wins.'));   // 1.6.0: its other names
        if (typeof rollExtras === 'function') rollExtras(rw, rr, sp, rApply);   // 1.6.0: its icon, and R7 the figure it shows
        if (typeof window !== 'undefined' && window.wpSoundOn && window.wpSoundOnCore) { var snL = window.wpSoundOn.btn({ k: 'list', f: f.id, i: ri, l: window.wpSoundOnCore.labelOf(rr) }, rApply ? 'A sound on this action' : 'A sound on this roll. The list under the Sound panel can narrow it to one kind of row'); if (snL) rw.appendChild(snL); }   // 1.6.2
        if (rApply) { cb2.appendChild(rw); var ndA = el('div', 'sys-flags sys-list-needsrow'); ndA.dataset.ri = String(ri); ndA.appendChild(el('span', 'sys-num-cap sys-offered', 'When it can be used')); ndA.appendChild(rsI); var ndAI = input('sys-list-needs field', typeof rr.needs === 'string' ? rr.needs : '', 'Pressed only while this holds for the row. Empty: always', 'When it can be used'); ndAI.maxLength = LIMITS.formula; ndA.appendChild(ndAI); var ndAT = input('sys-list-needstext field', typeof rr.needsText === 'string' ? rr.needsText : '', 'What the grayed button says when it cannot be pressed. It must be filled in while it says when it can be used, or a player is told only Not now', 'Words for the grayed button'); ndAT.maxLength = LIMITS.needsWords; ndA.appendChild(ndAT); ndA.appendChild(checkLabel('sys-list-hideoff', rr.hideOff === true, 'Hidden until it can be used', 'The button stands on the row only while its needs hold. Off: it stays there, grayed out. Only beside needs')); cb2.appendChild(ndA); if (typeof whyBox === 'function') cb2.appendChild(whyBox(rr, 'list')); var lxA = typeof listCrossRow === 'function' ? listCrossRow(rr, ri, sp.counters) : null; if (lxA) cb2.appendChild(lxA); if (typeof callsBox === 'function') cb2.appendChild(callsBox(rr, typeof draft !== 'undefined' ? draft : null, true)); listApplyEditor(cb2, rr, ri, 'apply', sp, targets, rw); return; }   // 1.6.0: when a row's counter crosses a step
        if (rr.dmg !== true) { var bsl = el('select', 'sys-list-burst'); bsl.title = 'A burst: Opens a burst is the attack, whose Then fires the shots. A burst\u2019s extra dice is the roll that counts the extra hits, and it rolls once after an attack that hit. Its rules can read the hits landed'; [['', 'No burst'], ['attack', 'Opens a burst'], ['extra', 'A burst\u2019s extra dice']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; bsl.appendChild(op); }); bsl.value = rr.burst === 'attack' || rr.burst === 'extra' ? rr.burst : ''; rw.appendChild(bsl); var bhL = el('label', 'sys-hover'), bhC = el('input'); bhC.type = 'checkbox'; bhC.className = 'sys-list-blasthit'; bhC.checked = rr.blastHit === true; bhL.appendChild(bhC); bhL.appendChild(el('span', null, ' Bursts at its target')); bhL.title = 'On a hit the row\u2019s own blast goes off at its target, and on a miss it lands as its area\u2019s On a miss, launched says. Its blast does the damage, so it is never ticked beside Damage'; rw.appendChild(bhL); }   // 1.6.0 A burst; 1.6.2 (the CORE session): Bursts at its target
        var ltD = typeof draft !== 'undefined' && draft && Array.isArray(draft.tests) ? draft.tests : [];
        if (!rApply && (ltD.length || rr.test)) { var ltT = ltD.filter(function(x) { return x && typeof x.key === 'string'; }), ltF = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s.key === 'string' && s.kind !== 'pick' && s.kind !== 'text'; }).map(function(s) { return [s.key, s.label || 'A stat']; }).concat((Array.isArray(sp.cols) ? sp.cols : []).filter(function(c0) { return c0 && typeof c0.key === 'string'; }).map(function(c0) { return [c0.key, c0.label || 'A column']; }));   // 1.6.2 (backlog 59): it rolls one of the system's tests with a figure of the row
            var rtSel = select('sys-list-rolltest', [['', 'Its own formula']].concat(ltT.map(function(x) { return [x.key, x.label || 'A test']; })), rr.test || '', 'Which of the system\u2019s tests this roll makes, from the Rules tab, or a formula of its own'); rtSel.dataset.ri = String(ri); rw.appendChild(capInline(rtSel, 'Rolls by: '));   // 1.6.3: data-ri, the roll's place, so a fault under the list lands on this very box (sysui.js boxIn)
            if (rr.test) { var roSel = select('sys-list-rollof', [['', ltF.length ? 'Pick the row\u2019s figure' : 'Give the list a number stat first']].concat(ltF), rr.of || '', 'The figure of the row the test is made with'); roSel.dataset.ri = String(ri); rw.appendChild(capInline(roSel, 'with ')); } }
        var rf = input('sys-list-rollformula field', typeof rr.formula === 'string' ? rr.formula : '', 'Rolled for the row: dice allowed; Row.lvl, Row.<stat>, Row.<column> read the row, any other name the character (3d6 <= Row.Skill, d20 + Row.Hit)', 'Formula (d20 + Row.Hit)'); rf.maxLength = LIMITS.formula; rw.appendChild(rf);
        rw.appendChild(checkLabel('sys-list-dmg', rr.dmg === true, 'Damage', 'A damage roll: its card in Table Chat takes the damage color, a larger total and a damage tag'));   // chat cards (owner 2026-09-27)
        if (rr.dmg === true) { var htL = input('sys-list-rollhits field', typeof rr.hits === 'string' ? rr.hits : '', 'Hits it rolls for: how many times this damage rolls, on one card with one Apply, such as Row.bursthits. Each hit is its own blow at the same location, and each reads its own round as Row.fired. No dice. Empty: once', 'Hits it rolls for'); htL.maxLength = LIMITS.formula; rw.appendChild(htL); }   // 1.6.0 A burst
        if (rr.dmg === true) { var mjL = input('sys-list-rollmjif field', typeof rr.dmgMajorIf === 'string' ? rr.dmgMajorIf : '', 'A Major Wound where: Apply to target on its card lands the blow as a Major Wound while this formula is true, read with the row\u2019s names (Row.Edge >= 3) and the character\u2019s. No dice. Always a Major Wound wins', 'A Major Wound where'); mjL.maxLength = LIMITS.formula; rw.appendChild(mjL); }   // 1.6.0
        if (rr.dmg === true) rw.appendChild(checkLabel('sys-list-mjdmg', rr.dmgMajor === true, 'Always a Major Wound', 'Apply to target on its card lands the blow as a Major Wound whatever its size, as a strike that always wounds badly'));   // 1.6.0
        if (rr.dmg === true || (typeof rr.dtype === 'string' && rr.dtype.trim())) { var rdt = input('sys-list-rolldtype field', typeof rr.dtype === 'string' ? rr.dtype : '', 'A damage roll\u2019s type, one of the Combat tab\u2019s damage types, filled in when you press Apply to target on its card. Kept only on a damage roll', 'Damage type'); rdt.maxLength = LIMITS.formula; rdt.dataset.ri = String(ri); rw.appendChild(rdt); }   // 1.5.7; 1.6.3: drawn only beside Damage, or where a stray value stands (said under the list)
        var dkLOn = typeof kindsNamed === 'function' && kindsNamed(); if ((dkLOn && rr.dmg === true) || rr.dkind) { var rdk = input('sys-list-rolldkind field', typeof rr.dkind === 'string' ? rr.dkind : '', 'The kind of blow, one of the Combat tab\u2019s kinds. Armor at a location and a layer can read it. Kept only on a damage roll', 'Kind'); rdk.maxLength = LIMITS.formula; rdk.dataset.ri = String(ri); rw.appendChild(rdk); }   // 1.6.0: its kind of blow
        var rad = input('sys-list-rolldiv field', typeof rr.ad === 'string' ? rr.ad : '', 'A damage roll\u2019s armor divisor, filled in when you press Apply to target on its card: a number, or a formula of the row\u2019s names (Row.ap). 1 or empty for none. Kept only on a damage roll', 'Armor divisor'); rad.maxLength = LIMITS.formula; rw.appendChild(rad);   // 1.6.0
        if (rr.dmg === true) { var p2L = input('sys-list-rollp2f field', typeof rr.dmg2 === 'string' ? rr.dmg2 : '', 'Second part: damage of another type in the same blow, rolled with it, such as 1d6+1 or Row.burn. Its own DR is taken off, then both parts are one wound: one Major Wound test, one Any wound and one wear. Empty: none', 'Second part'); p2L.maxLength = LIMITS.formula; rw.appendChild(p2L); var p2LT = input('sys-list-rollp2t field', typeof rr.dtype2 === 'string' ? rr.dtype2 : '', 'The second part\u2019s type: a type\u2019s key from the Combat tab, or a formula giving its place in that list, 1 for the first (Row.dt2). Kept only beside a second part', 'Second part type'); p2LT.maxLength = LIMITS.formula; rw.appendChild(p2LT); var p2LA = input('sys-list-rollp2d field', typeof rr.ad2 === 'string' ? rr.ad2 : '', 'The second part\u2019s own armor divisor: a number, or a formula of the row\u2019s names. 1 or empty for none. Kept only beside a second part', 'Second part armor divisor'); p2LA.maxLength = LIMITS.formula; rw.appendChild(p2LA); if (dkLOn || rr.dkind2) { var p2LK = input('sys-list-rollp2k field', typeof rr.dkind2 === 'string' ? rr.dkind2 : '', 'The second part\u2019s kind of blow: a kind\u2019s key from the Combat tab, or a formula giving its place in that list. Empty: the first part\u2019s kind. Kept only beside a second part', 'Second part kind'); p2LK.maxLength = LIMITS.formula; rw.appendChild(p2LK); } [3, 4, 5].forEach(function(k) { var hasK = function(n) { return typeof rr['dmg' + n] === 'string' && !!rr['dmg' + n].trim(); }; if (!hasK(k - 1) && !hasK(k)) return; var nmK = k === 3 ? 'Third' : k === 4 ? 'Fourth' : 'Fifth'; var pkL = input('sys-list-rollp' + k + 'f field', typeof rr['dmg' + k] === 'string' ? rr['dmg' + k] : '', nmK + ' part: damage of another type in the same blow, rolled with it, such as 1d6 or Row.shock. Its own DR is taken off, then every part is one wound. Empty: none', nmK + ' part'); pkL.maxLength = LIMITS.formula; rw.appendChild(pkL); var pkLT = input('sys-list-rollp' + k + 't field', typeof rr['dtype' + k] === 'string' ? rr['dtype' + k] : '', 'The ' + nmK.toLowerCase() + ' part\u2019s type: a type\u2019s key from the Combat tab, or a formula giving its place in that list, 1 for the first. Kept only beside its part', nmK + ' part type'); pkLT.maxLength = LIMITS.formula; rw.appendChild(pkLT); var pkLA = input('sys-list-rollp' + k + 'd field', typeof rr['ad' + k] === 'string' ? rr['ad' + k] : '', 'The ' + nmK.toLowerCase() + ' part\u2019s own armor divisor: a number, or a formula of the row\u2019s names. 1 or empty for none. Kept only beside its part', nmK + ' part armor divisor'); pkLA.maxLength = LIMITS.formula; rw.appendChild(pkLA); if (dkLOn || rr['dkind' + k]) { var pkLK = input('sys-list-rollp' + k + 'k field', typeof rr['dkind' + k] === 'string' ? rr['dkind' + k] : '', 'The ' + nmK.toLowerCase() + ' part\u2019s kind of blow: a kind\u2019s key from the Combat tab, or a formula giving its place in that list. Empty: the first part\u2019s kind. Kept only beside its part', nmK + ' part kind'); pkLK.maxLength = LIMITS.formula; rw.appendChild(pkLK); } }); }   // 1.6.0 (B3): a blow of two damage types counts as one blow; and a third and a fourth part, each shown once the part before it has a formula
        { var tgS = el('select', 'sys-lroll-togm'); tgS.title = 'Goes to the GM: the player sees only that it was sent, and you get the roll privately. Its Then runs at once, or waits for your Apply. The list may send all its rolls'; [['', 'As the list says'], ['run', 'Goes to the GM'], ['wait', 'Goes to the GM, Then waits']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if ((rr.toGm || '') === o[0]) op.selected = true; tgS.appendChild(op); }); rw.appendChild(tgS); }   // HR1
        if (typeof dieSel === 'function') rw.appendChild(dieSel('sys-list-rolldie', rr.die, 'The die its button wears on each row. From its formula: the die it rolls, so 3d6 shows three dice and d20 a d20'));   // 1.5.8, backlog 149
        [['rollup', '\u25b2', 'Move up'], ['rolldown', '\u25bc', 'Move down'], ['rolldel', '\u00d7', 'Remove this roll']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        cb2.appendChild(rw);
        var ndRow = el('div', 'sys-flags sys-list-needsrow'); ndRow.dataset.ri = String(ri);   // Stage 6 HUD R2b: what it needs, then its consequences
        ndRow.appendChild(el('span', 'sys-num-cap sys-offered', 'When it can be used')); ndRow.appendChild(rsI);   // 1.6.2: where it stands, then while it may be pressed, together
        var ndIn = input('sys-list-needs field', typeof rr.needs === 'string' ? rr.needs : '', 'Rolled only while this holds for the row. Empty: always', 'When it can be used'); ndIn.maxLength = LIMITS.formula; ndRow.appendChild(ndIn);
        var ndTx = input('sys-list-needstext field', typeof rr.needsText === 'string' ? rr.needsText : '', 'What the grayed button says when it cannot roll. It must be filled in while it says when it can be used, or a player is told only Not now', 'Words for the grayed button'); ndTx.maxLength = LIMITS.needsWords; ndRow.appendChild(ndTx);
        ndRow.appendChild(checkLabel('sys-list-hideoff', rr.hideOff === true, 'Hidden until it can be used', 'The button stands on the row only while its needs hold. Off: it stays there, grayed out. Only beside needs'));   // 1.6.0
        var mfL = input('sys-list-malf field', typeof rr.malf === 'string' ? rr.malf : '', 'Malf: a natural total (the dice alone) at or past this malfunctions: a failure, and its On malfunction changes (no dice; Row.Malf reads the row)', 'Malf (Row.Malf)'); mfL.maxLength = LIMITS.formula; ndRow.appendChild(mfL);   // Stage 6 HUD R3
        if ((typeof draft !== 'undefined' && draft && draft.combat && draft.combat.checks === 'fixed') || rr.critAt || rr.fumbleAt) [['sys-list-critat', 'critAt', 'Critical at: this roll\u2019s own critical success range for the dice alone, read as the Combat tab reads it (no dice; Row.* reads the row; empty: the Combat tab\u2019s)', 'Critical at'], ['sys-list-fumbleat', 'fumbleAt', 'Critical failure at: this roll\u2019s own for the dice alone, read as the Combat tab reads it (no dice; Row.* reads the row; empty: the Combat tab\u2019s)', 'Critical failure at']].forEach(function(g) { var ci = input(g[0] + ' field', typeof rr[g[1]] === 'string' ? rr[g[1]] : '', g[2], g[3]); ci.maxLength = LIMITS.formula; ndRow.appendChild(ci); });   // 1.6.0 (the v2 sort's B1): a technique that widens the range
        var bgL = input('sys-list-bigat field', typeof rr.bigAt === 'string' ? rr.bigAt : '', 'Lands as a heavy hit: a success whose natural roll, the dice alone, is at or under this is marked a heavy hit. It is no critical. Its Then reads RollBig (no dice; Row.* reads the row; empty: never)', 'Heavy hit at'); bgL.maxLength = LIMITS.formula; ndRow.appendChild(bgL);   // 1.6.0 (the book's ruling of 2026-10-29)
        cb2.appendChild(ndRow); if (typeof whyBox === 'function') cb2.appendChild(whyBox(rr, 'list'));   // 1.6.2: each reason, with its own words
        var lxR = typeof listCrossRow === 'function' ? listCrossRow(rr, ri, sp.counters) : null; if (lxR) cb2.appendChild(lxR);   // 1.6.0
        if (typeof callsBox === 'function') cb2.appendChild(callsBox(rr, typeof draft !== 'undefined' ? draft : null, false));   // 1.6.0: Calls for
        if (!rApply && rr.resist === true && typeof answersBox === 'function') { var ansBx = answersBox(rr, typeof draft !== 'undefined' ? draft : null, f); ansBx.dataset.ri = String(ri); cb2.appendChild(ansBx); }   // the review of defense fold 3 (finding 8): with the roll's place, so a fault of list.ans.<ri>.<line> lands on its own box (sysui boxIn)   // 1.6.3 (defense fold 3): When it answers an attack, the parrying row a row of this list
        if (typeof helpBox === 'function') cb2.appendChild(helpBox(rr));   // 1.6.2 Assist
        listApplyEditor(cb2, rr, ri, 'then', sp, targets);
    });
    var radd = el('button', 'tool ghost sys-btn sys-list-rolladd', '+ Roll'); radd.dataset.act = 'rolladd'; radd.disabled = rls.length >= LIMITS.rowRolls; radd.title = radd.disabled ? 'At most ' + LIMITS.rowRolls + ' rolls a list' : 'A button on each row that rolls this formula with the row\u2019s names (a weapon\u2019s Attack, a skill\u2019s Check)'; cb2.appendChild(radd);
    cb2.appendChild(el('div', 'sys-note sys-list-names', listNamesText(f.key, sp, partsHostIn(f.id))));
    card.appendChild(cb2);
    return card;
}
// 1.6.0 At most at a level (the owner, by prompt: "Passes, and the GM is told", "At the level, or that and higher"): a row a cap, how many rows,
// the level and or higher, and + At most up to LIMITS.lvlCaps
function lvlCapsBox(box, lv) {
    var cps = Array.isArray(lv.caps) ? lv.caps : [], wrap = el('div', 'sys-list-lcaps'), lw = typeof lv.label === 'string' && lv.label ? lv.label : 'Level';
    cps.forEach(function(c, ci) {
        var cc = c && typeof c === 'object' ? c : {}, rw = el('div', 'sys-flags sys-list-lcap'); rw.dataset.ci = String(ci);
        rw.appendChild(el('span', 'sys-num-cap', 'At most'));
        rw.appendChild(numField('sys-list-lcapn', cc.n, 'How many rows may stand there. 0: none', 'rows'));
        rw.appendChild(numField('sys-list-lcapat', cc.at, 'The ' + lw.toLowerCase() + ' they stand at, as a number' + (Array.isArray(lv.labels) && lv.labels.length ? ': the first value name is the lowest' : ''), 'at ' + lw));
        rw.appendChild(checkLabel('sys-list-lcapup', cc.up === true, 'or higher', 'Count every row at this ' + lw.toLowerCase() + ' and above it'));
        var del = el('button', 'tool ghost sys-btn sys-list-lcapdel', '\u00d7'); del.dataset.act = 'lvlcapdel'; del.title = 'Remove this cap'; rw.appendChild(del);
        wrap.appendChild(rw);
    });
    var add = el('button', 'tool ghost sys-btn sys-list-lcapadd', '+ At most'); add.dataset.act = 'lvlcapadd'; add.disabled = cps.length >= LIMITS.lvlCaps;
    add.title = add.disabled ? 'At most ' + LIMITS.lvlCaps + ' caps a list' : 'Cap how many rows may stand at a ' + lw.toLowerCase() + ', as one row at the free first one. A player is refused one more, and you are told'; wrap.appendChild(add);
    box.appendChild(wrap);
}
// 1.5.8 Counted once: the Lists tab's box. A group stat, what makes a row the higher, its full price and what was given free, each a select of
// this list's own stats (and for the price its columns), by key, so a key or a label typed meanwhile reads at the next draw
function onceBox(box, sp) {
    var o = sp.once && typeof sp.once === 'object' ? sp.once : {}, rw = el('div', 'sys-flags sys-list-once');
    var nums = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick'; }).map(function(s) { return [s.key, s.label && s.label !== s.key ? s.label + ' (' + s.key + ')' : s.key]; });
    var cols = (Array.isArray(sp.cols) ? sp.cols : []).filter(function(cc) { return cc && typeof cc === 'object' && typeof cc.key === 'string' && cc.key; }).map(function(cc) { return [cc.key, 'Column ' + (cc.label && cc.label !== cc.key ? cc.label + ' (' + cc.key + ')' : cc.key)]; });
    var sel = function(cls, cap, cur, opts, tip) {
        var lb = el('label', 'sys-num'), s = el('select', cls); s.title = tip; lb.appendChild(el('span', 'sys-num-cap', cap));
        var cl = typeof cur === 'string' ? cur.toLowerCase() : '', hit = false;
        opts.forEach(function(p) { var op = el('option', null, p[1]); op.value = p[0]; if (!hit && cl && p[0].toLowerCase() === cl) { op.selected = true; hit = true; } s.appendChild(op); });
        if (cl && !hit) { var ox = el('option', null, cur + ' (not on this list)'); ox.value = cur; ox.selected = true; s.appendChild(ox); }
        lb.appendChild(s); return lb;
    };
    rw.appendChild(el('span', 'sys-num-cap', 'Counted once'));
    rw.appendChild(sel('sys-list-onceby', 'Group', o.by, [['', 'Not counted once']].concat(nums), 'Rows whose figure here is the same, and not 0, are one thing held two ways. Only one of them applies'));
    rw.appendChild(sel('sys-list-oncerank', 'Higher by', o.rank, (sp.lvl && typeof sp.lvl === 'object' ? [['lvl', 'Its ' + (typeof sp.lvl.label === 'string' && sp.lvl.label ? sp.lvl.label : 'level')]] : []).concat(nums), 'Of a group, the row with the higher figure here applies. A tie goes to the row with less given free, then the later row'));
    rw.appendChild(sel('sys-list-oncecost', 'Full price', o.cost, [['', 'None']].concat(nums, cols), 'The highest figure here in the row\u2019s group is the one its cost counts'));
    rw.appendChild(sel('sys-list-oncefree', 'Given free', o.free, [['', 'None']].concat(nums, cols), 'The largest figure here in the row\u2019s group is the part it gives free. A column can say what a granted row gives free. A tie between rows goes by a stat, so with a column it goes to the later row'));
    if (sp.specs && typeof sp.specs === 'object') {   // 1.6.0: Across specialties, shown only on a list with Specialties
        var acL = el('label', 'sys-check'), acI = el('input', 'sys-list-onceacross'); acI.type = 'checkbox'; acI.checked = o.across === true; acL.title = 'Rows of one group count once whatever specialty each row names. Without this, each specialty counts on its own'; acL.appendChild(acI); acL.appendChild(el('span', null, 'Across specialties')); rw.appendChild(acL);
    }
    box.appendChild(rw);
    if (o.by) box.appendChild(el('div', 'sys-note sys-list-oncenote', 'A row of a group that does not apply gives none of its changes. To charge a group once, give the list a cost column that asks whether the row applies.'));
}
// F5a1: the names a list offers formulas, as one line of text for its card (its key as typed)
// 205 (3): whether a list of the draft takes its parts from this one (its parts then read Host.<w>)
function partsHostIn(id) { return (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).some(function(x) { return x && x.kind === 'item-list' && x.list && x.list.parts && (x.list.parts.from === id || (Array.isArray(x.list.parts.also) && x.list.parts.also.indexOf(id) >= 0)); }); }
function listNamesText(key, sp, isParts) {
    var k = String(key || 'List'), own = [], nums = [];
    if (k.indexOf('.') >= 0) return 'A list whose key has a dot has no names formulas can read (they would read ' + k.split('.')[0] + '.\u2026): give it a key without one.';   // owed review F5a1#6
    (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).forEach(function(x) { if (x && typeof x.key === 'string' && x.key) { own.push(x.key); if (x.kind !== 'pick') nums.push(x.key); } });   // nums (1.5.4): what has a highest and a lowest
    return 'Formulas read ' + k + '.count, ' + k + '.qty' + (sp.price ? ', ' + k + '.paid' : '') + own.map(function(w) { return ', ' + k + '.' + w; }).join('') + ' (the list\u2019s totals)' + (sp.on ? '; ' + k + '.on.\u2026 the same over the rows switched on' : '') + '; ' + k + '.<key>.lvl (and .qty, .on, .has' + (own.length ? ', a stat or a column' : '') + ') one row by its item\u2019s key.' + (nums.length ? ' ' + k + '.max.\u2026 and ' + k + '.min.\u2026 read the highest and the lowest one row gives of a number stat or a column, as ' + k + '.max.' + nums[0] + (sp.on ? '; ' + k + '.on.max.\u2026 and ' + k + '.on.min.\u2026 the same over the rows switched on' : '') + '.' : '') + ' A column or a roll reads its row as Row.lvl, Row.qty, Row.on, Row.has, Row.paid' + (own.length ? ', Row.' + own.join(', Row.') : '') + '.' + (sp.parts ? ' Row.parts reads how many parts a row holds, Row.parts.<stat> their total, and Row.parts.max.\u2026 and Row.parts.min.\u2026 the highest and the lowest one part gives; Row.parts.<choice> reads the first part that has that choice made.' + (sp.parts.deep === true ? ' Row.parts.all.<stat> adds up every level of parts under a row.' : '') : '') + (isParts ? ' A row that is a part reads its host row as Host.<stat>, a stat, a choice or a column of the list it is a part of.' : '');   // 205 (1), (3)
}
function lookShadesOf(text) { var out = []; String(text || '').split(/\r?\n/).forEach(function(ln) { var i = ln.lastIndexOf('='); if (i < 1) return; var v = ln.slice(0, i).trim(), c = ln.slice(i + 1).trim().toLowerCase(); if (v && /^#[0-9a-f]{6}$/.test(c)) out.push({ v: v.slice(0, 60), c: c }); }); return out.slice(0, ROW_LOOK.shades); }   // 1.6.0, backlog 206: the Lists card's Shades box
// 1.6.0 Its crew may press this sheet's rolls: which stations may press a roll, shown where a Crew link lets its crew press and names stations
function needsGmBox(r) { var l = checkLabel('sys-needsgmtick', r.needsGm === true, 'The GM may press past it', 'What it needs holds players back and not the GM, as a limit the GM can overrule. Only beside needs or a reason'), cb = l.firstChild; cb.addEventListener('change', function(e) { e.stopPropagation(); if (cb.checked) r.needsGm = true; else delete r.needsGm; markDirty(); patchErrors(); }); return l; }
function rollStationBox(r) {
    var has = (draft && Array.isArray(draft.links) ? draft.links : []).some(function(k) { return k && k.kind === 'crew' && k.press === true && Array.isArray(k.stations) && k.stations.length; }); if (!has) return null;
    var l = el('label', 'sys-check'), i = input('sys-crewstn field', Array.isArray(r.stations) ? r.stations.join(', ') : '', 'Which stations of a Crew link may press this roll, separated by commas. Empty: any crew member', 'Any station');
    l.appendChild(document.createTextNode('Stations: '));
    i.addEventListener('input', function(e) { e.stopPropagation(); var sv = i.value.split(',').map(function(x) { return x.trim(); }).filter(Boolean); if (sv.length) r.stations = sv; else delete r.stations; markDirty(); patchErrors(); });
    l.appendChild(i); return l;
}
// 1.6.0 An attack on a line: a roll's Hits a line and what it holds, a system roll's and a list roll's alike. Save cleans it (systemcore rollAreaInto); arSays in refreshErrors says what it drops
var AREA_LINE = 'One roll for the whole line, aimed by a click on the map. A wall stops it and a body does not. With Each one resists, each token in it gets the Resisted by roll, and a failure is a hit. With none, each is hit.';
function areaBox(r, dmgs) {
    var a = r.area && typeof r.area === 'object' && !Array.isArray(r.area) ? r.area : null, wrap = el('span', 'sys-flags sys-area'); wrap.appendChild(checkLabel('sys-area-on', !!a, 'Hits a line', AREA_LINE)); if (!a) return wrap;
    var w = numInput('field sys-area-width', typeof a.width === 'number' ? a.width : '', 'How wide the line is, in yards'); dbxCap(wrap, 'Width, yards'); wrap.appendChild(w);
    var re = input('sys-area-reach field', typeof a.reach === 'string' ? a.reach : '', 'How far the line goes, in yards. A formula with no dice of the roller\u2019s names, a list roll\u2019s row\u2019s too', 'Reach, e.g. Row.range'); re.maxLength = LIMITS.formula; dbxCap(wrap, 'Reach, yards'); wrap.appendChild(re);
    var dOpts = [['', 'No damage roll']].concat(dmgs), cur = a.dmg === undefined ? '' : String(a.dmg); if (cur && !dOpts.some(function(o) { return o[0] === cur; })) dOpts.push([cur, 'A roll no longer ticked Damage']);
    dbxCap(wrap, 'Each hit rolls'); wrap.appendChild(select('sys-area-dmg', dOpts, cur, 'The damage roll rolled for each token hit. Its card lands on that token'));
    var fxs = (draft.effects || []).filter(function(f) { return f && typeof f.id === 'string'; }).map(function(f) { return [f.id, f.name || 'An effect with no name']; }), fCur = typeof a.fx === 'string' ? a.fx : '', fOpts = [['', 'No effect']].concat(fxs); if (fCur && !fOpts.some(function(o) { return o[0] === fCur; })) fOpts.push([fCur, 'An effect no longer there']);
    dbxCap(wrap, 'Each hit gets'); wrap.appendChild(select('sys-area-fx', fOpts, fCur, 'An effect put on each token hit, even where its armor stops all the damage'));
    if (r.resistBy) wrap.appendChild(checkLabel('sys-area-all', r.resistAll === true, 'Each one resists', 'Each token in the line gets the Resisted by roll, with no target mark needed'));
    return wrap;
}
function areaEntryAt(t) {
    var cd = listOfCard(t); if (cd) { var rw = t.closest('.sys-list-roll'), rs = cd.list && Array.isArray(cd.list.rolls) ? cd.list.rolls : []; return { e: rw ? rs[+rw.dataset.ri] : null, list: true }; }
    var row = t.closest('.sys-row'), id = row ? row.dataset.id : ''; return { e: (draft.rolls || []).filter(function(r) { return r && r.id === id; })[0] || null, list: false };
}
function onAreaEdit(t, typed) {
    var c = t && t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-area-') < 0 || !t.closest) return false;
    var isText = c.indexOf('sys-area-width') >= 0 || c.indexOf('sys-area-reach') >= 0; if (isText !== (typed === true)) return true;
    var at = areaEntryAt(t), r = at.e; if (!r || typeof r !== 'object') return true;
    if (c.indexOf('sys-area-on') >= 0) { if (t.checked) r.area = { shape: 'line' }; else { delete r.area; delete r.resistAll; } markDirty(); renderAll(); return true; }
    var a = r.area && typeof r.area === 'object' ? r.area : null; if (!a) return true;
    if (c.indexOf('sys-area-width') >= 0) { var n = Number(t.value); if (t.value !== '' && isFinite(n)) a.width = n; else delete a.width; }
    else if (c.indexOf('sys-area-reach') >= 0) { var v = String(t.value || ''); if (v.trim()) a.reach = v; else delete a.reach; }
    else if (c.indexOf('sys-area-dmg') >= 0) { if (t.value === '') delete a.dmg; else a.dmg = at.list ? +t.value : t.value; }
    else if (c.indexOf('sys-area-fx') >= 0) { if (t.value) a.fx = t.value; else delete a.fx; }
    else if (c.indexOf('sys-area-all') >= 0) { if (t.checked) r.resistAll = true; else delete r.resistAll; }
    markDirty(); patchErrors(); return true;
}
// 1.6.3 (the review of the System editor, finding 17): Matched by, for a load, a feed and a chamber, picks a stat of each list by its name. The
// list's own spec (sp) gives this list's stats; statListOf finds the spec of the list it loads from, by its id, in the draft. The select keeps the
// class the editor's input handler reads, and its value is the stat's short name, as the typed box held. None is the empty value. A stat the list
// no longer has stays picked and says so, so a pair Save would drop is never hidden
function statListOf(id) { var f = (typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : []).filter(function(x) { return x && x.id === id && x.kind === 'item-list'; })[0]; return f && f.list && typeof f.list === 'object' ? f.list : null; }
function statPick(cls, spec, cur, tip, cap) {
    var opts = [['', 'None']], c = typeof cur === 'string' ? cur.trim() : '', has = false;
    (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (!s || typeof s.key !== 'string' || !s.key) return; opts.push([s.key, s.label || s.key]); if (c && s.key.toLowerCase() === c.toLowerCase()) { has = true; c = s.key; } });
    if (c && !has) opts.push([c, 'A stat that is gone']);
    return labeledSelect(cls, cap, opts, c, tip);
}
function checkLabel(cls, on, text, title) { var l = el('label', 'sys-check'), cb = el('input', cls); cb.type = 'checkbox'; cb.checked = !!on; l.appendChild(cb); l.appendChild(document.createTextNode(' ' + text)); if (title) l.title = title; return l; }
function listOfCard(target) { var cd = target && target.closest ? target.closest('.sys-list-card') : null; if (!cd) return null; return (draft.fields || []).find(function(x) { return x.id === cd.dataset.lid; }) || null; }
// F4c1 review: a stat's key as it is typed. The price follows its OWN stat only (the first stat holding its key, as Save reads it), never another
// stat typed through its spelling (cr on the way to crit); the price stat's key cleared to retype it leaves the price blank and remembers which
// stat it was, until a price is chosen or a stat added, moved or removed
var _priceAt = new WeakMap();
var _perAt = new WeakMap();   // 1.5.4 One at a time: the same for the stat One at a time goes by
function statKeyInput(lsp, stL, sti, raw) {
    var stD = stL[sti], pl = typeof lsp.price === 'string' ? lsp.price.toLowerCase() : '', own = -1;
    var swK = lsp.on && typeof lsp.on === 'object' ? lsp.on : null, pk = swK && typeof swK.per === 'string' ? swK.per.toLowerCase() : '', ownP = -1;   // Per follows its OWN stat's key, as the price does
    if (pk) { for (var qp = 0; qp < stL.length; qp++) if (stL[qp] && typeof stL[qp].key === 'string' && stL[qp].key.toLowerCase() === pk) { ownP = qp; break; } }
    else if (swK && swK.per === '' && _perAt.get(lsp) === sti) ownP = sti;
    if (pl) { for (var q = 0; q < stL.length; q++) if (stL[q] && typeof stL[q].key === 'string' && stL[q].key.toLowerCase() === pl) { own = q; break; } }
    else if (lsp.price === '' && _priceAt.get(lsp) === sti) own = sti;
    stD.key = String(raw).trim().slice(0, 24);
    if (own === sti) { lsp.price = stD.key; _priceAt.set(lsp, sti); }
    if (ownP === sti) { swK.per = stD.key; swK.one = true; _perAt.set(lsp, sti); }   // and the whole list if it is cleared, as the Per list's own handler leaves it
}
// 1.5.4 One at a time: the Per stat choices: Whole list, then each stat of the list by its label, the one in use picked, and a stat the list does
// not have kept and said as such (refreshErrors says what Save does with it). Option texts and values only. Kept up to date as a stat's key or
// label is typed, as the Price choices are
function perOptions(sel, sp) {
    sel.textContent = '';
    var sw = sp && sp.on && typeof sp.on === 'object' ? sp.on : {}, opV = typeof sw.over === 'string' && sw.over ? 'over:' + sw.over : typeof sw.per === 'string' ? sw.per : '', opHas = false, stsP = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key; });
    [['', 'Whole list']].concat(stsP.map(function(s) { return [s.key, 'Per ' + (s.label || s.key)]; })).concat(stsP.filter(function(s) { return s.kind !== 'pick' && Array.isArray(s.labels) && s.labels.length > 0; }).map(function(s) { return ['over:' + s.key, 'Where ' + (s.label || s.key) + ' meet']; })).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (!opHas && o[0].toLowerCase() === opV.toLowerCase()) { op.selected = true; opHas = true; } sel.appendChild(op); });
    if (opV && !opHas) { var opX = el('option', null, 'Per ' + opV + ' (no such stat)'); opX.value = opV; opX.selected = true; sel.appendChild(opX); }
}
function moneyOptions(sel, sp) {   // 1.5.6 the Money box: no money, each row's level (with a level), or each piece worth a number stat (by its key, kept up to date as a key is typed)
    sel.textContent = '';
    var cur = typeof sp.money === 'string' ? sp.money.toLowerCase() : '', none = el('option', null, 'No money'); none.value = ''; sel.appendChild(none);
    if (sp.lvl && typeof sp.lvl === 'object') { var ol = el('option', null, 'Each row holds its ' + (typeof sp.lvl.label === 'string' && sp.lvl.label ? sp.lvl.label : 'level')); ol.value = '@lvl'; if (cur === '@lvl') ol.selected = true; sel.appendChild(ol); }
    (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (!s || typeof s !== 'object' || typeof s.key !== 'string' || !s.key || s.kind === 'pick') return; var o = el('option', null, 'Each piece worth its ' + (s.label || s.key)); o.value = s.key; if (cur && s.key.toLowerCase() === cur) o.selected = true; sel.appendChild(o); });
}
// 157 M1: what a money list holds, the base unit or one of the Rules tab's currencies, and a choice of each row that names its own. Only where the
// system names currencies and the list holds money
function curBoxes(sb, sp, price) {   // price: the boxes of a price's currency (157 M1b), beside the Price box, in place of a Money box's
    var cs = typeof draft !== 'undefined' && draft && Array.isArray(draft.currencies) ? draft.currencies.filter(function(c) { return c && typeof c === 'object' && typeof c.key === 'string'; }) : []; if (!cs.length || !sp || (price ? !sp.price : typeof sp.money !== 'string' || !sp.money)) return;
    var put = function(sel, opts, now) { var lo = typeof now === 'string' ? now.toLowerCase() : ''; opts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0].toLowerCase() === lo) op.selected = true; sel.appendChild(op); }); };
    var cb = el('label', 'sys-num sys-money-box'), csel = el('select', price ? 'sys-list-pcur' : 'sys-list-cur'); cb.appendChild(el('span', 'sys-num-cap', price ? 'Priced in' : 'In')); csel.title = price ? 'The currency a price is set in. An ordinary currency is turned into the base unit. A Separate one is paid from its own money alone' : 'The currency this list holds. The base unit is the one prices are written in';
    put(csel, [['', 'The base unit']].concat(cs.map(function(c) { return [c.key, c.label || 'A currency']; })), price ? sp.priceCur : sp.cur); cb.appendChild(csel); sb.appendChild(cb);
    var chs = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.set !== true && (s.kind === 'pick' ? Array.isArray(s.opts) && s.opts.length > 0 : Array.isArray(s.labels) && s.labels.length > 0); }); if (!chs.length) return;
    var bb = el('label', 'sys-num sys-money-box'), bsel = el('select', price ? 'sys-list-pcurby' : 'sys-list-curby'); bb.appendChild(el('span', 'sys-num-cap', price ? 'Price currency by' : 'Currency by')); bsel.title = price ? 'A choice of each row that names the currency its price is set in. A row whose choice names none is priced as the list says' : 'A choice of each row that names its currency, such as Crowns or Marks. A row whose choice names none holds what the list holds';
    put(bsel, [['', 'Not by a choice']].concat(chs.map(function(s) { return [s.key, 'Its ' + (s.label || s.key)]; })), price ? sp.priceCurBy : sp.curBy); bb.appendChild(bsel); sb.appendChild(bb);
}
function moneyEditBox(sb, sp) {   // 157 M2: how a player changes this money: at once, by asking (it waits in the Review), or the GM's alone
    if (!sp || typeof sp.money !== 'string' || !sp.money) return;
    var lb = el('label', 'sys-num sys-money-box'), s = el('select', 'sys-list-medit'); lb.appendChild(el('span', 'sys-num-cap', 'Players change it')); s.title = 'How a player changes this money by hand. They ask: a typed amount or count waits in the Review for you. Buying, selling and trading move money by their own rules';
    [['', 'At once'], ['ask', 'They ask'], ['gm', 'GM only']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if ((sp.moneyEdits || '') === o[0]) op.selected = true; s.appendChild(op); });
    lb.appendChild(s); sb.appendChild(lb);
}
function hotBox(sb, sp) {   // 157 M1j: a stat of the list that says a row is stolen or illegal, so a system can set it from its own rules
    var ns = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.set !== true; }); if (!ns.length) return;
    var lb = el('label', 'sys-num sys-money-box'), s = el('select', 'sys-list-hot'); lb.appendChild(el('span', 'sys-num-cap', 'Stolen by')); s.title = 'A stat that says a row is stolen or illegal: a value name that says illegal is Illegal, any other name or a number that is not 0 Stolen. The GM may still mark a row by hand'; var lo = typeof sp.hot === 'string' ? sp.hot.toLowerCase() : '';
    [['', 'Only the GM\u2019s mark']].concat(ns.map(function(x) { return [x.key, 'Its ' + (x.label || x.key)]; })).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0].toLowerCase() === lo) op.selected = true; s.appendChild(op); });
    lb.appendChild(s); sb.appendChild(lb);
}
function condBox(sb, sp) {   // 157 M1f: a number stat of the list that is each row's condition, a per cent of full worth
    var ns = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; }); if (!ns.length) return;
    var lb = el('label', 'sys-num sys-money-box'), s = el('select', 'sys-list-cond'); lb.appendChild(el('span', 'sys-num-cap', 'Condition')); s.title = 'A number stat that is each row\u2019s condition, read as a per cent of full worth: 60 trades and sells at 60% of its price. A system may fill it from its own wear rules'; var lo = typeof sp.cond === 'string' ? sp.cond.toLowerCase() : '';
    [['', 'Always full worth']].concat(ns.map(function(x) { return [x.key, 'Its ' + (x.label || x.key)]; })).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0].toLowerCase() === lo) op.selected = true; s.appendChild(op); });
    lb.appendChild(s); sb.appendChild(lb);
}
function rateBoxes(sb, sp) {   // 157 M1c: an entry's own Buy and Sell figures, a number stat each, shown while the system's traders set buy and sell prices
    if (typeof draft === 'undefined' || !draft || !draft.trading || draft.trading.rates !== true || !sp || !sp.price) return;
    var ns = (Array.isArray(sp.stats) ? sp.stats : []).filter(function(s) { return s && typeof s === 'object' && typeof s.key === 'string' && s.key && s.kind !== 'pick' && s.set !== true; }); if (!ns.length) return;
    [['buyBy', 'sys-list-buyby', 'Buy figure', 'What a trader pays for this entry, where its figure is set, in place of its Buys at per cent'], ['sellBy', 'sys-list-sellby', 'Sell figure', 'What a trader asks for this entry, where its figure is set, in place of its Sells at per cent']].forEach(function(q) {
        var lb = el('label', 'sys-num sys-money-box'), s = el('select', q[1]); lb.appendChild(el('span', 'sys-num-cap', q[2])); s.title = q[3]; var lo = typeof sp[q[0]] === 'string' ? sp[q[0]].toLowerCase() : '';
        [['', 'None']].concat(ns.map(function(x) { return [x.key, 'Its ' + (x.label || x.key)]; })).forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; if (o[0].toLowerCase() === lo) op.selected = true; s.appendChild(op); });
        lb.appendChild(s); sb.appendChild(lb);
    });
}
function priceColOptions(sel, sp) {   // 1.6.2, backlog 234: Price from, the Price stat or one of the list's columns, by its name
    sel.textContent = '';
    var pl = typeof sp.priceCol === 'string' ? sp.priceCol.toLowerCase() : '', st = el('option', null, 'The Price stat'); st.value = ''; sel.appendChild(st);
    (Array.isArray(sp.cols) ? sp.cols : []).forEach(function(c) { if (!c || typeof c !== 'object' || typeof c.key !== 'string' || !c.key) return; var o = el('option', null, c.label && c.label !== c.key ? c.label : c.key); o.value = c.key; if (pl && c.key.toLowerCase() === pl) o.selected = true; sel.appendChild(o); });
}
function priceOptions(sel, sp) {   // F4c1: the Price choices — No price, then each stat by its key (kept up to date as a key is typed)
    sel.textContent = '';
    var pl = typeof sp.price === 'string' ? sp.price.toLowerCase() : '', none = el('option', null, 'No price'); none.value = ''; sel.appendChild(none);
    (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (!s || typeof s !== 'object' || typeof s.key !== 'string' || !s.key || s.kind === 'pick') return; var o = el('option', null, s.label && s.label !== s.key ? s.label + ' (' + s.key + ')' : s.key); o.value = s.key; if (pl && s.key.toLowerCase() === pl) o.selected = true; sel.appendChild(o); });
}
// Stage 6 HUD H7b: a list roll of the Apply kind — its move/remove buttons, then its changes (as the Rolls tab's, the amount reading Row.*); the
// selects are built with el only (the Lists card's test slice injects no select helper)
function listApplyEditor(box, rr, ri, key, sp, targets, row) {   // key (R2b): 'apply' (an apply action's changes) or 'then' (a roll's consequences, each with its When); sp: the list's options (its counters join the targets); targets: the pools, numbers and toggles of the draft (renderLists)
    key = key === 'then' ? 'then' : 'apply';
    var rw0 = row || box.lastChild;   // 1.6.2 (backlog 225, its review): the action's own row, never the needs or Calls for box added after it
    if (key === 'apply') [['rollup', '\u25b2', 'Move up'], ['rolldown', '\u25bc', 'Move down'], ['rolldel', '\u00d7', 'Remove this action']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw0, bb) : rw0.appendChild(bb)); });
    targets = Array.isArray(targets) ? targets : []; var list = Array.isArray(rr[key]) ? rr[key] : [], ctrs = sp && Array.isArray(sp.counters) ? sp.counters.filter(function(t) { return t && typeof t.key === 'string' && t.key; }) : [];
    // 1.6.3 (the improvement week's review of the System editor, finding 14): a target list here names every pool, number, toggle and effect
    // of the system, near six hundred on a large one, once for every change of every roll of the list, and the Weapons card of such a
    // system was 83,000 elements, nearly all of them these options. A long list is a lazySelect (sheets.js): it holds its own choice until
    // it is pressed or reached by the keyboard, then fills, so it reads and works as before. A short one, and a suite's slice that has no
    // lazySelect at hand, is built whole as it always was
    var sel = function(cls, opts, val, title, search) { if (opts.length > 40 && typeof lazySelect === 'function') { var hit = opts.some(function(o) { return o[0] === val; }), lz = lazySelect(cls, opts, hit ? val : opts[0][0], title, search); lz.title = title; return lz; } var s = el('select', cls); s.title = title; opts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; s.appendChild(op); }); s.value = val; return s; };
    list.forEach(function(ch0, ai) {
        var ch = ch0 && typeof ch0 === 'object' ? ch0 : {}, rw = el('div', 'sys-flags sys-list-applyrow'); rw.dataset.ri = String(ri); rw.dataset.ai = String(ai); rw.dataset.k = key;
        if (key === 'then') rw.appendChild(sel('sys-list-applywhen', [['', 'Always'], ['hit', 'On success'], ['crit', 'On a critical success'], ['miss', 'On failure'], ['fumble', 'On a critical failure'], ['malf', 'On malfunction']].concat(typeof bandWhens === 'function' ? bandWhens(null, ch) : []), ch.band ? 'band:' + ch.band : ch.when || '', 'When the roll makes this change: always, or only when its test succeeds or fails. A critical success is a success too, and a critical failure a failure'));
        if (key === 'then') { var ifL = input('sys-list-applyif field', typeof ch.if === 'string' ? ch.if : '', 'Only where: a formula with no dice this change also needs, reading the row as Row.Cost and how the roll went as RollMargin. Empty: nothing more', 'Only where'); ifL.maxLength = LIMITS.formula; rw.appendChild(ifL); }   // 1.6.2
        // 1.6.3 (finding 24): two fields, or two of the list's stats, of one name are told apart by their short names (sheets.js twinNamer)
        var tgN = typeof twinNamer === 'function' ? twinNamer(typeof draft !== 'undefined' && draft && Array.isArray(draft.fields) ? draft.fields : targets, function(x) { return x ? x.label || x.key || x.id : ''; }, function(x) { return x ? x.key : ''; }) : function(x) { return x.label || x.key || x.id; };
        var stTw = typeof twinNamer === 'function' ? twinNamer(sp && Array.isArray(sp.stats) ? sp.stats : [], function(x) { return x ? x.label || x.key : ''; }, function(x) { return x ? x.key : ''; }) : function(x) { return x.label || x.key; };
        var opts = [['', 'Pick a pool, number, toggle or counter\u2026']].concat(targets.map(function(f) { return [f.id, tgN(f) + (f.kind === 'resource' ? ' (pool)' : '')]; }), ctrs.map(function(t) { return ['c:' + t.key, 'Counter: ' + (t.label || t.key)]; })); if (ch.f && !targets.some(function(f) { return f.id === ch.f; })) opts.push([ch.f, 'A field that is gone']); if (ch.c && !ctrs.some(function(t) { return t.key === ch.c; })) opts.push(['c:' + ch.c, 'A counter that is gone']);
        (typeof draft !== 'undefined' && draft && Array.isArray(draft.effects) ? draft.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') opts.push(['fx+:' + d.id, 'Switch on: ' + (d.name || 'An effect with no name')], ['fx-:' + d.id, 'Switch off: ' + (d.name || 'An effect with no name')]); });   // 1.6.0: an effect switched on or off, the row's quantity, one of its own number stats
        opts.push(['q', 'This row\u2019s quantity']); (sp && Array.isArray(sp.stats) ? sp.stats : []).forEach(function(t) { if (t && typeof t.key === 'string' && t.key && t.kind !== 'pick') opts.push(['s:' + t.key, 'This row\u2019s ' + stTw(t)]); });
        if (typeof ch.fx === 'string' && !opts.some(function(o) { return o[0].slice(4) === ch.fx && o[0].indexOf('fx') === 0; })) opts.push([(ch.on === false ? 'fx-:' : 'fx+:') + ch.fx, 'An effect that is gone']); if (typeof ch.s === 'string' && !opts.some(function(o) { return o[0] === 's:' + ch.s; })) opts.push(['s:' + ch.s, 'A stat that is gone']);
        if ((sp && sp.hand) || ch.discard === true) opts.push(['discard', 'Discard this card']);   // 1.6.2 (G9)
        if ((sp && sp.on && typeof sp.on === 'object') || ch.off === true) opts.push(['off', sp && sp.on ? 'Switch this row off' : 'Switch off, but this list has no switch']);   // 1.6.0 (CORE gap 13)
        if (key === 'then' && ((sp && sp.chamber && typeof sp.chamber === 'object') || ch.fire === true)) opts.push(['fire', sp && sp.chamber ? 'Fire the next chambered round' : 'Fire, but this list has no Chambers from']);   // 1.5.9 Chambers from
        if (key === 'then' && ((sp && Array.isArray(sp.feeds) && sp.feeds.length) || ch.feed === true)) opts.push(['feed', sp && Array.isArray(sp.feeds) && sp.feeds.length ? 'A shot from every feed' : 'A shot, but this list has no feeds']);   // 1.6.0 Feeds
        opts.push(['launch', key === 'then' ? 'Launch what it fired, else this row, at the target' : 'Launch this row at the target']);
        if (typeof giveTargets === 'function') giveTargets(ch).forEach(function(o) { opts.push(o); });   // 1.6.4 (gap #20): more of a turn's action this turn, or extra turns
        opts.push(['setoff', 'Set off the placed blast nearest it']);   // 1.6.2 (10)   // 1.6.2 (vehicles, fold (d)): an entry that flies once launched
        if (key === 'then') opts.push(['money', 'The sheet\u2019s money']);   // 1.6.0
        rw.appendChild(sel('sys-list-applytarget', opts, typeof ch.give === 'string' && typeof giveValue === 'function' ? giveValue(ch) : ch.setOff === true ? 'setoff' : typeof ch.money === 'string' ? 'money' : ch.off === true ? 'off' : ch.launch === true ? 'launch' : ch.feed === true ? 'feed' : ch.fire === true ? 'fire' : typeof ch.fx === 'string' ? (ch.on === false ? 'fx-:' : 'fx+:') + ch.fx : ch.q === true ? 'q' : typeof ch.s === 'string' ? 's:' + ch.s : ch.c ? 'c:' + ch.c : (ch.f || ''), 'What this change moves: a pool\u2019s current value, a number, a toggle, which is on above 0 and off at 0 or below, or one of the row\u2019s counters. Fire takes the next chambered round out, as the round last fired. A shot that jams fires nothing', 'Find what it changes'));
        if (ch.fire === true || ch.feed === true) { var fnI = input('sys-list-applyfiren field', typeof ch.n === 'string' ? ch.n : '', ch.feed === true ? 'How many shots this spends at one press: a number or a formula of the row\u2019s names, no dice, such as Row.Rate. Empty: one. Each feed gives that many, and it stops where the emptiest feed runs out' : 'How many rounds this spends at one press: a number or a formula of the row\u2019s names, no dice, such as Row.Rate. Empty: one. They go in order, and it stops when the chamber is empty', 'How many (one)'); fnI.maxLength = LIMITS.formula; rw.appendChild(fnI); }   // 1.6.0: How many
        if (typeof ch.money === 'string') { var moI = input('sys-list-applymoney field', ch.money, 'How much money moves: a formula with no dice, reading the row as Row.Cost and how the roll went as RollMargin. Above 0 is paid in, below 0 is paid out. With too little held a player\u2019s roll lands none of its Then, and your own takes what is held', 'Figure (0 - Row.Cost)'); moI.maxLength = LIMITS.formula; rw.appendChild(moI); }   // 1.6.0
        // 1.6.3 (gap 3 of docs/EDITOR_COVERAGE.md): the number an effect switched on goes on with, as Bleeding 3. It is the Rolls tab's own box
        // (sys-apply-fxn in sysedroll.js) with its words, and cleanApplyChanges keeps n on a list's change as on a system roll's. It shows where the
        // effect holds a number (fxHolds) or where a number is already stored, so a stored one is never hidden. Picking another target takes the
        // number off, as on the Rolls tab. The Lists tab's input handler in sysedtabs.js writes what is typed, in its sys-list-applyfxn branch
        if (typeof ch.fx === 'string' && ch.on !== false && ((typeof fxHolds === 'function' && fxHolds(ch.fx)) || typeof ch.n === 'string')) { var fxnL = input('sys-list-applyfxn field', typeof ch.n === 'string' ? ch.n : '', 'The number the effect goes on with, as Bleeding 3. Empty: its own start. Added again while it is on, the effect\u2019s rule says what happens', 'With number'); fxnL.maxLength = LIMITS.formula; rw.appendChild(fxnL); }
        if (ch.fire !== true && ch.feed !== true && ch.launch !== true && ch.off !== true && typeof ch.fx !== 'string' && typeof ch.money !== 'string') {
        var mkL = typeof markOpts === 'function' ? markOpts(ch) : [];   // 1.6.2
        if (typeof ch.give !== 'string') rw.appendChild(sel('sys-list-applyop', mkL.length ? mkL : (typeof lossOpts === 'function' ? lossOpts(ch) : [['sub', 'Subtract'], ['add', 'Add'], ['set', 'Set to']]), mkL.length ? markVal(ch) : (typeof opVal === 'function' ? opVal(ch) : (ch.set ? 'set' : ch.add ? 'add' : 'sub')), 'Subtract (a cost) or add; never past the field\u2019s min and max'));
        var fm = typeof ch.give === 'string' && typeof GIVE_TIP === 'string' ? input('sys-list-applyformula field', typeof ch.formula === 'string' ? ch.formula : '', GIVE_TIP, 'How many') : input('sys-list-applyformula field', typeof ch.formula === 'string' ? ch.formula : '', 'The amount for the row: no dice unless Rolled is ticked; Row.lvl, Row.<stat>, Row.<column> read the row (Row.FPCost)', 'Amount (Row.FPCost)'); fm.maxLength = LIMITS.formula; rw.appendChild(fm);   // 1.6.4 (gap #20): a Give says how many
        var lrlL = el('label', 'sys-hover'), lrlC = el('input'); lrlC.type = 'checkbox'; lrlC.className = 'sys-list-applyrolled'; lrlC.checked = ch.roll === true; lrlL.appendChild(lrlC); lrlL.appendChild(el('span', null, ' Rolled')); lrlL.title = 'Rolled: the amount may roll dice, such as 1d6. The host rolls it each time, and the card shows the dice'; rw.appendChild(lrlL);   // 1.5.9 (book es/et plan, section 0)
        if (typeof ch.give === 'string' && typeof giveWhenBox === 'function') rw.appendChild(giveWhenBox(ch));   // 1.6.4 (Fulllion, gap #20): when it comes
        }
        [['lapplyup', '\u25b2', 'Move up'], ['lapplydown', '\u25bc', 'Move down'], ['lapplydel', '\u00d7', 'Remove this change']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        box.appendChild(rw);
    });
    var addB = el('button', 'tool ghost sys-btn sys-list-applyadd', key === 'then' ? '+ Then\u2026' : '+ Change'); addB.dataset.act = 'lapplyadd'; addB.dataset.ri = String(ri); addB.dataset.k = key; addB.disabled = list.length >= LIMITS.applyChanges; addB.title = addB.disabled ? 'At most ' + LIMITS.applyChanges + ' changes an action' : 'Another pool or number this button moves'; box.appendChild(addB);
}
// [systemcheck:blastbox-start]
// 1.5.8 explosives: the Combat tab's blast formulas (systemcore cleanBlastRules), each a box with one line under it saying what Save does with
// it, the cleaner's own reading. Values and text nodes only
var BLAST_BOXES = [
    ['fall', 'Blast falloff', 'Each token\u2019s share of a blast. With none, every token takes the whole roll.', 'if(or(Direct, Centre), BlastDamage, if(BlastDistance > 2 * BlastDice, 0, floor(BlastDamage / (3 * BlastDistance))))'],
    ['each', 'Each victim\u2019s dice', 'The dice each character in a blast rolls of its own. Below 1 it rolls none. With none, one roll for all.', 'BlastDice - floor(BlastDistance)'],
    ['roll', 'Throw roll', 'The check a throw rolls first. With none, a throw lands where it is aimed.', '3d6 <= ThrowSkill + RangeMod'],
    ['scatter', 'Scatter on a miss', 'How many yards a miss lands from its aim. With none, a yard a point missed, never more than half the distance thrown.', 'min(Margin, ThrowDistance / 2)'],
    ['hand', 'In the hand', 'Whether a critical failure goes off in the thrower\u2019s hand. With none, it drops at the thrower\u2019s feet.', 'Natural >= 18'],
    ['max', 'Longest throw', 'How far a thing may be thrown, in yards. With none, any distance.', ''],
    ['min', 'Shortest throw', 'How near a thing may be thrown, in yards. With none, any distance.', ''],
    ['radius', 'Blast radius', 'How far a blast reaches where it goes off, in yards, read from the item\u2019s own radius and the Environment readings there. With none, the item\u2019s own.', '']
];
// 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): how an explosive's fragmentation is rolled (cleanBlastRules' frag). Each list's
// first choice is the plan's reading where the book has not ruled, and each has one line under it
var FRAG_LISTS = [
    ['cover', 'Fragmentation is stopped by', [['', 'Cover, as the blast'], ['total', 'Only full cover']], 'Only full cover: a character partly behind cover takes all of it.'],
    ['each', 'Fragmentation is rolled', [['', 'Once for every character'], ['each', 'Once for each character']], 'One roll that every character it reaches takes, or a roll of their own.'],
    ['direct', 'The character struck directly', [['', 'Takes the same roll'], ['own', 'Takes a hit of its own roll']], 'A hit of its own: the target struck directly rolls apart from the others.'],
    ['ad', 'An armor divisor', [['', 'Counts against the blast alone'], ['yes', 'Counts against its fragmentation too']], 'Whether an item\u2019s armor divisor counts against its fragmentation.']
];
var FRAG_REACH_LINE = 'How far fragmentation reaches, in yards. It can read the dice it rolls and the dice of the blast\u2019s own damage. With none, the blast\u2019s own radius. It never reaches less.';
function fragSays(v) {   // what Save does with Fragmentation reaches: '' where it keeps it
    var SCf = window.wpSystemCore; if (!v || !SCf || typeof SCf.cleanBlastRules !== 'function') return '';
    var c = SCf.cleanBlastRules({ frag: { reach: v } }, F()); return c && c.frag && c.frag.reach ? '' : 'Save drops it: it may read only the dice of the fragments and of the blast, with no dice.';
}
// 1.6.3 (Fulllion's rulings of 2026-11-20, lane B batch "damage"): what a blast formula's line says beyond Save's reading of the formula itself, where it
// depends on another box. A die each victim loses and Each victim's dice rolled by count only beside Each victim's dice, and Save keeps them only there,
// so the line under that box names the picks Save then drops. In the hand is read only after a Throw roll (wbblast.js, inside the throw), so while
// Save keeps no Throw roll it says it counts only with one. Scatter on a miss says nothing of the kind: a launched round whose item says On a miss,
// launched: scatter reads it with no Throw roll at all (wbblast.js window.wpLaunchMiss), so a system with launchers and no thrown grenades uses it
// (the review of damage, 2026-11-20). bl: the draft's blast rules. '' where nothing depends on a missing box. Save is as it was
function blastDepSays(k, bl) {
    var SCb = window.wpSystemCore; if (!bl || typeof bl !== 'object' || !SCb || typeof SCb.cleanBlastRules !== 'function') return '';
    var kept = function(key) { var v = typeof bl[key] === 'string' ? bl[key].trim() : '', o = {}; if (!v) return false; o[key] = v; var c = SCb.cleanBlastRules(o, F()); return !!(c && c[key]); };
    if (k === 'each' && !kept('each')) { var on = []; if (bl.eachAdd === true) on.push('\u201cA die each victim loses\u201d'); if (bl.eachBy === 'victim') on.push('\u201cEach victim\u2019s dice rolled by\u201d'); return on.length ? 'Save drops ' + on.join(' and ') + ' until \u201cHow many dice does each victim roll?\u201d is filled in.' : ''; }
    if (k === 'hand' && kept('hand') && !kept('roll')) return 'This counts only when a throw is rolled. Fill in the throw roll above.';
    return '';
}
// 1.6.3: the whole line under a blast formula's box, Save's reading of it first, then what it depends on; and that line set again in the box on screen
function blastLine(k, bl) { var v = bl && typeof bl[k] === 'string' ? bl[k] : ''; return blastSays(k, v) || blastDepSays(k, bl); }
function blastLineSet(k, bl) { var box = typeof ui === 'function' ? ui('sysCombatBox') : null, er = box && box.querySelectorAll ? Array.prototype.filter.call(box.querySelectorAll('.sys-blast-err'), function(x) { return x.dataset.bk === k; })[0] : null; if (er) er.textContent = blastLine(k, bl); }
function blastSays(k, v) {   // what Save does with one formula: '' where it keeps it
    var SCb = window.wpSystemCore; if (!v || !SCb || typeof SCb.cleanBlastRules !== 'function') return '';
    var o = {}; o[k] = v; var c = SCb.cleanBlastRules(o, F());
    return c && c[k] ? '' : k === 'each' ? 'Save drops it: it may read only the blast\u2019s dice, its distance and its fill, and whether the hit was direct or at the center, with no dice.' : k === 'fall' ? 'Save drops it: it may read only the blast\u2019s damage, dice, distance and fill, whether the hit was direct or at the center, a cell of the map and the scale of the one it hits, with no dice.' : k === 'scatter' ? 'Save drops it: it may read only how far the throw missed and how far it was thrown.' : k === 'hand' ? 'Save drops it: it may read only the roll\u2019s bare total, with no dice.' : k === 'roll' ? 'Save drops it: it does not read as a formula.' : k === 'radius' ? 'Save drops it: it may read only the item\u2019s own radius, a cell of the map and the Environment readings where it goes off, with no dice.' : 'Save drops it: it does not read as a formula with no dice.';
}
// 1.6.2 (vehicles, fold (e); the owner, by prompt): the system's own distance unit, which one cell of the map is read in (MapCell), and the number
// field each sheet's scale is, read by a blast as HitScale. Their own listeners, so no handler of the Combat tab reads them
var UNIT_LINE = 'The unit the system\u2019s distances count in. A blast\u2019s formulas read one cell of the map in it, whatever unit the map is set in.';
var SCALE_LINE = 'A number field each sheet keeps its scale in. A blast\u2019s formulas read the figure of the one it hits, 1 where it has none, so a person in a ship\u2019s blast can take more.';
function blastScaleInto(box, cm, bl) {
    var said = function(re) { markDirty(); if (typeof patchErrors === 'function') patchErrors(); if (re) renderCombat(); };
    var uL = labeledSelect('sys-combat-bunit', 'The system\u2019s distances count in', [['', 'Yards'], ['ft', 'Feet'], ['m', 'Meters']], cm.unit === 'ft' || cm.unit === 'm' ? cm.unit : '', UNIT_LINE), uS = uL.querySelector ? uL.querySelector('select') : null;
    if (uS) uS.addEventListener('change', function(e) { e.stopPropagation(); if (uS.value === 'ft' || uS.value === 'm') cm.unit = uS.value; else delete cm.unit; said(false); });
    box.appendChild(uL); lineUnder(box, UNIT_LINE);
    var nums = (draft.fields || []).filter(function(f) { return f && typeof f.id === 'string' && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill'); }), cur = typeof bl.scale === 'string' ? bl.scale : '';
    var opts = [['', 'None: every sheet reads 1']].concat(nums.map(function(f) { return [f.id, f.label || 'A field']; })); if (cur && !nums.some(function(f) { return f.id === cur; })) opts.push([cur, 'A field that is gone']);
    var sL = labeledSelect('sys-combat-bscale', 'A sheet\u2019s scale is', opts, cur, SCALE_LINE), sS = sL.querySelector ? sL.querySelector('select') : null;
    if (sS) sS.addEventListener('change', function(e) { e.stopPropagation(); var b2 = cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : (cm.blast = {}); if (sS.value) b2.scale = sS.value; else delete b2.scale; if (!Object.keys(b2).length) delete cm.blast; said(false); });
    box.appendChild(sL); lineUnder(box, SCALE_LINE);
}
// 1.6.2 (the owner: "Folds by part, answer shown"): the parts of Blasts and throws, each a fold whose head says in one line what is set in it.
// Which are open is kept while the app runs
var _blastOpen = {}, BLAST_PARTS = [['throw', 'Throwing'], ['dist', 'Damage by distance'], ['launch', 'Launchers'], ['frag', 'Fragments'], ['aff', 'Afflictions']], BLAST_THROW = { roll: 1, scatter: 1, hand: 1, max: 1, min: 1 };
function blastAnswer(body) {   // what is set in a part, in one line: each box or list that holds something, by its caption
    var said = [], items = body && body.querySelectorAll ? body.querySelectorAll('.sys-combat-item') : [];
    Array.prototype.forEach.call(items, function(l) {
        var cap = l.querySelector ? l.querySelector('.sys-num-cap') : null, sel = l.querySelector ? l.querySelector('select') : null, inp = l.querySelector ? l.querySelector('input') : null, w = '';
        if (sel && sel.value !== '' && sel.selectedIndex > 0 && sel.options && sel.options[sel.selectedIndex]) w = sel.options[sel.selectedIndex].textContent;
        else if (inp && String(inp.value || '').trim()) w = String(inp.value).trim();
        if (w && cap) said.push(cap.textContent + ': ' + w);
    });
    return said.length ? said.slice(0, 2).join('; ') + (said.length > 2 ? '; and ' + (said.length - 2) + ' more' : '') : 'Nothing set yet';
}
function blastParts(box) {
    var P = {};
    BLAST_PARTS.forEach(function(pt) {
        var d = el('details', 'sys-blast-part'), sm = el('summary', 'sys-blast-sum'), body = el('div', 'sys-blast-body'); d.dataset.part = pt[0]; d.open = _blastOpen[pt[0]] === true;
        sm.appendChild(el('span', 'sys-blast-name', pt[1])); var an = el('span', 'sys-blast-ans'); sm.appendChild(an); d.appendChild(sm); d.appendChild(body); box.appendChild(d);
        var say = function() { an.textContent = blastAnswer(body); };
        if (typeof d.addEventListener === 'function') d.addEventListener('toggle', function() { _blastOpen[pt[0]] = d.open === true; });
        if (typeof body.addEventListener === 'function') { body.addEventListener('change', say); body.addEventListener('input', say); } P[pt[0]] = body; P[pt[0] + 'Say'] = say;
    });
    return P;
}
function blastEachShown(bl) { return !!bl && ((typeof bl.each === 'string' && !!bl.each.trim()) || bl.eachAdd === true || bl.eachBy === 'victim'); }   // 1.6.3: whether the two lists that count beside Each victim's dice stand
function blastBox(box, cm) {
    blastHold();   // 1.6.3 (the review of damage): the System editor's window hears a press from its start, so a redraw that a text box's change asks for waits for it
    var bl = cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : {};
    box.appendChild(el('div', 'sys-combat-head', 'Blasts and throws'));
    var PB = blastParts(box), outer = box;
    BLAST_BOXES.forEach(function(d) {
        var box = BLAST_THROW[d[0]] === 1 ? PB.throw : PB.dist;
        var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', d[1]));
        var i = input('sys-combat-b' + d[0] + ' field', typeof bl[d[0]] === 'string' ? bl[d[0]] : '', d[2], d[3] ? 'e.g. ' + d[3] : 'A formula'); i.dataset.bk = d[0]; l.appendChild(i); box.appendChild(l);
        lineUnder(box, d[2]);
        var er = el('div', 'sys-blast-err'); er.dataset.bk = d[0]; er.textContent = blastLine(d[0], bl); box.appendChild(er);   // 1.6.3: and what it depends on
    });
    box = PB.dist;
    {   // 1.6.0: an item that fills its area, and one no drop answers: a number stat of its list, read by the falloff
        var stB = {}, stA = [['', 'None']]; (draft.fields || []).forEach(function(f) { if (f && f.kind === 'item-list' && f.list && Array.isArray(f.list.stats)) f.list.stats.forEach(function(s) { if (s && s.kind !== 'pick' && typeof s.key === 'string' && s.key && !stB[s.key.toLowerCase()]) { stB[s.key.toLowerCase()] = 1; stA.push([s.key, s.label || s.key]); } }); });
        var stO = function(k) { var cur = typeof bl[k] === 'string' ? bl[k] : ''; return cur && !stB[cur.toLowerCase()] ? stA.concat([[cur, cur + ' (no list has this stat)']]) : stA; };
        box.appendChild(labeledSelect('sys-combat-bfills', 'An item fills its area by', stO('fills'), typeof bl.fills === 'string' ? bl.fills : '', FILLS_LINE)); lineUnder(box, FILLS_LINE);
        if (bl.fills) { box.appendChild(labeledSelect('sys-combat-bfillcover', 'Cover against an item that fills', [['', 'As any blast'], ['total', 'Only total cover stops it']], bl.fillCover === 'total' ? 'total' : '', FILL_COVER_LINE)); lineUnder(box, FILL_COVER_LINE); }
        box.appendChild(labeledSelect('sys-combat-bnodrop', 'An item no drop answers by', stO('noDrop'), typeof bl.noDrop === 'string' ? bl.noDrop : '', NO_DROP_LINE)); lineUnder(box, NO_DROP_LINE);
        box.appendChild(labeledSelect('sys-combat-bitemscale', 'An item\u2019s own scale by', stO('itemScale'), typeof bl.itemScale === 'string' ? bl.itemScale : '', ITEM_SCALE_LINE)); lineUnder(box, ITEM_SCALE_LINE);   // 1.6.2 (the core's gap 213)
    }
    if (typeof blastScaleInto === 'function') blastScaleInto(box, cm, bl);   // 1.6.2 (vehicles, fold (e))
    { box.appendChild(labeledSelect('sys-combat-bflying', 'Things in flight', [['', 'A blast passes them by'], ['hit', 'A blast hurts them as any token']], bl.flying === true ? 'hit' : '', FLYING_LINE)); lineUnder(box, FLYING_LINE); }   // 1.6.2 (vehicles, fold (d))
    // 1.6.3 (lane B batch "damage"): the two lists count only beside Each victim's dice, so they stand only while it holds a formula, or while a pick of
    // theirs is stored, so a stored pick stays in sight until it is put right. Leaving Each victim's dice draws them in or out (onBlastChange)
    if (blastEachShown(bl)) { { box.appendChild(labeledSelect('sys-combat-beachadd', 'A die each victim loses', [['', 'Leaves the adds whole'], ['go', 'Takes its add with it']], bl.eachAdd === true ? 'go' : '', EACH_ADD_LINE)); lineUnder(box, EACH_ADD_LINE); }   // 1.6.0 (the core's rule on gap 8)
    { box.appendChild(labeledSelect('sys-combat-beachby', 'Each victim\u2019s dice rolled by', [['', 'The GM, each at once'], ['victim', 'The victim, from a card']], bl.eachBy === 'victim' ? 'victim' : '', EACH_BY_LINE)); lineUnder(box, EACH_BY_LINE); } }   // 1.6.0 (the core's gap 8)
    box = PB.throw;
    box.appendChild(labeledSelect('sys-combat-bways', 'Ways a miss goes', [['6', 'Six, a d6 (the sides of a hex)'], ['8', 'Eight']], bl.ways === 8 ? '8' : '6', 'How many ways a miss may scatter from its aim, rolled as a die'));
    box.appendChild(labeledSelect('sys-combat-bfuse', 'A thrown explosive goes off', [['', 'At once, where it lands'], ['turn', 'At the start of the next turn in a fight']], bl.fuse === 'turn' ? 'turn' : '', 'With a fight on its map, a fused explosive lies there until the next turn starts. Outside a fight it goes off at once'));
    box = PB.launch;
    var lnB = bl.launch && typeof bl.launch === 'object' && !Array.isArray(bl.launch) ? bl.launch : {};   // 1.5.9 (es): a launched round's miss; each first choice is the book's reading where it has ruled (the fuse, (eu) H1), else the plan's
    box.appendChild(labeledSelect('sys-combat-blfuse', 'A launched round that misses', [['', 'Waits for the fuse, as a throw'], ['now', 'Goes off where it lands, at once']], lnB.now === true ? 'now' : '', 'For a round whose item scatters on a miss. With the fuse set to the next turn and a fight on its map, it lies there until the next turn starts, as a thrown grenade does'));
    box.appendChild(labeledSelect('sys-combat-blfumble', 'Its critical failure', [['', 'Misses by its margin'], ['feet', 'Goes off at the shooter\u2019s feet'], ['none', 'Spends the round and goes nowhere']], lnB.fumble === 'feet' || lnB.fumble === 'none' ? lnB.fumble : '', 'What a launched round does when its roll is a critical failure'));
    box.appendChild(labeledSelect('sys-combat-blstop', 'A round that flies straight stops at', [['', 'The first wall or character'], ['past', 'The first wall, or a character past its target'], ['walls', 'The first wall only']], lnB.stop === 'past' || lnB.stop === 'walls' ? lnB.stop : '', 'For a round whose item flies straight on a miss. With nothing in its path it goes off at its farthest'));
    box.appendChild(labeledSelect('sys-combat-blglance', 'A character it stops on', [['', 'Is struck directly'], ['glance', 'Is not struck directly']], lnB.glance === true ? 'glance' : '', 'Whether a character a straight round stops on takes the blast as its direct target'));
    var stV = typeof lnB.stray === 'string' ? lnB.stray : '', stL = el('label', 'sys-combat-item'); stL.appendChild(el('span', 'sys-num-cap', 'A stray round lands')); var stI = input('sys-combat-blstray field', stV, STRAY_LINE, 'e.g. 1d6'); stI.dataset.sk = 'stray'; stI.maxLength = LIMITS.formula; stL.appendChild(stI); box.appendChild(stL); lineUnder(box, STRAY_LINE);   // 1.6.0 A burst
    var stE = el('div', 'sys-blast-err'); stE.dataset.sk = 'stray'; stE.textContent = straySays(stV); box.appendChild(stE);
    box = PB.dist;
    var kdB = cm.damage && Array.isArray(cm.damage.kinds) ? cm.damage.kinds.filter(function(y) { return y && typeof y.key === 'string' && y.key; }) : [];   // 1.6.0: the kind of blow its shares and fragmentation carry, where the system names kinds
    if (kdB.length || bl.kind) { var kdO = [['', 'None']].concat(kdB.map(function(y) { return [y.key, y.label || y.key]; })); var kdGone = typeof bl.kind === 'string' && !!bl.kind && !kdB.some(function(y) { return y.key.toLowerCase() === bl.kind.toLowerCase(); }); if (typeof bl.kind === 'string' && bl.kind && !kdO.some(function(o) { return o[0] === bl.kind; })) kdO.push([bl.kind, kdGone ? 'A kind that is gone' : (kdB.filter(function(y) { return y.key.toLowerCase() === bl.kind.toLowerCase(); })[0] || {}).label || bl.kind]); box.appendChild(labeledSelect('sys-combat-bkind', 'A blast\u2019s kind of blow', kdO, typeof bl.kind === 'string' ? bl.kind : '', BLAST_KIND_LINE)); lineUnder(box, BLAST_KIND_LINE);
        var kdE = el('div', 'sys-blast-err'); kdE.dataset.gk = 'kind'; kdE.textContent = kdGone ? BLAST_KIND_GONE : ''; box.appendChild(kdE); }   // 1.6.3 (lane B batch "damage"): a kind removed from Taking damage is said, never shown as its short name
    box = PB.frag;
    var fgC = bl.frag && typeof bl.frag === 'object' && !Array.isArray(bl.frag) ? bl.frag : {}, fgV = typeof fgC.reach === 'string' ? fgC.reach : '';   // 1.5.9 (es): fragmentation
    var fl = el('label', 'sys-combat-item'); fl.appendChild(el('span', 'sys-num-cap', 'Fragmentation reaches')); var fi = input('sys-combat-fgreach field', fgV, FRAG_REACH_LINE, 'e.g. 5 * FragDice'); fi.dataset.fk = 'reach'; fl.appendChild(fi); box.appendChild(fl);
    lineUnder(box, FRAG_REACH_LINE);
    var fe = el('div', 'sys-blast-err'); fe.dataset.fk = 'reach'; fe.textContent = fragSays(fgV); box.appendChild(fe);
    var dtF = cm.damage && Array.isArray(cm.damage.types) ? cm.damage.types.filter(function(y) { return y && typeof y.key === 'string'; }) : [], tyF = [['', 'The blast\u2019s own type']].concat(dtF.map(function(y) { return [y.key, y.label || y.key]; }));
    var tyGone = typeof fgC.type === 'string' && !!fgC.type && !dtF.some(function(y) { return y.key.toLowerCase() === fgC.type.toLowerCase(); });   // 1.6.3 (lane B batch "damage"): a type removed from Taking damage
    if (typeof fgC.type === 'string' && fgC.type && !tyF.some(function(o) { return o[0] === fgC.type; })) tyF.push([fgC.type, tyGone ? 'A type that is gone' : (dtF.filter(function(y) { return y.key.toLowerCase() === fgC.type.toLowerCase(); })[0] || {}).label || fgC.type]);   // a stored type the card no longer lists stays as it is, said as gone
    box.appendChild(labeledSelect('sys-combat-fgtype', 'Fragmentation type', tyF, typeof fgC.type === 'string' ? fgC.type : '', 'The damage type of fragmentation whose item names none'));
    lineUnder(box, FRAG_TYPE_LINE);
    var tyE = el('div', 'sys-blast-err'); tyE.dataset.gk = 'fragtype'; tyE.textContent = tyGone ? FRAG_TYPE_GONE : ''; box.appendChild(tyE);   // 1.6.3
    FRAG_LISTS.forEach(function(d) {
        var on = d[0] === 'cover' ? (fgC.cover === 'total' ? 'total' : '') : d[0] === 'each' ? (fgC.each === true ? 'each' : '') : d[0] === 'direct' ? (fgC.direct === true ? 'own' : '') : (fgC.ad === true ? 'yes' : '');
        box.appendChild(labeledSelect('sys-combat-fg' + d[0], d[1], d[2], on, d[3])); lineUnder(box, d[3]);
    });
    box = PB.aff;
    var rsV = typeof bl.resist === 'string' ? bl.resist : '';   // 1.5.9 (es): an affliction's resist roll, and whom one that reaches those it hurt reaches
    var rl = el('label', 'sys-combat-item'); rl.appendChild(el('span', 'sys-num-cap', 'Resist roll')); var ri = input('sys-combat-resist field', rsV, RESIST_LINE, 'e.g. 3d6 <= Resist'); ri.dataset.rk = 'resist'; rl.appendChild(ri); box.appendChild(rl);
    lineUnder(box, RESIST_LINE);
    var re = el('div', 'sys-blast-err'); re.dataset.rk = 'resist'; re.textContent = resistSays(rsV); box.appendChild(re);
    box.appendChild(labeledSelect('sys-combat-affhurt', 'Those an affliction hurts', [['', 'Took a wound, after DR'], ['share', 'Took any share of the blast']], bl.hurt === 'share' ? 'share' : '', HURT_LINE)); lineUnder(box, HURT_LINE);
    BLAST_PARTS.forEach(function(pt) { PB[pt[0] + 'Say'](); }); void outer;   // each fold's head says what is set in it
}
// 1.6.0 A blast's own Defense roll: the Blasts and throws part's rows for combat.blast.defend. Save cleans it (systemcore cleanBlastDefend); defendSays says what it drops, under errorCell('blastdefend')
var DEFEND_LINE = 'Each character in reach gets a card of this roll before its share. A success counts it as further off. The blast waits for the cards, and Apply now on the GM\u2019s card lets it go. Who rolled nothing takes it whole. The roll\u2019s Needs may hold it back. A launched burst takes one roll.';
function defendOpts(rows, cur, none) { var o = [['', none]].concat(rows); if (typeof cur === 'string' && cur && !o.some(function(x) { return x[0] === cur; })) o.push([cur, cur]); return o; }   // a stored id the card no longer lists stays as it is
function defendBox(box, bl, cm) {   // 1.6.3 (the review of defense fold 2, finding 3): it offers no roll answered with a row
    var df = bl.defend && typeof bl.defend === 'object' && !Array.isArray(bl.defend) ? bl.defend : {}, rolls = (draft.rolls || []).filter(function(r) { return r && typeof r.id === 'string' && !Array.isArray(r.apply) && (!(typeof r.withRow === 'string' && r.withRow) || r.id === df.roll); }).map(function(r) { return [r.id, (String(r.label || r.id).split('{')[0].trim() || r.id) + (typeof r.withRow === 'string' && r.withRow ? ', made only from a defense card' : '')]; });   // one picked already is named so, never shown by its short name
    box.appendChild(labeledSelect('sys-combat-dfroll', 'A blast\u2019s Defense roll', defendOpts(rolls, df.roll, 'None'), typeof df.roll === 'string' ? df.roll : '', DEFEND_LINE)); lineUnder(box, DEFEND_LINE);
    if (typeof df.roll === 'string' && df.roll) {
        var posts = (Array.isArray(cm.postures) ? cm.postures : []).filter(function(p) { return p && typeof p.id === 'string'; }).map(function(p) { return [p.id, p.name || 'A posture with no name']; }), counts = (draft.fields || []).filter(function(f) { return f && (f.kind === 'number' || f.kind === 'resource'); }).map(function(f) { return [f.id, f.label || f.key || f.id]; });
        box.appendChild(labeledNum('sys-combat-dfyards', 'A success counts as further off, yards', typeof df.yards === 'number' ? df.yards : '', 'Added to the distance from the blast for a character whose roll succeeded. Empty: none'));
        box.appendChild(labeledSelect('sys-combat-dfnofrag', 'A success and fragmentation', [['', 'Takes it all the same'], ['no', 'Takes none']], df.noFrag === true ? 'no' : '', 'Whether a character whose roll succeeded takes the blast\u2019s fragmentation'));
        box.appendChild(labeledSelect('sys-combat-dfposture', 'A success leaves its token', defendOpts(posts, df.posture, 'As it stands'), typeof df.posture === 'string' ? df.posture : '', 'The posture a success puts its token in'));
        box.appendChild(labeledSelect('sys-combat-dfcount', 'Defenses are counted in', defendOpts(counts, df.count, 'Nothing'), typeof df.count === 'string' ? df.count : '', 'A number or a pool that takes 1 for the roll, pass or fail. The roll itself may read it'));
    }
    if (typeof errorCell === 'function') { var err = errorCell('blastdefend'); err.dataset.errFor = 'blastdefend'; box.appendChild(err); }
}
function onDefendChange(t) {
    var m = /(^| )sys-combat-df(roll|yards|nofrag|posture|count)( |$)/.exec(t && t.className || ''); if (!m) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), bl = cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : (cm.blast = {}), df = bl.defend && typeof bl.defend === 'object' && !Array.isArray(bl.defend) ? bl.defend : (bl.defend = {}), v = String(t.value || '');
    if (m[2] === 'roll') { if (v) df.roll = v; else delete bl.defend; }
    else if (m[2] === 'yards') { var n = Number(v); if (v !== '' && isFinite(n)) df.yards = n; else delete df.yards; }
    else if (m[2] === 'nofrag') { if (v === 'no') df.noFrag = true; else delete df.noFrag; }
    else if (v) df[m[2]] = v; else delete df[m[2]];
    if (bl.defend && !Object.keys(bl.defend).length) delete bl.defend; if (!Object.keys(bl).length) delete cm.blast;
    markDirty(); patchErrors(); if (m[2] === 'roll') renderCombat(); return true;
}
function defendSays(df, rolls, cm, fields) {
    var errs = [], warns = [], SCd = window.wpSystemCore; if (!df || typeof df !== 'object' || Array.isArray(df) || !SCd || typeof SCd.cleanBlastDefend !== 'function') return { errs: errs, warns: warns };
    var c = SCd.cleanBlastDefend(df); if (!c) { if (Object.keys(df).length) errs.push({ message: 'A blast\u2019s Defense roll: it names no roll, so Save drops it.' }); return { errs: errs, warns: warns }; }
    if (df.yards !== undefined && c.yards === undefined) errs.push({ message: 'A success counts as further off: it must be more than 0, so Save drops it.' }); else if (typeof df.yards === 'number' && c.yards !== df.yards) warns.push({ message: 'A success counts as further off: Save keeps ' + c.yards + '.' });
    if (!(Array.isArray(rolls) ? rolls : []).some(function(r) { return r && r.id === c.roll && !Array.isArray(r.apply); })) warns.push({ message: 'A blast\u2019s Defense roll: that roll is gone, so no card goes out.' });
    else if ((Array.isArray(rolls) ? rolls : []).some(function(r) { return r && r.id === c.roll && typeof r.withRow === 'string' && !!r.withRow; })) warns.push({ message: 'A blast\u2019s Defense roll: that roll is answered with a row, which is made only from a defense card, so no card goes out.' });   // 1.6.3 (the review of defense fold 2, finding 3)
    if (c.posture && !(cm && Array.isArray(cm.postures) ? cm.postures : []).some(function(p) { return p && p.id === c.posture; })) warns.push({ message: 'A success leaves its token: that posture is gone, so it stays as it stands.' });
    if (c.count && !(Array.isArray(fields) ? fields : []).some(function(f) { return f && f.id === c.count && (f.kind === 'number' || f.kind === 'resource'); })) warns.push({ message: 'Defenses are counted in: that field is gone, so nothing counts them.' });
    return { errs: errs, warns: warns };
}
var STRAY_LINE = 'For a burst\u2019s round that failed, past the first, whose item scatters on a miss. A dice formula, such as 1d6, gives the yards it lands from the first round. You say which way from the bell, and it waits for the fuse. With none, you place it with Launch.';   // 1.6.0
var FILLS_LINE = 'A number stat of an item\u2019s list: the yards it fills. Give the item a blast radius that reaches as far.';   // 1.6.0
var FILL_COVER_LINE = 'With a stat picked above. Only total cover stops it: a token partly behind cover takes it all.';   // 1.6.0
var ITEM_SCALE_LINE = 'A number stat of an item\u2019s list: its own scale, which the damage by distance and each victim\u2019s dice may read. 1 where it has none.';   // 1.6.2 (the core's gap 213)
var NO_DROP_LINE = 'A number stat of an item\u2019s list that is not 0 where dropping to the ground does not answer it.';   // 1.6.0
var EACH_ADD_LINE = 'With Each victim\u2019s dice set. Takes its add with it: 4d6+4 at 3 dice rolls 3d6+3. Leaves the adds whole: it rolls 3d6+4.';   // 1.6.0
var EACH_BY_LINE = 'With Each victim\u2019s dice set. The GM: each one is rolled as the blast goes off. The victim: each player gets a card with a Roll button, and an NPC\u2019s card is yours.';   // 1.6.0 (the core's gap 8)
var RESIST_LINE = 'The check a character rolls against an affliction. Resist stands for what the item says it is resisted against. With none, you are told who must resist.';
var HURT_LINE = 'For an affliction that reaches those it hurts. A wound is damage that got through DR.';
function straySays(v) {   // what Save does with A stray round lands: '' where it keeps it
    var SCs = window.wpSystemCore; if (!v || !SCs || typeof SCs.cleanBlastRules !== 'function') return '';
    var c = SCs.cleanBlastRules({ launch: { stray: v } }, F()); return c && c.launch && c.launch.stray ? '' : 'Save drops it: it must be a dice formula with no names, such as 1d6.';
}
function resistSays(v) {   // what Save does with the Resist roll: '' where it keeps it
    // 1.6.3 (Fulllion's rulings of 2026-11-20: a box others depend on is required): with no resist roll, the items whose afflictions read it are counted
    var nAff = !v && typeof draft !== 'undefined' && draft ? (Array.isArray(draft.items) ? draft.items : []).filter(function(x) { return x && x.area && typeof x.area === 'object' && Array.isArray(x.area.aff) && x.area.aff.length; }).length : 0;
    if (nAff) return 'No resist roll: the afflictions of ' + (nAff === 1 ? 'one item are' : nAff + ' items are') + ' never rolled, only said.';
    var SCr = window.wpSystemCore; if (!v || !SCr || typeof SCr.cleanBlastRules !== 'function') return '';
    var c = SCr.cleanBlastRules({ resist: v }, F()); return c && c.resist ? '' : 'Save drops it: it does not read as a formula.';
}
var FLYING_LINE = 'A missile or anything else in flight inside a blast takes its share at its distance, less its Protection. Cover and fragmentation count as for any token.';
var FRAG_TYPE_LINE = 'The damage type of fragmentation whose item names none. With none, the blast\u2019s own type.';
var BLAST_KIND_LINE = 'The kind of blow a blast\u2019s shares and its fragmentation carry. With none, they carry no kind.';   // 1.6.0
// 1.6.3 (lane B batch "damage"): said under the list where the stored pick names a kind of blow or a damage type that Taking damage no longer holds.
// A blast then carries no kind, and fragmentation takes the blast's own type (fragPass in wbblast.js passes over a type that is gone)
var BLAST_KIND_GONE = 'That kind of blow is gone from Taking damage, so blasts carry no kind until one is picked here.';
var FRAG_TYPE_GONE = 'That damage type is gone from Taking damage, so fragmentation takes the blast\u2019s own type until one is picked here.';
// 1.6.3 (the review of damage, 2026-11-20): a text box's change event fires as the pointer goes down on another control and the box loses the
// focus. Drawing the Combat box again right then takes that control off the page under the pointer, so its press is lost. blastHold is the
// System editor's window held by io.js pressHold (the house rule that a press survives a redraw): blastBox asks it as it draws, so the window
// hears every press from its start, and a redraw asked for meanwhile waits until the press has landed. null where there is no page to hold
function blastHold() { var w = typeof document !== 'undefined' && document && typeof document.getElementById === 'function' ? document.getElementById('systemModal') : null; return w && typeof w.addEventListener === 'function' && typeof pressHold === 'function' && typeof window !== 'undefined' && window && typeof window.addEventListener === 'function' ? pressHold(w, window) : null; }
function onBlastChange(t) {   // the lists of the Blasts and throws part
    if (t && /(^| )sys-combat-beach( |$)/.test(t.className || '')) {   // 1.6.3 (lane B batch "damage"): Each victim's dice left. Its input event wrote it; the two lists that count beside it are drawn in or out, only where that changes
        var cmE = draft.combat, blE = cmE && cmE.blast && typeof cmE.blast === 'object' && !Array.isArray(cmE.blast) ? cmE.blast : null, boxE = typeof ui === 'function' ? ui('sysCombatBox') : null, hasE = !!(boxE && boxE.querySelector && boxE.querySelector('.sys-combat-beachadd'));
        if (blastEachShown(blE) !== hasE && typeof renderCombat === 'function') { var hE = blastHold(); if (hE && hE.busy()) hE.then(renderCombat); else renderCombat(); } return true;   // a press elsewhere lands first
    }
    var c = t && t.className || '', lk = /(^| )sys-combat-bl(fuse|fumble|stop|glance)( |$)/.exec(c), fk = /(^| )sys-combat-fg(type|cover|each|direct|ad)( |$)/.exec(c), hk = /(^| )sys-combat-affhurt( |$)/.test(c), ek = /(^| )sys-combat-beachby( |$)/.test(c), ak = /(^| )sys-combat-beachadd( |$)/.test(c), kk = /(^| )sys-combat-bkind( |$)/.test(c), sk = /(^| )sys-combat-b(fills|fillcover|nodrop|itemscale)( |$)/.exec(c), yk = /(^| )sys-combat-bflying( |$)/.test(c); if (c.indexOf('sys-combat-bways') < 0 && c.indexOf('sys-combat-bfuse') < 0 && !lk && !fk && !hk && !ek && !ak && !kk && !sk && !yk) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), bl = cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : (cm.blast = {});
    if (sk) { var skK = sk[2] === 'fills' ? 'fills' : sk[2] === 'nodrop' ? 'noDrop' : sk[2] === 'itemscale' ? 'itemScale' : 'fillCover'; if (t.value) bl[skK] = String(t.value).slice(0, 24); else delete bl[skK]; if (skK === 'fills' && !bl.fills) delete bl.fillCover; if (!Object.keys(bl).length) delete cm.blast; markDirty(); patchErrors(); if (skK === 'fills') renderCombat(); return true; }   // 1.6.0: the stats an item fills and refuses a drop by
    if (kk) { if (t.value) bl.kind = String(t.value).slice(0, 24); else delete bl.kind; }   // 1.6.0: the kind of blow it carries
    else if (ak) { if (t.value === 'go') bl.eachAdd = true; else delete bl.eachAdd; }   // 1.6.0 (the core's rule on gap 8): a lost die's add
    else if (ek) { if (t.value === 'victim') bl.eachBy = 'victim'; else delete bl.eachBy; }   // 1.6.0 (the core's gap 8): who rolls each victim's dice
    else if (yk) { if (t.value === 'hit') bl.flying = true; else delete bl.flying; }   // 1.6.2 (vehicles, fold (d)): a blast hurts things in flight
    else if (hk) { if (t.value === 'share') bl.hurt = 'share'; else delete bl.hurt; }   // 1.5.9 (es) H7: whom an affliction that reaches those it hurts reaches, kept only off the plan's reading
    else if (fk) {   // 1.5.9 (es): fragmentation, kept only off the plan's reading
        var fo = bl.frag && typeof bl.frag === 'object' && !Array.isArray(bl.frag) ? bl.frag : (bl.frag = {}), fv = String(t.value || '');
        if (fk[2] === 'type') { if (fv) fo.type = fv.slice(0, 24); else delete fo.type; } else if (fk[2] === 'cover') { if (fv === 'total') fo.cover = 'total'; else delete fo.cover; }
        else if (fk[2] === 'each') { if (fv === 'each') fo.each = true; else delete fo.each; } else if (fk[2] === 'direct') { if (fv === 'own') fo.direct = true; else delete fo.direct; } else { if (fv === 'yes') fo.ad = true; else delete fo.ad; }
        if (!Object.keys(fo).length) delete bl.frag;
    }
    else if (lk) {   // 1.5.9 (es): a launched round's miss, kept only off the plan's reading
        var lo = bl.launch && typeof bl.launch === 'object' && !Array.isArray(bl.launch) ? bl.launch : (bl.launch = {}), lv = t.value;
        if (lk[2] === 'fuse') { if (lv === 'now') lo.now = true; else delete lo.now; } else if (lk[2] === 'glance') { if (lv === 'glance') lo.glance = true; else delete lo.glance; }
        else if (lk[2] === 'fumble') { if (lv === 'feet' || lv === 'none') lo.fumble = lv; else delete lo.fumble; } else { if (lv === 'past' || lv === 'walls') lo.stop = lv; else delete lo.stop; }
        if (!Object.keys(lo).length) delete bl.launch;
    }
    else if (c.indexOf('sys-combat-bways') >= 0) { if (t.value === '8') bl.ways = 8; else delete bl.ways; } else { if (t.value === 'turn') bl.fuse = 'turn'; else delete bl.fuse; }
    if (!Object.keys(bl).length) delete cm.blast;
    if (ak || ek) blastLineSet('each', bl);   // 1.6.3: the line under Each victim's dice follows the two picks it names
    markDirty(); if ((kk || (fk && fk[2] === 'type')) && typeof renderCombat === 'function') renderCombat();   // 1.6.3: a pick made drops the option of a kind or type that is gone, and its line
    return true;
}
function bodyBox(box, cm) {
    var bdL = el('label', 'sys-combat-item'); bdL.appendChild(el('span', 'sys-num-cap', 'A body in the way hides'));
    var bdI = input('sys-combat-cover-body field', typeof cm.cover.body === 'string' ? cm.cover.body : '', BODY_LINE, 'A formula'); bdI.dataset.vk = 'body'; bdL.appendChild(bdI); box.appendChild(bdL);
    lineUnder(box, BODY_LINE);
    var bdE = el('div', 'sys-blast-err'); bdE.dataset.vk = 'body'; bdE.textContent = bodySays(cm.cover.body, cm); box.appendChild(bdE);
}
var BODY_LINE = 'How much a character on the line between a roll and its target hides the target, from the two Sizes. A roll reads it, and a miss by no more than it hits that body. Empty: a body hides nothing.';
function bodySays(v, cm) {   // what Save does with it: '' where it keeps it
    var SCb = window.wpSystemCore; if (!v || !SCb || typeof SCb.cleanBodyCover !== 'function') return '';
    if (!SCb.cleanBodyCover(v, F())) return 'Save drops it: it may read only the two Sizes, with no dice.';
    // 1.6.3 (Fulllion's rulings of 2026-11-20): the two Sizes come from Target size reads (or A body in the way reads), under Range. With neither picked every
    // size reads 0, so the rule hides nothing. Kept as typed all the same, and said under Range too, where the pick is made
    var P = F() ? F().parse(v) : null, rd = P && P.ok && (P.names || []).some(function(n) { var l = String(n).toLowerCase(); return l === 'targetsize' || l === 'bodysize'; });
    return rd && cm && typeof cm === 'object' && !cm.targetSize && !cm.bodySize ? 'Pick which number is a character\u2019s size in Target size reads, under Range, or every size reads 0.' : '';
}
function onBlastInput(t) {
    if (t && t.dataset && t.dataset.vk === 'body' && /(^| )sys-combat-cover-body( |$)/.test(t.className || '')) {   // 1.6.2: a body in the way, and what Save does with it
        var cmB = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), cvB = draft.combat.cover || (cmB.cover = { on: false, style: 'graded' }), vB = String(t.value || '').trim();
        if (vB) cvB.body = vB.slice(0, LIMITS.formula); else delete cvB.body;
        var boxB = ui('sysCombatBox'), erB = boxB ? Array.prototype.filter.call(boxB.querySelectorAll('.sys-blast-err'), function(x) { return x.dataset.vk === 'body'; })[0] : null; if (erB) erB.textContent = bodySays(vB, draft.combat);
        markDirty(); return true;
    }
    if (t && t.dataset && t.dataset.sk === 'stray' && /(^| )sys-combat-blstray( |$)/.test(t.className || '')) {   // 1.6.0 A burst: how far a stray round lands, and what Save does with it
        var cmS = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), blS = cmS.blast && typeof cmS.blast === 'object' && !Array.isArray(cmS.blast) ? cmS.blast : (cmS.blast = {}), loS = blS.launch && typeof blS.launch === 'object' && !Array.isArray(blS.launch) ? blS.launch : (blS.launch = {}), vS = String(t.value || '').trim();
        if (vS) loS.stray = vS.slice(0, LIMITS.formula); else delete loS.stray; if (!Object.keys(loS).length) delete blS.launch; if (!Object.keys(blS).length) delete cmS.blast;
        var boxS = ui('sysCombatBox'), erS = boxS ? Array.prototype.filter.call(boxS.querySelectorAll('.sys-blast-err'), function(x) { return x.dataset.sk === 'stray'; })[0] : null; if (erS) erS.textContent = straySays(vS);
        markDirty(); return true;
    }
    if (t && t.dataset && t.dataset.rk === 'resist' && /(^| )sys-combat-resist( |$)/.test(t.className || '')) {   // 1.5.9 (es): the Resist roll, and what Save does with it
        var cmR = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), blR = cmR.blast && typeof cmR.blast === 'object' && !Array.isArray(cmR.blast) ? cmR.blast : (cmR.blast = {}), vR = String(t.value || '').trim();
        if (vR) blR.resist = vR.slice(0, LIMITS.formula); else delete blR.resist; if (!Object.keys(blR).length) delete cmR.blast;
        var boxR = ui('sysCombatBox'), erR = boxR ? Array.prototype.filter.call(boxR.querySelectorAll('.sys-blast-err'), function(x) { return x.dataset.rk === 'resist'; })[0] : null; if (erR) erR.textContent = resistSays(vR);
        markDirty(); return true;
    }
    if (t && t.dataset && t.dataset.fk === 'reach' && /(^| )sys-combat-fgreach( |$)/.test(t.className || '')) {   // 1.5.9 (es): Fragmentation reaches, and what Save does with it
        var cmF = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), blF = cmF.blast && typeof cmF.blast === 'object' && !Array.isArray(cmF.blast) ? cmF.blast : (cmF.blast = {});
        var foF = blF.frag && typeof blF.frag === 'object' && !Array.isArray(blF.frag) ? blF.frag : (blF.frag = {}), vF = String(t.value || '').trim();
        if (vF) foF.reach = vF.slice(0, LIMITS.formula); else delete foF.reach;
        if (!Object.keys(foF).length) delete blF.frag; if (!Object.keys(blF).length) delete cmF.blast;
        var boxF = ui('sysCombatBox'), erF = boxF ? Array.prototype.filter.call(boxF.querySelectorAll('.sys-blast-err'), function(x) { return x.dataset.fk === 'reach'; })[0] : null; if (erF) erF.textContent = fragSays(vF);
        markDirty(); return true;
    }
    var k = t && t.dataset ? t.dataset.bk : ''; if (!k || !/(^| )sys-combat-b(fall|each|roll|scatter|max|min|hand|radius)( |$)/.test(t.className || '')) return false;   // 1.6.0: each (the core's gap 8); 1.6.3 (gap 1 of docs/EDITOR_COVERAGE.md): and Blast radius, which BLAST_BOXES draws but this test left out, so what was typed there never reached the draft and Save lost it
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    var bl = cm.blast && typeof cm.blast === 'object' && !Array.isArray(cm.blast) ? cm.blast : (cm.blast = {}), v = String(t.value || '').trim();
    if (v) bl[k] = v.slice(0, LIMITS.formula); else delete bl[k];
    if (!Object.keys(bl).length) delete cm.blast;
    (k === 'roll' ? ['roll', 'hand'] : [k]).forEach(function(dk) { blastLineSet(dk, bl); });   // 1.6.3: a Throw roll filled or emptied says again under In the hand
    markDirty(); return true;
}
// [systemcheck:blastbox-end]
// 1.6.0 Where a hit behind cover lands: combat.cover.hit, per grade, each row a run of a die and a formula true on the locations it means. Save cleans it
// (systemcore cleanCover); coverHitSays says what it drops, under errorCell('coverhit')
var COVER_HIT_LINE = 'After a hit with no aim, a die picks where it lands: on a target in the open, or behind that much cover while cover is on. It has as many sides as the highest To. Location where is true on the rows it means, read as Row. A row with nothing on the target falls to the next. Several rows under one take a second die. A called shot at a location these name stands.';
var COVER_HIT_MAX = typeof COVER_HIT_ROWS === 'number' ? COVER_HIT_ROWS : 60;
// 1.6.4 (the full test's gap 8): the open, a target behind no cover, first (COVER_HIT_OPEN, its words), so an unaimed hit there rolls its location too
var COVER_HIT_OPEN = 'In the open';
function coverHitGrades(cm) { var cv = cm && cm.cover && typeof cm.cover === 'object' ? cm.cover : {}; return [['open', COVER_HIT_OPEN]].concat(!cv.on ? [] : cv.style === 'binary' ? [['cover', 'Behind cover'], ['total', 'Behind total cover']] : [['half', 'Behind half cover'], ['threeq', 'Behind three-quarters cover'], ['total', 'Behind total cover']]); }
function coverHitBox(box, cm) {
    var cvB = cm.cover && typeof cm.cover === 'object' ? cm.cover : {}, ht = cvB.hit && typeof cvB.hit === 'object' && !Array.isArray(cvB.hit) ? cvB.hit : {};
    box.appendChild(el('div', 'sys-combat-head', 'Where a hit lands'));   // 1.6.4 (gap 8): in the open too
    box.appendChild(el('div', 'sys-note', COVER_HIT_LINE));
    coverHitGrades(cm).forEach(function(g) {
        var rows = Array.isArray(ht[g[0]]) ? ht[g[0]] : [], wrap = el('div', 'sys-cvh-grade'); wrap.dataset.grade = g[0]; wrap.appendChild(el('span', 'sys-num-cap', g[1]));
        rows.forEach(function(r0, i) {
            var r = r0 && typeof r0 === 'object' ? r0 : {}, rw = el('div', 'sys-flags sys-cvh-row'); rw.dataset.ci = String(i);
            var from = numInput('field sys-cvh-from', typeof r.from === 'number' ? r.from : '', 'The lowest roll of the die for this row'), to = numInput('field sys-cvh-to', typeof r.to === 'number' ? r.to : '', 'The highest roll of the die for this row');
            dbxCap(rw, 'From'); rw.appendChild(from); dbxCap(rw, 'To'); rw.appendChild(to);
            dbxCap(rw, 'Location where'); var loc = input('sys-cvh-where field', typeof r.row === 'string' ? r.row : '', 'True on the location rows this means. It reads the row as Row', 'e.g. Row.loc = 8'); loc.maxLength = LIMITS.formula; rw.appendChild(loc);
            rw.appendChild(dbxBtn('cvhdel', 'Remove', 'Take this row off')); wrap.appendChild(rw);
        });
        wrap.appendChild(dbxBtn('cvhadd', '+ Row', rows.length >= COVER_HIT_MAX ? 'At most ' + COVER_HIT_MAX : 'A run of the die and the location it means', rows.length >= COVER_HIT_MAX));
        box.appendChild(wrap);
    });
    var err = errorCell('coverhit'); err.dataset.errFor = 'coverhit'; box.appendChild(err);
}
function coverHitDraft() { if (!draft.combat.cover || typeof draft.combat.cover !== 'object') draft.combat.cover = { on: false, style: 'graded' }; var cv = draft.combat.cover; if (!cv.hit || typeof cv.hit !== 'object' || Array.isArray(cv.hit)) cv.hit = {}; return cv.hit; }
function coverHitTidy() { var cv = draft.combat.cover, h = cv && cv.hit; if (!h) return; Object.keys(h).forEach(function(k) { if (!Array.isArray(h[k]) || !h[k].length) delete h[k]; }); if (!Object.keys(h).length) delete cv.hit; }
function coverHitInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-cvh-') < 0) return false;
    var rw = t.closest ? t.closest('.sys-cvh-row') : null, gw = t.closest ? t.closest('.sys-cvh-grade') : null, h = coverHitDraft(), a = gw && Array.isArray(h[gw.dataset.grade]) ? h[gw.dataset.grade] : null, r = a && rw ? a[Number(rw.dataset.ci)] : null; if (!r) return true;
    if (c.indexOf('sys-cvh-where') >= 0) { var v = String(t.value || ''); if (v.trim()) r.row = v; else delete r.row; }
    else { var k = c.indexOf('sys-cvh-from') >= 0 ? 'from' : 'to', n = Number(t.value); if (t.value !== '' && isFinite(n)) r[k] = n; else delete r[k]; }
    markDirty(); patchErrors(); return true;
}
function coverHitClick(b) {
    var act = b.dataset && b.dataset.act || ''; if (act !== 'cvhadd' && act !== 'cvhdel') return false;
    var gw = b.closest ? b.closest('.sys-cvh-grade') : null, g = gw ? gw.dataset.grade : ''; if (['open', 'half', 'threeq', 'cover', 'total'].indexOf(g) < 0) return true;
    var h = coverHitDraft(), a = Array.isArray(h[g]) ? h[g] : (h[g] = []);
    if (act === 'cvhadd') { if (a.length >= COVER_HIT_MAX) { toast('At most ' + COVER_HIT_MAX + ' rows.'); coverHitTidy(); return true; } a.push({}); }
    else { var rw = b.closest('.sys-cvh-row'), i = rw ? Number(rw.dataset.ci) : -1; if (i >= 0 && i < a.length) a.splice(i, 1); }
    coverHitTidy(); markDirty(); patchErrors(); renderCombat(); return true;
}
function coverHitSays(cv, cm, Fx) {
    var errs = [], warns = [], SCh = window.wpSystemCore, ht = cv && typeof cv === 'object' && cv.hit && typeof cv.hit === 'object' && !Array.isArray(cv.hit) ? cv.hit : null;
    if (!ht || !SCh || typeof SCh.cleanCoverHit !== 'function') return { errs: errs, warns: warns };
    var words = { open: COVER_HIT_OPEN, half: 'Behind half cover', threeq: 'Behind three-quarters cover', cover: 'Behind cover', total: 'Behind total cover' };
    Object.keys(words).forEach(function(g) {
        var a = Array.isArray(ht[g]) ? ht[g] : []; if (a.length > COVER_HIT_MAX) errs.push({ message: words[g] + ': Save keeps the first ' + COVER_HIT_MAX + ' rows.' });
        a.slice(0, COVER_HIT_MAX).forEach(function(r, i) {
            var o = {}; o[g] = [r]; if (!SCh.cleanCoverHit(o)) { errs.push({ message: words[g] + ', row ' + (i + 1) + ': From and To are whole numbers from 1 to 100, From no more than To, with a formula on one line, so Save drops it.' }); return; }
            var p = Fx && typeof Fx.parse === 'function' ? Fx.parse(String(r.row).trim()) : null; if (p && !p.ok) warns.push({ message: words[g] + ', row ' + (i + 1) + ': Save keeps the formula, but it cannot be read, so it never holds.' });
        });
    });
    if (!(cm && cm.damage && cm.damage.locs && cm.damage.locs.list) && !(cm && cm.targetHit)) warns.push({ message: 'Where a hit lands: name a list of hit locations, or it does nothing.' });
    if (!cv.on && Object.keys(words).some(function(g) { return g !== 'open' && Array.isArray(ht[g]) && ht[g].length; })) warns.push({ message: 'Where a hit lands: with cover off only In the open counts, so the rows behind cover do nothing.' });   // 1.6.4: In the open works with cover off
    return { errs: errs, warns: warns };
}
// [split:body-end]
return { _perAt: _perAt, _priceAt: _priceAt, areaBox: areaBox, blastBox: blastBox, bodyBox: bodyBox, checkLabel: checkLabel, coverHitBox: coverHitBox, coverHitClick: coverHitClick, coverHitInput: coverHitInput, coverHitSays: coverHitSays, defendBox: defendBox, defendSays: defendSays, listNamesText: listNamesText, listOfCard: listOfCard, lookShadesOf: lookShadesOf, moneyOptions: moneyOptions, needsGmBox: needsGmBox, onAreaEdit: onAreaEdit, onBlastChange: onBlastChange, onBlastInput: onBlastInput, onDefendChange: onDefendChange, partsHostIn: partsHostIn, perOptions: perOptions, priceColOptions: priceColOptions, priceOptions: priceOptions, renderLists: renderLists, rollStationBox: rollStationBox, statKeyInput: statKeyInput, statTick: statTick };   // [split:glue]
}   // [split:glue]
