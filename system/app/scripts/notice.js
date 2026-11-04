// A band of side vision that notices by a roll (1.6.0), the host's half: each viewer's result for each creature in its band, kept in this machine's
// memory for the session, rolled in secret and never sent. fog.js asks it as it judges what a player is sent. The rule is noticecore.js
import { moving, loudNow, decide, moveSeen, checkWords } from './noticecore.js';
import { stepLine } from './steplog.js';

function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function tokenLike(w) { return !!w && w.type !== 'light' && !w.hidden && !w.gmNoteFor && (!!w.isChar || !!w.waiting); }

// D: { host(), S(), F(), dice(), fog(), fightOf(mapId, tokId), ctxFor(charId, camp), ground(tok, map), elev(), rec(who, what, detail), arm(mapId), now(), every(fn, ms), stop(t), log(line) }
function make(D) {
    var R = { res: Object.create(null), mv: Object.create(null), sn: Object.create(null), was: Object.create(null), loud: Object.create(null), seq: 0, t: 0, memo: null, memoSys: null };

    function rulesOf(sys) {
        if (R.memoSys === sys && R.memo !== null) return R.memo;
        var out = null, list = sys && sys.combat && sys.combat.senses && Array.isArray(sys.combat.senses.list) ? sys.combat.senses.list : [];
        list.forEach(function(s) { if (s && s.notice && typeof s.notice.check === 'string') { out = out || Object.create(null); out[s.id] = s.notice; } });
        R.memoSys = sys; R.memo = out; return out;
    }
    function on(camp) { return !!(camp && camp.system && rulesOf(camp.system)); }
    function charOf(camp, w) { return w && typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId) ? camp.chars[w.charId] : null; }
    function byId(map, id) { var wb = Array.isArray(map.whiteboard) ? map.whiteboard : []; for (var i = 0; i < wb.length; i++) if (wb[i] && wb[i].id === id) return wb[i]; return null; }
    function moves(mapId) { return R.mv[mapId] || (R.mv[mapId] = Object.create(null)); }
    function held(mapId, vId) { var m = R.res[mapId] || (R.res[mapId] = Object.create(null)); return m[vId] || (m[vId] = Object.create(null)); }

    // A check or a sneak's formula is worked out with its character's context, and a context reads what its target is seen as, which is this very judgement.
    // While one is being worked out a judgement asked for rolls nothing and answers from what is held
    function quiet(fn) { R.busy = (R.busy || 0) + 1; try { return fn(); } finally { R.busy--; } }

    // Whether a creature is sneaking: the formula on its own sheet. Its Stealth roll goes with the mark
    function sneakRoll(camp, map, w, rule) {
        var ch = charOf(camp, w), F = D.F(), S = D.S(); if (!ch || !rule.sneak || !F || !S) return null;
        var on1 = false; try { var res = quiet(function() { return F.evaluate(rule.sneak, { vars: S.makeResolver(camp.system, ch, F, D.ctxFor(ch.id, camp)) }); }); on1 = !!(res && res.ok && res.value); } catch (e) { on1 = false; }
        if (!on1) { if (R.was[ch.id]) { delete R.was[ch.id]; delete R.sn[ch.id]; } return null; }
        R.was[ch.id] = 1;
        return own(R.sn, ch.id) ? R.sn[ch.id] : null;
    }

    // One secret check, on the viewer's sheet: the GM's machine rolls it, nobody is told, and the game record names it
    function roll(camp, map, vt, vCh, w, rule, m, f) {
        var S = D.S(), F = D.F(), Dc = D.dice(), sys = camp.system;
        if (!S || !F || !Dc) return true;
        var rc = null, cOf = function(t) { return charOf(camp, t); };
        try { rc = S.rangeCtx(sys, map, vt, w, { F: F, elev: D.elev(), groundOf: function(t) { return D.ground(t, map); }, charOf: cOf }); } catch (e) { rc = null; }
        rc = rc || { mod: 0, dist: 0 }; rc.light = f.light; rc.cover = f.cover; rc.cgrade = f.grade; rc.tid = w.id; rc.mapId = map.id; if (f.loud) rc.loud = f.loud;
        var res = null, ck = null;
        try { quiet(function() { var tc = S.withAttempt(S.withRange(D.ctxFor(vCh.id, camp) || {}, rc), m); res = F.evaluate(rule.check, { vars: S.makeResolver(sys, vCh, F, tc) }); ck = Dc.checkOf(res, Dc.ruleOf(null, sys.combat && sys.combat.checks)); }); } catch (e) { res = null; }
        if (!res || !res.ok) { D.log('check failed'); return true; }   // a check that cannot be worked out hides nothing
        var ok = ck ? ck.pass === true : !!res.value;
        D.rec(String(vCh.name || 'A character'), (ok ? 'Noticed ' : 'Did not notice ') + String(w.name || (charOf(camp, w) || {}).name || 'a token'), checkWords(ck, res));
        return ok;
    }

    function judge(camp, map, vt, w, id, rule) {
        var vCh = charOf(camp, vt); if (!vCh) return true;   // a viewer with no sheet has nothing to roll: the band notices, as it does by the tick alone
        var box = held(map.id, vt.id), k = w.id + '|' + id, e = box[k]; if (R.busy) return e ? !!e.ok : true;
        var f = D.fog().noticeFacts(map, camp, vt, w), ln = loudOf(map, w, rule), sig = f.light + '|' + f.cover + (ln ? '|' + ln : ''); if (ln) f = Object.assign({}, f, { loud: ln });
        var rc = moves(map.id)[w.id], d = decide(e, { moving: moving(rc, D.now(), !!D.fightOf(map.id, w.id)), sneak: sneakRoll(camp, map, w, rule), sig: sig });
        if (d.roll) { var en = { ok: roll(camp, map, vt, vCh, w, rule, d.m, f), by: 'roll', sig: sig }; if (d.sn !== undefined) en.sn = d.sn; box[k] = en; if (D.kept) D.kept(); return en.ok; }   // 1.6.2: kept with the fight
        box[k] = d.e; return d.e.ok;
    }
    function ticking() { if (!R.t) R.t = D.every(tick, 1000); }

    // 1.6.0 A loud roll: what a check reads of a token a roll marked, by the stat its band names, 0 with none
    function loudOf(map, w, rule) { var r = rule.noise && R.loud[map.id] ? R.loud[map.id][w.id] : null; return r && loudNow(r, D.now(), !!D.fightOf(map.id, w.id)) ? r.n[rule.noise] || 0 : 0; }
    // ... a list's roll on a row with a stat a band names as its noise, not 0, marks its character's tokens, and what the players hold is put right. A new roll marks afresh
    function noise(camp, charId, ref, rules) {
        var keys = Object.keys(rules).map(function(id) { return rules[id].noise; }).filter(function(k) { return typeof k === 'string' && k; }), S = D.S(), F = D.F(), ch = camp.chars && own(camp.chars, charId) ? camp.chars[charId] : null; if (!keys.length || !ref || typeof ref.l !== 'string' || typeof ref.row !== 'string' || !S || !F || !ch) return;
        var rv = null; try { rv = quiet(function() { return S.makeResolver(camp.system, ch, F, D.ctxFor(ch.id, camp)).row(ref.l, ref.row); }); } catch (e) { rv = null; } if (typeof rv !== 'function') return;
        var n = Object.create(null), any = false; keys.forEach(function(k) { var v = 0; try { v = quiet(function() { return rv('row.' + k); }); } catch (e) { v = 0; } if (typeof v === 'number' && isFinite(v) && v !== 0) { n[k] = v; any = true; } }); if (!any) return;
        ticking();
        Object.keys(camp.items || {}).forEach(function(id) {
            var m = camp.items[id]; if (!m || m.type !== 'map' || !Array.isArray(m.whiteboard)) return; var hit = false;
            m.whiteboard.forEach(function(w) { if (w && w.charId === charId && typeof w.id === 'string') { (R.loud[id] || (R.loud[id] = Object.create(null)))[w.id] = { n: n, at: D.now() }; hit = true; } });
            if (hit) D.arm(id);
        });
    }
    // ... which ends with its next turn in a fight, and by the clock out of one (tick)
    function turnStart(mapId, tokId) { if (R.loud[mapId] && R.loud[mapId][tokId]) { delete R.loud[mapId][tokId]; D.arm(mapId); } }

    // A pass of fog.js's judgement for one player on one map: by, each cell only a band sees and who sees it there, [{ t: the viewer's token, ids: its senses }].
    // tick(w): the senses the GM ticked for this token, true for all. Notes who moved, and lets go of what a viewer no longer has in its band
    function pass(map, camp, rid, by, keyOf, ticked, real) {
        if (!D.host() || !camp || !camp.system) return null;
        var rules = rulesOf(camp.system); if (!rules) return null;
        ticking();
        var wb = Array.isArray(map.whiteboard) ? map.whiteboard : [], mv = moves(map.id), now = D.now(), live = Object.create(null), keys = Object.create(null);
        wb.forEach(function(w) {
            if (!tokenLike(w) || typeof w.id !== 'string') return;
            var k = keyOf(w), r = mv[w.id]; keys[w.id] = k;
            if (!r) mv[w.id] = { key: k, at: 0, turns: 0 }; else if (r.key !== k) { r.key = k; r.at = now; r.turns = 0; r.live = true; }
            ((by && by[k]) || []).forEach(function(p) { live[p.t + '|' + w.id] = 1; });
        });
        if (real) wb.forEach(function(v) {
            if (!v || v.ownerId !== rid || !R.res[map.id] || !R.res[map.id][v.id]) return;
            var box = R.res[map.id][v.id]; Object.keys(box).forEach(function(k) { if (!live[v.id + '|' + k.split('|')[0]]) delete box[k]; });
        });
        function pairs(w, tk, fn) {
            var un = ticked(w), list = by && by[tk]; if (!list) return null;
            for (var i = 0; i < list.length; i++) {
                var p = list[i], vt = byId(map, p.t); if (!vt) continue;
                for (var j = 0; j < p.ids.length; j++) { var id = p.ids[j]; if (un === true || (un && un.indexOf(id) >= 0)) continue; if (!rules[id]) return true; if (fn(vt, id, rules[id])) return true; }
            }
            return false;
        }
        return {
            // true where no viewer in this band notices it: left out of what the player is sent
            missed: function(w, tk) { if (!tokenLike(w)) return false; var a = pairs(w, tk, function(vt, id, rule) { return judge(camp, map, vt, w, id, rule); }); return a === false; },
            // a live move, with nothing rolled: only a sneak can stay unnoticed in it
            moved: function(w, tk) { if (!tokenLike(w)) return true; var a = pairs(w, tk, function(vt, id, rule) { return moveSeen(held(map.id, vt.id)[w.id + '|' + id], !!sneakRoll(camp, map, w, rule)); }); return a !== false; },
        };
    }

    // A Stealth roll made: it stands for its character until the next, and every viewer is checked against it
    function stealth(camp, charId, ref, vd, malf) {
        if (!D.host() || !camp || !camp.system || !ref) return;
        var rules = rulesOf(camp.system), S = D.S(), ch = camp.chars && own(camp.chars, charId) ? camp.chars[charId] : null; if (!rules || !ch || !S) return;
        noise(camp, charId, ref, rules);   // 1.6.0: and a loud one marks its token
        var hit = Object.keys(rules).some(function(id) { var t = rules[id].stealth; try { return !!t && S.rollSwitches(camp.system, ch, ref, [{ to: [t] }]).length > 0; } catch (e) { return false; } });
        if (!hit) return;
        var pass1 = !!vd && vd.kind === 'check' && vd.pass === true && malf !== true;
        R.sn[charId] = { n: ++R.seq, ok: pass1, m: pass1 ? S.thenMargin(vd, malf) : 0 };
        Object.keys(camp.items || {}).forEach(function(id) { var m = camp.items[id]; if (m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { return !!w && w.charId === charId; })) D.arm(id); });
    }
    // In a fight a creature stops moving by its own turns
    function turnEnd(mapId, tokId) { var r = R.mv[mapId] && R.mv[mapId][tokId]; if (r && r.at > 0) { r.turns = (r.turns || 0) + 1; tick(); } }
    // A creature that has stopped is checked now, and what the player holds is put right
    function tick() {
        Object.keys(R.mv).forEach(function(mapId) {
            var mv = R.mv[mapId], go = false;
            Object.keys(mv).forEach(function(id) { var r = mv[id]; if (r.live && !moving(r, D.now(), !!D.fightOf(mapId, id))) { r.live = false; go = true; } });
            if (go) D.arm(mapId);
        });
        Object.keys(R.loud).forEach(function(mapId) {
            var lo = R.loud[mapId], go = false;
            Object.keys(lo).forEach(function(id) { if (!loudNow(lo[id], D.now(), !!D.fightOf(mapId, id))) { delete lo[id]; go = true; } });
            if (go) D.arm(mapId);
        });
    }
    function forget() { if (R.t) D.stop(R.t); R.t = 0; R.res = Object.create(null); R.mv = Object.create(null); R.sn = Object.create(null); R.was = Object.create(null); R.loud = Object.create(null); R.memo = null; R.memoSys = null; }

    // 1.6.2 (build 14: "a reload of the GM's app rolls every result again"): what is held, as data the fight's save carries (net.js fightsKeep), and back
    // as the table opens (fightsBack), read as data: each viewer's results, the sneak rolls and who was sneaking, bounded. Moving and noise are not kept: a
    // creature reads as still after a reload, and a result its moving made is rolled again once it stops, as ever
    var ID_K = /^[A-Za-z0-9_:-]{1,80}$/, KEY_K = /^[A-Za-z0-9_:|-]{1,160}$/;
    function keep() {
        var res = {}, n = 0;
        Object.keys(R.res).slice(0, 40).forEach(function(mapId) { var vs = R.res[mapId], om = {}; Object.keys(vs).slice(0, 200).forEach(function(vId) { var es = vs[vId], ov = {}; Object.keys(es).slice(0, 400).forEach(function(k) { var e = es[k]; if (!e) return; var o = { ok: !!e.ok, by: e.by, sig: e.sig }; if (typeof e.sn === 'number') o.sn = e.sn; ov[k] = o; n++; }); if (Object.keys(ov).length) om[vId] = ov; }); if (Object.keys(om).length) res[mapId] = om; });
        var sn = {}; Object.keys(R.sn).slice(0, 400).forEach(function(c) { var s = R.sn[c]; if (s) sn[c] = { n: s.n, ok: !!s.ok, m: s.m }; });
        return n || Object.keys(sn).length ? { res: res, sn: sn, was: Object.keys(R.was).slice(0, 400), seq: R.seq } : null;
    }
    function restore(o) {
        if (!o || typeof o !== 'object') return 0; var n = 0, fin = function(v) { return typeof v === 'number' && isFinite(v); };
        var res = o.res && typeof o.res === 'object' ? o.res : {};
        Object.keys(res).slice(0, 40).forEach(function(mapId) { var vs = res[mapId]; if (!ID_K.test(mapId) || !vs || typeof vs !== 'object') return;
            Object.keys(vs).slice(0, 200).forEach(function(vId) { var es = vs[vId]; if (!ID_K.test(vId) || !es || typeof es !== 'object') return;
                Object.keys(es).slice(0, 400).forEach(function(k) { var e = es[k]; if (!KEY_K.test(k) || !e || typeof e !== 'object' || typeof e.ok !== 'boolean' || (e.by !== 'roll' && e.by !== 'sneak' && e.by !== 'move') || typeof e.sig !== 'string' || e.sig.length > 200) return;
                    var en = { ok: e.ok, by: e.by, sig: e.sig }; if (e.sn !== undefined) { if (!fin(e.sn) || e.sn < 0 || Math.floor(e.sn) !== e.sn) return; en.sn = e.sn; } held(mapId, vId)[k] = en; n++; }); }); });
        var sn = o.sn && typeof o.sn === 'object' ? o.sn : {}, top = 0;
        Object.keys(sn).slice(0, 400).forEach(function(c) { var s = sn[c]; if (!ID_K.test(c) || !s || typeof s !== 'object' || !fin(s.n) || s.n < 0 || Math.floor(s.n) !== s.n || typeof s.ok !== 'boolean' || !fin(s.m)) return; R.sn[c] = { n: s.n, ok: s.ok, m: Math.max(-999, Math.min(999, s.m)) }; if (s.n > top) top = s.n; });
        (Array.isArray(o.was) ? o.was.slice(0, 400) : []).forEach(function(c) { if (typeof c === 'string' && ID_K.test(c)) R.was[c] = 1; });
        R.seq = Math.max(R.seq, top, fin(o.seq) && o.seq >= 0 && o.seq <= 1e9 ? Math.floor(o.seq) : 0);
        return n;
    }

    return { on: on, pass: pass, stealth: stealth, turnEnd: turnEnd, turnStart: turnStart, tick: tick, forget: forget, keep: keep, restore: restore, state: R };
}

// [noticecheck:page-start]
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.wpNotice = make({
        host: function() { var n = window.wpNet; return !!(n && n.active && n.role === 'host'); },
        S: function() { return window.wpSystemCore; }, F: function() { return window.wpFormula; }, dice: function() { return window.wpDiceCore; }, fog: function() { return window.wpFog; },
        fightOf: function(mapId, tokId) { var n = window.wpNet; return n && n.combatOfTok ? n.combatOfTok(mapId, tokId) : null; },
        ctxFor: function(id, camp) { var s = window.wpSheets; return s && s.tokenCtxFor ? s.tokenCtxFor(id, camp) : null; },
        ground: function(t, map) { var St = window.wpStance; return St && St.tokenGround ? St.tokenGround(t, map, true) : 0; },
        elev: function() { var v = window.wpVtt; return !v || !!(v.rulesOn ? v.rulesOn('elevation') : v.on('elevation')); },
        rec: function(who, what, detail) { if (window.wpRecord) window.wpRecord.add('roll', who, what, detail, true); },
        arm: function(mapId) { var n = window.wpNet; if (n && n.noticeArm) n.noticeArm(mapId); },
        kept: function() { var n = window.wpNet; if (n && n.fightsKeepSoon) n.fightsKeepSoon(); },   // 1.6.2: a result rolled is kept with the fight
        now: function() { return Date.now(); }, every: function(fn, ms) { return setInterval(fn, ms); }, stop: function(t) { clearInterval(t); },
        log: function(line) { try { fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: stepLine('notice v1', line, {}) }).catch(function() {}); } catch (e) {} },
    });
}
// [noticecheck:page-end]
export { make };
