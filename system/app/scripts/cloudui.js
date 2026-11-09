// Cloud saves, the page's half (1.6.2; the API agreed with the website session on 2026-11-07, the shell's half system/resources/app/
// cloudsync.js). The Profile window's Cloud saves part (a switch, the status, the usage, Sync now), the sync at start, the question when
// both this computer and the cloud changed, and Backup now pinned in the cloud too. The page never sees the install's key: it asks its
// own server's /api/cloud routes, and a page that has none (the website's play host, an older shell) shows nothing.
import { toast } from './io.js';
import { showConfirm } from './dialogs.js';

var _state = null, _busy = false;
function el(id) { return document.getElementById(id); }
function mainWindow() { try { var q = new URLSearchParams(location.search); return !q.get('stream') && !q.get('popout'); } catch (e) { return true; } }
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('cloud v1', step, facts || {}); } catch (e) {} }
async function call(method, p, body) {
    try {
        var r = await fetch(p, { method: method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
        if (r.status === 404) return null;
        return await r.json();
    } catch (e) { return null; }
}
// [cloudcheck:words-start]
// The size of a save in words
function sizeWords(n) { if (!(n >= 0)) return ''; if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB'; if (n < 1024 * 1024 * 1024) return Math.round(n / 1024 / 1024) + ' MB'; return (Math.round(n / 1024 / 1024 / 1024 * 10) / 10) + ' GB'; }
// What a state says, in plain words
function stateWords(s) {
    if (!s) return '';
    if (!s.linked) return 'Link this computer to your Waypoint account above to keep your save in the cloud.';
    if (s.offline) return 'The website could not be reached. Your save is kept on this computer as always.';
    if (!s.on) return 'Your save is kept on this computer only.';
    if (s.conflict) return 'This computer and the cloud both changed. Waypoint asks which to keep.';
    if (s.status === 'busy') return 'Syncing now.';
    var why = { plan: 'Your plan does not include cloud saves, so nothing new is sent. What is in the cloud stays readable.', quota: 'The cloud is full. Nothing new is sent.', busy: 'The website is busy. Waypoint tries again later.', offline: 'The website could not be reached. Waypoint tries again later.', unlinked: 'This computer is no longer linked to your account.', download: 'A file from the cloud did not arrive whole, so nothing was changed. Try again.', daily: 'Today’s cloud uploads are used up, so nothing new is sent. Your save is kept on this computer as always.', monthly: 'This month’s cloud downloads are used up, so nothing was taken from the cloud. Your save here is as it was.' };
    if (s.status === 'error') return (why[s.error] || 'The last sync did not finish. Waypoint tries again later.') + ((s.error === 'daily' || s.error === 'monthly') && s.resetsAt > 0 ? ' It starts again ' + whenWords(s.resetsAt) + '.' : '');
    var at = s.last && s.last.at ? new Date(s.last.at) : null;
    return at ? 'Synced at ' + at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + at.toLocaleDateString() + '.' : 'Not synced yet. Waypoint syncs on close, ten minutes after a change, and on Backup now.';
}
// When an allowance is renewed, in this computer's own time
function whenWords(ms) { var d = new Date(ms); return 'at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + d.toLocaleDateString(); }
// Which computer a version came from, in words: an install's device id is no name (found live, 2026-11-07), the website's own is the browser
function fromWords(by, name) { if (typeof name === 'string' && name.trim()) return name.trim().slice(0, 80); return by === 'Browser' ? 'the website in a browser' : 'another computer'; }   // the site's own name for where it was saved, where it sends one (Website Alpha 1.0.11)
function usageWords(s) { return s && s.linked && s.on && s.quota > 0 ? sizeWords(s.used) + ' of ' + sizeWords(s.quota) + ' used.' : ''; }
// [cloudcheck:words-end]
function render() {
    var part = el('cloudPart'); if (!part) return;
    var s = _state;
    part.hidden = !s;
    if (!s) return;
    var on = el('cloudOn'); if (on) { on.checked = !!s.on; on.disabled = !s.linked; }
    var st = el('cloudStatus'); if (st) st.textContent = stateWords(s);
    var us = el('cloudUsage'); if (us) us.textContent = usageWords(s);
    var now = el('cloudSyncNow'); if (now) { now.hidden = !(s.linked && s.on); now.disabled = _busy || s.status === 'busy'; }
}
async function refresh() { _state = await call('GET', '/api/cloud'); render(); return _state; }
// What a sync did, acted on: a save taken from the cloud reloads the page; a conflict is asked
async function after(r) {
    if (!r) return;
    if (r.did === 'pulled') { log('reload', { rev: r.rev }); toast('Your save was brought from the cloud. Waypoint reloads.'); setTimeout(function() { location.reload(); }, 700); return; }
    if (r.did === 'conflict') { ask(r.head); return; }
    if (r.did === 'pushed') log('pushed', { rev: r.rev });
    await refresh();
}
function ask(head) {
    var when = head && head.at ? new Date(head.at).toLocaleString() : 'another time';
    showConfirm('Your save changed on this computer and in the cloud (saved from ' + fromWords(head && head.by, head && head.name) + ', ' + when + '). Which do you keep? The other stays in the cloud’s history.', async function(a) {
        var use = a === 'alt' ? 'cloud' : a ? 'mine' : '';
        if (!use) { await refresh(); return; }
        log('resolve', { use: use });
        _busy = true; render(); var r = await call('POST', '/api/cloud/resolve', { use: use }); _busy = false;
        await after(r);
    }, { yes: 'Keep this computer’s', alt: 'Use the cloud’s', noEnter: true, noEscape: true });
}
async function sync(reason, keep) {
    if (_busy) return null;
    _busy = true; render();
    var r = await call('POST', '/api/cloud/sync', { reason: reason, keep: keep === true });
    _busy = false; await after(r); return r;
}
function wire() {
    var on = el('cloudOn'); if (!on || on.dataset.wired) return; on.dataset.wired = '1';
    on.addEventListener('change', async function() { _state = await call('POST', '/api/cloud/on', { on: on.checked }); log(on.checked ? 'on' : 'off'); render(); if (on.checked) sync('on', false); });
    var now = el('cloudSyncNow'); if (now) now.addEventListener('click', function() { sync('now', false); });
    var modal = el('profileModal');
    if (modal && typeof MutationObserver === 'function') new MutationObserver(function() { if (modal.style.display !== 'none') refresh(); }).observe(modal, { attributes: true, attributeFilter: ['style'] });
}
// At start, the main window alone: where the switch is on, the save is compared with the cloud's
async function start() {
    if (!mainWindow()) return;
    var s = await refresh(); if (!s || !s.linked || !s.on) return;
    log('start');
    sync('start', false);
}
window.wpCloud = { refresh: refresh, sync: sync, backup: function() { if (_state && _state.on) sync('backup', true); } };
if (typeof document !== 'undefined') { var go = function() { wire(); start(); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); }
