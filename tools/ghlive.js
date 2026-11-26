/* Is the release on GitHub one an install takes? (1.6.4; Fulllion, 2026-11-25: 1.6.4 is published on GitHub, and installs
   read GitHub, behind updater.js UPDATE_SOURCE 'github').

   Usage:
     node tools/ghlive.js        read only: asks GitHub's API, as an install of 1.6.3 asks it, for the latest release of the
                                 repository, and says in plain lines whether it is this version (package.json), whether an
                                 install of 1.6.3 is sent to the installer (its core is older than the release's minShell),
                                 whether a copy that can run the installer by itself is offered it, and whether the zip's and
                                 the installer's signatures (the two .sig assets) are there. Exit 0 where all of that holds, 1
                                 where any does not. It needs no token and writes nothing.

   It runs this repository's own updater (updater.js checkForUpdate with the source 'github'), so it reads the release as an
   install reads it with this version's code, which is stricter than 1.6.3's, and the key this repository's shell carries. It
   checks that the two .sig assets are there, not that they verify: an install checks that itself before it takes anything. canSelfInstall is asked as a shell that says it can run the
   installer (selfInstall true), as an installed copy of 1.6.3 says. Run it after node tools/release.js --github. */
'use strict';
const path = require('path');
const updater = require('../system/resources/app/updater.js');

/* The check itself, for the command line and for the suite. o: { version (the release this should be: package.json's by
   default), from (the install that asks: 1.6.3 by default), repo, apiUrl and pubKey (the suite's mock and key only) }.
   Answers { ok, lines, info }: ok true only where every line is a yes; lines are plain words, one a fact. Never throws. */
async function checkLive(o) {
    o = o || {};
    const version = o.version || require(path.join(__dirname, '..', 'system', 'resources', 'app', 'package.json')).version;
    const from = o.from || '1.6.3';
    const ask = { source: 'github', currentVersion: from, shellVersion: from, selfInstall: true };
    if (o.repo) ask.repo = o.repo;
    if (o.apiUrl) ask.apiUrl = o.apiUrl;
    if (o.pubKey !== undefined) ask.pubKey = o.pubKey;
    let info = null;
    try { info = await updater.checkForUpdate(ask); } catch (e) {
        return { ok: false, lines: ['No: the latest release could not be read from GitHub (' + String(e && e.message || e).replace(/\s+/g, ' ').slice(0, 200) + ').'], info: null };
    }
    const yes = (b, y, n) => (b ? 'Yes: ' + y : 'No: ' + n);
    const facts = [
        [info.latest === version, 'the latest release is ' + version + '.', 'the latest release is ' + (info.latest || 'none') + ', not ' + version + '.'],
        [info.needsInstaller === true, 'an install of ' + from + ' is sent to the installer (the release needs core ' + info.minShell + ').', 'an install of ' + from + ' is not sent to the installer' + (info.minShell ? ' (minShell ' + info.minShell + ')' : ' (the release names no minShell)') + '.'],
        [info.canSelfInstall === true, 'a copy that can run the installer by itself is offered the one-click core update.', 'a copy that can run the installer by itself is not offered the one-click core update.'],
        [!!info.sig, 'the zip\'s signature (' + (info.appZipName || 'the app zip') + '.sig) is there.', 'the zip\'s signature (.zip.sig) is missing.'],
        [!!info.installerSig, 'the installer\'s signature (Waypoint_Setup.exe.sig) is there.', 'the installer\'s signature (Waypoint_Setup.exe.sig) is missing.'],
    ];
    return { ok: facts.every(f => f[0]), lines: facts.map(f => yes(f[0], f[1], f[2])), info: info };
}

if (require.main === module) {
    checkLive({}).then(r => {
        for (const l of r.lines) console.log(l);
        console.log(r.ok ? 'The release on GitHub is one an install takes.' : 'The release on GitHub is not yet one every install takes: see the lines above.');
        process.exit(r.ok ? 0 : 1);
    });
}

module.exports = { checkLive };
