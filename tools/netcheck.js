/* netcheck.js: what is left of the offline check of net.js, the code a hostile peer talks to, once its areas left with their tests
   (docs/REFACTOR_SPLIT_PLAN.md, "Tests move with their area" and "Finishing the test split", 2026-11-18 and 2026-11-19). It keeps one
   check: every name net.js asks of the system core and the dice core through typeof is one the core publishes on the window (found by
   hand, 2026-10-31: such a name fails in silence, and a suite that imports the module cannot see it missing from what the page is given).
   Where each area went, every block word for word with the comment that heads it:
   - the admission gate and who comes to a table (hello, the table key, kick and ban, the join queue, broadcast, chat, the roster, security
     J and S, the heartbeat and the hold, Player History, the host id, a snapshot's items): netjoincheck.js, over tools/checkkit.js netGate;
   - the transport under the wire (asset requests and the asset gate, transport T1 to T7, security K, voice): nettransportcheck.js;
   - light, the clock and video on the wire: netmediacheck.js;
   - what a session keeps in step (doc theming, the top bar, the fog defaults, the library and its manifest, security E and F, the
     Multiplayer panel, trackers, sounds, 206, mentions, the VTT ceiling): netsessioncheck.js;
   - pieces on the wire and what a session sends (sanitizeItem and wireWbItem, places, bars and effects, the join snapshot and the stream
     window, the follow and the stage, travel, portals, doors, targeting, Forget, a traveller's landing): netpiececheck.js;
   - map builder B5, a secret door, and a plain wall's one shape: netwallcheck.js, and the same in the one-module world with Match a wall:
     netmatchcheck.js, both over tools/wallkit.js;
   - a character on the wire (char-edit, char-ask, char-item and the lists, U2, 126 and 126b, loads and chambers, char-style, char-damage,
     char-delete): netcharcheck.js; rolls and apply actions on the host (roll-req, char-apply, roll switches, Specialties, a burst, fold 2, a
     damage type, what changed a roll's values, a card drawn as a die): netrollcheck.js; what a roll's card carries and applies (the bell,
     R3, a used-up row's Undo, a hidden figure, fragmentation, owed F5b): netapplycheck.js; a character and a token coming to the table
     (Onboarding F1 to F4, the token creator): netmakecheck.js;
   - attacks and defenses on the host: attackcheck.js and landcheck.js; what time does at a table: nettimecheck.js; linked sheets:
     linkcheck.js; trading: tradecheck.js;
   - a fogged map on the wire (a player's copy following what their tokens see, senses S2b): netfogcheck.js; an open drag judged where it
     began and the catch-up (folds M4, M6, M8): netdragcheck.js; map possession, the patch gate and the delta, a player's explored ground:
     netpossesscheck.js;
   - the fights on the host (the range, a called shot, initiative, End turn, a step back, fights by their ids, who holds whom, the round
     hook, walls and the move limit, the combat roster, a fight far away): netfightcheck.js.
   Run: node tools/netcheck.js */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');

let pass = 0, fail = 0;
const pendingChecks = [];   // checks that finish asynchronously, awaited before the summary
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
pendingChecks.push((async () => {
    const j = JSON.stringify;
    {   // found by hand, 2026-10-31: a name asked of a core through typeof fails in silence, and a suite that imports the module cannot see it missing from what the page is given
        const scr = f => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', f), 'utf8').replace(/\r\n/g, '\n');
        const pub = (f, win) => { const t = scr(f), i = t.indexOf('var API = '), e = t.indexOf('window.' + win + ' = API'); return new Set([...t.slice(i, e).matchAll(/(?:^|[,{]\s*)([A-Za-z_$][\w$]*)\s*:/gm)].map(m => m[1])); };
        const sys = pub('systemcore.js', 'wpSystemCore'), dic = pub('dicecore.js', 'wpDiceCore'), netT = scr('net.js');
        const asked = (getter, win) => { const vars = new Set(); for (const m of netT.matchAll(new RegExp('\\b([A-Za-z_$][\\w$]*)\\s*=\\s*(?:' + getter + '\\(\\)|window\\.' + win + '\\b)(?!\\.)', 'g'))) vars.add(m[1]); return vars; };
        const NOT_CORE = new Set(['St.tokenElevation', 'St.tokenGround', 'D.waits', 'DL.label', 'cmd.expr', 'cmd.cmd']);   // the same letters, in other functions, naming the stance module, the dice roller, the limits and a parsed command
        const missing = (vars, keys) => { const out = new Set(); vars.forEach(v => { for (const m of netT.matchAll(new RegExp('(?<![\\w$.])' + v.replace(/\$/g, '\\$') + '\\.([A-Za-z_$][\\w$]*)', 'g'))) if (!keys.has(m[1]) && !NOT_CORE.has(v + '.' + m[1])) out.add(v + '.' + m[1]); }); return [...out]; };
        const noS = missing(asked('SC', 'wpSystemCore'), sys), noD = missing(asked('DC', 'wpDiceCore'), dic);
        check('every name net.js asks of the system core and the dice core is one the core publishes on the window (listRollRef and rowKeptFrom were not, so a resist card never offered a list\'s roll)', sys.has('listRollRef') && sys.has('rowKeptFrom') && asked('SC', 'wpSystemCore').size > 3 && !noS.length && !noD.length, j([noS, noD]));
    }
})());
// The async checks land before the summary. A pending check may push another while it runs, so the wait goes round again until no
// new one was added, as checkkit's suite().finish() does (the review of step 4 of "Finishing the test split", 2026-11-19: none of the
// four indented pushes runs inside async code today, but a check that landed after a single Promise.all would print after the summary).
(async () => { let seen = -1; while (seen !== pendingChecks.length) { seen = pendingChecks.length; await Promise.all(pendingChecks); } })().then(() => {
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
});
