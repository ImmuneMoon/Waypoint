// A band of side vision may notice by a roll (1.6.0): the pure half, what one viewer makes of one creature in its band. A system sets it on a sense
// (systemcore cleanNotice, the GM's view alone); with none, the GM's Not noticed by tick stands alone, as ever. notice.js holds the results and rolls
var VERSION = 1;
var STILL_MS = 5000;   // out of a fight, how long after its last move a creature counts as still
var STILL_TURNS = 2;   // in a fight, the turn ends it takes: the one it moved in, and the next it did not

// Whether a creature counts as moving. rec: { at: when it last changed its cell (0 never), turns: its own turn ends since }
function moving(rec, now, inFight) {
    if (!rec || !(rec.at > 0)) return false;
    return inFight ? !(rec.turns >= STILL_TURNS) : now - rec.at < STILL_MS;
}

// What to do for one viewer and one creature. e: the result it holds, or none, { ok, by: 'roll' | 'move' | 'sneak', sig, sn? }. f: { moving, sneak: the
// Stealth roll a sneak holds { n, ok, m } or null, sig: what the result stands on, the light and the cover }. Answers { e } to keep, or { roll, m, sn }.
// A result sticks until the light or the cover changes. Moving ends a failure at once, since something moving is noticed, and a success stands.
// A sneak who failed their roll has lost, and one who made it is checked at minus their margin, once for each Stealth roll
function decide(e, f) {
    var sig = f && typeof f.sig === 'string' ? f.sig : '', sk = f && f.sneak;
    if (sk) {
        if (!sk.ok) return { e: { ok: true, by: 'sneak', sig: sig, sn: sk.n } };
        if (e && e.sn === sk.n && e.sig === sig) return { e: e };
        return { roll: true, m: typeof sk.m === 'number' && isFinite(sk.m) ? sk.m : 0, sn: sk.n };
    }
    if (f && f.moving) return { e: e && e.ok && e.by === 'roll' && e.sig === sig ? e : { ok: true, by: 'move', sig: sig } };
    if (e && e.by !== 'move' && e.sig === sig) return { e: e };
    return { roll: true, m: 0 };
}

// What a live move of a creature shows, with no roll made: anything but a sneak is moving, so it is noticed
function moveSeen(e, sneaking) { return sneaking ? !!(e && e.ok) : true; }

// The words a game record line holds of a check
function checkWords(ck, res) {
    if (ck && typeof ck.total === 'number' && typeof ck.target === 'number') return 'Side vision check: ' + ck.total + ' against ' + ck.target;
    return res && res.ok ? 'Side vision check: ' + String(res.value) : 'Side vision check';
}

var API = Object.freeze({ VERSION: VERSION, STILL_MS: STILL_MS, STILL_TURNS: STILL_TURNS, moving: moving, decide: decide, moveSeen: moveSeen, checkWords: checkWords });
if (typeof window !== 'undefined') window.wpNoticeCore = API;
export { VERSION, STILL_MS, STILL_TURNS, moving, decide, moveSeen, checkWords };
