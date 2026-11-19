'use strict';
/* systemcheck.js: that systemcore.js and formula.js load in Node with no window, and that systemcore.js publishes itself as
   window.wpSystemCore where a window is there. This suite once held every test of the character-sheet feature's core and its sheet;
   each area's tests left it with their area (docs/REFACTOR_SPLIT_PLAN.md), so it now names where they went:
   - the core's first blocks (presets, keys, fields, systems, the validator, the resolver, values and edits, what a player receives, the
     look of Stages 3 to 5g, facing and carried rows) to corecheck.js, beside the core's cleaners (cleancore.js) and validator
     (validcore.js); the damage step to damagecheck.js; a card to press and what an attack reads of its attacker to answercheck.js; time
     rules to timerulecheck.js; linked sheets to linkcheck.js; trade and money to tradecheck.js; the System editor's (its Layout tab,
     boxes, Save and tabs, its Rolls, Lists, Combat and Calendar boxes, the money display fold and a list placed once a category) to
     sysedcheck.js and sysedlistcheck.js; the Radius tool and the blasts to blastcheck.js (2026-11-18).
   - the lists ("Finishing the test split", step 1, 2026-11-19): listcheck.js, listrulecheck.js, listrowcheck.js, speccheck.js and
     loadcheck.js.
   - rolls and rules (step 2): rollcheck.js, applycheck.js, needcheck.js, stancecheck.js and envcheck.js.
   - the sheet and the board (step 3): the HUD to hudcheck.js, the sheet's look to sheetlookcheck.js, who plays what and how a
     character comes to a table to onboardcheck.js, the light, senses and range rules to sensecheck.js, the board to boardcheck.js, and
     the website's forms and the builder's later options to sitecheck.js.
   Usage: node tools/systemcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const NL = String.fromCharCode(10);
const kit = require('./checkkit');   // what the suites that came out of this one share with it (tools/checkkit.js)
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const core = await kit.sysCore();   // systemcore.js and formula.js imported (tools/checkkit.js)
    const { S, F, err } = core;
    check('modules load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }

    /* ---- publication ---- */
    global.window = {};
    const S2 = await import(require('./srcjoin').freshUrl('systemcore.js', 'x'));
    check('window.wpSystemCore published', !!(global.window.wpSystemCore && global.window.wpSystemCore.cleanSystem && global.window.wpSystemCore.VERSION === S2.VERSION));
    delete global.window;

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
