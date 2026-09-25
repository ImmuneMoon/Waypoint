/* Sinks (1.5.0) — the pure half of what the GM's own renderers put on screen. A campaign on this machine may have
   come from a file someone else made (a Merge or Replace import), and the renderers that show the GM's own work show
   it too: whatever such a file carries reaches markup, a style or a URL only through these (or docrender.js's
   sanitizeHtml / proseHtml for formatted text). No DOM, no state: tools/sinkcheck.js runs this under Node.
   Published as window.wpSafeCore when a window exists.

     esc(s)                text, or a double-quoted attribute value: & < > " escaped; null / undefined -> ''.
     cssColor(v, dflt)     a colour a style may carry: #hex, rgb() / rgba() / hsl() / hsla() of plain numbers, a colour
                           keyword, var(--name). Anything else (url(), a ';' and a second property, a quote) -> dflt
                           ('' when not given).
     num(v, dflt, lo, hi)  a finite number, clamped when lo / hi are given, else dflt: what goes into a value="", a
                           width, an angle or a px style.
     picRef(v)             a picture this machine may load: the app's own paths (/saves/..., assets/...), an inline image
                           (data:image/...) or a blob: URL. An address of its own (http:, file:, //host, and what a
                           browser reads as one: a backslash, a tab or newline anywhere, a leading space) -> ''.
                           The owner's rule (2026-09-25): a picture never loads from outside the app. */
'use strict';

var VERSION = '1.5.0';

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// the shape net.js safeColor accepts on the wire, so the GM's screen and a player's read one rule
var COLOR_RE = /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([\d.,\s%]+\)|[a-zA-Z]{1,20}|var\(--[\w-]+\))$/;
function cssColor(v, dflt) { return (typeof v === 'string' && v.length <= 40 && COLOR_RE.test(v)) ? v : (dflt === undefined ? '' : dflt); }

function num(v, dflt, lo, hi) {
    if (v === null || v === undefined || v === '' || typeof v === 'boolean' || typeof v === 'object') return dflt;
    v = Number(v);
    if (!isFinite(v)) return dflt;
    if (typeof lo === 'number' && v < lo) v = lo;
    if (typeof hi === 'number' && v > hi) v = hi;
    return v;
}

var PIC_DATA = /^data:image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)[;,]/i;
function picRef(v) {
    if (typeof v !== 'string' || !v) return '';
    if (PIC_DATA.test(v)) return v.length <= 16 * 1024 * 1024 ? v : '';   // an inline picture: nothing to fetch
    if (/^blob:/i.test(v)) return v.length <= 300 ? v : '';               // bytes already on this machine (a player's cached picture)
    if (v.length > 2000 || /^[\x00-\x20]/.test(v) || /[\x00-\x1f\x7f\\]/.test(v)) return '';   // a URL parser strips or rereads these, and "/\host" or "/<tab>/host" is //host
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(v) || v.slice(0, 2) === '//') return '';                // a scheme, or a host of its own
    return v;
}

var API = { VERSION: VERSION, esc: esc, cssColor: cssColor, num: num, picRef: picRef };
if (typeof window !== 'undefined') window.wpSafeCore = API;
export { VERSION, esc, cssColor, num, picRef };
