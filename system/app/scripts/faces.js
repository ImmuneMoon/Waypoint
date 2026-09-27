/* Onboarding F1b: a player's TOKEN FACE — the picker (their own picture, the plain default, the bundled token pictures, emoji) and the
   little previews beside it on the Join screen, in Settings ▸ Profile and on the join card. What a face may be and how it is drawn belongs
   to net.js (cleanFace, faceView: tested in netcheck); this module is the UI only. Text through textContent; pictures are only the player's
   own (checked whole by net.js) or the app's own assets. */

// The character and creature faces, listed first in the Emoji tab (Unicode 10 or earlier, so every runtime agrees)
var FACE_EMOJI = [
    ['\u{1F9D9}', 'mage wizard witch sorcerer'], ['\u{1F9DD}', 'elf'], ['\u{1F9DA}', 'fairy fae sprite'], ['\u{1F9DB}', 'vampire'], ['\u{1F9DF}', 'zombie undead'],
    ['⚔️', 'swords fighter warrior'], ['\u{1F5E1}️', 'dagger rogue thief'], ['\u{1F3F9}', 'bow arrow archer ranger'], ['\u{1F6E1}️', 'shield paladin guard'],
    ['\u{1F52E}', 'crystal ball seer oracle'], ['\u{1F4DC}', 'scroll scholar sage'], ['\u{1F451}', 'crown noble king queen'],
    ['\u{1F916}', 'robot droid android'], ['\u{1F47D}', 'alien'], ['\u{1F680}', 'rocket pilot'], ['\u{1F6F0}️', 'satellite'], ['⚙️', 'gear engineer tinker'], ['\u{1F575}️', 'detective spy investigator'],
    ['\u{1F43A}', 'wolf'], ['\u{1F409}', 'dragon'], ['\u{1F985}', 'eagle bird'], ['\u{1F480}', 'skull death'], ['\u{1F525}', 'fire flame'], ['⚡', 'lightning bolt storm']
];
function wpNet() { return window.wpNet || null; }
function mk(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
// How a face looks for this profile (net.js decides; before it has loaded, the stored picture or the silhouette)
function viewOf(face, prof) {
    var n = wpNet(), p = Object.assign({}, prof || {}, { face: face || '' }), col = (prof && typeof prof.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(prof.color)) ? prof.color : '#4db3d3';   // the table's colour for someone with none
    if (n && n.faceView) return n.faceView(p, col);
    return { img: window.wpDefaultAvatar ? window.wpDefaultAvatar(col) : '' };
}
function drawInto(box, face, prof) {
    if (!box) return;
    box.textContent = '';
    var v = viewOf(face, prof);
    if (v.emoji) box.appendChild(mk('span', 'face-emoji', v.emoji));
    else { var i = mk('img'); i.alt = ''; i.draggable = false; i.src = v.img || ''; box.appendChild(i); }
}
var pop = null;
function close() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); } }
function onKey(e) { if (pop && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var a = pop._anchor; close(); try { if (a) a.focus(); } catch (er) {} } }
function outside(e) { if (pop && !pop.contains(e.target) && !(e.target.closest && e.target.closest('.face-btn')) && !(pop._anchor && pop._anchor.contains && pop._anchor.contains(e.target))) close(); }   // its own button toggles it
function title(name) { return name.replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); }); }
// The picker: Pictures (their picture, the default, the bundled token pictures) and Emoji (search). onPick(face) with the chosen value
function open(anchor, current, prof, onPick, opts) {
    opts = opts || {};
    close();
    var n = wpNet(), clean = n && n.cleanFace ? n.cleanFace : function() { return ''; }, pics = n && n.FACE_PICS ? n.FACE_PICS : [];
    pop = mk('div', 'face-pop'); pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Token face');
    var tabs = mk('div', 'face-tabs'), tP = mk('button', 'tool ghost face-tab', 'Pictures'), tE = mk('button', 'tool ghost face-tab', 'Emoji');
    tP.type = 'button'; tE.type = 'button'; tabs.appendChild(tP); tabs.appendChild(tE); pop.appendChild(tabs);
    var q = mk('input', 'field face-q'); q.type = 'text'; q.spellcheck = false; q.autocomplete = 'off'; q.placeholder = 'Search emoji'; pop.appendChild(q);
    var grid = mk('div', 'face-grid'); pop.appendChild(grid);
    var cur = clean(current || '');
    var pick = function(v) { close(); if (typeof onPick === 'function') onPick(v); };
    var opt = function(value, label, fill) { var b = mk('button', 'tool ghost face-opt' + (value === cur ? ' sel' : '')); b.type = 'button'; b.title = label; fill(b); b.addEventListener('click', function(e) { e.preventDefault(); pick(value); }); grid.appendChild(b); };
    var showPictures = function() {
        tP.classList.add('sel'); tE.classList.remove('sel'); q.style.display = 'none'; grid.textContent = '';
        var hasPic = !!(n && n.safeAvatar && prof && n.safeAvatar(prof.avatar));
        if (hasPic) opt('photo', 'My picture', function(b) { drawInto(b, 'photo', prof); });
        opt('default', 'The plain default', function(b) { drawInto(b, 'default', prof); });
        pics.forEach(function(nm) { opt('pic:' + nm, title(nm), function(b) { drawInto(b, 'pic:' + nm, prof); }); });
        if (opts.upload && window.wpProcessAvatar) {   // Onboarding F1c: a picture of their own (shrunk and checked before it is sent)
            var up = mk('button', 'tool ghost face-opt face-upload', '\u2B06'); up.type = 'button'; up.title = 'Upload a picture'; var fi = mk('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.hidden = true;
            fi.addEventListener('change', function() { var f = fi.files && fi.files[0]; if (!f) return; close(); window.wpProcessAvatar(f, function(data) { if (typeof onPick === 'function') onPick('', data); }, { px: 256, max: 200000, title: 'Frame the picture' }); });   // the token creator: the picker closes first, a character's picture at 256
            up.addEventListener('click', function(e) { e.preventDefault(); fi.click(); }); grid.appendChild(up); grid.appendChild(fi);
        }
    };
    var showEmoji = function() {
        tE.classList.add('sel'); tP.classList.remove('sel'); q.style.display = ''; grid.textContent = '';
        var s = q.value.trim().toLowerCase(), seen = {}, list = FACE_EMOJI.concat(window.wpSheets && Array.isArray(window.wpSheets.emojiSet) ? window.wpSheets.emojiSet : []);
        list.forEach(function(x) { if (!x || seen[x[0]] || !clean(x[0])) return; seen[x[0]] = 1; if (s && String(x[1]).indexOf(s) < 0 && x[0] !== s) return; opt(x[0], String(x[1]).split(' ')[0], function(b) { b.appendChild(mk('span', 'face-emoji', x[0])); }); });
        if (!grid.children.length) grid.appendChild(mk('div', 'face-none', 'Nothing matches.'));
    };
    tP.addEventListener('click', function(e) { e.preventDefault(); showPictures(); });
    tE.addEventListener('click', function(e) { e.preventDefault(); showEmoji(); try { q.focus(); } catch (er) {} });
    q.addEventListener('input', showEmoji);
    pop._anchor = anchor;
    pop.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    if (cur && cur !== 'photo' && cur !== 'default' && cur.slice(0, 4) !== 'pic:') showEmoji(); else showPictures();
    document.body.appendChild(pop);
    var r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(window.innerWidth - 332, r.left)) + 'px';
    pop.style.top = Math.max(8, Math.min(window.innerHeight - 360, r.bottom + 6)) + 'px';
    document.addEventListener('mousedown', outside, true);
    document.addEventListener('keydown', onKey, true);   // Escape closes it wherever the focus is
    var first = grid.querySelector('.face-opt.sel') || grid.querySelector('.face-opt'); try { (first || tP).focus(); } catch (er) {}   // the keyboard starts inside it
}
// The three face buttons (Join screen, Settings ▸ Profile, the join card): each shows the stored face and opens the picker; a choice is
// stored through net.setProfile (cleaned there) and, at a table, sent to the GM (my-look)
var BTN_IDS = ['wcFaceBtn', 'setFaceBtn', 'joinCardFaceBtn'];
function profile() { var n = wpNet(); if (n && n.getProfile) return n.getProfile(); try { var p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); return p && typeof p === 'object' ? p : {}; } catch (e) { return {}; } }
function paintRows() { var p = profile(); BTN_IDS.forEach(function(id) { var b = document.getElementById(id), box = b && b.querySelector('.face-prev'); if (box) drawInto(box, p.face || '', p); }); }
function wire() {
    BTN_IDS.forEach(function(id) {
        var b = document.getElementById(id); if (!b || b.dataset.faceWired) return; b.dataset.faceWired = '1'; b.classList.add('face-btn');
        b.addEventListener('click', function(e) {
            e.preventDefault(); e.stopPropagation();
            if (pop) { close(); return; }
            var p = profile();
            open(b, p.face || '', p, function(f) { var n = wpNet(); if (n && n.setProfile) { n.setProfile({ face: f }); if (n.sendMyLook) n.sendMyLook(); } paintRows(); });
        });
    });
    paintRows();
}
wire();
window.wpFaces = { open: open, close: close, isOpen: function() { return !!pop; }, drawInto: drawInto, paintRows: paintRows, FACE_EMOJI: FACE_EMOJI };
