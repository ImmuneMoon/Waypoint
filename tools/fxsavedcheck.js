/* Offline check of saved effects with sounds (1.6.2, backlog 81 and 99; the owner's answers of 2026-11-07: "Up to three, layered",
   "Save what is running", "In the campaign", "Yes, as music does", "A Layer button on each loop").
   The pure halves imported and run: soundcore's layer cue and cleanSoundNow, fxcore's cleanSaved, savedMake, savedFx, savedOn and savedFor.
   The page's halves sliced by their markers and run for real on stand-ins: sound.js's lanes, its ambient lane, the GM's half and the wire
   (a host world and a player's world joined by the very messages the host sends, a latecomer's list, an older host), and fx.js's saved
   effects (the panel's rows through esc, a press, a map left and a map opened). Usage: node tools/fxsavedcheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name); } }
process.on('exit', function() { if (!summed) { console.log('FAIL      the suite never reached its summary (a check left waiting)'); process.exitCode = 1; } });
const SCRIPTS = path.join(__dirname, '..', 'system', 'app', 'scripts');
const read = (f) => fs.readFileSync(path.join(SCRIPTS, f), 'utf8').replace(/\r\n/g, '\n');
function slice(src, name) { const a = src.indexOf('// [' + name + '-start]'), b = src.indexOf('// [' + name + '-end]'); if (a < 0 || b < a) throw new Error('no slice ' + name); return src.slice(a, b); }
const tick = () => new Promise(function(r) { setTimeout(r, 0); });

(async function() {
    const SC = await import(pathToFileURL(path.join(SCRIPTS, 'soundcore.js')).href);
    const FC = await import(pathToFileURL(path.join(SCRIPTS, 'fxcore.js')).href);
    const list = [
        { id: 'rain', def: true, name: 'Rain', kind: 'loop', gain: 1, dur: 30 }, { id: 'forest', def: true, name: 'Forest', kind: 'loop', gain: 1, dur: 30 },
        { id: 'cavern', def: true, name: 'Cavern', kind: 'loop', gain: 1, dur: 30 }, { id: 'wind', def: true, name: 'Wind', kind: 'loop', gain: 0.5, dur: 30 },
        { id: 'dungeon', def: true, name: 'Dungeon', kind: 'loop', gain: 1, dur: 30 }, { id: 'door', def: true, name: 'Door', kind: 'cue', gain: 1, dur: 2 }
    ];
    const defaults = {}; list.forEach(function(e) { defaults[e.id] = { name: e.name, file: e.id + '.ogg', kind: e.kind, dur: e.dur }; });
    const clean = SC.cleanSoundList(list.map(function(e) { return { id: e.id, def: true, name: e.name, kind: e.kind, gain: e.gain, dur: e.dur }; }), { defaults: defaults });

    /* ---- soundcore: the layer cue and what plays now ---- */
    const lc = SC.cleanSoundCue({ act: 'layer', id: 'forest', gain: 9, vol: 4, path: '/x' }, clean);
    check('soundcore: a layer cue names a listed loop, its gain held to 2 and its volume to 1, nothing else kept', lc && lc.act === 'layer' && lc.id === 'forest' && lc.gain === 2 && lc.vol === 1 && lc.path === undefined && SC.cleanSoundCue({ act: 'layer', id: 'evil' }, clean) === null);
    check('soundcore: an ambient cue carries a volume, absent read as 1, a cue none', SC.cleanSoundCue({ act: 'ambient', id: 'rain', vol: 0.25 }, clean).vol === 0.25 && SC.cleanSoundCue({ act: 'ambient', id: 'rain' }, clean).vol === 1 && SC.cleanSoundCue({ act: 'cue', id: 'door' }, clean).vol === undefined);
    check('soundcore: three loops at most, the ambient one and two layers', SC.LIMITS.layers === 2);
    const nw = SC.cleanSoundNow({ ambientId: 'rain', gain: 0.8, vol: 0.5, layers: [{ id: 'rain' }, { id: 'evil' }, { id: 'forest', gain: 5, vol: -1 }, { id: 'forest' }, { id: 'cavern', vol: 0.4 }, { id: 'wind' }, null, 'x'] }, clean);
    check('soundcore: cleanSoundNow keeps listed layers once, never the ambient one again, two at most, each held to its bounds', nw.id === 'rain' && nw.gain === 0.8 && nw.vol === 0.5 && nw.layers.length === 2 && nw.layers[0].id === 'forest' && nw.layers[0].gain === 2 && nw.layers[0].vol === 0 && nw.layers[1].id === 'cavern' && nw.layers[1].vol === 0.4);
    const old = SC.cleanSoundNow({ ambientId: 'rain', gain: 1 }, clean), none = SC.cleanSoundNow(null, clean), unl = SC.cleanSoundNow({ ambientId: 'evil', layers: [{ id: 'forest' }] }, clean);
    check('soundcore: an older host\'s now has no layers; nothing or an unlisted loop is no loop, and then no layers either', old.id === 'rain' && old.layers.length === 0 && old.vol === 1 && none.id === null && unl.id === null && unl.layers.length === 0);

    /* ---- sound.js on stand-ins: a host world and a player's world ---- */
    const snd = read('sound.js');
    const body = slice(snd, 'soundcheck:lanes') + slice(snd, 'soundcheck:ambient') + slice(snd, 'soundcheck:hostlanes') + slice(snd, 'soundcheck:wire');
    function world(role) {
        const W = { sent: [], started: 0, stopped: 0, n: { sounds: role === 'client' ? clean.slice() : null }, on: true, suspended: false };
        const ac = { state: 'running', currentTime: 0, destination: {},
            createGain: function() { return { gain: { value: 1, cancelScheduledValues: function() {}, setValueAtTime: function() {}, exponentialRampToValueAtTime: function(v) { this.value = v; } }, connect: function() {} }; },
            createBufferSource: function() { return { connect: function() {}, start: function() { W.started++; }, stop: function() { W.stopped++; } }; } };
        Object.defineProperty(ac, 'state', { get: function() { return W.suspended ? 'suspended' : 'running'; } });
        W.n.sendSound = function(m) { W.sent.push(JSON.parse(JSON.stringify(m))); };
        const f = new Function('W', 'ACX', 'LIMITS', 'cleanSoundList', 'cleanSoundCue', 'cleanSoundNow', 'mixGain', 'defaults', 'list',
            'var ctx = ACX, ambient = null, layers = [], cues = [], ambientWant = null, layerWant = Object.create(null), pendingLayers = [], pendingGate = null, muted = false, local = 1, master = 1, hostMaster = 1, atTable = false;\n' +
            'var defaultsLoaded = Promise.resolve();\n' +
            'function ac() { return ACX; } function ramp(g, to) { g.gain.value = to; } function emit() {} function streamPost() {} function toast() {} function showGate() { W.gate = true; } function renderInd() {} function prefetch() {}\n' +
            'function refresh() { W.refreshed = (W.refreshed || 0) + 1; } function featureOn() { return W.on; } function playCue() {} function stopAll(f) { stopLoops(f); }\n' +
            'function isClient() { return ' + (role === 'client') + '; } function isHost() { return ' + (role === 'host') + '; } function net() { return W.n; }\n' +
            'function effGain(e) { return mixGain(e, isClient() ? hostMaster : master, local); }\n' +
            'function bufferFor(e) { return Promise.resolve({ buffer: { duration: 10 }, loopEnd: 0 }); }\n' +
            'function entryById(id) { return list.find(function(e) { return e.id === id; }) || null; }\n' +
            'function getActiveCampaign() { return { id: "c1" }; } function ownEntries() { return []; } function defaultEntries() { return list; }\n' +
            body + '\nreturn { hostPlayAmbient: hostPlayAmbient, hostLayer: hostLayer, hostStopLoop: hostStopLoop, hostLaneVol: hostLaneVol, hostPlaySet: hostPlaySet, hostStopAmbient: hostStopAmbient, onCue: onCue, onList: onList, listMessage: listMessage, playLayer: playLayer,\n' +
            ' ids: function() { return lanes().map(function(l) { return l.entry.id; }); }, vols: function() { return lanes().map(function(l) { return Math.round(laneVol(l) * 100) / 100; }); }, gains: function() { return lanes().map(function(l) { return Math.round(l.gain.gain.value * 1000) / 1000; }); }, amb: function() { return ambient ? ambient.entry.id : null; }, pend: function() { return pendingLayers.map(function(p) { return p.entry.id; }); } };');
        W.api = f(W, ac, SC.LIMITS, SC.cleanSoundList, SC.cleanSoundCue, SC.cleanSoundNow, SC.mixGain, defaults, list);
        return W;
    }
    const H = world('host'), P = world('client');
    async function deliver() { await tick(); const ms = H.sent.splice(0); ms.forEach(function(m) { P.api.onCue(m); }); await tick(); await tick(); return ms; }
    const E = function(id) { return list.find(function(e) { return e.id === id; }); };
    H.api.hostPlayAmbient(E('rain')); let ms = await deliver();
    check('wire: a loop pressed plays alone on the host and is sent as the ambient loop at volume 1', JSON.stringify(H.api.ids()) === '["rain"]' && ms.length === 1 && ms[0].act === 'ambient' && ms[0].id === 'rain' && ms[0].vol === 1 && JSON.stringify(P.api.ids()) === '["rain"]');
    H.api.hostLayer(E('forest'), 0.5); ms = await deliver();
    check('wire: a Layer press plays the loop beside it and sends a layer at its own volume; the player hears both', JSON.stringify(H.api.ids()) === '["rain","forest"]' && ms[0].act === 'layer' && ms[0].vol === 0.5 && ms[0].gain === 0.5 && JSON.stringify(P.api.ids()) === '["rain","forest"]' && JSON.stringify(P.api.vols()) === '[1,0.5]');
    check('wire: the player\'s app plays the layer at the gain the host sent', P.api.gains()[1] === 0.5 && H.api.gains()[1] === 0.5);
    H.api.hostLayer(E('cavern')); H.api.hostLayer(E('wind')); ms = await deliver();
    check('wire: past three loops the oldest layer goes, on the host and on the player\'s app alike', JSON.stringify(H.api.ids()) === '["rain","cavern","wind"]' && JSON.stringify(P.api.ids()) === '["rain","cavern","wind"]');
    H.api.hostStopLoop('rain'); ms = await deliver();
    check('wire: one loop stopped by its own stop; the first layer takes the ambient one\'s place on both machines', ms[0].act === 'stop' && ms[0].id === 'rain' && H.api.amb() === 'cavern' && P.api.amb() === 'cavern' && JSON.stringify(P.api.ids()) === '["cavern","wind"]' && P.n.soundNow === 'cavern');
    const before = P.started;
    H.api.hostLaneVol('cavern', 0.3, false); await deliver();
    const quiet = P.api.vols()[0] === 1;
    H.api.hostLaneVol('cavern', 0.3, true); ms = await deliver();
    check('wire: a loop\'s volume moves here as the slider moves and reaches the table when let go, the loop never started again', quiet && ms.length === 1 && ms[0].act === 'ambient' && ms[0].vol === 0.3 && P.api.vols()[0] === 0.3 && P.started === before && JSON.stringify(P.api.ids()) === '["cavern","wind"]');
    // a latecomer: the host's list message rebuilds every loop at its volume
    const L = world('client'), lm = H.api.listMessage(); L.api.onList(JSON.parse(JSON.stringify(lm))); await tick(); await tick(); await tick();
    check('wire: a player who joins hears every loop at its own volume from the host\'s list', lm.now.ambientId === 'cavern' && lm.now.vol === 0.3 && lm.now.layers.length === 1 && JSON.stringify(L.api.ids()) === '["cavern","wind"]' && JSON.stringify(L.api.vols()) === '[0.3,1]' && L.n.soundLayers.length === 1);
    // an older host's list (no layers): only the ambient loop, any layer a newer list left goes
    L.api.onList({ list: lm.list, master: 1, now: { ambientId: 'cavern', gain: 1 } }); await tick(); await tick(); await tick();
    check('wire: a list with no layers leaves the ambient loop playing and takes the layers away', JSON.stringify(L.api.ids()) === '["cavern"]');
    // a loop pressed while layers play: it is the one loop now, on both
    H.api.hostPlayAmbient(E('dungeon')); ms = await deliver();
    check('wire: a loop pressed while three play replaces them all, on the host and the player\'s app', JSON.stringify(H.api.ids()) === '["dungeon"]' && JSON.stringify(P.api.ids()) === '["dungeon"]' && (P.n.soundLayers || []).length === 0);
    // a set (a saved effect): the first is the loop, the others layered, each at its volume
    const nset = H.api.hostPlaySet([{ id: 'forest', vol: 0.4 }, { id: 'evil' }, { id: 'door' }, { id: 'rain', vol: 0.9 }, { id: 'wind' }, { id: 'cavern' }]); ms = await deliver();
    check('wire: a saved set plays its loops, the first as the ambient one, at their volumes; a cue or an unknown id is passed over, four loops cut to three', nset === 3 && JSON.stringify(H.api.ids()) === '["forest","rain","wind"]' && JSON.stringify(H.api.vols()) === '[0.4,0.9,1]' && JSON.stringify(P.api.ids()) === '["forest","rain","wind"]' && JSON.stringify(P.api.vols()) === '[0.4,0.9,1]');
    // sound off on the player's app: what the host plays is noted, not played; on again it resumes
    P.on = false; H.api.hostStopAmbient(); await deliver(); H.api.hostPlayAmbient(E('cavern')); H.api.hostLayer(E('rain'), 0.7); await deliver();
    check('wire: with sound off here the loops are noted, not played', P.api.ids().length === 0 && P.n.soundNow === 'cavern' && P.n.soundLayers.length === 1 && P.n.soundLayers[0].id === 'rain' && P.n.soundLayers[0].vol === 0.7);
    H.api.hostStopAmbient(); ms = await deliver();
    check('wire: the stop of every loop goes as the one word an older app knows', ms[0].act === 'stop' && ms[0].id === 'ambient' && H.api.ids().length === 0);
    // a layer asked for while the browser holds sound back waits for the gate
    const G = world('client'); G.suspended = true; G.api.onCue({ act: 'ambient', id: 'rain' }); G.api.onCue({ act: 'layer', id: 'forest', vol: 0.5 }); await tick(); await tick();
    check('wire: behind the autoplay gate a layer waits with the ambient loop', G.gate === true && JSON.stringify(G.api.pend()) === '["forest"]' && G.api.ids().length === 0);
    // two layers asked for at once never make two ambient loops
    const T = world('client'); T.api.onCue({ act: 'ambient', id: 'rain' }); T.api.onCue({ act: 'layer', id: 'forest' }); T.api.onCue({ act: 'layer', id: 'forest' }); await tick(); await tick(); await tick();
    check('wire: a layer asked for while the ambient loop still loads is a layer, and asked twice it plays once', JSON.stringify(T.api.ids()) === '["rain","forest"]' && T.started === 2);

    /* ---- fxcore: saved effects ---- */
    const sv = FC.cleanSaved([
        { id: 'se_a1', name: '  Stormy\u0007 forest  ', weather: { look: 'rain', density: 3 }, wash: { color: '#AA0000', alpha: 0.01 }, loops: [{ id: 'forest', vol: 2 }, { id: 'forest' }, { id: 'bad id' }, { id: 'rain', vol: 0.333 }, { id: 'wind' }, { id: 'cavern' }] },
        { id: 'se_a1', name: 'dup', loops: [{ id: 'rain' }] }, { id: '__proto__', name: 'x', loops: [{ id: 'rain' }] }, { id: 'se_b', name: '', loops: [{ id: 'rain' }] },
        { id: 'se_c', name: 'Empty' }, { id: 'se_d', name: 'Bad look', weather: { look: 'lava' }, wash: { color: 'red' } }, { id: 'se_e', name: 'Ok', wash: { color: '#000000', alpha: 0.8 } }
    ]);
    check('fxcore: cleanSaved keeps an id once by its pattern, a name of plain words, one of each part held to its bounds, three loops at most', sv.length === 2 && sv[0].id === 'se_a1' && sv[0].name === 'Stormy forest' && sv[0].weather.density === 1 && sv[0].wash.color === '#aa0000' && sv[0].wash.alpha === 0.2 && JSON.stringify(sv[0].loops) === '[{"id":"forest","vol":1},{"id":"rain","vol":0.33},{"id":"wind","vol":1}]' && sv[1].id === 'se_e');
    check('fxcore: a saved effect with nothing in it, a bad look or a colour that is none is no effect', !sv.some(function(s) { return s.id === 'se_c' || s.id === 'se_d'; }));
    const many = []; for (let i = 0; i < 40; i++) many.push({ id: 'se_' + i, name: 'E' + i, loops: [{ id: 'rain' }] });
    check('fxcore: 24 saved effects at most; anything that is no list none', FC.cleanSaved(many).length === FC.SAVED.count && FC.SAVED.count === 24 && FC.cleanSaved('x').length === 0 && FC.cleanSaved({ length: 3 }).length === 0);
    const long = FC.cleanSavedOne({ id: 'se_x', name: 'a'.repeat(39) + '🌧b', loops: [{ id: 'rain' }] });
    check('fxcore: a name is cut at 40 characters and never through the middle of one', long.name.length === 41 && long.name.slice(-2) === '🌧');
    const made = FC.savedMake({ weather: { look: 'snow', density: 0.45, mapId: 'm1', kind: 'weather' }, wash: null }, [{ id: 'wind', vol: 0.5, name: 'Wind' }], 'Blizzard', 'se_z');
    check('fxcore: savedMake keeps what runs and nothing of the map', made && made.weather.look === 'snow' && made.weather.density === 0.45 && made.weather.mapId === undefined && !made.wash && made.loops.length === 1 && made.loops[0].name === undefined);
    const fx = FC.savedFx(sv[0], 'm1');
    check('fxcore: savedFx gives the weather and the colour held until cleared, each a message cleanFx takes as it is', fx.length === 2 && fx.every(function(m) { const c = FC.cleanFx(m); return c && c.mapId === 'm1' && c.kind === m.kind; }) && FC.cleanFx(fx[1]).hold === true && FC.savedFx(sv[0], '').length === 0);
    const st = { weather: { look: 'rain', density: 0.995 }, wash: { color: '#aa0000', alpha: 0.2 } };
    check('fxcore: savedOn is true only while every part runs, the density read to a hundredth', FC.savedOn(sv[0], st, ['forest', 'rain', 'wind']) && !FC.savedOn(sv[0], st, ['forest', 'rain']) && !FC.savedOn(sv[0], { weather: { look: 'snow', density: 1 }, wash: st.wash }, ['forest', 'rain', 'wind']) && !FC.savedOn(sv[0], { weather: st.weather }, ['forest', 'rain', 'wind']) && !FC.savedOn(null, st, []));
    check('fxcore: savedFor finds a map\'s own effect by id among the campaign\'s, else none', FC.savedFor({ meta: { fxEffect: 'se_e' } }, sv).name === 'Ok' && FC.savedFor({ meta: { fxEffect: 'se_q' } }, sv) === null && FC.savedFor({ meta: { fxEffect: 7 } }, sv) === null && FC.savedFor(null, sv) === null && FC.savedFor({}, sv) === null);

    /* ---- fx.js: the panel's saved rows and a map moved, on stand-ins ---- */
    const fxs = read('fx.js'), sliced = slice(fxs, 'fxcheck:saved');
    function fxWorld() {
        const X = { played: [], sets: [], stops: [], saved: 0, loops: [], camp: { id: 'c1', items: {}, fxSaved: null }, map: null, write: true };
        X.wpSound = { loops: function() { return X.loops; }, playSet: function(l) { X.sets.push(l); }, stopLoop: function(id) { X.stops.push(id); }, stop: function(w) { X.stops.push(w); } };
        const f = new Function('X', 'FC', 'PRESETS',
            'var cleanSaved = FC.cleanSaved, savedMake = FC.savedMake, savedFx = FC.savedFx, savedOn = FC.savedOn, savedFor = FC.savedFor, SAVED = FC.SAVED;\n' +
            'var window = { wpSound: X.wpSound };\n' +
            'function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }\n' +
            'function getActiveCampaign() { return X.camp; } function getActiveMap() { return X.map; } function mapNow() { return X.map ? X.map.id : null; } function save() { X.saved++; }\n' +
            'function canWrite() { return X.write; } function isClient() { return false; } function featureOn() { return true; } function toast(t) { X.toast = t; } function syncButtons() {} function renderPanel() {}\n' +
            'function panelState() { return X.st || {}; } function play(m) { X.played.push(m); if (m.kind === "weather") X.st = Object.assign({}, X.st, { weather: m }); if (m.kind === "wash") X.st = Object.assign({}, X.st, { wash: m }); if (m.kind === "stop") { X.st = Object.assign({}, X.st); delete X.st[m.what]; } }\n' +
            'function showPrompt(t, d, cb) { X.prompt = d; cb(X.answer === undefined ? d : X.answer); } function showConfirm(t, cb) { X.asked = t; cb(true); }\n' +
            sliced + '\nreturn { savedHtml: savedHtml, savedSave: savedSave, savedStart: savedStart, savedStop: savedStop, savedRuns: savedRuns, mapMoved: mapMoved, savedForMap: savedForMap, savedDel: savedDel, savedList: savedList };');
        X.api = f(X, FC, FC.PRESETS); return X;
    }
    const X = fxWorld();
    X.camp.items.m1 = { id: 'm1', type: 'map', meta: {} }; X.camp.items.m2 = { id: 'm2', type: 'map', meta: {} }; X.map = X.camp.items.m1;
    X.st = { weather: { kind: 'weather', mapId: 'm1', look: 'rain', density: 0.6 } }; X.loops = [{ id: 'forest', name: 'Forest', vol: 0.5 }, { id: 'cavern', name: 'Cavern', vol: 1 }];
    X.answer = '<b>Storm</b> & "co"'; X.api.savedSave();
    check('fx.js: Save as an effect offers what runs in words and keeps it by the name typed, in the campaign', X.prompt === 'Rain, Forest and Cavern' && X.camp.fxSaved.length === 1 && X.camp.fxSaved[0].name === '<b>Storm</b> & "co"' && X.camp.fxSaved[0].loops.length === 2 && X.saved === 1);
    const html = X.api.savedHtml();
    check('fx.js: the panel\'s Saved and This map rows write a name only through esc', html.indexOf('<b>Storm') < 0 && html.indexOf('&lt;b&gt;Storm&lt;/b&gt; &amp; &quot;co&quot;') >= 0 && html.indexOf('id="fxMapEffect"') >= 0 && html.indexOf('Starts with none') >= 0);
    const X0 = fxWorld(); X0.map = { id: 'm9', type: 'map', meta: {} }; X0.api.savedSave();
    check('fx.js: with nothing running there is nothing to save, and it says so', X0.camp.fxSaved === null && /Nothing runs to save/.test(X0.toast));
    const sid = X.camp.fxSaved[0].id;
    check('fx.js: a saved effect that runs reads as running', X.api.savedRuns(X.api.savedList()[0]));
    X.api.savedStop(X.api.savedList()[0]);
    check('fx.js: pressed while it runs, it stops its weather and each of its loops', X.played.some(function(m) { return m.kind === 'stop' && m.what === 'weather'; }) && JSON.stringify(X.stops) === '["forest","cavern"]');
    X.played = []; X.stops = []; X.st = { wash: { color: '#000000', alpha: 0.8 } }; X.loops = [];
    X.api.savedStart(X.api.savedList()[0]);
    check('fx.js: pressed, it puts its parts on in place of what runs: a colour it lacks cleared, its weather on, its loops as a set', X.played[0].kind === 'stop' && X.played[0].what === 'wash' && X.played.some(function(m) { return m.kind === 'weather' && m.look === 'rain' && m.mapId === 'm1'; }) && X.sets.length === 1 && X.sets[0][0].id === 'forest' && X.sets[0][0].vol === 0.5);
    X.api.savedForMap(sid);
    check('fx.js: This map keeps the effect\'s id on the map, cleared by Starts with none', X.map.meta.fxEffect === sid && (X.api.savedForMap(''), X.map.meta.fxEffect === undefined) && (X.api.savedForMap(sid), X.map.meta.fxEffect === sid));
    X.loops = [{ id: 'forest' }, { id: 'cavern' }]; X.stops = []; X.sets = [];
    X.camp.items.m2.meta.fxEffect = sid; X.api.mapMoved('m1', 'm2');
    check('fx.js: from a map to another that starts with the same effect, nothing stops', X.stops.length === 0);
    delete X.camp.items.m2.meta.fxEffect; X.api.mapMoved('m1', 'm2');
    check('fx.js: leaving the map lets the effect\'s loops go', JSON.stringify(X.stops) === '["forest","cavern"]');
    X.loops = []; X.st = {}; X.played = []; X.map = X.camp.items.m1; X.api.mapMoved('m2', 'm1');
    check('fx.js: opening the map starts its effect', X.played.some(function(m) { return m.kind === 'weather'; }) && X.sets.length === 1);
    X.write = false; X.sets = []; X.loops = []; X.st = {}; X.api.mapMoved('m2', 'm1');
    check('fx.js: on a machine that does not own the campaign a map starts nothing', X.sets.length === 0);
    X.write = true; X.api.savedDel(sid);
    check('fx.js: Delete asks first, takes the effect away and the map that named it starts nothing now', /Delete the saved effect/.test(X.asked) && X.camp.fxSaved === undefined && X.camp.items.m1.meta.fxEffect === undefined);

    /* ---- the wire keeps the GM's own ---- */
    const net = fs.readFileSync(path.join(SCRIPTS, 'net.js'), 'latin1');
    check('net.js: the campaign\'s saved effects never leave the host, and a map\'s own one is among its GM-only meta keys in both lists', /delete camp\.fxSaved;/.test(net) && net.split("'tags', 'fxEffect']").length === 3);
    const css = fs.readFileSync(path.join(SCRIPTS, '..', 'style.css'), 'utf8');
    check('style.css: the Layer button, the loops that play and the saved rows have their rules, and the effects panel scrolls', ['.snd-layer', '.snd-lane', '.snd-lvol', '#fxBody .fx-savedgrp', '#fxBody .fx-saved-del'].every(function(s) { return css.indexOf(s) >= 0; }) && /#fxBody \{[^}]*overflow: auto/.test(css));
    const help = fs.readFileSync(path.join(SCRIPTS, '..', 'index.html'), 'utf8');
    check('Help names Layer and Save as an effect', /Save as an effect/.test(help) && /<b>Layer<\/b>/.test(help));
    const notes = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8'), notes2 = fs.readFileSync(path.join(SCRIPTS, '..', 'assets', 'whatsnew.txt'), 'utf8');
    check('both release notes say it', /Save as an effect/.test(notes) && /Save as an effect/.test(notes2));

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exitCode = 1;
})().catch(function(e) { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
