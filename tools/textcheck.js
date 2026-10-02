/* Offline check of text formats: the styling of a plain text field, stored beside the text (system/app/scripts/textfmt.js),
   and the planner / page editor's Text style bar that writes it (planner.js, sliced by its [textcheck:...] markers and
   run for real on a page of plain objects — never copied).
   The core: every rule of cleanFmt (a seeded list of spans flattened to what painting them in order onto an array of
   characters gives — colour, bold, italic, underline, strike, a size and a link; a size and a link the field's own exactly
   when every character has that one; surrogate pairs; hostile and prototype keys; the same twice; nothing left -> undefined),
   cleanLink (the one rule for a link: the page sanitiser's rule for an <a href>, both run on one seeded corpus and asked for
   the same verdict on every address, the two statements of the rule pinned), respan (an edit
   before, inside, after; a cut; a full replacement; what is typed right after a styled part joining it — never across a line
   break — and right before it not; a seeded walk in which every character that survives keeps its look and what was typed takes
   the look of the character on its left where a span styles it),
   runsOf, apply / clear / stateAt.
   The editor: where each field's format lives, typing carrying it, the bar's presses (B, I, U, S, a colour, the Size list on a
   selection and at a caret, the Link box — Enter, leaving it, an address that is refused, off for a flowchart label — Ctrl+B /
   I / U), and a seeded sequence of structure edits against a plain model. Ctrl+Z after a press and the Size list stepped through by keyboard run io.js's own history and
   undo chord (sliced by [textcheck:history] / [textcheck:undochord]); Find in the preview (planner.js [textcheck:find]) runs on a
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

    /* ================= the editor: where a field's format lives, typing, the bar (planner.js, run for real) ================= */
    const plannerSrc = read('planner.js'), fieldsSrc = slice('planner.js', 'fields'), barSrc = slice('planner.js', 'bar');
    // a page of plain objects: elements that record what is done to them
    function El(tag, cls, data) { this.tagName = String(tag).toUpperCase(); this.className = cls || ''; this.dataset = data || {}; this.style = {}; this.children = []; this.handlers = {}; this.attrs = {}; this.disabled = false; this.hidden = false; this.value = ''; this.textContent = ''; this.parent = null; this.id = ''; this.calls = []; }
    Object.defineProperty(El.prototype, 'classList', { get() { const el = this, list = () => el.className.split(/\s+/).filter(Boolean); return { contains: c => list().indexOf(c) >= 0, add: c => { if (list().indexOf(c) < 0) el.className = list().concat(c).join(' '); }, remove: c => { el.className = list().filter(x => x !== c).join(' '); }, toggle: (c, on) => { const has = list().indexOf(c) >= 0, want = on === undefined ? !has : !!on; if (want && !has) el.className = list().concat(c).join(' '); if (!want && has) el.className = list().filter(x => x !== c).join(' '); return want; } }; } });
    El.prototype.appendChild = function(c) { c.parent = this; this.children.push(c); return c; };
    El.prototype.addEventListener = function(ev, fn) { (this.handlers[ev] = this.handlers[ev] || []).push(fn); };
    El.prototype.fire = function(ev, extra) { const e = Object.assign({ type: ev, target: this, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, extra || {}); (this.handlers[ev] || []).forEach(fn => fn.call(this, e)); return e; };
    El.prototype.setAttribute = function(k, v) { this.attrs[k] = String(v); };
    El.prototype.getAttribute = function(k) { return k in this.attrs ? this.attrs[k] : null; };
    El.prototype.all = function() { let out = []; this.children.forEach(c => { out.push(c); out = out.concat(c.all()); }); return out; };
    El.prototype.is = function(sel) {   // '.cls', '#id', 'tag', each with [data-x="v"] parts; a comma list is any of them
        return sel.split(',').some(one => { one = one.trim(); const m = /^([a-zA-Z]*)((?:[.#][\w-]+)*)((?:\[data-[\w-]+(?:="[^"]*")?\])*)$/.exec(one); if (!m) throw new Error('selector not understood by the test page: ' + one);
            if (m[1] && this.tagName !== m[1].toUpperCase()) return false;
            if (!(m[2].match(/[.#][\w-]+/g) || []).every(p => p[0] === '#' ? this.id === p.slice(1) : this.classList.contains(p.slice(1)))) return false;
            return (m[3].match(/\[data-([\w-]+)(?:="([^"]*)")?\]/g) || []).every(p => { const k = /\[data-([\w-]+)(?:="([^"]*)")?\]/.exec(p); return k[2] === undefined ? this.dataset[k[1]] !== undefined : String(this.dataset[k[1]]) === k[2]; }); });   // [data-x] alone: the attribute is there
    };
    El.prototype.matches = El.prototype.is;
    El.prototype.closest = function(sel) { for (let n = this; n; n = n.parent) if (n.is(sel)) return n; return null; };
    El.prototype.querySelector = function(sel) { return this.all().find(n => n.is(sel)) || null; };
    El.prototype.querySelectorAll = function(sel) { return this.all().filter(n => n.is(sel)); };
    Object.defineProperty(El.prototype, 'parentNode', { get() { return this.parent; } });
    El.prototype.dispatchEvent = function(e) { this.calls.push('dispatch ' + e.type); return true; };
    El.prototype.focus = function() { this.calls.push('focus'); this.page.active = this; };
    El.prototype.setSelectionRange = function(s, e) { this.calls.push('select ' + s + '-' + e); this.selectionStart = s; this.selectionEnd = e; };
    El.prototype.contains = function(n) { for (; n; n = n.parent) if (n === this) return true; return false; };

    function mkPage(opts) {
        opts = opts || {};
        const page = { active: null, log: [], toasts: [], store: Object.assign({}, opts.store || {}), sel: { rangeCount: 0, isCollapsed: true }, rte: [], storeThrows: !!opts.storeThrows };
        const mk = (tag, cls, data, id) => { const el = new El(tag, cls, data); el.page = page; if (id) el.id = id; return el; };
        page.mk = mk;
        const blocksEl = mk('div', '', {}, 'plannerBlocks'), root = mk('div', 'ts-bar', {}, 'textStyleBar'), toggle = mk('button', 'ts-toggle', {}, 'textStyleToggle'), body = mk('div', 'ts-body', {}, 'textStyleBody');
        body.hidden = true; root.appendChild(toggle); root.appendChild(body);
        const byId = { plannerBlocks: blocksEl, textStyleBar: root, textStyleToggle: toggle, textStyleBody: body };
        const doc = { createElement: tag => mk(tag), getElementById: id => byId[id] || null };
        Object.defineProperty(doc, 'activeElement', { get: () => page.active });
        page.map = opts.map || { id: 'p1', type: 'planner', meta: { title: 'P' }, blocks: [] };
        const deps = {
            TF, document: doc, window: { getSelection: () => page.sel }, sessionStorage: { getItem: k => { if (page.storeThrows) throw new Error('no storage here'); return k in page.store ? page.store[k] : null; }, setItem: (k, v) => { if (page.storeThrows) throw new Error('no storage here'); page.store[k] = String(v); } },
            getActiveMap: () => page.map, isDocLike: m => !!m && (m.type === 'planner' || m.type === 'doc'),
            // page.hist (when a check sets it): io.js's own history, so a save is its pass and a step boundary its own (save(true) is doSave: the pass, then nothing pending)
            save: im => { page.log.push('save:' + im); if (page.hist) { page.hist.pushHistory(); page.hist.pending(false); } }, renderPlannerPreview: () => { page.log.push('preview'); },
            stepBoundary: () => { page.log.push('step'); if (page.hist) page.hist.stepBoundary(); }, stepFold: () => { page.log.push('fold'); if (page.hist) page.hist.stepFold(); }, toast: m => { page.toasts.push(m); },
            rteLook: (b, change) => { page.rte.push([b.dataset.idx, change]); return true; }
        };
        const names = Object.keys(deps);
        const api = new Function(...names, fieldsSrc + '\n' + barSrc + '\nreturn { tsDesc, tsField, tsType, tsName, tsSetColCount, tsRowsAsObjects, tsCols, TS_PLAIN, tsState, tsBox, tsNote, tsTarget, tsPress, tsRebuilt, tsBack, tsRefresh, tsBuild, tsKey };')(...names.map(k => deps[k]));
        Object.assign(page, api, { blocksEl, root, toggle, body });
        // an editor box for a field, as renderPlanner writes it (its classes and data attributes)
        page.box = (cls, data, tag) => { const el = mk(tag || 'input', cls, Object.assign({}, data)); Object.keys(el.dataset).forEach(k => { el.dataset[k] = String(el.dataset[k]); }); el.selectionStart = 0; el.selectionEnd = 0; blocksEl.appendChild(el); return el; };
        page.sel0 = (el, s, e) => { el.selectionStart = s; el.selectionEnd = e === undefined ? s : e; page.active = el; page.tsNote(el); };
        page.btn = k => page.tsState.els[k];
        page.click = el => page.body.fire('click', { target: el });
        page.build = () => { page.tsBuild(root); return page; };
        return page;
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
        const boxes = [['b-title', { idx: 1 }, { idx: 1, k: 'title' }], ['field b-sub', { idx: 1 }, { idx: 1, k: 'sub' }], ['b-must', { idx: 1 }, { idx: 1, k: 'must' }], ['b-caption', { idx: 3 }, { idx: 3, k: 'caption' }], ['b-colhead', { idx: 1, ci: 2 }, { idx: 1, k: 'col', ci: 2 }], ['r-col', { idx: 1, ri: 1, ci: 0 }, { idx: 1, k: 'cell', ri: 1, ci: 0 }], ['field fc-n-text fc-grow', { idx: 2, ni: 1 }, { idx: 2, k: 'node', ni: 1 }], ['fc-e-text', { idx: 2, ei: 0 }, { idx: 2, k: 'edge', ei: 0 }]];
        check('storage: each editor box names its field by its place (tsDesc), and the bar finds the box again by it (tsBox); a box that holds no plain field names none',
            boxes.every(x => { const el = pg.box(x[0], x[1]); return J(pg.tsDesc(el)) === J(x[2]) && pg.tsBox(x[2]) === el; }) && pg.tsDesc(pg.box('fc-n-id', { idx: 2, ni: 0 })) === null && pg.tsDesc(pg.box('field b-content', { idx: 4 }, 'textarea')) === null && pg.tsDesc(pg.box('b-title', {})) === null
            && pg.TS_PLAIN.split(',').length === 8 && boxes.every(x => pg.box(x[0], x[1]).matches(pg.TS_PLAIN)));
    }

    /* ---- typing carries the spans ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }), bl = pg.map.blocks, n1 = bl[2].nodes[0], d = { idx: 2, k: 'node', ni: 0 };
        n1.fmt = { color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] };   // walk dog
        pg.tsType(bl, d, '- ' + LBL, 2);                       // at the start
        const a1 = J(n1.fmt), t1 = n1.text;
        pg.tsType(bl, d, t1.slice(0, 15) + 's' + t1.slice(15), 16);   // in the middle of the span ("walks dog")
        const a2 = J(n1.fmt), t2 = n1.text;
        pg.tsType(bl, d, t2 + '\nfeed cat', t2.length + 9);   // at the end
        check('typing: an edit at the start, in the middle and at the end of a label carries its spans (respan on every input)',
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
        {   // the browser's own undo and redo in a plain field (an 'input' of type historyUndo / historyRedo) put a text back with the look it had
            const bold4 = J({ spans: [{ s: 0, e: 4, b: true }] });
            const mkU = (text, fmt) => { const p = mkPage({ map: mapOf(B0()) }), b = p.map.blocks, e = b[2].edges[0]; e.text = text; if (fmt) e.fmt = fmt; return { p, b, e, d: { idx: 2, k: 'edge', ei: 0 }, type(v, c, it) { p.tsType(b, this.d, v, c, it); return J(e.fmt); } }; };
            const u1 = mkU('then go', { spans: [{ s: 0, e: 4, b: true }] });
            const cut = u1.type('then', 4, 'deleteContentForward'), undone = u1.type('then go', 7, 'historyUndo');   // " go" selected and deleted, then Ctrl+Z
            const typed = u1.type('thens go', 5, 'insertText'), undone2 = u1.type('then go', 4, 'historyUndo'), redone = u1.type('thens go', 5, 'historyRedo');
            check('typing (the browser\'s undo and redo, through tsType to the stored format): text a Ctrl+Z brings back right after a styled part comes back as it was, not styled — and a letter typed after the part, undone and redone, ends on the grown part',
                cut === bold4 && undone === bold4 && typed === J({ spans: [{ s: 0, e: 5, b: true }] }) && undone2 === bold4 && redone === J({ spans: [{ s: 0, e: 5, b: true }] }) && u1.e.text === 'thens go', [cut, undone, typed, undone2, redone]);
            // the same text twice with two looks: undo looks back from where the field stands, redo forward
            const u2 = mkU('then go', { spans: [{ s: 0, e: 4, b: true }] });
            u2.type('then', 4, 'deleteContentForward'); const retyped = u2.type('then go', 7, 'insertText');   // " go" typed again after the bold part: it joins
            const b1 = u2.type('then', 4, 'historyUndo'), b2 = u2.type('then go', 7, 'historyUndo'), f1 = u2.type('then', 4, 'historyRedo'), f2 = u2.type('then go', 7, 'historyRedo');
            check('typing (undo and redo): a text the field has held twice with two looks comes back with the look of that time — undo looks back from where the field stands, redo forward',
                retyped === J({ spans: [{ s: 0, e: 7, b: true }] }) && b1 === bold4 && b2 === bold4 && f1 === bold4 && f2 === J({ spans: [{ s: 0, e: 7, b: true }] }), [retyped, b1, b2, f1, f2]);
            // a styled part typed over and brought back; what is typed after an undo drops what the undo took back
            const u3 = mkU('then go', { color: RED, spans: [{ s: 5, e: 7, color: GREEN, i: true }] });
            const over = u3.type('x', 1, 'insertText'), restored = u3.type('then go', 7, 'historyUndo');
            const u4 = mkU('ab', { spans: [{ s: 0, e: 2, b: true }] });
            u4.type('abc', 3, 'insertText'); u4.type('ab', 2, 'historyUndo'); u4.type('abZ', 3, 'insertText'); const noRedo = u4.type('abc', 3, 'historyRedo');   // "abc" is no longer ahead: carried, nothing joins
            check('typing (undo and redo): a styled part typed over comes back styled when the browser puts its text back, the field\'s own look with it; what is typed after an undo drops what the undo took back',
                over === J({ color: RED }) && restored === J({ color: RED, spans: [{ s: 5, e: 7, color: GREEN, i: true }] }) && noRedo === J({ spans: [{ s: 0, e: 2, b: true }] }), [over, restored, noRedo]);
            // a press of the bar between two edits: the look after the press is the one that comes back
            const u5 = mkU('then go', { spans: [{ s: 0, e: 4, b: true }] });
            u5.type('then go!', 8, 'insertText'); u5.e.fmt = { spans: [{ s: 0, e: 4, b: true }, { s: 5, e: 8, color: RED }] };   // as a press of Red on "go!" stores it
            const afterPress = u5.type('then go!x', 9, 'insertText'), toPress = u5.type('then go!', 8, 'historyUndo');
            check('typing (undo and redo): after a press of the bar an undo of what was typed since comes back to the look the press gave, not the one before it',
                afterPress === J({ spans: [{ s: 0, e: 4, b: true }, { s: 5, e: 9, color: RED }] }) && toPress === J({ spans: [{ s: 0, e: 4, b: true }, { s: 5, e: 8, color: RED }] }), [afterPress, toPress]);
            // nothing remembered: a rebuilt editor, a text the field never held, a field never styled
            const u6 = mkU('then go', { spans: [{ s: 0, e: 4, b: true }, { s: 5, e: 7, color: RED }] });
            u6.type('then', 4, 'deleteContentForward'); u6.p.tsRebuilt(); const forgot = u6.type('then go', 7, 'historyUndo');
            const u7 = mkU('then', { spans: [{ s: 0, e: 4, b: true }] }), unknown = u7.type('then go', 7, 'historyUndo'), asTyping = mkU('then', { spans: [{ s: 0, e: 4, b: true }] }).type('then go', 7, 'insertText');
            const u8 = mkU('then go'); u8.type('then', 4, 'deleteContentForward'); u8.type('then go', 7, 'historyUndo');
            const u9 = mkU('then go', { spans: [{ s: 0, e: 4, b: true }] }), cell = { idx: 1, k: 'cell', ri: 0, ci: 0 };
            u9.type('then', 4, 'deleteContentForward'); u9.p.tsType(u9.b, cell, 'then go', 7, 'historyUndo');   // another field given the same text: it takes nothing from the label's list
            check('typing (undo and redo): nothing is remembered across a rebuild of the editor (a place is an index), and a text the field is not known to have held has its spans carried with nothing joined — never read as typing; a field never styled gets no format and another field takes nothing from this one\'s list',
                forgot === bold4 && unknown === bold4 && asTyping === J({ spans: [{ s: 0, e: 7, b: true }] }) && !('fmt' in u8.e) && u8.e.text === 'then go' && !('fmt' in u9.b[1].rows[0]) && u9.b[1].rows[0].col1 === 'then go' && J(u9.e.fmt) === bold4, [forgot, unknown, asTyping, u8.e, u9.b[1].rows[0]]);
            // the list is bounded
            const u10 = mkU('a b.', { spans: [{ s: 0, e: 1, b: true }, { s: 2, e: 3, color: RED }] }); let tx = 'a b.';
            for (let k = 0; k < 130; k++) { if (k === 10) u10.e.fmt = { spans: [{ s: 0, e: 1, b: true }] }; tx += ' x'; u10.type(tx, tx.length, 'insertText'); }   // the red taken off on the way, as a press of Default would
            const gone = u10.type('q', 1, 'insertText'), late = u10.type(tx, tx.length, 'historyUndo'), early = u10.type('a b. x', 6, 'historyUndo');
            check('typing (undo and redo): a field remembers its last 100 texts — one within them comes back as it was (a part typed over is styled again), one from before them is carried from the field as it stands, never given a look from a list without end',
                gone === undefined && late === J({ spans: [{ s: 0, e: 1, b: true }] }) && early === J({ spans: [{ s: 0, e: 1, b: true }] }) && u10.e.text === 'a b. x', [gone, late, early]);
        }
        pg.tsType(bl, { idx: 1, k: 'cell', ri: 0, ci: 0 }, 'Medicine!', 9); pg.tsType(bl, { idx: 6, k: 'col', ci: 0 }, 'Things', 6);
        check('typing: a field with no format gets none (no key appears), a head typed for the first time makes the heads the block\'s own, as before',
            bl[1].rows[0].col1 === 'Medicine!' && !('fmt' in bl[1].rows[0]) && J(bl[6].cols) === J(['Things', 'Detail', 'Notes']) && !('colFmt' in bl[6]) && pg.tsType(bl, { idx: 9, k: 'title' }, 'x', 1) === false);
        bl[1].rows[1].fmt = { col3: { spans: [{ s: 2, e: 6, i: true }] } };
        pg.tsType(bl, { idx: 1, k: 'cell', ri: 1, ci: 2 }, '', 0);
        check('typing: emptying a field leaves no spans behind', !('fmt' in bl[1].rows[1]) && bl[1].rows[1].col3 === '');
        const handlers = ['b-title', 'b-caption', 'b-sub', 'b-must', 'r-col', 'fc-n-text', 'fc-e-text'].every(c => new RegExp("querySelectorAll\\('\\." + c + "'\\)\\)\\.forEach\\(el => el\\.addEventListener\\('input', function\\(e\\) \\{ tsType\\(activeMap\\.blocks, tsDesc\\(this\\), this\\.value, this\\.selectionStart, e\\.inputType\\);").test(plannerSrc));
        check('typing (wired): every plain box\'s input handler goes through tsType with the box\'s caret and the input\'s own type (so the browser\'s undo and redo are told from typing) — a title, a caption, a subtitle or tag, must-resolve, a cell, a node\'s label, an arrow\'s — and a head too; a rebuild of the editor forgets every field\'s texts',
            handlers && /querySelectorAll\('\.b-colhead'\)\)\.forEach\(el => el\.addEventListener\('input', function\(e\) \{\n\s*tsType\(activeMap\.blocks, tsDesc\(this\), this\.value, this\.selectionStart, e\.inputType\);/.test(plannerSrc)
            && (plannerSrc.match(/tsType\(activeMap\.blocks, tsDesc\(this\), this\.value, this\.selectionStart, e\.inputType\)/g) || []).length === 8 && !/this\.selectionStart\);/.test(plannerSrc) && /function tsRebuilt\(\) \{ tsState\.sel = null; tsState\.run = null; tsForget\(\); tsRefresh\(\); \}/.test(plannerSrc)
            && !/\.(title|caption|must|text) = this\.value/.test(plannerSrc) && !/\['col' \+ \(parseInt\(this\.dataset\.ci, 10\) \+ 1\)\] = this\.value/.test(plannerSrc));
    }

    /* ---- the bar ---- */
    {
        const pg = mkPage({ map: mapOf(B0()) }).build(), E = pg.tsState.els;
        check('bar: closed by default — the controls are hidden until the caret is clicked; open is remembered for the session, never in the document',
            pg.body.hidden === true && pg.toggle.attrs['aria-expanded'] === 'false' && (() => { const before = J(pg.map); pg.toggle.fire('click'); const open = pg.body.hidden === false && pg.toggle.attrs['aria-expanded'] === 'true' && pg.store.wp_textStyleOpen === '1' && pg.root.classList.contains('open'); pg.toggle.fire('click'); return open && pg.body.hidden === true && pg.store.wp_textStyleOpen === '0' && J(pg.map) === before && pg.log.length === 0; })()
            && mkPage({ store: { wp_textStyleOpen: '1' } }).build().body.hidden === false && mkPage({ store: { wp_textStyleOpen: 'yes' } }).build().body.hidden === true
            && (() => { const pt = mkPage({ storeThrows: true }).build(), closed = pt.body.hidden === true; pt.toggle.fire('click'); return closed && pt.body.hidden === false; })());   // a session store that cannot be read: closed, and it still opens
        check('bar: its controls are B, I, U, S, the seven inks, a custom colour, Default, the size steps, a link box and Clear — built as elements with text and values only',
            E.u.textContent === 'U' && E.u.dataset.ts === 'u' && E.u.tagName === 'BUTTON' && E.s.textContent === 'S' && E.s.dataset.ts === 'st' && E.link.tagName === 'INPUT' && E.link.type === 'text' && E.link.parent === E.linkLab && E.linkLab.textContent === 'Link ' && /^Link — a web address/.test(E.linkLab.title)
            && E.sizeMixed.value === 'mixed' && E.sizeMixed.disabled === true && E.sizeMixed.hidden === true &&
            E.b.textContent === 'B' && E.i.textContent === 'I' && J(E.swatches.map(s => s.dataset.color)) === J(PALETTE.map(p => p[0])) && E.swatches.every((s, k) => s.title === PALETTE[k][1] && s.style.background === PALETTE[k][0]) && E.custom.type === 'color'
            && E.nocolor.textContent === 'Default' && J(E.size.children.map(o => [o.value, o.textContent])) === J([['', 'Default'], ['small', 'Small'], ['large', 'Large'], ['larger', 'Larger'], ['huge', 'Huge'], ['mixed', 'Mixed']]) && E.clear.textContent === 'Clear'
            && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(barSrc) && !/\bon[a-z]+\s*=\s*["']/.test(barSrc));
        check('bar: with no field clicked every control is disabled and the bar says to click in one first',
            [E.b, E.i, E.u, E.s, E.custom, E.nocolor, E.size, E.link, E.clear].concat(E.swatches).every(c => c.disabled === true) && /^Click in a title, a label or a table cell/.test(E.target.textContent));
        const before = J(pg.map); pg.click(E.b); pg.click(E.swatches[2]); E.size.value = 'large'; E.size.fire('change'); E.custom.value = '#123456'; E.custom.fire('change'); pg.click(E.u); pg.click(E.s); E.link.value = 'https://a.example/'; E.link.fire('change'); pg.body.fire('keydown', { target: E.link, key: 'Enter' });
        check('bar: a press with nothing to act on changes nothing and saves nothing (and a click on a disabled control is not a press)', J(pg.map) === before && pg.log.length === 0);

        // a selection in an input: the heading
        const title = pg.box('field b-title', { idx: 0 }); title.value = 'The Hill Road';
        pg.sel0(title, 4, 8);
        const named = E.target.textContent, lit0 = E.b.classList.contains('on');
        const md = pg.body.fire('mousedown', { target: E.b });
        pg.click(E.b);
        check('bar: a selection in an input — B makes those characters bold, in one save, with the selection left where it was',
            named === 'Title — 4 selected characters' && lit0 === false && md.prevented === true && J(pg.map.blocks[0].fmt) === J({ title: { spans: [{ s: 4, e: 8, b: true }] } }) && J(pg.log) === J(['step', 'save:true', 'preview'])
            && title.selectionStart === 4 && title.selectionEnd === 8 && title.calls.indexOf('select 4-8') >= 0 && pg.active === title && E.b.classList.contains('on') === true && pg.map.blocks[0].title === 'The Hill Road', [named, pg.log, pg.map.blocks[0].fmt]);
        pg.log.length = 0; pg.click(E.b);
        check('bar: B again on a selection that is all bold takes it off — one more step, and no key left behind', !('fmt' in pg.map.blocks[0]) && J(pg.log) === J(['step', 'save:true', 'preview']) && E.b.classList.contains('on') === false);

        // the request's own case, in a textarea: all red, then two items green, the selection kept across two presses
        const lab = pg.box('field fc-n-text fc-grow', { idx: 2, ni: 0 }, 'textarea'); lab.value = LBL;
        pg.sel0(lab, 5); pg.log.length = 0;
        const whole = E.target.textContent;
        pg.click(E.swatches[2]);
        const n1 = pg.map.blocks[2].nodes[0], s1 = J(n1.fmt), l1 = J(pg.log);
        pg.sel0(lab, 9, 17); pg.log.length = 0;
        pg.click(E.swatches[4]);
        const s2 = J(n1.fmt), keep = [lab.selectionStart, lab.selectionEnd];
        pg.active = null;   // the focus went elsewhere (the preview was clicked): the bar still knows the field and its selection
        pg.click(E.b);
        check('bar: with nothing selected a colour is the whole field\'s; a selection then takes its own; a second press needs no second selecting ("select, green, bold")',
            whole === 'Node n1’s label — the whole field' && s1 === J({ color: RED }) && l1 === J(['step', 'save:true', 'preview']) && s2 === J({ color: RED, spans: [{ s: 9, e: 17, color: GREEN }] }) && J(keep) === '[9,17]'
            && J(n1.fmt) === J({ color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] }) && pg.active === lab && lab.selectionStart === 9 && lab.selectionEnd === 17 && lab.calls.indexOf('focus') >= 0 && lab.calls.filter(c => c === 'select 9-17').length === 2 && n1.text === LBL
            && E.swatches[4].classList.contains('active') && !E.swatches[2].classList.contains('active') && E.b.classList.contains('on'), [whole, s1, s2, n1.fmt]);
        pg.log.length = 0; pg.click(E.swatches[4]);
        check('bar: a press that changes nothing is no step (the same colour again)', pg.log.length === 0 && J(n1.fmt) === J({ color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] }));

        // size: the selected characters, through a control that must take the focus
        pg.sel0(lab, 9, 17); pg.log.length = 0;
        const mdS = pg.body.fire('mousedown', { target: E.size });
        pg.active = E.size; E.size.value = 'large'; E.size.fire('change');
        const sized = J(n1.fmt), back = pg.active === lab && lab.selectionStart === 9 && lab.selectionEnd === 17, sizeShown = E.size.value;
        E.size.value = ''; E.size.fire('change');
        check('bar: with characters selected the Size list sizes those characters; the size list may take the focus (its mousedown is not swallowed) and the selection comes back; Default on the selection takes the size off that part',
            mdS.prevented === false && sized === J({ color: RED, spans: [{ s: 9, e: 17, size: 'large', color: GREEN, b: true }] }) && back && sizeShown === 'large' && J(n1.fmt) === J({ color: RED, spans: [{ s: 9, e: 17, color: GREEN, b: true }] }) && J(pg.log) === J(['step', 'save:true', 'preview', 'step', 'save:true', 'preview']), [sized, pg.log]);
        const mdC = pg.body.fire('mousedown', { target: E.custom }); pg.active = E.custom; E.custom.value = '#ABCDEF'; pg.log.length = 0; E.custom.fire('change');
        check('bar: a custom colour is one press when the picker closes (a strict colour, lower case), on the selection that was there', mdC.prevented === false && J(n1.fmt.spans) === J([{ s: 9, e: 17, color: '#abcdef', b: true }]) && J(pg.log) === J(['step', 'save:true', 'preview']) && E.customWrap.classList.contains('active'));
        pg.sel0(lab, 9, 13); pg.click(E.nocolor);
        check('bar: Default on a selection gives it back the default colour and leaves the rest', J(n1.fmt) === J({ spans: [{ s: 0, e: 9, color: RED }, { s: 9, e: 13, b: true }, { s: 13, e: 17, color: '#abcdef', b: true }, { s: 17, e: 26, color: RED }] }), n1.fmt);
        pg.sel0(lab, 13, 20); pg.log.length = 0; pg.click(E.clear);
        const part = J(n1.fmt);
        pg.sel0(lab, 3); pg.click(E.clear);
        check('bar: Clear on a selection makes that part plain; with nothing selected it takes everything off the field — then Clear has nothing to do and is disabled',
            part === J({ spans: [{ s: 0, e: 9, color: RED }, { s: 9, e: 13, b: true }, { s: 20, e: 26, color: RED }] }) && !('fmt' in n1) && J(pg.log) === J(['step', 'save:true', 'preview', 'step', 'save:true', 'preview']) && E.clear.disabled === true && E.b.disabled === false);


        /* ---- U and S, the Size list on a selection and at a caret, the link box (the owner, 2026-10-02) ---- */
        {
            const pu = mkPage({ map: mapOf(B0()) }).build(), U = pu.tsState.els, tu = pu.box('field b-title', { idx: 0 }); tu.value = 'The Hill Road';
            const md0 = [pu.body.fire('mousedown', { target: U.u }).prevented, pu.body.fire('mousedown', { target: U.s }).prevented];
            pu.sel0(tu, 4, 8);
            pu.click(U.u); const u1 = J(pu.map.blocks[0].fmt), lit1 = U.u.classList.contains('on') && !U.s.classList.contains('on');
            pu.click(U.s); const u2 = J(pu.map.blocks[0].fmt), lit2 = U.s.classList.contains('on'), kept2 = tu.selectionStart === 4 && tu.selectionEnd === 8 && pu.active === tu;
            pu.click(U.u); const u3 = J(pu.map.blocks[0].fmt);
            pu.sel0(tu, 2); pu.click(U.s); const u4 = J(pu.map.blocks[0].fmt); pu.click(U.s);
            check('bar: U and S — a selection is underlined or struck through, each press one step with the selection left where it was and the button lit; again on a range that is all underlined takes it off; with nothing selected the whole field',
                J(md0) === '[true,true]' && u1 === J({ title: { spans: [{ s: 4, e: 8, u: true }] } }) && lit1 && u2 === J({ title: { spans: [{ s: 4, e: 8, u: true, st: true }] } }) && lit2 && kept2 && u3 === J({ title: { spans: [{ s: 4, e: 8, st: true }] } })
                && u4 === J({ title: { st: true } }) && !('fmt' in pu.map.blocks[0]) && pu.log.length === 15 && J(pu.log.slice(0, 3)) === J(['step', 'save:true', 'preview']) && pu.map.blocks[0].title === 'The Hill Road', [u1, u2, u3, u4, pu.log.length]);
            const ku = { key: 'u', ctrlKey: true, target: tu, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
            pu.sel0(tu, 0, 3); pu.log.length = 0; const rk = pu.tsKey(ku), ks = pu.tsKey(Object.assign({}, ku, { key: 's', prevented: false }));
            check('keyboard: Ctrl+U in a plain box does what U does (one step, the key taken); Ctrl+S is not the bar\'s', rk === true && ku.prevented && ku.stopped && J(pu.map.blocks[0].fmt) === J({ title: { spans: [{ s: 0, e: 3, u: true }] } }) && J(pu.log) === J(['step', 'save:true', 'preview']) && ks === false);

            const ps = mkPage({ map: mapOf(B0()) }).build(), Z = ps.tsState.els, ts = ps.box('field b-title', { idx: 0 }); ts.value = 'The Hill Road';
            const pick = v => { ps.body.fire('mousedown', { target: Z.size }); ps.active = Z.size; Z.size.value = v; Z.size.fire('change'); };
            ps.sel0(ts, 4, 8); pick('large'); const z1 = J(ps.map.blocks[0].fmt), sh1 = [Z.size.value, Z.sizeMixed.hidden], keptZ = ps.active === ts && ts.selectionStart === 4 && ts.selectionEnd === 8;
            ps.sel0(ts, 2); const sh2 = [Z.size.value, Z.sizeMixed.hidden];   // a caret: the whole field, which now holds more than one size
            ps.log.length = 0; pick('mixed'); const z2 = J(ps.map.blocks[0].fmt), noStep = ps.log.length === 0;   // "Mixed" is a word the list shows, never one to pick
            ps.sel0(ts, 2); pick('huge'); const z3 = J(ps.map.blocks[0].fmt), sh3 = [Z.size.value, Z.sizeMixed.hidden];
            ps.sel0(ts, 4, 8); pick(''); const z4 = J(ps.map.blocks[0].fmt);
            ps.sel0(ts, 0, 4); const sh4 = Z.size.value; ps.sel0(ts, 4, 8); const sh5 = Z.size.value; ps.sel0(ts, 2, 6); const sh6 = Z.size.value;
            ps.sel0(ts, 9); pick('');
            check('bar (the Size list): with characters selected it sizes those characters; with nothing selected the whole field; Default on a selection takes the size off that part; it shows the size of what is selected — "Mixed" (a word it shows, never one to pick) where there is more than one',
                z1 === J({ title: { spans: [{ s: 4, e: 8, size: 'large' }] } }) && J(sh1) === J(['large', true]) && keptZ && J(sh2) === J(['mixed', false]) && z2 === z1 && noStep && z3 === J({ title: { size: 'huge' } }) && J(sh3) === J(['huge', true])
                && z4 === J({ title: { spans: [{ s: 0, e: 4, size: 'huge' }, { s: 8, e: 13, size: 'huge' }] } }) && sh4 === 'huge' && sh5 === '' && sh6 === 'mixed' && !('fmt' in ps.map.blocks[0]) && ts.selectionStart === 9, [z1, sh1, sh2, z2, z3, sh3, z4, sh4, sh5, sh6]);

            const pl = mkPage({ map: mapOf(B0()) }).build(), L = pl.tsState.els, tl = pl.box('field b-title', { idx: 0 }); tl.value = 'The Hill Road';
            // typing an address into the box: by the mouse it takes the focus; 'enter' ends with Enter, 'away' with a click somewhere else (the box loses the focus: its change, then its blur)
            const type = (v, how) => { const md = pl.body.fire('mousedown', { target: L.link }); pl.active = L.link; pl.body.fire('keydown', { target: L.link, key: v.slice(-1) || 'Backspace' }); L.link.value = v;
                if (how === 'enter') return [md, pl.body.fire('keydown', { target: L.link, key: 'Enter' })];
                pl.active = null; L.link.fire('change'); L.link.fire('blur'); return [md]; };
            pl.sel0(tl, 4, 8); pl.log.length = 0;
            const e1 = type('https://a.example/hill', 'enter');
            const l1 = J(pl.map.blocks[0].fmt), back1 = pl.active === tl && tl.selectionStart === 4 && tl.selectionEnd === 8, log1 = J(pl.log);
            L.link.fire('change'); L.link.fire('blur'); const once = J(pl.log) === log1;   // the box's own change as it loses the focus after Enter: nothing left to do
            pl.sel0(tl, 0, 3); const shown0 = [L.link.value, L.link.placeholder]; pl.sel0(tl, 5, 7); const shown1 = L.link.value; pl.sel0(tl, 2, 6); const shown2 = [L.link.value, L.link.placeholder];
            check('bar (Link): the bar\'s own address box — with characters selected, Enter gives them the link (one step) and goes back to the field with its selection as it was; the box takes the focus by the mouse (its mousedown is not swallowed); it shows the address of the link under the selection, nothing where there is none, and "several links" where there is more than one',
                e1[0].prevented === false && e1[1].prevented === true && e1[1].stopped === true && l1 === J({ title: { spans: [{ s: 4, e: 8, link: 'https://a.example/hill' }] } }) && back1 && log1 === J(['step', 'save:true', 'preview']) && once
                && J(shown0) === J(['', 'https://…']) && shown1 === 'https://a.example/hill' && J(shown2) === J(['', 'several links']) && L.link.tagName === 'INPUT' && !('innerHTML' in L.link), [l1, back1, log1, shown0, shown1, shown2]);
            pl.sel0(tl, 2); pl.log.length = 0; type('b.example/road', 'enter'); const l2 = J(pl.map.blocks[0].fmt), log2 = pl.log.length;   // nothing selected: the whole field; typed without its scheme: https://
            pl.sel0(tl, 4, 8); type('', 'enter'); const l3 = J(pl.map.blocks[0].fmt);   // an empty box takes the link off the selection
            pl.sel0(tl, 9); const callsBefore = tl.calls.length; type('  https://c.example/  ', 'away'); const l4 = J(pl.map.blocks[0].fmt), notPulled = tl.calls.slice(callsBefore).every(c => c !== 'focus' && !/^select/.test(c)) && pl.active === null, reset = L.link.value;
            pl.sel0(tl, 9); type('', 'enter'); const l5 = 'fmt' in pl.map.blocks[0];
            check('bar (Link): with nothing selected the link is the whole field\'s; an address typed without its scheme is taken as https://; an empty box takes the link off (the selection\'s, or everything\'s); leaving the box with a new address in it sets it too — and the focus stays where it went',
                l2 === J({ title: { link: 'https://b.example/road' } }) && log2 === 3 && l3 === J({ title: { spans: [{ s: 0, e: 4, link: 'https://b.example/road' }, { s: 8, e: 13, link: 'https://b.example/road' }] } }) && l4 === J({ title: { link: 'https://c.example/' } }) && notPulled && reset === 'https://c.example/' && l5 === false, [l2, l3, l4, notPulled, reset, l5]);
            pl.sel0(tl, 0, 3); pl.log.length = 0; pl.toasts.length = 0;
            const bad = ['javascript:alert(1)', 'data:text/html,x', 'https://a b', 'ftp://a.example', 'JAVASCRIPT:alert(1)'].map(v => { type(v, 'enter'); return [J(pl.map.blocks[0].fmt), pl.active === L.link, L.link.value === v]; });
            pl.tsRefresh(); const typing = L.link.value === 'JAVASCRIPT:alert(1)';   // the bar refreshed while the box is being typed in (the selection moved, a save went by): what is typed stays
            pl.active = null; L.link.fire('change'); L.link.fire('blur'); const saidOnce = pl.toasts.length === 5 && L.link.value === '';   // the box left after the refused Enter: nothing is said again, and it shows the field's own link
            type('vbscript:x', 'away'); const badAway = [J(pl.map.blocks[0].fmt), L.link.value];
            check('bar (Link): an address that is no web address is refused in words — nothing changes, there is no step, and after Enter the box keeps the focus and what was typed so it can be put right (a refresh of the bar never writes over it); left that way, the box says nothing a second time and shows the field\'s own link again',
                bad.every(x => x[0] === undefined && x[1] && x[2]) && typing && saidOnce && pl.toasts.length === 6 && pl.toasts.every(m => /http:\/\/ or https:\/\//.test(m)) && pl.log.length === 0 && badAway[0] === undefined && badAway[1] === '', [bad, pl.toasts.length, badAway]);
            const lb = pl.box('field fc-n-text fc-grow', { idx: 2, ni: 0 }, 'textarea'); lb.value = LBL; pl.sel0(lb, 9, 17);
            const offL = [L.link.disabled, L.linkLab.title, L.linkLab.classList.contains('off'), L.u.disabled, L.s.disabled, L.size.disabled];
            pl.log.length = 0; const pressed = pl.tsPress({ link: 'https://a.example/' }), viaBox = (L.link.value = 'https://a.example/', L.link.fire('change'), pl.log.length);
            const eb = pl.box('fc-e-text', { idx: 2, ei: 0 }); eb.value = 'then'; pl.sel0(eb, 0); const offE = L.link.disabled;
            pl.sel0(tl, 0, 3); const onT = [L.link.disabled, L.linkLab.title, L.linkLab.classList.contains('off')];
            pl.sel0(lb, 9, 17); pl.click(L.u); pl.click(L.s); pl.body.fire('mousedown', { target: L.size }); pl.active = L.size; L.size.value = 'large'; L.size.fire('change');
            check('bar (Link): off for a flowchart node\'s label and an arrow\'s, with a title that says why in plain words — a press there changes nothing; on again in a title. U, S and a size on a selection work in a label as in any field',
                J(offL) === J([true, 'A flowchart label cannot hold a link: a chart never carries web addresses.', true, false, false, false]) && pressed === false && viaBox === 0 && offE === true && J(onT.slice(0, 1).concat(onT[2])) === '[false,false]' && /^Link — a web address/.test(onT[1])
                && J(pl.map.blocks[2].nodes[0].fmt) === J({ spans: [{ s: 9, e: 17, size: 'large', u: true, st: true }] }) && !('fmt' in pl.map.blocks[2].edges[0]), [offL, pressed, viaBox, offE, onT, pl.map.blocks[2].nodes[0].fmt]);
            const pr2 = mkPage({ map: mapOf(B0()) }).build(), R2 = pr2.tsState.els, rb2 = pr2.box('field rte-body', { idx: 4 }, 'div');
            pr2.sel = { rangeCount: 1, isCollapsed: false }; pr2.active = rb2; pr2.tsNote(rb2); pr2.click(R2.u); pr2.click(R2.s);
            check('bar: in a text block\'s box U and S drive that block\'s own underline and strike-through (planner.js rteLook, pinned); the link box is off there and says what it is for',
                J(pr2.rte) === J([['4', { u: true }], ['4', { st: true }]]) && R2.link.disabled === true && R2.linkLab.title === 'This box links titles, table cells and captions.' && pr2.log.length === 0
                && /else if \(change && change\.u === true\) rteExec\('underline'\);\n\s*else if \(change && change\.st === true\) rteExec\('strikeThrough'\);/.test(plannerSrc), [pr2.rte, R2.linkLab.title]);
            check('bar (wired): the link box is an input the bar builds itself — never a prompt — its address goes through the core\'s one link rule before anything is stored, and the label rule is the same everywhere (tsIsLabel)',
                !/\bprompt\(/.test(barSrc) && /if \(v && !TF\.cleanLink\(v\)\) \{ toast\(/.test(barSrc) && /E\.link = mk\('input', 'ts-link'\); E\.link\.type = 'text';/.test(barSrc) && /function tsIsLabel\(d\) \{ return !!d && \(d\.k === 'node' \|\| d\.k === 'edge'\); \}/.test(barSrc)
                && /if \(change !== 'clear' && tsOwn\(change, 'link'\) && tsIsLabel\(sel\.d\)\) \{ tsRefresh\(\); return false; \}/.test(barSrc));
        }
        // what it names
        const cell = pg.box('r-col', { idx: 1, ri: 1, ci: 2 }), names = [];
        const say = (cls, data, s, e, tag) => { const el = pg.box(cls, data, tag); pg.sel0(el, s || 0, e); names.push(E.target.textContent); };
        pg.sel0(cell, 2, 5); names.push(E.target.textContent);
        say('b-colhead', { idx: 1, ci: 1 }); say('field b-sub', { idx: 0 }); say('field b-sub', { idx: 1 }); say('b-must', { idx: 1 }, 0, 1); say('b-caption', { idx: 3 }); say('field b-title', { idx: 5 }); say('field b-title', { idx: 1 }); say('field b-title', { idx: 6 });
        say('fc-n-text', { idx: 2, ni: 1 }, 0, 0, 'textarea'); say('fc-e-text', { idx: 2, ei: 0 });
        check('bar: it names what it will act on in a few words, as text',
            J(names) === J(['Row 2, Cost — 3 selected characters', 'Heading of column 2 — the whole field', 'Subtitle — the whole field', 'Tag — the whole field', 'Must resolve — 1 selected character', 'Caption — the whole field', 'Section heading — the whole field', 'Scene title — the whole field', 'Table title — the whole field', 'Node n3’s label — the whole field', 'Arrow 1’s label — the whole field']), names);
        pg.map.blocks[2].nodes[1].id = '<img src=x onerror=alert(1)>'; pg.map.blocks[1].cols[2] = '<script>alert(1)</script> and a very long column name indeed';
        pg.sel0(pg.tsBox({ idx: 2, k: 'node', ni: 1 }), 0); const hn = E.target.textContent; pg.sel0(cell, 0); const hc = E.target.textContent;
        check('bar: a hostile node id or column name is only ever text in it, and cut short', hn === 'Node <img src=x onerror=alert(1)>’s label — the whole field' && hc === 'Row 2, <script>alert(1)</script> and… — the whole field' && !('innerHTML' in E.target), [hn, hc]);

        // a box that takes no styling; another document; a field that is gone
        pg.sel0(pg.box('fc-n-id', { idx: 2, ni: 0 }), 0);
        const noneSaid = E.target.textContent, noneOff = [E.b, E.i, E.nocolor, E.size, E.clear, E.custom].concat(E.swatches).every(c => c.disabled);
        pg.log.length = 0; const j0 = J(pg.map); pg.click(E.b); pg.tsPress({ b: true }); pg.tsPress({ color: RED });
        check('bar: a box that takes no styling (an id, a diagram\'s code) says so and disables every control: nothing is silently ignored, nothing is changed', noneSaid === 'This box takes no styling.' && noneOff && pg.log.length === 0 && J(pg.map) === j0);
        pg.sel0(cell, 0, 3); pg.map = { id: 'other', type: 'planner', blocks: B0() }; pg.active = null; pg.log.length = 0;
        const other = pg.tsPress({ b: true }), jo = J(pg.map.blocks[1]);
        pg.map = mapOf(B0()); pg.sel0(cell, 0, 3); pg.map.blocks.splice(1, 1); pg.active = null;
        let threw = null; try { pg.tsPress({ b: true }); pg.tsRefresh(); } catch (e) { threw = e.message; }
        check('bar: nothing is remembered across documents, and a remembered field that is gone is no target (no error, no change)', other === false && jo === J(B0()[1]) && threw === null && pg.log.length === 0 && /^Click in a title/.test(E.target.textContent), threw);

        // the keyboard
        const pk = mkPage({ map: mapOf(B0()) }).build(), tk = pk.box('field b-title', { idx: 0 });
        pk.sel0(tk, 0, 3);
        const kev = (o) => Object.assign({ key: 'b', ctrlKey: true, target: tk, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }, o);
        const k1 = kev({}), r1 = pk.tsKey(k1), f1 = J(pk.map.blocks[0].fmt), k2 = kev({ key: 'I', metaKey: true, ctrlKey: false }), r2 = pk.tsKey(k2), f2 = J(pk.map.blocks[0].fmt);
        const idBox = pk.box('fc-n-id', { idx: 2, ni: 0 }), rteBox = pk.box('field rte-body', { idx: 4 }, 'div');
        const no = [kev({ shiftKey: true }), kev({ altKey: true }), kev({ ctrlKey: false }), kev({ key: 'x' }), kev({ target: idBox }), kev({ target: rteBox }), kev({ target: pk.root })].map(e => [pk.tsKey(e), e.prevented]);
        check('keyboard: Ctrl+B and Ctrl+I in a plain box do what the buttons do (one step each, the key taken); with Shift or Alt, another key, or in a box that is no plain field the key is left alone',
            r1 === true && k1.prevented && k1.stopped && f1 === J({ title: { spans: [{ s: 0, e: 3, b: true }] } }) && r2 === true && k2.prevented && f2 === J({ title: { spans: [{ s: 0, e: 3, b: true, i: true }] } })
            && J(pk.log) === J(['step', 'save:true', 'preview', 'step', 'save:true', 'preview']) && no.every(x => x[0] === false && x[1] === false) && J(pk.map.blocks[0].fmt) === f2, [f1, f2, no]);
        check('keyboard (wired): the key is seen in the capture phase on the document (a flowchart label stops its own keys), the selection is followed as it moves, and the bar is built from index.html\'s #textStyleBar',
            /document\.addEventListener\('keydown', tsKey, true\);/.test(plannerSrc) && /\['focusin', 'select', 'keyup', 'mouseup', 'input'\]\.forEach\(function\(ev\) \{ document\.addEventListener\(ev, function\(e\) \{ var t = e\.target; if \(t && t\.closest && t\.closest\('#plannerBlocks'\)\) tsNote\(t\); \}, true\); \}\);/.test(plannerSrc)
            && /var root = document\.getElementById\('textStyleBar'\); if \(!root\) return;\n\s*tsBuild\(root\);/.test(plannerSrc));

        // a text block's own box: the bar drives its rich-text commands
        const pr = mkPage({ map: mapOf(B0()) }).build(), R = pr.tsState.els, rb = pr.box('field rte-body', { idx: 4 }, 'div');
        pr.sel = { rangeCount: 1, isCollapsed: true }; pr.active = rb; pr.tsNote(rb);
        const caretSaid = R.target.textContent, caretOff = [R.nocolor.disabled, R.size.disabled, R.clear.disabled, R.b.disabled, R.i.disabled, R.swatches[0].disabled];
        pr.click(R.nocolor); pr.click(R.clear);
        const offPressed = pr.rte.length;   // disabled controls: no press reaches the block
        pr.sel = { rangeCount: 1, isCollapsed: false }; pr.tsNote(rb);
        const selSaid = R.target.textContent, selOff = [R.nocolor.disabled, R.size.disabled, R.clear.disabled, R.b.disabled];
        pr.click(R.b); pr.click(R.swatches[4]); pr.click(R.nocolor); R.size.value = 'huge'; R.size.fire('change'); pr.click(R.clear);
        check('bar: in a text block\'s box it drives that block\'s own commands (B, I, a colour, Default, a size, Clear) and writes no format beside the block; with only a caret there, Default, Size and Clear are disabled',
            /^Text block — select text/.test(caretSaid) && J(caretOff) === J([true, true, true, false, false, false]) && offPressed === 0 && selSaid === 'Text block — the selected text' && J(selOff) === J([false, false, false, false])
            && J(pr.rte) === J([['4', { b: true }], ['4', { color: GREEN }], ['4', { color: null }], ['4', { size: 'huge' }], ['4', 'clear']]) && J(pr.map.blocks[4]) === J(B0()[4]) && pr.log.length === 0, [caretSaid, caretOff, pr.rte]);

        // the cap is said
        const pc = mkPage({ map: mapOf([{ id: 'b', type: 'h2', title: 'x'.repeat(900) }]) }).build(), tc = pc.box('b-title', { idx: 0 });
        const many = []; for (let k = 0; k < 199; k++) many.push({ s: k * 2, e: k * 2 + 1, b: true });
        pc.map.blocks[0].fmt = { title: { spans: many } };
        pc.sel0(tc, 600, 601); pc.tsPress({ i: true });
        check('bar: a field at its ' + MAX_SPANS + ' styled parts says so', pc.map.blocks[0].fmt.title.spans.length === 200 && pc.toasts.length === 1 && /200/.test(pc.toasts[0]));
        check('undo: one step a press — the press closes whatever typing was on its way first (io.js stepBoundary), then saves at once',
            /function stepBoundary\(\) \{ if \(savePending\) pushHistory\(\); closeChunk\(\); \}/.test(read('io.js')) && /\n\s*stepBoundary,\n/.test(read('io.js')) && /\n\s*stepFold,\n/.test(read('io.js')) && /else stepBoundary\(\);[^\n]*\n\s*tsState\.run = runOn;\n\s*fld\.setFmt\(now\);\n\s*save\(true\);/.test(barSrc));
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


    /* ================= the review's follow-ups: Ctrl+Z after a press, a rebuilt editor, the keyboard in the bar, Find across runs, the text blocks' own bar ================= */
    {
        // io.js's history and its undo chord, sliced and run for real on a campaign of plain objects
        const mkHist = (map, win) => {
            const camp = { id: 'c', activeItemId: map.id, items: { [map.id]: map } }, calls = [], timers = [];
            const api = new Function('window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'stepHistory',
                slice('io.js', 'history') + '\n' + slice('io.js', 'undochord') + '\nreturn { pushHistory, stepBoundary, stepFold, fieldUndoChord, stack: function() { return histories["c/" + getActiveMap().id]; }, pending: function(v) { savePending = v; } };')(
                win || {}, { appState: { campaigns: { c: camp } } }, () => camp, () => map, { getItem: () => null }, { getElementById: () => null }, fn => { timers.push(fn); }, d => { calls.push(d); });
            api.pushHistory();   // the first pass seeds the baseline, as the app's first save does
            return Object.assign(api, { calls, timers });
        };
        const chordOn = (H, el, o) => { const e = Object.assign({ key: 'z', ctrlKey: true, target: el, prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} }, o || {}); return [H.fieldUndoChord(e), e.prevented]; };

        /* ---- Ctrl+Z in a plain field after a press takes the press back, never the typing before it ---- */
        const p1 = mkPage({ map: mapOf(B0()) }).build(), E1 = p1.tsState.els, H1 = mkHist(p1.map); p1.hist = H1;
        const lab1 = p1.box('field fc-n-text fc-grow', { idx: 2, ni: 1 }, 'textarea'), d1 = { idx: 2, k: 'node', ni: 1 }, node1 = p1.map.blocks[2].nodes[1];
        lab1.value = 'two abc'; lab1._wpNativeDirty = true; p1.tsType(p1.map.blocks, d1, 'two abc', 7); H1.pending(true);   // ' abc' typed: io.js's input listener marks the box, the save is on its timer
        p1.sel0(lab1, 4, 7);
        const before = chordOn(H1, lab1), armed0 = H1.timers.length, called0 = H1.calls.length;   // typing only: the browser's own undo answers (the chord is left to it, a probe is armed)
        p1.click(E1.swatches[4]);
        const st1 = H1.stack(), afterPress = { dirty: lab1._wpNativeDirty, floor: lab1._wpFloor, fmt: J(node1.fmt), steps: st1.undo.length, pressStep: J(JSON.parse(st1.undo[1]).c.blocks[2].nodes[1]) };
        const undo1 = chordOn(H1, lab1), armed1 = H1.timers.length, calls1 = J(H1.calls);
        const redo1 = chordOn(H1, lab1, { key: 'y' }), calls2 = J(H1.calls);
        check('undo (Ctrl+Z in a plain field): while only typing is there the browser\'s own undo answers; after a press the box is spent — the chord goes to the planner\'s history, which holds the typing and the press as two steps, so the press is taken back and the typed text stays (io.js fieldUndoChord run for real)',
            J(before) === '[false,false]' && armed0 === 1 && called0 === 0 && afterPress.dirty === false && afterPress.floor === 'two abc' && afterPress.fmt === J({ spans: [{ s: 4, e: 7, color: GREEN }] }) && afterPress.steps === 2
            && afterPress.pressStep === J({ id: 'n3', text: 'two abc', shape: 'rect', color: 'gold' }) && J(undo1) === '[true,true]' && armed1 === 1 && calls1 === '["undo"]' && J(redo1) === '[true,true]' && calls2 === '["undo","redo"]', [before, afterPress, undo1, calls1]);
        lab1.value = 'two abcd'; lab1._wpNativeDirty = true;                 // more typing after the press
        const typedMore = chordOn(H1, lab1), armed2 = H1.timers.length;      // the browser may take that back…
        lab1.value = 'two abc';                                              // …and has: the text is what it was at the press (the flag still says typing)
        const atFloor = chordOn(H1, lab1), calls3 = J(H1.calls), spent = lab1._wpNativeDirty, armed3 = H1.timers.length;
        lab1._wpNativeDirty = true; const redoAtFloor = chordOn(H1, lab1, { key: 'y' });
        const never = p1.box('field b-title', { idx: 0 }); never.value = 'The Hill Road'; never._wpNativeDirty = true;
        check('undo (Ctrl+Z in a plain field): what is typed after a press the browser may take back, down to the text as it was at the press and no further — there the chord goes to the planner\'s history again; a redo, and a box never styled, are as before',
            J(typedMore) === '[false,false]' && armed2 === 2 && J(atFloor) === '[true,true]' && calls3 === '["undo","redo","undo"]' && spent === false && armed3 === 2 && J(redoAtFloor) === '[false,false]' && J(chordOn(H1, never)) === '[false,false]', [typedMore, atFloor, calls3, redoAtFloor]);
        check('undo (Ctrl+Z in a plain field): every press marks its box — a colour, B, I, U, S, a size, Clear, and Ctrl+B', ['b', 'i', 'u', 's', 'nocolor', 'clear'].every(k => { lab1._wpNativeDirty = true; lab1._wpFloor = undefined; p1.sel0(lab1, 4, 7); if (k === 'nocolor' || k === 'clear') p1.tsPress({ color: RED }); lab1._wpNativeDirty = true; p1.click(E1[k]); return lab1._wpNativeDirty === false && lab1._wpFloor === 'two abc'; })
            && (() => { lab1._wpNativeDirty = true; E1.size.value = 'large'; E1.size.fire('change'); const a = lab1._wpNativeDirty === false; lab1._wpNativeDirty = true; p1.tsKey({ key: 'b', ctrlKey: true, target: lab1, preventDefault() {}, stopPropagation() {} }); return a && lab1._wpNativeDirty === false; })()
            && (() => { lab1._wpNativeDirty = true; const r = p1.tsPress({ size: 'large' }); return r === false && lab1._wpNativeDirty === true; })());   // a press that changes nothing leaves the box as it was

        /* ---- nothing is remembered across a rebuild of the editor ---- */
        const p2 = mkPage({ map: mapOf(B0()) }).build(), E2 = p2.tsState.els, c2 = p2.box('r-col', { idx: 1, ri: 0, ci: 0 }); c2.value = 'Medicine';
        p2.sel0(c2, 0, 3); p2.click(E2.swatches[4]);   // "Med" green, in row 1
        const named2 = E2.target.textContent;
        p2.map.blocks[1].rows.splice(0, 1); p2.blocksEl.children.length = 0; p2.active = null;   // the row's delete button: the row goes, renderPlanner writes every box anew…
        p2.tsRebuilt();                                                                           // …and ends with this
        p2.log.length = 0; const j2 = J(p2.map), pressed2 = p2.tsPress({ color: RED }); p2.click(E2.swatches[2]); p2.click(E2.b);
        check('rebuild: after the editor is rebuilt (a row deleted above the place it remembered) the bar remembers nothing — a press styles no other text, the bar asks for a click in a field and every control is disabled',
            named2 === 'Row 1, Check — 3 selected characters' && pressed2 === false && J(p2.map) === j2 && p2.log.length === 0 && !('fmt' in p2.map.blocks[1].rows[0]) && p2.map.blocks[1].rows[0].col1 === 'Insight' && p2.tsState.sel === null
            && /^Click in a title, a label or a table cell/.test(E2.target.textContent) && [E2.b, E2.i, E2.custom, E2.nocolor, E2.size, E2.clear].concat(E2.swatches).every(c => c.disabled === true), [named2, pressed2, p2.map.blocks[1].rows[0], E2.target.textContent]);
        const c2b = p2.box('r-col', { idx: 1, ri: 0, ci: 0 }); c2b.value = 'Insight'; p2.sel0(c2b, 0, 3); p2.click(E2.swatches[2]);
        check('rebuild: a box clicked in afterwards is noted afresh and styled as ever', J(p2.map.blocks[1].rows[0].fmt) === J({ col1: { spans: [{ s: 0, e: 3, color: RED }] } }) && E2.target.textContent === 'Row 1, Check — 3 selected characters');
        check('rebuild (wired): renderPlanner ends by forgetting — after the boxes are written and the preview drawn — whatever document it drew', /\n\s*renderPlannerPreview\(\);\s*\n\s*applyPlannerFullscreen\(\);\s*\n\s*tsRebuilt\(\);[^\n]*\n\s*\}/.test(plannerSrc) && (plannerSrc.match(/tsRebuilt\(\)/g) || []).length === 2 && !/tsState\.sel\.map !== activeMap\.id/.test(plannerSrc));

        /* ---- typing: the caret tells respan where a run of equal characters was edited ---- */
        const p3 = mkPage({ map: mapOf([{ id: 'b', type: 'h2', title: 'aaaa', fmt: { title: { spans: [{ s: 2, e: 4, b: true }] } } }]) });
        p3.tsType(p3.map.blocks, { idx: 0, k: 'title' }, 'aaaaa', 2);   // an "a" typed after the first one: the bold ones are the last two still
        const caretFmt = J(p3.map.blocks[0].fmt);
        p3.tsType(p3.map.blocks, { idx: 0, k: 'title' }, 'aaaa', 0);    // the first one deleted
        check('typing: the box\'s caret goes to respan, so an edit inside a run of equal characters moves the spans after it (without it the edit would be read at the end, and the look would sit on other characters)',
            caretFmt === J({ title: { spans: [{ s: 3, e: 5, b: true }] } }) && J(p3.map.blocks[0].fmt) === J({ title: { spans: [{ s: 2, e: 4, b: true }] } }), [caretFmt, p3.map.blocks[0].fmt]);

        /* ---- the keyboard in the bar: a control it reached keeps the focus; the Size list stepped through is one undo step ---- */
        const p4 = mkPage({ map: mapOf(B0()) }).build(), E4 = p4.tsState.els, H4 = mkHist(p4.map); p4.hist = H4;
        const lab4 = p4.box('field fc-n-text fc-grow', { idx: 2, ni: 0 }, 'textarea'), n4 = p4.map.blocks[2].nodes[0]; lab4.value = LBL;
        p4.sel0(lab4, 9, 17); lab4.calls.length = 0; p4.log.length = 0;
        const keyOn = (el, key) => p4.body.fire('keydown', { target: el, key });
        p4.active = E4.size;                                                     // Tab reached the Size list
        keyOn(E4.size, 'ArrowDown'); E4.size.value = 'small'; E4.size.fire('change');
        const k1 = { focus: p4.active === E4.size, sel: J(p4.tsState.sel), fmt: J(n4.fmt), steps: H4.stack().undo.length, box: J(lab4.calls), log: J(p4.log) };
        keyOn(E4.size, 'ArrowDown'); E4.size.value = 'large'; E4.size.fire('change');
        keyOn(E4.size, 'ArrowDown'); E4.size.value = 'larger'; E4.size.fire('change');
        const k3 = { focus: p4.active === E4.size, sel: J(p4.tsState.sel), fmt: J(n4.fmt), steps: H4.stack().undo.length, log: J(p4.log), back: J(JSON.parse(H4.stack().undo[0]).c.blocks[2].nodes[0]) };
        check('keyboard (the Size list): its arrow keys step through the sizes — each is applied to the selected characters, the list keeps the focus, the field\'s remembered selection is unchanged (put back without the focus), and the whole run is ONE undo step back to how the field was (io.js pushHistory run for real)',
            k1.focus && k1.fmt === J({ spans: [{ s: 9, e: 17, size: 'small' }] }) && k1.steps === 1 && k1.box === '["select 9-17"]' && k1.log === J(['step', 'save:true', 'preview']) && k3.focus && k3.sel === k1.sel && JSON.parse(k3.sel).s === 9 && JSON.parse(k3.sel).e === 17 && k3.fmt === J({ spans: [{ s: 9, e: 17, size: 'larger' }] }) && k3.steps === 1
            && k3.log === J(['step', 'save:true', 'preview', 'fold', 'save:true', 'preview', 'fold', 'save:true', 'preview']) && k3.back === J({ id: 'n1', text: LBL, shape: 'rect', color: 'neutral' }) && lab4.calls.indexOf('focus') < 0, [k1, k3]);
        E4.size.fire('blur'); p4.active = E4.size; keyOn(E4.size, 'ArrowDown'); E4.size.value = 'huge'; E4.size.fire('change');   // the list was left and come back to
        const afterBlur = H4.stack().undo.length;
        p4.active = E4.swatches[4]; keyOn(E4.swatches[4], ' '); p4.click(E4.swatches[4]);   // a colour by the keyboard: its own step, the swatch keeps the focus
        const kc = { focus: p4.active === E4.swatches[4], fmt: J(n4.fmt), steps: H4.stack().undo.length };
        p4.active = E4.size; keyOn(E4.size, 'ArrowUp'); E4.size.value = 'larger'; E4.size.fire('change');   // a size after another press is a step of its own again
        const afterColour = H4.stack().undo.length;
        keyOn(E4.size, 'ArrowUp'); p4.sel0(lab4, 0, 3); p4.active = E4.size; E4.size.value = 'large'; E4.size.fire('change');   // another selection: no run
        check('keyboard (the bar): leaving the Size list, another press or another selection ends the run (the next size is a step of its own); a colour pressed by the keyboard is its own step and its swatch keeps the focus',
            afterBlur === 2 && kc.focus && kc.fmt === J({ spans: [{ s: 9, e: 17, size: 'huge', color: GREEN }] }) && kc.steps === 3 && afterColour === 4 && H4.stack().undo.length === 5, [afterBlur, kc, afterColour, H4.stack().undo.length]);
        const winF = {}, mF = mapOf([{ id: 'b', type: 'h2', title: 'one' }]), HF = mkHist(mF, winF);
        mF.blocks[0].title = 'two'; HF.pushHistory();                           // a step
        winF.wpStream = true; HF.stepFold(); delete winF.wpStream;              // a fold asked for where no save is recorded (a window that never owns a save): nothing is armed
        mF.blocks[0].title = 'three'; HF.pushHistory(); const notArmed = HF.stack().undo.length;
        HF.stepFold(); mF.blocks[0].title = 'four'; HF.pushHistory(); const folded = HF.stack().undo.length;
        mF.blocks[0].title = 'five'; HF.pushHistory();
        check('keyboard (the Size list): the fold is one shot and only armed where the save that follows is recorded — it joins the step before it once, the pass after is a step of its own, and it never waits for some later pass (io.js stepFold / pushHistory run for real)',
            notArmed === 2 && folded === 2 && HF.stack().undo.length === 3 && JSON.parse(HF.stack().undo[1]).c.blocks[0].title === 'two' && JSON.parse(HF.stack().undo[2]).c.blocks[0].title === 'four', [notArmed, folded, HF.stack().undo.length]);
        p4.sel0(lab4, 9, 17);
        p4.body.fire('mousedown', { target: E4.size }); p4.active = E4.size; E4.size.value = 'small'; E4.size.fire('change');   // by the mouse, as before: the field has the focus again
        const byMouse = p4.active === lab4 && lab4.selectionStart === 9 && lab4.selectionEnd === 17;
        p4.body.fire('mousedown', { target: E4.b }); p4.active = null; p4.click(E4.b);
        check('keyboard (the bar): a press by the mouse gives the field its focus and selection back, as before — the Size list and a button alike', byMouse && p4.active === lab4 && lab4.selectionStart === 9 && lab4.selectionEnd === 17);
        p4.active = E4.swatches[2]; const esc = keyOn(E4.swatches[2], 'Escape'), escBack = p4.active === lab4 && lab4.selectionStart === 9 && lab4.selectionEnd === 17;
        p4.active = E4.size; const ent = keyOn(E4.size, 'Enter'), entBack = p4.active === lab4;
        p4.active = E4.b; const entBtn = keyOn(E4.b, 'Enter'), btnStays = p4.active === E4.b;
        const p5 = mkPage({ map: mapOf(B0()) }).build(); p5.active = p5.tsState.els.size; const escNone = p5.body.fire('keydown', { target: p5.tsState.els.size, key: 'Escape' });
        check('keyboard (the bar): Escape — and Enter in the Size list — goes back to the field with its selection as it was (the key taken); Enter on a button is the button\'s own; with no field to go back to the key is left alone',
            esc.prevented === true && esc.stopped === true && escBack && ent.prevented === true && entBack && entBtn.prevented === false && btnStays && escNone.prevented === false && p5.active === p5.tsState.els.size);

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
        check('said (Help, Planners): a Text style section — the bar closed until its caret is clicked, select then click (B, I, U, S, a colour), nothing selected is the whole field, a size on the selection or the whole field, the Link box and why a flowchart label takes none, Clear, what it names, one undo step, the text blocks\' colour and size, a Markdown file keeps the style',
            /<h4>Text style<\/h4>/.test(hp) && ['closed until you click its', 'Select, then click.', 'so you can click green and then bold without selecting again', 'Ctrl + B', 'U (underline), S (strike through) or a colour', 'Ctrl + B, Ctrl + I and Ctrl + U do the same from the keyboard', 'Nothing selected is the whole field.', 'then select the lines you have finished and pick green',
                'works the same way: on the characters you selected, or on the whole field with nothing selected', 'Default on a selection takes the size off that part', 'the list reads Mixed when what you selected holds more than one size', 'Link turns text into a link to a web page.', 'type the address in the bar\'s Link box and press Enter', 'one typed without that start is taken as https://', 'anything else is refused and nothing changes',
                'Select linked text and the box shows its address; empty the box and press Enter to take the link off', 'a click on the link opens it in the web browser, as a link in a text block does', 'A flowchart label cannot hold a link', 'so the box is greyed out there; underline, strike-through and a size on part of a label work as anywhere', 'Clear takes the styling off the selection, or off the whole field when nothing is selected', 'names what it will act on', 'a control that cannot apply is greyed out', 'Each click is one undo step',
                'keep their own bar, which also has the colours, Default and a Size list for the selected text', 'Save Markdown keeps text style and an import brings it back'].every(w => words(hp).indexOf(w) >= 0), words(hp).slice(words(hp).indexOf('Text style'), words(hp).indexOf('Text style') + 400));
        check('said (Help, Planners): Ctrl+Z in the field takes a click back and not the typing before it; after a row, a block, a node or an arrow is added, deleted or moved the bar asks for a click again; the keyboard in the bar — a control keeps the focus, the Size list stepped through is one undo step, Esc or Enter goes back; what is typed right after a styled part joins it; the Handbook pane says how Markdown carries text style',
            ['After you add, delete or move a row, a block, a node or an arrow it asks for a click again.', 'Ctrl + Z in the field takes the click back, not what you typed before it', 'From the keyboard: Tab to the bar. A control you press there keeps the focus',
                'step through the Size list with the arrow keys (that whole run of sizes is one undo step)', 'or Enter in the Size list', 'takes you back to the field, its selection as you left it', 'What you type right after a styled part joins it, as in a word processor; typed right before it, or on a new line you start with Enter, it does not.'].every(w => words(hp).indexOf(w) >= 0)
            && ['Text style travels too. Save Markdown writes bold and italic as ** and *, strike-through as ~~, underline as', 'a link as [text](https://', 'and a colour or a size as a small tag around the text', 'around the whole field or around just the part that has it', 'an import reads all of those back, and you can write them by hand', 'A file with none of this in it comes in exactly as before.'].every(w => words(pane('handbook')).indexOf(w) >= 0), words(hp).slice(words(hp).indexOf('The bar names'), words(hp).indexOf('The bar names') + 900));
        const hh = ix.slice(ix.indexOf('<h4>What a page is</h4>'), ix.indexOf('<h4>Players can read / GM only</h4>'));
        check('said (Help, Handbook): editing a page names the Text style bar and that players see a styled page as the GM does', /The <b>Text style<\/b> bar at the top of the editor colours, bolds, italicises, underlines, strikes through, sizes and links a page's text just as in a planner/.test(hh) && /Players see a styled page exactly as you do\./.test(hh) && words(hp).indexOf('is always the whole field') < 0 && tu.indexOf('size is always the whole field') < 0);
        const stepOf = title => { const a = tu.indexOf("title: '" + title + "'"); return a < 0 ? '' : tu.slice(a, tu.indexOf('before:', a)); };
        check('said (the tour): the planner step and the Handbook step both name the Text style bar (no step was added: the editors\' own steps cover it)',
            /The <b>Text style<\/b> bar at the top of the editor \(click its <b>&#9656;<\/b>\) colours, bolds, italicises, underlines, strikes through, sizes and links your text: select characters in a title, a table cell or a flowchart label and click a style, or click in the box with nothing selected to style the whole field \(a link is a web address typed into the bar&rsquo;s <b>Link<\/b> box; a flowchart label cannot hold one\)/.test(stepOf('Writing a planner'))
            && /the text blocks have the colours and a size list on their own bar/.test(stepOf('Writing a planner')) && /The same <b>Text style<\/b> bar styles a page&rsquo;s titles, table cells and flowchart labels &mdash; colour, size, underline, strike-through, and a link in a title or a cell &mdash; and players see them as you do\./.test(stepOf('Handbook')));
        check('said (the integration guide): the keys and where each is stored, with the cleaner\'s own numbers and steps',
            ci.indexOf('**Text style (1.5.0):**') > 0 && ci.indexOf('"size": "' + SIZES.join('|') + '"') > 0 && SIZES.every(k => ci.indexOf(k + ' ' + SIZE_EM[k].replace('em', '')) > 0) && Object.keys(SIZE_EM).map(k => SIZE_EM[k]).every(v => ci.indexOf(v) > 0)
            && ci.indexOf('at most ' + MAX_SPANS + ' a field') > 0 && ci.indexOf('only the first ' + MAX_RAW + ' entries of a list are read') > 0 && ['"fmt": { "title": …, "sub": …, "tag": …, "must": …, "caption": … }', '`"colFmt"`, a list parallel to `cols`', '"fmt": { "col1": …, "col2": … }', '`"rowFmt"`, a list of lists parallel to `rows`', 'a strict `#rrggbb`', '<span style="color:#rrggbb">', '**Text style in Markdown:** an export carries it and an import reads it back', '"b": true, "i": true, "u": true, "st": true, "link": "https://…", "spans": [{ "s": 0, "e": 8, "size": "large", "color": "#5cb87a", "b": true, "i": true, "u": true, "st": true, "link": "https://…" }]', '`st` struck through (a span\'s `s` is its start)', '`b` / `i` / `u` / `st` only `true`', '`link` a web address by the very rule the page sanitiser has for an `a href`', 'it begins `http://` or `https://` (in any case) with something after it, holds no white space and no control character', 'at most ' + MAX_LINK.toLocaleString('en-US') + ' characters', 'a `size` or a `link` that every character of the field has is stored as the field\'s own', 'a size is never drawn inside a size', 'a flowchart label\'s format keeps no `link`'].every(w => ci.indexOf(w) > 0));
        check('the page: the bar\'s place is in index.html above the blocks, closed (its body hidden), with no handler attribute and no inline script; its styles keep it in view while the editor scrolls',
            /<div id="textStyleBar" class="ts-bar">\n\s*<button type="button" id="textStyleToggle" class="ts-toggle" aria-expanded="false" aria-controls="textStyleBody" title="[^"<>]+"><span class="ts-caret" aria-hidden="true">&#9656;<\/span> Text style<\/button>\n\s*<div id="textStyleBody" class="ts-body" hidden><\/div>\n\s*<\/div>\n\s*<div id="plannerBlocks"><\/div>/.test(ix)
            && /\.ts-bar \{ position: sticky; top: -15px;/.test(css) && /\.ts-body\[hidden\] \{ display: none; \}/.test(css));
        check('CI runs this suite', /run: node tools\/textcheck\.js/.test(yml));
        const DRX = await import(modUrl('docrender.js'));
        check('the console\'s list names the new module and the renderer\'s new calls, as the code publishes them', /wpTextFmt: 'Text formats, pure \(scripts\/textfmt\.js\)/.test(rd('system/app/scripts/devconsole.js')) && /cleanFmt\(fmt, text\), cleanLink\(address\), runsOf\(text, fmt\)/.test(rd('system/app/scripts/devconsole.js')) && /MAX_SPANS, MAX_LINK\. No DOM\./.test(rd('system/app/scripts/devconsole.js')) && /fmtHtml\(text, fmt, put\), fmtRich\(text, fmt\), cleanBlockFmts\(block\), labelFmt\(fmt, text\), sanitizeBare\(html\)/.test(rd('system/app/scripts/devconsole.js')) && /htmlToMarkdown, fmtFromInline\(html\), flowchartFromMermaid/.test(rd('system/app/scripts/devconsole.js')) && typeof DRX.fmtRich === 'function' && typeof DRX.sanitizeBare === 'function' && typeof DRX.labelFmt === 'function' && ['cleanFmt', 'cleanLink', 'runsOf', 'respan', 'apply', 'clear', 'stateAt', 'SIZES', 'SIZE_EM', 'PALETTE', 'MAX_SPANS', 'MAX_LINK'].every(k => k in TF));
    }

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
