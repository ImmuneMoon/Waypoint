/* Offline check of the VTT settings resolver (system/app/scripts/vtt.js). window, localStorage, document and
   wpNet are stubbed the way tools/cleanupcheck.js stubs its surroundings, then the module is imported for real
   and driven through the truth table of docs/VTT_SETTINGS_BUILD_PLAN.md section 5 with the owner decisions of
   2026-09-18: solo, host, awaiting, joined, foreign-disconnected, leaving, the stream window, an old host's
   two-key stance payload, master off, an unknown id; the seeding and fill rules; the join-notice signature and
   decided logic; a fake extra feature (id 'zzz') pushed onto FEATURES; and fog — the noLocal feature, now on by
   default (GM-controlled, no per-player switch). Usage: node tools/vttcheck.js  (exit 1 on any failure) */
'use strict';
const path = require('path');
const mod = path.join(__dirname, '..', 'system', 'app', 'scripts', 'vtt.js');

/* ---- the browser, as far as vtt.js and state.js need it ---- */
const store = new Map();
global.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    key: i => Array.from(store.keys())[i] || null,
    get length() { return store.size; }
};
const els = {};
function el(id) {
    if (!els[id]) els[id] = { id, style: {}, textContent: '', dataset: {}, children: [], disabled: false,
        appendChild(c) { this.children.push(c); }, addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
    return els[id];
}
global.document = {
    getElementById: el,
    createElement: tag => Object.assign(el('new_' + tag + '_' + Math.random()), { tagName: tag }),
    createTextNode: t => ({ text: t }),
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    body: { classList: { contains: () => false, add() {}, remove() {}, toggle() {} } }
};
const toasts = [];
global.window = { addEventListener() {}, appToast: m => toasts.push(m), wpCanPersistLocal: null, wpNet: null };
global.window.wpSave = () => { saves++; };
let saves = 0;

/* ---- harness ---- */
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail ? '-> ' + detail : ''); } }
const j = o => JSON.stringify(o);

(async () => {
    const url = 'file:///' + path.resolve(mod).replace(/\\/g, '/');
    await import(url);
    const stateUrl = 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'state.js')).replace(/\\/g, '/');
    const { state } = await import(stateUrl);
    const V = window.wpVtt;
    check('window.wpVtt published', !!V && typeof V.on === 'function');

    // canPersistLocal as the leak fix defines it, over the stub net
    window.wpCanPersistLocal = function() {
        const n = window.wpNet;
        if (n && n.stream) return false;
        if (n && (n.foreign || (n.active && n.role === 'client'))) return false;
        return true;
    };
    function net(o) { window.wpNet = o ? Object.assign({ active: false, role: null, foreign: false, stream: false, stance: null, stanceCamps: null, gmId: '', notepad: null }, o) : null; return window.wpNet; }
    function camp(id, vtt) { const c = { id, name: 'Camp ' + id, activeItemId: null, items: {} }; if (vtt !== undefined) c.vtt = vtt; return c; }
    function world(camps, active) { state.appState = { activeCampaignId: active, campaigns: {} }; camps.forEach(c => { state.appState.campaigns[c.id] = c; }); }
    function eff() { return V.FEATURES.map(f => f.id + (V.on(f.id) ? 1 : 0)).join(''); }

    /* ---- the roster ---- */
    check('roster is elevation, posture, minimap, sound, dice, sheets, fx, fog with labels', V.FEATURES.map(f => f.id).join(',') === 'elevation,posture,minimap,sound,dice,sheets,fx,fog' && V.FEATURES.every(f => typeof f.label === 'string' && f.label));
    check('minimap and sound have no legacy key; elevation and posture keep theirs', V.FEATURES[2].legacyKey === null && V.FEATURES[3].legacyKey === null && V.FEATURES[3].id === 'sound' && V.FEATURES[4].legacyKey === null && V.FEATURES[4].id === 'dice' && V.FEATURES[5].legacyKey === null && V.FEATURES[5].id === 'sheets' && V.FEATURES[0].legacyKey === 'wp_elevation' && V.FEATURES[1].legacyKey === 'wp_posture');
    check('fog is the noLocal feature at the end of the roster (on by default, no def flag)', V.FEATURES[6].id === 'fx' && V.FEATURES[7].id === 'fog' && V.FEATURES[7].legacyKey === null && V.FEATURES[7].noLocal === true && V.FEATURES[7].def === undefined);

    /* ---- solo ---- */
    store.clear();
    net(null);
    world([camp('A', { v: 1, master: true, features: { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } })], 'A');
    check('solo: mode', V.mode() === 'solo' && !V.locked());
    check('solo: C over the on-screen campaign', eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog1');
    check('solo: fog is a known feature, on by default', V.on('fog') === true);
    check('solo: a genuinely unknown id → global → legacy → true', V.on('zzz') === true);
    check('solo: hostFlags = C of the active campaign', j(V.hostFlags()) === j({ elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true }));
    world([camp('A', { v: 1, master: false, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } })], 'A');
    check('master off: every feature off, hostFlags all false (no master on the wire)', eff() === 'elevation0posture0minimap0sound0dice0sheets0fx0fog0' && Object.values(V.hostFlags()).every(x => x === false));
    check('master off: the values are kept', state.appState.campaigns.A.vtt.features.elevation === true);

    /* ---- the fallback when camp.vtt is missing or damaged ---- */
    store.clear();
    world([camp('B')], 'B');
    check('no camp.vtt, no keys: on', eff() === 'elevation1posture1minimap1sound1dice1sheets1fx1fog1');
    localStorage.setItem('wp_elevation', 'off');
    check('no camp.vtt: the legacy key is the seed', eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog1');
    world([camp('B', { v: 1, master: true, features: { elevation: 'yes', posture: null } })], 'B');
    check('non-boolean feature values fall back per feature', eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog1');
    ['null', '5', '[]', '{"features":null}', 'off', '{"features":{"elevation":"on"}}'].forEach(raw => {
        localStorage.setItem('wp_vtt_global', raw);
        check('malformed wp_vtt_global ' + raw + ' falls back to legacy, never throws', V.globalOn('elevation') === false && V.globalOn('posture') === true && V.globalOn('minimap') === true);
    });
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: false, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    check('a global master false makes every globalOn false', !V.globalOn('elevation') && !V.globalOn('minimap'));
    check('globalVtt keeps master and features apart', V.globalVtt().master === false && V.globalVtt().features.elevation === true);

    /* ---- seeding and fill ---- */
    store.clear();
    localStorage.setItem('wp_elevation', 'off');
    let c = camp('C');
    check('fill adds vtt from the default (legacy elevation off) and reports a change', V.fill(c) === true && j(c.vtt) === j({ v: 1, master: true, features: { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true } }));
    check('fill on a filled campaign is a no-op', V.fill(c) === false);
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: false, features: { elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    c = camp('D', { v: 1, features: { elevation: true, posture: true, extra: 'kept' } });
    check('fill adds a missing master from the default master, the missing minimap from the default feature, keeps unknown keys',
        V.fill(c) === true && c.vtt.master === false && c.vtt.features.minimap === true && c.vtt.features.elevation === true && c.vtt.features.posture === true && c.vtt.features.extra === 'kept', j(c.vtt));
    check('a missing feature key takes the default feature value, not the master-folded one', c.vtt.features.minimap === true);
    // the lazy read-time fallback reads exactly what fill() would write, so a campaign never flips at the fill
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: false, features: { elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    c = camp('D2', { v: 1, master: true, features: {} });
    const lazyE = V.campaignOn('elevation', c), lazyP = V.campaignOn('posture', c), lazyVtt = j(V.campaignVtt(c));
    V.fill(c);
    check('a missing key under the campaign\'s own master reads the per-feature default (default master off ignored), the same before and after the fill',
        lazyE === true && lazyP === false && V.campaignOn('elevation', c) === lazyE && V.campaignOn('posture', c) === lazyP && c.vtt.features.elevation === true && lazyVtt === j(V.campaignVtt(c)), lazyE + ' ' + lazyP);
    c = camp('D3', { v: 1, features: {} });   // no master of its own: the default's master governs, before and after
    const lazyM = V.campaignOn('elevation', c);
    V.fill(c);
    check('a missing master reads the default master folded in, the same before and after the fill', lazyM === false && V.campaignOn('elevation', c) === false && c.vtt.master === false && c.vtt.features.elevation === true);
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    c = camp('D4', { v: 1, master: true, features: {} });
    check('a missing key under an on master with an on default master: per-feature default', V.campaignOn('elevation', c) === false && V.campaignOn('posture', c) === true);
    const legacyBefore = localStorage.getItem('wp_elevation');
    check('the legacy key is never written by a fill', localStorage.getItem('wp_elevation') === legacyBefore);
    check('allOn is every roster feature on (fog included)', j(V.allOn()) === j({ v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true } }));
    world([camp('E', { v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }), camp('F')], 'E');
    check('fillAll fills only the campaign that needs it', V.fillAll(state.appState) === true && state.appState.campaigns.F.vtt && state.appState.campaigns.E.vtt.features.elevation === true);

    /* ---- a fake extra feature (id 'zzz': a newer roster id an older peer would not know) ---- */
    V.FEATURES.push({ id: 'zzz', label: 'ZZZ test', legacyKey: null });
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    c = camp('G', { v: 1, master: true, features: { elevation: true, posture: false, minimap: false, sound: true, dice: true, sheets: true, fx: true, fog: false, extra: 1 } });
    const before = j(c.vtt.features);
    check('extra feature: fill adds only the new key (default on), other keys untouched', V.fill(c) === true && c.vtt.features.zzz === true && j(Object.assign({}, c.vtt.features, { zzz: undefined })) === j(Object.assign(JSON.parse(before), { zzz: undefined })), j(c.vtt));
    world([c], 'G');
    check('extra feature: campaignOn reads it; the wire carries it', V.campaignOn('zzz') === true && V.hostFlags().zzz === true && V.sig(V.hostFlags()).indexOf('zzz1') >= 0);
    c.vtt.features.zzz = false;
    check('extra feature: switching it reads back through on()', V.on('zzz') === false && V.on('elevation') === true);
    V.FEATURES.pop();

    /* ---- setGlobal touches no campaign; setCampaign touches one ---- */
    store.clear(); saves = 0;
    world([camp('H', { v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }), camp('I')], 'H');
    check('setGlobal writes the seed and materialises campaigns first', V.setGlobal('elevation', false) === true && JSON.parse(localStorage.getItem('wp_vtt_global')).features.elevation === false && state.appState.campaigns.I.vtt.features.elevation === true);
    check('an existing campaign keeps its own after a global change', V.campaignOn('elevation', state.appState.campaigns.H) === true && V.campaignOn('elevation', state.appState.campaigns.I) === true);
    check('setCampaign changes the campaign on screen only', V.setCampaign('posture', false) === true && state.appState.campaigns.H.vtt.features.posture === false && state.appState.campaigns.I.vtt.features.posture === true && saves >= 2);
    check('setMaster keeps the feature values', V.setMaster(false) && state.appState.campaigns.H.vtt.master === false && state.appState.campaigns.H.vtt.features.elevation === true && V.on('elevation') === false);
    check('pushTo copies master and the roster onto the chosen campaigns only', V.pushTo(['I']) === 1 && state.appState.campaigns.I.vtt.features.elevation === false && state.appState.campaigns.H.vtt.features.elevation === true);

    /* ---- host ---- */
    net({ active: true, role: 'host' });
    world([camp('J', { v: 1, master: true, features: { elevation: false, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true } })], 'J');
    check('host: mode, not locked, C, hostFlags = what players receive', V.mode() === 'host' && !V.locked() && eff() === 'elevation0posture1minimap0sound1dice1sheets1fx1fog1' && j(V.hostFlags()) === j({ elevation: false, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true, fog: true }));
    check('hostSig covers the hosted id and every campaign', V.hostSig().indexOf('J|') === 0 && V.hostSig().indexOf('J:elevation0posture1minimap0') > 0);
    check('host: setLocal refused', V.setLocal('posture', true) === false);

    /* ---- awaiting approval after a previous table ---- */
    net({ active: true, role: 'client', foreign: false, stance: { elevation: false, posture: false, minimap: false, sound: true, dice: true, sheets: true, fx: true } });
    world([camp('K', { v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } })], 'K');
    check('awaiting: mode, locked, C over the OWN campaign (a stale stance is ignored)', V.mode() === 'awaiting' && V.locked() && eff() === 'elevation1posture1minimap1sound1dice1sheets1fx1fog1' && V.ceiling() === null);
    check('awaiting: setCampaign refused, setLocal refused', V.setCampaign('elevation', false) === false && V.setLocal('elevation', true) === false);

    /* ---- joined ---- */
    store.clear();
    const gmA = net({ active: true, role: 'client', foreign: true, gmId: 'u_gm1', stance: { elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true }, stanceCamps: null });
    world([camp('X', { v: 1, master: true, features: { elevation: false, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true } })], 'X');   // the snapshot's camp.vtt is never the authority
    check('joined: mode client, locked, G not C', V.mode() === 'client' && V.locked() && eff() === 'elevation1posture0minimap1sound1dice1sheets1fx1fog0');
    check('joined: table key t:campId__gmId', V.tableKey() === 't:X__u_gm1');
    check('joined: an unknown id in the ceiling branch is off', V.on('zzz') === false);
    check('joined: setLocal on a GM-off feature refused', V.setLocal('posture', true) === false);
    const globalBefore = localStorage.getItem('wp_vtt_global');
    check('joined: setLocal off for me on a GM-on feature applies', V.setLocal('elevation', true) === true && V.on('elevation') === false && V.localOff('elevation'));
    check('joined: the only write is wp_vtt_local, never wp_vtt_global or camp.vtt', localStorage.getItem('wp_vtt_global') === globalBefore && state.appState.campaigns.X.vtt.features.elevation === false && Array.from(store.keys()).filter(k => k.indexOf('wp_vtt') === 0).join() === 'wp_vtt_local');
    const rec = JSON.parse(localStorage.getItem('wp_vtt_local'));
    check('wp_vtt_local record shape: off, decided, seen, pending, t under the t: key', rec.v === 1 && j(rec.tables['t:X__u_gm1'].off) === '["elevation"]' && j(rec.tables['t:X__u_gm1'].decided) === '["elevation"]' && typeof rec.tables['t:X__u_gm1'].t === 'number');
    check('joined: turn back on for me', V.setLocal('elevation', false) === true && V.on('elevation') === true);
    gmA.stanceCamps = Object.create(null); gmA.stanceCamps.X = { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true }; gmA.stanceCamps.Y = { elevation: true, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true };
    check('joined: stanceCamps[onScreen] beats the legacy stance', eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog0');
    state.appState.activeCampaignId = 'Y'; state.appState.campaigns.Y = camp('Y');
    check('joined: a stage onto Y reads Y\'s flags and Y\'s table key', eff() === 'elevation1posture1minimap0sound1dice1sheets1fx1fog0' && V.tableKey() === 't:Y__u_gm1');
    state.appState.activeCampaignId = 'X';
    check('cleanStanceCamps: roster ids only, hostile ids dropped, absent map null', (() => { const m = V.cleanStanceCamps({ X: { elevation: 0, posture: 1, junk: true }, 'bad id!': {}, '': {} }); return m && j(m.X) === j({ elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true }) && !('bad id!' in m) && Object.keys(m).length === 1 && V.cleanStanceCamps(null) === null; })());
    // an OWN "__proto__" key, as JSON off the wire gives it (an object literal would only set the prototype)
    check('cleanStanceCamps: an own __proto__ campaign id lands as a plain flags entry on the null-prototype map, Object.prototype untouched', (() => {
        const m = V.cleanStanceCamps(JSON.parse('{"__proto__":{"elevation":true,"posture":false},"X":{"elevation":false}}'));
        return m && Object.keys(m).length === 2 && Object.prototype.hasOwnProperty.call(m, '__proto__') && j(m['__proto__']) === j({ elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true })
            && Object.getPrototypeOf(m) === null && Object.prototype.elevation === undefined && ({}).posture === undefined;
    })());

    /* ---- foreign but disconnected (reconnect gap) ---- */
    gmA.active = false;
    check('reconnect gap: ceiling retained', V.mode() === 'client' && eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog0');

    /* ---- leaving: load() clears foreign and the stance ---- */
    gmA.foreign = false; gmA.stance = null; gmA.stanceCamps = null; gmA.gmId = '';
    world([camp('X', { v: 1, master: true, features: { elevation: false, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true } })], 'X');
    check('after load(): solo, C over the own campaign, no ceiling, no table key', V.mode() === 'solo' && V.ceiling() === null && eff() === 'elevation0posture1minimap0sound1dice1sheets1fx1fog1' && V.tableKey() === '');

    /* ---- the stream window ---- */
    net({ active: true, role: 'client', foreign: true, stream: true, stance: { elevation: false, posture: false, minimap: false, sound: true, dice: true, sheets: true, fx: true } });
    localStorage.setItem('wp_vtt_local', j({ v: 1, tables: { 't:X__': { off: ['posture'], decided: [], seen: '', pending: '', t: 1 } } }));
    check('stream: C over the disk campaign, the stance and local-off never applied, group hidden (mode stream)', V.mode() === 'stream' && V.ceiling() === null && eff() === 'elevation0posture1minimap0sound1dice1sheets1fx1fog1' && V.locked());

    /* ---- an old host: two-key stance payload ---- */
    check('cleanFlags: an absent key takes its default (minimap ON, fog ON); present keys are booleans', j(V.cleanFlags({ elevation: true, posture: 0 })) === j({ elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true }));
    check('cleanFlags: no payload is every feature on', j(V.cleanFlags(undefined)) === j({ elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true }));
    net({ active: true, role: 'client', foreign: true, gmId: '', notepad: { gmId: 'u_old' }, stance: V.cleanFlags({ elevation: false, posture: true }) });
    world([camp('X')], 'X');
    check('old host: minimap on, elevation off; table key falls back to notepad.gmId', eff() === 'elevation0posture1minimap1sound1dice1sheets1fx1fog1' && V.tableKey() === 't:X__u_old');
    net({ active: true, role: 'client', foreign: true, stance: V.cleanFlags({}) });
    check('old host with no gmId anywhere: campId-only key', V.tableKey() === 't:X');
    // a hostile campaign id off the wire: JSON.parse gives an OWN "__proto__" key, as a snapshot would
    state.appState = JSON.parse('{"activeCampaignId":"__proto__","campaigns":{"__proto__":{"id":"__proto__","name":"x","items":{}}}}');
    check('a __proto__ campaign id is inert: the t: prefix keeps it off the prototype and the write lands under it',
        V.tableKey() === 't:__proto__' && V.setLocal('elevation', true) === true && ({}).off === undefined && Object.prototype.off === undefined && !!JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:__proto__'] && V.localOff('elevation') === true);

    /* ---- the join notice: signature, seeding, decided ---- */
    store.clear(); toasts.length = 0;
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));   // the player's own default: elevation off
    const gmB = net({ active: true, role: 'client', foreign: true, gmId: 'u_gm2', stance: { elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } });   // the table: elevation on, posture off
    world([camp('T')], 'T');
    V.joined();
    let t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    const s1 = V.sig(gmB.stance);
    check('joined(): the own default off is seeded into off; pending set, seen not yet (ack on show)', j(t.off) === '["elevation"]' && t.pending === s1 && t.seen === '' && V.on('elevation') === false);
    const localBefore = localStorage.getItem('wp_vtt_local');
    V.joined();
    check('a second snapshot with the same signature writes nothing', localStorage.getItem('wp_vtt_local') === localBefore);
    check('showNotice shows and acks: seen = sig, pending cleared, lists A and B', V.showNotice('t:T__u_gm2', s1) === true && el('vttNoticeModal').style.display === 'flex' && (t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2']).seen === s1 && t.pending === '' && el('vttNoticeOffForYou').style.display === '' && el('vttNoticeHidden').style.display === '');
    check('showNotice bails on a stale signature', V.showNotice('t:T__u_gm2', 'nope') === false);
    V.keepMine();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('Keep mine: elevation stays off and is decided; the modal is hidden', j(t.off) === '["elevation"]' && j(t.decided) === '["elevation"]' && el('vttNoticeModal').style.display === 'none');
    // the GM flips elevation off then on: a decided id is never re-seeded or re-shown as new
    let prev = gmB.stance; gmB.stance = { elevation: false, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true };
    V.ceilingChanged(prev, 'T');
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('mid-session change: one toast naming it, acked (no modal up)', toasts[toasts.length - 1] === 'The GM turned Token elevation off for this table.' && t.seen === V.sig(gmB.stance) && t.pending === '');
    prev = gmB.stance; gmB.stance = { elevation: true, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true };
    V.ceilingChanged(prev, 'T');
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('flip back: decided elevation is not re-seeded twice and stays off; toast says on', j(t.off) === '["elevation"]' && toasts[toasts.length - 1] === 'The GM turned Token elevation on for this table.');
    const n0 = toasts.length; prev = gmB.stance;
    V.ceilingChanged(prev, 'T');
    check('an unchanged stance message toasts nothing', toasts.length === n0);
    V.ceilingChanged(prev, 'Z');
    check('a stance for another campaign is stored only (no toast, no seed for this table)', toasts.length === n0);
    // the GM newly turns on a feature the player's own default has off and that is not decided here: it starts
    // off for the player, the toast says so, and the signature is NOT acked — the next join offers the sync
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    const seenBefore = t.seen;
    prev = gmB.stance; gmB.stance = { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true };
    V.ceilingChanged(prev, 'T');
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('GM newly on + own default off: seeded into off, pending = sig, seen unchanged, feature off for me',
        j(t.off) === '["elevation","posture"]' && t.pending === V.sig(gmB.stance) && t.seen === seenBefore && seenBefore !== t.pending && V.on('posture') === false, j(t));
    check('the toast says it is off for you', toasts[toasts.length - 1] === 'The GM turned Token posture on for this table — off for you (your default has it off; ⚙ Settings ▸ VTT features to turn it on).', toasts[toasts.length - 1]);
    V.joined();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('the next join queues the notice for that signature and shows it with posture in "off for you"', t.pending === V.sig(gmB.stance) && V.showNotice('t:T__u_gm2', V.sig(gmB.stance)) === true && el('vttNoticeOffForYou').style.display === '');
    V.keepMine();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('Keep mine after that: posture decided and still off; acked', j(t.decided) === '["elevation","posture"]' && j(t.off) === '["elevation","posture"]' && t.seen === V.sig(gmB.stance) && t.pending === '');
    // a modal up at the change: no ack, pending instead
    document.querySelectorAll = sel => (sel === '[id$="Modal"]' ? [{ style: { display: 'flex' } }] : []);
    prev = gmB.stance; gmB.stance = { elevation: true, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true };
    V.ceilingChanged(prev, 'T');
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm2'];
    check('change under a modal: pending set, seen left as it was', t.pending === V.sig(gmB.stance) && t.seen !== t.pending);
    document.querySelectorAll = () => [];
    // two features newly on at once, both off in the player's default: the toast names both as off for you
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    const gmE = net({ active: true, role: 'client', foreign: true, gmId: 'u_gm5', stance: { elevation: false, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } });
    world([camp('T')], 'T');
    V.joined();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm5'];
    check('a table matching the defaults after a stale ceiling: nothing seeded, acked silently', j(t.off) === '[]' && t.seen === V.sig(gmE.stance) && t.pending === '');
    prev = gmE.stance; gmE.stance = { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true };
    V.ceilingChanged(prev, 'T');
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm5'];
    check('two newly on: both seeded, pending kept for the next join, toast lists both',
        j(t.off) === '["elevation","posture"]' && t.pending === V.sig(gmE.stance) && t.seen !== t.pending
        && toasts[toasts.length - 1] === 'The GM changed this table\'s VTT features — Token elevation on, Token posture on — Token elevation, Token posture off for you (your default has them off; ⚙ Settings ▸ VTT features to turn them on).', toasts[toasts.length - 1]);
    // matching settings: silent, seen recorded
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    const gmC = net({ active: true, role: 'client', foreign: true, gmId: 'u_gm3', stance: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } });
    V.joined();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm3'];
    check('matching settings: nothing seeded, seen recorded silently, no pending', j(t.off) === '[]' && t.seen === V.sig(gmC.stance) && t.pending === '');
    // Use the table's settings: only A's ids leave off; the default and campaigns untouched
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: false, posture: false, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));
    const gmD = net({ active: true, role: 'client', foreign: true, gmId: 'u_gm4', stance: { elevation: true, posture: true, minimap: false, sound: true, dice: true, sheets: true, fx: true } });
    world([camp('T', { v: 1, master: true, features: { elevation: false, posture: false, minimap: false, sound: true, dice: true, sheets: true, fx: true } })], 'T');
    V.joined();
    const gBefore = localStorage.getItem('wp_vtt_global'), campBefore = j(state.appState.campaigns.T.vtt);
    check('own default off carries in: both seeded', j(JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm4'].off) === '["elevation","posture"]' && V.on('posture') === false);
    V.showNotice('t:T__u_gm4', V.sig(gmD.stance));
    V.syncToTable();
    t = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:T__u_gm4'];
    check('Use the table\'s settings: only the listed ids leave off, both decided, features on for me', j(t.off) === '[]' && j(t.decided) === '["elevation","posture"]' && V.on('elevation') === true && V.on('posture') === true);
    check('sync never writes wp_vtt_global or any camp.vtt', localStorage.getItem('wp_vtt_global') === gBefore && j(state.appState.campaigns.T.vtt) === campBefore);
    check('the other tables\' records are still there', Object.keys(JSON.parse(localStorage.getItem('wp_vtt_local')).tables).length === 4);
    // 51 tables: the oldest goes
    const many = { v: 1, tables: {} };
    for (let i = 0; i < 50; i++) many.tables['t:c' + i + '__g'] = { off: [], decided: [], seen: '', pending: '', t: 1000 + i };
    localStorage.setItem('wp_vtt_local', j(many));
    net({ active: true, role: 'client', foreign: true, gmId: 'u_new', stance: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } });
    world([camp('N')], 'N');
    V.setLocal('elevation', true);
    const keys = Object.keys(JSON.parse(localStorage.getItem('wp_vtt_local')).tables);
    check('the store is capped at 50 tables, evicting the oldest', keys.length === 50 && keys.indexOf('t:c0__g') < 0 && keys.indexOf('t:N__u_new') >= 0);
    // a damaged wp_vtt_local reads as empty and is rebuilt
    localStorage.setItem('wp_vtt_local', '{"tables":{"__proto__":{"off":["elevation"]},"nope":{"off":["elevation"]},"t:N__u_new":{"off":["posture","bogus"],"decided":5}}}');
    check('malformed wp_vtt_local: only well-formed table keys and known ids survive', V.localOff('posture') === true && V.localOff('elevation') === false);
    net({ active: true, role: 'client', foreign: true, gmId: 'u_new', stance: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } });
    localStorage.setItem('wp_vtt_local', 'garbage');
    check('unparsable wp_vtt_local reads as {}', V.localOff('posture') === false);

    /* ---- fog: a noLocal feature (GM-controlled for the whole table, no per-player switch, on by default) ---- */
    store.clear(); toasts.length = 0;
    localStorage.setItem('wp_vtt_global', j({ v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true } }));   // fog absent → takes its default (on)
    check('fog defaults on in globalVtt (no def flag, no legacy key)', V.globalVtt().features.fog === true && V.globalOn('fog') === true);
    let fogC = camp('FG'); V.fill(fogC);
    check('fill seeds fog on by default', fogC.vtt.features.fog === true);
    const gmF = net({ active: true, role: 'client', foreign: true, gmId: 'u_fog', stance: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true } });
    world([camp('FT')], 'FT');
    check('noLocal fog: on at the table follows the GM regardless of the player default', V.on('fog') === true && V.whyOff('fog') === '');
    check('noLocal fog: setLocal is refused (no per-player off)', V.setLocal('fog', true) === false && V.on('fog') === true && V.localOff('fog') === false);
    V.joined();
    let ftab = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:FT__u_fog'];
    check('noLocal fog: joined never seeds fog into the off-list; a fog-only difference acks silently', ftab.off.indexOf('fog') < 0 && ftab.seen === V.sig(gmF.stance) && ftab.pending === '');
    const nFog = toasts.length; let pFog = gmF.stance; gmF.stance = { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: false };
    V.ceilingChanged(pFog, 'FT');
    ftab = JSON.parse(localStorage.getItem('wp_vtt_local')).tables['t:FT__u_fog'];
    check('noLocal fog: a fog-only ceiling change toasts nothing and is acked', toasts.length === nFog && ftab.seen === V.sig(gmF.stance) && V.on('fog') === false);
    check('noLocal fog: whyOff is gm when the GM has it off, never local', V.whyOff('fog') === 'gm');
    pFog = gmF.stance; gmF.stance = { elevation: false, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true };   // a self-toggle feature AND fog both move
    V.ceilingChanged(pFog, 'FT');
    check('noLocal fog: a mixed change names only the self-toggle feature, fog stays silent', toasts[toasts.length - 1] === 'The GM turned Token elevation off for this table.' && V.on('fog') === true);

    /* ---- debug ---- */
    const d = V.debug();
    check('debug() carries the fields the sandbox reads', ['mode', 'campaign', 'global', 'ceiling', 'tableKey', 'localOff', 'effective', 'sig', 'seen', 'pending'].every(k => k in d) && d.mode === 'client');

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      harness error ->', e && e.stack || e); process.exit(1); });
