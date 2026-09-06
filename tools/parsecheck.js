/* Syntax check for the front end's ES modules, the way a browser would see them.
   Usage: node tools/parsecheck.js [file ...]   (default: every file in system/app/scripts)
   Each module is imported for real; a SyntaxError means the browser would refuse it (and one
   refused module kills the whole app), while the expected "window is not defined" runtime
   errors are fine. Run this after every edit to system/app/scripts — `node --check` does not
   catch these files' errors reliably. */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'system', 'app', 'scripts');
const files = process.argv.length > 2 ? process.argv.slice(2) : fs.readdirSync(dir).filter(f => f.endsWith('.js')).map(f => path.join(dir, f));
(async () => {
    let bad = 0;
    for (const f of files) {
        const url = 'file:///' + path.resolve(f).replace(/\\/g, '/');
        try { await import(url); console.log('ok       ', path.basename(f)); }
        catch (e) {
            if (e instanceof SyntaxError) { bad++; console.log('SYNTAX   ', path.basename(f), '->', e.message); }
            else console.log('ok       ', path.basename(f), '(runtime: ' + e.constructor.name + ')');
        }
    }
    if (bad) { console.log('\n' + bad + ' module(s) would not load in the browser.'); process.exit(1); }
    console.log('\nAll modules parse.');
})();
