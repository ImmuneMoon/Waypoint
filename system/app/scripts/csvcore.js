/* csvcore.js — a spreadsheet read as a pack (1.6.2; the owner: "its also important for users to have a way to create catalogs if they cant.
   this should be accessible and easy as possible for the user"). Pure: no DOM, no network, no disk; it loads under Node. A CSV file as a
   spreadsheet program saves one is decoded (csvText), read (parseCsv, readCsv), its columns are matched to what an entry holds by their headings
   (csvTargets, guessMap), and its rows become entries through librarycore's own cleaner (csvEntries). What comes out has the shape
   readPackImport gives, so a spreadsheet goes through packImportPlan as a pack file does: it adds, updates by id or key and judges a clash
   exactly the same. What is read is bounded (CSV), and what is cut is said. Nothing here writes markup: a cell is text, and the window draws it
   as text. */
import { LIB, ITEM_RE, cleanLibEntry, hashText, lvlsFromText } from './librarycore.js';
import { LIMITS, cleanItemKey, cleanPic, tableKeyOk, TABLE_KEY, TABLE_ROW_KEY, nameFold } from './systemcore.js';   // 1.6.3: a table's short forms, as the cleaner holds them (csvTable)

export var CSV = Object.freeze({ bytes: LIB.fileBytes, rows: LIB.entries, cols: 800, cell: 16000, head: 60, sample: 48, sniff: 64 * 1024, sniffLines: 20, show: 8, showStats: 6 });
var SEPS = [',', ';', '\t'], CTRL_LINE = /[\u0000-\u001f\u007f]/g;

function map() { return Object.create(null); }
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function one(v, n) { return typeof v === 'string' ? v.slice(0, n * 2).replace(CTRL_LINE, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : ''; }
function fold(s) { s = s == null ? '' : String(s); return (s.normalize ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : s).toLowerCase(); }
function norm(s) { return fold(s).replace(/[^a-z0-9]+/g, ''); }

// A file's bytes as text, whichever way a spreadsheet program saved it: a mark at its start says UTF-8 or UTF-16; with none it is read as UTF-8
// where it is valid and else as the Western code page, which is what a plain CSV often holds
function latin(b) { var s = ''; for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192)); return s; }
export function csvText(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    var dec = function(enc, fatal) { return new TextDecoder(enc, { fatal: !!fatal }).decode(b); }, noMark = function(s) { return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; };
    if (b.length >= 3 && b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) return { text: noMark(dec('utf-8')), enc: 'utf-8' };
    if (b.length >= 2 && b[0] === 0xFF && b[1] === 0xFE) return { text: noMark(dec('utf-16le')), enc: 'utf-16le' };
    if (b.length >= 2 && b[0] === 0xFE && b[1] === 0xFF) return { text: noMark(dec('utf-16be')), enc: 'utf-16be' };
    try { return { text: dec('utf-8', true), enc: 'utf-8' }; } catch (e) {}
    try { return { text: dec('windows-1252'), enc: 'windows-1252' }; } catch (e) { return { text: latin(b), enc: 'latin1' }; }
}
// Which of comma, semicolon and tab divides this file's cells: the one that stands the same number of times on every line it reads, the most of
// them, else the one on the most lines. A quote opens only at the start of a cell, as parseCsv reads it, so the mark for inches changes nothing
export function sniffSep(text) {
    var s = typeof text === 'string' ? text : '', n = Math.min(s.length, CSV.sniff), lines = [], cur = [0, 0, 0], q = false, any = false;
    var endLine = function() { if (any) lines.push(cur); cur = [0, 0, 0]; any = false; };
    for (var i = 0; i < n && lines.length < CSV.sniffLines; i++) {
        var ch = s[i];
        if (q) { if (ch === '"') { if (s[i + 1] === '"') i++; else q = false; } any = true; continue; }
        if (ch === '\n' || ch === '\r') { endLine(); continue; }
        any = true; var at = SEPS.indexOf(ch); if (at >= 0) { cur[at]++; continue; }
        if (ch === '"' && (i === 0 || s[i - 1] === '\n' || s[i - 1] === '\r' || SEPS.indexOf(s[i - 1]) >= 0)) q = true;
    }
    if (s.length <= CSV.sniff) endLine();   // the last line, when it is whole
    if (!lines.length) return ',';
    var best = 0, bestScore = [-1, -1, -1];
    SEPS.forEach(function(sep, k) {
        var counts = lines.map(function(l) { return l[k]; }), steady = counts[0] > 0 && counts.every(function(c) { return c === counts[0]; }) ? 1 : 0;
        var score = [steady, steady ? counts[0] : counts.filter(function(c) { return c > 0; }).length, counts.reduce(function(a, c) { return a + c; }, 0)];
        for (var j = 0; j < 3; j++) { if (score[j] > bestScore[j]) { best = k; bestScore = score; return; } if (score[j] < bestScore[j]) return; }
    });
    return SEPS[best];
}
// CSV read as a spreadsheet program writes it: a quoted cell may hold the divider, line breaks and doubled quotes; a line ends in LF, CRLF or CR; a
// first line sep=; says the divider. A row of blank cells is passed over, and nums keeps each row's number on the sheet, for a reason to name.
// { rows, nums, sep, cut: { rows, cols, cells }, open } (open: a quote that never closed, read to the end)
export function parseCsv(text, sep) {
    var s = typeof text === 'string' ? text : '', out = { rows: [], nums: [], sep: ',', cut: { rows: 0, cols: 0, cells: 0 }, open: false };
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
    var said = /^sep=(.)\r?\n/i.exec(s.slice(0, 16)), i = 0, num = 0; if (said) { i = said[0].length; num = 1; }
    out.sep = SEPS.indexOf(sep) >= 0 ? sep : said ? said[1] : sniffSep(s);
    var sc = out.sep.charCodeAt(0), n = s.length, row = [], over = 0, wide = 0;
    var cell = function(v) { if (row.length >= CSV.cols) { over++; return; } if (v.length > CSV.cell) { v = v.slice(0, CSV.cell); out.cut.cells++; } row.push(v); };
    var line = function() { num++; if (over > wide) wide = over; over = 0; if (row.some(function(c) { return c.trim() !== ''; })) { if (out.rows.length <= CSV.rows) { out.rows.push(row); out.nums.push(num); } else out.cut.rows++; } row = []; };
    while (i < n) {
        var v = '', c0 = s.charCodeAt(i);
        if (c0 === 34) {   // a quoted cell: to the quote that closes it, a doubled quote being one; anything after it, to the divider, is kept as it stands
            var from = ++i, closed = false;
            while (i < n) {
                var q = s.indexOf('"', i); if (q < 0) { v += s.slice(from); i = n; break; }
                if (s.charCodeAt(q + 1) === 34) { v += s.slice(from, q + 1); i = from = q + 2; continue; }
                v += s.slice(from, q); i = q + 1; closed = true; break;
            }
            if (!closed) out.open = true;
        }
        var st = i; while (i < n) { var c = s.charCodeAt(i); if (c === sc || c === 10 || c === 13) break; i++; }
        v += s.slice(st, i); cell(v);
        if (i >= n) { line(); break; }
        var e = s.charCodeAt(i);
        if (e === sc) { i++; if (i === n) { cell(''); line(); break; } continue; }
        i += e === 13 && s.charCodeAt(i + 1) === 10 ? 2 : 1; line();
    }
    out.cut.cols = wide;
    return out;
}
// A picked file read: what cannot be a spreadsheet is said in words the GM can act on
export function readCsv(bytes) {
    var b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
    if (b.length > CSV.bytes) return { error: 'That file is too large (' + Math.round(CSV.bytes / 1048576) + ' MB at most).' };
    if (!b.length) return { error: 'That file is empty.' };
    if ((b[0] === 0x50 && b[1] === 0x4B) || (b[0] === 0xD0 && b[1] === 0xCF)) return { error: 'That is a workbook, not a CSV file. In your spreadsheet program, save it as CSV, then pick that file.' };
    var d = csvText(b); if (d.text.slice(0, 4096).indexOf('\u0000') >= 0) return { error: 'That file does not read as a spreadsheet.' };
    var t = parseCsv(d.text); if (!t.rows.length) return { error: 'That file holds no rows.' };
    t.enc = d.enc; return t;
}
function widthOf(t) { var w = 0; t.rows.forEach(function(r) { if (r.length > w) w = r.length; }); return w; }
// The columns' names: the first row's cells, or Column 1 and on where it holds none
export function headsOf(table, hasHead) {
    var out = [], w = widthOf(table), first = table.rows[0] || [];
    for (var i = 0; i < w; i++) out.push((hasHead ? one(first[i], CSV.head) : '') || 'Column ' + (i + 1));
    return out;
}
// Whether the first row reads as headings: one that holds a figure is a row like the others
export function headLooks(table) { return !(table.rows[0] || []).some(function(c) { return readNum(c, table.sep) !== undefined; }); }
// The stats a list holds, or every item list's, each key once, as the first list spells it: a choice's options, a set's places, a number's value names
export function csvStats(sys, listId) {
    var out = [], seen = map();
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) {
        if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list) || (listId && f.id !== listId) || !Array.isArray(f.list.stats)) return;
        f.list.stats.forEach(function(s) {
            var k = isObj(s) && typeof s.key === 'string' ? s.key : ''; if (!k || seen[k.toLowerCase()]) return; seen[k.toLowerCase()] = 1;
            var o = { key: k, label: typeof s.label === 'string' && s.label ? s.label : k, kind: 'num' };
            if (s.kind === 'pick') { o.kind = 'pick'; o.opts = (Array.isArray(s.opts) ? s.opts : []).map(function(x) { return isObj(x) && typeof x.label === 'string' ? x.label : ''; }).filter(Boolean); }
            else if (s.set === true) { o.kind = 'set'; o.names = Array.isArray(s.labels) ? s.labels.slice(0, 16) : []; }
            else if (Array.isArray(s.labels) && s.labels.length) { o.kind = 'named'; o.names = s.labels.slice(); }
            out.push(o);
        });
    });
    return out;
}
// What a column may go to: what an entry holds, each with the headings that read like it, then the list's stats, each as 'st:' and its key
var FIXED = [['name', 'Name', 'name title item entry itemname entryname'], ['category', 'Category', 'category cat type kind group class'], ['desc', 'Description', 'description desc details detail text effect summary'], ['notes', 'Notes', 'notes note comment comments remarks'], ['key', 'Key', 'key shortname'], ['id', 'Id', 'id entryid itemid'], ['tags', 'Tags', 'tags tag keywords'], ['ref', 'Reference', 'reference ref source page book'], ['icon', 'Icon', 'icon emoji'], ['pic', 'Picture', 'picture pic image img art portrait photo'], ['vis', 'Who sees it', 'whoseesit visibility vis visible'], ['lvl', 'Starts at level', 'level lvl startsatlevel startlevel rank'], ['lvls', 'By level', 'bylevel levels'], ['damage', 'Damage', 'damage dmg'], ['cost', 'Cost', 'cost'], ['gmNotes', 'GM notes', 'gmnotes gmnote secret secrets']];
export function csvTargets(stats) {
    var out = FIXED.map(function(t) { return { id: t[0], label: t[1], words: t[2].split(' ') }; });
    (Array.isArray(stats) ? stats : []).forEach(function(s) { out.push({ id: 'st:' + s.key, label: 'Stat: ' + s.label, words: [norm(s.key), norm(s.label)], stat: s }); });
    return out;
}
// Each column's target by its heading, the heading whole and then without what stands in brackets after it, as Weight (lb). A stat comes first, so a
// list's own Cost is that stat and never the entry's formula; a target goes to one column, the first that reads like it
export function guessMap(heads, targets, keep) {
    var out = heads.map(function() { return ''; }), taken = map();
    (Array.isArray(keep) ? keep : []).forEach(function(id, i) { if (id && i < out.length && !taken[id] && targets.some(function(t) { return t.id === id; })) { out[i] = id; taken[id] = 1; } });
    var tryAll = function(mine, form) { heads.forEach(function(h, i) { if (out[i]) return; var n = form(h); if (!n) return; for (var k = 0; k < targets.length; k++) { var t = targets[k]; if (!!t.stat === mine && !taken[t.id] && t.words.indexOf(n) >= 0) { out[i] = t.id; taken[t.id] = 1; return; } } }); };
    var bare = function(h) { return norm(String(h).replace(/[\s]*[(\[].*$/, '')); };
    [true, false].forEach(function(mine) { tryAll(mine, norm); tryAll(mine, bare); });
    return out;
}
// A column set to a target takes it from the column that held it, so one target is read from one column
export function setTarget(mapped, i, id) { return mapped.map(function(x, k) { return k === i ? (id || '') : id && x === id ? '' : x; }); }
// The item list a file is most like: the one the most headings name a stat of, else the only one, else none
export function bestList(sys, heads) {
    var lists = (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return isObj(f) && f.kind === 'item-list' && isObj(f.list); }), best = '', top = 0;
    lists.forEach(function(f) { var ts = csvTargets(csvStats(sys, f.id)), n = guessMap(heads, ts).filter(function(x) { return x.slice(0, 3) === 'st:'; }).length; if (n > top) { top = n; best = f.id; } });
    return best || (lists.length === 1 ? lists[0].id : '');
}
// A figure as a spreadsheet writes it: a sign, a currency mark, and thousands or a decimal comma where the file's divider leaves room for one
export function readNum(cell, sep) {
    var s = String(cell == null ? '' : cell).trim().replace(/^([+-]?)[$\u20ac\u00a3\u00a5]\s*/, '$1').replace(/\s*[\u20ac\u00a3\u00a5]$/, ''); if (!s) return undefined;
    var v;
    if (/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(s)) v = Number(s);
    else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s) && sep !== ';') v = Number(s.replace(/,/g, ''));
    else if (/^[+-]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) && sep !== ',') v = Number(s.replace(/\./g, '').replace(',', '.'));
    else if (/^[+-]?\d+,\d+$/.test(s)) v = Number(s.replace(',', '.'));
    return typeof v === 'number' && isFinite(v) ? v : undefined;
}
// A stat's cell as the entry holds it: { v }, or { why } in words that end a sentence
function statCell(st, cell, sep) {
    var t = String(cell).trim(), at = function(list, w) { var low = fold(w.trim()); for (var i = 0; i < list.length; i++) if (fold(String(list[i]).trim()) === low) return i; return -1; };
    if (st.kind === 'pick') { var p = at(st.opts || [], t); return p >= 0 ? { v: st.opts[p] } : { why: 'which is not one of its choices' }; }
    var n = readNum(t, sep);
    if (st.kind === 'set') {
        if (n !== undefined) return { v: n };
        var bits = 0, bad = false; t.split(/[,;\/|+]+/).forEach(function(w) { if (!w.trim()) return; var k = at(st.names || [], w); if (k < 0) bad = true; else bits |= 1 << k; });
        return bad ? { why: 'which names a place it does not have' } : { v: bits };
    }
    if (st.kind === 'named') { if (n !== undefined) return { v: n }; var k2 = at(st.names || [], t); return k2 >= 0 ? { v: k2 } : { why: 'which is not a number or one of its names' }; }
    return n !== undefined ? { v: n } : { why: 'which is not a number' };
}
// 1.6.2 (backlog 226): a Picture cell as the path of one of the campaign's own pictures. An upload is kept as /saves/images/<folder>/<8 letters
// or digits>_<its name>, so a spreadsheet names a picture as the Image Library shows it. pics is the campaign's pictures as /api/list-images
// answers them ({ path, folder, name }); a cell is matched against them, ignoring case, in this order: the exact path (a whole path, a path under
// images or folder/name read as one), then folder/name, then the file's name, then its name with the upload's 8-character prefix taken off. The
// first of those that matches decides: one picture is the answer, two or more that are not the same file are none (why 'many'), and nothing is
// none (why 'none'). With no list (a suite, or the list could not be asked) a path is read as it stands and a bare name is refused (why 'nolist').
// Whatever is kept goes through cleanPic, so a web address, a walk or the Journal's folder is never kept. picMatch answers { pic, why }
var PIC_PREFIX = /^[a-z0-9]{8}_/i;
export function picMatch(cell, pics) {
    var t = String(cell == null ? '' : cell).trim().replace(/\\/g, '/'), no = function(w) { return { pic: '', why: w }; }; if (!t) return no('');
    if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return no('none');
    var p = t; if (/^saves\//i.test(p)) p = '/' + p; else if (/^images\//i.test(p)) p = '/saves/' + p; else if (p.charAt(0) !== '/') p = '/saves/images/' + p;
    var bare = t.indexOf('/') < 0;
    if (!Array.isArray(pics)) { if (bare) return no('nolist'); var k0 = cleanPic(p); return k0 ? { pic: k0, why: '' } : no('none'); }
    var lw = function(s) { return String(s == null ? '' : s).toLowerCase(); }, list = [], root = '/saves/images/';
    pics.forEach(function(im) {
        if (!isObj(im) || typeof im.path !== 'string') return; var k = cleanPic(im.path); if (!k) return;
        var nm = typeof im.name === 'string' && im.name ? im.name : k.slice(k.lastIndexOf('/') + 1), fd = typeof im.folder === 'string' ? im.folder : k.slice(root.length, Math.max(root.length, k.lastIndexOf('/')));
        list.push({ path: k, fn: lw((fd ? fd + '/' : '') + nm), name: lw(nm), bare: lw(nm.replace(PIC_PREFIX, '')) });
    });
    var tl = lw(t.replace(/^\/?(?:saves\/)?images\//i, '')), tests = [function(x) { return lw(x.path) === lw(p); }, function(x) { return x.fn === tl; }];
    if (bare) tests.push(function(x) { return x.name === tl; }, function(x) { return x.bare === tl; });
    for (var i = 0; i < tests.length; i++) {
        var seen = Object.create(null), hit = list.filter(tests[i]).filter(function(x) { if (seen[x.path]) return false; seen[x.path] = 1; return true; });
        if (hit.length === 1) return { pic: hit[0].path, why: '' }; if (hit.length > 1) return no('many');
    }
    return no('none');
}
export function picCell(cell, pics) { return picMatch(cell, pics).pic; }
var PIC_WHY = { none: 'which is not one of your pictures', many: 'which matches pictures in several folders, so name its folder too', nolist: 'a file name with no folder, and your pictures could not be looked up to find it' };
function visOf(cell) { var f = norm(cell); if (!f || f === 'all' || f === 'players' || f === 'everyone' || f === 'public' || f === 'playerscanseeit') return 'all'; if (f === 'gm' || f === 'gmonly' || f === 'hidden' || f === 'secret') return 'gm'; return null; }
// An entry's id from what it is, so that the same sheet read again finds the entries it made: its key, else its name and category, and for a row that
// repeats those, how many came before it
function rowId(key, name, cat, used) {
    var base = key ? 'k|' + fold(key) : 'n|' + fold(name) + '|' + fold(cat), id = 'i_' + hashText(base), n = 1;
    while (used[id]) { n++; id = 'i_' + hashText(base + '#' + n); }
    return { id: id, rep: n > 1 };
}
// The rows as entries: mapped[i] says what column i holds. opts: hasHead, cat (the category of a row with none), name (the pack's). Each row is
// cleaned as any entry is, against ctx (libCtx in the GM's view). The answer has readPackImport's shape, so packImportPlan reads it as it reads a pack
// file, with rows (how many were read), cells (those left out of rows that came in), more (reasons past LIB.reasons), repeats and needName beside it
export function csvEntries(table, mapped, stats, ctx, opts) {
    opts = isObj(opts) ? opts : {}; var hasHead = opts.hasHead !== false, rows = table.rows.slice(hasHead ? 1 : 0), nums = table.nums.slice(hasHead ? 1 : 0), sep = table.sep;
    var out = { name: one(opts.name, LIB.packName) || 'Spreadsheet', vis: 'all', entries: [], dropped: 0, reasons: [], rows: rows.length, cells: 0, more: 0, repeats: 0, needName: false };
    var col = map(), byKey = map(), why = function(r) { if (out.reasons.length < LIB.reasons) out.reasons.push(r); else out.more++; };
    (Array.isArray(mapped) ? mapped : []).forEach(function(id, i) { if (id && col[id] === undefined) col[id] = i; });
    (Array.isArray(stats) ? stats : []).forEach(function(s) { byKey[s.key] = s; });
    if (col.name === undefined) { out.needName = true; return out; }
    var used = map(), defCat = one(opts.cat, LIMITS.category), LONG = [['name', 'Name', LIMITS.itemName], ['category', 'Category', LIMITS.category], ['desc', 'Description', LIB.desc], ['notes', 'Notes', LIMITS.noteText], ['ref', 'Reference', LIB.ref], ['gmNotes', 'GM notes', LIB.gmNotes]];
    rows.forEach(function(r, ri) {
        var at = 'row ' + nums[ri] + ': ', get = function(id) { var i = col[id]; return i === undefined || r[i] === undefined ? '' : String(r[i]); }, soft = function(t) { out.cells++; why(at + t); };
        var name = get('name'); if (!name.trim()) { out.dropped++; why(at + 'it has no name'); return; }
        var raw = { name: name, category: get('category').trim() ? get('category') : defCat, icon: get('icon').trim(), notes: get('notes'), desc: get('desc'), ref: get('ref'), gmNotes: get('gmNotes'), damage: get('damage').trim(), cost: get('cost').trim() };
        LONG.forEach(function(x) { var v = String(raw[x[0]] || ''); if (v.length > x[2]) soft(x[1] + ' is longer than ' + x[2] + ' characters and was cut'); });
        var ky = get('key').trim(), kyC = ky ? cleanItemKey(ky, ctx && ctx.F) : ''; if (ky && !kyC) soft('Key reads \u201c' + one(ky, 40) + '\u201d, which is not a usable key'); if (kyC) raw.key = kyC;
        var vs = visOf(get('vis')); if (vs === null) { soft('Who sees it reads \u201c' + one(get('vis'), 40) + '\u201d, so it stays GM only'); vs = 'gm'; } raw.vis = vs;
        var lv = get('lvl').trim(); if (lv) { var ln = readNum(lv, sep); if (ln === undefined) soft('Starts at level reads \u201c' + one(lv, 40) + '\u201d, which is not a number'); else raw.lvl = ln; }
        var lvs = get('lvls'); if (lvs.trim()) { var ll = lvlsFromText(lvs); if (ll.length) raw.lvls = ll; else soft('By level holds no line such as 2: what it gives'); }
        var tg = get('tags'); if (tg.trim()) raw.tags = tg.split(/[,;|]+/).map(function(t) { return t.trim(); }).filter(Boolean);
        var pcC = get('pic'); if (pcC.trim()) { var pcM = picMatch(pcC, opts.pics); if (pcM.pic) raw.pic = pcM.pic; else soft('Picture reads \u201c' + one(pcC, 40) + '\u201d, ' + (PIC_WHY[pcM.why] || PIC_WHY.none) + ', so it has none'); }   // 1.6.2 (backlog 226): matched against opts.pics, the campaign's own pictures
        var st = {}, nSt = 0; Object.keys(col).forEach(function(id) {
            if (id.slice(0, 3) !== 'st:') return; var s = byKey[id.slice(3)], cl = r[col[id]]; if (!s || cl === undefined || !String(cl).trim()) return;
            var got = statCell(s, cl, sep); if (got.why) { soft(s.label + ' reads \u201c' + one(cl, 40) + '\u201d, ' + got.why); return; } st[s.key] = got.v; nSt++;
        });
        if (nSt) raw.stats = st;
        var idC = get('id').trim();
        if (idC && !ITEM_RE.test(idC)) soft('Id reads \u201c' + one(idC, 40) + '\u201d, which is not an id such as i_rope');
        if (idC && ITEM_RE.test(idC)) { if (used[idC]) { out.dropped++; why(at + 'its id is used by a row above'); return; } raw.id = idC; }
        else { var mk = rowId(raw.key || '', raw.name, raw.category, used); raw.id = mk.id; if (mk.rep) out.repeats++; }
        var c = cleanLibEntry(raw, ctx); if (!c) { out.dropped++; why(at + 'it could not be kept'); return; }
        if (raw.stats) Object.keys(raw.stats).forEach(function(k) { var s = byKey[k]; if (!isObj(c.stats) || !Object.keys(c.stats).some(function(x) { return x.toLowerCase() === k.toLowerCase(); })) soft((s ? s.label : k) + ' could not be held on this entry'); });
        if (raw.damage && !c.damage) soft('Damage could not be read as a formula'); if (raw.cost && !c.cost) soft('Cost could not be read as a formula');
        if (Array.isArray(raw.tags) && raw.tags.length > LIB.tags) soft('only its first ' + LIB.tags + ' tags were kept');
        used[c.id] = 1; out.entries.push(c);
    });
    return out;
}
// The rows as they will come in, for the window to draw as text: the name, the category and the stats a column goes to, from the cleaned entries
export function csvPreview(data, stats, mapped) {
    var ids = map(); (Array.isArray(mapped) ? mapped : []).forEach(function(id) { if (id && id.slice(0, 3) === 'st:') ids[id.slice(3)] = 1; });
    var sts = (Array.isArray(stats) ? stats : []).filter(function(s) { return ids[s.key]; }).slice(0, CSV.showStats);
    return { cols: ['Name', 'Category'].concat(sts.map(function(s) { return s.label; })), rows: (data && Array.isArray(data.entries) ? data.entries : []).slice(0, CSV.show).map(function(e) { return [e.name, e.category || ''].concat(sts.map(function(s) { var h = isObj(e.stats) ? e.stats : {}, k = Object.keys(h).filter(function(x) { return x.toLowerCase() === s.key.toLowerCase(); })[0]; return k === undefined ? '' : String(h[k]); })); }) };
}
// Rows a list will not offer: with a list that names categories, how many have none, and the categories it does not take. Those rows still come in
export function csvCats(sys, listId, entries) {
    var cats = map(), named = false, out = { none: 0, off: [] }, seen = map();
    (isObj(sys) && Array.isArray(sys.fields) ? sys.fields : []).forEach(function(f) { if (!isObj(f) || f.kind !== 'item-list' || !isObj(f.list) || (listId && f.id !== listId) || !Array.isArray(f.list.cats) || !f.list.cats.length) return; named = true; f.list.cats.forEach(function(c) { cats[String(c).toLowerCase()] = 1; }); });
    if (!named) return out;
    (Array.isArray(entries) ? entries : []).forEach(function(e) { var c = isObj(e) && typeof e.category === 'string' ? e.category : ''; if (!c) { out.none++; return; } var l = c.toLowerCase(); if (!cats[l] && !seen[l]) { seen[l] = 1; out.off.push(c); } });
    return out;
}
// 1.6.3 (the owner, 2026-11-16, by prompt: "Make a new table, or replace one"): a spreadsheet read as one of a system's Tables, the figures a
// formula reads by name (the System editor's Tables box, sheets.js renderTables and its tablecsv slice, which asks this and draws what it answers).
// parsed is what readCsv answered. Its first row names the columns and its first column names the rows; the cell where they meet is passed over.
// A row's or a column's name is the name the user sees; its short form (the key a formula reads) is made by opts.keyOf, the editor's own rule for a
// name's short form (sheets.js keyWord), held to the key rules the cleaner holds a table to (tableKeyOk), and made unique the way the cleaner
// judges it: a column by its key ignoring case, a row by nameFold over its key and every other row's name, so no formula finds two rows. A row's
// short form never reads as the name of ANOTHER row of the file, kept or not yet read (the review of 1.6.3: a short form given to an earlier row,
// an old one or a made one, pushed a later row with a name of its own out as a row above, so what was kept hung on the file's order); only two
// rows of one name are one too many. A name that gives no usable short form takes Column, Row or Table and the first free number. A cell is a
// figure as a spreadsheet writes one (readNum); a cell that is no figure, or one past LIMITS.statAbs, is said and left empty. What a table holds is held to LIMITS.tableCols and
// LIMITS.tableRows, and to opts.room, the figures the system's other tables leave of LIMITS.tableCells; what is cut is counted. opts.keep is the
// table a replace puts this in place of: a column or row whose name or short form reads as one of it keeps that short form (and a row its From and
// To), so a formula that read it still does. A spreadsheet holds no From and To, so where the old table read a figure by its rows' ranges, the
// rows that come in with none are counted as noRange, which the box says: a number no longer finds them. opts.taken is the short forms of the
// other tables, for a new table's. opts.label is the new table's name (the file's). The answer: { table: { key, label, cols, rows } or null, error, cutCols, cutRows, full (rows cut by opts.room), bad (cells
// left empty), dropped (rows left out), noRange (rows a replace leaves with no From and To where the old table had ranges, else 0), reasons
// (the first CSV_TABLE.says, in words that end a sentence), more, open }. Pure: nothing here draws
export var CSV_TABLE = Object.freeze({ says: 12 });
export function csvTable(parsed, opts) {
    opts = isObj(opts) ? opts : {};
    var t = isObj(parsed) && Array.isArray(parsed.rows) ? parsed : { rows: [], nums: [], cut: {} }, rows = t.rows, nums = Array.isArray(t.nums) ? t.nums : [], sep = t.sep;
    var keyOf = typeof opts.keyOf === 'function' ? opts.keyOf : function() { return ''; }, keep = isObj(opts.keep) ? opts.keep : null;
    var room = typeof opts.room === 'number' && isFinite(opts.room) ? Math.max(0, Math.floor(opts.room)) : LIMITS.tableCells;
    var out = { table: null, error: '', cutCols: isObj(t.cut) && t.cut.cols > 0 ? t.cut.cols : 0, cutRows: isObj(t.cut) && t.cut.rows > 0 ? t.cut.rows : 0, full: false, bad: 0, dropped: 0, noRange: 0, reasons: [], more: 0, open: t.open === true };
    var why = function(r) { if (out.reasons.length < CSV_TABLE.says) out.reasons.push(r); else out.more++; }, lineOf = function(i) { return 'Line ' + (nums[i] || i + 1); };
    if (rows.length < 2) { out.error = rows.length ? 'That file holds its first row and nothing under it.' : 'That file holds no rows.'; return out; }
    var lowerK = function(k) { return String(k).toLowerCase(); };
    // a short form: the old table's where the name reads as one of its, else keyOf's, else word and a number; never one taken, never one avoid
    // turns down (a row's: another row's name in the file), never past its length
    var mkKey = function(name, re, len, taken, fold, old, word, avoid) {
        var no = function(k) { return typeof avoid === 'function' && avoid(k); };
        var f = nameFold(name), o = f && old ? old[f] : ''; if (o && tableKeyOk(o, re) && !taken[fold(o)] && !no(o)) return o;
        var base = tableKeyOk(String(keyOf(name) || '').slice(0, len), re), k = base, n = 2;
        if (!base) { base = word; k = ''; n = 1; }
        while (!k || !tableKeyOk(k, re) || taken[fold(k)] || no(k)) { var tail = String(n++); k = base.slice(0, len - tail.length) + tail; }
        return k;
    };
    var oldOf = function(list, rowLike) { var m = map(); (Array.isArray(list) ? list : []).forEach(function(x) { if (!isObj(x) || typeof x.key !== 'string') return; [x.label, x.key].forEach(function(w) { var f = nameFold(typeof w === 'string' ? w : ''); if (f && !(f in m)) m[f] = rowLike ? x : x.key; }); }); return m; };
    var oldC = keep ? oldOf(keep.cols, false) : null, oldRows = keep ? oldOf(keep.rows, true) : null, oldR = map(); if (oldRows) Object.keys(oldRows).forEach(function(f) { oldR[f] = oldRows[f].key; });
    var head = rows[0], width = widthOf(t), body = rows.slice(1), cols = [], at = [], cTaken = map();
    for (var j = 1; j < width; j++) {
        var cn = one(head[j], LIMITS.label), holds = body.some(function(r) { return r[j] !== undefined && String(r[j]).trim() !== ''; });
        if (!cn && !holds) continue;   // an empty column a spreadsheet program leaves at the end of a row
        if (cols.length >= LIMITS.tableCols) { out.cutCols++; continue; }
        var label = cn || 'Column ' + (j + 1), ck = mkKey(label, TABLE_KEY, 24, cTaken, lowerK, oldC, 'Column');
        cTaken[lowerK(ck)] = 1; cols.push({ key: ck, label: label }); at.push(j);
    }
    if (!cols.length) { out.error = 'That file holds no column of figures after its first, which names the rows.'; return out; }
    var tRows = [], rTaken = map(), most = Math.min(LIMITS.tableRows, Math.floor(room / cols.length)), names = map();
    body.forEach(function(r) { var nf = nameFold(one(r[0], LIMITS.label)); if (nf) names[nf] = 1; });   // every row's name in the file, before any short form is made
    body.forEach(function(r, bi) {
        var name = one(r[0], LIMITS.label), line = lineOf(bi + 1), f = nameFold(name);
        if (!name) { out.dropped++; why(line + ' has no name in its first column, so it was left out.'); return; }
        if (f && rTaken[f]) { out.dropped++; why(line + ', \u201c' + one(name, 40) + '\u201d, reads as a row above, so it was left out.'); return; }
        if (tRows.length >= most) { out.cutRows++; if (tRows.length < LIMITS.tableRows) out.full = true; return; }
        var rk = mkKey(name, TABLE_ROW_KEY, 40, rTaken, nameFold, oldR, 'Row', function(k) { var kf = nameFold(k); return !!names[kf] && kf !== f; }), vals = {}, ro = { key: rk, label: name, vals: vals };
        at.forEach(function(j2, ci) {
            var s = r[j2] === undefined || r[j2] === null ? '' : String(r[j2]).trim(); if (!s) return;
            var v = readNum(s, sep), where = line + ', ' + cols[ci].label + ': \u201c' + one(s, 40) + '\u201d ';
            if (v === undefined) { out.bad++; why(where + 'is no number, so it is left empty.'); return; }
            if (Math.abs(v) > LIMITS.statAbs) { out.bad++; why(where + 'is larger than a table holds, so it is left empty.'); return; }
            vals[cols[ci].key] = v;
        });
        var was = oldRows && oldRows[nameFold(rk)]; if (was && was.key === rk && typeof was.lo === 'number') { ro.lo = was.lo; if (typeof was.hi === 'number') ro.hi = was.hi; }   // a row that keeps its short form keeps its From and To
        rTaken[f || nameFold(rk)] = 1; rTaken[nameFold(rk)] = 1; tRows.push(ro);
    });
    if (keep && Array.isArray(keep.rows) && keep.rows.some(function(x) { return isObj(x) && typeof x.lo === 'number'; })) out.noRange = tRows.filter(function(x) { return typeof x.lo !== 'number'; }).length;
    if (!tRows.length) { out.error = out.full ? 'The system\u2019s tables hold ' + LIMITS.tableCells + ' figures in all, and there is no room left for these.' : 'That file holds no row with a name in its first column.'; return out; }
    var tLabel = one(opts.label, LIMITS.label) || 'Table', tTaken = map(); (Array.isArray(opts.taken) ? opts.taken : []).forEach(function(k) { if (typeof k === 'string') tTaken[lowerK(k)] = 1; });
    var tKey = keep && tableKeyOk(keep.key, TABLE_KEY) ? keep.key : mkKey(tLabel, TABLE_KEY, 24, tTaken, lowerK, null, 'Table');
    out.table = { key: tKey, label: keep && typeof keep.label === 'string' && keep.label ? keep.label : tLabel, cols: cols, rows: tRows };
    return out;
}
