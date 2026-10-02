/* Offline check of text formats: the styling of a plain text field, stored beside the text (system/app/scripts/textfmt.js),
   and the planner / page editor's boxes and the bar on them that write it (planner.js, sliced by its [textcheck:...] markers and
   run for real on a page of plain objects, tools/boxdom.js — never copied).
   The core: every rule of cleanFmt (a seeded list of spans flattened to what painting them in order onto an array of
   characters gives — colour, bold, italic, underline, strike, a size and a link; a size and a link the field's own exactly
   when every character has that one; surrogate pairs; hostile and prototype keys; the same twice; nothing left -> undefined),
   cleanLink (the one rule for a link: the page sanitiser's rule for an <a href>, both run on one seeded corpus and asked for
   the same verdict on every address, the two statements of the rule pinned), respan (an edit
   before, inside, after; a cut; a full replacement; what is typed right after a styled part joining it — never across a line
   break — and right before it not; a seeded walk in which every character that survives keeps its look and what was typed takes
   the look of the character on its left where a span styles it),
   runsOf, apply / clear / stateAt.
   The editor: where each field's format lives; typing carrying it (tsType: a link not grown by typing at its end, the one constant
   flipped for the other setting; tsEditAt against respan); the box — the two pure maps between a character offset and a place in the
   drawn nodes, on plain-object trees; what a box shows for a stored text (an input's value, a textarea's), drawn from runsOf as
   elements and text nodes only, hostile formats plain, redrawn only where it differs; edits through the box (an engine written in
   boxdom.js types, deletes, pastes, composes, cuts: the box is read back as text only), a seeded walk of them against the text an input
   would hold and the look respan gives; the stored shape, an edit and a press through the box against the old boxes' handlers, pinned by
   hash; undo and redo — io.js's own history, undo, chord and chunk listeners (sliced by [textcheck:history] / [textcheck:steps] /
   [textcheck:undochord] / [textcheck:chunks]) run for real: steps, their selections, a seeded walk undone to the start and redone to
   the end; the bar on the box — one, shown on focus, hidden on leaving both, its place, every control with and without a selection, the
   Link box (Enter, leaving it, Escape, a port, a refusal, off for a flowchart label), the controls that take the focus, the keyboard
   (Ctrl+B / I / U, Alt+F10, Tab along the bar, Escape), the symbol tray, a rebuilt editor; Tab into a box, a large planner; and a
   seeded sequence of structure edits against a plain model. Find in the preview (planner.js [textcheck:find]) runs on a
   tree of plain objects, and so does the floating page panel's highlight (docpanel.js [textcheck:panelfold] / [textcheck:panelfind]:
   a word drawn as several runs is one hit of several marks); the text blocks' own bar is wired by the real wireRte ([textcheck:rtewire]).
   Run: node tools/textcheck.js */
'use strict';
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'system', 'app', 'scripts');
const modUrl = f => 'file:///' + path.resolve(path.join(dir, f)).replace(/\\/g, '/');
const read = f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
function slice(file, name) {
    const src = read(file), a = '// [textcheck:' + name + '-start]', b = '// [textcheck:' + name + '-end]';
    const i = src.indexOf(a), j = src.indexOf(b);
    if (i < 0 || j < 0 || j <= i) throw new Error('textcheck: marker ' + name + ' not found in ' + file);
    if (src.indexOf(a, i + 1) >= 0 || src.indexOf(b, j + 1) >= 0) throw new Error('textcheck: marker ' + name + ' is not unique in ' + file);
    return src.slice(i + a.length, j);
}

let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 500) : ''); } }
const J = v => JSON.stringify(v);
function rng(seed) { let a = seed >>> 0; return function() { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const RED = '#d9534f', GREEN = '#5cb87a', BLUE = '#4db3d3';

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let TF = null, loadErr = null;
    try { TF = await import(modUrl('textfmt.js')); } catch (e) { loadErr = e; }
    check('textfmt.js loads in Node with no window (a pure leaf: no imports, no DOM)', !!TF && !loadErr && !/^\s*import\s/m.test(read('textfmt.js')) && !/\bdocument\b/.test(read('textfmt.js').replace(/\/\*[\s\S]*?\*\//, '')), loadErr && loadErr.message);
    if (!TF) { console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { cleanFmt, cleanLink, runsOf, respan, apply, clear, stateAt, SIZES, SIZE_EM, PALETTE, MAX_SPANS, MAX_RAW, MAX_LINK } = TF;
    const DRL = await import(modUrl('docrender.js'));   // the page sanitiser: the link rule is its rule for an <a href>
    const RUN = (t, o) => Object.assign({ t, color: '', b: false, i: false, u: false, st: false, size: '', link: '' }, o || {});   // a run as runsOf gives one

    /* ================= cleanFmt ================= */
    check('cleanFmt: only a plain object is a format (null, a string, a number, a list -> undefined)',
        [null, undefined, 'bold', 7, true, [], [{ b: true }]].every(v => cleanFmt(v, 'text') === undefined));
    check('cleanFmt: nothing left -> undefined, never an empty object',
        [{}, { spans: [] }, { b: false, i: 0 }, { size: 'normal' }, { color: '' }, { spans: [{ s: 0, e: 3 }] }, { spans: [{ s: 2, e: 2, b: true }] }, { spans: 'x' }].every(v => cleanFmt(v, 'text') === undefined));
    check('cleanFmt: the size is one of the fixed steps (keys, never a number of pixels)',
        J(SIZES) === J(['small', 'large', 'larger', 'huge']) && SIZES.every(k => J(cleanFmt({ size: k }, 'x')) === J({ size: k }) && /^\d(\.\d+)?em$/.test(SIZE_EM[k]))
        && ['Large', '20px', '2em', 20, 'huge;color:red', 'constructor', '__proto__', 'toString'].every(v => cleanFmt({ size: v }, 'x') === undefined));
    check('cleanFmt: a colour is a strict #rrggbb, kept in lower case',
        J(cleanFmt({ color: '#D9534F' }, 'x')) === J({ color: RED })
        && ['#fff', 'red', '#d9534f80', 'rgb(1,2,3)', '#d9534f;background:url(//evil.example/x)', 'url(x)', ' #d9534f', '#d9534g', 0xd9534f, ['#d9534f']].every(v => cleanFmt({ color: v }, 'x') === undefined));
    check('cleanFmt: bold, italic, underline and strike only as true',
        J(cleanFmt({ b: true, i: true, u: true, st: true }, 'x')) === J({ b: true, i: true, u: true, st: true }) && [1, 'true', 'yes', {}, []].every(v => cleanFmt({ b: v, i: v, u: v, st: v }, 'x') === undefined));
    check('cleanFmt: the keys come out in one fixed order (size, color, b, i, u, st, link, spans; s, e, size, color, b, i, u, st, link)',
        J(cleanFmt({ spans: [{ link: 'https://a.b/', st: true, u: true, i: true, b: true, color: GREEN, size: 'small', e: 2, s: 0 }], st: true, u: true, i: true, color: RED }, 'text')) === J({ color: RED, i: true, u: true, st: true, spans: [{ s: 0, e: 2, size: 'small', color: GREEN, b: true, link: 'https://a.b/' }] })
        && J(cleanFmt({ link: 'https://a.b/', st: true, u: true, i: true, b: true, color: RED, size: 'large' }, 'text')) === J({ size: 'large', color: RED, b: true, i: true, u: true, st: true, link: 'https://a.b/' })
        && J(cleanFmt({ spans: [{ i: true, b: true, color: GREEN, e: 2, s: 0 }], i: true, color: RED, size: 'large' }, 'text')) === J({ size: 'large', color: RED, i: true, spans: [{ s: 0, e: 2, color: GREEN, b: true }] }));
    check('cleanFmt: a span needs whole-number offsets inside the text (a fraction, a string, a negative start, an empty or backward range, one past the end: dropped)',
        [{ s: 0.5, e: 2 }, { s: 0, e: 2.5 }, { s: '0', e: 2 }, { s: 0, e: '2' }, { s: -1, e: 2 }, { s: 2, e: 2 }, { s: 3, e: 1 }, { s: 4, e: 9 }, { s: 9, e: 12 }, { s: NaN, e: 2 }, { s: 0, e: Infinity }, { e: 2 }, { s: 0 }, null, 'x', [0, 2]].every(sp => cleanFmt({ spans: [Object.assign({ b: true }, sp)] }, 'text') === undefined));
    check('cleanFmt: a span that runs past the end is cut at the end',
        J(cleanFmt({ spans: [{ s: 2, e: 99, b: true }] }, 'text')) === J({ spans: [{ s: 2, e: 4, b: true }] }) && J(cleanFmt({ spans: [{ s: 0, e: 1e300, i: true }] }, 'text')) === J({ spans: [{ s: 0, e: 4, i: true }] }));
    check('cleanFmt: spans come out sorted',
        J(cleanFmt({ spans: [{ s: 6, e: 8, b: true }, { s: 0, e: 2, i: true }, { s: 3, e: 4, color: RED }] }, 'abcdefghij')) === J({ spans: [{ s: 0, e: 2, i: true }, { s: 3, e: 4, color: RED }, { s: 6, e: 8, b: true }] }));
    check('cleanFmt: overlapping spans are flattened, the later one winning on the keys it sets',
        J(cleanFmt({ spans: [{ s: 0, e: 6, color: RED, b: true }, { s: 2, e: 4, color: GREEN }] }, 'abcdefgh')) === J({ spans: [{ s: 0, e: 2, color: RED, b: true }, { s: 2, e: 4, color: GREEN, b: true }, { s: 4, e: 6, color: RED, b: true }] })
        && J(cleanFmt({ spans: [{ s: 2, e: 4, color: GREEN }, { s: 0, e: 6, color: RED }] }, 'abcdefgh')) === J({ spans: [{ s: 0, e: 6, color: RED }] }));
    check('cleanFmt: neighbours of one look are merged',
        J(cleanFmt({ spans: [{ s: 0, e: 2, b: true }, { s: 2, e: 5, b: true }, { s: 5, e: 6, b: true, color: RED }] }, 'abcdefgh')) === J({ spans: [{ s: 0, e: 5, b: true }, { s: 5, e: 6, color: RED, b: true }] }));
    check('cleanFmt: a span that adds nothing to the base is dropped (the base colour again, bold under a bold base)',
        J(cleanFmt({ color: RED, b: true, spans: [{ s: 0, e: 2, color: RED }, { s: 2, e: 4, b: true }, { s: 4, e: 6, color: '#D9534F', b: true }] }, 'abcdefgh')) === J({ color: RED, b: true })
        && J(cleanFmt({ color: RED, spans: [{ s: 1, e: 3, color: RED, i: true }] }, 'abcd')) === J({ color: RED, spans: [{ s: 1, e: 3, i: true }] }));
    check('cleanFmt: a span may carry a size — one of the same steps — and underline, strike and a link; a size that is none, or a link that is none, is dropped and the rest of the span stays',
        J(cleanFmt({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 2, e: 4, u: true, st: true, link: 'https://a.example/x' }] }, 'abcdef')) === J({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 2, e: 4, u: true, st: true, link: 'https://a.example/x' }] })
        && J(cleanFmt({ spans: [{ s: 0, e: 2, size: '20px', b: true }, { s: 2, e: 4, link: 'javascript:alert(1)', i: true }, { s: 4, e: 6, size: 'nope' }, { s: 4, e: 6, link: 'ftp://x' }] }, 'abcdef')) === J({ spans: [{ s: 0, e: 2, b: true }, { s: 2, e: 4, i: true }] }),
        [cleanFmt({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 2, e: 4, u: true, st: true, link: 'https://a.example/x' }] }, 'abcdef'), cleanFmt({ spans: [{ s: 0, e: 2, size: '20px', b: true }, { s: 2, e: 4, link: 'javascript:alert(1)', i: true }, { s: 4, e: 6, size: 'nope' }, { s: 4, e: 6, link: 'ftp://x' }] }, 'abcdef')]);
    check('cleanFmt: a size and a link are the field\'s own only when every character has that one — set as the base or by spans that cover everything, it is stored the same way; where the characters differ each part\'s is on its span',
        J(cleanFmt({ spans: [{ s: 0, e: 3, size: 'huge' }, { s: 3, e: 6, size: 'huge', b: true }] }, 'abcdef')) === J({ size: 'huge', spans: [{ s: 3, e: 6, b: true }] })
        && J(cleanFmt({ size: 'large', spans: [{ s: 2, e: 4, size: 'huge' }] }, 'abcdef')) === J({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 2, e: 4, size: 'huge' }, { s: 4, e: 6, size: 'large' }] })
        && J(cleanFmt({ size: 'large', spans: [{ s: 0, e: 6, size: 'small' }] }, 'abcdef')) === J({ size: 'small' })
        && J(cleanFmt({ link: 'https://a.example/', spans: [{ s: 0, e: 1, link: 'https://b.example/' }] }, 'ab')) === J({ spans: [{ s: 0, e: 1, link: 'https://b.example/' }, { s: 1, e: 2, link: 'https://a.example/' }] })
        && J(cleanFmt({ spans: [{ s: 0, e: 2, link: 'https://a.example/' }] }, 'ab')) === J({ link: 'https://a.example/' }) && J(cleanFmt({ size: 'large', link: 'https://a.example/' }, '')) === J({ size: 'large', link: 'https://a.example/' }),
        [cleanFmt({ spans: [{ s: 0, e: 3, size: 'huge' }, { s: 3, e: 6, size: 'huge', b: true }] }, 'abcdef'), cleanFmt({ size: 'large', spans: [{ s: 2, e: 4, size: 'huge' }] }, 'abcdef'), cleanFmt({ spans: [{ s: 0, e: 2, link: 'https://a.example/' }] }, 'ab')]);
    check('cleanFmt: a format written before a part could have a size — one size for the field, colours and bold on its spans — is kept exactly as it was',
        [{ size: 'large', color: RED, spans: [{ s: 0, e: 6, color: GREEN }] }, { size: 'huge', b: true, spans: [{ s: 0, e: 2, i: true }] }, { size: 'small' }, { color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] }].every(f => J(cleanFmt(f, 'buy milk and walk dog')) === J(f)));
    // the one rule for a link: the page sanitiser's rule for an <a href> (docrender.js safeHref)
    const LINK_NO = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///c:/x', 'ftp://a.example', '//a.example', '/saves/x', 'a.example', 'https://', 'http://', 'https:/a.example', 'https://a b', 'https://a\tb', 'https://a\nb', 'https://a\u0000b', 'https://a\u007fb', 'https://a\u00a0b', 'https://a\u2028b', '\u0001https://a.example', 'java\tscript:alert(1)', ' javascript:alert(1)', ' ', ''];
    const LINK_YES = ['https://a.example/x?y=1&z=2#f', 'http://a.example', 'HTTPS://A.example', 'hTtP://a.example/"q"', 'https://a.example/<b>', 'https://a.example/&amp;', 'https://a.example/&#106;', 'https://a.example/&#10;x', 'https://\u00e9.example/\ud83d\ude00', 'https://a.example/\u200b', 'https://javascript:alert(1)'];
    check('cleanLink: a link is a web address — http:// or https:// (any case) with something after it, trimmed, with no white space and no control character inside, at most ' + MAX_LINK + ' long; anything else, and anything that is no string, is no link',
        MAX_LINK === 2000 && LINK_YES.every(v => cleanLink(v) === v) && cleanLink('  http://a.example \n') === 'http://a.example' && cleanLink('\ufeffhttps://a.example\u00a0') === 'https://a.example'
        && cleanLink('https://' + 'a'.repeat(1992)).length === 2000 && cleanLink('https://' + 'a'.repeat(1993)) === '' && cleanLink(' https://' + 'a'.repeat(1992) + ' ').length === 2000
        && LINK_NO.every(v => cleanLink(v) === '') && [null, undefined, 7, true, {}, ['https://a.example'], { toString() { return 'https://a.example'; } }].every(v => cleanLink(v) === ''),
        LINK_YES.filter(v => cleanLink(v) !== v).concat(LINK_NO.filter(v => cleanLink(v) !== '')));
    {
        // the same verdict as the page sanitiser gives that address in an <a href>: the href it writes there, or no link at all (just the text)
        const escA = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const viaPage = v => { const m = /^<a href="([^"]*)" target="_blank" rel="noopener noreferrer">x<\/a>$/.exec(DRL.sanitizeHtml('<a href="' + escA(v) + '">x</a>')); return m ? m[1] : null; };
        const R = rng(515), bits = ['https://', 'http://', 'HTTP://', 'hTTps://', 'javascript:', 'data:', '//', 'a.example', '/x', '?q=1&r=2', '#f', ' ', '\t', '\n', '\r', '\u0000', '\u001f', '\u007f', '\u00a0', '\u200b', '\u2028', '\u3000', '\ufeff', '"', '\'', '<', '>', '&', '&amp;', '&#106;', '&#x6a;', '&Tab;', '&#9;', '&#10;', '&#32;', '&nbsp;', '&NewLine;', '%20', '\u00e9', '\ud83d\ude00', ':', '@', '\\', 'x'.repeat(700)];
        const corpus = LINK_NO.concat(LINK_YES, ['https://' + 'a'.repeat(1992), 'https://' + 'a'.repeat(1993), ' https://' + 'a'.repeat(1992) + ' ', '  http://a.example \n']);
        for (let k = 0; k < 4000; k++) corpus.push((R() < 0.6 ? bits[Math.floor(R() * 4)] : '') + Array.from({ length: 1 + Math.floor(R() * 6) }, () => bits[Math.floor(R() * bits.length)]).join(''));   // more than half begin as a web address does
        let bad = null, kept = 0, refused = 0;
        corpus.forEach(v => { const mine = cleanLink(v), page = viaPage(v); if (!bad && ((mine === '') !== (page === null) || (mine && escA(mine) !== page))) bad = { v, mine, page }; if (mine) kept++; else refused++; });
        const drSrc = read('docrender.js'), tfRule = slice('textfmt.js', 'linkrule');
        check('cleanLink is the page sanitiser\'s rule (one corpus, ' + corpus.length + ' addresses — schemes in every case, white space and control characters anywhere, entities, quotes, over-long ones): for every one, the core and the sanitiser\'s <a href> agree on whether it is a link (' + kept + ' are, ' + refused + ' are not) and on the address kept',
            !bad && kept > 300 && refused > 1500, bad || { kept, refused });
        check('cleanLink (the two statements of the rule, pinned): the sanitiser\'s safeHref and the core\'s cleanLink test the same two patterns and the same length — a change to one must be made to the other',
            drSrc.indexOf('if (/[\\u0000-\\u001f\\u007f\\s]/.test(v) || v.length > 2000) return null;') > 0 && drSrc.indexOf('return /^https?:\\/\\/.+/i.test(v) ? v : null;') > 0 && /v = decodeEntities\(v\)\.trim\(\);/.test(drSrc)
            && tfRule.indexOf('if (/[\\u0000-\\u001f\\u007f\\s]/.test(v) || v.length > MAX_LINK) return \'\';') > 0 && tfRule.indexOf('return /^https?:\\/\\/.+/i.test(v) ? v : \'\';') > 0 && tfRule.indexOf('v = v.trim();') > 0 && /var MAX_LINK = 2000;/.test(read('textfmt.js')));
    }
    check('cleanFmt: a link that is not allowed is dropped and the text keeps the rest of its look — on the base and on a span; an over-long one too; a kept one is stored trimmed',
        LINK_NO.concat(['https://' + 'a'.repeat(1993)]).every(v => J(cleanFmt({ b: true, link: v, spans: [{ s: 0, e: 2, color: RED, link: v }] }, 'text')) === J({ b: true, spans: [{ s: 0, e: 2, color: RED }] }) && cleanFmt({ link: v, spans: [{ s: 0, e: 2, link: v }] }, 'text') === undefined)
        && J(cleanFmt({ spans: [{ s: 0, e: 2, link: ' https://a.example/x ' }] }, 'text')) === J({ spans: [{ s: 0, e: 2, link: 'https://a.example/x' }] }));
    {
        const many = []; for (let k = 0; k < 300; k++) many.push({ s: k * 2, e: k * 2 + 1, b: true });
        const c = cleanFmt({ spans: many }, 'x'.repeat(700));
        check('cleanFmt: at most ' + MAX_SPANS + ' spans a field, the first ones in the text\'s order', MAX_SPANS === 200 && c.spans.length === 200 && c.spans[0].s === 0 && c.spans[199].s === 398, c.spans.length);
        const split = many.slice(0, 199).concat([{ s: 500, e: 503, b: true }, { s: 503, e: 507, b: true }, { s: 600, e: 601, b: true }]), cs = cleanFmt({ spans: split }, 'x'.repeat(700));
        check('cleanFmt: the cap counts whole spans — neighbours of one look are one span before they are counted', cs.spans.length === 200 && JSON.stringify(cs.spans[199]) === JSON.stringify({ s: 500, e: 507, b: true }), cs.spans[199]);
        const raw = []; for (let k = 0; k < 1000; k++) raw.push({ s: 1500 - k, e: 1501 - k, i: true, color: k % 2 ? RED : GREEN });
        const c2 = cleanFmt({ spans: raw }, 'y'.repeat(2000));
        check('cleanFmt: only the first ' + MAX_RAW + ' entries of a stored list are read', MAX_RAW === 400 && c2.spans.length === 200 && c2.spans[0].s === 1101, c2.spans[0]);
        let t0 = Date.now(); const big = []; for (let k = 0; k < 200000; k++) big.push({ s: k % 1900, e: (k % 1900) + 50, b: true, color: RED });
        cleanFmt({ spans: big }, 'z'.repeat(2000));
        check('cleanFmt: a list of 200,000 spans costs no more than a short one', Date.now() - t0 < 1500, Date.now() - t0);
    }
    {
        const hostile = JSON.parse('{"b":true,"u":1,"st":"true","link":"javascript:alert(1)","href":"https://a.example/","s":true,"__proto__":{"i":true,"u":true,"st":true,"link":"https://a.example/","color":"#5cb87a"},"constructor":{"prototype":{"x":1}},"style":"color:red","onclick":"alert(1)","url":"//evil.example","spans":[{"s":0,"e":2,"color":"#d9534f","link":"data:text/html,x","size":"99em","__proto__":{"b":true,"u":true,"link":"https://a.example/"},"style":"x","href":"javascript:alert(1)"}]}');
        const c = cleanFmt(hostile, 'text');
        check('cleanFmt: every other key is ignored (a style, a handler, a URL, __proto__, constructor): only the known keys come out',
            J(c) === J({ b: true, spans: [{ s: 0, e: 2, color: RED }] }) && Object.keys(c).join() === 'b,spans' && Object.keys(c.spans[0]).join() === 's,e,color' && ({}).i === undefined && ({}).x === undefined, c);
        const inherited = Object.create({ b: true, u: true, st: true, link: 'https://a.example/', color: RED, size: 'huge', spans: [{ s: 0, e: 2, i: true }] });
        const spanInherit = Object.create({ s: 0, e: 2, b: true, u: true, st: true, size: 'large', link: 'https://a.example/' });
        check('cleanFmt: a key a format or a span only inherits is not read', cleanFmt(inherited, 'text') === undefined && cleanFmt({ spans: [spanInherit] }, 'text') === undefined);
        const frozen = Object.freeze({ color: RED, spans: Object.freeze([Object.freeze({ s: 0, e: 2, b: true })]) });
        const out = cleanFmt(frozen, 'text');
        check('cleanFmt: the result is a new object, the one given is left as it was', J(out) === J({ color: RED, spans: [{ s: 0, e: 2, b: true }] }) && out !== frozen && out.spans !== frozen.spans && out.spans[0] !== frozen.spans[0]);
    }
    {
        const t = 'a😀b😁c';   // a, a pair (1-2), b (3), a pair (4-5), c (6)
        check('cleanFmt: an offset inside a surrogate pair moves out to the pair\'s edge (never half a character)',
            J(cleanFmt({ spans: [{ s: 2, e: 4, b: true }] }, t)) === J({ spans: [{ s: 1, e: 4, b: true }] })
            && J(cleanFmt({ spans: [{ s: 0, e: 2, b: true }] }, t)) === J({ spans: [{ s: 0, e: 3, b: true }] })
            && J(cleanFmt({ spans: [{ s: 2, e: 5, color: RED }] }, t)) === J({ spans: [{ s: 1, e: 6, color: RED }] })
            && J(cleanFmt({ spans: [{ s: 1, e: 3, i: true }] }, t)) === J({ spans: [{ s: 1, e: 3, i: true }] })
            && runsOf(t, { spans: [{ s: 2, e: 5, color: RED }] }).every(r => !/^[\udc00-\udfff]/.test(r.t) && !/[\ud800-\udbff]$/.test(r.t)));
    }
    // a seeded list of spans, flattened: what painting them in order onto an array of characters gives
    {
        const R = rng(20261002), colors = [RED, GREEN, BLUE, '#D9534F', 'red', '#fff'], sizes = ['small', 'large', 'huge', 'nope', undefined], links = ['https://a.example/x', 'http://b.example/', 'HTTPS://C.example/?q=1', 'javascript:alert(1)', 'https://a b', '', 7];
        let bad = null, twice = null, shape = null, canon = null, n = 0;
        const seen = { size: 0, link: 0, u: 0, st: 0, baseSize: 0, baseLink: 0 };
        for (let round = 0; round < 400 && !bad && !twice && !shape && !canon; round++) {
            const len = 1 + Math.floor(R() * 40), text = Array.from({ length: len }, () => 'abcdef '[Math.floor(R() * 7)]).join('');
            const fmt = {}; if (R() < 0.3) fmt.color = colors[Math.floor(R() * colors.length)]; if (R() < 0.3) fmt.b = true; if (R() < 0.2) fmt.i = R() < 0.8 ? true : 1; if (R() < 0.3) fmt.size = sizes[Math.floor(R() * sizes.length)];
            if (R() < 0.2) fmt.u = R() < 0.8 ? true : 'yes'; if (R() < 0.2) fmt.st = true; if (R() < 0.2) fmt.link = links[Math.floor(R() * links.length)];
            fmt.spans = Array.from({ length: Math.floor(R() * 14) }, () => {
                const s = Math.floor(R() * (len + 3)) - 1, e = s + Math.floor(R() * 12) - 1, sp = { s, e };
                if (R() < 0.6) sp.color = colors[Math.floor(R() * colors.length)]; if (R() < 0.4) sp.b = R() < 0.9 ? true : 'yes'; if (R() < 0.3) sp.i = true;
                if (R() < 0.3) sp.u = true; if (R() < 0.3) sp.st = R() < 0.9 ? true : 1; if (R() < 0.3) sp.size = sizes[Math.floor(R() * sizes.length)]; if (R() < 0.3) sp.link = links[Math.floor(R() * links.length)];
                return R() < 0.05 ? null : sp;
            });
            if (round % 7 === 0) fmt.spans.push({ s: 0, e: len, size: 'larger', link: 'https://whole.example/' });   // every character one size and one link, set by a span: the field's own
            // the model: one cell per character, the base first, then each span painted in the list's order
            const hexOf = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : '', sizeOf = v => ['small', 'large', 'larger', 'huge'].indexOf(v) >= 0 ? v : '', linkOf = v => typeof v === 'string' && /^https?:\/\/\S+$/i.test(v) ? v : '';
            const cells = Array.from({ length: len }, () => ({ color: hexOf(fmt.color), b: fmt.b === true, i: fmt.i === true, u: fmt.u === true, st: fmt.st === true, size: sizeOf(fmt.size), link: linkOf(fmt.link) }));
            fmt.spans.forEach(sp => {
                if (!sp || !Number.isInteger(sp.s) || !Number.isInteger(sp.e) || sp.s < 0) return;
                for (let k = sp.s; k < Math.min(sp.e, len); k++) { const c = cells[k]; if (hexOf(sp.color)) c.color = hexOf(sp.color); if (sp.b === true) c.b = true; if (sp.i === true) c.i = true; if (sp.u === true) c.u = true; if (sp.st === true) c.st = true; if (sizeOf(sp.size)) c.size = sizeOf(sp.size); if (linkOf(sp.link)) c.link = linkOf(sp.link); }
            });
            const key = c => [c.color, c.b, c.i, c.u, c.st, c.size, c.link].join('|');
            const want = cells.map(key);
            const got = []; runsOf(text, fmt).forEach(r => { for (let k = 0; k < r.t.length; k++) got.push(key(r)); if (r.size) seen.size++; if (r.link) seen.link++; if (r.u) seen.u++; if (r.st) seen.st++; });
            if (J(got) !== J(want)) bad = { text, fmt, got, want };
            const c1 = cleanFmt(fmt, text), c2 = cleanFmt(c1, text);
            if (J(c1) !== J(c2)) twice = { fmt, c1, c2 };
            const look = x => J([x.size, x.color, x.b, x.i, x.u, x.st, x.link]);
            if (c1 && c1.spans) { for (let k = 0; k < c1.spans.length; k++) { const sp = c1.spans[k], pv = c1.spans[k - 1]; if (!(sp.s >= 0 && sp.s < sp.e && sp.e <= len) || (pv && pv.e > sp.s) || (pv && pv.e === sp.s && look(pv) === look(sp)) || Object.keys(sp).some(kk => ['s', 'e', 'size', 'color', 'b', 'i', 'u', 'st', 'link'].indexOf(kk) < 0)) shape = { c1 }; } }
            if (c1 && J(Object.keys(c1).filter(k => ['size', 'color', 'b', 'i', 'u', 'st', 'link', 'spans'].indexOf(k) < 0)) !== '[]') shape = { c1 };
            // a size and a link are the base's exactly when every character has that one — and then no span carries one
            const oneOf = k => cells.every(c => c[k] === cells[0][k]) ? cells[0][k] : '';
            if (((c1 && c1.size) || '') !== oneOf('size') || ((c1 && c1.link) || '') !== oneOf('link') || ((c1 && c1.spans) || []).some(sp => (c1.size && 'size' in sp) || (c1.link && 'link' in sp))) canon = { text, fmt, c1 };
            if (c1 && c1.size) seen.baseSize++; if (c1 && c1.link) seen.baseLink++;
            n++;
        }
        check('cleanFmt (seeded, 400 formats): the flattened spans paint each character as painting the list in order does — colour, bold, italic, underline, strike, size and link', !bad && n === 400 && seen.size > 100 && seen.link > 60 && seen.u > 100 && seen.st > 100, bad || seen);
        check('cleanFmt (seeded): cleaned twice is the same as cleaned once', !twice, twice);
        check('cleanFmt (seeded): what comes out is sorted, inside the text, never overlapping, no two neighbours alike, known keys only', !shape, shape);
        check('cleanFmt (seeded): a size and a link are the field\'s own exactly when every character has that one (' + seen.baseSize + ' and ' + seen.baseLink + ' of the formats) — and then no span carries one', !canon && seen.baseSize > 40 && seen.baseLink > 40, canon || seen);
    }

    /* ================= runsOf ================= */
    check('runsOf: no format is one plain run; an empty text is no run',
        J(runsOf('hello', undefined)) === J([RUN('hello')]) && J(runsOf('', { b: true })) === '[]' && J(runsOf(null, { b: true })) === '[]');
    check('runsOf: the base lies under the spans, and the runs join back to the text',
        J(runsOf('buy milk', { color: RED, i: true, spans: [{ s: 4, e: 8, color: GREEN, b: true }] })) === J([RUN('buy ', { color: RED, i: true }), RUN('milk', { color: GREEN, b: true, i: true })])
        && runsOf('a\nb c', { spans: [{ s: 1, e: 3, b: true }] }).map(r => r.t).join('') === 'a\nb c');
    check('runsOf: a hostile format draws plain (one run, no colour) — and a size or a colour that is no colour never reaches a run',
        J(runsOf('x<y', { color: 'red;background:url(//evil.example)', b: 'yes', u: 1, size: '40px', link: 'javascript:alert(1)', spans: [{ s: 0, e: 2, color: 'url(x)', link: 'data:x', size: 'big' }] })) === J([RUN('x<y')]));
    check('runsOf: a run has one size — its span\'s, or else the field\'s — and its link; underline and strike as the other switches',
        J(runsOf('buy milk now', { size: 'large', u: true, spans: [{ s: 4, e: 8, st: true, link: 'https://a.example/' }] })) === J([RUN('buy ', { u: true, size: 'large' }), RUN('milk', { u: true, st: true, size: 'large', link: 'https://a.example/' }), RUN(' now', { u: true, size: 'large' })])
        && J(runsOf('ab', { spans: [{ s: 0, e: 1, size: 'huge' }, { s: 1, e: 2, size: 'small' }] }).map(r => r.size)) === J(['huge', 'small']) && J(runsOf('ab', { link: 'https://a.example/' })) === J([RUN('ab', { link: 'https://a.example/' })]));
    check('runsOf draws what cleanFmt keeps: past the 200th span the text is plain', (() => {
        const many = []; for (let k = 0; k < 300; k++) many.push({ s: k * 2, e: k * 2 + 1, b: true });
        const runs = runsOf('x'.repeat(700), { spans: many }); return runs.filter(r => r.b).length === 200 && runs[runs.length - 1].t.length === 700 - 399;
    })());

    /* ================= respan ================= */
    const F1 = { color: RED, spans: [{ s: 4, e: 8, color: GREEN }] };   // 'buy milk now': milk
    check('respan: unchanged text keeps the format as it is', J(respan('buy milk now', 'buy milk now', F1)) === J(F1));
    check('respan: typing before a span moves it along', J(respan('buy milk now', 'do buy milk now', F1, 3)) === J({ color: RED, spans: [{ s: 7, e: 11, color: GREEN }] }));
    check('respan: typing inside a span grows it', J(respan('buy milk now', 'buy miilk now', F1, 7)) === J({ color: RED, spans: [{ s: 4, e: 9, color: GREEN }] }));
    check('respan: typing after a span leaves it where it is', J(respan('buy milk now', 'buy milk now!', F1, 13)) === J(F1));
    // Typing next to a styled part (the owner's rule of 2026-10-02): what is typed right AFTER a part joins it, what is typed right BEFORE it does not
    check('respan: typing right after a span joins it (the span grows); typing right before it does not (it takes what is before it)',
        J(respan('buy milk now', 'buy milks now', F1, 9)) === J({ color: RED, spans: [{ s: 4, e: 9, color: GREEN }] }) && J(respan('buy milk now', 'buy xmilk now', F1, 5)) === J({ color: RED, spans: [{ s: 5, e: 9, color: GREEN }] })
        && J(respan('buy milk now', 'buy milks now', F1)) === J({ color: RED, spans: [{ s: 4, e: 9, color: GREEN }] }), [respan('buy milk now', 'buy milks now', F1, 9), respan('buy milk now', 'buy xmilk now', F1, 5)]);
    check('respan: a paste counts as typing — every character of it joins the span it was pasted right after',
        J(respan('buy milk now', 'buy milkshake mix now', F1, 17)) === J({ color: RED, spans: [{ s: 4, e: 17, color: GREEN }] }) && J(respan('ab', 'abcd', { spans: [{ s: 0, e: 2, b: true }] }, 4)) === J({ spans: [{ s: 0, e: 4, b: true }] }));
    check('respan: between two touching spans what is typed belongs to the one on its left',
        J(respan('abcd', 'abXcd', { spans: [{ s: 0, e: 2, color: RED }, { s: 2, e: 4, color: GREEN }] }, 3)) === J({ spans: [{ s: 0, e: 3, color: RED }, { s: 3, e: 5, color: GREEN }] })
        && J(respan('abcd', 'abX', { spans: [{ s: 0, e: 2, color: RED }, { s: 2, e: 4, color: GREEN }] }, 3)) === J({ spans: [{ s: 0, e: 3, color: RED }] }));   // the right one typed over: still the left one's
    check('respan: a deletion never grows a span (the character after it, its own last one, a cut across its end)',
        J(respan('buy milk now', 'buy milknow', F1, 8)) === J(F1) && J(respan('buy milk now', 'buy mil now', F1, 7)) === J({ color: RED, spans: [{ s: 4, e: 7, color: GREEN }] })
        && J(respan('buy milk now', 'buy miow', F1, 6)) === J({ color: RED, spans: [{ s: 4, e: 6, color: GREEN }] }) && J(respan('buy milk now', 'buy milk', F1, 8)) === J(F1));
    check('respan: a span that ends at a line break still grows when you type at the end of its line',
        J(respan('buy milk\nwalk dog', 'buy milk!\nwalk dog', { color: RED, spans: [{ s: 0, e: 8, color: GREEN }] }, 9)) === J({ color: RED, spans: [{ s: 0, e: 9, color: GREEN }] }));
    check('respan: Enter at a span\'s end begins a line that is not the span\'s — neither the line break nor what is typed after it joins (a pasted run that begins with a line break too)',
        (() => { const g = { color: RED, spans: [{ s: 0, e: 8, color: GREEN }] }, a = respan('buy milk', 'buy milk\n', g, 9), b = respan('buy milk\n', 'buy milk\nw', a, 10), c = respan('buy milk\nw', 'buy milk\nwalk', b, 13);
            return J(a) === J(g) && J(b) === J(g) && J(c) === J(g) && J(respan('buy milk', 'buy milk\nwalk dog', g, 17)) === J(g) && J(respan('buy milk', 'buy milk\r\nwalk', g, 14)) === J(g); })());
    check('respan: a span that holds its line\'s break as its last character does not run on into the next line; typed before that break it grows',
        (() => { const g = { color: RED, spans: [{ s: 0, e: 9, color: GREEN }] };   // "buy milk" and its line break, as a triple click selects a line
            return J(respan('buy milk\nwalk dog', 'buy milk\nxwalk dog', g, 10)) === J(g) && J(respan('buy milk\nwalk dog', 'buy milk!\nwalk dog', g, 9)) === J({ color: RED, spans: [{ s: 0, e: 10, color: GREEN }] }); })());
    check('respan: inside a span everything typed is the span\'s — a line break too, and the line begun after it',
        (() => { const g = { spans: [{ s: 0, e: 4, color: GREEN }] }, a = respan('abcd x', 'ab\ncd x', g, 3), b = respan('ab\ncd x', 'ab\nzcd x', a, 4);
            return J(a) === J({ spans: [{ s: 0, e: 5, color: GREEN }] }) && J(b) === J({ spans: [{ s: 0, e: 6, color: GREEN }] }); })());
    check('respan: typing over a selection — what replaces the end of a span joins what is left of it; what replaces its start does not',
        J(respan('buy milk now', 'buy miXw', F1, 7)) === J({ color: RED, spans: [{ s: 4, e: 7, color: GREEN }] }) && J(respan('buy milk now', 'buXlk now', F1, 3)) === J({ color: RED, spans: [{ s: 3, e: 5, color: GREEN }] }));
    check('respan: a deletion that cuts into a span leaves what survives (its end, its start, its middle)',
        J(respan('buy milk now', 'buy mi now', F1, 6)) === J({ color: RED, spans: [{ s: 4, e: 6, color: GREEN }] })
        && J(respan('buy milk now', 'bulk now', F1, 2)) === J({ color: RED, spans: [{ s: 2, e: 4, color: GREEN }] })
        && J(respan('buy milk now', 'buy mk now', F1, 5)) === J({ color: RED, spans: [{ s: 4, e: 6, color: GREEN }] }));
    check('respan: a span wholly inside what was replaced goes; the base stays',
        J(respan('buy milk now', 'buy tea now', F1, 7)) === J({ color: RED }) && J(respan('buy milk now', 'x', F1, 1)) === J({ color: RED }) && J(respan('buy milk now', '', F1, 0)) === J({ color: RED }));
    check('respan: no format in, none out; a base alone needs no text', respan('a', 'b', undefined) === undefined && respan('a', 'b', { spans: [] }) === undefined && J(respan('abc', 'xyz', { b: true, size: 'large' })) === J({ size: 'large', b: true }));
    check('respan: a span\'s size, underline, strike and link are carried as its colour is — typing inside it grows it, typing right after it joins it, the field\'s own stay the field\'s',
        J(respan('buy milk now', 'buy miilk now', { u: true, spans: [{ s: 4, e: 8, size: 'huge', st: true, link: 'https://a.example/' }] }, 7)) === J({ u: true, spans: [{ s: 4, e: 9, size: 'huge', st: true, link: 'https://a.example/' }] })
        && J(respan('buy milk now', 'buy milks now', { spans: [{ s: 4, e: 8, size: 'large' }] }, 9)) === J({ spans: [{ s: 4, e: 9, size: 'large' }] }) && J(respan('buy milk now', 'buy milk now!', { spans: [{ s: 4, e: 8, link: 'https://a.example/' }] }, 13)) === J({ spans: [{ s: 4, e: 8, link: 'https://a.example/' }] })
        && J(respan('abc', 'xyz', { size: 'large', u: true, st: true, link: 'https://a.example/' })) === J({ size: 'large', u: true, st: true, link: 'https://a.example/' }) && J(respan('ab cd', 'ab', { spans: [{ s: 0, e: 2, size: 'large' }] }, 2)) === J({ size: 'large' }));
    check('respan: the caret tells where a run of equal characters was edited',
        J(respan('xaay', 'xaaay', { spans: [{ s: 1, e: 2, b: true }] }, 2)) === J({ spans: [{ s: 2, e: 3, b: true }] })       // typed before the bold a
        && J(respan('xaay', 'xaaay', { spans: [{ s: 1, e: 2, b: true }] }, 4)) === J({ spans: [{ s: 1, e: 2, b: true }] })    // typed after both
        && J(respan('xaay', 'xaaay', { spans: [{ s: 1, e: 2, b: true }] })) === J({ spans: [{ s: 1, e: 2, b: true }] })       // no caret: still one bold a
        && J(respan('xaay', 'xaaay', { spans: [{ s: 1, e: 2, b: true }] }, 99)) === J({ spans: [{ s: 1, e: 2, b: true }] }));  // a caret that cannot be: ignored
    check('respan: an edit next to a surrogate pair never leaves half of it styled',
        (() => { const o = 'a😀b', nw = 'a😁b', f = respan(o, nw, { spans: [{ s: 0, e: 4, color: RED }, { s: 1, e: 3, b: true }] }, 3); return runsOf(nw, f).every(r => !/^[\udc00-\udfff]/.test(r.t) && !/[\ud800-\udbff]$/.test(r.t)) && runsOf(nw, f).map(r => r.t).join('') === nw; })());
    check('respan: an emoji typed over an emoji joins or stays apart exactly as a letter typed over a letter does — two emoji that share half their code are still two whole characters (right after a span it joins it; over a span\'s first character it does not; with the caret or without)',
        (() => { const g = { spans: [{ s: 0, e: 1, color: GREEN }] }, a = '😀', b = '😁', c = '🈀';   // a and b share their first half, a and c their second
            return J(respan('G' + a + 'x', 'G' + b + 'x', g, 3)) === J({ spans: [{ s: 0, e: 3, color: GREEN }] }) && J(respan('G' + a + 'x', 'G' + b + 'x', g)) === J({ spans: [{ s: 0, e: 3, color: GREEN }] })
                && J(respan('Gax', 'Gbx', g, 2)) === J({ spans: [{ s: 0, e: 2, color: GREEN }] })
                && J(respan('x' + a + 'G', 'x' + c + 'G', { spans: [{ s: 1, e: 4, color: GREEN }] }, 3)) === J({ spans: [{ s: 3, e: 4, color: GREEN }] }) && J(respan('x' + a + 'G', 'x' + c + 'G', { spans: [{ s: 1, e: 4, color: GREEN }] })) === J({ spans: [{ s: 3, e: 4, color: GREEN }] })
                && J(respan('xaG', 'xbG', { spans: [{ s: 1, e: 3, color: GREEN }] }, 2)) === J({ spans: [{ s: 2, e: 3, color: GREEN }] }); })(),
        [respan('G😀x', 'G😁x', { spans: [{ s: 0, e: 1, color: GREEN }] }, 3), respan('x😀G', 'x🈀G', { spans: [{ s: 1, e: 4, color: GREEN }] }, 3)]);
    check('respan: one of two emoji that share half their code deleted is a deletion — the one that stays keeps its own look and nothing grows (with the caret or without)',
        (() => { const a = '😀', b = '😁', g = { spans: [{ s: 0, e: 1, color: GREEN }, { s: 1, e: 3, b: true }] };   // G green, the first emoji bold
            return J(respan('G' + a + b + 'x', 'G' + b + 'x', g, 1)) === J({ spans: [{ s: 0, e: 1, color: GREEN }] }) && J(respan('G' + a + b + 'x', 'G' + b + 'x', g)) === J({ spans: [{ s: 0, e: 1, color: GREEN }] })
                && J(respan('G' + a + b + 'x', 'G' + a + 'x', g, 3)) === J(g) && J(respan('G' + a + b + 'x', 'G' + a + 'x', g)) === J(g); })());
    check('respan: an edit the browser\'s own undo or redo made is not typing — with the fifth argument true nothing joins: text put back right after a span stays outside it, and what replaces a span\'s end does not join what is left; everything else is carried as ever',
        J(respan('then', 'then go', { spans: [{ s: 0, e: 4, b: true }] }, 7, true)) === J({ spans: [{ s: 0, e: 4, b: true }] }) && J(respan('then', 'then go', { spans: [{ s: 0, e: 4, b: true }] }, 7)) === J({ spans: [{ s: 0, e: 7, b: true }] })
        && J(respan('buy milk now', 'buy miXw', F1, 7, true)) === J({ color: RED, spans: [{ s: 4, e: 6, color: GREEN }] }) && J(respan('buy milk now', 'buy miilk now', F1, 7, true)) === J({ color: RED, spans: [{ s: 4, e: 9, color: GREEN }] })
        && J(respan('buy milk now', 'do buy milk now', F1, 3, true)) === J({ color: RED, spans: [{ s: 7, e: 11, color: GREEN }] }) && J(respan('then', 'then go', { spans: [{ s: 0, e: 4, b: true }] }, 7, 1)) === J({ spans: [{ s: 0, e: 7, b: true }] }));
    // a seeded walk, with and without the caret: every character that survives an edit keeps its look, and what was typed takes the look of
    // the character on its left where a span styles that one — unless the typed run begins with a line break or follows one at that span's
    // end — and the field's own look everywhere else
    {
        const R = rng(7741), alpha = 'ab c\nd';
        const look = (text, fmt) => { const out = []; runsOf(text, fmt).forEach(r => { for (let k = 0; k < r.t.length; k++) out.push(r.color + '|' + r.b + '|' + r.i); }); return out; };
        let bad = null, steps = 0, styled = 0, joined = 0, apart = 0;
        for (let round = 0; round < 60 && !bad; round++) {
            let text = Array.from({ length: 6 + Math.floor(R() * 20) }, () => alpha[Math.floor(R() * alpha.length)]).join('');
            let fmt = cleanFmt({ color: R() < 0.5 ? RED : undefined, spans: Array.from({ length: 5 }, () => { const s = Math.floor(R() * text.length); return { s, e: s + 1 + Math.floor(R() * 6), color: R() < 0.6 ? [GREEN, BLUE][Math.floor(R() * 2)] : undefined, b: R() < 0.5 ? true : undefined, i: R() < 0.3 ? true : undefined }; }) }, text);
            for (let step = 0; step < 40 && !bad; step++) {
                const a = Math.floor(R() * (text.length + 1)), del = R() < 0.5 ? 0 : Math.min(text.length - a, Math.floor(R() * 5));
                const ins = R() < 0.3 ? '' : Array.from({ length: 1 + Math.floor(R() * 4) }, () => alpha[Math.floor(R() * alpha.length)]).join('');
                const next = text.slice(0, a) + ins + text.slice(a + del), useCaret = R() < 0.6, caret = a + ins.length;
                const before = look(text, fmt), nf = respan(text, next, fmt, useCaret ? caret : undefined), after = look(next, nf);
                // which characters survived: the prefix before the change and the suffix after it (as the caret says, else the longest common ones)
                let p, q;
                if (useCaret) { q = next.length - caret; p = 0; const lim = Math.min(text.length - q, caret); while (p < lim && text[p] === next[p]) p++; }
                else { p = 0; const lim = Math.min(text.length, next.length); while (p < lim && text[p] === next[p]) p++; q = 0; while (q < lim - p && text[text.length - 1 - q] === next[next.length - 1 - q]) q++; }
                for (let k = 0; k < p; k++) if (before[k] !== after[k]) bad = { text, next, fmt, nf, k, where: 'prefix' };
                for (let k = 0; k < q; k++) if (before[text.length - 1 - k] !== after[next.length - 1 - k]) bad = { text, next, fmt, nf, k, where: 'suffix' };
                // what was typed: the new text's [p, p + n)
                const oe = text.length - q, n = next.length - q - p, left = ((fmt && fmt.spans) || []).find(sp => sp.s < p && sp.e >= p);   // the span that styles the character on the left
                const brk = c => c === '\n' || c === '\r', own = (fmt && fmt.color ? fmt.color : '') + '|' + !!(fmt && fmt.b) + '|' + !!(fmt && fmt.i);
                const joins = !!left && (left.e > oe || (n > 0 && !brk(next[p]) && !brk(next[p - 1]))), want = joins ? before[p - 1] : own;
                for (let k = p; k < p + n; k++) if (after[k] !== want) bad = { text, next, fmt, nf, k, want, got: after[k], where: 'typed' };
                if (n > 0) { if (joins) joined++; else if (left) apart++; }
                if (J(nf) !== J(cleanFmt(nf, next))) bad = { text, next, nf, where: 'not clean' };
                if (nf && nf.spans) styled++;
                text = next; fmt = nf; steps++;
                if (!text) break;
            }
        }
        check('respan (a seeded walk of ' + steps + ' edits): every character that survives keeps its look; what was typed takes the look of the character on its left where a span styles it (' + joined + ' times) — never when it begins with a line break or follows one at the span\'s end (' + apart + ' times) — and the field\'s own look elsewhere; what comes out is clean',
            !bad && steps > 1000 && styled > 300 && joined > 150 && apart > 20, bad || { steps, styled, joined, apart });
    }

    /* ================= apply / clear / stateAt ================= */
    const LBL = 'buy milk\nwalk dog\ncall mum';   // the request's own case: a node's label listing things to do
    const allRed = apply(undefined, LBL, 3, 3, { color: RED });
    const twoGreen = apply(apply(allRed, LBL, 0, 8, { color: GREEN }), LBL, 18, 26, { color: GREEN });
    check('apply: with nothing selected a colour is the whole field\'s (the base)', J(allRed) === J({ color: RED }));
    check('apply: a selection then takes its own colour over the base ("all my text red, then parts green")',
        J(twoGreen) === J({ color: RED, spans: [{ s: 0, e: 8, color: GREEN }, { s: 18, e: 26, color: GREEN }] })
        && J(runsOf(LBL, twoGreen).map(r => [r.t, r.color])) === J([['buy milk', GREEN], ['\nwalk dog\n', RED], ['call mum', GREEN]]));
    check('apply: a colour with nothing selected changes the base and leaves the parts that have their own',
        J(apply(twoGreen, LBL, 5, 5, { color: BLUE })) === J({ color: BLUE, spans: [{ s: 0, e: 8, color: GREEN }, { s: 18, e: 26, color: GREEN }] })
        && J(apply(twoGreen, LBL, 5, 5, { color: null })) === J({ spans: [{ s: 0, e: 8, color: GREEN }, { s: 18, e: 26, color: GREEN }] }));
    check('apply: a colour on a selection of the whole text paints everything', J(apply(twoGreen, LBL, 0, LBL.length, { color: BLUE })) === J({ color: BLUE }) && apply(twoGreen, LBL, 0, LBL.length, { color: null }) === undefined);
    check('apply: the default colour on a part of a coloured field leaves the rest as it was',
        J(apply(twoGreen, LBL, 9, 13, { color: null })) === J({ spans: [{ s: 0, e: 8, color: GREEN }, { s: 8, e: 9, color: RED }, { s: 13, e: 18, color: RED }, { s: 18, e: 26, color: GREEN }] }));
    check('apply: B on a selection makes it bold; B again on a selection that is all bold takes it off',
        J(apply(undefined, LBL, 0, 3, { b: true })) === J({ spans: [{ s: 0, e: 3, b: true }] }) && apply({ spans: [{ s: 0, e: 3, b: true }] }, LBL, 0, 3, { b: true }) === undefined
        && J(apply({ spans: [{ s: 0, e: 3, b: true }] }, LBL, 1, 2, { b: true })) === J({ spans: [{ s: 0, e: 1, b: true }, { s: 2, e: 3, b: true }] })
        && J(apply({ spans: [{ s: 0, e: 3, b: true }] }, LBL, 2, 6, { b: true })) === J({ spans: [{ s: 0, e: 6, b: true }] }));
    check('apply: B and I with nothing selected switch the whole field (on unless all of it already is)',
        J(apply(undefined, LBL, 4, 4, { b: true })) === J({ b: true }) && apply({ b: true }, LBL, 4, 4, { b: true }) === undefined
        && J(apply({ spans: [{ s: 0, e: 3, b: true }] }, LBL, 4, 4, { b: true })) === J({ b: true }) && J(apply({ color: RED }, LBL, 0, 0, { i: true })) === J({ color: RED, i: true })
        && J(apply(undefined, '', 0, 0, { b: true })) === J({ b: true }) && apply({ b: true }, '', 0, 0, { b: true }) === undefined);
    check('apply: B off on a part of a bold field leaves the rest bold',
        J(apply({ b: true }, 'abcdef', 2, 4, { b: true })) === J({ spans: [{ s: 0, e: 2, b: true }, { s: 4, e: 6, b: true }] }));
    check('apply: with nothing selected a size is every character\'s (the field\'s own); null takes it off; a size that is none changes nothing',
        J(apply(twoGreen, LBL, 5, 5, { size: 'large' })) === J(Object.assign({ size: 'large' }, twoGreen)) && J(apply({ size: 'huge', b: true }, LBL, 0, 0, { size: null })) === J({ b: true })
        && apply(undefined, LBL, 0, 3, { size: '40px' }) === undefined && J(apply({ size: 'huge' }, LBL, 0, 3, { size: '40px' })) === J({ size: 'huge' }) && J(apply(undefined, LBL, 0, 0, { size: 'small' })) === J({ size: 'small' })
        && J(apply({ spans: [{ s: 0, e: 3, size: 'huge' }] }, LBL, 9, 9, { size: 'small' })) === J({ size: 'small' }) && J(apply(undefined, '', 0, 0, { size: 'large' })) === J({ size: 'large' }) && apply({ size: 'large' }, '', 0, 0, { size: null }) === undefined);
    check('apply: with characters selected a size is theirs alone (a span carries it); another size on a part of them replaces it there; Default (null) on a selection takes the size off that part and leaves the rest',
        J(apply(undefined, LBL, 0, 8, { size: 'large' })) === J({ spans: [{ s: 0, e: 8, size: 'large' }] })
        && J(apply({ spans: [{ s: 0, e: 8, size: 'large' }] }, LBL, 4, 8, { size: 'huge' })) === J({ spans: [{ s: 0, e: 4, size: 'large' }, { s: 4, e: 8, size: 'huge' }] })
        && J(apply({ size: 'large' }, 'abcdef', 2, 4, { size: null })) === J({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 4, e: 6, size: 'large' }] })
        && J(apply({ size: 'large' }, 'abcdef', 2, 4, { size: 'small' })) === J({ spans: [{ s: 0, e: 2, size: 'large' }, { s: 2, e: 4, size: 'small' }, { s: 4, e: 6, size: 'large' }] })
        && J(apply({ spans: [{ s: 0, e: 2, size: 'large' }] }, 'abcdef', 2, 6, { size: 'large' })) === J({ size: 'large' }) && J(apply({ color: RED, spans: [{ s: 0, e: 3, b: true }] }, 'abcdef', 0, 3, { size: 'huge' })) === J({ color: RED, spans: [{ s: 0, e: 3, size: 'huge', b: true }] }),
        [apply(undefined, LBL, 0, 8, { size: 'large' }), apply({ size: 'large' }, 'abcdef', 2, 4, { size: null }), apply({ spans: [{ s: 0, e: 2, size: 'large' }] }, 'abcdef', 2, 6, { size: 'large' })]);
    check('apply: U and S switch underline and strike as B and I do — on a selection, or the whole field with nothing selected; again on a range that is all underlined takes it off',
        J(apply(undefined, LBL, 0, 3, { u: true })) === J({ spans: [{ s: 0, e: 3, u: true }] }) && apply({ spans: [{ s: 0, e: 3, u: true }] }, LBL, 0, 3, { u: true }) === undefined
        && J(apply(undefined, LBL, 4, 4, { st: true })) === J({ st: true }) && apply({ st: true }, LBL, 4, 4, { st: true }) === undefined && J(apply({ u: true }, 'abcdef', 2, 4, { u: true })) === J({ spans: [{ s: 0, e: 2, u: true }, { s: 4, e: 6, u: true }] })
        && J(apply({ spans: [{ s: 0, e: 3, u: true }] }, LBL, 2, 6, { st: true })) === J({ spans: [{ s: 0, e: 2, u: true }, { s: 2, e: 3, u: true, st: true }, { s: 3, e: 6, st: true }] })
        && J(apply({ b: true }, 'abc', 1, 1, { u: 'yes', st: 1 })) === J({ b: true }),
        [apply(undefined, LBL, 0, 3, { u: true }), apply(undefined, LBL, 4, 4, { st: true }), apply({ spans: [{ s: 0, e: 3, u: true }] }, LBL, 2, 6, { st: true })]);
    check('apply: a link on a selection is those characters\'; with nothing selected the whole field\'s; an empty address or null takes it off (a part, or everything); an address that is no link changes nothing',
        J(apply(undefined, LBL, 0, 3, { link: 'https://a.example/' })) === J({ spans: [{ s: 0, e: 3, link: 'https://a.example/' }] }) && J(apply(undefined, LBL, 4, 4, { link: ' https://a.example/ ' })) === J({ link: 'https://a.example/' })
        && J(apply({ link: 'https://a.example/' }, 'abcdef', 2, 4, { link: '' })) === J({ spans: [{ s: 0, e: 2, link: 'https://a.example/' }, { s: 4, e: 6, link: 'https://a.example/' }] }) && apply({ link: 'https://a.example/' }, 'abcdef', 3, 3, { link: null }) === undefined
        && J(apply({ spans: [{ s: 0, e: 3, link: 'https://a.example/' }] }, 'abcdef', 1, 2, { link: 'https://b.example/' })) === J({ spans: [{ s: 0, e: 1, link: 'https://a.example/' }, { s: 1, e: 2, link: 'https://b.example/' }, { s: 2, e: 3, link: 'https://a.example/' }] })
        && ['javascript:alert(1)', 'data:text/html,x', 'a.example', 'https://a b', 7, {}].every(v => J(apply({ b: true }, 'abcdef', 0, 3, { link: v })) === J({ b: true }) && J(apply({ link: 'https://a.example/' }, 'abcdef', 0, 3, { link: v })) === J({ link: 'https://a.example/' })),
        [apply(undefined, LBL, 0, 3, { link: 'https://a.example/' }), apply({ link: 'https://a.example/' }, 'abcdef', 2, 4, { link: '' }), apply({ b: true }, 'abcdef', 0, 3, { link: 'javascript:alert(1)' })]);
    check('apply: a selection is read in either direction, kept inside the text, and never splits a surrogate pair',
        J(apply(undefined, 'abcdef', 4, 2, { b: true })) === J({ spans: [{ s: 2, e: 4, b: true }] }) && J(apply(undefined, 'abc', -5, 99, { i: true })) === J({ i: true })
        && J(apply(undefined, 'a😀b', 2, 4, { b: true })) === J({ spans: [{ s: 1, e: 4, b: true }] }) && J(apply(undefined, 'abc', 'x', {}, { b: true })) === J({ b: true }));
    check('apply: a change that is no change, or a hostile one, leaves a clean format',
        J(apply(twoGreen, LBL, 0, 3, null)) === J(twoGreen) && J(apply(twoGreen, LBL, 0, 3, { b: 'yes', color: 'url(x)', nope: 1 })) === J(twoGreen)
        && J(apply({ color: 'red', spans: [{ s: 0, e: 2, b: true, onclick: 'x' }] }, 'abc', 0, 0, {})) === J({ spans: [{ s: 0, e: 2, b: true }] }));
    check('clear: with nothing selected, or the whole text, nothing is left; on a part, that part is plain — its colour, bold, italic, underline, strike, size and link all gone — and the rest keeps its own',
        clear(Object.assign({ size: 'large', b: true }, twoGreen), LBL, 3, 3) === undefined && clear(twoGreen, LBL, 0, LBL.length) === undefined && clear(undefined, LBL, 0, 0) === undefined
        && J(clear(Object.assign({ size: 'large' }, twoGreen), LBL, 4, 13)) === J({ spans: [{ s: 0, e: 4, size: 'large', color: GREEN }, { s: 13, e: 18, size: 'large', color: RED }, { s: 18, e: 26, size: 'large', color: GREEN }] })
        && J(clear({ u: true, st: true, link: 'https://a.example/', spans: [{ s: 0, e: 6, b: true }] }, 'abcdef', 2, 4)) === J({ spans: [{ s: 0, e: 2, b: true, u: true, st: true, link: 'https://a.example/' }, { s: 4, e: 6, b: true, u: true, st: true, link: 'https://a.example/' }] }),
        [clear(Object.assign({ size: 'large' }, twoGreen), LBL, 4, 13), clear({ u: true, st: true, link: 'https://a.example/', spans: [{ s: 0, e: 6, b: true }] }, 'abcdef', 2, 4)]);
    const ST = o => Object.assign({ b: false, i: false, u: false, st: false, color: '', size: '', link: '', any: true }, o);
    const TWO = { spans: [{ s: 0, e: 2, size: 'large', u: true, link: 'https://a.example/' }, { s: 2, e: 4, size: 'huge', u: true, st: true }] };
    check('stateAt: what the controls show — all bold, italic, underlined, struck; one colour, one size, one link ("" for none, null where the range holds more than one)',
        J(stateAt(twoGreen, LBL, 0, 8)) === J(ST({ color: GREEN })) && J(stateAt(twoGreen, LBL, 4, 12)) === J(ST({ color: null }))
        && J(stateAt({ size: 'huge', b: true, spans: [{ s: 0, e: 2, i: true }] }, 'abcd', 0, 2)) === J(ST({ b: true, i: true, size: 'huge' }))
        && J(stateAt({ spans: [{ s: 0, e: 2, b: true }] }, 'abcd', 1, 1)) === J(ST({})) && J(stateAt(undefined, 'abcd', 1, 3)) === J(ST({ any: false })) && J(stateAt({ b: true }, '', 0, 0)) === J(ST({ b: true }))
        && J(stateAt(TWO, 'abcdef', 0, 2)) === J(ST({ u: true, size: 'large', link: 'https://a.example/' })) && J(stateAt(TWO, 'abcdef', 0, 4)) === J(ST({ u: true, size: null, link: null })) && J(stateAt(TWO, 'abcdef', 2, 4)) === J(ST({ u: true, st: true, size: 'huge' }))
        && J(stateAt(TWO, 'abcdef', 5, 5)) === J(ST({ size: null, link: null })) && J(stateAt({ size: 'large', link: 'https://a.example/' }, 'abcdef', 3, 3)) === J(ST({ size: 'large', link: 'https://a.example/' })) && J(stateAt({ size: 'small', u: true }, '', 0, 0)) === J(ST({ u: true, size: 'small' })),
        [stateAt(TWO, 'abcdef', 0, 2), stateAt(TWO, 'abcdef', 0, 4), stateAt(TWO, 'abcdef', 5, 5)]);
    {
        const R = rng(99), ops = [{ b: true }, { i: true }, { u: true }, { st: true }, { color: RED }, { color: GREEN }, { color: null }, { size: 'large' }, { size: 'huge' }, { size: null }, { link: 'https://a.example/' }, { link: 'https://b.example/x' }, { link: null }];
        let bad = null, n = 0;
        for (let round = 0; round < 300 && !bad; round++) {
            const text = 'the quick brown fox'.slice(0, 4 + Math.floor(R() * 15)); let f;
            for (let k = 0; k < 8 && !bad; k++) {
                const s = Math.floor(R() * (text.length + 1)), e = R() < 0.3 ? s : Math.floor(R() * (text.length + 1)), op = ops[Math.floor(R() * ops.length)];
                const before = J(f), wipe = R() < 0.1, nf = wipe ? clear(f, text, s, e) : apply(f, text, s, e, op), now = stateAt(nf, text, s, e), was = stateAt(f, text, s, e);
                if (J(f) !== before) bad = { why: 'the format given was changed', f };
                if (J(nf) !== J(cleanFmt(nf, text))) bad = { why: 'not clean', nf, text };
                if (nf !== undefined && !Object.keys(nf).length) bad = { why: 'an empty object', nf };
                ['b', 'i', 'u', 'st'].forEach(kk => { if (!wipe && op[kk] && !bad && now[kk] === was[kk]) bad = { why: kk + ' did not switch', f, nf, s, e, text }; });   // a press on B reads back as the other state, on the range it was pressed for
                ['size', 'link'].forEach(kk => { if (!wipe && kk in op && !bad && now[kk] !== (op[kk] || '')) bad = { why: 'the ' + kk + ' is not the one given', f, nf, s, e, text, now }; });   // on a selection its characters', with none every character's
                if (wipe && !bad && (s === e ? nf !== undefined : (now.b || now.i || now.u || now.st || now.color !== '' || now.size !== '' || now.link !== ''))) bad = { why: 'clear left a look', f, nf, s, e, text };
                f = nf; n++;
            }
        }
        check('apply / clear (seeded, ' + n + ' presses): the format given is never changed, what comes back is clean and never an empty object, B, I, U and S always switch, a size and a link read back as the one given on the range they were given for, and a cleared range is plain', !bad && n === 2400, bad);
    }
    check('the palette is the app\'s ink row (seven strict colours with names) and published with the steps', PALETTE.length === 7 && PALETTE.every(p => /^#[0-9a-f]{6}$/.test(p[0]) && typeof p[1] === 'string' && p[1]) && J(PALETTE.map(p => p[0])) === J(['#e9e9f0', '#1a1a1a', '#d9534f', '#e0a54f', '#5cb87a', '#4db3d3', '#b98cff']));
    {
        global.window = {};
        const T2 = await import(modUrl('textfmt.js') + '?w');
        const W = global.window.wpTextFmt;
        check('window.wpTextFmt is published with the whole API', !!W && ['cleanFmt', 'cleanLink', 'runsOf', 'respan', 'apply', 'clear', 'stateAt'].every(k => typeof W[k] === 'function') && W.MAX_LINK === 2000 && W.VERSION === T2.VERSION && J(W.SIZES) === J(SIZES) && W.SIZE_EM === T2.SIZE_EM && W.PALETTE === T2.PALETTE && W.MAX_SPANS === 200);
        delete global.window;
    }

    /* ================= the editor: where a field's format lives, typing, the box and the bar on it (planner.js, run for real) ================= */
    const { makeDom } = require('./boxdom.js');
    const plannerSrc = read('planner.js'), ioSrc = read('io.js'), fieldsSrc = slice('planner.js', 'fields'), boxSrc = slice('planner.js', 'box'), barSrc = slice('planner.js', 'bar');
    const SYMS = [['→', 'right arrow'], ['—', 'em dash'], ['✓', 'check']];
    const escH = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    // A page of plain objects (tools/boxdom.js): the editor panel, the element that holds the boxes, and the three slices run in it.
    // opts.linkGrows: the one constant flipped (a link grows by typing at its end); opts.map: the open document.
    function mkPage(opts) {
        opts = opts || {};
        const dom = makeDom(), doc = dom.document, page = { dom, doc, log: [], toasts: [], sels: [], hist: null, clock: { t: 1e6 } };
        const editor = dom.mk('div', '', {}, 'plannerEditorWrap'), blocksEl = dom.mk('div', '', {}, 'plannerBlocks');
        editor.rect = { left: 100, top: 50, right: 700, bottom: 650 }; editor.clientLeft = 0; editor.clientWidth = 588;
        doc.body.appendChild(editor); editor.appendChild(blocksEl);
        page.map = opts.map || { id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [] };
        const deps = {
            TF, document: doc, window: dom.window, setTimeout: dom.setTimeout, esc: escH,
            getActiveMap: () => page.map, isDocLike: m => !!m && (m.type === 'planner' || m.type === 'doc'),
            // page.hist (when a check makes one): io.js's own history, so a save is its pass and a step boundary its own
            save: im => { page.log.push('save:' + !!im); if (page.hist) page.hist.save(!!im); }, renderPlannerPreview: () => { page.log.push('preview'); },
            stepBoundary: el => { page.log.push(el ? 'step+' : 'step'); if (page.hist) page.hist.stepBoundary(el); }, stepFold: () => { page.log.push('fold'); if (page.hist) page.hist.stepFold(); },
            stepSel: (b, a) => { page.sels.push([b, a]); if (page.hist) page.hist.stepSel(b, a); }, toast: m => { page.toasts.push(m); },
            fieldUndoChord: e => (page.hist ? page.hist.fieldUndoChord(e) : false), undo: () => { page.log.push('undo'); if (page.hist) page.hist.undo(); }, redo: () => { page.log.push('redo'); if (page.hist) page.hist.redo(); }
        };
        const names = Object.keys(deps), fsrc = opts.linkGrows ? fieldsSrc.replace('var TS_LINK_GROWS = false;', 'var TS_LINK_GROWS = true;') : fieldsSrc;
        if (opts.linkGrows && fsrc === fieldsSrc) throw new Error('textcheck: the link rule\'s one line was not found');
        const api = new Function(...names, fsrc + '\n' + boxSrc + '\n' + barSrc + '\nreturn { tsDesc, tsField, tsType, tsEditAt, tsName, tsSetColCount, tsRowsAsObjects, tsCols, TS_PLAIN, TS_LINK_GROWS, TS_EDIT, tsScan, tsPointAt, tsShown, tsIncoming, tsMulti, tsDraw, tsPaint, tsBoxHtml, tsFill, tsSelOf, tsSelect, tsState, tsBox, tsBoxOf, tsNote, tsTarget, tsShow, tsHide, tsPlaceAt, tsPlace, tsKind, tsCommit, tsInsertAt, tsPress, tsLink, tsSymbol, tsRebuilt, tsBack, tsRefresh, tsBuild, tsKey, tsWire, tsOrder, tsToBar };')(...names.map(k => deps[k]));
        Object.assign(page, api, { editor, blocksEl, engine: dom.engine });
        // an editor box for a field, as renderPlanner writes it (its classes and data attributes), empty until tsFill draws it
        page.box = (cls, data, multi) => { const el = dom.mk('div', cls + ' ts-box' + (multi ? ' ts-multi' : ''), data); el.setAttribute('contenteditable', 'plaintext-only'); el.rect = { left: 140, top: 300, right: 520, bottom: 334 }; blocksEl.appendChild(el); return el; };
        page.plain = (tag, cls, data) => { const el = dom.mk(tag, cls, data); blocksEl.appendChild(el); return el; };   // a box that is no plain field's (an id, a diagram's code)
        page.mk = dom.mk; page.fill = () => { api.tsFill(blocksEl, page.map.blocks); return page; };
        // every box the editor has for the open document, made anew (what renderPlanner does), then tsRebuilt
        page.rebuild = () => {
            if (dom.page.active && blocksEl.contains(dom.page.active)) dom.page.active = null;
            blocksEl.childNodes.slice().forEach(c => blocksEl.removeChild(c));
            page.map.blocks.forEach((b, idx) => {
                if (b.type === 'h1') { page.box('field b-title', { idx }); page.box('field b-sub', { idx }); }
                else if (b.type === 'h2' || b.type === 'h3') page.box('field b-title', { idx });
                else if (b.type === 'image') page.box('field b-caption', { idx });
                else if (b.type === 'node' || b.type === 'table') {
                    page.box('field b-title', { idx });
                    if (b.type === 'node' && b.mode !== 'table') { page.box('field b-sub', { idx }); page.box('field b-must', { idx }); }
                    const cols = api.tsCols(b); cols.forEach((c, ci) => page.box('b-colhead', { idx, ci }));
                    (b.rows || []).forEach((r, ri) => cols.forEach((c, ci) => page.box('r-col', { idx, ri, ci })));
                } else if (b.type === 'flowchart') { (b.nodes || []).forEach((n, ni) => page.box('field fc-n-text fc-grow', { idx, ni }, true)); (b.edges || []).forEach((e, ei) => page.box('fc-e-text', { idx, ei })); }
            });
            page.fill(); api.tsRebuilt();
            return page;
        };
        page.render = () => page.rebuild();
        page.wire = () => { api.tsBuild(editor, SYMS); api.tsWire(blocksEl, editor); if (api.tsState.els) api.tsState.els.root.rect = { left: 0, top: 0, right: 420, bottom: 30 }; return page; };
        page.focus = (box, s, e) => { box.focus(); dom.engine.caret(box, s === undefined ? 0 : s, e); return box; };
        page.click = el => { dom.fire(el, 'mousedown'); return dom.fire(el, 'click'); };
        page.textOf = box => dom.engine.textsOf(box).map(t => t.nodeValue).join('');
        page.range = box => dom.engine.range(box);
        // the box as drawn: each run's text and style, '+' for the line-break element after a final line break; null when it holds anything the app did not make
        page.drawn = box => { const out = []; for (const c of box.childNodes) { if (c.nodeType === 1 && c.nodeName === 'BR' && c === box.lastChild) { out.push('+'); continue; } if (c.nodeType !== 1 || c.nodeName !== 'SPAN' || c.childNodes.length !== 1 || c.firstChild.nodeType !== 3 || !/^tsr( tsr-link)?$/.test(c.className)) return null; out.push([c.firstChild.nodeValue, Object.assign({}, c.style), c.className, c.title]); } return out; };
        return page;
    }
    // io.js's own history, its undo and redo, its chord and its chunk listeners, sliced and run for real on the page's document
    function mkHist(page) {
        const camp = { id: 'c', activeItemId: page.map.id, items: { [page.map.id]: page.map } }, toasts = [], H = { toasts, camp };
        const names = ['window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout', 'mergeLivePlayerState'];
        const api = new Function(...names, slice('io.js', 'history') + '\n' + slice('io.js', 'steps') + '\n' + slice('io.js', 'undochord') + '\n' + slice('io.js', 'chunks')
            + '\nreturn { pushHistory, stepBoundary, stepFold, stepSel, fieldUndoChord, undo, redo, stack: function() { return histories["c/" + getActiveMap().id]; }, pending: function(v) { if (v !== undefined) savePending = v; return savePending; }, slot: function() { return typeSlot; } };')(
            page.dom.window, { appState: { campaigns: { c: camp } } }, () => camp, () => page.map, { getItem: () => null }, page.doc, page.dom.setTimeout, () => {}, { now: () => page.clock.t }, () => page.render(), im => H.save(im), m => { toasts.push(m); }, undefined, () => {});
        Object.assign(H, api, {
            save: im => { if (im) { api.pushHistory(); api.pending(false); } else api.pending(true); },   // save(true) is the pass at once; save(false) leaves it waiting on its timer
            flush: () => { if (api.pending()) { api.pushHistory(); api.pending(false); } },                  // the timer fired
            depth: () => [api.stack().undo.length, api.stack().redo.length]
        });
        api.pushHistory();   // the first pass seeds the baseline, as the app's first save does
        page.hist = H;
        return H;
    }
    const mapOf = blocks => ({ id: 'p1', type: 'planner', meta: { title: 'P' }, blocks });
    const B0 = () => [
        { id: 'b0', type: 'h1', title: 'The Hill Road', sub: 'an evening' },
        { id: 'b1', type: 'node', title: 'The inn', tag: 'social', must: 'learn the road', cols: ['Check', 'DC', 'Cost'], rows: [{ col1: 'Medicine', col2: '10', col3: 'free' }, { col1: 'Insight', col2: '13', col3: 'a coin' }] },
        { id: 'b2', type: 'flowchart', nodes: [{ id: 'n1', text: LBL, shape: 'rect', color: 'neutral' }, { id: 'n3', text: 'two', shape: 'rect', color: 'gold' }], edges: [{ from: 'n1', to: 'n3', text: 'then', style: 'solid' }] },
        { id: 'b3', type: 'image', src: '/saves/images/x.png', caption: 'the map' },
        { id: 'b4', type: 'text', content: '<p>prose</p>' },
        { id: 'b5', type: 'h2', title: 'Beats' },
        { id: 'b6', type: 'node', mode: 'table', title: 'Loot', rows: [{ col1: 'gold' }] }
    ];
    const LINK = 'https://a.example/x';
    const keyEv = o => Object.assign({ key: 'b', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, o);

    /* ---- where each field's format lives ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }), bl = pg.map.blocks, F = d => pg.tsField(bl, d);
        const put = (d, f) => F(d).setFmt(f);
        put({ idx: 0, k: 'title' }, { b: true }); put({ idx: 0, k: 'sub' }, { i: true }); put({ idx: 1, k: 'title' }, { color: RED }); put({ idx: 1, k: 'sub' }, { color: GREEN }); put({ idx: 1, k: 'must' }, { color: BLUE });
        put({ idx: 1, k: 'col', ci: 2 }, { b: true }); put({ idx: 1, k: 'cell', ri: 1, ci: 2 }, { i: true }); put({ idx: 2, k: 'node', ni: 1 }, { color: RED }); put({ idx: 2, k: 'edge', ei: 0 }, { size: 'large' }); put({ idx: 3, k: 'caption' }, { size: 'small' }); put({ idx: 5, k: 'title' }, { i: true });
        check('storage: a block\'s own fields keep their formats on the block (fmt.title / sub / tag / must / caption) — a scene node\'s second box is its tag',
            J(bl[0].fmt) === J({ title: { b: true }, sub: { i: true } }) && J(bl[1].fmt) === J({ title: { color: RED }, tag: { color: GREEN }, must: { color: BLUE } }) && J(bl[3].fmt) === J({ caption: { size: 'small' } }) && J(bl[5].fmt) === J({ title: { i: true } }), bl[1].fmt);
        check('storage: a table\'s heads keep theirs in colFmt, a list parallel to cols; a row\'s cells on the row; a node\'s label on the node; an arrow\'s on the arrow',
            J(bl[1].colFmt) === J([null, null, { b: true }]) && J(bl[1].rows[1].fmt) === J({ col3: { i: true } }) && bl[1].rows[0].fmt === undefined && J(bl[2].nodes[1].fmt) === J({ color: RED }) && bl[2].nodes[0].fmt === undefined && J(bl[2].edges[0].fmt) === J({ size: 'large' }));
        check('storage: the text itself stays the plain string it was (no markup ever goes into a title, a label or a cell)',
            bl[0].title === 'The Hill Road' && bl[1].cols[2] === 'Cost' && bl[1].rows[1].col3 === 'a coin' && bl[2].nodes[1].text === 'two' && bl[2].edges[0].text === 'then' && F({ idx: 1, k: 'cell', ri: 1, ci: 2 }).text() === 'a coin' && F({ idx: 1, k: 'sub' }).text() === 'social');
        put({ idx: 0, k: 'title' }, undefined); put({ idx: 0, k: 'sub' }, undefined); put({ idx: 1, k: 'col', ci: 2 }, undefined); put({ idx: 1, k: 'cell', ri: 1, ci: 2 }, undefined); put({ idx: 2, k: 'node', ni: 1 }, undefined); put({ idx: 2, k: 'edge', ei: 0 }, undefined);
        check('storage: a format taken off leaves no key behind (no empty object, no empty list)', !('fmt' in bl[0]) && !('colFmt' in bl[1]) && !('fmt' in bl[1].rows[1]) && !('fmt' in bl[2].nodes[1]) && !('fmt' in bl[2].edges[0]) && J(B0()[0]) === J(bl[0]));
        check('storage: a field that is not there has no place (a wrong block, a row or a node that is gone, a text block, a box that is no field)',
            [{ idx: 9, k: 'title' }, { idx: 4, k: 'title' }, { idx: 0, k: 'must' }, { idx: 5, k: 'sub' }, { idx: 1, k: 'cell', ri: 7, ci: 0 }, { idx: 1, k: 'col', ci: 3 }, { idx: 1, k: 'col', ci: -1 }, { idx: 2, k: 'node', ni: 5 }, { idx: 2, k: 'edge', ei: 1 }, { idx: 0, k: 'node', ni: 0 }, { idx: 3, k: 'title' }, { idx: 0, k: 'nope' }, null, { idx: '__proto__', k: 'title' }].every(d => F(d) === null));
        const pg2 = mkPage({ map: mapOf(B0()) }), b6 = pg2.map.blocks[6];
        pg2.tsField(pg2.map.blocks, { idx: 6, k: 'col', ci: 1 }).setFmt({ b: true });
        check('storage: a head styled before the heads were ever typed makes them the block\'s own first, so colFmt always lies beside a real cols', J(b6.cols) === J(['Item', 'Detail', 'Notes']) && J(b6.colFmt) === J([null, { b: true }]));
        const boxes = [['field b-title', { idx: 1 }, { idx: 1, k: 'title' }], ['field b-sub', { idx: 1 }, { idx: 1, k: 'sub' }], ['field b-must', { idx: 1 }, { idx: 1, k: 'must' }], ['field b-caption', { idx: 3 }, { idx: 3, k: 'caption' }], ['b-colhead', { idx: 1, ci: 2 }, { idx: 1, k: 'col', ci: 2 }], ['r-col', { idx: 1, ri: 1, ci: 0 }, { idx: 1, k: 'cell', ri: 1, ci: 0 }], ['field fc-n-text fc-grow', { idx: 2, ni: 1 }, { idx: 2, k: 'node', ni: 1 }], ['fc-e-text', { idx: 2, ei: 0 }, { idx: 2, k: 'edge', ei: 0 }]];
        check('storage: each editor box names its field by its place (tsDesc), and the bar finds the box again by it (tsBox); a box that holds no plain field names none; only a node\'s label takes line breaks',
            boxes.every(x => { const el = pg.box(x[0], x[1], x[2].k === 'node'); return J(pg.tsDesc(el)) === J(x[2]) && pg.tsBox(x[2]) === el && pg.tsMulti(x[2]) === (x[2].k === 'node'); }) && pg.tsDesc(pg.plain('input', 'fc-n-id', { idx: 2, ni: 0 })) === null && pg.tsDesc(pg.plain('textarea', 'field b-content', { idx: 4 })) === null && pg.tsDesc(pg.box('b-title', {})) === null
            && pg.TS_PLAIN.split(',').length === 8 && pg.blocksEl.querySelectorAll(pg.TS_PLAIN).length === 9);
    }

    /* ---- typing carries the spans (tsType: what every edit of a box ends in) ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }), bl = pg.map.blocks, n1 = bl[2].nodes[0], d = { idx: 2, k: 'node', ni: 0 };
        n1.fmt = { color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] };   // walk dog
        pg.tsType(bl, d, '- ' + LBL, 2);                       // at the start
        const a1 = J(n1.fmt), t1 = n1.text;
        pg.tsType(bl, d, t1.slice(0, 15) + 's' + t1.slice(15), 16);   // in the middle of the span ("walks dog")
        const a2 = J(n1.fmt), t2 = n1.text;
        pg.tsType(bl, d, t2 + '\nfeed cat', t2.length + 9);   // at the end
        check('typing: an edit at the start, in the middle and at the end of a label carries its spans (respan on every edit)',
            a1 === J({ color: RED, spans: [{ s: 11, e: 19, color: GREEN, b: true }] }) && a2 === J({ color: RED, spans: [{ s: 11, e: 20, color: GREEN, b: true }] }) && J(n1.fmt) === a2 && n1.text === '- buy milk\nwalks dog\ncall mum\nfeed cat', [a1, a2, n1.fmt]);
        {   // the owner's case, through the editor: everything red, one line green
            const pt = mkPage({ map: mapOf(B0()) }), bt = pt.map.blocks, nt = bt[2].nodes[0], dt = { idx: 2, k: 'node', ni: 0 };
            nt.fmt = { color: RED, spans: [{ s: 9, e: 17, color: GREEN }] };   // "walk dog"
            pt.tsType(bt, dt, 'buy milk\nwalk dogs\ncall mum', 18);            // at the end of the green line
            const atEnd = J(nt.fmt);
            pt.tsType(bt, dt, 'buy milk\nxwalk dogs\ncall mum', 10);           // at its start
            const atStart = J(nt.fmt);
            pt.tsType(bt, dt, 'buy milk\nxwalk dogs\n\ncall mum', 20);         // Enter at its end
            pt.tsType(bt, dt, 'buy milk\nxwalk dogs\nf\ncall mum', 21);        // and a letter on the line that began
            check('typing (the owner\'s case, through tsType to the stored format): everything red and one line green — typed at the end of the green line it is green, typed at its start it is red, and after Enter at its end the new line is red',
                atEnd === J({ color: RED, spans: [{ s: 9, e: 18, color: GREEN }] }) && atStart === J({ color: RED, spans: [{ s: 10, e: 19, color: GREEN }] }) && J(nt.fmt) === atStart && nt.text === 'buy milk\nxwalk dogs\nf\ncall mum', [atEnd, atStart, nt.fmt]);
        }
        {   // the one rule for a link: it does not grow by typing at its end (the constant TS_LINK_GROWS, one line in planner.js)
            const mk = grows => { const p = mkPage({ map: mapOf(B0()), linkGrows: grows }), b = p.map.blocks, e = b[2].edges[0]; return { p, e, set(text, fmt) { e.text = text; e.fmt = fmt; return this; }, type(v, c) { p.tsType(b, { idx: 2, k: 'edge', ei: 0 }, v, c, 'insertText'); return J(e.fmt); } }; };
            const part = { spans: [{ s: 0, e: 4, size: 'large', color: GREEN, b: true, link: LINK }] };   // "then" of "then go": linked, green, bold, Large
            const off = mk(false), on = mk(true);
            const endOff = off.set('then go', part).type('thens go', 5), endOn = on.set('then go', part).type('thens go', 5);
            const inOff = off.set('then go', part).type('thXen go', 3), overOff = off.set('then go', part).type('tXn go', 2), tailOff = off.set('then go', part).type('thX go', 3);
            const startOff = off.set('then go', part).type('Xthen go', 1), afterOff = off.set('then go', part).type('then goX', 8);
            const wholeOff = off.set('then', { link: LINK, b: true }).type('thens', 5), wholeIn = off.set('then', { link: LINK, b: true }).type('thXen', 3), wholeFront = off.set('then', { link: LINK }).type('Xthen', 1), wholeOn = on.set('then', { link: LINK, b: true }).type('thens', 5);
            const twoOff = off.set('abcd', { spans: [{ s: 0, e: 2, link: LINK }, { s: 2, e: 4, link: 'https://b.example/' }] }).type('abXcd', 3);
            check('typing (a link): what is typed right after a LINKED part takes that part\'s colour, bold and size and is not linked — the link ends where it ended; typed inside the link (or over part of it) it is linked; before it, or away from it, as ever. A field linked whole is the same: typed at its end is not linked, inside it is',
                off.p.TS_LINK_GROWS === false && endOff === J({ spans: [{ s: 0, e: 4, size: 'large', color: GREEN, b: true, link: LINK }, { s: 4, e: 5, size: 'large', color: GREEN, b: true }] })
                && inOff === J({ spans: [{ s: 0, e: 5, size: 'large', color: GREEN, b: true, link: LINK }] }) && overOff === J({ spans: [{ s: 0, e: 3, size: 'large', color: GREEN, b: true, link: LINK }] }) && tailOff === J({ spans: [{ s: 0, e: 3, size: 'large', color: GREEN, b: true, link: LINK }] })
                && startOff === J({ spans: [{ s: 1, e: 5, size: 'large', color: GREEN, b: true, link: LINK }] }) && afterOff === J(part)
                && wholeOff === J({ b: true, spans: [{ s: 0, e: 4, link: LINK }] }) && wholeIn === J({ b: true, link: LINK }) && wholeFront === J({ link: LINK })
                && twoOff === J({ spans: [{ s: 0, e: 2, link: LINK }, { s: 3, e: 5, link: 'https://b.example/' }] }), [endOff, inOff, overOff, tailOff, startOff, afterOff, wholeOff, wholeIn, wholeFront, twoOff]);
            check('typing (a link, the other setting): with the one constant true a link grows by typing at its end as its colour does — the rule is that one line, read by tsType alone',
                on.p.TS_LINK_GROWS === true && endOn === J({ spans: [{ s: 0, e: 5, size: 'large', color: GREEN, b: true, link: LINK }] }) && wholeOn === J({ b: true, link: LINK })
                && (fieldsSrc.match(/TS_LINK_GROWS/g) || []).length === 2 && /\n  var TS_LINK_GROWS = false;\n/.test(fieldsSrc) && /if \(now && !apart && !TS_LINK_GROWS\) \{/.test(fieldsSrc) && !/TS_LINK_GROWS/.test(boxSrc + barSrc), [endOn, wholeOn]);
            // tsEditAt reads an edit exactly as respan does: a format of one bold span over the old text's prefix shows where respan saw the edit begin
            const R = rng(31337), al = 'ab 😀😁\n'; let bad = null;
            const chars = Array.from(al);
            for (let k = 0; k < 3000 && !bad; k++) {
                const o = Array.from({ length: 1 + Math.floor(R() * 8) }, () => chars[Math.floor(R() * chars.length)]).join(''), cut = Array.from(o), a = Math.floor(R() * (cut.length + 1)), dl = Math.min(cut.length - a, Math.floor(R() * 3));
                const ins = Array.from({ length: Math.floor(R() * 3) }, () => chars[Math.floor(R() * chars.length)]).join(''), nw = cut.slice(0, a).join('') + ins + cut.slice(a + dl).join(''), caret = R() < 0.7 ? cut.slice(0, a).join('').length + ins.length : undefined;
                const ed = off.p.tsEditAt(o, nw, caret), grown = respan(o, nw, { spans: cut.map((c, i) => ({ s: cut.slice(0, i).join('').length, e: cut.slice(0, i + 1).join('').length, color: [RED, GREEN, BLUE][i % 3] })) }, caret, true);   // every character of the old text in a part of its own (no two neighbours alike), nothing joined: what has no colour afterwards is what was typed
                const plain = []; let at = 0; runsOf(nw, grown).forEach(r => { if (!r.color) plain.push([at, at + r.t.length]); at += r.t.length; });
                const want = ed.typed > 0 ? [[ed.p, ed.p + ed.typed]] : [];
                if (J(plain) !== J(want) || ed.oe < ed.p || ed.p + ed.typed > nw.length) bad = { o, nw, caret, ed, plain };
            }
            check('typing (tsEditAt): where an edit was — the old text\'s [p, oe) became the new text\'s [p, p + typed) — is read exactly as respan reads it (3,000 seeded edits with and without the caret, surrogate pairs and line breaks among them)', !bad, bad);
        }
        {   // an edit the engine calls its own undo or redo is carried with nothing joined; the boxes cancel both, so tsType keeps no texts of the past
            const p = mkPage({ map: mapOf(B0()) }), b = p.map.blocks, e = b[2].edges[0]; e.text = 'then'; e.fmt = { spans: [{ s: 0, e: 4, b: true }] };
            p.tsType(b, { idx: 2, k: 'edge', ei: 0 }, 'then go', 7, 'historyUndo'); const u = J(e.fmt);
            p.tsType(b, { idx: 2, k: 'edge', ei: 0 }, 'then go!', 8, 'historyRedo'); const r = J(e.fmt);
            p.tsType(b, { idx: 2, k: 'edge', ei: 0 }, 'thenX go!', 5, 'insertText');
            check('typing: a text the engine\'s own undo or redo put there (should one ever arrive) is carried with nothing joined; typing joins; no list of a field\'s past texts is kept any more (every undo in a box is the planner\'s history)',
                u === J({ spans: [{ s: 0, e: 4, b: true }] }) && r === u && J(e.fmt) === J({ spans: [{ s: 0, e: 5, b: true }] }) && !/\btsPast\b|tsForget|TS_PAST_MAX/.test(plannerSrc), [u, r, e.fmt]);
        }
        pg.tsType(bl, { idx: 1, k: 'cell', ri: 0, ci: 0 }, 'Medicine!', 9); pg.tsType(bl, { idx: 6, k: 'col', ci: 0 }, 'Things', 6);
        check('typing: a field with no format gets none (no key appears), a head typed for the first time makes the heads the block\'s own, as before',
            bl[1].rows[0].col1 === 'Medicine!' && !('fmt' in bl[1].rows[0]) && J(bl[6].cols) === J(['Things', 'Detail', 'Notes']) && !('colFmt' in bl[6]) && pg.tsType(bl, { idx: 9, k: 'title' }, 'x', 1) === false);
        bl[1].rows[1].fmt = { col3: { spans: [{ s: 2, e: 6, i: true }] } };
        pg.tsType(bl, { idx: 1, k: 'cell', ri: 1, ci: 2 }, '', 0);
        check('typing: emptying a field leaves no spans behind', !('fmt' in bl[1].rows[1]) && bl[1].rows[1].col3 === '');
        const p3 = mkPage({ map: mapOf([{ id: 'b', type: 'h2', title: 'aaaa', fmt: { title: { spans: [{ s: 2, e: 4, b: true }] } } }]) });
        p3.tsType(p3.map.blocks, { idx: 0, k: 'title' }, 'aaaaa', 2);   // an "a" typed after the first one: the bold ones are the last two still
        const caretFmt = J(p3.map.blocks[0].fmt);
        p3.tsType(p3.map.blocks, { idx: 0, k: 'title' }, 'aaaa', 0);    // the first one deleted
        check('typing: the box\'s caret goes to respan, so an edit inside a run of equal characters moves the spans after it (without it the edit would be read at the end, and the look would sit on other characters)',
            caretFmt === J({ title: { spans: [{ s: 3, e: 5, b: true }] } }) && J(p3.map.blocks[0].fmt) === J({ title: { spans: [{ s: 2, e: 4, b: true }] } }), [caretFmt, p3.map.blocks[0].fmt]);
    }

    /* ---- the box: the two maps between a character offset and a place in the drawn nodes (pure, on plain objects) ---- */
    {
        const pg = mkPage();
        const T = v => ({ nodeType: 3, nodeName: '#text', nodeValue: v }), N = (name, kids) => ({ nodeType: 1, nodeName: name, childNodes: kids || [] });
        const runs = list => { const texts = list.map(T); return { root: N('DIV', texts.map(t => N('SPAN', [t]))), texts }; };
        const back = (root, o) => { const p = pg.tsPointAt(root, o); return pg.tsScan(root, p.node, p.offset).at; };
        const one = runs(['hello']);
        check('box maps: a field of one run — every offset is a place in its text node, and the place reads back as that offset',
            pg.tsScan(one.root).text === 'hello' && [0, 1, 2, 3, 4, 5].every(o => { const p = pg.tsPointAt(one.root, o); return p.node === one.texts[0] && p.offset === o && back(one.root, o) === o; }));
        const many = runs(['ab', 'cde', 'f']);
        const at = o => { const p = pg.tsPointAt(many.root, o); return [many.texts.indexOf(p.node), p.offset]; };
        check('box maps: a field of many runs — an offset inside a run is in that run\'s text node; at a boundary between two runs the place is the END OF THE LEFT one (what is typed there joins the part before it: the caret is drawn inside that part); the start is the first node\'s, the end the last one\'s',
            pg.tsScan(many.root).text === 'abcdef' && J([0, 1, 2, 3, 4, 5, 6].map(at)) === J([[0, 0], [0, 1], [0, 2], [1, 1], [1, 2], [1, 3], [2, 1]]) && [0, 1, 2, 3, 4, 5, 6].every(o => back(many.root, o) === o), [0, 1, 2, 3, 4, 5, 6].map(at));
        const br = runs(['red\n', 'plain', 'x\ny']);
        const atB = o => { const p = pg.tsPointAt(br.root, o); return [br.texts.indexOf(p.node), p.offset]; };
        check('box maps: a line break — after a run that ENDS with one the place is the start of the next run (a line begun after a styled line is not that line\'s); a line break inside a run is a character like any other',
            pg.tsScan(br.root).text === 'red\nplainx\ny' && J(atB(4)) === J([1, 0]) && J(atB(3)) === J([0, 3]) && J(atB(9)) === J([1, 5]) && J(atB(10)) === J([2, 1]) && J(atB(11)) === J([2, 2]) && [0, 3, 4, 9, 10, 11, 12].every(o => back(br.root, o) === o), [atB(4), atB(3), atB(9)]);
        const tailT = T('ab\n'), tailBr = N('BR'), tail = N('DIV', [N('SPAN', [tailT]), tailBr]);
        const pt = pg.tsPointAt(tail, 3);
        check('box maps: a label that ends with a line break — the line-break element drawn after its runs is no text (the box reads "ab\\n", never "ab\\n\\n"); the caret after the break is in the text node, and every place around that element reads as the end',
            pg.tsScan(tail).text === 'ab\n' && pt.node === tailT && pt.offset === 3 && pg.tsScan(tail, tail, 1).at === 3 && pg.tsScan(tail, tail, 2).at === 3 && pg.tsScan(tail, tailBr, 0).at === 3 && pg.tsScan(tail, tailT, 2).at === 2);
        const empty = N('DIV', []), pe = pg.tsPointAt(empty, 0), left = N('DIV', [N('BR')]);
        check('box maps: an empty field — the place is the box itself, and it reads as offset 0; a box the engine emptied and left a line-break element in reads as empty too',
            pe.node === empty && pe.offset === 0 && pg.tsScan(empty, empty, 0).at === 0 && pg.tsScan(empty).text === '' && pg.tsScan(left).text === '' && pg.tsScan(left, left, 1).at === 0 && pg.tsPointAt(left, 0).node === left && pg.tsPointAt(empty, 7).node === empty);
        const pair = runs(['a😀', '😁b']);
        check('box maps: a surrogate pair is two offsets of one node, never cut by a run boundary here — the offsets on each side of it read back',
            pg.tsScan(pair.root).text === 'a😀😁b' && [0, 1, 3, 5, 6].every(o => back(pair.root, o) === o) && J([pair.texts.indexOf(pg.tsPointAt(pair.root, 3).node), pg.tsPointAt(pair.root, 3).offset]) === '[0,3]');
        const aT = T('a'), bT = T('b'), stray = N('DIV', [N('SPAN', [aT]), N('BR'), N('SPAN', [bT])]), blocks = N('DIV', [T('one'), N('DIV', [T('two')]), N('DIV', [N('BR')])]), bare = T('typed'), dirty = N('DIV', [bare, N('SPAN', [T('')]), N('B', [N('I', [T('!')])])]);
        check('box maps: whatever the engine may leave in a box is read as text only — a bare text node, an empty one, an element it nested; a line-break element between texts and a block it wrapped a line in are line breaks; an element\'s own offsets (a count of its children) read as the text before that child',
            pg.tsScan(stray).text === 'a\nb' && pg.tsScan(stray, bT, 0).at === 2 && pg.tsScan(stray, stray, 1).at === 1 && pg.tsScan(stray, stray, 2).at === 2 && pg.tsPointAt(stray, 2).node === bT && pg.tsPointAt(stray, 1).node === aT
            && pg.tsScan(blocks).text === 'one\ntwo\n' && pg.tsScan(dirty).text === 'typed!' && pg.tsScan(dirty, dirty, 1).at === 5 && pg.tsScan(dirty, dirty, 3).at === 6 && pg.tsScan(dirty, bare, 99).at === 5 && pg.tsScan(dirty, T('elsewhere'), 0).at === -1 && pg.tsScan(dirty, bare, NaN).at === 0 && pg.tsScan(dirty, bare, -3).at === 0);
        check('box maps: an offset that cannot be (past the end, negative, no number) is the nearest place that can', J(at(99)) === '[2,1]' && J(at(-5)) === '[0,0]' && J(at(NaN)) === '[0,0]' && J(at(2.7)) === '[0,2]');
        {
            const R = rng(60606), pool = ['a', 'b', ' ', '\n', '😀', '<', '&', '\t']; let bad = null, places = 0;
            for (let k = 0; k < 400 && !bad; k++) {
                const list = Array.from({ length: 1 + Math.floor(R() * 5) }, () => Array.from({ length: 1 + Math.floor(R() * 6) }, () => pool[Math.floor(R() * pool.length)]).join('')), tr = runs(list), text = list.join('');
                if (pg.tsScan(tr.root).text !== text) bad = { list, read: pg.tsScan(tr.root).text };
                let a = 0;
                tr.texts.forEach((t, i) => { for (let o = 0; o <= t.nodeValue.length; o++) { places++; if (pg.tsScan(tr.root, t, o).at !== a + o) bad = { list, i, o }; } if (pg.tsScan(tr.root, tr.root, i).at !== a || pg.tsScan(tr.root, tr.root.childNodes[i], 0).at !== a || pg.tsScan(tr.root, tr.root.childNodes[i], 1).at !== a + t.nodeValue.length) bad = { list, i, el: true }; a += t.nodeValue.length; });
                for (let o = 0; o <= text.length; o++) { const p = pg.tsPointAt(tr.root, o); if (pg.tsScan(tr.root, p.node, p.offset).at !== o || p.node.nodeType !== 3 || p.offset < 0 || p.offset > p.node.nodeValue.length) bad = { list, o, p: [tr.texts.indexOf(p.node), p.offset] }; }
            }
            check('box maps (seeded, 400 fields of one to five runs — spaces, tabs, line breaks, astral characters, markup characters): the box reads as its runs joined; every place in every text node, and every element offset, reads as its character offset (' + places + ' places); every offset is a place in a text node that reads back as that offset', !bad && places > 4000, bad);
        }
    }

    /* ---- the box: what it shows, how it is drawn, what it reads back ---- */
    {
        const corpus = ['', 'a', 'two  spaces   here', ' lead', 'trail  ', 'tab\there', 'line\nbreak', '\nlead break', '\n\ntwo lead', 'a\r\nb\rc', 'emoji 😀 x 👩‍🔬', '<b>typed</b> &amp; &lt;i&gt; <img src=x onerror=alert(1)>', 'nul\u0000x', 'a b', 'ends\n', 'x\n\ny', '   ', '\t', 'a b'];
        const asInput = t => t.replace(/\u0000/g, '�').replace(/[\r\n]/g, ''), asArea = t => t.replace(/\u0000/g, '�').replace(/\r\n?/g, '\n').replace(/^\n/, '');   // what an input held as its value; what a textarea did
        const fmts = [undefined, { b: true }, { color: RED, spans: [{ s: 1, e: 3, color: GREEN, u: true }] }, { spans: [{ s: 0, e: 2, size: 'huge' }, { s: 2, e: 9, st: true, i: true }] }];
        let bad = null, drawn = 0;
        corpus.forEach(t => fmts.forEach(f => [false, true].forEach(multi => {
            const pg = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: t }, { id: 'c', type: 'flowchart', nodes: [{ id: 'n1', text: t }], edges: [] }]) });
            const fld = pg.tsField(pg.map.blocks, multi ? { idx: 1, k: 'node', ni: 0 } : { idx: 0, k: 'title' }); if (f) fld.setFmt(TF.cleanFmt(f, t));
            const before = J(pg.map.blocks);
            pg.rebuild();
            const box = pg.tsBox(multi ? { idx: 1, k: 'node', ni: 0 } : { idx: 0, k: 'title' }), want = multi ? asArea(t) : asInput(t), d = pg.drawn(box);
            drawn++;
            if (pg.tsShown(t, multi) !== want || box._tsText !== want || pg.tsScan(box).text !== want || pg.textOf(box) !== want || !d || J(pg.map.blocks) !== before) bad = bad || { t, multi, want, got: pg.tsScan(box).text, d };
            if (d && (d.filter(x => x === '+').length !== (multi && /\n$/.test(want) ? 1 : 0) || (!want && box.childNodes.length))) bad = bad || { t, multi, tail: d };
        })));
        check('box (read-back, ' + drawn + ' boxes drawn): for every text of a corpus — runs of spaces, tabs, line breaks, astral characters, typed tags and entities, a NUL — with and without a format, the box\'s text is exactly the value the input it replaces held (a one-line field without its line breaks, a label with \\r\\n as \\n and without one leading line break), with no character added or changed; drawing writes nothing to the document; an empty field\'s box holds nothing at all (its placeholder is the style sheet\'s)',
            !bad && drawn === corpus.length * fmts.length * 2, bad);
        // drawing = runsOf: one element per run, a text node in each, the look through the element's style from the cleaned values
        const styleOf = r => { const s = {}; if (r.color) s.color = r.color; if (r.b) s.fontWeight = 'bold'; if (r.i) s.fontStyle = 'italic'; if (r.u || r.st || r.link) s.textDecoration = [r.u || r.link ? 'underline' : '', r.st ? 'line-through' : ''].filter(Boolean).join(' '); if (r.size) s.fontSize = SIZE_EM[r.size]; return s; };
        const text = 'buy milk and walk dog', fmt = { color: RED, i: true, spans: [{ s: 0, e: 3, size: 'huge', b: true }, { s: 4, e: 8, color: GREEN, u: true, st: true }, { s: 9, e: 12, link: LINK }, { s: 13, e: 17, size: 'small', u: true }] };
        const pg = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: text, fmt: { title: fmt } }]) }).rebuild(), box = pg.tsBox({ idx: 0, k: 'title' }), d = pg.drawn(box), rs = runsOf(text, fmt);
        check('box (drawn from runs): one element per run of runsOf, in order, each holding one text node with the run\'s characters; its colour, bold, italic, underline, strike and size step are set through the element\'s style from the cleaned values — the same four size steps a reader sees',
            !!d && d.length === rs.length && rs.length === 8 && d.every((x, k) => x[0] === rs[k].t && J(x[1]) === J(styleOf(rs[k]))) && J(d[0][1]) === J({ color: RED, fontWeight: 'bold', fontStyle: 'italic', fontSize: '1.728em' }) && J(d[2][1]) === J({ color: GREEN, fontStyle: 'italic', textDecoration: 'underline line-through' }), d);
        check('box (a link): a linked part looks like a link — underlined, in the link colour\'s class — and is none: a span, never an anchor, with no address to follow; its address is its title',
            d[4][0] === 'and' && d[4][2] === 'tsr tsr-link' && d[4][3] === 'Link: ' + LINK && d[4][1].textDecoration === 'underline' && box.childNodes[4].nodeName === 'SPAN' && !('href' in box.childNodes[4]) && box.childNodes[4].attrs.href === undefined && d.filter(x => x[2] === 'tsr tsr-link').length === 1 && box.all().every(n => n.nodeName !== 'A'));
        const hostile = JSON.parse('{"b":1,"u":"true","st":{},"size":"99em","color":"red;background:url(//evil.example/x)","link":"javascript:alert(1)","style":"color:red","onclick":"alert(1)","__proto__":{"i":true,"color":"#5cb87a"},"spans":[{"s":0,"e":4,"color":"expression(alert(1))","size":"huge;position:fixed","link":"data:text/html,x","b":"yes"},{"s":"0","e":9,"b":true},"x",null]}');
        const hT = '<img src=x onerror=alert(1)><script>alert(1)</script>&lt;', ph = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: hT, fmt: { title: hostile } }, { id: 'c', type: 'flowchart', nodes: [{ id: 'n', text: hT + '\n', fmt: hostile }], edges: [] }]) }).rebuild();
        const hd = ph.drawn(ph.tsBox({ idx: 0, k: 'title' })), hl = ph.drawn(ph.tsBox({ idx: 1, k: 'node', ni: 0 }));
        check('box (hostile): a format that holds nothing the cleaner keeps draws the unstyled text — one element, no style, no title — and markup in the text is its characters in a text node; no element the app did not make, and the test page refuses markup outright (innerHTML throws)',
            J(hd) === J([[hT, {}, 'tsr', '']]) && J(hl) === J([[hT + '\n', {}, 'tsr', ''], '+']) && ph.blocksEl.all().every(n => n.nodeName === 'DIV' || n.nodeName === 'SPAN' || n.nodeName === 'BR')
            && (() => { try { ph.blocksEl.innerHTML = 'x'; return false; } catch (e) { return /markup/.test(e.message); } })() && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(boxSrc + barSrc), [hd, hl]);
        // a redraw touches only what differs
        const spans0 = box.childNodes.slice(), again = pg.tsPaint(box, pg.tsField(pg.map.blocks, { idx: 0, k: 'title' }), false);
        box.childNodes[2].firstChild.nodeValue = 'milky'; box._tsText = 'buy milky and walk dog'; pg.map.blocks[0].title = box._tsText; pg.map.blocks[0].fmt.title = respan(text, box._tsText, fmt, 9);
        const patched = pg.tsPaint(box, pg.tsField(pg.map.blocks, { idx: 0, k: 'title' }), false), sameEls = box.childNodes.every((c, k) => c === spans0[k]);
        box.childNodes[1].firstChild.nodeValue = 'XX'; const fixed = pg.tsPaint(box, pg.tsField(pg.map.blocks, { idx: 0, k: 'title' }), false), stillSame = box.childNodes.every((c, k) => c === spans0[k]) && pg.textOf(box) === box._tsText;
        box.appendChild(pg.dom.document.createTextNode('stray')); const rebuilt = pg.tsPaint(box, pg.tsField(pg.map.blocks, { idx: 0, k: 'title' }), false);
        check('box (redraw): a box that already holds exactly its runs is not touched (typing into a run\'s own text node costs no redraw); a text node that differs is put right in place; anything the app did not make — a stray node — and the box is made anew',
            again === false && patched === false && sameEls && fixed === true && stillSame && rebuilt === true && !!pg.drawn(box) && pg.textOf(box) === 'buy milky and walk dog' && box.childNodes[0] !== spans0[0], [again, patched, fixed, rebuilt]);
        const html = ph.tsBoxHtml('field b-title', 'Title "x" <img src=x onerror=alert(1)>', 'data-idx="3"', 'width:100%;'), htmlM = ph.tsBoxHtml('field fc-n-text fc-grow', 'Label', 'data-idx="1" data-ni="0"', '', true, 'title="t"');
        check('box (markup): renderPlanner writes an EMPTY box — its classes, its place, a placeholder that is escaped and no part of the text, plain-text editing, the role and the name a screen reader reads — and never the field\'s text; a label is marked multi-line',
            html === '<div class="field b-title ts-box" contenteditable="plaintext-only" role="textbox" aria-multiline="false" spellcheck="true" data-placeholder="Title &quot;x&quot; &lt;img src=x onerror=alert(1)&gt;" aria-label="Title &quot;x&quot; &lt;img src=x onerror=alert(1)&gt;" data-idx="3" style="width:100%;"></div>'
            && htmlM === '<div class="field fc-n-text fc-grow ts-box ts-multi" contenteditable="plaintext-only" role="textbox" aria-multiline="true" spellcheck="true" data-placeholder="Label" aria-label="Label" data-idx="1" data-ni="0" title="t"></div>' && ph.TS_EDIT === 'plaintext-only', [html, htmlM]);
        check('box (wired): renderPlanner writes each of the eleven plain boxes through tsBoxHtml (no input or textarea is left for a plain field, and no field\'s text goes into the markup), draws them with tsFill once the editor is written, and adds no listener of its own to any of them',
            (plannerSrc.match(/tsBoxHtml\(/g) || []).length === 12 && !/class="[^"]*\b(b-title|b-sub|b-must|b-caption|b-colhead|r-col|fc-n-text|fc-e-text)\b/.test(plannerSrc) && !/value="'\s*\+\s*esc\((b\.title|b\.sub|b\.tag|b\.must|b\.caption|c|e\.text|r\[)/.test(plannerSrc) && !/<textarea rows="1"/.test(plannerSrc)
            && /blockContainer\.innerHTML = html;\n\n\s*tsFill\(blockContainer, activeMap\.blocks\);/.test(plannerSrc) && !/querySelectorAll\('\.(b-title|b-sub|b-must|b-caption|b-colhead|r-col|fc-n-text|fc-e-text|fc-grow)'\)/.test(plannerSrc)
            && !/this\.selectionStart|setSelectionRange|\.(title|caption|must|text) = this\.value/.test(fieldsSrc + boxSrc + barSrc) && /tsBuild\(host, RTE_SYMS\);\n\s*tsWire\(root, host\);/.test(plannerSrc) && (plannerSrc.match(/tsWire\(/g) || []).length === 2);
    }

    /* ---- editing through the box: the engine edits it, the app reads it back as text and draws it again ---- */
    {
        const mkT = (text, fmt, multi) => { const pg = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: multi ? 'x' : text }, { id: 'c', type: 'flowchart', nodes: [{ id: 'n1', text: multi ? text : 'x' }], edges: [] }]) }), d = multi ? { idx: 1, k: 'node', ni: 0 } : { idx: 0, k: 'title' };
            if (fmt) pg.tsField(pg.map.blocks, d).setFmt(fmt); pg.wire().rebuild(); const box = pg.tsBox(d), fld = () => pg.tsField(pg.map.blocks, d);
            return { pg, d, box: () => pg.tsBox(d), text: () => fld().text(), fmt: () => J(fld().fmt()), E: pg.engine, first: box }; };
        const t1 = mkT('The Hill Road'), b1 = t1.first;
        t1.pg.focus(b1, 13); t1.pg.log.length = 0;
        t1.E.type(b1, '!'); const log1 = J(t1.pg.log); t1.E.type(b1, '?'); const log2 = J(t1.pg.log.slice(3));
        check('box (typing): a character typed by the engine is read back from the box as text and stored — the field\'s text is the box\'s, the preview is drawn again, the save is the typing kind (on its timer); a run of typing opens one step and the next character joins it',
            t1.text() === 'The Hill Road!?' && b1._tsText === 'The Hill Road!?' && log1 === J(['step+', 'save:false', 'preview']) && log2 === J(['save:false', 'preview']) && J(t1.pg.range(b1)) === '[15,15]' && J(t1.pg.sels[0]) === J([{ d: t1.d, s: 13, e: 13 }, { d: t1.d, s: 14, e: 14 }]) && J(t1.pg.sels[1]) === J([{ d: t1.d, s: 14, e: 14 }, { d: t1.d, s: 15, e: 15 }]), [t1.text(), log1, log2, t1.pg.sels]);
        // right after a styled part: the engine typed into the part's own text node; the store agrees (respan) and the caret stays inside that part
        const t2 = mkT('buy milk now', { spans: [{ s: 4, e: 8, color: GREEN, b: true }] }), b2 = t2.first;
        t2.pg.focus(b2, 8); const leftNode = t2.pg.dom.sel.anchorNode === b2.childNodes[1].firstChild && t2.pg.dom.sel.anchorOffset === 4;
        t2.E.type(b2, 's');
        const joined = t2.fmt(), inLeft = t2.pg.dom.sel.anchorNode === b2.childNodes[1].firstChild && t2.pg.dom.sel.anchorOffset === 5, shown2 = J(t2.pg.drawn(b2).map(x => x[0]));
        t2.E.caret(b2, 4); t2.E.type(b2, 'x'); const before2 = t2.fmt(), shown3 = J(t2.pg.drawn(b2).map(x => x[0]));
        check('box (typing at a boundary): right after a styled part the caret is drawn inside that part, what is typed there is in the part\'s element at once and in its span in the store; right before the part it is not (what you see while typing is what is stored)',
            leftNode && joined === J({ spans: [{ s: 4, e: 9, color: GREEN, b: true }] }) && inLeft && shown2 === J(['buy ', 'milks', ' now']) && before2 === J({ spans: [{ s: 5, e: 10, color: GREEN, b: true }] }) && shown3 === J(['buy x', 'milks', ' now']), [joined, shown2, before2, shown3]);
        // the engine may put the character in the node on the RIGHT of a boundary instead: the store still follows respan, the box is put right, the caret goes inside the left part
        const t3 = mkT('buy milk now', { spans: [{ s: 4, e: 8, color: GREEN }] }), b3 = t3.first;
        t3.pg.focus(b3, 8); t3.pg.dom.sel.setBaseAndExtent(b3.childNodes[2].firstChild, 0, b3.childNodes[2].firstChild, 0);   // the same place, held in the node on the right
        t3.pg.dom.fire(b3, 'beforeinput', { inputType: 'insertText', data: 's' }); b3.childNodes[2].firstChild.nodeValue = 's now'; t3.pg.dom.sel.setBaseAndExtent(b3.childNodes[2].firstChild, 1, b3.childNodes[2].firstChild, 1); t3.pg.dom.fire(b3, 'input', { inputType: 'insertText', data: 's' });
        check('box (typing at a boundary, the other node): a character the engine put into the node on the right of a styled part is stored as part of the styled part all the same (the rule is the text\'s, not the node\'s); the box is put right in place and the caret set inside the part',
            t3.fmt() === J({ spans: [{ s: 4, e: 9, color: GREEN }] }) && J(t3.pg.drawn(b3).map(x => x[0])) === J(['buy ', 'milks', ' now']) && t3.pg.dom.sel.anchorNode === b3.childNodes[1].firstChild && t3.pg.dom.sel.anchorOffset === 5, [t3.fmt(), t3.pg.drawn(b3)]);
        // an empty box: the engine makes a bare text node; the app draws its own
        const t4 = mkT(''), b4 = t4.first; t4.pg.focus(b4, 0); t4.E.type(b4, 'a');
        const drew4 = J(t4.pg.drawn(b4)), caret4 = t4.pg.dom.sel.anchorNode === b4.firstChild.firstChild && t4.pg.dom.sel.anchorOffset === 1;
        t4.E.backspace(b4);
        check('box (empty): the first character typed into an empty box — a bare text node of the engine\'s — is drawn again as a run of the app\'s, the caret after it; deleting it again leaves the box holding nothing (the line-break element the engine left is taken out, so the placeholder shows)',
            drew4 === J([['a', {}, 'tsr', '']]) && caret4 && t4.text() === '' && b4.childNodes.length === 0 && b4._tsText === '', [drew4, b4.childNodes.length]);
        // astral characters: whole, in the text and in the runs
        const t5 = mkT('a😀b', { spans: [{ s: 1, e: 3, b: true }] }), b5 = t5.first; t5.pg.focus(b5, 3); t5.E.type(b5, '😁'); t5.E.caret(b5, 5); t5.E.backspace(b5); t5.E.backspace(b5);
        check('box (astral characters): an emoji typed after a styled emoji joins it whole, one deleted goes whole — the text never holds half a pair and no run begins or ends inside one',
            t5.text() === 'ab' && t5.fmt() === undefined && (() => { const t = mkT('a😀b', { spans: [{ s: 1, e: 3, b: true }] }), b = t.first; t.pg.focus(b, 3); t.E.type(b, '😁'); return t.text() === 'a😀😁b' && t.fmt() === J({ spans: [{ s: 1, e: 5, b: true }] }) && J(t.pg.drawn(b).map(x => x[0])) === J(['a', '😀😁', 'b']); })(), [t5.text(), t5.fmt()]);

        // Enter
        const t6 = mkT('one line'), b6 = t6.first; t6.pg.focus(b6, 3); t6.pg.log.length = 0;
        const en = t6.E.enter(b6), sh = t6.E.edit(b6, 'insertLineBreak', null);
        const t7 = mkT('buy milk', { spans: [{ s: 0, e: 8, color: GREEN }] }, true), b7 = t7.first; t7.pg.focus(b7, 8); t7.pg.log.length = 0;
        const en7 = t7.E.enter(b7), d7 = J(t7.pg.drawn(b7).map(x => x === '+' ? x : x[0])), c7 = [t7.pg.dom.sel.anchorNode === b7.childNodes[1].firstChild, t7.pg.dom.sel.anchorOffset, J(t7.pg.range(b7))], log7 = J(t7.pg.log);
        t7.E.type(b7, 'w'); const d7b = J(t7.pg.drawn(b7).map(x => x === '+' ? x : x[0])), f7 = t7.fmt();
        t7.E.caret(b7, 9); t7.E.backspace(b7); const d7c = t7.text();
        check('box (Enter): a one-line field takes no line break — Enter and Shift+Enter change nothing and save nothing; in a label Enter is a new line, worked out on the text (the engine never puts its own line break into the box): at the end one line-break element is drawn after the runs so the new line has a place, the caret stands after the break, what is typed next is on the new line and not the styled line\'s; Backspace at the start of a line joins it to the one before',
            en.defaultPrevented && sh.defaultPrevented && t6.text() === 'one line' && t6.pg.log.length === 0
            && en7.defaultPrevented && d7 === J(['buy milk', '\n', '+']) && J(c7) === J([true, 1, '[9,9]']) && log7 === J(['step', 'save:false', 'preview']) && d7b === J(['buy milk', '\nw']) && f7 === J({ spans: [{ s: 0, e: 8, color: GREEN }] }) && d7c === 'buy milkw', [d7, c7, log7, d7b, f7, d7c]);

        // paste: plain text only, through the box's text
        const flav = { 'text/plain': 'a <b>x</b>\r\nb\nc\rd', 'text/html': '<b>BOLD</b><img src=x onerror=alert(1)><script>alert(1)</script>' };
        const t8 = mkT('ab', { spans: [{ s: 0, e: 1, i: true }] }), b8 = t8.first; t8.pg.focus(b8, 1); t8.pg.log.length = 0;
        const p8 = t8.E.paste(b8, flav), log8 = J(t8.pg.log);
        const t9 = mkT('ab', undefined, true), b9 = t9.first; t9.pg.focus(b9, 1); const p9 = t9.E.paste(b9, flav);
        const t10 = mkT('abcd'), b10 = t10.first; t10.pg.focus(b10, 1, 3); t10.E.paste(b10, { 'text/plain': 'XY' }); const sel10 = J(t10.pg.range(b10));
        t10.E.paste(b10, { 'text/plain': '', 'text/html': '<b>only markup</b>' });
        check('box (paste): only the clipboard\'s plain text comes in, and it comes in as text — pasted markup is its characters, in the box as in the data, and nothing of the HTML flavour is read; a one-line field takes each line break as a space (as the input did), a label keeps them as \\n; what is pasted right after a styled part joins it; a paste is a step of its own; the engine\'s own insertion never happens',
            p8.defaultPrevented && t8.text() === 'aa <b>x</b> b c db' && t8.fmt() === J({ spans: [{ s: 0, e: 17, i: true }] }) && log8 === J(['step', 'save:false', 'preview']) && J(t8.pg.range(b8)) === '[17,17]' && !!t8.pg.drawn(b8) && t8.pg.textOf(b8) === t8.text()
            && p9.defaultPrevented && t9.text() === 'aa <b>x</b>\nb\nc\ndb' && t10.text() === 'aXYd' && sel10 === '[3,3]', [t8.text(), t8.fmt(), log8, t9.text(), t10.text()]);
        // a paste or a drop that reaches the box only as the engine's own edit (no paste event): cancelled, and done on the text
        const t11 = mkT('ab'), b11 = t11.first; t11.pg.focus(b11, 2);
        const viaInput = t11.E.edit(b11, 'insertFromDrop', null, { dataTransfer: { getData: t => (t === 'text/plain' ? ' <i>d</i>\n' : '<i>d</i>') } });
        const drop = t11.pg.dom.fire(b11, 'drop', { dataTransfer: { getData: t => (t === 'text/plain' ? 'Z' : '') }, clientX: 0, clientY: 0 });
        const dragStart = t11.pg.dom.fire(b11.firstChild, 'dragstart', {}), filesOnly = t11.pg.dom.fire(b11, 'drop', { dataTransfer: { getData: () => '' } });
        check('box (drop): text dropped on a box comes in as plain text through the box\'s text (never as the engine\'s own insertion); a drop with no text changes nothing; a box\'s own text is not dragged about',
            viaInput.defaultPrevented && drop.defaultPrevented && t11.text() === 'ab <i>d</i> Z' && dragStart.defaultPrevented && filesOnly.defaultPrevented && t11.pg.textOf(b11) === t11.text(), t11.text());

        // copy and cut
        const t12 = mkT('buy milk now', { spans: [{ s: 4, e: 8, color: GREEN, b: true }] }), b12 = t12.first; t12.pg.focus(b12, 2, 10);
        const cp = t12.E.copy(b12, 'copy'), afterCopy = t12.text(); t12.pg.log.length = 0;
        const ct = t12.E.copy(b12, 'cut'), caretCut = J(t12.pg.range(b12)), none = (t12.E.caret(b12, 1), t12.E.copy(b12, 'copy'));
        check('box (copy, cut): both give the selected characters as plain text and nothing else (no markup of the box\'s elements); a cut takes them out of the text as a step of its own, with the caret where they were; with nothing selected the engine is left alone',
            cp.e.defaultPrevented && J(cp.got) === J({ 'text/plain': 'y milk n' }) && afterCopy === 'buy milk now' && ct.e.defaultPrevented && J(ct.got) === J({ 'text/plain': 'y milk n' }) && t12.text() === 'buow' && t12.fmt() === undefined && caretCut === '[2,2]' && J(t12.pg.log) === J(['step', 'save:false', 'preview']) && !none.e.defaultPrevented && J(none.got) === '{}', [cp.got, t12.text(), t12.pg.log]);

        // a composition (an IME, a dead key, the emoji picker)
        const t13 = mkT('ab', { spans: [{ s: 0, e: 2, b: true }] }), b13 = t13.first; t13.pg.focus(b13, 2); t13.pg.log.length = 0;
        const sets0 = t13.pg.dom.sel.sets, kids0 = b13.childNodes.slice(); let midText = null, midLog = null, midKids = null;
        t13.pg.dom.fire(b13, 'compositionstart', {});
        ['k', 'ka', 'か'].forEach((t, k) => { t13.pg.dom.fire(b13, 'beforeinput', { inputType: 'insertCompositionText', data: t }); const tn = b13.childNodes[0].firstChild; tn.nodeValue = 'ab' + t; t13.pg.dom.sel.setBaseAndExtent(tn, 2 + t.length, tn, 2 + t.length); const s1 = t13.pg.dom.sel.sets; t13.pg.dom.fire(b13, 'input', { inputType: 'insertCompositionText', data: t, isComposing: true }); if (k === 1) { midText = t13.text(); midLog = t13.pg.log.length; midKids = b13.childNodes.every((c, i) => c === kids0[i]) && t13.pg.dom.sel.sets === s1; } });
        t13.pg.dom.fire(b13, 'compositionend', { data: 'か' });
        const afterEnd = [t13.text(), t13.fmt(), J(t13.pg.log)];
        t13.pg.dom.fire(b13, 'input', { inputType: 'insertCompositionText', data: 'か' });   // some engines send one more input after the end: nothing is left to take
        check('box (composition): between its start and its end the box is the engine\'s — nothing is read back, stored, saved or drawn while it composes; at the end it is applied ONCE (one edit, one save), and it joins the styled part it was typed after; an input that follows the end changes nothing more',
            midText === 'ab' && midLog === 0 && midKids === true && J(afterEnd) === J(['abか', J({ spans: [{ s: 0, e: 3, b: true }] }), J(['step+', 'save:false', 'preview'])]) && t13.pg.log.length === 3 && t13.pg.tsState.comp === false, [midText, midLog, midKids, afterEnd, t13.pg.log]);

        // what the engine would do on its own that the app does itself: its undo, its redo, its bold
        const t14 = mkT('abc'), b14 = t14.first; t14.pg.focus(b14, 3); t14.pg.log.length = 0;
        const hu = t14.E.edit(b14, 'historyUndo', null), hr = t14.E.edit(b14, 'historyRedo', null), fb = t14.E.edit(b14, 'formatBold', null), fi = t14.E.edit(b14, 'formatItalic', null);
        check('box (the engine\'s own undo, redo and styling): each is cancelled before it touches the box — its undo and redo become the planner\'s own, its bold and italic nothing at all (the bar\'s presses are the only styling)',
            hu.defaultPrevented && hr.defaultPrevented && fb.defaultPrevented && fi.defaultPrevented && J(t14.pg.log) === J(['undo', 'redo']) && t14.text() === 'abc');

        // keys
        const t15 = mkT('abc'), b15 = t15.first; t15.pg.focus(b15, 1);
        const k1 = t15.pg.dom.fire(b15, 'keydown', keyEv({ key: 'x' })), k2 = t15.pg.dom.fire(b15, 'keydown', keyEv({ key: 'Delete' })), idBox = t15.pg.plain('input', 'fc-n-id', { idx: 1, ni: 0 }), k3 = t15.pg.dom.fire(idBox, 'keydown', keyEv({ key: 'x' }));
        check('box (keys): a key pressed in a box goes no further than the editor (no other handler of the page reads a box\'s typing as a shortcut); a key in a box that is no plain field\'s is left alone', k1.stopped === true && k2.stopped === true && k3.stopped === false);

        // a seeded walk through the box: type, delete, type over a selection, paste, Enter, cut — against the text an input would hold and the look respan gives
        const R = rng(424242), alpha = 'ab c<&d', look = (text, fmt) => { const out = []; runsOf(text, fmt).forEach(r => { for (let k = 0; k < r.t.length; k++) out.push([r.color, r.b, r.i, r.u, r.st, r.size, r.link].join('|')); }); return out; };
        const linkAt = (text, fmt, i) => look(text, fmt)[i].split('|')[6];
        let bad = null, steps = 0, done = {}, styledSteps = 0, linkEnds = 0;
        for (let round = 0; round < 40 && !bad; round++) {
            const multi = round % 2 === 1, t0 = Array.from({ length: 4 + Math.floor(R() * 14) }, () => (multi && R() < 0.15 ? '\n' : alpha[Math.floor(R() * alpha.length)])).join('').replace(/^\n/, 'a');
            const f0 = cleanFmt({ color: R() < 0.4 ? RED : undefined, link: R() < 0.1 ? LINK : undefined, spans: Array.from({ length: 4 }, () => { const s = Math.floor(R() * t0.length); return { s, e: s + 1 + Math.floor(R() * 5), color: R() < 0.5 ? [GREEN, BLUE][Math.floor(R() * 2)] : undefined, b: R() < 0.4 ? true : undefined, u: R() < 0.2 ? true : undefined, size: R() < 0.25 ? 'large' : undefined, link: !multi && R() < 0.4 ? LINK : undefined }; }) }, t0);
            const t = mkT(t0, f0, multi); let box = t.first, text = t0, fmt = f0;
            t.pg.focus(box, 0);
            for (let step = 0; step < 40 && !bad; step++) {
                const a = Math.floor(R() * (text.length + 1)), z = R() < 0.6 ? a : Math.min(text.length, a + Math.floor(R() * 4)), op = Math.floor(R() * 10);
                t.E.caret(box, a, z);
                let next = text, caret = a, name = '';
                if (op < 4) { const ch = alpha[Math.floor(R() * alpha.length)]; t.E.type(box, ch); next = text.slice(0, a) + ch + text.slice(z); caret = a + 1; name = a === z ? 'type' : 'type over'; }
                else if (op === 4) { t.E.backspace(box); if (a !== z) next = text.slice(0, a) + text.slice(z); else if (a > 0) { next = text.slice(0, a - 1) + text.slice(a); caret = a - 1; } name = 'backspace'; }
                else if (op === 5) { t.E.del(box); if (a !== z) next = text.slice(0, a) + text.slice(z); else if (a < text.length) next = text.slice(0, a) + text.slice(a + 1); name = 'delete'; }
                else if (op === 6) { const raw = ['x y', '<b>p</b>', 'l1\nl2', 'r\r\nn', ''][Math.floor(R() * 5)], ins = multi ? raw.replace(/\r\n?/g, '\n') : raw.replace(/\r\n?|\n/g, ' '); t.E.paste(box, { 'text/plain': raw, 'text/html': '<u>no</u>' }); if (ins) { next = text.slice(0, a) + ins + text.slice(z); caret = a + ins.length; } name = 'paste'; }
                else if (op === 7) { t.E.enter(box); if (multi) { next = text.slice(0, a) + '\n' + text.slice(z); caret = a + 1; } name = multi ? 'enter' : 'enter (one line)'; }
                else if (op === 8) { t.E.copy(box, 'cut'); if (a !== z) next = text.slice(0, a) + text.slice(z); name = 'cut'; }
                else { t.pg.dom.fire(box, 'compositionstart', {}); t.E.cut(box, a, z); t.E.put(box, a, 'e'); t.pg.dom.fire(box, 'input', { inputType: 'insertCompositionText', isComposing: true }); t.pg.dom.fire(box, 'compositionend', {}); next = text.slice(0, a) + 'e' + text.slice(z); caret = a + 1; name = 'compose'; }
                done[name] = (done[name] || 0) + 1; steps++;
                // what an input would have given tsType: this text and this caret; the look respan gives for them (less a link at its end)
                const q = next.length - caret; let p = 0; { const lim = Math.min(text.length - q, caret); while (p < lim && text[p] === next[p]) p++; }
                const n = next.length - q - p; let want = next === text ? fmt : respan(text, next, fmt, caret);
                if (next !== text && want && n > 0 && p > 0) { const L = linkAt(text, fmt, p - 1), Rr = p < text.length ? linkAt(text, fmt, p) : ''; if (L && L !== Rr) { want = apply(want, next, p, p + n, { link: null }); linkEnds++; } }
                box = t.box();
                const gotText = t.text(), gotFmt = t.pg.tsField(t.pg.map.blocks, t.d).fmt(), d = t.pg.drawn(box), rng2 = t.pg.range(box);
                if (gotText !== next) bad = { name, text, next, gotText, a, z };
                else if (t.pg.textOf(box) !== next || box._tsText !== next || !d) bad = { name, where: 'box', text, next, box: t.pg.textOf(box), d };
                else if (J(gotFmt) !== J(want)) bad = { name, where: 'look', text, next, caret, fmt, want, gotFmt };
                else if (J(d.filter(x => x !== '+').map(x => x[0])) !== J(runsOf(next, gotFmt).map(r => r.t))) bad = { name, where: 'runs', d };
                else if (next !== text && J(rng2) !== J([caret, caret])) bad = { name, where: 'caret', caret, rng2 };
                else { const bl = look(text, fmt), al = look(next, gotFmt); for (let k = 0; k < p; k++) if (bl[k] !== al[k]) bad = { name, where: 'prefix', k, text, next }; for (let k = 0; k < q; k++) if (bl[text.length - 1 - k] !== al[next.length - 1 - k]) bad = { name, where: 'suffix', k, text, next }; }
                if (gotFmt) styledSteps++;
                text = next; fmt = gotFmt;
            }
        }
        check('box (a seeded walk of ' + steps + ' edits through the box — typing, typing over a selection, Backspace, Delete, pastes with markup and line breaks, Enter, cuts, compositions — in one-line fields and labels): after every edit the stored text is exactly what an input would hold, the box holds that text in runs of the app\'s own and nothing else, the caret is where the edit left it, every character that survived keeps its look, and the format is the one respan gives for that text and caret (a link not grown at its end: ' + linkEnds + ' times)',
            !bad && steps === 1600 && styledSteps > 500 && linkEnds > 5 && ['type', 'type over', 'backspace', 'delete', 'paste', 'enter', 'enter (one line)', 'cut', 'compose'].every(k => done[k] > 20), bad || { steps, styledSteps, linkEnds, done });
    }

    /* ---- the stored shape is untouched: an edit through the box saves what the boxes it replaces saved ---- */
    {
        // the old path, written out: an input's handler was tsType(blocks, d, input.value, input.selectionStart) — the field's text set, its spans carried by respan —
        // and a press was TF.apply / TF.clear on the field's text at the input's selection. (With the link constant true: the one rule that changed is off.)
        const sha = v => require('crypto').createHash('sha256').update(JSON.stringify(v)).digest('hex'), PINS_BOX = ['3c0b1f8ca2aa67f1b83d14775eeaae3c8898ef5b956ff56aecde881ff6c4697a', '24e83e9b0abda075b77654722ac2766c2c2d25dc47e1cf019270828081fbdab7', 'e91dcd40e57f05fa52714a2a623e90a08a94747c0c60c9bd12a959871d8b08e8', '5d126ef5207163fea5a0f57044849b2e3f68de71c84fec0cf9cbda32e3ed5119'];
        const start = () => [
            { id: 'b0', type: 'h1', title: 'The Hill Road', sub: 'an evening', fmt: { title: { color: RED, spans: [{ s: 4, e: 8, b: true, link: LINK }] } } },
            { id: 'b1', type: 'node', title: 'The inn', tag: 'social', must: 'learn the road', cols: ['Check', 'DC', 'Cost'], colFmt: [null, { b: true }], rows: [{ col1: 'Medicine', col2: '10', col3: 'free', fmt: { col1: { spans: [{ s: 0, e: 3, color: GREEN, u: true }] } } }, { col1: 'Insight', col2: '13', col3: 'a coin' }] },
            { id: 'b2', type: 'flowchart', nodes: [{ id: 'n1', text: LBL, shape: 'rect', color: 'neutral', fmt: { color: RED, spans: [{ s: 9, e: 17, size: 'large', color: GREEN }] } }, { id: 'n3', text: 'two', shape: 'rect', color: 'gold' }], edges: [{ from: 'n1', to: 'n3', text: 'then', style: 'solid' }] },
            { id: 'b3', type: 'image', src: '/saves/images/x.png', caption: 'the map', fmt: { caption: { i: true } } }
        ];
        const fields = [{ idx: 0, k: 'title' }, { idx: 0, k: 'sub' }, { idx: 1, k: 'title' }, { idx: 1, k: 'sub' }, { idx: 1, k: 'must' }, { idx: 1, k: 'col', ci: 1 }, { idx: 1, k: 'cell', ri: 0, ci: 0 }, { idx: 1, k: 'cell', ri: 1, ci: 2 }, { idx: 2, k: 'node', ni: 0 }, { idx: 2, k: 'node', ni: 1 }, { idx: 2, k: 'edge', ei: 0 }, { idx: 3, k: 'caption' }];
        const pg = mkPage({ map: mapOf(start()), linkGrows: true }).wire().rebuild(), ref = start(), refPg = mkPage({ map: mapOf(ref) }), E = pg.engine, B = pg.tsState.els;
        const R = rng(20261002), alpha = 'ab cé<&'; let bad = null, ops = 0, presses = 0;
        const oldType = (d, value, caret) => { const f = refPg.tsField(ref, d), old = f.text(), fm = f.fmt(); f.setText(value); if (fm !== undefined) f.setFmt(respan(old, value, fm, caret)); };
        const oldPress = (d, s, e, change) => { const f = refPg.tsField(ref, d), now = change === 'clear' ? clear(f.fmt(), f.text(), s, e) : apply(f.fmt(), f.text(), s, e, change); if (J(now) !== J(cleanFmt(f.fmt(), f.text()))) f.setFmt(now); };
        for (let k = 0; k < 900 && !bad; k++) {
            const d = fields[Math.floor(R() * fields.length)], box = pg.tsBox(d), multi = d.k === 'node', text = refPg.tsField(ref, d).text();
            const a = Math.floor(R() * (text.length + 1)), z = R() < 0.5 ? a : Math.min(text.length, a + Math.floor(R() * 5)), op = Math.floor(R() * 12);
            pg.focus(box, a, z);
            if (op < 4) { const ch = alpha[Math.floor(R() * alpha.length)]; E.type(box, ch); oldType(d, text.slice(0, a) + ch + text.slice(z), a + 1); }
            else if (op === 4) { E.backspace(box); if (a !== z) oldType(d, text.slice(0, a) + text.slice(z), a); else if (a > 0) oldType(d, text.slice(0, a - 1) + text.slice(a), a - 1); }
            else if (op === 5) { const raw = ['x y', 'l1\nl2', '<b>p</b>'][Math.floor(R() * 3)], ins = multi ? raw : raw.replace(/\n/g, ' '); E.paste(box, { 'text/plain': raw }); oldType(d, text.slice(0, a) + ins + text.slice(z), a + ins.length); }
            else if (op === 6) { E.enter(box); if (multi) oldType(d, text.slice(0, a) + '\n' + text.slice(z), a + 1); }
            else { presses++;
                const change = op === 7 ? { b: true } : op === 8 ? { color: [RED, GREEN, BLUE][Math.floor(R() * 3)] } : op === 9 ? { size: ['large', 'huge', null][Math.floor(R() * 3)] } : op === 10 ? (R() < 0.5 ? { u: true } : { st: true }) : (R() < 0.3 ? 'clear' : { link: R() < 0.7 ? LINK : null });
                if (change === 'clear') pg.click(B.clear); else if (change.b) pg.click(B.b); else if (change.u) pg.click(B.u); else if (change.st) pg.click(B.s);
                else if ('color' in change) pg.click(B.swatches[PALETTE.findIndex(p => p[0] === change.color)]);
                else if ('size' in change) { pg.dom.fire(B.size, 'mousedown'); B.size.focus(); B.size.value = change.size || ''; pg.dom.fire(B.size, 'change'); }
                else { pg.dom.fire(B.link, 'mousedown'); B.link.focus(); B.link.value = change.link || ''; pg.dom.fire(B.link, 'keydown', keyEv({ key: 'Enter' })); }
                if (!(change !== 'clear' && 'link' in change && (d.k === 'node' || d.k === 'edge'))) oldPress(d, a, z, change);
            }
            ops++;
            if (J(pg.map.blocks) !== J(ref)) bad = { k, d, op, a, z, box: pg.map.blocks[d.idx], ref: ref[d.idx] };
        }
        const hashes = pg.map.blocks.map(sha);
        check('stored shape (a seeded walk of ' + ops + ' edits and presses over twelve fields — titles, a tag, a head, cells, labels, a caption — through the new boxes and their bar): after EVERY one the document is byte for byte what the old boxes\' handlers and the old bar stored for the same text, caret and selection (tsType on the input\'s value and selectionStart; apply / clear at its selection) — the same keys in the same order, no key added, nothing the box drew stored',
            !bad && ops === 900 && presses > 250 && pg.map.blocks.every(b => !/tsr|<span|_ts/.test(J(b))), bad);
        check('stored shape (pinned): the four blocks that walk ends on, by their SHA-256 — a change to what an edit or a press stores shows here',
            J(hashes) === J(PINS_BOX), hashes);
        // the editor draws without writing: opening a document saved before this fold changes nothing in it
        const old = start(), page2 = mkPage({ map: mapOf(old) }).wire(), was = J(old); page2.rebuild(); page2.focus(page2.tsBox(fields[0]), 2, 5); page2.engine.caret(page2.tsBox(fields[0]), 1); page2.rebuild();
        check('stored shape: a document saved before this fold opens, is drawn, focused and selected in, and is rebuilt without a byte of it changing (the box is a view; only an edit or a press writes)', J(page2.map.blocks) === was && page2.log.length === 0);
    }

    /* ---- undo and redo in a box: always the planner's own history, in steps, each with its selections (io.js run for real) ---- */
    {
        const mkU = (text, fmt, multi) => {
            const pg = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: multi ? 'x' : text }, { id: 'c', type: 'flowchart', nodes: [{ id: 'n1', text: multi ? text : 'x' }], edges: [{ from: 'a', to: 'b', text: 'then', style: 'solid' }] }, { id: 't', type: 'h3', title: 'other' }]) }), d = multi ? { idx: 1, k: 'node', ni: 0 } : { idx: 0, k: 'title' };
            if (fmt) pg.tsField(pg.map.blocks, d).setFmt(fmt);
            pg.wire().rebuild(); const H = mkHist(pg);
            const u = { pg, H, d, E: pg.engine, B: pg.tsState.els, box: () => pg.tsBox(d), text: () => pg.tsField(pg.map.blocks, d).text(), fmt: () => J(pg.tsField(pg.map.blocks, d).fmt()),
                tick: ms => { pg.clock.t += ms; if (ms >= 500) H.flush(); },   // time passes: after half a second of quiet the save's timer fires
                chord: (key, extra) => pg.dom.fire(pg.dom.page.active || pg.doc.body, 'keydown', keyEv(Object.assign({ key: key, ctrlKey: true }, extra || {}))),
                undo: () => u.chord('z'), redo: () => u.chord('y'),
                at: () => { const a = pg.dom.page.active; return a && pg.tsDesc(a) ? [pg.tsDesc(a).idx, J(pg.range(a))] : null; },   // the box that has the focus and its selection
                state: () => J(pg.map.blocks) };
            return u;
        };
        // a run of typing is one step; an undo puts the text and the caret back where the typing began, a redo where it ended
        const u1 = mkU('The Hill Road'); u1.pg.focus(u1.box(), 13);
        u1.E.type(u1.box(), 'a'); u1.tick(80); u1.E.type(u1.box(), 'b'); u1.tick(80); u1.E.type(u1.box(), 'c'); u1.tick(600);
        const d1 = J(u1.H.depth()), z1 = u1.undo(), a1 = [u1.text(), J(u1.at()), !u1.B.root.hidden, J(u1.H.depth())], y1 = u1.redo(), r1 = [u1.text(), J(u1.at()), J(u1.H.depth())], noMore = (u1.redo(), u1.text());
        check('undo (typing): a run of typing in a box is ONE step of the planner\'s history; Ctrl+Z takes it back — the text as it was, the caret where the typing began, in the box (drawn anew, the bar on it again) — and Ctrl+Y brings it back with the caret where the typing ended; the key is taken, never left to the engine',
            d1 === '[1,0]' && z1.defaultPrevented && z1.stopped && J(a1) === J(['The Hill Road', J([0, '[13,13]']), true, '[0,1]']) && y1.defaultPrevented && J(r1) === J(['The Hill Roadabc', J([0, '[16,16]']), '[1,0]']) && noMore === 'The Hill Roadabc' && J(u1.H.toasts) === J(['Undo', 'Redo']), [d1, a1, r1, u1.H.toasts]);
        // Ctrl+Shift+Z is redo too
        u1.undo(); const sz = u1.chord('z', { shiftKey: true });
        check('undo: Ctrl+Shift+Z is redo, as Ctrl+Y is', sz.defaultPrevented && u1.text() === 'The Hill Roadabc' && J(u1.at()) === J([0, '[16,16]']));
        // what ends a step: a pause, a move of the caret, another kind of edit
        const u2 = mkU('The Hill Road'); u2.pg.focus(u2.box(), 13);
        u2.E.type(u2.box(), 'a'); u2.tick(600); u2.tick(700); u2.E.type(u2.box(), 'b'); u2.tick(600); const soon = u2.H.depth()[0];
        u2.tick(2500); u2.E.type(u2.box(), 'c'); u2.tick(600); const paused = u2.H.depth()[0];
        u2.E.caret(u2.box(), 0); u2.E.type(u2.box(), 'X'); u2.tick(100); u2.E.caret(u2.box(), 1); u2.E.type(u2.box(), 'Y'); u2.tick(600); const moved = u2.H.depth()[0];   // the caret put where it already was: no move
        u2.E.caret(u2.box(), 5); u2.E.type(u2.box(), 'Z'); u2.tick(600); const moved2 = u2.H.depth()[0];
        u2.E.backspace(u2.box()); u2.tick(100); u2.E.backspace(u2.box()); u2.tick(600); const deleted = u2.H.depth()[0], t2 = u2.text();
        const back = []; for (let k = 0; k < 5; k++) { u2.undo(); back.push([u2.text(), u2.at()[1]]); }
        check('undo (what ends a step): typing goes on in the same step across a short stop; a pause of two seconds, a move of the caret and a switch from typing to deleting each begin a new one (a run of deleting is one step too) — and each Ctrl+Z takes back exactly one of them, never more, with the selection as that step found it',
            soon === 1 && paused === 2 && moved === 3 && moved2 === 4 && deleted === 5 && t2 === 'XYTh Hill Roadabc'
            && J(back) === J([['XYTheZ Hill Roadabc', '[6,6]'], ['XYThe Hill Roadabc', '[5,5]'], ['The Hill Roadabc', '[0,0]'], ['The Hill Roadab', '[15,15]'], ['The Hill Road', '[13,13]']]), [soon, paused, moved, moved2, deleted, t2, back]);
        // a press is one step with its selection; typing still on its way is never lost with it
        const u3 = mkU('The Hill Road'); u3.pg.focus(u3.box(), 13);
        u3.E.type(u3.box(), 'a'); u3.E.type(u3.box(), 'b');                       // typed, the save still on its timer
        u3.E.caret(u3.box(), 0, 3); u3.pg.click(u3.B.b); const afterPress = [u3.fmt(), J(u3.H.depth()), J(u3.at())];
        u3.E.caret(u3.box(), 15); u3.E.type(u3.box(), 'c');                       // typed after the press, not yet saved
        const end3 = u3.state(), endAt = J(u3.at());
        u3.undo(); const s1 = [u3.text(), u3.fmt(), J(u3.at())]; u3.undo(); const s2 = [u3.text(), u3.fmt(), J(u3.at())]; u3.undo(); const s3 = [u3.text(), u3.fmt(), J(u3.at())], dry = (u3.undo(), u3.text());
        u3.redo(); const f1 = [u3.text(), u3.fmt(), J(u3.at())]; u3.redo(); const f2 = [u3.text(), u3.fmt(), J(u3.at())]; u3.redo();
        check('undo (a press): a press of the bar is one step — what was typed before it is its own step first, and what is typed after it another; Ctrl+Z takes them back one at a time (the letter typed since, then the press with its characters selected again, then the typing before it), losing nothing in between; Ctrl+Y brings each back and ends exactly where the edits ended — text, look and selection',
            J(afterPress) === J([J({ spans: [{ s: 0, e: 3, b: true }] }), '[2,0]', J([0, '[0,3]'])]) && J(s1) === J(['The Hill Roadab', J({ spans: [{ s: 0, e: 3, b: true }] }), J([0, '[15,15]'])]) && J(s2) === J(['The Hill Roadab', undefined, J([0, '[0,3]'])])
            && J(s3) === J(['The Hill Road', undefined, J([0, '[13,13]'])]) && dry === 'The Hill Road' && J(f1) === J(['The Hill Roadab', undefined, J([0, '[15,15]'])]) && J(f2) === J(['The Hill Roadab', J({ spans: [{ s: 0, e: 3, b: true }] }), J([0, '[0,3]'])])
            && u3.state() === end3 && J(u3.at()) === endAt && endAt === J([0, '[16,16]']), [afterPress, s1, s2, s3, f1, f2, u3.at()]);
        // a selection typed over, a paste, Enter in a label, a cut
        const u4 = mkU('The Hill Road'); u4.pg.focus(u4.box(), 4, 8); u4.E.type(u4.box(), 'x'); u4.tick(600); u4.undo(); const over = [u4.text(), J(u4.at())];
        const u5 = mkU('ab\ncd', { spans: [{ s: 0, e: 2, color: GREEN }] }, true); u5.pg.focus(u5.box(), 2);
        u5.E.type(u5.box(), 'x'); u5.E.enter(u5.box()); u5.E.type(u5.box(), 'y'); u5.E.paste(u5.box(), { 'text/plain': 'P\nQ' }); u5.E.caret(u5.box(), 0, 2); u5.E.copy(u5.box(), 'cut'); u5.tick(600);
        const n5 = u5.H.depth()[0], end5 = [u5.text(), u5.fmt()], trail = []; for (let k = 0; k < 5; k++) { u5.undo(); trail.push([u5.text(), u5.fmt(), u5.at()[1]]); }
        for (let k = 0; k < 5; k++) u5.redo();
        check('undo (other edits): a selection typed over comes back selected; in a label a line break, a paste and a cut are each a step of their own between the runs of typing, and an undo of each puts back the text, the look of every character and the selection it found — then redo returns to the end exactly',
            J(over) === J(['The Hill Road', J([0, '[4,8]'])]) && n5 === 5 && J(end5) === J(['x\nyP\nQ\ncd', J({ spans: [{ s: 0, e: 1, color: GREEN }] })])
            && J(trail) === J([['abx\nyP\nQ\ncd', J({ spans: [{ s: 0, e: 3, color: GREEN }] }), '[0,2]'], ['abx\ny\ncd', J({ spans: [{ s: 0, e: 3, color: GREEN }] }), '[5,5]'], ['abx\n\ncd', J({ spans: [{ s: 0, e: 3, color: GREEN }] }), '[4,4]'], ['abx\ncd', J({ spans: [{ s: 0, e: 3, color: GREEN }] }), '[3,3]'], ['ab\ncd', J({ spans: [{ s: 0, e: 2, color: GREEN }] }), '[2,2]']])
            && J([u5.text(), u5.fmt()]) === J(end5) && J(u5.at()) === J([1, '[0,0]']), [over, n5, end5, trail, u5.at()]);
        // two boxes: an undo goes where its step was; the toolbar's buttons leave the focus alone
        const u6 = mkU('The Hill Road'), other = { idx: 2, k: 'title' }; u6.pg.focus(u6.box(), 13); u6.E.type(u6.box(), 'a'); u6.tick(600);
        u6.pg.focus(u6.pg.tsBox(other), 5); u6.E.type(u6.pg.tsBox(other), 'b'); u6.tick(600);
        u6.undo(); const o1 = [u6.pg.map.blocks[2].title, J(u6.at())]; u6.undo(); const o2 = [u6.text(), J(u6.at())];
        u6.redo(); u6.redo(); u6.pg.dom.page.active.blur(); u6.pg.dom.runTimers(); const hid = u6.B.root.hidden;
        u6.H.undo(); const o3 = [u6.pg.map.blocks[2].title, u6.pg.dom.page.active, u6.B.root.hidden];
        check('undo (where it lands): an undo puts the caret back in the box its step was in — the one in use, or another one, which takes the focus and the bar — and an undo from the toolbar\'s button, with the focus nowhere in the editor, takes the step back and leaves the focus alone (no box is entered, no bar comes up)',
            J(o1) === J(['other', J([2, '[5,5]'])]) && J(o2) === J(['The Hill Road', J([0, '[13,13]'])]) && hid === true && J(o3) === J(['other', null, true]), [o1, o2, hid, o3]);
        // the chord itself: a box never has the engine's undo; a text block's box still tries its own first
        const u7 = mkU('abc'), b7 = u7.box(); u7.pg.focus(b7, 3); u7.E.type(b7, 'd');
        const rte = u7.pg.plain('div', 'field rte-body', { idx: 9 }); rte.setAttribute('contenteditable', 'true'); rte._wpNativeDirty = true;
        const kz = t => { const e = keyEv({ key: 'z', ctrlKey: true, target: t, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }); return [u7.H.fieldUndoChord(e), e.prevented, u7.pg.dom.page.timers.length]; };
        const dirty = b7._wpNativeDirty, onRte = kz(rte), onBox = kz(u7.box());
        check('undo (the chord, io.js fieldUndoChord run for real): in a styled field\'s box every Ctrl+Z is the planner\'s history at once — the engine is never asked first, whatever was typed in the box — while a text block\'s own box still lets the engine try (a probe is armed, the key is left to it)',
            dirty === true && J(onRte) === J([false, false, 1]) && onBox[0] === true && onBox[1] === true && u7.text() === 'abc' && /var own = !!\(t\.classList && t\.classList\.contains\('ts-box'\)\);/.test(ioSrc) && /if \(t\._wpNativeDirty && !own\) \{/.test(ioSrc) && !/_wpFloor/.test(ioSrc + plannerSrc), [dirty, onRte, onBox]);
        // the Size list stepped through by the keyboard: every size applied, the run of them ONE step
        const u8 = mkU(LBL, undefined, true), S8 = u8.B.size; u8.pg.focus(u8.box(), 9, 17);
        S8.focus(); const keyOn = (el, key) => u8.pg.dom.fire(el, 'keydown', keyEv({ key }));
        keyOn(S8, 'ArrowDown'); S8.value = 'small'; u8.pg.dom.fire(S8, 'change'); const k1 = [u8.pg.dom.page.active === S8, u8.fmt(), u8.H.depth()[0], J(u8.pg.tsState.sel)];
        keyOn(S8, 'ArrowDown'); S8.value = 'large'; u8.pg.dom.fire(S8, 'change'); keyOn(S8, 'ArrowDown'); S8.value = 'larger'; u8.pg.dom.fire(S8, 'change');
        const k3 = [u8.pg.dom.page.active === S8, u8.fmt(), u8.H.depth()[0], J(u8.pg.tsState.sel), J(u8.pg.log.filter(x => x === 'step' || x === 'fold'))];
        S8.blur(); u8.pg.dom.runTimers(); u8.pg.focus(u8.box(), 9, 17); S8.focus(); keyOn(S8, 'ArrowDown'); S8.value = 'huge'; u8.pg.dom.fire(S8, 'change'); const afterBlur = u8.H.depth()[0];
        const esc8 = keyOn(S8, 'Escape'), back8 = J(u8.at()); u8.undo(); u8.undo();
        check('undo (the Size list by the keyboard): its arrow keys step through the sizes — each is applied to the selected characters, the list keeps the focus, the remembered selection is unchanged — and the whole run is ONE step back to how the field was; leaving the list ends the run (the next size is a step of its own); Escape goes back to the box with its selection',
            J(k1) === J([true, J({ spans: [{ s: 9, e: 17, size: 'small' }] }), 1, k1[3]]) && JSON.parse(k1[3]).s === 9 && JSON.parse(k1[3]).e === 17 && J(k3) === J([true, J({ spans: [{ s: 9, e: 17, size: 'larger' }] }), 1, k1[3], J(['step', 'fold', 'fold'])]) && afterBlur === 2
            && esc8.defaultPrevented && back8 === J([1, '[9,17]']) && u8.fmt() === undefined && J(u8.at()) === J([1, '[9,17]']), [k1, k3, afterBlur, back8, u8.fmt()]);
        const winF = mkPage({ map: mapOf([{ id: 'b', type: 'h2', title: 'one' }]) }), HF = mkHist(winF), mF = winF.map;
        mF.blocks[0].title = 'two'; HF.pushHistory();                           // a step
        winF.dom.window.wpStream = true; HF.stepFold(); HF.stepSel({ s: 1 }, { s: 2 }); delete winF.dom.window.wpStream;   // a fold and a note asked for where no save is recorded (a window that never owns a save): nothing is armed
        mF.blocks[0].title = 'three'; HF.pushHistory(); const notArmed = HF.stack().undo.length, noNote = HF.stack().undo[1].indexOf('"s":') < 0;
        HF.stepFold(); mF.blocks[0].title = 'four'; HF.pushHistory(); const folded = HF.stack().undo.length;
        mF.blocks[0].title = 'five'; HF.pushHistory();
        check('undo (io.js stepFold / stepSel / pushHistory run for real): the fold and the selection note are one shot each and armed only where the save that follows is recorded — a fold joins the step before it once and the pass after is a step of its own; a state with no selection noted is stored exactly as before (no key added)',
            notArmed === 2 && noNote && folded === 2 && HF.stack().undo.length === 3 && JSON.parse(HF.stack().undo[1]).c.blocks[0].title === 'two' && JSON.parse(HF.stack().undo[2]).c.blocks[0].title === 'four' && HF.stack().undo.every(s => J(Object.keys(JSON.parse(s))) === '["c","m"]'), [notArmed, folded, HF.stack().undo.length]);
        check('undo (wired): an edit and a press both tell the history their selections (stepSel) and close the step before them (stepBoundary); a state goes on a stack with the selection that belongs to it and an undo or a redo puts that one back through the planner\'s own hook; the planner\'s spot keeps a box\'s selection',
            /stepSel\(\{ d: d, s: before\.s, e: before\.e \}, \{ d: d, s: s, e: e \}\);/.test(barSrc) && /stepSel\(\{ d: sel\.d, s: sel\.s, e: sel\.e \}, \{ d: sel\.d, s: sel\.s, e: sel\.e \}\);/.test(barSrc) && /if \(!cont\) stepBoundary\(kind === 'one' \? null : box\);/.test(barSrc)
            && /function stepBoundary\(el\) \{ if \(savePending\) pushHistory\(\); closeChunk\(\); if \(el\) typeSlot\.el = el; \}/.test(ioSrc) && /if \(dir === 'undo'\) h\.redo\.push\(withSel\(h\.last, h\.cur\)\); else pushStep\(h, withSel\(h\.last, h\.cur\)\);/.test(ioSrc)
            && /if \(sel && window\.wpTextBox && window\.wpTextBox\.restore\(sel\)\) return;/.test(ioSrc) && /ts: window\.wpTextBox \? window\.wpTextBox\.selOf\(a\) : null/.test(ioSrc) && /\n\s*stepSel,\n/.test(ioSrc) && /window\.wpTextBox = \{/.test(barSrc));

        // a seeded walk: edits and presses in three boxes with time passing, then Ctrl+Z to the start and Ctrl+Y to the end
        const R = rng(777001), alpha = 'ab c<'; let bad = null, ops = 0, totalSteps = 0, pressSteps = 0;
        for (let round = 0; round < 12 && !bad; round++) {
            const u = mkU('buy milk\nwalk dog', { color: RED, spans: [{ s: 4, e: 8, color: GREEN, b: true }] }, true), ds = [u.d, { idx: 0, k: 'title' }, { idx: 2, k: 'title' }], start = u.state();
            u.pg.focus(u.box(), 3); let startAt = null, endAt = null;   // the selection the first edit found, and the one the last edit left
            for (let k = 0; k < 45 && !bad; k++) {
                const d = R() < 0.7 ? ds[0] : ds[1 + Math.floor(R() * 2)], box = u.pg.tsBox(d), len = box._tsText.length, op = Math.floor(R() * 10);
                if (u.pg.dom.page.active !== box || R() < 0.4) { const a = Math.floor(R() * (len + 1)); u.pg.focus(box, a, R() < 0.6 ? a : Math.min(len, a + Math.floor(R() * 4))); }
                const before = u.state(), beforeAt = J(u.at());
                if (op < 4) u.E.type(box, alpha[Math.floor(R() * alpha.length)]);
                else if (op === 4) u.E.backspace(box);
                else if (op === 5) u.E.paste(box, { 'text/plain': ['p q', 'l1\nl2'][Math.floor(R() * 2)] });
                else if (op === 6) u.E.enter(box);
                else {   // a press: exactly one step, taken back and brought back at once
                    u.H.flush(); const n0 = u.H.depth()[0], pre = u.state(), preAt = J(u.at());
                    u.pg.click([u.B.b, u.B.i, u.B.u, u.B.swatches[2 + Math.floor(R() * 3)], u.B.nocolor, u.B.clear][Math.floor(R() * 6)]);
                    const post = u.state();
                    if (post !== pre) { pressSteps++; if (u.H.depth()[0] !== n0 + 1) bad = { k, where: 'a press is not one step', n0, n: u.H.depth()[0] };
                        u.undo(); if (u.state() !== pre || J(u.at()) !== preAt) bad = bad || { k, where: 'undo of a press', at: u.at(), preAt }; u.redo(); if (u.state() !== post || J(u.at()) !== preAt) bad = bad || { k, where: 'redo of a press', at: u.at(), preAt }; }
                    else if (u.H.depth()[0] !== n0) bad = { k, where: 'a press that changed nothing made a step' };
                }
                ops++; u.tick([40, 120, 700, 2600][Math.floor(R() * 4)]);
                if (u.state() !== before) { if (startAt === null) startAt = beforeAt; endAt = J(u.at()); }
            }
            if (bad) break;
            u.H.flush();
            const end = u.state(), n = u.H.depth()[0], down = [];
            totalSteps += n;
            for (let k = 0; k < n && !bad; k++) { const was = u.state(); if (u.pg.dom.page.active) u.undo(); else u.H.undo(); if (u.state() === was) bad = { round, k, where: 'an undo that took nothing back' }; down.push(u.state()); }
            if (!bad && (u.state() !== start || u.H.depth()[0] !== 0 || J(u.at()) !== startAt)) bad = { round, where: 'undone to the start', at: u.at(), startAt, same: u.state() === start };
            for (let k = n - 1; k >= 0 && !bad; k--) { if (u.pg.dom.page.active) u.redo(); else u.H.redo(); const want = k > 0 ? down[k - 1] : end; if (u.state() !== want) bad = { round, k, where: 'a redo that did not return exactly' }; }
            if (!bad && (u.state() !== end || J(u.at()) !== endAt || u.H.depth()[1] !== 0)) bad = { round, where: 'redone to the end', at: u.at(), endAt };
        }
        check('undo (a seeded walk: ' + ops + ' edits and presses in three boxes — typing, Backspace, pastes, Enter, B / I / U, colours, Default, Clear — with pauses, in ' + totalSteps + ' steps): every press is exactly one step, undone and redone on the spot with its selection; then Ctrl+Z all the way takes something back each time and ends on the document and the selection as they were before the first edit, and Ctrl+Y all the way passes back through every state exactly and ends on the last text, look and selection',
            !bad && ops === 540 && totalSteps > 150 && totalSteps < ops && pressSteps > 60, bad || { ops, totalSteps, pressSteps });
    }

    /* ---- the bar on the box ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }).wire().rebuild(), E = pg.tsState.els, D = pg.dom, title = () => pg.tsBox({ idx: 0, k: 'title' }), lab = () => pg.tsBox({ idx: 2, k: 'node', ni: 0 });
        pg.tsBuild(pg.editor, SYMS);   // a second call builds nothing
        check('bar: ONE bar for the editor, built inside the editor panel as elements with text and values only, hidden until a box has the focus — B, I, U, S, the seven inks, a custom colour, Default, the size steps, a link box, Clear and the symbol tray, in that order; no control is in the Tab order of the page (Tab still goes from box to box)',
            pg.editor.querySelectorAll('#tsBar').length === 1 && E.root.parentNode === pg.editor && E.root.hidden === true && E.root.attrs.role === 'toolbar' && pg.doc.getElementById('textStyleBar') === null
            && E.b.textContent === 'B' && E.b.firstChild.nodeName === 'B' && E.i.firstChild.nodeName === 'I' && E.u.firstChild.nodeName === 'U' && E.s.firstChild.nodeName === 'S' && E.s.dataset.ts === 'st'
            && J(E.swatches.map(s => s.dataset.color)) === J(PALETTE.map(p => p[0])) && E.swatches.every((s, k) => s.title.indexOf(PALETTE[k][1]) === 0 && s.style.background === PALETTE[k][0]) && E.custom.type === 'color' && E.custom.parentNode === E.customWrap
            && E.nocolor.textContent === 'Default' && J(E.size.children.map(o => [o.value, o.textContent])) === J([['', 'Default'], ['small', 'Small'], ['large', 'Large'], ['larger', 'Larger'], ['huge', 'Huge'], ['mixed', 'Mixed']]) && E.sizeMixed.disabled === true && E.sizeMixed.hidden === true
            && E.link.tagName === 'INPUT' && E.link.type === 'text' && E.link.parentNode === E.linkLab && /^Link — a web address/.test(E.linkLab.title) && E.clear.dataset.ts === 'clear' && /^Clear/.test(E.clear.title)
            && J(E.symList.map(b => [b.dataset.sym, b.textContent, b.title])) === J(SYMS.map(s => [s[0], s[0], s[1]])) && E.symBtn.textContent === 'Ω'
            && J(E.root.children.filter(c => c.className !== 'rte-sep').map(c => c.className.replace(/ off$/, ''))) === J(['rte-btn', 'rte-btn', 'rte-btn', 'rte-btn'].concat(PALETTE.map(() => 'rte-sw'), ['rte-sw rte-custom ts-custom', 'rte-btn rte-nocolor', 'ts-sizelab', 'ts-linklab', 'rte-btn', 'rte-symwrap', 'ts-scope']))
            && [E.b, E.i, E.u, E.s, E.custom, E.nocolor, E.size, E.link, E.clear, E.symBtn].concat(E.swatches, E.symList).every(c => c.tabIndex === -1) && [E.b, E.i, E.u, E.s, E.nocolor].every(c => /the selected characters, or the whole field with nothing selected$/.test(c.title)));
        check('bar: with no box in use every control is disabled, and a press changes nothing and saves nothing',
            [E.b, E.i, E.u, E.s, E.custom, E.nocolor, E.size, E.link, E.clear, E.symBtn].concat(E.swatches).every(c => c.disabled === true) && (() => { const before = J(pg.map); pg.click(E.b); pg.click(E.swatches[2]); E.size.value = 'large'; D.fire(E.size, 'change'); pg.click(E.symList[0]); pg.tsPress({ b: true }); return J(pg.map) === before && pg.log.length === 0; })());

        // shown on focus, on the box; hidden when the focus leaves both
        title().rect = { left: 140, top: 300, right: 520, bottom: 334 };
        pg.focus(title(), 4, 8);
        const shown = [E.root.hidden, E.root.style.left, E.root.style.top, E.root.style.visibility, E.root.attrs['aria-label'], E.scope.textContent, pg.tsState.box === title()];
        pg.focus(title(), 2); const whole = E.scope.textContent;
        const md = D.fire(E.b, 'mousedown'), stay = D.page.active === title();
        const idBox = pg.plain('input', 'fc-n-id', { idx: 2, ni: 0 }); idBox.focus(); const gone = [E.root.hidden, pg.tsState.box, pg.tsState.sel];
        pg.focus(title(), 2); D.fire(E.size, 'mousedown'); E.size.focus(); D.runTimers(); const inBar = [E.root.hidden, pg.tsState.box === title()];
        E.size.blur(); D.runTimers(); const left = E.root.hidden;
        pg.focus(title(), 2); pg.focus(lab(), 3); const moved = [E.root.hidden, pg.tsState.box === lab(), E.root.attrs['aria-label']];
        check('bar: it comes up on the box that takes the focus — above it, from its left edge — names the field for a screen reader and says what a press will act on (the selected characters, or the whole field); a button\'s mousedown is swallowed, so the box keeps the focus and its selection; it goes away when the focus leaves both the box and the bar (another control, nothing at all) and stays while the focus is inside the bar; it moves to another box with the focus',
            J(shown) === J([false, '140px', '264px', '', 'Text style — Title', '4 selected', true]) && whole === 'Whole field' && md.defaultPrevented && stay && J(gone) === J([true, null, null]) && J(inBar) === '[false,true]' && left === true && J(moved) === J([false, true, 'Text style — Node n1’s label']), [shown, whole, gone, inBar, left, moved]);
        // where it goes
        const P = { left: 100, top: 50, right: 688, bottom: 650 }, at = (b, w, h) => pg.tsPlaceAt(P, b, w === undefined ? 420 : w, h === undefined ? 30 : h);
        check('bar (its place, tsPlaceAt): above the box with a small gap; under it when there is no room above inside the panel; from the box\'s left edge, pushed inside the panel for a narrow last column and for a bar wider than what is left; never shown for a box that has scrolled out of the panel',
            J(at({ left: 140, top: 300, right: 520, bottom: 334 })) === J({ left: 140, top: 264, below: false, seen: true }) && J(at({ left: 140, top: 70, right: 520, bottom: 104 })) === J({ left: 140, top: 110, below: true, seen: true })
            && J(at({ left: 640, top: 300, right: 686, bottom: 334 })) === J({ left: 262, top: 264, below: false, seen: true }) && at({ left: 140, top: 300, right: 520, bottom: 334 }, 700).left === 106 && at({ left: 140, top: 300, right: 520, bottom: 334 }, 420, 64).top === 230
            && at({ left: 140, top: 10, right: 520, bottom: 44 }).seen === false && at({ left: 140, top: 660, right: 520, bottom: 694 }).seen === false && at({ left: 140, top: 40, right: 520, bottom: 60 }).seen === true && at({ left: 140, top: 88, right: 520, bottom: 122 }).below === false && at({ left: 140, top: 87, right: 520, bottom: 121 }).below === true);
        pg.focus(title(), 2); title().rect = { left: 140, top: 60, right: 520, bottom: 94 }; D.fire(pg.editor, 'scroll'); const under = [E.root.style.top, E.root.classList.contains('ts-below')];
        title().rect = { left: 140, top: -80, right: 520, bottom: -46 }; D.fire(pg.blocksEl, 'scroll'); const away = E.root.style.visibility;
        title().rect = { left: 300, top: 400, right: 680, bottom: 434 }; D.window.fire('resize'); const again = [E.root.style.left, E.root.style.top, E.root.style.visibility, E.root.style.maxWidth];
        check('bar (it follows its box): when the panel scrolls — or anything inside it does — and when the window is resized the bar is placed again on its box: under it once there is no room above, hidden while the box is out of the panel\'s view, back with it; it is never wider than the panel',
            J(under) === J(['100px', true]) && away === 'hidden' && J(again) === J(['262px', '364px', '', '576px']), [under, away, again]);

        // each control, with a selection and without
        const fmtT = () => J(pg.map.blocks[0].fmt && pg.map.blocks[0].fmt.title), rg = b => J(pg.range(b));
        pg.focus(title(), 4, 8); pg.log.length = 0;
        pg.click(E.b); const b1 = [fmtT(), J(pg.log), rg(title()), D.page.active === title(), E.b.classList.contains('on')];
        pg.click(E.b); const b2 = ['fmt' in pg.map.blocks[0], E.b.classList.contains('on')];
        pg.click(E.i); pg.click(E.u); pg.click(E.s); const ius = [fmtT(), E.i.classList.contains('on') && E.u.classList.contains('on') && E.s.classList.contains('on'), rg(title())];
        pg.click(E.swatches[4]); const col = [fmtT(), E.swatches[4].classList.contains('active'), E.swatches[2].classList.contains('active')];
        pg.log.length = 0; pg.click(E.swatches[4]); const noStep = pg.log.length;
        pg.click(E.nocolor); const def = fmtT();
        pg.click(E.clear); const clr = ['fmt' in pg.map.blocks[0], E.clear.disabled];
        pg.focus(title(), 6);
        pg.click(E.swatches[2]); const wholeRed = fmtT(); pg.focus(title(), 4, 8); pg.click(E.swatches[4]); pg.click(E.b); const three = [fmtT(), rg(title()), J(pg.drawn(title()).map(x => [x[0], x[1].color, x[1].fontWeight]))];
        pg.focus(title(), 9); pg.click(E.clear); const allGone = 'fmt' in pg.map.blocks[0];
        check('bar (a press): with characters selected B makes them bold — one step, saved at once, the selection left where it was, the button lit, only that box drawn again — and B again takes it off, leaving no key behind; I, U and S likewise; a colour lights its swatch; the same colour again is no step; Default and Clear on the selection take the colour, or everything, off that part',
            J(b1) === J([J({ spans: [{ s: 4, e: 8, b: true }] }), J(['step', 'save:true', 'preview']), '[4,8]', true, true]) && J(b2) === '[false,false]' && J(ius) === J([J({ spans: [{ s: 4, e: 8, i: true, u: true, st: true }] }), true, '[4,8]'])
            && J(col) === J([J({ spans: [{ s: 4, e: 8, color: GREEN, i: true, u: true, st: true }] }), true, false]) && noStep === 0 && def === J({ spans: [{ s: 4, e: 8, i: true, u: true, st: true }] }) && J(clr) === '[false,true]', [b1, b2, ius, col, noStep, def, clr]);
        check('bar (nothing selected is the whole field): a colour with only a caret in the box is the whole field\'s; a selection then takes its own, and a second press needs no second selecting ("select, green, bold") — the box shows it at once; Clear with nothing selected takes everything off',
            wholeRed === J({ color: RED }) && J(three) === J([J({ color: RED, spans: [{ s: 4, e: 8, color: GREEN, b: true }] }), '[4,8]', J([['The ', RED, undefined], ['Hill', GREEN, 'bold'], [' Road', RED, undefined]])]) && allGone === false, [wholeRed, three, allGone]);
        // the controls that must take the focus: the Size list, the custom colour, the link box
        pg.focus(lab(), 9, 17); pg.log.length = 0;
        const mdS = D.fire(E.size, 'mousedown'); E.size.focus(); D.runTimers(); E.size.value = 'large'; D.fire(E.size, 'change');
        const n1 = pg.map.blocks[2].nodes[0], sized = [mdS.defaultPrevented, J(n1.fmt), D.page.active === lab(), rg(lab()), E.size.value, J(pg.log), E.root.hidden];
        pg.focus(lab(), 3); const mixed = [E.size.value, E.sizeMixed.hidden]; E.size.focus(); E.size.value = 'mixed'; pg.log.length = 0; D.fire(E.size, 'change'); const mixedNo = pg.log.length;
        pg.focus(lab(), 9, 17); E.size.focus(); E.size.value = ''; D.fire(E.size, 'change'); const unsized = 'fmt' in n1;
        pg.focus(lab(), 9, 17); const mdC = D.fire(E.custom, 'mousedown'); E.custom.focus(); E.custom.value = '#ABCDEF'; pg.log.length = 0; D.fire(E.custom, 'change');
        const cust = [mdC.defaultPrevented, J(n1.fmt), J(pg.log), E.customWrap.classList.contains('active'), D.page.active === lab(), rg(lab())];
        check('bar (the Size list, the custom colour): each may take the focus (its mousedown is not swallowed) and the bar stays up while it has it; the press acts on the selection the box had, and the focus and that selection go back to the box. The Size list sizes the selected characters (the whole field with nothing selected), reads Mixed — a word it shows, never one to pick — where there is more than one size, and Default takes the size off; a custom colour is one press when the picker closes',
            J(sized) === J([false, J({ spans: [{ s: 9, e: 17, size: 'large' }] }), true, '[9,17]', 'large', J(['step', 'save:true', 'preview']), false]) && J(mixed) === J(['mixed', false]) && mixedNo === 0 && unsized === false
            && J(cust) === J([false, J({ spans: [{ s: 9, e: 17, color: '#abcdef' }] }), J(['step', 'save:true', 'preview']), true, true, '[9,17]']), [sized, mixed, mixedNo, unsized, cust]);
        pg.focus(lab(), 0); pg.click(E.clear);

        // the link box
        const linkIn = (v, how) => { const m = D.fire(E.link, 'mousedown'); E.link.focus(); D.runTimers(); D.fire(E.link, 'keydown', keyEv({ key: v.slice(-1) || 'Backspace' })); E.link.value = v;
            if (how === 'enter') return [m, D.fire(E.link, 'keydown', keyEv({ key: 'Enter' }))];
            if (how === 'esc') return [m, D.fire(E.link, 'keydown', keyEv({ key: 'Escape' }))];
            D.fire(E.link, 'change'); E.link.blur(); D.fire(E.link, 'blur'); D.runTimers(); return [m]; };   // left for nowhere: its change, then its blur
        pg.focus(title(), 4, 8); pg.log.length = 0;
        const e1 = linkIn('https://a.example/hill', 'enter'), l1 = [fmtT(), D.page.active === title(), rg(title()), J(pg.log), e1[0].defaultPrevented, e1[1].defaultPrevented];
        D.fire(E.link, 'change'); const once = pg.log.length === 3;   // the box's own change as it loses the focus after Enter: nothing left to do
        pg.focus(title(), 0, 3); const sh0 = [E.link.value, E.link.placeholder]; pg.focus(title(), 5, 7); const sh1 = E.link.value; pg.focus(title(), 2, 6); const sh2 = [E.link.value, E.link.placeholder];
        pg.focus(title(), 6); const here = [E.link.value, E.link.placeholder, /The part at the caret links to https:\/\/a\.example\/hill$/.test(E.linkLab.title)]; pg.focus(title(), 2); const notHere = E.link.placeholder;
        check('bar (Link): the bar\'s own address box — with characters selected, Enter gives them the link (one step) and goes back to the box with its selection as it was; it shows the address of the link under the selection, nothing where there is none, "several links" where there is more than one; with only a caret inside a linked part it says that part\'s address (the part is not followed in the editor: its address is here and in its title)',
            J(l1) === J([J({ spans: [{ s: 4, e: 8, link: 'https://a.example/hill' }] }), true, '[4,8]', J(['step', 'save:true', 'preview']), false, true]) && once && J(sh0) === J(['', 'https://…']) && sh1 === 'https://a.example/hill' && J(sh2) === J(['', 'several links'])
            && J(here) === J(['', 'here: https://a.example/hill', true]) && notHere === 'several links' && pg.drawn(title())[1][3] === 'Link: https://a.example/hill', [l1, once, sh0, sh1, sh2, here, notHere]);
        pg.focus(title(), 2); pg.log.length = 0; linkIn('b.example/road', 'enter'); const l2 = [fmtT(), pg.log.length];   // nothing selected: the whole field; typed without its scheme: https://
        pg.focus(title(), 4, 8); linkIn('', 'enter'); const l3 = fmtT();   // an empty box takes the link off the selection
        pg.focus(title(), 9); const callsBefore = title().calls.length; linkIn('  https://c.example/  ', 'away'); const l4 = [fmtT(), title().calls.slice(callsBefore).indexOf('focus') < 0, D.page.active, E.root.hidden];
        pg.focus(title(), 9); linkIn('', 'enter'); const l5 = 'fmt' in pg.map.blocks[0];
        check('bar (Link): with nothing selected the link is the whole field\'s; an address typed without its scheme is taken as https://; an empty box takes the link off (the selection\'s, or everything\'s); leaving the box with a new address in it sets it too — and the focus stays where it went (the bar goes with it)',
            J(l2) === J([J({ link: 'https://b.example/road' }), 3]) && l3 === J({ spans: [{ s: 0, e: 4, link: 'https://b.example/road' }, { s: 8, e: 13, link: 'https://b.example/road' }] }) && J(l4) === J([J({ link: 'https://c.example/' }), true, null, true]) && l5 === false, [l2, l3, l4, l5]);
        pg.focus(title(), 0, 3); pg.log.length = 0; pg.toasts.length = 0;
        const bad = ['javascript:alert(1)', 'data:text/html,x', 'https://a b', 'ftp://a.example', 'JAVASCRIPT:alert(1)', 'mailto:a@b.example', 'javascript:1+1'].map(v => { linkIn(v, 'enter'); return [fmtT(), D.page.active === E.link, E.link.value === v]; });
        pg.tsRefresh(); const typing = E.link.value === 'javascript:1+1';   // the bar refreshed while the box is being typed in: what is typed stays
        const k1 = linkIn('https://esc.example/', 'esc'), e2 = [k1[1].defaultPrevented && k1[1].stopped, fmtT(), pg.log.length, D.page.active === title(), rg(title()), E.link.value];
        pg.focus(title(), 0, 3); linkIn('example.com:8080/x', 'enter'); const port1 = fmtT(); pg.focus(title(), 4, 8); linkIn('localhost:3000', 'enter'); const port2 = fmtT();
        check('bar (Link): an address that is no web address is refused in words — nothing changes, there is no step, the box keeps the focus and what was typed so it can be put right (a refresh of the bar never writes over it); Escape backs out — what was typed is dropped, never set, and the box has the focus and its selection again; an address with a port and no scheme is taken as https://',
            bad.every(x => x[0] === undefined && x[1] && x[2]) && typing && pg.toasts.length === 7 && pg.toasts.every(m => /http:\/\/ or https:\/\//.test(m)) && J(e2) === J([true, undefined, 0, true, '[0,3]', ''])
            && port1 === J({ spans: [{ s: 0, e: 3, link: 'https://example.com:8080/x' }] }) && port2 === J({ spans: [{ s: 0, e: 3, link: 'https://example.com:8080/x' }, { s: 4, e: 8, link: 'https://localhost:3000' }] }), [bad, typing, pg.toasts.length, e2, port1, port2]);
        pg.focus(title(), 0); pg.click(E.clear);
        pg.focus(lab(), 9, 17); const offL = [E.link.disabled, E.linkLab.title, E.linkLab.classList.contains('off'), E.u.disabled, E.s.disabled, E.size.disabled, E.b.disabled, E.symBtn.disabled];
        pg.log.length = 0; const pressed = pg.tsPress({ link: 'https://a.example/' }); E.link.value = 'https://a.example/'; D.fire(E.link, 'change'); const viaBox = pg.log.length;
        pg.focus(pg.tsBox({ idx: 2, k: 'edge', ei: 0 }), 0); const offE = E.link.disabled; pg.focus(title(), 0, 3); const onT = [E.link.disabled, E.linkLab.classList.contains('off'), /^Link — a web address/.test(E.linkLab.title)];
        pg.focus(lab(), 9, 17); pg.click(E.u); pg.click(E.s); pg.click(E.b); pg.click(E.swatches[4]); E.size.focus(); E.size.value = 'large'; D.fire(E.size, 'change');
        check('bar (a flowchart label): Link is off for a node\'s label and an arrow\'s, with a title that says why in plain words — a press there changes nothing; on again in a title. Everything else a label can carry works there as anywhere: bold, a colour, underline, strike and a size on part of it, and a symbol',
            J(offL) === J([true, 'A flowchart label cannot hold a link: a chart never carries web addresses.', true, false, false, false, false, false]) && pressed === false && viaBox === 0 && offE === true && J(onT) === '[false,false,true]'
            && J(pg.map.blocks[2].nodes[0].fmt) === J({ spans: [{ s: 9, e: 17, size: 'large', color: GREEN, b: true, u: true, st: true }] }) && !('fmt' in pg.map.blocks[2].edges[0]), [offL, pressed, viaBox, offE, onT, pg.map.blocks[2].nodes[0].fmt]);
        check('bar (wired): the link box is an input the bar builds itself — never a prompt — its address goes through the core\'s one link rule before anything is stored, and the label rule is the same everywhere (tsIsLabel)',
            !/\bprompt\(/.test(barSrc) && /if \(v && !TF\.cleanLink\(v\)\) \{ toast\(/.test(barSrc) && /E\.link = mk\('input', 'ts-link'\); E\.link\.type = 'text';/.test(barSrc) && /function tsIsLabel\(d\) \{ return !!d && \(d\.k === 'node' \|\| d\.k === 'edge'\); \}/.test(barSrc)
            && /if \(change !== 'clear' && tsOwn\(change, 'link'\) && tsIsLabel\(sel\.d\)\) \{ tsRefresh\(\); return false; \}/.test(barSrc));

        // the symbol tray: a symbol is text, typed at the caret
        const ps = mkPage({ map: mapOf([{ id: 'h', type: 'h2', title: 'buy milk now', fmt: { title: { spans: [{ s: 4, e: 8, color: GREEN }] } } }]) }).wire().rebuild(), S = ps.tsState.els, sb = () => ps.tsBox({ idx: 0, k: 'title' });
        ps.focus(sb(), 8); ps.click(S.symBtn); const open = S.symWrap.classList.contains('open'); ps.log.length = 0;
        ps.click(S.symList[0]); const sy1 = [ps.map.blocks[0].title, J(ps.map.blocks[0].fmt.title), J(ps.range(sb())), ps.dom.page.active === sb(), S.symWrap.classList.contains('open'), J(ps.log)];
        ps.focus(sb(), 0, 3); ps.click(S.symBtn); ps.click(S.symList[2]); const sy2 = [ps.map.blocks[0].title, J(ps.range(sb()))];
        check('bar (symbols): the tray opens from its button; a symbol is TEXT — it goes into the field at the caret (over a selection), joins the styled part it follows as typing does, leaves the caret after it in the box, closes the tray, and is a step of its own',
            open && J(sy1) === J(['buy milk→ now', J({ spans: [{ s: 4, e: 9, color: GREEN }] }), '[9,9]', true, false, J(['step', 'save:false', 'preview'])]) && J(sy2) === J(['✓ milk→ now', '[1,1]']) && /tsInsertAt\(box, ch, sel\.s, sel\.e, 'insertSymbol'\)/.test(barSrc), [open, sy1, sy2]);

        // the keyboard
        const pk = mkPage({ map: mapOf(B0()) }).wire().rebuild(), K = pk.tsState.els, tk = () => pk.tsBox({ idx: 0, k: 'title' }), fk = () => J(pk.map.blocks[0].fmt && pk.map.blocks[0].fmt.title);
        pk.focus(tk(), 0, 3); pk.log.length = 0;
        const kb = pk.dom.fire(tk(), 'keydown', keyEv({ key: 'b', ctrlKey: true })), f1 = fk(), ki = pk.dom.fire(tk(), 'keydown', keyEv({ key: 'I', metaKey: true })), ku = pk.dom.fire(tk(), 'keydown', keyEv({ key: 'u', ctrlKey: true })), f2 = fk();
        const idK = pk.plain('input', 'fc-n-id', { idx: 2, ni: 0 }), no = [keyEv({ key: 'b', ctrlKey: true, shiftKey: true }), keyEv({ key: 'b', ctrlKey: true, altKey: true }), keyEv({ key: 'b' }), keyEv({ key: 's', ctrlKey: true })].map(o => pk.dom.fire(tk(), 'keydown', o).defaultPrevented).concat(pk.dom.fire(idK, 'keydown', keyEv({ key: 'b', ctrlKey: true })).defaultPrevented);
        check('keyboard: Ctrl+B, Ctrl+I and Ctrl+U in a box do what the buttons do (one step each, the key taken, the selection kept); with Shift or Alt, another key, or in a box that is no plain field the key is left alone',
            kb.defaultPrevented && kb.stopped && f1 === J({ spans: [{ s: 0, e: 3, b: true }] }) && ki.defaultPrevented && ku.defaultPrevented && f2 === J({ spans: [{ s: 0, e: 3, b: true, i: true, u: true }] }) && J(pk.log) === J(['step', 'save:true', 'preview', 'step', 'save:true', 'preview', 'step', 'save:true', 'preview']) && no.every(x => x === false) && J(pk.range(tk())) === '[0,3]', [f1, f2, no]);
        pk.focus(tk(), 4, 8);
        const f10 = pk.dom.fire(tk(), 'keydown', keyEv({ key: 'F10', altKey: true })), in1 = [f10.defaultPrevented, pk.dom.page.active === K.b, pk.tsState.key, K.root.hidden];
        const tab = el => pk.dom.fire(el, 'keydown', keyEv({ key: 'Tab' })), t1 = tab(K.b), on1 = pk.dom.page.active === K.i; pk.dom.fire(K.i, 'keydown', keyEv({ key: 'Tab', shiftKey: true })); const on2 = pk.dom.page.active === K.b;
        pk.dom.fire(K.b, 'keydown', keyEv({ key: 'Tab', shiftKey: true })); const wrap = pk.dom.page.active === K.symBtn; tab(K.symBtn); const wrap2 = pk.dom.page.active === K.b;
        pk.dom.fire(K.b, 'keydown', keyEv({ key: 'Enter' })); pk.dom.fire(K.b, 'click'); const kept = [pk.dom.page.active === K.b, fk(), J(pk.tsState.sel && [pk.tsState.sel.s, pk.tsState.sel.e])];
        K.swatches[4].focus(); pk.dom.fire(K.swatches[4], 'keydown', keyEv({ key: ' ' })); pk.dom.fire(K.swatches[4], 'click'); const kept2 = [pk.dom.page.active === K.swatches[4], fk()];
        const esc = pk.dom.fire(K.swatches[4], 'keydown', keyEv({ key: 'Escape' })), backTo = [esc.defaultPrevented, pk.dom.page.active === tk(), J(pk.range(tk()))];
        pk.dom.fire(tk(), 'keydown', keyEv({ key: 'F10', altKey: true })); K.size.focus(); const ent = pk.dom.fire(K.size, 'keydown', keyEv({ key: 'Enter' })), entBack = pk.dom.page.active === tk();
        pk.dom.fire(tk(), 'keydown', keyEv({ key: 'F10', altKey: true })); pk.dom.fire(K.symBtn, 'click'); const order = pk.tsOrder().length; pk.dom.fire(K.symBtn, 'keydown', keyEv({ key: 'Tab' })); const inTray = pk.dom.page.active === K.symList[0];
        pk.dom.fire(K.symList[0], 'keydown', keyEv({ key: 'Enter' })); pk.dom.fire(K.symList[0], 'click'); const sym = [pk.map.blocks[0].title, pk.dom.page.active === K.symList[0], K.symWrap.classList.contains('open'), J([pk.tsState.sel.s, pk.tsState.sel.e])];
        const p0 = mkPage({ map: mapOf(B0()) }).wire().rebuild(); p0.tsState.els.size.focus(); const escNone = p0.dom.fire(p0.tsState.els.size, 'keydown', keyEv({ key: 'Escape' }));
        check('keyboard (into the bar and back): Alt+F10 in a box goes into its bar (the first control); Tab and Shift+Tab move along the bar and wrap round, never out of it; a control pressed from the keyboard keeps the focus — so B and then a colour need no going back — and acts on the box\'s remembered selection; Escape (and Enter in the Size list) goes back to the box with its selection as it was; with the tray open Tab reaches the symbols, and a symbol typed from there leaves the tray open and the focus on it; with no box to go back to Escape is left alone',
            J(in1) === J([true, true, true, false]) && t1.defaultPrevented && on1 && on2 && wrap && wrap2 && J(kept) === J([true, J({ spans: [{ s: 0, e: 3, b: true, i: true, u: true }, { s: 4, e: 8, b: true }] }), '[4,8]']) && J(kept2) === J([true, J({ spans: [{ s: 0, e: 3, b: true, i: true, u: true }, { s: 4, e: 8, color: GREEN, b: true }] })])
            && J(backTo) === J([true, true, '[4,8]']) && ent.defaultPrevented && entBack && order === 17 + SYMS.length && inTray && J(sym) === J(['The → Road', true, true, '[5,5]']) && escNone.defaultPrevented === false, [in1, on1, on2, wrap, wrap2, kept, kept2, backTo, entBack, order, inTray, sym]);

        // what it names, as text
        const names = [], say = d => { pk.focus(pk.tsBox(d), 0); names.push(K.root.attrs['aria-label'].replace('Text style — ', '')); };
        [{ idx: 1, k: 'cell', ri: 1, ci: 2 }, { idx: 1, k: 'col', ci: 1 }, { idx: 0, k: 'sub' }, { idx: 1, k: 'sub' }, { idx: 1, k: 'must' }, { idx: 3, k: 'caption' }, { idx: 5, k: 'title' }, { idx: 1, k: 'title' }, { idx: 6, k: 'title' }, { idx: 2, k: 'node', ni: 1 }, { idx: 2, k: 'edge', ei: 0 }].forEach(say);
        pk.map.blocks[2].nodes[1].id = '<img src=x onerror=alert(1)>'; pk.map.blocks[1].cols[2] = '<script>alert(1)</script> and a very long column name indeed';
        say({ idx: 2, k: 'node', ni: 1 }); say({ idx: 1, k: 'cell', ri: 1, ci: 2 });
        check('bar: it names the field it is on, in a few words, as a plain string (its name for a screen reader) — a hostile node id or column name is only ever text in it, and cut short',
            J(names) === J(['Row 2, Cost', 'Heading of column 2', 'Subtitle', 'Tag', 'Must resolve', 'Caption', 'Section heading', 'Scene title', 'Table title', 'Node n3’s label', 'Arrow 1’s label', 'Node <img src=x onerror=alert(1)>’s label', 'Row 2, <script>alert(1)</script> and…']), names);

        // a rebuilt editor; another document; a field that is gone
        const p2 = mkPage({ map: mapOf(B0()) }).wire().rebuild(), E2 = p2.tsState.els, c2 = () => p2.tsBox({ idx: 1, k: 'cell', ri: 0, ci: 0 });
        p2.focus(c2(), 0, 3); p2.click(E2.swatches[4]);   // "Med" green, in row 1
        p2.map.blocks[1].rows.splice(0, 1); p2.rebuild();   // the row's delete button: the row goes, renderPlanner writes every box anew and ends with tsRebuilt
        p2.log.length = 0; const j2 = J(p2.map), pressed2 = p2.tsPress({ color: RED }); p2.click(E2.swatches[2]); p2.click(E2.b);
        const reb = [E2.root.hidden, p2.tsState.box, p2.tsState.sel, pressed2, J(p2.map) === j2, p2.log.length, 'fmt' in p2.map.blocks[1].rows[0], [E2.b, E2.i, E2.custom, E2.nocolor, E2.size, E2.clear].concat(E2.swatches).every(c => c.disabled === true)];
        p2.focus(c2(), 0, 3); p2.click(E2.swatches[2]);
        check('rebuild: after the editor is rebuilt (a row deleted above the place the bar was on) the bar is hidden, is on no box and remembers nothing — a press styles no other text; a box clicked in afterwards takes the bar afresh and is styled as ever',
            J(reb) === J([true, null, null, false, true, 0, false, true]) && J(p2.map.blocks[1].rows[0].fmt) === J({ col1: { spans: [{ s: 0, e: 3, color: RED }] } }) && p2.map.blocks[1].rows[0].col1 === 'Insight' && E2.root.hidden === false, [reb, p2.map.blocks[1].rows[0]]);
        p2.focus(c2(), 0, 3); p2.dom.page.active = null; p2.map = { id: 'other', type: 'planner', blocks: B0() }; p2.log.length = 0;   // another document is the open one (the app rebuilds the editor then; should a place be remembered all the same, it is this document's and no other's)
        const otherDoc = p2.tsPress({ b: true }), jo = J(p2.map.blocks[1]);
        p2.map = mapOf(B0()); p2.rebuild(); p2.focus(c2(), 0, 3); p2.map.blocks.splice(1, 1);
        let threw = null; try { p2.tsPress({ b: true }); p2.tsRefresh(); p2.tsBack(); } catch (e) { threw = e.message; }
        check('bar: nothing is remembered across documents, and a box whose field is gone is no target (no error, no change)', otherDoc === false && jo === J(B0()[1]) && threw === null && p2.log.length === 0, threw);
        check('rebuild (wired): renderPlanner ends by forgetting — after the boxes are written and the preview drawn — whatever document it drew', /\n\s*renderPlannerPreview\(\);\s*\n\s*applyPlannerFullscreen\(\);\s*\n\s*tsRebuilt\(\);[^\n]*\n\s*\}/.test(plannerSrc) && /function tsRebuilt\(\) \{ tsHide\(\); \}/.test(barSrc));

        // Esc puts the bar away while its box keeps the focus
        const pa = mkPage({ map: mapOf(B0()) }).wire().rebuild(), A = pa.tsState.els, ta = pa.tsBox({ idx: 0, k: 'title' });
        pa.focus(ta, 4, 8); const esc1 = pa.dom.fire(ta, 'keydown', keyEv({ key: 'Escape' })), putAway = [A.root.hidden, pa.dom.page.active === ta, pa.tsState.box === ta, J(pa.range(ta))];
        pa.dom.fire(ta, 'keydown', keyEv({ key: 'b', ctrlKey: true })); pa.engine.caret(ta, 13); pa.engine.type(ta, '!'); pa.dom.fire(ta, 'focusout', {}); pa.dom.runTimers(); const still = [A.root.hidden, J(pa.map.blocks[0].fmt), pa.map.blocks[0].title];
        pa.dom.fire(ta.firstChild, 'mousedown'); const back1 = A.root.hidden; pa.dom.fire(ta, 'keydown', keyEv({ key: 'Escape' })); pa.dom.fire(ta, 'keydown', keyEv({ key: 'F10', altKey: true })); const back2 = [A.root.hidden, pa.dom.page.active === A.b];
        pa.dom.fire(A.b, 'keydown', keyEv({ key: 'Escape' })); pa.dom.fire(ta, 'keydown', keyEv({ key: 'Escape' })); pa.focus(pa.tsBox({ idx: 0, k: 'sub' }), 0); const other = A.root.hidden;
        check('bar (Esc): the bar floats over whatever is right above its box, so Escape in the box puts it away — the box keeps the focus and its selection, Ctrl+B and typing still work, and it stays away while that box is in use; a click in the box brings it back, and so does Alt+F10 (into it); another box entered takes the bar as ever',
            esc1.stopped && J(putAway) === J([true, true, true, '[4,8]']) && J(still) === J([true, J({ title: { spans: [{ s: 4, e: 8, b: true }] } }), 'The Hill Road!']) && back1 === false && J(back2) === '[false,true]' && other === false, [putAway, still, back1, back2, other]);

        // the cap is said
        const pc = mkPage({ map: mapOf([{ id: 'b', type: 'h2', title: 'x'.repeat(900) }]) }).wire(), many = []; for (let k = 0; k < 199; k++) many.push({ s: k * 2, e: k * 2 + 1, b: true });
        pc.map.blocks[0].fmt = { title: { spans: many } }; pc.rebuild(); pc.focus(pc.tsBox({ idx: 0, k: 'title' }), 600, 601); pc.tsPress({ i: true });
        check('bar: a field at its ' + MAX_SPANS + ' styled parts says so', pc.map.blocks[0].fmt.title.spans.length === 200 && pc.toasts.length === 1 && /200/.test(pc.toasts[0]));
        check('bar (wired): the boxes are wired once, on the element that holds them — the engine\'s edits before and after, a composition\'s start and end, paste, copy, cut, drop, the keys — and the page\'s part: Ctrl+B / I / U seen in the capture phase, the focus followed in and out, the selection as it moves, the panel\'s scroll and the window\'s size; a box\'s keys are stopped after the undo chord has had them',
            ['beforeinput', 'input', 'compositionstart', 'compositionend', 'paste', 'copy', 'cut', 'drop', 'dragstart', 'keydown'].every(ev => new RegExp("root\\.addEventListener\\('" + ev + "', ts[A-Za-z]+\\);").test(barSrc)) && /document\.addEventListener\('keydown', tsKey, true\);/.test(barSrc) && /document\.addEventListener\('focusin', /.test(barSrc) && /document\.addEventListener\('focusout', /.test(barSrc)
            && /document\.addEventListener\('selectionchange', /.test(barSrc) && /host\.addEventListener\('scroll', tsPlace, true\);/.test(barSrc) && /window\.addEventListener\('resize', tsPlace\);/.test(barSrc) && /if \(fieldUndoChord\(e\)\) return;\n\s*e\.stopPropagation\(\);/.test(barSrc)
            && !/sessionStorage|wp_textStyleOpen|textStyleBar|textStyleToggle|textStyleBody/.test(plannerSrc));
    }

    /* ---- what an input did for free: Tab, the sideways scroll; a large planner ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }).wire().rebuild(), D = pg.dom, title = pg.tsBox({ idx: 0, k: 'title' }), sub = pg.tsBox({ idx: 0, k: 'sub' }), lab = pg.tsBox({ idx: 2, k: 'node', ni: 0 });
        pg.focus(title, 3); D.fire(title, 'keydown', keyEv({ key: 'Tab' })); sub.focus(); const tabbed = [J(pg.range(sub)), J([pg.tsState.sel.s, pg.tsState.sel.e]), pg.tsState.box === sub, pg.tsState.els.scope.textContent];
        D.fire(sub, 'keydown', keyEv({ key: 'Tab' })); lab.focus(); const intoLabel = J([pg.tsState.sel.s, pg.tsState.sel.e]);
        D.fire(lab, 'keydown', keyEv({ key: 'Tab', shiftKey: true })); D.fire(pg.blocksEl, 'mousedown'); title.focus(); D.engine.caret(title, 5); const byMouse = J(pg.range(title));
        D.fire(title, 'keydown', keyEv({ key: 'x' })); sub.focus(); const noTab = J(pg.tsState.sel && [pg.tsState.sel.s, pg.tsState.sel.e]), before = J(pg.map);
        check('box (Tab): a one-line box reached by the Tab key has all its text selected, as an input has — typing replaces it, and the bar acts on those characters; a label, like the textarea it replaces, is not selected; a box entered by the mouse, or given the focus by anything but Tab, keeps the caret it is given; nothing is written by going from box to box',
            J(tabbed) === J(['[0,10]', '[0,10]', true, '10 selected']) && intoLabel !== J([0, LBL.length]) && byMouse === '[5,5]' && noTab === '[10,10]' && J(pg.map) === before && pg.log.length === 0, [tabbed, intoLabel, byMouse, noTab]);
        const long = pg.tsBox({ idx: 1, k: 'cell', ri: 1, ci: 2 }); long.scrollLeft = 80; pg.focus(long, 6); pg.click(pg.tsState.els.b); const kept = long.scrollLeft; long.scrollLeft = 55; D.fire(long, 'focusout', {});
        check('box (sideways scroll): a one-line box scrolled sideways to its caret stays where it is when the box is drawn again (a press), and shows its start again when it is left, as an input does', kept === 80 && long.scrollLeft === 0);
        // a large planner: a 40-row, 6-column table and a 30-node chart
        const cols = ['A', 'B', 'C', 'D', 'E', 'F'], rows = Array.from({ length: 40 }, (x, r) => { const o = { fmt: {} }; cols.forEach((c, k) => { o['col' + (k + 1)] = 'row ' + r + ' cell ' + k + ' with some words in it'; if ((r + k) % 3 === 0) o.fmt['col' + (k + 1)] = { spans: [{ s: 0, e: 3, b: true }, { s: 4, e: 6, color: GREEN }] }; }); return o; });
        const big = mkPage({ map: mapOf([{ id: 'h', type: 'h1', title: 'Big', sub: 's' }, { id: 't', type: 'node', mode: 'table', title: 'T', cols, rows }, { id: 'c', type: 'flowchart', nodes: Array.from({ length: 30 }, (x, k) => ({ id: 'n' + k, text: 'node ' + k + '\nsecond line', fmt: k % 2 ? { color: RED, spans: [{ s: 0, e: 4, size: 'large' }] } : undefined })), edges: Array.from({ length: 29 }, (x, k) => ({ from: 'n' + k, to: 'n' + (k + 1), text: 'to ' + k })) }]) }).wire();
        const t0 = Date.now(); big.rebuild(); const built = Date.now() - t0, boxes = big.blocksEl.querySelectorAll('.ts-box');
        const cell = big.tsBox({ idx: 1, k: 'cell', ri: 20, ci: 3 }), others = boxes.filter(b => b !== cell).map(b => b.childNodes.slice());
        big.focus(cell, 10); const t1 = Date.now(); for (let k = 0; k < 200; k++) big.engine.type(cell, 'x'); const typed = Date.now() - t1;
        big.engine.caret(cell, 0, 5); big.click(big.tsState.els.swatches[2]); big.click(big.tsState.els.b);
        const untouched = boxes.filter(b => b !== cell).every((b, i) => b.childNodes.length === others[i].length && b.childNodes.every((c, k) => c === others[i][k]));
        check('box (a large planner: a 40-row, 6-column table and a 30-node chart, ' + boxes.length + ' boxes): the editor is built and 200 characters are typed into a cell in the middle well inside a second each, and ONLY the box being edited is ever drawn again — after the typing and two presses every other box still holds the very nodes it was built with',
            boxes.length === 2 + 1 + 6 + 240 + 30 + 29 && built < 1500 && typed < 1500 && untouched && big.map.blocks[1].rows[20].col4.length === 'row 20 cell 3 with some words in it'.length + 200 && J(big.map.blocks[1].rows[20].fmt.col4) === J({ spans: [{ s: 0, e: 5, color: RED, b: true }] }), { boxes: boxes.length, built, typed, untouched });
    }

    /* ---- structure: every format stays on its own text (a seeded sequence of edits against a plain model) ---- */
    {
        const pg = mkPage({ map: mapOf([]) }), R = rng(4242);
        // every text carries its own name; its format's colour is worked out from that name — so a format on the wrong text shows
        let serial = 0; const fresh = p => p + (serial++);
        const colourOf = name => { let h = 7; for (let k = 0; k < name.length; k++) h = (h * 31 + name.charCodeAt(k)) >>> 0; return '#' + ('000000' + (h & 0xffffff).toString(16)).slice(-6); };
        const lookOf = name => ({ color: colourOf(name), spans: [{ s: 0, e: 1, b: true }] });
        const styled = () => R() < 0.7;
        const mkTable = () => { const b = { id: fresh('b'), type: 'node', title: fresh('T'), cols: [], rows: [] }; const n = 2 + Math.floor(R() * 3); for (let c = 0; c < n; c++) b.cols.push(fresh('H')); for (let r = 0; r < 3; r++) { const row = {}; for (let c = 0; c < n; c++) row['col' + (c + 1)] = fresh('C'); b.rows.push(row); } return b; };
        const mkChart = () => ({ id: fresh('b'), type: 'flowchart', nodes: [0, 1, 2].map(() => ({ id: fresh('n'), text: fresh('N'), shape: 'rect', color: 'neutral' })), edges: [0, 1].map(() => ({ from: 'a', to: 'b', text: fresh('E'), style: 'solid' })) });
        const blocks = pg.map.blocks; blocks.push({ id: 'h', type: 'h1', title: fresh('T'), sub: fresh('S') }, mkTable(), mkChart(), mkTable(), mkChart());
        // every field there is, by descriptor
        const fields = () => { const out = []; blocks.forEach((b, idx) => {
            if (b.type === 'h1') out.push({ idx, k: 'title' }, { idx, k: 'sub' });
            if (b.type === 'node') { out.push({ idx, k: 'title' }); pg.tsCols(b).forEach((c, ci) => out.push({ idx, k: 'col', ci })); b.rows.forEach((r, ri) => { for (let ci = 0; ci < 8; ci++) if (typeof r['col' + (ci + 1)] === 'string') out.push({ idx, k: 'cell', ri, ci }); }); }
            if (b.type === 'flowchart') { b.nodes.forEach((n, ni) => out.push({ idx, k: 'node', ni })); b.edges.forEach((e, ei) => out.push({ idx, k: 'edge', ei })); }
        }); return out; };
        const nameOf = t => { const m = /^[A-Za-z]+\d+/.exec(t); return m ? m[0] : ''; };
        const styleSome = () => fields().forEach(d => { const f = pg.tsField(blocks, d); if (!f) return; const nm = nameOf(f.text()); if (nm && f.fmt() === undefined && styled()) f.setFmt(lookOf(nm)); });
        // the invariant: wherever a format is, it is the one made for the text beside it
        const wrong = () => { let bad = null, seen = 0;
            const judge = (text, fmt, where) => { if (fmt === undefined || fmt === null) return; seen++; const c = TF.cleanFmt(fmt, text); if (!nameOf(text) || !c || c.color !== colourOf(nameOf(text))) bad = { where, text, fmt }; };
            blocks.forEach((b, idx) => {
                if (b.fmt) Object.keys(b.fmt).forEach(k => judge(b[k], b.fmt[k], idx + '.' + k));
                if (b.colFmt) { if (!Array.isArray(b.cols) || b.colFmt.length > b.cols.length || !b.colFmt[b.colFmt.length - 1]) bad = { where: idx + '.colFmt shape', colFmt: b.colFmt, cols: b.cols }; b.colFmt.forEach((f, ci) => judge(b.cols[ci], f, idx + '.col' + ci)); }
                (b.rows || []).forEach((r, ri) => { if (r.fmt) Object.keys(r.fmt).forEach(k => judge(r[k], r.fmt[k], idx + '.row' + ri + '.' + k)); });
                (b.nodes || []).forEach((n, ni) => judge(n.text, n.fmt, idx + '.node' + ni)); (b.edges || []).forEach((e, ei) => judge(e.text, e.fmt, idx + '.edge' + ei));
            }); return bad; };
        styleSome();
        let bad = wrong(), steps = 0; const done = {};
        const pick = list => list[Math.floor(R() * list.length)];
        for (; steps < 600 && !bad; steps++) {
            const idx = Math.floor(R() * blocks.length), b = blocks[idx], op = Math.floor(R() * 12); let name = '';
            // each case does to the blocks exactly what the editor's handler does (the handlers are pinned below)
            if (op === 0 && b && b.type === 'node') { b.rows.push({}); name = 'add row'; }
            else if (op === 1 && b && b.type === 'node' && b.rows.length) { b.rows.splice(Math.floor(R() * b.rows.length), 1); name = 'delete row'; }
            else if (op === 2 && b && b.type === 'node') { pg.tsSetColCount(b, 1 + Math.floor(R() * 8)); name = 'column count'; }
            else if (op === 3 && b && b.type === 'flowchart') { b.nodes.push({ id: 'n' + (b.nodes.length + 1), text: 'Node', shape: 'rect', color: 'neutral' }); name = 'add node'; }
            else if (op === 4 && b && b.type === 'flowchart' && b.nodes.length) { b.nodes.splice(Math.floor(R() * b.nodes.length), 1); name = 'delete node'; }
            else if (op === 5 && b && b.type === 'flowchart') { b.edges.push({ from: '', to: '', text: '', style: 'solid' }); name = 'add arrow'; }
            else if (op === 6 && b && b.type === 'flowchart' && b.edges.length) { b.edges.splice(Math.floor(R() * b.edges.length), 1); name = 'delete arrow'; }
            else if (op === 7 && idx > 0) { const t = blocks[idx]; blocks[idx] = blocks[idx - 1]; blocks[idx - 1] = t; name = 'move up'; }
            else if (op === 8 && idx < blocks.length - 1) { const t = blocks[idx]; blocks[idx] = blocks[idx + 1]; blocks[idx + 1] = t; name = 'move down'; }
            else if (op === 9 && blocks.length > 3) { blocks.splice(idx, 1); name = 'delete block'; }
            else if (op === 10) { blocks.push(R() < 0.5 ? mkTable() : mkChart()); name = 'add block'; }
            else if (op === 11) { const d = pick(fields()); if (d) { const f = pg.tsField(blocks, d), t = f.text(); if (nameOf(t)) { pg.tsType(blocks, d, t + 'x', t.length + 1); name = 'type'; } else if (!t && R() < 0.5) { const nn = fresh('Z'); pg.tsType(blocks, d, nn, nn.length); name = 'type new'; } } }
            if (!name) continue;
            done[name] = (done[name] || 0) + 1;
            if (R() < 0.3) styleSome();
            bad = wrong(); if (bad) bad.after = name;
        }
        check('structure (seeded, ' + steps + ' edits): rows, columns, nodes, arrows and blocks added, deleted and moved, the column count changed, text typed — each format is still on its own text, and colFmt stays a list beside cols',
            !bad && steps === 600 && ['add row', 'delete row', 'column count', 'add node', 'delete node', 'add arrow', 'delete arrow', 'move up', 'move down', 'delete block', 'add block', 'type'].every(k => done[k] > 5), bad || done);
        check('structure (wired): the editor\'s handlers do exactly those list operations — a row, a node and an arrow are spliced or pushed as objects, blocks swap as objects, the Columns select goes through tsSetColCount',
            /activeMap\.blocks\[this\.dataset\.idx\]\.rows\.push\(\{\}\); save\(true\)/.test(plannerSrc) && /activeMap\.blocks\[this\.dataset\.idx\]\.rows\.splice\(this\.dataset\.ri, 1\); save\(true\)/.test(plannerSrc)
            && /\.nodes\.splice\(this\.dataset\.ni, 1\); save\(true\)/.test(plannerSrc) && /\.edges\.splice\(this\.dataset\.ei, 1\); save\(true\)/.test(plannerSrc) && /\.nodes\.push\(\{id: 'n'\+/.test(plannerSrc) && /\.edges\.push\(\{from: '', to: '', text: '', style: 'solid'\}\)/.test(plannerSrc)
            && /var t=activeMap\.blocks\[i\]; activeMap\.blocks\[i\]=activeMap\.blocks\[i-1\]; activeMap\.blocks\[i-1\]=t;/.test(plannerSrc) && /var t=activeMap\.blocks\[i\]; activeMap\.blocks\[i\]=activeMap\.blocks\[i\+1\]; activeMap\.blocks\[i\+1\]=t;/.test(plannerSrc)
            && /activeMap\.blocks\.splice\(this\.dataset\.idx, 1\); save\(true\)/.test(plannerSrc) && /tsSetColCount\(bb, n\);/.test(plannerSrc));
        const t = { type: 'node', cols: ['A', 'B', 'C', 'D'], colFmt: [{ b: true }, null, null, { i: true }], rows: [{ col1: 'a', col4: 'd', fmt: { col4: { b: true } } }] };
        pg.tsSetColCount(t, 2); const cut = J([t.cols, t.colFmt, t.rows]);
        pg.tsSetColCount(t, 5);
        check('structure: fewer columns cut the heads and their formats together (a cell past the last column keeps its text and its look, as before); more columns add plain heads',
            cut === J([['A', 'B'], [{ b: true }], [{ col1: 'a', col4: 'd', fmt: { col4: { b: true } } }]]) && J(t.cols) === J(['A', 'B', 'Column 3', 'Column 4', 'Column 5']) && J(t.colFmt) === J([{ b: true }]));
        const p = { type: 'table', cols: ['A', 'B'], rows: [['x', 'y'], { col1: 'kept', fmt: { col1: { b: true } } }, ['z']], rowFmt: [[null, { i: true }], null, [{ color: RED }]] };
        const ch = pg.tsRowsAsObjects(p), again = pg.tsRowsAsObjects(p);
        check('structure: a page\'s table that came in with its rows as lists (a file, another table) is put the way the editor reads it — rows as { col1, … }, each cell\'s format on its row — once',
            ch === true && again === false && J(p.rows) === J([{ col1: 'x', col2: 'y', fmt: { col2: { i: true } } }, { col1: 'kept', fmt: { col1: { b: true } } }, { col1: 'z', fmt: { col1: { color: RED } } }]) && !('rowFmt' in p)
            && /if \(b && typeof b === 'object' && \(b\.type === 'node' \|\| b\.type === 'table'\)\) tsRowsAsObjects\(b\);/.test(plannerSrc), p);
    }


    /* ================= Find across runs, the floating panel's highlight, the text blocks' own bar ================= */
    {
        /* ---- Find in the preview: a found text may lie across the runs of a styled word (planner.js, sliced and run on a tree of plain objects) ---- */
        function TN(v) { this.nodeType = 3; this.nodeValue = v; this.parentNode = null; }
        function EN(tag, cls, kids) { this.nodeType = 1; this.nodeName = tag === 'svg' ? 'svg' : tag.toUpperCase(); this.className = cls || ''; this.childNodes = []; this.parentNode = null; this.cls = {}; this.scrolled = 0; (kids || []).forEach(k => this.appendChild(typeof k === 'string' ? new TN(k) : k)); }
        const sib = function() { const l = this.parentNode ? this.parentNode.childNodes : [], i = l.indexOf(this); return i >= 0 && i + 1 < l.length ? l[i + 1] : null; };
        Object.defineProperty(TN.prototype, 'nextSibling', { get: sib }); Object.defineProperty(EN.prototype, 'nextSibling', { get: sib });
        Object.defineProperty(EN.prototype, 'firstChild', { get() { return this.childNodes[0] || null; } });
        Object.defineProperty(EN.prototype, 'classList', { get() { const el = this; return { add: c => { el.cls[c] = 1; }, remove: c => { delete el.cls[c]; }, contains: c => !!el.cls[c], toggle: (c, on) => { if (on) el.cls[c] = 1; else delete el.cls[c]; return !!on; } }; } });
        const detach = n => { if (n.parentNode) { const l = n.parentNode.childNodes; l.splice(l.indexOf(n), 1); n.parentNode = null; } };
        EN.prototype.appendChild = function(c) { detach(c); c.parentNode = this; this.childNodes.push(c); return c; };
        EN.prototype.insertBefore = function(c, ref) { detach(c); c.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, c); return c; };
        EN.prototype.removeChild = function(c) { detach(c); return c; };
        EN.prototype.normalize = function() { for (let i = 0; i < this.childNodes.length; i++) { const n = this.childNodes[i]; if (n.nodeType !== 3) continue; if (!n.nodeValue) { this.childNodes.splice(i--, 1); continue; } const nx = this.childNodes[i + 1]; if (nx && nx.nodeType === 3) { n.nodeValue += nx.nodeValue; this.childNodes.splice(i + 1, 1); i--; } } this.childNodes.forEach(n => { if (n.nodeType === 1) n.normalize(); }); };
        EN.prototype.scrollIntoView = function() { this.scrolled++; };
        EN.prototype.querySelectorAll = function(sel) { if (sel !== 'mark.pf-hit' && sel !== 'mark.docpanel-hit') throw new Error('selector not understood by the test tree: ' + sel); const cls = sel.slice(5), out = []; (function walk(el) { el.childNodes.slice().forEach(n => { if (n.nodeType !== 1) return; if (n.nodeName === 'MARK' && n.className === cls) out.push(n); walk(n); }); })(this); return out; };
        TN.prototype.splitText = function(at) { const rest = new TN(this.nodeValue.slice(at)); this.nodeValue = this.nodeValue.slice(0, at); const l = this.parentNode.childNodes; l.splice(l.indexOf(this) + 1, 0, rest); rest.parentNode = this.parentNode; return rest; };
        const shape = n => n.nodeType === 3 ? n.nodeValue : '<' + n.nodeName.toLowerCase() + (n.className ? '.' + n.className : '') + (n.cls['pf-cur'] ? '!' : '') + '>' + n.childNodes.map(shape).join('') + '</>';
        const textOf = n => n.nodeType === 3 ? n.nodeValue : n.childNodes.map(textOf).join('');
        const mkFind = pv => { const box = { value: '' }, cnt = { textContent: '' };
            const api = new Function('document', slice('planner.js', 'find') + '\nreturn { pfState, pfClear, pfStretches, plannerFindApply, pfGo };')({ getElementById: id => ({ plannerPreview: pv, plannerFind: box, plannerFindCount: cnt })[id] || null, createElement: tag => new EN(tag) });
            return Object.assign(api, { cnt, find: q => { box.value = q; api.plannerFindApply(false); return api.pfState.hits; } }); };
        const hitsText = hits => hits.map(h => h.map(textOf));
        {
            const td = new EN('td', '', [new EN('span', '', ['Med']), 'icine']), pv = new EN('div', '', [new EN('table', '', [new EN('tr', '', [td, new EN('td', '', ['10'])])])]), F = mkFind(pv);
            const h = F.find('medicine'), s1 = shape(td), c1 = F.cnt.textContent, t1 = J(hitsText(h)), sc = h.length ? h[0][0].scrolled : 0;
            const h2 = F.find('med'), s2 = shape(td);
            F.find(''); const s3 = shape(td);
            check('find: a word styled in part (drawn as two runs) is found whole — one hit, a mark around its part of each text node, both lit as the current hit; a part of it is found as before; clearing puts the tree back as it was',
                h.length === 1 && t1 === '[["Med","icine"]]' && c1 === '1 / 1' && s1 === '<td><span><mark.pf-hit!>Med</></><mark.pf-hit!>icine</></>' && sc === 1 && h2.length === 1 && s2 === '<td><span><mark.pf-hit!>Med</></>icine</>' && s3 === '<td><span>Med</>icine</>' && F.cnt.textContent === '', [t1, s1, s2, s3]);
            const h1 = new EN('h1', '', [new EN('span', '', ['Session']), ' 1 — The Hill Road', new EN('span', 'sub', ['A one-evening adventure'])]), F2 = mkFind(new EN('div', 'wrap', [h1]));
            check('find: a phrase that crosses a run boundary is one hit; a span with a class of the renderer\'s (a subtitle) is not run on into',
                J(hitsText(F2.find('session 1'))) === '[["Session"," 1"]]' && F2.find('roada').length === 0 && F2.cnt.textContent === '0' && J(hitsText(F2.find('road'))) === '[["Road"]]' && J(hitsText(F2.find('one-evening'))) === '[["one-evening"]]');
            const pv3 = new EN('div', '', [new EN('p', '', ['ab']), new EN('p', '', ['cd']), new EN('p', '', ['x', new EN('br'), 'y']), new EN('svg', '', [new EN('text', '', ['hidden'])]), new EN('script', '', ['secret']), new EN('style', '', ['.cd{}'])]), F3 = mkFind(pv3);
            check('find: a paragraph, a cell and a line break end a stretch (nothing is found across them), and a drawn chart, a script and a style are not searched',
                F3.find('bc').length === 0 && F3.find('xy').length === 0 && F3.find('hidden').length === 0 && F3.find('secret').length === 0 && J(hitsText(F3.find('cd'))) === '[["cd"]]' && J(F3.pfStretches(pv3).map(s => s.map(n => n.nodeValue))) === '[["ab"],["cd"],["x"],["y"]]');
            const p = new EN('p', '', ['the cat and ', new EN('b', '', ['the']), ' hat']), F4 = mkFind(new EN('div', '', [p])), h4 = F4.find('the');
            F4.pfGo(1); const sGo = shape(p), cGo = F4.cnt.textContent; F4.pfGo(2);
            check('find: several hits in a stretch, each in its own node, and stepping through them — the current one alone is lit, the count follows, past the last it wraps',
                h4.length === 2 && sGo === '<p><mark.pf-hit>the</> cat and <b><mark.pf-hit!>the</></> hat</>' && cGo === '2 / 2' && F4.cnt.textContent === '1 / 2' && shape(p) === '<p><mark.pf-hit!>the</> cat and <b><mark.pf-hit>the</></> hat</>', [sGo, cGo]);
            const F5 = mkFind(new EN('div', '', [new EN('p', '', [new EN('span', '', ['Sé']), 'lkath elder']), new EN('p', '', ['The ', new EN('span', '', ['Hi']), 'll road'])]));
            check('find: accents and word starts work over the joined text — "selk" finds "Sélk" across its runs, and with no phrase each word is found at a word start',
                J(hitsText(F5.find('selk'))) === '[["Sé","lk"]]' && J(hitsText(F5.find('road hill'))) === '[["Hi","ll"],["road"]]' && F5.find('ill').length === 1 && J(hitsText(F5.find('lkath'))) === '[["lkath"]]');
        }

        /* ---- the floating page panel's highlight: the page read in the same stretches (docpanel.js, sliced by [textcheck:panelfold] and [textcheck:panelfind], run on the same tree of plain objects) ---- */
        {
            const shapeP = n => n.nodeType === 3 ? n.nodeValue : '<' + n.nodeName.toLowerCase() + (n.className ? '.' + n.className : '') + (n.cls.cur ? '!' : '') + '>' + n.childNodes.map(shapeP).join('') + '</>';
            const panelSrc = read('docpanel.js');
            const mkPanel = body => { const cnt = { textContent: '' }, page = { body }; let api = null, err = null;
                try {
                    api = new Function('ui', 'document', 'var query = "", hits = [], curHit = -1;\n' + slice('docpanel.js', 'panelfold') + '\n' + slice('docpanel.js', 'panelfind')
                        + '\nreturn { highlightBody: highlightBody, clearMarks: clearMarks, step: step, hlStretches: hlStretches, hits: function() { return hits; }, cur: function() { return curHit; }, setQuery: function(q) { query = q; } };')(id => ({ docPanelBody: page.body, docPanelFindCount: cnt })[id] || null, { createElement: tag => new EN(tag) });
                } catch (e) { err = e; }
                return { err, cnt, page, api, find: q => { if (!api) return []; api.setQuery(q); api.highlightBody(q); return api.hits(); }, step: d => api && api.step(d), clear: () => api && api.clearMarks(), stretches: r => api ? api.hlStretches(r) : [] }; };
            const td = new EN('td', '', [new EN('span', '', ['Me']), new EN('span', '', ['di']), 'cine']), P = mkPanel(new EN('div', '', [new EN('table', '', [new EN('tr', '', [td, new EN('td', '', ['10'])])])]));
            const h = P.find('medicine'), s1 = shapeP(td), c1 = P.cnt.textContent, t1 = J(hitsText(h)), sc = h.length ? h[0][0].scrolled : -1;
            const h2 = P.find('med'), s2 = shapeP(td), t2 = J(hitsText(h2));
            P.find(''); const s3 = shapeP(td), c3 = P.cnt.textContent;
            P.find('medicine'); P.clear(); const s4 = shapeP(td), left = P.api ? P.api.hits().length : -1, nodesBack = td.childNodes.length === 3 && td.childNodes[0].childNodes.length === 1 && td.childNodes[1].childNodes.length === 1 && td.childNodes[2].nodeValue === 'cine';   // the text nodes joined again: no split left behind
            check('panel highlight: a word drawn as three runs (part of it coloured) is ONE hit of three marks — one around its part of each text node, all lit as the focused hit, counted once; a part of it is found across its runs too; clearing leaves the tree as it was',
                !P.err && h.length === 1 && t1 === '[["Me","di","cine"]]' && c1 === '1/1' && s1 === '<td><span><mark.docpanel-hit!>Me</></><span><mark.docpanel-hit!>di</></><mark.docpanel-hit!>cine</></>' && sc === 0
                && h2.length === 1 && t2 === '[["Me","d"]]' && s2 === '<td><span><mark.docpanel-hit!>Me</></><span><mark.docpanel-hit!>d</>i</>cine</>' && s3 === '<td><span>Me</><span>di</>cine</>' && c3 === '' && s4 === s3 && left === 0 && nodesBack, P.err ? String(P.err) : [t1, c1, s1, t2, s2, s3, s4]);
            const h1 = new EN('h1', '', [new EN('span', '', ['Session']), ' 1 — The Hill Road', new EN('span', 'sub', ['A one-evening adventure'])]), P2 = mkPanel(new EN('div', 'wrap', [h1]));
            check('panel highlight: a phrase that crosses a run boundary is found as one hit; a span with a class of the renderer\'s (a subtitle) is not run on into; nothing found counts 0',
                !P2.err && J(hitsText(P2.find('session 1'))) === '[["Session"," 1"]]' && P2.find('roada').length === 0 && P2.cnt.textContent === '0' && J(hitsText(P2.find('road'))) === '[["Road"]]' && J(hitsText(P2.find('one-evening'))) === '[["one-evening"]]', P2.err ? String(P2.err) : shapeP(h1));
            const p = new EN('p', '', ['the cat and ', new EN('b', '', ['the']), ' hat, then']), P3 = mkPanel(new EN('div', '', [p])), h3 = P3.find('the');
            const sA = shapeP(p), cA = P3.cnt.textContent; P3.step(1); const sB = shapeP(p), cB = P3.cnt.textContent, scB = h3.length > 1 ? h3[1][0].scrolled : -1; P3.step(1); P3.step(1); const cD = P3.cnt.textContent; P3.step(-1); P3.step(-1); const cF = P3.cnt.textContent, sF = shapeP(p);
            check('panel highlight: a hit inside one text node is as before — each its own mark, the first focused without scrolling, the count "1/3"; next and previous move the focus (scrolled to), the count follows, and both wrap round',
                !P3.err && h3.length === 3 && J(hitsText(h3)) === '[["the"],["the"],["the"]]' && sA === '<p><mark.docpanel-hit!>the</> cat and <b><mark.docpanel-hit>the</></> hat, <mark.docpanel-hit>the</>n</>' && cA === '1/3'
                && sB === '<p><mark.docpanel-hit>the</> cat and <b><mark.docpanel-hit!>the</></> hat, <mark.docpanel-hit>the</>n</>' && cB === '2/3' && scB === 1 && cD === '1/3' && cF === '2/3' && sF === sB, P3.err ? String(P3.err) : [sA, cA, sB, cB, cD, cF]);
            const chart = new EN('svg', '', [new EN('style', '', ['.node rect{fill:#medicine}']), new EN('foreignObject', '', [new EN('div', '', [new EN('span', 'nodeLabel', [new EN('font', '', ['Med']), 'icine'])])])]);
            const body4 = new EN('div', '', [new EN('p', '', ['ab']), new EN('p', '', ['cd']), new EN('p', '', ['x', new EN('br'), 'y']), chart, new EN('script', '', ['medicine secret'])]), P4 = mkPanel(body4);
            check('panel highlight: a paragraph and a line break end a stretch (nothing is found across them); a drawn chart\'s label is still searched, its coloured part with the rest, but never a style sheet or a script',
                !P4.err && P4.find('bc').length === 0 && P4.find('xy').length === 0 && P4.find('secret').length === 0 && J(hitsText(P4.find('medicine'))) === '[["Med","icine"]]' && J(hitsText(P4.find('cd'))) === '[["cd"]]'
                && J(P4.stretches(body4).map(s => s.map(n => n.nodeValue))) === '[["ab"],["cd"],["x"],["y"],["Med","icine"]]', P4.err ? String(P4.err) : J(P4.stretches(body4).map(s => s.map(n => n.nodeValue))));
            const P5 = mkPanel(new EN('div', '', [new EN('p', '', [new EN('span', '', ['Sé']), 'lkath elder']), new EN('p', '', ['The ', new EN('span', '', ['Hi']), 'll road'])]));
            check('panel highlight: accents and the word rule work over the joined text — "selk" finds "Sélk" across its runs; with no phrase on the page each word is found at a word start, one of them across its runs',
                !P5.err && J(hitsText(P5.find('selk'))) === '[["Sé","lk"]]' && J(hitsText(P5.find('road hill'))) === '[["Hi","ll"],["road"]]' && P5.cnt.textContent === '1/2' && J(hitsText(P5.find('ill'))) === '[["i","ll"]]' && J(hitsText(P5.find('lkath'))) === '[["lkath"]]', P5.err ? String(P5.err) : '');
            const first = new EN('div', '', [new EN('p', '', [new EN('span', '', ['Med']), 'icine'])]), P6 = mkPanel(first);
            P6.find('medicine'); P6.step(1); const again = P6.find('medicine'), sAgain = shapeP(first);   // found again on the same page: the old marks go first
            P6.page.body = new EN('div', '', [new EN('p', '', ['No ', new EN('span', '', ['medi']), 'cine here, nor medicine there'])]);   // the page was drawn again (a live edit, a chart that finished drawing)
            const redrawn = P6.api ? (P6.api.highlightBody('medicine'), P6.api.hits()) : [];
            check('panel highlight: applied again — on the same page the old marks go first (never a mark inside a mark), on a page drawn again the hits are that page\'s — and the panel does so after a live re-render and after its charts are drawn (pinned)',
                !P6.err && again.length === 1 && sAgain === '<div><p><span><mark.docpanel-hit!>Med</></><mark.docpanel-hit!>icine</></></>' && J(hitsText(redrawn)) === '[["medi","cine"],["medicine"]]' && P6.cnt.textContent === '1/2'
                && (panelSrc.match(/if \(query\.trim\(\)\) highlightBody\(query\);/g) || []).length === 2 && /\.then\(function\(\) \{ if \(window\.wpFcPostProcess\) window\.wpFcPostProcess\(body, it\); if \(query\.trim\(\)\) highlightBody\(query\); \}\)/.test(panelSrc)
                && /function clearSearch\(\) \{ query = ''; var box = ui\('docPanelSearchInput'\); if \(box\) box\.value = ''; clearMarks\(\); renderResults\(\[\]\); updateCount\(\); \}/.test(panelSrc), P6.err ? String(P6.err) : [sAgain, J(hitsText(redrawn))]);
            check('panel highlight (the file): docpanel.js is still LF-only and keeps its three NUL separators — it is binary to git and edited byte for byte',
                (() => { const raw = fs.readFileSync(path.join(dir, 'docpanel.js')); let cr = 0, nul = 0; for (const x of raw) { if (x === 13) cr++; if (x === 0) nul++; } return cr === 0 && nul === 3; })());
        }

        /* ---- the text blocks' own bar: its colour and size controls, wired (planner.js wireRte, sliced and run on the test page) ---- */
        {
            const pg = mkPage({ map: mapOf(B0()) }), looks = [], cmds = [];
            const container = pg.mk('div', 'blocks'), rte = pg.mk('div', 'rte', { idx: '4' }), bar = pg.mk('div', 'rte-bar'), body = pg.mk('div', 'field rte-body', { idx: '4' });
            const bold = pg.mk('button', 'rte-btn', { cmd: 'bold' }), sw = pg.mk('button', 'rte-sw', { color: GREEN }), custom = pg.mk('label', 'rte-sw rte-custom'), pick = pg.mk('input', 'rte-colorpick'), nocolor = pg.mk('button', 'rte-btn rte-nocolor'), size = pg.mk('select', 'rte-size');
            container.appendChild(rte); rte.appendChild(bar); rte.appendChild(body); [bold, sw, custom, nocolor, size].forEach(c => bar.appendChild(c)); custom.appendChild(pick);
            const wireRte = new Function('getActiveMap', 'save', 'renderPlannerPreview', 'rteSyncBar', 'fieldUndoChord', 'rteLook', 'document', 'Event',
                slice('planner.js', 'rtewire') + '\nreturn wireRte;')(() => pg.map, () => {}, () => {}, () => {}, () => false, (b, change) => { looks.push([b === body, change]); return true; }, { execCommand: c => { cmds.push(c); return true; } }, function(type) { this.type = type; });
            wireRte(container);
            bar.fire('click', { target: sw }); bar.fire('click', { target: nocolor });
            const clicks = J(looks), noCmd = cmds.length;
            size.value = 'huge'; size.fire('change'); const sizeBack = size.value; size.value = 'default'; size.fire('change'); size.value = ''; size.fire('change');
            pick.value = '#123456'; pick.fire('change');
            const all = J(looks);
            bar.fire('click', { target: size }); bar.fire('click', { target: custom }); bar.fire('click', { target: pick });   // these answer by their own change events
            const md = [size, pick, sw, bold, nocolor].map(t => bar.fire('mousedown', { target: t }).prevented);
            bar.fire('click', { target: bold });
            check('text block bar (wired): a swatch, Default, the Size list and the custom colour each reach the block\'s own command with their change — a swatch its colour, Default no colour (never a command of the list\'s), a size its step (Default none, the list put back on "Size…"), the picker its colour',
                clicks === J([[true, { color: GREEN }], [true, { color: null }]]) && noCmd === 0 && sizeBack === '' && all === J([[true, { color: GREEN }], [true, { color: null }], [true, { size: 'huge' }], [true, { size: null }], [true, { color: '#123456' }]]) && looks.length === 5, all);
            check('text block bar (wired): the Size list and the colour picker may take the focus (their mousedown is not swallowed, so they can open); a button\'s is, so the box keeps its selection; B is still the browser\'s own command',
                J(md) === '[false,false,true,true,true]' && J(cmds) === '["bold"]' && looks.length === 5, [md, cmds]);
        }
    }


    /* ================= said: Help, the tour, the integration guide, the page ================= */
    {
        const rootDir = path.join(__dirname, '..'), rd = f => fs.readFileSync(path.join(rootDir, f), 'utf8').replace(/\r\n/g, '\n');
        const ix = rd('system/app/index.html'), tu = rd('system/app/scripts/tutorial.js'), ci = rd('CAMPAIGN_INTEGRATION.md'), css = rd('system/app/style.css'), yml = rd('.github/workflows/checks.yml');
        const pane = name => { const a = ix.indexOf('<div class="help-pane" data-pane="' + name + '"'), b = ix.indexOf('<div class="help-pane"', a + 10); return a < 0 ? '' : ix.slice(a, b < 0 ? undefined : b); };
        const hp = pane('planners'), words = s => s.replace(/<[^>]+>/g, '').replace(/&mdash;/g, '\u2014').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
        check('said (Help, Planners): a Text style section — every plain box is an editor that shows its styling, the bar appears on the box you click into and goes when you leave it; select then click (B, I, U, S, a colour); nothing selected is the whole field and the bar says which; a size on the selection or the whole field; the Link box, a link not followed in the editor, and why a flowchart label takes none; Clear; the text blocks\' own bar; a Markdown file keeps the style',
            /<h4>Text style<\/h4>/.test(hp) && ['Every plain box in the editor is a small editor of its own', 'The box shows its styling', 'when you click into one a bar appears on it, with the controls a text block has', 'The bar goes away when you leave the box; while it is up it floats over whatever is right above the box, so Esc puts it away and a click in the box brings it back.', 'Select, then click.', 'so you can click green and then bold without selecting again', 'Ctrl + B', 'U (underline), S (strike through) or a colour', 'Ctrl + B, Ctrl + I and Ctrl + U do the same from the keyboard', 'Nothing selected is the whole field.', 'then select the lines you have finished and pick green', 'The end of the bar says which it will be: Whole field, or how many characters are selected.',
                'works the same way: on the characters you selected, or on the whole field with nothing selected', 'Default on a selection takes the size off that part', 'the list reads Mixed when what you selected holds more than one size', 'Link turns text into a link to a web page.', 'type the address in the bar\'s Link box and press Enter', 'one typed without that start (example.com/page, or with a port, example.com:8080) is taken as https://', 'anything else is refused and nothing changes',
                'Select linked text and the box shows its address; empty the box and press Enter to take the link off', 'In the editor a linked part looks like a link but is not followed: put the caret in it and the Link box says where it leads.', 'a click on the link opens it in the web browser, as a link in a text block does', 'What you type at the end of a link is not part of the link.', 'A flowchart label cannot hold a link', 'so the Link box is greyed out there; everything else works in a label as anywhere', 'Clear takes the styling off the selection, or off the whole field when nothing is selected',
                'have the same controls on the bar fixed above their box, and lists as well', 'Save Markdown keeps text style and an import brings it back'].every(w => words(hp).indexOf(w) >= 0), words(hp).slice(words(hp).indexOf('Text style'), words(hp).indexOf('Text style') + 400));
        check('said (Help, Planners): typing — what joins a styled part, a typed tag is its characters, paste is plain text, the symbol tray, Enter; undo — in a box Ctrl+Z is the planner\'s own, in steps, each with its text, styling and selection; the keyboard — Tab from box to box, Alt+F10 into the bar, a control keeps the focus, the Size list stepped through is one undo step, Esc or Enter goes back; the Handbook pane says how Markdown carries text style',
            ['What you type right after a styled part joins it, as in a word processor; typed right before it, or on a new line you start with Enter, it does not.', 'A tag you type, such as', ', is just those characters in the box.', 'Paste brings in plain text only (in a one-line box each line break becomes a space)', 'tray types a symbol at the caret', 'Enter starts a new line in a flowchart node\'s label and does nothing in a one-line box.',
                'In one of these boxes Ctrl + Z and Ctrl + Y (or Ctrl + Shift + Z) are the planner\'s own undo and redo.', 'A run of typing is one step', 'a pause, moving the caret, or switching between typing and deleting starts a new one', 'a paste, a line break and a symbol are a step each, and so is each click of the bar', 'Every step comes back with its text, its styling and its selection.',
                'From the keyboard: Tab goes from box to box. Alt + F10 goes from a box into its bar, and Tab moves along it.', 'A control you press there keeps the focus', 'step through the Size list with the arrow keys (that whole run of sizes is one undo step)', 'or Enter in the Size list', 'takes you back to the box, its selection as you left it; in the Link box Esc also drops what you typed there.',
                'In a title, a table cell, a caption or a label it is always the planner\'s history, which keeps your typing in steps'].every(w => words(hp).indexOf(w) >= 0) && /such as <code>&lt;b&gt;<\/code>, is just those characters in the box/.test(hp)
            && ['Text style travels too. Save Markdown writes bold and italic as ** and *, strike-through as ~~, underline as', 'a link as [text](https://', 'and a colour or a size as a small tag around the text', 'around the whole field or around just the part that has it', 'an import reads all of those back, and you can write them by hand', 'A file with none of this in it comes in exactly as before.'].every(w => words(pane('handbook')).indexOf(w) >= 0), words(hp).slice(words(hp).indexOf('Typing.'), words(hp).indexOf('Typing.') + 900));
        const hh = ix.slice(ix.indexOf('<h4>What a page is</h4>'), ix.indexOf('<h4>Players can read / GM only</h4>'));
        check('said (Help, Handbook): editing a page names the bar that appears on the box and that players see a styled page as the GM does; nothing anywhere still speaks of a Text style bar at the top of the editor',
            /Click into a title, a table cell or a flowchart label and <b>a bar appears on the box<\/b> that colours, bolds, italicises, underlines, strikes through, sizes and links its text just as in a planner/.test(hh) && /Players see a styled page exactly as you do\./.test(hh)
            && !/Text style<\/b> bar|bar at the top of the editor|closed until you click its|click its <b>&#9656;<\/b>/.test(ix + tu) && words(hp).indexOf('is always the whole field') < 0 && tu.indexOf('size is always the whole field') < 0);
        const stepOf = title => { const a = tu.indexOf("title: '" + title + "'"); return a < 0 ? '' : tu.slice(a, tu.indexOf('before:', a)); };
        check('said (the tour): the planner step and the Handbook step both name the bar that appears on the box you click into (no step was added, and no step points at a bar at the top: the editors\' own steps cover it)',
            /Click into a title, a table cell or a flowchart label and <b>a bar appears on the box<\/b> &mdash; bold, italic, underline, strike-through, the colours, a size, a link and symbols: select characters and click a style, or click with nothing selected to style the whole field \(a link is a web address typed into the bar&rsquo;s <b>Link<\/b> box; a flowchart label cannot hold one\)/.test(stepOf('Writing a planner'))
            && /The box shows the styling as you type, and the text blocks have the same controls on their own bar\./.test(stepOf('Writing a planner')) && /<kbd>Ctrl<\/kbd>\+<kbd>Z<\/kbd> in a title, a cell or a label takes back your typing a step at a time through the same history/.test(stepOf('Writing a planner'))
            && /The same bar on the box you click into styles a page&rsquo;s titles, table cells and flowchart labels &mdash; colour, size, underline, strike-through, and a link in a title or a cell &mdash; and players see them as you do\./.test(stepOf('Handbook')) && !/textStyle|tsBar/.test(tu));
        check('said (the integration guide): the keys and where each is stored, with the cleaner\'s own numbers and steps',
            ci.indexOf('**Text style (1.5.0):**') > 0 && ci.indexOf('"size": "' + SIZES.join('|') + '"') > 0 && SIZES.every(k => ci.indexOf(k + ' ' + SIZE_EM[k].replace('em', '')) > 0) && Object.keys(SIZE_EM).map(k => SIZE_EM[k]).every(v => ci.indexOf(v) > 0)
            && ci.indexOf('at most ' + MAX_SPANS + ' a field') > 0 && ci.indexOf('only the first ' + MAX_RAW + ' entries of a list are read') > 0 && ['"fmt": { "title": …, "sub": …, "tag": …, "must": …, "caption": … }', '`"colFmt"`, a list parallel to `cols`', '"fmt": { "col1": …, "col2": … }', '`"rowFmt"`, a list of lists parallel to `rows`', 'a strict `#rrggbb`', '<span style="color:#rrggbb">', '**Text style in Markdown:** an export carries it and an import reads it back', '"b": true, "i": true, "u": true, "st": true, "link": "https://…", "spans": [{ "s": 0, "e": 8, "size": "large", "color": "#5cb87a", "b": true, "i": true, "u": true, "st": true, "link": "https://…" }]', '`st` struck through (a span\'s `s` is its start)', '`b` / `i` / `u` / `st` only `true`', '`link` a web address by the very rule the page sanitiser has for an `a href`', 'it begins `http://` or `https://` (in any case) with something after it, holds no white space and no control character', 'at most ' + MAX_LINK.toLocaleString('en-US') + ' characters', 'a `size` or a `link` that every character of the field has is stored as the field\'s own', 'a size is never drawn inside a size', 'a flowchart label\'s format keeps no `link`'].every(w => ci.indexOf(w) > 0));
        check('the page: the bar at the top of the editor is gone from index.html (no #textStyleBar, no toggle, no body) — the editor panel holds the boxes alone and the one bar is built by the script inside it; the style sheet styles the box as the input it replaces (one line, clipped; a label wraps; the placeholder while it is empty) and floats the bar without shifting anything',
            !/textStyleBar|textStyleToggle|textStyleBody|ts-toggle|ts-caret/.test(ix + css + tu) && /<div id="plannerEditorWrap"[^>]*>\n\s*<div id="plannerBlocks"><\/div>/.test(ix)
            && /\.ts-box \{[^}]*white-space: pre;[^}]*overflow: hidden;[^}]*\}/.test(css) && /\.ts-box\.ts-multi \{ white-space: pre-wrap;/.test(css) && /\.ts-box:empty::before \{ content: attr\(data-placeholder\);/.test(css) && /\.ts-box:focus \{ border-color: var\(--gold\); \}/.test(css)
            && /\.ts-bar \{ position: fixed;/.test(css) && /\.ts-bar\[hidden\] \{ display: none; \}/.test(css) && !/\.ts-bar \{ position: sticky/.test(css) && /\.ts-box \.tsr-link \{ color: var\(--blue\); \}/.test(css));
        check('CI runs this suite', /run: node tools\/textcheck\.js/.test(yml));
        const DRX = await import(modUrl('docrender.js'));
        check('the console\'s list names the new module and the renderer\'s new calls, as the code publishes them', /wpTextFmt: 'Text formats, pure \(scripts\/textfmt\.js\)/.test(rd('system/app/scripts/devconsole.js')) && /cleanFmt\(fmt, text\), cleanLink\(address\), runsOf\(text, fmt\)/.test(rd('system/app/scripts/devconsole.js')) && /MAX_SPANS, MAX_LINK\. No DOM\./.test(rd('system/app/scripts/devconsole.js')) && /fmtHtml\(text, fmt, put\), fmtRich\(text, fmt\), cleanBlockFmts\(block\), labelFmt\(fmt, text\), sanitizeBare\(html\)/.test(rd('system/app/scripts/devconsole.js')) && /htmlToMarkdown, fmtFromInline\(html\), flowchartFromMermaid/.test(rd('system/app/scripts/devconsole.js')) && typeof DRX.fmtRich === 'function' && typeof DRX.sanitizeBare === 'function' && typeof DRX.labelFmt === 'function' && ['cleanFmt', 'cleanLink', 'runsOf', 'respan', 'apply', 'clear', 'stateAt', 'SIZES', 'SIZE_EM', 'PALETTE', 'MAX_SPANS', 'MAX_LINK'].every(k => k in TF));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
