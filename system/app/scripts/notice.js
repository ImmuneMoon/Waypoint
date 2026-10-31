// A band of side vision that notices by a roll (1.6.0), the host's half: each viewer's result for each creature in its band, kept in this machine's
// memory for the session, rolled in secret and never sent. fog.js asks it as it judges what a player is sent. The rule is noticecore.js
import { moving, decide, moveSeen, checkWords } from './noticecore.js';
import { stepLine } from './steplog.js';

function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function tokenLike(w) { return !!w && w.type !== 'light' && !w.hidden && !w.gmNoteFor && (!!w.isChar || !!w.waiting); }

// D: { host(), S(), F(), dice(), fog(), fightOf(mapId, tokId), ctxFor(charId, camp), ground(tok, map), elev(), rec(who, what, detail), arm(mapId), now(), every(fn, ms), stop(t), log(line) }
function make(D) {
    var R = { res: Object.create(null), mv: Object.create(null), sn: Object.create(null), was: Object.create(null), seq: 0, t: 0, memo: null, memoSys: null };

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

    // Whether a creature is sneaking: the formula on its own sheet. Its Stealth roll goes with the mark
    function sneakRoll(camp, map, w, rule) {
        var ch = charOf(camp, w), F = D.F(), S = D.S(); if (!ch || !rule.sneak || !F || !S) return null;
        var on1 = false; try { var res = F.evaluate(rule.sneak, { vars: S.makeResolver(camp.system, ch, F, D.ctxFor(ch.id, camp)) }); on1 = !!(res && res.ok && res.value); } catch (e) { on1 = false; }
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
        rc = rc || { mod: 0, dist: 0 }; rc.light = f.light; rc.cover = f.cover; rc.cgrade = f.grade; rc.tid = w.id; rc.mapId = map.id;
        var tc = S.withAttempt(S.withRange(D.ctxFor(vCh.id, camp) || {}, rc), m), res = null, ck = null;
        try { res = F.evaluate(rule.check, { vars: S.makeResolver(sys, vCh, F, tc) }); ck = Dc.checkOf(res, Dc.ruleOf(null, sys.combat && sys.combat.checks)); } catch (e) { res = null; }
        if (!res || !res.ok) { D.log('check failed'); return true; }   // a check that cannot be worked out hides nothing
        var ok = ck ? ck.pass === true : !!res.value;
        D.rec(String(vCh.name || 'A character'), (ok ? 'Noticed ' : 'Did not notice ') + String(w.name || (charOf(camp, w) || {}).name || 'a token'), checkWords(ck, res));
        return ok;
    }

    function judge(camp, map, vt, w, id, rule) {
        var vCh = charOf(camp, vt); if (!vCh) return true;   // a viewer with no sheet has nothing to roll: the band notices, as it does by the tick alone
        var box = held(map.id, vt.id), k = w.id + '|' + id, e = box[k], f = D.fog().noticeFacts(map, camp, vt, w), sig = f.light + '|' + f.cover;
        var rc = moves(map.id)[w.id], d = decide(e, { moving: moving(rc, D.now(), !!D.fightOf(map.id, w.id)), sneak: sneakRoll(camp, map, w, rule), sig: sig });
        if (d.roll) { var en = { ok: roll(camp, map, vt, vCh, w, rule, d.m, f), by: 'roll', sig: sig }; if (d.sn !== undefined) en.sn = d.sn; box[k] = en; return en.ok; }
        box[k] = d.e; return d.e.ok;
    }
    function ticking() { if (!R.t) R.t = D.every(tick, 1000); }

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
    }
    function forget() { if (R.t) D.stop(R.t); R.t = 0; R.res = Object.create(null); R.mv = Object.create(null); R.sn = Object.create(null); R.was = Object.create(null); R.memo = null; R.memoSys = null; }

    return { on: on, pass: pass, stealth: stealth, turnEnd: turnEnd, tick: tick, forget: forget, state: R };
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
        now: function() { return Date.now(); }, every: function(fn, ms) { return setInterval(fn, ms); }, stop: function(t) { clearInterval(t); },
        log: function(line) { try { fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: stepLine('notice v1', line, {}) }).catch(function() {}); } catch (e) {} },
    });
}
// [noticecheck:page-end]
export { make };
