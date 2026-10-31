/* Offline check of the game record (1.6.0). The owner, 2026-10-31: a window for the GM that shows everything that happens in the game, sorted by
   session, "a complete record of the game for reference"; a session runs from Host to End Session, or to the moment Waypoint closed, and it
   tracks who joins and leaves, who the player is and who their character is. reccore.js and the shell's recstore.js are run for real;
   the wiring is pinned. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const dir = path.join(__dirname, '..'), app = path.join(dir, 'system', 'app');
let pass = 0, fail = 0, summed = false;
function check(name, ok, info) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (info !== undefined ? ' -> ' + info : '')); } }
process.on('exit', () => { if (!summed) { console.log('the suite ended before its summary'); process.exitCode = 1; } });
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify;

(async () => {
    const src = fs.readFileSync(path.join(app, 'scripts', 'reccore.js'), 'utf8').replace(/\r\n/g, '\n');
    const tmp = path.join(os.tmpdir(), 'wp-reccore-' + process.pid + '.mjs'); fs.writeFileSync(tmp, src, 'utf8');
    const C = await import('file://' + tmp.replace(/\\/g, '/')); fs.unlinkSync(tmp);
    const FMT = { day: t => 'D' + t, time: t => 'T' + t };

    /* ---------- a line ---------- */
    const l1 = C.cleanLine({ t: 5, k: 'roll', w: 'Ava', x: 'Rolled', d: '3d6', g: 'Day 1', h: true, extra: 'no' });
    check('a line holds what it says and nothing else: the two clocks, the chip, who, what, the detail and whether players saw it',
        J(l1) === J({ t: 5, k: 'roll', g: 'Day 1', w: 'Ava', x: 'Rolled', d: '3d6', h: 1 }), J(l1));
    check('a line with no time is no line, and a word that is no chip reads as Table, never as a kind of its own',
        C.cleanLine({ k: 'roll' }) === null && C.cleanLine(null) === null && C.cleanLine({ t: NaN }) === null && C.cleanLine({ t: 1, k: '__proto__' }).k === 'table');
    check('a line keeps a hostile text as words, bounded: control characters out, the lengths held',
        C.cleanLine({ t: 1, x: 'a\u0000b', w: 'w'.repeat(500) }).x === 'a b' && C.cleanLine({ t: 1, w: 'w'.repeat(500) }).w.length === 80);
    const text = [{ t: 1, k: 'open', room: 'R' }, { t: 2, k: 'beat' }, { t: 3, k: 'roll', x: 'A' }, { t: 4, k: 'sheet', x: 'B', h: 1 }, { t: 5, k: 'end', how: 'end' }].map(o => JSON.stringify(o)).join('\n') + '\nnot json\n';
    const lines = C.parseFile(text);
    check('a session\'s file is read line by line, a torn line passed over; the marks of a session are no events', lines.length === 5 && C.filter(lines, 'all', '').length === 2, J(lines));

    /* ---------- what shows ---------- */
    const ls = [{ t: 1, k: 'roll', w: 'Ava Tolin', x: 'Rolled Aim' }, { t: 2, k: 'chat', w: 'Sam', x: 'Said in chat', d: 'duck' }, { t: 3, k: 'bg', w: 'Hound', x: 'Effect', g: 'Day 2' }];
    check('a chip shows its own kind, Everything shows every kind, and words narrow them all, in any case and any order',
        C.filter(ls, 'roll', '').length === 1 && C.filter(ls, 'all', '').length === 3 && C.filter(ls, 'all', 'AIM ava').length === 1 && C.filter(ls, 'all', 'duck').length === 1 && C.filter(ls, 'all', 'day 2').length === 1 && C.filter(ls, 'chat', 'hound').length === 0);
    check('the chips hold every kind a line may be, with Everything first', C.CHIPS[0][0] === 'all' && ['roll', 'bg', 'fight', 'move', 'sheet', 'player', 'chat', 'table', 'gm'].every(k => C.CHIPS.some(c => c[0] === k) && C.cleanLine({ t: 1, k }).k === k && C.ICON[k]));

    /* ---------- a session ---------- */
    const H = 60000 * 60;
    const w1 = C.sessionWords({ head: { t: 1000 }, end: { t: 1000 + H }, last: 1000 + H }, FMT, false, 0);
    const w2 = C.sessionWords({ head: { t: 1000 }, end: null, last: 1000 + 90 * 60000 }, FMT, false, 0);
    const w3 = C.sessionWords({ head: { t: 1000 }, end: null, last: 1000 }, FMT, true, 1000 + 5 * 60000);
    check('a session ended by End Session says so, with its real times; one with no end line ended when its last line was written, which is the moment Waypoint closed; the one running says to now',
        w1.day === 'D1000' && w1.note === '1 h 0 min. Ended by End Session' && w1.span === 'T1000 to T' + (1000 + H)
        && w2.note === '1 h 30 min. Waypoint closed' && w2.span === 'T1000 to T' + (1000 + 90 * 60000)
        && w3.span === 'T1000 to now' && w3.note === '5 minutes. Still running', J([w1, w2, w3]));
    check('who a player is playing: the first character, the others after it, and a player with none said so', C.plays(['Ava']) === 'Plays Ava' && C.plays(['Sam', 'Rook', 'Tip']) === 'Plays Sam, and also Rook, Tip' && C.plays([]) === 'No character yet' && C.plays(['', null]) === 'No character yet');

    /* ---------- a sheet's change ---------- */
    const nm = r => r.defId === 'd1' ? 'Rope' : '';
    check('a number, a pool and a tick say from and to, by the field\'s own label; what did not change says nothing',
        J(C.fieldLines('Hit Points', { cur: 27 }, { cur: 21 })) === J([{ x: 'Hit Points', d: '27 → 21' }]) && J(C.fieldLines('Aim', 12, 13)) === J([{ x: 'Aim', d: '12 → 13' }]) && C.fieldLines('Worn', false, true)[0].d === 'off → on' && C.fieldLines('Aim', 12, 12).length === 0);
    const lst = C.fieldLines('Items', [{ id: 'a', defId: 'd1', qty: 3 }, { id: 'b', name: 'Lamp', on: false }, { id: 'c', name: 'Gone' }], [{ id: 'a', defId: 'd1', qty: 1 }, { id: 'b', name: 'Lamp', on: true }, { id: 'n', name: 'New' }], nm);
    check('a list says what came, what went, what was switched and what its quantity did, by the row\'s name',
        J(lst) === J([{ x: 'Items: Rope', d: 'Quantity 3 → 1' }, { x: 'Items: Lamp switched on' }, { x: 'Items: added New' }, { x: 'Items: removed Gone' }]), J(lst));
    check('a name lookup that throws costs the line nothing', C.fieldLines('L', [], [{ id: 'x' }], () => { throw new Error('x'); })[0].x === 'L: added a row');

    /* ---------- text and the old log ---------- */
    const t = C.asText('C', 'D', [{ t: 1, k: 'open' }, { t: 2, k: 'roll', g: 'Day 1', w: 'Ava', x: 'Rolled', d: '9', h: 1 }], FMT);
    check('Save as text writes both clocks, who, what and the detail, marks what players never saw and leaves the session\'s own marks out', t === 'C\nD\n\nT2  Day 1  Ava: Rolled (9)  [kept from players]\n', J(t));
    const old = C.oldSessions([{ at: 1, kind: 'session', text: 'Session started' }, { at: 2, kind: 'dice', text: 'A rolled' }, { at: 3, kind: 'session', text: 'Session ended' }, { at: 50, kind: 'session', text: 'Session started' }, { at: 51, kind: 'chat', text: 'hi' }], 50);
    check('the Game Record a campaign kept before the record reads as sessions, newest first, by the same chips; what a file holds is left to the file',
        old.length === 1 && old[0].start === 1 && old[0].ended === 3 && old[0].lines.length === 1 && old[0].lines[0].k === 'roll' && C.oldSessions('x').length === 0, J(old));

    /* ---------- the store, run for real ---------- */
    const RS = require(path.join(dir, 'system', 'resources', 'app', 'recstore.js'));
    const saves = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-rec-'));
    const call = (method, query, body) => new Promise(res => {
        const url = new URL('http://localhost/api/record' + query), out = { code: 0, text: '' }, handlers = {};
        const req = { method, headers: {}, setEncoding() {}, on(ev, fn) { handlers[ev] = fn; return req; }, destroy() {} }, r = { writeHead(c) { out.code = c; }, end(t) { out.text = String(t === undefined ? '' : t); res(out); } };
        RS.handle(req, r, url, saves);
        if (method === 'POST') setImmediate(() => { if (handlers.data) handlers.data(String(body || '')); if (handlers.end) handlers.end(); });
    });
    const SID = 's_1793000000000_abc123', a1 = await call('POST', '?camp=c1&session=' + SID, JSON.stringify({ t: 10, k: 'open', room: 'R' }) + '\n'), a2 = await call('POST', '?camp=c1&session=' + SID, JSON.stringify({ t: 20, k: 'roll', x: 'A' }) + '\n');
    const got = await call('GET', '?camp=c1&session=' + SID), lst1 = JSON.parse((await call('GET', '?camp=c1')).text);
    check('a session\'s file only grows: two writes read back in order, and the list says its first line and when its last was written',
        a1.code === 200 && a2.code === 200 && got.text.trim().split('\n').length === 2 && lst1.sessions.length === 1 && lst1.sessions[0].id === SID && lst1.sessions[0].head.t === 10 && lst1.sessions[0].last === 20 && lst1.sessions[0].end === null, J(lst1));
    await call('POST', '?camp=c1&session=' + SID, JSON.stringify({ t: 30, k: 'end', how: 'end' }) + '\n');
    check('an End Session line says how the session ended', JSON.parse((await call('GET', '?camp=c1')).text).sessions[0].end.t === 30);
    const bad = [await call('GET', '?camp=..%2F..'), await call('GET', '?camp=c1&session=..%2Fdata'), await call('POST', '?camp=c1&session=' + SID, 'not json\n'), await call('POST', '?camp=c1&session=nope', '{}\n'), await call('GET', '?camp=c1&session=s_1793000000001_zzzzzz')];
    check('a name that walks out, a session that is no session, a body that is no lines and a file not there are each refused, and nothing is written', bad.map(b => b.code).join() === '400,400,400,400,404' && fs.readFileSync(RS.fileOf(RS.campDir(saves, 'c1'), SID), 'utf8').trim().split('\n').length === 3, bad.map(b => b.code).join());
    const del = await call('DELETE', '?camp=c1&session=' + SID);
    check('a session can be deleted, and a torn line is never written', del.code === 200 && JSON.parse((await call('GET', '?camp=c1')).text).sessions.length === 0 && RS.cleanAdd('{"a":1}\n{"a"') === null);
    fs.rmSync(saves, { recursive: true, force: true });

    /* ---------- the wiring ---------- */
    const net = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1'), rj = read('scripts/record.js'), ix = read('index.html'), css = read('style.css');
    const main = fs.readFileSync(path.join(dir, 'system', 'resources', 'app', 'main.js'), 'utf8'), dev = fs.readFileSync(path.join(dir, 'tools', 'dev-server.js'), 'utf8'), guard = require(path.join(dir, 'system', 'resources', 'app', 'reqguard.js'));
    check('both servers route it alike, and a session\'s file is read through that route alone, never as a file under saves/',
        ["if (url.pathname === '/api/record') { recstore.handle(req, res, url, savesDir); return; }"].every(s => main.includes(s) && dev.includes(s)) && guard.savesHidden('/saves/record/c1/s.jsonl') && guard.savesHidden('/saves/RECORD./x') && !guard.savesHidden('/saves/images/x.png'));
    check('the session opens with the table and ends with End Session; a reload is the same session; a line goes down each tick and as the window closes, so a session Waypoint closed on ends at its last line',
        net.includes('window.wpRecord.start(getActiveCampaign(), showCode(code), !!resumed);') && net.includes('window.wpRecord.end(); logEvent(\'session\', \'Session ended\');') && /sessionStorage\.getItem\('wp_recSess'\)/.test(rj) && rj.includes("addEventListener('pagehide'") && /keepalive/.test(rj) && /k: 'beat'/.test(rj));
    check('a join and a leave say who the player is and who their character is', net.includes("x: 'Joined the table', d: typeof playsOf === 'function' ? playsOf(prof.id)") && net.includes("x: 'Left the table', d: typeof playsOf === 'function' ? playsOf(p.id)"));
    check('the record is the host\'s alone: no line is written on a player\'s app, and no message names it', /net\.active && net\.role === 'host'\) window\.wpRecord\.add/.test(net) && !/type: 'record/.test(net) && !/\bnet\.send|\.send\(/.test(rj));
    check('everything is hooked: rolls, chat, moves by the GM and by players, a door, sight, every change of a sheet, the fights\' rounds and turns, the time rules',
        net.includes("{ w: recQ.as || (recQ.from && recQ.from.name) || '', h: !!recQ.priv }") && net.includes("x: 'Said in chat'") && net.includes('window.wpRecord.moved(map, w, frW, pr && pr.name)') && net.includes('window.wpRecord.board(getActiveCampaign(), getActiveMap())') && net.includes("' a door'") && net.includes("'Now sees ' + nmS(") && net.includes('window.wpRecord.sheet(getActiveCampaign(), id)') && net.includes("' begins'") && net.includes("'Turn starts'") && net.includes("'Turn ends'") && read('scripts/timepanel.js').includes("'Time rules ran'"));
    check('the window is drawn from text nodes, and the page holds it where the Game Record stood', !/innerHTML/.test(rj) && ix.includes('id="sessionLogModal"') && ix.includes('<script type="module" src="scripts/record.js"></script>') && ix.includes('id="recChips"') && ix.includes('id="recSessions"') && css.includes('.rec-row.hid'));
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    summed = true;
    if (fail) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
