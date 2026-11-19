'use strict';
/* linkcheck.js: linked sheets, the tests that came out of systemcheck.js and netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md,
   area 3, "Tests move with their area", 2026-11-18). A linked sheet is a sheet that reads another: a Mount link (one rider to one mount)
   or a Crew link (many people to one vehicle), and a row joined to a sheet (Rows are sheets). The code lives in parts of the giant
   scripts, each read here by its own name: linkcore.js, linkseatcore.js and rowsheetcore.js (parts of systemcore.js), imported from a
   private copy of systemcore.js and its parts (tools/checkkit.js fresh) so each runs as the module it is with the real split wiring;
   netlink.js (a part of net.js), whose linktell lines the host's blocks cut by its name; and sheetlink.js and sheetlinkbox.js (parts
   of sheets.js), whose link bar, sources, + Crew list and Linked sheets box are cut by their names (kit.part and kit.cut). Slices of
   other areas (the roll-req branch, the fight's orders, the char-link branch, the crew who act in a vehicle's turn) still read the
   joined net.js through srcjoin, as the suites always have.
   What it covers, each block as it stood in its giant: from systemcheck.js, a crew sheet's stations and the figures a vehicle reads of
   its crew (CORE gap 16), the figures each crew sheet works out (ask 6) and the vehicle name read inside one, a crew sheet's own
   station, a mount reading its rider as a group, linked sheets on the sheet and in the System editor, who may sit at a station and
   which sheets are crewed (backlog 218 fold 1), and a station's seats (backlog 205); from netcheck.js, a crew member pressing a
   vehicle's roll on the host, a player's link set on the host with the figures an owner's copy carries and the copy sent again when
   a linked sheet moves, a crew figure that reads the vehicle doing the reading, and the crew who act in the vehicle's turn.
   Usage: node tools/linkcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('system'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
const j = v => JSON.stringify(v);
// netcheck's slice helpers over the joined net.js; a call that names a part's file (netlink.js) reads that part by its own name
const { src, between } = kit.netSlices('linkcheck');
const ordersSrc = between('// [netcheck:orders-start]', '// [netcheck:orders-end]', 'orders');
check('linkcheck: netlink.js is a part of net.js, and sheetlink.js and sheetlinkbox.js parts of sheets.js, each read by its own name', kit.part('netlink.js').includes('// [netcheck:linktell-start]') && kit.part('sheetlink.js').includes('// [systemcheck:crewpick-start]') && kit.part('sheetlinkbox.js').includes('// [systemcheck:linkbox-start]'));

(async () => {
    // The area's parts are imported by their own names from a private copy of systemcore.js and its parts (kit.fresh), so each runs as
    // the module it is, with the real split wiring, entered from the part as parsecheck enters it; their functions are then run through
    // systemcore.js, which installs the parts and is the only way to reach them
    const real = kit.fresh('systemcore.js', 'linkcheck');
    let P1 = null, P2 = null, P3 = null, S = null, F = null, err = null;
    try { P1 = await import(real('linkcore.js')); P2 = await import(real('linkseatcore.js')); P3 = await import(real('rowsheetcore.js')); S = await import(real('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('linkcheck: linkcore.js, linkseatcore.js and rowsheetcore.js load by name as modules of their own in Node with no window, each with the install systemcore.js calls, and systemcore.js installs them', !!P1 && typeof P1.linkCore === 'function' && !!P2 && typeof P2.linkSeatCore === 'function' && !!P3 && typeof P3.rowSheetCore === 'function' && !!S && typeof S.linkSet === 'function' && typeof S.seatsFull === 'function' && typeof S.rowSheetSet === 'function', err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, validKey, cleanField, cleanSystem, cleanValue, cleanChar, cleanCharEdit, makeResolver, resolveAll, hoverLines, validateSystem, charFor, applyEdit, autoLayout, emptySystem } = S;   // the names systemcheck.js unpacks, which its blocks read

    {   // 1.6.0 (CORE gap 16; the owner, by prompt: "they have to be assigned to piloting for their skill to be available", stations "On the link", "Players' view, as links"): a vehicle reads its crew as a group, on invented data
        const J = v => JSON.stringify(v);
        const rawC = { v: 1, name: 'C', rolls: [], fields: [{ id: 'f_pi', key: 'Piloting', kind: 'number', def: 0, vis: 'all' }, { id: 'f_gu', key: 'Gunnery', kind: 'number', def: 0, vis: 'all' }, { id: 'f_se', key: 'Secret', kind: 'number', def: 0, vis: 'gm' },
            { id: 'f_he', key: 'Helm', kind: 'formula', formula: 'Crew.Pilot.max.Piloting', vis: 'all' }, { id: 'f_ha', key: 'Hands', kind: 'formula', formula: 'Crew.count', vis: 'all' }, { id: 'f_gn', key: 'Guns', kind: 'formula', formula: 'Crew.Gunner.sum.Gunnery', vis: 'all' },
            { id: 'f_be', key: 'Best', kind: 'formula', formula: 'Crew.max.Piloting', vis: 'all' }, { id: 'f_lo', key: 'Low', kind: 'formula', formula: 'Crew.min.Piloting + Crew.Pilot.count', vis: 'all' }, { id: 'f_sp', key: 'Spy', kind: 'formula', formula: 'Crew.max.Secret', vis: 'all' }],
            links: [{ id: 'lk_v', key: 'Vehicle', kind: 'crew', group: 'Crew', stations: ['Pilot', 'Gunner', 'count', 'pilot', 'two words', 'X.Y'] }, { id: 'lk_m', key: 'Mount', kind: 'mount', group: 'Herd', stations: ['Saddle'] }, { id: 'lk_w', key: 'Wagon', kind: 'crew', group: 'Vehicle' }],
            sheet: { sections: [] } };
        const g = cleanSystem(rawC, { F, gmView: true }), p = cleanSystem(rawC, { F, gmView: false });
        const cleanOk = J(g.links) === J([{ id: 'lk_v', key: 'Vehicle', label: 'Vehicle', kind: 'crew', edit: 'owner', group: 'Crew', stations: ['Pilot', 'Gunner'] }, { id: 'lk_m', key: 'Mount', label: 'Mount', kind: 'mount', edit: 'owner', group: 'Herd' }, { id: 'lk_w', key: 'Wagon', label: 'Wagon', kind: 'crew', edit: 'owner' }]) && J(p.links) === J(g.links);   // a Mount link keeps its group since 1.6.0's riders (moved on purpose); never its stations
        const chars = { c_ship: { id: 'c_ship', name: 'Skiff', ownerId: 'u_a', values: {} },
            c_ana: { id: 'c_ana', name: 'Ana', ownerId: 'u_a', values: { f_pi: 12, f_gu: 9 }, links: { lk_v: 'c_ship' }, stn: { lk_v: 'Pilot' } },
            c_bo: { id: 'c_bo', name: 'Bo', ownerId: 'u_b', values: { f_pi: 14, f_gu: 11, f_se: 20 }, links: { lk_v: 'c_ship' }, stn: { lk_v: 'gunner' } },
            c_cy: { id: 'c_cy', name: 'Cy', npc: true, values: { f_pi: 16, f_gu: 5, f_se: 30 }, links: { lk_v: 'c_ship' }, stn: { lk_v: 'Pilot' } } };
        S.setCrewSource((id, lid, s) => Object.keys(chars).map(k => chars[k]).filter(x => x.links && x.links[lid] === id).map(x => s === g ? x : S.charForView(x, s, { full: g })));
        const rG = makeResolver(g, chars.c_ship, F), gmV = ['Helm', 'Hands', 'Guns', 'Best', 'Low', 'Spy', 'Crew.Gunner.count', 'Crew.Engineer.count', 'Crew.max.Nope'].map(n => rG(n));
        const rA = makeResolver(g, chars.c_ana, F), depth = [rA('Piloting'), makeResolver(g, chars.c_ana, F)('Crew.count')];
        const rP = makeResolver(p, S.charForView(chars.c_ship, p, { full: g }), F), plV = [rP('Helm'), rP('Hands'), rP('Crew.max.Secret'), rP('Crew.Pilot.max.Secret')];
        check('CORE gap 16: a Crew link keeps the key the vehicle reads its crew by (group) and its stations (keys, once each, never count, max, min, sum or has), a Mount link its group alone (since its riders, moved on purpose), a key another link holds never; on the vehicle Crew.count is its crew, Crew.max|min|sum.<name> a figure over them, and Crew.<Station>.<the same> over those at that station alone, a station matched in any case (the best Pilot 16 of Ana 12 and Cy 16, never Bo\'s 14 at the Gunner station; the Gunners\' Gunnery summed, 11); a station the link lacks is unknown, and a name no sheet has reads 0 (the validator says it is unknown); a crew sheet reads no crew of its own; through the players\' view each crew sheet is read as players see it, so a GM-only figure never counts (0)',
            cleanOk && J(gmV) === J([16, 3, 11, 16, 14, 30, 1, undefined, 0]) && J(depth) === J([12, 0]) && J(plV) === J([16, 3, 0, 0]), J([g.links, gmV, depth, plV]));
        const own = Object.assign(S.charFor(chars.c_ship, p, 'u_a', {}), {}), ck = S.crewFigs(p, own, F), withCk = cleanChar(Object.assign({}, own, { ck: ck }), p, { state: 'owner' }), noCk = cleanChar(Object.assign({}, own, { ck: ck }), p, {});
        S.setCrewSource(null); const rCk = makeResolver(p, withCk, F), figV = [rCk('Helm'), rCk('Hands'), rCk('Guns'), rCk('Best'), rCk('Low'), makeResolver(p, noCk, F)('Hands')];
        const ckBad = S.cleanCk({ lk_v: { v: { count: 3, 'x y': 1, constructor: 2, 'max.piloting': 'x', 'gunner.sum.gunnery': 4 } }, lk_m: { v: { count: 9 } }, lk_zz: { v: {} } }, p);
        check('CORE gap 16: a player\'s vehicle reads the figures its host worked out through the players\' view (crewFigs: each name the players\' view writes under Crew, never Crew.max.Secret, which the view blanks), kept only on its owner\'s copy (cleanCk: numbers under names no prototype holds, a Crew link\'s or, since a mount reads its riders, a Mount link\'s with a group alone, moved on purpose); with neither source nor figures every group read is 0',
            J(ck) === J({ lk_v: { v: { 'pilot.max.piloting': 16, count: 3, 'gunner.sum.gunnery': 11, 'max.piloting': 16, 'min.piloting': 12, 'pilot.count': 2 } }, lk_m: { v: {} } }) && J(figV) === J([16, 3, 11, 16, 14, 0]) && !('ck' in noCk)
            && J(ckBad) === J({ lk_v: { v: { count: 3, 'gunner.sum.gunnery': 4 } }, lk_m: { v: { count: 9 } } }), J([ck, figV, ckBad]));
        const ls = (c, to, o) => S.linkSet(g, chars, c, 'lk_v', to, o || {});
        const sets = [ls(chars.c_bo, 'c_ship', { stn: 'pilot' }), ls(chars.c_bo, 'c_ship', { stn: 'Engineer' }), ls(chars.c_bo, 'c_ship', { stn: '' }), ls(chars.c_bo, 'c_ship'), ls(chars.c_bo, ''), ls({ id: 'c_new', name: 'N', values: {} }, 'c_ship'), ls(chars.c_ana, 'c_ship', { player: true, pid: 'u_a', stn: 'Gunner' })];
        const from = S.linkedFrom(g, chars, 'c_ship'), cs2 = JSON.parse(J(chars)), drop = S.linksDrop(cs2, 'c_ship');
        const wire = [S.cleanCharLink({ rid: 'r1', charId: 'c_ana', linkId: 'lk_v', to: 'c_ship', stn: 'Pilot' }), S.cleanCharLink({ rid: 'r1', charId: 'c_ana', linkId: 'lk_v', to: 'c_ship', stn: '' }), S.cleanCharLink({ rid: 'r1', charId: 'c_ana', linkId: 'lk_v', to: 'c_ship', stn: 'two words' }), S.cleanCharLink({ rid: 'r1', charId: 'c_ana', linkId: 'lk_v', to: 'c_ship', stn: 3 })];
        const kept = cleanChar({ id: 'c_x', name: 'X', values: {}, links: { lk_v: 'c_ship', lk_m: 'c_ana' }, stn: { lk_v: 'PILOT', lk_m: 'Saddle', lk_q: 'Pilot' } }, g), unl = cleanChar({ id: 'c_x', name: 'X', values: {}, stn: { lk_v: 'Pilot' } }, g);
        check('CORE gap 16: linkSet judges a station with the link (one of the link\'s stations in its own spelling, \'\' none; none given keeps it; off the vehicle it goes; one it lacks refused with its words; answered only where there is or was one); the vehicle\'s Crew row says each one\'s station; a character gone takes its crew\'s stations with its links; the wire carries a station as a key or \'\'; a sheet keeps a station only of a Crew link it holds',
            J(sets[0]) === J({ ok: true, links: { lk_v: 'c_ship' }, stn: { lk_v: 'Pilot' } }) && sets[1].ok === false && sets[1].msg === 'That station is not on Vehicle.' && J(sets[2]) === J({ ok: true, links: { lk_v: 'c_ship' }, stn: null })
            && J(sets[3].stn) === J({ lk_v: 'Gunner' }) && J(sets[4]) === J({ ok: true, links: null, stn: null }) && J(sets[5]) === J({ ok: true, links: { lk_v: 'c_ship' } }) && J(sets[6].stn) === J({ lk_v: 'Gunner' })
            && J(from) === J([{ link: g.links[0], by: [{ id: 'c_ana', name: 'Ana', stn: 'Pilot' }, { id: 'c_bo', name: 'Bo', stn: 'gunner' }, { id: 'c_cy', name: 'Cy', stn: 'Pilot' }] }]) && J(drop) === J(['c_ana', 'c_bo', 'c_cy']) && !('stn' in cs2.c_ana) && !('links' in cs2.c_ana)
            && wire[0].stn === 'Pilot' && wire[1].stn === '' && wire[2] === null && wire[3] === null && J(kept.stn) === J({ lk_v: 'Pilot' }) && !('stn' in unl),
            J([sets, from, drop, wire, kept.stn]));
        const vC = validateSystem(g, F), says = id => vC.errors.concat(vC.warnings).filter(e => e.id === id).map(e => e.message);
        const vBad = validateSystem(cleanSystem(Object.assign({}, rawC, { fields: rawC.fields.concat([{ id: 'f_nn', key: 'Bad', kind: 'formula', formula: 'Crew.Engineer.max.Piloting + Crew.max.Nope + Crew.Pilot' }]) }), { F, gmView: true }), F);
        check('CORE gap 16: the validator knows the group reads as numbers of the crew sheets, never an edge of a loop; one that reads a GM-only figure is GM only, and the GM-only judges read Crew.Pilot.max.Piloting as Piloting; a station the link lacks, a name no sheet has and a station with no count or figure are unknown',
            !vC.errors.length && J(says('f_sp')) === J(['"Crew.max.Secret" is GM only: players will see an error for this field.']) && ['f_he', 'f_ha', 'f_gn', 'f_be', 'f_lo'].every(id => !says(id).length)
            && S.linkBare(g, null, 'Crew.Pilot.max.Piloting') === 'Piloting' && S.linkBare(g, null, 'Crew.count') === 'Crew.count'
            && vBad.errors.filter(e => e.id === 'f_nn').map(e => e.message.split(' \u2014')[0]).join('|') === 'Unknown name "Crew.Engineer.max.Piloting"|Unknown name "Crew.max.Nope"|Unknown name "Crew.Pilot"', J([vC.errors, vC.warnings, vBad.errors]));
        const slC = kit.part('sheetlink.js'), sbC = kit.part('sheetlinkbox.js'), nlC = kit.part('netlink.js');   // the parts its pins stand in, each read by its own name
        const nC =fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), ixC = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const ntC = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
        const raw2 = JSON.parse(J(rawC)); raw2.links[0].most = 9; raw2.fields.push({ id: 'f_pr', key: 'PilotRoll', kind: 'formula', formula: 'Piloting - 2 * (Vehicle.stations > 1)', vis: 'all' });
        const g2 = cleanSystem(raw2, { F, gmView: true }), raw1 = JSON.parse(J(rawC)); raw1.links[0].most = 1; const g1 = cleanSystem(raw1, { F, gmView: true });
        const ch2 = JSON.parse(J(chars)); ch2.c_bo.stn = { lk_v: ['Gunner', 'pilot'] };
        S.setCrewSource((id, lid, s) => Object.keys(ch2).map(k => ch2[k]).filter(x => x.links && x.links[lid] === id));
        const rV2 = makeResolver(g2, ch2.c_ship, F), two = [rV2('Crew.Pilot.count'), rV2('Crew.Gunner.count'), rV2('Crew.Pilot.max.Piloting'), rV2('Crew.count')], held = [makeResolver(g2, ch2.c_bo, F)('Vehicle.stations'), makeResolver(g2, ch2.c_ana, F)('Vehicle.stations'), makeResolver(g2, ch2.c_ship, F)('Vehicle.stations'), makeResolver(g2, ch2.c_bo, F)('PilotRoll'), makeResolver(g2, ch2.c_ana, F)('PilotRoll')];
        S.setCrewSource(null);
        const sets2 = [S.linkSet(g2, ch2, ch2.c_ana, 'lk_v', 'c_ship', { stn: ['gunner', 'Pilot', 'Gunner'] }), S.linkSet(g, ch2, ch2.c_ana, 'lk_v', 'c_ship', { stn: ['Gunner', 'Pilot'] }), S.linkSet(g2, ch2, ch2.c_ana, 'lk_v', 'c_ship', { stn: ['Pilot', 'Helm'] }), S.linkSet(g2, ch2, ch2.c_bo, 'lk_v', 'c_ship')];
        const kept2 = [cleanChar(ch2.c_bo, g2).stn, cleanChar(ch2.c_bo, g).stn], wire2 = [S.cleanCharLink({ rid: 'r1', charId: 'c_bo', linkId: 'lk_v', to: 'c_ship', stn: ['Pilot', 'Gunner'] }), S.cleanCharLink({ rid: 'r1', charId: 'c_bo', linkId: 'lk_v', to: 'c_ship', stn: Array.from({ length: 41 }, (_, i) => 'S' + i) }), S.cleanCharLink({ rid: 'r1', charId: 'c_bo', linkId: 'lk_v', to: 'c_ship', stn: [] })];
        const v2 = validateSystem(g2, F);
        check('CORE gap 16, a short crew (the core\'s ruling: one hand may cover a second station at -2 to both): a Crew link\'s most, how many stations one sheet may hold, kept from 2 up to its stations and 4 (9 reads 2, 1 none); a sheet holding two counts at each; its own sheet reads Vehicle.stations as how many it holds (2, 1, 0 with no link), so PilotRoll takes its -2; linkSet takes a list of stations, refusing more than most, one the link lacks, or two where most is one; a sheet keeps two stations only where the link allows, else its first; the wire carries a list of one to forty',
            g2.links[0].most === 2 && !('most' in g1.links[0]) && J(two) === J([3, 1, 16, 3]) && J(held) === J([2, 1, 0, 12, 12])
            && J(sets2[0].stn) === J({ lk_v: ['Gunner', 'Pilot'] }) && sets2[1].ok === false && sets2[1].msg === 'One station at a time on Vehicle.' && sets2[2].ok === false && J(sets2[3].stn) === J({ lk_v: ['Gunner', 'Pilot'] })
            && J(kept2) === J([{ lk_v: ['Gunner', 'Pilot'] }, { lk_v: 'Gunner' }]) && J(wire2[0].stn) === J(['Pilot', 'Gunner']) && wire2[1] === null && wire2[2] === null && !v2.errors.length,
            J([g2.links[0], two, held, sets2, kept2, wire2, v2.errors]));
        check('CORE gap 16 is wired and said (source): the sheet registers the crew source, through the same projection as a linked sheet; a crew sheet\'s station menu beside its vehicle sends its pick through setLink; the vehicle redraws with its crew; the host judges the station with the link and sends a vehicle\'s owner its crew figures where they moved; the Links box has the group key and the stations; Help and both 1.6.0 notes say it',
            slC.includes("if (typeof setCrewSource === 'function') setCrewSource(crewSource);") && slC.includes("var o = linkSource(cid, sys); if (o) out.push(o);") && slC.includes("setLink(c.id, k.id, cur, nx.length > 1 ? nx : (nx[0] || ''));") && sbC.includes("el('input', 'field sys-link-most')")
            && slC.includes("var v = k && (k.kind === 'crew' || k.kind === 'mount') && k.group && c0 && c0.links ? c0.links[k.id] : '';") && sbC.includes("input('sys-link-group field'") && sbC.includes("input('sys-link-stations field'")
            && nlC.includes("if (S.crewFigs) { var ck = S.crewFigs(view, v, window.wpFormula); if (ck) v.ck = ck; }") && nlC.includes("var sig = JSON.stringify(v.ck || null), key = c.peer + '|' + vid; if (_ckSent[key] === sig) return; _ckSent[key] = sig;") && nC.includes("if (resK.stn) chK.stn = resK.stn; else delete chK.stn;")
            && ixC.includes('<li>A Crew link&rsquo;s <b>Vehicle reads crew as</b> is the key the vehicle reads its crew by') && ntC.every(t => t.indexOf('- A vehicle can read its crew as a group') > 0 && t.indexOf('- A vehicle can read its crew as a group') < t.indexOf('WAYPOINT 1.5.')));
    }
    {   // the core handbook session's ask 6 (2026-10-29): a figure each crew sheet works out, read by the vehicle as <group>.max|min|sum.<key>, on invented data
        const J = v => JSON.stringify(v);
        const figsRaw = [{ key: 'PilotRoll', formula: 'Piloting - 2 * (Vehicle.stations > 1)' }, { key: 'Spied', formula: 'Secret + 1' }, { key: 'count', formula: '1' }, { key: 'Dice', formula: '1d6' }, { key: 'two words', formula: '1' }, { key: 'pilotroll', formula: '2' }, { key: 'Odd', formula: 'Piloting +' }];
        const rawF = { v: 1, name: 'F', rolls: [], fields: [{ id: 'f_pi', key: 'Piloting', kind: 'number', def: 0, vis: 'all' }, { id: 'f_se', key: 'Secret', kind: 'number', def: 0, vis: 'gm' },
            { id: 'f_he', key: 'Helm', kind: 'formula', formula: 'Crew.Pilot.max.PilotRoll', vis: 'all' }, { id: 'f_lo', key: 'LowRoll', kind: 'formula', formula: 'Crew.min.pilotroll + Crew.sum.PilotRoll', vis: 'all' }, { id: 'f_sp', key: 'Spy', kind: 'formula', formula: 'Crew.max.Spied', vis: 'all' }],
            links: [{ id: 'lk_v', key: 'Vehicle', kind: 'crew', group: 'Crew', stations: ['Pilot', 'Gunner'], most: 2, figs: figsRaw }, { id: 'lk_m', key: 'Mount', kind: 'mount', figs: [{ key: 'X', formula: '1' }] }], sheet: { sections: [] } };
        const gF = cleanSystem(rawF, { F, gmView: true }), pF = cleanSystem(rawF, { F, gmView: false });
        const cleanF = J(gF.links[0].figs) === J([{ key: 'PilotRoll', formula: 'Piloting - 2 * (Vehicle.stations > 1)' }, { key: 'Spied', formula: 'Secret + 1' }]) && !('figs' in gF.links[1]) && J(pF.links[0].figs) === J([gF.links[0].figs[0]])
            && J(cleanSystem(gF, { F, gmView: true })) === J(gF) && J(cleanSystem(pF, { F, gmView: false })) === J(pF);
        const chF = { c_ship: { id: 'c_ship', name: 'Skiff', ownerId: 'u_a', values: {} },
            c_ana: { id: 'c_ana', name: 'Ana', ownerId: 'u_a', values: { f_pi: 12 }, links: { lk_v: 'c_ship' }, stn: { lk_v: 'Pilot' } },
            c_bo: { id: 'c_bo', name: 'Bo', ownerId: 'u_b', values: { f_pi: 15, f_se: 20 }, links: { lk_v: 'c_ship' }, stn: { lk_v: ['Gunner', 'Pilot'] } },
            c_cy: { id: 'c_cy', name: 'Cy', npc: true, values: { f_pi: 11, f_se: 30 }, links: { lk_v: 'c_ship' }, stn: { lk_v: 'Gunner' } } };
        S.setCrewSource((id, lid, s) => Object.keys(chF).map(k => chF[k]).filter(x => x.links && x.links[lid] === id).map(x => s === gF ? x : S.charForView(x, s, { full: gF })));
        const rGF = makeResolver(gF, chF.c_ship, F), gmVF = ['Helm', 'LowRoll', 'Spy', 'Crew.Gunner.max.PilotRoll', 'Crew.max.Piloting'].map(n => rGF(n));
        const rPF = makeResolver(pF, S.charForView(chF.c_ship, pF, { full: gF }), F), plVF = [rPF('Helm'), rPF('Crew.max.Spied')];
        const privF = [S.gmEffectNames(rGF, [{ name: 'Crew.max.Spied' }]), S.gmEffectNames(rGF, [{ name: 'Crew.max.PilotRoll' }]), S.gmOnlyNames(gF, [{ name: 'Crew.max.Spied' }, { name: 'Crew.Pilot.max.PilotRoll' }]), S.gmDerivedNames(gF, F, ['Crew.max.Spied', 'Crew.max.PilotRoll', 'Spy'])];
        S.setCrewSource(null);
        const vF = validateSystem(gF, F), vOddF = validateSystem(Object.assign({}, gF, { links: [Object.assign({}, gF.links[0], { figs: [{ key: 'Bad', formula: 'Nope + 1' }] })] }), F);
        check('the core handbook session\'s ask 6 (2026-10-29): a Crew link may name figures (figs: a key and a formula with no dice, 4 at most, a key once, never count, max, min, sum or has; only beside a group; the same in both views but where the players\' view drops one read from a GM-only value; a fixed point); each crew sheet works the formula out with its own names, and Crew.max|min|sum.<key> and the same under a station read it over them, its key in any case (Bo holds two stations, so his PilotRoll is 13: the best Pilot is 13 over Ana\'s 12; the lowest 11 and the sum 36; at the Gunner station 13); the validator knows the reads and checks each figure\'s formula; a figure read from a GM-only value keeps a public roll private and is GM-only to the judges, judged by what its formula reads; through the players\' view such a figure reads 0',
            cleanF && J(gmVF) === J([13, 47, 31, 13, 15]) && J(plVF) === J([13, 0]) && J(privF) === J([['Crew.max.Spied'], [], ['Crew.max.Spied'], ['Crew.max.Spied', 'Spy']])
            && !vF.errors.length && vOddF.errors.some(e => e.id === 'lk_v' && /Unknown name "Nope"/.test(e.message)), J([gF.links, pF.links, gmVF, plVF, privF, vF.errors, vOddF.errors]));
        const shF = require('./checkkit').part('sheetlinkbox.js');   // the System editor's Linked sheets box, sheetlinkbox.js, read by its own name
        const LSF = new Function('LIMITS', 'LINK_NOT', 'cleanLinks', require('./checkkit').cut('sheetlinkbox.js', 'function linkSays(', '// [systemcheck:linkbox-end]') + '\nreturn linkSays;')(S.LIMITS, S.LINK_NOT, (r, F0) => S.cleanLinks(r, F0));
        const saysF = LSF([{ id: 'lk_v', key: 'Vehicle', kind: 'crew', group: 'Crew', figs: [{ key: 'PilotRoll', formula: 'Piloting - 2' }, { key: 'count', formula: '1' }, { key: 'Dice', formula: '1d6' }, { key: 'Piloting', formula: '1' }] }, { id: 'lk_m', key: 'Mount', kind: 'mount', figs: [{ key: 'X', formula: '1' }] }], [{ key: 'Piloting', label: 'Piloting' }], F).warns.map(w => w.message);
        const a0F = shF.indexOf('function linkClick(b) {'), a1F = shF.indexOf('\n}\n', a0F) + 3, d0F = shF.indexOf('function linkDraft() {'), d1F = shF.indexOf('\n', d0F);   // shF: sheetlinkbox.js
        const draftF = { links: [{ id: 'lk_v', key: 'Vehicle', kind: 'crew', group: 'Crew' }] }, btnF = (act, fi) => ({ dataset: { act, fi: fi === undefined ? undefined : String(fi) }, closest: () => ({ dataset: { ki: '0' } }) });
        const LCF = new Function('draft', 'markDirty', 'renderLinks', 'patchErrors', 'toast', 'uid', 'LIMITS', shF.slice(d0F, d1F) + '\n' + shF.slice(a0F, a1F) + '\nreturn linkClick;')(draftF, () => {}, () => {}, () => {}, () => {}, p => p + 'x', S.LIMITS);
        LCF(btnF('lkfadd')); LCF(btnF('lkfadd')); const twoF = J(draftF.links[0].figs); LCF(btnF('lkfdel', 0)); LCF(btnF('lkfdel', 0)); const noneF = !('figs' in draftF.links[0]);
        for (let i = 0; i < 6; i++) LCF(btnF('lkfadd')); const capF = draftF.links[0].figs.length;
        check('the core handbook session\'s ask 6 in the System editor: the Linked sheets box says what Save drops of a figure (a key formulas use, one that rolls dice, figures with no group) and that a figure keyed like a field is read in its place; + Figure adds one, four at most, and \u00d7 takes it away, the last leaving none; the boxes, Help, the guide and both 1.6.0 notes pinned',
            J(saysF) === J(['Link 1: a figure is a key of letters, digits and underscores, never count, max, min, sum or has, once each, and a formula with no dice, 4 at most. Save drops count.', 'Link 1: a figure is a key of letters, digits and underscores, never count, max, min, sum or has, once each, and a formula with no dice, 4 at most. Save drops Dice.', 'Link 1: the field Piloting has the key Piloting, so Crew.max.Piloting reads the figure, not that field.', 'Link 2: its figures need the key the mount reads its riders by. Save drops them.'])
            && twoF === J([{ key: '', formula: '' }, { key: '', formula: '' }]) && noneF && capF === 4
            && shF.includes("input('sys-link-fkey field'") && shF.includes("input('sys-link-fform field'") && fs.readFileSync(path.join(app, 'index.html'), 'utf8').includes('Then <code>Crew.Pilot.max.PilotRoll</code> reads the best of those figures.')
            && fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').includes('A link with a group may carry `"figs"`') && [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].every(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').indexOf("- A Crew link can name a figure each crew sheet works out") > 0), J([saysF, twoF, capF]));
    }
    {   // the core handbook session's ask (2026-10-29, after ask 6): inside a group figure's formula <LinkKey>.<name> reads the vehicle doing the reading, on invented data
        const J = v => JSON.stringify(v);
        const rawV = { v: 1, name: 'V', rolls: [], fields: [{ id: 'f_cl', key: 'Class', kind: 'number', def: 0, vis: 'all' }, { id: 'f_sk', key: 'Skiffs', kind: 'number', def: 0, vis: 'all' }, { id: 'f_hl', key: 'Haulers', kind: 'number', def: 0, vis: 'all' },
            { id: 'f_hu', key: 'Hush', kind: 'number', def: 0, vis: 'gm' }, { id: 'f_he', key: 'Helm', kind: 'formula', formula: 'Crew.Pilot.max.Fly', vis: 'all' }, { id: 'f_th', key: 'TowHelm', kind: 'formula', formula: 'Tow.max.Fly', vis: 'all' },
            { id: 'f_lp', key: 'Loopy', kind: 'formula', formula: 'Crew.max.Loop', vis: 'all' }, { id: 'f_qu', key: 'Quiet', kind: 'formula', formula: 'Crew.max.Hidden', vis: 'all' }, { id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' },
            { id: 'f_sz', key: 'Size', kind: 'number', def: 0, vis: 'all' }, { id: 'f_bh', key: 'Burden', kind: 'formula', formula: 'Riders.max.Load', vis: 'all' }],
            effects: [{ id: 'e_hex', name: 'Hex', vis: 'gm', mods: [{ f: 'f_cl', op: 'add', v: 1 }] }, { id: 'e_tune', name: 'Tune', vis: 'all', mods: [{ f: 'f_cl', op: 'add', v: 1 }] }],
            links: [{ id: 'lk_v', key: 'Vehicle', kind: 'crew', group: 'Crew', stations: ['Pilot', 'Gunner'], figs: [{ key: 'Fly', formula: 'if(Vehicle.Class = 1, Skiffs, Haulers) + Vehicle.has + Vehicle.stations' },
                { key: 'Loop', formula: 'Vehicle.Loopy + Vehicle.Crew.count + 1' }, { key: 'Hidden', formula: 'Vehicle.Hush + 1' }] },
                { id: 'lk_t', key: 'Towed', kind: 'crew', group: 'Tow', figs: [{ key: 'Fly', formula: 'if(Towed.Class = 1, Skiffs, Haulers)' }] },
                { id: 'lk_m', key: 'Mount', kind: 'mount', group: 'Riders', figs: [{ key: 'Load', formula: 'Mount.Size * 2 + Skiffs' }] }], sheet: { sections: [] } };
        const gV = cleanSystem(rawV, { F, gmView: true }), pV = cleanSystem(rawV, { F, gmView: false });
        const chV = { c_sk: { id: 'c_sk', name: 'Gull', ownerId: 'u_a', values: { f_cl: 1, f_hu: 4 } }, c_hl: { id: 'c_hl', name: 'Ox', ownerId: 'u_a', values: { f_cl: 2 } }, c_ho: { id: 'c_ho', name: 'Pebbles', ownerId: 'u_a', values: { f_sz: 3 } },
            c_ana: { id: 'c_ana', name: 'Ana', ownerId: 'u_a', values: { f_sk: 14, f_hl: 9 }, links: { lk_v: 'c_sk', lk_t: 'c_hl', lk_m: 'c_ho' }, stn: { lk_v: 'Pilot' } },
            c_bo: { id: 'c_bo', name: 'Bo', ownerId: 'u_b', values: { f_sk: 11, f_hl: 13 }, links: { lk_v: 'c_hl' }, stn: { lk_v: 'Pilot' } } };
        S.setCrewSource((id, lid, s) => Object.keys(chV).map(k => chV[k]).filter(x => x.links && x.links[lid] === id).map(x => s === gV ? x : S.charForView(x, s, { full: gV })));
        const rS = makeResolver(gV, chV.c_sk, F), rH = makeResolver(gV, chV.c_hl, F), rM = makeResolver(gV, chV.c_ho, F);
        const pickV = [rS('Helm'), rH('Helm'), rH('TowHelm'), rS('TowHelm'), rM('Burden')];   // Ana flies the skiff by Skiffs (14 + has 1 + stations 1), Bo the hauler by Haulers (13 + 2), Ana towed by the hauler by Haulers (9); the mount reads its own Size
        const loopV = [rS('Loopy'), rS('Crew.max.Loop'), rS('Quiet')];   // Loopy reads the crew, whose figure reads Vehicle.Loopy: there the crew reads 0, so Loop is 1
        const tuned = Object.assign({}, chV.c_sk, { values: Object.assign({}, chV.c_sk.values, { f_cl: 0, f_fx: [{ id: 'x_1', ref: 'e_tune', on: true }] }) }), hexed = Object.assign({}, tuned, { values: Object.assign({}, tuned.values, { f_fx: [{ id: 'x_1', ref: 'e_hex', on: true }] }) });
        const rT = makeResolver(gV, tuned, F), rX = makeResolver(gV, hexed, F);
        const fxV = [rT('Helm'), S.gmEffectNames(rT, [{ name: 'Crew.Pilot.max.Fly' }]), rX('Helm'), S.gmEffectNames(rX, [{ name: 'Crew.Pilot.max.Fly' }])];   // an effect on the vehicle's Class moves the figure; a GM-only one keeps the GM's public roll private
        const privV = [J(gV.links[0].figs.map(x => x.key)), J(pV.links[0].figs.map(x => x.key)), S.gmOnlyNames(gV, [{ name: 'Crew.max.Hidden' }, { name: 'Crew.Pilot.max.Fly' }]), S.gmDerivedNames(gV, F, ['Crew.max.Hidden', 'Crew.max.Fly', 'Quiet']), S.gmEffectNames(rS, [{ name: 'Crew.max.Hidden' }])];
        const ckV = S.crewFigs(pV, S.charForView(chV.c_sk, pV, { full: gV }), F), ckH = S.crewFigs(pV, S.charForView(chV.c_hl, pV, { full: gV }), F);
        const rPS = makeResolver(pV, Object.assign(S.charForView(chV.c_sk, pV, { full: gV }), { ck: S.cleanCk(JSON.parse(J(ckV)), pV) }), F);
        S.setCrewSource(null);
        const vV = validateSystem(gV, F), wV = vV.warnings.filter(w => w.id === 'lk_v').map(w => w.message);
        const vBad = validateSystem(Object.assign({}, gV, { links: [Object.assign({}, gV.links[0], { figs: [{ key: 'Bad', formula: 'Vehicle.Nope + 1' }] })] }), F);
        check('the core handbook session\'s ask (after ask 6): inside a group figure\'s formula the link\'s own key reads the vehicle doing the reading with its own resolver (Vehicle.Class picks Skiffs on a skiff, Haulers on a hauler; the same pilot crews both and each reads its own; a mount\'s riders read Mount.Size); Vehicle.has reads 1 there, Vehicle.stations the crew sheet\'s own; an effect on the vehicle moves it and a GM-only one keeps a public roll private; a vehicle name that reads the group again reads 0 there, so it never loops',
            J(pickV) === J([16, 15, 9, 0, 20]) && J(loopV) === J([1, 1, 5]) && J(fxV) === J([16, [], 16, ['Crew.Pilot.max.Fly']]), J([pickV, loopV, fxV]));
        check('the core handbook session\'s ask (after ask 6): a figure reading a GM-only vehicle name (Vehicle.Hush) is GM-only to the judges and the players\' view drops it; the host\'s ck figures, worked out through the players\' view, give a player\'s vehicle the very figures the GM\'s read (16 on the skiff, 15 on the hauler), and the player\'s app reads them back; the validator knows Vehicle.<name> in a figure, refuses one the system lacks, and warns where a vehicle name reads the crew again',
            privV[0] === J(['Fly', 'Loop', 'Hidden']) && privV[1] === J(['Fly', 'Loop']) && J(privV.slice(2)) === J([['Crew.max.Hidden'], ['Crew.max.Hidden', 'Quiet'], ['Crew.max.Hidden']])
            && ckV.lk_v.v['pilot.max.fly'] === 16 && ckH.lk_v.v['pilot.max.fly'] === 15 && !('max.hidden' in ckV.lk_v.v) && rPS('Helm') === 16
            && !vV.errors.length && J(wV) === J(['"Vehicle.Crew.count" reads the crew again, so inside a figure it reads 0.', '"Vehicle.Loopy" reads the crew\u2019s figures itself, so inside a figure it reads them as 0.', '"Vehicle.Hush" is GM only: the players\u2019 view drops this figure, so it reads 0 for them.'])
            && vBad.errors.some(e => e.id === 'lk_v' && /Unknown name "Vehicle.Nope"/.test(e.message)), J([privV, ckV, ckH, wV, vBad.errors]));
        const rawN = JSON.parse(J(rawV)); rawN.links.forEach(k => { k.figs = [{ key: 'Fly', formula: 'Skiffs + Vehicle.stations' }]; });
        const gN = cleanSystem(rawN, { F, gmView: true }), chN = Object.assign({}, chV.c_ana, { links: { lk_v: 'c_sk' } });
        S.setCrewSource((id, lid) => (lid === 'lk_v' && id === 'c_sk' ? [chN] : []));
        const nN = [makeResolver(gN, chV.c_sk, F)('Helm'), S.figVeh(gN.links[0], S.keyIndex(gN), 'Vehicle.stations'), S.figVeh(gN.links[0], S.keyIndex(gN), 'Vehicle.station.Pilot'), S.figVeh(gN.links[0], S.keyIndex(gN), 'Skiffs'), S.figVeh(gN.links[0], S.keyIndex(gN), 'Vehicle.Class')];
        S.setCrewSource(null);
        const shV = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), ntV = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
        check('the core handbook session\'s ask (after ask 6): a figure that names no vehicle name is worked out on the crew sheet alone, as before (figVeh answers nothing for its own stations, a station and a name of the sheet); Help, the guide and both 1.6.0 notes say it',
            J(nN) === J([15, '', '', '', 'class']) && shV.includes('In a figure&rsquo;s formula the link&rsquo;s own key reads the vehicle doing the reading, such as <code>Vehicle.Class</code>.')
            && fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').includes('reads the sheet doing the reading with its own resolver, so each vehicle a pilot crews reads its own')
            && ntV.every(t => t.indexOf("- In such a figure the link's own key reads the vehicle doing the reading,") > t.indexOf('- A Crew link can name a figure each crew sheet works out') && t.indexOf('- A Crew link can name a figure each crew sheet works out') > 0), J(nN));
    }
    {   // 1.6.0: a crew sheet reads its own station on a Crew link, <Key>.station.<Station> (asked by a system build), on invented data
        const J = v => JSON.stringify(v);
        const rawS = { v: 1, name: 'S', rolls: [], fields: [{ id: 'f_pi', key: 'Piloting', kind: 'number', def: 10, vis: 'all' }, { id: 'f_sg', key: 'Secret', kind: 'number', def: 3, vis: 'gm' },
            { id: 'f_pr', key: 'PilotRoll', kind: 'formula', formula: 'Piloting + 2 * Vessel.station.Pilot - 4 * Vessel.station.GUNNER', vis: 'all' }, { id: 'f_at', key: 'AtHelm', kind: 'formula', formula: 'Vessel.station.pilot', vis: 'all' }],
            links: [{ id: 'lk_v', key: 'Vessel', kind: 'crew', group: 'Hands', stations: ['Pilot', 'Gunner'], most: 2 }, { id: 'lk_m', key: 'Steed', kind: 'mount' }], sheet: { sections: [] } };
        const g = cleanSystem(rawS, { F, gmView: true }), p = cleanSystem(rawS, { F, gmView: false });
        const chars = { c_sk: { id: 'c_sk', name: 'Skiff', ownerId: 'u_a', values: {} },
            c_ka: { id: 'c_ka', name: 'Kael', ownerId: 'u_a', values: { f_pi: 12 }, links: { lk_v: 'c_sk', lk_m: 'c_sk' }, stn: { lk_v: 'Pilot' } },
            c_pe: { id: 'c_pe', name: 'Pebbles', ownerId: 'u_b', values: { f_pi: 9 }, links: { lk_v: 'c_sk' }, stn: { lk_v: ['Gunner', 'Pilot'] } },
            c_no: { id: 'c_no', name: 'Nobody', ownerId: 'u_c', values: { f_pi: 7 }, links: { lk_v: 'c_sk' } },
            c_off: { id: 'c_off', name: 'Off', ownerId: 'u_c', values: { f_pi: 7 }, stn: { lk_v: 'Pilot' } } };
        const rd = (s, c, n) => makeResolver(s, c, F)(n); S.setLinkSource((id, s) => chars[id] || null);
        const gmV = ['c_ka', 'c_pe', 'c_no', 'c_off', 'c_sk'].map(id => [rd(g, chars[id], 'Vessel.station.Pilot'), rd(g, chars[id], 'Vessel.station.Gunner'), rd(g, chars[id], 'PilotRoll')]);
        const own = S.charFor(chars.c_pe, p, 'u_b', {}), plV = [rd(p, own, 'Vessel.station.Pilot'), rd(p, own, 'Vessel.station.Gunner'), rd(p, own, 'PilotRoll'), rd(p, own, 'AtHelm')];
        const noStn = rd(g, chars.c_ka, 'Vessel.station.Engineer'), mountV = rd(g, chars.c_ka, 'Steed.station.Pilot');
        const rawK = JSON.parse(J(rawS)); rawK.fields.push({ id: 'f_st', key: 'Station', kind: 'item-list', vis: 'all' }); const gK = cleanSystem(rawK, { F, gmView: true }), keptK = rd(gK, chars.c_ka, 'Vessel.station.Pilot');
        S.setLinkSource(null); const vS = validateSystem(g, F), vBad = validateSystem(cleanSystem(Object.assign({}, rawS, { fields: rawS.fields.concat([{ id: 'f_bd', key: 'Bad', kind: 'formula', formula: 'Vessel.station.Engineer', vis: 'all' }]) }), { F, gmView: true }), F);
        check('1.6.0 a crew sheet reads its own station: <Key>.station.<Station> is 1 while the sheet holds that station on its Crew link (any case, one of two held too), else 0 (no station, no link); a player\'s own copy reads the same from what it holds; a station the link lacks and a Mount link read as before, and a list keyed Station with no such stat reads it too; the validator knows it as a number, never an edge, and says one the link lacks; linkBare keeps it whole; the linked sheet\'s figures never carry it',
            J(gmV) === J([[1, 0, 14], [1, 1, 7], [0, 0, 7], [0, 0, 7], [0, 0, 10]]) && J(plV) === J([1, 1, 7, 1]) && noStn === undefined && mountV === undefined && keptK === 1
            && !vS.errors.length && !vS.warnings.some(w => /station/i.test(w.message)) && vBad.errors.some(e => e.id === 'f_bd' && /^Unknown name "Vessel\.station\.Engineer"/.test(e.message))
            && S.linkBare(g, null, 'Vessel.station.Pilot') === 'Vessel.station.Pilot' && S.linkBare(g, null, 'Vessel.Piloting') === 'Piloting' && S.linkNamesIn(g, 'Vessel').every(w => !/^station\./.test(w)) && S.crewStation(g.links[0], 'station.gunner') === 'Gunner' && S.crewStation(g.links[1], 'station.pilot') === '',
            J([gmV, plV, noStn, mountV, keptK, vS.errors, vBad.errors, S.linkNamesIn(g, 'Vessel')]));
        {   // 1.6.0: the station read whatever fields the system has (a real build keeps a select keyed Station), but where a field keyed Station reads that third part itself
            const withF = (...fs2) => { const r = JSON.parse(J(rawS)); r.fields.push(...fs2); return cleanSystem(r, { F, gmView: true }); };
            S.setLinkSource((id, s) => chars[id] || null);
            const gSel = withF({ id: 'f_st', key: 'Station', kind: 'select', options: ['Pilot', 'Gunner'], def: 'Pilot', vis: 'all' });
            const selV = ['c_ka', 'c_pe', 'c_no'].map(id => [rd(gSel, chars[id], 'Vessel.station.Pilot'), rd(gSel, chars[id], 'Vessel.station.Gunner'), rd(gSel, chars[id], 'PilotRoll')]);
            const gPool = withF({ id: 'f_st', key: 'Station', kind: 'resource', maxFormula: '5', def: 'max', min: 0, vis: 'all' }, { id: 'f_sm', key: 'HelmMax', kind: 'formula', formula: 'Vessel.Station.max + Vessel.station.Pilot', vis: 'all' });
            const poolV = [rd(gPool, chars.c_ka, 'Vessel.Station.max'), rd(gPool, chars.c_ka, 'Vessel.station.Pilot'), rd(gPool, chars.c_ka, 'HelmMax'), rd(gPool, chars.c_no, 'HelmMax')];
            const gList = withF({ id: 'f_st', key: 'Station', kind: 'item-list', vis: 'all', list: { stats: [{ key: 'pilot' }] } });
            const listV = ['c_ka', 'c_pe'].map(id => [rd(gList, chars[id], 'Vessel.station.Pilot'), rd(gList, chars[id], 'Vessel.station.Gunner'), rd(gList, chars[id], 'Vessel.station.count')]);
            S.setLinkSource(null);
            const vSel = validateSystem(gSel, F), vPool = validateSystem(gPool, F);
            check('1.6.0 the station read whatever fields the system has: with a select keyed Station, <Key>.station.<Station> reads the station and the validator knows it; a pool keyed Station still reads Vehicle.Station.max from the vehicle (a part\'s ending), sent as a figure; a list keyed Station keeps what it reads at two parts (its stat pilot, count) and reads a station that is none of them',
                J(selV) === J([[1, 0, 14], [1, 1, 7], [0, 0, 7]]) && !vSel.errors.length && S.linkBare(gSel, null, 'Vessel.station.Pilot') === 'Vessel.station.Pilot' && S.linkNamesIn(gSel, 'Vessel').every(w => !/^station\./.test(w))
                && J(poolV) === J([5, 1, 6, 5]) && !vPool.errors.length && S.linkBare(gPool, null, 'Vessel.Station.max') === 'Station.max' && S.linkNamesIn(gPool, 'Vessel').includes('station.max') && !S.linkNamesIn(gPool, 'Vessel').includes('station.pilot')
                && J(listV) === J([[0, 0, 0], [0, 1, 0]]) && S.linkBare(gList, null, 'Vessel.station.Pilot') === 'station.Pilot' && S.linkBare(gList, null, 'Vessel.station.Gunner') === 'Vessel.station.Gunner'
                && S.crewStation(gSel.links[0], 'station.pilot', { station: gSel.fields.find(f => f.key === 'Station') }) === 'Pilot' && S.crewStation({ kind: 'crew', stations: ['Base', 'Pilot'] }, 'station.base', { station: { kind: 'resource' } }) === '' && S.crewStation({ kind: 'crew', stations: ['Base', 'Pilot'] }, 'station.base', null) === 'Base' && S.crewStation(gSel.links[0], 'station.pilot.max', null) === '',
                J([selV, poolV, listV, vSel.errors, vPool.errors, S.linkNamesIn(gPool, 'Vessel')]));
        }
        const ixS = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), ntS = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')), gdS = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        check('1.6.0 a crew sheet\'s own station is said: Help, the integration guide and both 1.6.0 notes',
            ixS.includes('Their sheet reads <code>Vehicle.station.Pilot</code> as 1 while it holds the Pilot station, else 0.') && gdS.includes('<Key>.station.<Station>') && ntS.every(t => t.indexOf('- A crew sheet reads its own station') > 0 && t.indexOf('- A crew sheet reads its own station') < t.indexOf('WAYPOINT 1.5.')));
    }
    {   // 1.6.0: a mount reads its rider as a group, as a vehicle reads its crew (asked by a system build), on invented data
        const J = v => JSON.stringify(v);
        const rawM = { v: 1, name: 'M', rolls: [], fields: [{ id: 'f_ri', key: 'Riding', kind: 'number', def: 0, vis: 'all' }, { id: 'f_se', key: 'Secret', kind: 'number', def: 0, vis: 'gm' },
            { id: 'f_sa', key: 'Saddle', kind: 'formula', formula: 'Riders.max.Riding + Riders.count', vis: 'all' }, { id: 'f_sp', key: 'Spy', kind: 'formula', formula: 'Riders.sum.Secret', vis: 'all' }],
            links: [{ id: 'lk_m', key: 'Steed', kind: 'mount', group: 'Riders', stations: ['Saddle'] }, { id: 'lk_n', key: 'Pony', kind: 'mount' }], sheet: { sections: [] } };
        const g = cleanSystem(rawM, { F, gmView: true }), p = cleanSystem(rawM, { F, gmView: false });
        const chars = { c_ho: { id: 'c_ho', name: 'Pebbles', ownerId: 'u_a', values: {} }, c_ka: { id: 'c_ka', name: 'Kael', ownerId: 'u_a', values: { f_ri: 11, f_se: 9 }, links: { lk_m: 'c_ho' } }, c_lo: { id: 'c_lo', name: 'Lone', ownerId: 'u_b', values: {} } };
        S.setCrewSource((id, lid, s) => Object.keys(chars).map(k => chars[k]).filter(x => x.links && x.links[lid] === id).map(x => s === g ? x : S.charForView(x, s, { full: g })));
        const gmV = [makeResolver(g, chars.c_ho, F)('Saddle'), makeResolver(g, chars.c_ho, F)('Riders.count'), makeResolver(g, chars.c_ho, F)('Spy'), makeResolver(g, chars.c_lo, F)('Saddle'), makeResolver(g, chars.c_ka, F)('Riders.count')];
        const own = S.charFor(chars.c_ho, p, 'u_a', {}), ck = S.crewFigs(p, own, F); S.setCrewSource(null);
        const withCk = cleanChar(Object.assign({}, own, { ck: ck }), p, { state: 'owner' }), plV = [makeResolver(p, withCk, F)('Saddle'), makeResolver(p, withCk, F)('Riders.count')];
        const vM = validateSystem(g, F), says = id => vM.errors.concat(vM.warnings).filter(e => e.id === id).map(e => e.message);
        const lsM = S.linkSet(g, chars, chars.c_lo, 'lk_m', 'c_ho', {});
        check('1.6.0 a Mount link may name group as a Crew link does: the mount reads its rider as Riders.count and Riders.max|min|sum.<name>, one level deep, never a station; a player\'s mount reads the figures its host worked out through the players\' view (never a GM-only figure); the validator knows the names and says one reading a GM-only figure; linkBare reads Riders.max.Riding as Riding; a mount still has one rider; a Mount link with no group as before',
            J(g.links) === J([{ id: 'lk_m', key: 'Steed', label: 'Steed', kind: 'mount', edit: 'owner', group: 'Riders' }, { id: 'lk_n', key: 'Pony', label: 'Pony', kind: 'mount', edit: 'owner' }]) && J(p.links) === J(g.links)
            && J(gmV) === J([12, 1, 9, 0, 0]) && J(ck) === J({ lk_m: { v: { 'max.riding': 11, count: 1 } } }) && J(plV) === J([12, 1]) && !vM.errors.length && J(says('f_sp')) === J(['"Riders.sum.Secret" is GM only: players will see an error for this field.']) && !says('f_sa').length
            && S.linkBare(g, null, 'Riders.max.Riding') === 'Riding' && lsM.ok === false && /already has a rider/.test(lsM.msg) && S.groupLink(g.links[0]) && !S.groupLink({ kind: 'other' }),
            J([g.links, gmV, ck, plV, vM.errors, vM.warnings, lsM]));
        const shM = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nM = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), ixM = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const ntM = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')), gdM = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        const LS = new Function('LIMITS', 'LINK_NOT', 'cleanLinks', require('./checkkit').cut('sheetlinkbox.js', 'function linkSays(', '// [systemcheck:linkbox-end]') + '\nreturn linkSays;')(S.LIMITS, S.LINK_NOT, S.cleanLinks);
        const lsW = LS([{ key: 'Steed', kind: 'mount', group: 'Bad key' }, { key: 'Pony', kind: 'mount', group: 'Riding' }], [{ key: 'Riding', label: 'Riding' }], F);
        check('1.6.0 a mount\'s riders are set and said: the Links box has Mount reads riders as on a Mount link, Save says a key it drops and a field that keeps the name (linkSays, run for real), a vehicle\'s owner and a mount\'s are sent their group figures, Help, the integration guide and both 1.6.0 notes say it',
            require('./checkkit').part('sheetlinkbox.js').includes("ml0.appendChild(el('span', 'sys-num-cap', 'Mount reads riders as'));") && kit.part('netlink.js').includes("if (k && (k.kind === 'crew' || k.kind === 'mount') && k.group) grpK[k.id] = 1;")
            && J(lsW.errs.map(e => e.message)) === J(['Link 1: the mount reads its riders by a key of letters, digits and underscores, starting with a letter, that no other link has. Save drops Bad key.']) && J(lsW.warns.map(e => e.message)) === J(['Link 2: the field Riding has the key Riding, so formulas read that field, not the riders.'])
            && ixM.includes('<li>A Mount link&rsquo;s <b>Mount reads riders as</b> is the key the mount reads its rider by') && gdM.includes('the mount then reads its rider as') && ntM.every(t => t.indexOf('- A mount can read its rider as a group') > 0 && t.indexOf('- A mount can read its rider as a group') < t.indexOf('WAYPOINT 1.5.')),
            J([lsW]));
    }
    {   // 1.6.0 linked sheets (the owner, by prompt: "Two kinds", "A menu on the sheet", "lets go with mount.name then", "Its owner and the GM", "Each keeps its own", "Only the figures read"). Invented names only
        const J = v => JSON.stringify(v), base = [{ id: 'f_mv', key: 'Move', kind: 'number', def: 5 }, { id: 'f_sc', key: 'Secret', kind: 'number', def: 9, vis: 'gm' }, { id: 'f_sp', key: 'Speed', kind: 'formula', formula: 'if(Mount.has, Mount.Move, Move)' },
            { id: 'f_sn', key: 'Sneak', kind: 'formula', formula: 'Mount.Secret + 1' }, { id: 'f_rd', key: 'Ride', kind: 'formula', formula: 'Vehicle.Move * 2' }, { id: 'f_ms', key: 'Far', kind: 'formula', formula: 'Mount.Speed' }];
        const LK = [{ id: 'lk_m', key: 'Mount', label: 'Mount', kind: 'mount' }, { id: 'lk_v', key: 'Vehicle', label: '', kind: 'crew', edit: 'gm' }];
        const raw = { v: 1, name: 'L', rolls: [], fields: base, links: LK.concat([{ id: 'lk_r', key: 'Row', kind: 'mount' }, { id: 'lk_k', key: 'Boat', kind: 'ship' }, { id: 'lk_d', key: 'A.B', kind: 'crew' }, { id: 'lk_2', key: 'mount', kind: 'crew' }, { id: 'bad', key: 'Cart', kind: 'crew' }, { id: 'lk_s', key: 'Two words', kind: 'crew' }]) };
        const g = cleanSystem(raw, { F, gmView: true }), p = cleanSystem(raw, { F, gmView: false }), noL = cleanSystem({ v: 1, name: 'L', rolls: [], fields: base.slice(0, 2) }, { F, gmView: true });
        const many = cleanSystem({ v: 1, name: 'M', rolls: [], fields: [], links: Array.from({ length: 82 }, (_, i) => ({ id: 'lk_' + i, key: 'K' + i, kind: 'crew' })) }, { F, gmView: true });
        check('1.6.0 linked sheets: the System keeps its links last but the calendar, the same in both views (a Mount and a Crew link; a key no formula can read, a dot, a space, a word formulas read already, a second spelling of a key, a kind of its own or a bad id dropped; at most 80; the name defaults to the key; Set by defaults to its player or the GM); a system with none holds no links key, and the mark of a system cleaned for the GM is never written',
            J(g.links) === J([{ id: 'lk_m', key: 'Mount', label: 'Mount', kind: 'mount', edit: 'owner' }, { id: 'lk_v', key: 'Vehicle', label: 'Vehicle', kind: 'crew', edit: 'gm' }]) && J(p.links) === J(g.links) && !('links' in noL) && many.links.length === 80
            && g.gmSide === true && !('gmSide' in p) && !J(g).includes('gmSide') && Object.keys(g).indexOf('gmSide') < 0, J([g.links, many.links.length]));
        const chars = { c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: {}, links: { lk_m: 'c_peb', lk_v: 'c_cart' } }, c_peb: { id: 'c_peb', name: 'Pebbles', ownerId: 'u_a', values: { f_mv: 12, f_sc: 3 }, links: { lk_m: 'c_kael' } }, c_cart: { id: 'c_cart', name: 'Old cart', npc: true, values: { f_mv: 4 } }, c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', values: {}, links: { lk_v: 'c_cart' } } };
        S.setLinkSource((id, s) => { const c = chars[id]; return !c ? null : s === g ? c : S.charForView(c, s, { full: g }); });
        const r = makeResolver(g, chars.c_kael, F), r0 = makeResolver(g, { id: 'c_x', name: 'X', values: {} }, F), live = [r('Speed'), r('Ride'), r('Mount.has'), r('Vehicle.has'), r('Sneak'), r('Far'), r('Mount.HP'), r0('Speed'), r0('Mount.Move'), r0('Mount.has'), r0('Vehicle.Move')];
        chars.c_peb.values.f_mv = 15; const after = makeResolver(g, chars.c_kael, F)('Speed'); chars.c_peb.values.f_mv = 12;
        const own = cleanSystem({ v: 1, name: 'O', rolls: [], fields: [{ id: 'f_m', key: 'Mount', kind: 'number', def: 2 }, { id: 'f_h', key: 'has', kind: 'number', def: 7 }, { id: 'f_x', key: 'X', kind: 'formula', formula: 'Mount + 1' }], links: [{ id: 'lk_m', key: 'Mount', kind: 'mount' }, { id: 'lk_c', key: 'Cart', kind: 'crew' }] }, { F, gmView: true });
        const rO = makeResolver(own, { id: 'c_o', name: 'O', values: {}, links: { lk_m: 'c_peb', lk_c: 'c_peb' } }, F), ownV = [rO('X'), rO('Mount.Move'), rO('Cart.has'), rO('Cart.Move')];
        check('1.6.0 linked sheets: a formula reads the linked sheet live as <Key>.<name> (a rider\'s Speed reads the mount\'s Move, 12, then 15 once it changes; a crew member reads the vehicle; Mount.has 1 while linked); with no link every name reads 0; a name the sheet lacks is unknown, as anywhere; the linked sheet\'s own links are not followed (the mount\'s Speed reads its own Move, never back through its rider); a field keyed like the link keeps the whole family, and a field keyed has keeps <Key>.has; the linked sheet is read with the system of its reader',
            J(live) === J([12, 8, 1, 1, 4, 12, undefined, 5, 0, 0, 0]) && after === 15 && J(ownV) === J([3, undefined, 7, undefined]), J([live, after, ownV]));
        const vG = validateSystem(g, F), msg = id => vG.errors.concat(vG.warnings).filter(e => e.id === id).map(e => e.message);
        const vBad = validateSystem(cleanSystem(Object.assign({}, raw, { fields: base.concat([{ id: 'f_nn', key: 'Bad', kind: 'formula', formula: 'Mount.Nope + Mount.Mount.Move' }]) }), { F, gmView: true }), F);
        check('1.6.0 linked sheets: the validator knows <Key>.<name> as the system\'s own name on the linked sheet, and <Key>.has, never as an edge of a loop (Far reads Mount.Speed, which reads Mount.Move); a GM-only name read through a link is said to be GM only; an unknown one, and a link read through a link, are unknown names',
            !vG.errors.length && J(msg('f_sn')) === J(['"Mount.Secret" is GM only: players will see an error for this field.']) && msg('f_ms').length === 0 && msg('f_sp').length === 0
            && vBad.errors.filter(e => e.id === 'f_nn').map(e => e.message.split(' —')[0]).join('|') === 'Unknown name "Mount.Nope"|Unknown name "Mount.Mount.Move"', J([vG.errors, vG.warnings, vBad.errors]));
        check('1.6.0 linked sheets: the players\' view blanks a formula that reads a GM-only figure of the linked sheet, as it blanks one of the character\'s own, and the GM-only judges read <Key>.<name> as that name (On.<name> as before)',
            p.fields.find(f => f.key === 'Sneak').formula === null && p.fields.find(f => f.key === 'Speed').formula === 'if(Mount.has, Mount.Move, Move)' && J(S.gmOnlyNames(g, [{ name: 'Mount.Secret' }, { name: 'Mount.Move' }, { name: 'On.Secret' }])) === J(['Mount.Secret', 'On.Secret'])
            && S.gmDerivedNames(g, F, ['Mount.Secret']).length === 1 && S.gmDerivedNames(g, F, ['Mount.Move', 'Speed']).length === 0 && S.linkBare(g, null, 'Mount.Move') === 'Move' && S.linkBare(own, null, 'Mount.Move') === 'Mount.Move' && S.linkBare(noL, null, 'Mount.Move') === 'Mount.Move');
        const names = S.linkNamesIn(p, 'Mount'), lk = S.linkFigs(p, chars.c_kael, F), ownC = cleanChar(Object.assign({}, chars.c_kael, { lk }), p, { state: 'owner' });
        S.setLinkSource(null); const rP = makeResolver(p, ownC, F), onPlayer = [rP('Speed'), rP('Ride'), rP('Mount.has'), rP('Far')];
        const hostile = cleanChar({ id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: {}, links: { lk_m: 'c_kael', lk_v: 'c_cart', lk_zz: 'c_peb', __proto__: 'c_peb' }, lk: { lk_m: { id: 'c_peb', name: 'Pebbles', v: { move: 12, constructor: 1, __proto__: 2, 'Bad Name': 3, has: 1, t: 'x'.repeat(200), o: {} } } } }, p, { state: 'owner' });
        const keptNot = [cleanChar(Object.assign({}, chars.c_kael, { lk }), p), cleanChar(Object.assign({}, chars.c_kael, { lk, partial: true }), p, { state: 'owner' }), cleanChar({ id: 'c_a', name: 'A', values: {}, links: { lk_m: 'c_b' } }, noL)];
        check('1.6.0 linked sheets ("Only the figures read"): the host works out, through the players\' view, just the names the system reads under each link (Move and Speed, never has, never the GM-only Secret, whose formula players see as GM only) and the player\'s copy reads them as the host does; a copy keeps its figures only as its owner\'s (never cleaned for anyone else, never on a teammate\'s), names no prototype holds, a value as a number, a truth or a short text; a link to itself, to a link the system lacks or in a system with none is dropped',
            J(names) === J(['move', 'speed']) && J(lk) === J({ lk_m: { id: 'c_peb', name: 'Pebbles', v: { move: 12, speed: 12 } }, lk_v: { id: 'c_cart', name: 'Old cart', v: { move: 4 } } }) && J(onPlayer) === J([12, 8, 1, 12])
            && J(hostile.links) === J({ lk_v: 'c_cart' }) && J(hostile.lk) === J({ lk_m: { id: 'c_peb', name: 'Pebbles', v: { move: 12, t: 'x'.repeat(120) } } }) && Object.getPrototypeOf(hostile.lk.lk_m.v) === Object.prototype
            && !('lk' in keptNot[0]) && J(keptNot[0].links) === J({ lk_m: 'c_peb', lk_v: 'c_cart' }) && !('lk' in keptNot[1]) && !('links' in keptNot[1]) && !('links' in keptNot[2]), J([names, lk, onPlayer, hostile, keptNot]));
        const cs = JSON.parse(J(chars)), setG = S.linkSet(g, cs, cs.c_sela, 'lk_m', 'c_peb'), crew = S.linkSet(g, cs, cs.c_kael, 'lk_v', 'c_cart'), offA = S.linkSet(g, cs, cs.c_kael, 'lk_m', '');
        const gmOwn = S.linkSet(g, cs, cs.c_kael, 'lk_v', 'c_peb', { player: true, pid: 'u_a' }), open = S.linkSet(g, cs, Object.assign({}, cs.c_kael, { unlocked: 1 }), 'lk_v', 'c_peb', { player: true, pid: 'u_a' }), none = S.linkSet(g, cs, cs.c_kael, 'lk_x', 'c_peb');
        check('1.6.0 linked sheets: linkSet, the one judge: a Mount has one rider (the GM is told who rides it), a Crew link takes many to one vehicle, a link comes off leaving the others, a player sets a link the GM keeps only while their character is open to them, and a link the system lacks is refused',
            J(setG) === J({ ok: false, reason: 'error', msg: 'Pebbles already has a rider: Kael. Take that link off first.' }) && J(crew) === J({ ok: true, links: { lk_m: 'c_peb', lk_v: 'c_cart' } }) && J(offA) === J({ ok: true, links: { lk_v: 'c_cart' } })
            && gmOwn.ok === false && gmOwn.reason === 'field' && J(open) === J({ ok: true, links: { lk_m: 'c_peb', lk_v: 'c_peb' } }) && none.ok === false && none.reason === 'field', J([setG, crew, offA, gmOwn, open, none]));
        const cs2 = JSON.parse(J(chars)), from = S.linkedFrom(g, cs2, 'c_cart').map(x => [x.link.id, x.by.map(b => b.name)]), drop = S.linksDrop(cs2, 'c_cart');
        check('1.6.0 linked sheets: a vehicle lists its crew and a mount its rider (linkedFrom); a character gone takes every link to it away, a sheet left with none holds no links key (linksDrop)',
            J(from) === J([['lk_v', ['Kael', 'Sela']]]) && J(drop.sort()) === J(['c_kael', 'c_sela']) && J(cs2.c_kael.links) === J({ lk_m: 'c_peb' }) && !('links' in cs2.c_sela), J([from, drop, cs2.c_kael, cs2.c_sela]));
        check('1.6.0 linked sheets: cleanCharLink takes a request of the right shape alone (its id, the character, the link, a character or nothing), so a player\'s message names nothing else',
            J(S.cleanCharLink({ rid: 'k1', charId: 'c_a', linkId: 'lk_m', to: 'c_b', extra: 1 })) === J({ rid: 'k1', charId: 'c_a', linkId: 'lk_m', to: 'c_b' }) && J(S.cleanCharLink({ rid: 'k1', charId: 'c_a', linkId: 'lk_m' })) === J({ rid: 'k1', charId: 'c_a', linkId: 'lk_m', to: '' })
            && [{ rid: 'k 1', charId: 'c_a', linkId: 'lk_m' }, { rid: 'k1', charId: 'x', linkId: 'lk_m' }, { rid: 'k1', charId: 'c_a', linkId: 'f_m' }, { rid: 'k1', charId: 'c_a', linkId: 'lk_m', to: 7 }, { rid: 'k1', charId: 'c_a', linkId: 'lk_m', to: '__proto__' }, null].every(m => S.cleanCharLink(m) === null));
        // the sheet and the System editor (sheets.js, run for real on stand-ins of the page)
        const shL = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), cutL = (a, b) => { const i = shL.indexOf(a), k = shL.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('linked sheets slice: ' + a); return shL.slice(i, k); };
        const ckL = require('./checkkit'), barS = ckL.cut('sheetlink.js', 'function linkBar(', '// A link set from the menu'), saysS = ckL.cut('sheetlinkbox.js', 'function linkSays(', '// [systemcheck:linkbox-end]'), srcS = ckL.cut('sheetlink.js', 'function linkSource(', '// The characters whose sheets link this one');   // read by their own names
        const feL = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], title: '', value: '', selected: false, dataset: {}, on: {}, appendChild(x) { this.children.push(x); return x; }, addEventListener(t, fn) { this.on[t] = fn; } }; return e; };
        const optL = (v, t, s) => { const o = feL('option', null, t); o.value = v; o.selected = !!s; return o; };
        const runBar = (who, cid, ch, locked) => { const set = []; const box = feL('div'); box.textContent = 'stale'; const camp = { chars: ch };
            const drew = new Function('el', 'opt', 'isClient', 'myId', 'canWrite', 'canOpen', 'openSheet', 'charList', 'charById', 'charsOf', 'linkedFrom', 'setLink', barS + NL + 'return linkBar;')(feL, optL, () => who !== 'gm', () => who === 'gm' ? null : who, () => true, id => who === 'gm' || (ch[id] && ch[id].ownerId === who), () => {}, () => Object.values(ch).sort((a, b) => a.name.localeCompare(b.name)), (id) => ch[id] || null, () => ch, S.linkedFrom, (a, b, c) => set.push([a, b, c]))(box, g, ch[cid], camp, locked);
            return { drew, box, set, rows: box.children.map(rw => rw.children.map(k => k.tag === 'select' ? ['select', k.children.map(o => [o.value, o.textContent, o.selected])] : [k.tag, k.className, k.textContent])) }; };
        const gmB = runBar('gm', 'c_kael', JSON.parse(J(chars))), plB = runBar('u_a', 'c_kael', (() => { const c = JSON.parse(J(chars)); delete c.c_cart; delete c.c_sela; c.c_kael.lk = { lk_v: { id: 'c_cart', name: 'Old cart', v: {} } }; return c; })());
        gmB.box.children[0].children[1].value = 'c_sela'; gmB.box.children[0].children[1].on.change();
        const cartB = runBar('gm', 'c_cart', JSON.parse(J(chars))), noneB = runBar('gm', 'c_x', { c_x: { id: 'c_x', name: 'X', values: {} } }), lockB = runBar('u_a', 'c_x', { c_x: { id: 'c_x', name: 'X', ownerId: 'u_a', values: {} } }, true);
        check('1.6.0 linked sheets on the sheet (sheets.js linkBar, run for real): a row a link, its name, a menu (None first, then the characters the viewer may pick: every one for the GM, their own for a player, a link the host sent by its name alone), Open for the linked sheet; a link the GM sets is a name to a player; a vehicle lists its crew and a mount its rider; a pick goes to setLink; nothing for a sheet with no link a viewer may set, or a locked one with none; names as text',
            gmB.drew === true && J(gmB.rows[0]) === J([['span', 'sheet-lk-name', 'Mount'], ['select', [['', 'None', false], ['c_cart', 'Old cart', false], ['c_peb', 'Pebbles', true], ['c_sela', 'Sela', false]]], ['button', 'tool ghost sheet-lk-open', 'Open']])
            && J(gmB.rows[2]) === J([['span', 'sheet-lk-name', 'Rider'], ['button', 'tool ghost sheet-lk-by', 'Pebbles']]) && J(gmB.set) === J([['c_kael', 'lk_m', 'c_sela']])
            && J(plB.rows[0][1]) === J(['select', [['', 'None', false], ['c_peb', 'Pebbles', true]]]) && J(plB.rows[1]) === J([['span', 'sheet-lk-name', 'Vehicle'], ['span', 'sheet-lk-to', 'Old cart']])
            && J(cartB.rows) === J([[['span', 'sheet-lk-name', 'Mount'], ['select', [['', 'None', true], ['c_kael', 'Kael', false], ['c_peb', 'Pebbles', false], ['c_sela', 'Sela', false]]]], [['span', 'sheet-lk-name', 'Vehicle'], ['select', [['', 'None', true], ['c_kael', 'Kael', false], ['c_peb', 'Pebbles', false], ['c_sela', 'Sela', false]]]], [['span', 'sheet-lk-name', 'Crew'], ['button', 'tool ghost sheet-lk-by', 'Kael'], ['button', 'tool ghost sheet-lk-by', 'Sela']]])
            && noneB.drew === true && lockB.drew === false && lockB.box.children.length === 0 && !/innerHTML|insertAdjacentHTML|outerHTML/.test(barS), J([gmB.rows, gmB.set, plB.rows, cartB.rows, lockB.drew]));
        const says = new Function('LIMITS', 'LINK_NOT', 'cleanLinks', saysS + NL + 'return linkSays;')(S.LIMITS, S.LINK_NOT, S.cleanLinks);
        const sy = says([{ id: 'lk_a', key: 'Mount' }, { id: 'lk_b', key: '' }, { id: 'lk_c', key: 'A.B' }, { id: 'lk_d', key: 'row' }, { id: 'lk_e', key: 'MOUNT' }, { id: 'lk_f', key: '9x' }, { id: 'lk_g', key: 'Move' }], base, F);
        check('1.6.0 linked sheets in the System editor (sheets.js linkSays, run for real): what Save drops of the links, in the cleaner\'s own reading, and a key a field of the system has, which keeps the name',
            J(sy) === J({ errs: [{ message: 'Link 2: it needs a key, such as Mount. Save drops it.' }, { message: 'Link 3: a key has no dot and no space. Save drops it.' }, { message: 'Link 4: formulas read row already. Pick another key. Save drops it.' }, { message: 'Link 5: another link has the key MOUNT. Save drops it.' }, { message: 'Link 6: a key is letters, digits and underscores, starting with a letter. Save drops it.' }], warns: [{ message: 'Link 7: the field Move has the key Move, so formulas read that field, not the linked sheet.' }] }), J(sy));
        const ixL = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, NL), notes = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, NL));
        check('1.6.0 linked sheets are wired: the link source answers the GM\'s own character only for a system cleaned for the GM and the owner\'s projection for any other (fail closed), a player\'s app its own copy; the Lists tab draws the box and its input, change and press reach it; the sheet draws its strip under the budgets, a sheet in a window of its own too; deleting or removing a character drops its links; a sheet that links another redraws with it; Help and both release notes say it under Systems, more',
            /if \(isClient\(\)\) return c;\n    if \(sys && \(sys === camp\.system \|\| sys\.gmSide === true\)\) return c;\n    return sys && Array\.isArray\(sys\.fields\) \? charForView\(c, sys, \{ full: camp\.system \}\) : null;/.test(srcS)
            && shL.includes("    if (tab === 'rules') renderLinks();") && shL.includes('    if (onLinkInput(t)) return;') && shL.includes('    if (onLinkChange(t)) return;') && shL.includes('    if (linkClick(b)) return;') && ixL.includes('<div id="sysLinks" data-topic="links"></div>')
            && shL.includes("    var lkB = ui('sheetLinks'); if (lkB) lkB.style.display = linkBar(lkB, sys, c, camp, lockedS) ? '' : 'none';") && shL.includes("var lkP = el('div', 'sheet-lks'); if (linkBar(lkP, sys, c, camp, true))")
            && (shL.match(/= linksDrop\(charsOf\(camp\), id\);/g) || []).length === 2 && shL.includes('linkRiders(charId).forEach(function(rid)') && ixL.includes('<li><b>Linked sheets</b> let one sheet read the figures of another.')
            && notes.every(t => { const i = t.indexOf('Systems, more'), k = t.indexOf('- Linked sheets let one sheet read the figures of another.'); return i >= 0 && k > i && k < t.indexOf(NL + NL, i); }));
        S.setLinkSource(null);
    }
    {   // 1.6.2 (backlog 218, fold 1; the owner, by prompt: "A rule, with Show all", "A tick on the link"): who may sit at a station, and which sheets are crewed
        const J = JSON.stringify, mk = gm => cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_h', key: 'Harnessable', kind: 'number' }, { id: 'f_v', key: 'IsVehicle', kind: 'toggle' }, { id: 'f_s', key: 'Sec', kind: 'number', vis: 'gm' }],
            links: [{ id: 'lk_crew', key: 'Cart', label: 'Cart', kind: 'crew', edit: 'owner', stations: ['Driver', 'Team', 'Box'], veh: 'IsVehicle', fit: { team: { 'if': 'Harnessable > 0', says: 'Only a beast that can be harnessed pulls the cart.' }, Box: { 'if': 'Sec > 1' }, Driver: { 'if': '1d6' }, Nope: { 'if': '1' } } }] }, { F, gmView: gm });
        const G = mk(true), P = mk(false), k = G.links[0];
        const chs = () => ({ c_v: { id: 'c_v', name: 'Cart', ownerId: 'u_b', values: { f_v: true } }, c_d: { id: 'c_d', name: 'Dog', ownerId: 'u_b', values: { f_h: 0 } }, c_o: { id: 'c_o', name: 'Ox', ownerId: 'u_b', values: { f_h: 2 } } }), cs = chs();
        const L = (c, o) => S.linkSet(G, cs, cs[c], 'lk_crew', 'c_v', Object.assign({ F }, o)), dP = L('c_d', { player: true, pid: 'u_b', stn: 'Team' }), oP = L('c_o', { player: true, pid: 'u_b', stn: 'Team' }), dG = L('c_d', { stn: 'Team' }), dN = L('c_d', { player: true, pid: 'u_b', stn: 'Driver' });
        const shF = require('./checkkit').part('sheetlink.js'), ca = shF.indexOf('// [systemcheck:crewpick-start]'), cz = shF.indexOf('// [systemcheck:crewpick-end]');   // sheetlink.js, read by its own name
        const camp = { chars: chs() }, list = Object.values(camp.chars).map(x => ({ id: x.id, name: x.name, ownerId: x.ownerId })), mkC = cl => new Function('charList', 'charById', 'myId', 'isClient', 'stationFit', 'F', shF.slice(ca, cz) + '\nreturn crewCandidates;')(() => list, id => camp.chars[id], () => 'u_b', () => cl, S.stationFit, () => F);
        const nm = a => a.map(o => o.name + (o.why ? '!' : '')).join(','), pc = mkC(true), team = pc(G, k, camp.chars.c_v, camp, 'Team', false), teamAll = pc(G, k, camp.chars.c_v, camp, 'Team', true), drv = pc(G, k, camp.chars.c_v, camp, 'Driver', false);
        check('218 fold 1 a station names who may sit there, and a link which sheets it crews (cleanLinks, stationFit, crewHost, linkSet and the + Crew menu\'s list run for real): each kept as a formula with no dice and words, for its own stations, alike in both views, one that reads a GM-only value or rolls dice gone; a player seating a sheet that fails is refused in the system\'s words, your own link goes through and is told; Crewed sheets are where marks the cart alone; the menu lists the sheets that fit, Show all lists the rest saying why, never the cart itself',
            J(k.fit) === J({ Team: { 'if': 'Harnessable > 0', says: 'Only a beast that can be harnessed pulls the cart.' } }) && J(P.links[0].fit) === J(k.fit) && k.veh === 'IsVehicle' && P.links[0].veh === 'IsVehicle'
            && !dP.ok && dP.msg === 'Only a beast that can be harnessed pulls the cart.' && oP.ok && dG.ok && dG.fitSays === dP.msg && dN.ok && !dN.fitSays
            && S.crewHost(G, k, cs.c_v, F) === true && S.crewHost(G, k, cs.c_o, F) === false && S.stationFit(G, k, 'Box', cs.c_d, F) === ''
            && nm(team) === 'Ox' && nm(teamAll) === 'Dog!,Ox' && nm(drv) === 'Dog,Ox' && teamAll[0].why === dP.msg,
            J([k, dP, dG, nm(team), nm(teamAll), nm(drv)]));
    }
    {   // 1.6.2 (backlog 205; the owner, by prompt: "Player refused, GM told"): a seat limit a station of a Crew link
        const J = JSON.stringify, sL = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_x', key: 'X', kind: 'number' }], links: [{ id: 'lk_crew', key: 'Vehicle', label: 'Vehicle', kind: 'crew', edit: 'owner', stations: ['Pilot', 'Gunner'], most: 2, seats: { pilot: 1, Gunner: 2, Cook: 3, Nav: 0 } }] }, { F, gmView: true });
        const chs = () => ({ c_v: { id: 'c_v', name: 'Ship', ownerId: 'u_b' }, c_a: { id: 'c_a', name: 'A', ownerId: 'u_b', links: { lk_crew: 'c_v' }, stn: { lk_crew: 'Pilot' } }, c_b: { id: 'c_b', name: 'B', ownerId: 'u_b' }, c_o: { id: 'c_o', name: 'Other', ownerId: 'u_b' } });
        const L = (cs, c, o, to) => S.linkSet(sL, cs, cs[c], 'lk_crew', to || 'c_v', o), cs1 = chs();
        const pR = L(cs1, 'c_b', { player: true, pid: 'u_b', stn: 'Pilot' }), gR = L(cs1, 'c_b', { stn: 'Pilot' }), gun = L(cs1, 'c_b', { player: true, pid: 'u_b', stn: 'Gunner' }), self = L(cs1, 'c_a', { player: true, pid: 'u_b', stn: 'Pilot' });
        const two = L(cs1, 'c_b', { player: true, pid: 'u_b', stn: ['Pilot', 'Gunner'] }), other = L(cs1, 'c_b', { player: true, pid: 'u_b', stn: 'Pilot' }, 'c_o'), none = L(cs1, 'c_b', { player: true, pid: 'u_b' });
        check('205 a seat limit a station (cleanLinks and linkSet run for real): Seats are kept a station as the station is spelled, 1 to 99, for its own stations alone; a player taking a station whose seats are filled on that very vehicle is refused in words that name it, the GM\'s own link goes through and is told, another station or another vehicle is free, a sheet already there is never counted against itself, and a crew member with no station takes no seat',
            J(sL.links[0].seats) === J({ Pilot: 1, Gunner: 2 }) && !pR.ok && pR.msg === 'Pilot on Ship seats 1 and has someone there.' && gR.ok && gR.seatSays === pR.msg
            && gun.ok && !gun.seatSays && self.ok && !self.seatSays && !two.ok && other.ok && none.ok,
            J([sL.links[0].seats, pR, gR, gun, self, two, other, none]));
    }

    // ---- the host's side (from netcheck.js) ----
// 1.6.0 Its crew may press this sheet's rolls: the real roll-req branch with the real dicecore, formula engine and systemcore. The host judges the press by its own
// copy: a crew member of that vehicle, at a station the roll names, spends their own action, the roll lands on the vehicle, and Presser reads the sheet that pressed
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js'));
    const rqSrc = (ordersSrc + '\n' + between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'));
    const helpers = ['function own(', 'function peerProfileId(', 'function fxLib(', 'function itemLib(', 'function diceFrom('].map(k => { const i = src.indexOf(k); if (i < 0) throw new Error('netcheck: ' + k + ' not found'); return src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';
    const raw = { fields: [{ id: 'f_aim', key: 'Aim', label: 'Aim', kind: 'number', vis: 'all', edit: 'owner' }, { id: 'f_ammo', key: 'Ammo', label: 'Ammo', kind: 'number', vis: 'all', edit: 'gm' }],
        rolls: [{ id: 'r_gun', label: 'Gun', formula: '3d6 <= Presser.Aim + 20', vis: 'all', then: [{ f: 'f_ammo', formula: '1', add: true }] }, { id: 'r_eng', label: 'Engine', formula: '3d6 <= 30', vis: 'all', stations: ['Engineer', 'Bad station!', 'Engineer'] }, { id: 'r_ini', label: 'Start', formula: '3d6', vis: 'all', init: true }],
        links: [{ id: 'lk_c', key: 'Ship', label: 'Ship', kind: 'crew', group: 'Crew', press: true, stations: ['Gunner', 'Engineer'], edit: 'gm' }, { id: 'lk_off', key: 'Boat', label: 'Boat', kind: 'crew', edit: 'gm' }] };
    const gmSys = Sx.cleanSystem(raw, { F: Fx, gmView: true });
    const chars = () => ({ c_a: { id: 'c_a', name: 'Kael', ownerId: 'u_a', npc: false, links: { lk_c: 'c_v' }, stn: { lk_c: 'Gunner' }, values: { f_aim: 13 } }, c_b: { id: 'c_b', name: 'Pebbles', ownerId: 'u_a', npc: false, values: { f_aim: 9 } }, c_o: { id: 'c_o', name: 'Rook', ownerId: 'u_o', npc: false, links: { lk_c: 'c_v' }, values: { f_aim: 15 } }, c_q: { id: 'c_q', name: 'Tam', ownerId: 'u_a', npc: false, links: { lk_off: 'c_v' }, values: {} }, c_v: { id: 'c_v', name: 'Swift', ownerId: '', npc: true, values: { f_ammo: 5 } } });
    const run = msg0 => {
        const camp = { id: 'k', activeItemId: 'm1', system: gmSys, chars: chars(), items: { m1: { type: 'map', whiteboard: [] } } };
        const net = { active: true, role: 'host', paused: false, roster: { pA: { id: 'u_a', name: 'Pat', location: 'm1' } }, combats: {}, syncCharDelta() {} };
        const out = { table: [], sent: [], camp };
        const conn = { peer: 'pA', send(m) { packCheck(m); out.sent.push(JSON.parse(JSON.stringify(m))); } };
        const win = { wpFormula: Fx, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpVtt: { on: () => true, rulesOn: () => true } };
        Sx.setCrewSource((vid, lid) => Object.values(camp.chars).filter(c => c.links && c.links[lid] === vid));
        new Function('msg', 'conn', 'net', 'DC', 'SC', 'window', 'getActiveCampaign', 'peerPaused', 'sendFailed', 'sendTable', 'pushRoll', 'logEvent', 'saveRemoteSoon', 'var diceLimit = null, _diceSlowSaid = {};\n' + helpers + rqSrc)(
            Object.assign({ type: 'roll-req', rid: 'q1' }, msg0), conn, net, () => Dx, () => Sx, win, () => camp, () => false, e => { throw e; }, rec => { packCheck(rec); out.table.push(JSON.parse(JSON.stringify(rec))); }, () => {}, () => {}, () => {});
        Sx.setCrewSource(null);
        return out;
    };
    const gun = { expr: '3d6 <= Presser.Aim + 20', charId: 'c_v', act: 'r_gun', label: 'Gun' };
    const ok = run(Object.assign({ by: 'c_a' }, gun)), noBy = run(gun), other = run(Object.assign({ by: 'c_b' }, gun)), theirs = run(Object.assign({ by: 'c_o' }, gun)), off = run(Object.assign({ by: 'c_q' }, gun));
    const eng = run({ expr: '3d6 <= 30', charId: 'c_v', act: 'r_eng', label: 'Engine', by: 'c_a' }), ini = run({ expr: '3d6', charId: 'c_v', act: 'r_ini', label: 'Start', by: 'c_a' }), loose = run({ expr: '3d6 <= 99', charId: 'c_v', act: 'r_gun', label: 'Gun', by: 'c_a' });
    const nm = (rec, n) => ((rec && rec.names) || []).filter(x => x.name === n).map(x => x.value)[0], deny = o => o.sent.length === 1 && o.sent[0].type === 'roll-deny' && o.table.length === 0;
    check('1.6.0 a crew member presses a vehicle\'s roll (roll-req, run for real): judged by the host\'s own copy, the card says who on what, Presser reads the sheet that pressed alone, and its Then lands on the vehicle',
        ok.table.length === 1 && ok.table[0].as === 'Kael on Swift' && nm(ok.table[0], 'Presser.Aim') === 13 && ok.camp.chars.c_v.values.f_ammo === 6 && ok.sent.length === 0, j([ok.table, ok.sent, ok.camp.chars.c_v.values]));
    check('1.6.0 no press without the link: no sheet named, a sheet of theirs that is not linked, a sheet of another player\'s and a Crew link not ticked are each refused with nothing rolled and nothing moved; the wrong station, the initiative roll and a formula that is not the button\'s too',
        deny(noBy) && noBy.sent[0].reason === 'char' && deny(other) && /not one your character crews/.test(other.sent[0].message) && deny(theirs) && deny(off) && deny(eng) && /another station/.test(eng.sent[0].message) && deny(ini) && deny(loose) && [noBy, other, theirs, off, eng, ini, loose].every(o => o.camp.chars.c_v.values.f_ammo === 5), j([noBy.sent, other.sent, theirs.sent, off.sent, eng.sent, ini.sent, loose.sent]));
    const view = Sx.cleanSystem(raw, { F: Fx, gmView: false }), gnr = Sx.crewRollsOf(view, { values: {} }, ['Gunner'], Fx), egr = Sx.crewRollsOf(view, { values: {} }, ['Engineer'], Fx);
    const nmd = Sx.crewRollsOf(view, { values: {} }, ['Engineer'], Fx, true), nmG = Sx.crewRollsOf(view, { values: {} }, ['Gunner'], Fx, true), cln = Sx.cleanSystem(Object.assign({}, raw, { links: [Object.assign({}, raw.links[0], { pressNamed: true }), Object.assign({}, raw.links[1], { pressNamed: true })] }), { F: Fx, gmView: false });
    check('1.6.0 Only rolls that name a station: a crew member is offered those alone, and the judge agrees, a roll that names none refused; the key is kept only beside press, in both views',
        j(nmd.map(e => e.act)) === '["r_eng"]' && nmG.length === 0 && Sx.rollStationOk({}, ['Gunner'], true) === false && Sx.rollStationOk({}, ['Gunner']) === true && Sx.rollStationOk({ stations: ['Gunner'] }, ['Gunner'], true) === true && cln.links[0].pressNamed === true && cln.links[1].pressNamed === undefined, j([nmd, nmG, cln.links]));
    check('1.6.0 what a crew member is offered: the system\'s rolls their station may press, never the initiative roll; a roll keeps only sound station words, each once, in both views',
        j(gmSys.rolls[1].stations) === '["Engineer"]' && j(view.rolls[1].stations) === '["Engineer"]' && j(gnr.map(e => e.act)) === '["r_gun"]' && j(egr.map(e => e.act)) === '["r_gun","r_eng"]' && gmSys.links[0].press === true && gmSys.links[1].press === undefined && view.links[0].press === true, j([gnr, egr, gmSys.links]));
    const hostile = { lk_c: [{ act: 'r_gun', expr: '3d6', label: 'Gun\u0007' }, { act: '__proto__', expr: '3d6' }, { f: 'f_x', r: 'w_a1', i: 1, expr: '1d6', label: '<b>x</b>' }, { f: 'f_x', r: 'w_a1', i: 999, expr: '1d6' }, { act: 'r_x', expr: 7 }, 'junk'], lk_off: [{ act: 'r_gun', expr: '3d6' }], __proto__x: 1 };
    const cr = Sx.cleanCr(hostile, gmSys);
    check('1.6.0 a player\'s app takes the list as data: a sound entry alone, a label as plain text, nothing for a link that lets no one press, none from what is no list',
        cr && cr.lk_c.length === 2 && cr.lk_c[0].label === 'Gun' && cr.lk_c[1].label === '<b>x</b>' && !cr.lk_off && Sx.cleanCr('x', gmSys) === null && Sx.cleanCr({}, gmSys) === null, j(cr));
    const vr = Sx.validateSystem(Object.assign({}, raw, { links: [{ id: 'lk_c', key: 'Ship', label: 'Ship', kind: 'crew', edit: 'gm' }] }), Fx);
    check('1.6.0 Presser is known only where a Crew link lets its crew press and reads them as a group', Sx.validateSystem(gmSys, Fx).errors.every(e => !/Presser/.test(e.message)) && vr.errors.some(e => /Presser/.test(e.message)), j(vr.errors));
    check('1.6.0 a press names a roll and is a press of another sheet: cleanRollReq keeps by only beside a named roll of a character, never the same sheet', Dx.cleanRollReq({ rid: 'q1', expr: '3d6', charId: 'c_v', act: 'r_a', by: 'c_a' }).by === 'c_a' && Dx.cleanRollReq({ rid: 'q1', expr: '3d6', charId: 'c_v', by: 'c_a' }) === null && Dx.cleanRollReq({ rid: 'q1', expr: '3d6', charId: 'c_v', act: 'r_a', by: 'c_v' }) === null && Dx.cleanRollReq({ rid: 'q1', expr: '3d6', charId: 'c_v', act: 'r_a', by: 'x y' }) === null);
})());

// 1.6.0 linked sheets (the owner, by prompt: "Two kinds", "A menu on the sheet", "Its owner and the GM", "Only the figures read"): a player's
// link set on the host (char-link, sliced and run for real with the real systemcore and formula engine), the figures an owner's copy carries
// (withLinkFigs) and the copy sent again when the linked sheet moves (linkTell). Invented names only
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const lkS = between('// [netcheck:charlink-start]', '// [netcheck:charlink-end]', 'charlink'), ltS = between('// [netcheck:linktell-start]', '// [netcheck:linktell-end]', 'linktell', 'netlink.js');
    const raw = { v: 1, name: 'L', rolls: [], fields: [{ id: 'f_mv', key: 'Move', kind: 'number', def: 5 }, { id: 'f_sc', key: 'Secret', kind: 'number', def: 9, vis: 'gm' }, { id: 'f_sp', key: 'Speed', kind: 'formula', formula: 'if(Mount.has, Mount.Move, Move)' }, { id: 'f_sn', key: 'Sneak', kind: 'formula', formula: 'Mount.Secret + 1' }],
        links: [{ id: 'lk_m', key: 'Mount', label: 'Mount', kind: 'mount' }, { id: 'lk_v', key: 'Vehicle', label: 'Vehicle', kind: 'crew', edit: 'gm' }] };
    const sys = Sx.cleanSystem(raw, { F: Fx, gmView: true }), view = Sx.cleanSystem(raw, { F: Fx, gmView: false });
    const chars0 = () => ({ c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', npc: false, values: {} }, c_peb: { id: 'c_peb', name: 'Pebbles', ownerId: 'u_a', npc: false, values: { f_mv: 12, f_sc: 3 } },
        c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', npc: false, values: {} }, c_npc: { id: 'c_npc', name: 'Old cart', ownerId: '', npc: true, values: { f_mv: 4 } } });
    const host = (msg, chars, more) => {
        const camp = { id: 'k', system: sys, chars: chars || chars0() }, out = { answer: [], synced: [], saves: 0, logs: [], changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = Object.assign({ active: true, role: 'host', paused: false, conns: [], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, syncChar: id => out.synced.push(id) }, more || {});
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { charChanged: id => out.changed.push(id) }, wpDiceCore: null, wpStepLog: (a, s, f) => out.logs.push([a, s, f]) };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'var charLimit = { allow: () => true }, _charSlowSaid = {};\n' + lkS)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; });
        out.camp = camp; return out;
    };
    const M = (to, more) => Object.assign({ type: 'char-link', rid: 'k1', charId: 'c_kael', linkId: 'lk_m', to }, more || {});
    const ok = host(M('c_peb')), off = (() => { const cs = chars0(); cs.c_kael.links = { lk_m: 'c_peb' }; return host(M(''), cs); })();
    check('1.6.0 linked sheets: a player\'s char-link (the host, run for real) links their own character as a mount: stored, saved once, acked, the character sent whole and redrawn, each step logged with no name; taking it off leaves no links key; every message packs',
        j(ok.camp.chars.c_kael.links) === j({ lk_m: 'c_peb' }) && ok.saves === 1 && j(ok.answer) === j([{ type: 'char-ack', rid: 'k1' }]) && j(ok.synced) === j(['c_kael']) && j(ok.changed) === j(['c_kael'])
        && j(ok.logs) === j([['links v1', 'asked', { on: 1 }], ['links v1', 'done', { on: 1 }]]) && !('links' in off.camp.chars.c_kael) && j(off.answer) === j([{ type: 'char-ack', rid: 'k1' }]) && off.saves === 1,
        j([ok.camp.chars.c_kael, ok.answer, ok.synced, ok.logs, off.camp.chars.c_kael]));
    const quiet = r => r.saves === 0 && r.synced.length === 0 && !('links' in r.camp.chars.c_kael || (r.camp.chars.c_sela && 'links' in r.camp.chars.c_sela && r.camp.chars.c_sela.links.lk_m !== 'c_peb'));
    const npc = host(M('c_npc')), mate = host(M('c_sela')), gmOnly = host(M('c_peb', { linkId: 'lk_v' })), self = host(M('c_kael')), gone = host(M('c_zed'));
    const other = host(M('c_peb', { charId: 'c_sela' })), taken = (() => { const cs = chars0(); cs.c_sela.links = { lk_m: 'c_peb' }; return host(M('c_peb'), cs); })();
    const words = r => r.answer.map(a => [a.type, a.reason, a.msg || '']);
    check('1.6.0 linked sheets: the host refuses with its words, storing, saving and sending nothing: an NPC or a teammate\'s character (a player links only their own), a link the GM sets, the character itself, one that is not there, another player\'s character as the rider, and a mount another rides (a player is never told who rides it)',
        [npc, mate, gmOnly, self, gone, taken].every(quiet) && other.saves === 0 && !('links' in other.camp.chars.c_sela)
        && j(words(npc)) === j([['char-deny', 'error', 'You can link only a character of your own.']]) && j(words(mate)) === j(words(npc)) && j(words(gmOnly)) === j([['char-deny', 'error', 'Only the GM sets Vehicle here.']])
        && j(words(self)) === j([['char-deny', 'error', 'A sheet cannot link to itself.']]) && j(words(gone)) === j([['char-deny', 'error', 'That character is not here now.']]) && j(words(other)) === j([['char-deny', 'owner', '']])
        && j(words(taken)) === j([['char-deny', 'error', 'Pebbles already has a rider.']]) && !/Sela/.test(j(taken.answer)),
        j([words(npc), words(gmOnly), words(self), words(gone), words(other), words(taken)]));
    const bad = [M('c_peb', { rid: 'bad rid' }), M('c_peb', { linkId: 'f_mv' }), M('c_peb', { to: 5 }), M('__proto__'), M('c_peb', { charId: 'constructor' })].map(m => host(m)), paused = host(M('c_peb'), null, { paused: true });
    check('1.6.0 linked sheets: a char-link of the wrong shape (a request id, a link id, a target that is not a character id, a prototype key) is dropped unanswered; a paused table answers paused and changes nothing',
        bad.every(r => r.answer.length === 0 && quiet(r)) && j(words(paused)) === j([['char-deny', 'paused', '']]) && quiet(paused), j(bad.map(r => r.answer).concat([paused.answer])));
    // withLinkFigs and linkTell: the owner's copy carries the figures read through the players' view, and a change of the mount sends it again once
    const camp = { id: 'k', system: sys, chars: chars0() }; camp.chars.c_kael.links = { lk_m: 'c_peb' };
    Sx.setLinkSource((id, s) => { const c = camp.chars[id]; return !c ? null : s === sys ? c : Sx.charForView(c, s, { full: sys }); });
    const sentL = [], logsL = [], mk = peer => ({ peer, open: true, send: m => { packCheck(m); sentL.push([peer, JSON.parse(JSON.stringify(m))]); } });
    const netL = { active: true, role: 'host', conns: [mk('pA'), mk('pB')], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const winL = { wpFormula: Fx, wpStepLog: (a, s, f) => logsL.push([a, s, f]) };
    const charViewFor = (id, pid) => { const f = new Function('SC', 'window', ltS + '\nreturn withLinkFigs;')(() => Sx, winL); return f(Sx.charFor(camp.chars[id], view, pid, {}), view); };
    const api = new Function('net', 'SC', 'window', 'getActiveCampaign', 'charViewFor', 'peerProfileId', 'sendFailed', ltS + '\nreturn { linkTell: linkTell, withLinkFigs: withLinkFigs };')(netL, () => Sx, winL, () => camp, charViewFor, c => netL.roster[c.peer].id, e => { throw e; });
    const own = charViewFor('c_kael', 'u_a'), mateV = api.withLinkFigs(Sx.charFor(camp.chars.c_kael, view, 'u_b', {}), view), cl = Sx.cleanChar(JSON.parse(j(own)), view, { state: 'owner' }); Sx.setLinkSource(null);
    const rP = Sx.makeResolver(view, cl, Fx); Sx.setLinkSource((id, s) => { const c = camp.chars[id]; return !c ? null : s === sys ? c : Sx.charForView(c, s, { full: sys }); });
    check('1.6.0 linked sheets: an owner\'s whole copy carries the figures of the sheet it links, worked out through the players\' view (Move 12, never the GM-only Secret, whose formula players see as GM only); a teammate\'s copy carries none; the player\'s app reads them as the host does',
        j(own.links) === j({ lk_m: 'c_peb' }) && j(own.lk) === j({ lk_m: { id: 'c_peb', name: 'Pebbles', v: { move: 12 } } }) && !/secret|"3"/i.test(j(own.lk)) && !('lk' in (mateV || {})) && !('links' in (mateV || {}))
        && rP('Speed') === 12 && rP('Mount.has') === 1 && view.fields.find(f => f.key === 'Sneak').formula === null, j([own, mateV, rP('Speed')]));
    api.linkTell('c_peb'); const first = sentL.slice(); sentL.length = 0; api.linkTell('c_peb'); const same = sentL.slice(); sentL.length = 0;
    camp.chars.c_peb.values.f_mv = 15; api.linkTell('c_peb'); const moved = sentL.slice(); sentL.length = 0; camp.chars.c_peb.values.f_sc = 1; api.linkTell('c_peb'); const secret = sentL.slice(); sentL.length = 0;
    api.linkTell('c_sela'); const none = sentL.slice(); netL.role = 'client'; camp.chars.c_peb.values.f_mv = 3; api.linkTell('c_peb'); const client = sentL.slice();
    check('1.6.0 linked sheets: a change of the linked sheet sends its rider\'s owner their copy whole, with the new figures, once (the same figures again send nothing, nor does a GM-only change), to them alone; a sheet nobody links sends nothing, and a player\'s app never sends; logged by count',
        first.length === 1 && first[0][0] === 'pA' && first[0][1].type === 'char' && first[0][1].char.id === 'c_kael' && same.length === 0 && moved.length === 1 && moved[0][1].char.lk.lk_m.v.move === 15
        && secret.length === 0 && none.length === 0 && client.length === 0 && logsL.every(l => l[0] === 'links v1' && l[1] === 'told' && typeof l[2].copies === 'number'), j([first, same, moved, secret, none, client, logsL]));
    Sx.setLinkSource(null);
    check('1.6.0 linked sheets (source): every way a character change leaves the host reaches linkTell through typeof (syncChar and syncCharDelta), the copy an owner is sent and the join snapshot carry the figures, and the host\'s branch judges by linkSet alone',
        (src.match(/if \(typeof linkTell === 'function'\) linkTell\(id\);/g) || []).length === 2 && (src.match(/\(typeof withLinkFigs === 'function' \? withLinkFigs : function\(v0\) \{ return v0; \}\)\(withHoverLines\(/g) || []).length === 2
        && (src.match(/linkSet\(/g) || []).length === 1 && lkS.indexOf("Sk.linkSet(campK.system, campK.chars, chK, qk.linkId, qk.to, qk.stn !== undefined ? { player: true, pid: profK.id, stn: qk.stn, F: window.wpFormula } : { player: true, pid: profK.id, F: window.wpFormula })") > lkS.indexOf("denyK('owner')"));   // CORE gap 16, and 1.6.2 (218) the engine for a station's filter (each a deliberate change of this pin): and the station the player picked
    // 1.6.2 (vehicles, fold (a)): a row of a player's own character joined to a sheet of their own, or a new sheet made from it, through the same
    // char-link branch, run for real; the figures the owner's copy carries, and that copy sent again once the joined sheet moves (sheetTell)
    {
        const rawV = { v: 1, name: 'V', rolls: [], fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_isv', key: 'IsV', kind: 'toggle' }, { id: 'f_vh', key: 'Vehicles', kind: 'item-list', list: { sheets: { on: 'f_isv' }, cols: [{ key: 'Hull', label: 'Hull', formula: 'Row.sheet.HP' }] } }], items: [{ id: 'i_sk', key: 'Skiff', name: 'Skiff' }] };
        const sysV = Sx.cleanSystem(rawV, { F: Fx, gmView: true }), viewV = Sx.cleanSystem(rawV, { F: Fx, gmView: false });
        const cV = () => ({ c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_vh: [{ id: 'w_s1', defId: 'i_sk', qty: 1 }] } }, c_bolt: { id: 'c_bolt', name: 'Bolt', ownerId: 'u_a', npc: false, values: { f_hp: 22 } }, c_sela: { id: 'c_sela', name: 'Sela', ownerId: 'u_b', npc: false, values: {} } });
        const hostV = (msg, chars) => {
            const camp = { id: 'k', system: sysV, chars: chars || cV() }, out = { answer: [], synced: [], saves: 0, logs: [], changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
            const netV = { active: true, role: 'host', paused: false, conns: [], roster: { pA: { id: 'u_a' } }, syncChar: id => out.synced.push(id) };
            const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { charChanged: id => out.changed.push(id) }, wpDiceCore: null, wpStepLog: (a, s, f) => out.logs.push([a, s, f]) };
            new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'var charLimit = { allow: () => true }, _charSlowSaid = {};\n' + lkS)(
                msg, { peer: 'pA', send: box(out.answer) }, netV, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; });
            out.camp = camp; return out;
        };
        const MR = more => Object.assign({ type: 'char-link', rid: 'k2', charId: 'c_kael', row: { f: 'f_vh', r: 'w_s1' } }, more);
        const jn = hostV(MR({ to: 'c_bolt' })), mk = hostV(MR({ make: true })), mkId = Object.keys(mk.camp.chars).find(id => !cV()[id]), made = mkId ? mk.camp.chars[mkId] : null;
        check('1.6.2 (vehicles, fold (a)): a player\'s char-link that names a row joins it to a sheet of their own, and with make makes a new one under the row\'s name, theirs and with the list\'s toggle on: stored, saved once, acked, the new sheet and the character sent and redrawn, each step logged with no name',
            jn.camp.chars.c_kael.values.f_vh[0].sh === 'c_bolt' && jn.saves === 1 && j(jn.answer) === j([{ type: 'char-ack', rid: 'k2' }]) && j(jn.synced) === j(['c_kael']) && j(jn.logs) === j([['links v1', 'asked', { on: 1 }], ['links v1', 'done', { row: 1, on: 1 }]])
            && !!made && made.name === 'Skiff' && made.ownerId === 'u_a' && made.npc === false && made.values.f_isv === true && mk.camp.chars.c_kael.values.f_vh[0].sh === mkId && j(mk.synced) === j([mkId, 'c_kael']) && j(mk.changed) === j([mkId, 'c_kael']) && mk.saves === 1 && mk.logs[1][1] === 'made',
            j([jn.camp.chars.c_kael, jn.answer, jn.logs, made, mk.synced, mk.logs]));
        const wordsV = r => r.answer.map(a => [a.type, a.reason, a.msg || '']), quietV = r => r.saves === 0 && r.synced.length === 0 && Object.keys(r.camp.chars).length === 3 && !('sh' in r.camp.chars.c_kael.values.f_vh[0]);
        const notMine = hostV(MR({ to: 'c_sela' })), noRow = hostV(MR({ to: 'c_bolt', row: { f: 'f_vh', r: 'w_zz' } })), noMake = hostV(MR({ make: true, row: { f: 'f_vh', r: 'w_zz' } })), bad = hostV(MR({ to: 'c_bolt', make: true }));
        check('1.6.2 (vehicles, fold (a)): the host refuses in the judge\'s words and keeps nothing: another player\'s sheet, a row that is not there, a new sheet for a row that is not there (made and then let go), and a make that names a sheet is no message at all',
            [notMine, noRow, noMake].every(quietV) && j(wordsV(notMine)) === j([['char-deny', 'owner', 'You can join only a sheet of your own.']]) && j(wordsV(noRow)) === j([['char-deny', 'error', 'That row is not there now.']]) && j(wordsV(noMake)) === j([['char-deny', 'missing', '']]) && bad.answer.length === 0 && quietV(bad),
            j([wordsV(notMine), wordsV(noRow), wordsV(noMake), bad.answer]));
        const campV = { id: 'k', system: sysV, chars: cV() }; campV.chars.c_kael.values.f_vh[0].sh = 'c_bolt';
        Sx.setLinkSource((id, s) => { const c = campV.chars[id]; return !c ? null : s === sysV ? c : Sx.charForView(c, s, { full: sysV }); });
        const sentV = [], logsV = [], mkC = peer => ({ peer, open: true, send: m => { packCheck(m); sentV.push([peer, JSON.parse(JSON.stringify(m))]); } });
        const netW = { active: true, role: 'host', conns: [mkC('pA'), mkC('pB')], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } }, winW = { wpFormula: Fx, wpStepLog: (a, s, f) => logsV.push([a, s, f]) };
        const ownFn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
        const viewFor = (id, pid) => { const f = new Function('SC', 'window', 'own', ltS + '\nreturn withLinkFigs;')(() => Sx, winW, ownFn); return f(Sx.charFor(campV.chars[id], viewV, pid, {}), viewV); };
        const apiV = new Function('net', 'SC', 'window', 'getActiveCampaign', 'charViewFor', 'peerProfileId', 'sendFailed', 'own', ltS + '\nreturn { linkTell: linkTell };')(netW, () => Sx, winW, () => campV, viewFor, c => netW.roster[c.peer].id, e => { throw e; }, ownFn);
        const ownV = viewFor('c_kael', 'u_a');
        apiV.linkTell('c_bolt'); const firstV = sentV.slice(); sentV.length = 0; apiV.linkTell('c_bolt'); const sameV = sentV.slice(); sentV.length = 0; campV.chars.c_bolt.values.f_hp = 9; apiV.linkTell('c_bolt'); const movedV = sentV.slice(); sentV.length = 0;
        Sx.setLinkSource(null);
        check('1.6.2 (vehicles, fold (a)): an owner\'s copy carries the figures of the sheets its rows are joined to, by row, and a change of such a sheet sends the row\'s owner their copy again, once, to them alone, logged by count',
            j(ownV.sk) === j({ w_s1: { id: 'c_bolt', name: 'Bolt', v: { hp: 22 } } }) && firstV.length === 1 && firstV[0][0] === 'pA' && firstV[0][1].char.sk.w_s1.v.hp === 22 && sameV.length === 0 && movedV.length === 1 && movedV[0][1].char.sk.w_s1.v.hp === 9 && logsV.every(l => l[0] === 'rowsheet v1' && l[1] === 'told'),
            j([ownV.sk, firstV, sameV, movedV, logsV]));
        check('1.6.2 (vehicles, fold (a)): a trade stores the sheets of the rows that changed hands (sheetsGo) and sends each to its new owner',
            src.includes("S.sheetsGo(camp.system, camp, cb, res.valuesB)") && src.includes("goA.give.concat(goB.give).forEach(function(sid) { net.syncChar(sid);") && kit.part('netlink.js').includes("if (S.sheetFigs) { var sk = S.sheetFigs(view, v, window.wpFormula); if (sk) v.sk = sk; }"));
    }
    // 1.6.2 (vehicles, fold (c)): a map's marks, the host's own (the tags slice run for real with the real systemcore): kept as a change put them on, sent to
    // each player as theirs (tokTags) and never a hidden token's, once a change, and cleaned again on a player's app (the tagsin slice)
    {
        const tgS = between('// [netcheck:tags-start]', '// [netcheck:tags-end]', 'tags'), tiS = between('// [netcheck:tagsin-start]', '// [netcheck:tagsin-end]', 'tagsin');
        const sysT = Sx.cleanSystem({ v: 1, name: 'T', fields: [], tags: [{ key: 'Hound', label: 'Hound', fight: true }, { key: 'Track', label: 'Track', turn: true }] }, { F: Fx, gmView: true });
        const mapT = { id: 'm1', type: 'map', meta: { title: 'Canyon' }, whiteboard: [{ id: 'tA', isChar: true, ownerId: 'u_a' }, { id: 'tB', isChar: true, ownerId: '' }, { id: 'tH', isChar: true, ownerId: '', hidden: true }, { id: 'tC', isChar: true, ownerId: 'u_b' }] };
        const campT = { id: 'k', system: sysT, items: { m1: mapT } }, sentT = [], saves = { n: 0 }, mkT = peer => ({ peer, open: true, send: m => { packCheck(m); sentT.push([peer, JSON.parse(JSON.stringify(m))]); } });
        const netT = { active: true, role: 'host', conns: [mkT('pA'), mkT('pB')], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const apiT = new Function('net', 'SC', 'window', 'getActiveCampaign', 'own', 'mapHeldOf', 'save', 'render', 'sendFailed', tgS + '\nreturn { tagsTell: tagsTell, tagsEnded: tagsEnded };')(netT, () => Sx, {}, () => campT, (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k), () => ({ m1: 1 }), () => { saves.n++; }, () => {}, e => { throw e; });
        netT.tagsPut([{ mapId: 'm1', by: 'tA', on: 'tB', k: 'Hound', put: true }, { mapId: 'm1', by: 'tH', on: 'tA', k: 'Track', put: true }, { mapId: 'm1', by: 'tB', on: 'tC', k: 'Hound', put: true }]);
        const toA = sentT.filter(s => s[0] === 'pA').map(s => s[1]), toB = sentT.filter(s => s[0] === 'pB').map(s => s[1]); sentT.length = 0; apiT.tagsTell(); const again = sentT.slice();
        check('1.6.2 (vehicles, fold (c)): the host keeps a mark on its map, saved, and sends each player the marks their own tokens hold or are held by, never one of a hidden token, nothing twice for the same marks; the map leaves with none of them',
            j(Sx.mapTagsOf(mapT, sysT)) === j([{ k: 'Hound', by: 'tA', on: 'tB' }, { k: 'Track', by: 'tH', on: 'tA' }, { k: 'Hound', by: 'tB', on: 'tC' }]) && saves.n === 1
            && j(toA) === j([{ type: 'tokTags', campId: 'k', itemId: 'm1', marks: [{ k: 'Hound', by: 'tA', on: 'tB' }] }]) && j(toB) === j([{ type: 'tokTags', campId: 'k', itemId: 'm1', marks: [{ k: 'Hound', by: 'tB', on: 'tC' }] }]) && again.length === 0, j([toA, toB, again]));
        sentT.length = 0; apiT.tagsEnded('m1', { fight: true });
        check('1.6.2 (vehicles, fold (c)): a fight\u2019s end takes off every mark of that map that ends with the fight, and the players are told', j(Sx.mapTagsOf(mapT, sysT)) === j([{ k: 'Track', by: 'tH', on: 'tA' }]) && sentT.length === 2 && sentT.every(s => j(s[1].marks) === j([])), j([mapT.meta, sentT]));
        const stP = { appState: { activeCampaignId: 'k' } }, campP = { id: 'k', system: sysT }, drew = { n: 0 };
        const runIn = (msg, peer) => new Function('msg', 'conn', 'net', 'state', 'SC', 'getActiveCampaign', 'validKey', 'render', '_tagsSeen', tiS)(msg, { peer: peer || 'host' }, { foreign: true, syncedPeer: 'host', stream: false }, stP, () => Sx, () => campP, k => typeof k === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(k), () => { drew.n++; }, seen);
        const seen = Object.create(null); runIn({ type: 'tokTags', campId: 'k', itemId: 'm1', marks: [{ k: 'hound', by: 'tA', on: 'tB' }, { k: 'Nope', by: 'tA', on: 'tB' }, { k: 'Hound', by: '<x>', on: 'tB' }, 5] }); runIn({ type: 'tokTags', campId: 'k', itemId: 'm2', marks: [{ k: 'Hound', by: 'a', on: 'b' }] }, 'stranger');
        check('1.6.2 (vehicles, fold (c)): a player\u2019s app takes the marks from the synced host alone, cleaned by its own system: a mark it does not have and a token id that is no id are gone', j(seen.m1) === j([{ k: 'Hound', by: 'tA', on: 'tB' }]) && !('m2' in seen) && drew.n === 1, j([seen, drew]));
    }
})());
// The core handbook session's ask (2026-10-29, after ask 6): a crew figure that reads the vehicle doing the reading (Vehicle.Class). The host's
// withLinkFigs (the linktell slice, run for real with the real systemcore and formula engine) gives a player's vehicle its crew figures, ck,
// worked out through the players' view: each vehicle its own, and never a figure read from a GM-only name of the vehicle. Invented names only
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ltS = between('// [netcheck:linktell-start]', '// [netcheck:linktell-end]', 'linktell', 'netlink.js');
    const raw = { v: 1, name: 'V', rolls: [], fields: [{ id: 'f_cl', key: 'Class', kind: 'number', def: 0 }, { id: 'f_sk', key: 'Skiffs', kind: 'number', def: 0 }, { id: 'f_hl', key: 'Haulers', kind: 'number', def: 0 },
        { id: 'f_hu', key: 'Hush', kind: 'number', def: 0, vis: 'gm' }, { id: 'f_he', key: 'Helm', kind: 'formula', formula: 'Crew.Pilot.max.Fly' }, { id: 'f_qu', key: 'Quiet', kind: 'formula', formula: 'Crew.max.Hidden' }],
        links: [{ id: 'lk_v', key: 'Vehicle', label: 'Vehicle', kind: 'crew', group: 'Crew', stations: ['Pilot'], figs: [{ key: 'Fly', formula: 'if(Vehicle.Class = 1, Skiffs, Haulers)' }, { key: 'Hidden', formula: 'Vehicle.Hush + 1' }] }] };
    const sys = Sx.cleanSystem(raw, { F: Fx, gmView: true }), view = Sx.cleanSystem(raw, { F: Fx, gmView: false });
    const chars = { c_sk: { id: 'c_sk', name: 'Gull', ownerId: 'u_a', npc: false, values: { f_cl: 1, f_hu: 7 } }, c_hl: { id: 'c_hl', name: 'Ox', ownerId: 'u_a', npc: false, values: { f_cl: 2, f_hu: 7 } },
        c_ana: { id: 'c_ana', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sk: 14, f_hl: 9 }, links: { lk_v: 'c_sk' }, stn: { lk_v: 'Pilot' } },
        c_bo: { id: 'c_bo', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_sk: 11, f_hl: 13 }, links: { lk_v: 'c_hl' }, stn: { lk_v: 'Pilot' } } };
    Sx.setCrewSource((id, lid, s) => Object.keys(chars).map(k => chars[k]).filter(x => x.links && x.links[lid] === id).map(x => s === sys ? x : Sx.charForView(x, s, { full: sys })));
    const winL = { wpFormula: Fx, wpStepLog: () => {} };
    const wlf = new Function('SC', 'window', ltS + '\nreturn withLinkFigs;')(() => Sx, winL);
    const own = id => wlf(Sx.charFor(chars[id], view, 'u_a', {}), view);
    const gmR = id => Sx.makeResolver(sys, chars[id], Fx);
    const sk = own('c_sk'), hl = own('c_hl'), gm = [gmR('c_sk')('Helm'), gmR('c_hl')('Helm'), gmR('c_sk')('Quiet')];
    Sx.setCrewSource(null);
    const rP = id => Sx.makeResolver(view, Sx.cleanChar(JSON.parse(j(id === 'c_sk' ? sk : hl)), view, { state: 'owner' }), Fx);
    check('the core handbook session\'s ask (after ask 6): the host gives a player\'s vehicle its crew figures (ck) through the players\' view, a figure that reads Vehicle.Class picking by that very vehicle\'s class (Ana flies the skiff by Skiffs, 14; Bo the hauler by Haulers, 13), the same figures the GM\'s sheet reads; a figure read from the GM-only Vehicle.Hush is never among them, though the GM reads it (8); the player\'s app reads them back; every copy packs',
        j(sk.ck) === j({ lk_v: { v: { 'pilot.max.fly': 14 } } }) && j(hl.ck) === j({ lk_v: { v: { 'pilot.max.fly': 13 } } }) && j(gm) === j([14, 13, 8]) && !/hidden|"8"/i.test(j([sk.ck, hl.ck]))
        && rP('c_sk')('Helm') === 14 && rP('c_hl')('Helm') === 13 && (() => { try { packCheck(sk); packCheck(hl); return true; } catch (e) { return false; } })(), j([sk.ck, hl.ck, gm]));
})());

    // ---- run once the host's blocks are under way (in netcheck.js this stood in its summary) ----
    {   // 1.6.2 (CORE Ch19): crew who act in the vehicle's turn (net.js crewturn slice, run for real; the parry that takes the blow is in attackcheck.js)
        const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
        const ctS = src.slice(src.indexOf('// [netcheck:crewturn-start]'), src.indexOf('// [netcheck:crewturn-end]')), netC = { combats: { f1: { id: 'f1' } } }, inFight = { c_v: 'f1' };
        const ctA = new Function('net', 'own', 'orderOfIn', ctS + '\nreturn { crewVeh, crewVehFight, crewOfVeh };')(netC, own, (camp, id) => inFight[id] || null);
        const campC = { system: { links: [{ id: 'k_crew', kind: 'crew', vturn: true }, { id: 'k_old', kind: 'crew' }] }, chars: { c_v: { id: 'c_v' }, c_p: { id: 'c_p', links: { k_crew: 'c_v' } }, c_g: { id: 'c_g', links: { k_old: 'c_v' } }, c_t: { id: 'c_t', links: { k_crew: 'c_v' } } } };
        inFight.c_t = 'f2';
        const v1 = ctA.crewVeh(campC, 'c_p'), v2 = ctA.crewVeh(campC, 'c_g'), v3 = ctA.crewVeh(campC, 'c_t'), fg = ctA.crewVehFight(campC, 'c_p'), crew = ctA.crewOfVeh(campC, 'c_v');
        delete inFight.c_v; const v4 = ctA.crewVeh(campC, 'c_p');
        check('1.6.2 a crew member with no fight of their own, at a Crew link ticked Crew act in the vehicle\'s turn, is judged by the vehicle in its fight; a link not ticked, a crew member with a fight of their own and a vehicle in no fight give none',
            v1 === 'c_v' && v2 === null && v3 === null && fg === netC.combats.f1 && JSON.stringify(crew) === JSON.stringify(['c_p']) && v4 === null, JSON.stringify([v1, v2, v3, crew, v4]));
        check('1.6.2 the hooks: Off a character\'s turn asks the vehicle\'s turn for its crew, a press spends the crew member\'s own action in the vehicle\'s fight, their actions come back at its turn\'s start and go at a fight\'s end, and a player\'s damage message carries thru',
            src.includes("if (!fid && typeof crewVeh === 'function') { var cvO = crewVeh(camp, charId); if (cvO) return offTurnOf(camp, cvO); }") && src.includes("var cbS = actsCombat(camp, charId, pr) || (typeof crewVehFight === 'function' ? crewVehFight(camp, charId) : null); if (!a || !cbS) return '';")
            && src.includes("if (typeof crewOfVeh === 'function') crewOfVeh(camp, w.charId).forEach(function(cid) { delete net.turnSpent[cid];") && src.includes("'weapon', 'only', 'thru', 'part2'") && kit.part('netattack.js').includes("if (pass === true && ch && typeof thruNote === 'function' && !(rec && (typeof rec.lw === 'string' || rec.area))) thruNote(camp, ch, row, pick && pick.line ? pick.line.does === 'thru' : undefined);"));   /* 1.6.3 (defense fold 3): never for a landing, and as the line picked says (moved on purpose); the review of that fold: nor for a line's hit (moved on purpose) */
    }

    await T.finish();
})();
