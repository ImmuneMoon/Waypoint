/* A player's profile carried to another computer (1.6.0; the owner, 2026-10-29: "if we need to have a hardened profile section so the app can
   know who is who each time, we should ... unless we can link profiles across apps without needing a site sign in", and by prompt "Both": a
   file and a code). The profile is who this install joins tables as: wp_profile (its id, name, colour, picture and token face) and what proves
   it at each GM's table (wp_tableKeys), with what this app knows of those GMs (wp_gmPins, wp_gmRooms). A pack is that, cleaned whole: opened
   on another computer, every GM's table knows the player at once and the GM is asked nothing. The id this install HOSTS under (wp_hostId)
   and the GM's signing key (wp_gmSign) are never in a pack: they are this install's table, not its player.
   Pure: no page, no storage. Settings reads and writes the stores; this module only shapes, cleans, codes and merges.
   Published as window.wpProfileCore. */

var KIND = 'waypoint-profile', V = 1, MAX_KNOWN = 50, CODE_HEAD = 'WPP1.', MAX_TEXT = 400000;
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function idOk(id) { return typeof id === 'string' && id.length >= 1 && id.length <= 80 && /^[A-Za-z0-9_.:-]+$/.test(id) && !(id in Object.prototype); }   // net.js validProfileId
function keyOk(k) { return typeof k === 'string' && /^[0-9a-f]{16,64}$/.test(k); }   // a table key as net.js newKey makes one (32 hex)
function pubOk(v) { return isObj(v) && v.kty === 'EC' && v.crv === 'P-256' && /^[A-Za-z0-9_-]{43}$/.test(v.x) && /^[A-Za-z0-9_-]{43}$/.test(v.y); }   // net.js cleanGmPub
function roomOk(k) { return typeof k === 'string' && /^c_[a-z0-9]{1,24}$/.test(k); }   // net.js gmRoomFor's own key

// The profile itself, by whitelist. o.avatarOk and o.faceClean are the app's own rules for a picture and a token face (net.js safeAvatar,
// cleanFace): with none handed in neither is kept
function cleanProfile(p, o) {
    if (!isObj(p) || !idOk(p.id)) return null;
    var out = { id: p.id, name: typeof p.name === 'string' ? p.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 40) : '' };
    if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) out.color = p.color;
    if (o && typeof o.avatarOk === 'function' && typeof p.avatar === 'string' && o.avatarOk(p.avatar)) out.avatar = p.avatar;
    if (o && typeof o.faceClean === 'function' && typeof p.face === 'string') { var f = o.faceClean(p.face); if (typeof f === 'string' && f) out.face = f; }
    return out;
}
// A store of GM ids (each own key), newest last, MAX_KNOWN at most, every value through ok
function cleanKnown(m, keyRule, valOk, copy) {
    var out = {}; if (!isObj(m)) return out;
    var ks = Object.keys(m).filter(function(k) { return keyRule(k) && valOk(m[k]); });
    ks.slice(Math.max(0, ks.length - MAX_KNOWN)).forEach(function(k) { out[k] = copy ? copy(m[k]) : m[k]; });
    return out;
}
function cleanPack(raw, o) {
    if (!isObj(raw) || raw.kind !== KIND || raw.v !== V) return null;
    var prof = cleanProfile(raw.profile, o); if (!prof) return null;
    return {
        kind: KIND, v: V, at: typeof raw.at === 'number' && isFinite(raw.at) && raw.at > 0 ? Math.floor(raw.at) : 0, profile: prof,
        tableKeys: cleanKnown(raw.tableKeys, idOk, keyOk),
        gmPins: cleanKnown(raw.gmPins, idOk, pubOk, function(v) { return { kty: 'EC', crv: 'P-256', x: v.x, y: v.y }; }),
        gmRooms: cleanKnown(raw.gmRooms, roomOk, idOk)
    };
}
function parse(s) { if (typeof s !== 'string' || !s || s.length > MAX_TEXT) return null; try { return JSON.parse(s); } catch (e) { return null; } }
// A pack from this computer's stores, each handed in as the text localStorage holds (or null); null where there is no profile to carry
function packOf(store, o, now) {
    var s = isObj(store) ? store : {};
    return cleanPack({ kind: KIND, v: V, at: typeof now === 'number' ? now : 0, profile: parse(s.wp_profile), tableKeys: parse(s.wp_tableKeys), gmPins: parse(s.wp_gmPins), gmRooms: parse(s.wp_gmRooms) }, o);
}
// The file's text, and the same pack read back from a file's text
function fileText(pack) { return JSON.stringify(pack, null, 1); }
function fromFile(text, o) { return cleanPack(parse(text), o); }
// The code: CODE_HEAD and the pack as base64url of its UTF-8, so it travels in any message and copies whole. Spaces and line breaks a message
// put in it are taken out before it is read
function b64u(bytes) {
    var bin = ''; for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    var b = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
    return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64u(s) {
    var b = s.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
    var bin = typeof atob === 'function' ? atob(b) : Buffer.from(b, 'base64').toString('binary'), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}
function codeOf(pack) { if (!isObj(pack)) return ''; return CODE_HEAD + b64u(new TextEncoder().encode(JSON.stringify(pack))); }
function fromCode(text, o) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) return null;
    var t = text.replace(/\s+/g, ''); if (t.indexOf(CODE_HEAD) !== 0) return null;
    var body = t.slice(CODE_HEAD.length); if (!/^[A-Za-z0-9_-]+$/.test(body)) return null;
    try { return cleanPack(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unb64u(body))), o); } catch (e) { return null; }
}
// What opening a pack writes, as the text each store will hold: the profile is the pack's, whole; the table keys are the pack's, since a key
// proves the pack's id and no other; what this app knows of GMs is joined, this computer's own answer kept where the two disagree (a GM this
// computer has already pinned keeps its pin), newest last within MAX_KNOWN. local: the stores as handed to packOf
function openWrites(local, pack) {
    if (!isObj(pack) || !isObj(pack.profile)) return null;
    var l = isObj(local) ? local : {}, join = function(mine, theirs, keyRule, valOk) {
        var a = parse(mine), out = {}; a = isObj(a) ? a : {};
        Object.keys(theirs).forEach(function(k) { if (!own(a, k) || !keyRule(k) || !valOk(a[k])) out[k] = theirs[k]; });
        Object.keys(a).forEach(function(k) { if (keyRule(k) && valOk(a[k])) out[k] = a[k]; });
        var ks = Object.keys(out), cut = {}; ks.slice(Math.max(0, ks.length - MAX_KNOWN)).forEach(function(k) { cut[k] = out[k]; }); return cut;
    };
    return {
        wp_profile: JSON.stringify(pack.profile),
        wp_tableKeys: JSON.stringify(pack.tableKeys || {}),
        wp_gmPins: JSON.stringify(join(l.wp_gmPins, pack.gmPins || {}, idOk, pubOk)),
        wp_gmRooms: JSON.stringify(join(l.wp_gmRooms, pack.gmRooms || {}, roomOk, idOk))
    };
}
// The words a question about a pack shows: whose it is and how many tables know it
function packWords(pack) {
    if (!isObj(pack) || !isObj(pack.profile)) return '';
    var n = Object.keys(pack.tableKeys || {}).length, name = pack.profile.name || 'A player with no name';
    return name + ', known at ' + n + ' ' + (n === 1 ? 'table' : 'tables');
}
if (typeof window !== 'undefined') window.wpProfileCore = { KIND: KIND, CODE_HEAD: CODE_HEAD, cleanPack: cleanPack, packOf: packOf, fileText: fileText, fromFile: fromFile, codeOf: codeOf, fromCode: fromCode, openWrites: openWrites, packWords: packWords };
export { KIND, CODE_HEAD, cleanPack, packOf, fileText, fromFile, codeOf, fromCode, openWrites, packWords };
