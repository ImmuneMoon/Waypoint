/* Saving a file the person names (1.6.4; Fulllion, 2026-11-25: "Yes, wait for the save").
   Before this module, every export handed its file to the browser with a click on a hidden <a download> link and said at once that it was
   saved ("Markdown saved.", "HTML exported."). The browser then showed its Save As dialog, and the page was never told whether the person
   pressed Save or Cancel, so the notice stood while the dialog was still open and stayed after a Cancel.

   This module is the one rule for how a file is saved. Where the window has the File System Access save dialog
   (window.showSaveFilePicker: the desktop shell allows it, as do Chromium browsers) the dialog tells the page what the person did, and a
   caller says the file was saved only once it really was. Where the window has no such dialog (Firefox, Safari), or the dialog refuses to
   open (it needs the press that asked for it, and a press can run out), the file goes out as a download exactly as before, and the caller
   says what it always said. Nothing is ever lost: any dialog that cannot be had falls back to the download.

   The dialog must open in the same turn as the press that asked for it, before anything the export waits for (a fetch, a picture to draw,
   a question). So saving is two steps:
     var t = saveStart({ name: 'Notes.md', type: 'text/markdown' });   // at the press, before any await: opens the dialog
     ... build the file, waiting as long as it takes ...
     var how = await t.save(blob);                                       // writes it to the file picked, or downloads it
     if (saved(how)) toast('Markdown saved.');                           // only after a real save
   how is 'saved' (written to the file the person picked), 'download' (handed to the browser as before), 'cancel' (the person canceled the
   dialog: say nothing, nothing was saved) or 'failed' (the write or the download failed, and this module has said so in plain words).

   Every step that can fail writes a line to the app's step log as 'savefile v1' (steplog.js), with the file's kind and size alone, never
   its name or a word of what it holds. io.js imports this module, so it loads with the page, and hands it the app's notice (saySet); it is
   published as window.wpSaveFile for the parts and modules that cannot import it. */

import { stepLog } from './steplog.js';

// How this module says a failure: io.js hands it the app's own notice (io.js toast) as the page loads. Until then, and in a suite with no
// notice, a failure is only logged
var _say = null;
function saySet(fn) { if (typeof fn === 'function') _say = fn; }
function say(words) { try { if (_say) _say(words); } catch (e) {} }

// One step of a save in the app's step log. The file's kind is its last extension (a short word), its size a number: never its name
function saveLog(step, facts) { try { stepLog('savefile v1', step, facts || {}); } catch (e) {} }
function extOf(name) { var m = /\.([A-Za-z0-9]{1,12})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }

// The kinds of file the dialog offers, worked out from the file's name and type: one entry, its type without parameters, its last
// extension. A type or a name the dialog would not take gives no entry (the dialog then offers any file), never a dialog that throws
function typesOf(name, type, desc) {
    var ext = extOf(name), mime = String(type || '').split(';')[0].trim().toLowerCase();
    if (!ext || !/^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(mime)) return null;
    var accept = {}; accept[mime] = ['.' + ext];
    return [{ description: String(desc || (ext.toUpperCase() + ' file')).slice(0, 60), accept: accept }];
}

// The file handed to the browser as a download: the hidden <a download> link every export used. Answers true once it was handed over, false
// where the window refused (nothing then was saved). The link's address is let go a second later, or ten minutes later for a file past
// 50 MB, which the browser is still writing then. Called by a ticket's save where there is no dialog, and by io.js downloadBlob
function downloadNow(name, blob) {
    try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a'); a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, blob && blob.size > 50 * 1024 * 1024 ? 600000 : 1000);
        return true;
    } catch (e) { saveLog('download-failed', { ext: extOf(name) }); return false; }
}

// Writes a file to the handle the dialog gave: a writable opened, the whole Blob written, then closed, which is when the file on disk holds
// it. A write that fails is put down (abort) so a half-written file is not left as the person's file, and answers false
async function writeTo(handle, blob) {
    var w = null;
    try {
        w = await handle.createWritable();
        await w.write(blob);
        await w.close();
        return true;
    } catch (e) {
        if (w && typeof w.abort === 'function') { try { await w.abort(); } catch (e2) {} }
        return false;
    }
}

// Opens the save dialog, at the press: called in the same turn as the click (or key) that asked for the file, before anything the caller
// waits for. opts: { name: the file name the dialog suggests and a download uses, type: its MIME type, desc: words for its kind in the
// dialog, fail: the words said where the save fails (absent: '<name> could not be saved.'; false: the caller says it itself) }.
// Answers a ticket: { name, ready, state, handle, save(blob, name?), drop() }. ready settles to 'picked' (a file was picked: state and
// handle say which), 'cancel' (the person canceled), 'none' (no dialog in this window) or 'fallback' (the dialog would not open: the press
// had run out, or the window refused). The last two save as a download, as before
function saveStart(opts) {
    opts = opts || {};
    var name = String(opts.name || 'file'), ext = extOf(name);
    var t = { name: name, state: 'asking', handle: null, ready: null };
    var picker = typeof window !== 'undefined' ? window.showSaveFilePicker : null;
    if (typeof picker !== 'function') {
        t.state = 'none';
        t.ready = Promise.resolve('none');
    } else {
        var asked;
        try {
            var o = { suggestedName: name }, types = typesOf(name, opts.type, opts.desc);
            if (types) o.types = types;
            asked = picker.call(window, o);   // the dialog opens now, while the press still counts
        } catch (e) { asked = Promise.reject(e); }
        t.ready = Promise.resolve(asked).then(function(h) {
            if (!h || typeof h.createWritable !== 'function') { t.state = 'fallback'; saveLog('picker-odd', { ext: ext }); return 'fallback'; }
            t.handle = h; t.state = 'picked'; return 'picked';
        }, function(e) {
            if (e && e.name === 'AbortError') { t.state = 'cancel'; saveLog('canceled', { ext: ext }); return 'cancel'; }
            t.state = 'fallback'; saveLog('picker-refused', { ext: ext, why: e && typeof e.name === 'string' ? e.name : 'error' }); return 'fallback';
        });
    }
    // The file, once it is made: written to the file picked, or downloaded where no dialog could be had. name2 is the name a download takes
    // where the file's own name was known only once it was made (the dialog showed the caller's best guess). Answers how it went (above)
    t.save = function(blob, name2) {
        return t.ready.then(function(st) {
            if (st === 'cancel') return 'cancel';
            if (st === 'picked') {
                t.written = true;   // drop() never takes away a file this save wrote to, whatever the write came to
                return writeTo(t.handle, blob).then(function(ok) {
                    if (ok) { saveLog('saved', { ext: ext, kb: Math.round((blob && blob.size || 0) / 1024) }); return 'saved'; }
                    saveLog('write-failed', { ext: ext });
                    if (opts.fail !== false) say(typeof opts.fail === 'string' ? opts.fail : name + ' could not be saved.');
                    return 'failed';
                });
            }
            if (downloadNow(name2 || name, blob)) return 'download';
            if (opts.fail !== false) say(typeof opts.fail === 'string' ? opts.fail : (name2 || name) + ' could not be saved.');
            return 'failed';
        });
    };
    // The file will not be made after all (the export failed, or the host said no): nothing is written to it. Chromium makes the picked file
    // (or empties last week's file of that name) the moment the person confirms the dialog, so an empty file under the export's name would
    // otherwise stay on disk and look like a saved one (the review of a92c0d93, finding 2). drop() looks at the file: one that holds
    // anything is left exactly as it is; an empty one is taken away where the window can remove a file it was handed (handle.remove), and
    // where it cannot, one line says the file was left empty. Answers a promise of what it did: 'none' (no file was picked, or this save
    // already wrote to it), 'kept', 'removed' or 'empty'. opts.quiet: the caller says the empty file itself, in its own words
    t.drop = function(dopts) { return dropPicked(t, ext, dopts || {}); };
    return t;
}

// What a ticket's drop() does (above): the picked file's size read through the handle, then the file taken away where it is empty. A step
// that fails (the file cannot be read, or cannot be removed) is logged, never thrown; a file that cannot be read is left alone
function dropPicked(t, ext, dopts) {
    return t.ready.then(function(st) {
        if (st !== 'picked' || t.written || t.dropped) return 'none';
        t.dropped = true;
        var h = t.handle;
        var leftEmpty = function() {
            saveLog('dropped-empty', { ext: ext });
            if (!dopts.quiet) say(t.name + ' was left empty. Nothing was written to it.');
            return 'empty';
        };
        return Promise.resolve().then(function() { return typeof h.getFile === 'function' ? h.getFile() : null; }).then(function(f) {
            if (!f || typeof f.size !== 'number') { saveLog('dropped', { ext: ext, read: 0 }); return 'kept'; }
            if (f.size > 0) { saveLog('dropped', { ext: ext, kept: 1 }); return 'kept'; }   // it holds something: never taken away
            if (typeof h.remove !== 'function') return leftEmpty();
            return Promise.resolve().then(function() { return h.remove(); }).then(function() {
                saveLog('dropped', { ext: ext, removed: 1 }); return 'removed';
            }, function(e) { saveLog('remove-failed', { ext: ext, why: e && typeof e.name === 'string' ? e.name : 'error' }); return leftEmpty(); });
        }, function(e) { saveLog('dropped', { ext: ext, read: 0, why: e && typeof e.name === 'string' ? e.name : 'error' }); return 'kept'; });
    });
}

// Whether a notice may say the file was saved: written to the file picked, or handed over as a download (what a window with no dialog
// always did). A cancel or a failure says nothing of a save
function saved(how) { return how === 'saved' || how === 'download'; }

// A ticket's save, as a function of its own: for a part of a split script, whose words splitcheck reads (sysedtabs.js), to write through
// a ticket without spelling the method's name
function saveTo(ticket, blob, name2) { return ticket.save(blob, name2); }

if (typeof window !== 'undefined') window.wpSaveFile = { start: saveStart, saved: saved, saveTo: saveTo, downloadNow: downloadNow };

export { saveStart, saved, saveTo, downloadNow, saySet, typesOf };
