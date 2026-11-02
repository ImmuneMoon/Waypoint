/* A campaign's safety net (1.6.0; the owner, 2026-10-26, by prompt: "best of all options combo"): restore points, a trial run and a test
   copy, from the campaign menu, and the Trial run pill while one is on. The pure half (what the save keeps of them, the list's words, the
   library's repair, the copy, the log's words) is campsafecore.js. Every step writes one line to the app's log (saves/error.log) through
   /api/log, so a failure can be followed step by step there: point-*, rollback-*, trial-*, copy-*. A line says the step, the snapshot's
   name, counts and an HTTP status, never a campaign's name or content. With window.wpCampSafeDebug set (the developer console), each line
   is also printed to the console.
   Nothing here runs on a player's app, in the stream window or in a pop-out: the save is the GM's (io.js canPersistLocal). A roll back
   and Put it back wait for the table to end, since they replace the campaign the table plays. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast, canPersistLocal, migrateAppState } from './io.js';
import { showConfirm, showAlert, getUniqueCampaignTitle } from './dialogs.js';
import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';
import { newDir } from './librarycore.js';
import * as CORE from './campsafecore.js';

// [campsafecheck:flows-start]
// The flows, on what they are handed (D): the page's own pieces, or a suite's stand-ins. D.core is campsafecore.js
function csFlows(D) {
    var C = D.core, ui = D.doc;
    var log = function(step, facts) { var line = C.logLine(step, facts); try { var p = D.fetch('/api/log', { method: 'POST', body: line }); if (p && p.catch) p.catch(function() {}); } catch (e) {} if (D.debug && D.debug()) { try { console.info(line); } catch (e) {} } };
    var app = function() { return D.state().appState; };
    var notes = function() { return C.cleanNotes(app().restorePts); };
    var trials = function() { return C.cleanTrials(app().trials); };
    var putTrials = function(t) { if (Object.keys(t).length) app().trials = t; else delete app().trials; };
    var when = function(ms) { try { return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'medium' }); } catch (e) { return String(ms); } };
    var name = function(c) { return c && typeof c.name === 'string' && c.name ? c.name : 'This campaign'; };
    // Is the save this machine's to change? A refusal is said once, in plain words
    var usable = function() { if (D.usable()) return true; D.toast('Not here. This works on your own campaigns, not at someone else’s table.'); return false; };
    // The save as it is in memory, written now, so a snapshot holds it. true when it reached the disk
    var flushSave = async function() {
        try { var r = await D.fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(app()) }); return !!r && r.ok; } catch (e) { return false; }
    };
    // A restore point: the save written, then snapshotted, then noted for this campaign. The snapshot's name, or '' when it failed
    async function makePoint(campId, kind) {
        log('point-start', { kind: kind });
        if (!(await flushSave())) { log('point-fail', { at: 'save' }); return ''; }
        var r = null; try { r = await D.fetch('/api/backup-now', { method: 'POST' }); } catch (e) { r = null; }
        if (!r || !r.ok) { log('point-fail', { at: 'snapshot', status: r ? r.status : 0 }); return ''; }
        var j = null; try { j = await r.json(); } catch (e) { j = null; }
        var file = j && typeof j.file === 'string' ? j.file : '';
        if (!C.BACKUP_FILE.test(file)) { log('point-fail', { at: 'name' }); return ''; }
        var n = notes(); n[file] = { camp: campId, kind: kind, at: D.now() }; app().restorePts = C.cleanNotes(n);
        D.save(); log('point-done', { file: file, kind: kind });
        return file;
    }
    // One campaign rolled back to a snapshot: read through the static path, shaped by the load's normaliser, its library's gone packs
    // written back as new revisions, and only then put in place of the campaign as it is (a restore point of which is made first).
    // true when it was rolled back
    async function rollBack(file, campId) {
        if (!C.BACKUP_FILE.test(String(file))) return false;
        if (D.hosting()) { D.toast('End the table first. A roll back replaces the campaign your table plays.'); log('rollback-refused', { why: 'hosting' }); return false; }
        log('rollback-start', { file: file });
        var res = null; try { res = await D.fetch('/saves/backups/' + file, { cache: 'no-store' }); } catch (e) { res = null; }
        if (!res || !res.ok) { log('rollback-fail', { at: 'read', status: res ? res.status : 0, file: file }); D.toast('That restore point could not be read. Nothing was changed.'); return false; }
        var data = null; try { data = JSON.parse(await res.text()); } catch (e) { data = null; }
        if (!data || typeof data !== 'object') { log('rollback-fail', { at: 'parse', file: file }); D.toast('That restore point is not a save Waypoint can read. Nothing was changed.'); return false; }
        var mig = null; try { mig = D.migrate(data); } catch (e) { mig = null; log('rollback-fail', { at: 'shape', file: file }); }
        var snap = mig && mig.campaigns && typeof mig.campaigns === 'object' && Object.prototype.hasOwnProperty.call(mig.campaigns, campId) ? mig.campaigns[campId] : null;
        if (!snap) { log('rollback-fail', { at: 'campaign', file: file }); D.toast('That restore point does not hold this campaign. It was made before the campaign existed. Nothing was changed.'); return false; }
        var before = await makePoint(campId, 'before');
        if (!before) { D.toast('A restore point of the campaign as it is could not be made first, so nothing was rolled back.'); return false; }
        var packs = 0;
        if (snap.library && typeof snap.library === 'object') {
            var dir = snap.library.dir, have = {};
            try { var lr = await D.fetch('/api/library?dir=' + dir); if (lr && lr.ok) { var lj = await lr.json(); have = lj && lj.packs && typeof lj.packs === 'object' ? lj.packs : {}; } } catch (e) { have = {}; }
            var plan = C.libRepair(snap.library, have);
            if (plan) {
                for (var i = 0; i < plan.uploads.length; i++) {
                    var u = plan.uploads[i], ok = false;
                    try {
                        var pr = await D.fetch('/saves/backups/lib-' + file.replace(/\.json$/, '') + '/' + dir + '/' + u.pack + '.' + u.from + '.json', { cache: 'no-store' });
                        if (pr && pr.ok) { var pj = JSON.parse(await pr.text()); pj.rev = u.to; var pw = await D.fetch('/api/library?dir=' + dir + '&pack=' + u.pack + '&rev=' + u.to, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pj) }); ok = !!pw && pw.ok; }
                    } catch (e) { ok = false; }
                    if (!ok) { log('rollback-fail', { at: 'library', file: file, n: i }); D.toast('A library pack of that restore point could not be brought back, so nothing was rolled back.'); return false; }
                    packs++;
                }
                snap.library = plan.manifest;
            }
        }
        app().campaigns[campId] = snap;
        D.refresh(campId);
        D.save(); log('rollback-done', { file: file, packs: packs });
        return true;
    }
    function trialOn() { var c = D.camp(); return !!c && !!trials()[c.id]; }
    function startTrial() {
        var c = D.camp(); if (!c || !usable()) return;
        if (trials()[c.id]) { endTrial(); return; }
        D.confirm('Start a trial run of ' + name(c) + '? Waypoint makes a restore point first. When you end the trial, you keep the changes or put the campaign back as it was.', async function(yes) {
            if (yes !== true) return;
            var file = await makePoint(c.id, 'trial');
            if (!file) { D.toast('The trial run did not start: the restore point could not be made.'); return; }
            var t = trials(); t[c.id] = { file: file, at: D.now() }; putTrials(t); D.save(); D.redraw();
            log('trial-start', { file: file });
            D.toast('Trial run started. End it from the Trial run pill or the campaign menu.');
        }, { yes: 'Start' });
    }
    function endTrial() {
        var c = D.camp(); if (!c || !usable()) return; var t = trials()[c.id]; if (!t) return;
        D.confirm('End the trial run of ' + name(c) + ', begun ' + when(t.at) + '? Keep the changes, or put the campaign back as it was then.', async function(ans) {
            if (ans === 'alt') { var tk = trials(); delete tk[c.id]; putTrials(tk); D.save(); D.redraw(); log('trial-keep', { file: t.file }); D.toast('Trial run ended. The changes are kept.'); return; }
            if (ans !== true) return;
            var ok = await rollBack(t.file, c.id); if (!ok) { log('trial-putback-fail', { file: t.file }); return; }
            var tp = trials(); delete tp[c.id]; putTrials(tp); D.save(); D.redraw(); log('trial-putback', { file: t.file });
            D.toast('Trial run ended. The campaign is back as it was when the trial began.');
        }, { yes: 'Put it back', alt: 'Keep the changes' });
    }
    // A campaign's packs copied at the revisions it pins. The place of the one that failed, its half-made folder taken away, or -1
    async function copyPacks(ups) {
        for (var i = 0; i < ups.length; i++) {
            var u = ups[i], ok = false;
            try {
                var g = await D.fetch('/api/library?dir=' + u.fromDir + '&pack=' + u.pack + '&rev=' + u.rev);
                if (g && g.ok) { var w = await D.fetch('/api/library?dir=' + u.toDir + '&pack=' + u.pack + '&rev=' + u.rev, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: await g.text() }); ok = !!w && w.ok; }
            } catch (e) { ok = false; }
            if (!ok) { try { var dl = D.fetch('/api/library?dir=' + u.toDir, { method: 'DELETE' }); if (dl && dl.catch) dl.catch(function() {}); } catch (e) {} return i; }
        }
        return -1;
    }
    // A test copy: the campaign whole, as "Name (test)", its library packs copied into a folder of its own. Opened once it is made
    async function makeTestCopy() {
        var c = D.camp(); if (!c || !usable()) return;
        var nm = D.uniqueName(name(c) + ' (test)'), id = 'camp_' + D.now(); while (app().campaigns[id]) id = 'camp_' + D.now() + '_' + Math.floor(Math.random() * 1000);
        var plan = C.testCopy(c, id, nm, c.library ? D.newDir() : '');
        if (!plan) { log('copy-fail', { at: 'plan' }); D.toast('The copy could not be made.'); return; }
        log('copy-start', { packs: plan.uploads.length });
        var bad = await copyPacks(plan.uploads);
        if (bad >= 0) { log('copy-fail', { at: 'library', n: bad }); D.toast('The copy was not made: a library pack could not be copied. Your campaign is untouched.'); return; }
        app().campaigns[id] = plan.camp; D.save(); D.list();
        log('copy-done', { packs: plan.uploads.length });
        D.switchTo(id, function() { D.toast('Made ' + nm + ' and opened it. ' + name(c) + ' is untouched.'); }, function() { D.toast('Made ' + nm + '. It is in your campaign list.'); });
    }
    // New campaign's second question: nothing, or a copy of the system of one of your campaigns. done(null), or done({ from, pages }). Cancel makes no campaign
    function pickSystem(done) {
        var rows = C.systemRows(app().campaigns, app().activeCampaignId); if (!rows.length) { done(null); return; }
        var box = ui.createElement('div'), lead = ui.createElement('div'), sel = ui.createElement('select'), tick = ui.createElement('label'), cb = ui.createElement('input'), words = ui.createElement('span');
        box.className = 'cs-list cs-sys-box'; lead.className = 'cs-lead'; lead.textContent = 'Start with no system, or with a copy of one of yours. After that the two change apart. Maps, planners and characters stay behind.'; box.appendChild(lead);
        sel.className = 'tool cs-sys'; sel.title = 'The campaign whose system this one starts with';
        var add = function(v, t) { var o = ui.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
        add('', 'No system yet'); rows.forEach(function(r) { add(r.id, r.name); }); box.appendChild(sel);
        tick.className = 'cs-tick'; cb.type = 'checkbox'; cb.checked = true; tick.appendChild(cb); tick.appendChild(words); box.appendChild(tick);
        var sync = function() { var r = rows.filter(function(x) { return x.id === sel.value; })[0]; tick.hidden = !r || !r.pages; words.textContent = r ? ' Bring its handbook pages (' + r.pages + ')' : ''; };
        sel.addEventListener('change', sync); sync();
        D.confirm('Use the system of', function(ans) { if (ans !== true) return; done(sel.value ? { from: sel.value, pages: cb.checked === true } : null); }, { yes: 'Create', body: box });
    }
    // Fills a new campaign from the pick, before it is listed. A pack that cannot be copied leaves it with no system, and says so
    async function fillFrom(into, pick) {
        var src = pick && app().campaigns[pick.from] || null, plan = src ? C.systemCopy(src, src.library ? D.newDir() : '', pick.pages === true) : null;
        if (!plan) { log('system-fail', { at: 'plan' }); D.toast('That system could not be copied. The campaign has no system yet.'); return false; }
        log('system-start', { packs: plan.uploads.length, pages: Object.keys(plan.items).length });
        var bad = await copyPacks(plan.uploads);
        if (bad >= 0) { log('system-fail', { at: 'library', n: bad }); D.toast('A library pack could not be copied, so the campaign has no system yet. ' + name(src) + ' is untouched.'); return false; }
        into.system = plan.system; if (plan.library) into.library = plan.library; if (plan.fog) into.fog = plan.fog;
        into.items = into.items || {}; Object.keys(plan.items).forEach(function(id) { into.items[id] = plan.items[id]; });
        log('system-done', { packs: plan.uploads.length, pages: Object.keys(plan.items).length });
        return true;
    }
    // The Restore points window: Make a restore point, and every snapshot with its Roll back, newest first, all as text
    async function openPoints() {
        var c = D.camp(); if (!c || !usable()) return;
        var list = null; try { var r = await D.fetch('/api/backups', { cache: 'no-store' }); if (r && r.ok) list = await r.json(); } catch (e) { list = null; }
        if (!Array.isArray(list)) { log('points-fail', { at: 'list' }); D.alert('The restore points could not be listed. Your Waypoint may need its installer once: see Updates in Settings.'); return; }
        var rows = C.pointRows(list, notes(), c.id), box = ui.createElement('div'), picked = null;
        box.className = 'cs-list';
        var lead = ui.createElement('div'); lead.className = 'cs-lead'; lead.textContent = 'Roll back puts ' + name(c) + ' as it was then. Other campaigns stay as they are.'; box.appendChild(lead);
        if (!rows.length) { var none = ui.createElement('div'); none.className = 'cs-none'; none.textContent = 'No restore points yet. One is made at every launch.'; box.appendChild(none); }
        rows.forEach(function(rw) {
            var row = ui.createElement('div'); row.className = 'cs-row' + (rw.mine ? ' mine' : '');
            var wh = ui.createElement('span'); wh.className = 'cs-when'; wh.textContent = when(rw.at); row.appendChild(wh);
            var lb = ui.createElement('span'); lb.className = 'cs-kind'; lb.textContent = rw.label; row.appendChild(lb);
            var b = ui.createElement('button'); b.type = 'button'; b.className = 'tool ghost cs-back'; b.textContent = 'Roll back'; b.title = 'Put this campaign back as it was at ' + when(rw.at);
            b.addEventListener('click', function() { picked = rw; D.dismiss(); });
            row.appendChild(b); box.appendChild(row);
        });
        D.confirm('Restore points of ' + name(c), async function(ans) {
            if (picked) {
                var rw = picked; picked = null;
                D.confirm('Roll ' + name(c) + ' back to how it was at ' + when(rw.at) + '? Waypoint makes a restore point of it as it is now first.', async function(yes) {
                    if (yes !== true) return;
                    if (await rollBack(rw.file, c.id)) D.toast(name(c) + ' is back as it was at ' + when(rw.at) + '.');
                }, { yes: 'Roll back' });
                return;
            }
            if (ans !== true) return;
            var f = await makePoint(c.id, 'point'); D.toast(f ? 'Restore point made. It stays until you delete it in Settings.' : 'The restore point could not be made.');
        }, { yes: 'Make a restore point', body: box });
    }
    return { makePoint: makePoint, rollBack: rollBack, trialOn: trialOn, startTrial: startTrial, endTrial: endTrial, makeTestCopy: makeTestCopy, openPoints: openPoints, pickSystem: pickSystem, fillFrom: fillFrom, log: log };
}
// [campsafecheck:flows-end]

var CS = csFlows({
    core: CORE, doc: document, fetch: function(u, o) { return fetch(u, o); }, state: function() { return state; }, camp: getActiveCampaign, now: function() { return Date.now(); },
    debug: function() { return !!window.wpCampSafeDebug; }, usable: canPersistLocal, hosting: function() { var n = window.wpNet; return !!(n && n.active); },
    save: function() { save(true); }, toast: toast, confirm: showConfirm, alert: showAlert, uniqueName: function(s) { return getUniqueCampaignTitle(s, null); },
    dismiss: function() { var b = document.getElementById('customConfirmCancel'); if (b) b.click(); },
    migrate: function(d) { return migrateAppState(d).data; }, newDir: function() { return newDir(); },
    redraw: function() { if (window.wpPills) window.wpPills.sync(); },
    list: function() { updateCampaignSelect(); updateSidebarNav(); },
    refresh: function(campId) {
        if (state.appState.activeCampaignId === campId) { state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null; }
        updateCampaignSelect(); updateSidebarNav(); if (window.appRender) window.appRender();
        var c = state.appState.campaigns[campId]; if (c && state.appState.activeCampaignId === campId && window.wpLibrary && window.wpLibrary.load) window.wpLibrary.load(c);
    },
    switchTo: function(id, done, kept) {
        var go = function() { state.appState.activeCampaignId = id; state.selId = null; state.selWbId = null; state.linkStart = null; updateCampaignSelect(); updateSidebarNav(); if (window.appRender) window.appRender(); save(true); done(); };
        if (window.wpConfirmCampaignSwitch) window.wpConfirmCampaignSwitch(go, kept); else go();
    }
});
window.wpCampSafe = CS;
[['trialCampBtn', CS.startTrial], ['testCopyCampBtn', CS.makeTestCopy], ['pointsCampBtn', CS.openPoints]].forEach(function(p) { var b = document.getElementById(p[0]); if (b) b.addEventListener('click', function() { p[1](); }); });
