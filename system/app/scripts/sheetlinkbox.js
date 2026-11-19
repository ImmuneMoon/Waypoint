/* sheetlinkbox.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: the System editor's Linked sheets box, in the Rules tab (the [systemcheck:linkbox-*] lines). A link a line: its key,
   its name on the sheet, its kind and who sets it, with a Crew link's stations, seats, who may sit at each and which sheets it crews
   (renderLinks, onLinkInput, onLinkChange, linkClick), and what Save drops of a link, said as the cleaner reads it (linkSays). How a
   link is cleaned and judged is systemcore.js's (linkcore.js); the link bar on a sheet is sheetlink.js.
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sheetLinkBox() at
   its line `// [split:sheetlinkbox.js]`, so the body below runs in the old order, after everything above that line and before
   everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that
   reads sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses
   of sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of
   it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in sheets.js. */
// [split:of sheets.js]
import { LIMITS, LINK_NOT, checkLabel, cleanLinks, draft, el, errorCell, explainBox, input, labeledSelect, markDirty, patchErrors, segPut, tab, toast, ui, uid } from './sheets.js';   // [split:glue]
export function sheetLinkBox() {   // [split:glue]
// [split:body-start]
// [systemcheck:linkbox-start]
// 1.6.0 linked sheets in the System editor (the owner, by prompt: "Two kinds"): the Lists tab's Linked sheets box. A link a line: its key,
// which formulas read it by (Mount.Move), its name on the sheet, its kind (a Mount, one rider to one mount; a Crew link, many people to one
// vehicle) and who sets it on a sheet. None: nothing new on any sheet
var LINK_KIND_OPTS = [['mount', 'Mount: one rider'], ['crew', 'Crew: many to one vehicle']], LINK_EDIT_OPTS = [['owner', 'Its player or the GM'], ['gm', 'The GM only']];
function linkDraft() { return Array.isArray(draft.links) ? draft.links : (draft.links = []); }
function renderLinks() {
    var box = ui('sysLinks'); if (!box) return; box.textContent = '';
    var arr = Array.isArray(draft.links) ? draft.links : [], wrap = el('div', 'sys-budgets sys-links');
    wrap.appendChild(el('div', 'sys-light-head', 'Linked sheets'));
    wrap.appendChild(el('div', 'sys-note', 'A link lets one sheet read the figures of another. A Mount link holds the one mount a rider rides. A Crew link holds the vehicle a character crews, and many characters may crew one vehicle. A rule can read the linked sheet\u2019s figures, and with no link each reads 0. Each sheet shows a menu for its links under its head.'));
    arr.forEach(function(k0, i) {
        var k = k0 && typeof k0 === 'object' ? k0 : {}, rw = el('div', 'sys-flags sys-link-row'); rw.dataset.ki = String(i);
        var kl = el('label', 'sys-combat-item'); kl.appendChild(el('span', 'sys-num-cap', 'Key')); var ki = input('sys-link-key field', typeof k.key === 'string' ? k.key : '', 'The name formulas read it by: the key Mount reads Mount.Move', 'Mount'); ki.maxLength = LIMITS.key; kl.appendChild(ki); rw.appendChild(kl);
        var nl = el('label', 'sys-combat-item'); nl.appendChild(el('span', 'sys-num-cap', 'Name')); var ni = input('sys-link-label field', typeof k.label === 'string' ? k.label : '', 'Its name on the sheet. With none, the key', 'Mount'); ni.maxLength = LIMITS.label; nl.appendChild(ni); rw.appendChild(nl);
        rw.appendChild(labeledSelect('sys-link-kind field', 'Kind', LINK_KIND_OPTS, k.kind === 'crew' ? 'crew' : 'mount', 'Mount: one rider to one mount, so a mount another character rides is refused. Crew: many characters to one vehicle'));
        rw.appendChild(labeledSelect('sys-link-edit field', 'Set by', LINK_EDIT_OPTS, k.edit === 'gm' ? 'gm' : 'owner', 'Who may set it on a sheet. A player links only a character of their own. The GM links any character'));
        if (k.kind === 'mount') {   // 1.6.0: a mount reads its riders as a group, as a vehicle reads its crew
            var ml0 = el('label', 'sys-combat-item'); ml0.appendChild(el('span', 'sys-num-cap', 'Mount reads riders as')); var mi0 = input('sys-link-group field', typeof k.group === 'string' ? k.group : '', 'The key the mount\u2019s formulas read its rider by: Riders reads Riders.count and Riders.max.Riding. Blank: the mount reads no rider', 'Riders'); mi0.maxLength = LIMITS.key; ml0.appendChild(mi0); rw.appendChild(ml0);
        }
        if (k.kind === 'crew') {   // 1.6.0 (CORE gap 16): the crew as a group on the vehicle, and its stations
            var gl = el('label', 'sys-combat-item'); gl.appendChild(el('span', 'sys-num-cap', 'Vehicle reads crew as')); var gi = input('sys-link-group field', typeof k.group === 'string' ? k.group : '', 'The word the vehicle\u2019s rules use for its crew, such as Crew: how many there are, and the best or the total of a figure of theirs, at every station or at one. Blank: the vehicle reads no crew', 'Crew'); gi.maxLength = LIMITS.key; gl.appendChild(gi); rw.appendChild(gl);
            var ml = el('label', 'sys-combat-item'); ml.appendChild(el('span', 'sys-num-cap', 'One holds')); var mi = el('input', 'field sys-link-most'); mi.type = 'number'; mi.min = '1'; mi.max = '4'; mi.step = '1'; mi.value = typeof k.most === 'number' ? String(k.most) : '1'; mi.title = 'How many stations one crew member may hold at once, 1 to 4, as one hand covering a second station. Their sheet reads ' + (k.key || 'Vehicle') + '.stations as how many they hold, so a formula can take a penalty'; ml.appendChild(mi); rw.appendChild(ml);
            rw.appendChild(checkLabel('sys-link-press', k.press === true, 'Its crew may press this sheet\u2019s rolls', 'A crew member gets the vehicle\u2019s rolls on their own sheet, under this link. A press spends their own action, and the roll lands on the vehicle. A roll can name its stations in the Rolls tab'));
            rw.appendChild(checkLabel('sys-link-vturn', k.vturn === true, 'Crew act in the vehicle\u2019s turn', 'A crew member with no token in a fight counts as in the vehicle\u2019s fight. A press of theirs is judged by the vehicle\u2019s turn and spends their own action, and their actions come back as the vehicle\u2019s turn begins'));   // 1.6.2
            if (k.press === true) rw.appendChild(checkLabel('sys-link-pressnamed', k.pressNamed === true, 'Only rolls that name a station', 'Every sheet shares the system\u2019s rolls. Ticked, a crew member gets only the rolls that name a station in the Rolls tab, and no other roll can be pressed'));
            var sl = el('label', 'sys-combat-item'); sl.appendChild(el('span', 'sys-num-cap', 'Stations')); var si = input('sys-link-stations field', Array.isArray(k.stations) ? k.stations.join(', ') : '', 'Where a crew member may sit, separated by commas, each a key: Pilot, Gunner, Engineer. A crew sheet picks one beside its vehicle, and a skill counts at a station only for those there. At most 8 (systemcore LINK_STATIONS)', 'Pilot, Gunner'); si.maxLength = 240; sl.appendChild(si); rw.appendChild(sl);
            var vhL = el('label', 'sys-combat-item'); vhL.appendChild(el('span', 'sys-num-cap', 'Crewed sheets are where')); var vhI = input('sys-link-veh field', typeof k.veh === 'string' ? k.veh : '', 'Which sheets this link crews, such as one with Is a vehicle ticked. Only they show + Crew\u2026, to pick their crew from your sheets. Empty: none does', 'Crewed sheets are where'); vhI.maxLength = LIMITS.formula; vhL.appendChild(vhI); rw.appendChild(vhL);   /* 1.6.2 (218) */
            (Array.isArray(k.stations) ? k.stations : []).forEach(function(stF) { if (typeof stF !== 'string' || !stF) return; var fv0 = k.fit && typeof k.fit === 'object' ? k.fit[stF] : null; var ftL = el('label', 'sys-combat-item'); ftL.appendChild(el('span', 'sys-num-cap', 'Who may sit at ' + stF)); var ftI = input('sys-link-fit field', fv0 && typeof fv0['if'] === 'string' ? fv0['if'] : '', 'Who may sit at ' + stF + ', read on their own sheet. A player cannot seat a sheet that fails it; you may, and are told. Empty: anyone', 'Anyone'); ftI.maxLength = LIMITS.formula; ftI.dataset.st = stF; ftL.appendChild(ftI); rw.appendChild(ftL); var fwL = el('label', 'sys-combat-item'); fwL.appendChild(el('span', 'sys-num-cap', 'Why not, in words')); var fwI = input('sys-link-fitsays field', fv0 && typeof fv0.says === 'string' ? fv0.says : '', 'What a player reads when a sheet does not fit ' + stF + ', such as Only a beast that can be harnessed pulls the cart', 'Why not'); fwI.maxLength = LIMITS.needsWords; fwI.dataset.st = stF; fwL.appendChild(fwI); rw.appendChild(fwL); });   /* 1.6.2 (218): a station's filter */
            (Array.isArray(k.stations) ? k.stations : []).forEach(function(stS) { if (typeof stS !== 'string' || !stS) return; var stL = el('label', 'sys-combat-item'); stL.appendChild(el('span', 'sys-num-cap', 'Seats at ' + stS)); var stI = el('input', 'field sys-link-seat'); stI.type = 'number'; stI.min = '1'; stI.max = '99'; stI.step = '1'; stI.dataset.st = stS; var stV = k.seats && typeof k.seats === 'object' ? k.seats[stS] : undefined; stI.value = typeof stV === 'number' ? String(stV) : ''; stI.placeholder = 'Any'; stI.title = 'How many crew sheets may sit at ' + stS + ' at once. Empty: any number. A player cannot take a seat past it; you may, and are told'; stL.appendChild(stI); rw.appendChild(stL); });   // 1.6.2 (205): a seat limit a station
        }
        if ((k.kind === 'crew' || k.kind === 'mount') && typeof k.group === 'string' && k.group.trim()) {   // the core handbook session's ask 6 (2026-10-29): figures each sheet of the group works out, read as <group>.max|min|sum.<key>
            var gkW = k.group.trim(), figsW = Array.isArray(k.figs) ? k.figs : [];
            figsW.forEach(function(x0, fi) {
                var x = x0 && typeof x0 === 'object' ? x0 : {}, fl = el('label', 'sys-combat-item'); fl.appendChild(el('span', 'sys-num-cap', 'Each sheet works out'));
                var fk = input('sys-link-fkey field', typeof x.key === 'string' ? x.key : '', 'The name the group reads it by: ' + gkW + '.max.' + (x.key || 'PilotRoll') + ' reads the highest any sheet works out', 'PilotRoll'); fk.maxLength = LIMITS.key; fk.dataset.fi = String(fi); fl.appendChild(fk);
                var ff = input('sys-link-fform field', typeof x.formula === 'string' ? x.formula : '', 'A formula worked out on each sheet with its own names, such as Piloting - 2 * (' + (k.key || 'Vehicle') + '.stations > 1). No dice', 'Piloting'); ff.maxLength = LIMITS.formula; ff.dataset.fi = String(fi); fl.appendChild(ff);
                var fx = el('button', 'tool ghost sys-btn', '\u00D7'); fx.dataset.act = 'lkfdel'; fx.dataset.fi = String(fi); fx.title = 'Remove this figure'; fl.appendChild(fx); rw.appendChild(fl);
            });
            var fa = el('button', 'tool ghost sys-btn', '+ Figure'); fa.dataset.act = 'lkfadd'; fa.disabled = figsW.length >= 4; fa.title = fa.disabled ? 'At most 4 figures a link' : 'A figure each sheet of the ' + (k.kind === 'mount' ? 'riders' : 'crew') + ' works out, so that the best, the least or the total of it can be read'; rw.appendChild(fa);
        }
        [['up', '\u25B2', 'Move up'], ['down', '\u25BC', 'Move down'], ['del', '\u00D7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'lk' + bd[0]; bb.title = bd[2]; (typeof segPut === 'function' ? segPut(rw, bb) : rw.appendChild(bb)); });
        if (typeof explainBox === 'function') rw.appendChild(explainBox(k));   // 1.6.2 (backlog 218 fold 3)
        wrap.appendChild(rw);
    });
    var ad = el('button', 'tool ghost sys-btn sys-bud-add', '+ Link'); ad.dataset.act = 'lkadd'; ad.disabled = arr.length >= LIMITS.links; ad.title = ad.disabled ? 'At most ' + LIMITS.links : 'A link to another sheet: a mount, or a vehicle and its crew'; wrap.appendChild(ad);
    var err = errorCell('links'); err.dataset.errFor = 'links'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onLinkInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-link-') < 0) return false;
    if (c.indexOf('sys-link-kind') >= 0 || c.indexOf('sys-link-edit') >= 0) return true;   // their change events do the work
    var rw = t.closest('.sys-link-row'), i = rw ? +rw.dataset.ki : -1, arr = linkDraft(), k = arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!k) return true;
    if (c.indexOf('sys-link-key') >= 0) k.key = t.value.slice(0, LIMITS.key);
    else if (c.indexOf('sys-link-label') >= 0) k.label = t.value.slice(0, LIMITS.label);
    else if (c.indexOf('sys-link-group') >= 0) { var gv = t.value.slice(0, LIMITS.key); if (gv.trim()) k.group = gv; else delete k.group; }   // 1.6.0 (CORE gap 16)
    else if (c.indexOf('sys-link-most') >= 0) { var mv = Number(t.value); if (String(t.value).trim() && isFinite(mv) && Math.round(mv) >= 2) k.most = Math.min(4, Math.round(mv)); else delete k.most; }   // 1.6.0: stations one crew member may hold
    else if (c.indexOf('sys-link-stations') >= 0) { var sv = t.value.split(',').map(function(x) { return x.trim(); }).filter(Boolean); if (sv.length) k.stations = sv; else delete k.stations; }
    else if (c.indexOf('sys-link-veh') >= 0) { var vhV = t.value.slice(0, LIMITS.formula); if (vhV.trim()) k.veh = vhV; else delete k.veh; }   // 1.6.2 (218)
    else if (c.indexOf('sys-link-fitsays') >= 0 || c.indexOf('sys-link-fit') >= 0) { var ftK = String(t.dataset.st || ''); if (!ftK) return true; if (!k.fit || typeof k.fit !== 'object') k.fit = {}; var ftO = k.fit[ftK] && typeof k.fit[ftK] === 'object' ? k.fit[ftK] : (k.fit[ftK] = {}); if (c.indexOf('sys-link-fitsays') >= 0) { if (t.value.trim()) ftO.says = t.value.slice(0, LIMITS.needsWords); else delete ftO.says; } else { if (t.value.trim()) ftO['if'] = t.value.slice(0, LIMITS.formula); else delete ftO['if']; } if (!ftO['if'] && !ftO.says) delete k.fit[ftK]; if (!Object.keys(k.fit).length) delete k.fit; }   // 1.6.2 (218)
    else if (c.indexOf('sys-link-seat') >= 0) { var seK = String(t.dataset.st || ''), seV = Number(t.value); if (!seK) return true; if (!k.seats || typeof k.seats !== 'object') k.seats = {}; if (String(t.value).trim() && isFinite(seV) && Math.floor(seV) >= 1) k.seats[seK] = Math.min(99, Math.floor(seV)); else delete k.seats[seK]; if (!Object.keys(k.seats).length) delete k.seats; }   // 1.6.2 (205)
    else if (c.indexOf('sys-link-fkey') >= 0 || c.indexOf('sys-link-fform') >= 0) { var fiI = +t.dataset.fi, xF = Array.isArray(k.figs) && fiI >= 0 && fiI < k.figs.length && k.figs[fiI] && typeof k.figs[fiI] === 'object' ? k.figs[fiI] : null; if (!xF) return true; if (c.indexOf('sys-link-fkey') >= 0) xF.key = t.value.slice(0, LIMITS.key); else xF.formula = t.value.slice(0, LIMITS.formula); }   // the core handbook session's ask 6
    else return true;
    markDirty(); patchErrors(); return true;
}
function onLinkChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-link-') < 0) return false;
    if (c.indexOf('sys-link-press') >= 0 && c.indexOf('sys-link-pressnamed') < 0) { var rwP = t.closest('.sys-link-row'), arrP = linkDraft(), kP = rwP && arrP[+rwP.dataset.ki] && typeof arrP[+rwP.dataset.ki] === 'object' ? arrP[+rwP.dataset.ki] : null; if (kP) { if (t.checked) kP.press = true; else { delete kP.press; delete kP.pressNamed; } markDirty(); renderLinks(); patchErrors(); } return true; }   // 1.6.0
    if (c.indexOf('sys-link-vturn') >= 0) { var rwV = t.closest('.sys-link-row'), arrV = linkDraft(), kV = rwV && arrV[+rwV.dataset.ki] && typeof arrV[+rwV.dataset.ki] === 'object' ? arrV[+rwV.dataset.ki] : null; if (kV) { if (t.checked) kV.vturn = true; else delete kV.vturn; markDirty(); patchErrors(); } return true; }   // 1.6.2
    if (c.indexOf('sys-link-pressnamed') >= 0) { var rwN = t.closest('.sys-link-row'), arrN = linkDraft(), kN = rwN && arrN[+rwN.dataset.ki] && typeof arrN[+rwN.dataset.ki] === 'object' ? arrN[+rwN.dataset.ki] : null; if (kN) { if (t.checked) kN.pressNamed = true; else delete kN.pressNamed; markDirty(); patchErrors(); } return true; }
    if (c.indexOf('sys-link-stations') >= 0) { markDirty(); renderLinks(); patchErrors(); return true; }   // 1.6.2 (205): a seats box a station follows
    if (c.indexOf('sys-link-kind') < 0 && c.indexOf('sys-link-edit') < 0) return true;   // the boxes' change events (their input events did the work)
    var rw = t.closest('.sys-link-row'), i = rw ? +rw.dataset.ki : -1, arr = linkDraft(), k = arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!k) return true;
    if (c.indexOf('sys-link-kind') >= 0) { k.kind = t.value === 'crew' ? 'crew' : 'mount'; markDirty(); renderLinks(); patchErrors(); return true; }   // 1.6.0 (CORE gap 16): a Crew link's own boxes follow
    else k.edit = t.value === 'gm' ? 'gm' : 'owner';
    markDirty(); patchErrors(); return true;
}
function linkClick(b) {
    var mf = /^lkf(add|del)$/.exec(b.dataset.act || '');   // the core handbook session's ask 6: a group's figures
    if (mf) {
        var arrF = linkDraft(), rwF = b.closest('.sys-link-row'), iF = rwF ? +rwF.dataset.ki : -1, kF = arrF[iF] && typeof arrF[iF] === 'object' ? arrF[iF] : null; if (!kF) return true;
        var fs0 = Array.isArray(kF.figs) ? kF.figs : (kF.figs = []);
        if (mf[1] === 'add') { if (fs0.length >= 4) return true; fs0.push({ key: '', formula: '' }); } else { var fiD = +b.dataset.fi; if (fiD >= 0 && fiD < fs0.length && Math.floor(fiD) === fiD) fs0.splice(fiD, 1); }
        if (!fs0.length) delete kF.figs;
        markDirty(); renderLinks(); patchErrors(); return true;
    }
    var m = /^lk(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var arr = linkDraft(), rw = b.closest('.sys-link-row'), i = rw ? +rw.dataset.ki : -1;
    if (m[1] === 'add') { if (arr.length >= LIMITS.links) { toast('At most ' + LIMITS.links + '.'); return true; } arr.push({ id: uid('lk_'), key: arr.some(function(x) { return x && String(x.key).toLowerCase() === 'mount'; }) ? '' : 'Mount', label: '', kind: 'mount', edit: 'owner' }); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    if (!arr.length) delete draft.links;
    markDirty(); renderLinks(); patchErrors(); return true;
}
// What Save drops of the links, read as the cleaner reads them, and a key a field of the system already has (that field keeps the name)
function linkSays(links, fields, F0) {
    var errs = [], warns = [], seen = {}, fk = {};
    (Array.isArray(fields) ? fields : []).forEach(function(f) { if (f && typeof f.key === 'string') fk[f.key.toLowerCase()] = f.label || f.key; });
    var fk2 = function(l) { return Object.prototype.hasOwnProperty.call(fk, l) ? fk[l] : ''; };
    (Array.isArray(links) ? links : []).forEach(function(k, i) {
        var nm = 'Link ' + (i + 1);
        if (i >= LIMITS.links) { if (i === LIMITS.links) errs.push({ message: 'At most ' + LIMITS.links + ' links: Save drops the rest.' }); return; }
        if (!k || typeof k !== 'object') return;
        var key = typeof k.key === 'string' ? k.key : '', lk = key.toLowerCase();
        if (!key.trim()) { errs.push({ message: nm + ': it needs a key, such as Mount. Save drops it.' }); return; }
        if (/[.\s]/.test(key)) { errs.push({ message: nm + ': a key has no dot and no space. Save drops it.' }); return; }
        if (LINK_NOT[lk]) { errs.push({ message: nm + ': formulas read ' + key + ' already. Pick another key. Save drops it.' }); return; }
        if (seen[lk]) { errs.push({ message: nm + ': another link has the key ' + key + '. Save drops it.' }); return; }
        if (!cleanLinks([{ id: 'lk_check', key: key, kind: 'mount' }], F0)) { errs.push({ message: nm + ': a key is letters, digits and underscores, starting with a letter. Save drops it.' }); return; }
        seen[lk] = 1;
        if (fk[lk]) warns.push({ message: nm + ': the field ' + fk[lk] + ' has the key ' + key + ', so formulas read that field, not the linked sheet.' });
        if ((k.kind === 'crew' || k.kind === 'mount') && typeof k.group === 'string' && k.group.trim()) {   // 1.6.0 (CORE gap 16): the crew's key on the vehicle (a mount's riders' too), read as cleanLinks reads it
            var gk = k.group.trim(), lg = gk.toLowerCase();
            if (/[.\s]/.test(gk) || LINK_NOT[lg] || seen[lg] || !cleanLinks([{ id: 'lk_check', key: gk, kind: 'mount' }], F0)) errs.push({ message: nm + ': the ' + (k.kind === 'mount' ? 'mount reads its riders' : 'vehicle reads its crew') + ' by a key of letters, digits and underscores, starting with a letter, that no other link has. Save drops ' + gk + '.' });
            else { seen[lg] = 1; if (fk[lg]) warns.push({ message: nm + ': the field ' + fk[lg] + ' has the key ' + gk + ', so formulas read that field, not the ' + (k.kind === 'mount' ? 'riders' : 'crew') + '.' }); }
        }
        if ((k.kind === 'crew' || k.kind === 'mount') && Array.isArray(k.figs) && k.figs.length) {   // the core handbook session's ask 6: a group's figures, read as cleanLinks reads them
            var hasG = typeof k.group === 'string' && k.group.trim();
            if (!hasG) warns.push({ message: nm + ': its figures need the key the ' + (k.kind === 'mount' ? 'mount reads its riders' : 'vehicle reads its crew') + ' by. Save drops them.' });
            else { var fSeen = {}; k.figs.forEach(function(x, fi) {
                var fk = x && typeof x.key === 'string' ? x.key.trim() : '', fl = fk.toLowerCase(), cl = cleanLinks([{ id: 'lk_check', key: 'LinkCheck', kind: 'crew', group: 'GroupCheck', figs: [{ key: fk, formula: x && typeof x.formula === 'string' ? x.formula : '' }] }], F0);
                if (fi >= 4 || fSeen[fl] || !(cl && cl[0].figs)) warns.push({ message: nm + ': a figure is a key of letters, digits and underscores, never count, max, min, sum or has, once each, and a formula with no dice, 4 at most. Save drops ' + (fk || 'one with no key') + '.' });
                else if (fk2(fl)) warns.push({ message: nm + ': the field ' + fk2(fl) + ' has the key ' + fk + ', so ' + k.group.trim() + '.max.' + fk + ' reads the figure, not that field.' });
                fSeen[fl] = 1;
            }); }
        }
        if (k.kind === 'crew' && Array.isArray(k.stations)) {
            var sSeen = {}, bad = k.stations.filter(function(s, si) { var t = String(s).trim(), l = t.toLowerCase(), no = si >= 8 || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(t) || ['count', 'max', 'min', 'sum', 'has'].indexOf(l) >= 0 || sSeen[l]; sSeen[l] = 1; return no; });
            if (bad.length) warns.push({ message: nm + ': a station is a key of letters, digits and underscores, starting with a letter, once each, never count, max, min, sum or has, and 8 at most. Save drops ' + bad.join(', ') + '.' });
        }
    });
    return { errs: errs, warns: warns };
}
// [systemcheck:linkbox-end]
// [split:body-end]
return { linkClick: linkClick, linkSays: linkSays, onLinkChange: onLinkChange, onLinkInput: onLinkInput, renderLinks: renderLinks };   // [split:glue]
}   // [split:glue]
