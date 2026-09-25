/* The cleanup after the foreign-data leak (docs/FOREIGN_DATA_FIX_AND_CLEANUP.md, Part 2).
   Before 1.4.9, Undo after leaving a GM's game could write the GM's whole campaign set over a
   player's data.json; the next launches copied it into saves/backups. On every load this module
   classifies the save (Stage A) and, a few seconds after first paint, the safety copies (Stage B).
   A campaign is judged by what the sanitizer leaves behind (fingerprints) and by what only local
   work produces (local marks), never by its id. Removal is automatic only when the evidence is
   certain: the origin marker, or the whole-file shape of the bug. Anything less certain is asked
   about by name, once. The player's own campaigns come back from the newest safety copy that has
   them. Leaf module: no imports, nothing touched at load time, so tools/cleanupcheck.js can run
   classifyState offline. Dialogs are built here in the DOM; the app's markup is not needed. */

var STUB_KEYS = { id: 1, type: 1, hidden: 1, x: 1, y: 1, w: 1, h: 1, rot: 1, layer: 1, locked: 1 };   // a sanitized hidden item (net.js sanitizeItem)
var STRIPPED = ['players', 'bannedPlayers', 'handouts', 'handoutReveals', 'handoutLog', 'cast', 'pinnedMaps', 'sessionLog', 'pictures', 'imageCats', 'sounds'];   // never on the wire (imageCats here = the campaign's own categories; sounds = the sound index, 1.5.0)
var TUTORIAL_ID = 'camp_tutorial';          // one id on every install: never recorded, never judged by name
var RECOVERED_ID = 'camp_recovered';        // where a removed campaign's planner pages land
var NAME_RE = /^(data|keep)-[A-Za-z0-9_-]+\.json$/;   // the shell's own rule for backup names
var LEDGER_KEY = 'cleanup_ledger';          // localStorage, not a wp_ key: never mirrored to preferences.json
var Z_INDEX = 100000;                       // above every panel (#netModal 99999), below the app's own confirm (#customConfirm 100010)

var lastRun = null, lastTiers = null;       // for wpDebug.getState().cleanup
var heldOriginal = null;                    // { text, removed } from this session's Stage A, page memory only
var sweeping = false, sweepTimer = null;

var safeId = function(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function nonEmpty(v) { return Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object') ? Object.keys(v).length > 0 : !!v; }
// a category store { list, by, shelf } with nothing in it is empty, whatever its shape (a reader must never create one, but a save may carry one)
function catsNonEmpty(c) { return !!c && typeof c === 'object' && (nonEmpty(c.list) || nonEmpty(c.by) || nonEmpty(c.shelf)); }
function soundsNonEmpty(s) { return !!s && typeof s === 'object' && nonEmpty(s.list); }   // a sound index { v, list } with nothing in it proves nothing either
function isObj(v) { return !!v && typeof v === 'object'; }
function campaignsOf(s) { return isObj(s) && isObj(s.campaigns) ? s.campaigns : {}; }
function nameOf(c) { return (c && typeof c.name === 'string' && c.name) || 'Campaign'; }

/* ---------- the classifier (pure) ---------- */

// A hidden item the sanitizer produced: a locked rect with position keys only and no color
function isStub(w) {
    if (w.hidden !== true || w.type !== 'rect' || w.locked !== true || 'color' in w) return false;
    return Object.keys(w).every(function(k) { return STUB_KEYS[k]; });
}

// Fingerprints (what the sanitizer leaves) and local marks (what only local work makes) for one campaign
function inspectCampaign(camp) {
    var fp = { F1: 0, F2: 0, F3: 0, F4: 0 }, lm = { planner: 0, notes: 0, info: 0, keys: 0, gm: 0, hidden: 0, map: 0 };
    var maps = 0, rooms = 0, planners = 0, docs = 0, cleanMaps = 0;
    var playersEmpty = !nonEmpty(camp.players);
    STRIPPED.forEach(function(k) { if (k === 'imageCats' ? catsNonEmpty(camp[k]) : k === 'sounds' ? soundsNonEmpty(camp[k]) : nonEmpty(camp[k])) lm.keys++; });   // empty {} comes from read-only UI code and proves nothing
    if (isObj(camp.system)) {   // character sheets (1.5.0): the system TRAVELS as the players' view, so only a GM-only field, roll or item is a local mark; an all-visible system proves nothing
        var sf = Array.isArray(camp.system.fields) ? camp.system.fields : [], sr = Array.isArray(camp.system.rolls) ? camp.system.rolls : [], si = Array.isArray(camp.system.items) ? camp.system.items : [], se = Array.isArray(camp.system.effects) ? camp.system.effects : [];
        if (sf.some(function(f) { return isObj(f) && f.vis === 'gm'; }) || sr.some(function(r) { return isObj(r) && r.vis === 'gm'; }) || si.some(function(it) { return isObj(it) && (it.vis === 'gm' || it.rm === 'bound' || it.rm === 'curse'); }) || se.some(function(d) { return isObj(d) && d.vis === 'gm'; })) lm.gm++;   // a GM-only item never travels
    }
    if (isObj(camp.chars) && Object.values(camp.chars).some(function(ch) { return isObj(ch) && (ch.npc === true || !ch.ownerId); })) lm.gm++;   // an NPC or an unassigned character never travels (players get owned PCs only)
    if (isObj(camp.chars) && Object.values(camp.chars).some(function(ch) { return isObj(ch) && isObj(ch.values) && Object.values(ch.values).some(function(v) { return Array.isArray(v) && v.some(function(r) { return isObj(r) && (r.hid === 1 || isObj(r.snap) || (isObj(r.def) && r.lnk !== 1 && (r.def.damage || r.def.cost || r.def.rm || r.def.rmMsg || r.def.throwSkill || (r.def.vis === 'gm' && r.def.area)))); }); }); })) lm.gm++;   // Stage 6: a copy of a deleted item (players get it inline), a custom item's GM texts or removal rule, a curse kept out of its owner's sight — none travels as stored
    Object.values(camp.items || {}).forEach(function(m) {
        if (!isObj(m)) return;
        if (m.type === 'doc') { docs++; return; }   // handbook pages travel to players: neither a local mark nor a fingerprint
        if (m.type === 'planner' || (Array.isArray(m.blocks) && !m.rooms)) { planners++; lm.planner++; return; }   // planners never ship
        maps++;
        var before = fp.F1 + fp.F2 + fp.F3 + fp.F4, content = 0;
        (m.rooms || []).forEach(function(r) {
            if (!isObj(r)) return;
            rooms++; content++;
            if ('notes' in r || 'handoutId' in r) lm.notes++; else fp.F1++;   // local code always writes notes, even ''
            (r.characters || []).forEach(function(c) { if (!isObj(c)) return; if ('info' in c || 'ref' in c) lm.info++; else fp.F2++; });
        });
        (m.links || []).forEach(function(lk) {
            var x = lk && lk[3];
            if (isObj(x) && Object.keys(x).some(function(k) { return k !== 'label'; })) lm.gm++;   // link notes are GM prep
        });
        (m.whiteboard || []).forEach(function(w) {
            if (!isObj(w)) return;
            content++;
            if (w.gmNoteFor || w.sheet) lm.gm++;
            if (w.hidden) { if (isStub(w)) fp.F3++; else lm.hidden++; }
            if (playersEmpty && ((w.isChar && w.ownerId) || w.byPlayer)) fp.F4++;   // a host always has a players registry
        });
        if (fp.F1 + fp.F2 + fp.F3 + fp.F4 === before && content > 0) cleanMaps++;
    });
    var fpCount = fp.F1 + fp.F2 + fp.F3 + fp.F4;
    if (fpCount > 0) lm.map = cleanMaps;   // a built-up map with no fingerprint beside fingerprinted ones reads as local work
    var lmCount = lm.planner + lm.notes + lm.info + lm.keys + lm.gm + lm.hidden + lm.map;
    return { fp: fp, fpCount: fpCount, lm: lm, lmCount: lmCount, maps: maps, rooms: rooms, planners: planners, docs: docs };
}

// Every /saves/images/… reference inside a campaign's items
function imageRefs(camp) {
    var out = [];
    (function walk(v, d) {
        if (d > 6 || v == null) return;
        if (typeof v === 'string') { if (v.indexOf('/saves/images/') === 0) out.push(v); return; }
        if (typeof v !== 'object') return;
        Object.keys(v).forEach(function(k) { walk(v[k], d + 1); });
    })(camp.items, 0);
    return out;
}

// classifyState(appState, ctx) -> { tiers, reasons, whole, info, counts }
//   ctx.images      array of /saves/images/… paths on this disk, or null when unknown (then only the marker is certain)
//   ctx.isImport    a file from outside: no image check, the whole-file shape counts on its own
//   ctx.myId        this install's profile id (wp_profile); ctx.journalKeys  { '<campId>__<myId>': true } from the Journal registry
// Tiers: OWN (untouched), CERTAIN (removed), ASK (asked about by name). Never by id.
function classifyState(appState, ctx) {
    ctx = ctx || {};
    var camps = campaignsOf(appState), ids = Object.keys(camps);
    var tiers = {}, reasons = {}, info = {}, counts = { own: 0, certain: 0, ask: 0 };
    ids.forEach(function(id) { info[id] = isObj(camps[id]) ? inspectCampaign(camps[id]) : inspectCampaign({}); });
    var anyPlanner = ids.some(function(id) { return info[id].planners > 0; });
    // F4 alone is not the bug's shape: a scoped export has no players key and a GM who forgot every player keeps owned tokens
    var strong = function(id) { return info[id].fp.F1 + info[id].fp.F2 + info[id].fp.F3 > 0; };
    // W: the whole-file shape of the bug — every campaign fingerprinted, one of them beyond F4, no planner anywhere, no picture-library categories
    var whole = ids.length > 0 && !isObj(appState.imageCats) && !anyPlanner && ids.some(strong) && ids.every(function(id) { return info[id].fpCount > 0; });
    var imgKnown = Array.isArray(ctx.images), imgSet = {};
    if (imgKnown) ctx.images.forEach(function(p) { imgSet[String(p)] = true; });
    var imgUnknown = !imgKnown && !ctx.isImport;
    var journal = isObj(ctx.journalKeys) ? ctx.journalKeys : null;
    ids.forEach(function(id) {
        var c = camps[id], I = info[id], why = [];
        var marked = isObj(c) && !!c._foreign;
        if (isObj(c) && c._keptByUser) { tiers[id] = 'OWN'; reasons[id] = ['kept by the player']; return; }
        if (!marked && I.fpCount === 0) { tiers[id] = 'OWN'; reasons[id] = []; return; }
        if (marked) why.push('origin marker');
        Object.keys(I.fp).forEach(function(k) { if (I.fp[k]) why.push(k + ' x' + I.fp[k]); });
        if (whole) why.push('whole-file shape');
        var contradict = false;
        if (I.fpCount && imgKnown) {   // GM pictures never reach a player's disk: if these resolve, this is more likely a damaged own copy
            var refs = imageRefs(c);
            if (refs.length >= 4) {
                var hits = refs.filter(function(p) { var q = p; try { q = decodeURIComponent(p); } catch (e) {} return imgSet[p] || imgSet[q]; }).length;
                contradict = hits * 2 >= refs.length;
            }
        }
        if (contradict) why.push('pictures resolve on this disk');
        var journalVeto = !!(journal && ctx.myId && journal[safeId(id) + '__' + safeId(ctx.myId)]);
        if (journalVeto) why.push('journal key');
        if (I.lmCount) why.push('local marks: ' + Object.keys(I.lm).filter(function(k) { return I.lm[k]; }).join(', '));
        var base = marked || (whole && !imgUnknown && strong(id));   // an F4-only campaign is asked about at most
        tiers[id] = (base && !contradict && I.lmCount === 0 && !journalVeto) ? 'CERTAIN' : 'ASK';
        reasons[id] = why;
    });
    // A campaign with nothing to judge beside a certain one is asked about: the file association alone is never enough to remove it
    if (ids.some(function(id) { return tiers[id] === 'CERTAIN'; })) ids.forEach(function(id) {
        var c = camps[id];
        if (tiers[id] === 'OWN' && !(isObj(c) && c._keptByUser) && info[id].fpCount === 0 && info[id].lmCount === 0) { tiers[id] = 'ASK'; reasons[id] = ['sits beside a campaign from a game you joined']; }
    });
    ids.forEach(function(id) { counts[tiers[id].toLowerCase()]++; });
    return { tiers: tiers, reasons: reasons, whole: whole, info: info, counts: counts };
}

// Is a safety copy contaminated, and does it hold work the save no longer has? (pure)
//   removedIds  ids removed automatically in an earlier run (_cleanup.removed); a copy of one that still looks like the bug is contaminated
//   currentCamps  the campaigns dict of the save as it is now
//   uniqueOwn: OWN copies absent from the save; uniqueAsk: ambiguous copies absent from the save and never removed automatically
//   (an ambiguous campaign's copy is never cleared without a question); unique: both, the ones to ask about before the file goes
function fileVerdict(fileState, ctx, removedIds, currentCamps) {
    var cls = classifyState(fileState, ctx), camps = campaignsOf(fileState);
    var removed = {}; (removedIds || []).forEach(function(id) { removed[id] = true; });
    var journal = isObj(ctx && ctx.journalKeys) ? ctx.journalKeys : null;
    var hasCertain = false, contaminated = false, uniqueOwn = [], uniqueAsk = [];
    Object.keys(cls.tiers).forEach(function(id) {
        var c = camps[id], I = cls.info[id];
        if (cls.tiers[id] === 'CERTAIN') { hasCertain = true; contaminated = true; return; }
        var journalVeto = !!(journal && ctx.myId && journal[safeId(id) + '__' + safeId(ctx.myId)]);
        if (removed[id] && I.fpCount > 0 && I.lmCount === 0 && !(isObj(c) && c._keptByUser) && !journalVeto) contaminated = true;
        var absent = !(currentCamps && currentCamps[id]);
        if (cls.tiers[id] === 'OWN' && !(isObj(c) && c._keptByUser) && absent) uniqueOwn.push(id);
        if (cls.tiers[id] === 'ASK' && !removed[id] && absent) uniqueAsk.push(id);
    });
    return { contaminated: contaminated, hasCertain: hasCertain, uniqueOwn: uniqueOwn, uniqueAsk: uniqueAsk, unique: uniqueOwn.concat(uniqueAsk), cls: cls };
}

// Which campaigns to bring back from one safety copy: absent from the save, OWN in that file, never a kept or marked copy (pure)
function pickRecovery(fileState, cls, currentCamps) {
    var camps = campaignsOf(fileState), out = [];
    Object.keys(cls.tiers).forEach(function(id) {
        var c = camps[id];
        if (cls.tiers[id] !== 'OWN' || !isObj(c) || c._keptByUser || c._foreign) return;
        if (currentCamps && currentCamps[id]) return;   // the copy in the save is newer: never overwritten
        out.push(id);
    });
    return out;
}

// Remove one campaign from a state; its planner pages (always the player's) move into "Recovered notes" first,
// and its handbook pages too when the removal is the player's own answer (own) — a CERTAIN copy's pages came
// from the GM and go with it. Returns the keys of the moved pages, so a campaign put back later can take them home.
function removeCampaign(s, id, own) {
    var camps = campaignsOf(s), c = camps[id];
    if (!c) return [];
    if (typeof window !== 'undefined' && window.wpReleaseCampaignTags) window.wpReleaseCampaignTags(c, s);   // its picture categories become shared, so the pictures keep their tags
    var moved = [];
    Object.keys(c.items || {}).forEach(function(k) {
        var it = c.items[k];
        if (!isObj(it) || !(it.type === 'planner' || (own && it.type === 'doc'))) return;
        var rec = camps[RECOVERED_ID];
        if (!rec) { rec = camps[RECOVERED_ID] = { id: RECOVERED_ID, name: 'Recovered notes', items: {}, activeItemId: null }; }
        var copy = JSON.parse(JSON.stringify(it));
        if (copy.meta) delete copy.meta.parentId;   // its parent left with the campaign
        rec.items[k] = copy;
        if (!rec.activeItemId) rec.activeItemId = k;
        moved.push(k);
    });
    delete camps[id];
    return moved;
}
// The pages removeCampaign moved go back with their campaign; an emptied "Recovered notes" goes too unless it is on screen
function unmovePlanners(s, keys) {
    var camps = campaignsOf(s), rec = camps[RECOVERED_ID];
    if (!rec || !isObj(rec.items)) return;
    (keys || []).forEach(function(k) { delete rec.items[k]; });
    if (!rec.items[rec.activeItemId]) rec.activeItemId = Object.keys(rec.items)[0] || null;
    if (!Object.keys(rec.items).length && s.activeCampaignId !== RECOVERED_ID) delete camps[RECOVERED_ID];
}

/* ---------- runtime helpers ---------- */

function busy() { var n = window.wpNet; return !!(window.wpStream || (n && (n.active || n.foreign))); }
function log(line) { try { fetch('/api/log', { method: 'POST', body: 'cleanup v1 ' + line }).catch(function() {}); } catch (e) {} }   // structure only: counts and file names, never a campaign's name or id
function dialogOpen() { return ['cleanupAskModal', 'cleanupSummaryModal', 'cleanupMissingModal', 'cleanupBackupModal'].some(function(id) { return !!document.getElementById(id); }); }
function untilNoDialog() { return new Promise(function(resolve) { (function tick() { if (!dialogOpen()) resolve(); else setTimeout(tick, 500); })(); }); }   // one thing on screen at a time
function say(hooks, msg) { if (hooks && hooks.toast) hooks.toast(msg); else if (window.appToast) window.appToast(msg); }
function fmtDate(ms) { try { return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); } catch (e) { return ''; } }
function readLedger() { try { var l = JSON.parse(localStorage.getItem(LEDGER_KEY) || '{}'); return isObj(l) ? l : {}; } catch (e) { return {}; } }
function writeLedger(l) { try { localStorage.setItem(LEDGER_KEY, JSON.stringify(l)); } catch (e) {} }
function ledgerSize() { return Object.keys(readLedger()).length; }

// What the classifier needs from this machine: the profile id, the pictures on disk, the Journal registry
async function buildCtx() {
    var myId = null;
    try { myId = (JSON.parse(localStorage.getItem('wp_profile') || 'null') || {}).id || null; } catch (e) {}
    var images = null;
    try { var r = await fetch('/api/list-images'); if (r.ok) { var l = await r.json(); images = (Array.isArray(l) ? l : []).map(function(i) { return String(i && i.path || ''); }); } } catch (e) {}
    var journalKeys = {};
    try { var j = await fetch('/saves/images/journal/journals.json', { cache: 'no-store' }); if (j.ok) { var jj = await j.json(); (jj && jj.keys || []).forEach(function(k) { journalKeys[safeId(k)] = true; }); } } catch (e) {}
    try { JSON.parse(localStorage.getItem('journal_registry') || '[]').forEach(function(k) { journalKeys[safeId(k)] = true; }); } catch (e) {}
    return { myId: myId, images: images, journalKeys: journalKeys, isImport: false };
}

// The safety copies, newest first by file time; null when the core has no backups route (before 1.3.6)
async function listBackups() {
    try {
        var r = await fetch('/api/backups', { cache: 'no-store' });
        if (!r.ok) return null;
        var rows = await r.json();
        return (Array.isArray(rows) ? rows : []).filter(function(b) { return b && NAME_RE.test(String(b.file)); }).sort(function(a, b) { return (b.at || 0) - (a.at || 0); });
    } catch (e) { return null; }
}
// One safety copy, parsed; null when it cannot be read. The name is checked again: never a folder URL under /saves/
async function fetchBackup(file) {
    if (!NAME_RE.test(file)) return null;
    try { var r = await fetch('/saves/backups/' + file, { cache: 'no-store' }); if (!r.ok) return null; var s = await r.json(); return isObj(s) ? s : null; } catch (e) { return null; }
}
async function deleteBackup(file) {
    try { var r = await fetch('/api/delete-backup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: file }) }); return r.ok; } catch (e) { return false; }
}
// Write the cleaned save straight to disk (not through save(): nothing in memory may win) and read it back
async function writeSave(s) {
    try {
        var r = await fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) });
        if (!r.ok) return false;
        var back = await (await fetch('/api/data', { cache: 'no-store' })).json();
        var a = Object.keys(campaignsOf(back)).sort().join(','), b = Object.keys(campaignsOf(s)).sort().join(',');
        return a === b && !back._foreign;
    } catch (e) { return false; }
}
// The live state to disk, verified, but only while this window may write: Stage B never unlinks a copy before what it merged is on disk
async function persist(live) { if (busy() || window.__wpNoSave) return false; return writeSave(live); }
function currentCleanup(s) { var cu = isObj(s) && isObj(s._cleanup) && s._cleanup.v === 1 ? s._cleanup : null; return cu ? { v: 1, removed: (cu.removed || []).slice(), at: cu.at || 0, pendingRecover: !!cu.pendingRecover } : { v: 1, removed: [], at: 0, pendingRecover: false }; }
function stampCleanup(s, cu) { if (cu.removed.length || cu.pendingRecover) s._cleanup = cu; else delete s._cleanup; }
function postClean(s) { return isObj(s) && isObj(s._cleanup) && s._cleanup.pendingRecover === true; }   // a copy taken after a clean that is still waiting for recovery: it holds nothing older than the save
function migrateOne(camp, hooks) {   // a deep copy of one campaign, upgraded the way load() upgrades a save
    var c = JSON.parse(JSON.stringify(camp));
    if (!hooks || !hooks.migrate || !c.id) return c;
    var wrap = { activeCampaignId: c.id, campaigns: {} }; wrap.campaigns[c.id] = c;
    var out = hooks.migrate(wrap);
    return (out && out.campaigns && out.campaigns[c.id]) || c;
}
function mergeCampaign(live, id, camp, hooks) {   // a campaign from a safety copy joins the live state, migrated like a load
    var c = migrateOne(Object.assign({}, camp, { id: id }), hooks);
    delete c._foreign; delete c._keptByUser;
    live.campaigns[id] = c;
    if (!live.activeCampaignId || !live.campaigns[live.activeCampaignId]) live.activeCampaignId = c.id;
}

/* ---------- dialogs (built here; the app's markup is not needed) ---------- */

// opts: { id, title, html, render(body), buttons: [{ label, value, cls }], escape } — Esc and the backdrop answer `escape` when it is set
function showDialog(opts) {
    return new Promise(function(resolve) {
        var old = document.getElementById(opts.id); if (old) old.remove();
        var overlay = document.createElement('div'); overlay.id = opts.id;
        overlay.style.cssText = 'display:flex; position:fixed; top:0; left:0; width:100%; height:100%; background:var(--overlay); z-index:' + Z_INDEX + '; align-items:center; justify-content:center;';
        var box = document.createElement('div');
        box.style.cssText = 'background:var(--panel2); color:var(--ink); padding:22px; border:1px solid var(--gold); border-radius:8px; width:480px; max-width:92vw; max-height:88vh; overflow-y:auto; box-sizing:border-box; font-size:13.5px; line-height:1.5; box-shadow:var(--shadow);';
        var h = document.createElement('h3'); h.textContent = opts.title; h.style.cssText = 'margin:0 0 12px; color:var(--gold);';
        var body = document.createElement('div'); body.innerHTML = opts.html || '';
        if (opts.render) opts.render(body);
        var row = document.createElement('div'); row.style.cssText = 'display:flex; justify-content:flex-end; gap:10px; margin-top:16px; flex-wrap:wrap;';
        var downOnBackdrop = false;
        function finish(v) { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(v); }
        function onKey(e) {
            if (e.key !== 'Escape') return;
            e.stopPropagation(); e.preventDefault();   // capture phase: the app's own Esc handlers never see it
            if (opts.escape !== undefined) finish(opts.escape);
        }
        opts.buttons.forEach(function(b) {
            var btn = document.createElement('button'); btn.className = 'tool' + (b.cls ? ' ' + b.cls : ''); btn.textContent = b.label;
            btn.addEventListener('click', function() { finish(b.value); });
            row.appendChild(btn);
        });
        document.addEventListener('keydown', onKey, true);
        overlay.addEventListener('pointerdown', function(e) { downOnBackdrop = (e.target === overlay); });
        overlay.addEventListener('click', function(e) { if (e.target !== overlay || !downOnBackdrop) return; if (opts.escape !== undefined) finish(opts.escape); });
        box.appendChild(h); box.appendChild(body); box.appendChild(row); overlay.appendChild(box); document.body.appendChild(overlay);
        var last = row.lastChild; if (last) last.focus();
    });
}
function showWorking() {
    if (document.getElementById('cleanupWorkingModal')) return;
    var d = document.createElement('div'); d.id = 'cleanupWorkingModal';
    d.style.cssText = 'position:fixed; top:56px; left:50%; transform:translateX(-50%); z-index:' + Z_INDEX + '; background:var(--panel2); color:var(--dim); border:1px solid var(--edge); border-radius:8px; padding:8px 14px; font-size:13px;';
    d.textContent = 'Checking your save…';
    document.body.appendChild(d);
}
function hideWorking() { var d = document.getElementById('cleanupWorkingModal'); if (d) d.remove(); }

// The one question the player sees: "Is «name» yours?" -> 'keep' | 'remove'. It has to be answered:
// Esc and the backdrop do nothing, so the cleanup never finishes with a campaign left undecided.
// opts.isImport: the campaign is in a file being imported (bring in / skip)
function askOwnership(camp, info, opts) {
    opts = opts || {};
    var name = nameOf(camp), counts = info || inspectCampaign(camp || {});
    var html = '<p style="margin:0 0 10px;">Is <b>' + esc(name) + '</b> yours? It looks like it may have come from a game you joined, but we’re not sure — so we won’t touch it without asking.</p>'
        + '<p style="margin:0 0 6px; color:var(--dim);">It has ' + counts.maps + ' map' + (counts.maps === 1 ? '' : 's') + ', ' + counts.rooms + ' room' + (counts.rooms === 1 ? '' : 's') + ' and ' + counts.planners + ' planner page' + (counts.planners === 1 ? '' : 's') + (counts.docs ? ' and ' + counts.docs + ' handbook page' + (counts.docs === 1 ? '' : 's') : '') + '.</p>'
        + (counts.planners ? '<p style="margin:0; color:var(--dim); font-size:12px;">Any planner pages in it are yours and will be kept either way.' + (counts.docs ? ' Its handbook pages are kept if you say it is not yours (they could be your own writing).' : '') + '</p>' : counts.docs ? '<p style="margin:0; color:var(--dim); font-size:12px;">Its handbook pages are kept in "Recovered notes" if you say it is not yours.</p>' : '');
    var buttons = opts.isImport
        ? [{ label: 'Not mine — skip it', value: 'remove', cls: 'ghost' }, { label: 'It’s mine — bring it in', value: 'keep' }]
        : [{ label: 'Not mine — remove it', value: 'remove', cls: 'ghost danger' }, { label: 'It’s mine — keep it', value: 'keep' }];
    return showDialog({ id: 'cleanupAskModal', title: 'Is this campaign yours?', html: html, buttons: buttons, escape: opts.isImport ? 'remove' : undefined });
}

// After an automatic removal: what went, what came back. One secondary action puts ticked campaigns back from page memory.
async function showSummary(r, hooks) {
    var html = '<p style="margin:0 0 10px;">A while ago, a bug could copy a GM’s campaign onto your computer after you left their game — and hide your own. That’s fixed now.</p>';
    if (r.removed.length) html += '<p style="margin:0 0 10px;"><b>Removed</b> (these belonged to a game you joined): ' + r.removed.map(function(x) { return '«' + esc(x.name) + ' (' + x.maps + ' map' + (x.maps === 1 ? '' : 's') + ')»'; }).join(', ') + '.</p>';
    if (r.recovered.length) html += '<p style="margin:0 0 10px;"><b>Brought back</b> (your own campaigns, from the safety copy of ' + esc(fmtDate(r.recoveredAt)) + '): ' + r.recovered.map(function(n) { return '«' + esc(n) + '»'; }).join(', ') + '.</p>';
    else if (r.pending) html += '<p style="margin:0 0 10px;">One more step: your own campaigns may be in a safety copy that this older Waypoint core can’t open. After the next core update (Settings ▸ Updates shows the steps) Waypoint brings them back and clears the rest out by itself.</p>';
    else if (r.removed.length && r.shellBackups) html += '<p style="margin:0 0 10px;">We looked for your own campaigns in Waypoint’s safety copies but couldn’t find any from before the mix-up.</p>';
    if (r.left.length) html += '<p style="margin:0 0 10px; color:var(--dim);">' + r.left.map(function(n) { return '«' + esc(n) + '»'; }).join(', ') + ' in that safety copy looked like they may have come from a game you joined, so they were not brought back. If they’re yours, Waypoint asks before it clears that copy, and Settings ▸ Snapshots has it meanwhile.</p>';
    html += '<p style="margin:0 0 10px;">' + (r.shellBackups ? 'Waypoint also clears those campaigns out of its safety copies. ' : '') + 'Your Journal and handouts are untouched.</p>';
    if (r.removed.length) html += '<p style="margin:0; color:var(--dim); font-size:12px;">If you exported a file while you were in that game, it’s outside Waypoint’s reach — delete it by hand.</p>';
    var buttons = r.removed.length ? [{ label: 'Something’s missing?', value: 'missing', cls: 'ghost' }, { label: 'OK', value: 'ok' }] : [{ label: 'OK', value: 'ok' }];
    var v = await showDialog({ id: 'cleanupSummaryModal', title: 'Waypoint tidied up your save', html: html, buttons: buttons, escape: 'ok' });
    if (v === 'missing') { var back = await showMissing(hooks); if (!back) return showSummary(r, hooks); }
}
// Tick list of the automatically removed campaigns; only ticked ones come back, each kept from then on. Returns true when something was put back.
async function showMissing(hooks) {
    var held = heldOriginal; if (!held) return false;
    var orig; try { orig = JSON.parse(held.text); } catch (e) { return false; }
    var camps = campaignsOf(orig), boxes = [];
    var v = await showDialog({
        id: 'cleanupMissingModal', title: 'Something’s missing?',
        html: '<p style="margin:0 0 10px;">Tick the ones that are yours. Only those go back; the rest stay removed.</p>',
        render: function(body) {
            held.removed.forEach(function(id) {
                var c = camps[id]; if (!c) return;
                var lab = document.createElement('label'); lab.style.cssText = 'display:flex; gap:8px; align-items:center; padding:4px 0; cursor:pointer;';
                var cb = document.createElement('input'); cb.type = 'checkbox'; cb.value = id;
                lab.appendChild(cb); lab.appendChild(document.createTextNode(nameOf(c)));
                body.appendChild(lab); boxes.push(cb);
            });
        },
        buttons: [{ label: 'Cancel', value: 'cancel', cls: 'ghost' }, { label: 'Put these back', value: 'put' }], escape: 'cancel'
    });
    if (v !== 'put') return false;
    var ids = boxes.filter(function(b) { return b.checked; }).map(function(b) { return b.value; });
    if (!ids.length) return false;
    var live = hooks.getState();
    ids.forEach(function(id) {
        var c = migrateOne(camps[id], hooks);
        delete c._foreign; c._keptByUser = Date.now();   // the player answered: own from now on; the marker never returns to disk
        live.campaigns[id] = c;
        unmovePlanners(live, (held.moved || {})[id]);   // its planner pages come home from "Recovered notes" instead of existing twice
    });
    var cu = currentCleanup(live); cu.removed = cu.removed.filter(function(id) { return ids.indexOf(id) < 0; }); stampCleanup(live, cu);
    held.removed = held.removed.filter(function(id) { return ids.indexOf(id) < 0; });
    if (hooks.refresh) hooks.refresh();
    if (hooks.save) hooks.save();
    say(hooks, 'Put back. Nothing has been deleted. If a campaign is still missing, Settings ▸ Snapshots has older copies — or tell the person who runs your game.');
    return true;
}

/* ---------- Stage A: the save, on every load ---------- */

// io.js calls this between res.json() and the migration. Resolves to the object load() should continue with:
// the same one when the save is clean, the cleaned one after a write, the untouched one on any failure.
// hooks: { toast, save, getState, refresh, migrate }
function onLoad(data, hooks) {
    hooks = hooks || {};
    var n = window.wpNet;
    if (window.wpStream || (n && n.active && n.role === 'client')) return Promise.resolve(data);   // the stream window never owns a save; a joined player's disk is not on screen
    if (!isObj(data) || !isObj(data.campaigns)) { scheduleSweep(hooks); return Promise.resolve(data); }   // fresh install or a v0 save: nothing to judge here, the safety copies still get their look
    var quick;
    try { quick = classifyState(data, { images: null }); } catch (e) { return Promise.resolve(data); }
    lastTiers = quick.counts;
    var dirty = !!data._foreign || quick.counts.certain + quick.counts.ask > 0;
    if (!dirty) { lastRun = Date.now(); scheduleSweep(hooks); return Promise.resolve(data); }   // the usual launch: one pass over a parsed object, no network, no dialog
    var run = { text: JSON.stringify(data), written: false, workingTimer: null, summary: null };   // the pre-clean text, page memory only; what to fall back to if anything throws
    return stageA(data, hooks, run).catch(function() { log('error stageA'); return run.written ? data : JSON.parse(run.text); }).then(function(out) {
        clearTimeout(run.workingTimer); hideWorking();
        window.__wpNoSave = false;
        if (!run.summary) window.__wpCleanupBusy = false;   // else the summary clears it when it closes: the tour and the art poller wait for the player
        scheduleSweep(hooks);
        return out;
    });
}

async function stageA(data, hooks, run) {
    window.__wpNoSave = true; window.__wpCleanupBusy = true;   // nothing writes, the tutorial pollers wait, until the file on disk is settled
    var originalText = run.text;
    run.workingTimer = setTimeout(showWorking, 400);
    var ctx = await buildCtx();
    var cls = classifyState(data, ctx);
    lastTiers = cls.counts;
    var camps = data.campaigns, removed = [], moved = {}, askRemoved = 0, kept = 0, later = 0;
    // 1. certain: removed, planner pages rescued
    Object.keys(cls.tiers).forEach(function(id) {
        if (cls.tiers[id] !== 'CERTAIN') return;
        var c = camps[id];
        removed.push({ id: id, name: nameOf(c), maps: cls.info[id].maps });
        moved[id] = removeCampaign(data, id);
    });
    // 2. ambiguous: one question each (the working note steps aside while the player answers)
    var askIds = Object.keys(cls.tiers).filter(function(id) { return cls.tiers[id] === 'ASK' && camps[id]; });
    if (askIds.length) { clearTimeout(run.workingTimer); hideWorking(); }
    for (var i = 0; i < askIds.length; i++) {
        var aid = askIds[i], ans = await askOwnership(camps[aid], cls.info[aid], {});
        if (ans === 'keep') { camps[aid]._keptByUser = Date.now(); delete camps[aid]._foreign; kept++; }
        else if (ans === 'remove') { removeCampaign(data, aid, true); askRemoved++; }
        else later++;
    }
    if (askIds.length) run.workingTimer = setTimeout(showWorking, 400);
    // 3. recovery: from the newest safety copy that is neither bug-shaped nor a copy taken after a clean, per campaign, one file only
    var rows = await listBackups(), source = null, recovered = [], left = [], ledger = readLedger();
    if (rows) for (var k = 0; k < rows.length; k++) {
        var st = await fetchBackup(rows[k].file);
        if (!st) { ledger[rows[k].file] = { size: rows[k].size, at: rows[k].at, verdict: 'unreadable' }; continue; }
        var v = fileVerdict(st, ctx, [], camps);
        if (v.hasCertain || postClean(st)) continue;
        source = { file: rows[k].file, at: rows[k].at, state: st, cls: v.cls };
        break;
    }
    writeLedger(ledger);
    if (source) {
        var picks = pickRecovery(source.state, source.cls, camps), sc = campaignsOf(source.state);
        picks.forEach(function(id) { var c = JSON.parse(JSON.stringify(sc[id])); delete c._foreign; delete c._keptByUser; camps[id] = c; recovered.push(nameOf(c)); if (typeof window !== 'undefined' && window.wpAdoptTags) window.wpAdoptTags(c, source.state.imageCats, data); });
        left = Object.keys(source.cls.tiers).filter(function(id) { return source.cls.tiers[id] === 'ASK' && !camps[id]; }).map(function(id) { return nameOf(sc[id]); });
        if (!isObj(data.imageCats) && isObj(source.state.imageCats)) data.imageCats = JSON.parse(JSON.stringify(source.state.imageCats));
    }
    if (!camps[data.activeCampaignId]) data.activeCampaignId = (source && camps[source.state.activeCampaignId]) ? source.state.activeCampaignId : (Object.keys(camps)[0] || null);
    var pending = removed.length > 0 && (!rows || !source);   // no backups route yet (old core), or no clean copy found: Stage B finishes when one answers
    // 4. write
    var changed = removed.length || askRemoved || kept || recovered.length || !!data._foreign || Object.values(camps).some(function(c) { return isObj(c) && c._keptByUser && c._foreign; });
    var cu = currentCleanup(data);   // an earlier run's notes stay: only Stage B clears pendingRecover, after it has looked
    removed.forEach(function(x) { if (x.id !== TUTORIAL_ID && cu.removed.indexOf(x.id) < 0) cu.removed.push(x.id); });
    if (pending) cu.pendingRecover = true;
    clearTimeout(run.workingTimer); hideWorking();
    var answer = later && !changed ? 'later' : 'ok';
    if (changed) {
        delete data._foreign;   // the origin marker never reaches disk
        Object.values(camps).forEach(function(c) { if (isObj(c) && c._keptByUser) delete c._foreign; });
        cu.at = Date.now(); stampCleanup(data, cu);
        var ok = await writeSave(data);
        if (!ok) {
            log('stageA write failed tiers={own:' + cls.counts.own + ',certain:' + cls.counts.certain + ',ask:' + cls.counts.ask + '}');
            say(hooks, 'Waypoint found something to tidy in your save but couldn’t write the change just now. Nothing was changed. It’ll try again next time.');
            lastRun = Date.now();
            return JSON.parse(originalText);
        }
        run.written = true;
        heldOriginal = { text: originalText, removed: removed.map(function(x) { return x.id; }), moved: moved };   // this session only: "Something's missing?" reads from here
    }
    lastRun = Date.now();
    log('stageA tiers={own:' + cls.counts.own + ',certain:' + cls.counts.certain + ',ask:' + cls.counts.ask + '} removed=' + removed.length + ' askRemoved=' + askRemoved + ' kept=' + kept + ' later=' + later + ' recovered=' + recovered.length + ' recoveredFrom=' + (source ? source.file : null) + ' shellBackups=' + !!rows + ' pending=' + pending + ' answer=' + answer);
    window.__wpNoSave = false;
    if (removed.length || recovered.length) {   // the summary keeps the busy flag until it closes; the sweep waits for it too
        run.summary = showSummary({ removed: removed, recovered: recovered, recoveredAt: source ? source.at : 0, left: left, pending: !rows && removed.length > 0, shellBackups: !!rows }, hooks)
            .catch(function() {}).then(function() { window.__wpCleanupBusy = false; });
    } else if (askRemoved) say(hooks, 'Removed. If one of your own campaigns is missing, Settings ▸ Snapshots has older copies of your save.');
    return data;
}

/* ---------- Stage B: the safety copies, in idle time after first paint ---------- */

function scheduleSweep(hooks) {
    if (sweepTimer) clearTimeout(sweepTimer);
    sweepTimer = setTimeout(function() {
        sweepTimer = null;
        var go = function() { runSweep(hooks).catch(function() { log('error stageB'); sweeping = false; }); };
        if (window.requestIdleCallback) window.requestIdleCallback(go, { timeout: 4000 }); else go();
    }, 3000);
}

// Order of things per file: recover from it, write, ask about unique work, write, and only then delete it.
// A copy is never unlinked before what was taken from it is verified on disk; a write that fails, or a session
// starting, leaves the file for the next sweep.
async function runSweep(hooks) {
    if (sweeping || busy()) return;   // a session on screen: abort quietly, the ledger keeps progress
    sweeping = true;
    await untilNoDialog();   // the summary or a question is still open: one thing on screen at a time
    var rows = await listBackups();
    if (!rows) { sweeping = false; return; }
    var live = hooks.getState(), cu = currentCleanup(live), ledger = readLedger(), ctx = null;
    var pending = cu.pendingRecover, source = null, changed = false, recovered = [];
    var scanned = 0, deleted = 0, kept = 0, contaminated = 0, unreadable = 0, remaining = rows.length;
    for (var i = 0; i < rows.length; i++) {
        if (busy()) { sweeping = false; return; }
        var row = rows[i], led = ledger[row.file];
        var known = led && led.size === row.size && led.at === row.at;
        if (known && led.verdict === 'clean' && !(pending && !source)) continue;   // the usual launch fetches nothing
        if (known && led.verdict === 'unreadable') { unreadable++; continue; }
        ctx = ctx || await buildCtx();
        var st = await fetchBackup(row.file); scanned++;
        if (!st) { unreadable++; ledger[row.file] = { size: row.size, at: row.at, verdict: 'unreadable' }; writeLedger(ledger); continue; }
        var v = fileVerdict(st, ctx, cu.removed, live.campaigns), sc = campaignsOf(st), unsaved = false;
        // recovery that could not run at Stage A (an older core then, or no clean copy yet): the newest copy that is
        // neither bug-shaped nor taken after the clean; merged and on disk before this file can be deleted
        if (pending && !source && !v.hasCertain && !postClean(st)) {
            source = { file: row.file, at: row.at };
            var picks = pickRecovery(st, v.cls, live.campaigns);
            picks.forEach(function(id) { mergeCampaign(live, id, sc[id], hooks); recovered.push(nameOf(sc[id])); if (typeof window !== 'undefined' && window.wpAdoptTags && live.campaigns[id]) window.wpAdoptTags(live.campaigns[id], st.imageCats, live); });
            if (!isObj(live.imageCats) && isObj(st.imageCats)) live.imageCats = JSON.parse(JSON.stringify(st.imageCats));
            if (picks.length) { changed = true; if (hooks.refresh) hooks.refresh(); unsaved = !(await persist(live)); }
        }
        if (!v.contaminated) { ledger[row.file] = { size: row.size, at: row.at, verdict: 'clean' }; writeLedger(ledger); continue; }
        contaminated++;
        // work the save no longer has (own, or ambiguous and never removed automatically): ask before the copy goes, once per campaign
        var leave = false, brought = false;
        for (var u = 0; u < v.unique.length; u++) {
            var uid = v.unique[u], uc = sc[uid];
            if (live.campaigns[uid]) continue;   // brought back a moment ago, from this copy or another
            if (busy() || dialogOpen()) { leave = true; break; }
            var ans = await showDialog({
                id: 'cleanupBackupModal', title: 'An older safety copy',
                html: '<p style="margin:0;">An older safety copy also has <b>' + esc(nameOf(uc)) + '</b>, which isn’t in your save now. Bring it back before we clear that copy out?</p>',
                buttons: [{ label: 'No, clear it', value: 'clear', cls: 'ghost' }, { label: 'Bring it back', value: 'bring' }], escape: 'leave'
            });
            if (ans === 'bring') {
                mergeCampaign(live, uid, uc, hooks);
                if (v.uniqueAsk.indexOf(uid) >= 0) live.campaigns[uid]._keptByUser = Date.now();   // the player answered for an ambiguous copy: own from now on
                brought = true; changed = true;
            }
            else if (ans === 'leave') { leave = true; break; }   // Esc: the copy stays for now and is asked about next launch
        }
        if (brought) { if (hooks.refresh) hooks.refresh(); if (!(await persist(live))) unsaved = true; }
        if (leave || unsaved) { kept++; continue; }   // the copy stays until what came out of it is on disk
        if (await deleteBackup(row.file)) { deleted++; remaining--; delete ledger[row.file]; } else kept++;
        writeLedger(ledger);
    }
    if (deleted && remaining <= 0) { try { await fetch('/api/backup-now', { method: 'POST' }); } catch (e) {} }   // the cleaned save keeps one safety copy
    var fresh = currentCleanup(live);   // re-read: "Something's missing?" may have put a campaign back while the sweep ran
    if (pending && (source || unreadable === 0)) { fresh.pendingRecover = false; changed = true; }   // a source was used, or every copy was read and none qualifies
    if (contaminated === 0 && unreadable === 0 && !fresh.pendingRecover && isObj(live._cleanup)) { delete live._cleanup; changed = true; }   // a full sweep found nothing: the notes can go
    else stampCleanup(live, fresh);
    if (changed) { if (hooks.refresh) hooks.refresh(); if (hooks.save && !busy() && !window.__wpNoSave) hooks.save(); }
    lastRun = Date.now();
    log('stageB scanned=' + scanned + ' deleted=' + deleted + ' kept=' + kept + ' unreadable=' + unreadable + ' recovered=' + recovered.length + ' recoveredFrom=' + (source ? source.file : null));
    sweeping = false;
    if (recovered.length) showSummary({ removed: [], recovered: recovered, recoveredAt: source.at, left: [], pending: false, shellBackups: true }, hooks);
    else if (deleted && !heldOriginal) say(hooks, 'Cleared ' + deleted + ' safety cop' + (deleted === 1 ? 'y' : 'ies') + ' that held campaigns from a game you joined. Your own campaigns and your Journal are untouched.');
}

/* ---------- recents sweep (every load) ---------- */

// wp_recent_<campId> keys whose campaign is not in the loaded save go, with plain removeItem (no prefs push when nothing is removed)
function sweepRecents(appState) {
    var camps = campaignsOf(appState), gone = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('wp_recent_') === 0 && !camps[k.slice(10)]) gone.push(k); } } catch (e) {}
    gone.forEach(function(k) { try { localStorage.removeItem(k); } catch (e) {} });
    return gone.length;
}

function cleanupInfo() { return { lastRun: lastRun, tiers: lastTiers, ledgerSize: ledgerSize() }; }

/* ---- imports: a file someone else made ---- */
// An import's items are content from another table: a planner's raw HTML is rebuilt by the wire's rich-text sanitiser, diagrams lose
// their click directives, handbook pages go through cleanDoc, a play map's text items are rebuilt, and no id is ever a prototype key.
// Fails closed: with no sanitiser on hand a raw block, a diagram and a text item come in empty and a page does not come in.
// deps: { DR: docrender.js (cleanDoc, stripMermaidLinks), sanitize: net.js sanitizeRichText }. Merge runs it on each campaign.
function cleanImportItems(ic, deps) {
    if (!isObj(ic.items)) { ic.items = {}; return; }
    var DR = deps && deps.DR, san = deps && typeof deps.sanitize === 'function' ? deps.sanitize : null;
    Object.keys(ic.items).forEach(function(id) {
        if (id in Object.prototype) { delete ic.items[id]; return; }
        var it = ic.items[id]; if (!isObj(it)) { delete ic.items[id]; return; }
        if (it.type === 'doc') { var cd = DR && DR.cleanDoc ? DR.cleanDoc(it, { keepHidden: true }) : null; if (cd) ic.items[id] = cd; else delete ic.items[id]; return; }
        if (it.type === 'planner') {   // a planner from before blocks keeps its text in one string, which opens as a raw HTML block (planner.js): it becomes that block here, so the rule below cleans it
            if (typeof it.content === 'string' && it.content && (!Array.isArray(it.blocks) || !it.blocks.length)) it.blocks = [{ id: 'b_' + Math.random().toString(36).slice(2, 10), type: 'raw', content: it.content }];
            delete it.content;
        }
        if (it.type === 'planner' && Array.isArray(it.blocks)) it.blocks.forEach(function(b) {
            if (!isObj(b)) return;
            if (b.type === 'raw') b.content = san ? san(String(b.content || '')) : '';
            if (b.type === 'diagram') b.content = DR && DR.stripMermaidLinks ? DR.stripMermaidLinks(String(b.content || '')) : '';
        });
        if (it.type === 'map' && Array.isArray(it.whiteboard)) it.whiteboard.forEach(function(w) { if (isObj(w) && w.type === 'text') w.text = san ? san(String(w.text || '')) : ''; });
    });
}
// A whole file brought in by Replace (or a legacy single-campaign file, wrapped): shaped by the load's own normaliser first (deps.migrate =
// io.js migrateAppState: item shapes, systems cleaned, characters cleaned against them and their owners stamped on their tokens, fog), then
// its items cleaned as Merge cleans them, and every id an own key — a campaign or an item under a prototype key never comes in, a parent
// that did not come in is let go, an active id that is not an own key is repaired. The table can be hosted the moment this returns.
// Returns the cleaned state, or null when no campaign is left (or no normaliser was given: nothing comes in raw).
function cleanImport(data, deps) {
    if (!isObj(data) || !isObj(data.campaigns)) return null;
    var own = function(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && !(k in Object.prototype); };
    Object.keys(data.campaigns).forEach(function(id) {
        var c = data.campaigns[id];
        if (id in Object.prototype || !isObj(c)) { delete data.campaigns[id]; return; }
        if (isObj(c.items)) Object.keys(c.items).forEach(function(iid) { if (iid in Object.prototype) delete c.items[iid]; });   // before the normaliser reads a parent or an active id through one
    });
    var out = deps && typeof deps.migrate === 'function' ? deps.migrate(data) : null;
    if (!isObj(out) || !isObj(out.campaigns)) return null;
    Object.keys(out.campaigns).forEach(function(id) {
        var c = out.campaigns[id];
        if (id in Object.prototype || !isObj(c)) { delete out.campaigns[id]; return; }
        cleanImportItems(c, deps);
        Object.keys(c.items).forEach(function(iid) { var m = c.items[iid]; if (isObj(m.meta) && m.meta.parentId && !own(c.items, m.meta.parentId)) delete m.meta.parentId; });   // a page cleanDoc refused leaves no child hidden
        if (!own(c.items, c.activeItemId)) c.activeItemId = Object.keys(c.items)[0] || null;
    });
    var ids = Object.keys(out.campaigns);
    if (!ids.length) return null;
    if (!own(out.campaigns, out.activeCampaignId)) out.activeCampaignId = ids[0];
    return out;
}

export { classifyState, fileVerdict, pickRecovery, inspectCampaign, removeCampaign, unmovePlanners, runSweep, onLoad, askOwnership, sweepRecents, cleanupInfo, cleanImport, cleanImportItems };
