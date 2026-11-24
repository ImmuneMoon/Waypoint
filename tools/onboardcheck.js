'use strict';
/* onboardcheck.js: who plays what and how a character comes to a table: onboarding F0 to F4 (the binding by id, players without a character,
   a character to take away and printed, one a player makes, a file that fills it, Start from a file), an upload on the wire and
   the GM's queue (U2), an outside sheet reader's hook, postureSeven, grid-shaped tokens, the token creator, Help and the tour of
   1.5.0, a sheet revision (190), a character dropped from the Campaign Cast and a sheet's own file read back.
   These are the tests that came out of systemcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split",
   step 3, 2026-11-19). Their code is systemcore.js's own lines and the parts and slices each block reads by name, so the suite
   imports systemcore.js as systemcheck.js does (kit.sysCore, the top every suite out of it starts from). Each block is as it stood
   in systemcheck.js, word for word, with the comment that heads it.
   Usage: node tools/onboardcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('system'), check = T.check;
const j = v => JSON.stringify(v);

(async () => {
    const core = await kit.sysCore();   // systemcore.js and formula.js imported, the names systemcheck.js unpacks, the two presets and flatKids
    const { S, F, err } = core;
    check('onboardcheck: systemcore.js and formula.js load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, cleanSystem, cleanChar, resolveAll, charFor } = core;

    /* ---- Onboarding F0: who plays what — the binding by id, one chooser for owned tokens, one resolver for a player's token ---- */
    {
        const tok = (id, o) => Object.assign({ id, type: 'circle', isChar: true, x: 0, y: 0, w: 60, h: 52 }, o || {});
        const base = () => ({
            chars: { c_a: { id: 'c_a', name: 'Brakka', ownerId: 'u_a', npc: false, values: {}, updated: 5 }, c_w: { id: 'c_w', name: 'Wolf', ownerId: 'u_a', npc: false, values: {}, updated: 9 },
                     c_b: { id: 'c_b', name: 'Mira', ownerId: 'u_b', npc: false, values: {}, updated: 1 }, c_n: { id: 'c_n', name: 'Guard', ownerId: '', npc: true, values: {}, updated: 1 } },
            players: { u_a: { name: 'Alice', charName: 'Brakka', lastMap: 'm1' }, u_b: { name: 'Bob' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [] }, m2: { id: 'm2', type: 'map', whiteboard: [] }, d1: { id: 'd1', type: 'doc' } } });
        // activeCharOf: the record, the only one, the guess (old name, then a token on their last map, then the most recent); NPCs and ones in the making never
        const a1 = base(); a1.players.u_a.charId = 'c_w';
        const a2 = base(); a2.players.u_a.charId = 'c_b';   // names another player's character: not theirs
        const a3 = base(); delete a3.players.u_a.charName; a3.items.m1.whiteboard.push(tok('t1', { charId: 'c_a', ownerId: 'u_a' }));
        const a4 = base(); delete a4.players.u_a.charName;
        const a5 = base(); a5.chars.c_a.making = 1; a5.chars.c_w.npc = true;
        const r = [S.activeCharOf(a1, 'u_a'), S.activeCharOf(a2, 'u_a'), S.activeCharOf(a3, 'u_a'), S.activeCharOf(a4, 'u_a'), S.activeCharOf(base(), 'u_b'), S.activeCharOf(a5, 'u_a'), S.activeCharOf(base(), 'u_z'), S.activeCharOf(base(), '__proto__')];
        check('onboarding F0: activeCharOf — the record when it still names one of theirs; else their only one; else a guess (their old name, then a token they hold on their last map, then the most recently changed); never an NPC, one in the making or another player\'s; nobody for a player with none',
            j(r) === j([{ id: 'c_w', how: 'record' }, { id: 'c_a', how: 'guess' }, { id: 'c_a', how: 'guess' }, { id: 'c_w', how: 'guess' }, { id: 'c_b', how: 'only' }, { id: null, how: 'none' }, { id: null, how: 'none' }, { id: null, how: 'none' }]), j(r));
        // ownedTokenPlan: one owned token per character per map, only for the character in play; keep, then already held, then topmost
        const p1 = base(); p1.players.u_a.charId = 'c_a';
        p1.items.m1.whiteboard.push(tok('t1', { charId: 'c_a', ownerId: 'u_a' }), tok('t2', { charId: 'c_a', layer: 'front' }), tok('t3', { charId: 'c_w', ownerId: 'u_a' }), tok('t4', { charName: 'Pet', ownerId: 'u_a' }),
            tok('t5', { charName: 'Pet', ownerId: 'u_a' }), tok('t6', { charId: 'c_n', ownerId: 'u_a' }), tok('t7', { charId: 'c_gone', ownerId: 'u_a' }), tok('t8', { charName: 'Horse', ownerId: 'u_a' }));
        p1.items.m2.whiteboard.push(tok('t9', { charId: 'c_a' }), tok('t10', { charId: 'c_b' }));
        const pl1 = S.ownedTokenPlan(p1, {}), plK = S.ownedTokenPlan(p1, { keep: 't2' }), plM = S.ownedTokenPlan(p1, { mapId: 'm2' });
        const want1 = [{ mapId: 'm1', wbId: 't3', ownerId: '' }, { mapId: 'm1', wbId: 't6', ownerId: '' }, { mapId: 'm1', wbId: 't4', ownerId: '' }, { mapId: 'm2', wbId: 't9', ownerId: 'u_a' }, { mapId: 'm2', wbId: 't10', ownerId: 'u_b' }];
        const byKey = l => l.map(o => o.mapId + '|' + o.wbId + '|' + o.ownerId).sort();
        check('onboarding F0: ownedTokenPlan — the copy the player already holds stays theirs, a kept character\'s token and an NPC\'s pass to the GM, one token per name for tokens without a character (the topmost), a token of a missing character is left alone, and a map with none held gives the character\'s owner one',
            j(byKey(pl1)) === j(byKey(want1)), j(pl1));
        check('onboarding F0: ownedTokenPlan — keep (a give) wins over the copy already held, which passes to the GM still linked; mapId limits the plan to one map',
            byKey(plK).indexOf('m1|t2|u_a') >= 0 && byKey(plK).indexOf('m1|t1|') >= 0 && plM.every(o => o.mapId === 'm2') && plM.length === 2, j([plK, plM]));
        S.applyOwnerOps(p1, pl1);
        const after = p1.items.m1.whiteboard.map(w => w.id + ':' + (w.ownerId || '')).join(',');
        check('onboarding F0: applying the plan, then planning again, changes nothing (stable), and links are never removed',
            after === 't1:u_a,t2:,t3:,t4:,t5:u_a,t6:,t7:u_a,t8:u_a' && S.ownedTokenPlan(p1, {}).length === 0 && p1.items.m1.whiteboard.filter(w => w.charId).length === 5, after);
        // the undo-shaped merge: two copies both owned (live owner, snapshot link) — exactly one stays owned; the topmost with nothing held
        const p2 = base(); p2.players.u_a.charId = 'c_a'; p2.items.m1.whiteboard.push(tok('u1', { charId: 'c_a', ownerId: 'u_a' }), tok('u2', { charId: 'c_a', ownerId: 'u_a' }));
        S.applyOwnerOps(p2, S.ownedTokenPlan(p2, {}));
        const p3 = base(); p3.players.u_a.charId = 'c_a'; p3.items.m1.whiteboard.push(tok('v1', { charId: 'c_a', z: 40 }), tok('v2', { charId: 'c_a' }));
        S.applyOwnerOps(p3, S.ownedTokenPlan(p3, {}));
        check('onboarding F0: after an undo brings back two owned copies, exactly one stays owned; with none held, the topmost (its layer or z, then the later one) is given',
            p2.items.m1.whiteboard.filter(w => w.ownerId === 'u_a').length === 1 && p3.items.m1.whiteboard.map(w => w.ownerId || '').join(',') === 'u_a,', j([p2.items.m1.whiteboard, p3.items.m1.whiteboard]));
        // migrateBindings: the one in play written once, name-only tokens THEY hold linked, idempotent, never a prototype write
        const m1 = base();
        m1.chars.c_c = { id: 'c_c', name: 'Cato', ownerId: 'u_c', npc: false, values: {}, updated: 2 };
        m1.chars.c_p = { id: 'c_p', name: 'Poison', ownerId: '__proto__', npc: false, values: {}, updated: 2 };
        m1.items.m1.whiteboard.push(tok('n1', { charId: 'c_a', ownerId: 'u_a' }), tok('n2', { charId: 'c_w', ownerId: 'u_a' }));
        m1.items.m2.whiteboard.push(tok('n3', { charName: 'Brakka', ownerId: 'u_a' }), tok('n4', { charName: 'Brakka' }), tok('n5', { charName: 'Mira', ownerId: 'u_a' }));
        const mg = S.migrateBindings(m1), snapM = j(m1), mg2 = S.migrateBindings(m1);
        check('onboarding F0: migrateBindings — each KNOWN owner gets the character in play written down (a guess listed, a player with several listed with the kept ones), the name kept in step; an owner with no record gets none (a Forget stays forgotten); only a name-only token THEY hold is linked (never an unowned one or a different name); a second run changes nothing; a prototype owner is skipped',
            m1.players.u_a.charId === 'c_a' && m1.players.u_a.charName === 'Brakka' && m1.players.u_b.charId === 'c_b' && !('u_c' in m1.players)
            && mg.bound === 2 && mg.linked === 1 && j(mg.guesses) === j([{ pid: 'u_a', id: 'c_a' }]) && j(mg.several) === j([{ pid: 'u_a', id: 'c_a', kept: ['c_w'] }])
            && m1.items.m2.whiteboard[0].charId === 'c_a' && !m1.items.m2.whiteboard[1].charId && !m1.items.m2.whiteboard[2].charId
            && mg2.bound === 0 && mg2.linked === 0 && j(m1) === snapM && ({}).charId === undefined && ({}).charName === undefined, j([mg, m1.players]));
        const m2 = base(); m2.items.m1.whiteboard.push(tok('k1', { charName: 'Brakka', ownerId: 'u_a' })); const mgNo = S.migrateBindings(m2, { link: false });
        check('onboarding F0: migrateBindings { link: false } (syncOwners\' heal) writes the binding but links nothing', mgNo.linked === 0 && !m2.items.m1.whiteboard[0].charId && m2.players.u_a.charId === 'c_a', j(mgNo));
        // tokenSourceFor: keep, adopt (never a hidden copy), prefer, clone (theirs first, never another player's), link by name, spawn; the legacy path
        const s = base(); s.players.u_a.charId = 'c_a';
        const src = (camp, pid, map, o) => { const x = S.tokenSourceFor(camp, pid, map, o); return x.op + (x.tok ? ':' + x.tok.id : '') + (x.here === false ? '@far' : ''); };
        const sK = base(); sK.players.u_a.charId = 'c_a'; sK.items.m1.whiteboard.push(tok('s1', { charId: 'c_a', ownerId: 'u_a' }), tok('s2', { charId: 'c_a' }));
        const sA = base(); sA.players.u_a.charId = 'c_a'; sA.items.m1.whiteboard.push(tok('s3', { charId: 'c_a', hidden: true }), tok('s4', { charId: 'c_a' }));
        const sH = base(); sH.players.u_a.charId = 'c_a'; sH.items.m1.whiteboard.push(tok('s5', { charId: 'c_a', hidden: true }));
        const sC = base(); sC.players.u_a.charId = 'c_a'; sC.items.m2.whiteboard.push(tok('s6', { charId: 'c_a' }), tok('s7', { charId: 'c_a', ownerId: 'u_a' }), tok('s8', { charId: 'c_a', ownerId: 'u_b' }));
        const sX = base(); sX.players.u_a.charId = 'c_a'; sX.items.m2.whiteboard.push(tok('s9', { charId: 'c_a', ownerId: 'u_b' }));
        const sL = base(); sL.players.u_a.charId = 'c_a'; sL.items.m1.whiteboard.push(tok('l1', { charName: 'Brakka', ownerId: 'u_b' }), tok('l2', { charName: 'Brakka' }));
        const sF = base(); sF.players.u_a.charId = 'c_a'; sF.items.m2.whiteboard.push(tok('l3', { charName: 'Brakka', ownerId: 'u_a' }));
        const drag = tok('dr', { charId: 'c_a', ownerId: 'u_a' });
        const rs = [src(sK, 'u_a', 'm1'), src(sA, 'u_a', 'm1'), src(sH, 'u_a', 'm1'), src(sC, 'u_a', 'm1'), src(sX, 'u_a', 'm1'), src(sL, 'u_a', 'm1'), src(sF, 'u_a', 'm1'), src(s, 'u_a', 'm1', { prefer: drag }), src(sK, 'u_a', 'm1', { prefer: drag }), src(s, 'u_a', 'd1'), src(s, 'u_a', 'nope')];
        check('onboarding F0: tokenSourceFor — their own copy here is kept; an unowned copy here adopted (a hidden one is GM staging: a copy is made instead); a copy from another map, theirs first and never another player\'s; a token bound only by name (theirs or nobody\'s, never another player\'s) linked, here or from afar; the GM\'s dragged token preferred over a copy but never over one already here; a new token when there is none; nothing for a map that is not a play map',
            j(rs) === j(['keep:s1', 'adopt:s4', 'spawn', 'clone:s7', 'spawn', 'link:l2', 'link:l3@far', 'clone:dr', 'keep:s1', 'none', 'none']), j(rs));
        // the legacy name binding (a player without a character): never another player's token (H2), never a linked one, nothing once unbound (H1)
        const g = base(); delete g.chars.c_b; g.players.u_b.charName = 'Mira';
        g.items.m1.whiteboard.push(tok('g1', { charName: 'Mira', ownerId: 'u_x' }), tok('g2', { charName: 'Mira', charId: 'c_a' }));
        g.items.m2.whiteboard.push(tok('g3', { charName: 'Mira', ownerId: 'u_x' }), tok('g4', { charName: 'Mira' }));
        const g2 = base(); delete g2.chars.c_b; g2.players.u_b.charName = 'Mira'; g2.items.m1.whiteboard.push(tok('g5', { charName: 'Mira', hidden: true }), tok('g6', { charName: 'Other', ownerId: 'u_b' }));
        const g3 = base(); delete g3.chars.c_b;
        const lg = [src(g, 'u_b', 'm1'), src(g2, 'u_b', 'm1'), src(g3, 'u_b', 'm1')];
        check('onboarding F0: the old name binding (no character) — a copy of an unowned, unlinked token of that name; never another player\'s token or one linked to a character (H2); a token they hold is kept; nothing without a binding (H1: the GM took it back)',
            j(lg) === j(['clone:g4', 'keep:g6', 'none']), j(lg));
        const pa = base(); pa.players.u_a.charId = 'c_w'; const pg = base(); delete pg.chars.c_b; pg.players.u_b.charName = 'Mira';
        check('onboarding F0: playsAs — the character in play, else the old name binding, else nothing', S.playsAs(pa, 'u_a') === 'Wolf' && S.playsAs(pg, 'u_b') === 'Mira' && S.playsAs(base(), 'u_z') === '');
        const ow = ['u_a', '__proto__', 'constructor', 'bad id!', ''].map(o => cleanChar({ id: 'c_1', name: 'X', ownerId: o, values: {} }, cleanSystem({ v: 1, name: 'O', fields: [], rolls: [] }, { F, gmView: true })).ownerId);
        check('onboarding F0: cleanChar keeps an owner only when it is a profile id (never a prototype key or a stray string)', j(ow) === j(['u_a', '', '', '', '']), j(ow));
        // the critic's fixes: a guess without a record is stable (by name, never "whoever was touched last"); sheets off keeps every owned character
        // in play; an unowned namesake elsewhere or a room roster's token is never captured by name; nothing is made on arrival with sheets off
        const q = base(); q.chars.c_z = { id: 'c_z', name: 'Zed', ownerId: 'u_q', npc: false, values: {}, updated: 99 }; q.chars.c_y = { id: 'c_y', name: 'Abe', ownerId: 'u_q', npc: false, values: {}, updated: 1 };
        const qa = S.activeCharOf(q, 'u_q'); q.chars.c_y.updated = 500; const qb = S.activeCharOf(q, 'u_q');
        const al = base(); al.players.u_a.charId = 'c_a'; al.items.m1.whiteboard.push(tok('a1', { charId: 'c_w', ownerId: 'u_a' }), tok('a2', { charId: 'c_w' }));
        const alOps = S.ownedTokenPlan(al, { all: true }), alKept = S.ownedTokenPlan(al, {});
        const nm = base(); nm.players.u_a.charId = 'c_a'; nm.items.m2.whiteboard.push(tok('x1', { charName: 'Brakka' })); nm.items.m1.whiteboard.push(tok('x2', { charName: 'Brakka', charRef: 'r_npc' }));
        const nmR = [src(nm, 'u_a', 'm1'), src(nm, 'u_a', 'm1', { noSpawn: true }), src(base(), 'u_b', 'm1', { noSpawn: true })];
        const opsMaps = (() => { const x = base(); x.players.u_a.charId = 'c_a'; x.items.m2.whiteboard.push(tok('y1', { charId: 'c_a' })); return S.applyOwnerOps(x, S.ownedTokenPlan(x, {})); })();
        check('onboarding F0 (critic): a guess without a record is by name and stays put when a character is edited; sheets off keeps every owned character in play (no kept stripping); a namesake elsewhere or a room roster\'s token is never captured; nothing is made on arrival with sheets off; applyOwnerOps names the maps it changed (the host sends them)',
            qa.id === 'c_y' && qb.id === 'c_y' && qa.how === 'guess' && alOps.length === 0 && byKey(alKept).indexOf('m1|a1|') >= 0 && j(nmR) === j(['spawn', 'none', 'none']) && j(opsMaps) === j(['m2']), j([qa, qb, alOps, alKept, nmR, opsMaps]));
        // the code review's fixes: a hidden copy nobody holds is never handed out (a shown one wins; a hidden one they hold stays theirs); their own
        // name-bound token here is linked before anything is copied in; name links happen once (not again at a later load)
        const h1 = base(); h1.players.u_a.charId = 'c_a'; h1.items.m1.whiteboard.push(tok('h1', { charId: 'c_a', hidden: true }));
        const h2 = base(); h2.players.u_a.charId = 'c_a'; h2.items.m1.whiteboard.push(tok('h2s', { charId: 'c_a', layer: 'middle' }), tok('h2h', { charId: 'c_a', layer: 'front', hidden: true }));
        const h3 = base(); h3.players.u_a.charId = 'c_a'; h3.items.m1.whiteboard.push(tok('h3s', { charId: 'c_a', ownerId: 'u_a' }), tok('h3h', { charId: 'c_a', ownerId: 'u_a', hidden: true, layer: 'front' }));
        const h4 = base(); h4.players.u_a.charId = 'c_a'; h4.items.m1.whiteboard.push(tok('h4', { charId: 'c_a', ownerId: 'u_a', hidden: true }));
        const hr = [S.ownedTokenPlan(h1, {}), S.ownedTokenPlan(h2, {}), S.ownedTokenPlan(h3, {}), S.ownedTokenPlan(h4, {})].map(byKey);
        const ln = base(); ln.players.u_a.charId = 'c_a'; ln.items.m1.whiteboard.push(tok('ln1', { charName: 'Brakka', ownerId: 'u_a' })); ln.items.m2.whiteboard.push(tok('ln2', { charId: 'c_a', ownerId: 'u_a' }));
        const once = base(); once.players.u_a.charId = 'c_a'; once.items.m1.whiteboard.push(tok('o1', { charId: 'c_a', ownerId: 'u_a' }), tok('o2', { charName: 'Brakka', ownerId: 'u_a' }));
        const onceR = S.migrateBindings(once);
        check('onboarding F0 (review): a hidden copy nobody holds gets no owner and a shown one beats a hidden one on a higher layer; among held copies the shown one stays; a hidden token they hold stays theirs; their name-bound token here is linked before a copy comes in from another map; a later load links nothing by name',
            j(hr) === j([[], ['m1|h2s|u_a'], ['m1|h3h|'], []]) && src(ln, 'u_a', 'm1') === 'link:ln1' && onceR.linked === 0 && !once.items.m1.whiteboard[1].charId, j([hr, src(ln, 'u_a', 'm1'), onceR]));
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ioF = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), inF = fs.readFileSync(path.join(app, 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, '\n');
        check('onboarding F0: every owner write goes through giveCharacter (no bindPlayer left; newCharacter is born unassigned); syncOwners is the shared chooser; the loader and undo run the same chooser; Player Owner is disabled on an NPC\'s token and binds by name only a token without a character',
            !/bindPlayer/.test(shF) && /ownerId: '', portrait: o && o\.portrait/.test(shF) && /var maps = applyOwnerOps\(camp, ownedTokenPlan\(camp, \{ keep: keep \|\| '', all: !sheetsOnIn\(camp\) \}\)\);\n\s*if \(maps\.length && n && n\.active && n\.role === 'host' && n\.pushItems/.test(shF)
            && (shF.match(/giveCharacter\(/g) || []).length >= 6 && /SCm\.applyOwnerOps\(c, SCm\.ownedTokenPlan\(c, \{ all: !sheetsOnM \}\)\)/.test(ioF) && /if \(SCm\.migrateBindings && !c\._foreign\)/.test(ioF) && /applyContent\(item, parsed\);\n\n\s*if \(item\.type === 'map' && window\.wpSheets && window\.wpSheets\.syncOwners\) window\.wpSheets\.syncOwners\(camp\);/.test(ioF)
            && /if \(campO && w\.charName && !linkedO\) \{/.test(inF) && /disabled title="An NPC/.test(inF)
            && /var pid = w\.ownerId, playing = activeCharOf\(camp, pid\)\.id, play = !playing;\n\s*giveCharacter\(pid, c\.id, \{ keep: w\.id, play: play, nearTok: w \}\);/.test(shF)
            && /if \(!c\.ownerId && !w\.ownerId\) return;\n\s*if \(!w\.ownerId\) \{ var nT = net\(\); if \(nT && nT\.noWaiting && !playableChars\(camp, c\.ownerId\)\.some\(function\(x\) \{ return x\.id !== c\.id; \}\)\) nT\.noWaiting\(c\.ownerId\); \}[^\n]*\n\s*giveCharacter\(w\.ownerId \|\| '', c\.id, \{ keep: w\.id \}\);/.test(shF) && (shF.match(/giveTokenChar\(camp, w, c\)/g) || []).length === 3);
    }
    /* ---- Stage 6 U2: an upload on the wire (cleanCharUpload), setting B (cleanListRules), the GM's queue (cleanUploads) ---- */
    {
        const big = { name: 'X', notes: 'a'.repeat(S.LIMITS.uploadBytes) }, ok1 = S.cleanCharUpload({ rid: 'e1', charId: 'c_1', sheet: { name: 'Tavis', portrait: 'data:image/png;base64,' + 'A'.repeat(2000000), skills: [] }, junk: 1 });
        check('U2 cleanCharUpload: an upload is { rid, charId, sheet } only — the sheet a plain object, its portrait dropped before it is measured (the token\'s art is the portrait), at most LIMITS.uploadBytes as JSON; a bad rid or character id, an array, a string or an oversize sheet is null',
            j(ok1) === j({ rid: 'e1', charId: 'c_1', sheet: { name: 'Tavis', skills: [] } }) && S.cleanCharUpload({ rid: 'e1', charId: 'c_1', sheet: big }) === null
            && [{ rid: 'e 1', charId: 'c_1', sheet: {} }, { rid: 'e1', charId: 'x', sheet: {} }, { rid: 'e1', charId: 'c_1', sheet: [] }, { rid: 'e1', charId: 'c_1', sheet: 'x' }, { charId: 'c_1', sheet: {} }, null, 'x'].every(m => S.cleanCharUpload(m) === null) && S.LIMITS.uploadBytes === 10485760 && S.LIMITS.uploads === 20, j(ok1));
        const lrSys = v => cleanSystem({ v: 1, name: 'Q', rolls: [], fields: [], listRules: v }, { F, gmView: false }).listRules;
        check('U2 cleanListRules (setting B): uploadFacts true is kept beside ownerStats or alone, in the players\' view too; anything else is absent',
            j(S.cleanListRules({ uploadFacts: true })) === j({ uploadFacts: true }) && j(S.cleanListRules({ ownerStats: true, uploadFacts: true, x: 1 })) === j({ ownerStats: true, uploadFacts: true }) && S.cleanListRules({ uploadFacts: 'yes' }) === null
            && j(S.cleanListRules({ ownerStats: true, uploadFacts: 1 })) === j({ ownerStats: true }) && j(lrSys({ uploadFacts: true })) === j({ uploadFacts: true }) && lrSys({ uploadFacts: false }) === undefined);
        const chg = (id, kind, extra) => Object.assign({ id, kind, f: 'f_sk', label: 'Skills: ' + id, from: 'a', to: 'b', accept: true }, extra || {});
        const q = [{ id: 'up_a', charId: 'c_1', from: 'u_a', name: 'Pat', at: 5, changes: [chg('u_1', 'fact', { row: 'w_a', facts: { lvl: 3 }, qty: 2, junk: 1 }), chg('u_2', 'stat', { row: 'w_b', ov: { name: 'X' }, accept: false, held: true }), chg('u_2', 'fact'), chg('u_3', 'explode'), chg('u_4', 'value', { f: 'nope', value: 1 }),
                chg('u_5', 'add', { ops: [{ op: 'add' }, 'x', 7] }), chg('u_6', 'remove', { row: 'bad', label: '<img src=x onerror=alert(1)>' + 'z'.repeat(300), accept: 'yes' })] },
            { id: 'up_a', charId: 'c_2', changes: [] }, { id: 'bad id', charId: 'c_3', changes: [] }, { id: 'up_b', charId: 'nope', changes: [] }, { id: 'up_c', charId: 'c_4', name: 7, at: 'x', changes: 'x' }, 'junk', null];
        const cq = S.cleanUploads(q), c0 = cq[0] || { changes: [] }, many = S.cleanUploads(Array.from({ length: 30 }, (_, i) => ({ id: 'up_' + i, charId: 'c_' + i, changes: [] })));
        check('U2 cleanUploads (the GM\'s queue from a save or an import): an upload once by id, a character id, a name and a time; a change once by id, of a known kind on a field id, its texts cut, ticked only by true, a row id only when it is one; an add\'s ops objects only; the last 20 uploads; anything else is empty',
            j(cq.map(u => [u.id, u.charId, u.name, u.at, u.changes.length])) === j([['up_a', 'c_1', 'Pat', 5, 4], ['up_c', 'c_4', 'A player', 0, 0]])
            && j(c0.changes[0]) === j({ id: 'u_1', kind: 'fact', f: 'f_sk', label: 'Skills: u_1', from: 'a', to: 'b', accept: true, held: false, row: 'w_a', facts: { lvl: 3 }, qty: 2 })
            && c0.changes[1].held === true && c0.changes[1].accept === false && j(c0.changes[2].ops) === j([{ op: 'add' }]) && c0.changes[3].accept === false && !('row' in c0.changes[3]) && c0.changes[3].label.length === 120
            && many.length === 20 && many[0].id === 'up_10' && j(S.cleanUploads('x')) === '[]' && j(S.cleanUploads(undefined)) === '[]', j(cq));
    }
    /* ---- an outside sheet reader (2026-10-18; none ships with the app): the hook's own rules, the reader's id on an upload, applyProposal and
       fillMaking with a reader's row op, and the Review's Apply (sheets.js, its uploadreview slice run for real), with readers of the suite's own ---- */
    {
        const base0 = S.readers().map(r => r.id);
        const fnR = { claims: () => false, fill: () => ({}), propose: () => ({ changes: [] }), rowOp: (...a) => S.applyRowOp(...a) };
        const mkR = (id, name, extra) => Object.assign({ id, name }, fnR, extra || {});
        const tries = [mkR('Alpha', 'A'), mkR('a'.repeat(13), 'A'), mkR('a1', 'A'), mkR('', 'A'), mkR('al pha', 'A'), mkR('beta', '   '), mkR('beta', 'n'.repeat(41)), mkR('beta', 5),
            mkR('beta', 'B', { rowOp: 5 }), mkR('beta', 'B', { claims: undefined }), mkR('beta', 'B', { fill: 'x' }), mkR('beta', 'B', { propose: null }), null, 'beta', [], 7].map(r => S.registerReader(r));
        const okA = S.registerReader(mkR('alpha', '  Alpha sheets  ', { claims: js => js.kind === 'a', writeBack: () => 1, facing: 'no', ui: { x: 1 }, extra: 1 }));
        const okB = S.registerReader(mkR('beta', ' ' + 'n'.repeat(40) + ' ', { claims: () => { throw new Error('boom'); } }));
        const okC = S.registerReader(mkR('gamma', 'G', { claims: () => 1, ui: 'no' }));
        const okD = S.registerReader(mkR('delta', 'D', { claims: js => js.kind === 'a' || js.kind === 'd', facing: () => 2 }));
        const rA = S.readerById('alpha'), rB = S.readerById('beta'), rC = S.readerById('gamma'), rD = S.readerById('delta'), listed = S.readers();
        const forA = S.readerFor({ kind: 'a' }), forD = S.readerFor({ kind: 'd' }), forWp = S.readerFor({ format: 'waypoint-character', kind: 'a' }), forNone = [null, 'x', [], 7, { kind: 'z' }].map(v => S.readerFor(v));
        const okA2 = S.registerReader(mkR('alpha', 'Alpha two', { claims: js => js.kind === 'a' }));
        const order2 = S.readers().map(r => r.id), forA2 = S.readerFor({ kind: 'a' }), nameA2 = S.readerById('alpha').name, kit = S.readerKit();
        const drops = [S.dropReader('alpha'), S.dropReader('alpha'), S.dropReader('nope'), S.dropReader(5)], byIdAfter = [S.readerById('alpha'), S.readerById(5), S.readerById('__proto__')];
        ['beta', 'gamma', 'delta'].forEach(id => S.dropReader(id));
        check('an outside sheet reader, the hook (systemcore registerReader, readerFor, readerById, dropReader, readers and readerKit, run for real with readers of the suite\'s own): one is taken only with an id of 1 to 12 small letters, a name of 1 to 40 characters once trimmed and its four functions; it is kept as its id, its trimmed name and those four, writeBack and facing only where they are functions and ui only where it is an object, frozen; one of the same id takes the place of the other, last in the list; readerFor answers the first that claims a file with true itself, never for a Waypoint character file nor for what is no object, and a claims that throws is a no; readers() and readerKit() are frozen; dropReader says whether one went; once they are dropped the list is as it was',
            j(tries) === j(Array(16).fill(false)) && okA && okB && okC && okD
            && j(Object.keys(rA).sort()) === j(['claims', 'fill', 'id', 'name', 'propose', 'rowOp', 'ui', 'writeBack']) && rA.name === 'Alpha sheets' && Object.isFrozen(rA) && j(rA.ui) === j({ x: 1 })
            && rB.name === 'n'.repeat(40) && !('ui' in rC) && typeof rD.facing === 'function' && Object.isFrozen(listed) && j(listed.map(r => r.id)) === j(['alpha', 'beta', 'gamma', 'delta'])
            && forA === rA && forD === rD && forWp === null && j(forNone) === j([null, null, null, null, null])
            && okA2 && j(order2) === j(['beta', 'gamma', 'delta', 'alpha']) && forA2 === rD && nameA2 === 'Alpha two'
            && Object.isFrozen(kit) && kit.applyRowOp === S.applyRowOp && kit.applyProposal === S.applyProposal && typeof kit.libFinder === 'function'
            && j(drops) === j([true, false, false, false]) && j(byIdAfter) === j([null, null, null]) && j(S.readers().map(r => r.id)) === j(base0),
            j([tries, Object.keys(rA || {}), listed.map(r => r.id), order2, drops]));
        const upR = S.cleanUploads(['alpha', 'Alpha', 'a1', 'a'.repeat(13), 'a'.repeat(12), 5, '', undefined].map((rd, i) => Object.assign({ id: 'up_r' + i, charId: 'c_' + i, changes: [] }, rd === undefined ? {} : { reader: rd }))).map(u => 'reader' in u ? u.reader : null);
        check('an outside sheet reader, the GM\'s queue (cleanUploads): an upload keeps the id of the reader that read it only as an id a reader may have (1 to 12 small letters), and has no reader key otherwise',
            j(upR) === j(['alpha', null, null, null, 'a'.repeat(12), null, null, null]), j(upR));

        // applyProposal and fillMaking: a reader's row op where one is handed in, else applyRowOp with a reader's own mark taken off
        const nP = (id, key, extra) => Object.assign({ id: 'f_' + id, key, label: key, kind: 'number', vis: 'all' }, extra || {});
        const sysP = cleanSystem({ v: 1, name: 'P', rolls: [], fields: [nP('st', 'ST', { def: 10, min: 1, max: 20 }), { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Skill'], noQty: true, custom: true, multi: true, lvl: { label: 'Level', min: 0, max: 30, def: 10 } } }],
            items: [{ id: 'i_climb', name: 'Climbing', key: 'Climbing', category: 'Skill' }] }, { F, gmView: true });
        const chP = () => ({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_st: 10, f_sk: [{ id: 'w_a', defId: 'i_climb', qty: 1, lvl: 12 }] } });
        const prop = { changes: [{ id: 'u_1', kind: 'value', f: 'f_st', value: 14 }, { id: 'u_2', kind: 'value', f: 'f_nope', value: 1 }, { id: 'u_3', kind: 'fact', f: 'f_sk', row: 'w_a', facts: { lvl: 15 } },
            { id: 'u_4', kind: 'add', f: 'f_sk', ops: [{ op: 'custom', rowId: 'w_b', def: { name: 'Juggling' }, twin: 'i_climb' }, { op: 'set', rowId: 'w_zz', facts: { lvl: 5 } }] },
            { id: 'u_5', kind: 'add', f: 'f_sk', ops: [{ op: 'custom', rowId: 'w_c', def: { name: 'Juggling' }, twin: 'i_climb' }] }, { id: 'u_6', kind: 'value', f: 'f_st', value: 'x' },
            { id: 'u_7', kind: 'def', f: 'f_sk', row: 'w_d', def: { name: 'Riding' }, twin: 'i_climb' }, { id: 'u_8', kind: 'value', f: 'f_st', value: 3 }, { id: 'u_9', kind: 'remove', f: 'f_sk', row: 'w_a' }] };
        const acc = { u_1: true, u_2: true, u_3: true, u_4: true, u_5: true, u_6: true, u_7: true, u_8: 'yes', u_9: 1 };
        const propWas = j(prop), cP = chP(), rP = S.applyProposal(sysP, cP, prop, acc, F);
        const rowsOf = v => (v.f_sk || []).map(r => [r.id, r.defId || (r.def && r.def.name), r.lvl === undefined ? null : r.lvl]);
        const seen = [], stubOp = (sys, ch, fid, q, F2, o) => { seen.push([fid, q.op, q.twin || null, Object.keys(o || {}).sort().join()]); return S.applyRowOp(sys, ch, fid, q, F2, o); };
        const rS = S.applyProposal(sysP, chP(), prop, acc, F, { rowOp: stubOp, now: 5 });
        const coreP = fs.readFileSync(path.join(app, 'scripts', 'systemcore.js'), 'utf8');
        check('applyProposal (the Review\'s Apply, and setting B on the host): only a change ticked by true is applied, each through its own cleaner, all or nothing (a change one of whose ops fails leaves nothing of it), a field that is not there or a value that does not clean counted as failed; the character handed in and the proposal are never changed; with no row op handed in each op goes to applyRowOp with a reader\'s own mark (twin) taken off a copy of it, and with a reader\'s row op handed in every row op goes to it whole, its options without the row op itself, and the answer is the same',
            rP.done === 4 && rP.failed === 3 && rP.values.f_st === 14 && j(rowsOf(rP.values)) === j([['w_a', 'i_climb', 15], ['w_c', 'Juggling', 10], ['w_d', 'Riding', 10]]) && cP.values.f_st === 10 && j(prop) === propWas
            && j(seen) === j([['f_sk', 'set', null, 'now'], ['f_sk', 'custom', 'i_climb', 'now'], ['f_sk', 'set', null, 'now'], ['f_sk', 'custom', 'i_climb', 'now'], ['f_sk', 'custom', 'i_climb', 'now']]) && j(rS) === j(rP)
            && coreP.includes('function plainRowOp(sys, char, fieldId, q, F, opts) { if (isObj(q) && q.twin !== undefined) { q = JSON.parse(JSON.stringify(q)); delete q.twin; } return applyRowOp(sys, char, fieldId, q, F, opts); }'),
            j([rP.done, rP.failed, rowsOf(rP.values), seen]));
        const mkCh = () => ({ id: 'c_m', name: 'Ana', ownerId: 'u_a', npc: false, making: 1, values: { f_st: 10 } });
        const fillP = { values: { f_st: 12 }, lists: ['f_sk'], ops: [{ f: 'f_sk', q: { op: 'add', defId: 'i_climb', rowId: 'w_f1' } }, { f: 'f_sk', q: { op: 'set', rowId: 'w_f1', facts: { lvl: 11 } } }, { f: 'f_sk', q: { op: 'custom', rowId: 'w_f2', def: { name: 'Juggling' }, twin: 'i_climb' } }] };
        const seenF = [], stubF = (sys, ch, fid, q, F2, o) => { seenF.push([fid, q.op, q.twin || null, 'rowOp' in (o || {}), (o || {}).player === true && (o || {}).fill === true]); return S.applyRowOp(sys, ch, fid, q, F2, o); };
        const pvP = cleanSystem(sysP, { F, gmView: false }), fPlain = S.fillMaking(sysP, mkCh(), JSON.parse(j(fillP)), F, { now: 5, view: pvP }), fStub = S.fillMaking(sysP, mkCh(), JSON.parse(j(fillP)), F, { now: 5, view: pvP, rowOp: stubF });
        check('fillMaking with a reader\'s row op (opts.rowOp): every row op of the fill goes to it whole, a reader\'s own mark kept, with the owner\'s rights of a fill and without the row op itself in its options; the answer is the one applyRowOp gives with the mark taken off',
            fPlain.ok === true && fStub.ok === true && j(fStub.values) === j(fPlain.values) && fStub.done === fPlain.done && fStub.left === fPlain.left && fPlain.left === 0 && j(rowsOf(fPlain.values)) === j([['w_f1', 'i_climb', 11], ['w_f2', 'Juggling', 10]])
            && j(seenF) === j([['f_sk', 'add', null, false, true], ['f_sk', 'set', null, false, true], ['f_sk', 'custom', 'i_climb', false, true]]), j([fPlain, fStub, seenF]));

        // the Review's Apply (sheets.js openReview, its uploadreview slice run for real): the reader that read an upload applies it; one this Waypoint does not have applies nothing
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), urA = shR.indexOf('// [sinkcheck:uploadreview-start]'), urB = shR.indexOf('// [sinkcheck:uploadreview-end]'), urSrc = urA >= 0 && urB > urA ? shR.slice(urA, urB) : '';
        const review = up => {
            const rec = { toasts: [], done: [], after: [], closed: 0 };
            const node = tag => ({ tag, children: [], style: {}, className: '', textContent: '', disabled: false, onclick: null, checked: false, type: '', appendChild(k) { this.children.push(k); return k; }, addEventListener(k, f) { this['on_' + k] = f; } });
            const ui = { uploadModal: node('div'), uploadHead: node('h3'), uploadList: node('div'), uploadApply: node('button'), uploadReject: node('button') };
            const ch = chP(), camp = { system: sysP, uploads: [up], chars: { c_1: ch } };
            const el = (tag, cls, text) => { const e = node(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
            const open = new Function('ui', 'getActiveCampaign', 'uploadsOf', 'charById', 'isClient', 'el', 'systemOf', 'F', 'applyProposal', 'afterCharChange', 'net', 'toast', 'save', 'renderViews', 'closeReview', 'window', 'var _review = null, lastChange = null;' + NL + urSrc + NL + 'return openReview;')(
                id => ui[id], () => camp, (cp, id) => S.cleanUploads(cp.uploads).filter(u => u.charId === id), (id, cp) => (cp || camp).chars[id] || null, () => false, el, cp => cp.system, () => F, S.applyProposal,
                (c, whole) => rec.after.push([c.id, whole]), () => ({ uploadDone: (...a) => rec.done.push(a) }), t => rec.toasts.push(t), () => {}, () => {}, () => { rec.closed++; }, { wpSystemCore: S });
            open('c_1');
            const before = j(ch.values), dis = ui.uploadApply.disabled, label = ui.uploadApply.textContent, head = ui.uploadHead.textContent;
            if (typeof ui.uploadApply.onclick === 'function') ui.uploadApply.onclick();
            return { same: before === j(ch.values), dis, label, head, rec, left: camp.uploads.length, st: ch.values.f_st, rows: rowsOf(ch.values) };
        };
        const upOf = rd => Object.assign({ id: 'up_a', charId: 'c_1', from: 'u_a', name: 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'value', f: 'f_st', label: 'ST', from: '10', to: '14', value: 14, accept: true },
            { id: 'u_3', kind: 'fact', f: 'f_sk', row: 'w_a', label: 'Skills: Climbing', from: '12', to: '15', facts: { lvl: 15 }, accept: true }, { id: 'u_5', kind: 'add', f: 'f_sk', label: 'Skills: Juggling', from: '', to: 'Juggling', ops: [{ op: 'custom', rowId: 'w_c', def: { name: 'Juggling' } }], accept: false }] }, rd ? { reader: rd } : {});
        {   /* 1.6.0: a note in the Review: read, never ticked or applied, and no change in any count */
            const qN = S.cleanUploads([{ id: 'up_n', charId: 'c_1', changes: [{ id: 'u_n', kind: 'note', label: '  Was converted  ', from: 'a', to: 'b', accept: true, value: 9, f: 'f_st' }, { id: 'u_m', kind: 'note', label: 'No field' }, { id: 'u_e', kind: 'note', label: '   ' }, { id: 'u_b', kind: 'note', label: 'Bad field', f: '<b>' }] }])[0];
            check('1.6.0 cleanUploads keeps a note: its words, its from and to, a field only where it is one, and none of what a change carries (no accept, no value); a note with no words goes',
                j(qN.changes) === j([{ id: 'u_n', kind: 'note', label: 'Was converted', from: 'a', to: 'b', f: 'f_st' }, { id: 'u_m', kind: 'note', label: 'No field', from: '', to: '' }, { id: 'u_b', kind: 'note', label: 'Bad field', from: '', to: '' }]), j(qN.changes));
            const apN = S.applyProposal(sysP, chP(), { changes: [{ id: 'u_n', kind: 'note', f: 'f_st', label: 'x', value: 99 }] }, { u_n: true }, F);
            check('1.6.0 applyProposal passes a note over, ticked or not: nothing done, nothing failed, nothing changed', apN.done === 0 && apN.failed === 0 && j(apN.values) === j(chP().values), j(apN));
            const withN = Object.assign({ id: 'up_b', charId: 'c_1', from: 'u_a', name: 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'value', f: 'f_st', label: 'ST', from: '10', to: '14', value: 14, accept: true }, { id: 'u_n', kind: 'note', label: 'Flagged by the site' }] }), vN = review(withN), onlyN = review({ id: 'up_c', charId: 'c_1', from: 'u_a', name: 'Pat', at: 1, changes: [{ id: 'u_n', kind: 'note', label: 'Flagged by the site' }] });
            check('1.6.0 the Review with a note (openReview, run for real): the heading counts the changes and then the notes, Apply counts only what can be ticked, the toast and the word to its player count no note; with notes alone the heading says so and Apply is off',
                /: 1 change, 1 note$/.test(vN.head) && vN.label === 'Apply 1 change' && j(vN.rec.toasts) === j(['1 of 1 changes applied to Ana.']) && j(vN.rec.done) === j([['c_1', 1, 1]]) && vN.st === 14
                && /: 1 note$/.test(onlyN.head) && onlyN.dis === true, j([vN.head, vN.label, vN.rec, onlyN.head, onlyN.dis]));
        }
        const seenR = [], RV = mkR('revw', 'Review test', { rowOp: (sys, ch, fid, q, F2, o) => { seenR.push([fid, q.op]); return S.applyRowOp(sys, ch, fid, q, F2, o); } });
        const vPlain = review(upOf(null));
        S.registerReader(RV); let vRd = null; try { vRd = review(upOf('revw')); } finally { S.dropReader('revw'); }
        const vNone = review(upOf('nope'));
        check('the Review\'s Apply (sheets.js openReview, its uploadreview slice run for real with the real applyProposal): an upload no reader made applies its ticked changes through applyRowOp; one a registered reader made applies them through that reader\'s row op; one made by a reader this Waypoint does not have says so in its heading, its Apply button is off and a press of it changes, sends and says nothing, and the upload waits',
            urSrc.length > 0 && vPlain.dis === false && vPlain.label === 'Apply 2 changes' && vPlain.st === 14 && j(vPlain.rows) === j([['w_a', 'i_climb', 15]]) && vPlain.left === 0 && j(vPlain.rec.done) === j([['c_1', 2, 3]]) && j(vPlain.rec.toasts) === j(['2 of 3 changes applied to Ana.']) && j(vPlain.rec.after) === j([['c_1', true]]) && vPlain.rec.closed === 1
            && !!vRd && vRd.st === 14 && j(vRd.rows) === j(vPlain.rows) && j(seenR) === j([['f_sk', 'set']]) && vRd.left === 0
            && vNone.dis === true && /\. It was read by a sheet reader this Waypoint does not have, so it cannot be applied here\.$/.test(vNone.head) && vNone.same && vNone.left === 1 && vNone.rec.toasts.length === 0 && vNone.rec.done.length === 0 && vNone.rec.closed === 0,
            j([vPlain, vRd, vNone, seenR]));
    }
    /* ---- postureSeven: one of the seven postures every system starts with, for a token's stored text (a reader of a sheet file hands a posture over by it) ---- */
    {
        const ownSysP7 = { combat: { postures: [{ id: 'p_up', name: 'Up' }, { id: 'p_transit', name: 'In transit' }, { id: 'p_prone_shot', name: 'Prone shot' }, { id: 'p_scrawl', name: 'Scrawl' }, { id: 'kneeling', name: 'Kneel' }] } };
        const sevens = ['standing', 'Standing', ' stand ', 'crouching', 'crouch', 'Sitting', 'kneel', 'crawling', 'prone', 'lying_prone', 'Lying prone (face down)', 'lying-face-up', 'supine', 'zzz', 'p_low', '', '---', null, 7, undefined, {}].map(v => S.postureSeven(v));
        const ownSevens = ['p_transit', 'p_prone_shot', 'p_scrawl', 'p_up', 'kneeling', 'prone', 'kneel', 'p_position', 'standing'].map(v => [S.postureSeven(v, ownSysP7), S.postureSeven(v, null), S.postureSeven(v)]);
        check('postureSeven reads the seven under every spelling the map reads (their ids, the older ids and the long names) and nothing else: a text that is none of them, and what is no text, is nothing; a posture of a system\'s own list, by its id, is never one of the seven whatever letters its id holds (p_transit holds sit), while one of the seven in that list, an older spelling and a text that is no id of the list still read as before; it is on the published core',
            j(sevens) === j(['standing', 'standing', 'standing', 'crouching', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-prone', 'lying-prone', 'lying-face-up', 'lying-face-up', '', '', '', '', '', '', '', ''])
            && j(ownSevens) === j([['', 'sitting', 'sitting'], ['', 'lying-prone', 'lying-prone'], ['', 'crawling', 'crawling'], ['', '', ''], ['kneeling', 'kneeling', 'kneeling'], ['lying-prone', 'lying-prone', 'lying-prone'], ['kneeling', 'kneeling', 'kneeling'], ['sitting', 'sitting', 'sitting'], ['standing', 'standing', 'standing']])
            && /^var API = \{[^\n]*\bpostureSeven: postureSeven\b/m.test(fs.readFileSync(path.join(app, 'scripts', 'systemcore.js'), 'utf8')), j([sevens, ownSevens]));
    }
    /* ---- Onboarding F1a: the rules for players without a character, and where a waiting token stands ---- */
    {
        check('F1a cleanNewPlayers: only a waiting token turned off and sight turned on are stored (the defaults and anything else are dropped); newPlayerRules fills the defaults (a waiting token on, no sight)',
            j(S.cleanNewPlayers({ token: 'off', sight: true, x: 1 })) === j({ token: 'off', sight: true }) && S.cleanNewPlayers({ token: 'on', sight: false }) === null && S.cleanNewPlayers({ token: 'OFF', sight: 'yes' }) === null
            && S.cleanNewPlayers('x') === null && S.cleanNewPlayers([]) === null && S.cleanNewPlayers(null) === null
            && j(S.newPlayerRules({})) === j({ token: 'on', sight: false }) && j(S.newPlayerRules({ newPlayers: { token: 'off' } })) === j({ token: 'off', sight: false }) && j(S.newPlayerRules({ newPlayers: { sight: 1, token: 0 } })) === j({ token: 'on', sight: false }) && j(S.newPlayerRules(null)) === j({ token: 'on', sight: false }));
        const tw = (id, pid, extra) => Object.assign({ id, type: 'circle', waiting: 1, ownerId: pid, x: 0, y: 0 }, extra || {});
        const campW = () => ({ id: 'k', players: { u_a: { name: 'Ana' }, u_b: { name: 'Bo', charName: 'Old Bo' }, u_c: { name: 'Cy' } }, chars: { c_1: { id: 'c_1', name: 'Cyra', ownerId: 'u_c' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [tw('w1', 'u_a'), { id: 't_b', isChar: true, ownerId: 'u_b', x: 0, y: 0 }, tw('w9', 'u_z')] }, m2: { id: 'm2', type: 'map', whiteboard: [tw('w2', 'u_a')] }, p1: { id: 'p1', type: 'planner' } } });
        const cw = campW(), mine = S.waitingTokensOf(cw, 'u_a');
        const cwC = campW(); cwC.items.m2.whiteboard.push(tw('w3', 'u_a', { isChar: true }), tw('w4', 'u_a', { charId: 'c_1' }));
        check('F1a waitingTokensOf: a player\'s waiting tokens on every play map (no one else\'s, no character token — one ticked Is Character or linked to a character is not a waiting token); nothing for a non-string player',
            j(S.waitingTokensOf(cwC, 'u_a').map(x => x.w.id)) === j(['w1', 'w2']) && j(mine.map(x => [x.mapId, x.w.id])) === j([['m1', 'w1'], ['m2', 'w2']]) && S.waitingTokensOf(cw, 'u_b').length === 0 && S.waitingTokensOf(cw, 7).length === 0 && S.waitingTokensOf(cw, '').length === 0, j(mine));
        const on = { token: 'on', sight: false }, need = (pid, map, op, rules, blocked) => S.waitingNeed(campW(), pid, map, op, rules === undefined ? on : rules, !!blocked);
        check('F1a waitingNeed: an arrival that found a token removes the waiting one; one that found nothing places it — unless they hold a character token on that map, the table gives none, or the GM removed theirs this session',
            need('u_a', 'm1', 'keep') === 'remove' && need('u_a', 'm1', 'spawn') === 'remove' && need('u_a', 'm1', 'none') === 'place' && need('u_b', 'm1', 'none') === 'remove'
            && need('u_a', 'm1', 'none', { token: 'off', sight: false }) === 'remove' && need('u_a', 'm1', 'none', null) === 'remove' && need('u_a', 'm1', 'none', on, true) === 'remove' && need('u_a', 'nope', 'none') === 'remove' && need('u_a', 'p1', 'none') === 'remove' && need('', 'm1', 'none') === 'remove');
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('F1c a give copies the player\'s face onto a character with no picture (a connected player, unless the GM unticked it) — once, never over a picture it has',
            /if \(pid && o\.pic !== false && !c\.portrait && !c\.face && n && n\.charFacePlan\) \{ var rpF = [^\n]*applyCharFace\(c\.id, n\.charFacePlan\(rpF\.face, rpF\.avatar\), false\); \}/.test(shG));
        check('F1a waitingNeed (a tidy after a setting changed: nothing adopted, copied or made): a player with no character and no name binding gets one; one with a character in play or an old name binding is left as they are',
            need('u_a', 'm2', null) === 'place' && need('u_c', 'm2', null) === 'leave' && need('u_b', 'm2', null) === 'leave' && need('u_c', 'm2', null, { token: 'off' }) === 'remove' && need('u_b', 'm1', null) === 'remove');
    }
    /* ---- Onboarding F2a: a character to take away (sheetexport.js, run for real) ---- */
    {
        const X = await import(url('sheetexport.js')), DM = await import(url('docmd.js'));
        const fxt = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const rowsR = fxt('rows-d20'), raw = fxt('look-d20');
        raw.fields = raw.fields.concat([
            { id: 'f_leak', key: 'Leak', label: 'Leak', kind: 'formula', vis: 'all', formula: 'GMFig + 1' },
            { id: 'f_chain', key: 'Chain', label: 'Chain', kind: 'formula', vis: 'all', formula: 'Leak * 2' },
            { id: 'f_notes', key: 'Notes', label: 'Notes', kind: 'notes', vis: 'all', edit: 'owner' },
            { id: 'f_mana', key: 'Mana', label: 'Mana', kind: 'resource', vis: 'all', maxFormula: 'GMFig * 2' },
            rowsR.fields.find(f => f.id === 'f_wpn')]);
        raw.items = (raw.items || []).concat(rowsR.items);
        raw.effects = (raw.effects || []).concat([{ id: 'e_hex', name: 'Hexed', tone: 'debuff', vis: 'gm', mods: [{ f: 'f_str', op: 'add', v: -1 }] }]);
        raw.sheet.sections = [{ id: 's_dash', title: 'Dashboard', cols: 1, pinned: true, fields: [{ id: 'f_level', w: 1 }] }].concat(raw.sheet.sections, [
            { id: 's_misc', title: 'Misc', tab: 't_gear', cols: 1, fields: [{ id: 'f_leak', w: 1 }, { id: 'f_chain', w: 1 }, { id: 'f_notes', w: 'row' }, { id: 'f_mana', w: 1 }, { id: 'f_wpn', w: 'row' }] },
            { id: 's_kid', title: 'Details', parent: 's_misc', cols: 1, fields: [{ kind: 'heading', text: 'Sub heading', w: 'row' }, { id: 'f_class', w: 1 }] },
            { id: 's_hide', title: 'Hidden Section', tab: 't_gear', cols: 1, showIf: '1 > 2', fields: [{ id: 'f_str', w: 1 }] }]);
        const gmSys = cleanSystem(raw, { F, gmView: true }), view = cleanSystem(raw, { F, gmView: false });
        const evil = '<img src=x onerror=alert(1)> *x*';
        const c = cleanChar({ id: 'c_1', name: 'Pat', ownerId: 'u_a', values: { f_str: 14, f_gmfig: 7, f_class: 'Fighter', f_notes: '## not a heading' + NL + '1. not a list' + NL + '---' + NL + '| a | b |',
            f_fx: [{ id: 'x_1', ref: 'e_ward', on: true, t: { left: 30, at: 5, p: 1 } }, { id: 'x_2', ref: 'e_hex', on: true }],
            f_wpn: [{ id: 'w_a', defId: 'i_longsword', qty: 1, on: true, note: 'my blade' }, { id: 'w_b', defId: 'i_vorpal', qty: 1 }, { id: 'w_c', qty: 2, def: { name: evil, category: 'Weapon', vis: 'all', stats: { bonus: 1 } }, own: 1 }] } }, gmSys);
        const lib = {}, items = {}; gmSys.effects.forEach(d => { lib[d.id] = d; }); gmSys.items.forEach(d => { items[d.id] = d; });
        const pv = cleanChar(S.charFor(c, view, 'u_a', { lib, items, full: gmSys }), view);   // the player's own copy, as their app keeps it
        const allP = resolveAll(view, pv, F, null), jP = X.charToJson(view, pv, allP, { exported: '2026-09-27T00:00:00.000Z' }), tP = JSON.stringify(jP);
        const cfv = S.charForView(c, view, { lib, items, full: gmSys }), cfo = S.charFor(c, view, 'u_a', { lib, items, full: gmSys });
        const npc = Object.assign({}, c, { npc: true, ownerId: '' }), nv = S.charForView(npc, view, { lib, items, full: gmSys });
        check('F2a charForView: the owner\'s own projection of any character — an owned one\'s is charFor\'s for its owner exactly; an NPC\'s (charFor: none) holds the players\' fields only, never a GM-only value',
            j(cfv) === j(cfo) && S.charFor(npc, view, 'u_a') === null && !!nv && !('f_gmfig' in nv.values) && nv.values.f_str === 14 && S.charForView(null, view) === null && S.charForView(c, null) === null, j([cfv && Object.keys(cfv.values), nv && Object.keys(nv.values)]));
        check('F2a charToJson (a player\'s own copy): the format, the view\'s stored fields and values, the numbers worked out on that view — never a GM-only field, its value, a GM-only item\'s GM parts or a pool whose max is the GM\'s; a value read from a hidden one reads "GM only" (a chain too); a countdown never; a full pool stays absent; the same inputs give the same file',
            jP.format === 'waypoint-character' && jP.v === 1 && jP.exported === '2026-09-27T00:00:00.000Z' && jP.name === 'Pat' && !('gm' in jP) && !('ownerId' in jP) && !('portrait' in jP) && !('unseen' in jP) && !('picture' in jP)
            && !/GMFig|GM figure|1d8 \+ 3|Mana|f_mana|"f_gmfig"/.test(tP) && jP.computed.Leak === 'GM only' && jP.computed.Chain === 'GM only' && jP.computed.STR === 13 && !('f_hp' in jP.values)
            && jP.values.f_fx.every(r => !('t' in r)) && jP.values.f_wpn.some(r => r.lnk === 1 && r.def && r.def.name === 'Vorpal Sword' && !('damage' in r.def)) && jP.values.f_wpn.some(r => r.note === 'my blade')
            && jP.system.fields.f_str.key === 'STR' && !('f_leak' in jP.system.fields) && j(X.charToJson(view, pv, allP, { exported: '2026-09-27T00:00:00.000Z' })) === tP, tP.slice(0, 900));
        const vG = cleanChar(c, gmSys), allG = resolveAll(gmSys, vG, F, null), jG = X.charToJson(gmSys, vG, allG, { exported: 'x', gm: true });
        const okPic = 'data:image/png;base64,' + 'A'.repeat(100), picOf = p => X.charToJson(view, pv, allP, { picture: p }).picture;
        check('F2a charToJson: the GM\'s own copy says so and holds the GM-only fields; a picture only as a small inline PNG, JPEG or WebP (never an address, markup or one past 200,000 characters); the system\'s sig follows its stored fields (id, key, kind) and nothing else',
            jG.gm === true && jG.values.f_gmfig === 7 && jG.computed.GMFig === 7 && jG.system.fields.f_gmfig.kind === 'number' && typeof jG.computed.Leak === 'number'
            && picOf(okPic) === okPic && picOf('data:image/jpeg;base64,QUJD') === 'data:image/jpeg;base64,QUJD' && picOf('https://e.x/a.png') === undefined && picOf('data:image/svg+xml;base64,QUJD') === undefined && picOf('data:image/png;base64,AA" onerror="x') === undefined && picOf('data:image/png;base64,' + 'A'.repeat(200000)) === undefined
            && /^[0-9a-f]{8}$/.test(X.systemSig(view)) && X.systemSig(view) !== X.systemSig(gmSys) && X.systemSig({ fields: view.fields.slice().reverse() }) === X.systemSig(view)
            && X.systemSig({ fields: view.fields.filter(f => f.kind !== 'formula') }) === X.systemSig(view) && X.systemSig({ fields: view.fields.map(f => f.id === 'f_str' ? Object.assign({}, f, { key: 'Str2' }) : f) }) !== X.systemSig(view), j([jG.gm, jG.values.f_gmfig]));
        const mdP = X.sheetToMarkdown(view, pv, allP, { F, sub: 'Generic', pageTitle: () => null }), mdG = X.sheetToMarkdown(gmSys, vG, allG, { F, gm: true });
        const tableHead = mdP.split(NL).find(l => /^\| Item \|/.test(l)) || '', backP = DM.markdownToBlocks(mdP, { kind: 'doc' });
        const txt = backP.blocks.filter(b => b.type === 'text').map(b => b.content).join(NL);
        check('F2a sheetToMarkdown (a player\'s own copy): the handbook\'s dialect — front matter, the name, the dashboard, the band as one line, then every tab and its sections, a nested one as a bold line; a section whose show-if is false left out; GM only for a value read from a hidden one; nothing GM-only; an item table of at most 8 columns with its quantity',
            /^---\ntitle: Pat\nsubtitle: Generic\n---\n\n# Pat\n\*Generic\*/.test(mdP) && mdP.indexOf('### Dashboard') > 0 && mdP.indexOf('### Dashboard') < mdP.indexOf('**At a glance:**') && mdP.indexOf('**At a glance:**') < mdP.indexOf('## Main')
            && /## Main[\s\S]*## Spells[\s\S]*## Gear/.test(mdP) && /\*\*Details\*\*/.test(mdP) && !/Hidden Section/.test(mdP) && /- \*\*Leak:\*\* GM only/.test(mdP) && /- \*\*Chain:\*\* GM only/.test(mdP)
            && !/GMFig|GM figure|Mana/.test(mdP) && /Hexed: STR \u22121/.test(mdP) &&/Warded: Armour class \+2/.test(mdP) /* the frozen fixture keeps its own label */ && /- \*\*STR:\*\* 13 \(base 14\)/.test(mdP) && tableHead.split('|').length - 2 <= 8 && /\| Qty \|/.test(tableHead) && /- \*\*Class:\*\* Fighter/.test(mdP), mdP.slice(0, 1400));
        check('F2a sheetToMarkdown reads back as a handbook page as it was written: notes lines that look like a heading, a numbered list, a rule or a table row stay text; a name with markup stays text; the GM\'s copy is a GM-only page with its GM-only fields',
            backP.blocks[0].type === 'h1' && backP.blocks[0].title === 'Pat' && !backP.blocks.some(b => b.type === 'rule' || (b.type === 'h2' && b.title === 'not a heading') || (b.type === 'table' && b.title !== 'Weapons'))
            && txt.indexOf('## not a heading') >= 0 && txt.indexOf('1. not a list') >= 0 && txt.indexOf('\\1') < 0 && txt.indexOf('---') >= 0 && txt.indexOf('| a | b |') >= 0 && !/(^|[^\\])<img/.test(mdP) &&/\\<img src=x onerror=alert\(1\)\\> \\\*x\\\*/.test(mdP)
            && /^---\ntitle: Pat\nplayers: false\n---/.test(mdG) && /The GM\u2019s copy/.test(mdG) && /GM figure/.test(mdG) && DM.markdownToBlocks(mdG, { kind: 'doc' }).meta.players === false, j(backP.blocks.map(b => b.type + ':' + (b.title || String(b.content || '').slice(0, 40)))));
        check('F2a fileBase: a character\'s name as a file name — letters, digits, space, _ and - only (no path, drive, control or reserved character survives), 40 at most, never a Windows device name; nothing left: the fallback',
            X.fileBase('Pat Player') === 'Pat_Player' && X.fileBase('../..\\evil:name*?"<>|') === 'evilname' && X.fileBase('CON') === 'CON_' && X.fileBase('nul') === 'nul_' && X.fileBase('com1') === 'com1_' && X.fileBase('lpt9') === 'lpt9_' && X.fileBase('Connor') === 'Connor'
            && X.fileBase('\u65e5\u672c') === 'character' && X.fileBase('a'.repeat(60)).length === 40 && X.fileBase(' \u0000x\u202e\u200b ') === 'x' && X.fileBase(null) === 'character' && X.fileBase('', 'sheet') === 'sheet' && X.fileBase('.. ..') === 'character');
        check('F2a isCharFile and gmOnlyError: a character file by its format only; "GM only" as the players\' view reports it, alone or at the end of a chain',
            X.isCharFile({ format: 'waypoint-character' }) && !X.isCharFile([]) && !X.isCharFile(null) && !X.isCharFile({ format: 'x' }) && !X.isCharFile({ type: 'character', name: 'A' })
            && X.gmOnlyError('GM only') && X.gmOnlyError('Leak: GM only') && X.gmOnlyError('A: B: GM only') && !X.gmOnlyError('not GM only') && !X.gmOnlyError('GM only!') && !X.gmOnlyError(null));
        // the formatters the page shares with the sheet: alike (sheets.js statFmt / statText / fxChangeText, sliced and run)
        const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), lineOf = name => { const a = shX.indexOf('function ' + name + '('); return shX.slice(a, shX.indexOf(NL, a)); };
        const SH = new Function('fmtNum', lineOf('statFmt') + NL + lineOf('statText') + NL + lineOf('fxChangeText') + NL + 'return { statFmt, statText, fxChangeText };')(S.fmtNum);
        const nums = [0.0001, 1234567.891, -0.5, 12.5, 1 / 3, 0, -2, 7, NaN, 'x'], sts = [{ labels: ['E', 'A', 'H'] }, null, { labels: [] }], mods = [{ f: 'f_a', op: 'add', v: 2 }, { f: 'f_a', op: 'add', v: -1.5, part: 'max' }, { f: 'f_b', op: 'on' }, { f: 'zz', op: 'add', v: 0 }, { f: 'f_a', op: 'max', v: 3 }, { f: 'f_a', op: 'min', v: 1, part: 'max' }, { f: 'f_a', op: 'add', v: 0, vf: '2 * Keen' }];   // the review of words: a floor, a ceiling and a change worked out by a formula too
        // the review of words: the readable page said a change worked out by a formula as +0 (its v); it says it in words now, the sheet's own labels
        // naming what it reads (sheetexport amountWords through the form core and nameWord), never the formula, and with no form core at hand an amount
        const gw = global.window, keenSys = { fields: [{ id: 'f_k', key: 'Keen', label: 'Keenness', kind: 'number' }] };
        let vfWords = '', vfBare = '', vfMax = '';
        try {
            vfBare = X.fxChangeText({ f: 'f_a', op: 'add', v: 0, vf: '2 * Keen' }, { f_a: 'ST' }, keenSys);
            global.window = { wpFormCore: { read: t => ({ ok: true, form: t }), says: (form, o) => 'twice ' + o.name('Keen') } };
            vfWords = X.fxChangeText({ f: 'f_a', op: 'add', v: 0, vf: '2 * Keen' }, { f_a: 'ST' }, keenSys); vfMax = X.fxChangeText({ f: 'f_a', op: 'max', v: 0, vf: 'Keen', part: 'max' }, { f_a: 'ST' }, keenSys);
        } finally { if (gw === undefined) delete global.window; else global.window = gw; }
        check('the review of words: the readable page says an effect\'s change worked out by a formula in words (never +0, never the formula), a floor as at least, with no form core at hand an amount',
            vfBare === 'ST by an amount' && vfWords === 'ST by twice Keenness' && vfMax === 'ST max at least twice Keenness', j([vfBare, vfWords, vfMax]));
        check('F2a the page\'s formatters are the sheet\'s: a list stat and an effect\'s change read the same in the file as on the sheet',
            nums.every(v => X.statFmt(v) === SH.statFmt(v)) && sts.every(st => [0, 1, 2, 5, 0.5, '', 'Big'].every(v => X.statText(st, v) === SH.statText(st, v))) && mods.every(m => X.fxChangeText(m, { f_a: 'ST', f_b: 'Prone' }) === SH.fxChangeText(m, { f_a: 'ST', f_b: 'Prone' })));
        // the sheet's export view (sheets.js exportView, run for real): the GM's players'-view file is the owner's projection over the players' view
        const evA = shX.indexOf('function exportView('), evB = shX.indexOf('function saveTextFile(');
        const evRun = (o) => { const camp = { id: 'k', system: raw, chars: { c_1: Object.assign({}, c, o.char || {}) } }; const calls = [];
            const fn = new Function('getActiveCampaign', 'charById', 'canOpen', 'isClient', 'playerSystem', 'cleanChar', 'cleanSystem', 'F', 'charForView', 'fxLibOf', 'itemLibOf', 'tokenCtxFor', 'resolveAll', shX.slice(evA, evB) + NL + 'return exportView;')(
                () => camp, (id, cp) => (cp || camp).chars[id] || null, () => o.canOpen !== false, () => !!o.client, () => { calls.push('playerSystem'); return cleanSystem(raw, { F, gmView: false }); }, cleanChar,
                (s, op) => { calls.push('cleanSystem:' + op.gmView); return cleanSystem(s, op); }, () => F, (ch, s, op) => { calls.push('charForView'); return S.charForView(ch, s, op); }, fxLib => ({}), s => items, () => null, (s, v, f, t) => { calls.push('resolveAll'); return resolveAll(s, v, f, t); });
            return { r: fn('c_1', o.gmAll), calls }; };
        const eOff = evRun({}), eOn = evRun({ gmAll: true }), eCli = evRun({ client: true, gmAll: true }), ePart = evRun({ char: { partial: true } }), eShut = evRun({ canOpen: false });
        check('F2a the sheet\'s export view (run for real): the GM\'s file is the owner\'s projection over the players\' view (an NPC\'s too) with its numbers worked out on that view — or, ticked, the GM\'s own full copy; a player\'s is their own copy on the players\' view, never the GM\'s even if asked; a partial copy or one they cannot open gives nothing',
            eOff.r && !eOff.r.gm && !('f_gmfig' in eOff.r.view.values) && !('f_gmfig' in eOff.r.all) && j(eOff.calls) === j(['playerSystem', 'charForView', 'resolveAll'])
            && eOn.r && eOn.r.gm === true && eOn.r.view.values.f_gmfig === 7 && j(eOn.calls) === j(['cleanSystem:true', 'resolveAll'])
            && eCli.r && eCli.r.gm === false && !('f_gmfig' in eCli.r.view.values) && j(eCli.calls) === j(['playerSystem', 'resolveAll']) && ePart.r === null && eShut.r === null, j([eOff.calls, eOn.calls, eCli.calls]));
        check('F2a (source), moved on purpose in 1.6.0: a character file goes on to the GM\'s review on a character in play, an outside sheet file past its own check (Onboarding F4: one still being made takes it, after a confirm); the head\'s Download shows for whoever may open the whole sheet; the file\'s name goes through fileBase; the menu sits on the page and Escape closes it before the panel does',
            /var isFile = isCharFile\(j\);\n\s*var whyI = isFile && typeof charFileWhy === 'function' \? charFileWhy\(j\) : ''; if \(whyI\) \{ toast\(whyI\); return; \}[^\n]*\n\s*if \(!isFile && \(!sheetFilesOk\(\) \|\| !j \|\| typeof j !== 'object' \|\| Array\.isArray\(j\)\)\)/.test(shX)
            && /if \(making\) \{\n\s*showConfirm\('Fill ' \+ nm \+ ' from this file\? What it carries replaces what the sheet has\.', function\(y\) \{\n\s*if \(!y\) return;\n\s*var rM = n\.charUpload\(id, j, function\(a\) \{ toast\(a\.error \|\| fillNote\(a, j\)\); if \(!a\.error\) filePicture\(id, j\); \}\);/.test(shX)
            && /var dlB = ui\('sheetDownload'\); if \(dlB\) dlB\.style\.display = canOpen\(c\.id\) && !c\.partial \? '' : 'none';/.test(shX)
            && /var base = fileBase\(X\.view\.name\) \+ \(X\.gm \? '-gm' : ''\);/.test(shX) && (shX.match(/saveTextFile\(base \+ '/g) || []).length === 2 && !/a\.download = (?!name)/.test(shX.slice(shX.indexOf('function saveTextFile('), shX.indexOf('function pictureData(')))
            && /document\.body\.appendChild\(pop\); _dlPop = pop;/.test(shX) && /document\.addEventListener\('keydown', dlKey, true\);/.test(shX) && /function closeSheet\(\) \{ closeDownloadMenu\(\);/.test(shX)
            && /import \{ fileBase, charToJson, charFromJson, sheetToMarkdown, isCharFile, charFileWhy \} from '\.\/sheetexport\.js';/.test(shX) && /id="sheetDownload"/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        // F2a review: the export view with the sheet's own lookups — the GM's players'-view file is the player's own file
        const libF = new Function('window', lineOf('fxLibOf') + NL + lineOf('itemLibOf') + NL + 'return { fxLibOf, itemLibOf };')({});
        const evRun2 = (o) => { const camp = { id: 'k', system: raw, chars: { c_1: Object.assign({}, c, o.char || {}) } }; const calls = [];
            const fn = new Function('getActiveCampaign', 'charById', 'canOpen', 'isClient', 'playerSystem', 'cleanChar', 'cleanSystem', 'F', 'charForView', 'fxLibOf', 'itemLibOf', 'tokenCtxFor', 'resolveAll', shX.slice(evA, evB) + NL + 'return exportView;')(
                () => camp, (id, cp) => (cp || camp).chars[id] || null, () => true, () => !!o.client, () => cleanSystem(raw, { F, gmView: false }), cleanChar, cleanSystem, () => F, S.charForView, libF.fxLibOf, libF.itemLibOf, () => { calls.push('tctx'); return o.tctx || null; }, resolveAll);
            return { r: fn('c_1', o.gmAll), calls }; };
        const canon = v => JSON.stringify(v, (k, x) => x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x).sort().reduce((o2, kk) => { o2[kk] = x[kk]; return o2; }, {}) : x);
        const g1 = evRun2({}), jGo = X.charToJson(g1.r.sys, g1.r.view, g1.r.all, { exported: '2026-09-27T00:00:00.000Z' });
        const npcR = evRun2({ char: { npc: true, ownerId: '' } }), unR = evRun2({ char: { ownerId: '' } }), pcT = evRun2({ tctx: { stance: { posture: 3, elevation: 2 } } });
        check('F2a the GM\'s players\'-view file is the player\'s own file (the same values and numbers: a GM-only effect they carry counts); an NPC\'s and an unassigned character\'s come out on the players\' view and read no token (the GM\'s pick could be a hidden one); a PC\'s reads its token',
            canon(jGo.values) === canon(jP.values) && canon(jGo.computed) === canon(jP.computed) && jGo.computed.STR === 13
            && !!npcR.r && !('f_gmfig' in npcR.r.view.values) && npcR.r.tctx === null && npcR.calls.indexOf('tctx') < 0 && !!unR.r && unR.r.tctx === null && unR.calls.indexOf('tctx') < 0 && pcT.calls.indexOf('tctx') >= 0, canon([jGo.computed, jP.computed]).slice(0, 700));
        // a table wider than the dialect holds
        const wideRaw = { v: 1, name: 'W', rolls: [], fields: [{ id: 'f_w', key: 'Kit', label: 'Kit', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Gear'], on: { label: 'Worn' }, price: 'cost', stats: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(k => ({ key: k, label: k.toUpperCase(), show: true })).concat([{ key: 'cost', label: 'Cost' }]) } }],
            items: [{ id: 'i_g', name: 'Gizmo', category: 'Gear', vis: 'all', key: 'Gizmo', stats: { a: 1, cost: 5 } }], sheet: { tabs: [], sections: [{ id: 's_1', title: 'Kit', cols: 1, fields: [{ id: 'f_w', w: 'row' }] }] } };
        const wSys = cleanSystem(wideRaw, { F, gmView: true }), wC = cleanChar({ id: 'c_w', name: 'W', values: { f_w: [{ id: 'w_1', defId: 'i_g', qty: 3 }] } }, wSys);
        const wMd = X.sheetToMarkdown(wSys, wC, resolveAll(wSys, wC, F, null), { F }), wHead = (wMd.split(NL).find(l => /^\| Item \|/.test(l)) || '').split('|').slice(1, -1).map(x => x.trim());
        check('F2a an item table wider than the dialect holds keeps 8 columns: the name first, then its columns in the sheet\'s order, the quantity and what was paid last',
            wHead.length === 8 && wHead[0] === 'Item' && wHead[1] === 'A' && wHead[6] === 'Qty' && wHead[7] === 'Paid' && DM.markdownToBlocks(wMd, { kind: 'doc' }).notes.length === 0, j(wHead));
        // the sheet's layout rules
        const layRaw = { v: 1, name: 'L', rolls: [], fields: [
            { id: 'f_a', key: 'A', label: 'Alpha value', kind: 'number', vis: 'all', edit: 'owner', def: 3 },
            { id: 'f_t', key: 'T', label: 'Title', kind: 'text', vis: 'all', edit: 'owner' },
            { id: 'f_m', key: 'M', label: 'Total', kind: 'formula', vis: 'all', formula: 'A * 2' },
            { id: 'f_b', key: 'B', label: 'Beta value', kind: 'number', vis: 'all', edit: 'owner', def: 1 }, { id: 'f_c', key: 'C', label: 'Gamma value', kind: 'number', vis: 'all', edit: 'owner', def: 2 }, { id: 'f_d', key: 'D', label: 'Delta value', kind: 'number', vis: 'all', edit: 'owner', def: 4 },
            { id: 'f_k', key: 'Kit', label: 'Kit', kind: 'item-list', vis: 'all', edit: 'owner', table: { columns: ['damage', 'cost', 'area', 'notes'] }, list: { cats: ['Gear'], counters: [{ key: 'ch', label: 'Charges', def: 2, max: '5' }] } },
            { id: 'f_g', key: 'Gun', label: 'Gun', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Gear'] } }],
            items: [{ id: 'i_b', name: 'Bomb', category: 'Gear', vis: 'all', key: 'Bomb', damage: '2d6', cost: '10', area: { ft: 10, shape: 'cone' } }],
            sheet: { tabs: [{ id: 't_a', label: 'Alpha' }, { id: 't_b', label: 'Beta' }, { id: 't_c', label: 'Gamma' }], identity: [{ id: 'f_t' }], sections: [
                { id: 's_loose', title: 'Loose', cols: 1, fields: [{ id: 'f_a', w: 1 }] },
                { id: 's_meta', title: 'Counted', tab: 't_a', cols: 1, meta: 'f_m', fields: [{ id: 'f_m', w: 1 }] },
                { id: 's_bare', title: '', tab: 't_a', cols: 1, fields: [{ kind: 'facing', w: 1 }, { kind: 'stance', w: 1 }] },
                { id: 's_beta', title: 'Only if', tab: 't_b', cols: 1, showIf: 'A > 100', fields: [{ id: 'f_b', w: 1 }] },
                { id: 's_arms', title: 'Arms', tab: 't_c', cols: 1, fields: [{ id: 'f_g', w: 'row', on: true }, { id: 'f_k', w: 'row' }] },
                { id: 's_orp', title: 'Orphan parent', tab: 't_c', parent: 's_gone', cols: 1, fields: [{ id: 'f_c', w: 1 }] },
                { id: 's_orc', title: 'Orphan child', tab: 't_c', parent: 's_orp', cols: 1, fields: [{ id: 'f_t', w: 1 }] },
                { id: 's_kidbare', title: '', parent: 's_arms', tab: 't_c', cols: 1, fields: [{ id: 'f_d', w: 1 }] }] } };   // one placement per field, as the sheet keeps it
        const lSys = cleanSystem(layRaw, { F, gmView: true });
        const lC = cleanChar({ id: 'c_l', name: 'Lay', values: { f_t: 'Captain', f_g: [{ id: 'w_g', defId: 'i_b', qty: 1 }], f_k: [{ id: 'w_k', defId: 'i_b', qty: 2, note: 'spare' }, { id: 'w_h', defId: 'i_b', qty: 1, hid: 1 }] } }, lSys);
        const lMd = X.sheetToMarkdown(lSys, lC, resolveAll(lSys, lC, F, null), { F, gm: true, tctx: { facing: { deg: 90, sides: 6, threats: [0, 180] }, stance: { posture: 1, elevation: 2 } } });
        const lSysP = Object.assign({}, lSys, { combat: Object.assign({}, lSys.combat, { postures: S.cleanPostures([{ id: 'standing', name: 'Up' }, { id: 'p_h', name: 'Hunker' }], {}) }) });
        const lMdP = [{ posture: 0, elevation: 0, pid: 'p_h' }, { posture: 0, elevation: 0 }, { posture: 3, elevation: 0, pid: 'kneeling' }].map(st => (/- \*\*Posture:\*\* ([^\n]*)/.exec(X.sheetToMarkdown(lSysP, lC, resolveAll(lSysP, lC, F, null), { F, gm: true, tctx: { facing: null, stance: st } })) || [])[1]);
        check('conditions C3 the sheet\'s page names the token\'s posture by the system\'s own list (the posture as stored), the first with none stored or for one the list lacks',
            j(lMdP) === j(['Hunker', 'Up', 'Up']), j(lMdP));
        const lB = DM.markdownToBlocks(lMd, { kind: 'doc' }), kitHead = lMd.split(NL).find(l => /^\| Item \| Damage/.test(l)) || '', at = s => lMd.indexOf(s);
        check('F2a the page keeps the sheet\'s layout rules: a section with no tab (or a gone one) on the first tab, a tab that shows nothing left out, a section\'s count in its title, an untitled section with no heading (nor a stray rule), the token\'s facing and stance, the header rows first, one level of nesting by the sheet\'s rule (a parent that has a parent, even a gone one, holds none)',
            at('- **Title:** Captain') > 0 && at('- **Title:** Captain') < at('## Alpha') && at('## Alpha') < at('### Loose') && at('### Loose') < at('## Gamma') && at('## Beta') < 0 && at('Only if') < 0 && /### Counted: 6/.test(lMd)
            && !/^#{1,6} *$/m.test(lMd) && !lB.blocks.some(b => b.type === 'rule' || ((b.type === 'h3' || b.type === 'h2') && !b.title)) && /- \*\*Facing:\*\* 90\u00b0 \u00b7 2 threats marked/.test(lMd) && !/- \*\*Posture:\*\*/.test(lMd) && /- \*\*Elevation:\*\* 2 yd/.test(lMd)
            && /### Orphan parent\n\n- \*\*Gamma value:\*\* 2/.test(lMd) && /### Orphan child/.test(lMd) && at('**Orphan child**') < 0 && /- \*\*Bomb:\*\* spare\n\n- \*\*Delta value:\*\* 4\n\n### Orphan parent/.test(lMd), lMd.slice(0, 1600));
        check('F2a an item list as the sheet draws it: "only switched on" means nothing once the list has no switch (every row shows); a table\'s own columns (damage, cost, the blast) and each row\'s counters; the blast beside the name; a kept curse marked on the GM\'s copy; a row\'s note',
            at('**Gun:** none') < 0 && /\| Bomb 10 ft \| 2d6 \| 10 \| 10 ft cone \| 2\/5 \| 2 \|/.test(lMd) && kitHead === '| Item | Damage | Cost | Area | Charges | Qty |' && /\| Bomb 10 ft \(hidden from the player\) \| 2d6 \| 10 \| 10 ft cone \|  \| 1 \|/.test(lMd) && /- \*\*Bomb:\*\* spare/.test(lMd), lMd.slice(lMd.indexOf('## Gamma'), lMd.indexOf('## Gamma') + 700));
        check('F2a the GM\'s own copy carries no countdown either (the clock is the GM\'s), and a character\'s face travels in its file',
            jG.values.f_fx.length === 2 && jG.values.f_fx.every(r => !('t' in r)) && X.charToJson(view, Object.assign({}, pv, { face: '\u{1F409}' }), allP).face === '\u{1F409}' && !('face' in jP));
        // a control character in a name
        const crName = 'Spy' + '\r\r\r---\rplayers: true\r', crC = cleanChar({ id: 'c_cr', name: crName, values: { f_gmfig: 7 } }, gmSys);
        const crMd = X.sheetToMarkdown(gmSys, crC, resolveAll(gmSys, crC, F, null), { F, gm: true, sub: 'Sys\r---\rplayers: true' }), crBack = DM.markdownToBlocks(crMd, { kind: 'doc' });
        const crRaw = X.sheetToMarkdown(gmSys, { id: 'c_cr', name: crName, values: {} }, {}, { F, gm: true, sub: 'a\rb' });
        check('F2a a control character in a name never ends the page\'s front matter: the cleaners take every one (not the first only) and the page writes none, so the GM\'s copy stays a GM-only page',
            !/[\u0000-\u001f]/.test(crC.name) && !/[\u0000-\u001f]/.test(cleanSystem(Object.assign({}, raw, { name: 'A\r\rB' }), { F, gmView: true }).name) && crBack.meta.players === false && /GM figure/.test(crMd) && !/\r/.test(crMd) && !/\r/.test(crRaw) && DM.markdownToBlocks(crRaw, { kind: 'doc' }).meta.players === false, j([crC.name, crBack.meta]));
        const cellA = shX.indexOf('function itemCellText('), SH2 = new Function(shX.slice(cellA, shX.indexOf(NL + '}' + NL, cellA) + 2) + NL + 'return itemCellText;')();
        const defsC = [{}, { category: 'G', cost: '5', damage: '1d6', area: { ft: 10, shape: 'cone' } }, { area: { ft: 5 } }, { area: { ft: 5, shape: 'circle' } }];
        check('F2a the page\'s table cells are the sheet\'s (itemCellText alike)', ['category', 'cost', 'damage', 'area', 'notes', 'x'].every(k => defsC.every(d => X.itemCellText(k, d) === SH2(k, d))));
        // a curse on a list the players' view drops still counts, nameless (F6) — only with the full system passed along
        const rawU = { v: 1, name: 'U', rolls: [], fields: [{ id: 'f_s', key: 'S', label: 'S', kind: 'number', vis: 'all', edit: 'owner', def: 10 }, { id: 'f_hl', key: 'Hexes', label: 'Hexes', kind: 'item-list', vis: 'gm', edit: 'gm', list: { cats: ['Hex'] } }, { id: 'f_nt', key: 'Log', label: 'Log', kind: 'notes', vis: 'all', edit: 'owner' }],
            items: [{ id: 'i_curse', name: 'Curse', category: 'Hex', vis: 'all', key: 'Curse', mods: [{ f: 'f_s', op: 'add', v: -2 }] }], sheet: { tabs: [], sections: [{ id: 's_1', title: 'Main', cols: 1, fields: [{ id: 'f_s', w: 1 }, { id: 'f_nt', w: 'row' }] }] } };
        const cU = cleanChar({ id: 'c_u', name: 'U', ownerId: 'u_a', values: { f_hl: [{ id: 'w_x', defId: 'i_curse', qty: 1 }] } }, cleanSystem(rawU, { F, gmView: true }));
        const evU = new Function('getActiveCampaign', 'charById', 'canOpen', 'isClient', 'playerSystem', 'cleanChar', 'cleanSystem', 'F', 'charForView', 'fxLibOf', 'itemLibOf', 'tokenCtxFor', 'resolveAll', shX.slice(evA, evB) + NL + 'return exportView;')(
            () => ({ id: 'k', system: rawU, chars: { c_u: cU } }), (id, cp) => (cp || { chars: { c_u: cU } }).chars[id] || null, () => true, () => false, () => cleanSystem(rawU, { F, gmView: false }), cleanChar, cleanSystem, () => F, S.charForView, libF.fxLibOf, libF.itemLibOf, () => null, resolveAll)('c_u');
        const vU2 = Object.assign({}, evU.view, { values: Object.assign({}, evU.view.values, { f_nt: 'first' + String.fromCharCode(13) + 'second' }) }), mdU = X.sheetToMarkdown(evU.sys, vU2, resolveAll(evU.sys, vU2, F, null), { F });
        check('F2a the GM\'s players\'-view file counts a curse on a list the players do not see, nameless, as their own sheet does (the full system passed along); a notes line broken by a lone CR stays two lines',
            evU.all.f_s.value === 8 && !('f_hl' in evU.view.values) && !/Curse|Hexes/.test(JSON.stringify(X.charToJson(evU.sys, evU.view, evU.all, {}))) && /first {2}\nsecond/.test(mdU), j([evU.all.f_s, evU.view.unseen, mdU.slice(0, 300)]));
        check('F2a (source): the menu keeps its keys (the map never sees an arrow or Delete pressed in it) and its arrows move between its choices; switching the sheet closes it; the players\' view of an NPC reads no token',
            /pop\.addEventListener\('keydown', function\(e\) \{[^\n]*\n\s*e\.stopPropagation\(\);\n\s*if \(e\.key !== 'ArrowDown' && e\.key !== 'ArrowUp'\) return;/.test(shX) && /if \(sheetOpen !== charId\) \{ closeDownloadMenu\(\); _sheetEdit = null; \}/.test(shX)
            && /var readTok = !!\(gm \|\| isClient\(\) \|\| \(c0\.ownerId && !c0\.npc\)\), tctx = readTok \? tokenCtxFor\(c0\.id, camp\) : null;/.test(shX) && /noToken: !readTok, npc: !!c0\.npc, ownerId: c0\.ownerId \|\| '',/.test(shX) && !/sinkcheck:exportview/.test(shX));
    }
    /* ---- Onboarding F2b: a sheet printed exactly as it shows ---- */
    {
        const shP = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), cssP = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, NL), bs = shP.slice(shP.indexOf('function buildSections('), shP.indexOf('/* ---------- the Layout tab (SB4)'));
        check('F2b buildSections, printed: every tab in turn under its own heading (a tab that draws nothing has none), no tab strip, every section open and never written back, nothing that only works on screen (roller, search, HUD button, Pin, the Pin and Reset chips), no token read for the players\' view of an NPC',
            /var printV = !!\(vctx && vctx\.print\);/.test(bs) && /if \(tabs && !printV\) \{/.test(bs) && /var collap = !!sec\.collapsible && !printV && !arrV;/.test(bs) && /var pinCh = !printV && sec\.pin/.test(bs) && /var rsCh = !printV && sec\.resetAll === true/.test(bs)
            && /node = printV \? null : rollerNode\(/.test(bs) && /node = printV \? null : hbNode\(/.test(bs) && /node = printV \? null : hudButton\(/.test(bs) && /node = !printV && pl\.g && /.test(bs) && /node = printV && vctx\.noToken \? null : facingNode\(c, gm\);/.test(bs) && /node = printV && vctx\.noToken \? null : stanceNode\(c, gm\);/.test(bs)
            && /\(printV && tabs \? tabs : \[null\]\)\.forEach\(function\(pt\) \{/.test(bs) && /var want = pt \? pt\.id : active;/.test(bs) && /if \(stab !== want\) return;/.test(bs) && /if \(secEl\) \{ if \(tabHead && !had\) body\.appendChild\(tabHead\); sideAdd\(body, secEl, sec\); secN\+\+; tabN\+\+; had\+\+; \}/.test(bs)
            && /if \(pt\) \{ tabHead = el\('div', 'sheet-print-tab'\); if \(pt\.icon\) tabHead\.appendChild\(iconNode\(pt\.icon, 'sheet-tab-icon'\)\); tabHead\.appendChild\(el\('span', 'sheet-tab-label', pt\.label \|\| 'Tab'\)\); \}/.test(bs));
        const pS = shP.slice(shP.indexOf('function printSheet('), shP.indexOf('// The Download menu'));
        check('F2b printSheet: the files\' own view (exportView), drawn inert (the live flag restored whatever happens), boxes as their text, the look and palette on the copy, the background picture on a layer each page repeats (a late picture lands there), the name as text only, pictures and fonts awaited (three seconds at most), and everything gone after the print',
            /var X = exportView\(charId, gmAll\); if \(!X\)/.test(pS) && /var wasLive = _fxLive; _fxLive = false; window\.wpPrintCopy = true;/.test(pS) && /finally \{ _fxLive = wasLive; window\.wpPrintCopy = false; \}/.test(pS) && /\{ campId: X\.camp\.id, view: 'sheet', preview: false, print: true, noToken: X\.noToken \}/.test(pS) && /printify\(body\);/.test(pS)
            && /applyPaletteTo\(pr, look\); applySheetLookTo\(pr, sheetLook\(X\.camp, X\.sys\)\);/.test(pS) && /bg\.style\.backgroundImage = pr\.style\.backgroundImage;/.test(pS) && /if \(pr\.dataset\.bgpath\) \{ bg\.dataset\.bgpath = pr\.dataset\.bgpath;[^\n]*delete pr\.dataset\.bgpath;/.test(pS) && /pr\.style\.backgroundImage = '';/.test(pS)
            && /el\('div', 'sheet-print-name', X\.view\.name \|\| 'Character'\)/.test(pS) && !/innerHTML/.test(pS) && /pim\.src = imgSrc\(X\.view\.portrait\);/.test(pS) && /setTimeout\(r, 3000\)/.test(pS) && /window\.addEventListener\('afterprint', clean\);/.test(pS) && /document\.documentElement\.classList\.remove\('print-sheet'\); document\.body\.classList\.remove\('print-sheet'\); if \(pr\.parentNode\) pr\.remove\(\);/.test(pS)
            && /if \(ui\('sheetPrint'\) !== pr\) return;/.test(pS) && /if \(kind === 'print'\) printSheet\(cid, gm && _dlGm\);/.test(shP) && /item\('Print or save as PDF\\u2026'/.test(shP)
            && /var old = ui\('sheetPrint'\); if \(old\) old\.remove\(\);/.test(pS) && /Promise\.race\(\[Promise\.all\(ims\), new Promise\(function\(r\) \{ setTimeout\(r, 3000\); \}\)\]\)/.test(pS)
            && /document\.documentElement\.classList\.add\('print-sheet'\); document\.body\.classList\.add\('print-sheet'\);\n\s*window\.addEventListener\('afterprint', clean\);\n\s*var nH = net\(\); if \(nH && nH\.holdPeers\) nH\.holdPeers\(180000\);[^\n]*\n\s*try \{ window\.print\(\); \} catch \(e\) \{\}\n\s*clean\(\);[^\n]*\n\s*if \(nH && nH\.heldDone\) nH\.heldDone\(\);/.test(pS)
            && /pr\.querySelectorAll\('\.wp-glyph'\)[^\n]*glyphU\[gm2\[1\]\] = 1;/.test(pS) && /Object\.keys\(glyphU\)\.forEach\(function\(u\) \{ ims\.push\(new Promise\(function\(r\) \{ var gi = new Image\(\); gi\.onload = r; gi\.onerror = r; gi\.src = u; \}\)\); \}\);/.test(pS) && /if \(!phA \|\| typeof p !== 'string' \|\| !p \|\| imgSrc\(p\) !== phA\) return;/.test(pS) && /if \(im\.getAttribute\('src'\) === phA\) im\.src = imgSrc\(p\);/.test(pS)
            && /pr\.inert = true;/.test(pS) && /X\.npc \? 'NPC' : X\.ownerId \? ownerName\(\{ id: X\.view\.id, ownerId: X\.ownerId \}, X\.camp\) : 'unassigned'/.test(pS) && /if \(pim \|\| tt\.childNodes\.length\) pr\.appendChild\(head\);/.test(pS)
            && /!\(_fxLive \|\| window\.wpPrintCopy === true\) \|\| entry\.hid === 1\) return;/.test(shP));
        // printify, run for real on a small stand-in DOM
        const pfA = shP.indexOf('function printify('), pfB = shP.indexOf('function printSheet(');
        const mk = (tag, o) => Object.assign({ tag, className: '', style: {}, replaced: null, replaceWith(n) { this.replaced = n; } }, o || {});
        const ta = mk('textarea', { className: 'field sheet-notes', value: 'line one\nline two' }), ti = mk('input', { className: 'field sheet-text', value: 'Home Campaign' }), nl = mk('div', { style: { display: 'none' } }), tr = mk('tr', { style: { display: 'none' } });
        const fxName = mk('span', { title: 'Lasts until dawn', closest: () => fxRow }), fxRow = mk('div', { kids: [], appendChild(k) { this.kids.push(k); } });
        const root = { querySelectorAll: sel => sel === 'textarea' ? [ta] : sel === 'input[type="text"], input:not([type])' ? [ti] : sel === '.sheet-item-noteline, tr.sheet-itemtable-notes' ? [nl, tr] : sel === '.sheet-fx .sheet-fx-name[title]' ? [fxName] : [] };
        new Function('el', shP.slice(pfA, pfB) + NL + 'return printify;')((t, cls, text) => ({ tag: t, className: cls, textContent: text }))(root);
        check('F2b printify (run for real): a notes box and a text box become their whole text (their look kept by their classes); the rows a list folds away are shown',
            ta.replaced && ta.replaced.tag === 'div' && ta.replaced.textContent === 'line one\nline two' && /sheet-notes sheet-print-text/.test(ta.replaced.className) && ti.replaced && ti.replaced.tag === 'span' && ti.replaced.textContent === 'Home Campaign' && nl.style.display === '' && tr.style.display === ''
            && fxRow.kids.length === 1 && fxRow.kids[0].textContent === 'Lasts until dawn' && fxRow.kids[0].className === 'sheet-print-note');
        const pm = cssP.slice(cssP.indexOf('  @media print {'), cssP.indexOf('}', cssP.indexOf('* { -webkit-print-color-adjust')) + 1);
        check('F2b the print rules: the app\'s own (Save PDF) apply only when no sheet is printing; a printed sheet shows alone, full height, its frame not sticky, its screen-only buttons hidden, its picture on the repeated layer; #sheetPrint wears the panel\'s twins; off screen otherwise',
            /body:not\(\.print-sheet\) header, body:not\(\.print-sheet\) \.sidebar, body:not\(\.print-sheet\) #plannerEditor, body:not\(\.print-sheet\) \.tool, body:not\(\.print-sheet\) \.canvas-controls \{ display: none !important; \}/.test(pm) && /body:not\(\.print-sheet\) \{ background: white; color: black; \}/.test(pm) && !/^\s*body \{ background: white/m.test(pm)
            && /body\.print-sheet > \*:not\(#sheetPrint\) \{ display: none !important; \}/.test(cssP) && /html\.print-sheet, body\.print-sheet \{ height: auto !important; overflow: visible !important;/.test(cssP) && /#sheetPrint \.sheet-frame \{ position: static !important; \}/.test(cssP) && /#sheetPrint button:not\(\.sheet-roll\):not\(\.sheet-item-roll\) \{ display: none !important; \}/.test(cssP) && /#sheetPrint \.sheet-print-bg \{ position: fixed; inset: 0; z-index: -1;/.test(cssP)
            && /^  #sheetPrint \{ position: absolute; left: -30000px; top: 0; visibility: hidden; pointer-events: none;/m.test(cssP) && /body\.print-sheet #sheetPrint \{ display: block !important; position: relative !important; left: auto !important; visibility: visible !important;/.test(cssP)
            && /\.sheet-print-text \{ display: block; white-space: pre-wrap; overflow-wrap: anywhere;/.test(cssP) && /#sheetPrint \.sheet-section, #sheetPrint \.sheet-item, #sheetPrint tr, #sheetPrint \.sheet-field \{ break-inside: avoid; \}/.test(cssP) && /#sheetPrint \.sheet-items-table \{ overflow: visible !important; \}/.test(cssP) && /#sheetPrint \.sheet-hdr-val \{ white-space: pre-wrap; overflow: visible; text-overflow: clip; \}/.test(cssP) && /#sheetPrint input\.field, #sheetPrint select\.field, #sheetPrint textarea\.field/.test(cssP) && /#popoutBody\.sheet-view \.field, #sheetPrint \.field \{ margin-bottom: 0; \}/.test(cssP) && /#sheetPrintBody:has\(> \.sheet-frame\)/.test(cssP) && /#sheetPrint \.sheet-idn-edit \.field/.test(cssP) && /#sheetPrint \.sheet-hdr-edit input\.field/.test(cssP));
        check('F2b Help says it', /<b>Print or save as PDF<\/b> sends the sheet through the print dialog exactly as it shows\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }
    /* ---- Onboarding F3a: a character a player makes ---- */
    {
        const sysF = cleanSystem({ v: 1, name: 'F3', rolls: [], fields: [
            { id: 'f_own', key: 'Own', label: 'Own', kind: 'number', edit: 'owner', vis: 'all', hover: true },
            { id: 'f_lvl', key: 'Lvl', label: 'Lvl', kind: 'number', edit: 'gm', vis: 'all' },
            { id: 'f_sec', key: 'Sec', label: 'Sec', kind: 'number', edit: 'owner', vis: 'gm' },
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', edit: 'gm', vis: 'all', max: '10' },
            { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'gm', vis: 'all' },
            { id: 'f_go', key: 'Pack', label: 'Pack', kind: 'item-list', edit: 'owner', vis: 'all' },
            { id: 'f_fx', key: 'Fx', label: 'Fx', kind: 'effects', edit: 'gm', vis: 'all' }],
            items: [{ id: 'i_ring', name: 'Ring', rm: 'bound' }, { id: 'i_rope', name: 'Rope' }], effects: [{ id: 'e_rage', name: 'Rage' }] }, { F, gmView: true });
        const pvF = cleanSystem(sysF, { F, gmView: false }), PF = { player: true, view: pvF };
        const chF = st => Object.assign({ id: 'c_f', name: 'Pax', ownerId: 'u_p', values: { f_own: 1, f_lvl: 2, f_sec: 3, f_g: [], f_go: [{ id: 'w_r', defId: 'i_ring', qty: 1 }] } }, st || {});
        check('F3a LIMITS.makingMax is 12; openChar reads making before unlocked, anything else (true, a string, none) as closed',
            LIMITS.makingMax === 12 && S.openChar(chF({ making: 1 })) === 'making' && S.openChar(chF({ unlocked: 1 })) === 'unlocked' && S.openChar(chF({ making: 1, unlocked: 1 })) === 'making'
            && S.openChar(chF({ making: true })) === '' && S.openChar(chF({ unlocked: '1' })) === '' && S.openChar(chF()) === '' && S.openChar(null) === '');
        const raw = chF({ making: true, unlocked: 1, review: true, made: 1 }), cN = cleanChar(raw, sysF), cO = cleanChar(raw, sysF, { state: 'owner' }), cH = cleanChar(raw, sysF, { state: 'host' });
        const cInv = cleanChar(chF({ making: 1, invited: true }), sysF, { state: 'host' }), cInvO = cleanChar(chF({ making: 1, invited: 1 }), sysF, { state: 'owner' }), cInvF = cleanChar(chF({ invited: 1 }), sysF, { state: 'host' });
        const cU = cleanChar(chF({ unlocked: true, review: 1 }), sysF, { state: 'host' }), cNo = cleanChar(Object.assign(chF({ making: 1, review: 1, made: 1 }), { ownerId: '' }), sysF, { state: 'host' });
        const cPart = cleanChar(Object.assign(chF({ making: 1 }), { partial: true, lines: [] }), sysF, { state: 'owner' });
        check('F3a cleanChar (+ F3b invited: in the making only, to its owner too — the GM asked for it): the state keys go only where the caller keeps state — none by default (a wire copy, an import cleaned bare); a player\'s own copy keeps making or unlocked (making wins), never the GM\'s review or made mark; the GM\'s load keeps all four (true read as 1); an unowned character or a teammate\'s partial copy keeps none',
            [cN.making, cN.unlocked, cN.review, cN.made].every(v => v === undefined) && cO.making === 1 && cO.unlocked === undefined && cO.review === undefined && cO.made === undefined
            && cH.making === 1 && cH.unlocked === undefined && cH.review === 1 && cH.made === 1 && cU.unlocked === 1 && cU.review === 1 && cU.making === undefined
            && [cNo.making, cNo.review, cNo.made].every(v => v === undefined) && cPart.making === undefined && cInv.invited === 1 && cInvO.invited === 1 && cInvF.invited === undefined && cleanChar(chF({ unlocked: 1, invited: 1 }), sysF, { state: 'owner' }).invited === undefined && charFor(chF({ making: 1, invited: 1 }), sysF, 'u_p').invited === 1 && charFor(chF({ making: 1, invited: 1 }), sysF, 'u_p', { probe: true }).invited === undefined && cN.invited === undefined, j([cN, cO, cH, cU, cNo, cInv]));
        const mk = chF({ making: 1, review: 1, made: 1 }), ul = chF({ unlocked: 1, review: 1, made: 1 });
        const vOwn = charFor(mk, sysF, 'u_p'), vOther = charFor(mk, sysF, 'u_q'), vProbe = charFor(mk, sysF, 'u_p', { probe: true }), uOwn = charFor(ul, sysF, 'u_p'), uOther = charFor(ul, sysF, 'u_q');
        check('F3a charFor: a character in the making is its owner\'s alone — no copy for anyone else (not even hover lines); the owner\'s copy says making, the probe (which fields a delta may carry) does not; an unlocked one reaches teammates as ever, its unlocked mark to its owner only; review and made never leave the host',
            vOwn && vOwn.making === 1 && vOther === null && vProbe && vProbe.making === undefined && uOwn && uOwn.unlocked === 1 && uOther && uOther.partial === true && uOther.unlocked === undefined
            && [vOwn, uOwn, uOther].every(v => v.review === undefined && v.made === undefined), j([vOwn, vOther, uOwn, uOther]));
        const ed = (c, fid, v) => S.applyEdit(sysF, c, fid, v, F, PF);
        check('F3a applyEdit (the owner\'s rights, owner D3 = a): a GM-set field refuses its player on a finished character, and takes their value while it is in the making or unlocked; a GM-only field refuses them either way; the GM is unchanged',
            ed(chF(), 'f_lvl', 5).reason === 'field' && ed(chF({ making: 1 }), 'f_lvl', 5).ok && ed(chF({ unlocked: 1 }), 'f_lvl', 5).ok && ed(chF({ making: 1 }), 'f_sec', 5).reason === 'field' && ed(chF({ unlocked: 1 }), 'f_sec', 5).reason === 'field'
            && ed(chF(), 'f_own', 5).ok && S.applyEdit(sysF, chF(), 'f_lvl', 5, F, {}).ok);
        const ro = (c, fid, q) => S.applyRowOp(sysF, c, fid, q, F, PF);
        const rP = ro(chF(), 'f_g', { op: 'add', defId: 'i_rope' }), rM = ro(chF({ making: 1 }), 'f_g', { op: 'add', defId: 'i_ring', rowId: 'w_n1' }), rU = ro(chF({ unlocked: 1 }), 'f_g', { op: 'add', defId: 'i_ring', rowId: 'w_n1' });
        const dM = ro(chF({ making: 1 }), 'f_go', { op: 'remove', rowId: 'w_r' }), dU = ro(chF({ unlocked: 1 }), 'f_go', { op: 'remove', rowId: 'w_r' }), dP = ro(chF(), 'f_go', { op: 'remove', rowId: 'w_r' });
        check('F3a applyRowOp: a GM-edit list refuses its player on a finished character and opens in the making or unlocked; in the making a bound item is no lock and no pickup notice (it is not in play yet), unlocked it is both (owner: field rights only)',
            rP.reason === 'field' && rM.ok && rM.note === undefined && rU.ok && rU.note === 'bound' && dM.ok && !dU.ok && !dP.ok && dU.reason === dP.reason, j([rP, rM, rU, dM, dU, dP]));
        const fo = (c, q) => S.applyEffectOp(sysF, c, 'f_fx', q, F, PF);
        check('F3a applyEffectOp: a GM-edit effects list opens to its player in the making or unlocked, not on a finished character',
            fo(chF(), { op: 'add', rowId: 'x_1', ref: 'e_rage' }).reason === 'field' && fo(chF({ making: 1 }), { op: 'add', rowId: 'x_1', ref: 'e_rage' }).ok && fo(chF({ unlocked: 1 }), { op: 'add', rowId: 'x_1', ref: 'e_rage' }).ok);
        const secF = { fields: [{ id: 'f_hp' }] }, rtP = S.resetTargets(sysF, chF(), secF, F, { own: true }), rtM = S.resetTargets(sysF, chF({ making: 1 }), secF, F, { own: true }), rtU = S.resetTargets(sysF, chF({ unlocked: 1 }), secF, F, { own: true });
        check('F3a resetTargets: a GM-set pool resets for its owner only while the character is in the making or unlocked', rtP.allowed === 0 && rtM.allowed === 1 && rtU.allowed === 1, j([rtP, rtM, rtU]));
        const cmp = (c, sheets) => j(S.newCharRules(c, sheets));
        check('F3a newCharRules (owner: Just a token follows making): live by default (from a file too, just a token too); invite: no just-a-token; off: neither a file nor just a token; fromFile false keeps making live without a file; sheets off or no system: making off, just a token always',
            cmp({ system: sysF }, true) === j({ create: 'live', fromFile: true, justToken: true }) && cmp({ system: sysF, newPlayers: { create: 'invite' } }, true) === j({ create: 'invite', fromFile: true, justToken: false })
            && cmp({ system: sysF, newPlayers: { create: 'off' } }, true) === j({ create: 'off', fromFile: false, justToken: false }) && cmp({ system: sysF, newPlayers: { fromFile: false } }, true) === j({ create: 'live', fromFile: false, justToken: true })
            && cmp({ system: sysF, newPlayers: { create: 'invite' } }, false) === j({ create: 'off', fromFile: false, justToken: true }) && cmp({}, true) === j({ create: 'off', fromFile: false, justToken: true }) && cmp(null, true) === j({ create: 'off', fromFile: false, justToken: true })
            && cmp({ system: sysF, newPlayers: { create: 'live!' } }, true) === j({ create: 'live', fromFile: true, justToken: true }));
        check('F3a cleanNewPlayers keeps create (invite, off) and fromFile false beside token and sight, drops anything else, and stays null at the defaults',
            j(S.cleanNewPlayers({ token: 'off', create: 'invite', fromFile: false, sight: true })) === j({ token: 'off', sight: true, create: 'invite', fromFile: false }) && S.cleanNewPlayers({ create: 'live', fromFile: true }) === null
            && S.cleanNewPlayers({ create: 'OFF', fromFile: 0, x: 1 }) === null && j(S.cleanNewPlayers({ create: 'off' })) === j({ create: 'off' }));
        const campC = { chars: { c_a: { id: 'c_a', name: 'Pax' }, c_b: { id: 'c_b', name: '  pax ' }, c_c: { id: 'c_c', name: 'Ada' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', isChar: true, charName: 'PAX' }, { id: 't2', isChar: true, charName: 'Ada', charId: 'c_c' }, { id: 't3', charName: 'Bo' }], rooms: [{ id: 'r1', characters: [{ id: 'rc1', name: 'ada' }] }] } } };
        check('F3a charClash (owner: the same name is allowed; the GM is told): another character (case and spaces aside), a token bound by name (not one bound by id, not a non-token), a room\'s character; never the character itself; nothing for an empty name',
            j(S.charClash(campC, 'pax', 'c_a')) === j(['character', 'token']) && j(S.charClash(campC, 'Ada', 'c_c')) === j(['room']) && j(S.charClash(campC, 'Bo', 'c_x')) === j([]) && j(S.charClash(campC, ' ', 'c_x')) === j([])
            && j(S.charClash(campC, 'Pax', 'c_x')) === j(['character', 'token']) && j(S.charClash(null, 'Pax')) === j([]));
        const campP = { players: { u_p: {} }, chars: { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_p', making: 1 }, c_g: { id: 'c_g', name: 'Gil', ownerId: 'u_q' } }, items: {} };
        check('F3a a character in the making is not in play: not among its player\'s playable characters, so they have none in play (and a GM\'s give meanwhile is)',
            S.playableChars(campP, 'u_p').length === 0 && S.activeCharOf(campP, 'u_p').id === null && S.activeCharOf(Object.assign({}, campP, { chars: Object.assign({}, campP.chars, { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_p' } }) }), 'u_p').id === 'c_k');
        const campT = made => ({ players: { u_p: {} }, chars: { c_v: Object.assign({ id: 'c_v', name: 'Pax', ownerId: 'u_p' }, made ? { made: 1 } : {}) }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tv', isChar: true, charName: 'Pax' }, { id: 'tm', isChar: true, charName: 'Pax', ownerId: 'u_p' }] } } });
        const campT2 = made => { const c = campT(made); c.items.m1.whiteboard.pop(); return c; };
        check('F3a tokenSourceFor: a character its player made never takes a GM\'s unowned token by its name (owner: same names allowed) — it gets one of its own; their own token of that name is still linked; a GM\'s character still links the namesake',
            S.tokenSourceFor(campT2(true), 'u_p', 'm1').op === 'spawn' && S.tokenSourceFor(campT2(false), 'u_p', 'm1').op === 'link' && S.tokenSourceFor(campT(true), 'u_p', 'm1').tok.id === 'tm');
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), wbF = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL);
        const gvF = shF.slice(shF.indexOf('function giveCharacter('), shF.indexOf('function spotOnPlayersMap('));
        check('F3a sheets.js: a new owner gets a finished, locked character (the four marks go when the owner changes); rolls and applies wait until it is finished; the owner edits every field they can see while it is open (the three places); a deleted one in the making is gone from its player alone',
            /var prev = c\.ownerId \|\| '', was = [^\n]*\n\s*if \(prev !== pid\) \{ delete c\.making; delete c\.unlocked; delete c\.review; delete c\.made; \}/.test(gvF)
            && (shF.match(/return !!\(c\.ownerId && c\.ownerId === myId\(\) && !c\.partial && !c\.npc && c\.making !== 1\);/g) || []).length === 1 && shF.includes('&& !c.partial && !c.npc && (c.making !== 1 || makeRollsOn())); return true; }')   /* 1.6.3 (finding 22): a roll waits until it is finished unless the system sets Rolls while making (makeRollsOn); an apply still waits (moved on purpose) */
            && (shF.match(/own && f\.vis === 'all' && \(f\.edit === 'owner' \|\| c\.making === 1 \|\| c\.unlocked === 1\)/g) || []).length === 3 && !/own && f\.edit === 'owner' && f\.vis === 'all'/.test(shF)
            && /n\.syncCharGone\(id, c\.making === 1 \? prev : ''\);/.test(shF));
        const rmF = shF.slice(shF.indexOf('function removeMade('), shF.indexOf('/* ---------- Onboarding F2a'));
        check('F3a removeMade (the GM\'s Remove): the spot of its token on its player\'s map first, every token of it goes (a non-token loses the link), the name unbound (a name its player chose, even on a token they still hold), an undo barrier on those maps, saved, the maps pushed, gone from everyone, its player told, a waiting token allowed again and placed where it stood',
            /spot = pid \? tokenSpotOf\(camp, pid, id\) : null/.test(rmF) && /return !\(w && w\.isChar && w\.charId === id\);/.test(rmF) && /if \(w && w\.charId === id\) delete w\.charId;/.test(rmF) && /if \(pid\) \{ unbindStale\(camp, pid, c\); unbindMade\(camp, pid, c\.name\); syncOwners\(camp\); \}/.test(rmF)
            && /if \(maps\.length && window\.wpHistBarrier\) window\.wpHistBarrier\(maps\);\s*[^\n]*\n\s*save\(true\);/.test(rmF) && /n\.pushItems\(maps\); n\.syncCharGone\(id\); if \(n\.charReview\) n\.charReview\(pid, id, c\.name, 'removed', note\);/.test(rmF)
            && /n\.allowWaiting\(pid\);/.test(rmF) && /n\.reconcilePresence\(pid, \{ near: spot \}\);/.test(rmF) && rmF.indexOf('tokenSpotOf') < rmF.indexOf('m.whiteboard = m.whiteboard.filter') && !/innerHTML/.test(rmF));
        const rvS = shF.slice(shF.indexOf('function keepMade('), shF.indexOf('function removeMadeAsk('));
        const rvRun = (chars, act, id, answer) => {
            const camp = { chars }, sent = [], prompts = [], changed = [], nR = { charReview: (...a) => sent.push(a), logEvent: () => {} };
            const f = new Function('getActiveCampaign', 'charById', 'isClient', 'save', 'net', 'renderSheet', 'window', 'showPrompt', 'afterCharChange', 'playerNames', rvS + '\nreturn { keepMade: keepMade, sendBackMade: sendBackMade, unlockChar: unlockChar };')(
                () => camp, (i, cp) => (cp || camp).chars[i], () => false, () => changed.push('save'), () => nR, () => {}, {}, (q, d, cb) => { prompts.push(q); cb(answer); }, (c, whole) => changed.push(['sync', c.id, !!whole]), () => ({ u_a: 'Ana' }));
            f[act](id); return { c: chars[id], sent, prompts, changed };
        };
        const rvC = x => ({ c_m: Object.assign({ id: 'c_m', name: 'Pax', ownerId: 'u_a' }, x) });
        const rvK = rvRun(rvC({ made: 1, review: 1 }), 'keepMade', 'c_m'), rvB = rvRun(rvC({ made: 1, review: 1 }), 'sendBackMade', 'c_m', 'Fix ST'), rvBx = rvRun(rvC({ made: 1, review: 1 }), 'sendBackMade', 'c_m', null);
        const rvL = rvRun(rvC({ unlocked: 1 }), 'unlockChar', 'c_m'), rvU = rvRun(rvC({}), 'unlockChar', 'c_m', ''), rvMk = rvRun(rvC({ making: 1, made: 1 }), 'unlockChar', 'c_m', '');
        check('F3a the GM\'s review actions (run for real): Keep it drops the review mark only (saved, nothing sent); Send back drops it, unlocks, syncs the whole character and tells its player with the note (a cancel changes nothing); Lock on an unlocked one locks at once and tells its player; Unlock on a finished one is Send back; nothing on one in the making',
            j(rvK.c) === j({ id: 'c_m', name: 'Pax', ownerId: 'u_a', made: 1 }) && j(rvK.changed) === j(['save']) && rvK.sent.length === 0
            && !('review' in rvB.c) && rvB.c.unlocked === 1 && j(rvB.changed) === j([['sync', 'c_m', true]]) && j(rvB.sent) === j([['u_a', 'c_m', 'Pax', 'back', 'Fix ST']]) && rvBx.c.review === 1 && !('unlocked' in rvBx.c) && rvBx.sent.length === 0
            && !('unlocked' in rvL.c) && rvL.prompts.length === 0 && j(rvL.changed) === j([['sync', 'c_m', true]]) && j(rvL.sent) === j([['u_a', 'c_m', 'Pax', 'locked', '']])
            && rvU.c.unlocked === 1 && rvU.prompts.length === 1 && j(rvU.sent) === j([['u_a', 'c_m', 'Pax', 'back', '']]) && rvMk.c.making === 1 && !('unlocked' in rvMk.c) && rvMk.prompts.length === 0 && rvMk.sent.length === 0, j([rvK, rvB, rvL, rvU, rvMk]));
        const ubLine = shF.slice(shF.indexOf('function unbindMade('), shF.indexOf('\n', shF.indexOf('function unbindMade(')));
        const campUb = { players: { u_p: { charName: 'Vornak' } }, chars: {}, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tp', isChar: true, charName: 'Vornak', ownerId: 'u_p' }] }, m2: { id: 'm2', type: 'map', whiteboard: [{ id: 'tg', isChar: true, charName: 'Vornak' }] } } };
        const beforeUb = S.tokenSourceFor(campUb, 'u_p', 'm2').op;
        new Function('playerRecOf', ubLine + '\nreturn unbindMade;')((camp, pid) => camp.players[pid])(campUb, 'u_p', 'Vornak');
        const campCm = chose => ({ players: { u_p: Object.assign({ charName: 'Guard' }, chose ? { charMade: chose } : {}) }, chars: {}, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'mine', isChar: true, charName: 'Guard', ownerId: 'u_p' }] }, m2: { id: 'm2', type: 'map', whiteboard: [{ id: 'npc1', isChar: true, charName: 'Guard' }] }, m4: { id: 'm4', type: 'map', whiteboard: [{ id: 'npc2', isChar: true, charName: 'Guard', hidden: true }] }, m3: { id: 'm3', type: 'map', whiteboard: [] } } });
        const cmSrc = (c, map) => { const x = S.tokenSourceFor(c, 'u_p', map); return x.op + (x.tok ? ':' + x.tok.id : ''); }, cmGone = campCm('Guard'); cmGone.items.m1.whiteboard = [];
        const cmStale = campCm('Other');
        check('F3b a name its player chose for Just a token (charMade = that name) finds only tokens they hold: here their own is kept, elsewhere copied, a GM\'s namesake never adopted or copied (hidden or not); with their own gone, nothing; the GM\'s binding (no mark, or a mark for another name) is the old rule; the GM\'s bindings clear the mark',
            cmSrc(campCm('Guard'), 'm2') === 'clone:mine' && cmSrc(campCm('Guard'), 'm1') === 'keep:mine' && cmSrc(cmGone, 'm3') === 'none' && cmSrc(cmGone, 'm2') === 'none' && cmSrc(campCm(null), 'm2') === 'adopt:npc1' && cmSrc(cmStale, 'm2') === 'adopt:npc1'
            && /function setInPlay\(camp, c\) \{ var r = playerRecOf\(camp, c\.ownerId, true\); if \(!r\) return; r\.charId = c\.id; r\.charName = c\.name; delete r\.charMade; \}/.test(shF) && /campO\.players\[this\.value\]\.charName = w\.charName; delete campO\.players\[this\.value\]\.charMade;/.test(fs.readFileSync(path.join(app, 'scripts', 'inspector.js'), 'utf8'))
            && /if \(r && r\.charName === name\) \{ delete r\.charName; delete r\.charMade; \} \}/.test(shF));
        check('F3a a name its player chose never binds them to a GM\'s token once that character is gone from them (deleted, removed or given away), even while they hold a token of that name: the record forgets it (a GM\'s namesake elsewhere is no longer adopted)',
            beforeUb === 'adopt' && !('charName' in campUb.players.u_p) && S.tokenSourceFor(campUb, 'u_p', 'm2').op === 'none' && S.tokenSourceFor(campUb, 'u_p', 'm1').op === 'keep'
            && /if \(prev\) \{ unbindStale\(camp, prev, c\); if \(c\.made === 1\) unbindMade\(camp, prev, c\.name\); syncOwners\(camp\);/.test(shF) && /if \(prev && prev !== pid\) \{ unbindStale\(camp, prev, c\); if \(wasMade\) unbindMade\(camp, prev, c\.name\); \}/.test(gvF) && /wasMade = c\.made === 1;\n\s*if \(prev !== pid\) \{ delete c\.making;/.test(gvF));
        const sysMk = cleanSystem({ v: 1, name: 'Mk', rolls: [], fields: [{ id: 'f_w', key: 'Worn', label: 'Worn', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', def: true }, multi: true } }],
            items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'Stuck' }, { id: 'i_band', name: 'Band', rm: 'bound', rmMsg: 'Bound band' }] }, { F, gmView: true });
        const PMk = { player: true, view: cleanSystem(sysMk, { F, gmView: false }) }, roMk = (st, rows, q) => S.applyRowOp(sysMk, Object.assign({ id: 'c_m', ownerId: 'u_p', values: { f_w: JSON.parse(JSON.stringify(rows || [])) } }, st || {}), 'f_w', q, F, PMk);
        const mkRun = st => ({ add: roMk(st, [], { op: 'add', defId: 'i_ring', rowId: 'w_n' }), on: roMk(st, [{ id: 'w_1', defId: 'i_ring', qty: 1, on: false }], { op: 'set', rowId: 'w_1', facts: { on: true } }),
            off: roMk(st, [{ id: 'w_1', defId: 'i_ring', qty: 1, on: true }], { op: 'set', rowId: 'w_1', facts: { on: false } }), qty: roMk(st, [{ id: 'w_2', defId: 'i_band', qty: 1 }], { op: 'setQty', rowId: 'w_2', qty: 2 }) });
        const mkA = mkRun({ making: 1 }), mkU = mkRun({ unlocked: 1 }), mkP = mkRun({});
        check('F3a applyRowOp in the making: an equip-locked item picked up worn, put on or taken off, and a raised bound quantity hold no lock and tell nobody; unlocked or finished they still do (owner: field rights only)',
            mkA.add.ok && mkA.add.eqNote === undefined && mkA.add.onRow === undefined && mkA.on.ok && mkA.on.eqNote === undefined && mkA.off.ok && mkA.qty.ok && mkA.qty.note === undefined
            && [mkU, mkP].every(r => r.add.eqNote === 'bound' && r.add.onRow === 'w_n' && r.on.eqNote === 'bound' && !r.off.ok && r.off.reason === 'stays' && r.qty.note === 'bound'), j([mkA, mkU, mkP]));
        const ivS = shF.slice(shF.indexOf('function inviteMaking('), shF.indexOf('function applyTokenFace('));
        // 1.6.4 (the review of the GM's own name): the character is named by the player's OWN name (the roster's, else their record's), never by the
        // name the GM calls them, which playerNames shows first and which would then reach the player and the table: the stand-in playerNames answers it
        const ivRun = (chars, o) => { o = o || {}; const camp = { system: o.noSys ? null : {}, chars: JSON.parse(JSON.stringify(chars || {})), newPlayers: o.rules, players: { u_a: { name: o.recName || 'Ana', gmName: 'Loud Dave' } } }, sent = [], toasts = [];
            const nI = { roster: o.noRoster ? {} : { pA: { id: 'u_a', name: 'Ana' } }, active: true, role: 'host', sendCharTo: (p, i) => sent.push(['to', p, i]), charReview: (...a) => sent.push(['rv', ...a]), logEvent() {}, isConnected: () => true, cleanCharName: v => String(v).trim().slice(0, 60) };
            const r = new Function('getActiveCampaign', 'isClient', 'okPid', 'charsOf', 'playerNames', 'net', 'save', 'toast', 'window', 'sheetsOnIn', ivS + '\nreturn inviteMaking;')(() => camp, () => !!o.client, p => /^u_/.test(p), () => camp.chars, () => ({ u_a: 'Loud Dave' }), () => nI, () => {}, t => toasts.push(t), { wpSystemCore: S }, () => !o.sheetsOff)('u_a');
            return { r, camp, sent, toasts }; };
        const ivRec = ivRun({}, { noRoster: true, recName: 'Ana B' }), ivRecC = Object.values(ivRec.camp.chars).find(c => c.making === 1);
        check('1.6.4 the GM\'s invite names the new character by the player\'s own name, never by the name the GM calls them in Player History: the roster\'s name, else their record\'s',
            ivRecC && ivRecC.name === 'Ana B' && !/Loud Dave/.test(j([ivRec.camp.chars, ivRec.sent])), j([ivRec.camp.chars, ivRec.sent]));
        const iv1 = ivRun({ c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a' } }), iv1c = Object.values(iv1.camp.chars).find(c => c.making === 1), ivHad = ivRun({ c_m: { id: 'c_m', name: 'M', ownerId: 'u_a', making: 1 } });
        check('F3b the GM\'s invite (run for real): one in the making under the player\'s name, made and invited (a replacement for one they play too), sent to them alone and they are told; never where making is off, sheets are off, there is no system, on a player\'s machine, or while they make one already',
            iv1.r === true && iv1c && iv1c.name === 'Ana' && iv1c.ownerId === 'u_a' && iv1c.made === 1 && iv1c.invited === 1 && j(iv1.sent) === j([['to', 'u_a', iv1c.id], ['rv', 'u_a', iv1c.id, 'Ana', 'invited', '']]) && iv1.camp.chars.c_k.making === undefined
            && ivRun({}, { rules: { create: 'off' } }).r === false && ivRun({}, { sheetsOff: true }).r === false && ivRun({}, { noSys: true }).r === false && ivRun({}, { client: true }).r === false && ivHad.r === false && Object.keys(ivHad.camp.chars).length === 1 && ivRun({}, { rules: { create: 'invite' } }).r === true, j([iv1, ivHad.toasts]));
        check('F3b a give with play to that player drops the invited mark of another they are making (the GM\'s newer word keeps it on Done); a plain token\'s picture: only on the GM\'s machine, a bundled one copied or their photo as token-<id>.png, never onto a token that has a picture meanwhile; the chip menu\'s Let them make a character; the rule select',
            /if \(pid && o\.play !== false\) Object\.keys\(charsOf\(camp\)\)\.forEach\(function\(k\) \{ var x = charsOf\(camp\)\[k\]; if \(x && x\.id !== c\.id && x\.ownerId === pid && x\.invited === 1\) \{ delete x\.invited; var nI = net\(\); if \(nI && nI\.active && nI\.role === 'host' && nI\.syncChar\) nI\.syncChar\(x\.id\); \} \}\);/.test(gvF)
            && /uploadExact\('images\/portraits\/token-' \+ wbId \+ '-' \+ Date\.now\(\)\.toString\(36\) \+ '\.png', b\)/.test(shF) && /if \(!w \|\| !w\.isChar \|\| \(w\.src && !replace\)\) return false;/.test(shF) && /if \(isClient\(\) \|\| !plan \|\| \(plan\.kind !== 'bundled' && plan\.kind !== 'picture'\) \|\| !\/\^\[A-Za-z0-9_-\]\{1,40\}\$\/\.test\(String\(wbId\)\)\) return Promise\.resolve\(false\);/.test(shF)
            && /items\.push\(\{ act: 'invite', ico: 'note', label: 'Let them make a character' \}\)/.test(wbF) && /else if \(act === 'invite'\) \{ if \(window\.wpSheets && window\.wpSheets\.inviteMaking\) window\.wpSheets\.inviteMaking\(key\.slice\(2\)\); \}/.test(wbF)
            && /<select id="netMakeSelect"[^>]*>\s*<option value="live">Players may make a character of their own<\/option>\s*<option value="invite">Players make one only when you ask them<\/option>\s*<option value="off">Players never make a character<\/option>/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8'))
            && /id="joinCardToken"/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')) && /<b>Just a token&hellip;<\/b> asks only for a name/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        const campOt = () => ({ players: { u_p: {} }, chars: { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_p', making: 1 } }, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 'tm', isChar: true, charName: 'Pax', charId: 'c_m', ownerId: 'u_p' }, { id: 'tn', isChar: true, charName: 'Pax', charId: 'c_m' }] } } });
        check('F3a ownedTokenPlan: a character in the making holds no token, sheets on or off — one its player holds passes to the GM (still linked), an unowned one stays the GM\'s',
            j(S.ownedTokenPlan(campOt(), { all: true })) === j([{ mapId: 'm1', wbId: 'tm', ownerId: '' }]) && j(S.ownedTokenPlan(campOt(), {})) === j([{ mapId: 'm1', wbId: 'tm', ownerId: '' }]));
        const mkS = shF.slice(shF.indexOf('function startMaking('), shF.indexOf('// The GM\'s side: a character a player made'));
        {   // 1.6.0: a sense's own arc, the eyes' reach and a system's Vision through the cleaner; a reader named to its system; the GM's own Upload
            const fdV = [{ id: 'f_arc', key: 'ArcW', label: 'ArcW', kind: 'number', vis: 'all', edit: 'gm', def: 120 }, { id: 'f_gm', key: 'Sec', label: 'Sec', kind: 'number', vis: 'gm', def: 3 }];
            const sOf = (o, sn, gm) => S.cleanSystem(Object.assign({ v: 1, name: 'V', fields: fdV, rolls: [], combat: { senses: Object.assign({ list: [Object.assign({ id: 'sn_aaaaaaaa', name: 'Side', grade: 'mark', range: { by: 'n', n: 3 } }, o)] }, sn) } }), { F: F, gmView: gm !== false }).combat.senses;
            check('1.6.0 a sense may show as a band of side vision: only as that word and only on a full sense, the same in both views', sOf({ grade: 'full', shows: 'side' }).list[0].shows === 'side' && sOf({ grade: 'full', shows: 'side' }, null, false).list[0].shows === 'side' && !('shows' in sOf({ shows: 'side' }).list[0]) && !('shows' in sOf({ grade: 'full', shows: 'band' }).list[0]));
            const aOf = a => sOf({ arc: a }).list[0].arc, kept = sOf({ arc: { field: 'f_gm' } }), eyesR = sOf({ range: { by: 'eyes' }, unit: 'ft', arc: 240 }), v1 = sOf({}, { view: { mode: 'arc', arc: 239.6 } }).view, v2 = sOf({}, { view: { mode: 'arc', arc: 400 } }).view, v3 = sOf({}, { view: { mode: 'all' } }).view;
            check('1.6.0 a sense\'s arc: a whole number of degrees or a number or formula field its player can read, the same in both views; 360 is all round, what is no arc the eyes\' arc; the sense stays where its field reads a secret; a range of the eyes\' reach keeps no unit; a system\'s Vision all round or an arc, and junk none',
                aOf(240) === 240 && aOf(239.6) === 240 && aOf(360) === 'all' && aOf(999) === 'all' && aOf(0) === undefined && aOf(-5) === undefined && aOf('240') === undefined && aOf('all') === 'all' && JSON.stringify(aOf({ field: 'f_arc' })) === JSON.stringify({ field: 'f_arc' }) && aOf({ field: 'nope' }) === undefined && kept.list.length === 1 && kept.list[0].arc === undefined
                && JSON.stringify(eyesR.list[0].range) === JSON.stringify({ by: 'eyes' }) && !('unit' in eyesR.list[0]) && eyesR.list[0].arc === 240 && JSON.stringify(sOf({ arc: 240 }, null, false)) === JSON.stringify(sOf({ arc: 240 })) && JSON.stringify(v1) === JSON.stringify({ mode: 'arc', arc: 240 }) && JSON.stringify(v2) === JSON.stringify({ mode: 'all' }) && JSON.stringify(v3) === JSON.stringify({ mode: 'all' }) && sOf({}, { view: { mode: 'arc' } }).view === undefined && sOf({}, { view: 'x' }).view === undefined && JSON.stringify(sOf({}, { view: { mode: 'arc', arc: 90 } }, false).view) === JSON.stringify({ mode: 'arc', arc: 90 }), JSON.stringify([eyesR, v1, v2]));
            const mkM = (id, mark, o) => Object.assign({ id: id, name: id, claims: () => true, fill: () => null, propose: () => null, rowOp: () => null, mark: mark }, o), sysM = { mark: 'my-table' }, sysO = { mark: 'other' }, sysN = {};
            S.registerReader(mkM('marked', 'my-table')); S.registerReader(mkM('plain')); S.registerReader(mkM('badmark', 'Not A Mark!'));
            const idsOf = l => l.map(r => r.id).join(); let rdW = null; try { rdW = [idsOf(S.readers()), idsOf(S.readers(sysM)), idsOf(S.readers(sysO)), idsOf(S.readers(sysN)), idsOf(S.readers(null)), S.readerFor({ x: 1 }, sysO).id, S.readerFor({ x: 1 }, sysM).id, S.readerFor({ x: 1 }).id]; } finally { ['marked', 'plain', 'badmark'].forEach(S.dropReader); }
            const mkSys = (o, gm) => S.cleanSystem(Object.assign({ v: 1, name: 'M', fields: [], rolls: [] }, o), { F: F, gmView: gm !== false });
            check('1.6.0 a reader named to its system: a plain word, and a reader that names one answers only on the system that carries that very word; one that names none answers everywhere, as a reader did; the mark stays in the GM\'s view, a word only, absent where none',
                JSON.stringify(rdW) === JSON.stringify(['marked,plain,badmark', 'marked,plain,badmark', 'plain,badmark', 'plain,badmark', 'plain,badmark', 'plain', 'marked', 'marked']) && mkSys({ mark: 'my-table' }).mark === 'my-table' && mkSys({ mark: 'my-table' }, false).mark === undefined && mkSys({ mark: '<b>' }).mark === undefined && mkSys({ mark: 7 }).mark === undefined && !('mark' in mkSys({})), JSON.stringify(rdW));
            const shU = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), slU = shU.slice(shU.indexOf('// [systemcheck:gmupload-start]'), shU.indexOf('// [systemcheck:gmupload-end]')), XU = await import(url('sheetexport.js'));
            const sysU = S.cleanSystem({ v: 1, name: 'U', fields: [{ id: 'f_str', key: 'Str', label: 'Str', kind: 'number', vis: 'all', edit: 'owner', def: 10 }, { id: 'f_gm', key: 'Sec', label: 'Sec', kind: 'number', vis: 'gm', edit: 'gm', def: 3 }], rolls: [], sheetRev: 2 }, { F: F, gmView: true }), viewU = S.cleanSystem(sysU, { F: F, gmView: false });
            const charU = v => ({ id: 'c_u', name: 'Ana', ownerId: 'p1', sheetRev: 2, values: { f_str: 10, f_gm: 3 } }), campU = { system: sysU, chars: {} }, gotU = { rd: [] };
            const U = new Function('getActiveCampaign', 'systemOf', 'playerSystem', 'playerFinder', 'charFromJson', 'F', 'window', 'isCharFile', 'charById', 'toast', 'openReview', 'document', slU + NL + 'return { ownFileUp: ownFileUp, gmUploadRead: gmUploadRead };')(() => campU, () => sysU, () => viewU, () => ({ find: () => null, findKey: () => null, lib: null }), XU.charFromJson, () => F, { wpSystemCore: S }, j => !!j && j.format === 'waypoint-character', () => null, () => {}, () => {}, {});
            const cF = v => XU.charToJson(viewU, { id: 'c_u', name: 'Ana', ownerId: 'p1', values: { f_str: v } }, null, { exported: 'x' }), upW = U.gmUploadRead(charU(), cF(14)), same = U.gmUploadRead(charU(), cF(10)), staleW = U.gmUploadRead(Object.assign(charU(), { sheetRev: 1 }), cF(10)), noR = U.gmUploadRead(charU(), { name: 'x' });
            S.registerReader(mkM('marked', 'other', { ui: { gmFile: (c, j, t, n) => { gotU.rd.push(['other', n]); return { error: 'no' }; } } })); S.registerReader(mkM('mine', undefined, { ui: { gmFile: (c, j, t, n) => { gotU.rd.push(['mine', c.id, t, n]); return { up: { own: true } }; } } }));
            let rdUp = null; try { rdUp = U.gmUploadRead(charU(), { name: 'x' }, 'text', 'a.json'); } finally { S.dropReader('marked'); S.dropReader('mine'); }
            // 1.6.4 (a system build's by-hand test of 2026-11-24): a character file with nothing in it says so, in place of "could not be read here"
            const UW = new Function('getActiveCampaign', 'systemOf', 'playerSystem', 'playerFinder', 'charFromJson', 'F', 'window', 'isCharFile', 'charById', 'toast', 'openReview', 'document', 'charFileWhy', slU + NL + 'return { gmUploadRead: gmUploadRead };')(() => campU, () => sysU, () => viewU, () => ({ find: () => null, findKey: () => null, lib: null }), XU.charFromJson, () => F, { wpSystemCore: S }, j => !!j && j.format === 'waypoint-character', () => null, () => {}, () => {}, {}, XU.charFileWhy);
            const emptyF = { format: 'waypoint-character', version: 1, name: 'A Waypoint character file', values: {} }, newerF = Object.assign(cF(14), { v: 9 }), noVF = Object.assign(cF(14)), wE = UW.gmUploadRead(charU(), emptyF), wN = UW.gmUploadRead(charU(), newerF); delete noVF.v; const wV = UW.gmUploadRead(charU(), noVF), wOk = UW.gmUploadRead(charU(), cF(14));
            check('1.6.4 a character file Waypoint cannot read says why: one with no values (the port test\'s bad file) says it holds none, one saved by a newer Waypoint VTT says to update, one with no version mark says it was not saved by Waypoint VTT\'s own Download; a good file and every other file are as before',
                /holds no character\u2019s values/.test(wE.error || '') && /newer Waypoint VTT/.test(wN.error || '') && /no version mark/.test(wV.error || '') && !!wOk.up && XU.charFileWhy(cF(14)) === '' && XU.charFileWhy({ name: 'x' }) === '' && XU.charFileWhy(null) === '' && XU.charFileWhy(Object.assign({}, emptyF, { v: 1, qnotes: [{ id: 'q_a', x: 'hi', at: 1 }] })) === ''
                && !/\u2014/.test([wE.error, wN.error, wV.error].join('')), JSON.stringify([wE, wN, wV]));
            check('1.6.0 the GM\'s own Upload: a Waypoint character file opens the Review with what it changes and nothing yet applied, its own entry; a file that changes nothing is said; an out-of-date character\'s file is marked so that applying it makes it current; any other file goes to the reader of this system that claims it, handed the very file, and with none it is said',
                !!upW.up && upW.up.own === true && upW.up.charId === 'c_u' && upW.up.changes.length === 1 && upW.up.changes[0].to === '14' && upW.up.changes[0].f === 'f_str' && upW.up.rev === undefined && same.error === 'Nothing to change: the sheet already matches that file.' && staleW.up.rev === true && staleW.up.changes.length === 0 && noR.error === 'That is not a Waypoint character file (.wpchar.json).'
                && rdUp.up.own === true && JSON.stringify(gotU.rd) === JSON.stringify([['mine', 'c_u', 'text', 'a.json']]), JSON.stringify([upW, same, staleW, noR, gotU]));
        }
        check('F3a the player\'s side: Make asks for a name (their table name to start with) and opens the sheet the host sends; Name… only while in the making; Done confirms (in the making: into play; unlocked: locks again) — each a client call answered by a toast; the head shows Done to the owner of an open character, Name… in the making only, Upload in the making only where the table lets them start from a file (Onboarding F4), Unlock/Lock to the GM on a finished player character',
            /n\.charMake\(String\(nm\), function\(a\) \{ if \(a\.error\) \{ toast\(a\.error\); return; \} if \(a\.charId\) openSheet\(a\.charId\); \}\);/.test(mkS) && /if \(!c \|\| !isClient\(\) \|\| c\.making !== 1 \|\| !n \|\| !n\.charName\) return;/.test(mkS)
            && /if \(!c \|\| !isClient\(\) \|\| !\(c\.making === 1 \|\| c\.unlocked === 1\) \|\| !n \|\| !n\.charDone\) return;/.test(mkS) && /showConfirm\(mk \?/.test(mkS)
            && /\(other && !inv \? 'It is kept \(you go on playing the character your GM gave you\)' : other \? 'It goes into play now \(the character you play now is kept\)' : 'It goes into play now'\)/.test(mkS) && /inv = c\.invited === 1/.test(mkS)
            && /other = Object\.keys\(cs\)\.some\(function\(k\) \{ var x = cs\[k\]; return x && x\.id !== id && x\.ownerId === me && !x\.npc && !x\.partial && x\.making !== 1; \}\);/.test(mkS) && /\(a\.kept \? nm \+ ' is finished and kept: you go on playing the character your GM gave you\.' : nm \+ ' is in play\.'\)/.test(mkS)
            && /\(c\.making === 1 \? ' · making' : c\.unlocked === 1 \? \(gm \? ' · open to its player' : ' · yours to fill in'\) : ''\)/.test(shF)
            && /var dnOn = isClient\(\) && own && !c\.partial && \(c\.making === 1 \|\| c\.unlocked === 1\);/.test(shF) && /nmB\.style\.display = isClient\(\) && own && !c\.partial && c\.making === 1 \? '' : 'none';/.test(shF)
            && /var upOn = gm \? canWrite\(\) && !c\.partial : isClient\(\) && own && !c\.partial && \(c\.making !== 1 \|\| fillOk\(\)\),[^\n]*upB\.style\.display = upOn \? '' : 'none';/.test(shF) && /if \(making && !fillOk\(\)\) \{ toast\('Starting a character from a file is not open at this table\.'\); return; \}/.test(shF) && /var ulOn = gm && !!c\.ownerId && !c\.npc && c\.making !== 1 && c\.review !== 1;/.test(shF) && /renderReviewBar\(c, camp, gm\);/.test(shF));
        const jcA = wbF.indexOf("  (function() {\n      var had = '', dismissed = false;"), jcB = wbF.indexOf('  })();', jcA) + 7;
        const card = o => {
            const els = {}; ['joinCard', 'joinCardStatus', 'joinCardMake', 'joinCardOpen', 'joinCardFaceBtn', 'joinCardToken'].forEach(id => { els[id] = { id, style: { display: /^joinCard(Make|Open|Token)?$/.test(id) ? 'none' : '' }, textContent: '' }; });
            const camp = Object.assign({ id: 'k', system: { fields: [] }, chars: {}, items: { m1: { id: 'm1', type: 'map', meta: { title: 'Dock' }, whiteboard: [] } } }, o.camp || {});
            if (o.wait) camp.items.m1.whiteboard.push({ id: 'w1', type: 'circle', waiting: 1, ownerId: 'u_a' });
            if (o.tok) camp.items.m1.whiteboard.push({ id: 't1', isChar: true, charName: 'Bo', ownerId: 'u_a' });
            const win = { wpNet: { active: true, role: o.role || 'client', myId: 'u_a', charToken() {} }, wpSystemCore: S, wpSheets: { startMaking() {}, openSheet() {} }, wpVtt: { rulesOn: k => !(k === 'sheets' && o.sheetsOff) } };
            new Function('window', 'document', 'getActiveCampaign', wbF.slice(jcA, jcB))(win, { getElementById: id => els[id] || null, addEventListener() {} }, () => camp);
            win.wpJoinCard.check();
            const seen = () => ({ on: els.joinCard.style.display === '', text: els.joinCardStatus.textContent, make: els.joinCardMake.style.display === '', token: els.joinCardToken.style.display === '', open: els.joinCardOpen.style.display === '' ? els.joinCardOpen.textContent : null, face: els.joinCardFaceBtn.style.display === '' });
            const first = seen(); win.wpJoinCard.show(); return { first, shown: seen(), has: win.wpJoinCard.has() };
        };
        const kW = card({ wait: true }), kInv = card({ wait: true, camp: { newPlayers: { create: 'invite' } } }), kMk = card({ wait: true, camp: { chars: { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_a', making: 1 } } } });
        const kOff = card({ camp: { newPlayers: { token: 'off' } } }), kRem = card({}), kHave = card({ camp: { chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a' } } } }), kTok = card({ tok: true, camp: { newPlayers: { token: 'off' } } });
        const kSheets = card({ sheetsOff: true, camp: { newPlayers: { token: 'off' } } }), kSheetsW = card({ sheetsOff: true, wait: true }), kNoSys = card({ camp: { system: null, newPlayers: { token: 'off' } } }), kSheetsTok = card({ sheetsOff: true, tok: true, camp: { newPlayers: { token: 'off' } } }), kGm = card({ role: 'host', wait: true }), kMkBare = card({ camp: { chars: { c_m: { id: 'c_m', name: 'Pax', ownerId: 'u_a', making: 1 } }, newPlayers: { token: 'off' } } });
        const NOCH = 'You don\u2019t have a character yet. Make one, or wait for your GM to give you one.';
        check('F3a the join card (run for real; F3b Just a token: beside Make where making is live, alone without sheets or a system, never on invite): with a waiting token it shows by itself — Make where making is live (not on invite), its face button; while making, Open <name> (no Make); with no waiting token (the rule gives none) it shows by itself with Make and no face button; after a Remove it waits to be asked (the chip\'s My character…); a player with a character, a token of their own (sheets off too), or the GM: nothing',
            kW.first.on && kW.first.make && kW.first.face && /Your token is waiting on Dock/.test(kW.first.text) && kInv.first.on && !kInv.first.make && /Move it about\. Your GM will give you a character\./.test(kInv.first.text)
            && kMk.first.on && !kMk.first.make && kMk.first.open === 'Open Pax' && /^You are making Pax/.test(kMk.first.text) && kMkBare.first.on && kMkBare.first.open === 'Open Pax' && !kMkBare.first.face
            && kOff.first.on && kOff.first.make && !kOff.first.face && kOff.first.text === NOCH && kOff.has && !kRem.first.on && kRem.has && kRem.shown.on && kRem.shown.text === NOCH
            && [kHave, kTok, kSheetsTok, kGm].every(k => !k.first.on && !k.shown.on && !k.has)
            && kW.first.token && !kInv.first.token && !kMk.first.token && kOff.first.token && kSheets.first.on && kSheets.first.token && !kSheets.first.make && kSheets.first.text === 'You don\u2019t have a character yet. Take a token of your own, or wait for your GM to give you one.'
            && kSheetsW.first.token && /Move it about, take a token of your own, or wait/.test(kSheetsW.first.text) && kNoSys.first.on && kNoSys.first.token && !kNoSys.first.make && jcA > 0 && /else if \(act === 'joinCard'\) \{ if \(window\.wpJoinCard\) window\.wpJoinCard\.show\(\); \}/.test(wbF)
            && /if \(isClientM && ownerId && ownerId === window\.wpNet\.myId && window\.wpJoinCard && window\.wpJoinCard\.has && window\.wpJoinCard\.has\(\)\) items\.push\(\{ act: 'joinCard'/.test(wbF), j([kW, kInv, kMk, kOff, kRem, kHave.first, kTok.first, kSheets.first, kGm.first, kMkBare.first]));
        const flA = wbF.indexOf('      if (hosting && camp.chars) list.forEach(function(c) {\n          var hit'), flB = wbF.indexOf('      });', flA) + 9;
        const flagRun = flA < 0 ? null : (() => { const list = [{ key: 'o:u_a', ownerId: 'u_a', charId: 'c_k' }, { key: 'o:u_b', ownerId: 'u_b', charId: 'c_b' }, { key: 'p:u_c', ownerId: 'u_c', noToken: true }, { key: 'o:u_d', ownerId: 'u_d', charId: 'c_d' }];
            const camp = { chars: { c_k: { id: 'c_k', name: 'Kit', ownerId: 'u_a' }, c_y: { id: 'c_y', name: 'Yul', ownerId: 'u_a', review: 1, made: 1 }, c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', unlocked: 1 }, c_c: { id: 'c_c', name: 'Cy', ownerId: 'u_c', making: 1 }, c_d: { id: 'c_d', name: 'Di', ownerId: 'u_d' }, c_n: { id: 'c_n', name: 'Npc', ownerId: 'u_d', npc: true, review: 1 } } };
            new Function('hosting', 'camp', 'list', wbF.slice(flA, flB))(true, camp, list); return list; })();
        check('F3a the GM\'s chips (the flags run for real): by the chip\'s player — one of theirs waiting for Keep it (even kept, with no token, while the chip is the one they play), one unlocked, one they are making; the tip names it; a class each, part of the redraw signature; the Give list and the dice picker never offer one in the making',
            flagRun && j(flagRun.map(c => [c.key, c.flag, c.flagName])) === j([['o:u_a', 'review', 'Yul'], ['o:u_b', 'unlocked', 'Bo'], ['p:u_c', 'making', 'Cy'], ['o:u_d', '', '']])
            && /return c\.key \+ \(c\.flag \? '~' \+ c\.flag \+ '~' \+ c\.flagName : ''\)/.test(wbF) && /c\.flag === 'review' \? '\. ' \+ \(c\.flagName \|\| 'A character'\) \+ ' is new: review it on its sheet'/.test(wbF) && /\(c\.flag \? ' party-' \+ c\.flag : ''\)/.test(wbF) && /!c\.npc && c\.making !== 1; \}\)/.test(wbF) && !/!c\.draft/.test(wbF)
            && /!c\.partial && !c\.npc && c\.making !== 1; \}\);/.test(fs.readFileSync(path.join(app, 'scripts', 'dice.js'), 'utf8')));
        const ioF = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8'), mainA = fs.readFileSync(path.join(app, 'scripts', 'main.js'), 'utf8');
        check('F3a the GM\'s own load and imports keep the marks (a reload never puts an unfinished character in play)', /cleanChar\(c\.chars\[id\], c\.system, \{ state: 'host' \}\)/.test(ioF) && (mainA.match(/cleanChar\(ic\.chars\[id\], (ic|existing)\.system, \{ state: 'host' \}\)/g) || []).length === 2 && !/cleanChar\(ic\.chars\[id\], (ic|existing)\.system\)/.test(mainA));
        const ixF = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('F3a Help says it (both sides), and the head, the review bar and the join card have their places',
            /<b>Make a character&hellip;<\/b> on your card starts a character of your own\. When there is no waiting token, <b>My character&hellip;<\/b> on your own chip does the same\./.test(ixF) && /No other player sees the character until you press <b>Done<\/b>\. Your GM can\./.test(ixF) && /If you gave them a character meanwhile, that one stays in play and theirs is kept\./.test(ixF) && /A player can also make a character of their own/.test(ixF)
            && /id="sheetDone"/.test(ixF) && /id="sheetName"/.test(ixF) && /id="sheetUnlock"/.test(ixF) && /<div id="sheetReviewBar" class="sheet-review-bar" role="status" style="display:none;"><\/div><div id="sheetStaleBar" class="sheet-review-bar sheet-stale-bar" role="status" style="display:none;"><\/div><div id="sheetBody"/.test(ixF) && /id="joinCardMake"/.test(ixF) && /id="joinCardOpen"/.test(ixF));
    }
    /* ---- Grid-shaped incoming tokens (owner, 2026-09-27) ---- */
    {
        const mp = g => ({ id: 'm', type: 'map', meta: g === undefined ? {} : { gridType: g } });
        check('grid shape: a map\'s grid is hex, square or off (missing, not a string, unknown, a prototype name: off); its one cell is a hexagon 60x52, a square 50x50, a circle 60x52',
            S.mapGridOf(mp('hex')) === 'hex' && S.mapGridOf(mp('square')) === 'square' && ['off', 'Hex', 'constructor', '__proto__', 5, undefined].every(g => S.mapGridOf(mp(g)) === 'off') && S.mapGridOf(null) === 'off' && S.mapGridOf({ meta: 'hex' }) === 'off'
            && j(S.tokenCell(mp('hex'))) === j({ type: 'hexagon', w: 60, h: 52 }) && j(S.tokenCell(mp('square'))) === j({ type: 'rect', w: 50, h: 50 }) && j(S.tokenCell(mp())) === j({ type: 'circle', w: 60, h: 52 }) && j(S.tokenCell(null)) === j({ type: 'circle', w: 60, h: 52 }));
        const sh = (tok, g) => { const t = JSON.parse(j(tok)); const r = S.shapeStandIn(t, mp(g)); return [r, t]; };
        {   // 1.6.2 (backlog 141): a picture made a token fits one cell of the map's grid, its center kept, and takes the cell's outline
            const one = (tok, g) => { const t = JSON.parse(j(tok)); const r = S.tokenOneCell(t, mp(g)); return [r, t]; };
            const big = { type: 'image', src: '/saves/images/a.png', isChar: true, x: 100, y: 100, w: 300, h: 200 };
            const [rh, th] = one(big, 'hex'), [rs, ts] = one(big, 'square'), [ro, to] = one(big, 'off'), [rn, tn] = one(Object.assign({}, big, { isChar: false }), 'square');
            const [rw, tw] = one(Object.assign({}, big, { waiting: true }), 'square'), [rl, tl] = one(Object.assign({}, big, { locked: true }), 'square'), [rc, tc] = one({ type: 'circle', isChar: true, x: 0, y: 0, w: 300, h: 300 }, 'square');
            const [ra, ta] = one(Object.assign({}, big, { w: 50, h: 50, x: 75, y: 75, shape: 'rect' }), 'square');
            check('a picture ticked Is Character fits one cell of a hex or square grid, its center kept, with the cell as its outline; no grid, a plain shape, a waiting or locked token, one that is no token, and one already a cell are left as they are (backlog 141)',
                rh === true && th.w === 60 && th.h === 52 && th.shape === 'hexagon' && th.x === 220 && th.y === 174 && rs === true && ts.w === 50 && ts.h === 50 && ts.shape === 'rect' && ts.x === 225 && ts.y === 175
                && ro === false && j(to) === j(big) && rn === false && j(tn) === j(Object.assign({}, big, { isChar: false })) && rw === false && rl === false && rc === false && tc.w === 300 && ra === false && ta.x === 75
                && S.tokenOneCell(null, mp('hex')) === false && S.tokenOneCell({ type: 'image', isChar: true }, mp('hex')) === false, j([th, ts, to, ta]));
        }
        const c1 = { id: 't', isChar: true, type: 'circle', x: 100, y: 200, w: 60, h: 52 };
        const [rH, tH] = sh(c1, 'hex'), [rS, tS] = sh(c1, 'square'), [rO, tO] = sh(c1, 'off'), [rW, tW] = sh({ id: 'w', waiting: 1, type: 'circle', x: 100, y: 200, w: 60, h: 52 }, 'square'), [rB, tB] = sh(tS, 'hex');
        check('grid shape: a plain one-cell token takes the cell (hex: a hexagon 60x52, square: a square 50x50 — its center kept; no grid: the circle it was, unchanged); a waiting token too; back from square to hex it is a hexagon again',
            rH && tH.type === 'hexagon' && tH.w === 60 && tH.h === 52 && tH.x === 100 && tH.y === 200 && rS && tS.type === 'rect' && tS.w === 50 && tS.h === 50 && tS.x === 105 && tS.y === 201 && rO === false && j(tO) === j(c1)
            && rW && tW.type === 'rect' && tW.w === 50 && rB && tB.type === 'hexagon' && tB.w === 60 && tB.x === 100 && tB.y === 200, j([tH, tS, tO, tW, tB]));
        const p1 = { id: 'p', isChar: true, type: 'image', src: '/saves/images/portraits/portrait-c_1-a.png', x: 0, y: 0, w: 44, h: 44 };
        const [rPH, tPH] = sh(p1, 'hex'), [rPS, tPS] = sh(p1, 'square'), [rPO, tPO] = sh(p1, 'off'), [, tBun] = sh({ id: 'b', isChar: true, type: 'image', src: '/saves/images/tutorial/orc_hex.png', w: 60, h: 52 }, 'square'), [, tAss] = sh({ id: 'b', isChar: true, type: 'image', src: 'assets/tutorial/king_hex.png', w: 60, h: 52 }, 'hex'), [, tEvil] = sh({ id: 'b', isChar: true, type: 'image', src: '/saves/images/tutorial/evil_hex.png', w: 60, h: 52 }, 'hex');
        check('grid shape: a picture token keeps its art and takes the cell as its outline (shape) and, on a grid, its size — with no grid its own size, a round outline; the app\'s own bundled hexagon art becomes the bundled square twin every install ships (a name off the bundled list is left)',
            rPH && tPH.type === 'image' && tPH.shape === 'hexagon' && tPH.w === 60 && tPH.h === 52 && tPH.src === p1.src && rPS && tPS.shape === 'rect' && tPS.w === 50 && rPO && tPO.shape === 'circle' && tPO.w === 44 && tPO.h === 44 && tPO.x === 0
            && tBun.src === 'assets/tutorial/orc_sq.jpg' && tBun.shape === 'rect' && tAss.src === 'assets/tutorial/king_sq.jpg' && tAss.shape === 'hexagon' && tEvil.src === '/saves/images/tutorial/evil_hex.png', j([tPH, tPS, tPO, tBun, tAss, tEvil]));
        const left = [{ id: 'big', isChar: true, type: 'hexagon', x: 0, y: 0, w: 120, h: 104 }, { id: 'sq2', isChar: true, type: 'rect', x: 0, y: 0, w: 100, h: 100 }, { id: 'sq65', isChar: true, type: 'rect', x: 0, y: 0, w: 65, h: 65 }, { id: 'pic2', isChar: true, type: 'image', src: '/saves/images/x.png', x: 0, y: 0, w: 100, h: 100 }, { id: 'd', isChar: true, type: 'diamond', x: 0, y: 0, w: 60, h: 52 }, { id: 'n', type: 'circle', x: 0, y: 0, w: 60, h: 52 }, { id: 'i', isChar: true, type: 'image', src: '', w: 60, h: 52 }, { id: 'tr', isChar: true, type: 'trigger', shape: 'circle', w: 60, h: 52 }];
        check('grid shape: left alone, on either grid — a token the GM sized up (past one cell: a 2x2 square 100x100, 65x65, a 120x104 hexagon, a 100x100 picture), a diamond, an item that is no token, a picture token with no picture, a trigger; nothing that is not an object',
            left.every(tok => ['square', 'hex'].every(g => { const [r, t] = sh(tok, g); return r === false && j(t) === j(tok); })) && S.shapeStandIn(null, mp('hex')) === false && S.shapeStandIn('x', mp('hex')) === false);
        const [rAgain] = sh(tH, 'hex'), noPos = { isChar: true, type: 'circle', w: 60, h: 52 }, [, tNoPos] = sh(noPos, 'square');
        check('grid shape: a token already in its cell\'s shape reports no change; a token with no position yet gets none (its caller places it)', rAgain === false && tNoPos.type === 'rect' && !('x' in tNoPos) && !('y' in tNoPos));
        const netG = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, NL), shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), wbG = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL);
        const inG = fs.readFileSync(path.join(app, 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL), dmG = fs.readFileSync(path.join(app, 'scripts', 'datamap.js'), 'utf8').replace(/\r\n/g, NL), cssG = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, NL);
        const SEATR = (v, m) => new RegExp('if \\(window\\.wpSeatCell\\) window\\.wpSeatCell\\(' + v + ', ' + m + '\\); else if \\(window\\.wpSeatHex\\) window\\.wpSeatHex\\(' + v + ', ' + m + '\\);');
        check('grid shape: every place the app brings a token onto a map shapes it for THAT map and seats it in a cell — a new or copied player token (the resolver, Bring, a GM walk through a portal), the GM\'s NPC through a portal, a waiting token (new, moved in, or its map\'s grid changed), Just a token (new, or the waiting token it becomes)',
            /if \(nw && S\.shapeStandIn\) S\.shapeStandIn\(nw, map\);/.test(netG) && SEATR('nw', 'map').test(netG) && /if \(copied && S\.shapeStandIn\) S\.shapeStandIn\(tok, map\);/.test(netG) && SEATR('tok', 'map').test(netG)
            && /var Sd = SC\(\); if \(Sd && Sd\.shapeStandIn\) Sd\.shapeStandIn\(mine, dest\);/.test(netG) && /var Sn = SC\(\); if \(Sn && Sn\.shapeStandIn\) Sn\.shapeStandIn\(there, dest\);/.test(netG)
            && /var cW = S\.tokenCell \? S\.tokenCell\(map\) : \{ type: 'circle', w: 60, h: 52 \};/.test(netG) && /if \(keep && S\.shapeStandIn\) S\.shapeStandIn\(w, map\);/.test(netG) && /var reW = S\.shapeStandIn \? S\.shapeStandIn\(keep\.w, map\) : false;/.test(netG) && SEATR('w', 'map').test(netG)
            && /var cJ = SJ\.tokenCell \? SJ\.tokenCell\(mJ\) : \{ type: 'circle', w: 60, h: 52 \};/.test(netG) && /if \(SJ\.shapeStandIn && SJ\.shapeStandIn\(tokJ, mJ\)\) \{/.test(netG) && !/tokJ\.type = 'circle';/.test(netG)
            && /type: w\.type === 'hexagon' \|\| w\.type === 'rect' \? w\.type : 'circle', waiting: 1/.test(netG));
        check('grid shape: the GM\'s own paths too — the roster stand-in (made, a portrait set or cleared), the cast, a character brought over from another map; a character\'s picture and Just a token\'s picture take the cell as outline; a bundled picture is one square picture (portrait and token art)',
            /window\.wpSystemCore\.shapeStandIn\(tok, map\);/.test(inG) && SEATR('tok', 'map').test(inG) && /t\.src = data\.url; if \(window\.wpSystemCore && window\.wpSystemCore\.shapeStandIn && window\.wpSystemCore\.shapeStandIn\(t, activeMap\)\)/.test(inG) && /t\.type = 'circle'; delete t\.src; delete t\.shape; t\.color = '#4db3d3'; if \(window\.wpSystemCore && window\.wpSystemCore\.shapeStandIn && window\.wpSystemCore\.shapeStandIn\(t, activeMap\)\)/.test(inG)
            && /window\.wpSystemCore\.shapeStandIn\(it, am\);/.test(wbG) && SEATR('it', 'am').test(wbG) && /am\.whiteboard\.push\(tok\); if \(window\.wpSystemCore && window\.wpSystemCore\.shapeStandIn\) window\.wpSystemCore\.shapeStandIn\(tok, am\); \}/.test(wbG) && SEATR('tok', 'am').test(wbG)
            && /var fs2 = \[name \+ '_sq\.jpg'\];/.test(shG) && /return \{ portrait: u\[0\], token: u\[0\] \};/.test(shG) && /window\.wpSystemCore\.shapeStandIn\(w, t\.m\)\) \{ if \(window\.wpSeatCell\) window\.wpSeatCell\(w, t\.m\);/.test(shG) && /window\.wpSystemCore\.shapeStandIn\(w, m\)\) \{ if \(window\.wpSeatCell\) window\.wpSeatCell\(w, m\);/.test(shG)
            && (inG.match(/window\.wpSystemCore\.shapeStandIn\(t, activeMap\)\) \{ if \(window\.wpSeatCell\) window\.wpSeatCell\(t, activeMap\);/g) || []).length === 2);
        const fiA = wbG.indexOf('  // [lookcheck:fitpic-start]'), fiB = wbG.indexOf('// One shared builder so the live draw preview');
        const fitRun = (() => {
            const mk = (g, tok) => { const am = { id: 'am', type: 'map', meta: { gridType: g }, whiteboard: [tok] }, st = { gridType: g }, toasts = []; const api = new Function('state', 'toast', 'save', 'render', 'getActiveMap', 'window', wbG.slice(fiA, fiB) + '\nreturn { fitToGrid, fitWouldChange };')(st, t => toasts.push(t), () => {}, () => {}, () => am, { wpSystemCore: S, wpSeatHex: () => false }); return { api, tok, toasts }; };
            const hexBig = mk('hex', { id: 'a', isChar: true, type: 'circle', x: 0, y: 0, w: 120, h: 104 }), sq70 = mk('square', { id: 'b', isChar: true, type: 'circle', x: 0, y: 0, w: 70, h: 70 }), picHex = mk('hex', { id: 'c', isChar: true, type: 'image', src: '/saves/images/x.png', x: 0, y: 0, w: 120, h: 104 }), sq2 = mk('square', { id: 'd', isChar: true, type: 'circle', x: 0, y: 0, w: 100, h: 100 });
            const oneHex = mk('hex', { id: 'e', isChar: true, type: 'circle', x: 0, y: 0, w: 60, h: 52 }), wouldBefore = oneHex.api.fitWouldChange([oneHex.tok]);   // already one seated cell: only its shape would change
            [hexBig, sq70, picHex, sq2, oneHex].forEach(r => r.api.fitToGrid([r.tok]));
            return [fiA > 0, hexBig.tok.type === 'hexagon' && hexBig.tok.w === 60 && !hexBig.api.fitWouldChange([hexBig.tok]), sq70.tok.type === 'rect' && sq70.tok.w === 50 && !sq70.api.fitWouldChange([sq70.tok]), picHex.tok.shape === 'hexagon' && picHex.tok.w === 60 && !picHex.api.fitWouldChange([picHex.tok]), sq2.tok.type === 'circle' && sq2.tok.w === 100 && !sq2.api.fitWouldChange([sq2.tok]), wouldBefore === true && oneHex.tok.type === 'hexagon' && j(oneHex.toasts) === j(['Fitted 1 item to the hex grid.']) && !oneHex.api.fitWouldChange([oneHex.tok])];
        })();
        check('grid shape: Fit to grid (run for real) — one press fits a token and, now one cell, gives it the cell\'s shape (a sized-up circle on hex a hexagon, a 70x70 on a square grid a square, a big picture on hex cut to a hexagon), and then it reads Already aligned; a token already one seated cell is offered and fitted for its shape alone ("Fitted 1 item"); a 2x2 (100x100) token on a square grid keeps its shape',
            fitRun.every(Boolean), j(fitRun));
        const scA = dmG.indexOf('  window.wpSeatCell = function(item, map) {'), scB = dmG.indexOf('\n  };\n', scA) + 5;
        const seatCell = (item, map, st) => { const seats = []; const win = { wpSeatHex: (it, m) => { seats.push(m.id); return true; } }; new Function('window', 'getActiveMap', 'state', dmG.slice(scA, scB))(win, () => map, st || { gridType: 'off' }); const r = win.wpSeatCell(item, map); return [r, item, seats]; };
        const [sc6, it6] = seatCell({ isChar: true, x: 1010, y: 990, w: 100, h: 100 }, mp('square')), [sc7] = seatCell({ isChar: true, x: 1000, y: 1000, w: 100, h: 100 }, mp('square')), [sc1, it1] = seatCell({ isChar: true, x: 107, y: 213, w: 50, h: 50 }, mp('square')), [sc2, , seats2] = seatCell({ isChar: true, x: 1, y: 1, w: 60, h: 52 }, mp('hex')), [sc3, it3] = seatCell({ isChar: true, x: 107, y: 213, w: 50, h: 50 }, mp('off')), [sc4, it4] = seatCell({ x: 107, y: 213, w: 50, h: 50 }, mp('square')), [sc5, it5] = seatCell({ waiting: 1, x: 100, y: 200, w: 50, h: 50 }, mp('square'));
        {   // 1.5.6: a token's facing arrow turns it only while that token is selected (whiteboard.js arrowTurnable, sliced and run for real)
            const wbAT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').split('\r\n').join('\n');
            const aA = wbAT.indexOf('  // [systemcheck:turnable-start]'), aB = wbAT.indexOf('  // [systemcheck:turnable-end]');
            const AT = new Function("'use strict';\n" + wbAT.slice(aA, aB) + '\nreturn arrowTurnable;')();
            const tk = { id: 't1', ownerId: 'u_a' }, pl = { active: true, role: 'client', myId: 'u_a' }, sel = { selWbId: 't1' }, other = { selWbId: 't2' }, none = { selWbId: null };
            const R = [AT(tk, null, sel), AT(tk, null, other), AT(tk, { active: true, role: 'host' }, sel), AT(tk, pl, sel), AT(tk, pl, other), AT(tk, pl, none),
                AT({ id: 't1', ownerId: 'u_b' }, pl, sel), AT({ id: 't1', ownerId: 'u_a', locked: true }, pl, sel), AT(tk, Object.assign({ paused: true }, pl), sel), AT(tk, Object.assign({ selfPaused: true }, pl), sel), AT(null, pl, sel), AT(tk, pl, null)];
            check('1.5.6 a token\'s facing arrow turns it only while that token is selected (arrowTurnable, run for real): the GM\'s selected token as before, never another; a player\'s own token only while selected, never another\'s, a locked one or on a paused table; and the render asks it, the pointer listener still taking only a turnable arrow, the style sheet giving an arrow that is not turnable no press',
                j(R) === j([true, false, true, true, false, false, false, false, false, false, false, false]) && wbAT.includes("fw.classList.toggle('turnable', arrowTurnable(item, window.wpNet, state));") && wbAT.includes("var ar = e.target.closest('.token-front.turnable');")
                && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8').includes('.token-front { position: absolute; inset: 0; pointer-events: none; z-index: 2; }'), j(R));
        }
        {   // 1.5.6: a turn steps to the grid's sides by the snap rule a drop follows (whiteboard.js facingStep, sliced and run for real)
            const wbFS = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8').split('\r\n').join('\n');
            const fA = wbFS.indexOf('  function facingStepFor('), fB = wbFS.indexOf('  // [systemcheck:facingstep-end]');
            const fsRun = (st, win, item) => new Function('state', 'window', "'use strict';\n" + wbFS.slice(fA, fB) + '\nreturn facingStep;')(st, win)(item);
            const tokC = { isChar: true }, ON = { snap: true, snapMode: 'grid', gridType: 'hex' }, OFF = { snap: false, snapMode: 'grid', gridType: 'hex' };
            const FS = [fsRun(OFF, { wpSnapOn: () => true }, tokC), fsRun(ON, { wpSnapOn: () => false }, tokC), fsRun({ snap: true, snapMode: 'both', gridType: 'square' }, { wpSnapOn: () => true }, tokC),
                fsRun(ON, {}, tokC), fsRun(OFF, {}, tokC), fsRun({ snap: true, snapMode: 'items', gridType: 'hex' }, {}, tokC), fsRun(OFF, { wpSnapOn: () => true }, { isChar: false }), fsRun({ snap: true, snapMode: 'grid', gridType: 'off' }, { wpSnapOn: () => true }, tokC), fsRun(ON, { wpSnapOn: () => 'yes' }, tokC)];
            check('1.5.6 a turn follows the snap rule a drop follows (facingStep, run for real): on a player\'s app the table\'s Snap decides the facing step whatever the player\'s own magnet says, on and off; the GM\'s own Snap to the grid or to both as before; with no snap rule at hand this screen\'s Snap as before; a token that is no character and a map with no grid turn freely; only true counts',
                j(FS) === j([60, 0, 90, 60, 0, 0, 0, 0, 0]), j(FS));
        }
        {   // the snap rule (the owner, 2026-09-29): Snap decides where a token dropped by hand lands, on every grid; a player's drop follows the GM's Snap
            const srA = dmG.indexOf('  // [systemcheck:snaprule-start]'), srB = dmG.indexOf('  // [systemcheck:snaprule-end]');
            const srRun = (st, net, item, map) => { const hexes = []; const win = { wpNet: net, wpSeatHex: (it, m, force) => { hexes.push([m && m.id, force === true]); it.x = -1; return true; } }; new Function('window', 'getActiveMap', 'state', dmG.slice(srA, srB))(win, () => map || mp('off'), st); const api = { on: win.wpSnapOn(), dot: it => [win.wpSeatDot(it), it.x, it.y], drop: (it, m, force) => [win.wpSeatDrop(it, m, force), it.x, it.y], sized: it => win.wpHexCellSized(it), seatSized: (it, m) => [win.wpSeatSized(it, m), it.x] }; api.hexes = hexes; return api; };
            const S_ON = { snap: true, snapMode: 'grid', gridType: 'off' }, S_OFF = { snap: false, snapMode: 'grid', gridType: 'off' };
            const onGot = [srRun(S_ON).on, srRun({ snap: true, snapMode: 'both' }).on, srRun({ snap: true, snapMode: 'items' }).on, srRun(S_OFF).on,
                srRun(S_OFF, { active: true, role: 'client', tableSnapOn: true }).on, srRun(S_ON, { active: true, role: 'client', tableSnapOn: false }).on, srRun(S_ON, { active: true, role: 'client', tableSnapOn: 'yes' }).on, srRun(S_OFF, { active: false, role: 'client', tableSnapOn: true }).on, srRun(S_ON, { active: true, role: 'host' }).on];
            check('snap rule: wpSnapOn (datamap.js, run for real) — Snap on to the grid or to both, not to other items only; a connected player follows the GM\'s Snap as the table was told it (true only), whatever their own; off the table, their own',
                srA > 0 && srB > srA && j(onGot) === j([true, true, false, false, true, false, false, false, true]), j(onGot));
            {   // 1.6.2, backlog 38 fold 2: range and a token's one cell on a map of its own cell (systemcore rangeDist, tokenCell, shapeStandIn)
                const SCL = await import(require('./srcjoin').freshUrl('systemcore.js', 'lat'));
                const sqM = { meta: { gridType: 'square', cell: { size: 70 }, cellValue: 5, cellUnit: 'ft' } }, hxM = { meta: { gridType: 'hex', cell: { size: 104 }, cellValue: 1, cellUnit: 'yd' } }, plain = { meta: { gridType: 'square', cellValue: 5, cellUnit: 'ft' } };
                const dSq = SCL.rangeDist(null, sqM, { x: 35, y: 35 }, { x: 315, y: 35 }, 'ft'), dPl = SCL.rangeDist(null, plain, { x: 25, y: 25 }, { x: 225, y: 25 }, 'ft');
                const dHx = SCL.rangeDist(null, hxM, { x: 30, y: 0 }, { x: 30, y: 312 }, 'yd');
                const tc = [SCL.tokenCell(sqM), SCL.tokenCell(hxM), SCL.tokenCell(plain)];
                const tok = { isChar: true, type: 'circle', x: 0, y: 0, w: 70, h: 70 }; SCL.shapeStandIn(tok, sqM);
                check('a map with its own cell counts range and sizes a token by it (backlog 38): 280 px on 70 px squares is 4 squares, 20 ft, as 200 px on today\'s 50 px squares is; three 104 px hex rows down a column are 3 hexes; one cell is a 70 px square or a hex 120 by 104; a token of 70 px is one cell there and takes the cell\'s shape',
                    dSq === 20 && dPl === 20 && dHx === 3 && j(tc) === j([{ type: 'rect', w: 70, h: 70 }, { type: 'hexagon', w: 120, h: 104 }, { type: 'rect', w: 50, h: 50 }]) && tok.type === 'rect' && tok.w === 70, j([dSq, dPl, dHx, tc, tok]));
            }
            {   // 1.6.2, backlog 38 fold 2: a map with its own cell seats a drop on that lattice (datamap.js latticeOf, run for real with the real fogcore)
                const FCL = await import(url('fogcore.js') + '?lat'), dmL = dmG.slice(srA, srB);
                const run = (map, item) => { const win = { wpNet: null, wpFogCore: FCL }; win.wpSeatHex = (it) => false; new Function('window', 'getActiveMap', 'state', dmL)(win, () => map, { snap: true, snapMode: 'grid', gridType: map.meta.gridType }); return { got: win.wpSeatDrop(item, map), item: item, lat: win.wpLatticeOf(map) }; };
                const own = run({ meta: { gridType: 'square', cell: { size: 70, ox: 5, oy: 60 } } }, { isChar: true, x: 100, y: 100, w: 70, h: 70 });
                const plain = run({ meta: { gridType: 'square' } }, { isChar: true, x: 112, y: 88, w: 50, h: 50 });
                check('a map with its own cell (backlog 38): a drop by hand lands on that lattice, its size and its origin; a map that sets none on today\'s 50 px lattice, as before',
                    own.got === true && own.item.x === 75 && own.item.y === 130 && j(own.lat) === j({ type: 'square', size: 70, ox: 5, oy: 60 }) && plain.item.x === 100 && plain.item.y === 100 && j(plain.lat) === j({ type: 'square', size: 50 }), j([own, plain]));
            }
            const dotGot = [srRun(S_ON).dot({ x: 107, y: 213, w: 50, h: 50 }), srRun(S_ON).dot({ x: 1, y: 1, w: 60, h: 52 }), srRun(S_ON).dot({ x: 1010, y: 990, w: 100, h: 100 }), srRun(S_ON).dot({ x: 100, y: 200, w: 50, h: 50 })];
            check('snap rule: wpSeatDot — a one-cell token\'s center onto the nearest dot of a gridless map\'s background (every 50 px, at 25), a sized-up one\'s corner on the lattice; one already there does not move',
                j(dotGot) === j([[true, 100, 200], [true, -5, -1], [true, 1000, 1000], [false, 100, 200]]), j(dotGot));
            const tk = (x, y, more) => Object.assign({ isChar: true, x: x, y: y, w: 50, h: 50 }, more || {});
            const offR = srRun(S_OFF), dropOff = [offR.drop(tk(107, 213), mp('square')), offR.drop(tk(107, 213), mp('hex')), offR.drop(tk(107, 213), mp('off'))];
            const onR = srRun(S_ON), dropOn = [onR.drop(tk(130, 230), mp('square')), onR.drop(tk(107, 213), mp('hex')), onR.drop(tk(107, 213), mp('off')), onR.drop(tk(107, 213), mp(undefined)), onR.drop({ type: 'rect', x: 107, y: 213, w: 50, h: 50 }, mp('square')), onR.drop(tk(107, 213, { isChar: false, waiting: true }), mp('square')), onR.drop(tk(100, 200), mp('square'))];
            const fitR = srRun(S_OFF), dropFit = [fitR.drop({ type: 'image', x: 107, y: 213, w: 50, h: 50 }, mp('square'), true), fitR.drop(tk(107, 213), mp('hex'), true), fitR.drop(tk(107, 213), mp('off'), true)];
            const actR = srRun(Object.assign({}, S_ON, { gridType: 'square' }), undefined, undefined, mp(undefined)), dropAct = actR.drop(tk(1, 1, { w: 60, h: 52 }), null);
            check('snap rule: wpSeatDrop — Snap off, a token lands where it was dropped on every grid (hex too); Snap on, on a square grid on the lattice, on hex in its cell (wpSeatHex), with no grid on a dot; only a token (a character or a waiting one) unless it is fitted to the grid, which seats Snap or not (on hex forced; with no grid nothing to fit to); the active map\'s grid when none is given',
                j(dropOff) === j([[false, 107, 213], [false, 107, 213], [false, 107, 213]]) && offR.hexes.length === 0
                && j(dropOn) === j([[true, 150, 250], [true, -1, 213], [true, 100, 200], [true, 100, 200], [false, 107, 213], [true, 100, 200], [false, 100, 200]]) && j(onR.hexes) === j([['m', false]])
                && j(dropFit) === j([[true, 100, 200], [true, -1, 213], [false, 107, 213]]) && j(fitR.hexes) === j([['m', true]]) && j(dropAct) === j([true, 0, 0]), j([dropOff, dropOn, onR.hexes, dropFit, fitR.hexes, dropAct]));
            // a picture or a plain shape the size of ONE hex cell seats in its cell, by its center (the owner, 2026-10-03: it sat 15 px off in x, its corner on a
            // hex vertex): wpHexCellSized and wpSeatSized, run for real
            const SZ = srRun(S_ON), szOf = (w, h, more) => SZ.sized(Object.assign({ type: 'image', x: 0, y: 0, w: w, h: h }, more || {}));
            const sizesIn = [[60, 52], [52, 52], [60, 60], [50, 50], [64, 64], [39, 39], [39, 64], [64, 39]].map(s => szOf(s[0], s[1])), sizesOut = [[38, 52], [60, 38], [65, 52], [60, 65], [60, 6], [6, 52], [120, 104], [0, 0], [NaN, 52], [60, Infinity], ['60', '52']].map(s => szOf(s[0], s[1]));
            const kindsIn = ['image', 'rect', 'circle', 'diamond'].map(t => szOf(60, 52, { type: t })), kindsOut = ['text', 'path', 'trigger', 'light', 'hexagon', undefined].map(t => szOf(60, 52, { type: t })), noPiece = [SZ.sized(null), SZ.sized(undefined), SZ.sized({ type: 'image' })];
            const seatS = (st, m, it) => { const R = srRun(st); return [R.seatSized(it, m), R.hexes]; }, pic = (w, h) => ({ id: 'pc', type: 'image', x: 100, y: 200, w: w, h: h });
            const seatGot = [seatS(S_ON, mp('hex'), pic(60, 52)), seatS(S_OFF, mp('hex'), pic(60, 52)), seatS(S_ON, mp('square'), pic(60, 52)), seatS(S_ON, mp('off'), pic(60, 52)), seatS(S_ON, mp('hex'), pic(120, 104)), seatS(S_ON, mp('hex'), pic(60, 6))];
            const wbR = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL);
            check('snap rule: a picture or a plain shape the size of one hex cell (wpHexCellSized, run for real) — 39 to 64 px each way, a picture, a rectangle, a circle or a diamond, turned or not; a bar thinner than that, anything larger, a size that is no number, a text, a pen line, a trigger and a light are not; resized to that size on a hex map with Snap on it seats in its cell by its center (wpSeatSized: forced, as a fitted piece), and nowhere else — Snap off, a square map, no grid, a larger piece or a bar stay where they are; the drop of such a piece seats it as a token\'s does (it used to put its corner on a hex vertex, 15 px off in x), the others in the drag following it; a resize of one piece asks, a group resize never',
                sizesIn.every(v => v === true) && sizesOut.every(v => v === false) && kindsIn.every(v => v === true) && kindsOut.every(v => v === false) && noPiece.every(v => v === false) && szOf(60, 52, { rot: 30 }) === true
                && j(seatGot) === j([[[true, -1], [['m', true]]], [[false, 100], []], [[false, 100], []], [[false, 100], []], [[false, 100], []], [[false, 100], []]])
                && dmG.includes("var cellRef = snapOn && window.wpHexCellSized(item);") && /if \(modeStr === 'visual' && state\.gridType === 'hex' && \(cellRef \|\| multiDrag\.some\(function\(md\) \{ return md\.item\.gridFit \|\| \(snapOn && \(md\.item\.isChar \|\| md\.item\.waiting \|\| md\.item\.type === 'hexagon' \|\| md\.item\.shape === 'hexagon'\)\); \}\)\)\) \{/.test(dmG)
                && dmG.includes("var refMd = multiDrag.find(function(md) { return md.item === item && (cellRef || isHexy(item)); }) || multiDrag.find(function(md) { return isHexy(md.item); });")
                && wbR.includes("if (!groupMembers && window.wpSeatSized && window.wpSeatSized(item)) {") && (wbR.match(/wpSeatSized\(/g) || []).length === 1, j([sizesIn, sizesOut, kindsIn, kindsOut, noPiece, seatGot]));
            const wbS = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL);
            check('snap rule (source): the drag release asks wpSnapOn once — on hex a token, a hex shape or a fitted item seats only with Snap on (a fitted one always), a square grid with Snap on or a fitted item, a gridless map\'s tokens onto dots with Snap on (the rest of the drag following by the same correction); every Snap switch tells the table',
                /var snapOn = window\.wpSnapOn\(\), fitDrag = multiDrag\.some\(function\(md\) \{ return md\.item\.gridFit; \}\);/.test(dmG)
                && /state\.gridType === 'hex' && \(cellRef \|\| multiDrag\.some\(function\(md\) \{ return md\.item\.gridFit \|\| \(snapOn && \(md\.item\.isChar \|\| md\.item\.waiting \|\| md\.item\.type === 'hexagon' \|\| md\.item\.shape === 'hexagon'\)\); \}\)\)\) \{/.test(dmG)
                && /var isHexy = function\(it\) \{ return it\.gridFit \|\| \(snapOn && \(it\.isChar \|\| it\.waiting \|\| it\.type === 'hexagon' \|\| it\.shape === 'hexagon'\)\); \};/.test(dmG)
                && /\} else if\(\(snapOn \|\| fitDrag\) && modeStr === 'visual' && state\.gridType && state\.gridType !== 'off'\)\{/.test(dmG)
                && /\} else if \(snapOn && modeStr === 'visual' && \(!state\.gridType \|\| state\.gridType === 'off'\) && multiDrag\.some\(function\(md\) \{ return md\.item\.isChar \|\| md\.item\.waiting; \}\)\) \{/.test(dmG) && (dmG.match(/window\.wpSeatDot\(/g) || []).length === 3
                && /syncDataSnap\(\);\n\s*if \(window\.wpNet && window\.wpNet\.syncSnap\) window\.wpNet\.syncSnap\(\);/.test(dmG) && (wbS.match(/if \(window\.wpNet && window\.wpNet\.syncSnap\) window\.wpNet\.syncSnap\(\);/g) || []).length === 2 && !/always center into cells/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        }
        {
            const ioS = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, NL);
            check('snap rule (source): an arrow-key nudge follows Snap — on, a hex token hops cell to cell and a token on a square grid or a map with no grid one cell (one dot) at a time, seated, one cell of the map at its own cell size where it has one (backlog 38, moved on purpose); off, every item moves by pixels',
                /var snapN = window\.wpSnapOn \? window\.wpSnapOn\(\) : !!state\.snap;/.test(ioS) && /var hexToken = snapN && state\.gridType === 'hex' && \(it\.isChar \|\| it\.type === 'hexagon' \|\| it\.shape === 'hexagon'\);/.test(ioS)
                && /\} else if \(snapN && \(it\.isChar \|\| it\.waiting\) && window\.wpSeatDrop\) \{[^\n]*\n\s*var NQ = [^\n]*nq = NQ && NQ\.type === 'square' \? NQ\.size : 50;\n\s*it\.x \+= Math\.sign\(dx\) \* nq; it\.y \+= Math\.sign\(dy\) \* nq;\n\s*window\.wpSeatDrop\(it, m2\);\n\s*\} else \{ it\.x \+= dx; it\.y \+= dy; \}/.test(ioS));
        }
        check('grid shape: wpSeatCell (datamap.js, run for real) — on a square grid a one-cell token is centered in its 50 px cell (a 50x50 lands on the lattice), a sized-up one has its corner on the lattice (a 2x2 covers four whole cells), on hex it is wpSeatHex, with no grid or on an item that is no token nothing moves',
            scA > 0 && sc1 === true && it1.x === 100 && it1.y === 200 && sc2 === true && j(seats2) === j(['m']) && sc3 === false && it3.x === 107 && sc4 === false && it4.x === 107 && sc5 === false && it5.x === 100 && sc6 === true && it6.x === 1000 && it6.y === 1000 && sc7 === false, j([it1, it3, it4, it6]));
        check('grid shape: the look — a hexagon token is a plate inside its unclipped box (a dashed gold ring when waiting; clicks on the hexagon only, never in placing), its face cut to the hexagon; a square token\'s face and a picture\'s outline follow the cell',
            /\.wb-item\.hexagon\.wb-hextok \{ clip-path: none; background: transparent !important; border: 0; \}/.test(cssG) && /\.wb-hextok > \.tok-plate, \.wb-hextok > \.tok-ring \{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;/.test(cssG) && /\.wb-hextok > \.tok-plate polygon \{ fill: var\(--faint\); \}/.test(cssG)
            && /\.wb-item\.hexagon\.wb-hextok \{ pointer-events: none; \}/.test(cssG) && /\.wb-hextok > \.tok-plate polygon \{ pointer-events: visiblePainted; \}/.test(cssG) && /body\.placing #whiteboard \.wb-hextok > \.tok-plate polygon \{ pointer-events: none; \}/.test(cssG) && /\.wb-hextok > \.tok-ring polygon \{ fill: none; stroke: var\(--gold\); stroke-width: 2; stroke-dasharray: 5 3;/.test(cssG) && /\.wb-hextok > \.token-face-img, \.wb-hextok\.wb-waiting > \.wait-face, \.wb-hextok\.tok-dead::after \{ border-radius: 0; clip-path: polygon/.test(cssG)
            && /\.wb-item\.rect > \.token-face-img, \.wb-item\.rect\.wb-waiting > \.wait-face \{ border-radius: 4px; \}/.test(cssG) && /\.wb-item\.image\.tok-pic-hexagon > img \{ clip-path: polygon/.test(cssG) && /\.wb-item\.image\.tok-pic-circle > img \{ border-radius: 50%; \}/.test(cssG)
            && /var picShape = item\.type === 'image' && item\.isChar && \(item\.shape === 'hexagon' \|\| item\.shape === 'rect' \|\| item\.shape === 'circle'\) \? item\.shape : '';/.test(wbG));
        const ixG = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), tuG = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        check('grid shape: Help says it (Grids ▸ Tokens take the grid\'s shape; the waiting token\'s outline)',
            /<b>Tokens take the grid&rsquo;s shape:<\/b> a token the app places/.test(ixG) && /in a dashed outline the shape of the map&rsquo;s cells, or a circle with no grid\./.test(ixG) && !/dashed circle/.test(ixG) && !/dashed circle/.test(tuG));
    }
    /* ---- The token creator (owner, 2026-09-27) ---- */
    {
        const wbC = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), stC = fs.readFileSync(path.join(app, 'scripts', 'settings.js'), 'utf8').replace(/\r\n/g, NL), faC = fs.readFileSync(path.join(app, 'scripts', 'faces.js'), 'utf8').replace(/\r\n/g, NL);
        const frC = fs.readFileSync(path.join(app, 'scripts', 'framer.js'), 'utf8').replace(/\r\n/g, NL), ixC = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), tuC = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        const opA = wbC.indexOf('function ownPicOk('), opB = wbC.indexOf('function newOwnPicture(');
        const chs = { c_1: { id: 'c_1', ownerId: 'me' }, c_n: { id: 'c_n', ownerId: 'me', npc: true }, c_p: { id: 'c_p', ownerId: 'me', partial: true }, c_o: { id: 'c_o', ownerId: 'u_b' } };
        const okRun = (tok, net, sheetsOn) => new Function('window', wbC.slice(opA, opB) + '\nreturn ownPicOk;')({ wpNet: net, wpProcessAvatar() {}, wpSheets: { charById: id => chs[id] || null, canOpen: id => sheetsOn !== false && !!chs[id] && chs[id].ownerId === 'me' } })(tok);
        const both = { charPic() {}, tokPic() {} };
        check('token creator: a player\'s own token offers New picture… exactly where it will be taken — a character\'s token through char-pic (their own whole character, sheets on for them: not an NPC companion\'s token, a teammate\'s copy, another\'s or one gone), a plain one through tok-pic; never a locked token, nor with sheets off for them, nor without the creator',
            opA > 0 && okRun({ charId: 'c_1' }, both) === true && okRun({}, both) === true && okRun({ locked: true }, both) === false && okRun({ charId: 'c_1' }, both, false) === false && okRun({}, { charPic() {} }) === false && okRun({ charId: 'c_1' }, { tokPic() {} }) === false
            && okRun({ charId: 'c_n' }, both) === false && okRun({ charId: 'c_p' }, both) === false && okRun({ charId: 'c_o' }, both) === false && okRun({ charId: 'c_9' }, both) === false && okRun({ charId: 'c_1' }, both) === true
            && /var picRow = ownPicOk\(tok\) \? '<div class="menu-item cm-pic-own">/.test(wbC) && /\|\| ownPicOk\(tokO\) \|\| tokenSensesLine\(tokO\) \|\| \(window\.wpSheets && window\.wpSheets\.tokenFxModel && window\.wpSheets\.tokenFxModel\(tokO\)\)\)\) \{ e\.preventDefault\(\); showStanceMenu\(e, tokO\); \}/.test(wbC)
            && /var r = tok\.charId \? n\.charPic\(tok\.charId, '', data, answer\) : n\.tokPic\(am\.id, tok\.id, data, answer\);/.test(wbC) && /\{ px: 256, max: 200000, title: 'Frame your token\\u2019s picture', guide: guide \}/.test(wbC));
        {   // run for real: New picture… (the file picker, the creator's guide, the sender) and processAvatar's hand-off to the creator
            const npB = wbC.indexOf('// A player\'s own token: the one edit menu');
            const npRun = (tok, net, map) => { const log = { clicks: 0 };
                const doc = { createElement() { const fi = { files: [{ type: 'image/png', size: 10 }], h: null, addEventListener(ev, h) { if (ev === 'change') fi.h = h; }, click() { log.clicks++; log.accept = fi.accept; if (fi.h) fi.h(); } }; return fi; } };
                const win = { wpNet: net, wpSystemCore: S, wpSheets: { charById: id => chs[id] || null, canOpen: id => !!chs[id] && chs[id].ownerId === 'me' }, wpProcessAvatar(f, cb, o) { log.opts = o; cb('data:image/png;base64,AA=='); } };
                new Function('window', 'document', 'getActiveMap', 'toast', wbC.slice(opA, npB) + '\nreturn newOwnPicture;')(win, doc, () => map, m => { log.toast = m; })(tok); return log; };
            const calls = [], rec = { charPic(c, f, d) { calls.push(['char', c, f, d]); }, tokPic(m, t, d) { calls.push(['tok', m, t, d]); } };
            const hexM = { id: 'm_h', type: 'map', meta: { gridType: 'hex' } }, sqM = { id: 'm_s', type: 'map', meta: { gridType: 'square' } };
            const tokA = { id: 't_1', isChar: true, type: 'circle', w: 60, h: 52, x: 10, y: 20 };
            const lA = npRun(tokA, rec, hexM), lB = npRun({ id: 't_2', isChar: true, type: 'image', src: '/saves/images/a.png', w: 50, h: 50, charId: 'c_1' }, rec, sqM), lC = npRun({ id: 't_3', isChar: true, type: 'image', src: '/saves/images/b.png', shape: 'hexagon', w: 100, h: 88 }, rec, hexM);
            const lD = npRun({ id: 't_4', isChar: true, type: 'circle', w: 120, h: 104 }, rec, hexM), lE = npRun({ id: 't_5', isChar: true, locked: true }, rec, hexM), lF = npRun({ id: 't_6', isChar: true, charId: 'c_n' }, rec, hexM), lG = npRun({ id: 't_7', isChar: true }, rec, null);
            const g = l => l.opts && l.opts.guide ? [l.opts.guide.shape, l.opts.guide.w, l.opts.guide.h] : null;
            const paA = stC.indexOf('var AVATAR_PX'), paB = stC.indexOf('window.wpProcessAvatar = processAvatar;');
            const paRun = (file, opts) => { const seen = [], got = [], toasts = []; new Function('window', 'toast', stC.slice(paA, paB) + '\nreturn processAvatar;')({ wpFrame: { open(f, o, cb) { seen.push(o); cb({ data: 'data:image/png;base64,AA==' }); cb({}); cb(null); } } }, t => toasts.push(t))(file, d => got.push(d), opts); return { o: seen[0], got, toasts, n: seen.length }; };
            const pa1 = paRun({ type: 'image/png', size: 10 }), pa2 = paRun({ type: 'image/png', size: 10 }, { px: 256, max: 200000, title: 'T', guide: { shape: 'hexagon', w: 60, h: 52 } }), pa3 = paRun({ type: 'text/plain', size: 10 }), pa4 = paRun({ type: 'image/png', size: 9 * 1024 * 1024 });
            check('token creator (run for real): New picture… opens one image picker and frames the file against what the save will show — a one-cell token its map\'s cell (a circle 60x52 on a hex map: a hexagon 60x52; a picture on a square map: a square 50x50), a sized-up token its own outline, one with none the whole square — then sends a character\'s token through char-pic, a plain one through tok-pic(map, token), the token itself untouched; a locked token, an NPC companion\'s or no map opens nothing; processAvatar hands the creator px / max / title / guide (a profile: 96, 102,400, no guide), passes on only a result with a picture, and never opens it for a file that is not an image or is past 8 MB',
                npB > opA && lA.clicks === 1 && lA.accept === 'image/*' && j(g(lA)) === j(['hexagon', 60, 52]) && j(g(lB)) === j(['rect', 50, 50]) && j(g(lC)) === j(['hexagon', 100, 88]) && j(g(lD)) === j(['rect', 1, 1])
                && lA.opts.px === 256 && lA.opts.max === 200000 && j(tokA) === j({ id: 't_1', isChar: true, type: 'circle', w: 60, h: 52, x: 10, y: 20 })
                && lE.clicks === 0 && lF.clicks === 0 && lG.clicks === 0
                && j(calls) === j([['tok', 'm_h', 't_1', 'data:image/png;base64,AA=='], ['char', 'c_1', '', 'data:image/png;base64,AA=='], ['tok', 'm_h', 't_3', 'data:image/png;base64,AA=='], ['tok', 'm_h', 't_4', 'data:image/png;base64,AA==']])
                && /var ownPic = cMenu\.querySelector\('\.cm-pic-own'\); if \(ownPic\) ownPic\.addEventListener\('click', function\(ce\) \{ ce\.stopPropagation\(\); cMenu\.style\.display = 'none'; newOwnPicture\(tok\); \}\);/.test(wbC)
                && j(pa1.o) === j({ px: 96, as: 'data', max: 102400, title: 'Frame your picture', guide: null }) && j(pa1.got) === j(['data:image/png;base64,AA=='])
                && j(pa2.o) === j({ px: 256, as: 'data', max: 200000, title: 'T', guide: { shape: 'hexagon', w: 60, h: 52 } }) && pa3.n === 0 && pa3.toasts.length === 1 && pa4.n === 0 && pa4.toasts.length === 1,
                j([g(lA), g(lB), g(lC), g(lD), calls, pa1, pa2]));
        }
        check('token creator: every chosen profile picture and a player\'s character picture is framed first — processAvatar opens the creator (the profile 96 px within the old cap, a character\'s 256 within 200,000 characters), the face picker closes before it opens; the creator\'s own markup is static, its dynamic parts text only, its keys on window in the capture phase, a paste or a drop never lands behind it',
            /if \(window\.wpFrame && window\.wpFrame\.open\) \{[^\n]*\n\s*window\.wpFrame\.open\(file, \{ px: opts\.px \|\| AVATAR_PX, as: 'data', max: opts\.max \|\| AVATAR_MAX_STORED,/.test(stC)
            && /if \(!f\) return; close\(\); window\.wpProcessAvatar\(f, function\(data\) \{ if \(typeof onPick === 'function'\) onPick\('', data\); \}, \{ px: 256, max: 200000, title: 'Frame the picture' \}\);/.test(faC)
            && /<div id="frameModal" class="frame-modal" role="dialog" aria-modal="true" aria-labelledby="frameTitle"/.test(ixC) && /<script type="module" src="scripts\/framer\.js"><\/script>/.test(ixC) && !/innerHTML|insertAdjacentHTML/.test(frC)
            && /window\.addEventListener\('keydown', onKey, true\);/.test(frC) && /\['paste', 'drop', 'dragover'\]\.forEach\(function\(t\) \{ window\.addEventListener\(t, block, true\); \}\);/.test(frC) && /var ref = picRef\(source\); if \(!ref\)/.test(frC));
        {   // fold 2: the GM's kept original (systemcore cleanFrame) — cleaned, kept only in the GM's own copy of a character, never in a player's view
            const okF = { src: '/saves/images/lib/a b.png', x: 1, y: 2, s: 30, of: '/saves/images/portraits/token-w1-k1.png' }, cf = v => j(S.cleanFrame(v)), bad = o => S.cleanFrame(Object.assign({}, okF, o)) === null;
            const sysF = { fields: [] }, cF = { id: 'c_1', name: 'Ana', ownerId: '', portrait: '/saves/images/portraits/portrait-c_1-p1.png', values: {}, frame: okF };
            const hostC = S.cleanChar(cF, sysF, { state: 'host' }), ownC = S.cleanChar(cF, sysF, { state: 'owner' }), noC = S.cleanChar(cF, sysF), badC = S.cleanChar(Object.assign({}, cF, { frame: { src: 'https://evil.example/x.png', x: 1, y: 2, s: 3, of: okF.of } }), sysF, { state: 'host' }), viewC = S.charForView(Object.assign({}, cF, { ownerId: 'u_a' }), sysF);
            check('token creator (GM): a kept original is cleaned (a saved picture or a bundled square, the square in picture pixels, the framed file it made — anything else is none), kept in the GM\'s own copy of a character (loading, importing) and nowhere else, never in a player\'s view',
                cf(okF) === j(okF) && cf(Object.assign({}, okF, { src: 'assets/tutorial/orc_sq.jpg' })) === j(Object.assign({}, okF, { src: 'assets/tutorial/orc_sq.jpg' }))
                && bad({ src: 'assets/tutorial/orc_hex.png' }) && bad({ src: 'https://evil.example/x.png' }) && bad({ src: '/saves/images/../data.json' }) && bad({ src: '/saves/images/a\u0001.png' }) && bad({ src: '//evil/x.png' }) && bad({ of: 'https://evil.example/x.png' }) && bad({ of: undefined })
                && bad({ x: -1 }) && bad({ s: 0 }) && bad({ s: NaN }) && bad({ s: 1e7 }) && bad({ y: '2' }) && S.cleanFrame(null) === null && S.cleanFrame([okF]) === null && S.cleanFrame('x') === null
                && cf(Object.assign({}, okF, { extra: 1, onload: 'x' })) === j(okF) && bad({ src: 'https://evil.example/assets/tutorial/orc_sq.jpg' }) && bad({ src: 'xassets/tutorial/orc_sq.jpg' })
                && j(hostC.frame) === j(okF) && !('frame' in ownC) && !('frame' in noC) && !('frame' in badC) && !!viewC && !('frame' in viewC) && typeof S.cleanFrame === 'function', j([hostC, ownC, viewC]));
            const shC2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), inC2 = fs.readFileSync(path.join(app, 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, NL);
            check('token creator (GM): Frame picture… on a picture token\'s menu (a token, not waiting, the creator there) acts on the selection; Portrait… frames the chosen library picture (from the kept square when it is the kept original) and saves it for the character; the roster portrait frames first (Keep the original saves the whole picture too)',
                /if \(isWb && firstItem && firstItem\.isChar && !firstItem\.waiting && firstItem\.type === 'image' && firstItem\.src && window\.wpFrame && window\.wpSheets && window\.wpSheets\.applyTokenFrame\) html \+= '<div class="menu-item cm-frame-pic">/.test(wbC)
                && /\} else if \(action\.includes\('cm-frame-pic'\)\) \{[^\n]*\n\s*cMenu\.style\.display = 'none';\n\s*frameGmPicture\(am, selectedIds\.slice\(\)\);\n\s*return;/.test(wbC) && wbC.indexOf("action.includes('cm-frame-pic')") < wbC.indexOf("action.includes('cm-sheet')")
                && /window\.wpPickImage\(function\(src\) \{ if \(typeof src === 'string' && \/\^\[\/\]saves\[\/\]images\[\/\]\/\.test\(src\)\) framePortrait\(ch, src\); \}\);/.test(shC2)
                && /start: fr && fr\.src === src \? \{ x: fr\.x, y: fr\.y, s: fr\.s \} : null, keep: true \}, function\(res\) \{\n\s*applyCharFrame\(id, \{ blob: res\.blob, scope: 'portrait', frame: res\.keep \? \{ src: src, x: res\.rect\.x, y: res\.rect\.y, s: res\.rect\.s \} : null \}\)/.test(shC2)
                && /\/\/ \[sinkcheck:rosterportrait-start\][\s\S]*keep: lt \? true : undefined, maxInput: 64 \* 1024 \* 1024 \}[\s\S]*\/\/ \[sinkcheck:rosterportrait-end\]/.test(inC2));
        }
        {   // fold 2's wiring: the appliers the menu row and frameGmPicture ask window.wpSheets for
            const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), exA = shX.indexOf('window.wpSheets = {'), exS = exA < 0 ? '' : shX.slice(exA, shX.indexOf('};', exA));
            check('token creator (GM): the wiring — window.wpSheets exports both appliers (the Frame picture… row and frameGmPicture need them), and whiteboard.js publishes its tokenGuide as window.wpTokenGuide once',
                /\bapplyCharFrame: applyCharFrame\b/.test(exS) && /\bapplyTokenFrame: applyTokenFrame\b/.test(exS) && /^window\.wpTokenGuide = tokenGuide;[^;\n]*$/m.test(wbC) && (wbC.match(/window\.wpTokenGuide\s*=/g) || []).length === 1);
        }
        check('token creator: Help says it (the Grids list, the Join screen, the player\'s New picture…), and the Settings note no longer says pictures are shrunk automatically',
            /<b>The token creator:<\/b> it frames a picture into the square a token or a portrait shows\./.test(ixC) && /A player uploads with <b>Picture<\/b> on their own sheet, or with <b>New picture&hellip;<\/b> for their own token\./.test(ixC) && /You choose a portrait with <b>Portrait&hellip;<\/b> on the Characters tab, or as a room character&rsquo;s portrait\. <b>Cancel<\/b> there keeps the picture you had\./.test(ixC) && /A picture you place on the map yourself is framed when you ask, with <b>Frame picture&hellip;<\/b>\./.test(ixC)
            && /<b>Frame picture&hellip;<\/b> on a picture token&rsquo;s right-click menu frames it\. For plain tokens it frames the selected ones still wearing that picture\. For a character&rsquo;s token it frames every token of that character on every map, and its portrait when it wore that picture or had none\./.test(ixC) && /<b>Keep the original<\/b> starts ticked\. With it ticked, the creator reopens the whole picture/.test(ixC) && !/Every picture chosen for a profile/.test(tuC) && /<b>New picture&hellip;<\/b> on your own token&rsquo;s right-click menu/.test(ixC) && /framed first: drag and zoom to the part that shows/.test(ixC)
            && !/images are shrunk to a small square automatically/.test(ixC));
    }
    /* ---- Onboarding F4: a file fills a character in the making (systemcore fillMaking, sheetexport charFromJson) ---- */
    {
        const XF = await import(url('sheetexport.js')), jf = JSON.stringify;
        const lstF = { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'gm', list: { cats: ['Skill'], noQty: true, multi: true, lvl: { label: 'Level', min: -10, max: 40, def: 10 }, stats: [{ key: 'attr', labels: ['ST', 'DX', 'IQ'] }, { key: 'diff' }], on: { label: 'Worn', def: false } } };
        const fx0 = { id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects', vis: 'all', edit: 'gm' };
        const full = cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', edit: 'gm', def: 10 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'gm', def: 10 }, { id: 'f_iq', key: 'IQ', label: 'IQ', kind: 'number', vis: 'all', edit: 'gm', def: 10 }, { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: 'ST', vis: 'all', edit: 'gm' }, lstF, fx0,
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Gear'] } }, { id: 'f_gl', key: 'Secrets', label: 'Secrets', kind: 'item-list', vis: 'gm', list: { cats: ['Gear'] } }],
            items: [{ id: 'i_climb', name: 'Climbing', key: 'Climbing', category: 'Skill', stats: { attr: 1, diff: 1 } }, { id: 'i_ninja', name: 'Ninjutsu', key: 'Ninjutsu', category: 'Skill', vis: 'gm', stats: { attr: 1, diff: 3 } }], effects: [{ id: 'e_rage', name: 'Rage', mods: [{ f: 'f_st', op: 'add', v: 2 }] }] }, { F, gmView: true });
        const view = cleanSystem(full, { F, gmView: false }), findV = nm => (view.items || []).filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase());
        const making = vals => ({ id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: vals || {} });
        const fillIt = (fill, ch) => S.fillMaking(full, ch || making(), fill, F, { view, lib: null, now: 1000 });
        // a round trip: the player's own copy downloaded, read back into a new character in the making on the same campaign
        const src = { id: 'c_s', name: 'Pax', ownerId: 'u_a', npc: false, values: { f_st: 14, f_hp: { cur: 9 }, f_sk: [{ id: 'w_a', defId: 'i_climb', qty: 1, lvl: 12, on: true, note: 'free climb' }, { id: 'w_b', qty: 1, own: 1, lvl: 11, def: { name: 'Juggling', category: 'Skill', icon: '', notes: '', vis: 'all', stats: { attr: 1, diff: 0 } } }], f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }] } };
        const pv = S.charForView(src, view), file = XF.charToJson(view, pv, null, { exported: 'x' });
        const fl1 = XF.charFromJson(view, JSON.parse(JSON.stringify(file)), findV), r1 = fillIt(fl1), sk1 = (r1.values.f_sk || []);
        check('F4 a character file read back (charFromJson, then fillMaking): the player\'s own download fills a new character in the making on the same campaign — its values, its rows (an item by id, their own row), its facts, its effects, its pool last (read against the new ST); the pointer row carries its item\'s name (for another campaign)',
            !!fl1 && jf(fl1.unmatched) === '[]' && r1.ok === true && r1.values.f_st === 14 && jf(r1.values.f_hp) === jf({ cur: 9 }) && sk1.length === 2 && sk1[0].defId === 'i_climb' && sk1[0].lvl === 12 && sk1[0].on === true && sk1[0].note === 'free climb'
            && !!sk1[1] && !!sk1[1].def && sk1[1].def.name === 'Juggling' && jf(sk1[1].def.stats) === jf({ attr: 1, diff: 0 }) && sk1[1].lvl === 11 && Array.isArray(r1.values.f_fx) && r1.values.f_fx.length === 1 && r1.values.f_fx[0].ref === 'e_rage' && r1.left === 0
            && file.values.f_sk[0].name === 'Climbing' && file.values.f_sk[0].key === 'Climbing', jf([fl1 && fl1.unmatched, r1]));
        // another campaign: other field ids, the same keys; a kind that differs; a pointer to an item this one lacks, found by its name
        const other = JSON.parse(JSON.stringify(file)); other.system.sig = 'nope'; other.system.fields = { f_a: { key: 'ST', kind: 'number', label: 'Strength' }, f_b: { key: 'HP', kind: 'number', label: 'Hit points' }, f_c: { key: 'Skills', kind: 'item-list', label: 'Skills' }, f_d: { key: 'Lore', kind: 'text', label: 'Lore <b>x</b>' } };
        other.values = { f_a: 16, f_b: 7, f_c: [{ id: 'w_z', defId: 'i_elsewhere', name: 'Climbing', qty: 1, lvl: 5 }, { id: 'w_y', defId: 'i_gone', qty: 1, lvl: 2 }], f_d: 'old tales' };
        const fl2 = XF.charFromJson(view, other, findV), r2 = fillIt(fl2);
        check('F4 a character file from another campaign: stored values matched by key and kind (a kind that differs, or a key this campaign lacks, named as not matched, as text); a row pointing at another campaign\'s item found here by its name; one with nothing to know it by lost (counted)',
            r2.values.f_st === 16 && !('f_hp' in r2.values) && (r2.values.f_sk || []).length === 1 && r2.done === 2 && fl2.ops.every(o => fl2.ops.some(p => p.q.rowId === o.q.rowId && (p.q.op === 'add' || p.q.op === 'custom'))) && r2.values.f_sk[0].defId === 'i_climb' && r2.values.f_sk[0].lvl === 5 && jf(fl2.unmatched) === jf(['Hit points', 'Lore <b>x</b>']) && fl2.lost === 1, jf([fl2 && fl2.unmatched, fl2 && fl2.lost, r2.values]));
        // a hostile or GM file: GM-only ids, a GM's full copy, a forged signature, prototype names, wrong types, a row's GM fields, a GM-only item, mods on GM-only fields
        const bad = { format: 'waypoint-character', v: 1, gm: true, name: 'Pax', system: { sig: XF.systemSig(view), fields: { f_dx: { key: 'DX', kind: 'number' }, f_st: { key: 'ST', kind: 'number' }, f_sk: { key: 'Skills', kind: 'item-list' }, f_fx: { key: 'Effects', kind: 'effects' }, ['__proto__']: { key: 'ZZ', kind: 'number' } } },
            values: JSON.parse('{"f_dx": 18, "f_st": [5], "__proto__": 3, "f_sk": [{"id": "w_1", "qty": 1, "def": {"name": "Blaster", "category": "Skill", "area": {"ft": 30}, "damage": "3d6", "rm": "bound", "vis": "gm", "stats": {"attr": 2, "wild": 9}}}, {"id": "w_2", "qty": 1, "defId": "i_ninja", "name": "Ninjutsu", "hid": 1, "paid": 5, "snap": {"name": "x", "area": {"ft": 9}}}], "f_fx": [{"id": "x_9", "name": "Boost", "mods": [{"f": "f_dx", "op": "add", "v": 3}, {"f": "f_st", "op": "add", "v": 1}]}]}') };
        const fl3 = XF.charFromJson(view, bad, findV), r3 = fillIt(fl3), row3 = (r3.values.f_sk || [])[0] || {}, fx3 = (r3.values.f_fx || [])[0] || {};
        check('F4 a hostile or GM file fills nothing GM-only: a GM-only field is never matched (a forged signature, a GM\'s own copy alike), a prototype name is nothing, a value of the wrong type is refused; a row of its own keeps the players\' fields and the list\'s stats only (no blast, damage, lock or GM-only mark); a GM-only item is never found by name; an effect\'s changes on GM-only fields are dropped; nothing reaches Object.prototype',
            !('f_dx' in r3.values) && !('f_st' in fl3.values) && row3.def && row3.def.name === 'Blaster' && !('area' in row3.def) && !('damage' in row3.def) && !('rm' in row3.def) && row3.def.vis !== 'gm' && jf(row3.def.stats) === jf({ attr: 2 })
            && (r3.values.f_sk || []).length === 1 && !(r3.values.f_sk || []).some(r => r.hid === 1 || r.paid !== undefined || r.snap) && fx3.name === 'Boost' && jf(fx3.mods) === jf([{ f: 'f_st', op: 'add', v: 1 }]) && ({}).key === undefined && ({}).kind === undefined, jf([fl3, r3.values]));
        // fillMaking's own rules
        const pl = { player: true, view }, fillOp = (q, ch) => S.applyRowOp(full, ch, 'f_sk', q, F, Object.assign({ fill: true }, pl));
        const inPlay = { id: 'c_p', name: 'P', ownerId: 'u_a', npc: false, values: {} };
        const w1 = S.applyRowOp(full, making(), 'f_sk', { op: 'custom', rowId: 'w_q', def: { name: 'Own' } }, F, pl), w2 = fillOp({ op: 'custom', rowId: 'w_q', def: { name: 'Own' } }, making()), w3 = fillOp({ op: 'custom', rowId: 'w_q', def: { name: 'Own' } }, inPlay);
        const w4 = fillOp({ op: 'custom', rowId: 'w_q', def: { name: 'Own', area: { ft: 5 } } }, making());
        const r5 = S.fillMaking(full, inPlay, { values: { f_st: 12 } }, F, { view }), r6 = fillIt({ values: { f_dx: 12, f_st: 'x' } });
        const r7 = fillIt({ lists: ['f_sk'], ops: [] }, making({ f_sk: [{ id: 'w_c', defId: 'i_climb', qty: 1, hid: 1 }, { id: 'w_d', defId: 'i_climb', qty: 1 }] }));
        const r8 = fillIt({ ops: [{ f: 'f_sk', q: { op: 'add', defId: 'i_climb', rowId: 'w_e' } }, { f: 'f_sk', q: { op: 'ov', rowId: 'w_e', ov: { stats: { wild: 1 }, area: { ft: 3 } } } }, { f: 'f_sk', q: { op: 'ov', rowId: 'w_e', ov: { name: 'Climbing (walls)' } } }] });
        const r9 = fillIt({ ops: [{ f: 'f_sk', q: { op: 'custom', rowId: 'w_k', def: { name: 'Keyed', key: 'Climbing' } } }] });
        const r10 = fillIt({ values: { f_hp: { cur: 14 }, f_st: 15 } }), r10b = fillIt({ values: { f_hp: { cur: 14 } } });
        check('F4 fillMaking: only a character in the making (one in play: refused whole); only visible fields (a GM-only one left out, counted), a value its field refuses left out; a list the file carries is replaced (a kept curse stays); a copy\'s own values drop alone when refused (only its name and the list\'s stats go), a key taken leaves the row without it; pools last (a pool read against the ST the file brings); the widening only with fill on a character in the making (a plain player\'s own row refused where the list takes none; in play, even with fill, refused; never a blast)',
            w1.ok === false && w1.reason === 'field' && w2.ok === true && w3.ok === false && w4.ok === false && r5.ok === false && r6.left === 2 && !('f_dx' in r6.values)
            && jf((r7.values.f_sk || []).map(r => r.id)) === jf(['w_c']) && r8.left === 0 && (r8.values.f_sk || [])[0].ov && r8.values.f_sk[0].ov.name === 'Climbing (walls)' && !('area' in r8.values.f_sk[0].ov) && r9.left === 0 && !('key' in r9.values.f_sk[0].def)
            && jf(r10.values.f_hp) === jf({ cur: 14 }) && r10.values.f_st === 15 && jf(r10b.values.f_hp) === jf({ cur: 10 }), jf([w1, w2, w3, w4, r6, r7.values, r8, r9, r10.values, r10b.values]));
        // each layer on its own: the reader never matches a GM-only field or item even when handed the full system; on the file's own system the
        // field id wins over a key that moved; a fact the list has no place for is never written; fillMaking strips a row's GM fields, keeps the
        // list's stats of a copy's own values, keeps a row whose own values it cannot take, never touches a GM-only list or effects; the widening
        // needs a character in the making even on a list its owner may edit; an upload never carries a picture
        const gmFile = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: { f_dx: { key: 'DX', kind: 'number' }, f_sk: { key: 'Skills', kind: 'item-list' } } }, values: { f_dx: 17, f_sk: [{ id: 'w_1', defId: 'i_ninja', qty: 1 }] } };
        const flG = XF.charFromJson(full, gmFile, nm => []);
        const moved = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: XF.systemSig(view), fields: { f_st: { key: 'IQ', kind: 'number' } } }, values: { f_st: 17 } }, flM = XF.charFromJson(view, moved, findV);
        const gearF = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: { f_g: { key: 'Gear', kind: 'item-list' } } }, values: { f_g: [{ id: 'w_g', qty: 1, lvl: 4, on: true, note: 'dented', def: { name: 'Rope', category: 'Gear' } }] } }, flGr = XF.charFromJson(view, gearF, findV);
        const x1 = fillIt({ ops: [{ f: 'f_sk', q: { op: 'custom', rowId: 'w_h', def: { name: 'Hand', area: { ft: 5 }, damage: '1d6', rm: 'bound', vis: 'gm' } } }] });
        const x2 = fillIt({ ops: [{ f: 'f_sk', q: { op: 'add', defId: 'i_climb', rowId: 'w_s' } }, { f: 'f_sk', q: { op: 'ov', rowId: 'w_s', ov: { stats: { attr: 2, wild: 1 } } } }] });
        const x3 = fillIt({ ops: [{ f: 'f_sk', q: { op: 'custom', rowId: 'w_o', def: { name: 'Own' } } }, { f: 'f_sk', q: { op: 'ov', rowId: 'w_o', ov: { name: 'Not a copy' } } }] });
        const x4 = fillIt({ lists: ['f_gl'], fxLists: [], ops: [] }, making({ f_gl: [{ id: 'w_q', defId: 'i_climb', qty: 1 }] }));
        const x5 = S.applyRowOp(full, { id: 'c_p', name: 'P', ownerId: 'u_a', npc: false, values: {} }, 'f_gear', { op: 'custom', rowId: 'w_n', def: { name: 'Own' } }, F, { player: true, view, fill: true });
        const up5 = S.cleanCharUpload({ rid: 'e1', charId: 'c_1', sheet: { name: 'V', picture: 'data:image/png;base64,AAAA', portrait: 'data:image/png;base64,BBBB' } });
        check('F4 each layer on its own: the reader matches no GM-only field or item even from the full system; on the file\'s own system its field id wins over a key that moved; a fact its list has no place for is left out; fillMaking strips a row\'s GM fields (it keeps the row), keeps the list\'s stats of a copy\'s own values, keeps a row whose own values it cannot take, never empties a GM-only list; the widening needs a character in the making even where its owner may edit; an upload never carries a picture',
            !!flG && !('f_dx' in flG.values) && !flG.ops.some(o => o.q.defId === 'i_ninja') && flM.values.f_st === 17 && !('f_iq' in flM.values)
            && !!flGr && !flGr.ops.some(o => o.q.op === 'set' && o.q.facts && 'lvl' in o.q.facts) && !flGr.ops.some(o => o.q.op === 'set' && o.q.facts && 'on' in o.q.facts) && flGr.ops.some(o => o.q.op === 'set' && o.q.facts && o.q.facts.note === 'dented')
            && (x1.values.f_sk || []).length === 1 && x1.values.f_sk[0].def.name === 'Hand' && !('area' in x1.values.f_sk[0].def) && !('damage' in x1.values.f_sk[0].def) && x1.values.f_sk[0].def.vis === 'all'
            && x2.values.f_sk[0].ov && x2.values.f_sk[0].ov.stats && x2.values.f_sk[0].ov.stats.attr === 2 && !('wild' in x2.values.f_sk[0].ov.stats) && (x3.values.f_sk || []).length === 1 && x3.left === 1
            && jf((x4.values.f_gl || []).map(r => r.id)) === jf(['w_q']) && x5.ok === false && !!up5 && !('picture' in up5.sheet) && !('portrait' in up5.sheet), jf([flG, flM, flGr && flGr.ops, x1.values, x2.values, x3, x4.values, x5]));
        // the library path: a copy of an entry of a pack players may see comes in through opts.lib, its own name and stats kept; without it, refused and counted
        const packL = { i_axe: { id: 'i_axe', name: 'Axe Throwing', key: 'AxeThrowing', category: 'Skill', stats: { attr: 1, diff: 1 } } }, libL = id => packL[id] || null;
        const opsL = [{ f: 'f_sk', q: { op: 'add', defId: 'i_axe', rowId: 'w_x' } }, { f: 'f_sk', q: { op: 'ov', rowId: 'w_x', ov: { name: 'Axe Throwing (long)', stats: { attr: 2 } } } }];
        let rL, rL0; S.setLibraryFind(libL);
        try { rL = S.fillMaking(full, making(), { lists: ['f_sk'], ops: opsL }, F, { view, lib: libL, now: 1000 }); rL0 = S.fillMaking(full, making(), { lists: ['f_sk'], ops: opsL }, F, { view, lib: null, now: 1000 }); } finally { S.setLibraryFind(null); }
        const rowL = (rL.values.f_sk || [])[0] || {};
        check('F4 fillMaking\'s library path: a copy of an entry of a pack players may see comes in through the players\' lookup (opts.lib) with its snap, and its own name and stats; without that lookup it is refused and counted',
            rL.left === 0 && rowL.defId === 'i_axe' && !!rowL.snap && rowL.snap.name === 'Axe Throwing' && jf(rowL.ov) === jf({ name: 'Axe Throwing (long)', stats: { attr: 2 } }) && rL0.left === 1 && jf(rL0.values.f_sk) === '[]', jf([rL, rL0]));
        // a renamed library copy read back from a download is found by its key (an inline copy only: a row of their own stays theirs)
        const findKV = k => (view.items || []).filter(e => typeof e.key === 'string' && e.key.toLowerCase() === String(k).trim().toLowerCase());
        const kf = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: { f_s: { key: 'Skills', kind: 'item-list' } } }, values: { f_s: [{ id: 'w_c', qty: 1, lvl: 9, lnk: 1, def: { name: 'Climbing (Walls)', key: 'Climbing', category: 'Skill', stats: { attr: 1, diff: 1 } } }, { id: 'w_d', qty: 1, own: 1, def: { name: 'Hand Climbing', key: 'Climbing', category: 'Skill' } }] } };
        const flK = XF.charFromJson(view, kf, findV, findKV), rK = fillIt(flK), kRows = rK.values.f_sk || [];
        // effects in a fill: the list the file carries replaces the sheet's; ad hoc rows come in with their changes; an effect saved off stays off (its switch is not counted as a part)
        const oldFx = making({ f_fx: [{ id: 'x_old', name: 'Old', icon: '', tone: '', dur: '', notes: '', on: true, mods: [] }] });
        const handE = { values: { f_st: 13 }, lists: [], ops: [], fxLists: ['f_fx'], fx: [{ f: 'f_fx', q: { op: 'adhoc', row: { id: 'x_h0', name: 'Shaken', icon: '', tone: 'debuff', dur: '', notes: '', on: true, mods: [{ f: 'f_st', op: 'add', v: -1 }] } } }] }, rE1 = fillIt(handE, oldFx);
        const offF = { format: 'waypoint-character', v: 1, name: 'Pax', system: { sig: XF.systemSig(view), fields: { f_fx: { key: 'Effects', kind: 'effects' } } }, values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: false }] } };
        const rE2 = fillIt(XF.charFromJson(view, offF, findV), making({ f_fx: [{ id: 'x_old', ref: 'e_rage', on: true }] }));
        check('F4 effects in a fill: the effects the file carries replace what the sheet had (never added to it); an ad hoc row comes in with its changes; an effect saved off stays off, and its switch is not counted as a part',
            jf((rE1.values.f_fx || []).map(r => r.name)) === jf(['Shaken']) && jf(rE1.values.f_fx[0].mods) === jf([{ f: 'f_st', op: 'add', v: -1 }])
            && (rE2.values.f_fx || []).length === 1 && rE2.values.f_fx[0].ref === 'e_rage' && rE2.values.f_fx[0].on === false && rE2.done === 1 && rE2.left === 0, jf([rE1.values.f_fx, rE2]));
        check('F4 a renamed library copy read back from a download ("Climbing (Walls)" over Climbing) is found by its key and keeps its own name; a row of their own with the same key stays their own (without the key it cannot share)',
            kRows.length === 2 && kRows[0].defId === 'i_climb' && kRows[0].ov && kRows[0].ov.name === 'Climbing (Walls)' && kRows[0].lvl === 9 && !kRows[1].defId && kRows[1].def && kRows[1].def.name === 'Hand Climbing' && !('key' in kRows[1].def), jf(kRows));
        // a round trip keeps each row whole (a qty list with counters, a switch and stats)
        const gearL = { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'gm', list: { cats: ['Gear'], multi: true, stats: [{ key: 'wt' }], on: { label: 'Worn' }, counters: [{ key: 'uses', label: 'Uses', def: 3 }] } };
        const skL = { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'gm', list: { cats: ['Skill'], noQty: true, multi: true, lvl: { label: 'Level', min: -10, max: 40, def: 10 }, stats: [{ key: 'attr' }] } };
        const mkG = sw => cleanSystem({ v: 1, name: 'G', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', edit: 'gm', def: 10 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'gm', def: 10 }, gearL, skL], items: [{ id: 'i_sword', name: sw || 'Sword', key: 'Sword', category: 'Gear', stats: { wt: 3 } }, { id: 'i_rope', name: 'Rope', key: 'Rope', category: 'Gear', stats: { wt: 2 } }] }, { F, gmView: true });
        const fullG = mkG(), viewG = cleanSystem(fullG, { F, gmView: false }), fnd = v => nm => (v.items || []).filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase());
        const fillG = (fl, sy, v) => S.fillMaking(sy || fullG, { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: {} }, fl, F, { view: v || viewG, lib: null, now: 1000 });
        const srcG = { id: 'c_s', name: 'Pax', ownerId: 'u_a', npc: false, values: { f_st: 14, f_gear: [{ id: 'w_a', defId: 'i_sword', qty: 3, ct: { uses: 2 }, ov: { name: 'Sword of Dawn', stats: { wt: 5 } } }, { id: 'w_b', qty: 2, own: 1, def: { name: 'Lucky charm', category: 'Gear', vis: 'all', stats: { wt: 1 }, mods: [{ f: 'f_st', op: 'add', v: 1 }], modsOn: true } }], f_sk: [{ id: 'w_r', own: 1, qty: 1, lvl: 12, def: { name: 'Rope', category: 'Skill', vis: 'all', stats: { attr: 1 } } }] } };
        const fileG = JSON.parse(JSON.stringify(XF.charToJson(viewG, S.charForView(srcG, viewG), null, { exported: 'x' })));
        const rG = fillG(XF.charFromJson(viewG, fileG, fnd(viewG))), gA = (rG.values.f_gear || []).find(x => x.defId === 'i_sword') || {}, gB = (rG.values.f_gear || []).find(x => x.def && x.def.name === 'Lucky charm') || {}, skG = rG.values.f_sk || [];
        check('F4 a character file read back keeps each row whole: a library copy\'s own name and stats, its quantity and counters; an own row\'s quantity, changes and their switch; an own row named like another category\'s item stays an own row',
            !!gA.ov && gA.ov.name === 'Sword of Dawn' && jf(gA.ov.stats) === jf({ wt: 5 }) && gA.qty === 3 && jf(gA.ct) === jf({ uses: 2 })
            && gB.qty === 2 && !!gB.def && jf(gB.def.mods) === jf([{ f: 'f_st', op: 'add', v: 1 }]) && gB.def.modsOn === true
            && skG.length === 1 && skG[0].defId === undefined && !!skG[0].def && skG[0].def.name === 'Rope' && rG.left === 0, jf(rG.values));
        const othG = JSON.parse(JSON.stringify(fileG)); othG.system.sig = 'nope'; othG.system.fields = { f_a: { key: 'ST', kind: 'number', label: 'ST' }, f_b: { key: 'DX', kind: 'number', label: 'DX' }, f_c: { key: 'Gear', kind: 'item-list', label: 'Gear' }, f_k: { key: 'Skills', kind: 'item-list', label: 'Skills' } };
        othG.values = { f_a: 12, f_c: [{ id: 'w_x', qty: 2, own: 1, def: { name: 'Charm', category: 'Gear', vis: 'all', stats: { wt: 1 }, mods: [{ f: 'f_a', op: 'add', v: 1 }, { f: 'f_b', op: 'add', v: 2 }], modsOn: true } }, { id: 'w_y', qty: 1, on: true, note: 'my rope', ct: { charges: 3, uses: 1 }, def: { name: 'Rope', category: 'Gear' }, lnk: 1 }], f_k: [{ id: 'w_q', qty: 5, own: 1, def: { name: 'Knots', category: 'Skill' } }] };
        const flO = XF.charFromJson(viewG, othG, fnd(viewG)), rO = fillG(flO), cO = (rO.values.f_gear || [])[0] || {}, ropeO = (rO.values.f_gear || []).find(x => x.defId === 'i_rope') || {};
        const fullR = mkG('Longsword'), viewR = cleanSystem(fullR, { F, gmView: false }), flR = XF.charFromJson(viewR, JSON.parse(JSON.stringify(fileG)), fnd(viewR)), rR = fillG(flR, fullR, viewR);
        check('F4 a character file from another campaign: an own row\'s changes remapped by key, the one on a field GM-only here dropped (the row kept); a row\'s facts narrowed to this list (a counter it lacks dropped, the rest kept); no quantity on a list without one; an item renamed since the download found by its id',
            !!cO.def && cO.def.name === 'Charm' && jf(cO.def.mods) === jf([{ f: 'f_st', op: 'add', v: 1 }]) && rO.left === 0 && ropeO.on === true && ropeO.note === 'my rope' && jf(ropeO.ct) === jf({ uses: 1 })
            && !flO.ops.some(o => o.q.op === 'setQty' && o.f === 'f_sk') && ((rO.values.f_sk || [])[0] || {}).qty === 1
            && flR.lost === 0 && (rR.values.f_gear || []).some(x => x.defId === 'i_sword' && x.qty === 3), jf([rO.values, flR.lost, rR.values]));
        const rF1 = fillG({ ops: [{ f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r1' } }, { f: 'f_gear', q: { op: 'set', rowId: 'w_r1', facts: { note: 'ok', lvl: 5 } } }] });
        check('F4 one fact the list refuses never takes the others (each is tried alone), and what is dropped is counted',
            ((rF1.values.f_gear || [])[0] || {}).note === 'ok' && rF1.left === 1 && rF1.done === 1, jf(rF1));
        const rCt = fillG({ ops: [{ f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r2' } }, { f: 'f_gear', q: { op: 'set', rowId: 'w_r2', facts: { ct: { uses: 1, charges: 3 } } } }] });
        check('F4 a fill\'s counters are narrowed to the list\'s own (one it lacks dropped, the rest kept), even when the facts come straight to the host',
            jf(((rCt.values.f_gear || [])[0] || {}).ct) === jf({ uses: 1 }) && rCt.left === 0, jf(rCt));
        // bounded work: a list takes at most LIMITS.carried rows, the rest never reach applyRowOp; a file's field is read once per field of the view. 1.6.2, backlog 211: a fill
        // changes its own copy of a list in place and cleans it once at the end, where each row op used to copy and clean the whole list (7 to 19 s at 1,500 rows; now well under one)
        const many = []; for (let i = 0; i < 4000; i++) many.push({ f: 'f_sk', q: { op: 'custom', rowId: 'w_m' + i.toString(36), def: { name: 'Row ' + i } } });
        const t0 = Date.now(), rMany = fillIt({ lists: ['f_sk'], ops: many }), tMany = Date.now() - t0;
        const bigF = { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: {} }, values: {} }; for (let i = 0; i < 20; i++) { bigF.system.fields['f_z' + i] = { key: 'Skills', kind: 'item-list' }; bigF.values['f_z' + i] = Array.from({ length: 1600 }, (_, k) => ({ def: { name: 'R' + k } })); }
        const flBig = XF.charFromJson(view, bigF, findV);
        const badFirst = []; for (let i = 0; i < LIMITS.carried; i++) badFirst.push({ f: 'f_sk', q: { op: 'add', defId: 'i_none' + i.toString(36), rowId: 'w_b' + i.toString(36) } });
        const rBad = fillIt({ lists: ['f_sk'], ops: badFirst.concat([{ f: 'f_sk', q: { op: 'custom', rowId: 'w_late', def: { name: 'Late' } } }]) });
        check('F4 bounded work: a list takes at most ' + LIMITS.carried + ' rows from a fill (the rest counted, never tried), and a file\'s fields that all name one list are read once — so no file keeps the GM\'s machine busy',
            (rMany.values.f_sk || []).length === LIMITS.carried && rMany.left === 4000 - LIMITS.carried && tMany < 8000 && jf(rBad.values.f_sk) === '[]' && rBad.left === LIMITS.carried + 1 && flBig.ops.filter(o => o.q.op === 'custom').length === LIMITS.carried, jf([rMany.left, tMany, flBig.ops.length]));
        // 1.6.2, backlog 211: the old way (fillWay 'old': a copy and a clean on every op) and the way in place give the same answer, key for key: a fill with no op that fails, one
        // where a fact is refused, one where an add finds nothing, a fill past the cap and a file read whole; an op that fails sends the fill back to the old way, so its answer is that
        const wayOld = (fl, sy, v) => S.fillMaking(sy || fullG, { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: {} }, fl, F, { view: v || viewG, lib: null, now: 1000, fillWay: 'old' });
        const wayFills = [flO, { ops: [{ f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r1' } }, { f: 'f_gear', q: { op: 'set', rowId: 'w_r1', facts: { note: 'ok', lvl: 5 } } }] }, { ops: [{ f: 'f_gear', q: { op: 'add', defId: 'i_none', rowId: 'w_n1' } }, { f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r3' } }] }, { lists: ['f_gear'], ops: [{ f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r4' } }, { f: 'f_gear', q: { op: 'add', defId: 'i_rope', rowId: 'w_r5' } }, { f: 'f_gear', q: { op: 'setQty', rowId: 'w_r4', qty: 3 } }] }];
        const wayDiff = wayFills.map((fl, i) => jf(fillG(fl)) === jf(wayOld(fl)) ? '' : 'fill ' + i).filter(Boolean).concat(jf(rR) === jf(wayOld(flR, fullR, viewR)) ? [] : ['file']);
        const manyOld = S.fillMaking(full, making(), { lists: ['f_sk'], ops: many.slice(0, 300) }, F, { view, lib: null, now: 1000, fillWay: 'old' }), manyNew = fillIt({ lists: ['f_sk'], ops: many.slice(0, 300) });
        check('1.6.2 backlog 211: a fill made in place gives the old way\'s answer key for key, with an op that fails and without, a file read whole and 300 rows of their own',
            !wayDiff.length && jf(manyOld) === jf(manyNew) && (manyNew.values.f_sk || []).length === 300, jf(wayDiff));
        // a list's categories in the players' view: a GM-only item's (or, told by the library, a GM-only entry's) never travels; one a visible item or entry has, or none has, does —
        // absent the library's word (the GM's machine mid-load), only a visible item's; a client's re-clean of the host's view keeps it as it is; an empty list takes none
        const sysC = cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_a', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', list: { cats: ['Skill', 'Shade Art', 'Tool', 'Blueprint', 'Relic'] } }], items: [{ id: 'i_g', name: 'Rope', category: 'Tool' }, { id: 'i_s', name: 'Datacube', category: 'relic', vis: 'gm' }] }, { F, gmView: true });
        const catsOf = (lc, sy) => { const v = cleanSystem(sy || sysC, lc === undefined ? { F, gmView: false } : { F, gmView: false, libCats: lc }); return v ? jf(v.fields[0].list.cats) : 'none'; };
        const vC = cleanSystem(sysC, { F, gmView: false, libCats: { show: ['skill'], hide: ['Shade Art', 'BLUEPRINT'] } });
        check('F4 a list\'s categories in the players\' view: only a visible item\'s without the library\'s word (fail closed); with it, one a visible item or entry has or none has, never one only GM-only things have (an item, a GM-only entry or pack); what the client does again changes nothing; a hostile word is no list',
            catsOf() === jf(['Tool']) && catsOf(null) === jf(['Tool']) && catsOf({}) === jf(['Skill', 'Shade Art', 'Tool', 'Blueprint']) && jf(vC.fields[0].list.cats) === jf(['Skill', 'Tool'])
            && catsOf({ show: ['Relic'], hide: ['Relic'] }) === jf(['Skill', 'Shade Art', 'Tool', 'Blueprint', 'Relic']) && catsOf({}, vC) === jf(['Skill', 'Tool']) && catsOf({ show: 'Relic', hide: 5 }) === jf(['Skill', 'Shade Art', 'Tool', 'Blueprint'])
            && jf(S.cleanSystem(sysC, { F, gmView: true, libCats: { hide: ['Tool'] } }).fields[0].list.cats) === jf(['Skill', 'Shade Art', 'Tool', 'Blueprint', 'Relic']), jf([catsOf(), catsOf({}), vC.fields[0].list.cats]));
        const sysE = cleanSystem({ v: 1, name: 'E', rolls: [], fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', list: { cats: ['Equipment'] } }], items: [{ id: 'i_r', name: 'Rope', category: 'Tool' }] }, { F, gmView: true });
        const vE0 = cleanSystem(sysE, { F, gmView: false }), vE1 = cleanSystem(sysE, { F, gmView: false, libCats: {} }), fE = v => nm => (v.items || []).filter(e => e.name.toLowerCase() === String(nm).toLowerCase());
        const cfE = v => (XF.charFromJson(v, { format: 'waypoint-character', v: 1, name: 'V', system: { sig: 'x', fields: { f_g: { key: 'Gear', kind: 'item-list' } } }, values: { f_g: [{ id: 'w_1', qty: 1, def: { name: 'Rope', category: 'Tool' } }] } }, fE(v)).ops[0] || { q: {} }).q.op;
        check('F4 a list whose categories players cannot see (an empty list in their view) takes no item or entry by name — a file\'s row comes in as its own; a list whose categories they see takes only those',
            jf(vE0.fields[0].list.cats) === '[]' && cfE(vE0) === 'custom' && jf(vE1.fields[0].list.cats) === jf(['Equipment']) && cfE(vE1) === 'custom', jf([cfE(vE0), cfE(vE1)]));
    }
    {   // Onboarding F4b: Start from a file… on the join card
        const wbS4 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), shS4 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), ixS4 = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('Onboarding F4b: the join card offers Start from a file… where making is open and the table lets them (fromFile); it reads the file first (a bad one makes no character), asks a name (the file\'s to start with), makes the character, then fills it (a refused fill leaves it, Import can fill it later) and offers its picture; Help says it',
            /function canFile\(\) \{ var r = rules\(\); return !!\(r && r\.create === 'live' && r\.fromFile && window\.wpSheets && window\.wpSheets\.startFromFile\); \}/.test(wbS4) && /if \(bfl\) bfl\.style\.display = mkOk && canFile\(\) \? '' : 'none';/.test(wbS4)
            && /if \(tg\.closest\('#joinCardFile'\)\) \{ if \(window\.wpSheets && window\.wpSheets\.startFromFile\) window\.wpSheets\.startFromFile\(\); return; \}/.test(wbS4) && /id="joinCardFile"/.test(ixS4)
            && /if \(!isFile && !isOut\) \{ toast\('That is not a character file this table reads\.'\); return; \}\n\s*var whyS = isFile && typeof charFileWhy === 'function' \? charFileWhy\(j\) : ''; if \(whyS\) \{ toast\(whyS\); return; \}[^\n]*\n\s*var prof = n\.getProfile/.test(shS4) && /var r = n\.charMake\(String\(nm\), function\(a\) \{/.test(shS4) && /toast\(fillNote\(b, j\)\); filePicture\(id, j\); \}\);/.test(shS4)
            && /<b>Start from a file&hellip;<\/b> on the card starts one from a file\./.test(ixS4));
        const exA4 = shS4.indexOf('window.wpSheets = {'), exS4 = exA4 < 0 ? '' : shS4.slice(exA4, shS4.indexOf('};', exA4));
        check('Onboarding F4 wiring: window.wpSheets exports what the host\'s fill (playerSystem, playerFinder, charFromJson) and the join card (startFromFile) ask for; the GM\'s tick is in the Host panel',
            /\bplayerSystem: playerSystem\b/.test(exS4) && /\bplayerFinder: playerFinder\b/.test(exS4) && /\bcharFromJson: charFromJson\b/.test(exS4) && /\bstartFromFile: startFromFile\b/.test(exS4)
            && /^function playerFinder\(camp, view\) \{/m.test(shS4) && /^function startFromFile\(\) \{/m.test(shS4) && /<input type="checkbox" id="netMakeFile">/.test(ixS4));
        const foS = shS4.slice(shS4.indexOf('function fillOk('), shS4.indexOf('\n', shS4.indexOf('function fillOk(')));
        const fo = (np, off) => { const camp = { id: 'k', system: {} }; if (np) camp.newPlayers = np; return new Function('getActiveCampaign', 'window', foS + '\nreturn fillOk;')(() => camp, { wpSystemCore: S, wpVtt: { rulesOn: id => !(id === 'sheets' && off) } })(); };
        check('Onboarding F4 fillOk (run for real): the player\'s own gate follows the table\'s rules — on by default, off with the tick off, making off or sheets off, on when making is by invitation',
            fo(null) === true && fo({ fromFile: false }) === false && fo({ create: 'off' }) === false && fo({ create: 'invite' }) === true && fo(null, true) === false);
        const XS4 = await import(url('sheetexport.js')), sfS = shS4.slice(shS4.indexOf('function startFromFile('), shS4.indexOf('function importJson('));
        const sff = async o => {
            const out = { toasts: [], made: [], ups: [], opened: [], notes: [], pics: [], prompts: [], inputs: 0 };
            const n = { charMake: (nm, cb) => { out.made.push(nm); cb(o.make || { charId: 'c_9' }); }, charUpload: (id, j, cb) => { out.ups.push([id, j]); cb(o.up || { n: 0, auto: 2, left: 0 }); }, getProfile: () => ({ name: 'Ann' }) };
            const doc = { createElement: () => { out.inputs++; const inp = { files: null, addEventListener: (ev, f) => { inp.onch = f; }, click: () => { inp.files = [{ size: o.size || 100, text: () => Promise.resolve(o.txt) }]; inp.onch(); } }; return inp; } };
            const fn = new Function('net', 'isClient', 'fillOk', 'toast', 'document', 'isCharFile', 'showPrompt', 'openSheet', 'fillNote', 'filePicture', 'sheetFilesOk', sfS + '\nreturn startFromFile;')(() => n, () => true, () => o.ok !== false, t => out.toasts.push(t), doc, XS4.isCharFile, (q, d, cb) => { out.prompts.push(d); cb(o.name === undefined ? d : o.name); }, id => out.opened.push(id), a => { out.notes.push(a); return 'NOTE'; }, id => { out.pics.push(id); return true; }, () => o.out !== false);
            fn(); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0)); return out;
        };
        const dosT = JSON.stringify({ name: 'Pax', attributes: { strength: { value: 12 } } });
        const sf1 = await sff({ ok: false, txt: dosT }), sf2 = await sff({ size: 8 * 1024 * 1024 + 1, txt: dosT }), sf3 = await sff({ txt: '{"foo":1}', out: false }), sf3b = await sff({ txt: '[{"name":"X"}]' }), sf3c = await sff({ txt: dosT, out: false });
        const sf4 = await sff({ txt: dosT, up: { error: 'Nope.' } }), sf5 = await sff({ txt: dosT }), sf6 = await sff({ txt: JSON.stringify({ format: XS4.FORMAT, v: XS4.VERSION, name: 'Kai', system: {}, values: {} }) }), sf7 = await sff({ txt: dosT, name: '  ' });
        check('Onboarding F4b startFromFile (run for real): nothing where the table does not let them; a file past 8 MB, one that is no character file where the table reads no other sheet file, or one that is no object, makes no character; the name asked starts as the file\'s; the character is made, opened, then filled, with what came of it and its picture; a refused fill leaves it made and says Import can fill it later; a blank name makes nothing',
            sf1.inputs === 0 && sf1.made.length === 0 && /too large/.test(sf2.toasts[0] || '') && sf2.made.length === 0 && sf3.made.length === 0 && sf3.prompts.length === 0 && sf3b.made.length === 0 && sf3c.made.length === 0 && /not a character file this table reads/.test(sf3c.toasts[0] || '')
            && sf4.made.length === 1 && sf4.ups.length === 1 && sf4.notes.length === 0 && sf4.pics.length === 0 && /Import on its sheet can fill it later/.test(sf4.toasts[0] || '') && JSON.stringify(sf4.opened) === '["c_9"]'
            && JSON.stringify(sf5.prompts) === '["Pax"]' && JSON.stringify(sf5.made) === '["Pax"]' && sf5.ups[0][0] === 'c_9' && sf5.notes.length === 1 && JSON.stringify(sf5.pics) === '["c_9"]' && JSON.stringify(sf5.toasts) === '["NOTE"]' && JSON.stringify(sf5.opened) === '["c_9"]'
            && JSON.stringify(sf6.prompts) === '["Kai"]' && sf7.made.length === 0, JSON.stringify([sf1, sf2.toasts, sf4, sf5]));
    }
    /* ---- Help and the tour say what the app does now (the 1.5.0 notes check) ---- */
    {
        const ixH = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, NL), tuH = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, NL), cssH = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, NL);
        const shH = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), vtH = fs.readFileSync(path.join(app, 'scripts', 'vtt.js'), 'utf8');
        const labels = (vtH.slice(vtH.indexOf('var FEATURES = ['), vtH.indexOf('];', vtH.indexOf('var FEATURES = ['))).match(/label: '([^']+)'/g) || []).map(m => m.slice(8, -1));
        const tourVtt = (tuH.match(/title: 'This campaign',\n\s*html: '([^\n]*)'/) || ['', ''])[1];
        check('Help and the tour say what the app does now: the sidebar headers\' actions are on a right-click menu (no "+ next to", no "file button beside +", no search buttons beside the headers); the blast tool takes a radius (no preset explosives); Cover from blockers is in the System editor, not Settings; every VTT feature is in the tour\'s list (and the Help lists name music, token facing and turn-based combat); the character file is .wpchar.json',
            !/Press <b>\+<\/b> next to/.test(ixH) && !/file button beside <b>\+<\/b>/.test(ixH) && !/search buttons beside Planners/.test(tuH) && /Right-click <b>Maps<\/b> in the left sidebar, press <b>\+<\/b>/.test(ixH)
            && !/Frag 12 ft|preset explosive types|Frag, Concussion/.test(ixH) && !/preset explosive types/.test(tuH) && /Press the mark in its corner, pick a shape, type a size, and click a cell\./.test(ixH)
            && !/Settings &#9656; System &#9656; Items/.test(ixH + tuH) && /Cover from blockers<\/b> for your system\. It is on the Combat tab of the <b>System<\/b> editor&rsquo;s <b>Items<\/b> tab\./.test(ixH)
            && labels.length === 17 && labels.every(l => tourVtt.toLowerCase().indexOf(l.toLowerCase()) >= 0) && /Fog of war, token facing, lighting, turn-based combat and table trackers are the exception: they are yours alone\./.test(ixH) && /Fog of war, token facing, lighting, turn-based combat and table trackers are the GM's alone\./.test(ixH) && /fog of war, lighting, turn-based combat, the calendar, video, table trackers, and the VTT integration master/.test(ixH) && /token facing, the minimap, sound, music, dice and character sheets\. The others are visual effects, fog of war, lighting, turn-based combat, the calendar, video, table trackers, personal looks and turn to movement\./.test(ixH)
            && /item\('Character file \(\.wpchar\.json\)'/.test(shH), JSON.stringify(labels.filter(l => tourVtt.toLowerCase().indexOf(l.toLowerCase()) < 0)));
        check('1.6.3 (finding 25, moved on purpose): the sheet\'s pop-out is offered to a player for a sheet of their own too: the window is sent what it shows by the main window (sheets.js popSheetPush), so no save is read',
            !/body\.net-client #sheetPop \{ display: none; \}/.test(cssH) && /var camp = getActiveCampaign\(\); if \(!camp \|\| !sheetOpen \|\| !canOpen\(sheetOpen\)\) return;/.test(shH));
    }
    {   // 1.6.0, backlog 190 (the owner: "a general contingency for if a gm changes their system"; by prompt "Also chat and read pages"): the sheet revision
        const J = JSON.stringify;
        const rawV = { v: 1, name: 'V', rolls: [], sheet: { sections: [] }, sheetRev: 2,
            items: [{ id: 'i_bl', name: 'Blade', vis: 'all' }, { id: 'i_gm', name: 'Hex', vis: 'gm' }],
            fields: [{ id: 'f_str', key: 'Str', label: 'Strength', kind: 'number', vis: 'all', edit: 'owner' }, { id: 'f_note', key: 'Note', label: 'Note', kind: 'text', vis: 'all', edit: 'owner' },
                { id: 'f_sec', key: 'Sec', label: 'Secret', kind: 'number', vis: 'gm' }, { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }, { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all' }] };
        const gV = S.cleanSystem(rawV, { F, gmView: true }), pV = S.cleanSystem(rawV, { F, gmView: false });
        const revOk = gV.sheetRev === 2 && pV.sheetRev === 2 && J(S.cleanSystem(gV, { F, gmView: true })) === J(gV) && !('sheetRev' in S.cleanSystem(Object.assign({}, rawV, { sheetRev: 0 }), { F, gmView: true }))
            && ['x', 1.5, -1, 1e7, NaN, null, true].every(v => S.cleanSheetRev(v) === undefined) && S.cleanSheetRev(1) === 1 && S.cleanSheetRev(1e6) === 1e6 && S.sheetRevOf(gV) === 2 && S.sheetRevOf({}) === 0 && S.sheetRevOf(null) === 0
            && !('sheetRev' in S.cleanSystem(Object.assign({}, rawV, { sheetRev: undefined }), { F, gmView: true }));
        const kael = { id: 'c_k', name: 'Kael', ownerId: 'u_p', values: { f_str: 10, f_note: 'old', f_sec: 5, f_g: [{ id: 'w_a', defId: 'i_bl', qty: 1 }, { id: 'w_s', defId: 'i_gm', qty: 1 }] } };
        const st = c => S.charStale(gV, c);
        const staleOk = st(kael) && !st(Object.assign({}, kael, { sheetRev: 2 })) && !st(Object.assign({}, kael, { sheetRev: 3 })) && st(Object.assign({}, kael, { sheetRev: 1 }))
            && !st(Object.assign({}, kael, { npc: true })) && !st(Object.assign({}, kael, { ownerId: '' })) && !st(Object.assign({}, kael, { making: 1 })) && !st(Object.assign({}, kael, { partial: true }))
            && !S.charStale(Object.assign({}, gV, { sheetRev: undefined }), kael) && !S.charStale(null, kael) && !st(null)
            && J(S.staleOf(gV, { c_k: kael, c_b: Object.assign({}, kael, { id: 'c_b', sheetRev: 2 }), c_o: Object.assign({}, kael, { id: 'c_o', ownerId: 'u_q' }) }, 'u_p').map(c => c.id)) === J(['c_k'])
            && S.staleOf(gV, null, 'u_p').length === 0 && S.staleOf(gV, { c_k: kael }, '').length === 0;
        const cc = S.cleanChar(Object.assign({}, kael, { sheetRev: 2 }), gV, { state: 'host' }), ccBad = S.cleanChar(Object.assign({}, kael, { sheetRev: 'x' }), gV, { state: 'host' });
        const own = S.charFor(Object.assign({}, kael, { sheetRev: 2 }), pV, 'u_p', {}), mate = S.charFor(Object.assign({}, kael, { sheetRev: 2 }), pV, 'u_q', {});
        const charOk = cc.sheetRev === 2 && !('sheetRev' in ccBad) && !('sheetRev' in S.cleanChar(kael, gV, { state: 'host' })) && own && own.sheetRev === 2 && mate && !('sheetRev' in mate);
        const rwSys = { fields: [], items: [{ id: 'i_blade', key: 'blade', name: 'Blade', stats: {} }], core: [] }, rwF = { list: { on: { def: false }, counters: [{ key: 'chg', label: 'Charges' }], stats: [{ key: 'dmg', label: 'Damage' }] } };
        const rwA = S.revRowWords(rwSys, [{ id: 'r1', defId: 'i_blade', ct: { chg: 12 } }], [{ id: 'r1', defId: 'i_blade', ct: { chg: 10 } }], rwF), rwB = S.revRowWords(rwSys, [{ id: 'r1', defId: 'i_blade', on: true, note: 'old', ov: { stats: { dmg: 3 } } }], [{ id: 'r1', defId: 'i_blade', on: false, ov: { stats: { dmg: 4 } } }], rwF), rwC = S.revRowWords(rwSys, [{ id: 'r1', defId: 'i_blade', tt: 1 }], [{ id: 'r1', defId: 'i_blade', tt: 2 }], rwF), rwD = S.revRowWords(rwSys, [{ id: 'r1', defId: 'i_blade', ct: { chg: 12 } }], [{ id: 'r1', defId: 'i_blade', ct: { chg: 10 } }]);
        const longV = 'x'.repeat(500), upL = S.cleanUploads([{ id: 'up_l', charId: 'c_k', changes: [{ id: 'u_1', kind: 'value', f: 'f_a', label: 'L', from: longV, to: longV }] }])[0].changes[0], rwOk = rwA.from.includes('Charges 12') && rwA.to.includes('Charges 10') && rwB.from.includes('on') && rwB.to.includes('off') && rwB.from.includes('note: old') && rwB.to.includes('no note') && rwB.from.includes('Damage 3') && rwB.to.includes('Damage 4') && rwC.from.includes('as the sheet has it') && rwC.to.includes('as the file has it') && rwD.from !== rwD.to && rwA.from !== rwA.to && upL.from.length === S.LIMITS.upWords && upL.to.length === S.LIMITS.upWords;
        check('the Review says what differs between two rows that read alike, by the names of its list, and keeps a value long enough to read whole', rwOk && !/\.upl-from, \.upl-to \{[^}]*(ellipsis|nowrap)/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8')), JSON.stringify([rwA, rwB, rwC, rwD, upL.from.length]));
        const hRow = { id: 'w_a', defId: 'i_a', qty: 1, ov: { stats: { wt: 3, cr: 1 }, held: ['wt'] } }, hNew = S.revRows([{ id: 'x1', defId: 'i_a', qty: 1, ov: { stats: { wt: 3, cr: 1 } } }], [hRow], {})[0], hGone = S.revRows([{ id: 'x1', defId: 'i_a', qty: 1, ov: { stats: { cr: 1 } } }], [hRow], {})[0], hSaid = S.revRows([{ id: 'x1', defId: 'i_a', qty: 1, ov: { stats: { wt: 3, cr: 1 }, held: ['cr'] } }], [hRow], {})[0];
        const hSys = { v: 1, name: 'H', fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'wt', label: 'Weight' }] } }], items: [{ id: 'i_a', key: 'axe', name: 'Axe', stats: { wt: 2 } }], core: [] }, hG = S.cleanSystem(hSys, { F, gmView: true }), hP = S.cleanSystem(hSys, { F, gmView: false }), hCh = { id: 'c_h', name: 'Hale', ownerId: 'u_p', values: { f_g: [{ id: 'w_a', defId: 'i_a', qty: 1, ov: { stats: { wt: 5 }, held: ['wt'] } }] } };
        const hFile = S.revProposal(hG, hCh, { values: {}, lists: ['f_g'], ops: [{ f: 'f_g', q: { op: 'add', defId: 'i_a', rowId: 'w_z', qty: 1, ov: { stats: { wt: 5 } } } }] }, F, { view: hP }), hOk = J(hNew.ov) === J(hRow.ov) && J(hGone.ov) === J({ stats: { cr: 1 } }) && J(hSaid.ov) === J({ stats: { wt: 3, cr: 1 }, held: ['cr'] }) && !!hFile && hFile.changes.length === 0;
        check('a sheet\'s own file read back offers no change and keeps the marks of the figures the GM set: a file says a row\'s stats and nothing of which are held, so a row keeps its own marks for the stats the file still names', hOk, J([hNew, hGone, hSaid, hFile && hFile.changes]));
        const ups = S.cleanUploads([{ id: 'up_a', charId: 'c_k', changes: [], rev: true }, { id: 'up_b', charId: 'c_k', changes: [], rev: 'yes' }]);
        const upOk = ups.length === 2 && ups[0].rev === true && !('rev' in ups[1]) && J(ups[0].changes) === '[]';
        // revProposal: a Waypoint file for an out-of-date character, one value change a field that differs; a GM-only row stays; effects and GM fields never offered
        const fill = { values: { f_str: 12, f_note: 'old', f_sec: 99 }, lists: ['f_g'], ops: [{ f: 'f_g', q: { op: 'add', defId: 'i_bl', rowId: 'w_b', qty: 2 } }], fxLists: ['f_fx'] };
        const pr = S.revProposal(gV, kael, fill, F, { view: pV }), byF = {}; (pr ? pr.changes : []).forEach(c => { byF[c.f] = c; });
        const gList = byF.f_g ? byF.f_g.value : [];
        const propOk = !!pr && J(Object.keys(byF).sort()) === J(['f_g', 'f_str']) && byF.f_str.kind === 'value' && byF.f_str.value === 12 && byF.f_str.from === '10' && byF.f_str.to === '12' && byF.f_str.label === 'Strength' && byF.f_str.accept === true
            && Array.isArray(gList) && gList.some(r => r.defId === 'i_gm' && r.id === 'w_s') && gList.some(r => r.defId === 'i_bl') && gList.some(r => r.id === 'w_a' && r.defId === 'i_bl' && r.qty === 2) /* 1.6.0, moved on purpose: a row both hold stays the sheet's own row */ && byF.f_g.from === 'Blade' && byF.f_g.to === 'Blade ×2'
            && pr.changes.every(c => /^u_[a-z0-9]+$/.test(c.id)) && J(kael.values.f_g.map(r => r.id)) === J(['w_a', 's'.replace('s', 'w_s')]) && kael.making === undefined
            && J(S.cleanUploads([{ id: 'up_c', charId: 'c_k', changes: pr.changes, rev: true }])[0].changes.map(c => c.f).sort()) === J(['f_g', 'f_str']);
        // a copy held again under its own name comes back from Waypoint's own file as a row of its own (fillMaking passes its name to the add), and a list that loses rows is offered unticked
        const XR = await import(url('sheetexport.js'));
        const sysA = S.cleanSystem({ v: 1, name: 'A', rolls: [], sheet: { sections: [] }, sheetRev: 1, items: [{ id: 'i_pot', name: 'Pot', again: 'name' }], fields: [{ id: 'f_k', key: 'Kit', label: 'Kit', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'On' } } }] }, { F, gmView: true }), pA = S.cleanSystem(sysA, { F, gmView: false });
        const brenA = { id: 'c_b', name: 'Bren', ownerId: 'u_p', values: { f_k: [{ id: 'w_1', defId: 'i_pot', qty: 1 }, { id: 'w_2', defId: 'i_pot', qty: 1, on: false, ov: { name: 'Spare pot' } }] } };
        const fileA = XR.charToJson(pA, S.charForView(brenA, pA), null, {}), fillA = XR.charFromJson(pA, JSON.parse(J(fileA)), nm => (pA.items || []).filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase()));
        const prA = S.revProposal(sysA, brenA, fillA, F, { view: pA }), mkA = S.fillMaking(sysA, Object.assign({}, brenA, { making: 1, values: {} }), fillA, F, { view: pA });
        const lostA = S.revProposal(sysA, brenA, { lists: ['f_k'], ops: [{ f: 'f_k', q: { op: 'add', defId: 'i_pot', rowId: 'w_x' } }, { f: 'f_k', q: { op: 'add', defId: 'i_pot', rowId: 'w_y' } }] }, F, { view: pA });
        const againOk = !!prA && prA.changes.length === 0 && mkA.ok && J((mkA.values.f_k || []).map(r => [r.defId, r.qty, r.ov && r.ov.name])) === J([['i_pot', 1, undefined], ['i_pot', 1, 'Spare pot']])
            && !!lostA && lostA.changes.length === 1 && lostA.changes[0].accept === false && /could not place/.test(lostA.changes[0].label);
        const same = S.revProposal(gV, kael, { values: { f_str: 10 } }, F, { view: pV }), applied =S.applyProposal(gV, kael, pr, { [byF.f_str.id]: true, [byF.f_g.id]: true }, F, {});
        const kaelK = JSON.parse(J(kael)), rowK = kaelK.values.f_g.filter(r => r.id === 'w_a')[0]; Object.assign(rowK, { fd: { defId: 'i_r' }, bu: { h: [1] }, paid: 5 });
        const prK = S.revProposal(gV, kaelK, fill, F, { view: pV }), rowN = ((prK.changes.filter(c => c.f === 'f_g')[0] || {}).value || []).filter(r => r.id === 'w_a')[0] || {};
        check('1.6.0 a file read for a character in play: a row the sheet holds too stays that row, with its id and what no file carries (a round fired, a burst\'s marks, what was paid), taking only what the file says, and its line names what differs', rowN.qty === 2 && J(rowN.fd) === J({ defId: 'i_r' }) && J(rowN.bu) === J({ h: [1] }) && rowN.paid === 5, J(rowN));
        const applyOk = againOk && !!same && same.changes.length === 0 && applied.done === 2 && applied.values.f_str === 12 && applied.values.f_sec === 5 && S.revProposal(gV, null, fill, F, {}) === null && S.revProposal(gV, kael, null, F, {}) === null;
        // the sheet's bar, Mark current and the two buttons of the Characters tab (sheets.js, sliced by its stalebar markers and run for real on a page of plain objects)
        const shV = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const sbI = shV.indexOf('// [systemcheck:stalebar-start]'), sbK = shV.indexOf('// [systemcheck:stalebar-end]'), sbSrc = sbI >= 0 && sbK > sbI ? shV.slice(sbI, sbK) : '';
        const mkE = (tag, cls, text) => { let tx = text == null ? '' : String(text); const e = { tag, className: cls || '', children: [], style: {}, on: {}, title: '', type: '', get textContent() { return tx; }, set textContent(v) { tx = String(v); e.children.length = 0; }, appendChild(x) { e.children.push(x); return x; }, addEventListener(k, fn) { e.on[k] = fn; } }; return e; };
        const bar = mkE('div'), log = [];
        let campV, gmClient = false, writeOk = true, upl = [];
        const SB = new Function('ui', 'el', 'systemOf', 'uploadsOf', 'isClient', 'canWrite', 'openReview', 'importJson', 'getActiveCampaign', 'charById', 'afterCharChange', 'toast', 'net', 'charsOf', 'showConfirm', 'save', 'renderAll', 'renderViews', 'window', 'draft',
            sbSrc + '\nreturn { renderStaleBar, markCurrent, askNewSheets, allSheetsCurrent, staleCount };')(
            id => (id === 'sheetStaleBar' ? bar : null), mkE, c => (c ? c.system : null), () => upl, () => gmClient, () => writeOk, (a, b, cId) => log.push('review ' + cId), () => log.push('import'), () => campV, id => (campV.chars[id] || null),
            (c, whole) => log.push('after ' + c.id + ' ' + c.sheetRev + ' ' + whole), t => log.push('toast ' + t), () => ({ logEvent: (k, t) => log.push('log ' + t), syncSystem: () => log.push('sync'), uploadDone: (id, a, b) => log.push('done ' + id + ' ' + a + ' ' + b) }), c => c.chars,
            (q, cb, o) => { log.push('ask ' + (o && o.yes)); cb(true); }, () => log.push('save'), () => log.push('renderAll'), () => log.push('renderViews'), { wpSystemCore: S }, null);
        const btnsF = () => bar.children.reduce((a, k) => a.concat(k.tag === 'button' ? [k] : /(^| )ui-seg( |$)/.test(k.className || '') ? k.children.filter(b => b.tag === 'button') : []), []), labels = () => btnsF().map(b => b.textContent); /* 1.6.2 (backlog 225): the two stand in one .ui-seg, moved on purpose */
        campV = { system: gV, chars: { c_k: JSON.parse(J(kael)), c_n: { id: 'c_n', name: 'Npc', npc: true, values: {} } } };
        SB.renderStaleBar(campV.chars.c_k, campV, true, false); const gmL = [bar.style.display, labels()];
        upl = [{ id: 'up_r', rev: true, changes: [{ id: 'u_0', kind: 'value' }] }, { id: 'up_x', changes: [] }]; SB.renderStaleBar(campV.chars.c_k, campV, true, false); const gmR = labels(), rvSeg = bar.children.filter(k => k.className === 'ui-seg sheet-rv-seg'), rvSegOk = rvSeg.length === 1 && J(rvSeg[0].children.map(b => b.textContent)) === J(['Review', 'Mark current']); btnsF()[0].on.click(); const revLog = log.slice(-1)[0];
        gmClient = true; SB.renderStaleBar(campV.chars.c_k, campV, false, true); const plL = [bar.style.display, labels()]; bar.children[1].on.click(); const impLog = log.slice(-1)[0];
        SB.renderStaleBar(campV.chars.c_k, campV, false, false); const mateL = bar.style.display; gmClient = false;
        SB.renderStaleBar(Object.assign({}, campV.chars.c_k, { sheetRev: 2 }), campV, true, false); const curL = bar.style.display;
        log.length = 0; const mk = SB.markCurrent('c_k'); const mkOk = mk === true && campV.chars.c_k.sheetRev === 2 && log[0] === 'after c_k 2 true' && /Kael is current/.test(log[1]);
        campV.chars.c_k.sheetRev = 1; campV.chars.c_m = Object.assign(JSON.parse(J(kael)), { id: 'c_m', name: 'Mira' }); log.length = 0; SB.allSheetsCurrent(); const allOk = campV.chars.c_k.sheetRev === 2 && campV.chars.c_m.sheetRev === 2 && log.filter(x => /^after /.test(x)).length === 2;
        log.length = 0; SB.askNewSheets(); const askOk = campV.system.sheetRev === 3 && log.indexOf('ask Ask for new sheets') === 0 && log.indexOf('sync') > 0 && log.indexOf('save') > 0 && SB.staleCount(campV) === 2;
        writeOk = false; log.length = 0; const noW = SB.markCurrent('c_k') === false && log.length === 0; writeOk = true;
        const barOk = sbSrc !== '' && rvSegOk && gmL[0] === '' && J(gmL[1]) === J(['Mark current']) && J(gmR) === J(['Review', 'Mark current']) && revLog === 'review up_r' && plL[0] === '' && J(plL[1]) === J(['Send a new sheet…']) && impLog === 'import'
            && mateL === 'none' && curL === 'none' && mkOk && allOk && askOk && noW && !/innerHTML/.test(sbSrc);
        // found live, 2026-10-30: a new sheet with nothing to apply is said so and offered as no work; the Review it opens says so; Mark current settles it, and what waits goes at once
        {
            const sysN = Object.assign(JSON.parse(J(gV)), { sheetRev: 9 }), mkN = (id, nm) => Object.assign(JSON.parse(J(kael)), { id, name: nm, sheetRev: 1 });
            const ent = (id, charId, extra) => Object.assign({ id, charId, from: 'u_1', name: 'Pat', at: 1, changes: [] }, extra);
            const line = { id: 'u_0', kind: 'value', f: 'f_str', label: 'Strength', from: '10', to: '12', value: 12, accept: true }, note = { id: 'u_1', kind: 'note', label: 'Read as is' };
            const coreOk = S.upChanges(ent('up_a', 'c_k')) === 0 && S.upChanges(ent('up_a', 'c_k', { changes: [note] })) === 0 && S.upChanges(ent('up_a', 'c_k', { changes: [note, line] })) === 1 && S.upChanges(null) === 0
                && S.revIdle(sysN, mkN('c_k', 'Kael'), ent('up_a', 'c_k', { rev: true })) === false && S.revIdle(sysN, Object.assign(mkN('c_k', 'Kael'), { sheetRev: 9 }), ent('up_a', 'c_k', { rev: true })) === true
                && S.revIdle(sysN, Object.assign(mkN('c_k', 'Kael'), { sheetRev: 9 }), ent('up_a', 'c_k', { rev: true, changes: [line] })) === false && S.revIdle(sysN, Object.assign(mkN('c_k', 'Kael'), { sheetRev: 9 }), ent('up_a', 'c_k')) === false && S.revIdle(sysN, null, ent('up_a', 'c_k', { rev: true })) === true;
            const uoI = shV.indexOf('function uploadsOf('), uoSrc = shV.slice(uoI, shV.indexOf('\n', uoI));
            const uploadsOfR = new Function('cleanUploads', 'revIdle', 'systemOf', 'charById', uoSrc + '\nreturn uploadsOf;')(S.cleanUploads, S.revIdle, c => c.system, (id, c) => c.chars[id] || null);
            const held = { system: sysN, chars: { c_k: mkN('c_k', 'Kael') }, uploads: [ent('up_a', 'c_k', { rev: true })] }, done = { system: sysN, chars: { c_k: Object.assign(mkN('c_k', 'Kael'), { sheetRev: 9 }) }, uploads: [ent('up_a', 'c_k', { rev: true }), ent('up_b', 'c_k', { rev: true, changes: [line] }), ent('up_c', 'c_k', { ask: true, changes: [line] })] };
            const waitsOk = J(uploadsOfR(held, 'c_k').map(u => u.id)) === J(['up_a']) && J(uploadsOfR(done, 'c_k').map(u => u.id)) === J(['up_b', 'up_c']) && J(uploadsOfR(done, null).map(u => u.id)) === J(['up_b', 'up_c']) && J(uploadsOfR(done, 'c_z')) === '[]';
            campV = { system: sysN, chars: { c_k: mkN('c_k', 'Kael'), c_m: mkN('c_m', 'Mira') } };
            upl = [ent('up_e', 'c_k', { rev: true })]; SB.renderStaleBar(campV.chars.c_k, campV, true, false); const noneL = labels(), noneT = bar.children[0].textContent;
            upl = [ent('up_e', 'c_k', { rev: true, changes: [note] })]; SB.renderStaleBar(campV.chars.c_k, campV, true, false); const noteL = labels();
            upl = [ent('up_e', 'c_k', { rev: true, changes: [note, line] })]; SB.renderStaleBar(campV.chars.c_k, campV, true, false); const realL = labels(), realT = bar.children[0].textContent; upl = [];
            const barNOk = J(noneL) === J(['Mark current', 'Mark all current']) && noneT === 'Its player sent a new sheet and it changes nothing here. Press Mark current and they play again.' && J(noteL) === J(['Mark current', 'Mark all current']) && J(realL) === J(['Review', 'Mark current', 'Mark all current']) && /waits for your review/.test(realT);   /* Mark all current moved on purpose: this fixture holds more than one out-of-date sheet */
            // Mark current: an entry with nothing to apply goes and its player is told; one with changes stays as any update; another character's and an ask stay as they were
            campV.uploads = [ent('up_e', 'c_k', { rev: true }), ent('up_m', 'c_m', { rev: true }), ent('up_a', 'c_k', { ask: true, changes: [line] })]; log.length = 0;
            const mkE1 = SB.markCurrent('c_k'), left1 = campV.uploads.map(u => u.id), log1 = log.slice();
            campV.chars.c_k.sheetRev = 1; campV.uploads = [ent('up_r', 'c_k', { rev: true, changes: [line] })]; log.length = 0;
            const mkE2 = SB.markCurrent('c_k'), left2 = J(campV.uploads), log2 = log.slice();
            const markOk = mkE1 === true && J(left1) === J(['up_m', 'up_a']) && campV.chars.c_k.sheetRev === 9 && log1.indexOf('done c_k 0 0') >= 0 && log1.some(x => x === 'toast Kael is current: its player plays again.')
                && mkE2 === true && left2 === J([ent('up_r', 'c_k', { changes: [line] })]) && log2.indexOf('done c_k 0 0') < 0 && log2.some(x => x === 'toast Kael is current: its player plays again. The new sheet it sent still waits in your Review.');
            // Mark all current settles every one of them; a new ask leaves no sheet that said nothing behind it
            campV.chars.c_k.sheetRev = 1; campV.chars.c_m.sheetRev = 1; campV.uploads = [ent('up_e', 'c_k', { rev: true }), ent('up_r', 'c_m', { rev: true, changes: [line] })]; log.length = 0; SB.allSheetsCurrent();
            const allNOk = J(campV.uploads.map(u => [u.id, u.rev === true])) === J([['up_r', false]]) && campV.chars.c_k.sheetRev === 9 && campV.chars.c_m.sheetRev === 9;
            campV.uploads = [ent('up_e', 'c_k', { rev: true }), ent('up_r', 'c_m', { rev: true, changes: [line] }), ent('up_x', 'c_k')]; SB.askNewSheets();
            const askNOk = J(campV.uploads.map(u => u.id)) === J(['up_r', 'up_x']) && S.sheetRevOf(campV.system) === 10; sysN.sheetRev = 9;
            // the Review, sliced and run for real: the head and the list say so, its button makes the character current, and that is all the toast says
            const urK = shV.indexOf('// [sinkcheck:uploadreview-start]'), urZ = shV.indexOf('// [sinkcheck:uploadreview-end]'), nodes = { uploadModal: mkE('div'), uploadHead: mkE('h3'), uploadHint: mkE('div'), uploadList: mkE('div'), uploadApply: mkE('button'), uploadReject: mkE('button') }, logQ = [];
            const campQ = { system: sysN, chars: { c_k: mkN('c_k', 'Kael') }, uploads: [ent('up_e', 'c_k', { rev: true })] };
            const REVQ = new Function('ui', 'getActiveCampaign', 'uploadsOf', 'charById', 'isClient', 'el', 'systemOf', 'F', 'applyProposal', 'afterCharChange', 'net', 'toast', 'save', 'renderViews', 'closeReview', 'window', 'var _review = null, lastChange = null;\n' + shV.slice(urK, urZ) + '\nreturn openReview;')(
                id => nodes[id], () => campQ, (cp, id) => uploadsOfR(cp, id), (id, cp) => (cp || campQ).chars[id] || null, () => false, mkE, cp => cp && cp.system, () => F, S.applyProposal, () => logQ.push('after'), () => ({ uploadDone: (id, a, b) => logQ.push('done ' + a + ' ' + b) }), t => logQ.push(t), () => {}, () => {}, () => logQ.push('closed'), { wpSystemCore: S });
            REVQ('c_k'); const headQ = nodes.uploadHead.textContent, listQ = nodes.uploadList.children.map(k => [k.className, k.textContent]), btnQ = [nodes.uploadApply.textContent, nodes.uploadApply.disabled], hintQ = nodes.uploadHint.style.display;
            nodes.uploadApply.onclick();
            const reviewOk = headQ === 'Pat\u2019s sheet update for Kael: nothing to apply' && hintQ === 'none' && J(listQ) === J([['upl-none', 'Nothing in it differs from the sheet as it stands. Mark current lets its player play again.']]) && J(btnQ) === J(['Mark current', false])
                && J(logQ) === J(['after', 'done 0 0', 'Kael is current: its player plays again.', 'closed']) && campQ.chars.c_k.sheetRev === 9 && campQ.uploads.length === 0;
            const netV = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
            const wordsOk = netV.includes("if (staleU && !nU) tU = (profU.name || 'A player') + ' sent a new sheet for ' + (chU.name || 'their character') + '. It changes nothing, so Mark current lets them play again.';")
                && netV.includes("(ofN ? ' (' + ofN + (ofN === 1 ? ' change' : ' changes') + ' not taken)' : '') + '.');") && netV.includes('if (prU.changes.length || joinU.length || staleU) {') /* 1.6.2: and a joined sheet's changes (moved on purpose) */ && shV.includes("import { upChanges, revIdle } from './systemcore.js';")
                && sbSrc.includes("if (typeof renderReviewChip === 'function') renderReviewChip();   // the header's Review goes at once");
            check('found live, 2026-10-30: a new sheet with nothing to apply: upChanges counts what can be applied (a note is no change) and revIdle is an entry that asks nothing; uploadsOf (the one list the header\'s Review, the sheet\'s Review, the card and the bell read) leaves such an entry out, an out-of-date character\'s stays; the sheet\'s bar says so and offers Mark current alone; Mark current and Mark all current settle what waits: nothing to apply goes and its player is told, changes stay as a plain sheet update and say so, another character\'s and an ask are left, the header\'s Review repainted at once; a new ask drops such an entry; the Review, run for real, says so in its head and its list, with no word of ticks, and its button makes the character current',
                coreOk && waitsOk && barNOk && markOk && allNOk && askNOk && reviewOk && wordsOk, J([coreOk, waitsOk, barNOk, markOk, allNOk, askNOk, reviewOk, wordsOk, noneL, noneT, noteL, realL, left1, log1, left2, log2, headQ, listQ, btnQ, logQ]));
        }
        const ixV = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const wiredOk = shV.includes("    if (typeof renderStaleBar === 'function') renderStaleBar(c, camp, gm, own);") && shV.includes("var nsB = ui('sysNewSheets'); if (nsB) nsB.addEventListener('click', askNewSheets);") && shV.includes("var acB = ui('sysSheetsCurrent'); if (acB) acB.addEventListener('click', allSheetsCurrent);")
            && shV.includes("if (up.rev === true && window.wpSystemCore && typeof window.wpSystemCore.sheetRevOf === 'function') { var srA = window.wpSystemCore.sheetRevOf(sys); if (srA) { ch2.sheetRev = srA;") && shV.includes("apply.disabled = (!n && up.rev !== true) || noRd;")
            && !shV.includes("staleJ") && shV.includes("var srN = window.wpSystemCore && typeof window.wpSystemCore.sheetRevOf === 'function' ? window.wpSystemCore.sheetRevOf(camp.system) : 0; if (srN) c.sheetRev = srN;")
            && ixV.includes('id="sheetStaleBar"') && ixV.includes('id="sysNewSheets"') && ixV.includes('id="sysSheetsCurrent"') && /<b>New sheets after a change<\/b>/.test(ixV);
        check('1.6.0, backlog 190: a system may carry a sheet revision (sheetRev, a whole number 1 to 1e6, the same in both views, absent where none) and a character the revision it was last made current at (kept by cleanChar, on its owner\'s copy alone); '
            + 'a player\'s character below the system\'s revision is out of date (charStale: never an NPC, one with no player, one in the making or a teammate\'s copy), staleOf lists a player\'s; an upload entry keeps rev only as true; '
            + 'revProposal reads Waypoint\'s own file as a fill of one in the making would be and offers one value change a field that differs, a GM-only row kept, an effects list and a GM field never offered, nothing for a file that changes nothing, and applyProposal applies it; '
            + 'the sheet\'s bar (renderStaleBar, sliced and run for real): the GM\'s Review and Mark current, the player\'s Send a new sheet, nothing for a teammate or a current sheet; Mark current, Mark all current and Ask for new sheets, the wiring, the page and Help',
            revOk && staleOk && charOk && upOk && propOk && applyOk && barOk && wiredOk, J([revOk, staleOk, charOk, upOk, propOk, applyOk, barOk, wiredOk, pr && pr.changes.map(c => [c.f, c.from, c.to]), gList.map(r => [r.id, r.defId]), gmL, gmR, plL, mateL, curL, log]));
    }
    {   // found live, 2026-10-30: a character dropped from the Campaign Cast (whiteboard.js castPlace, and sheets.js syncOwners, sliced and run for real with the real chooser)
        const J = JSON.stringify, rd = f => fs.readFileSync(path.join(app, 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
        const wbC = rd('whiteboard.js'), shC = rd('sheets.js'), cpA = wbC.indexOf('// [systemcheck:castplace-start]'), cpZ = wbC.indexOf('// [systemcheck:castplace-end]');
        if (cpA < 0 || cpZ < cpA) throw new Error('systemcheck: the castplace slice is not marked');
        const soA = shC.indexOf('function syncOwners(camp, keep) {'), soSrc = shC.slice(soA, shC.indexOf('\n}\n', soA) + 3);
        const drop = (o) => {   // o: chars, players, cid (the cast entry's character), count, already (the map's own tokens), off (sheets off)
            const m = { id: 'm1', type: 'map', whiteboard: (o.already || []).slice() }, camp = { id: 'k1', chars: o.chars, players: o.players || {}, items: { m1: m }, cast: { e1: { id: 'e1', name: 'Hero', kind: 'circle', src: '', w: 60, h: 52, color: '#123456', charStats: '', shape: '', charId: o.cid } } };
            if (o.cid === undefined) delete camp.cast.e1.charId;
            const seen = [], sync = new Function('getActiveCampaign', 'migrateBindings', 'net', 'charsOf', 'playerNames', 'applyOwnerOps', 'ownedTokenPlan', 'sheetsOnIn', soSrc + '\nreturn syncOwners;')(() => camp, S.migrateBindings, () => null, c => c.chars, () => ({}), S.applyOwnerOps, S.ownedTokenPlan, () => !o.off);
            const win = { wpSheets: { syncOwners: sync } };
            const IO = () => ({ then: f => f({ save() { seen.push(m.whiteboard.map(w => w.ownerId || '')); }, toast() {} }) });
            new Function('getActiveCampaign', 'getActiveMap', 'castOf', 'window', 'IO', wbC.slice(cpA, cpZ).replace("import('./io.js')", 'IO()') + '\nreturn castPlace;')(() => camp, () => m, c => c.cast, win, IO)('e1', 100, 100, o.count || 1);
            return { toks: m.whiteboard, made: m.whiteboard.filter(w => !(o.already || []).includes(w)), seen };
        };
        const char = (id, ownerId, extra) => Object.assign({ id, name: id, ownerId, npc: false, values: {}, updated: 1 }, extra), P = { u_a: { name: 'Pat', charId: 'c_a' }, u_b: { name: 'Sam', charId: 'c_b' } };
        const cs = () => ({ c_a: char('c_a', 'u_a'), c_b: char('c_b', 'u_b'), c_kept: char('c_kept', 'u_a'), c_none: char('c_none', ''), c_npc: char('c_npc', '', { npc: true }), c_make: char('c_make', 'u_b', { making: 1 }) });
        const inPlay = drop({ chars: cs(), players: P, cid: 'c_a' }), another = drop({ chars: cs(), players: P, cid: 'c_b' }), none = drop({ chars: cs(), players: P, cid: 'c_none' }), npc = drop({ chars: cs(), players: P, cid: 'c_npc' }), kept = drop({ chars: cs(), players: P, cid: 'c_kept' }), making = drop({ chars: cs(), players: P, cid: 'c_make' });
        const off = drop({ chars: cs(), players: P, cid: 'c_kept', off: true }), bare = drop({ chars: cs(), players: P }), mooks = drop({ chars: cs(), players: P, cid: 'c_a', count: 3 });
        const heldT = { id: 't_held', isChar: true, charId: 'c_a', ownerId: 'u_a', x: 0, y: 0 }, twice = drop({ chars: cs(), players: P, cid: 'c_a', already: [heldT] });
        const own1 = r => J(r.made.map(w => [w.charId || '', 'ownerId' in w ? w.ownerId : null]));
        check('a character dropped from the Campaign Cast (castPlace and syncOwners run for real with the real chooser): its token goes to the character\'s player, whichever character it is, before the save that sends it; a character with no player, an NPC or one in the making stays with none; a kept character\'s token stays the GM\'s, as the chooser has it, and with sheets off every owned one counts as in play; a second token where its player holds one stays the GM\'s, the held one untouched; several copies are separate mooks with no owner and no sheet; an entry with no character is left alone',
            own1(inPlay) === J([['c_a', 'u_a']]) && own1(another) === J([['c_b', 'u_b']]) && J(inPlay.seen) === J([['u_a']]) && own1(none) === J([['c_none', null]]) && own1(npc) === J([['c_npc', null]]) && own1(making) === J([['c_make', null]]) && own1(kept) === J([['c_kept', null]]) && own1(off) === J([['c_kept', 'u_a']])
            && own1(bare) === J([['', null]]) && mooks.made.length === 3 && mooks.made.every(w => !w.charId && !('ownerId' in w)) && own1(twice) === J([['c_a', null]]) && heldT.ownerId === 'u_a'
            && wbC.includes("if (c.charId && count === 1 && window.wpSheets && window.wpSheets.syncOwners) window.wpSheets.syncOwners(camp);") && shC.includes('syncOwners: syncOwners,'),
            J([inPlay, another, none, npc, making, kept, off, bare, mooks, twice].map(own1)));
    }
    {   // 1.6.0: a sheet's own file read back is no change (a player's whole character, written and read as the Review reads it, run for real)
        const X = await import(url('sheetexport.js'));
        const raw = { v: 1, name: 'Read back', fields: [
            { id: 'f_pow', key: 'Pow', label: 'Pow', kind: 'number', vis: 'all', edit: 'owner' },
            { id: 'f_spd', key: 'Spd', label: 'Spd', kind: 'formula', vis: 'all', formula: 'Pow / 4' },
            { id: 'f_tr', key: 'Traits', label: 'Traits', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'On', def: false }, lvl: { label: 'Level', min: 0, max: 20, step: 1, def: 0 }, counters: [{ key: 'chg', label: 'Charges' }, { key: 'use', label: 'Uses' }], stats: [{ key: 'wt', label: 'Weight' }, { key: 'tier', label: 'Class', labels: ['None', 'Light'], hide: true }] } },
        ], items: [
            { id: 'i_hardy', key: 'Hardy', name: 'Hardy', list: 'f_tr', stats: { wt: 1 } },
            { id: 'i_blade', key: 'Blade', name: 'Blade', list: 'f_tr', stats: { wt: 2 } },
            { id: 'i_coif', key: 'Coif', name: 'Coif', list: 'f_tr', stats: { wt: 2, tier: 1 } },
            { id: 'i_cloak', key: 'Cloak', name: 'Cloak', list: 'f_tr', stats: { wt: 1 } },
        ] };
        const sG = cleanSystem(raw, { F, gmView: true }), sP = cleanSystem(raw, { F, gmView: false }), itemsOf = {}; (sG.items || []).forEach(i => { itemsOf[i.id] = i; });
        const own = { id: 'w_own', qty: 1, lvl: 3, def: { name: 'Hardy', key: 'Hardy', stats: { wt: 4 }, mods: [{ f: 'f_spd', op: 'add', v: 0.5 }, { f: 'f_pow', op: 'add', v: 1, lvl: true }] } };
        const cRaw = { id: 'c_rb', name: 'Pebbles', ownerId: 'u_p', npc: false, values: { f_pow: 8, f_tr: [own,
            { id: 'w_a', defId: 'i_blade', qty: 1 },
            { id: 'w_b', defId: 'i_cloak', qty: 1, on: true, ct: { use: 1, chg: 2 } },
            { id: 'w_c', defId: 'i_coif', qty: 1, ov: { stats: { wt: 1, tier: 1 }, held: ['wt', 'tier'] } },
            { id: 'w_d', defId: 'i_gone', qty: 1, lvl: 2, ov: { name: 'Old sword (worn)' }, snap: { name: 'Old sword', vis: 'all', key: 'OldSword', stats: { wt: 3 } } },
        ] } };
        const c = cleanChar(cRaw, sG, { state: 'host' }), view = S.charForView(c, sP, { items: itemsOf, full: sG }), all = resolveAll(sP, view, F, null);
        const find = n => (sP.items || []).filter(i => i.name.toLowerCase() === String(n).trim().toLowerCase()), findKey = k => (sP.items || []).filter(i => i.key.toLowerCase() === String(k).trim().toLowerCase());
        const file = () => JSON.parse(JSON.stringify(X.charToJson(sP, view, all, { exported: '' })));
        const fill = X.charFromJson(sP, file(), find, findKey), pr = S.revProposal(sG, c, fill, F, { view: sP }), ownOp = fill.ops.filter(o => o.q.rowId === fill.ops[0].q.rowId)[0].q;
        const j2 = file(); j2.values.f_tr[1].lvl = 7; const pr2 = S.revProposal(sG, c, X.charFromJson(sP, j2, find, findKey), F, { view: sP });
        const j3 = file(); j3.system.sig = 'another'; const named = X.charFromJson(sP, j3, find, findKey).ops[0].q;
        check('1.6.0 a sheet\'s own file read back offers no change (charToJson, charFromJson and revProposal, run for real on a player\'s whole character): a row of its own named as an entry stays its own on this very system, with a change on a worked-out field and one per level kept; a level and a switch left blank read as their defaults; counters in another order; a stat the player\'s file does not name at the entry\'s own figure; and a row whose entry has left the library, known by its name. A real change is still offered, and on another system a row of its own is still matched by its name',
            !!pr && j(pr.changes) === '[]' && ownOp.op === 'custom' && j(ownOp.def.mods) === j([{ f: 'f_spd', op: 'add', v: 0.5 }, { f: 'f_pow', op: 'add', v: 1, lvl: true }]) && !!pr2 && pr2.changes.length === 1 && pr2.changes[0].to.includes('level 7') && named.op === 'add' && named.defId === 'i_hardy',
            j([pr && pr.changes, ownOp, pr2 && pr2.changes, named]));
    }

    // 1.6.3 (the multiplayer review, finding 5): giving a player a character drew the whole app twice, about two seconds each on a large campaign.
    // main.js wpRenderBatch (its renderbatch slice, run for real) holds every redraw asked through window.appRender while one piece of work runs
    // and draws once at its end; sheets.js giveCharacter runs its work so
    {
        const mainT5 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, '\n');
        const a5 = mainT5.indexOf('// [onboardcheck:renderbatch-start]'), b5 = mainT5.indexOf('// [onboardcheck:renderbatch-end]');
        const drawn = [], win5 = { wpRenderPartyStrip() { drawn.push('strip'); } };
        new Function('window', 'render', mainT5.slice(a5, b5))(win5, () => drawn.push('render'));
        const out5 = {};
        out5.plain = (win5.appRender(), drawn.splice(0).join());
        out5.batch = win5.wpRenderBatch(() => { win5.appRender(); win5.appRender(); out5.inside = drawn.length; return 'given'; }) + ':' + drawn.splice(0).join();
        out5.nested = (win5.wpRenderBatch(() => { win5.wpRenderBatch(() => win5.appRender()); out5.innerEnd = drawn.length; win5.appRender(); }), drawn.splice(0).join());
        out5.none = (win5.wpRenderBatch(() => 1), drawn.splice(0).join());
        try { win5.wpRenderBatch(() => { win5.appRender(); throw new Error('stop'); }); } catch (e) { out5.threw = e.message; } out5.afterThrow = drawn.splice(0).join(); win5.appRender(); out5.free = drawn.splice(0).join();
        const shT5 = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.3 (the multiplayer review, finding 5) a batch of redraws (main.js wpRenderBatch, run for real): every redraw asked inside it is held and the app is drawn once at its end, the party strip with it; a batch inside a batch draws at the outer end; one that asked none draws nothing; a batch that throws still draws what it owed and frees the next redraw; the work\'s answer comes back; giveCharacter runs its work in one batch',
            a5 > 0 && b5 > a5 && out5.plain === 'render,strip' && out5.batch === 'given:render,strip' && out5.inside === 0 && out5.nested === 'render,strip' && out5.innerEnd === 0 && out5.none === '' && out5.threw === 'stop' && out5.afterThrow === 'render,strip' && out5.free === 'render,strip'
            && /return batch\(function\(\) \{ return giveCharacterNow\(pid, charId, o\); \}\);\n\}\nfunction giveCharacterNow\(pid, charId, o\) \{/.test(shT5), j(out5));
    }
    await T.finish();
})();
