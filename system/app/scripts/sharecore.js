/* The export share sheet (1.6.0, backlog 34) \u2014 the pure half. The owner, 2026-10-29, by prompt: Export this campaign, a new Share This
   Campaign and Export everything all open the sheet ("all of the above"), Share with Players unticked ("Yes, Share starts Players unticked
   (Recommended)"); the card is "share.json beside data.json (Recommended)"; an import shows it as "A card at the top of Import (Recommended)";
   and "Yes, a Players tick (Recommended)".

   The sheet shows what the file would carry by kind (KINDS) and lets the GM untick a kind to leave it out. A card is a title, an author, a
   version, a description and a cover picture, with the contents counted and what was left out. It travels as share.json in the .zip, beside
   data.json, which it never changes: an older Waypoint reads data.json and the files and passes it over. A sheet left as it came (nothing
   typed, no cover, every kind ticked) makes no card and leaves out nothing, so the file is byte for byte the export it always was (isBlank).

     fileSets(payload)          the uploaded files a payload's lists name, by kind (sounds, music, videos), each with its list's size
     kindOf(path, sets)         one file's kind: a listed sound, a listed song, a video, any other sound file, else a picture
     tally(payload, paths, sz)  the count of each kind and the bytes of each kind of file (sz: a picture's size by its path)
     leaveOut(payload, leave)   takes the kinds left out off a payload (its own copy): maps, pages, characters, sounds, music, videos, players
     keepPaths(paths, leave, sets, cover)  the files that still go: a kind left out goes whole, the cover always comes along
     cleanCard(raw)             a card as it is written and as it is read back from a file, every key cleaned; null when there is none
     coverName(name)            the archive entry a cover may name: a picture under images/, never in the Journal's folder
     sizeWords, contentsWords, leftWords, byWords   the words the sheet and the import say

   Export all (1.6.2, backlog 227; the owner, by prompt on the drawn sheet: "Grow the Share sheet, no new export", "Both", "a Template
   tick on a character", "A look before it lands"; then, correcting it: no starting points, "just full export and have options on
   whether that means with images or not, and other helpful options"). Share This Campaign became Full export: plain ticks, no preset.
     templates                  a kind of its own: the characters ticked Template, ticked and left out apart from the other characters
     picTags, tagRows           a picture's tags across the Image Library's stores, and the sheet's rows: each tag with its count, then No tag
     privOff(stores)            the tags Full export starts unticked: those marked private (imgtagcore priv)
     picsOut                    the pictures left out: an unticked tag, No tag unticked, a single picture picked out, less one put back
     templatesIn                the characters ticked Template: leaveOut keeps them when Characters is left out, so they always travel
     leftPicName                a left-out picture as share.json names it (images/..., its place kept in data.json)
     lookOf, lookWords          an import's counts before anything is written: from data.json and the archive's entry names only
     asNewCamps                 Import as a new campaign: every campaign of the file under a new id
     freeNames                  ... and a name of its own here, no two of the file alike
     stripPrivate               Full export: the private tags and their marks stay on this computer
   No DOM, no state: tools/zipcheck.js runs it under Node. Published as window.wpShareCore. */
'use strict';

var KINDS = ['maps', 'pages', 'chars', 'templates', 'pictures', 'sounds', 'music', 'videos', 'players'];   // templates: 1.6.2 (backlog 227)
var NAMES = { maps: 'Maps', pages: 'Pages', chars: 'Characters', templates: 'Templates', pictures: 'Pictures', sounds: 'Sounds', music: 'Music', videos: 'Videos', players: 'Players' };
var WORDS = { maps: ['map', 'maps'], pages: ['page', 'pages'], chars: ['character', 'characters'], templates: ['template', 'templates'], pictures: ['picture', 'pictures'], sounds: ['sound', 'sounds'],
    music: ['song', 'songs'], videos: ['video', 'videos'], players: ['player', 'players'] };
var FILE_KINDS = ['pictures', 'sounds', 'music', 'videos'];
var LIMITS = Object.freeze({ title: 120, author: 80, version: 24, desc: 1000, descLines: 20, card: 64 * 1024, cover: 16 * 1024 * 1024, coverName: 300, count: 1e7, bytes: 1e15, leftPics: 2000 });
var TAG_NONE = '__none';
// What the Players tick takes: the registry with each player's name and history, the ban list, the Game Record, who was handed what and who
// saw it, and the sheet uploads waiting for review. A handout keeps its pages and loses only the players it waits for (giveTo)
var PLAYER_KEYS = ['players', 'bannedPlayers', 'handoutReveals', 'handoutLog', 'sessionLog', 'uploads'];

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
function campsOf(payload) {
    var cs = isObj(payload) && isObj(payload.campaigns) ? payload.campaigns : {};
    return Object.keys(cs).map(function(k) { return cs[k]; }).filter(isObj);
}
function bytesOf(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(LIMITS.bytes, Math.floor(v)) : 0; }
function isPage(it) { return !!it && (it.type === 'planner' || it.type === 'doc'); }   // models.js isDocLike: any other item is drawn as a map
function cleanLeave(leave) {
    var on = Array.isArray(leave) ? leave : isObj(leave) ? Object.keys(leave).filter(function(k) { return leave[k] === true; }) : [];
    return KINDS.filter(function(k) { return on.indexOf(k) >= 0; });
}

function fileSets(payload) {
    var out = { sounds: Object.create(null), music: Object.create(null), videos: Object.create(null) };
    var add = function(set, list) { if (Array.isArray(list)) list.forEach(function(e) { if (isObj(e) && typeof e.path === 'string' && e.path) set[e.path] = bytesOf(e.size); }); };
    campsOf(payload).forEach(function(c) { add(out.sounds, c.sounds); add(out.music, isObj(c.music) ? c.music.tracks : null); add(out.videos, c.videos); });
    return out;
}
function kindOf(p, sets) {
    var s = typeof p === 'string' ? p : '';
    if (sets && sets.sounds && s in sets.sounds) return 'sounds';
    if (sets && sets.music && s in sets.music) return 'music';
    if (/^\/saves\/images\/video\//.test(s)) return 'videos';
    if (/^\/saves\/images\/audio\//.test(s)) return 'sounds';
    return 'pictures';
}
function tally(payload, paths, sizes) {
    var sets = fileSets(payload), t = {};
    KINDS.forEach(function(k) { t[k] = { n: 0, bytes: 0, unknown: 0 }; });
    campsOf(payload).forEach(function(c) {
        var items = isObj(c.items) ? c.items : {};
        Object.keys(items).forEach(function(id) { var it = items[id]; if (isObj(it)) t[isPage(it) ? 'pages' : 'maps'].n++; });
        if (isObj(c.chars)) Object.keys(c.chars).forEach(function(id) { var ch = c.chars[id]; t[isObj(ch) && ch.template === true && ch.partial !== true ? 'templates' : 'chars'].n++; });   // 1.6.2: a template is counted apart
        if (isObj(c.players)) t.players.n += Object.keys(c.players).length;
        if (Array.isArray(c.sounds)) t.sounds.n += c.sounds.filter(isObj).length;   // a sound of the bundled set has no file of its own, and is a sound all the same
        if (isObj(c.music) && Array.isArray(c.music.tracks)) t.music.n += c.music.tracks.filter(isObj).length;
        if (Array.isArray(c.videos)) t.videos.n += c.videos.filter(isObj).length;
    });
    var seen = Object.create(null);
    (Array.isArray(paths) ? paths : []).forEach(function(p) {
        if (typeof p !== 'string' || seen[p]) return; seen[p] = 1;
        var k = kindOf(p, sets), b = sizes && own(sizes, p) ? bytesOf(sizes[p]) : k !== 'pictures' && sets[k] && p in sets[k] ? sets[k][p] : 0;
        if (k === 'pictures') t.pictures.n++;
        if (b) t[k].bytes += b; else t[k].unknown++;
    });
    return t;
}
function leaveOut(payload, leave) {
    var L = cleanLeave(leave); if (!L.length) return payload;
    var has = {}; L.forEach(function(k) { has[k] = true; });
    campsOf(payload).forEach(function(c) {
        if ((has.maps || has.pages) && isObj(c.items)) {
            Object.keys(c.items).forEach(function(id) { var it = c.items[id], pg = isPage(it); if (!isObj(it) || (pg && has.pages) || (!pg && has.maps)) delete c.items[id]; });
            if (typeof c.activeItemId === 'string' && !own(c.items, c.activeItemId)) { var first = Object.keys(c.items)[0]; if (first) c.activeItemId = first; else delete c.activeItemId; }
        }
        if ((has.chars || has.templates) && isObj(c.chars)) {   // 1.6.2 (backlog 227): Characters and Templates are ticked apart
            var tpK = templatesIn(c.chars); Object.keys(c.chars).forEach(function(id) { if (tpK[id] ? has.templates : has.chars) delete c.chars[id]; });
            if (!Object.keys(c.chars).length) delete c.chars;
        } else if (has.chars) delete c.chars;
        if ((has.chars || has.players) && isObj(c.boxes)) Object.keys(c.boxes).forEach(function(id) { if (isObj(c.boxes[id])) { delete c.boxes[id].taken; delete c.boxes[id].tell; } });   // 1.6.2 (backlog 42, the review of fold 2c): a container's takes name characters
        if (has.sounds) { delete c.sounds; delete c.soundOn; }   // 1.6.2: with no sounds, a line would only say that its sound is gone
        if (has.music) delete c.music;
        if (has.videos) delete c.videos;
        if (has.players) {
            PLAYER_KEYS.forEach(function(k) { delete c[k]; });
            if (isObj(c.handouts)) Object.keys(c.handouts).forEach(function(id) { var h = c.handouts[id]; if (isObj(h)) delete h.giveTo; });
        }
    });
    return payload;
}
function keepPaths(paths, leave, sets, cover, pics) {   // pics (1.6.2, backlog 227): single pictures left out, their places kept
    var L = cleanLeave(leave), P = Object.create(null); (Array.isArray(pics) ? pics : []).forEach(function(p) { if (typeof p === 'string') P[p] = 1; });
    var out = (Array.isArray(paths) ? paths : []).filter(function(p) { return p === cover || (L.indexOf(kindOf(p, sets)) < 0 && !(P[p] && kindOf(p, sets) === 'pictures')); });
    if (typeof cover === 'string' && cover && out.indexOf(cover) < 0) out.push(cover);
    return out;
}

// One line of text: no control character or line break, the ends trimmed, at most max code points (a character of two halves is kept whole)
function lineOf(v, max) { return typeof v === 'string' ? Array.from(v.replace(/[\x00-\x1f\x7f\u2028\u2029]+/g, ' ').trim()).slice(0, max).join('').trim() : ''; }
// The description: its own line breaks kept (at most descLines of them), any other control character dropped
function descOf(v) {
    if (typeof v !== 'string') return '';
    var lines = v.replace(/\r\n?|[\u2028\u2029]/g, '\n').replace(/[\x00-\x09\x0b-\x1f\x7f]+/g, ' ').split('\n').map(function(l) { return l.replace(/\s+$/, ''); });
    var s = lines.slice(0, LIMITS.descLines).join('\n').replace(/^\n+|\n+$/g, '');
    return Array.from(s).slice(0, LIMITS.desc).join('').replace(/\s+$/, '');
}
function coverName(name) {
    if (typeof name !== 'string' || !name || name.length > LIMITS.coverName || name.indexOf('images/') !== 0 || /[\\:?#%\x00-\x1f\x7f]/.test(name)) return '';
    var segs = name.split('/');
    if (segs.length < 3 || segs.some(function(s) { return s === '' || /^[. ]+$/.test(s); }) || /^journal[. ]*$/i.test(segs[1]) || /^(audio|video)$/i.test(segs[1])) return '';
    return /\.(png|jpe?g|gif|webp)$/i.test(name) ? name : '';
}
function countOf(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(LIMITS.count, Math.floor(v)) : 0; }
function cleanCard(raw) {
    if (!isObj(raw) || raw.v !== 1) return null;
    var out = { v: 1, kind: raw.kind === 'all' ? 'all' : 'campaign', title: lineOf(raw.title, LIMITS.title), author: lineOf(raw.author, LIMITS.author), version: lineOf(raw.version, LIMITS.version), desc: descOf(raw.desc), cover: coverName(raw.cover) };
    var contents = {};
    if (isObj(raw.contents)) KINDS.forEach(function(k) {
        var e = own(raw.contents, k) ? raw.contents[k] : null; if (!isObj(e)) return;
        var n = countOf(e.n), b = FILE_KINDS.indexOf(k) >= 0 ? bytesOf(e.bytes) : 0;
        if (n || b) contents[k] = b ? { n: n, bytes: b } : { n: n };
    });
    out.contents = contents;
    out.left = cleanLeave(raw.left);
    var lp = [];   // 1.6.2 (backlog 227): the pictures left out whose places data.json keeps, each once, at most LIMITS.leftPics; kept only when there are some
    if (Array.isArray(raw.leftPics)) raw.leftPics.forEach(function(p) { var n = leftPicName(p); if (n && lp.length < LIMITS.leftPics && lp.indexOf(n) < 0) lp.push(n); });
    if (lp.length) out.leftPics = lp;
    return out;
}
// A card for a sheet as the GM filled it: null when it is blank, so that no card is written and nothing is left out
function isBlank(form, title0) {
    if (!isObj(form)) return true;
    var t = lineOf(form.title, LIMITS.title);
    return (!t || t === lineOf(title0, LIMITS.title)) && !lineOf(form.author, LIMITS.author) && !lineOf(form.version, LIMITS.version) && !descOf(form.desc)
        && !coverName(form.cover) && !cleanLeave(form.leave).length && !(Array.isArray(form.pics) && form.pics.length);
}
// The card share.json holds: what the GM typed, the cover's entry, and the contents of the file as it is made (a kind left out is not counted)
function cardFor(form, t, kind) {
    var left = cleanLeave(form && form.leave), contents = {};
    KINDS.forEach(function(k) { var e = t && t[k]; if (!e || left.indexOf(k) >= 0 && k !== 'pictures') return; contents[k] = FILE_KINDS.indexOf(k) >= 0 ? { n: e.n, bytes: e.bytes } : { n: e.n }; });
    return cleanCard({ v: 1, kind: kind, title: form && form.title, author: form && form.author, version: form && form.version, desc: form && form.desc, cover: form && form.cover, contents: contents, left: left, leftPics: form && form.leftPics });
}

function sizeWords(b) {
    var n = bytesOf(b);
    if (n < 1024) return n === 1 ? '1 byte' : n + ' bytes';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    var mb = n / (1024 * 1024);
    if (mb < 1024) return (mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb)) + ' MB';
    var gb = mb / 1024;
    return (gb < 10 ? Math.round(gb * 10) / 10 : Math.round(gb)) + ' GB';
}
function countWords(k, n) { var w = WORDS[k]; return w ? n + ' ' + (n === 1 ? w[0] : w[1]) : ''; }
// "6 maps \u00b7 14 pages \u00b7 83 pictures": the kinds a card counts, in their order, none of zero
function contentsWords(card) {
    var c = card && isObj(card.contents) ? card.contents : {};
    return KINDS.filter(function(k) { return own(c, k) && c[k].n > 0; }).map(function(k) { return countWords(k, c[k].n); }).join(' \u00b7 ');
}
function leftWords(card) {
    var l = card && Array.isArray(card.left) ? cleanLeave(card.left) : [];
    var n = card && Array.isArray(card.leftPics) ? card.leftPics.length : 0, pw = n ? (n === 1 ? 'One picture stays out. Its place is kept, so you can add your own file there.' : n + ' pictures stay out. Their places are kept, so you can add your own files there.') : '';
    return (l.length ? 'Left out by its author: ' + l.map(function(k) { return NAMES[k].toLowerCase(); }).join(', ') + '.' : '') + (l.length && pw ? ' ' : '') + pw;
}

/* ---- 1.6.2 (backlog 227): Export all ---- */
// A store of the Image Library's tags, as the sheet reads one (imgtagcore cleans them on every way in): its list, its pictures' tags, its private marks
function storeOk(s) { return isObj(s) && Array.isArray(s.list); }
function picTags(stores, path) {
    var out = [];
    (Array.isArray(stores) ? stores : []).forEach(function(s) {
        if (!storeOk(s) || !isObj(s.by) || !own(s.by, path)) return;
        var v = s.by[path]; (Array.isArray(v) ? v : [v]).forEach(function(n) { if (typeof n === 'string' && s.list.indexOf(n) >= 0 && out.indexOf(n) < 0) out.push(n); });
    });
    return out;
}
function isPriv(stores, name) { return (Array.isArray(stores) ? stores : []).some(function(s) { return storeOk(s) && s.list.indexOf(name) >= 0 && isObj(s.priv) && s.priv[name] === true; }); }
function privOff(stores) {
    var off = {};
    (Array.isArray(stores) ? stores : []).forEach(function(s) { if (storeOk(s)) s.list.forEach(function(n) { if (typeof n === 'string' && isPriv(stores, n)) off[n] = true; }); });
    return off;
}
// The pictures among paths (sets: fileSets of the payload) by tag: { rows: [{ name, n, priv }] in the stores' order, only tags some picture
// wears, none: how many wear none }
function tagRows(paths, stores, sets) {
    var cnt = Object.create(null), none = 0, order = [];
    (Array.isArray(stores) ? stores : []).forEach(function(s) { if (storeOk(s)) s.list.forEach(function(n) { if (typeof n === 'string' && order.indexOf(n) < 0) order.push(n); }); });
    (Array.isArray(paths) ? paths : []).forEach(function(p) {
        if (typeof p !== 'string' || kindOf(p, sets) !== 'pictures') return;
        var ts = picTags(stores, p); if (!ts.length) { none++; return; }
        ts.forEach(function(n) { cnt[n] = (cnt[n] || 0) + 1; });
    });
    return { rows: order.filter(function(n) { return cnt[n] > 0; }).map(function(n) { return { name: n, n: cnt[n], priv: isPriv(stores, n) }; }), none: none };
}
// The pictures left out, in the order of paths: one that wears any unticked tag (off: { name: true }; off[TAG_NONE]: those with no tag), or
// is picked out (pickOut: { path: true }), unless it was put back (pickIn). Pictures only: a sound or a video is never one
function picsOut(paths, stores, sets, off, pickOut, pickIn) {
    var o = isObj(off) ? off : {}, po = isObj(pickOut) ? pickOut : {}, pi = isObj(pickIn) ? pickIn : {}, seen = Object.create(null), out = [];
    (Array.isArray(paths) ? paths : []).forEach(function(p) {
        if (typeof p !== 'string' || seen[p] || kindOf(p, sets) !== 'pictures') return; seen[p] = 1;
        var ts = picTags(stores, p), byTag = ts.length ? ts.some(function(n) { return o[n] === true; }) : o[TAG_NONE] === true;
        if (own(pi, p) && pi[p] === true) return;
        if (byTag || (own(po, p) && po[p] === true)) out.push(p);
    });
    return out;
}
// The characters ticked Template, by id (each one's own object)
function templatesIn(chars) { var out = {}; if (isObj(chars)) Object.keys(chars).forEach(function(id) { var c = chars[id]; if (isObj(c) && c.template === true && c.partial !== true) out[id] = c; }); return out; }
// A left-out picture's name in share.json: its archive name (no leading /saves/), under images/, never the Journal's, a sound's or a video's
function leftPicName(p) {
    var s = typeof p === 'string' ? p.replace(/^\/saves\//, '') : '';
    if (!s || s.length > LIMITS.coverName || s.indexOf('images/') !== 0 || /[\\:?#\x00-\x1f\x7f]/.test(s)) return '';   // a name to count and to show as a number: an encoded letter is allowed
    var segs = s.split('/');
    if (segs.length < 3 || segs.some(function(x) { return x === '' || /^[. ]+$/.test(x); }) || /^journal[. ]*$/i.test(segs[1]) || /^(audio|video)$/i.test(segs[1])) return '';
    return s;
}
// What an import holds, counted from data.json (parsed) and the archive's entry names (none for a plain file), before anything is written
var LOOK_KINDS = ['system', 'packs', 'maps', 'pages', 'chars', 'templates', 'pictures', 'sounds', 'music', 'videos'];
var LOOK_WORDS = { system: ['system', 'systems'], packs: ['library pack', 'library packs'], maps: ['map', 'maps'], pages: ['page', 'pages'], chars: ['character', 'characters'], templates: ['template', 'templates'],
    pictures: ['picture', 'pictures'], sounds: ['sound', 'sounds'], music: ['song', 'songs'], videos: ['video', 'videos'] };
function lookOf(data, names) {
    var t = {}; LOOK_KINDS.forEach(function(k) { t[k] = 0; });
    campsOf(data).forEach(function(c) {
        if (isObj(c.system) && Array.isArray(c.system.fields) && c.system.fields.length) t.system++;
        var items = isObj(c.items) ? c.items : {};
        Object.keys(items).forEach(function(id) { var it = items[id]; if (isObj(it)) t[isPage(it) ? 'pages' : 'maps']++; });
        if (isObj(c.chars)) Object.keys(c.chars).forEach(function(id) { var ch = c.chars[id]; if (isObj(ch)) t[ch.template === true ? 'templates' : 'chars']++; });
        if (Array.isArray(c.sounds)) t.sounds += c.sounds.filter(isObj).length;
        if (isObj(c.music) && Array.isArray(c.music.tracks)) t.music += c.music.tracks.filter(isObj).length;
        if (Array.isArray(c.videos)) t.videos += c.videos.filter(isObj).length;
    });
    (Array.isArray(names) ? names : []).forEach(function(n) {
        if (typeof n !== 'string' || /\/$/.test(n)) return;
        if (/^library\/l_[a-z0-9]{8}\/p_[A-Za-z0-9_]{1,24}\.[0-9]{1,10}\.json$/.test(n)) { t.packs++; return; }
        if (leftPicName(n)) t.pictures++;
    });
    return t;
}
// "A system with 3 library packs", "6 maps", ...: the kinds an import holds, in their order, none of zero
function lookWords(t) {
    var out = [], w = function(k, n) { return n + ' ' + (n === 1 ? LOOK_WORDS[k][0] : LOOK_WORDS[k][1]); };
    if (!isObj(t)) return out;
    if (t.system > 0) out.push((t.system === 1 ? 'A system' : t.system + ' systems') + (t.packs > 0 ? ' with ' + w('packs', t.packs) : ''));
    else if (t.packs > 0) out.push(w('packs', t.packs));
    LOOK_KINDS.slice(2).forEach(function(k) { if (t[k] > 0) out.push(w(k, t[k])); });
    return out;
}
// Import as a new campaign: each campaign of the file under an id mkId() makes, the open one followed. Answers { old: new }. No campaign is
// ever dropped (the review of backlog 227): an id already given in this call is asked for again, and where mkId keeps giving one that is
// taken (or none), a number is put after it until it is free here and in the call (taken: an id already in use, optional)
var NEW_TRIES = 64;
function asNewCamps(data, mkId, taken) {
    var map = {}; if (!isObj(data) || !isObj(data.campaigns) || typeof mkId !== 'function') return map;
    var out = {}, used = function(id) { return !id || own(out, id) || (typeof taken === 'function' && !!taken(id)); };
    Object.keys(data.campaigns).forEach(function(k) {
        var c = data.campaigns[k]; if (!isObj(c)) return;
        var id = '', n = 0;
        do { id = String(mkId()); } while (used(id) && ++n < NEW_TRIES);
        if (used(id)) { var base = id || 'camp_new', m = 2; while (used(base + '_' + m)) m++; id = base + '_' + m; }
        map[k] = id; c.id = id; out[id] = c;
    });
    data.campaigns = out;
    if (typeof data.activeCampaignId === 'string' && own(map, data.activeCampaignId)) data.activeCampaignId = map[data.activeCampaignId];
    else data.activeCampaignId = Object.keys(out)[0] || null;
    return map;
}
// Import as a new campaign: each campaign of the file a name of its own, one at a time, so that two campaigns of the file never share one
// (the review of backlog 227). isTaken(name): whether a campaign here has it, ignoring case. A name already given counts as taken; a
// taken name gets " (2)", " (3)" and on, as a campaign's name here does. Answers the names in the file's order
function freeNames(data, isTaken) {
    var out = [], given = Object.create(null); if (!isObj(data) || !isObj(data.campaigns)) return out;
    var taken = function(n) { return !!given[n.toLowerCase()] || (typeof isTaken === 'function' && !!isTaken(n)); };
    Object.keys(data.campaigns).forEach(function(k) {
        var c = data.campaigns[k]; if (!isObj(c)) return;
        var base = String(c.name || '').trim() || 'Imported campaign', name = base, i = 2;
        while (taken(name)) name = base + ' (' + (i++) + ')';
        given[name.toLowerCase()] = 1; c.name = name; out.push(name);
    });
    return out;
}
// Full export (the review of backlog 227): a private mark stays on this computer, so what a Full export writes holds no private tag at all.
// Every tag marked private in a store of the payload, or in one of the extra stores (the shared store, when only one campaign goes), is
// taken off each store of the payload: its name from list and shelf, from each picture's tags (a picture left with none loses its entry),
// and a saved filter that names it goes whole (its own name could tell). Every store's priv goes. Changes nothing where nothing is
// private, so such a file is the one it always was. Answers how many private names were taken off
function stripPrivate(payload, extra) {
    if (!isObj(payload)) return 0;
    var stores = [payload.imageCats].concat(campsOf(payload).map(function(c) { return c.imageCats; })).filter(storeOk);
    var all = stores.concat((Array.isArray(extra) ? extra : [extra]).filter(storeOk)), priv = Object.create(null), n = 0;
    all.forEach(function(s) { if (isObj(s.priv)) s.list.forEach(function(t) { if (typeof t === 'string' && s.priv[t] === true && !priv[t]) { priv[t] = 1; n++; } }); });
    stores.forEach(function(s) {
        if (own(s, 'priv')) delete s.priv;
        if (!n) return;
        s.list = s.list.filter(function(t) { return !priv[t]; });
        if (isObj(s.shelf)) Object.keys(s.shelf).forEach(function(t) { if (priv[t]) delete s.shelf[t]; });
        if (isObj(s.by)) Object.keys(s.by).forEach(function(p) { var ts = s.by[p]; if (!Array.isArray(ts)) return; var keep = ts.filter(function(t) { return !priv[t]; }); if (keep.length) s.by[p] = keep; else delete s.by[p]; });
        if (Array.isArray(s.filters)) { s.filters = s.filters.filter(function(f) { return !(isObj(f) && Array.isArray(f.tags) && f.tags.some(function(t) { return priv[t]; })); }); if (!s.filters.length) delete s.filters; }
    });
    return n;
}
function byWords(card) {
    if (!card) return '';
    var a = card.author ? 'by ' + card.author : '', v = card.version ? 'version ' + card.version : '';
    return a && v ? a + ' \u00b7 ' + v : a || (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');
}

var API = { TAG_NONE: TAG_NONE, LOOK_KINDS: LOOK_KINDS, picTags: picTags, privOff: privOff, tagRows: tagRows, picsOut: picsOut, templatesIn: templatesIn, leftPicName: leftPicName, lookOf: lookOf, lookWords: lookWords, asNewCamps: asNewCamps, freeNames: freeNames, stripPrivate: stripPrivate,
    KINDS: KINDS, NAMES: NAMES, WORDS: WORDS, FILE_KINDS: FILE_KINDS, LIMITS: LIMITS, PLAYER_KEYS: PLAYER_KEYS, fileSets: fileSets, kindOf: kindOf, tally: tally,
    leaveOut: leaveOut, keepPaths: keepPaths, cleanLeave: cleanLeave, coverName: coverName, cleanCard: cleanCard, isBlank: isBlank, cardFor: cardFor, sizeWords: sizeWords,
    countWords: countWords, contentsWords: contentsWords, leftWords: leftWords, byWords: byWords };
if (typeof window !== 'undefined') window.wpShareCore = API;
export { TAG_NONE, LOOK_KINDS, picTags, privOff, tagRows, picsOut, templatesIn, leftPicName, lookOf, lookWords, asNewCamps, freeNames, stripPrivate, KINDS, NAMES, WORDS, FILE_KINDS, LIMITS, PLAYER_KEYS, fileSets, kindOf, tally, leaveOut, keepPaths, cleanLeave, coverName, cleanCard, isBlank, cardFor, sizeWords,
    countWords, contentsWords, leftWords, byWords };
