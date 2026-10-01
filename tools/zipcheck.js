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
        && /var ok = 0, fail = 0, vidAt = 0, wrote = 0, budget = pendingImportBytes \* 20 \+ 1048576;/.test(read('system/app/scripts/main.js')) && /wrote \+= imgs\[i\]\.size; if \(wrote > budget\) throw new Error\('more than the archive can hold'\);\n\s*var body = await imgs\[i\]\.check\(\);/.test(read('system/app/scripts/main.js'))
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
    const zsrc = read('system/app/scripts/zip.js');
    check('both writers build their records with the same three builders (the ZIP64 records pinned above for zipCreate are zipWrite\'s too), and a real archive past 4 GB written by zipWrite was read by two other programs (the release log)',
        /var lr = localRecord\(name\.length, size, crc\), cr = centralRecord\(name\.length, size, crc, offset\);/.test(zsrc) && /var tail = tailRecords\(entries\.length, cdSize, offset\);/.test(zsrc)
        && /var lr = localRecord\(name\.length, size, 0\), hlen = 30 \+ name\.length \+ \(lr\[1\] \? lr\[1\]\.byteLength : 0\);/.test(zsrc) && /var cr = centralRecord\(name\.length, size, crc, at\);/.test(zsrc) && /var tail = tailRecords\(count, cdSize, offset\), pos = offset, rest = central\.concat\(tail\);/.test(zsrc)
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
        /      var paths = collectImagePaths\(payload\);/.test(ioSrc) && !/collectImagePaths\(payload\)\.filter/.test(ioSrc) && /var EXPORT_PART = 32 \* 1024 \* 1024;/.test(ioSrc) && /      for \(var k = 0; k < paths\.length; k\+\+\) \{\n\s*try \{\n\s*var vid = isVideo\(paths\[k\]\);\n\s*if \(vid\) \{ vidAt\+\+; toast\([^\n;]*\); \}\n\s*var fe = await exportFile\(/.test(ioSrc) && /var fe = await exportFile\(encodeURI\(paths\[k\]\), zip\);\n\s*if \(!fe\) \{ missing\+\+; continue; \}\n\s*entries\.push\(\{ name: paths\[k\]\.replace\(\/\^\\\/saves\\\/\/, ''\), data: fe\.data, crc: fe\.crc \}\);/.test(ioSrc)
        && /zblob = zip\.zipCreate\(entries\);\n\s*var zback = await zip\.zipOpen\(zblob\);\n\s*if \(zback\.entries\.length !== entries\.filter\(function\(en\) \{ return !\/\\\/\$\/\.test\(en\.name\); \}\)\.length\) throw new Error\(/.test(ioSrc)
        && /toast\(e && e\.name === 'NotReadableError' \? 'The export is too large for this window to hold in one piece\. Nothing was written\.' : 'The export could not be written: ' \+ [^\n]*\n\s*return null;/.test(ioSrc) && /\(r\.videos \? ', ' \+ r\.videos \+ ' video\(s\)' : ''\)/.test(ioSrc) && /blob && blob\.size > 50 \* 1024 \* 1024 \? 600000 : 1000/.test(ioSrc)
        && !/new Uint8Array\(await r\.arrayBuffer\(\)\) \}\);\n\s*\} catch\(e\) \{ missing\+\+; \}/.test(ioSrc));
    const bigSrc = ioSrc.slice(ioSrc.indexOf('      if (handle) {'), ioSrc.indexOf('      for (var k = 0; k < paths.length; k++) {'));
    check('a large export (source): when the campaign\'s videos pass 1 GB (by its library\'s own sizes) and the window can ask, the GM picks the file first (while the click still counts; cancelling makes no export) and the archive is written straight to it — data.json and the pack files from memory, each file opened and pulled part by part; then the file is read back, its size and count compared and every entry\'s checksum checked before it is called exported; a failure aborts an unfinished file, takes away a finished one found wrong, and says so; nothing is downloaded twice',
        /var EXPORT_BIG = 1024 \* 1024 \* 1024;/.test(ioSrc) && /if \(typeof window\.showSaveFilePicker === 'function' && exportVideoBytes\(scope\) > EXPORT_BIG\) \{\n\s*try \{ handle = await window\.showSaveFilePicker\(\{ suggestedName: exportBaseName\(scope\) \+ '\.zip',/.test(ioSrc)
        && /catch \(e\) \{ if \(e && e\.name === 'AbortError'\) return; handle = null; \}/.test(ioSrc) && /var r = await buildExport\(scope, handle\);/.test(ioSrc) && /if \(!r\.saved\) downloadBlob\(r\.name, r\.blob\);/.test(ioSrc)
        && bigSrc.length > 800 && /paths\.forEach\(function\(p\) \{ sEntries\.push\(\{ name: p\.replace\(\/\^\\\/saves\\\/\/, ''\), open: function\(\) \{ return exportOpen\(encodeURI\(p\)\); \} \}\); \}\);/.test(bigSrc)
        && /res = await zip\.zipWrite\(\{ write: function\(pos, data\) \{ return w\.write\(\{ type: 'write', position: pos, data: data \}\); \}, truncate: function\(n\) \{ return w\.truncate\(n\); \} \}, sEntries, say\);\n\s*await w\.close\(\); w = null;/.test(bigSrc)
        && /var zfile = await handle\.getFile\(\), zread = await zip\.zipOpen\(zfile\);\n\s*if \(zfile\.size !== res\.size \|\| zread\.entries\.length !== res\.count\) throw new Error\([^\n]*\n\s*for \(var zi = 0; zi < zread\.entries\.length; zi\+\+\) await zread\.entries\[zi\]\.check\(\);/.test(bigSrc)
        && /if \(w\) \{ try \{ await w\.abort\(\); \} catch \(e2\) \{\} \}/.test(bigSrc) && /else if \(typeof handle\.remove === 'function'\) \{ try \{ await handle\.remove\(\); \}/.test(bigSrc) && /return \{ name: handle\.name \|\| \(base \+ '\.zip'\), saved: true,/.test(bigSrc));
    const exVid = new Function('state', 'getActiveCampaign', 'slugName', 'fetch', 'Blob', sliceOf(ioSrc, 'exportfile') + NL + 'return { exportVideoBytes: exportVideoBytes, exportBaseName: exportBaseName };');
    const stV = { appState: { campaigns: { a: { name: 'A B', videos: [{ size: 600000000 }, { size: 500000000 }, { size: 'x' }, null, { size: -5 }, { size: Infinity }] }, b: { videos: [{ size: 7 }] }, c: { videos: 'x' }, d: null } } };
    const evA = exVid(stV, () => stV.appState.campaigns.a, s => String(s).toLowerCase().replace(/ /g, '-'), null, Blob);
    check('how large an export will be is judged from the libraries\' own sizes (exportVideoBytes, run for real): this campaign\'s for Export This Campaign, every campaign\'s for Everything, nothing for the other scopes; only sizes that are numbers above 0 count',
        evA.exportVideoBytes('campaign') === 1100000000 && evA.exportVideoBytes('all') === 1100000007 && evA.exportVideoBytes('item') === 0 && evA.exportVideoBytes('maps') === 0 && evA.exportBaseName('campaign') === 'a-b-campaign' && evA.exportBaseName('all') === 'waypoint-everything'
        && exVid({ appState: null }, () => null, s => s, null, Blob).exportVideoBytes('all') === 0 && exVid({ appState: null }, () => null, s => s, null, Blob).exportVideoBytes('campaign') === 0);
    const zipBranch = mainSrc.slice(mainSrc.indexOf("      if (/\\.zip$/i.test(file.name)) {"), mainSrc.indexOf('      var reader = new FileReader();'));
    check('the import (source): the picked file is opened by slices, never read whole; data.json is read then (by its checksum; one past 512 MB refused), the pack files, the pictures and the videos kept as entries; each is copied only after check() found its checksum right, the Blob itself sent (a slice of the picked file), and a failure is counted and said',
        zipBranch.length > 400 && /var zopen = await zip\.zipOpen\(file\), entries = zopen\.entries;\n\s*pendingImportBytes = zopen\.size;/.test(zipBranch) && !/arrayBuffer\(\)/.test(zipBranch) && !/zipRead\(/.test(zipBranch) && /if \(dj\.size > 512 \* 1024 \* 1024\) \{ toast\(/.test(zipBranch) && /var djText = new TextDecoder\(\)\.decode\(await dj\.bytes\(\)\);/.test(zipBranch)
        && /pendingImportImages = entries\.filter\(function\(en\) \{ return \/\^images\\\/\/\.test\(en\.name\); \}\);/.test(zipBranch) && /libE\.forEach\(function\(en\) \{ pendingImportLibrary\[en\.name\] = en; \}\);/.test(zipBranch) && !/libE\[li\]\.bytes\(\)/.test(zipBranch)
        && /var body = await imgs\[i\]\.check\(\);[^\n]*\n\s*var r = await fetch\('\/api\/upload-exact\?path=' \+ encodeURIComponent\(relPath\), \{ method: 'POST', body: body \}\);\n\s*if \(r\.ok\) ok\+\+; else fail\+\+;\n\s*\} catch\(err\) \{ fail\+\+; \}/.test(mainSrc)
        && /toast\('Files copied: ' \+ ok \+ \(fail \? ', ' \+ fail \+ ' failed/.test(mainSrc) && !/new Blob\(\[imgs\[i\]\.data\]\)/.test(mainSrc));

    /* ---- said ---- */
    const ixZ = read('system/app/index.html'), wnZ = read('WHATSNEW.txt'), waZ = read('system/app/assets/whatsnew.txt'), ciZ = read('CAMPAIGN_INTEGRATION.md'), ymlZ = read('.github/workflows/checks.yml');
    check('said: Help\'s Export As line tells that a campaign export carries its sounds and videos whole, with no size limit (ZIP64 past 4 GB), and that an import checks every bundled file before copying it; the Export This Campaign button and the Video help say the videos travel; the release notes (both copies alike) and the integration guide say it; CI runs this suite',
        ixZ.includes('a campaign export (or Everything) also carries its sounds and its <b>videos</b>, whole &mdash; an export has no size limit') && ixZ.includes('checks every bundled file against its checksum before copying it, so a damaged one is counted as failed and never written.</li>')
        && ixZ.includes('with its images, sounds and videos bundled (whatever their size). Imports as this campaign."') && ixZ.includes('A campaign export carries the video files with it (<b>Export As</b> &#9656; This Campaign).')
        && ixZ.includes('When the videos pass 1 GB the export asks where to save it and writes straight to that file, then reads it back and checks every file in it before it is called exported.') && wnZ.includes('  When the videos pass 1 GB the export asks where to save it and writes' + NL + '  straight to that file (it is never held in memory), then reads it back' + NL)
        && wnZ.includes('- An export carries the campaign\'s videos, whole: Export This Campaign and' + NL + '  Export Everything bundle each video file with the pictures and sounds, and') && wnZ.includes('  against its checksum before copying it: a damaged one is counted as' + NL + '  failed, never written.')
        && wnZ.slice(wnZ.indexOf(NL + 'Video' + NL), wnZ.indexOf(NL + 'Dice' + NL)) === waZ.slice(waZ.indexOf(NL + 'Video' + NL), waZ.indexOf(NL + 'Dice' + NL))
        && ciZ.includes('A campaign export carries the files themselves under images/video/<campaign>/ in its zip') && /run: node tools\/zipcheck\.js/.test(ymlZ));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
