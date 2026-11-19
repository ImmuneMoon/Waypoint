/* wallkit.js: what map builder B5's two suites share (netwallcheck.js and netmatchcheck.js), not a suite: no check.js ending, no CI
   step. B5's one world stood in netcheck.js as one pending check whose first statements every part of it read; "Finishing the test split",
   step 6 (docs/REFACTOR_SPLIT_PLAN.md, 2026-11-19), cut that world in two, and the statements both halves read moved here, word for word
   and in the order they stood: the imports of fogcore, systemcore and the formula engine (fresh instances, as the pending check made them),
   the readers of a piece (J, ownK, copyOf, flat, less, noGeo), the keys a secret door and Match a wall keep (KEYS3, KEYSW, KEYS6 with has3
   and has6), Match a wall's press (matchAs), breathe, and the pieces of section (1) that the one-module world lays too (PIC, OAK, WALLC,
   BOX, D, wallOf, LINE, GATE), STRAY, and NONE with diffOf from the walls that have no twin. A statement only one half reads moved with
   that half. wallKit() makes them once a run and hands each suite the same object. */
'use strict';
const path = require('path');
let made = null;
function wallKit() { return made || (made = (async () => {
    const urlS = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const FC = await import(urlS('fogcore.js')), Sx = await import(urlS('systemcore.js')), Fx = await import(urlS('formula.js'));
    const J = v => JSON.stringify(v), ownK = (o, k) => Object.prototype.hasOwnProperty.call(o, k), copyOf = o => JSON.parse(J(o));
    const flat = o => (o && typeof o === 'object' ? J(Object.keys(o).sort().map(k => [k, o[k]])) : String(o));   // a piece as its own keys in order, each with its value: equal only where no key is missing and none is extra
    const KEYS3 = ['secret', 'seenColor', 'seenTexture'], has3 = o => (o && typeof o === 'object' ? KEYS3.filter(k => ownK(o, k)) : ['no piece']);
    // Match a wall (the owner, 2026-10-12, by prompt): a secret door drawn as a line may be seen at the width, the opacity and the nib of the wall
    // line it meets. Three more keys of the GM's, which never travel either, on any piece. KEYS3 stays the tick and the two keys of fold B5
    const KEYSW = ['seenWidth', 'seenOpacity', 'seenTip'], KEYS6 = KEYS3.concat(KEYSW), has6 = o => (o && typeof o === 'object' ? KEYS6.filter(k => ownK(o, k)) : ['no piece']);
    const less = (o, ks) => { const c = copyOf(o); ks.forEach(k => { delete c[k]; }); return c; };
    // Match a wall: the press as inspector.js setItemSeen(w, 'match') makes it. The real secretMatch reads the wall line the door meets among the
    // map's pieces; then each of the three keys is set or taken off by what its cleaner answers, and the color is named only where it is
    // one a secret door can be seen in. The door's own color, width, opacity and nib are not touched. Null where no wall line meets the door.
    // Round two: where there are too many wall lines to tell which one the door meets the answer is { over: true }, and nothing is set
    const matchAs = (door, pieces) => { const hit = FC.secretMatch(door, pieces); if (!hit) return null; if (hit.over === true) return hit;
        const mW = FC.cleanSeenWidth(hit.width), mO = FC.cleanSeenOpacity(hit.opacity), mT = FC.cleanSeenTip(hit.tip), mC = FC.cleanSeenColor(hit.color);
        if (mW === null || mW === undefined) delete door.seenWidth; else door.seenWidth = mW;
        if (mO === null || mO === undefined) delete door.seenOpacity; else door.seenOpacity = mO;
        if (mT === null || mT === undefined) delete door.seenTip; else door.seenTip = mT;
        if (mC) door.seenColor = mC;
        return hit; };
    const GEOK = ['id', 'x', 'y', 'w', 'h', 'baseW', 'baseH', 'pts'], noGeo = o => (o ? J(less(o, GEOK)) : 'nothing');   // a piece as text, but for its id and its geometry: a door and the wall it meets stand at two places
    const SIXWORDS = /"secret"|seenColor|seenTexture|seenWidth|seenOpacity|seenTip/;   // the six keys by name, in a text of what was sent
    // The parts on Match a wall run beside checks that wait on real timers (a sound's parts go out 15 ms apart and are waited for 160 ms). So
    // none of those parts holds the loop for long: each gives it back between its stretches, and the due timers of the other checks run
    const breathe = () => new Promise(r => setTimeout(r, 0));

    // from section (1) of B5, the host's one rule: the pieces it lays, which the one-module world (6) lays too
    // A door as Build lays one, then opened, locked and grouped by the GM, wearing a pattern and a picture of its own, ticked Secret
    const PIC = '/saves/images/k/vault door.png', OAK = '#6b4a2a', WALLC = '#3f3b47', BOX = { type: 'rect', x: 100, y: 50, w: 50, h: 50 };
    const D = (id, over) => Object.assign({ id }, BOX, { blocksSight: true, sightType: 'door', secret: true, doorOpen: true, doorLock: true, groupId: 'g_vault', texture: 'planks', color: OAK, texSrc: PIC, texTile: 2, layer: 'back-mid', cover: 'yes', height: 3 }, over || {});
    const wallOf = (id, more) => Object.assign({ id }, BOX, { blocksSight: true, sightType: 'wall', layer: 'back-mid', cover: 'yes', height: 3 }, more || {});
    const LINE = { type: 'path', tip: 'square', strokeWidth: 6, x: 200, y: 50, w: 6, h: 50, baseW: 6, baseH: 50, pts: [[0, 0], [0, 50]], layer: 'back-mid' };   // a door drawn as a line (the pen's Wall line)
    const GATE = { type: 'rect', x: 300, y: 50, w: 50, h: 50, barrier: true, blastStop: true };   // a see-through barrier, ticked Stops blasts
    // from section (1), the look a found door keeps on the host's piece
    const STRAY = { seenColor: '#112233', seenTexture: 'grass' };
    // from the walls that have NO twin (section 2b): how two pieces differ, key by key
    const NONE = '(no key)', diffOf = (a, b) => (a && b ? Object.keys(a).concat(Object.keys(b)).filter((k, i, all) => k !== 'id' && all.indexOf(k) === i && (ownK(a, k) !== ownK(b, k) || J(a[k]) !== J(b[k]))).sort().map(k => [k, ownK(a, k) ? a[k] : NONE, ownK(b, k) ? b[k] : NONE]) : 'nothing left');
    return { urlS, FC, Sx, Fx, J, ownK, copyOf, flat, KEYS3, has3, KEYSW, KEYS6, has6, less, matchAs, GEOK, noGeo, SIXWORDS, breathe,
        PIC, OAK, WALLC, BOX, D, wallOf, LINE, GATE, STRAY, NONE, diffOf };
})()); }
module.exports = { wallKit };
