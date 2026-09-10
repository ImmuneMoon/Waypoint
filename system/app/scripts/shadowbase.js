/* ShadowBase character-sheet bridge.

   A character token can carry a ShadowBase character JSON (the save format of
   shadow-base.com — what its Export JSON writes and Import Character reads).
   Attach one and Waypoint round-trips it untouched, re-exporting with the
   token's name and art as the portrait; a token with no sheet exports a
   minimal skeleton the site's tolerant importer fills with defaults.

   The stored sheet never keeps a portrait when the token has art of its own —
   portraits are ~500KB data URLs and the token image IS the portrait. */

import { toast, save } from './io.js';
import { getActiveCampaign, getActiveMap } from './models.js';

function dl(name, text) {
    try {
        var blob = new Blob([text], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    } catch (e) { toast('Export failed.'); }
}

// Load any image source (path or data URL) as an <img>, or null on failure.
function loadImage(src) {
    return new Promise(function(resolve) {
        if (!src) return resolve(null);
        var im = new Image();
        im.onload = function() { resolve(im.naturalWidth ? im : null); };
        im.onerror = function() { resolve(null); };
        im.src = /^(data:|blob:)/.test(src) ? src : encodeURI(src);
    });
}

// Standard portrait output: ≤512px on the long side, never upscaled, PNG
// unless that runs heavy — so every exported portrait matches in scale.
function toPortrait(img, maxSide) {
    var long = Math.max(img.naturalWidth, img.naturalHeight);
    var scale = Math.min(1, (maxSide || 512) / long);
    var cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(img.naturalWidth * scale));
    cv.height = Math.max(1, Math.round(img.naturalHeight * scale));
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    var data = cv.toDataURL('image/png');
    if (data.length > 400000) data = cv.toDataURL('image/jpeg', 0.85);
    return data;
}

// The best available portrait for a token: compare the token's art with the
// sheet's own portrait and keep whichever carries more resolution, downsized
// to the shared ≤512px standard.
async function bestPortraitDataUrl(item) {
    var tokenSrc = item.src ? ((window.wpNet && window.wpNet.assetSrc) ? window.wpNet.assetSrc(item.src) : item.src) : null;
    var sheetSrc = (item.sheet && typeof item.sheet.portrait === 'string' && /^data:image\//.test(item.sheet.portrait)) ? item.sheet.portrait : null;
    var results = await Promise.all([loadImage(tokenSrc), loadImage(sheetSrc)]);
    var tokenImg = results[0], sheetImg = results[1];
    var pick = null;
    if (tokenImg && sheetImg) {
        pick = (Math.max(sheetImg.naturalWidth, sheetImg.naturalHeight) > Math.max(tokenImg.naturalWidth, tokenImg.naturalHeight)) ? sheetImg : tokenImg;
    } else pick = tokenImg || sheetImg;
    if (!pick) return null;
    try { return toPortrait(pick, 512); } catch (e) { return null; }
}

// Parse + attach a site JSON to a token. Light validation only — the site's
// own importer is the authority, and it tolerates partial files.
/* Site contract (ShadowBase Website docs/CHARACTER_JSON_FORMAT.md, 2026-09-05):
   the sheet stays opaque, but a few fields must be SHAPED the way the site
   bills them, or the site heals them on load and announces it every time.
   Applied when a sheet is attached and again on export:
   - languages: when languageEntries exist, the string is only a display
     projection — bracket-free, "Tongue (Tier[, Comprehension-only]); …".
     Bracketed costs beside entries double-bill; commas keep one tongue.
   - culturalFamiliarities / literacy: entries separated by ';' — a
     comma-joined list bills only its first [n].
   - details.sizeModifier must be present (nothing derives it from height).
   Everything else passes through untouched. */
var TIER_LABEL = { native: 'Native', broken: 'Broken', accented: 'Accented', fluent: 'Fluent' };
export function normalizeForSite(j) {
    if (!j || typeof j !== 'object') return j;
    if (Array.isArray(j.languageEntries) && j.languageEntries.length) {
        j.languages = j.languageEntries.map(function(e) {
            var tier = TIER_LABEL[String(e.tier || '').toLowerCase()] || (e.tier ? String(e.tier) : 'Fluent');
            return String(e.tongue || '').replace(/\s*\[[^\]]*\]/g, '').trim() + ' (' + tier + (e.comprehensionOnly ? ', Comprehension-only' : '') + ')';
        }).join('; ');
    }
    ['culturalFamiliarities', 'literacy'].forEach(function(k) {
        var v = j[k];
        if (typeof v !== 'string' || v.indexOf(';') !== -1 || v.indexOf('\n') !== -1) return;
        if ((v.match(/\[\s*-?\d+\s*\]/g) || []).length > 1 && v.indexOf(',') !== -1) {
            j[k] = v.split(',').map(function(s) { return s.trim(); }).filter(Boolean).join('; ');
        }
    });
    if (!j.details || typeof j.details !== 'object') j.details = {};
    if (typeof j.details.sizeModifier !== 'number') j.details.sizeModifier = 0;
    return j;
}
window.wpNormalizeForSite = normalizeForSite;   // sandbox testing hook

export function attachSheet(item, file, done) {
    if (!file) return;
    if (!/\.json$/i.test(file.name)) { toast('Pick a ShadowBase .json file.'); return; }
    file.text().then(function(txt) {
        var j;
        try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
        if (!j || typeof j !== 'object' || Array.isArray(j) || (j.type && j.type !== 'character') || (!j.name && !j.attributes && !j.points)) {
            toast('That does not look like a ShadowBase character JSON.');
            return;
        }
        var finish = function() {
            normalizeForSite(j);
            item.sheet = j;
            if (!item.charName && j.name) item.charName = j.name;
            if (j.posture && window.wpStance && window.wpStance.on('posture')) window.wpStance.setPosture(item, j.posture);   // the sheet's ch. 9 posture seeds the token
            toast('Sheet attached: ' + (j.name || 'character') + ' ✓');
            if (done) done(j);
        };
        // The sheet's portrait is kept but downsized to the shared ≤512px
        // standard so a high-res original never bloats the save — and never
        // gets silently replaced by lower-res token art at export time.
        if (typeof j.portrait === 'string' && /^data:image\//.test(j.portrait)) {
            loadImage(j.portrait).then(function(img) {
                if (img) {
                    try { j.portrait = toPortrait(img, 512); } catch (e) { delete j.portrait; }
                } else delete j.portrait;
                finish();
            });
        } else {
            delete j.portrait;
            finish();
        }
    }).catch(function() { toast('Could not read that file.'); });
}

// The export payload: the attached sheet round-tripped verbatim, with only
// name / portrait / campaign filled in from Waypoint. Sheetless tokens get a
// skeleton — every missing key defaults on the site's side.
export async function buildCharacterJson(item, campName) {
    var base = item.sheet ? JSON.parse(JSON.stringify(item.sheet)) : {
        type: 'character',
        name: '',
        portrait: null,
        player: '',
        species: '',
        homeworld: '',
        campaign: '',
        details: { sizeModifier: 0 },        // required by the site: nothing derives it from height
        languageEntries: [],                 // the billing home for tongues; the string is only a projection
        languages: '',
        // Every character carries a Force Alignment (handbook ch08 + GM ruling),
        // Force-sensitive or not — neutral until the sheet says otherwise.
        points: { total: 0, spent: 0, remaining: 0, powerPoints: 0, lightSidePoints: 0, darkSidePoints: 0, forceAlignment: 0 },
        narrative: {
            description: item.charStats || '',
            background: '',
            notes: 'Exported from Waypoint — finish this sheet on shadow-base.com.'
        }
    };
    base.type = base.type || 'character';
    normalizeForSite(base);
    if (base.points && typeof base.points === 'object' && base.points.forceAlignment == null) {
        var fa = (base.points.lightSidePoints || 0) - (base.points.darkSidePoints || 0);
        base.points.forceAlignment = Math.max(-100, Math.min(100, fa));
    }
    base.name = item.charName || base.name || 'Unnamed Character';
    if (!base.campaign) base.campaign = campName || '';
    if (window.wpStance && window.wpStance.on('posture')) base.posture = window.wpStance.tokenPosture(item);   // the site's posture field: the same seven values
    var portrait = await bestPortraitDataUrl(item);
    if (portrait) base.portrait = portrait;   // else whatever the sheet carried stays
    var fname = (base.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'character') + ' — ShadowBase.json';
    return { filename: fname, data: base };
}
window.wpBuildCharacterJson = buildCharacterJson;   // sandbox testing hook

export async function exportCharacterJson(item, campName) {
    var built = await buildCharacterJson(item, campName);
    dl(built.filename, JSON.stringify(built.data, null, 2));
    toast('Exported ' + built.data.name + ' — upload it on shadow-base.com with Import Character.');
}

/* ---------- import a character as a NEW token ----------
   Reads a ShadowBase JSON and drops a ready-to-play token on the current
   whiteboard: the sheet's portrait becomes the token art (saved as a normal
   image asset so multiplayer asset-sync serves it), the character name and a
   player-safe stats line are filled in, and the sheet rides attached. */
export function importCharacterToken(file) {
    if (!file) return;
    if (!/\.json$/i.test(file.name)) { toast('Pick a ShadowBase character .json file.'); return; }
    var camp = getActiveCampaign();
    var map = getActiveMap();
    if (!camp || !map || map.type !== 'map') { toast('Open a play map first.'); return; }
    file.text().then(async function(txt) {
        var j;
        try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
        if (!j || typeof j !== 'object' || Array.isArray(j) || (j.type && j.type !== 'character') || (!j.name && !j.attributes && !j.points)) {
            toast('That does not look like a ShadowBase character JSON.');
            return;
        }
        // token art: the sheet's portrait, saved as a real image asset
        var src = null;
        if (typeof j.portrait === 'string' && /^data:image\//.test(j.portrait)) {
            var img = await loadImage(j.portrait);
            if (img) {
                try {
                    j.portrait = toPortrait(img, 512);   // normalize what stays on the sheet
                    var blob = await (await fetch(j.portrait)).blob();
                    var fname = ((j.name || 'character').replace(/[^\w\- ]+/g, '').trim() || 'character') + ' - token.png';
                    var up = await fetch('/api/upload?mapId=' + encodeURIComponent(camp.activeItemId) + '&filename=' + encodeURIComponent(fname), { method: 'POST', body: blob });
                    var res = await up.json();
                    if (res && res.url) src = res.url;
                } catch (e) { /* portrait upload failed — token ships without art */ }
            } else delete j.portrait;
        }
        var st0 = (await import('./state.js')).state;
        var wrap = document.getElementById('whiteboardWrap');
        var z = st0.zoomLevel || 1;
        var cx = wrap ? (wrap.scrollLeft + wrap.clientWidth / 2) / z : 15000;
        var cy = wrap ? (wrap.scrollTop + wrap.clientHeight / 2) / z : 15000;
        var item = {
            id: 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            type: src ? 'image' : 'circle',
            x: Math.round(cx - 30), y: Math.round(cy - 26),
            w: 60, h: 52,                                   // fills one hex cell (flat-top)
            color: src ? 'transparent' : '#4db3d3',
            layer: 'middle',
            isChar: true,
            charName: j.name || 'Character',
            charStats: buildStatsLine(j),
            sheet: j
        };
        if (src) item.src = src;
        if (j.posture && window.wpStance && window.wpStance.on('posture')) window.wpStance.setPosture(item, j.posture);
        map.whiteboard = map.whiteboard || [];
        map.whiteboard.push(item);
        var st = (await import('./state.js')).state;
        st.selWbId = item.id; st.selWbIds = [item.id];
        save();
        if (window.appRender) window.appRender();
        if (window.wpSnapNewHexItem) window.wpSnapNewHexItem();   // seat it in a hex cell on hex maps
        toast(item.charName + ' imported — token placed' + (src ? '' : ' (no portrait in file)') + '. Set a Player Owner to hand it over.');
    }).catch(function() { toast('Could not read that file.'); });
}

// Player-safe tooltip line: species/points only — never GM secrets.
function buildStatsLine(j) {
    var bits = [];
    if (j.species) bits.push(j.species);
    if (j.points && j.points.total) bits.push(j.points.total + ' pts');
    return bits.join(' · ');
}

/* ---------- read-only sheet viewer ----------
   Everything the sheet holds — attributes, characteristics, traits, skills,
   powers, inventory — rendered for the table. Editing stays on the site. */
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function sec(title) { return '<div class="shv-sec">' + title + '</div>'; }

function rows(list, fn) {
    if (!list || !list.length) return '<div class="shv-none">— none —</div>';
    return list.map(fn).join('');
}

export function showSheet(item) {
    var j = item.sheet;
    var body = document.getElementById('sheetViewBody');
    var title = document.getElementById('sheetViewTitle');
    if (!j || !body) return;
    title.textContent = j.name || item.charName || 'Character';
    var a = j.attributes || {};
    var c = j.characteristics || {};
    var ch = function(k, lbl) {
        var v = c[k] || {};
        var eff = v.effective != null ? v.effective : v.final;
        return eff == null ? '' : '<span class="shv-stat"><b>' + lbl + '</b> ' + esc(eff) + (v.current != null && v.current !== eff ? ' <i>(' + esc(v.current) + ' now)' + '</i>' : '') + '</span>';
    };
    var attr = function(k, lbl) {
        var v = (a[k] || {}).value;
        return '<span class="shv-stat"><b>' + lbl + '</b> ' + (v == null ? '10' : esc(v)) + '</span>';
    };
    var html = '';
    html += '<div class="shv-head">' + esc([j.species, j.homeworld, j.player ? 'played by ' + j.player : ''].filter(Boolean).join(' · '))
        + (j.points ? ' — <b>' + esc(j.points.total || 0) + ' pts</b>' : '') + '</div>';
    html += sec('Attributes') + '<div class="shv-statrow">' + attr('strength', 'ST') + attr('dexterity', 'DX') + attr('iq', 'IQ') + attr('health', 'HT') + '</div>';
    html += sec('Characteristics') + '<div class="shv-statrow">'
        + ch('hitPoints', 'HP') + ch('endurancePoints', 'EP') + ch('forcePoints', 'FP') + ch('will', 'Will') + ch('perception', 'Per')
        + ch('basicSpeed', 'Speed') + ch('basicMove', 'Move')
        + ((c.defenses && c.defenses.dodge != null) ? '<span class="shv-stat"><b>Dodge</b> ' + esc(c.defenses.dodge) + '</span>' : '')
        + ((c.defenses && c.defenses.parry != null) ? '<span class="shv-stat"><b>Parry</b> ' + esc(c.defenses.parry) + '</span>' : '')
        + '</div>';
    var t = j.traits || {};
    html += sec('Advantages') + rows(t.advantages, function(r) { return '<div class="shv-row"><span>' + esc(r.name) + (r.level != null ? ' ' + esc(r.level) : '') + '</span><span class="shv-pts">' + esc(r.points) + '</span></div>'; });
    html += sec('Disadvantages & Quirks') + rows([].concat(t.disadvantages || [], t.quirks || []), function(r) { return '<div class="shv-row"><span>' + esc(r.name) + '</span><span class="shv-pts">' + esc(r.points) + '</span></div>'; });
    html += sec('Skills') + rows(j.skills, function(s) { return '<div class="shv-row"><span>' + esc(s.name) + '</span><span class="shv-pts">' + esc(s.level) + '</span></div>'; });
    var ab = j.abilities || {};
    if ((ab.forcePowers || []).length || (ab.lightsaberForms || []).length || (ab.combatTechniques || []).length) {
        html += sec('Force & Techniques') + rows([].concat(ab.forcePowers || [], ab.lightsaberForms || [], ab.combatTechniques || []), function(p) {
            return '<div class="shv-row"><span>' + esc(p.name) + (p.level != null ? ' (lvl ' + esc(p.level) + ')' : '') + '</span></div>';
        });
    }
    var inv = j.inventory || {};
    var allInv = [].concat(inv.general || [],
        (inv.weapons && inv.weapons.melee) || [], (inv.weapons && inv.weapons.blasters) || [], (inv.weapons && inv.weapons.lightsabers) || [],
        inv.armor || [], inv.explosives || [], inv.ammunition || []);
    html += sec('Inventory') + rows(allInv, function(e) {
        var extra = [e.damage ? 'dmg ' + e.damage : '', e.dr != null && e.dr !== '' ? 'DR ' + e.dr : '', e.quantity > 1 ? '×' + e.quantity : ''].filter(Boolean).join(' · ');
        return '<div class="shv-row"><span>' + esc(e.name) + '</span><span class="shv-pts">' + esc(extra) + '</span></div>';
    });
    var n = j.narrative || {};
    if (n.description) html += sec('Description') + '<div class="shv-text">' + esc(n.description) + '</div>';
    body.innerHTML = html;
    body.scrollTop = 0;
    document.getElementById('sheetViewModal').style.display = 'flex';
}
