/* plook.js — 1.6.2, backlog 35, a personal look (the owner, 2026-11-03, by prompt: "name, roll cards, and sheet text", set by "player, or GM,
   both can clear the other's changes", and "Yes, a VTT feature, on"). A character's name is drawn in a font of Waypoint's own and a colour,
   wherever it is shown. ONE reader: ofChar(c) for a character, ofTok(w) for a character token, each the cleaned look (systemcore cleanPlook)
   or null, and null while Personal looks is off on this screen. On the GM's Waypoint a token reads its character; on a player's app, its
   character where the app holds a copy, else the look the host sent on the token (pl). dress(el, look) sets an element's font and colour
   from a look, and clears both for none. Published as window.wpPlook. */
import { getActiveCampaign } from './models.js';

function clean(v) { var S = typeof window !== 'undefined' ? window.wpSystemCore : null; return S && typeof S.cleanPlook === 'function' ? S.cleanPlook(v) : null; }
function on() { var V = typeof window !== 'undefined' ? window.wpVtt : null; return !V || typeof V.on !== 'function' || V.on('plook') !== false; }
function ofChar(c) { return c && typeof c === 'object' && on() ? clean(c.plook) : null; }
function ofTok(w) {
    if (!w || typeof w !== 'object' || !w.isChar || w.waiting || !on()) return null;
    var camp = getActiveCampaign(), ch = camp && camp.chars && typeof w.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    return ch ? clean(ch.plook) : clean(w.pl);
}
function ofCharId(id) { var camp = getActiveCampaign(), ch = camp && camp.chars && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null; return ofChar(ch); }
function dress(el, look) {
    if (!el || !el.style) return el; var T = typeof window !== 'undefined' ? window.wpTextFmt : null, lk = clean(look);
    el.style.fontFamily = lk && lk.font && T && typeof T.fontCss === 'function' ? T.fontCss(lk.font) : '';
    el.style.color = lk && lk.color ? lk.color : '';
    return el;
}
function sig(look) { var lk = clean(look); return lk ? (lk.font || '') + '|' + (lk.color || '') : ''; }
if (typeof window !== 'undefined') window.wpPlook = { ofChar: ofChar, ofTok: ofTok, ofCharId: ofCharId, dress: dress, sig: sig, on: on };
export { ofChar, ofTok, ofCharId, dress, sig, on };
