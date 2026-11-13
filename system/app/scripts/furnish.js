/* Furnishings (1.6.2, backlog 222), the palette in Build's Objects tab. The owner, 2026-11-12, by prompt: "Build's Objects tab (Recommended)",
   any version on any map, and of what a furnishing does, "The system says". The drawings are furncore.js's own. The rules a placed furnishing
   takes are those of a map object that names its kind, the system's first and then the campaign's own (objcore furnProps); a kind that none
   names is placed as a plain picture. A tile places its kind in the era picked: a click and then the map's next click, or a drag onto the map.
   Everything here is the GM's, as Build is. Words are text nodes alone, and a tile's picture is the drawing's own address, made from the core's
   constants. What this computer keeps: the era picked (wp_furnEra) and the groups folded open (wp_furnFolds). Steps log as 'furnish v1'. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import './objcore.js';   // brings furncore.js, which sets window.wpFurnCore

function FU() { return window.wpFurnCore || null; }
function OC() { return window.wpObjCore || null; }
function log(step, facts) { if (window.wpStepLog) window.wpStepLog('furnish v1', step, facts || {}); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

// [furncheck:pal-start]
// The lists a furnishing's rules are looked for in, the system's first
function ruleLists(camp) { return [camp && camp.system && camp.system.objects, camp && camp.objects]; }
// What the palette shows: the groups in their order, each with the kinds whose name holds the words typed. A group with none is left out
function palModel(F, find) {
    var q = String(find || '').trim().toLowerCase();
    return F.FURN_GROUPS.map(function(g) {
        return { group: g, kinds: F.FURN_KINDS.filter(function(k) { return k.group === g && (!q || k.label.toLowerCase().indexOf(q) >= 0); }) };
    }).filter(function(x) { return x.kinds.length; });
}
function eraKept(F, v) { return F.FURN_ERAS.some(function(e) { return e.id === v; }) ? v : F.FURN_ERAS[0].id; }
// The groups folded open, read back as data: a list of the core's own group names
function foldsKept(F, raw) {
    var v; try { v = JSON.parse(raw); } catch (e) { v = null; }
    return Array.isArray(v) ? F.FURN_GROUPS.filter(function(g) { return v.indexOf(g) >= 0; }) : [F.FURN_GROUPS[0]];
}
// What a tile hands over by a drag, its kind, era and pack as words, and what such words come back as: a pack's id that is none makes no furnishing
function furnWord(f) { return f.k + ':' + f.era + (f.pack ? ':' + f.pack : ''); }
function furnRead(F, s) {
    if (typeof s !== 'string' || s.length > 70) return null;
    var p = s.split(':'); if (p.length !== 2 && p.length !== 3) return null;
    var f = F.cleanFurn(p.length === 3 ? { k: p[0], era: p[1], pack: p[2] } : { k: p[0], era: p[1] });
    return f && (p.length === 2 || f.pack) ? f : null;
}
// fold 2: a campaign's packs as the palette reads them, by the picture rule handed in, and the look picked for a campaign on this computer,
// read back as data: a pack it still has, else Waypoint's drawings ('')
function packsOf(F, camp, cleanSrc) { return camp && camp.furnPacks && typeof cleanSrc === 'function' ? F.cleanPacks(camp.furnPacks, cleanSrc) : []; }
function lookKept(raw, campId, packs) {
    var v; try { v = JSON.parse(raw); } catch (e) { v = null; }
    var id = v && typeof v === 'object' && !Array.isArray(v) && typeof campId === 'string' && Object.prototype.hasOwnProperty.call(v, campId) ? v[campId] : '';
    return packs.some(function(p) { return p.id === id; }) ? id : '';
}
// What a tile says of where its rules come from
function tileTip(F, k, rule, base) {
    var lab = F.furnKind(k).label + (base ? '. This pack has no picture for it, so this is Waypoint\u2019s own drawing' : '');
    return rule ? lab + '. Its rules come from your map object ' + rule.name + '. Click it, then click the map, or drag it there.'
        : lab + '. No map object gives it rules, so it is a plain picture. Click it, then click the map, or drag it there.';
}
// [furncheck:pal-end]

var _p = { era: '', find: '', open: null, body: null, chips: [], drawn: '', loaded: false, look: '', lookCamp: null, lookSel: null, psig: null };
function load() {
    var F = FU(); if (!F || _p.loaded) return; _p.loaded = true;
    var e = '', o = null; try { e = localStorage.getItem('wp_furnEra') || ''; o = localStorage.getItem('wp_furnFolds'); } catch (er) {}
    _p.era = eraKept(F, e); _p.open = foldsKept(F, o);
}
function keep() { try { localStorage.setItem('wp_furnEra', _p.era); localStorage.setItem('wp_furnFolds', JSON.stringify(_p.open)); } catch (e) {} }
function campNow() { return getActiveCampaign(); }
function ruleOf(k) { var O = OC(); return O && O.furnRule ? O.furnRule(ruleLists(campNow()), k) : null; }
// One cell of the map on screen, by its own lattice (backlog 38): a hex cell's width and row, a square's side; none where it has no grid
function cellNow() {
    var L = typeof window.wpLatticeOf === 'function' ? window.wpLatticeOf() : null; if (!L) return null;
    if (L.type === 'hex' && L.s > 0 && L.h > 0) return { w: 2 * L.s, h: L.h };
    return L.type === 'square' && L.size > 0 ? { w: L.size, h: L.size } : null;
}
function campId() { var c = campNow(); return c && typeof c.id === 'string' ? c.id : ''; }
function srcRule() { var FC = window.wpFogCore; return FC && FC.cleanTexSrc ? FC.cleanTexSrc : null; }
function packsNow() { var F = FU(); return F ? packsOf(F, campNow(), srcRule()) : []; }
function packById(id) { return id ? packsNow().filter(function(p) { return p.id === id; })[0] || null : null; }
function lookNow() {
    var c = campId();
    if (_p.lookCamp !== c) { var raw = null; try { raw = localStorage.getItem('wp_furnLook'); } catch (e) {} _p.look = lookKept(raw, c, packsNow()); _p.lookCamp = c; }
    else if (_p.look && !packById(_p.look)) _p.look = '';
    return _p.look;
}
function lookKeep(id) {
    var c = campId(), m = null; try { m = JSON.parse(localStorage.getItem('wp_furnLook') || '{}'); } catch (e) { m = null; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) m = {};
    delete m[c]; if (id) m[c] = id;
    var ks = Object.keys(m); ks.slice(0, Math.max(0, ks.length - 40)).forEach(function(k) { delete m[k]; });   // this computer keeps the newest 40
    try { localStorage.setItem('wp_furnLook', JSON.stringify(m)); } catch (e) {}
}
// A piece's props: a pack's picture where the pack has one for that kind and era, else Waypoint's drawing
function propsOf(f) {
    var O = OC(), F = FU(); if (!O || !O.furnProps || !F || !f) return null;
    var pk = f.pack ? packById(f.pack) : null, src = pk ? F.packLook(pk, f.k, f.era) : '';
    return O.furnProps(f, ruleLists(campNow()), state.gridType === 'hex', cellNow(), src);
}
function place(f) {
    var F = FU(), p = propsOf(f); if (!F || !p || typeof window.wpArmPlacement !== 'function') return;
    window.wpArmPlacement('image', p, F.furnKind(f.k).label.toLowerCase());
    if (window.wpPlace) window.wpPlace.sized = true;   // its own size, as a map object's is
    log('place', { k: f.k, era: f.era, rules: ruleOf(f.k) ? 1 : 0 });
}
function head(F, box) {   // the box and the chips are made once, so that a word being typed keeps its place
    var f = el('input', 'build-find'), eras = el('div', 'build-eras'), body = el('div', 'furn-body');
    f.type = 'text'; f.id = 'furnFind'; f.placeholder = 'Find a furnishing'; f.setAttribute('aria-label', 'Find a furnishing');
    f.title = 'Goes straight to a furnishing. Enter places the first one.';
    f.addEventListener('input', function() { _p.find = f.value; draw(); });
    f.addEventListener('keydown', function(ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); ev.stopPropagation();
        var m = palModel(F, _p.find); if (m.length) place({ k: m[0].kinds[0].key, era: _p.era, pack: lookNow() || undefined });
    });
    F.FURN_ERAS.forEach(function(e) {
        var c = el('button', 'tile-chip build-era', e.label); c.type = 'button'; c.dataset.era = e.id;
        c.title = 'Draw them in the ' + e.label + ' look. Any look goes on any map.';
        c.addEventListener('click', function(ev) { ev.stopPropagation(); _p.era = e.id; keep(); draw(); log('era', { era: e.id }); });
        eras.appendChild(c); _p.chips.push(c);
    });
    var lk = el('div', 'furn-looks'), ll = el('label', 'furn-looks-lab', 'Looks'), sel = el('select', 'furn-looks-sel'), pb = el('button', 'tool ghost furn-packs-btn', 'Packs\u2026');
    sel.id = 'furnLooks'; ll.htmlFor = 'furnLooks'; sel.title = 'Waypoint\u2019s own drawings, or one of this campaign\u2019s packs. Any look goes on any map.';
    sel.addEventListener('change', function() { _p.look = sel.value; lookKeep(sel.value); draw(); if (typeof window.wpBuildSync === 'function') window.wpBuildSync(); log('look', { pack: sel.value ? 1 : 0 }); });   // fold 4: one choice with Build's Materials tab
    pb.type = 'button'; pb.id = 'furnPacksBtn'; pb.title = 'Bring in a pack from a file or a folder, share one from another campaign, or export one.';
    pb.addEventListener('click', function(ev) { ev.stopPropagation(); if (window.wpFurnPacks) window.wpFurnPacks.open(); });
    lk.appendChild(ll); lk.appendChild(sel); lk.appendChild(pb); _p.lookSel = sel;
    box.appendChild(lk); box.appendChild(f); box.appendChild(eras); box.appendChild(body); _p.body = body;
}
function tile(F, k, pack) {
    var src = pack ? F.packLook(pack, k.key, _p.era) : '', f = { k: k.key, era: _p.era }, rule = ruleOf(k.key), cell = el('div', 'build-cell'), b = el('button', 'build-mat furn-tile');
    if (src) f.pack = pack.id;
    b.type = 'button'; b.dataset.furn = furnWord(f); b.draggable = true; b.title = tileTip(F, k.key, rule, !!(pack && !src));
    var face = el('span', 'build-tile furn-face'), im = el('img'); im.alt = ''; im.src = src || F.furnSrc({ k: k.key, era: _p.era }); face.appendChild(im);
    b.appendChild(face); b.appendChild(el('span', 'build-nm', k.label));
    if (rule) { var mk = el('span', 'furn-rule', 'Rules'); b.appendChild(mk); }
    if (pack && !src) b.appendChild(el('span', 'furn-base', 'Waypoint'));   // fold 2 ("Waypoint's drawing, marked")
    b.addEventListener('click', function(ev) { ev.stopPropagation(); place(f); });
    b.addEventListener('dragstart', function(ev) { try { ev.dataTransfer.setData('application/x-wp-furn', furnWord(f)); ev.dataTransfer.effectAllowed = 'copy'; } catch (e) {} });
    cell.appendChild(b);
    return cell;
}
function draw() {
    var F = FU(), box = document.getElementById('buildFurn'); if (!F || !box) return;
    load();
    if (!box.firstChild) head(F, box);
    _p.chips.forEach(function(c) { c.classList.toggle('on', c.dataset.era === _p.era); });
    var find = !!_p.find.trim(), rules = F.FURN_KINDS.map(function(k) { var r = ruleOf(k.key); return r ? r.id + '=' + r.name : ''; }).join(',');   // a rule renamed redraws the tips that name it
    var packs = packsNow(), psig = packs.map(function(p) { return p.id + '=' + p.name + '=' + F.packCount(p); }).join(',');
    if (_p.psig !== psig && _p.lookSel) {   // the Looks list: Waypoint's drawings, then each pack by its name
        _p.psig = psig; var ls = _p.lookSel; while (ls.firstChild) ls.removeChild(ls.firstChild);
        var o0 = el('option', '', 'Waypoint\u2019s drawings'); o0.value = ''; ls.appendChild(o0);
        packs.forEach(function(p) { var o = el('option', '', p.name); o.value = p.id; ls.appendChild(o); });
    }
    var look = lookNow(), pack = packById(look); if (_p.lookSel) _p.lookSel.value = look;
    var sig = [_p.era, _p.find, _p.open.join(','), rules, look, psig].join('|');
    if (sig === _p.drawn && _p.body.firstChild) return;
    _p.drawn = sig;
    var body = _p.body, ae = document.activeElement, keepFold = ae && body.contains(ae) && ae.classList.contains('build-fold') ? ae.getAttribute('data-fold') : '';
    while (body.firstChild) body.removeChild(body.firstChild);
    var m = palModel(F, _p.find);
    m.forEach(function(g) {
        var isOpen = find || _p.open.indexOf(g.group) >= 0, b = el('button', 'build-fold', g.group), n = el('small', '', String(g.kinds.length));
        b.type = 'button'; b.setAttribute('data-fold', g.group); b.setAttribute('aria-expanded', isOpen ? 'true' : 'false'); b.appendChild(n);
        b.addEventListener('click', function(ev) {
            ev.stopPropagation();
            _p.open = isOpen ? _p.open.filter(function(x) { return x !== g.group; }) : _p.open.concat([g.group]);
            keep(); draw();
        });
        body.appendChild(b);
        if (isOpen) { var grid = el('div', 'build-grid'); g.kinds.forEach(function(k) { grid.appendChild(tile(F, k, pack)); }); body.appendChild(grid); }
    });
    if (!m.length) body.appendChild(el('div', 'build-none', 'No furnishing by that name.'));
    if (keepFold) { var fb = Array.prototype.filter.call(body.querySelectorAll('.build-fold'), function(x) { return x.getAttribute('data-fold') === keepFold; })[0]; if (fb) { try { fb.focus({ preventScroll: true }); } catch (e) {} } }
}
function wire() {
    ['buildOptBtn', 'buildModeBtn'].forEach(function(id) { var e = document.getElementById(id); if (e) e.addEventListener('click', draw); });
    var tabs = document.getElementById('buildTabs'); if (tabs) tabs.addEventListener('click', draw);
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
window.wpFurnish = { draw: draw, propsOf: propsOf, read: function(s) { var F = FU(); return F ? furnRead(F, s) : null; }, place: place, cell: cellNow, era: function() { var F = FU(); load(); return F ? eraKept(F, _p.era) : 'fantasy'; }, packName: function(id) { var p = packById(id); return p ? p.name : ''; }, look: lookNow, lookSet: function(id) { var v = id && packById(id) ? id : ''; _p.look = v; _p.lookCamp = campId(); lookKeep(v); draw(); }, packs: packsNow };   // fold 4: one Looks choice for furnishings and blocks
