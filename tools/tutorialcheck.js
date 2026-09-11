/* Keeps the interactive tutorial honest: every static target in scripts/tutorial.js STEPS
   (a "#id" selector) must still exist in index.html. Run it directly or let release.js run
   it — a missing target fails the build, because a tour that points at nothing is worse
   than no tour. Usage: node tools/tutorialcheck.js */
'use strict';
const fs = require('fs');
const path = require('path');
const app = path.join(__dirname, '..', 'system', 'app');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const targets = [...src.matchAll(/target:\s*'([^']+)'/g)].map(m => m[1]);
let bad = 0;
for (const t of targets) {
    const m = /^#([A-Za-z0-9_-]+)$/.exec(t);
    if (!m) { console.log('skip     ', t, '(not a plain id — checked at run time only)'); continue; }
    if (ids.has(m[1])) console.log('ok       ', t);
    else { bad++; console.log('MISSING  ', t, '— that element is gone from index.html; update STEPS in scripts/tutorial.js'); }
}
const ver = (src.match(/TUTORIAL_VERSION = '([^']+)'/) || [])[1];
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'package.json'), 'utf8')).version;
if (ver !== pkg) console.log('note      tutorial version ' + ver + ' vs app ' + pkg + ' — bump TUTORIAL_VERSION if the tour or demo changed this release');
if (bad) { console.log('\n' + bad + ' tutorial target(s) missing.'); process.exit(1); }
console.log('\nTutorial targets all present (' + targets.length + ' steps checked).');
