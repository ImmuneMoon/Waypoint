/* Offline check of the export bundle's archive code (system/app/scripts/zip.js): the writer — a small archive byte for byte what
   it always was, ZIP64 records only when a size, an offset or the count needs them, a file entry by its own checksum, a size it
   cannot state exactly refused — and the reader, which opens a file without reading it whole: the end record found in the tail,
   the ZIP64 locator followed, every offset and size checked to lie inside the file, an entry's checksum checked before it is
   used. Archives larger than the suite holds are pinned by their records (a file-like with a hole where the bytes would be).
   Usage: node tools/zipcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs'), zlib = require('zlib'), crypto = require('crypto');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 500) : ''); } }
const throws = async fn => { try { await fn(); return ''; } catch (e) { return String(e && e.message || e); } };

let summed = false;   // a check that never settles would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let Z = null, err = null;
    try { Z = await import(url('zip.js')); } catch (e) { err = e; }
    check('zip.js loads in Node with no window', !!Z && !err, err && err.message);
    if (!Z) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const enc = new TextEncoder(), dec = new TextDecoder();
    const bytes = async b => new Uint8Array(await b.arrayBuffer());
    const sha = u8 => crypto.createHash('sha256').update(u8).digest('hex');
    const pattern = n => { const b = new Uint8Array(n); for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) & 255; return b; };
    const small = () => [{ name: 'data.json', data: enc.encode('{"a":1,"b":"é☃"}') }, { name: 'images/map 1/pic (1).png', data: pattern(70000) }, { name: 'images/video/c/Überfahrt.webm', data: new Uint8Array(0) }, { name: 'library/l_abcdefgh/p_x.3.json', data: enc.encode('[]') }];

    /* ---- the writer: a small archive is what it always was ---- */
    const smallZip = await bytes(Z.zipCreate(small()));
    check('a small archive is byte for byte what the writer made before it learned large files (the same 70,531 bytes, by their SHA-256): no ZIP64 record, version 20 throughout',
        smallZip.length === 70531 && sha(smallZip) === 'f5e4d4b359e1da9a43022f6a16ba985892a83a0cb2da7515c162735e715abc75', [smallZip.length, sha(smallZip)]);
    check('CRC-32 is the standard one, the same in one piece or in chunks of a Blob', Z.crc32(enc.encode('123456789')) === 0xCBF43926 && Z.crc32(new Uint8Array(0)) === 0
        && await Z.blobCrc32(new Blob([enc.encode('1234'), enc.encode('56789')])) === 0xCBF43926 && await Z.blobCrc32(new Blob([])) === 0);
    const nine = pattern(9 * 1024 * 1024 + 123); let seen = 0;
    check('a Blob larger than one chunk (8 MB) gives the same CRC-32 as its bytes read whole, the progress adding up to its size', await Z.blobCrc32(new Blob([nine]), n => { seen += n; }) === Z.crc32(nine) && seen === nine.length, seen);

    /* ---- a round trip, bytes and file entries alike ---- */
    const fileBytes = pattern(300000), fileBlob = new Blob([fileBytes]);
    const mixed = [{ name: 'data.json', data: enc.encode('{}') }, { name: 'images/video/c/clip.webm', data: fileBlob, crc: await Z.blobCrc32(fileBlob) }, { name: 'images/a/empty.png', data: new Blob([]), crc: 0 }, { name: 'images/dir/', data: new Uint8Array(0) }];
    const mixedZip = Z.zipCreate(mixed), opened = await Z.zipOpen(mixedZip), back = await Z.zipRead(await mixedZip.arrayBuffer());
    const e1 = opened.entries[1], sl = await e1.blob();
    check('a round trip: bytes and file entries (a Blob with its checksum) come back by name with their sizes and bytes; a directory entry is skipped; a stored entry is handed on as a slice of the file itself, and check() passes it on only with its checksum right',
        j(opened.entries.map(e => [e.name, e.size, e.method])) === j([['data.json', 2, 0], ['images/video/c/clip.webm', 300000, 0], ['images/a/empty.png', 0, 0]]) && sl.size === 300000 && sha(await bytes(sl)) === sha(fileBytes) && sha(await bytes(await e1.check())) === sha(fileBytes)
        && j(back.map(e => [e.name, e.data.length])) === j([['data.json', 2], ['images/video/c/clip.webm', 300000], ['images/a/empty.png', 0]]) && dec.decode(back[0].data) === '{}' && opened.size === mixedZip.size, j(opened.entries.map(e => [e.name, e.size])));
    check('the writer refuses what it cannot state: a file entry with no checksum (or one that is no 32-bit number), a size that is no whole number of bytes, a name past 65,535 bytes, an entry with no data',
        /checksum/.test(await throws(() => Z.zipCreate([{ name: 'a', data: fileBlob }]))) && /checksum/.test(await throws(() => Z.zipCreate([{ name: 'a', data: fileBlob, crc: -1 }]))) && /checksum/.test(await throws(() => Z.zipCreate([{ name: 'a', data: fileBlob, crc: 1.5 }]))) && /checksum/.test(await throws(() => Z.zipCreate([{ name: 'a', data: fileBlob, crc: 4294967296 }])))
        && /exactly/.test(await throws(() => Z.zipCreate([{ name: 'a', data: { size: 1.5, slice() {}, arrayBuffer() {} }, crc: 0 }]))) && /exactly/.test(await throws(() => Z.zipCreate([{ name: 'a', data: { size: -1, slice() {}, arrayBuffer() {} }, crc: 0 }]))) && /exactly/.test(await throws(() => Z.zipCreate([{ name: 'a', data: { size: 2 ** 53, slice() {}, arrayBuffer() {} }, crc: 0 }])))
        && /exactly/.test(await throws(() => Z.zipCreate([{ name: 'a' }]))) && /too long/.test(await throws(() => Z.zipCreate([{ name: 'x'.repeat(65536), data: new Uint8Array(1) }]))));
    // a window whose Blob comes out another size than its parts (it dropped one): the writer says so, it hands no archive on
    const RealBlob = globalThis.Blob; let wrongSize = '';
    try { globalThis.Blob = function(parts, o) { return new RealBlob(parts.slice(0, -1), o); }; wrongSize = await throws(() => Z.zipCreate([{ name: 'a', data: new Uint8Array(5) }])); } finally { globalThis.Blob = RealBlob; }
    check('the finished archive is compared with the size the writer counted: a Blob that came out another size is refused, never handed on', /came out at \d+ bytes, not the \d+ it counted/.test(wrongSize), wrongSize);

    /* ---- past 4 GB: the records, pinned on a file the suite does not hold ---- */
    // a file-like made of the writer's own records, with a hole (zeros, never allocated whole) where a huge entry's bytes would be
    const hole = size => ({ size, hole: true, slice() { return this; }, arrayBuffer: async () => { throw new Error('a hole is not read'); } });
    const virtual = parts => {
        const segs = []; let at = 0;
        parts.forEach(p => { const len = p.hole ? p.size : (p.byteLength !== undefined ? p.byteLength : p.length); segs.push({ at, len, p }); at += len; });
        const total = at;
        const mk = (from, to) => ({ size: to - from, from, to,
            slice: (a, b) => mk(from + a, from + (b === undefined ? to - from : b)),
            arrayBuffer: async () => {
                const out = new Uint8Array(to - from);
                segs.forEach(s => { const a = Math.max(from, s.at), b = Math.min(to, s.at + s.len); if (a >= b || s.p.hole) return; const src = s.p instanceof ArrayBuffer ? new Uint8Array(s.p) : s.p; out.set(src.subarray(a - s.at, b - s.at), a - from); });
                return out.buffer;
            } });
        return mk(0, total);
    };
    const FIVE = 5 * 1024 * 1024 * 1024;
    const bigEntries = [{ name: 'data.json', data: enc.encode('{}') }, { name: 'images/video/c/big.mp4', data: hole(FIVE), crc: 0x12345678 }, { name: 'images/after.png', data: pattern(10) }];
    const big = Z.zipCreate(bigEntries, { asParts: true }), bigFile = virtual(big.parts);
    const dvOf = p => new DataView(p instanceof ArrayBuffer ? p : p.buffer, p.byteOffset || 0, p.byteLength);
    // parts: [lh, name, data] for a small entry; [lh, name, extra, data] for a big one; then the central directory and the tail
    const lhBig = dvOf(big.parts[3]), lxBig = dvOf(big.parts[5]), tail = big.parts.slice(-3).map(dvOf);
    check('an entry of 5 GB: its local header asks for version 45 and holds 0xFFFFFFFF in both size fields, the real size twice in a ZIP64 extra after the name; a small entry before it is as ever',
        lhBig.getUint32(0, true) === 0x04034b50 && lhBig.getUint16(4, true) === 45 && lhBig.getUint32(18, true) === 0xFFFFFFFF && lhBig.getUint32(22, true) === 0xFFFFFFFF && lhBig.getUint16(28, true) === 20 && lhBig.getUint32(14, true) === 0x12345678
        && lxBig.byteLength === 20 && lxBig.getUint16(0, true) === 1 && lxBig.getUint16(2, true) === 16 && lxBig.getUint32(4, true) === FIVE % 4294967296 && lxBig.getUint32(8, true) === 1 && lxBig.getUint32(12, true) === FIVE % 4294967296 && lxBig.getUint32(16, true) === 1
        && dvOf(big.parts[0]).getUint16(4, true) === 20 && dvOf(big.parts[0]).byteLength === 30 && big.parts[4] === undefined === false);
    check('an archive past 4 GB ends with a ZIP64 end record (the count, the directory\'s size and its true offset), its locator, then the classic end record with 0xFFFFFFFF where the offset no longer fits; the size it states is the size of its parts',
        tail[0].byteLength === 56 && tail[0].getUint32(0, true) === 0x06064b50 && tail[0].getUint32(32, true) === 3 && tail[0].getUint32(52, true) === 1 && tail[1].byteLength === 20 && tail[1].getUint32(0, true) === 0x07064b50
        && tail[2].byteLength === 22 && tail[2].getUint32(0, true) === 0x06054b50 && tail[2].getUint16(10, true) === 3 && tail[2].getUint32(16, true) === 0xFFFFFFFF && big.size === bigFile.size && big.size > FIVE);
    const bigOpen = await Z.zipOpen(bigFile), bigSlice = await bigOpen.entries[1].blob(), afterBytes = await bigOpen.entries[2].bytes();
    check('the reader follows them: three entries, the 5 GB one with its true size and a slice of the file exactly that long at its true place, and the entry AFTER it (its offset past 4 GB, in a ZIP64 extra of the directory) read back whole with its checksum right',
        j(bigOpen.entries.map(e => [e.name, e.size])) === j([['data.json', 2], ['images/video/c/big.mp4', FIVE], ['images/after.png', 10]]) && bigSlice.size === FIVE && bigSlice.from === 30 + 9 + 2 + 30 + enc.encode('images/video/c/big.mp4').length + 20
        && j(Array.from(afterBytes)) === j(Array.from(pattern(10))) && dec.decode(await bigOpen.entries[0].bytes()) === '{}', j(bigOpen.entries.map(e => [e.name, e.size])));

    // every field of the ZIP64 records, on an archive with an entry that is both past 4 GB in size and starts past 4 GB (the places
    // are worked out here from the names' lengths, not read back from the writer)
    const g64 = (dv, at) => dv.getUint32(at + 4, true) * 4294967296 + dv.getUint32(at, true), U32x = 0xFFFFFFFF;
    const four = Z.zipCreate([{ name: 'data.json', data: enc.encode('{}') }, { name: 'images/video/c/big.mp4', data: hole(FIVE), crc: 1 }, { name: 'images/video/c/big2.mp4', data: hole(FIVE), crc: 2 }, { name: 'images/after.png', data: pattern(10) }], { asParts: true });
    const off1 = 30 + 9 + 2, off2 = off1 + 30 + 22 + 20 + FIVE, off3 = off2 + 30 + 23 + 20 + FIVE, cdAt4 = off3 + 30 + 16 + 10, cdSize4 = (46 + 9) + (46 + 22 + 20) + (46 + 23 + 28) + (46 + 16 + 12);
    const P4 = i => dvOf(four.parts[i]), e64 = P4(25), loc4 = P4(26), eo4 = P4(27), c0 = P4(14), c1 = P4(16), cx1 = P4(18), c2 = P4(19), cx2 = P4(21), c3 = P4(22), cx3 = P4(24);
    check('the ZIP64 end record, field by field: its signature, the size of what follows it (44), both versions 45, both disk numbers 0, the count twice, the directory\'s size and its true offset; its locator: disk 0, where the record starts, one disk in all; the classic end record after them with the count and the directory\'s size as they are and 0xFFFFFFFF for the offset',
        four.parts.length === 28 && e64.byteLength === 56 && e64.getUint32(0, true) === 0x06064b50 && g64(e64, 4) === 44 && e64.getUint16(12, true) === 45 && e64.getUint16(14, true) === 45 && e64.getUint32(16, true) === 0 && e64.getUint32(20, true) === 0
        && g64(e64, 24) === 4 && g64(e64, 32) === 4 && g64(e64, 40) === cdSize4 && g64(e64, 48) === cdAt4 && loc4.byteLength === 20 && loc4.getUint32(0, true) === 0x07064b50 && loc4.getUint32(4, true) === 0 && g64(loc4, 8) === cdAt4 + cdSize4 && loc4.getUint32(16, true) === 1
        && eo4.getUint32(0, true) === 0x06054b50 && eo4.getUint32(4, true) === 0 && eo4.getUint16(8, true) === 4 && eo4.getUint16(10, true) === 4 && eo4.getUint32(12, true) === cdSize4 && eo4.getUint32(16, true) === U32x && eo4.getUint16(20, true) === 0 && four.size === cdAt4 + cdSize4 + 56 + 20 + 22,
        j([g64(e64, 4), g64(e64, 24), g64(e64, 32), g64(e64, 40), cdSize4, g64(e64, 48), cdAt4, g64(loc4, 8)]));
    check('the directory\'s ZIP64 extras hold only what overflowed, in the format\'s order — the size, the stored size, then the offset: an entry past 4 GB that starts early (both sizes, 16 bytes), one past 4 GB that also starts past 4 GB (both sizes then its offset, 24 bytes), a small one that starts past 4 GB (its offset alone, 8 bytes), a small early one (none, version 20)',
        c0.getUint32(0, true) === 0x02014b50 && c0.getUint16(4, true) === 20 && c0.getUint16(6, true) === 20 && c0.getUint16(30, true) === 0 && c0.getUint32(42, true) === 0 && c0.getUint32(20, true) === 2
        && c1.getUint16(4, true) === 45 && c1.getUint16(6, true) === 45 && c1.getUint32(20, true) === U32x && c1.getUint32(24, true) === U32x && c1.getUint16(30, true) === 20 && c1.getUint32(42, true) === off1 && cx1.getUint16(0, true) === 1 && cx1.getUint16(2, true) === 16 && g64(cx1, 4) === FIVE && g64(cx1, 12) === FIVE
        && c2.getUint32(0, true) === 0x02014b50 && c2.getUint16(4, true) === 45 && c2.getUint16(6, true) === 45 && c2.getUint32(16, true) === 2 && c2.getUint32(20, true) === U32x && c2.getUint32(24, true) === U32x && c2.getUint16(30, true) === 28 && c2.getUint32(42, true) === U32x
        && cx2.byteLength === 28 && cx2.getUint16(0, true) === 1 && cx2.getUint16(2, true) === 24 && g64(cx2, 4) === FIVE && g64(cx2, 12) === FIVE && g64(cx2, 20) === off2
        && c3.getUint16(4, true) === 45 && c3.getUint32(20, true) === 10 && c3.getUint32(24, true) === 10 && c3.getUint16(30, true) === 12 && c3.getUint32(42, true) === U32x && cx3.byteLength === 12 && cx3.getUint16(0, true) === 1 && cx3.getUint16(2, true) === 8 && g64(cx3, 4) === off3,
        j([c1.getUint16(30, true), c2.getUint16(30, true), g64(cx2, 20), off2, c3.getUint16(30, true), g64(cx3, 4), off3]));
    const fourOpen = await Z.zipOpen(virtual(four.parts)), big2Slice = await fourOpen.entries[2].blob();
    check('the reader on that archive: four entries with their true sizes, the second large one a slice of the file at its true place past 4 GB, the small one after both read back whole',
        j(fourOpen.entries.map(e => e.size)) === j([2, FIVE, FIVE, 10]) && big2Slice.size === FIVE && big2Slice.from === off2 + 30 + 23 + 20 && j(Array.from(await fourOpen.entries[3].bytes())) === j(Array.from(pattern(10))));
    // the boundaries: 0xFFFFFFFF is the first size, and the first offset, that needs a ZIP64 field
    const one = (sz, more) => Z.zipCreate([{ name: 'a', data: hole(sz), crc: 0 }].concat(more || []), { asParts: true }).parts.map(p => (p && p.hole ? null : dvOf(p)));
    const atMax = one(U32x), below = one(U32x - 1), farB = one(U32x - 31, [{ name: 'b', data: new Uint8Array(1) }]), cdAtMax = one(U32x - 31), cdBelow = one(U32x - 32);
    check('exactly at the boundary: a size of 0xFFFFFFFF takes the ZIP64 extra (version 45), one byte less does not (version 20, its size in the field); an entry that starts at exactly 0xFFFFFFFF takes the offset extra; a directory that starts at exactly 0xFFFFFFFF takes the ZIP64 end record, one byte earlier the classic end record alone',
        atMax[0].getUint16(4, true) === 45 && atMax[0].getUint16(28, true) === 20 && atMax[0].getUint32(18, true) === U32x && g64(atMax[2], 4) === U32x && atMax[4].getUint16(30, true) === 20
        && below[0].getUint16(4, true) === 20 && below[0].getUint16(28, true) === 0 && below[0].getUint32(18, true) === U32x - 1 && below[0].getUint32(22, true) === U32x - 1 && below[3].getUint16(30, true) === 0 && below[3].getUint32(20, true) === U32x - 1
        && farB[8].getUint32(0, true) === 0x02014b50 && farB[8].getUint32(42, true) === U32x && farB[8].getUint16(30, true) === 12 && g64(farB[10], 4) === U32x && farB[8].getUint32(20, true) === 1 && farB[6].getUint16(30, true) === 0 && farB[6].getUint32(42, true) === 0
        && cdAtMax.length === 8 && cdAtMax[5].getUint32(0, true) === 0x06064b50 && g64(cdAtMax[5], 48) === U32x && cdAtMax[7].getUint32(16, true) === U32x
        && cdBelow.length === 6 && cdBelow[5].getUint32(0, true) === 0x06054b50 && cdBelow[5].getUint32(16, true) === U32x - 1,
        j([atMax.length, below.length, farB.length, cdAtMax.length, cdBelow.length]));

    /* ---- more than 65,535 entries ---- */
    const many = []; for (let i = 0; i < 70000; i++) many.push({ name: 'images/m/' + i + '.png', data: new Uint8Array([i & 255]) });
    const manyZip = Z.zipCreate(many), manyU8 = await bytes(manyZip), manyDv = new DataView(manyU8.buffer), manyOpen = await Z.zipOpen(manyZip);
    check('70,000 entries: the classic end record says 65,535 in both its counts (on this disk, in all) and a ZIP64 end record carries the true count; the reader lists all 70,000 and reads the last',
        manyDv.getUint16(manyU8.length - 22 + 8, true) === 0xFFFF && manyDv.getUint16(manyU8.length - 22 + 10, true) === 0xFFFF && manyDv.getUint32(manyU8.length - 22 - 20, true) === 0x07064b50 && manyOpen.entries.length === 70000 && manyOpen.entries[69999].name === 'images/m/69999.png' && (await manyOpen.entries[69999].bytes())[0] === (69999 & 255));
    const edge = []; for (let i = 0; i < 65534; i++) edge.push({ name: String(i), data: new Uint8Array(0) });
    const edgeU8 = await bytes(Z.zipCreate(edge));
    check('65,534 entries still fit the classic end record: no ZIP64 record is written', new DataView(edgeU8.buffer).getUint16(edgeU8.length - 22 + 10, true) === 65534 && new DataView(edgeU8.buffer).getUint32(edgeU8.length - 22 - 20, true) !== 0x07064b50 && (await Z.zipOpen(new Blob([edgeU8]))).entries.length === 65534);

    /* ---- a file that is not what it says ---- */
    const good = await bytes(Z.zipCreate([{ name: 'data.json', data: enc.encode('{"ok":true}') }, { name: 'images/a.png', data: pattern(5000) }]));
    const mut = fn => { const c = good.slice(); fn(c, new DataView(c.buffer)); return new Blob([c]); };
    const cdAt = new DataView(good.buffer).getUint32(good.length - 22 + 16, true);
    const flipped = mut(c => { c[30 + 9 + 11 + 30 + 12 + 100] ^= 1; }), flipOpen = await Z.zipOpen(flipped);
    check('a file whose bytes were changed fails its checksum: check() and bytes() refuse that entry (the other is still read), and zipRead refuses the archive — never a silently wrong file',
        /checksum/.test(await throws(() => flipOpen.entries[1].check())) && /checksum/.test(await throws(() => flipOpen.entries[1].bytes())) && dec.decode(await flipOpen.entries[0].bytes()) === '{"ok":true}' && /checksum/.test(await throws(() => Z.zipRead(flipped))));
    const errs = [
        await throws(() => Z.zipOpen(new Blob([good.slice(0, good.length - 30)]))),                 // cut short: no end record
        await throws(() => Z.zipOpen(new Blob([good.slice(0, 10)]))),
        await throws(() => Z.zipOpen(new Blob([enc.encode('just some text, long enough to hold a record')]))),
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(c.length - 22 + 16, c.length + 50, true)))),   // the directory said to lie past the end
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(c.length - 22 + 12, 0x7FFFFFFF, true)))),      // a directory larger than the file
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint16(c.length - 22 + 10, 9, true)))),               // more entries than the directory holds
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(cdAt + 42, c.length + 5, true)))),             // an entry said to start outside the archive
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(cdAt + 20, 0x7FFFFFF0, true)))),               // an entry said to be larger than the archive
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(cdAt, 0x11111111, true)))),                    // a directory record that is none
    ];
    check('a file cut short, text that is no zip, a directory said to lie outside the file or to hold more than it does, an entry said to start or end outside the archive: each is refused with a reason, nothing is read past the file',
        errs.every(e => /not a zip file|corrupt zip/.test(e)), j(errs));
    const badLocal = mut((c, dv) => dv.setUint32(0, 0x22222222, true)), sizeLie = mut((c, dv) => dv.setUint32(cdAt + 24, 12, true)), encr = mut((c, dv) => dv.setUint16(cdAt + 8, 0x0801, true));
    check('an entry whose own header is not one, whose stated size is not its stored size, or that is encrypted is refused when it is read',
        /corrupt zip/.test(await throws(async () => (await Z.zipOpen(badLocal)).entries[0].blob())) && /corrupt zip/.test(await throws(async () => (await Z.zipOpen(sizeLie)).entries[0].blob())) && /encrypted/.test(await throws(async () => (await Z.zipOpen(encr)).entries[0].blob())));
    // a comment that holds an end record's signature
    const withComment = (() => { const fake = new Uint8Array(40); new DataView(fake.buffer).setUint32(4, 0x06054b50, true); const c = new Uint8Array(good.length + fake.length); c.set(good); c.set(fake, good.length); new DataView(c.buffer).setUint16(good.length - 22 + 20, fake.length, true); return new Blob([c]); })();
    check('an archive with a comment is read, and an end record\'s signature inside the comment is not taken for the end record (a comment runs exactly to the file\'s end)', j((await Z.zipOpen(withComment)).entries.map(e => e.name)) === j(['data.json', 'images/a.png']) && dec.decode((await Z.zipRead(withComment))[0].data) === '{"ok":true}');

    /* ---- an archive some other program made: deflated entries ---- */
    const rawText = enc.encode('hello hello hello hello hello hello, world'), deflated = new Uint8Array(zlib.deflateRawSync(Buffer.from(rawText)));
    const handMade = (crc) => {
        const name = enc.encode('notes/a.txt'), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46)), eo = new DataView(new ArrayBuffer(22));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(8, 8, true); lh.setUint32(14, crc, true); lh.setUint32(18, deflated.length, true); lh.setUint32(22, rawText.length, true); lh.setUint16(26, name.length, true);
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, 8, true); ch.setUint32(16, crc, true); ch.setUint32(20, deflated.length, true); ch.setUint32(24, rawText.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, 0, true);
        const cdStart = 30 + name.length + deflated.length;
        eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, 1, true); eo.setUint16(10, 1, true); eo.setUint32(12, 46 + name.length, true); eo.setUint32(16, cdStart, true);
        return new Blob([lh.buffer, name, deflated, ch.buffer, name, eo.buffer]);
    };
    const defl = await Z.zipRead(handMade(Z.crc32(rawText)));
    check('a deflated entry (an archive another program made) is inflated and its checksum checked; a wrong one is refused',
        defl.length === 1 && defl[0].name === 'notes/a.txt' && dec.decode(defl[0].data) === dec.decode(rawText) && /checksum/.test(await throws(() => Z.zipRead(handMade(123)))));
    // an entry that inflates past what the archive states: 4 MB of zeros behind a stated size of 100 bytes
    const zeros = new Uint8Array(4 * 1024 * 1024), bombDef = new Uint8Array(zlib.deflateRawSync(Buffer.from(zeros)));
    const bomb = (() => {
        const name = enc.encode('images/m/bomb.png'), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46)), eo = new DataView(new ArrayBuffer(22)), crc = Z.crc32(zeros);
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, 8, true); lh.setUint32(14, crc, true); lh.setUint32(18, bombDef.length, true); lh.setUint32(22, 100, true); lh.setUint16(26, name.length, true);
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, 8, true); ch.setUint32(16, crc, true); ch.setUint32(20, bombDef.length, true); ch.setUint32(24, 100, true); ch.setUint16(28, name.length, true);
        eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, 1, true); eo.setUint16(10, 1, true); eo.setUint32(12, 46 + name.length, true); eo.setUint32(16, 30 + name.length + bombDef.length, true);
        return new Blob([lh.buffer, name, bombDef, ch.buffer, name, eo.buffer]);
    })();
    const bombOpen = await Z.zipOpen(bomb);
    check('a compressed entry is inflated only as far as the size the archive states: one that grows past it is refused (its stated size, its real stored size and its method are there for an importer to judge first); the import refuses a compressed picture or video said to grow more than twentyfold',
        /inflates past the size|corrupt zip/.test(await throws(() => bombOpen.entries[0].blob())) && /inflates past the size|corrupt zip/.test(await throws(() => bombOpen.entries[0].check())) && j([bombOpen.entries[0].size, bombOpen.entries[0].csize, bombOpen.entries[0].method]) === j([100, bombDef.length, 8])
        && /if \(imgs\[i\]\.method !== 0 && imgs\[i\]\.size > imgs\[i\]\.csize \* 20 \+ 1048576\) throw new Error\(/.test(read('system/app/scripts/main.js')) && /var MAX_CD = 128 \* 1024 \* 1024;/.test(read('system/app/scripts/zip.js')));
    // each of the reader's rules by its own refusal (one rule must not stand in for another): an archive made by hand, field by field
    const craft = o => {
        const name = enc.encode(o.name), data = o.data, cx = o.cextra || new Uint8Array(0), lh = new DataView(new ArrayBuffer(30)), ch = new DataView(new ArrayBuffer(46)), eo = new DataView(new ArrayBuffer(22));
        lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, o.method || 0, true); lh.setUint32(14, o.crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, o.usize, true); lh.setUint16(26, name.length, true);
        ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, o.method || 0, true); ch.setUint32(16, o.crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, o.usize, true); ch.setUint16(28, name.length, true); ch.setUint16(30, cx.length, true);
        eo.setUint32(0, 0x06054b50, true); eo.setUint16(8, 1, true); eo.setUint16(10, 1, true); eo.setUint32(12, 46 + name.length + cx.length, true); eo.setUint32(16, 30 + name.length + data.length, true);
        return new Blob([lh.buffer, name, data, ch.buffer, name, cx, eo.buffer]);
    };
    const longNames = await bytes(Z.zipCreate([{ name: 'n'.repeat(100) + '1', data: new Uint8Array(1) }, { name: 'n'.repeat(100) + '2', data: new Uint8Array(1) }]));
    const three = (() => { const c = longNames.slice(), dv = new DataView(c.buffer); dv.setUint16(c.length - 22 + 8, 3, true); dv.setUint16(c.length - 22 + 10, 3, true); return new Blob([c]); })();
    const cdSizeGood = new DataView(good.buffer).getUint32(good.length - 22 + 12, true), lastRec = cdAt + 46 + 9, abc = enc.encode('abc');
    const eoBig = new DataView(new ArrayBuffer(22)); eoBig.setUint32(0, 0x06054b50, true); eoBig.setUint16(8, 1, true); eoBig.setUint16(10, 1, true); eoBig.setUint32(12, 200 * 1024 * 1024, true);
    const why = [
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint16(c.length - 22 + 10, 9, true)))),                  // more entries than the directory could hold at 46 bytes each
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(c.length - 22 + 12, cdSizeGood + 10, true)))),     // a directory that runs into the end record
        await throws(() => Z.zipOpen(virtual([hole(200 * 1024 * 1024), eoBig.buffer]))),                            // a directory of 200 MB (inside the file): never read
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint32(c.length - 22 + 16, 0xFFFFFFFF, true)))),          // an offset that needs a ZIP64 record, and none there
        await throws(() => Z.zipOpen(three)),                                                                       // a third record where the directory ends
        await throws(() => Z.zipOpen(mut((c, dv) => dv.setUint16(lastRec + 28, 12 + 50, true)))),                   // the last record's name said to run past the directory
        await throws(() => Z.zipOpen(craft({ name: 'a.txt', data: abc, usize: 3, crc: Z.crc32(abc), cextra: new Uint8Array([0x99, 0x99, 0xF4, 0x01, 1, 2, 3, 4]) }))),   // an extra field said to be longer than its room
    ];
    check('each rule of the list of files refuses by itself: more entries than the directory could hold, a directory that runs into the end record, one past 128 MB (never read), an offset that asks for a ZIP64 record where there is none, a record where the directory has ended, a name or an extra field said to run past its room',
        /list of files lies outside the file/.test(why[0]) && /list of files lies outside the file/.test(why[1]) && /list of files lies outside the file/.test(why[2]) && /large-file record is missing/.test(why[3]) && why[4] === 'corrupt zip' && why[5] === 'corrupt zip' && why[6] === 'corrupt zip'
        && (await Z.zipOpen(craft({ name: 'a.txt', data: abc, usize: 3, crc: Z.crc32(abc), cextra: new Uint8Array([0x99, 0x99, 4, 0, 1, 2, 3, 4]) }))).entries.length === 1, j(why));
    const endsOut = mut((c, dv) => { dv.setUint32(cdAt + 20, cdAt - 10, true); dv.setUint32(cdAt + 24, cdAt - 10, true); }), method12 = mut((c, dv) => dv.setUint16(cdAt + 10, 12, true));
    const shortDef = craft({ name: 'notes/a.txt', method: 8, data: deflated, usize: rawText.length + 5, crc: Z.crc32(rawText) });
    const whyE = [await throws(async () => (await Z.zipOpen(endsOut)).entries[0].blob()), await throws(async () => (await Z.zipOpen(method12)).entries[0].blob()), await throws(async () => (await Z.zipOpen(shortDef)).entries[0].check())];
    check('an entry said to run past the last file\'s end into the list of files, one packed in a way this app does not read, and a compressed one that inflates to fewer bytes than the archive states (its checksum right for what it holds) are each refused when read',
        /a file lies outside the archive: data\.json/.test(whyE[0]) && /unsupported zip compression \(method 12\)/.test(whyE[1]) && /not the size the archive states: notes\/a\.txt/.test(whyE[2]), j(whyE));
    // a ZIP64 archive (the 70,000 files) with one field of its large-file records changed
    const e64At = manyU8.length - 22 - 20 - 56, many64 = fn => { const c = manyU8.slice(); fn(new DataView(c.buffer), c); return new Blob([c]); };
    const z64 = [
        await throws(() => Z.zipOpen(many64(dv => dv.setUint32(e64At + 48 + 4, 0x00200000, true)))),                                        // an offset past 2^53
        await throws(() => Z.zipOpen(many64((dv, c) => dv.setUint32(c.length - 22 - 20 + 8, c.length + 100, true)))),                       // a locator that points outside the file
        await throws(() => Z.zipOpen(many64(dv => dv.setUint32(e64At, 0x11111111, true)))),                                                 // a ZIP64 end record that is none
        await throws(() => Z.zipOpen(many64(dv => dv.setUint32(e64At + 40, dv.getUint32(e64At + 40, true) + 30, true)))),                   // a directory that runs into the ZIP64 end record
    ];
    const thisDisk = await Z.zipOpen(many64(dv => dv.setUint32(e64At + 24, 5, true)));   // "entries on this disk" is not the count: the total after it is
    check('a ZIP64 archive: a number past what a JS number states exactly, a locator that points outside the file, a large-file record that is none, and a list of files said to run into that record are each refused by name; the count is the total, never the entries-on-this-disk field before it',
        manyDv.getUint32(e64At, true) === 0x06064b50 && /past what this app can count/.test(z64[0]) && /a record lies outside the file/.test(z64[1]) && /large-file record is damaged/.test(z64[2]) && /list of files lies outside the file/.test(z64[3]) && thisDisk.entries.length === 70000, j(z64));
    // exactly 65,535 files: a count a classic archive may state (the old writer made such archives)
    const full = []; for (let i = 0; i < 65535; i++) full.push({ name: String(i), data: new Uint8Array(0) });
    const fullU8 = await bytes(Z.zipCreate(full));   // the writer adds a ZIP64 record at 65,535: cut it off to make the classic archive an older writer made
    const fullDv = new DataView(fullU8.buffer), fullEnd = fullU8.length - 22, classicAt = fullEnd - 76;
    const classic = new Uint8Array(classicAt + 22); classic.set(fullU8.subarray(0, classicAt)); classic.set(fullU8.subarray(fullEnd), classicAt);
    const classicOpen = await Z.zipOpen(new Blob([classic]));
    // a ZIP64 archive whose locator is damaged must not be read as a classic one of 65,535 (its list would end early: files silently missing)
    const manyBad = manyU8.slice(); new DataView(manyBad.buffer).setUint32(manyBad.length - 22 - 20, 0x11111111, true);
    check('an archive of exactly 65,535 files with no ZIP64 record (a count a classic archive may state, and the old writer wrote) reads whole; an archive of more whose ZIP64 locator is damaged is refused, never listed short',
        fullDv.getUint32(fullEnd - 20, true) === 0x07064b50 && new DataView(classic.buffer).getUint16(classic.length - 22 + 10, true) === 0xFFFF && classicOpen.entries.length === 65535 && classicOpen.entries[65534].name === '65534'
        && /large-file record is missing/.test(await throws(() => Z.zipOpen(new Blob([manyBad])))), [classicOpen.entries.length]);
    const trailing = new Blob([good, enc.encode(NL)]);
    check('bytes after the end record (a line some tool added) do not hide the archive: it is read as it stands',
        j((await Z.zipOpen(trailing)).entries.map(e => e.name)) === j(['data.json', 'images/a.png']) && dec.decode((await Z.zipRead(trailing))[0].data) === '{"ok":true}');
    // zipRead holds every entry at once: it refuses, before reading any, an archive that states more than its budget
    const budgetErr = await throws(() => Z.zipRead(new Blob([good]), 5000)), budgetOk = await Z.zipRead(new Blob([good]), 5011);
    check('zipRead (every entry held at once: the Markdown importer) refuses an archive whose entries come to more than its budget by the sizes it states (512 MB unless told), before reading any entry; within it, it reads as ever',
        /too large to read whole/.test(budgetErr) && budgetOk.length === 2 && /var READ_WHOLE = 512 \* 1024 \* 1024;/.test(read('system/app/scripts/zip.js')) && /for \(var s = 0; s < z\.entries\.length; s\+\+\) \{ sum \+= z\.entries\[s\]\.size; if \(sum > cap\) throw new Error\('zip: too large to read whole'\); \}\n    for \(var i = 0; i < z\.entries\.length; i\+\+\)/.test(read('system/app/scripts/zip.js')));
    check('an archive that lists more than 500,000 files is not listed (each costs memory); the import writes at most twenty times the archive\'s own size (entries that share bytes, or inflate out of proportion, stop there) and reads a pack file only when it copies it (source)',
        /var MAX_ENTRIES = 500000;/.test(read('system/app/scripts/zip.js')) && /if \(count > MAX_ENTRIES\) throw new Error\('zip: too many files to list/.test(read('system/app/scripts/zip.js'))
        && /var ok = 0, kept = 0, fail = 0, vidAt = 0, wrote = 0, budget = pendingImportBytes \* 20 \+ 1048576;/.test(read('system/app/scripts/main.js')) && /wrote \+= imgs\[i\]\.size; if \(wrote > budget\) throw new Error\('more than the archive can hold'\);\n\s*var body = await imgs\[i\]\.check\(\);/.test(read('system/app/scripts/main.js'))
        && /var feD = null; if \(fe\) \{ try \{ feD = fe\.data \|\| await fe\.bytes\(\); \} catch \(eF\) \{ feD = null; \} \}/.test(read('system/app/scripts/library.js')));
    check('an older archive (the writer\'s own small output) still reads: zipRead takes its bytes as an ArrayBuffer, as the Markdown importer hands them',
        j((await Z.zipRead(smallZip.buffer)).map(e => [e.name, e.data.length])) === j([['data.json', 19], ['images/map 1/pic (1).png', 70000], ['images/video/c/Überfahrt.webm', 0], ['library/l_abcdefgh/p_x.3.json', 2]]));

    /* ---- the export's reader (io.js exportFile, sliced by its markers and run for real against a server of plain objects) ---- */
    const ioSrc = read('system/app/scripts/io.js'), mainSrc = read('system/app/scripts/main.js');
    const sliceOf = (src, name) => { const a = '// [zipcheck:' + name + '-start]', b = '// [zipcheck:' + name + '-end]', i = src.indexOf(a), k = src.indexOf(b); if (i < 0 || k < i || src.indexOf(a, i + 1) >= 0) throw new Error('zipcheck: marker ' + name); return src.slice(i + a.length, k); };
    const exportFile = new Function('fetch', 'Blob', sliceOf(ioSrc, 'exportfile') + NL + 'return exportFile;')(() => { throw new Error('the page\'s own fetch is not used here'); }, Blob);
    // a server like the local one: a byte range answered 206 with its Content-Range (the end clamped to the file), a range that starts
    // outside the file 416, no Range the whole file; `quirk` makes one answer wrong
    const server = (files, log, quirk) => async (u, opts) => {
        const h = opts && opts.headers && opts.headers.Range, data = files[u]; log.push(u + ' ' + (h || '-'));
        const res = (status, body, cr) => ({ status, ok: status >= 200 && status < 300, headers: { get: k => (k === 'Content-Range' ? (cr || null) : null) }, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
        if (!data) return res(404, new Uint8Array(0));
        if (!h || (quirk && quirk.noRanges)) return res(200, data);
        const m = /^bytes=(\d+)-(\d+)$/.exec(h), start = +m[1], end = Math.min(+m[2], data.length - 1);
        if (start >= data.length) return res(416, new Uint8Array(0), 'bytes */' + data.length);
        if (quirk && quirk.at === log.length) return quirk.answer(res, data, start, end);
        return res(206, data.subarray(start, end + 1), 'bytes ' + start + '-' + end + '/' + data.length);
    };
    const files = { '/a/small.png': pattern(10), '/a/exact.png': pattern(1000), '/a/big.webm': pattern(2500), '/a/empty.bin': new Uint8Array(0) };
    const get = async (u, quirk) => { const log = []; const r = await exportFile(u, Z, server(files, log, quirk), 1000); return { r, log, u8: r ? await bytes(r.data) : null }; };
    const eSmall = await get('/a/small.png'), eExact = await get('/a/exact.png'), eBig = await get('/a/big.webm'), eEmpty = await get('/a/empty.bin'), eGone = await get('/a/none.png'), eWhole = await get('/a/big.webm', { noRanges: true });
    check('the export reads a file once (exportFile, run for real): a file within one part by a single ranged request, a larger one part by part with exact ranges, each added to one running CRC-32 and kept as a part of a Blob; an empty file (no first range) asked for whole; a missing one is none; a server that answers no ranges is taken whole',
        j(eSmall.log) === j(['/a/small.png bytes=0-999']) && eSmall.r.data instanceof Blob && eSmall.r.data.size === 10 && eSmall.r.crc === Z.crc32(files['/a/small.png']) && sha(eSmall.u8) === sha(files['/a/small.png'])
        && j(eExact.log) === j(['/a/exact.png bytes=0-999']) && eExact.r.data.size === 1000 && eExact.r.crc === Z.crc32(files['/a/exact.png'])
        && j(eBig.log) === j(['/a/big.webm bytes=0-999', '/a/big.webm bytes=1000-1999', '/a/big.webm bytes=2000-2499']) && eBig.r.data instanceof Blob && eBig.r.data.size === 2500 && eBig.r.crc === Z.crc32(files['/a/big.webm']) && sha(eBig.u8) === sha(files['/a/big.webm'])
        && j(eEmpty.log) === j(['/a/empty.bin bytes=0-999', '/a/empty.bin -']) && eEmpty.r.data.size === 0 && eEmpty.r.crc === 0 && eGone.r === null && j(eGone.log) === j(['/a/none.png bytes=0-999'])
        && j(eWhole.log) === j(['/a/big.webm bytes=0-999']) && eWhole.r.data.size === 2500 && eWhole.r.crc === Z.crc32(files['/a/big.webm']), j([eSmall.log, eBig.log, eEmpty.log, eWhole.log]));
    const wrong = [
        await get('/a/big.webm', { at: 2, answer: (res, d) => res(200, d) }),                                                             // a later part answered whole
        await get('/a/big.webm', { at: 2, answer: (res, d, s, e) => res(206, d.subarray(s, e), 'bytes ' + s + '-' + e + '/' + d.length) }),   // a part one byte short
        await get('/a/big.webm', { at: 3, answer: (res, d, s, e) => res(206, d.subarray(s, e + 1), 'bytes ' + s + '-' + e + '/' + (d.length + 7)) }),   // the file grew while it was read
        await get('/a/big.webm', { at: 2, answer: (res, d, s, e) => res(206, d.subarray(s, e + 1), 'bytes ' + (s + 1) + '-' + (e + 1) + '/' + d.length) }),   // another range than the one asked
        await get('/a/big.webm', { at: 1, answer: (res, d, s, e) => res(206, d.subarray(s, e + 1), 'nonsense') }),                           // a first part with no Content-Range to read
        await get('/a/big.webm', { at: 1, answer: (res, d, s, e) => res(206, d.subarray(s, e), 'bytes ' + s + '-' + e + '/' + d.length) }),     // a first part shorter than it says
        await get('/a/big.webm', { at: 1, answer: (res, d) => res(206, d.subarray(0, 1000), 'bytes 0-999/500') }),                            // a total smaller than what came
        await get('/a/big.webm', { at: 2, answer: res => res(404, new Uint8Array(0)) }),                                                        // gone mid-way
        await get('/a/big.webm', { at: 2, answer: (res, d, s, e) => res(200, d.subarray(s, e + 1), 'bytes ' + s + '-' + e + '/' + d.length) }),   // a later part that is no partial answer, whatever range it names
    ];
    check('a file that does not come back as asked is left out, never written wrong: a later part answered whole, a part too short, a total that changed while it was read, a range other than the one asked for, a first part that does not say what it is or is shorter than it says, a file gone mid-way, a later part that is not a partial answer',
        wrong.length === 9 && wrong.every(w => w.r === null), j(wrong.map(w => w.r === null)));
    const viaExport = Z.zipCreate([{ name: 'data.json', data: enc.encode('{}') }, { name: 'images/video/c/big.webm', data: eBig.r.data, crc: eBig.r.crc }, { name: 'images/m/small.png', data: eSmall.r.data, crc: eSmall.r.crc }]);
    const viaBack = await Z.zipOpen(viaExport);
    check('what the export reads goes through the archive and back with its checksum right', sha(await bytes(await viaBack.entries[1].check())) === sha(files['/a/big.webm']) && sha(await bytes(await viaBack.entries[2].check())) === sha(files['/a/small.png']) && viaBack.entries.length === 3);

    /* ---- the same archive written straight to a file (zipWrite): a sink that keeps what is written where ---- */
    const mkSink = quirk => { const s = { buf: new Uint8Array(0), writes: 0, truncated: null, high: 0,
        write: async (pos, data) => { s.writes++; if (quirk && quirk.failAt === s.writes) throw new Error('disk full'); const u8 = data instanceof ArrayBuffer ? new Uint8Array(data) : data; s.high = Math.max(s.high, pos + u8.length); if (pos + u8.length > s.buf.length) { const n = new Uint8Array(pos + u8.length); n.set(s.buf); s.buf = n; } s.buf.set(u8, pos); },
        truncate: async n => { s.truncated = n; s.buf = s.buf.slice(0, n); } }; return s; };
    const chunks = (u8, n) => async emit => { for (let at = 0; at < u8.length; at += n) await emit(u8.subarray(at, Math.min(u8.length, at + n))); if (!u8.length) await emit(u8); };
    const bytesA = pattern(70000), bytesB = pattern(2500), bytesJ = enc.encode('{"a":1}');
    const viaBlob = await bytes(Z.zipCreate([{ name: 'data.json', data: bytesJ }, { name: 'images/video/c/Überfahrt.webm', data: bytesA }, { name: 'images/m/empty.png', data: new Uint8Array(0) }, { name: 'images/m/b.png', data: bytesB }]));
    const sinkW = mkSink(); let passed = 0;
    const resW = await Z.zipWrite(sinkW, [{ name: 'data.json', size: bytesJ.length, pull: chunks(bytesJ, 1000) }, { name: 'images/video/c/Überfahrt.webm', open: async () => ({ size: bytesA.length, pull: chunks(bytesA, 9999) }) }, { name: 'images/m/empty.png', size: 0, pull: chunks(new Uint8Array(0), 10) }, { name: 'images/m/b.png', size: bytesB.length, pull: chunks(bytesB, 2500) }], n => { passed += n; });
    check('the straight-to-file writer (zipWrite) makes, byte for byte, the archive zipCreate makes of the same entries: each entry\'s bytes written as they are handed over (in pieces of any size), its checksum written back into its header, the directory and the end record after, the file cut at its end; it tells the bytes that passed',
        sha(sinkW.buf) === sha(viaBlob) && sinkW.buf.length === viaBlob.length && j(resW) === j({ size: viaBlob.length, count: 4, skipped: [] }) && sinkW.truncated === viaBlob.length && passed === bytesJ.length + bytesA.length + bytesB.length, j([sinkW.buf.length, viaBlob.length, resW]));
    // entries that are not there, or do not come as they said: left out whole, the next written over what they left
    const kept = await bytes(Z.zipCreate([{ name: 'data.json', data: bytesJ }, { name: 'images/m/b.png', data: bytesB }]));
    const sinkS = mkSink();
    const resS = await Z.zipWrite(sinkS, [{ name: 'data.json', size: bytesJ.length, pull: chunks(bytesJ, 3) },
        { name: 'images/m/gone.png', open: async () => null }, { name: 'images/m/throws.png', open: async () => { throw new Error('no'); } },
        { name: 'images/video/c/short.webm', size: bytesA.length, pull: chunks(bytesA.subarray(0, 60000), 7000) },       // fewer bytes than it said
        { name: 'images/video/c/long.webm', size: 1000, pull: chunks(bytesA, 600) },                                        // more bytes than it said
        { name: 'images/video/c/changed.webm', size: bytesA.length, pull: async emit => { await emit(bytesA.subarray(0, 30000)); throw new Error('the file changed while it was read'); } },
        { name: 'images/m/b.png', size: bytesB.length, pull: chunks(bytesB, 100) }]);
    const openS = await Z.zipOpen(new Blob([sinkS.buf]));
    check('an entry that is not there, whose opening fails, whose bytes come short or long of the size it stated, or whose reading fails mid-way is left out whole and named: the next entry is written over what it left, nothing of it stays behind the end, and the archive is exactly the one of the entries that came whole',
        sha(sinkS.buf) === sha(kept) && j(resS) === j({ size: kept.length, count: 2, skipped: ['images/m/gone.png', 'images/m/throws.png', 'images/video/c/short.webm', 'images/video/c/long.webm', 'images/video/c/changed.webm'] })
        && j(openS.entries.map(e => e.name)) === j(['data.json', 'images/m/b.png']) && sha(await openS.entries[1].bytes()) === sha(bytesB), j([resS, sinkS.buf.length, kept.length]));
    // an entry that hands over more than it stated: stopped at the first piece past its size, not written out and cleared up afterwards
    const sinkL = mkSink(), resL = await Z.zipWrite(sinkL, [{ name: 'long', size: 1000, pull: chunks(bytesA, 600) }]);
    check('an entry that hands over more bytes than it stated is stopped at the first piece that would pass its size (a file said to be 1,000 bytes never writes its 70,000): only the piece within it reached the file, and the entry is left out',
        j(resL) === j({ size: 22, count: 0, skipped: ['long'] }) && sinkL.high === 30 + 4 + 600 && sinkL.buf.length === 22, j([resL, sinkL.high]));
    const fatal = [];
    for (const failAt of [1, 2, 4, 6, 9]) fatal.push(await throws(() => Z.zipWrite(mkSink({ failAt }), [{ name: 'data.json', size: bytesJ.length, pull: chunks(bytesJ, 3) }, { name: 'images/m/b.png', size: bytesB.length, pull: chunks(bytesB, 2500) }])));
    const truncFail = await throws(() => Z.zipWrite(Object.assign(mkSink(), { truncate: async () => { throw new Error('no'); } }), [{ name: 'a', size: 1, pull: chunks(new Uint8Array(1), 1) }]));
    check('a write the file refuses (a header, an entry\'s bytes, its checksum, the directory, the final cut) ends the archive with an error that says so: never an entry quietly left out, never a file called done; a size that is no whole number of bytes or a name too long is refused before anything is written',
        fatal.every(m => /the file could not be written \(disk full\)/.test(m)) && /the file could not be written/.test(truncFail)
        && /exactly/.test(await throws(() => Z.zipWrite(mkSink(), [{ name: 'a', size: 1.5, pull: async () => {} }]))) && /exactly/.test(await throws(() => Z.zipWrite(mkSink(), [{ name: 'a', size: -1, pull: async () => {} }]))) && /too long/.test(await throws(() => Z.zipWrite(mkSink(), [{ name: 'x'.repeat(65536), size: 0, pull: async () => {} }]))), j([fatal, truncFail]));
    // an entry of 5 GB through the straight-to-file writer: its header, its name, its ZIP64 extra and its first byte each at their place
    // (the entry then fails, so nothing of the 5 GB is written), byte for byte the records zipCreate makes for the same entry
    const rec64 = [], sink64 = { write: async (pos, data) => { rec64.push([pos, new Uint8Array(data instanceof ArrayBuffer ? data.slice(0) : data.slice())]); }, truncate: async () => {} };
    const res64 = await Z.zipWrite(sink64, [{ name: 'data.json', size: 2, pull: async emit => { await emit(enc.encode('{}')); } }, { name: 'images/video/c/big.mp4', size: FIVE, pull: async emit => { await emit(new Uint8Array([0xAB])); throw new Error('stop'); } }]);
    const ref64 = Z.zipCreate([{ name: 'data.json', data: enc.encode('{}') }, { name: 'images/video/c/big.mp4', data: hole(FIVE), crc: 0 }], { asParts: true }).parts, sameB = (a, b) => j(Array.from(a)) === j(Array.from(new Uint8Array(b)));
    check('the straight-to-file writer on an entry past 4 GB: its header at the entry\'s start, the name after it, the ZIP64 extra after the name and the bytes after the extra — the very records zipCreate makes for that entry; left unfinished it is left out and named',
        rec64.length >= 8 && rec64[4][0] === 41 && sameB(rec64[4][1], ref64[3]) && rec64[4][1].length === 30 && rec64[5][0] === 71 && dec.decode(rec64[5][1]) === 'images/video/c/big.mp4' && rec64[6][0] === 93 && rec64[6][1].length === 20 && sameB(rec64[6][1], ref64[5])
        && rec64[7][0] === 113 && rec64[7][1].length === 1 && rec64[7][1][0] === 0xAB && j(res64.skipped) === j(['images/video/c/big.mp4']) && res64.count === 1, j(rec64.slice(0, 9).map(r => [r[0], r[1].length])));
    const zsrc = read('system/app/scripts/zip.js');
    check('both writers build their records with the same three builders (the ZIP64 records pinned above for zipCreate are zipWrite\'s too); in zipWrite an entry\'s bytes and the next entry are placed by the header\'s whole length, its extra counted (source: an entry of 4 GB is not written whole here — the export\'s own read-back checks every entry of the file it made)',
        /var lr = localRecord\(name\.length, size, crc\), cr = centralRecord\(name\.length, size, crc, offset\);/.test(zsrc) && /var tail = tailRecords\(entries\.length, cdSize, offset\);/.test(zsrc)
        && /var lr = localRecord\(name\.length, size, 0\), hlen = 30 \+ name\.length \+ \(lr\[1\] \? lr\[1\]\.byteLength : 0\);/.test(zsrc) && /var cr = centralRecord\(name\.length, size, crc, at\);/.test(zsrc) && /var tail = tailRecords\(count, cdSize, offset\), pos = offset, rest = central\.concat\(tail\);/.test(zsrc)
        && /await put\(at, lr\[0\]\); await put\(at \+ 30, name\); if \(lr\[1\]\) await put\(at \+ 30 \+ name\.length, lr\[1\]\);/.test(zsrc) && /await put\(at \+ hlen \+ st\.got, u8\); st\.c = crcUpdate\(st\.c, u8\); st\.got \+= u8\.length;/.test(zsrc) && /\n        count\+\+; offset \+= hlen \+ size;\n/.test(zsrc)
        && (zsrc.match(/0x04034b50/g) || []).length === 2 && (zsrc.match(/0x02014b50/g) || []).length === 2 && (zsrc.match(/0x06054b50/g) || []).length === 2);
    // the export's reader, opened: its size first, then its bytes part by part
    const exportOpen = new Function('fetch', 'Blob', sliceOf(ioSrc, 'exportfile') + NL + 'return exportOpen;')(() => { throw new Error('the page\'s own fetch is not used here'); }, Blob);
    const openLog = [], openedF = await exportOpen('/a/big.webm', server(files, openLog), 1000), gotParts = [];
    await openedF.pull(async u8 => { gotParts.push(u8.length); });
    const openChanged = await exportOpen('/a/big.webm', server(files, [], { at: 3, answer: (res, d, s, e) => res(206, d.subarray(s, e + 1), 'bytes ' + s + '-' + e + '/' + (d.length + 7)) }), 1000);
    check('a file opened for the straight-to-file writer (exportOpen): its size is known from the first answer, its bytes handed on part by part; one that changes while it is read throws (the writer leaves it out); a missing one is none',
        openedF.size === 2500 && j(gotParts) === j([1000, 1000, 500]) && j(openLog) === j(['/a/big.webm bytes=0-999', '/a/big.webm bytes=1000-1999', '/a/big.webm bytes=2000-2499']) && /changed while it was read/.test(await throws(() => openChanged.pull(async () => {})))
        && await exportOpen('/a/none.png', server(files, []), 1000) === null && (await exportOpen('/a/empty.bin', server(files, []), 1000)).size === 0);
    // a first answer that states a total smaller than what it sent; and a file that had no first range (empty) and is gone when asked for whole
    let goneN = 0; const goneFetch = async () => { goneN++; return { status: goneN === 1 ? 416 : 404, ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }; };
    check('a file is not opened at all when its first answer states a total smaller than what came, or when it had no first range and is gone when asked for whole: never an entry of the wrong size, never an empty file in a missing one\'s place',
        await exportOpen('/a/big.webm', server(files, [], { at: 1, answer: (res, d) => res(206, d.subarray(0, 1000), 'bytes 0-999/500') }), 1000) === null && await exportOpen('/a/x.bin', goneFetch, 1000) === null && goneN === 2);
    const sinkE = mkSink(), resE = await Z.zipWrite(sinkE, [{ name: 'data.json', size: bytesJ.length, pull: chunks(bytesJ, 99) }, { name: 'images/video/c/big.webm', open: () => exportOpen('/a/big.webm', server(files, []), 1000) }, { name: 'images/m/none.png', open: () => exportOpen('/a/none.png', server(files, []), 1000) },
        { name: 'images/video/c/changed.webm', open: () => exportOpen('/a/big.webm', server(files, [], { at: 2, answer: res => res(404, new Uint8Array(0)) }), 1000) }, { name: 'images/m/small.png', open: () => exportOpen('/a/small.png', server(files, []), 1000) }]);
    const openE = await Z.zipOpen(new Blob([sinkE.buf]));
    check('the export\'s reader through the straight-to-file writer and back: the files that came whole, each with its checksum right; the missing one and the one that changed left out and named',
        j(resE.skipped) === j(['images/m/none.png', 'images/video/c/changed.webm']) && resE.count === 3 && j(openE.entries.map(e => e.name)) === j(['data.json', 'images/video/c/big.webm', 'images/m/small.png'])
        && sha(await openE.entries[1].bytes()) === sha(files['/a/big.webm']) && sha(await openE.entries[2].bytes()) === sha(files['/a/small.png']), j(resE));

    /* ---- the app's own use of it (source) ---- */
    check('the export (source): a campaign\'s videos are no longer filtered out; every file is read by exportFile in 32 MB parts; the finished archive is opened again and its list of files counted before it is handed over, and a refusal is said, never a file; the toast counts the videos; a large archive\'s address is kept while it is written',
        /      var paths = collectImagePaths\(payload\);/.test(ioSrc) && !/collectImagePaths\(payload\)\.filter/.test(ioSrc) && /var EXPORT_PART = 32 \* 1024 \* 1024;/.test(ioSrc) && /      for \(var k = 0; k < paths\.length; k\+\+\) \{\n\s*try \{\n\s*var vid = isVideo\(paths\[k\]\);\n\s*if \(vid\) \{ vidAt\+\+; toast\([^\n;]*\); \}\n\s*var fe = await exportFile\(/.test(ioSrc) && /var fe = await exportFile\(encodeURI\(paths\[k\]\), zip\);\n\s*if \(!fe\) \{ skipped\.push\(paths\[k\]\.replace\(\/\^\\\/saves\\\/\/, ''\)\); continue; \}\n\s*entries\.push\(\{ name: paths\[k\]\.replace\(\/\^\\\/saves\\\/\/, ''\), data: fe\.data, crc: fe\.crc \}\);/.test(ioSrc)
        && /zblob = zip\.zipCreate\(entries\);\n\s*var zback = await zip\.zipOpen\(zblob\);\n\s*if \(zback\.entries\.length !== entries\.filter\(function\(en\) \{ return !\/\\\/\$\/\.test\(en\.name\); \}\)\.length\) throw new Error\(/.test(ioSrc)
        && /toast\(e && e\.name === 'NotReadableError' \? 'The export is too large for this window to hold in one piece\. Nothing was written\.' : 'The export could not be written: ' \+ [^\n]*\n\s*return null;/.test(ioSrc) && /\(r\.videos \? ', ' \+ r\.videos \+ ' video\(s\)' : ''\)/.test(ioSrc) && /blob && blob\.size > 50 \* 1024 \* 1024 \? 600000 : 1000/.test(ioSrc)
        && !/new Uint8Array\(await r\.arrayBuffer\(\)\) \}\);\n\s*\} catch\(e\) \{ missing\+\+; \}/.test(ioSrc));
    const bigSrc = ioSrc.slice(ioSrc.indexOf('      if (handle) {'), ioSrc.indexOf('      for (var k = 0; k < paths.length; k++) {'));
    check('a large export (source): when the campaign\'s videos and music pass 1 GB (by its libraries\' own sizes) and the window can ask, the GM picks the file first (while the click still counts; canceling makes no export) and the archive is written straight to it — data.json and the pack files from memory, each file opened and pulled part by part; then the file is read back, its size and count compared and every entry\'s checksum checked before it is called exported; a failure aborts an unfinished file, takes away a finished one found wrong, and says so; nothing is downloaded twice',
        /var EXPORT_BIG = 1024 \* 1024 \* 1024;/.test(ioSrc) && /if \(typeof window\.showSaveFilePicker === 'function' && exportMediaBytes\(scope, share && share\.leave\) > EXPORT_BIG\) \{\n\s*try \{ handle = await window\.showSaveFilePicker\(\{ suggestedName: exportBaseName\(scope\) \+ '\.zip',/.test(ioSrc)
        && /catch \(e\) \{ if \(e && e\.name === 'AbortError'\) return; handle = null; \}/.test(ioSrc) && /var r = await buildExport\(scope, handle, share\);/.test(ioSrc) && /if \(!r\.saved\) downloadBlob\(r\.name, r\.blob\);/.test(ioSrc)
        && bigSrc.length > 800 && /paths\.forEach\(function\(p\) \{ sEntries\.push\(\{ name: p\.replace\(\/\^\\\/saves\\\/\/, ''\), open: function\(\) \{ return exportOpen\(encodeURI\(p\)\); \} \}\); \}\);/.test(bigSrc)
        && /res = await zip\.zipWrite\(\{ write: function\(pos, data\) \{ return w\.write\(\{ type: 'write', position: pos, data: data \}\); \}, truncate: function\(n\) \{ return w\.truncate\(n\); \} \}, sEntries, say\);\n\s*await w\.close\(\); w = null;/.test(bigSrc)
        && /var zfile = await handle\.getFile\(\), zread = await zip\.zipOpen\(zfile\);\n\s*if \(zfile\.size !== res\.size \|\| zread\.entries\.length !== res\.count\) throw new Error\([^\n]*\n\s*for \(var zi = 0; zi < zread\.entries\.length; zi\+\+\) await zread\.entries\[zi\]\.check\(\);/.test(bigSrc)
        && /var w = null, res = null, closed = false;/.test(bigSrc) && /await w\.close\(\); w = null; closed = true;/.test(bigSrc) && /var left = await exportFailTidy\(handle, w, closed\);/.test(bigSrc) && /return \{ name: handle\.name \|\| \(base \+ '\.zip'\), saved: true,/.test(bigSrc));
    const exVid = new Function('state', 'getActiveCampaign', 'slugName', 'fetch', 'Blob', sliceOf(ioSrc, 'exportfile') + NL + 'return { exportMediaBytes: exportMediaBytes, exportBaseName: exportBaseName };');
    const stV = { appState: { campaigns: { a: { name: 'A B', videos: [{ size: 600000000 }, { size: 500000000 }, { size: 'x' }, null, { size: -5 }, { size: Infinity }], music: { tracks: [{ size: 20000000 }, { size: 'y' }, null, { size: 3 }] } }, b: { videos: [{ size: 7 }], music: { tracks: 'x' } }, c: { videos: 'x', music: 'x' }, d: null, e: { music: { tracks: [{ size: 100 }] } } } } };
    const evA = exVid(stV, () => stV.appState.campaigns.a, s => String(s).toLowerCase().replace(/ /g, '-'), null, Blob);
    check('how large an export will be is judged from the libraries\' own sizes (exportMediaBytes, run for real): this campaign\'s videos and songs for Export this campaign, every campaign\'s for Everything, nothing for the other scopes; only sizes that are numbers above 0 count',
        evA.exportMediaBytes('campaign') === 1120000003 && evA.exportMediaBytes('all') === 1120000110 && evA.exportMediaBytes('item') === 0 && evA.exportMediaBytes('maps') === 0 && evA.exportBaseName('campaign') === 'a-b-campaign' && evA.exportBaseName('all') === 'waypoint-everything'
        && exVid({ appState: null }, () => null, s => s, null, Blob).exportMediaBytes('all') === 0 && exVid({ appState: null }, () => null, s => s, null, Blob).exportMediaBytes('campaign') === 0);
    const exSay = new Function('fetch', 'Blob', sliceOf(ioSrc, 'exportfile') + NL + 'return { exportTally: exportTally, exportDoneWords: exportDoneWords, exportLeftWords: exportLeftWords, exportFailTidy: exportFailTidy };')(null, Blob);
    check('what an export says of itself (exportTally / exportDoneWords, run for real): a file left out is taken off the count of its kind and counted as missing, and the closing line says how many — an archive short of a file is never called whole; both ways of writing an export and the closing line go through them (source)',
        j(exSay.exportTally(212, 3, ['images/video/c/a.webm', 'images/m/b.png'])) === j({ images: 211, videos: 2, missing: 2 }) && j(exSay.exportTally(5, 0, [])) === j({ images: 5, videos: 0, missing: 0 }) && j(exSay.exportTally(4, 2, ['images/video/c/a.webm', 'images/video/c/b.webm'])) === j({ images: 4, videos: 0, missing: 2 })
        && exSay.exportDoneWords({ name: 'a.zip', images: 211, videos: 2, missing: 2 }) === 'Exported a.zip (211 image(s), 2 video(s), 2 missing).' && exSay.exportDoneWords({ name: 'a.zip', images: 5, videos: 0, missing: 0 }) === 'Exported a.zip (5 image(s)).'
        && /var tallyS = exportTally\(nImg, nVid, res\.skipped\);\n\s*return \{ name: handle\.name \|\| \(base \+ '\.zip'\), saved: true, images: tallyS\.images, videos: tallyS\.videos, library: libFiles\.length, missing: tallyS\.missing, libMissing: libMissing, unlisted: unlisted \};/.test(ioSrc)
        && /\} catch\(e\) \{ skipped\.push\(paths\[k\]\.replace\(\/\^\\\/saves\\\/\/, ''\)\); \}/.test(ioSrc)
        && /var tallyB = exportTally\(nImg, nVid, skipped\);\n\s*return \{ name: base \+ '\.zip', blob: zblob, images: tallyB\.images, videos: tallyB\.videos, library: libFiles\.length, missing: tallyB\.missing, libMissing: libMissing, unlisted: unlisted \};/.test(ioSrc)
        && /if \(!r\.saved\) downloadBlob\(r\.name, r\.blob\);\n\s*toast\(exportDoneWords\(r\)\);/.test(ioSrc));
    // The owed review, 2026-10-09 (backlog 137). An export left a library pack it could not read, and the campaign's pictures no map uses yet
    // when their list could not be had, out without a word. And a large export that could not open the picked file for writing removed
    // that file, which it had written none of: it may be last week's export
    {
        const W1 = ' One library pack could not be read and was left out.', W3 = ' 3 library packs could not be read and were left out.', WU = ' The pictures no map uses yet could not be listed and were left out.';
        const left = [exSay.exportLeftWords({}), exSay.exportLeftWords({ libMissing: 0, unlisted: false }), exSay.exportLeftWords({ libMissing: 1 }), exSay.exportLeftWords({ libMissing: 3 }), exSay.exportLeftWords({ unlisted: true }), exSay.exportLeftWords({ libMissing: 2.9, unlisted: true }),
            exSay.exportLeftWords({ libMissing: 'x', unlisted: 'yes' }), exSay.exportLeftWords({ libMissing: -4, unlisted: 1 }), exSay.exportLeftWords(null), exSay.exportLeftWords(undefined)];
        const tidy = async (w, closed, h) => { const log = [], handle = h === 'none' ? {} : { remove: async () => { log.push('remove'); if (h === 'throws') throw new Error('x'); } };
            const wr = w ? { abort: async () => { log.push('abort'); if (w === 'throws') throw new Error('x'); } } : null; return [await exSay.exportFailTidy(handle, wr, closed), log.join()]; };
        const tidied = [await tidy(null, false), await tidy(null, false, 'none'), await tidy('open', false), await tidy('throws', false), await tidy('open', true), await tidy(null, true), await tidy(null, true, 'throws'), await tidy(null, true, 'none'), await tidy(null, undefined), await tidy(null, 'yes')];
        check('what an export leaves out is said, and a file it did not write is never removed (the owed review of 2026-10-09; io.js exportLeftWords, exportDoneWords and exportFailTidy, run for real): a library pack that could not be read is counted and said at the end, one or several, and so is the list of the campaign\'s unused pictures when it could not be had, on an archive and on a plain file alike; with nothing left out the closing line is as it was. When a large export fails, a file that was never opened for writing is left as it was, an unfinished one is aborted and nothing more, a finished one found wrong is taken away, and one that cannot be taken away is said to be left; the pack loop and the picture list count what they could not read (source)',
            j(left) === j(['', '', W1, W3, WU, ' 2 library packs could not be read and were left out.' + WU, '', '', '', ''])
            && exSay.exportDoneWords({ name: 'a.zip', images: 5, videos: 0, missing: 0, libMissing: 1, unlisted: true }) === 'Exported a.zip (5 image(s)).' + W1 + WU && exSay.exportDoneWords({ name: 'a.zip', images: 5, videos: 0, missing: 0, libMissing: 0, unlisted: false }) === 'Exported a.zip (5 image(s)).'
            && j(tidied) === j([[false, ''], [false, ''], [false, 'abort'], [false, 'abort'], [false, 'abort'], [false, 'remove'], [true, 'remove'], [true, ''], [false, ''], [false, 'remove']])
            && ioSrc.includes("else libMissing++; } catch (e) { libMissing++; }") && ioSrc.includes("          if (!(await exportListed(scope, payload, paths))) unlisted = true;\n") && ioSrc.includes("      } catch (e) { return false; }\n") && ioSrc.includes("return { name: base + '.json', text: json, libMissing: libMissing, unlisted: unlisted };") && ioSrc.includes("toast('Exported ' + r.name + '.' + exportLeftWords(r));"), j([left, tidied]));
    }
    const zipBranch = mainSrc.slice(mainSrc.indexOf("      if (/\\.zip$/i.test(file.name)) {"), mainSrc.indexOf('      var reader = new FileReader();'));
    check('the import (source): the picked file is opened by slices, never read whole; data.json is read then (by its checksum; one past 512 MB refused), the pack files, the pictures and the videos kept as entries; each is copied only after check() found its checksum right, the Blob itself sent (a slice of the picked file), and a failure is counted and said',
        zipBranch.length > 400 && /var zopen = await zip\.zipOpen\(file\), entries = zopen\.entries;\n\s*pendingImportBytes = zopen\.size;/.test(zipBranch) && !/arrayBuffer\(\)/.test(zipBranch) && !/zipRead\(/.test(zipBranch) && /if \(dj\.size > 512 \* 1024 \* 1024\) \{ toast\(/.test(zipBranch) && /var djText = new TextDecoder\(\)\.decode\(await dj\.bytes\(\)\);/.test(zipBranch)
        && /pendingImportImages = entries\.filter\(function\(en\) \{ var s = importDest\(en\.name\); return \/\^images\\\/\/\.test\(en\.name\) && s\.length >= 2 && s\[0\] === 'images' && !\/\^journal\[\. \]\*\$\/i\.test\(s\[1\]\); \}\);/.test(zipBranch) && /libE\.forEach\(function\(en\) \{ pendingImportLibrary\[en\.name\] = en; \}\);/.test(zipBranch) && !/libE\[li\]\.bytes\(\)/.test(zipBranch)
        && /var body = await imgs\[i\]\.check\(\);[^\n]*\n\s*var r = await fetch\('\/api\/upload-exact\?keep=1&path=' \+ encodeURIComponent\(relPath\), \{ method: 'POST', body: body \}\);[^\n]*\n\s*if \(r\.ok\) ok\+\+; else if \(r\.status === 409\) kept\+\+; else fail\+\+;\n\s*\} catch\(err\) \{ fail\+\+; \}/.test(mainSrc)
        && /toast\('Files copied: ' \+ ok \+ \(kept \? ', ' \+ kept \+ ' already here' : ''\) \+ \(fail \? ', ' \+ fail \+ ' failed/.test(mainSrc) && !/new Blob\(\[imgs\[i\]\.data\]\)/.test(mainSrc));
    // the security pass of 2026-10-01: what an import copies back, and how — main.js sliced by its importpick and importcopy markers and run for real on
    // an archive of plain entries. An archive from elsewhere must never replace a file of yours: not a player's Journal (images/journal/, which no export
    // carries and the import now leaves out whole) and not a picture, portrait or another campaign's file already on disk (every copy asks the saves
    // folder to keep what is there — keep=1 — and a 409 is counted as already here, never as a failure, so your own export imported again still reads as done)
    const sliceMain = name => { try { return sliceOf(mainSrc, name); } catch (e) { return ''; } };
    const pickSrc = sliceMain('importpick'), copySrc = sliceMain('importcopy');
    const ent = (name, size) => ({ name, size: size || 10, csize: size || 10, method: 0, check: async function() { return new Uint8Array(this.size); } });
    // the outside audit of 2026-10-01: the same folder under other spellings — an empty segment, a percent-encoded letter (the copy decodes a name once, the
    // saves folder once more), a trailing dot or space — and two honest names that hold a percent sign
    const journalSpelt = ['images//journal/k/journal.json', 'images///journal//k//e.png', 'images//journal/journals.json', 'images/%6aournal/k/a.png', 'images/%6Aournal/campA__gm1/journal.json', 'images/%6aournal/journals.json', 'images/%256aournal/k/b.png', 'images/%25256aournal/k/b2.png', 'images/journal./k/c.png', 'images/journal /k/d.png', 'images/JOURNAL%2Fk/f.png', 'images/journal%2Fk%2Fjournal.json', 'images%2Fjournal%2Fk%2Fg.png'];
    const archive = [ent('data.json'), ent('images/journal/journals.json'), ent('images/journal/campA__gm1/journal.json'), ent('images/Journal/x.png'), ent('images/journal'), ent('images/journalx/y.png'), ent('images/m_abc/x1_pic.png'), ent('images/portraits/portrait-c1-k.png'), ent('images/video/c/k_clip.mp4'), ent('library/l_abcd1234/p_a.1.json')].concat(journalSpelt.map(n => ent(n)), [ent('images/m/50%.png'), ent('images/m/a%20b.png')]);
    let picked = null; try { picked = new Function('entries', '"use strict"; var pendingImportImages = null;' + NL + pickSrc + NL + 'return pendingImportImages;')(archive); } catch (e) { picked = 'threw: ' + e.message; }
    const names = Array.isArray(picked) ? picked.map(e => e.name) : picked;
    check('the import (main.js importpick, run for real): of an archive\'s entries only those under images/ are kept for copying, and never one that would land under images/journal/ (a player\'s Journal, which no export carries) nor a file of that name — judged on the name as the copy and the saves folder will read it, so another case, an empty segment, a percent-encoded letter or separator (encoded once, twice or three times) and a trailing dot or space are all left out; a picture folder whose name merely begins with journal, and an honest name that holds a percent sign, are kept like any other',
        pickSrc.length > 40 && j(names) === j(['images/journalx/y.png', 'images/m_abc/x1_pic.png', 'images/portraits/portrait-c1-k.png', 'images/video/c/k_clip.mp4', 'images/m/50%.png', 'images/m/a%20b.png']), j(names));
    const urlsK = [], toastsK = [], bodiesK = [];
    const fetchK = async (url, init) => { urlsK.push(url); bodiesK.push(init && init.body instanceof Uint8Array ? init.body.length : 'no body'); return /x1_pic/.test(url) ? { ok: false, status: 409 } : /k_clip/.test(url) ? { ok: false, status: 500 } : { ok: true, status: 200 }; };
    let copyRan = false;
    try {
        const copyFn = new Function('imgs', 'msg', 'toast', 'fetch', 'render', 'pendingImportBytes', '"use strict";' + NL + copySrc);
        copyRan = await new Promise(res => { const t = setTimeout(() => res(false), 4000); copyFn(Array.isArray(picked) ? picked : [], 'Imported.', m => toastsK.push(m), fetchK, () => { clearTimeout(t); res(true); }, 100000); });
    } catch (e) { toastsK.push('threw: ' + e.message); }
    // where each posted address lands: the query value as the saves folder reads it (decoded by the URL parser, then once more), empty segments dropped
    const landsK = urlsK.map(u => { let p = new URL(u, 'http://localhost').searchParams.get('path') || ''; try { p = decodeURIComponent(p); } catch (e) {} return p.split('/').filter(Boolean); });
    check('the import (main.js importcopy, run for real): every file is copied with keep=1 — the saves folder keeps a file already there — and its bytes only after check(); a 409 counts as already here and a refusal as failed, and the closing line says how many of each; no address lands in the Journal folder, read the way the saves folder reads it',
        copySrc.length > 400 && copyRan && urlsK.length === 6 && urlsK.every(u => /^\/api\/upload-exact\?keep=1&path=images%2F/.test(u)) && landsK.every(s => s[0] === 'images' && !/^journal[. ]*$/i.test(s[1])) && j(landsK[5]) === j(['images', 'm', 'a b.png']) && j(bodiesK) === j([10, 10, 10, 10, 10, 10])
        && toastsK[toastsK.length - 1] === 'Files copied: 4, 1 already here, 1 failed (damaged in the archive, or refused by the saves folder).' && toastsK[0] === 'Imported. Copying 5 image(s) and 1 video(s)…', j([urlsK, toastsK, bodiesK]));

    /* ---- 1.6.2 backlog 235 (the website coordinator, 2026-11-14): a browser import that says what landed. On a website's page the play host
       answers an import's writes 413 { error: "too-large", max }, 413 { error: "quota" }, 429 { error: "daily-upload" } and 403 for a Player plan.
       medialimit.js importsay (the reader and the closing words) and main.js importweb (the copy itself) run for real on stand-ins ---- */
    {
        let IS = null, isErr = '';
        try { IS = await import(url('medialimit.js')); } catch (e) { isErr = e.message; }
        const isSrc = (() => { try { return sliceOf(read('system/app/scripts/medialimit.js'), 'importsay'); } catch (e) { return ''; } })();
        const ans = (status, body, opts) => { const o = opts || {}; return { ok: status >= 200 && status < 300, status, clone() { if (o.noClone) throw new Error('read on the desktop'); return { json: async () => { if (body === undefined) throw new Error('not json'); return body; } }; }, json: async () => { throw new Error('the answer itself is never read'); } }; };
        const MAX = 33554432;
        const reads = IS ? await Promise.all([ans(413, { error: 'too-large', max: MAX }), ans(413, { error: 'quota' }), ans(429, { error: 'daily-upload', resetsAt: 9 }), ans(403, { error: 'plan' }), ans(403), ans(429, { error: 'slow' }), ans(413), ans(500, { error: 'x' }, { noClone: true }), ans(409, null, { noClone: true })].map(r => IS.readRefusal(r))) : [];
        check('backlog 235: a refused answer is named by its status and its body\'s one word (medialimit.js readRefusal and refusalOf, run for real): 413 too-large (with its limit) and a 413 with no word are too large for the browser, 413 quota is the storage full, 429 daily-upload is the day\'s uploads used up, any other 429 the host busy, 403 the plan; a 500 or a 409 is never read for a reason, and a copy of the answer is read, never the answer itself',
            !!IS && isSrc.length > 400 && j(reads.map(r => [r.status, r.why, r.max])) === j([[413, 'too-large', MAX], [413, 'quota', 0], [429, 'daily', 0], [403, 'plan', 0], [403, 'plan', 0], [429, 'busy', 0], [413, 'too-large', 0], [500, '', 0], [409, '', 0]])
            && ['quota', 'daily', 'plan', 'busy'].every(w => IS.refusalStops(w)) && !IS.refusalStops('too-large') && !IS.refusalStops('') && !IS.tryAgainFor('too-large') && !IS.tryAgainFor('damaged') && IS.tryAgainFor('quota') && IS.tryAgainFor(''), isErr || j(reads));
        const words1 = w => { const t = IS.importTally(); IS.tallyAdd(t, 'picture', 'left', w); return IS.tallyWords(t); };
        check('backlog 235: each reason is one plain sentence (medialimit.js tallyWords, run for real): too large for the browser, use the desktop app for this file; your storage on the website is full; today\'s upload limit is reached, and the rest can come tomorrow; your plan does not let you bring campaigns in',
            !!IS && words1('too-large') === 'Nothing was brought in. Not brought in: 1 picture. Too large for the browser: use the desktop app for this file.'
            && words1('quota') === 'Nothing was brought in. Not brought in: 1 picture. Your storage on the website is full.'
            && words1('daily') === 'Nothing was brought in. Not brought in: 1 picture. Today’s upload limit is reached, and the rest can come tomorrow.'
            && words1('plan') === 'Nothing was brought in. Not brought in: 1 picture. Your plan does not let you bring campaigns in.', IS && j(['too-large', 'quota', 'daily', 'plan'].map(words1)));

        const webSrc = (() => { try { return sliceOf(mainSrc, 'importweb'); } catch (e) { return ''; } })();
        let importOnWeb = null; try { importOnWeb = new Function('"use strict";' + NL + webSrc + NL + 'return importOnWeb;')(); } catch (e) { importOnWeb = null; }
        const D = (answer, opts) => {
            const o = opts || {}, R = { urls: [], toasts: [], actions: [], logs: [], libCalls: [], saves: 0, rendered: 0 };
            const Dx = { IS: { why: IS.refusalOf, stops: IS.refusalStops, again: IS.tryAgainFor, read: IS.readRefusal, kind: IS.importKind, tally: IS.importTally, add: IS.tallyAdd, left: IS.tallyLeft, words: IS.tallyWords },
                toast: m => R.toasts.push(m), toastAction: (m, label, fn, ms) => R.actions.push({ m, label, fn, ms }), render: () => R.rendered++, log: (step, f) => R.logs.push([step, f]),
                fetch: async (u, init) => { R.urls.push(u); return answer(u, init); },
                save: () => { R.saves++; return Promise.resolve(o.saveAgain || { status: 200, why: '', max: 0 }); },
                lib: { importFiles: async (jobs, files, op) => { R.libCalls.push(jobs.map(x => x.uploads.map(u => u.pack))); const rows = []; let stop = ''; for (const jb of jobs) for (const u of jb.uploads) { if (stop) { rows.push({ camp: jb.camp, upload: u, how: 'left', why: stop, max: 0 }); continue; } const r = o.pack ? o.pack(u) : { ok: true, status: 200 }; if (r.ok) { rows.push({ camp: jb.camp, upload: u, how: 'landed', why: '', max: 0 }); continue; } const an = await op.read(ans(r.status, r.body)); rows.push({ camp: jb.camp, upload: u, how: 'left', why: an.why, max: an.max, status: an.status }); if (op.stops(an.why)) stop = an.why; } return { ok: 0, bad: 0, rows }; } } };
            return { Dx, R };
        };
        const run = (job, d) => importOnWeb ? importOnWeb(job, d.Dx) : Promise.reject(new Error('no importOnWeb'));
        const files = names => names.map(n => ent(n));
        const nameOf = u => decodeURIComponent((u.match(/path=([^&]*)/) || [])[1] || '');
        const noNames = R => !/images\/|\.png|\.mp4|\.mp3|p_[a-z]/.test(j(R.logs)) && R.logs.every(l => Object.keys(l[1]).every(k => ['again', 'save', 'packs', 'files', 'kind', 'status', 'why', 'landed', 'here', 'left', 'stop'].includes(k)));

        // a mixed run: the campaign and a pack land, one picture lands, one was already here, a video too large, a picture refused for no reason given
        const d1 = D(async u => { const n = nameOf(u); return n === 'images/m/b.png' ? ans(409) : n === 'images/video/c/big.mp4' ? ans(413, { error: 'too-large', max: MAX }) : n === 'images/m/c.png' ? ans(500, {}) : ans(200); }, { pack: () => ({ ok: true }) });
        const job1 = { msg: 'Imported.', saved: Promise.resolve({ status: 200, why: '', max: 0 }), libJobs: [{ camp: 'c1', uploads: [{ pack: 'p_a' }] }], libFiles: {}, imgs: files(['images/m/a.png', 'images/m/b.png', 'images/video/c/big.mp4', 'images/m/c.png', 'images/m/song.mp3']), bytes: 100000 };
        let t1 = null; try { t1 = await run(job1, d1); } catch (e) { d1.R.toasts.push('threw: ' + e.message); }
        const a1 = d1.R.actions[0] || {};
        check('backlog 235: the closing words list what landed and what did not, by kind and by count, and name each refusal once (main.js importOnWeb, run for real on stand-ins): the campaign, a library pack, a picture and a sound brought in, one already here (409 under keep=1), a video too large for the browser with its limit, a picture that could not be written; Try again is offered on the notice, up for 30 s',
            webSrc.length > 400 && !!t1 && a1.label === 'Try again' && a1.ms === 30000
            && a1.m === 'Brought in: the campaign, 1 library pack, 1 picture and 1 sound, and 1 file was already here. Not brought in: 1 picture and 1 video. Too large for the browser (32 MB at most): use the desktop app for this file. One was damaged in the archive or could not be written.'
            && d1.R.toasts[0] === 'Imported. Copying 4 image(s) and 1 video(s)…' && d1.R.urls.length === 5 && d1.R.urls.every(u => /^\/api\/upload-exact\?keep=1&path=images%2F/.test(u)) && d1.R.rendered === 1, j([d1.R.toasts, d1.R.actions.map(a => [a.m, a.label, a.ms]), d1.R.urls]));
        // Try again: only the picture that could not be written is asked for again (not the video too large, not what landed); the host now says it is there
        let d1Again = null;
        if (a1.fn) { const before = d1.R.urls.length; d1.Dx.fetch = async u => { d1.R.urls.push(u); return ans(409); }; a1.fn(); await new Promise(r => setTimeout(r, 30)); d1Again = d1.R.urls.slice(before); }
        check('backlog 235: Try again asks again for what did not land and only that: the picture the host could not write, never what landed, the file already here, or the video too large for the browser; a 409 then counts as already here, the campaign is not saved again, and the closing words say so with no button',
            j((d1Again || []).map(nameOf)) === j(['images/m/c.png']) && d1.R.saves === 0 && d1.R.toasts.includes('Trying again…') && d1.R.toasts[d1.R.toasts.length - 1] === 'The file was already here.' && d1.R.actions.length === 1, j([d1Again, d1.R.toasts]));

        // the day's uploads used up on the second file: the copy stops at once, the rest never sent, what is left said
        const d2 = D(async u => nameOf(u) === 'images/m/2.png' ? ans(429, { error: 'daily-upload', resetsAt: 1 }) : ans(200));
        const job2 = { msg: 'Imported.', saved: Promise.resolve({ status: 200, why: '', max: 0 }), libJobs: [], libFiles: {}, imgs: files(['images/m/1.png', 'images/m/2.png', 'images/m/3.png', 'images/video/c/4.mp4']), bytes: 100000 };
        try { await run(job2, d2); } catch (e) { d2.R.toasts.push('threw: ' + e.message); }
        const a2 = d2.R.actions[0] || {};
        let d2Again = null;
        if (a2.fn) { const before = d2.R.urls.length; d2.Dx.fetch = async u => { d2.R.urls.push(u); return ans(200); }; a2.fn(); await new Promise(r => setTimeout(r, 30)); d2Again = d2.R.urls.slice(before).map(nameOf); }
        check('backlog 235: a daily-cap stop ends the copy at once (main.js importOnWeb, run for real): after the 429 daily-upload no other file is sent, the closing words say what is still to come and that the rest can come tomorrow, and Try again sends the refused file and the ones never sent, in order, and the video\'s own notice comes only when it is sent',
            j(d2.R.urls.slice(0, 2).map(nameOf)) === j(['images/m/1.png', 'images/m/2.png']) && a2.label === 'Try again'
            && a2.m === 'Brought in: the campaign and 1 picture. Still to come: 2 pictures and 1 video. Today’s upload limit is reached, and the rest can come tomorrow.'
            && d2.R.toasts.indexOf('Copying video 1 of 1…') > d2.R.toasts.indexOf('Trying again…')
            && j(d2Again) === j(['images/m/2.png', 'images/m/3.png', 'images/video/c/4.mp4']) && d2.R.toasts[d2.R.toasts.length - 1] === 'Brought in: 2 pictures and 1 video.', j([d2.R.urls, d2.R.toasts, a2.m, d2Again]));

        // the storage full on a library pack: the second pack and every file are never sent
        const d3 = D(async () => ans(200), { pack: u => u.pack === 'p_b' ? { ok: false, status: 413, body: { error: 'quota' } } : { ok: true } });
        const job3 = { msg: 'Imported.', saved: Promise.resolve({ status: 200, why: '', max: 0 }), libJobs: [{ camp: 'c1', uploads: [{ pack: 'p_a' }, { pack: 'p_b' }, { pack: 'p_c' }] }], libFiles: {}, imgs: files(['images/m/1.png', 'images/m/2.png']), bytes: 100000 };
        try { await run(job3, d3); } catch (e) { d3.R.toasts.push('threw: ' + e.message); }
        const a3 = d3.R.actions[0] || {};
        let d3Again = null;
        if (a3.fn) { const before = d3.R.libCalls.length; a3.fn(); await new Promise(r => setTimeout(r, 30)); d3Again = d3.R.libCalls.slice(before); }
        check('backlog 235: the storage full stops the copy at once, a library pack\'s refusal as much as a file\'s (main.js importOnWeb and library.js importFiles\' reader): no file is sent after a pack is refused for quota, the closing words say what is still to come, and Try again asks again for the refused pack and those after it, never the one that landed',
            d3.R.urls.length === 0 && a3.m === 'Brought in: the campaign and 1 library pack. Still to come: 2 library packs and 2 pictures. Your storage on the website is full.' && j(d3Again) === j([[['p_b', 'p_c']]]), j([d3.R.urls, a3.m, d3Again]));

        // a Player plan: the campaign's own save is refused, so nothing else is asked for
        const d4 = D(async () => ans(200));
        const job4 = { msg: 'Imported.', saved: Promise.resolve({ status: 403, why: 'plan', max: 0 }), libJobs: [{ camp: 'c1', uploads: [{ pack: 'p_a' }] }], libFiles: {}, imgs: files(['images/m/1.png']), bytes: 100000 };
        try { await run(job4, d4); } catch (e) { d4.R.toasts.push('threw: ' + e.message); }
        const a4 = d4.R.actions[0] || {};
        let d4Again = null; const d4Before = [d4.R.urls.length, d4.R.libCalls.length];
        if (a4.fn) { a4.fn(); await new Promise(r => setTimeout(r, 30)); d4Again = [d4.R.saves, d4.R.urls.length, d4.R.libCalls.length]; }
        check('backlog 235: a plan that brings nothing in (403 on the campaign\'s save) asks the host for nothing more: no pack, no file; the closing words name the plan and what is still to come, and Try again saves the campaign again before the rest',
            j(d4Before) === j([0, 0]) && a4.m === 'Nothing was brought in. Still to come: the campaign, 1 library pack and 1 picture. Your plan does not let you bring campaigns in.' && j(d4Again) === j([1, 1, 1]), j([d4.R.toasts, a4.m, d4Again]));

        // a campaign too large for the browser: no Try again (it would be refused again), the desktop app named
        const d5 = D(async () => ans(200));
        try { await run({ msg: 'Imported.', saved: Promise.resolve({ status: 413, why: 'too-large', max: MAX }), libJobs: [], libFiles: {}, imgs: files(['images/m/1.png']), bytes: 100000 }, d5); } catch (e) { d5.R.toasts.push('threw: ' + e.message); }
        check('backlog 235: a campaign too large for the browser sends nothing more and offers no Try again (it would only be refused again): the closing words point to the desktop app',
            d5.R.urls.length === 0 && d5.R.actions.length === 0 && d5.R.toasts[d5.R.toasts.length - 1] === 'Nothing was brought in. Not brought in: the campaign and 1 picture. Too large for the browser (32 MB at most): use the desktop app for this file.', j(d5.R.toasts));

        // a whole import that lands: the closing words alone, no button; a plain file with nothing to copy keeps the import's own line
        const d6 = D(async () => ans(200)), d7 = D(async () => ans(200));
        try { await run({ msg: 'Imported.', saved: Promise.resolve({ status: 200, why: '', max: 0 }), libJobs: [], libFiles: {}, imgs: files(['images/m/1.png']), bytes: 100000 }, d6); await run({ msg: 'Merged 2 items.', saved: Promise.resolve({ status: 200 }), libJobs: [], libFiles: {}, imgs: [], bytes: 0 }, d7); } catch (e) { d6.R.toasts.push('threw: ' + e.message); }
        check('backlog 235: an import that lands whole says what landed and offers nothing more; one with no files keeps the import\'s own line alone',
            j(d6.R.toasts) === j(['Imported. Copying 1 image(s)…', 'Brought in: the campaign and 1 picture.']) && d6.R.actions.length === 0 && j(d7.R.toasts) === j(['Merged 2 items.']) && d7.R.actions.length === 0, j([d6.R.toasts, d7.R.toasts]));

        check('backlog 235: the steps are logged through the house step log as import v1, counts and statuses only, never a file\'s name, a pack\'s id or anything a file holds; each refusal logged once for its kind and status',
            [d1, d2, d3, d4, d5].every(d => noNames(d.R)) && j(d1.R.logs.filter(l => l[0] === 'refused')) === j([['refused', { kind: 'video', status: 413, why: 'too-large' }], ['refused', { kind: 'picture', status: 500, why: 'none' }]])
            && j(d2.R.logs.find(l => l[0] === 'closed')) === j(['closed', { landed: 2, here: 0, left: 3, stop: 'daily', again: 1 }]) && /'import v1'/.test(mainSrc), j([d1.R.logs, d2.R.logs]));

        // the desktop app: none of this runs there, and its own copy and words are as they were
        const fin = mainSrc.slice(mainSrc.indexOf('  function finishImport(msg) {'), mainSrc.indexOf('  // [zipcheck:importcopy-start]'));
        const hereSrc = (mainSrc.match(/  function importOnWebHere\(\) \{[^\n]*\}\n/) || [''])[0];
        let hereDesk = null; try { hereDesk = [new Function('window', hereSrc + 'return importOnWebHere();')({}), new Function('window', hereSrc + 'return importOnWebHere();')({ wpWebMode: { web: () => false }, wpImportSay: { tally() {} } }), new Function('window', hereSrc + 'return importOnWebHere();')({ wpWebMode: { web: () => true }, wpImportSay: { tally() {} } })]; } catch (e) { hereDesk = e.message; }
        const ioN = read('system/app/scripts/io.js'), saSrc = (ioN.match(/  function saveAnswer\(raw\) \{\n[\s\S]*?\n  \}\n/) || [''])[0];
        let saDesk = null; try { const fn = new Function('window', saSrc + 'return saveAnswer;')({ wpWebMode: { web: () => false }, wpImportSay: { read: () => { throw new Error('read on the desktop'); } } }); saDesk = await Promise.all([fn(Promise.resolve(ans(413, { error: 'too large' }, { noClone: true }))), fn(Promise.resolve(ans(200, null, { noClone: true }))), fn(Promise.reject(new Error('offline')))]); } catch (e) { saDesk = e.message; }
        const lbN = read('system/app/scripts/library.js');
        check('backlog 235: on the desktop app nothing changes: the import\'s own copy (importcopy) and its closing words are as they were, it runs whenever the page is no website\'s, the packs are copied with their own line as before, and the save hands back its status alone, never reading a refusal\'s body (the reader runs only on a website\'s page)',
            j(hereDesk) === j([false, false, true]) && /\n      if \(webI\) \{ importOnWeb\(\{ msg: msg, saved: savedI, libJobs: libJobs, libFiles: libFiles \|\| \{\}, imgs: imgs, bytes: pendingImportBytes \}, importWebDeps\(\)\); return; \}\n\n      if \(!imgs\.length\) \{ toast\(msg\); return; \}\n/.test(fin)
            && /var savedI = save\(true\);/.test(fin) && /window\.wpLibrary\.importFiles && !webI\) window\.wpLibrary\.importFiles\(libJobs, libFiles \|\| \{\}\);/.test(fin)
            && j(saDesk) === j([{ status: 413, why: '', max: 0 }, { status: 200, why: '', max: 0 }, { status: 0, why: '', max: 0 }])
            && lbN.includes("    if ((ok || bad) && !opts) toast('Library packs copied: ' + ok + (bad ? ', ' + bad + ' could not be' : '') + '.');") && lbN.includes('busy++; var ok = 0, bad = 0, rows = opts ? [] : null'), j([hereDesk, saDesk]));
    }

    /* ---- 1.6.0 backlog 34: the export share sheet. The owner, 2026-10-29, by prompt: Export this campaign, Share this campaign and Export
       Everything open it ("all of the above"; Share with Players unticked), the card is "share.json beside data.json (Recommended)", and "Yes, a
       Players tick (Recommended)". sharecore.js run for real; io.js and share.js pinned; the sheet's own run is the live check ---- */
    {
        let S = null, sErr = null;
        try { S = await import(url('sharecore.js')); } catch (e) { sErr = e; }
        check('sharecore.js loads in Node with no window', !!S && !sErr, sErr && sErr.message);
        if (S) {
            const camp = () => ({ id: 'c1', name: 'Vault', activeItemId: 'm1', items: { m1: { type: 'map', id: 'm1' }, m2: { type: 'whatever', id: 'm2' }, p1: { type: 'planner', id: 'p1' }, d1: { type: 'doc', id: 'd1' } },
                chars: { a: {}, b: {} }, players: { u1: { name: 'Mara' }, u2: { name: 'Tomas' } }, bannedPlayers: { u9: 1 }, handoutReveals: { u1: {} }, handoutLog: [1], sessionLog: [1], uploads: [1],
                handouts: { h1: { id: 'h1', title: 'Map', giveTo: { u1: 1 } } }, newPlayers: { create: 'live' },
                sounds: [{ id: 's1', path: '/saves/images/audio/c1/rain.ogg', size: 1000 }, { id: 'bell' }], music: { v: 1, tracks: [{ id: 't1', path: '/saves/images/audio/c1/song.ogg', size: 5000 }], playlists: [] },
                videos: [{ id: 'v1', path: '/saves/images/video/c1/intro.mp4', size: 90000 }] });
            const pay = () => ({ activeCampaignId: 'c1', campaigns: { c1: camp() } });
            const PA = ['/saves/images/m1/a.png', '/saves/images/m1/b.jpg', '/saves/images/audio/c1/rain.ogg', '/saves/images/audio/c1/song.ogg', '/saves/images/video/c1/intro.mp4', '/saves/images/audio/c1/cue.ogg', '/saves/images/m1/a.png'];
            const t = S.tally(pay(), PA, { '/saves/images/m1/a.png': 300, '/saves/images/audio/c1/rain.ogg': 1200 });
            const e0 = (n, b, u) => ({ n: n, bytes: b || 0, unknown: u || 0 });
            check('the sheet counts by kind (sharecore tally): an item that is no planner or page is a map, as the app draws it; characters, players, sounds (one of the bundled set, with no file, among them), songs and videos by their lists; pictures by their files, each once; a size from the saves folder\'s list first, else the file\'s own list, else counted as unknown; a sound file no list names is a sound',
                j(t) === j({ maps: e0(2), pages: e0(2), chars: e0(2), templates: e0(0), pictures: e0(2, 300, 1), sounds: e0(2, 1200, 1), music: e0(1, 5000), videos: e0(1, 90000), players: e0(2) })
                && j(S.tally(null, null, null).maps) === j(e0(0)) && S.kindOf('/saves/images/audio/c1/x.ogg', null) === 'sounds' && S.kindOf('/saves/images/video/c/x.mp4', S.fileSets(pay())) === 'videos' && S.kindOf('/saves/images/audio/c1/song.ogg', S.fileSets(pay())) === 'music', j(t));
            const all = S.leaveOut(pay(), S.KINDS.slice()).campaigns.c1, maps = S.leaveOut(pay(), ['maps']).campaigns.c1, pages = S.leaveOut(pay(), { pages: true, maps: 1 }).campaigns.c1;
            check('leaving a kind out takes it off the payload, and nothing else (sharecore leaveOut): maps and pages by their items (the open item then the first one left, or none), characters, sounds, music and videos by their lists; Players takes the registry, the ban list, who saw and was handed what, the Game Record and the uploads, and a handout keeps its pages and loses only the players it waits for; the campaign\'s own settings for new players stay; nothing left out, or a list of no kinds, leaves the payload exactly as it was',
                j(Object.keys(all)) === j(['id', 'name', 'items', 'handouts', 'newPlayers']) && j(all.items) === '{}' && j(all.handouts) === j({ h1: { id: 'h1', title: 'Map' } })
                && j(Object.keys(maps.items)) === j(['p1', 'd1']) && maps.activeItemId === 'p1' && j(Object.keys(pages.items)) === j(['m1', 'm2']) && pages.activeItemId === 'm1' && !!pages.players
                && [[], {}, null, ['nothing'], { music: 'yes' }, 'music'].every(L => j(S.leaveOut(pay(), L)) === j(pay())) && j(S.cleanLeave(['music', 'bogus', 'maps', 'music'])) === j(['maps', 'music'])
                && j(S.PLAYER_KEYS) === j(['players', 'bannedPlayers', 'handoutReveals', 'handoutLog', 'sessionLog', 'uploads']), j([Object.keys(all), maps.activeItemId, pages.activeItemId]));
            const sets = S.fileSets(pay());
            check('the files that still go (sharecore keepPaths): a kind left out goes whole, judged by the lists as they were before it was taken off; the cover always comes along, once, even with Pictures left out or when nothing names it',
                j(S.keepPaths(PA, ['pictures', 'sounds'], sets, '/saves/images/m1/b.jpg')) === j(['/saves/images/m1/b.jpg', '/saves/images/audio/c1/song.ogg', '/saves/images/video/c1/intro.mp4'])
                && j(S.keepPaths(PA.slice(0, 2), ['music'], sets, '/saves/images/m9/c.png')) === j(['/saves/images/m1/a.png', '/saves/images/m1/b.jpg', '/saves/images/m9/c.png']) && j(S.keepPaths(PA, [], sets, '')) === j(PA), '');
            const badCovers = ['images/journal/x.png', 'images/Journal./x.png', 'images/journal /x.png', 'images/audio/c/x.png', 'images/video/c/x.png', 'images/a.png', '/saves/images/m/a.png', 'images/m/../a.png', 'images/m/./a.png', 'images/m//a.png', 'images/m/a.svg',
                'images/m/a%2f.png', 'images/m\\a.png', 'images/m/a.png?x', 'images/m/a:b.png', 'images/m/a\u0000.png', 'images/m/' + 'x'.repeat(400) + '.png', 42, null, undefined, {}];
            check('a cover names one picture entry of the archive (sharecore coverName): under images/ in a folder of its own, a PNG, JPEG, GIF or WebP by its name; never the Journal\'s folder in any spelling, a sound or a video folder, a walk, an empty or dot segment, a percent sign, a backslash, a query, a stream or a control character',
                S.coverName('images/m1/a.png') === 'images/m1/a.png' && S.coverName('images/m1/sub/A b.JPEG') === 'images/m1/sub/A b.JPEG' && S.coverName('images/journalism/a.webp') === 'images/journalism/a.webp' && badCovers.every(c => S.coverName(c) === ''), j(badCovers.filter(c => S.coverName(c) !== '')));
            const hostile = { v: 1, kind: 'evil', title: '<img src=x onerror=alert(1)>\n\tLine\u2028end', author: 'A'.repeat(200), version: ' 1.0 ', desc: 'one\r\ntwo\u0007x\n' + Array.from({ length: 30 }, (_, i) => 'l' + i).join('\n') + '\n\n',
                cover: 'images/m1/a.png', contents: { maps: { n: 3.7, bytes: 99 }, pictures: { n: -2, bytes: 5e20 }, sounds: { n: 'x' }, bogus: { n: 1 }, players: 4 }, left: ['players', 'x', 'maps'], extra: 'gone' };
            const hc = S.cleanCard(hostile), em = S.cleanCard({ v: 1, title: 'a'.repeat(119) + '\u{1F600}x', author: 'a'.repeat(120) + '\u{1F600}' });
            check('a card is cleaned on its way out and on its way in (sharecore cleanCard): a version-1 object or none; each line one line of plain text, its ends trimmed, cut to its length by whole characters; the description\'s own lines kept, twenty at most, other control characters gone; a cover by coverName; contents only of the eight kinds, a count and (for a file kind) a size as whole numbers within bounds; left only kinds, in order, once; nothing else rides along. Words that look like markup stay words: they are drawn as text',
                !!hc && j(Object.keys(hc)) === j(['v', 'kind', 'title', 'author', 'version', 'desc', 'cover', 'contents', 'left']) && hc.kind === 'campaign' && hc.title === '<img src=x onerror=alert(1)> Line end' && hc.author === 'A'.repeat(80) && hc.version === '1.0'
                && hc.desc.split('\n').length === 20 && hc.desc.indexOf('one\ntwo x\nl0\n') === 0 && hc.cover === 'images/m1/a.png' && j(hc.contents) === j({ maps: { n: 3 }, pictures: { n: 0, bytes: 1e15 } }) && j(hc.left) === j(['maps', 'players'])
                && em.title === 'a'.repeat(119) + '\u{1F600}' && em.author === 'a'.repeat(80) && [null, undefined, [], 'x', { v: 2 }, { v: '1' }].every(r => S.cleanCard(r) === null), j(hc));
            const card = S.cardFor({ title: ' Vault ', author: 'Alex', version: '1.0', desc: 'Heist.', cover: 'images/m1/b.jpg', leave: ['music', 'pictures', 'players'] }, t, 'all');
            check('a blank sheet makes no card, so nothing is written or left out (sharecore isBlank): the title as it came (its own name), spaces alone, a cover that is no cover; anything typed, a cover, or a kind unticked makes one. The card counts the file as it is made, a kind left out not counted but the pictures (the cover goes in)',
                [[{ title: 'Vault' }, 'Vault'], [{ title: ' Vault ' }, 'Vault'], [{ title: '', author: '  ', version: '\n', desc: ' \n ' }, 'Vault'], [{ cover: 'images/journal/a.png' }, 'Vault'], [null, 'Vault'], [{ leave: ['bogus'] }, 'Vault']].every(a => S.isBlank(a[0], a[1]) === true)
                && [[{ title: 'Vault 2' }, 'Vault'], [{ author: 'A' }, 'Vault'], [{ version: '1' }, 'Vault'], [{ desc: 'x' }, 'Vault'], [{ cover: 'images/m1/a.png' }, 'Vault'], [{ leave: ['music'] }, 'Vault']].every(a => S.isBlank(a[0], a[1]) === false)
                && j(card) === j({ v: 1, kind: 'all', title: 'Vault', author: 'Alex', version: '1.0', desc: 'Heist.', cover: 'images/m1/b.jpg', contents: { maps: { n: 2 }, pages: { n: 2 }, chars: { n: 2 }, pictures: { n: 2, bytes: 300 }, sounds: { n: 2, bytes: 1200 }, videos: { n: 1, bytes: 90000 } }, left: ['pictures', 'music', 'players'] }), j(card));
            check('the words (sharecore): a size in bytes, KB, MB and GB, one decimal under ten; the contents as counts of what the file holds, none of zero, joined by a middle dot; what was left out by its author; who made it and its version',
                [0, 1, 2, 1536, 5 * 1048576 + 1, 12.4 * 1048576, 3.25 * 1073741824, -5, NaN].map(S.sizeWords).join('|') === '0 bytes|1 byte|2 bytes|2 KB|5 MB|12 MB|3.3 GB|0 bytes|0 bytes'
                && S.contentsWords(card) === '2 maps \u00b7 2 pages \u00b7 2 characters \u00b7 2 pictures \u00b7 2 sounds \u00b7 1 video' && S.contentsWords({ contents: { music: { n: 1 } } }) === '1 song' && S.contentsWords(null) === ''
                && S.leftWords(card) === 'Left out by its author: pictures, music, players.' && S.leftWords({ left: [] }) === '' && S.byWords(card) === 'by Alex \u00b7 version 1.0' && S.byWords({ version: '2' }) === 'Version 2' && S.byWords({ author: 'A' }) === 'by A' && S.byWords({}) === '', S.contentsWords(card));
        }
        /* 1.6.2, Export all (backlog 227; the owner, by prompt on the drawn sheet: "Grow the Share sheet, no new export", "Both", "a Template tick on a
           character", "A look before it lands"): the starting points, the pictures by tag, templates kept, the left-out list and the import's counts */
        if (S) {
            const P = n => '/saves/images/m/' + n + '.png';
            const st1 = { list: ['Night', 'Secret', 'Both'], by: {}, priv: { Secret: true, Night: 'yes' } }, st2 = { list: ['Night', 'Shared'], by: {}, shelf: {} };
            st1.by[P('a')] = ['Night']; st1.by[P('b')] = ['Secret']; st1.by[P('c')] = ['Night', 'Secret']; st1.by[P('x')] = ['Gone']; st2.by[P('d')] = ['Shared'];
            const ps = [P('a'), P('b'), P('c'), P('d'), P('e'), '/saves/images/audio/c/r.ogg', '/saves/images/video/c/v.mp4', P('x'), P('a')];
            const sets = S.fileSets({ campaigns: { c: { sounds: [{ path: '/saves/images/audio/c/r.ogg' }] } } });
            const tr = S.tagRows(ps, [st1, st2], sets);
            check('Export all: the pictures by tag (sharecore tagRows, picTags, privOff): each tag some picture wears, in the stores\' order, with its count and its private mark, a tag no picture wears left out; a tag the store does not list is no tag; No tag counts the rest; a sound or a video is never a picture; only a mark of true is private, in the store that lists the tag',
                j(tr) === j({ rows: [{ name: 'Night', n: 3, priv: false }, { name: 'Secret', n: 2, priv: true }, { name: 'Shared', n: 1, priv: false }], none: 2 })
                && j(S.picTags([st1, st2], P('c'))) === j(['Night', 'Secret']) && j(S.picTags([st1, st2], P('x'))) === '[]' && j(S.privOff([st1, st2])) === j({ Secret: true })
                && j(S.privOff([{ list: ['A'], priv: { B: true } }, null, 7])) === '{}' && j(S.tagRows([], [st1], sets)) === j({ rows: [], none: 0 }), j(tr));
            const out1 = S.picsOut(ps, [st1, st2], sets, S.privOff([st1, st2]), {}, {}), out2 = S.picsOut(ps, [st1, st2], sets, { __none: true }, { [P('a')]: true }, { [P('e')]: true });
            const out3 = S.picsOut(ps, [st1, st2], sets, { Night: true }, {}, { [P('c')]: true }), out4 = S.picsOut(ps, [], sets, { __none: true }, {}, {});
            check('Export all: the pictures left out (sharecore picsOut): one that wears any unticked tag, every untagged one when No tag is unticked, one picked out; one put back goes whatever its tags say; each once, in the order of the file; never a sound or a video',
                j(out1) === j([P('b'), P('c')]) && j(out2) === j([P('a'), P('x')]) && j(out3) === j([P('a')]) && j(out4) === j([P('a'), P('b'), P('c'), P('d'), P('e'), P('x')])
                && j(S.picsOut(ps, [st1, st2], sets, null, null, null)) === '[]', j([out1, out2, out3, out4]));
            const plF = () => ({ campaigns: { c: { chars: { c_1: { id: 'c_1', template: true }, c_2: { id: 'c_2' }, c_3: { id: 'c_3', template: true, partial: true }, c_4: { id: 'c_4', template: 'yes' } } }, d: { chars: { c_5: { id: 'c_5' } } } } });
            const pl = S.leaveOut(plF(), ['chars']), plT = S.leaveOut(plF(), ['templates']), plB = S.leaveOut(plF(), ['chars', 'templates']), tT = S.tally(plF(), [], {});
            check('Export all: Templates is a kind of its own (sharecore KINDS, tally, leaveOut, templatesIn; the owner: "just full export" with plain ticks, no preset): counted apart from the other characters; Characters unticked keeps the templates, Templates unticked keeps the rest, both take every sheet; only a character ticked Template, true and whole, is one',
                j(S.KINDS) === j(['maps', 'pages', 'chars', 'templates', 'pictures', 'sounds', 'music', 'videos', 'players']) && S.NAMES.templates === 'Templates' && tT.chars.n === 4 && tT.templates.n === 1
                && j(pl.campaigns.c.chars) === j({ c_1: { id: 'c_1', template: true } }) && !('chars' in pl.campaigns.d) && j(Object.keys(plT.campaigns.c.chars)) === j(['c_2', 'c_3', 'c_4']) && plT.campaigns.d.chars.c_5.id === 'c_5'
                && !('chars' in plB.campaigns.c) && !('chars' in plB.campaigns.d) && !('startLeave' in S) && !('START' in S)
                && j(Object.keys(S.templatesIn({ a: { template: true }, b: null, c: { template: true, partial: true } }))) === j(['a']) && j(S.templatesIn(null)) === '{}', j([pl, plT, tT.templates]));
            const kp = S.keepPaths(ps, [], sets, P('b'), [P('a'), P('b'), '/saves/images/audio/c/r.ogg']);
            check('Export all: the files that go (sharecore keepPaths with single pictures): a picture left out stays home, the cover still comes along, a sound named among them is no picture and goes; with none, the list as before',
                j(kp) === j([P('b'), P('c'), P('d'), P('e'), '/saves/images/audio/c/r.ogg', '/saves/images/video/c/v.mp4', P('x')]) && j(S.keepPaths(ps, [], sets, '', undefined)) === j(ps), j(kp));
            const many = []; for (let i = 0; i < 2100; i++) many.push('images/m/p' + i + '.png');
            const cl = S.cleanCard({ v: 1, leftPics: ['images/m/a.png', '/saves/images/m/b.png', 'images/journal/x.png', 'images/Journal ./y.png', 'images/audio/c/r.ogg', 'images/video/c/v.mp4', 'images/../x.png', 'images/m/a.png', 7, null, 'images/m/<b>x</b>.png', 'images/m/a?.png', 'images/m\\a.png', 'images/a.png', 'images/m/%41.png'] });
            check('Export all: the left-out list in share.json (sharecore cleanCard, leftPicName): picture names under images/ in a folder of their own, each once, a leading /saves/ taken off; never the Journal\'s folder, a sound\'s or a video\'s, a walk, a query, a backslash or what is no text; words that look like markup stay words; 2000 at most; absent when there is none',
                j(cl.leftPics) === j(['images/m/a.png', 'images/m/b.png', 'images/m/<b>x</b>.png', 'images/m/%41.png']) && S.cleanCard({ v: 1, leftPics: many }).leftPics.length === 2000
                && !('leftPics' in S.cleanCard({ v: 1 })) && !('leftPics' in S.cleanCard({ v: 1, leftPics: ['../x'] })) && !('leftPics' in S.cleanCard({ v: 1, leftPics: 'images/m/a.png' })), j(cl));
            const tl = S.tally({ campaigns: {} }, [], {});
            check('Export all: a sheet that leaves single pictures out is no blank sheet, and its card names them (sharecore isBlank, cardFor, leftWords): the import says how many stay out and that their places are kept',
                S.isBlank({ title: 'X', pics: [P('a')] }, 'X') === false && S.isBlank({ title: 'X', pics: [] }, 'X') === true && j(S.cardFor({ leave: [], leftPics: [P('a')] }, tl, 'campaign').leftPics) === j(['images/m/a.png'])
                && S.leftWords({ left: ['players'], leftPics: ['images/m/a.png', 'images/m/b.png'] }) === 'Left out by its author: players. 2 pictures stay out. Their places are kept, so you can add your own files there.'
                && S.leftWords({ left: [], leftPics: ['images/m/a.png'] }) === 'One picture stays out. Its place is kept, so you can add your own file there.' && S.leftWords({ left: [] }) === '');
            const dl = { campaigns: { a: { system: { fields: [{ id: 'f_1' }] }, items: { m: { type: 'map' }, p: { type: 'planner' }, d: { type: 'doc' }, z: 7 }, chars: { c_1: { template: true }, c_2: {}, c_3: {} }, sounds: [{}, 3], music: { tracks: [{}, {}] }, videos: [{}] },
                b: { system: { fields: [] }, items: { m2: { type: 'map' } }, chars: { c_4: { template: true } } }, x: 'no' } };
            const names = ['data.json', 'share.json', 'library/l_abcdefgh/p_one.3.json', 'library/l_ABCDEFGH/p_one.3.json', 'library/l_abcdefgh/p_two.json', 'images/m/a.png', 'images/m/b.webp', 'images/journal/j.png', 'images/audio/c/r.ogg', 'images/video/c/v.mp4', 'images/m/', 'images/a.png', 7];
            const lk = S.lookOf(dl, names);
            check('Export all: the look before an import lands (sharecore lookOf, lookWords): counted from data.json and the archive\'s entry names alone; a system only where it has fields, packs by their exact names, maps and pages by their items, characters and templates apart, sounds, songs and videos by their lists, pictures by their entries (never the Journal\'s, a sound, a video or a folder); the words in their order, none of zero; a plain file counts no packs or pictures',
                j(lk) === j({ system: 1, packs: 1, maps: 2, pages: 2, chars: 2, templates: 2, pictures: 2, sounds: 1, music: 2, videos: 1 })
                && j(S.lookWords(lk)) === j(['A system with 1 library pack', '2 maps', '2 pages', '2 characters', '2 templates', '2 pictures', '1 sound', '2 songs', '1 video'])
                && S.lookOf(dl, null).pictures === 0 && j(S.lookWords(S.lookOf({}, []))) === '[]' && j(S.lookWords({ system: 0, packs: 3 })) === j(['3 library packs']), j([lk, S.lookWords(lk)]));
            let nId = 0; const an = { activeCampaignId: 'b', campaigns: { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, z: 5 } }, mp = S.asNewCamps(an, () => 'camp_n' + (++nId));
            const an2 = { activeCampaignId: 'gone', campaigns: { a: { id: 'a' } } }; S.asNewCamps(an2, () => 'camp_q');
            check('Export all: Import as a new campaign (sharecore asNewCamps): every campaign of the file under a new id of its own, the open one followed, what is no campaign dropped; an open one the file lacks becomes its first',
                j(mp) === j({ a: 'camp_n1', b: 'camp_n2' }) && j(Object.keys(an.campaigns)) === j(['camp_n1', 'camp_n2']) && an.campaigns.camp_n1.id === 'camp_n1' && an.campaigns.camp_n2.name === 'B' && an.activeCampaignId === 'camp_n2'
                && an2.activeCampaignId === 'camp_q' && j(S.asNewCamps(null, () => 'x')) === '{}' && j(S.asNewCamps({ campaigns: { a: {} } }, null)) === '{}', j([mp, an]));
            // the review of backlog 227: an id source that repeats (an Export everything file makes every id in one millisecond) drops no campaign
            const rp = { activeCampaignId: 'c', campaigns: { a: { id: 'a', name: 'A' }, b: { id: 'b', name: 'B' }, c: { id: 'c', name: 'C' } } }, rpIds = ['camp_x', 'camp_x', 'camp_y'];
            let rpN = 0; const rpM = S.asNewCamps(rp, () => rpIds[Math.min(rpN++, rpIds.length - 1)]);
            const st = { activeCampaignId: 'a', campaigns: { a: { name: 'A' }, b: { name: 'B' } } }, stM = S.asNewCamps(st, () => 'camp_s', id => id === 'camp_s_2');
            const em = { campaigns: { a: {}, b: {} } }, emM = S.asNewCamps(em, () => '');
            check('Import as a new campaign drops no campaign (the review of backlog 227, sharecore asNewCamps): an id the call already gave is asked for again, and an id source that keeps repeating, or gives none, gets a number after it, free in the call and here',
                Object.keys(rp.campaigns).length === 3 && j(Object.keys(rpM)) === j(['a', 'b', 'c']) && new Set(Object.values(rpM)).size === 3 && rp.campaigns[rpM.c].name === 'C' && rp.activeCampaignId === rpM.c
                && j(stM) === j({ a: 'camp_s', b: 'camp_s_3' }) && Object.keys(st.campaigns).length === 2 && j(Object.keys(emM)) === j(['a', 'b']) && new Set(Object.values(emM)).size === 2 && Object.values(emM).every(v => !!v), j([rpM, stM, emM]));
            const fn = { campaigns: { a: { name: 'Delve' }, b: { name: 'delve' }, c: { name: '  ' }, d: { name: 'Delve (2)' }, e: { name: 'Mine' }, z: 4 } }, fnHere = ['delve', 'mine'], fnN = S.freeNames(fn, n => fnHere.indexOf(n.toLowerCase()) >= 0);
            check('Import as a new campaign gives each campaign a name of its own (sharecore freeNames): a name here or one already given to a campaign of the same file is taken, ignoring case, and gets the next number; an empty name is Imported campaign',
                j(fnN) === j(['Delve (2)', 'delve (3)', 'Imported campaign', 'Delve (2) (2)', 'Mine (2)']) && fn.campaigns.b.name === 'delve (3)' && j(S.freeNames(null, () => false)) === '[]', j(fnN));
            // a private mark stays on this computer: Full export strips every private tag from what it writes, a backup export keeps it
            const spP = () => ({ imageCats: { list: ['Sky', 'Spoil'], by: { '/saves/images/m/a.png': ['Sky', 'Spoil'], '/saves/images/m/b.png': ['Spoil'] }, shelf: { Spoil: true, Sky: true }, priv: { Spoil: true } },
                campaigns: { c1: { imageCats: { list: ['Boss', 'Map'], by: { '/saves/images/m/c.png': ['Boss'], '/saves/images/m/d.png': ['Map', 'Shared'] }, shelf: {}, filters: [{ name: 'Big reveal', tags: ['Boss'], match: 'all', words: '' }, { name: 'Maps', tags: ['Map'], match: 'all', words: '' }], priv: { Boss: true } } },
                    c2: { imageCats: { list: ['Map'], by: {}, shelf: {} } } } });
            const sp = spP(), spN = S.stripPrivate(sp, [{ list: ['Shared'], by: {}, shelf: {}, priv: { Shared: true } }]), spJ = j(sp);
            const plain = { imageCats: { list: ['Sky'], by: { x: ['Sky'] }, shelf: {} }, campaigns: { c: { imageCats: { list: ['Map'], by: {}, shelf: {} } } } }, plainB = j(plain), plainN = S.stripPrivate(plain, [null]);
            check('Full export keeps no private tag (the review of backlog 227, sharecore stripPrivate): no store of the payload keeps priv, and a tag marked private here or in the shared store this file does not carry is off list, shelf, every picture\u2019s tags and every saved filter that names it; a picture left with no tag loses its entry; nothing is changed where nothing is private',
                spN === 3 && !/"priv"/.test(spJ) && !/Spoil|Boss|Big reveal|Shared/.test(spJ) && j(sp.imageCats.list) === j(['Sky']) && j(sp.imageCats.by) === j({ '/saves/images/m/a.png': ['Sky'] }) && j(sp.imageCats.shelf) === j({ Sky: true })
                && j(sp.campaigns.c1.imageCats.by) === j({ '/saves/images/m/d.png': ['Map'] }) && j(sp.campaigns.c1.imageCats.filters.map(f => f.name)) === j(['Maps']) && j(sp.campaigns.c2.imageCats.list) === j(['Map'])
                && plainN === 0 && j(plain) === plainB && S.stripPrivate(null) === 0, spJ);
        }
        /* the import's card (share.js readCard and picType, sliced by their shareread markers and run for real on archives zip.js makes; the
           owner: "A card at the top of Import (Recommended)") */
        if (S) {
            const shSrc2 = read('system/app/scripts/share.js'), a2 = shSrc2.indexOf('// [zipcheck:shareread-start]'), b2 = shSrc2.indexOf('// [zipcheck:shareread-end]');
            const steps = [], made = [], freed = [];
            const fakeURL = { createObjectURL: b => { made.push(b.type + ':' + b.size); return 'blob:http://localhost/' + made.length; }, revokeObjectURL: u => { freed.push(u); } };
            const RC = new Function('SC', 'log', 'URL', 'Blob', 'TextDecoder', shSrc2.slice(a2, b2) + '\nreturn { readCard: readCard, picType: picType };')(S, (s, o) => steps.push(s + ' ' + j(o)), fakeURL, Blob, TextDecoder);
            const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2]), JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1]), GIF = enc.encode('GIF89a......'), WEBP = enc.encode('RIFF....WEBPVP8 ');
            const card = (o) => enc.encode(j(Object.assign({ v: 1, title: 'Vault', author: 'Alex', cover: 'images/m1/c.png' }, o || {})));
            const open = async list => (await Z.zipOpen(Z.zipCreate([{ name: 'data.json', data: enc.encode('{}') }].concat(list)))).entries;
            const r1 = await RC.readCard(await open([{ name: 'share.json', data: card() }, { name: 'images/m1/c.png', data: PNG }]));
            const r2 = await RC.readCard(await open([{ name: 'share.json', data: card() }, { name: 'images/m1/c.png', data: enc.encode('<html><script>alert(1)</script></html>') }]));
            const r3 = await RC.readCard(await open([{ name: 'images/m1/c.png', data: PNG }]));
            const r4 = await RC.readCard(await open([{ name: 'share.json', data: enc.encode('{not json') }]));
            const r5 = await RC.readCard(await open([{ name: 'share.json', data: card({ v: 2 }) }]));
            const r6 = await RC.readCard(await open([{ name: 'share.json', data: enc.encode(' '.repeat(70000)) }]));
            const r7 = await RC.readCard(await open([{ name: 'share.json', data: card({ cover: 'images/journal/c.png' }) }, { name: 'images/journal/c.png', data: PNG }]));
            const r8 = await RC.readCard([{ name: 'share.json', size: 60, bytes: async () => card() }, { name: 'images/m1/c.png', size: 17 * 1024 * 1024, bytes: async () => PNG }]);
            const r9 = await RC.readCard([{ name: 'share.json', size: 60, bytes: async () => card() }, { name: 'images/m1/c.png', size: 14, bytes: async () => { throw new Error('the checksum'); } }]);
            check('the import reads a card (share.js readCard, run for real on archives zip.js makes): share.json, 64 KB at most, read by its checksum and cleaned by sharecore; its cover only from that very entry of the archive, 16 MB at most, and only when its first bytes say PNG, JPEG, GIF or WebP, then made a blob address on this machine; a page that only calls itself a picture, a cover in the Journal\'s folder, one too large or one whose bytes cannot be read gives the card with no picture; no share.json, or one that is no card, gives none; the last picture is let go when the next file is read',
                !!r1 && r1.url === 'blob:http://localhost/1' && made[0] === 'image/png:14' && r1.card.title === 'Vault' && r1.card.cover === 'images/m1/c.png' && !!r2 && r2.url === '' && r2.card.title === 'Vault' && r3 === null && r4 === null && r5 === null && r6 === null
                && !!r7 && r7.card.cover === '' && r7.url === '' && !!r8 && r8.url === '' && !!r9 && r9.url === '' && made.length === 1 && freed[0] === 'blob:http://localhost/1'
                && steps.filter(s => /^card-refused/.test(s)).map(s => s.slice(13)).join() === j({ why: 'shape' }) + ',' + j({ why: 'shape' }) + ',' + j({ why: 'size' })
                && steps[0] === 'card-read ' + j({ cover: true, picture: true, left: 0, kinds: 0 })
                && [[PNG, 'image/png'], [JPG, 'image/jpeg'], [GIF, 'image/gif'], [WEBP, 'image/webp'], [enc.encode('<svg xmlns="x"></svg>'), ''], [new Uint8Array(4), ''], [null, '']].every(p => RC.picType(p[0]) === p[1]), j([steps, made, freed]));
            const zipBranch2 = mainSrc.slice(mainSrc.indexOf("      if (/\\.zip$/i.test(file.name)) {"), mainSrc.indexOf('      var reader = new FileReader();'));
            check('the import shows the card before anything comes in (main.js, source): the card is read from the archive and awaited before the file is judged; it is drawn at the top of the Import box as the box opens, a plain file has none, and it goes with the box on Merge, Replace, Cancel and a file with nothing to bring in',
                /importCardDone\(\); pendingImportCard = window\.wpShare && typeof window\.wpShare\.readCard === 'function' \? await window\.wpShare\.readCard\(entries\) : null;[^\n]*\n\s*handleImportedJson\(djText\);/.test(zipBranch2)
                && /window\.wpShare\.showCard\(pendingImportCard\);[^\n]*\n\n\s*document\.getElementById\('importChoiceModal'\)\.style\.display = 'flex';/.test(mainSrc) && /pendingImportImages = null; pendingImportLibrary = null;[^\n]*\n\s*importCardDone\(\);/.test(mainSrc)
                && (mainSrc.match(/\n\s*importCardDone\(\);/g) || []).length === 5 && /function importCardDone\(\) \{ pendingImportCard = null; if \(window\.wpShare && typeof window\.wpShare\.showCard === 'function'\) window\.wpShare\.showCard\(null\); \}/.test(mainSrc), zipBranch2.length);
        }
        const shSrc = read('system/app/scripts/share.js'), bxSrc = ioSrc.slice(ioSrc.indexOf('  async function buildExport(scope, handle, share) {'), ioSrc.indexOf('  window.wpBuildExport = buildExport;'));
        check('the export takes the sheet (io.js, source): what the sheet leaves out goes off the payload before data.json is written (and, moved on purpose in the review of backlog 227, a Full export’s private tags after it), the files of a kind left out by the lists as they were; the campaign\'s own pictures are listed by one function for the export and for the sheet\'s count (exportPlan, the payload as the export makes it); the card is share.json right after data.json, its cover one of the campaign\'s pictures by exportPathOk, and a file with a card is always a .zip; with no sheet, nothing of it runs',
            bxSrc.length > 2000 && /var shareSets = null;[^\n]*\n\s*if \(share && share\.leave\) \{ shareSets = Share\.fileSets\(payload\); Share\.leaveOut\(payload, share\.leave\); \}\n(?:\s*\/\/[^\n]*\n)*\s*if \(share && share\.full === true && typeof Share\.stripPrivate === 'function'\) Share\.stripPrivate\(payload, [^\n]*\n\n\s*var json = JSON\.stringify\(payload, null, 2\);/.test(bxSrc)
            && /if \(!\(await exportListed\(scope, payload, paths\)\)\) unlisted = true;/.test(bxSrc) && /var paths = collectImagePaths\(payload\), sizes = \{\};\n\s*var ok = await exportListed\(scope, payload, paths, sizes\);/.test(ioSrc)
            && /var shareCover = share && typeof share\.cover === 'string' && exportPathOk\(share\.cover\) && Share\.coverName\(/.test(bxSrc) && /if \(shareSets\) paths = Share\.keepPaths\(paths, share\.leave, shareSets, shareCover, share\.pics\);/.test(bxSrc)
            && /if \(shareCard\) shareE = \{ name: 'share\.json', data: new TextEncoder\(\)\.encode\(JSON\.stringify\(shareCard, null, 2\)\) \};/.test(bxSrc) && /if \(!paths\.length && !libFiles\.length && !handle && !shareE\) return /.test(bxSrc)
            && /var entries = \[\{ name: 'data\.json', data: enc\.encode\(json\) \}\]\.concat\(libFiles\);\n\s*if \(shareE\) entries\.splice\(1, 0, shareE\);/.test(bxSrc) && (bxSrc.match(/share\b/g) || []).length < 30
            && /if \(\(sc === 'campaign' \|\| sc === 'all'\) && window\.wpShare && typeof window\.wpShare\.open === 'function'\) window\.wpShare\.open\(sc, false\);[^\n]*\n\s*else exportScope\(sc\);/.test(ioSrc)
            && /window\.wpShare\.open\('campaign', true\); else exportScope\('campaign'\);/.test(ioSrc) && /import \* as Share from '\.\/sharecore\.js';/.test(ioSrc), bxSrc.length);
        const goSrc = shSrc.slice(shSrc.indexOf('function go() {'), shSrc.indexOf('function wire() {'));
        check('the sheet hands the export nothing when it is blank (but for a Full export’s word that it is one, moved on purpose in the review of backlog 227), and asks for the file straight from the press (share.js, source): a large export\'s file picker opens while the click still counts, so no wait comes before the export is called; the Share row starts with Players unticked and the others with every kind ticked; a kind with nothing in it cannot be unticked; what was typed is kept for the campaign on this computer only, and an empty sheet is not kept',
            /var share = blank \? \(_s\.share \? \{ full: true \} : undefined\) : \{ card: /.test(goSrc) && !/await/.test(goSrc) && /window\.wpExportScope\(scope, share\)/.test(goSrc) && /if \(b\) b\.checked = !\(_s\.share && k === 'players'\);/.test(shSrc)
            && /if \(box\) \{ box\.disabled = e\.n <= 0 && !\(file && e\.bytes > 0\); if \(box\.disabled\) box\.checked = true; \}/.test(shSrc) && /localStorage\.setItem\(MEM_KEY, JSON\.stringify\(all\)\)/.test(shSrc) && !/fetch\(/.test(shSrc.replace(/\/\/[^\n]*/g, ''))
            && /if \(Object\.keys\(rec\)\.some\(function\(f\) \{ return !!rec\[f\]; \}\)\) all\[k\] = rec;/.test(shSrc) && /window\.wpStepLog\('share v1', step, facts\)/.test(shSrc) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(shSrc), goSrc.length);
        const ixS = read('system/app/index.html'), sheetS = ixS.slice(ixS.indexOf('<div id="shareModal"'), ixS.indexOf('<!-- Dice (1.5.0)'));
        check('the sheet in the page (backlog 34): fixed words, put away, a dialog to a screen reader, in the app\'s own dialog look with its gold ticks; the eight kinds in order, each a tick with a tooltip that says what it takes; no script or handler in it; Escape and a press on the backdrop are its Cancel; Share this campaign stands in Export As right after Export this campaign, and the module loads once',
            sheetS.indexOf('<div id="shareModal" class="gen-modal" style="display:none;" role="dialog" aria-modal="true" aria-labelledby="shareTitle">') === 0 && !/<script|\son[a-z]+=/.test(sheetS)
            && j((sheetS.match(/id="shareKeep_([a-z]+)"/g) || []).map(s => s.slice(14, -1))) === j(['maps', 'pages', 'chars', 'templates', 'pictures', 'sounds', 'music', 'videos', 'players']) && (sheetS.match(/<label class="gen-tick share-kind" title="[^"]+"><input type="checkbox" id="shareKeep_[a-z]+" checked>/g) || []).length === 9   // 1.6.2 (backlog 227): Templates, moved on purpose
            && sheetS.includes('<button type="button" class="tool ghost" id="shareCancel">Cancel</button><button type="button" class="tool" id="shareGo">Export</button>') && /\['shareModal', 'shareCancel'\]\];/.test(read('system/app/scripts/esckey.js')) && /shareModal: 'shareCancel',/.test(read('system/app/scripts/whiteboard.js'))
            && /<span>Export this campaign<\/span><\/button>\n\s*<button type="button" class="menu-item" id="exportShareBtn" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="[^"]+"\/><\/svg><span>Full export<\/span><\/button>\n/.test(ixS)   // 1.6.2 (backlog 227): Share this campaign became Full export, moved on purpose
            && ixS.split('<script type="module" src="scripts/share.js"></script>').length === 2, sheetS.length);
        const wn1 = read('WHATSNEW.txt'), wn2 = read('system/app/assets/whatsnew.txt'), part = s => s.slice(s.indexOf(NL + 'Sharing a campaign' + NL), s.indexOf(NL + 'Table trackers' + NL));
        check('said (backlog 34): Help\'s Export As entry tells of the sheet, its kinds, the card, Share\'s Players and that a sheet left as it is makes the file it always did; both release notes carry the same part, before the 1.5.9 notes',
            ixS.includes('<li><b>Export this campaign</b>, <b>Full export</b> and <b>Export everything</b> open a sheet first.')   // 1.6.2 (backlog 227): moved on purpose && ixS.includes('Left as it is, the sheet makes the same file as before. What you type is kept for that campaign on this computer.</li>')
            && part(wn1).length > 200 && part(wn1) === part(wn2) && wn1.indexOf(NL + 'Sharing a campaign' + NL) < wn1.indexOf('WAYPOINT 1.5.9') && part(wn1).includes('- Left as it is, the sheet makes the same file as before.') && part(wn1).includes('- Import shows a file\'s card first: the cover, the title, who made it,')
            && ixS.includes('<li>A file with a card shows it at the top of <b>Import</b> before anything comes in. You see the cover,') && ixS.indexOf('<div id="importCard" class="share-card" hidden>') > ixS.indexOf('<div id="importChoiceModal"') && ixS.indexOf('<div id="importCard" class="share-card" hidden>') < ixS.indexOf('id="importChoiceSummary"'), part(wn1).length);
    }

    /* ---- 1.6.2, Export all (backlog 227): the readCard of a left-out list, the wiring, and said ---- */
    {
        const S2 = await import(url('sharecore.js')), shX = read('system/app/scripts/share.js'), mnX = read('system/app/scripts/main.js'), ioX = read('system/app/scripts/io.js'), ixX = read('system/app/index.html');
        const a3 = shX.indexOf('// [zipcheck:shareread-start]'), b3 = shX.indexOf('// [zipcheck:shareread-end]');
        const RC3 = new Function('SC', 'log', 'URL', 'Blob', 'TextDecoder', shX.slice(a3, b3) + '\nreturn { readCard: readCard };')(S2, () => {}, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }, Blob, TextDecoder);
        const encX = new TextEncoder(), rl = await RC3.readCard([{ name: 'share.json', size: 200, bytes: async () => encX.encode(j({ v: 1, title: 'T', leftPics: ['images/m/a.png', 'images/journal/j.png', '<img src=x onerror=alert(1)>'] })) }]);
        check('Export all: an import reads the left-out list with the card (share.js readCard): names cleaned by sharecore, the Journal\'s and what is no picture name dropped',
            !!rl && j(rl.card.leftPics) === j(['images/m/a.png']), rl && j(rl.card));
        const goX = shX.slice(shX.indexOf('function go() {'), shX.indexOf('function wire() {'));
        check('Export all, wired (share.js, io.js, main.js, the page): Share this campaign is Full export, with plain ticks and no preset; a private tag starts unticked there alone, so the two exports left as they came are the files they were; it hands the export the pictures it leaves out only while Pictures is ticked; io.js keeps their places and names them in the card; Import as a new campaign gives every campaign a new id and a free name, then lands as a Merge of new campaigns does; the look is drawn after the card, and the box put away takes it; each step logs as share v1',
            /_s\.off = _s\.share \? SC\.privOff\(_s\.stores\) : \{\};/.test(shX) && /head\.textContent = _s\.share \? 'Full export' :/.test(shX) && !/startLeave|setStart|For friends|My own copy/.test(shX + ixX) && /pics: picsOn \? outNow\(\) : \[\]/.test(goX) && /leave: form\.leave, pics: form\.pics, sizes:/.test(goX)
            && /Share\.cardFor\(Object\.assign\(\{\}, share\.card, \{ cover: shareCover\.replace\(\/\^\\\/saves\\\/\/, ''\), leave: share\.leave, leftPics: shareLeftPics \}\)/.test(ioX)
            && /var mapN = window\.wpShareCore\.asNewCamps\(pendingImport, mkId, takenId\);/.test(mnX) && /window\.wpShareCore\.freeNames\(pendingImport, function\(n\) \{ return isCampaignNameTaken\(n, null\); \}\);/.test(mnX) && /var r = mergeAppState\(pendingImport\);\n\s*if \(window\.wpShare && window\.wpShare\.log\) window\.wpShare\.log\('import-new'/.test(mnX)
            && /window\.wpShare\.showCard\(pendingImportCard\); if \(window\.wpShare && typeof window\.wpShare\.showLook === 'function'\) window\.wpShare\.showLook\(data, pendingImportNames\);/.test(mnX)
            && /if \(!read && typeof showLook === 'function'\) showLook\(null\);/.test(shX) && ['tag-tick', 'tag-private', 'pick-grid', 'pick', 'look-shown'].every(s => shX.includes("log('" + s + "'"))
            && ['shareKeep_templates', 'shareN_templates', 'shareTags', 'shareTagsHead', 'sharePick', 'sharePicsLine', 'sharePickGrid', 'importLook', 'importLookList', 'importNewBtn'].every(id => ixX.split(' id="' + id + '"').length === 2)
            && /id="exportShareBtn" title="[^"]+"><svg[^]*?<\/svg><span>Full export<\/span><\/button>/.test(ixX) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(shX));
        {   // the review of backlog 227: the cover always goes in the file, so the sheet never counts or says it as left out; a Full export says so to io.js, which strips the private tags
            const c1 = shX.indexOf('// [zipcheck:sharecover-start]'), c2 = shX.indexOf('// [zipcheck:sharecover-end]'), l1 = shX.indexOf('// [zipcheck:sharepicsline-start]'), l2 = shX.indexOf('// [zipcheck:sharepicsline-end]');
            const P = n => '/saves/images/m/' + n, st = { allPics: [P('a.png'), P('b.png'), P('c.png')], stores: [{ list: ['Spoil'], by: { [P('a.png')]: ['Spoil'], [P('b.png')]: ['Spoil'] }, shelf: {}, priv: { Spoil: true } }], sets: S2.fileSets({}), off: { Spoil: true }, pickOut: {}, pickIn: {}, cover: '' };
            const line = { textContent: '' }, pics = { checked: true }, els = { sharePicsLine: line };
            const SV = new Function('SC', '_s', 'el', 'kindBox', 'drawKinds', 'drawPicks', shX.slice(c1, c2) + shX.slice(l1, l2) + '\nreturn { outNow, coverAnyway, drawPicsLine };')(S2, st, id => els[id] || null, k => (k === 'pictures' ? pics : null), () => {}, () => {});
            const o0 = j(SV.outNow()); SV.drawPicsLine(); const w0 = line.textContent;
            st.cover = P('a.png'); const o1 = j(SV.outNow()), ca = SV.coverAnyway(); SV.drawPicsLine(); const w1 = line.textContent;
            pics.checked = false; SV.drawPicsLine(); const w2 = line.textContent; pics.checked = true; st.cover = P('c.png'); const cb = SV.coverAnyway(); SV.drawPicsLine(); const w3 = line.textContent;
            const opX = shX.slice(shX.indexOf('async function open('), shX.indexOf('function hide(why)')), goX2 = shX.slice(shX.indexOf('function go() {'), shX.indexOf('function wire() {'));
            check('Full export\u2019s cover (the review of backlog 227, share.js outNow, coverAnyway, drawPicsLine, run for real with sharecore): the cover is never counted as left out, and the sheet says it goes in the file all the same where its tag, its own pick or Pictures unticked would leave it out; a remembered cover comes back only where it goes in as the sheet starts; picking or clearing a cover redraws the counts; a Full export, left as it came or not, tells io.js, which strips the private tags after the kinds left out and before data.json is written',
                o0 === j([P('a.png'), P('b.png')]) && w0 === '2 pictures are left out. Their places are kept.' && o1 === j([P('b.png')]) && ca === true && w1 === 'One picture is left out. Its place is kept. The cover goes in the file all the same.'
                && w2 === 'No picture goes in. Their places are kept. The cover goes in the file all the same.' && cb === false && w3 === '2 pictures are left out. Their places are kept.'
                && /_s\.off = _s\.share \? SC\.privOff\(_s\.stores\) : \{\};[^]*_s\.cover = '';[^]*if \(_s\.pics\.indexOf\(mem\.cover\) >= 0 && outRaw\(\)\.indexOf\(mem\.cover\) < 0\) _s\.cover = mem\.cover;[^]*drawCover\(\);/.test(opX) && !/_s\.cover = _s\.pics\.indexOf\(mem\.cover\)/.test(shX)
                && /on\('shareCoverClear', function\(\) \{ _s\.cover = ''; drawCover\(\); coverMoved\(\);/.test(shX) && shX.includes("drawCover(); if (typeof coverMoved === 'function') coverMoved(); g.hidden = true;")
                && /var share = blank \? \(_s\.share \? \{ full: true \} : undefined\) : \{[^]*sizes: _s\.plan\.sizes, full: _s\.share \};/.test(goX2)
                && /if \(share && share\.full === true && typeof Share\.stripPrivate === 'function'\) Share\.stripPrivate\(payload, \[state\.appState && state\.appState\.imageCats\]\);/.test(ioX)
                && ioX.indexOf('Share.leaveOut(payload, share.leave); }') < ioX.indexOf('Share.stripPrivate(payload') && ioX.indexOf('Share.stripPrivate(payload') < ioX.indexOf('var json = JSON.stringify(payload, null, 2);', ioX.indexOf('async function buildExport(')), j([o0, w0, o1, w1, w2, w3]));
        }
        const wnX = read('WHATSNEW.txt'), waX = read('system/app/assets/whatsnew.txt'), secX = s => s.slice(s.indexOf(NL + 'Taking a campaign with you' + NL), s.indexOf('WAYPOINT 1.6.1'));
        check('Export all, said: Help tells what Full export carries and that each kind is a plain tick, Pictures by tag with Private, Pick..., a picture left out keeping its place and a missing one quiet, Templates and New from a template, the look before an import and Import as a new campaign; the Image Library\'s Private; both release notes carry the same part under 1.6.2',
            ixX.includes('<li><b>Full export</b> puts the whole campaign in one file: its system and library packs,') && ixX.includes('<li><b>Pictures by tag</b> on the sheet lists the tags your pictures wear')
            && ixX.includes('<li><b>Pick&hellip;</b> under the tags shows every picture the file would carry.') && ixX.includes('<li>A picture left out keeps its place.') && ixX.includes('<li><b>Templates</b> are sheets to copy.')
            && ixX.includes('<li><b>New from a template</b> is on the <b>+</b> of Characters') && ixX.includes('<li>Before anything comes in, <b>Import</b> shows what the file holds.') && ixX.includes('<li><b>Import as a new campaign</b> brings the file in beside your campaigns')
            && ixX.includes('<li><b>Private</b> among a tag&rsquo;s tools marks it private.') && secX(wnX).length > 400 && secX(wnX) === secX(waX) && wnX.indexOf('Taking a campaign with you') < wnX.indexOf('WAYPOINT 1.6.1'));
    }

    /* ---- said ---- */
    const ixZ = read('system/app/index.html'), wnZ = read('WHATSNEW.txt'), waZ = read('system/app/assets/whatsnew.txt'), ciZ = read('CAMPAIGN_INTEGRATION.md'), ymlZ = read('.github/workflows/checks.yml');
    check('said: Help\'s Export As line tells that a campaign export carries its sounds and videos whole, with no size limit (ZIP64 past 4 GB), and that an import checks every bundled file before copying it; the Export this campaign button and the Video help say the videos travel; the release notes (both copies alike) and the integration guide say it; CI runs this suite',
        ixZ.includes('A campaign export, and Everything, also carry the campaign&rsquo;s sounds and its <b>videos</b>, whole. An export has no size limit: files are read from disk and written in parts.') && ixZ.includes('checks every bundled file against its checksum before copying it. A damaged file is counted as failed and never written.</li>')
        && ixZ.includes('with its images, sounds and videos bundled (whatever their size). Imports as this campaign. A sheet comes first, where you can add a card or leave kinds out."') && ixZ.includes('A campaign export carries the video files with it: <b>Export As</b> &#9656; This Campaign.')
        && ixZ.includes('When the videos and music together pass 1 GB, the export asks where to save it and writes straight to that file. It then reads the file back and checks every file in it before it calls the export done.') && wnZ.includes('  When the videos and music pass 1 GB the export asks where to save it and' + NL + '  writes straight to that file (it is never held in memory), then reads it' + NL)
        && wnZ.includes('- An export carries the campaign\'s videos, whole: Export This Campaign and' + NL + '  Export Everything bundle each video file with the pictures and sounds, and') && wnZ.includes('  against its checksum before copying it: a damaged one is counted as' + NL + '  failed, never written.')
        && wnZ.slice(wnZ.indexOf(NL + 'Video' + NL), wnZ.indexOf(NL + 'Dice' + NL)) === waZ.slice(waZ.indexOf(NL + 'Video' + NL), waZ.indexOf(NL + 'Dice' + NL))
        && ciZ.includes('A campaign export carries the files themselves under images/video/<campaign>/ in its zip') && /run: node tools\/zipcheck\.js/.test(ymlZ));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
