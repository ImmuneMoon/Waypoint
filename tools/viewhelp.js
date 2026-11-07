/* The view helpers (backlog 82b, fold 1) as a harness needs them: wbX, wbY, wbDX and wbDY, read from the app file itself by its view:helpers
   markers, so a suite that slices code reading the pointer runs it with the very helpers the page has. Required by suites; not a suite. */
'use strict';
const fs = require('fs'), path = require('path');
function viewHelpers(file) {
    const t = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', file || 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
    const a = t.indexOf('// [view:helpers-start]'), b = t.indexOf('// [view:helpers-end]');
    if (a < 0 || b < a) throw new Error('no view helpers in ' + (file || 'whiteboard.js'));
    return t.slice(a, b) + '\n';
}
module.exports = { viewHelpers };
