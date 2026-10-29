/* The export share sheet (1.6.0, backlog 34) \u2014 the pure half. The owner, 2026-10-29, by prompt: Export This Campaign, a new Share This
   Campaign and Export Everything all open the sheet ("all of the above"), Share with Players unticked ("Yes, Share starts Players unticked
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
   No DOM, no state: tools/zipcheck.js runs it under Node. Published as window.wpShareCore. */
'use strict';

var KINDS = ['maps', 'pages', 'chars', 'pictures', 'sounds', 'music', 'videos', 'players'];
var NAMES = { maps: 'Maps', pages: 'Pages', chars: 'Characters', pictures: 'Pictures', sounds: 'Sounds', music: 'Music', videos: 'Videos', players: 'Players' };
var WORDS = { maps: ['map', 'maps'], pages: ['page', 'pages'], chars: ['character', 'characters'], pictures: ['picture', 'pictures'], sounds: ['sound', 'sounds'],
    music: ['song', 'songs'], videos: ['video', 'videos'], players: ['player', 'players'] };
var FILE_KINDS = ['pictures', 'sounds', 'music', 'videos'];
var LIMITS = Object.freeze({ title: 120, author: 80, version: 24, desc: 1000, descLines: 20, card: 64 * 1024, cover: 16 * 1024 * 1024, coverName: 300, count: 1e7, bytes: 1e15 });
// What the Players tick takes: the registry with each player's name and history, the ban list, the Session Log, who was handed what and who
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
        if (isObj(c.chars)) t.chars.n += Object.keys(c.chars).length;
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
        if (has.chars) delete c.chars;
        if (has.sounds) delete c.sounds;
        if (has.music) delete c.music;
        if (has.videos) delete c.videos;
        if (has.players) {
            PLAYER_KEYS.forEach(function(k) { delete c[k]; });
            if (isObj(c.handouts)) Object.keys(c.handouts).forEach(function(id) { var h = c.handouts[id]; if (isObj(h)) delete h.giveTo; });
        }
    });
    return payload;
}
function keepPaths(paths, leave, sets, cover) {
    var L = cleanLeave(leave), out = (Array.isArray(paths) ? paths : []).filter(function(p) { return p === cover || L.indexOf(kindOf(p, sets)) < 0; });
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
    return out;
}
// A card for a sheet as the GM filled it: null when it is blank, so that no card is written and nothing is left out
function isBlank(form, title0) {
    if (!isObj(form)) return true;
    var t = lineOf(form.title, LIMITS.title);
    return (!t || t === lineOf(title0, LIMITS.title)) && !lineOf(form.author, LIMITS.author) && !lineOf(form.version, LIMITS.version) && !descOf(form.desc)
        && !coverName(form.cover) && !cleanLeave(form.leave).length;
}
// The card share.json holds: what the GM typed, the cover's entry, and the contents of the file as it is made (a kind left out is not counted)
function cardFor(form, t, kind) {
    var left = cleanLeave(form && form.leave), contents = {};
    KINDS.forEach(function(k) { var e = t && t[k]; if (!e || left.indexOf(k) >= 0 && k !== 'pictures') return; contents[k] = FILE_KINDS.indexOf(k) >= 0 ? { n: e.n, bytes: e.bytes } : { n: e.n }; });
    return cleanCard({ v: 1, kind: kind, title: form && form.title, author: form && form.author, version: form && form.version, desc: form && form.desc, cover: form && form.cover, contents: contents, left: left });
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
    return l.length ? 'Left out by its author: ' + l.map(function(k) { return NAMES[k].toLowerCase(); }).join(', ') + '.' : '';
}
function byWords(card) {
    if (!card) return '';
    var a = card.author ? 'by ' + card.author : '', v = card.version ? 'version ' + card.version : '';
    return a && v ? a + ' \u00b7 ' + v : a || (v ? v.charAt(0).toUpperCase() + v.slice(1) : '');
}

var API = { KINDS: KINDS, NAMES: NAMES, WORDS: WORDS, FILE_KINDS: FILE_KINDS, LIMITS: LIMITS, PLAYER_KEYS: PLAYER_KEYS, fileSets: fileSets, kindOf: kindOf, tally: tally,
    leaveOut: leaveOut, keepPaths: keepPaths, cleanLeave: cleanLeave, coverName: coverName, cleanCard: cleanCard, isBlank: isBlank, cardFor: cardFor, sizeWords: sizeWords,
    countWords: countWords, contentsWords: contentsWords, leftWords: leftWords, byWords: byWords };
if (typeof window !== 'undefined') window.wpShareCore = API;
export { KINDS, NAMES, WORDS, FILE_KINDS, LIMITS, PLAYER_KEYS, fileSets, kindOf, tally, leaveOut, keepPaths, cleanLeave, coverName, cleanCard, isBlank, cardFor, sizeWords,
    countWords, contentsWords, leftWords, byWords };
