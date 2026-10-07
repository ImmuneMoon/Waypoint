/* The System editor's keys (1.5.4, backlog 107: options that say what they do).
   The owner, of the editor's rows, by prompt: "A key at the top of each tab". A row of the editor is a line of boxes and ticks, and a tick
   said what it does only in its tooltip. A grey line under every tick would make each row several times taller, so each tab that has rows
   of ticks has one key instead: a button at the top of the tab opens it, and it names each tick of that tab with one grey line. The rows
   stay as they are, and every tooltip stays.

   The keys are fixed words in the page. This module only opens and closes them, and remembers on this computer which are open
   (wp_sysKeys), so a key that helps stays up while the system is written. */

// [lookcheck:syskey-start]
var KEYS = ['fields', 'rolls', 'items', 'lists'];   // the tabs that have a key, by the name their button carries (data-key)
// Which keys are open, as this computer kept it: only a key of the list, and only where the store holds a 1 for it
function keysRead(store) {
    var out = {};
    try { var v = JSON.parse(store.getItem('wp_sysKeys') || '{}'); KEYS.forEach(function(k) { if (v && typeof v === 'object' && Object.prototype.hasOwnProperty.call(v, k) && v[k] === 1) out[k] = 1; }); } catch (e) {}
    return out;
}
function keysKeep(store, open) { try { var o = {}; KEYS.forEach(function(k) { if (open && open[k] === 1) o[k] = 1; }); store.setItem('wp_sysKeys', JSON.stringify(o)); return true; } catch (e) { return false; } }
// A press on a key's button: that key the other way, the others as they were. A name that is no key changes nothing. Always a new object
function keyPress(open, k) {
    var o = {}; KEYS.forEach(function(q) { if (open && open[q] === 1) o[q] = 1; });
    if (KEYS.indexOf(k) < 0) return o;
    if (o[k] === 1) delete o[k]; else o[k] = 1;
    return o;
}
// Written to the page: each key shown or put away, and its button saying which
function keysApply(doc, open) {
    var n = 0;
    KEYS.forEach(function(k) {
        var b = doc.querySelector('.sys-key-btn[data-key="' + k + '"]'), box = b ? doc.getElementById(b.getAttribute('aria-controls')) : null; if (!b || !box) return;
        var on = !!open && open[k] === 1; box.hidden = !on; b.setAttribute('aria-expanded', on ? 'true' : 'false'); if (on) n++;
    });
    return n;
}
// [lookcheck:syskey-end]

var open = keysRead(localStorage);
function wire() {
    var modal = document.getElementById('systemModal'); if (!modal) return;
    modal.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('.sys-key-btn') : null; if (!b) return;
        open = keyPress(open, b.getAttribute('data-key')); keysKeep(localStorage, open); keysApply(document, open);
    });
    keysApply(document, open);
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
