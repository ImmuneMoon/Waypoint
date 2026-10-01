// ZIP support for export bundles. Writes store-only archives (images and videos are already compressed, so deflate would buy
// nothing) and reads both store and deflate entries (deflate via DecompressionStream when available).
//
// Any size (1.5.0, item 21): an entry may be a Blob (a file on disk, never read whole into memory) and the archive is a Blob of
// its parts. Sizes and offsets past 4 GB and more than 65,535 entries are written as ZIP64 records, and only then: a small
// archive is byte for byte what the writer always made. The writer refuses, rather than write a wrong number, a size it cannot
// state exactly. A window can hold only so large a Blob, so zipWrite writes the same archive, byte for byte, straight to a file.
// The reader takes a File (or any Blob, or an ArrayBuffer): it finds the end record in the file's tail, follows the ZIP64
// locator, reads the central directory by slice and hands a stored entry on as a slice of the file; every offset and size is
// checked to lie inside the file, and an entry's CRC-32 is checked in chunks before it is used.

var CRC_TABLE = (function() {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

// CRC-32, in pieces: crcUpdate(-1, a) then crcUpdate(that, b) …, and crcDone() at the end
function crcUpdate(c, u8) {
    for (var i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ u8[i]) & 0xFF];
    return c;
}
function crcDone(c) { return (c ^ -1) >>> 0; }
function crc32(u8) { return crcDone(crcUpdate(-1, u8)); }

var CHUNK = 8 * 1024 * 1024;     // a Blob is read 8 MB at a time
var U32 = 0xFFFFFFFF, U16 = 0xFFFF;
var MAX_SAFE = 9007199254740991; // 2^53 - 1: past it a JS number no longer states a size exactly
var MAX_CD = 128 * 1024 * 1024;  // a central directory larger than this is not read
var MAX_ENTRIES = 500000;        // nor an archive that lists more files than this (each costs memory to list)
var READ_WHOLE = 512 * 1024 * 1024;   // zipRead holds every entry at once: past this much (by the sizes the archive states) it refuses

// A Blob, a File, or anything that reads like one (a size, slice() and arrayBuffer()): the checks hand the reader a file larger than they hold
function isBlob(v) { return !!v && typeof v === 'object' && typeof v.size === 'number' && typeof v.slice === 'function' && typeof v.arrayBuffer === 'function'; }
function sizeOf(data) { return isBlob(data) ? data.size : data.length; }
function exact(n) { return typeof n === 'number' && isFinite(n) && n >= 0 && Math.floor(n) === n && n <= MAX_SAFE; }

// A Blob's CRC-32, read in chunks (memory stays at one chunk); onBytes(n) after each chunk, for a progress line
async function blobCrc32(blob, onBytes) {
    var c = -1;
    for (var at = 0; at < blob.size; at += CHUNK) {
        var u8 = new Uint8Array(await blob.slice(at, Math.min(blob.size, at + CHUNK)).arrayBuffer());
        c = crcUpdate(c, u8);
        if (onBytes) onBytes(u8.length);
    }
    return crcDone(c);
}

function put64(dv, at, n) { dv.setUint32(at, n % 4294967296, true); dv.setUint32(at + 4, Math.floor(n / 4294967296), true); }
function get64(dv, at) {
    var lo = dv.getUint32(at, true), hi = dv.getUint32(at + 4, true);
    if (hi > 0x1FFFFF) throw new Error('corrupt zip (a size past what this app can count)');
    return hi * 4294967296 + lo;
}

/* ---- the archive's records, the same for both writers ---- */
// An entry's local header: [the 30 fixed bytes, the ZIP64 extra or null]; the name goes between them. The extra (both sizes, as the
// format asks of a local header) is there only when the size does not fit 32 bits
function localRecord(nameLen, size, crc) {
    var big = size >= U32, lx = big ? 20 : 0;
    var lh = new DataView(new ArrayBuffer(30 + lx));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, big ? 45 : 20, true);   // version needed
    lh.setUint16(6, 0x0800, true);    // UTF-8 names
    lh.setUint16(8, 0, true);         // method: store
    lh.setUint32(14, crc, true);
    lh.setUint32(18, big ? U32 : size, true);
    lh.setUint32(22, big ? U32 : size, true);
    lh.setUint16(26, nameLen, true);
    lh.setUint16(28, lx, true);
    if (big) { lh.setUint16(30, 0x0001, true); lh.setUint16(32, 16, true); put64(lh, 34, size); put64(lh, 42, size); }
    return big ? [lh.buffer.slice(0, 30), lh.buffer.slice(30)] : [lh.buffer, null];
}
// An entry's central header: [the 46 fixed bytes, the ZIP64 extra or null]; the name goes between them. The extra holds the sizes,
// then the offset, each only when its field overflowed
function centralRecord(nameLen, size, crc, offset) {
    var big = size >= U32, far = offset >= U32;
    var cx = (big ? 16 : 0) + (far ? 8 : 0); if (cx) cx += 4;
    var ch = new DataView(new ArrayBuffer(46 + cx));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, cx ? 45 : 20, true);
    ch.setUint16(6, cx ? 45 : 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, big ? U32 : size, true);
    ch.setUint32(24, big ? U32 : size, true);
    ch.setUint16(28, nameLen, true);
    ch.setUint16(30, cx, true);
    ch.setUint32(42, far ? U32 : offset, true);
    if (!cx) return [ch.buffer, null];
    var q = 46; ch.setUint16(q, 0x0001, true); ch.setUint16(q + 2, cx - 4, true); q += 4;
    if (big) { put64(ch, q, size); put64(ch, q + 8, size); q += 16; }
    if (far) put64(ch, q, offset);
    return [ch.buffer.slice(0, 46), ch.buffer.slice(46)];
}
// The end of the archive: the ZIP64 end record and its locator when the count, the directory's size or its offset needs them, then
// the classic end record
function tailRecords(count, cdSize, cdAt) {
    var tail = [];
    if (count > 0xFFFE || cdSize >= U32 || cdAt >= U32) {
        var e64 = new DataView(new ArrayBuffer(56));
        e64.setUint32(0, 0x06064b50, true);
        put64(e64, 4, 44);                // the size of what follows in this record
        e64.setUint16(12, 45, true); e64.setUint16(14, 45, true);
        put64(e64, 24, count); put64(e64, 32, count);
        put64(e64, 40, cdSize); put64(e64, 48, cdAt);
        var loc = new DataView(new ArrayBuffer(20));
        loc.setUint32(0, 0x07064b50, true);
        put64(loc, 8, cdAt + cdSize);   // where the ZIP64 end record starts
        loc.setUint32(16, 1, true);
        tail.push(e64.buffer, loc.buffer);
    }
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, Math.min(count, U16), true);
    eocd.setUint16(10, Math.min(count, U16), true);
    eocd.setUint32(12, Math.min(cdSize, U32), true);
    eocd.setUint32(16, Math.min(cdAt, U32), true);
    tail.push(eocd.buffer);
    return tail;
}
function lenOf(parts) { return parts.reduce(function(n, b) { return n + (b.byteLength !== undefined ? b.byteLength : b.length); }, 0); }
function nameOfEntry(enc, e) {
    var name = enc.encode(e.name);
    if (name.length > U16) throw new Error('zip: a name is too long (' + e.name.slice(0, 60) + '…)');
    return name;
}

// entries: [{ name: 'path/in/zip', data: Uint8Array | Blob, crc?: number }] -> Blob. A Blob entry needs its crc (blobCrc32);
// a Uint8Array's is worked out here. opts.asParts: the archive's records in order and its size, { parts, size }, instead of a
// Blob of them (the checks pin the records of an archive larger than they hold).
function zipCreate(entries, opts) {
    var enc = new TextEncoder();
    var asParts = !!(opts && opts.asParts === true);
    var parts = [], central = [], offset = 0;
    entries.forEach(function(e) {
        var name = nameOfEntry(enc, e), data = e.data, size = data ? sizeOf(data) : NaN;
        if (!exact(size) || !exact(offset + 30 + name.length + 20 + size)) throw new Error('zip: a size cannot be written exactly (' + e.name.slice(0, 60) + ')');
        var crc;
        if (isBlob(data)) { if (!(typeof e.crc === 'number' && e.crc >= 0 && e.crc <= U32 && Math.floor(e.crc) === e.crc)) throw new Error('zip: a file entry needs its checksum (' + e.name.slice(0, 60) + ')'); crc = e.crc; }
        else crc = crc32(data);
        var lr = localRecord(name.length, size, crc), cr = centralRecord(name.length, size, crc, offset);
        // header, name, extra, data — the extra follows the name
        if (lr[1]) parts.push(lr[0], name, lr[1], data); else parts.push(lr[0], name, data);
        if (cr[1]) central.push(cr[0], name, cr[1]); else central.push(cr[0], name);
        offset += 30 + name.length + (lr[1] ? lr[1].byteLength : 0) + size;
    });
    var cdSize = lenOf(central);
    if (!exact(offset + cdSize + 98)) throw new Error('zip: the archive is too large to write exactly');
    var tail = tailRecords(entries.length, cdSize, offset);
    var all = parts.concat(central, tail), want = offset + cdSize + lenOf(tail);
    if (asParts) return { parts: all, size: want };
    var blob = new Blob(all, { type: 'application/zip' });
    if (blob.size !== want) throw new Error('zip: the archive came out at ' + blob.size + ' bytes, not the ' + want + ' it counted');
    return blob;
}

// The same archive written straight to a file, never held whole: sink.write(position, bytes) and sink.truncate(size), each a promise.
// entries: [{ name, size, pull }] or [{ name, open }] where open() resolves to { size, pull } or null (a file that is not there).
// pull(emit) hands the entry's bytes to emit(Uint8Array) in order, awaiting each; the CRC-32 is worked out as they pass and written
// back into the local header. An entry that is not there, whose bytes do not come to the size it stated or whose pull fails is left
// out whole (the next entry is written over what it left) and named in skipped; a write the file refuses ends the archive (it throws).
// onBytes(n) after each piece, for a progress line. Resolves { size, count, skipped }. Byte for byte what zipCreate makes of the same entries.
async function zipWrite(sink, entries, onBytes) {
    var enc = new TextEncoder(), central = [], offset = 0, count = 0, skipped = [];
    var put = async function(pos, data) {
        try { await sink.write(pos, data); }
        catch (er) { var f = new Error('zip: the file could not be written (' + (er && er.message || er) + ')'); f.zipFatal = true; throw f; }
    };
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i], name = nameOfEntry(enc, e), src = null;
        try { src = typeof e.open === 'function' ? await e.open() : e; } catch (er0) { src = null; }
        if (!src || typeof src.pull !== 'function') { skipped.push(e.name); continue; }
        var size = src.size, at = offset;
        if (!exact(size) || !exact(at + 30 + name.length + 20 + size)) throw new Error('zip: a size cannot be written exactly (' + e.name.slice(0, 60) + ')');
        var lr = localRecord(name.length, size, 0), hlen = 30 + name.length + (lr[1] ? lr[1].byteLength : 0);
        await put(at, lr[0]); await put(at + 30, name); if (lr[1]) await put(at + 30 + name.length, lr[1]);
        var st = { c: -1, got: 0 }, ok = true;
        try {
            await src.pull((function(st, at, hlen, size) { return async function(u8) {
                if (st.got + u8.length > size) throw new Error('more bytes than the entry stated');
                await put(at + hlen + st.got, u8); st.c = crcUpdate(st.c, u8); st.got += u8.length;
                if (onBytes) onBytes(u8.length);
            }; })(st, at, hlen, size));
            if (st.got !== size) throw new Error('fewer bytes than the entry stated');
        } catch (er1) { if (er1 && er1.zipFatal) throw er1; ok = false; }
        if (!ok) { skipped.push(e.name); continue; }   // the offset stays: the next entry is written over what this one left
        var crc = crcDone(st.c), cb = new DataView(new ArrayBuffer(4)); cb.setUint32(0, crc, true);
        await put(at + 14, cb.buffer);   // the checksum, now that every byte has passed
        var cr = centralRecord(name.length, size, crc, at);
        if (cr[1]) central.push(cr[0], name, cr[1]); else central.push(cr[0], name);
        count++; offset += hlen + size;
    }
    var cdSize = lenOf(central);
    if (!exact(offset + cdSize + 98)) throw new Error('zip: the archive is too large to write exactly');
    var tail = tailRecords(count, cdSize, offset), pos = offset, rest = central.concat(tail);
    for (var k = 0; k < rest.length; k++) { await put(pos, rest[k]); pos += rest[k].byteLength !== undefined ? rest[k].byteLength : rest[k].length; }
    try { await sink.truncate(pos); } catch (er2) { var f2 = new Error('zip: the file could not be written (' + (er2 && er2.message || er2) + ')'); f2.zipFatal = true; throw f2; }   // nothing of a left-out entry stays behind the end
    return { size: pos, count: count, skipped: skipped };
}

async function bytesOf(blob, from, to) {
    if (from < 0 || to > blob.size || to < from) throw new Error('corrupt zip (a record lies outside the file)');
    return new DataView(await blob.slice(from, to).arrayBuffer());
}

// A zip, opened without reading it whole: File | Blob | ArrayBuffer -> { entries: [{ name, size, csize, method, crc, blob(), bytes(), check() }] },
// directories skipped. blob(): the entry's bytes as a Blob — a slice of the file for a stored entry, inflated for a deflated one;
// bytes(): the same as a Uint8Array; check(): the Blob, after its CRC-32 was found to be the one the archive states (else it throws).
async function zipOpen(src) {
    var file = isBlob(src) ? src : new Blob([src]);
    var size = file.size;
    if (size < 22) throw new Error('not a zip file');
    var tailFrom = Math.max(0, size - 22 - U16), tail = await bytesOf(file, tailFrom, size);
    // the end record: its signature, and a comment that runs exactly to the file's end (a signature inside a comment is not one); only
    // when there is none, one with bytes after it (an archive some tool added a line to)
    var endRecord = function(exactFit) {
        var k = tail.byteLength - 22;
        while (k >= 0 && !(tail.getUint32(k, true) === 0x06054b50 && (exactFit ? k + 22 + tail.getUint16(k + 20, true) === tail.byteLength : k + 22 + tail.getUint16(k + 20, true) <= tail.byteLength))) k--;
        return k;
    };
    var i = endRecord(true); if (i < 0) i = endRecord(false);
    if (i < 0) throw new Error('not a zip file');
    var count = tail.getUint16(i + 10, true), cdSize = tail.getUint32(i + 12, true), cdAt = tail.getUint32(i + 16, true);
    var endAt = tailFrom + i, classicFull = false;
    if (count === U16 || cdSize === U32 || cdAt === U32) {   // ZIP64: the locator sits right before the end record
        var loc = endAt >= 20 ? await bytesOf(file, endAt - 20, endAt) : null;
        if (loc && loc.getUint32(0, true) === 0x07064b50) {
            var e64At = get64(loc, 8), e64 = await bytesOf(file, e64At, e64At + 56);
            if (e64.getUint32(0, true) !== 0x06064b50) throw new Error('corrupt zip (its large-file record is damaged)');
            count = get64(e64, 32); cdSize = get64(e64, 40); cdAt = get64(e64, 48);
            endAt = e64At;
        } else if (cdSize === U32 || cdAt === U32) throw new Error('corrupt zip (its large-file record is missing)');
        else classicFull = true;   // exactly 65,535 files is a count a classic archive may state: its list must then end exactly where it says (else files are missing)
    }
    if (cdAt + cdSize > endAt || cdSize > MAX_CD || count > cdSize / 46) throw new Error('corrupt zip (its list of files lies outside the file)');
    if (count > MAX_ENTRIES) throw new Error('zip: too many files to list (' + count + ')');
    var cd = await bytesOf(file, cdAt, cdAt + cdSize), u8 = new Uint8Array(cd.buffer), dec = new TextDecoder();
    var out = [], p = 0;
    for (var n = 0; n < count; n++) {
        if (p + 46 > cdSize || cd.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip');
        var flags = cd.getUint16(p + 8, true), method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true),
            csize = cd.getUint32(p + 20, true), usize = cd.getUint32(p + 24, true),
            nlen = cd.getUint16(p + 28, true), elen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true),
            lofs = cd.getUint32(p + 42, true);
        if (p + 46 + nlen + elen + clen > cdSize) throw new Error('corrupt zip');
        var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
        // the ZIP64 extra holds, in this order, only the fields that overflowed: size, compressed size, offset
        var x = p + 46 + nlen, xEnd = x + elen;
        while (x + 4 <= xEnd) {
            var id = cd.getUint16(x, true), len = cd.getUint16(x + 2, true), q = x + 4;
            if (q + len > xEnd) throw new Error('corrupt zip');
            if (id === 0x0001) {
                if (usize === U32) { if (q + 8 > x + 4 + len) throw new Error('corrupt zip'); usize = get64(cd, q); q += 8; }
                if (csize === U32) { if (q + 8 > x + 4 + len) throw new Error('corrupt zip'); csize = get64(cd, q); q += 8; }
                if (lofs === U32) { if (q + 8 > x + 4 + len) throw new Error('corrupt zip'); lofs = get64(cd, q); q += 8; }
            }
            x += 4 + len;
        }
        if (lofs + 30 > cdAt || csize > cdAt) throw new Error('corrupt zip (a file lies outside the archive)');
        if (!name.endsWith('/')) out.push(entryOf(file, { name: name, flags: flags, method: method, crc: crc, csize: csize, size: usize, lofs: lofs, cdAt: cdAt }));
        p += 46 + nlen + elen + clen;
    }
    if (classicFull && p !== cdSize) throw new Error('corrupt zip (its large-file record is missing)');
    return { entries: out, size: size };
}

function entryOf(file, m) {
    var raw = null;
    async function stored() {   // the entry's bytes as they lie in the file (still deflated, for a deflated entry)
        if (raw) return raw;
        var lh = await bytesOf(file, m.lofs, m.lofs + 30);
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('corrupt zip (' + m.name.slice(0, 60) + ')');
        var start = m.lofs + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        if (start + m.csize > m.cdAt) throw new Error('corrupt zip (a file lies outside the archive: ' + m.name.slice(0, 60) + ')');
        raw = file.slice(start, start + m.csize);
        return raw;
    }
    async function blob() {
        if (m.flags & 1) throw new Error('an encrypted zip entry cannot be read (' + m.name.slice(0, 60) + ')');
        var s = await stored();
        if (m.method === 0) { if (m.size !== m.csize) throw new Error('corrupt zip (' + m.name.slice(0, 60) + ')'); return s; }
        if (m.method !== 8) throw new Error('unsupported zip compression (method ' + m.method + ')');
        if (typeof DecompressionStream === 'undefined') throw new Error('compressed zip not supported here');
        // inflated only as far as the size the archive states: an entry that grows past it is refused there, not when the disk is full
        var seen = 0, limit = m.size, label = m.name.slice(0, 60);
        var guard = new TransformStream({ transform: function(chunk, ctl) { seen += chunk.byteLength; if (seen > limit) ctl.error(new Error('corrupt zip (a file inflates past the size the archive states: ' + label + ')')); else ctl.enqueue(chunk); } });
        return await new Response(s.stream().pipeThrough(new DecompressionStream('deflate-raw')).pipeThrough(guard)).blob();
    }
    async function check(onBytes) {
        var b = await blob();
        if (b.size !== m.size) throw new Error('corrupt zip (a file is not the size the archive states: ' + m.name.slice(0, 60) + ')');
        if (await blobCrc32(b, onBytes) !== m.crc) throw new Error('corrupt zip (a file failed its checksum: ' + m.name.slice(0, 60) + ')');
        return b;
    }
    return { name: m.name, size: m.size, csize: m.csize, method: m.method, crc: m.crc, blob: blob, check: check,
        bytes: async function() { return new Uint8Array(await (await check()).arrayBuffer()); } };
}

// ArrayBuffer | Blob -> Promise<[{ name, data: Uint8Array }]>, directories skipped: a small archive read whole (each entry's
// checksum checked). It refuses, before reading any entry, an archive whose entries come to more than maxBytes (512 MB) by the sizes
// it states: a large one is opened with zipOpen and read entry by entry.
async function zipRead(buf, maxBytes) {
    var z = await zipOpen(buf), out = [], sum = 0, cap = typeof maxBytes === 'number' && maxBytes >= 0 ? maxBytes : READ_WHOLE;
    for (var s = 0; s < z.entries.length; s++) { sum += z.entries[s].size; if (sum > cap) throw new Error('zip: too large to read whole'); }
    for (var i = 0; i < z.entries.length; i++) out.push({ name: z.entries[i].name, data: await z.entries[i].bytes() });
    return out;
}

export { zipCreate, zipWrite, zipRead, zipOpen, blobCrc32, crc32, crcUpdate, crcDone };
