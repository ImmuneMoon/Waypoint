/* wbimglib.js: a part of whiteboard.js (docs/REFACTOR_SPLIT_PLAN.md, area 8, the Image Library; split 2026-11-19 with no change in
   behavior).
   What it holds: the Image Library, the GM's pictures of every campaign: its index and scope, its tags and saved filters (imgtagcore
   draws them), a category's files to delete ([sinkcheck:catfiles-*]), picking a picture for a block, a portrait or a look
   (window.wpPickImage), Pick many and the selection bar, the Campaign Cast's picks and their placing, adding a folder of pictures tagged by
   its name ([lookcheck:libfolder-*]), dragging a picture onto the map ([lookcheck:libdrag-*] and [lookcheck:libdrop-*]), the preview and
   its cast, and uploading a picture (with a website plan that takes no uploads in [lookcheck:noupload-*]). The library's state that the
   Campaign Cast's roster reads and sets (_imgLibPick, _castSel, _castOrder) stands in whiteboard.js just above this part's marker; this
   part sets it through imgLibPickSet and castSelSet.
   Why it looks this way: these lines stood in whiteboard.js, and they still run exactly where they stood. whiteboard.js calls wbImgLib()
   at its line `// [split:wbimglib.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines inside the install function, unchanged and as indented as they were, so that every test that reads
   whiteboard.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   whiteboard.js (live, so a value whiteboard.js changes later is read as it is then); the last line hands back the names whiteboard.js
   uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in
   whiteboard.js. */
// [split:of whiteboard.js]
import { TagCore, _castOrder, _castSel, _imgLibPick, addWbItem, castBatch, castLibraryHtml, castOf, castPlace, castSelSet, cssColor, esc, furnDropAt, getActiveCampaign, getActiveMap, groundPic, groupPlace, groupsLibraryHtml, imgLibPickSet, load, newOpacityProps, picRef, render, save, setCastBatch, showConfirm, showPrompt, state, toast, uid, viewCentre, wb, wbWrap, wbX, wbY } from './whiteboard.js';   // [split:glue]
export function wbImgLib() {   // [split:glue]
// [split:body-start]
  /* ---------- image library ---------- */

  var _imgLibCache = null;
  /* ---- library scope and categories (1.5.0) ----
     Scope. A picture belongs to a campaign when one of the campaign's items owns the folder it was uploaded
     into (the folder is the uploading item's id) or when the campaign uses it (play-map items, room scenes,
     portraits, handouts, page and planner picture blocks, the cast) or brought it in (camp.pictures).
     tutorial/ is Shared, whatever uses it. A picture nobody owns or uses is Unfiled.
     Categories. Two stores of one shape { list: [names], by: { path: [names] }, shelf: { name: true } }:
     appState.imageCats holds the SHARED categories (every campaign sees them; the tutorial's Default),
     camp.imageCats the campaign's own — GM bookkeeping that never leaves the machine (net.js sanitizeAppState,
     cleanup.js STRIPPED). A name is unique across a campaign's list and the shared list. Readers never
     create a store (an empty shaped store would count as local work for the cleanup classifier). */
  var EMPTY_CATS = Object.freeze({ list: Object.freeze([]), by: Object.freeze({}), shelf: Object.freeze({}) });
  var _imgLibCat = '';          // '' = the whole view, '__bymap', '__none', or a category name
  var _imgLibAlso = [];         // backlog 34: the tags Ctrl-click added to _imgLibCat's (the filter is _imgLibCat's and these)
  var _imgLibMatch = 'all';     // and which pictures they show: 'all' (every tag) or 'any' (one of them)
  var _imgLibSavedAt = -1;      // the campaign's saved filter that is what the view shows now, else -1
  var _imgLibCatCamp = null;    // the campaign the chip was chosen in: a switch resets it
  var _imgLibScope = 'camp';    // 'camp' | 'shared' | 'unfiled' | 'all'
  var _imgLibPicker = null;     // Import from another campaign…: the source ('<campId>' | 'shared' | 'unfiled'), else null
  var _imgLibStash = null;      // the main view's state while the picker is open
  var _imgIndex = null;         // built per open from the save: { refs: { path: [campIds] }, titles: { itemId: { title, campId, camp } } }
  // 1.6.2 (backlog 227): one quiet redraw after pictures turn out to be missing, however many failed at once
  var _picGoneT = 0;
  function picGoneSoon() { if (_picGoneT) return; _picGoneT = setTimeout(function() { _picGoneT = 0; if (typeof window.appRender === 'function') window.appRender(); }, 60); }
  function fixCats(c) { if (!Array.isArray(c.list)) c.list = []; if (!c.by || typeof c.by !== 'object') c.by = {}; if (!c.shelf || typeof c.shelf !== 'object') c.shelf = {}; return c; }
  function catStoreIn(data, store, create) {   // 'shared' or a campaign id; create only from a writer
      if (!data) return EMPTY_CATS;
      if (store === 'shared') {
          if (!data.imageCats || typeof data.imageCats !== 'object') { if (!create) return EMPTY_CATS; data.imageCats = { list: [], by: {}, shelf: {} }; }
          return fixCats(data.imageCats);
      }
      var camp = data.campaigns && data.campaigns[store]; if (!camp || typeof camp !== 'object') return EMPTY_CATS;
      if (!camp.imageCats || typeof camp.imageCats !== 'object') { if (!create) return EMPTY_CATS; camp.imageCats = { list: [], by: {}, shelf: {} }; }
      return fixCats(camp.imageCats);
  }
  function catStore(store, create) { return catStoreIn(state.appState, store, create); }
  function viewCampId() { if (_imgLibPicker && _imgLibPicker !== 'shared' && _imgLibPicker !== 'unfiled') return _imgLibPicker; var c = getActiveCampaign(); return c ? c.id : null; }
  // the stores a view reads: the viewed campaign's own, then the shared one
  function catStores() { var id = viewCampId(); var out = []; if (id) out.push({ key: id, c: catStore(id) }); out.push({ key: 'shared', c: catStore('shared') }); return out; }
  function catHome(name) { var id = viewCampId(); if (id && catStore(id).list.indexOf(name) >= 0) return id; if (catStore('shared').list.indexOf(name) >= 0) return 'shared'; return null; }
  function catList() { var out = []; catStores().forEach(function(s) { s.c.list.forEach(function(n) { out.push({ name: n, store: s.key }); }); }); return out; }
  function tagsIn(c, path) { var v = c.by[path]; if (!v) return []; return (Array.isArray(v) ? v : [v]).filter(function(n) { return c.list.indexOf(n) >= 0; }); }
  function imgCatsOf(path) { var out = []; catStores().forEach(function(s) { tagsIn(s.c, path).forEach(function(n) { if (out.indexOf(n) < 0) out.push(n); }); }); return out; }
  function imgCatOf(path) { var a = imgCatsOf(path); return a.length ? a.join(', ') : ''; }
  function imgCatHas(path, name) { return imgCatsOf(path).indexOf(name) >= 0; }
  function isShelved(name) { return catStores().some(function(s) { return !!s.c.shelf[name]; }); }
  // A picture's tags, written: each name goes to the store it lives in; an unknown name to the campaign's store
  function imgCatWrite(path, arr) {
      var byStore = {}, home = viewCampId() || 'shared';
      arr.forEach(function(n) { var h = catHome(n) || home; (byStore[h] = byStore[h] || []).push(n); });
      catStores().forEach(function(s) {
          if (byStore[s.key]) catStore(s.key, true).by[path] = byStore[s.key];
          else if (s.c.by[path]) delete s.c.by[path];
      });
  }
  function imgCatsSave() { import('./io.js').then(function(m) { m.save(true); }); }
  // Tag a set of pictures with a category (creating it), optionally on its own shelf; store = 'shared' or a campaign id (the tutorial uses 'shared')
  window.wpImgCatEnsure = function(name, paths, shelf, store) {
      var c = catStore(store || 'shared', true);
      if (c.list.indexOf(name) < 0) c.list.push(name);
      (paths || []).forEach(function(p) { var a = tagsIn(c, p); if (a.indexOf(name) < 0) { a.push(name); c.by[p] = a; } });
      if (shelf) c.shelf[name] = true;
  };
  // Rename a category in one store (list, tags, shelf); a no-op when it does not exist or the new name is taken
  window.wpImgCatRename = function(oldName, newName, store) {
      var c = catStore(store || 'shared'); if (c === EMPTY_CATS || c.list.indexOf(oldName) < 0 || c.list.indexOf(newName) >= 0) return false;
      c.list[c.list.indexOf(oldName)] = newName;
      Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === oldName ? newName : n; }); });
      if (c.shelf[oldName]) { delete c.shelf[oldName]; c.shelf[newName] = true; }
      if (c.priv && c.priv[oldName]) { delete c.priv[oldName]; c.priv[newName] = true; }   // 1.6.2 (backlog 227)
      return true;
  };
  /* ---- the scope index ---- */
  function pathKeys(p) { var out = [p]; try { var d = decodeURIComponent(p); if (d !== p) out.push(d); } catch (e) {} try { var en = encodeURI(p); if (en !== p) out.push(en); } catch (e) {} return out; }
  // Every campaign's item titles (first owner of an id wins) and every path each campaign uses
  function buildImgIndexFor(data) {
      var refs = {}, titles = {};
      var list = function(a) { return Array.isArray(a) ? a : []; };   // a key that holds no list (a planner's stray whiteboard, a file's) is skipped: the load runs this before anything reads the items
      var add = function(key, campId) { if (!key || typeof key !== 'string') return; pathKeys(key).forEach(function(k) { var a = refs[k] = refs[k] || []; if (a.indexOf(campId) < 0) a.push(campId); }); };
      Object.keys((data && data.campaigns) || {}).forEach(function(cid) {
          var camp = data.campaigns[cid]; if (!camp || typeof camp !== 'object') return;
          Object.keys(camp.items || {}).forEach(function(id) {
              var it = camp.items[id]; if (!it || typeof it !== 'object') return;
              if (!titles[id]) titles[id] = { title: (it.meta && it.meta.title) || id, campId: cid, camp: camp.name || cid };
              list(it.whiteboard).forEach(function(w) { if (w) { add(w.src, cid); add(w.texSrc, cid); if (w.frame && typeof w.frame === 'object') add(w.frame.src, cid); } });   // a token's kept original (the token creator) is the campaign's too
              list(it.rooms).forEach(function(r) { if (!r) return; add(r.image, cid); list(r.characters).forEach(function(ch) { if (ch) add(ch.portrait, cid); }); });
              list(it.blocks).forEach(function(b) { if (b) add(b.src, cid); });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (h) add(h.src, cid); });
          Object.values(camp.cast || {}).forEach(function(c) { if (c) add(c.src, cid); });
          Object.values(camp.chars && typeof camp.chars === 'object' ? camp.chars : {}).forEach(function(c) { if (c && typeof c === 'object') { add(c.portrait, cid); if (c.frame && typeof c.frame === 'object') add(c.frame.src, cid); } });   // characters' portraits and kept originals
          (Array.isArray(camp.pictures) ? camp.pictures : []).forEach(function(p) { add(p, cid); });
          list(camp.furnPacks).forEach(function(p) { if (p && p.looks && typeof p.looks === 'object') Object.keys(p.looks).forEach(function(k) { add(p.looks[k], cid); }); });   // 1.6.2 (backlog 222): a furnishing pack's pictures
      });
      return { refs: refs, titles: titles };
  }
  function buildImgIndex() { _imgIndex = buildImgIndexFor(state.appState); return _imgIndex; }
  function folderOf(p) { return String(p || '').replace(/^\/saves\/images\//, '').split('/').slice(0, -1).join('/'); }
  // the campaigns a picture belongs to (folder owner first, then every campaign using it); 'shared' for the tutorial art; [] = Unfiled
  function imgCampsFor(idx, path, folder) {
      if (/^tutorial(\/|$)/.test(folder || '')) return 'shared';
      var out = [], t = idx.titles[folder];
      if (t) out.push(t.campId);
      (idx.refs[path] || []).forEach(function(cid) { if (out.indexOf(cid) < 0) out.push(cid); });
      return out;
  }
  function imgCamps(im) { if (!_imgIndex) buildImgIndex(); return imgCampsFor(_imgIndex, im.path, im.folder); }
  function inScope(im, scope, campId) {
      var c = imgCamps(im);
      if (scope === 'all') return true;
      if (scope === 'shared') return c === 'shared';
      if (scope === 'unfiled') return c !== 'shared' && c.length === 0;
      return c !== 'shared' && !!campId && c.indexOf(campId) >= 0;
  }
  function notJournal(i) { return !/^journal(\/|$)/.test(i.folder || ''); }
  // The pictures of one campaign, for other pickers (the handout picker): list = what /api/list-images answered
  window.wpImgScope = function(list, campId) { buildImgIndex(); return (list || []).filter(function(im) { return notJournal(im) && inScope(im, 'camp', campId); }); };
  function pickerScope() { return _imgLibPicker === 'shared' ? 'shared' : _imgLibPicker === 'unfiled' ? 'unfiled' : 'camp'; }
  function scopedCache() {   // what the current view (the scope, or the picker's source) holds
      var list = (_imgLibCache || []).filter(notJournal);
      if (_imgLibPicker) return list.filter(function(im) { return inScope(im, pickerScope(), _imgLibPicker); });
      var camp = getActiveCampaign();
      return list.filter(function(im) { return inScope(im, _imgLibScope, camp ? camp.id : null); });
  }
  function shelfApplies() { var sc = _imgLibPicker ? pickerScope() : _imgLibScope; return sc === 'camp' || sc === 'all'; }   // Shared and Unfiled show shelved pictures too (owner's rule)
  function folderLabel(folder) {
      if (!_imgIndex) buildImgIndex();
      var t = _imgIndex.titles[folder], camp = getActiveCampaign();
      if (t) return t.campId === (camp && camp.id) ? t.title : t.title + ' (' + t.camp + ')';
      if (folder === 'tutorial') return 'Tutorial art';
      if (!folder || folder === 'unknown' || folder === 'null') return 'no map';
      return folder;
  }
  /* ---- the one-time migration (io.js load repair calls it; a Replace import too): today's app-wide categories
     move whole into the campaign that owns or uses most of each category's pictures; Default and any category
     no campaign claims stay shared. Idempotent by the _picsV marker. Returns true when something moved. ---- */
  window.wpMigratePictures = function(data) {
      if (!data || typeof data !== 'object' || data._picsV >= 1) return false;
      data._picsV = 1;
      if (!data.imageCats || typeof data.imageCats !== 'object') return false;
      var shared = fixCats(data.imageCats), idx = buildImgIndexFor(data), moved = 0;
      var campsOf = {};
      Object.keys(shared.by).forEach(function(p) { campsOf[p] = imgCampsFor(idx, p, folderOf(p)); });
      shared.list.slice().forEach(function(name) {
          if (name === 'Default') return;   // the tutorial's shelf stays shared
          var votes = {};
          Object.keys(shared.by).forEach(function(p) { if (tagsIn(shared, p).indexOf(name) < 0) return; var cs = campsOf[p]; if (cs === 'shared') return; cs.forEach(function(c) { votes[c] = (votes[c] || 0) + 1; }); });
          var best = null; Object.keys(votes).forEach(function(c) { if (!best || votes[c] > votes[best]) best = c; });
          if (!best || !data.campaigns[best]) return;
          var dest = catStoreIn(data, best, true);
          if (dest.list.indexOf(name) < 0) dest.list.push(name);
          if (shared.shelf[name]) { dest.shelf[name] = true; delete shared.shelf[name]; }
          Object.keys(shared.by).forEach(function(p) {
              var arr = tagsIn(shared, p); if (arr.indexOf(name) < 0) return;
              var d = Array.isArray(dest.by[p]) ? dest.by[p] : (dest.by[p] ? [dest.by[p]] : []); if (d.indexOf(name) < 0) d.push(name); dest.by[p] = d;
              var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) shared.by[p] = rest; else delete shared.by[p];
          });
          shared.list = shared.list.filter(function(n) { return n !== name; });
          moved++;
      });
      return moved > 0;
  };
  // A campaign is going (delete, discard, cleanup removal): its categories and tags move to the shared store so
  // the pictures, now Unfiled, keep their tags. A name the shared store already has takes the tags.
  window.wpReleaseCampaignTags = function(camp, data) {
      data = data || state.appState;
      if (!camp || !camp.imageCats || typeof camp.imageCats !== 'object') return false;
      var src = fixCats(camp.imageCats), dst = catStoreIn(data, 'shared', true), any = false;
      src.list.forEach(function(name) { if (dst.list.indexOf(name) < 0) dst.list.push(name); if (src.shelf[name]) dst.shelf[name] = true; });
      Object.keys(src.by).forEach(function(p) { var a = tagsIn(src, p); if (!a.length) return; var d = Array.isArray(dst.by[p]) ? dst.by[p] : (dst.by[p] ? [dst.by[p]] : []); a.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dst.by[p] = d; any = true; });
      delete camp.imageCats;
      return any;
  };
  // A campaign came back from a safety copy taken before categories moved into campaigns: the copy's
  // app-level tags for pictures this campaign owns or uses become its own (the copy is never changed)
  window.wpAdoptTags = function(camp, sourceCats, data) {
      data = data || state.appState;
      if (!camp || !sourceCats || typeof sourceCats !== 'object' || !data.campaigns || !data.campaigns[camp.id]) return false;
      var src = fixCats(JSON.parse(JSON.stringify(sourceCats))), idx = buildImgIndexFor(data), any = false;
      Object.keys(src.by).forEach(function(p) {
          var cs = imgCampsFor(idx, p, folderOf(p)); if (cs === 'shared' || cs.indexOf(camp.id) < 0) return;
          var names = tagsIn(src, p).filter(function(n) { return n !== 'Default'; }); if (!names.length) return;
          var dest = catStoreIn(data, camp.id, true);
          names.forEach(function(n) { if (dest.list.indexOf(n) < 0) { dest.list.push(n); if (src.shelf[n]) dest.shelf[n] = true; } });
          var d = Array.isArray(dest.by[p]) ? dest.by[p] : []; names.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dest.by[p] = d; any = true;
      });
      return any;
  };
  // Where a picture is used: play-map items, room scenes, portraits, handouts, page and planner pictures, the
  // cast, and campaigns that brought it in — across every campaign, encoded and plain spellings alike
  // [sinkcheck:catfiles-start]
  // Which of a category's pictures may lose their FILE with it (owner's rule, 2026-09-25): only the category's own. A picture another
  // campaign owns (its folder) or uses keeps its file and only loses the tag, so a category brought in by a file someone else made
  // can never take your other campaigns' pictures with it. store: the category's home ('shared' or a campaign id); owners(path) is
  // imgCampsFor: 'shared' for the tutorial art, else the campaigns that own or use the picture ([] = nobody's).
  function catFilesToDelete(paths, store, owners) {
      var go = [], kept = [];
      paths.forEach(function(p) {
          var c = owners(p);
          var mine = c === 'shared' ? store === 'shared' : Array.isArray(c) && c.every(function(id) { return id === store; });
          (mine ? go : kept).push(p);
      });
      return { go: go, kept: kept };
  }
  // A category's member whose FILE may be offered for deletion with it: a picture the Image Library itself lists — under saves/images,
  // by its extension, in a folder of its own — and never a file of the Journal's, a sound or a video another panel owns, or a path that
  // walks. A category's keys come from a campaign file, and whatever nobody "owns" (catFilesToDelete) would otherwise go.
  function catMemberFile(p) {
      if (typeof p !== 'string' || p.indexOf('/saves/images/') !== 0 || /[\\?#\x00-\x1f]/.test(p)) return false;
      var segs = p.slice(14).split('/');
      if (segs.length < 2 || segs.some(function(s) { return !s || /^[. ]+$/.test(s); })) return false;
      return !/^journal[. ]*$/i.test(segs[0]) && /\.(png|jpe?g|gif|webp|svg)$/i.test(p);
  }
  // [sinkcheck:catfiles-end]
  function imgUsage(src) {
      var n = 0, maps = {}, keys = pathKeys(src);
      var hit = function(v) { return !!v && keys.indexOf(v) >= 0; };
      Object.values(state.appState.campaigns || {}).forEach(function(camp) {
          Object.values(camp.items || {}).forEach(function(it) {
              var name = (it.meta && it.meta.title) || it.id;
              (it.whiteboard || []).forEach(function(w) { if (w && (hit(w.src) || hit(w.texSrc) || (w.frame && typeof w.frame === 'object' && hit(w.frame.src)))) { n++; maps[name] = 1; } });
              (it.rooms || []).forEach(function(r) { if (hit(r.image)) { n++; maps[name] = 1; } (r.characters || []).forEach(function(ch) { if (hit(ch.portrait)) { n++; maps[name] = 1; } }); });
              (it.blocks || []).forEach(function(b) { if (b && hit(b.src)) { n++; maps[name] = 1; } });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (hit(h.src)) { n++; maps['handouts'] = 1; } });
          Object.values(camp.cast || {}).forEach(function(c) { if (hit(c.src)) { n++; maps['the cast of ' + (camp.name || 'a campaign')] = 1; } });
          Object.values(camp.chars && typeof camp.chars === 'object' ? camp.chars : {}).forEach(function(c) { if (c && typeof c === 'object' && (hit(c.portrait) || (c.frame && typeof c.frame === 'object' && hit(c.frame.src)))) { n++; maps['the characters of ' + (camp.name || 'a campaign')] = 1; } });
          if ((Array.isArray(camp.pictures) ? camp.pictures : []).some(hit)) { n++; maps['brought into ' + (camp.name || 'a campaign')] = 1; }
          (Array.isArray(camp.furnPacks) ? camp.furnPacks : []).forEach(function(p) { if (p && p.looks && typeof p.looks === 'object' && Object.keys(p.looks).some(function(k) { return hit(p.looks[k]); })) { n++; maps['the furnishing pack ' + (typeof p.name === 'string' && p.name ? p.name : 'with no name') + ' of ' + (camp.name || 'a campaign')] = 1; } });   // 1.6.2 (backlog 222)
      });
      return { count: n, maps: Object.keys(maps) };
  }
  function isTagCat(v) { return !!v && v !== '__none' && v !== '__bymap'; }
  // the tags the view filters by: the chip picked first, then the ones Ctrl-click added (backlog 34)
  function pickedTags() { return isTagCat(_imgLibCat) ? [_imgLibCat].concat(_imgLibAlso) : []; }
  function soleTag() { return isTagCat(_imgLibCat) && !_imgLibAlso.length ? _imgLibCat : ''; }   // the one tag in view (its tools, Move and Remove)
  // a campaign's saved filters, kept in its own store (the shared store keeps none)
  function savedFilters(campId) { var c = campId ? catStore(campId) : EMPTY_CATS; return Array.isArray(c.filters) ? c.filters : []; }
  function nowFilter() { var s = document.getElementById('imgLibSearch'); return { tags: pickedTags(), match: _imgLibMatch, words: s ? s.value : '' }; }
  function scopeChip(val, label, n, title) { return '<button class="journal-from' + (_imgLibScope === val ? ' active' : '') + '" data-scope="' + val + '" title="' + esc(title) + '">' + label + ' <span class="journal-count">' + n + '</span></button>'; }
  // The chip row: a model of what it shows, drawn by imgtagcore drawRow with text nodes only (a tag's name comes from a campaign file)
  function renderImgCats() {
      var row = document.getElementById('imgLibCats'); if (!row) return;
      var camp = getActiveCampaign(), campId = camp ? camp.id : null;
      if (_imgLibCatCamp !== campId) { _imgLibCat = ''; _imgLibCatCamp = campId; }
      var list = scopedCache(), counts = {}, none = 0, shelf = shelfApplies();
      list.forEach(function(im) { var ns = imgCatsOf(im.path); if (ns.length) ns.forEach(function(n) { counts[n] = (counts[n] || 0) + 1; }); else none++; });
      var cats = catList();
      if (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap' && !cats.some(function(c) { return c.name === _imgLibCat; })) _imgLibCat = '';
      _imgLibAlso = isTagCat(_imgLibCat) ? _imgLibAlso.filter(function(n, i, a) { return n !== _imgLibCat && a.indexOf(n) === i && cats.some(function(c) { return c.name === n; }); }) : [];
      var pk = pickedTags();
      var allN = list.filter(function(im) { return !shelf || !imgCatsOf(im.path).some(isShelved); }).length;
      var m = { scopes: [], imp: false, all: { count: allN, active: !_imgLibCat }, bymap: _imgLibCat === '__bymap', none: { count: none, active: _imgLibCat === '__none' }, make: !_imgLibPicker, tools: null,
          match: pk.length > 1 ? _imgLibMatch : null, saved: null,
          tags: cats.map(function(c) { return { name: c.name, store: c.store, count: counts[c.name] || 0, active: pk.indexOf(c.name) >= 0, priv: TagCore.isPrivate(catStore(c.store), c.name) }; }) };
      if (!_imgLibPicker) {   // the scope row: which pictures
          var all = (_imgLibCache || []).filter(notJournal), nCamp = 0, nShared = 0, nUnf = 0;
          all.forEach(function(im) { if (inScope(im, 'camp', campId)) nCamp++; if (inScope(im, 'shared')) nShared++; if (inScope(im, 'unfiled')) nUnf++; });
          m.scopes = [
              { scope: 'camp', text: camp ? String(camp.name || '') : 'This campaign', count: nCamp, title: 'Pictures uploaded from this campaign\'s maps, planners and pages, used by them, or brought in', active: _imgLibScope === 'camp' },
              { scope: 'shared', text: 'Shared', count: nShared, title: 'Pictures every campaign can use: the tutorial art', active: _imgLibScope === 'shared' },
              { scope: 'unfiled', text: 'Unfiled', count: nUnf, title: 'Pictures whose map, planner or page is gone and that no campaign uses', active: _imgLibScope === 'unfiled' },
              { scope: 'all', text: 'All campaigns', count: all.length, title: 'Every picture in your saves folder', active: _imgLibScope === 'all' }];
          m.imp = true;
      }
      if (!_imgLibPicker && soleTag()) {
          var home = catHome(_imgLibCat), c = home ? catStore(home) : EMPTY_CATS;
          m.tools = { shelf: !!c.shelf[_imgLibCat], shared: home === 'shared', priv: TagCore.isPrivate(c, _imgLibCat) };
      }
      _imgLibSavedAt = -1;
      if (!_imgLibPicker && campId) {   // the Saved row: this campaign's filters; another campaign's only when asked for (Import from another campaign…)
          var sv = savedFilters(campId), now = nowFilter();
          sv.forEach(function(f, i) { if (_imgLibSavedAt < 0 && TagCore.sameFilter(f, now)) _imgLibSavedAt = i; });
          m.saved = { list: sv.map(function(f, i) { return { name: f.name, active: i === _imgLibSavedAt }; }), save: _imgLibSavedAt < 0 && (pk.length > 0 || TagCore.words(now.words).length > 0), imp: true, tools: _imgLibSavedAt >= 0 };
      }
      var KP = typeof window.wpKeepPlace === 'function' ? window.wpKeepPlace : null;   // 1.6.2: a chip pressed keeps the row where it stood, and the focus on that chip
      if (KP) KP(row, function() { TagCore.drawRow(document, row, m); }); else TagCore.drawRow(document, row, m);
  }
  function tagLog(step, facts) { if (window.wpStepLog) window.wpStepLog('imglib v1', step, facts); }   // structure only: counts and the store's kind, never a tag's name
  // act: 'add' (tag with another), 'move' (drop the current view's category, tag with the chosen one), 'remove'
  function imgCatApply(path, act, name) {
      var cur = imgCatsOf(path), from = soleTag();
      if (act === 'remove') cur = cur.filter(function(n) { return n !== name; });
      else {
          if (act === 'move' && from) cur = cur.filter(function(n) { return n !== from; });
          if (name && cur.indexOf(name) < 0) cur.push(name);
      }
      imgCatWrite(path, cur);
  }
  function imgCatChange(path, act, name) {   // one path, or the picked set as an array
      var many = Array.isArray(path);
      (many ? path : [path]).forEach(function(p) { imgCatApply(p, act, name); });
      imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      tagLog('tag-' + act, { pics: many ? path.length : 1 });
      if (many) { toast(path.length + ' picture' + (path.length === 1 ? '' : 's') + (act === 'remove' ? (path.length === 1 ? ' loses' : ' lose') + ' the tag ' : act === 'move' ? ' moved to ' : ' tagged ') + '"' + name + '".'); return; }
      var pv = document.getElementById('imgLibPreview');
      if (pv && pv.style.display !== 'none' && pv.dataset.src === path) openImgPreview(path);
  }
  function imgCatAssign(path, name) { imgCatChange(path, 'add', name); }   // kept for older callers
  // A new tag in this campaign's store (or the shared one); a name either store already has is refused
  function imgCatNew(cb, shared) {
      showPrompt(shared ? 'New shared tag (every campaign sees it):' : 'New tag:', '', function(name) {
          name = TagCore.tagName(String(name || '')); if (!name) return;
          var home = catHome(name);
          if (home) { toast('"' + name + '" already exists' + (home === 'shared' ? ' as a shared tag.' : ' in this campaign.')); return; }
          var c = catStore(shared ? 'shared' : (viewCampId() || 'shared'), true);
          c.list.push(name);
          tagLog('tag-new', { store: shared ? 'shared' : 'camp' });
          imgCatsSave(); if (cb) cb(name); else renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  /* ---- saved filters (backlog 34; the owner: "chips, kept with the campaign, export/ importable from another campaign without always showing
     by default"): what is picked now, the tags, the switch and the words, under a name, in the campaign's own store ---- */
  function filterList(campId, create) { var c = catStore(campId, create); if (c === EMPTY_CATS) return null; if (!Array.isArray(c.filters)) { if (!create) return []; c.filters = []; } return c.filters; }
  function filterAt(list, name, skip) { var at = -1; list.forEach(function(x, i) { if (at < 0 && i !== skip && String(x.name).toLowerCase() === String(name).toLowerCase()) at = i; }); return at; }
  function filterTidy(campId) { var c = catStore(campId); if (c !== EMPTY_CATS && Array.isArray(c.filters) && !c.filters.length) delete c.filters; }
  function saveFilter() {
      var camp = getActiveCampaign(); if (!camp) return;
      var now = nowFilter(); now.words = TagCore.filterWords(now.words);
      if (!now.tags.length && !now.words) return;
      showPrompt('Save this filter as:', TagCore.tagName(now.tags.slice(0, 3).join(' + ') || now.words), function(name) {
          name = TagCore.tagName(String(name || '')); if (!name) return;
          var f = TagCore.cleanFilter({ name: name, tags: now.tags, match: now.match, words: now.words }); if (!f) return;
          var list = filterList(camp.id, true), at = filterAt(list, name, -1);
          var put = function() {
              if (at >= 0) list[at] = f;
              else if (list.length >= TagCore.LIMITS.filters) { toast('This campaign keeps ' + TagCore.LIMITS.filters + ' saved filters at most. Delete one first.'); return; }
              else list.push(f);
              tagLog('filter-save', { tags: f.tags.length, words: !!f.words, over: at >= 0 });
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast('Saved "' + f.name + '". Its chip is under Saved.');
          };
          if (at >= 0) showConfirm('This campaign already has a saved filter "' + list[at].name + '". Put this one in its place?', function(yes) { if (yes) put(); });
          else put();
      });
  }
  function applySaved(i) {
      var camp = getActiveCampaign(), f = camp ? savedFilters(camp.id)[i] : null; if (!f) return;
      var have = catList().map(function(c) { return c.name; }), tags = f.tags.filter(function(t) { return have.indexOf(t) >= 0; }), gone = f.tags.length - tags.length;
      _imgLibCat = tags[0] || ''; _imgLibAlso = tags.slice(1); _imgLibMatch = f.match === 'any' ? 'any' : 'all';
      var s = document.getElementById('imgLibSearch'); if (s) s.value = f.words;
      tagLog('filter-apply', { tags: tags.length, gone: gone, words: !!f.words });
      renderImgLib(s ? s.value : '');
      if (gone) toast(gone + ' of its tags ' + (gone === 1 ? 'is' : 'are') + ' gone, so it shows what the rest pick.');
  }
  function renameFilter() {
      var camp = getActiveCampaign(), list = camp ? filterList(camp.id, false) : null, at = _imgLibSavedAt; if (!list || !list[at]) return;
      showPrompt('Rename saved filter:', list[at].name, function(name) {
          name = TagCore.tagName(String(name || '')); if (!name || name === list[at].name) return;
          if (filterAt(list, name, at) >= 0) { toast('This campaign already has a saved filter "' + name + '".'); return; }
          list[at].name = name;
          tagLog('filter-rename', { n: list.length });
          imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  function deleteFilter() {
      var camp = getActiveCampaign(), list = camp ? filterList(camp.id, false) : null, at = _imgLibSavedAt; if (!list || !list[at]) return;
      showConfirm('Delete the saved filter "' + list[at].name + '"? No tag or picture changes.', function(yes) {
          if (!yes || !list[at]) return;
          list.splice(at, 1); filterTidy(camp.id);
          tagLog('filter-delete', { left: list.length });
          imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // Import from another campaign…: the other campaigns' saved filters, asked for, never shown by default
  function openFilterImport(x, y) {
      var menu = document.getElementById('imgCatMenu'), me = getActiveCampaign(), s = state.appState; if (!menu || !me) return;
      var groups = [];
      Object.keys((s && s.campaigns) || {}).forEach(function(cid) { if (cid === me.id) return; var fl = savedFilters(cid); if (fl.length) groups.push({ camp: cid, name: String((s.campaigns[cid] && s.campaigns[cid].name) || 'A campaign'), filters: fl }); });
      TagCore.drawFilterMenu(document, menu, groups);
      menu.dataset.src = ''; menu.dataset.multi = '';
      menu.style.display = 'flex'; menu.classList.add('show');
      window.wpClampMenu(menu, x, y);
  }
  // one of them becomes this campaign's: a name it has is numbered, a tag it lacks is made here (with no pictures yet)
  function takeFilter(cid, i) {
      var me = getActiveCampaign(), f = savedFilters(cid)[i]; if (!me || !f || cid === me.id) return;
      var list = filterList(me.id, true);
      if (list.length >= TagCore.LIMITS.filters) { toast('This campaign keeps ' + TagCore.LIMITS.filters + ' saved filters at most. Delete one first.'); return; }
      var name = TagCore.freeName(f.name, list), nf = name ? TagCore.cleanFilter({ name: name, tags: f.tags, match: f.match, words: f.words }) : null; if (!nf) return;
      var c = catStore(me.id, true), made = 0;
      nf.tags.forEach(function(t) { if (!catHome(t) && c.list.length < TagCore.LIMITS.tags) { c.list.push(t); made++; } });
      list.push(nf);
      tagLog('filter-import', { tags: nf.tags.length, made: made });
      imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      toast('"' + name + '" is saved here now.' + (made ? ' ' + made + ' of its tags ' + (made === 1 ? 'was' : 'were') + ' new here and ' + (made === 1 ? 'is' : 'are') + ' made in this campaign, with no pictures yet.' : ''));
  }
  // The tag menu for one picture. Inside a tag's view it offers Move (out of this one, into
  // another) and Remove; everywhere it offers Add (a picture can wear several tags).
  function openImgCatMenu(src, x, y) {   // src: one path, or an array (the picked set)
      var menu = document.getElementById('imgCatMenu'); if (!menu) return;
      var many = Array.isArray(src), mine = many ? [] : imgCatsOf(src);
      var from = soleTag();
      var others = catList().filter(function(c) { return mine.indexOf(c.name) < 0; }), paths = many ? src : [src];
      // backlog 34: every tag, marked when all or some of the pictures have it; Move and Remove only in a tag's own view (backlog 181: Show as a scene for one picture)
      var tags = catList().map(function(c) { var n = paths.filter(function(p) { return imgCatsOf(p).indexOf(c.name) >= 0; }).length; return { name: c.name, store: c.store, state: TagCore.tagState(n, paths.length), n: n, of: paths.length }; });
      TagCore.drawMenu(document, menu, { scene: !many && !!window.wpScene, head: many ? 'Tags of ' + paths.length + ' pictures' : 'Tags', tags: tags, from: from && (many || mine.indexOf(from) >= 0) ? from : '', move: others });
      menu.dataset.src = many ? '' : src; menu.dataset.multi = many ? '1' : '';
      menu.style.display = 'flex'; menu.classList.add('show');
      window.wpClampMenu(menu, x, y);
  }
  function hideImgCatMenu() { var m = document.getElementById('imgCatMenu'); if (m) m.classList.remove('show'), m.style.display = 'none'; }
  /* ---- the picker: Import from another campaign… ---- */
  function renderImgSource() {
      var wrap = document.getElementById('imgLibSourceWrap'), sel = document.getElementById('imgLibSource'); if (!wrap || !sel) return;
      if (!_imgLibPicker) { wrap.style.display = 'none'; return; }
      var s = state.appState, me = getActiveCampaign(), all = (_imgLibCache || []).filter(notJournal), opts = [];
      Object.keys((s && s.campaigns) || {}).forEach(function(cid) {
          if (me && cid === me.id) return;
          var n = all.filter(function(im) { return inScope(im, 'camp', cid); }).length;
          opts.push('<option value="' + esc(cid) + '"' + (_imgLibPicker === cid ? ' selected' : '') + '>' + esc(s.campaigns[cid].name || cid) + ' (' + n + ')</option>');
      });
      opts.push('<option value="shared"' + (_imgLibPicker === 'shared' ? ' selected' : '') + '>Shared (' + all.filter(function(im) { return inScope(im, 'shared'); }).length + ')</option>');
      opts.push('<option value="unfiled"' + (_imgLibPicker === 'unfiled' ? ' selected' : '') + '>Unfiled (' + all.filter(function(im) { return inScope(im, 'unfiled'); }).length + ')</option>');
      sel.innerHTML = opts.join('');
      wrap.style.display = 'inline-flex';
  }
  function enterPicker() {
      if (_imgLibPicker) return;
      var s = state.appState, me = getActiveCampaign();
      if (!me) return;
      var first = Object.keys((s && s.campaigns) || {}).filter(function(cid) { return cid !== me.id; })[0] || 'shared';
      var grid = document.getElementById('imgLibGrid'), search = document.getElementById('imgLibSearch');
      _imgLibStash = { scope: _imgLibScope, cat: _imgLibCat, also: _imgLibAlso, match: _imgLibMatch, search: search ? search.value : '', sel: _imgLibSel, last: _imgLibLastPick, scroll: grid ? grid.scrollTop : 0 };
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = '';
      if (search) search.value = '';
      closeImgPreview();
      _imgLibPicker = first;
      renderImgLib('');
  }
  function exitPicker(keepSel) {
      if (!_imgLibPicker) return;
      var st = _imgLibStash || {}; _imgLibPicker = null; _imgLibStash = null;
      _imgLibScope = st.scope || 'camp'; _imgLibCat = st.cat || ''; _imgLibAlso = st.also || []; _imgLibMatch = st.match || 'all'; _imgLibSel = keepSel ? {} : (st.sel || {}); _imgLibLastPick = st.last || null;
      var search = document.getElementById('imgLibSearch'); if (search) search.value = st.search || '';
      closeImgPreview();
      renderImgLib(search ? search.value : '');
      var grid = document.getElementById('imgLibGrid'); if (grid) grid.scrollTop = st.scroll || 0;
  }
  // The picked pictures become this campaign's by reference (camp.pictures): no file is copied
  function bringPictures(paths) {
      var camp = getActiveCampaign(); if (!camp || !paths.length) return;
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      camp.pictures = Array.isArray(camp.pictures) ? camp.pictures : [];
      var n = 0; paths.forEach(function(p) { if (camp.pictures.indexOf(p) < 0) { camp.pictures.push(p); n++; } });
      _imgIndex = null;
      exitPicker(true);
      imgCatsSave();
      toast(n + ' picture' + (n === 1 ? '' : 's') + ' brought into ' + (camp.name || 'this campaign') + '. Tag ' + (n === 1 ? 'it' : 'them') + ' here as you like.');
  }
  (function wireImgCats() {
      var row = document.getElementById('imgLibCats'), grid = document.getElementById('imgLibGrid'), menu = document.getElementById('imgCatMenu');
      if (!row || !grid || !menu) return;
      var srcSel = document.getElementById('imgLibSource');
      if (srcSel) srcSel.addEventListener('change', function() { if (!_imgLibPicker) return; _imgLibPicker = this.value; _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = ''; closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value); });
      row.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var act = b.dataset.act;
          if (b.dataset.match) { _imgLibMatch = b.dataset.match === 'any' ? 'any' : 'all'; tagLog('filter-match', { any: _imgLibMatch === 'any' }); renderImgLib(document.getElementById('imgLibSearch').value); return; }   // backlog 34
          if (b.dataset.saved !== undefined) { applySaved(+b.dataset.saved); return; }
          if (act === 'filter-save') { saveFilter(); return; }
          if (act === 'filter-rename') { renameFilter(); return; }
          if (act === 'filter-delete') { deleteFilter(); return; }
          if (act === 'filter-import') { var rI = b.getBoundingClientRect(); openFilterImport(rI.left, rI.bottom + 4); return; }
          if (act === 'picker') { if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; } enterPicker(); return; }
          if (b.dataset.scope !== undefined) { _imgLibScope = b.dataset.scope; _imgLibSel = {}; _imgLibLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); return; }
          if (act === 'new' || act === 'new-shared') { imgCatNew(function(name) { _imgLibCat = name; renderImgLib(document.getElementById('imgLibSearch').value); }, act === 'new-shared'); return; }
          if (act === 'shelf') {
              var home = catHome(_imgLibCat); if (!home) return;
              var cs = catStore(home, true); if (cs.shelf[_imgLibCat]) delete cs.shelf[_imgLibCat]; else cs.shelf[_imgLibCat] = true;
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              tagLog('tag-shelf', { on: !!cs.shelf[_imgLibCat] });
              toast(cs.shelf[_imgLibCat] ? '"' + _imgLibCat + '" is on its own shelf: its pictures no longer appear under All.' : '"' + _imgLibCat + '" shows under All again.');
              return;
          }
          if (act === 'private') {   // 1.6.2 (backlog 227): on Full export this tag starts unticked; the mark lives in the tag's own store
              var homeP = catHome(_imgLibCat); if (!homeP) return;
              var csP = catStore(homeP, true), onP = TagCore.setPrivate(csP, _imgLibCat, !TagCore.isPrivate(csP, _imgLibCat));
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              tagLog('tag-private', { on: onP, store: homeP === 'shared' ? 'shared' : 'camp' });
              toast(onP ? '"' + _imgLibCat + '" is private: on Full export its pictures start unticked.' : '"' + _imgLibCat + '" is no longer private.');
              return;
          }
          if (act === 'share') {   // move a category with its tags between the campaign's store and the shared one
              var name = _imgLibCat, from = catHome(name), me = viewCampId(); if (!from || !me) return;
              var to = from === 'shared' ? me : 'shared';
              if (catStore(to).list.indexOf(name) >= 0) { toast('"' + name + '" already exists ' + (to === 'shared' ? 'as a shared tag.' : 'in this campaign.')); return; }
              var a = catStore(from, true), z = catStore(to, true);
              z.list.push(name); if (a.shelf[name]) { z.shelf[name] = true; delete a.shelf[name]; }
              if (TagCore.isPrivate(a, name)) { TagCore.setPrivate(z, name, true); TagCore.setPrivate(a, name, false); }   // 1.6.2: the private mark moves with the tag
              Object.keys(a.by).forEach(function(p) { var arr = tagsIn(a, p); if (arr.indexOf(name) < 0) return; var d = Array.isArray(z.by[p]) ? z.by[p] : []; if (d.indexOf(name) < 0) d.push(name); z.by[p] = d; var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) a.by[p] = rest; else delete a.by[p]; });
              a.list = a.list.filter(function(n) { return n !== name; });
              tagLog('tag-share', { to: to === 'shared' ? 'shared' : 'camp' });
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(to === 'shared' ? '"' + name + '" is shared now: every campaign sees it.' : '"' + name + '" is this campaign\'s own now.');
              return;
          }
          if (act === 'rename') {
              var old = _imgLibCat, homeR = catHome(old); if (!homeR) return;
              var c = catStore(homeR, true);
              showPrompt('Rename tag:', old, function(name) {
                  name = TagCore.tagName(String(name || '')); if (!name || name === old) return;
                  if (catHome(name)) { toast('"' + name + '" already exists.'); return; }
                  var i = c.list.indexOf(old); if (i >= 0) c.list[i] = name;
                  Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === old ? name : n; }); });
                  if (c.shelf[old]) { delete c.shelf[old]; c.shelf[name] = true; }
                  if (c.priv && c.priv[old]) { delete c.priv[old]; c.priv[name] = true; }   // 1.6.2: and its private mark
                  tagLog('tag-rename', { store: homeR === 'shared' ? 'shared' : 'camp' });
                  _imgLibCat = name; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              });
              return;
          }
          if (act === 'delete') {
              var del = _imgLibCat, homeD = catHome(del); if (!homeD) return;
              var cc = catStore(homeD, true), n = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0; }).length;
              showConfirm('Delete the tag "' + del + '"? ' + (n ? n + ' picture' + (n === 1 ? ' loses' : 's lose') + ' it — no picture is deleted.' : 'No picture has it.'), function(yes) {
                  if (!yes) return;
                  var members = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0 && catMemberFile(p); });
                  TagCore.setPrivate(cc, del, false); cc.list = cc.list.filter(function(x) { return x !== del; }); delete cc.shelf[del];
                  Object.keys(cc.by).forEach(function(p) { var rest = tagsIn(cc, p); if (rest.length) cc.by[p] = rest; else delete cc.by[p]; });
                  tagLog('tag-delete', { pics: members.length, store: homeD === 'shared' ? 'shared' : 'camp' });
                  _imgLibCat = ''; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                  // Offer to remove the pictures' files as well (the tag itself is only a word) — the category's OWN pictures only:
                  // one another campaign owns or uses keeps its file and just loses the tag (catFilesToDelete)
                  if (members.length) {
                      var idxD = buildImgIndex(), split = catFilesToDelete(members, homeD, function(p) { return imgCampsFor(idxD, p, folderOf(p)); });
                      var files = split.go, keptN = split.kept.length;
                      var keptNote = keptN ? keptN + ' of its pictures ' + (keptN === 1 ? 'keeps its file — it belongs to another campaign or to Shared — and only loses' : 'keep their files — they belong to another campaign or to Shared — and only lose') + ' the tag.' : '';
                      if (!files.length) { toast(keptNote); return; }
                      var used = files.filter(function(p) { return imgUsage(p).count > 0; }).length;
                      showConfirm('Also delete the ' + files.length + ' picture file' + (files.length === 1 ? ' that was' : 's that were') + ' tagged "' + del + '" from your saves folder? This cannot be undone.' + (used ? '\n\n' + used + ' of them ' + (used === 1 ? 'is' : 'are') + ' still used somewhere (a map, a handout, a page, the cast, or brought into a campaign) and would show as broken there.' : '') + (keptNote ? '\n\n' + keptNote : ''), function(yesFiles) {
                          if (!yesFiles) return;
                          var i = 0, gone = [], oldCore = false;
                          function next() {
                              if (i >= files.length) {
                                  var goneSet = {}; gone.forEach(function(p) { goneSet[p] = 1; });
                                  _imgLibCache = (_imgLibCache || []).filter(function(im) { return !goneSet[im.path]; });
                                  gone.forEach(function(p) { catStores().forEach(function(s) { if (s.c.by[p]) delete s.c.by[p]; }); }); imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                                  toast(oldCore ? 'Deleting pictures needs the 1.4.6 core. Run the installer from Settings \u2192 Updates and about.' : 'Deleted ' + gone.length + ' picture file' + (gone.length === 1 ? '' : 's') + '.' + (keptN ? ' ' + keptNote : ''));
                                  return;
                              }
                              var batch = files.slice(i, i + 4); i += 4;
                              Promise.all(batch.map(function(src) { return fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) { if (r.status === 404 && !r.headers.get('content-type')) oldCore = true; else if (r.ok) gone.push(src); }).catch(function() {}); })).then(next);
                          }
                          next();
                      });
                  }
              });
              return;
          }
          if (b.dataset.cat !== undefined) {
              var cv = b.dataset.cat;
              if ((e.ctrlKey || e.metaKey) && isTagCat(cv) && isTagCat(_imgLibCat)) {   // backlog 34: Ctrl-click adds a tag to the filter, or takes one off
                  var pkC = pickedTags(), atC = pkC.indexOf(cv);
                  if (atC < 0) pkC.push(cv); else if (pkC.length > 1) pkC.splice(atC, 1);
                  _imgLibCat = pkC[0]; _imgLibAlso = pkC.slice(1);
                  tagLog('filter-tags', { tags: pkC.length });
              } else { _imgLibCat = cv; _imgLibAlso = []; }
              renderImgLib(document.getElementById('imgLibSearch').value);
          }
      });
      // right-click a picture: give it a tag (and, inside a tag's view, move it or take it off)
      grid.addEventListener('contextmenu', function(e) {
          var cell = e.target.closest && e.target.closest('.img-lib-cell'); if (!cell || cell.classList.contains('cast-cell') || _imgLibPicker) return;
          e.preventDefault(); e.stopPropagation();
          var pickedN = Object.keys(_imgLibSel);
          openImgCatMenu(_imgLibSel[cell.dataset.src] && pickedN.length > 1 ? pickedN : cell.dataset.src, e.clientX, e.clientY);   // backlog 34: a picked picture speaks for all the picked
      });
      menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          e.stopPropagation();
          var src = menu.dataset.multi ? Object.keys(_imgLibSel) : menu.dataset.src, act = b.dataset.act, cat = b.dataset.cat || ''; hideImgCatMenu();
          if (act === 'filter-take') { takeFilter(b.dataset.camp, +b.dataset.i); return; }   // backlog 34: a saved filter of another campaign
          if (menu.dataset.multi && !src.length) return;
          if (act === 'scene') { if (!menu.dataset.multi && window.wpScene) window.wpScene.open(src); return; }   // backlog 181
          if (act === 'new-add' || act === 'new-move') { imgCatNew(function(name) { imgCatChange(src, act === 'new-move' ? 'move' : 'add', name); }); return; }
          if (act === 'toggle') { var tps = Array.isArray(src) ? src : [src]; imgCatChange(src, tps.every(function(p) { return imgCatsOf(p).indexOf(cat) >= 0; }) ? 'remove' : 'add', cat); return; }   // backlog 34: to all, or from all when all have it
          if (act === 'add' || act === 'move' || act === 'remove') imgCatChange(src, act, cat);
      });
      document.addEventListener('pointerdown', function(e) { if (menu.style.display !== 'none' && !e.target.closest('#imgCatMenu')) hideImgCatMenu(); }, true);
      var copiesBox = document.getElementById('imgLibCopies');
      if (copiesBox) {
          copiesBox.addEventListener('input', function() { if (copiesBox.value >= 1 && copiesBox.value <= 50) setCastBatch(copiesBox.value); });
          copiesBox.addEventListener('change', function() { copiesBox.value = setCastBatch(copiesBox.value); });
      }
      var selBar = document.getElementById('imgLibSelBar');
      if (selBar) selBar.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var picked = Object.keys(_imgLibSel);
          if (b.dataset.act === 'clear') { _imgLibSel = {}; castSelSet({}); _castLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); }
          else if (b.dataset.act === 'back') exitPicker(false);
          else if (b.dataset.act === 'bring') bringPictures(picked);
          else if (b.dataset.act === 'add-map') placeImagesBlock(picked);
          else if (b.dataset.act === 'cat') { var r = b.getBoundingClientRect(); openImgCatMenu(picked, r.left, r.top - 4); }
          else if (b.dataset.act === 'add-cast') placeCastPicked();
          else if (b.dataset.act === 'all') { selectAllShown(); renderImgLib(document.getElementById('imgLibSearch').value); }
          else if (b.dataset.act === 'done') { _imgLibSelMode = false; renderImgLib(document.getElementById('imgLibSearch').value); }
      });
      var selBtn = document.getElementById('imgLibSelectBtn');   // backlog 34: Select, so a plain click picks
      if (selBtn) selBtn.addEventListener('click', function() { _imgLibSelMode = !_imgLibSelMode; tagLog('select', { on: _imgLibSelMode }); closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value); });
      document.addEventListener('keydown', function(e) {   // Ctrl+A in the library picks everything in view
          var modal = document.getElementById('imgLibModal'), pv = document.getElementById('imgLibPreview');
          if (!modal || modal.style.display === 'none' || (pv && pv.style.display !== 'none') || (_imgLibPick && !_imgLibPicker)) return;
          if (!(e.ctrlKey || e.metaKey) || (e.key !== 'a' && e.key !== 'A') || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
          e.preventDefault(); e.stopPropagation();
          selectAllShown();
          renderImgLib(document.getElementById('imgLibSearch').value);
      }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && (!window.wpEsc || window.wpEsc.free(e))) hideImgCatMenu(); });   // 1.5.4: esckey.js puts it away, one thing a press
  })();

  function renderImgLib(filter) {
      var grid = document.getElementById('imgLibGrid');
      if (!grid || !_imgLibCache) return;
      if (!_imgIndex) buildImgIndex();
      // players' journals live under images/journal/ — not campaign art, keep them out of the library
      _imgLibCache = _imgLibCache.filter(notJournal);
      // The Campaign Cast shows inside a shelf category (the tutorial's "Default") and nowhere else — and only under THIS campaign's own scope, never the Shared/Unfiled/All-campaigns views (the cast is a per-campaign store with no picture category/scope tags, so a scope chip can't filter it).
      grid.dataset.cast = (!_imgLibPick && !_imgLibPicker && state.viewMode === 'visual' && _imgLibScope === 'camp' && !!(soleTag() && isShelved(soleTag()))) ? '1' : '';
      if (!grid.dataset.cast) { castSelSet({}); _castLastPick = null; }   // cast roster hidden: drop any cast picks so a stale count can't linger
      renderImgCats(); renderImgSource();
      var shelf = shelfApplies(), byMap = _imgLibCat === '__bymap', picked = pickedTags(), ws = TagCore.words(filter);   // backlog 34: the tags picked (all or any) and every word typed
      var byFolder = {};
      scopedCache().forEach(function(im) {
          var label = folderLabel(im.folder), cat = imgCatOf(im.path);
          if (_imgLibCat === '__none' ? cat : (picked.length && !TagCore.matchTags(imgCatsOf(im.path), picked, _imgLibMatch))) return;
          if ((!_imgLibCat || byMap) && shelf && imgCatsOf(im.path).some(isShelved)) return;   // shelved pictures show under their own category only
          if (!TagCore.matchWords([im.name, label].concat(imgCatsOf(im.path)), ws)) return;
          var key = byMap ? label : '';
          (byFolder[key] = byFolder[key] || []).push(im);
      });
      var html = ''; _imgLibOrder = [];
      var pickable = !_imgLibPick || _imgLibPicker;
      Object.keys(byFolder).sort().forEach(function(label) {
          if (label) html += '<div style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin:12px 0 6px;">' + esc(label) + ' <span style="color:var(--dim);">(' + byFolder[label].length + ')</span></div>';
          html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">';
          byFolder[label].forEach(function(im) {
              _imgLibOrder.push(im.path);
              html += '<div class="img-lib-cell' + (_imgLibSel[im.path] ? ' picked' : '') + '" data-src="' + esc(im.path) + '" data-name="' + esc(im.name) + '">' +
                  '<img src="' + encodeURI(im.path) + '" loading="lazy">' +
                  '<div class="img-lib-name">' + esc(im.name) + '</div>' + (pickable && !_imgLibPicker ? '<button class="tool ghost img-cell-batch" data-src="' + esc(im.path) + '" title="Drop ' + castBatch() + ' cop' + (castBatch() === 1 ? 'y' : 'ies') + ' at the center of your view">\u00d7' + castBatch() + '</button>' : '') + '</div>';
          });
          html += '</div>';
      });
      var empty = _imgLibPicker ? 'Nothing here to bring in.'
          : _imgLibCat === '__none' ? 'Every picture here has a tag.'
          : picked.length > 1 ? (_imgLibMatch === 'any' ? 'No picture has any of these tags.' : 'No picture has all of these tags. Match any shows the pictures with one of them.')
          : _imgLibCat && _imgLibCat !== '__bymap' ? 'No picture has this tag yet \u2014 right-click a picture to tag it.'
          : _imgLibScope === 'camp' ? 'Nothing in this campaign yet \u2014 other campaigns\u2019 pictures are under All campaigns, or Import from another campaign\u2026'
          : _imgLibScope === 'shared' ? 'No shared pictures yet \u2014 the Tutorial\u2019s art lands here once it has run.'
          : _imgLibScope === 'unfiled' ? 'Nothing unfiled: every picture belongs to a campaign.'
          : 'No images match.';
      var showGroups = !_imgLibPick && !_imgLibPicker && state.viewMode === 'visual' && _imgLibScope === 'camp' && (grid.dataset.cast === '1' || !soleTag());   // backlog 31: groups in this campaign's pictures, and wherever the cast shows
      grid.innerHTML = (showGroups ? groupsLibraryHtml(filter) : '') + (grid.dataset.cast ? castLibraryHtml(filter) : '') + html || '<div style="color:var(--dim); padding:20px; text-align:center;">' + empty + '</div>';
      if (!grid.dataset.quiet) { grid.dataset.quiet = '1'; grid.addEventListener('error', function(e) { var t = e.target; if (t && t.tagName === 'IMG') { t.style.visibility = 'hidden'; if (t.parentNode && t.parentNode.classList) t.parentNode.classList.add('pic-missing'); } }, true); }   // 1.6.2 (backlog 227): a picture whose file is gone stays a quiet empty cell
      var label = !_imgLibCat || _imgLibCat === '__bymap', hint = _imgLibPicker ? 'Ctrl-click to pick it to bring in' : 'right-click to tag it; Ctrl-click to pick several';
      Array.prototype.forEach.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(cell) { TagCore.cellTags(document, cell, imgCatsOf(cell.dataset.src), label, hint); });
      libDragCells(grid);   // 1.6.2 (backlog 41 (a)): dragged onto the map
      renderImgSelBar();
  }
  // Multi-pick: Ctrl-click toggles a picture, Shift-click picks the run from the last one, Ctrl+A picks the view
  var _imgLibSel = {}, _imgLibOrder = [], _imgLibLastPick = null;
  var _imgLibSelMode = false;   // backlog 34: Select is on, so a plain click picks a picture too
  function selectBtnSync() {
      var b = document.getElementById('imgLibSelectBtn'); if (!b) return;
      b.style.display = _imgLibPick && !_imgLibPicker ? 'none' : '';   // choosing one picture for a block: nothing to pick many for
      b.classList.toggle('active', _imgLibSelMode); b.setAttribute('aria-pressed', _imgLibSelMode ? 'true' : 'false');
  }
  function selectAllShown() { _imgLibOrder.forEach(function(p) { _imgLibSel[p] = 1; }); tagLog('select-all', { pics: _imgLibOrder.length }); }
  // Campaign Cast picks live in their own bucket (cast = tokens, not images). Selecting one type clears the other, so the single selection bar always shows a single type.
  var _castLastPick = null;   // _castSel and _castOrder stand above the image library
  function renderImgSelBar() {
      var bar = document.getElementById('imgLibSelBar'); if (!bar) return;
      var n = Object.keys(_imgLibSel).length;
      selectBtnSync();
      var allB = '<button class="tool ghost" data-act="all" title="Pick every picture shown now">Select all shown</button>', doneB = _imgLibSelMode ? '<button class="tool ghost" data-act="done" title="A plain click looks at a picture again; what is picked stays picked">Done</button>' : '';
      if (_imgLibPicker === 'shared') {   // shared pictures are already every campaign's: nothing to bring
          bar.innerHTML = '<span style="color:var(--dim);">Shared pictures are available in every campaign already — find them under the Shared chip.</span><button class="tool ghost" data-act="back">← Back</button>';
          bar.style.display = 'flex'; return;
      }
      if (_imgLibPicker) {   // bringing pictures in from another campaign or Unfiled
          var meC = getActiveCampaign();
          bar.innerHTML = '<span style="color:var(--gold);">' + (n ? n + ' picked' : 'Pick pictures to bring in') + '</span>'
              + (n ? '<button class="tool" data-act="bring">Bring ' + n + ' into ' + esc((meC && meC.name) || 'this campaign') + '</button>' : '') + allB + doneB + (n ? '<button class="tool ghost" data-act="clear">Clear</button>' : '')
              + '<button class="tool ghost" data-act="back">\u2190 Back</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown \u2014 nothing is copied, this campaign remembers them</span>';
          bar.style.display = 'flex'; return;
      }
      var nCast = Object.keys(_castSel).length;
      if (nCast && !_imgLibPick) {   // cast picks own the bar (they clear the picture selection, so only one type is ever non-empty)
          var canC = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
          bar.innerHTML = '<span style="color:var(--gold);"><i class="wib wi-starf"></i> ' + nCast + ' cast picked</span>'
              + '<button class="tool" data-act="add-cast"' + (canC ? '' : ' disabled title="Open a play map first"') + '>Add ' + nCast + ' to map</button>'
              + '<button class="tool ghost" data-act="clear">Clear</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run</span>';
          bar.style.display = 'flex'; return;
      }
      if (!n && _imgLibSelMode && !_imgLibPick) {   // Select is on and nothing is picked yet
          bar.innerHTML = '<span style="color:var(--gold);">Click pictures to pick them</span>' + allB + doneB
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Then Tags\u2026 gives them a tag, or takes one away, all at once</span>';
          bar.style.display = 'flex'; return;
      }
      if (!n || _imgLibPick) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
      var canPlace = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
      bar.innerHTML = '<span style="color:var(--gold);">' + n + ' picked</span>'
          + '<button class="tool" data-act="add-map" title="Lay them out in a block at the center of your view"' + (canPlace ? '' : ' disabled title="Open a play map first"') + '>Add ' + n + ' to map</button>'
          + '<button class="tool ghost" data-act="cat" title="Every tag, marked when all or some of them have it: a click gives it to all, or takes it from all">Tags\u2026</button>'
          + allB + doneB
          + '<button class="tool ghost" data-act="clear">Clear</button>'
          + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown</span>';
      bar.style.display = 'flex';
  }
  function castCells() { var g = document.getElementById('imgLibGrid'); return g ? Array.prototype.slice.call(g.querySelectorAll('.cast-cell[data-cid]')) : []; }
  function castSelSync() { castCells().forEach(function(c) { c.classList.toggle('picked', !!_castSel[c.dataset.cid]); }); }
  function castSelToggle(cell, e) {
      var id = cell.dataset.cid; if (!id) return;
      _imgLibSel = {}; _imgLibLastPick = null;   // picking cast clears the picture selection (one type at a time)
      Array.prototype.forEach.call(document.querySelectorAll('#imgLibGrid .img-lib-cell[data-src]'), function(c) { c.classList.remove('picked'); });
      if (e.shiftKey && _castLastPick && _castOrder.indexOf(_castLastPick) >= 0 && _castOrder.indexOf(id) >= 0) {
          var a = _castOrder.indexOf(_castLastPick), b = _castOrder.indexOf(id);
          _castOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _castSel[q] = 1; });
      } else if (_castSel[id]) delete _castSel[id]; else _castSel[id] = 1;
      _castLastPick = id;
      castSelSync();
      renderImgSelBar();
  }
  function placeCastPicked() {
      var ids = Object.keys(_castSel); if (!ids.length || !castOnMap()) return;
      var ctr = viewCentre();
      ids.forEach(function(id, i) { castPlace(id, ctr.x + (i % 4) * 74, ctr.y + Math.floor(i / 4) * 66, 1); });
      castSelSet({}); _castLastPick = null;
      closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function imgSelToggle(cell, e) {
      var p = cell.dataset.src; if (!p) return;
      castSelSet({}); _castLastPick = null; castSelSync();   // picking a picture clears the cast selection (one type at a time)
      if (e.shiftKey && _imgLibLastPick && _imgLibOrder.indexOf(_imgLibLastPick) >= 0 && _imgLibOrder.indexOf(p) >= 0) {
          var a = _imgLibOrder.indexOf(_imgLibLastPick), b = _imgLibOrder.indexOf(p);
          _imgLibOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _imgLibSel[q] = 1; });
      } else if (_imgLibSel[p]) delete _imgLibSel[p]; else _imgLibSel[p] = 1;
      _imgLibLastPick = p;
      var grid = document.getElementById('imgLibGrid');
      Array.prototype.forEach.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { c.classList.toggle('picked', !!_imgLibSel[c.dataset.src]); });
      renderImgSelBar();
  }
  // Lay the picked pictures out in a block around the center of the view, then select the lot
  function placeImagesBlock(paths) {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
      if (!paths.length) return;
      var s = paths.length <= 2 ? 300 : 200, gap = 12, cols = Math.ceil(Math.sqrt(paths.length)), rows = Math.ceil(paths.length / cols);
      var ctr = viewCentre(), x0 = ctr.x - (cols * s + (cols - 1) * gap) / 2, y0 = ctr.y - (rows * s + (rows - 1) * gap) / 2;
      am.whiteboard = am.whiteboard || [];
      var ids = [];
      paths.forEach(function(src, i) {
          var it = Object.assign({ id: 'wb' + uid(), type: 'image', x: Math.max(10, Math.round(x0 + (i % cols) * (s + gap))), y: Math.max(10, Math.round(y0 + Math.floor(i / cols) * (s + gap))), w: s, h: s, z: 10, color: 'transparent', src: src }, newOpacityProps());
          am.whiteboard.push(it); ids.push(it.id);
      });
      state.selWbId = ids[0]; state.selWbIds = ids;
      _imgLibSel = {}; _imgLibPicker = null; _imgLibStash = null;
      closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none';
      import('./io.js').then(function(m) { m.save(true); render(); m.toast(ids.length + ' pictures placed in a block. They are selected, drag to move them together.'); });
  }

  // Import Character (#importCharBtn) is an outside sheet reader's own: its page code shows the row and wires it (it is hidden in the page)

  var _el_sheetViewClose = document.getElementById('sheetViewCloseBtn');
  if (_el_sheetViewClose) _el_sheetViewClose.addEventListener('click', function() {
      document.getElementById('sheetViewModal').style.display = 'none';
  });

  var _imgLibZ = null;      // the library's own stacking order while it is lifted over the caller (the system modal sits above it)
  function imgLibLift(on) {   // a picker opened from a modal (the sheet builder at z 100000) must land ABOVE it, below the app's confirm (100010)
      var m = document.getElementById('imgLibModal'); if (!m) return;
      if (on) { if (_imgLibZ === null) _imgLibZ = m.style.zIndex; m.style.zIndex = '100005'; }
      else if (_imgLibZ !== null) { m.style.zIndex = _imgLibZ; _imgLibZ = null; }
  }
  window.wpPickImage = async function(cb) {
      imgLibPickSet(cb);
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibSelMode = false; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      imgLibLift(true);
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  };
  var _el_imgLibBtn = document.getElementById('imgLibBtn');

  if (_el_imgLibBtn) _el_imgLibBtn.addEventListener('click', async function() {
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibSelMode = false; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try {
          _imgLibCache = await (await fetch('/api/list-images')).json();
      } catch(e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  });

  // 1.6.2 (the viewing: the library had no way to add a picture from inside it): Add pictures uploads into this campaign's own folder, the map
  // on screen or else its first map, and draws the library again. Nothing is placed. The folder a picture lands in is what makes it this campaign's
  function imgAddFolder(camp) {
      if (!camp || !camp.items) return '';
      var a = camp.activeItemId; if (typeof a === 'string' && Object.prototype.hasOwnProperty.call(camp.items, a) && camp.items[a] && camp.items[a].type === 'map') return a;
      var m = Object.keys(camp.items).filter(function(k) { return camp.items[k] && camp.items[k].type === 'map'; })[0];
      return m || (typeof a === 'string' && Object.prototype.hasOwnProperty.call(camp.items, a) ? a : '');
  }
  window.wpImgAddFolder = imgAddFolder;
  var _el_imgLibHow = document.getElementById('imgLibHowBtn');   // 1.6.2 (the owner: "A How it works button"): the how-to opens and folds in place
  if (_el_imgLibHow) _el_imgLibHow.addEventListener('click', function() { var h = document.getElementById('imgLibHow'); if (!h) return; h.hidden = !h.hidden; _el_imgLibHow.setAttribute('aria-expanded', h.hidden ? 'false' : 'true'); });
  var _el_imgLibAdd = document.getElementById('imgLibAddBtn'), _el_imgLibAddFile = document.getElementById('imgLibAddFile');
  if (_el_imgLibAdd && _el_imgLibAddFile) {
      _el_imgLibAdd.addEventListener('click', function() { if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; } _el_imgLibAddFile.value = ''; _el_imgLibAddFile.click(); });
      _el_imgLibAddFile.addEventListener('change', async function() {
          var camp = getActiveCampaign(), dir = imgAddFolder(camp), fl = Array.prototype.slice.call(this.files || []).filter(function(f) { return f && typeof f.type === 'string' && f.type.indexOf('image/') === 0; }).slice(0, 50);
          if (!fl.length) return; if (!dir) { toast('Make a map first: a picture is kept with one of the campaign\'s maps.'); return; }
          var ok = 0, bad = 0; toast('Adding ' + fl.length + (fl.length === 1 ? ' picture\u2026' : ' pictures\u2026'));
          for (var i = 0; i < fl.length; i++) { try { await uploadBlob(dir, fl[i].name, fl[i]); ok++; } catch (e) { bad++; } }
          var tipU = window.wpFrameCore && window.wpFrameCore.sizeTip ? ' ' + window.wpFrameCore.sizeTip(window.wpSystemCore && window.wpSystemCore.mapGridOf ? window.wpSystemCore.mapGridOf(getActiveMap()) : 'off') : '';   // 1.6.2 (backlog 141): the size a token's picture is best at
          if (bad) toast(bad + (bad === 1 ? ' picture' : ' pictures') + ' could not be added' + (ok ? '. ' + ok + ' added.' : '.') + tipU, 'warn'); else toast((ok === 1 ? 'Added 1 picture.' : 'Added ' + ok + ' pictures.') + tipU);
          try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) {} _imgIndex = null; _imgLibScope = 'camp';
          renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // [lookcheck:libfolder-start] 1.6.2 (backlog 41 (b); the owner, by prompt: "Copied, tagged by folder", "Each folder's own name"): every picture of a
  // folder of this computer copied into the campaign, as Add pictures copies one, and tagged in this campaign with the name of the folder it was
  // in, a folder inside it by its own name. LIB_FOLDER pictures at most a time; a name the tag rule refuses tags nothing
  var LIB_FOLDER = 200;
  function folderTagOf(rel) { var parts = String(rel || '').split(/[\\/]/).filter(Boolean); return parts.length >= 2 ? (TagCore.tagName ? TagCore.tagName(parts[parts.length - 2]) : '') : ''; }
  var _el_imgLibAddDir = document.getElementById('imgLibAddDirBtn'), _el_imgLibAddDirIn = document.getElementById('imgLibAddDir');
  if (_el_imgLibAddDir && _el_imgLibAddDirIn) {
      _el_imgLibAddDir.addEventListener('click', function() { if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; } _el_imgLibAddDirIn.value = ''; _el_imgLibAddDirIn.click(); });
      _el_imgLibAddDirIn.addEventListener('change', async function() {
          var camp = getActiveCampaign(), dir = imgAddFolder(camp), all = Array.prototype.slice.call(this.files || []).filter(function(f) { return f && typeof f.type === 'string' && f.type.indexOf('image/') === 0; });
          if (!all.length) { toast('That folder holds no pictures.'); return; } if (!dir) { toast('Make a map first: a picture is kept with one of the campaign\'s maps.'); return; }
          var fl = all.slice(0, LIB_FOLDER), ok = 0, bad = 0, byTag = {}; toast('Adding ' + fl.length + (fl.length === 1 ? ' picture\u2026' : ' pictures\u2026'));
          for (var i = 0; i < fl.length; i++) { try { var url = await uploadBlob(dir, fl[i].name, fl[i]); ok++; var tg = folderTagOf(fl[i].webkitRelativePath); if (tg) (byTag[tg] = byTag[tg] || []).push(url); } catch (e) { bad++; } }
          var tags = Object.keys(byTag); tags.forEach(function(t) { window.wpImgCatEnsure(t, byTag[t], false, camp.id); }); if (tags.length) imgCatsSave();
          var said = (ok === 1 ? 'Added 1 picture' : 'Added ' + ok + ' pictures') + (tags.length ? ', tagged ' + (tags.length <= 3 ? tags.join(', ') : tags.length + ' ways') : '') + '.';
          if (all.length > fl.length) said += ' The first ' + LIB_FOLDER + ' were added; add the rest from a smaller folder.';
          if (bad) said += ' ' + bad + (bad === 1 ? ' picture' : ' pictures') + ' could not be added.';
          toast(said, bad || all.length > fl.length ? 'warn' : undefined);
          try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) {} _imgIndex = null; _imgLibScope = 'camp';
          renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // [lookcheck:libfolder-end]
  var _el_imgLibClose = document.getElementById('imgLibCloseBtn');

  if (_el_imgLibClose) _el_imgLibClose.addEventListener('click', function() {
      imgLibPickSet(null); _imgLibPicker = null; _imgLibStash = null; closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false);
  });

  var _el_imgLibSearch = document.getElementById('imgLibSearch');

  if (_el_imgLibSearch) _el_imgLibSearch.addEventListener('input', function() { renderImgLib(this.value); });

  var _el_imgLibGrid = document.getElementById('imgLibGrid');
  // [lookcheck:libdrag-start] 1.6.2 (backlog 41 (a); the owner, by prompt: "optional in a setting between the two"): a picture dragged out of the
  // library's grid lands on the play map where it is let go, as Add to map places one. While it is dragged the library lets the drop through to
  // the map, and where Settings' Dragging from the Image Library says Steps aside it fades too (wp_libDrag, this computer's). Never while the
  // library is picking a picture for something else or bringing pictures in, and never off a play map
  function libDragOk() { var am = getActiveMap(); return !_imgLibPick && !_imgLibPicker && state.viewMode === 'visual' && !!am && am.type === 'map'; }
  function libDragAside() { try { return localStorage.getItem('wp_libDrag') === 'aside'; } catch (e) { return false; } }
  function libDragCells(grid) { var ok = libDragOk(); Array.prototype.forEach.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(cell) { cell.draggable = ok; if (ok) cell.title = (cell.title ? cell.title + '. ' : '') + 'Drag it onto the map'; }); }
  function libDragEnd() { var m = document.getElementById('imgLibModal'); if (m) { m.classList.remove('lib-drag'); m.classList.remove('lib-aside'); } }
  if (_el_imgLibGrid) {
      _el_imgLibGrid.addEventListener('dragstart', function(e) {
          var cell = e.target && e.target.closest ? e.target.closest('.img-lib-cell[data-src]') : null;
          if (!cell) return; if (!cell.draggable || !libDragOk()) { e.preventDefault(); return; }
          try { e.dataTransfer.setData('application/x-wp-picture', cell.dataset.src); e.dataTransfer.effectAllowed = 'copy'; } catch (er) {}
          var aside = libDragAside(); setTimeout(function() { var m = document.getElementById('imgLibModal'); if (m) { m.classList.add('lib-drag'); if (aside) m.classList.add('lib-aside'); } }, 0);   // after the drag has begun: a change to its source in dragstart can stop it
      });
      _el_imgLibGrid.addEventListener('dragend', libDragEnd);
  }
  // [lookcheck:libdrag-end]
  // The copies box beside the Campaign Cast heading
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('input', function(e) { var b = e.target.closest('.cast-batch'); if (b && b.value >= 1 && b.value <= 50) setCastBatch(b.value); });
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('change', function(e) { var b = e.target.closest('.cast-batch'); if (b) b.value = setCastBatch(b.value); });

  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('click', function(e) {
      var gcell = e.target.closest('.group-cell');   // backlog 31: a group places, or its x deletes it after a question
      if (gcell) { var gidC = gcell.dataset.gid; if (e.target.closest('.group-del')) { var campG = getActiveCampaign(), gl = campG && Array.isArray(campG.groups) ? campG.groups : [], gg = gl.filter(function(x) { return x && x.id === gidC; })[0]; if (gg) showConfirm('Delete the group ' + gg.name + '? Its tokens and sheets stay.', function(yes) { if (yes !== true) return; var ix = gl.indexOf(gg); if (ix >= 0) gl.splice(ix, 1); if (!gl.length) delete campG.groups; save(true); var sG = document.getElementById('imgLibSearch'); renderImgLib(sG ? sG.value : ''); }); return; } groupPlace(gidC); return; }
      var cell = e.target.closest('.img-lib-cell');
      if (!cell) return;
      if ((!_imgLibPick || _imgLibPicker) && !cell.classList.contains('cast-cell') && (e.ctrlKey || e.metaKey || e.shiftKey || (_imgLibSelMode && !e.target.closest('.img-cell-batch')))) { e.preventDefault(); imgSelToggle(cell, e); return; }   // backlog 34: with Select on a plain click picks too
      var batchBtn = e.target.closest('.img-cell-batch');
      if (batchBtn) { e.stopPropagation(); var copies = []; for (var ci = 0; ci < castBatch(); ci++) copies.push(batchBtn.dataset.src); placeImagesBlock(copies); return; }
      if (cell.classList.contains('cast-cell')) {
          if (e.target.closest('.cast-cell-five')) { placeCast(cell.dataset.cid, castBatch()); return; }   // the × button still places straight away
          if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); castSelToggle(cell, e); return; }   // Ctrl/Cmd/Shift-click multi-selects (its own bucket)
          openCastPreview(cell.dataset.cid);   // a bare click just LOOKS now (like a picture); placing is the Add / × button
          return;
      }
      openImgPreview(cell.dataset.src);   // a large look first; Add to map (or Use this picture) is a deliberate press
  });
  /* ---- library preview ---- */
  function imgLibEntry(src) { return (_imgLibCache || []).find(function(i) { return i.path === src; }) || null; }
  function openImgPreview(src) {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      var im = imgLibEntry(src);
      var folder = im ? im.folder : '', mapName = folder ? folderLabel(folder) : '';
      document.getElementById('imgLibPreviewImg').src = encodeURI(src);
      document.getElementById('imgLibPreviewName').textContent = im ? im.name : src.split('/').pop();
      TagCore.previewTags(document, document.getElementById('imgLibPreviewMeta'), mapName, imgCatsOf(src));
      var catBtn = document.getElementById('imgLibPreviewCat'), fromV = soleTag();
      if (catBtn) { catBtn.textContent = fromV ? 'Tags / move\u2026' : 'Tags\u2026'; catBtn.title = fromV ? 'Add another tag, move it from ' + fromV + ' to another, or take it off' : 'Give this picture a tag (it can wear several)'; }
      var add = document.getElementById('imgLibPreviewAdd'), delBtn = document.getElementById('imgLibPreviewDel');
      if (_imgLibPicker) { add.textContent = _imgLibPick ? 'Bring in & use' : 'Bring into this campaign'; add.title = 'This campaign remembers the picture (nothing is copied)' + (_imgLibPick ? ' and the block gets it' : ''); }
      else { add.textContent = _imgLibPick ? 'Use this picture' : (castBatch() > 1 ? 'Add \u00d7' + castBatch() + ' to map' : 'Add to map'); add.title = _imgLibPick ? 'Use this picture where you asked for one' : 'Place it on the current play map (the number in Copies)'; }
      if (catBtn) catBtn.style.display = _imgLibPicker ? 'none' : '';
      if (delBtn) delBtn.style.display = _imgLibPicker ? 'none' : '';
      var scBtn = document.getElementById('imgLibPreviewScene'); if (scBtn) scBtn.style.display = _imgLibPicker || !window.wpScene ? 'none' : '';   // backlog 181
      pv.dataset.src = src; delete pv.dataset.cid;   // leaving cast mode: the Add button reads src, not a stale cid
      grid.style.display = 'none'; pv.style.display = 'flex';
      // arrows step through the pictures in the order the grid shows them
      var listN = imgPreviewList(), at = listN.indexOf(src);
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = at <= 0;
      if (nextB) nextB.disabled = at < 0 || at >= listN.length - 1;
      if (cnt) cnt.textContent = at >= 0 ? (at + 1) + ' / ' + listN.length : '';
  }
  // The pictures currently in the grid (the search / category filter applied), in grid order
  function imgPreviewList() {
      var grid = document.getElementById('imgLibGrid'); if (!grid) return [];
      return Array.prototype.map.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { return c.dataset.src; });
  }
  function imgPreviewStep(dir) {
      var pv = document.getElementById('imgLibPreview'); if (!pv || pv.style.display === 'none') return;
      var list = imgPreviewList(), at = list.indexOf(pv.dataset.src), to = at + dir;
      if (at < 0 || to < 0 || to >= list.length) return;
      openImgPreview(list[to]);
  }
  function closeImgPreview() {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.style.display = 'none'; grid.style.display = '';
      document.getElementById('imgLibPreviewImg').removeAttribute('src');
      delete pv.dataset.cid;
  }
  window.wpCloseImgPreview = closeImgPreview;
  // A cast face opens the same preview panel as a picture, in a cast mode: the portrait (or a colored disc for a
  // circle token), the name and stat line, and an "Add to map" that drops the number in Copies. Placing a cast token
  // is no longer a bare click (that just looks now, like a picture) — it is a deliberate Add / × button press.
  function castOnMap() { var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return false; } return true; }
  function placeCast(cid, count) {
      if (!castOnMap()) return;
      var ctr = viewCentre();
      castPlace(cid, ctr.x, ctr.y, count);
      closeImgPreview();   // reset to the grid so reopening the library doesn't show a stale preview
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function openCastPreview(cid) {
      var camp = getActiveCampaign(), c = camp && castOf(camp)[cid]; if (!c) return;
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.dataset.cid = cid; delete pv.dataset.src;
      document.getElementById('imgLibPreviewImg').src = picRef(c.src) ? encodeURI(picRef(c.src))
          : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="52" fill="' + (cssColor(c.color) || '#4db3d3') + '"/></svg>');
      document.getElementById('imgLibPreviewName').textContent = c.name || 'Character';
      document.getElementById('imgLibPreviewMeta').innerHTML = '<div style="color:var(--gold);"><i class="wib wi-starf"></i> Campaign Cast</div>' + (c.charStats ? '<div>' + esc(c.charStats) + '</div>' : '<div style="color:var(--dim);">No stat line</div>');
      var add = document.getElementById('imgLibPreviewAdd');
      add.textContent = castBatch() > 1 ? 'Add ×' + castBatch() + ' to map' : 'Add to map';
      add.title = 'Place ' + (c.name || 'this character') + ' on the current play map (the number in Copies)';
      var catBtn = document.getElementById('imgLibPreviewCat'), delBtn = document.getElementById('imgLibPreviewDel');
      if (catBtn) catBtn.style.display = 'none';
      if (delBtn) delBtn.style.display = 'none';
      var scBtnC = document.getElementById('imgLibPreviewScene'); if (scBtnC) scBtnC.style.display = 'none';   // a cast face is no picture of the campaign's to show
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = true;
      if (nextB) nextB.disabled = true;
      if (cnt) cnt.textContent = '';
      grid.style.display = 'none'; pv.style.display = 'flex';
  }
  (function wireImgPreview() {
      var pv = document.getElementById('imgLibPreview'); if (!pv) return;
      document.getElementById('imgLibPreviewBack').addEventListener('click', closeImgPreview);
      var scB = document.getElementById('imgLibPreviewScene');   // backlog 181: this picture as a scene, the library left as it is under the box
      if (scB) scB.addEventListener('click', function() { var src = pv.dataset.src; if (src && !pv.dataset.cid && window.wpScene) window.wpScene.open(src); });
      // Delete the picture file itself (saves/images only; the shell must have /api/delete-image — 1.4.6 core)
      var delB = document.getElementById('imgLibPreviewDel');
      if (delB) delB.addEventListener('click', function() {
          var src = pv.dataset.src; if (!src || src.indexOf('/saves/images/') !== 0) { toast('Only pictures in your saves folder can be deleted here.'); return; }
          var use = imgUsage(src), name = src.split('/').pop();
          var msg = 'Delete the picture file "' + name + '" from your saves folder? This cannot be undone.' + (use.count ? '\n\nIt is used ' + use.count + ' time' + (use.count === 1 ? '' : 's') + ' (' + use.maps.join(', ') + '); those places will show a broken picture until you give them another.' : '\n\nNothing in your campaigns uses it.');
          showConfirm(msg, function(yes) {
              if (!yes) return;
              fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) {
                  if (r.status === 404 && !r.headers.get('content-type')) throw new Error('old-core');
                  if (!r.ok) throw new Error('failed');
                  return r.json();
              }).then(function() {
                  _imgLibCache = (_imgLibCache || []).filter(function(i) { return i.path !== src; });
                  catStores().forEach(function(s) { if (s.c.by[src]) delete s.c.by[src]; }); imgCatsSave();
                  closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value);
                  toast('Deleted ' + name + '.');
              }).catch(function(e) {
                  toast(e && e.message === 'old-core' ? 'Deleting pictures needs the 1.4.6 core. Run the installer from Settings \u2192 Updates and about.' : 'Could not delete that picture.');
              });
          });
      });
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn');
      if (prevB) prevB.addEventListener('click', function() { imgPreviewStep(-1); });
      if (nextB) nextB.addEventListener('click', function() { imgPreviewStep(1); });
      document.addEventListener('keydown', function(e) {
          if (pv.style.display === 'none') return;
          if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
          if (e.key === 'ArrowLeft') { e.preventDefault(); imgPreviewStep(-1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); imgPreviewStep(1); }
      });
      document.getElementById('imgLibPreviewAdd').addEventListener('click', function() {
          if (pv.dataset.cid) { placeCast(pv.dataset.cid, castBatch()); return; }   // cast mode: Add drops the number in Copies
          var src = pv.dataset.src; if (!src) return;
          if (_imgLibPicker) {   // bring it in; with a block waiting, hand it over as well
              var cbP = _imgLibPick; bringPictures([src]);
              if (cbP) { imgLibPickSet(null); closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cbP(src); }
              return;
          }
          if (_imgLibPick) { var cb = _imgLibPick; imgLibPickSet(null); closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cb(src); return; }
          var am = getActiveMap();
          if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
          if (castBatch() > 1) { var many = []; for (var mi = 0; mi < castBatch(); mi++) many.push(src); placeImagesBlock(many); return; }
          addWbItem('image', { w: 300, h: 300, src: src, color: 'transparent' });
          closeImgPreview();
          document.getElementById('imgLibModal').style.display = 'none';
          toast('Image placed.');
      });
      document.getElementById('imgLibPreviewCat').addEventListener('click', function(e) {
          var src = pv.dataset.src; if (!src) return;
          var r = this.getBoundingClientRect();
          openImgCatMenu(src, r.left, r.bottom + 4);
      });
      // Escape steps back from the preview before it would close the library
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pv.style.display !== 'none') { e.stopPropagation(); closeImgPreview(); } }, true);
  })();

  // One upload for every picture that enters the app from the renderer — the play-map drop, the planner's
  // Upload button and the Markdown importer: resolves to the /saves/images/… URL, rejects on failure.
  function uploadBlob(mapId, name, blob) {
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return Promise.reject(new Error('not while at someone else\'s table'));
      return fetch('/api/upload?mapId=' + encodeURIComponent(mapId) + '&filename=' + encodeURIComponent(name || 'picture.png'), { method: 'POST', body: blob })
          .then(function(res) { return res.json(); }).then(function(d) { if (!d || !d.url) throw new Error('upload failed'); return d.url; });
  }
  window.wpUploadBlob = uploadBlob;
  // [lookcheck:noupload-start] 1.6.3 (backlog 174): a website plan that does not include uploads. webmode.js says such a page is in its mode
  // web (a page of a website that is not join-only) with no word uploads in can, which is exactly when it writes web-no-uploads on the body
  // and the style sheet puts the upload buttons away (lookcheck runs the real webmode.js to hold the two together). A picture from the
  // computer can still reach the map with no button: a file dropped on the board and an image pasted with Ctrl+V (io.js calls
  // window.wpUploadImage, which is uploadImageFile). The site would answer that upload 403, so uploadImageFile, the one function that sends
  // such a picture, asks this after its own two tests and says NO_UPLOAD_WORDS in place of sending anything. It reads window.wpWebMode alone and
  // answers false wherever it cannot tell: the desktop app, a website plan that has uploads, and a joined player's page (join-only, which keeps
  // its own refusal) are never refused here
  var NO_UPLOAD_WORDS = 'Your plan on the website does not include uploads, so a picture from your computer cannot go on the map.';
  function webNoUploads() {
      var wm = typeof window !== 'undefined' ? window.wpWebMode : null;
      try { return !!(wm && typeof wm.web === 'function' && typeof wm.joinOnly === 'function' && typeof wm.has === 'function' && wm.web() && !wm.joinOnly() && !wm.has('uploads')); } catch (e) { return false; }
  }
  // [lookcheck:noupload-end]
  function uploadImageFile(f, cx, cy) {

      if(!f || !f.type.startsWith('image/')) return;

      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }   // would create saves/images/<GM mapId>/

      if (webNoUploads()) { toast(NO_UPLOAD_WORDS); return; }   // 1.6.3 (backlog 174): a website plan with no uploads sends nothing, by a drop, a paste or a file picked

      toast('Uploading image...');

      uploadBlob(getActiveCampaign().activeItemId, f.name, f)

      .then(url => ({ url: url }))

      .then(data => {

          if (data.url) {

              if (cx !== undefined && cy !== undefined) {

                  var item = Object.assign({ id: 'wb'+uid(), type: 'image', x: cx, y: cy, w: 300, h: 300, z: 10, src: data.url, color: 'transparent' }, newOpacityProps());

                  var gpic = typeof groundPic === 'function' && groundPic(getActiveMap(), item);   // 231: the first picture on a bare map is its ground
                  getActiveMap().whiteboard.push(item);

                  state.selWbId = item.id;

                  save(); render();

              } else {

                  addWbItem('image', {w:300, h:300, src: data.url, color:'transparent'});

              }

              toast('Image added!');

          }

      })

      .catch(err => toast('Error uploading image.'));

  }



  var _el_imgFileIn = document.getElementById('imgFileIn');

if(_el_imgFileIn) _el_imgFileIn.addEventListener('change', function(e) {

      uploadImageFile(e.target.files[0]);

      e.target.value = '';

  });



  var _el_clearWbBtn = document.getElementById('clearWbBtn');

if(_el_clearWbBtn) _el_clearWbBtn.addEventListener('click', function() {

      showConfirm('Clear the entire play map? (This map\'s Undo can bring it back.)', function(yes) {

          if(yes) {

              getActiveMap().whiteboard = [];

              state.selWbId = null;

              save(); render();

          }

      });

  });



  wbWrap.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); });

  wbWrap.addEventListener('drop', function(e) {

      e.preventDefault(); e.stopPropagation();

      if(state.viewMode !== 'visual') return;

      var wpPic = ''; try { wpPic = e.dataTransfer.getData('application/x-wp-picture') || ''; } catch (er) {}
      if (wpPic) { libDropAt(wpPic, e); return; }   // 1.6.2 (backlog 41 (a)): a picture from the Image Library
      var wpFurn = ''; try { wpFurn = e.dataTransfer.getData('application/x-wp-furn') || ''; } catch (er) {}
      if (wpFurn) { furnDropAt(wpFurn, e); return; }   // 1.6.2 (backlog 222): a furnishing from Build's Objects tab

      var f = e.dataTransfer.files[0];

      if(f) {

          var dr = wbWrap.getBoundingClientRect(), cx = wbX(e.clientX, e.clientY, dr, wbWrap) - 150, cy = wbY(e.clientX, e.clientY, dr, wbWrap) - 150;   // 1.6.2: through the board's one reading of a pointer

          uploadImageFile(f, Math.max(10, Math.round(cx)), Math.max(10, Math.round(cy)));

      }

  });



  // [lookcheck:libdrop-start] 1.6.2 (backlog 41 (a)): a picture dragged from the Image Library, placed where it is let go: a picture of this
  // computer's own saves or the app's own, 300 px as Add to map makes one, its corner on the lattice where Snap is on and the map is square
  function libDropAt(src, e) {
      if (typeof libDragEnd === 'function') libDragEnd();
      if (typeof src !== 'string' || src.length > 400 || !/^\/(saves\/images|assets)\//.test(src) || /[\u0000-\u001f\u007f]|\.\.\//.test(src)) return;
      var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      var r = wbWrap.getBoundingClientRect(), x = wbX(e.clientX, e.clientY, r, wbWrap) - 150, y = wbY(e.clientX, e.clientY, r, wbWrap) - 150;
      var GS = window.wpSnapOn && window.wpSnapOn() && window.wpLatticeOf ? window.wpLatticeOf(am) : null;
      if (GS && GS.type === 'square' && GS.size > 0) { var ox = GS.ox || 0, oy = GS.oy || 0; x = Math.round((x - ox) / GS.size) * GS.size + ox; y = Math.round((y - oy) / GS.size) * GS.size + oy; }
      var it = Object.assign({ id: 'wb' + uid(), type: 'image', x: Math.max(10, Math.round(x)), y: Math.max(10, Math.round(y)), w: 300, h: 300, z: 10, src: src, color: 'transparent' }, newOpacityProps());
      am.whiteboard = am.whiteboard || []; var gpic = typeof groundPic === 'function' && groundPic(am, it); am.whiteboard.push(it);
      state.selWbId = it.id; state.selWbIds = [];
      save(); render(); toast(gpic && it.locked ? 'Picture placed as this map\u2019s ground, locked in place.' : 'Picture placed.');
  }
  // [lookcheck:libdrop-end]
// [split:body-end]
return { picGoneSoon: picGoneSoon, uploadImageFile: uploadImageFile };   // [split:glue]
}   // [split:glue]
