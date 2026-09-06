// Minimal ZIP support for export bundles: writes store-only archives (images
// are already compressed, so deflate would buy nothing) and reads both store
// and deflate entries (deflate via DecompressionStream when available).

var CRC_TABLE = (function() {
    var t = new Int32Array(256);
    for (var n = 0; n < 256; n++) {
        var c = n;
        for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c;
    }
    return t;
})();

function crc32(u8) {
    var c = -1;
    for (var i = 0; i < u8.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ u8[i]) & 0xFF];
    return (c ^ -1) >>> 0;
}

// entries: [{ name: 'path/in/zip', data: Uint8Array }] -> Blob
function zipCreate(entries) {
    var enc = new TextEncoder();
    var parts = [], central = [], offset = 0;
    entries.forEach(function(e) {
        var name = enc.encode(e.name), data = e.data, crc = crc32(data);
        var lh = new DataView(new ArrayBuffer(30));
        lh.setUint32(0, 0x04034b50, true);
        lh.setUint16(4, 20, true);        // version needed
        lh.setUint16(6, 0x0800, true);    // UTF-8 names
        lh.setUint16(8, 0, true);         // method: store
        lh.setUint32(14, crc, true);
        lh.setUint32(18, data.length, true);
        lh.setUint32(22, data.length, true);
        lh.setUint16(26, name.length, true);
        parts.push(lh.buffer, name, data);

        var ch = new DataView(new ArrayBuffer(46));
        ch.setUint32(0, 0x02014b50, true);
        ch.setUint16(4, 20, true);
        ch.setUint16(6, 20, true);
        ch.setUint16(8, 0x0800, true);
        ch.setUint16(10, 0, true);
        ch.setUint32(16, crc, true);
        ch.setUint32(20, data.length, true);
        ch.setUint32(24, data.length, true);
        ch.setUint16(28, name.length, true);
        ch.setUint32(42, offset, true);
        central.push(ch.buffer, name);

        offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function(n, b) { return n + (b.byteLength || b.length); }, 0);
    var eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(8, entries.length, true);
    eocd.setUint16(10, entries.length, true);
    eocd.setUint32(12, cdSize, true);
    eocd.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [eocd.buffer]), { type: 'application/zip' });
}

// ArrayBuffer -> Promise<[{ name, data: Uint8Array }]>, directories skipped
async function zipRead(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf);
    var i = u8.length - 22;
    while (i >= 0 && dv.getUint32(i, true) !== 0x06054b50) i--;
    if (i < 0) throw new Error('not a zip file');
    var count = dv.getUint16(i + 10, true), p = dv.getUint32(i + 16, true);
    var dec = new TextDecoder(), out = [];
    for (var n = 0; n < count; n++) {
        if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('corrupt zip');
        var method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true),
            nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true),
            lofs = dv.getUint32(p + 42, true);
        var name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
        var lnlen = dv.getUint16(lofs + 26, true), lelen = dv.getUint16(lofs + 28, true);
        var start = lofs + 30 + lnlen + lelen;
        var data = u8.slice(start, start + csize);
        if (method === 8) {
            if (typeof DecompressionStream === 'undefined') throw new Error('compressed zip not supported here');
            data = new Uint8Array(await new Response(
                new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
            ).arrayBuffer());
        } else if (method !== 0) {
            throw new Error('unsupported zip compression (method ' + method + ')');
        }
        if (!name.endsWith('/')) out.push({ name: name, data: data });
        p += 46 + nlen + elen + clen;
    }
    return out;
}

export { zipCreate, zipRead };
