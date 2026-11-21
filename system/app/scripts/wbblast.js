/* wbblast.js: a part of whiteboard.js (docs/REFACTOR_SPLIT_PLAN.md, area 8, blasts and the map's tool options; split 2026-11-19 with no
   change in behavior).
   What it holds: the Radius tool, its circles, rings and cones and their words in the ruler's unit ([systemcheck:radius-*], with the
   blasts kept per map in [systemcheck:blastaway-*]); placing, seating, drawing and dragging a blast, a thrown blast and its throw
   (resolveThrow); the cloud an explosive leaves ([buildcheck:cloud-*]); a blast going off and what it does ([systemcheck:explosives-*]:
   the shares by distance, fragmentation, afflictions, things in flight in [vehiclecheck:flyblast-*], Defense rolls, owed rolls, Undo
   last throw, mines and fuses); a launched round and its miss, a burst's strays, and what flies ([systemcheck:launch-*], with
   [vehiclecheck:fly-*]); Explode ([systemcheck:explode-*]); a shared blast and an effect's burst; the fog tool's press
   ([fogcheck:fogtool-*]); the Fill tool's options ([fogcheck:fillmenu-*]), every Texture list ([sinkcheck:texopts-*]), painting a cell
   ([fogcheck:fillcell-*]) and the flood fill within lines; and the Radius tool's options ([systemcheck:radiusopts-*]). The blasts'
   state (blasts, coneAim, blastDrag) stands in whiteboard.js just above this part's marker, since the board's pointer handlers set it
   too; this part sets it through blastsSet and coneAimSet.
   Why it looks this way: these lines stood in whiteboard.js, and they still run exactly where they stood. whiteboard.js calls wbBlast()
   at its line `// [split:wbblast.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines inside the install function, unchanged and as indented as they were, so that every test that reads
   whiteboard.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   whiteboard.js (live, so a value whiteboard.js changes later is read as it is then); the last line hands back the names whiteboard.js
   uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in
   whiteboard.js. */
// [split:of whiteboard.js]
import { _el_measureMenu, blasts, blastsSet, boxHeight, buildKey, closeDrawMenu, coneAim, coneAimSet, disarmPlacement, distToSegSq, doorNearSync, esc, fmtElev, getActiveCampaign, getActiveMap, groundAt, hostGestureEnd, hostGestureStart, lenUnit, litViewer, mapMeasureConfig, measures, render, renderMeasures, renderWhiteboard, save, snapToHex, stanceOn, state, toast, tokenElevation, uid, undo, updateWbToolbar, wb, wbWrap, wbX, wbY, wireTool, ydIn, ydOut } from './whiteboard.js';   // [split:glue]
export function wbBlast() {   // [split:glue]
// [split:body-start]
  // [systemcheck:radius-start]
  // The Radius tool's own numbers and words (1.5.4; the owner, 2026-10-06: "lets make the explosion tool a radius/ diameter tool instead").
  // A circle keeps its RADIUS in yards, whatever was typed. Its size is typed and said in the ruler's unit on that map (by prompt: "The
  // ruler's units"): the map's own unit, turned by the viewer's Imperial or Metric choice as the ruler's label turns it. as says how the
  // number is read: 'r' from the center to the edge, 'd' from edge to edge. as is also what is measured (circleKind): beside the two
  // circles, 'ring' (the tokens between an inner distance, inn, and the outer one, yd) and 'cone' (a wedge from the point, yd long, deg
  // degrees wide, turned to dir in radians; 0 points right). A circle may sit on a token (tok: on a shape the token's id, on the shape
  // kept for the next click true): it stands where its token stands and does not count it. The functions down to circlePref are pure.
  // Under them stand the shapes on screen, the size kept, the ruler's unit on the map on screen, whose a shape is and what it holds
  var CIRCLE_MAX_YD = 10000000, CIRCLE_MIN_YD = 0.01;
  function unitKnown(u) { return u === 'ft' || u === 'm' || u === 'km' || u === 'mi' ? u : 'yd'; }   // one of the ruler's five units, yards for anything else
  function ydPer(u) { return u === 'ft' ? 1 / 3 : u === 'm' ? 1 / 0.9144 : u === 'km' ? 1000 / 0.9144 : u === 'mi' ? 1760 : 1; }   // yards in one of them, as unitToYd counts: by the exact definitions, a yard 0.9144 m (the review of the v1.0.4 merge: 1.09361 said a token 184 yd off 168.3 m, where the ruler says 168.2)
  function rulerUnitOf(mapUnit, metric) {   // the unit the ruler's label ends in on a map of that unit
      var u = unitKnown(mapUnit);
      if (metric) return u === 'yd' || u === 'ft' ? 'm' : u === 'mi' ? 'km' : u;
      return u === 'm' ? 'yd' : u === 'km' ? 'mi' : u;
  }
  function circleAs(v) { return v === 'd' ? 'd' : 'r'; }   // how a number is read: a ring's and a cone's are distances from the point, as a radius is
  function circleKind(v) { return v === 'd' || v === 'ring' || v === 'cone' ? v : 'r'; }   // what the tool measures: a circle by its radius or by its diameter, a ring, a cone
  function shapeOf(as) { var k = circleKind(as); return k === 'ring' || k === 'cone' ? k : 'circle'; }   // the shape it is: the Shape row's own word
  function shapeNote(as, tok) { var s = shapeOf(as); return s === 'ring' ? 'A ring. The tokens between its two distances are inside.' : s === 'cone' ? 'A wedge from a point. Press a cell and drag to aim it.' : tok === true ? 'A circle on a token. It moves with its token, and does not count it.' : 'A circle. Every token inside shows its distance.'; }
  function coneDeg(v, was) { var n = typeof v === 'number' || typeof v === 'string' ? Math.round(Number(v)) : NaN; return isFinite(n) && n >= 1 && n <= 360 ? n : (typeof was === 'number' && was >= 1 && was <= 360 ? Math.round(was) : 60); }   // a cone's angle in whole degrees, 1 to 360; what does not read keeps the angle there was
  function lenTrim(v) { v = Number(v); if (!isFinite(v) || !(v > 0)) return 0; return v >= 1 ? Math.round(v * 100) / 100 : Number(v.toPrecision(3)); }   // a size as it is typed: two decimals, three figures under 1
  function circleYd(typed, as, unit, cellYd) {   // the number in the box as a radius in yards; 0: nothing to place. cellYd: the yards one cell of the map holds (circleSnap)
      var n = typeof typed === 'number' || typeof typed === 'string' ? Number(typed) : NaN;
      if (!isFinite(n) || !(n > 0)) return 0;
      var yd = circleSnap(n * ydPer(unitKnown(unit)) / (circleAs(as) === 'd' ? 2 : 1), n, as, unit, cellYd);
      return yd < CIRCLE_MIN_YD ? 0 : Math.min(CIRCLE_MAX_YD, yd);
  }
  // The box shows a size to two decimals (lenTrim), so 3 yd reads 2.74 m, and 2.74 m typed back was 2.9965 yd, short of a token three hexes
  // away (the read-only check of 2026-10-17). A size is taken at the nearest tenth of a cell where the box would show that very number, as a
  // height is kept to a tenth of a yard: 2.74 m on a map of 1 yd cells is 3 yd, 3.05 m on 5 ft squares is 10 ft. A size the box would show
  // otherwise is kept as typed, and so is every size with no cell to go by
  function circleSnap(yd, n, as, unit, cellYd) {
      var c = typeof cellYd === 'number' && isFinite(cellYd) && cellYd > 0 ? cellYd : 0; if (!c) return yd;
      var t = Math.round(yd / c * 10) / 10 * c;
      return t > 0 && circleTyped(t, as, unit) === lenTrim(n) ? t : yd;
  }
  function cellYdNow() { var c = mapMeasureConfig(); return c.per * ydPer(c.unit); }   // the yards one cell of the map on screen holds, as the board counts them (unitToYd)
  function circleTyped(yd, as, unit) { var v = Number(yd); return !isFinite(v) || !(v > 0) ? 0 : lenTrim(v * (circleAs(as) === 'd' ? 2 : 1) / ydPer(unitKnown(unit))); }   // a radius in yards as the number the box shows
  function circleWords(yd, as, unit, inn, deg, say) {   // what a shape is: a fixed word, its numbers, and a unit of the five. say: the number a distance in yards is said as (a thrown blast's, blastNum); else as the box shows it
      var k = circleKind(as), u = unitKnown(unit), n = typeof say === 'function' ? say : function(v, a) { return circleTyped(v, a, unit); };
      if (k === 'ring') return 'Ring ' + n(inn, 'r') + ' to ' + n(yd, 'r') + ' ' + u;
      if (k === 'cone') return 'Cone ' + n(yd, 'r') + ' ' + u + ', ' + coneDeg(deg, 60) + '\u00b0';
      return (k === 'd' ? 'Diameter ' : 'Radius ') + n(yd, k) + ' ' + u;
  }
  // A shape on the map in words, in the ruler's unit on that map (the owner, 2026-10-17, by prompt: "The ruler's unit (Recommended)"): the
  // tool's own by its size, a thrown blast by its name and its radius as the Radius tool says a radius, with a ring's two distances or a
  // cone's angle. The item keeps its feet inside: only what is said follows the ruler. Plain text: the caller escapes it. The label on the map
  // draws the two parts apart, since the size alone is drawn over the fog on a player's screen (fog.js measureCaps): blastName, blastSize
  function blastName(b) { return !ownCircle(b) && b && typeof b.name === 'string' && b.name ? b.name : ''; }   // a thrown blast's name; a shape of the tool's own has none
  // A thrown blast's size is said as the Radius tool says a size, but in meters or kilometers as the sheet says a measure in metric (the review of
  // the v1.0.4 merge: a 3 yd blast read 2.74 m beside a field's "3 yd (2.7 m)" and the website's own "3-yard (2.7 m) radius"): systemcore
  // metricOf, the website's rule, over the figure the same map reads under Imperial (iu: yd, ft or mi, the unit rulerImpNow gives; absent,
  // yards for meters and miles for kilometers), to the decimals that figure shows and one more for a whole one. The tool's own box keeps two
  // decimals (2.74 m), since a size typed as it shows must read back. With no system core at hand, as the box shows a size. Plain text
  function blastNum(yd, unit, iu) {
      var u = unitKnown(unit), S = window.wpSystemCore;
      if ((u === 'm' || u === 'km') && S && typeof S.metricOf === 'function') {
          var i = u === 'km' ? 'mi' : iu === 'ft' ? 'ft' : 'yd', fig = circleTyped(yd, 'r', i), t = fig > 0 ? S.metricOf(i, fig, String(fig)) : '', sp = typeof t === 'string' ? t.indexOf(' ') : -1;
          if (sp > 0) return t.slice(0, sp);
      }
      return String(circleTyped(yd, 'r', u));
  }
  function blastSize(b, unit, iu) {
      if (ownCircle(b)) return circleWords(b.yd, b.as, unit, b.inn, b.deg);
      var k = kindOf(b), r = blastRadiusYd(b), say = function(v) { return blastNum(v, unit, iu); };
      return k === 'ring' && innerYd(b) > 0 ? circleWords(r, 'ring', unit, innerYd(b), 0, say) : k === 'cone' ? circleWords(r, 'cone', unit, 0, b.deg, say) : circleWords(r, 'r', unit, 0, 0, say);
  }
  function blastWords(b, unit, iu) { var n = blastName(b); return (n ? n + ' \u00b7 ' : '') + blastSize(b, unit, iu); }
  function blastLen(ft, unit, iu) { var v = Number(ft); return blastNum(isFinite(v) ? v / 3 : 0, unit, iu) + ' ' + unitKnown(unit); }   // an item's blast radius, kept in feet, in that unit: what the sheet shows beside the item
  function rulerLen(yd, unit) { var v = Number(yd); if (!isFinite(v) || v < 0) v = 0; return String(Math.round(v / ydPer(unitKnown(unit)) * 10) / 10) + ' ' + unitKnown(unit); }   // a measured length, to a tenth as the ruler reads it
  function circleShape(o) {   // a shape's numbers, each within its bounds: { yd, as, inn, deg }. A ring's two distances in either order; where no ring is left, the whole disc
      var as = circleKind(o && o.as), yd = Number(o && o.yd), inn = Number(o && o.inn);
      if (!isFinite(yd) || yd < CIRCLE_MIN_YD) yd = 4;
      if (!isFinite(inn) || inn < CIRCLE_MIN_YD) inn = 0;
      if (as === 'ring' && inn > yd) { var t = inn; inn = yd; yd = t; }
      yd = Math.min(CIRCLE_MAX_YD, yd);
      var out = { yd: yd, as: as, inn: inn < yd ? inn : 0, deg: coneDeg(o && o.deg, 60) };
      if (o && o.tok === true && (as === 'r' || as === 'd')) out.tok = true;   // on a token: a circle's alone, and only as true
      return out;
  }
  function coneHolds(dir, deg, dx, dy) {   // is the point (dx, dy), counted from the cone's own point, within its angle? The point itself is not: a cone goes out from where it starts
      if (!(Math.abs(dx) > 1e-6 || Math.abs(dy) > 1e-6)) return false;
      var a = Math.atan2(dy, dx) - (isFinite(dir) ? dir : 0); a = Math.atan2(Math.sin(a), Math.cos(a));
      return Math.abs(a) <= deg * Math.PI / 360 + 1e-9;
  }
  function svgNum(v) { v = Number(v); return isFinite(v) ? Math.round(Math.max(-1e9, Math.min(1e9, v)) * 100) / 100 : 0; }   // a number for a path, within bounds so it is never written with an exponent: nothing else ever reaches one
  function discPath(x, y, r) { return 'M' + svgNum(x - r) + ' ' + svgNum(y) + 'a' + svgNum(r) + ' ' + svgNum(r) + ' 0 1 0 ' + svgNum(2 * r) + ' 0a' + svgNum(r) + ' ' + svgNum(r) + ' 0 1 0 ' + svgNum(-2 * r) + ' 0z'; }
  function ringPath(x, y, rOut, rIn) { return discPath(x, y, rOut) + (rIn > 0 ? discPath(x, y, rIn) : ''); }   // filled by the even-odd rule: the inner disc is the hole
  function conePath(x, y, r, dir, deg) {   // the wedge: from the point out along one edge, round the arc, and back
      if (deg >= 360) return discPath(x, y, r);
      var h = deg * Math.PI / 360, d = isFinite(dir) ? dir : 0;
      return 'M' + svgNum(x) + ' ' + svgNum(y) + 'L' + svgNum(x + r * Math.cos(d - h)) + ' ' + svgNum(y + r * Math.sin(d - h)) + 'A' + svgNum(r) + ' ' + svgNum(r) + ' 0 ' + (deg > 180 ? 1 : 0) + ' 1 ' + svgNum(x + r * Math.cos(d + h)) + ' ' + svgNum(y + r * Math.sin(d + h)) + 'z';
  }
  function circlePref(stored, oldBlast) {   // the shape kept on this computer (wp_radius); before 1.5.4 the tool kept feet (wp_blast)
      if (stored && typeof stored === 'object' && typeof stored.yd === 'number' && isFinite(stored.yd) && stored.yd >= CIRCLE_MIN_YD) return circleShape(stored);
      if (oldBlast && typeof oldBlast === 'object' && typeof oldBlast.ft === 'number' && isFinite(oldBlast.ft) && oldBlast.ft > 0) return circleShape({ yd: Math.min(3000, oldBlast.ft) / 3, as: 'r' });
      return circleShape({ yd: 4, as: 'r' });
  }
  var BLAST_CAP = 40;   // blasts on screen per map: the oldest go as new ones land (a throw stream from a player never grows this, or every client's render, without bound)
  function pushBlast(b) { blasts.push(b); if (blasts.length > BLAST_CAP) blasts.splice(0, blasts.length - BLAST_CAP); }
  // [systemcheck:blastaway-start]
  // 1.6.3 (the improvement week's review, finding 6): blasts are kept per map. The board shows only the map on screen's (blasts), and on the
  // GM's screen a thrown, set-off or shared blast of a map the GM leaves is put aside for that map (_blastsAway) and comes back when the GM
  // returns. Before, a look at another map cleared every blast and told the table to clear the NEW map, so the card's Apply to all in the
  // blast lost the blast it was rolled for, Undo last throw and a latecomer lost it, and players on the old map kept a circle the GM no longer
  // had. The Radius tool's own circles are this screen's measuring and go, as rulers do. A player's app and the stream window keep nothing
  // aside: the host sends the blasts of a map to whoever arrives on it (net.js blastsSendTo). blastsMapSwitch is asked by renderWhiteboard
  // when the map on screen changes; blastsFind, blastsShownOn and blastsGoOn read and clear the blasts of any map, on screen or put aside
  var _blastsAway = Object.create(null);
  function blastsKeepHere() {   // playerScreen's own test, written out: the GM's screen alone keeps blasts aside (a player's app and the stream window are sent them)
      var nB = window.wpNet; return !(nB && (nB.foreign || (nB.active && nB.role === 'client'))) && !window.wpStream;
  }
  function blastsMapSwitch(fromId, toId) {
      var keep = blastsKeepHere(), cmpS = typeof state !== 'undefined' && state && state.appState && state.appState.campaigns ? state.appState.campaigns : null;
      var fromGone = !!cmpS && typeof fromId === 'string' && !Object.keys(cmpS).some(function(k) { var c = cmpS[k]; return !!(c && c.items && Object.prototype.hasOwnProperty.call(c.items, fromId)); });   // the map left was deleted (in no campaign of this save): nothing is kept for it, as wpBlastsForget let it go; a map of another campaign keeps its own
      if (keep && typeof fromId === 'string' && fromId && !fromGone) {
          var left = blasts.filter(function(b) { return !ownCircle(b); });
          if (left.length) _blastsAway[fromId] = left.slice(-BLAST_CAP); else delete _blastsAway[fromId];
      }
      blastsSet(keep && typeof toId === 'string' && Object.prototype.hasOwnProperty.call(_blastsAway, toId) ? _blastsAway[toId] : []);
      if (typeof toId === 'string') delete _blastsAway[toId];
      renderMeasures(); syncBlastMenu();
  }
  function blastsOn(mapId) {   // the blasts of a map: those on screen where it is the map on screen, else those put aside for it
      var am = getActiveMap();
      if (am && am.id === mapId) return blasts;
      return typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(_blastsAway, mapId) ? _blastsAway[mapId] : [];
  }
  function blastsAwayFind(pred) {   // a blast put aside for a map not on screen, and that map's id, or null
      for (var k in _blastsAway) { var hit = _blastsAway[k].filter(pred)[0]; if (hit) return { b: hit, mapId: k }; }
      return null;
  }
  // The review of finding 6's fix: a blast that lands on a map the GM is NOT looking at (a player throws on map A while the GM looks at map B,
  // a fused explosive landing there) goes straight into that map's put-aside store, so the GM finds its circle on returning, a latecomer is
  // sent it (wpBlastsShown) and the card's Apply to all in the blast finds it. Asked by placeThrownBlast alone; the oldest go past BLAST_CAP,
  // as on screen. Nothing on a player's app or in the stream window, which keep nothing aside
  function blastsAwayPush(mapId, b) {
      if (!blastsKeepHere() || typeof mapId !== 'string' || !mapId || !b) return;
      var am = getActiveMap(); if (am && am.id === mapId) return;   // the map on screen holds its own (blasts)
      var list = Object.prototype.hasOwnProperty.call(_blastsAway, mapId) ? _blastsAway[mapId] : (_blastsAway[mapId] = []);
      list.push(b); if (list.length > BLAST_CAP) list.splice(0, list.length - BLAST_CAP);
  }
  // A map deleted: its put-aside blasts go with it (dialogs.js's two deletes ask this through typeof)
  window.wpBlastsForget = function(mapId) { if (typeof mapId === 'string') delete _blastsAway[mapId]; };
  // A table begun or ended: what an earlier table was told of a blast (wire, wireMap, wireChar) is not told to a latecomer of the next one, on
  // the map on screen or on any map kept aside. The blasts themselves stay on the GM's screen. net.js startHosting and leaveSession ask it
  window.wpBlastsUnwire = function() {
      var drop = function(b) { if (b) { delete b.wire; delete b.wireMap; delete b.wireChar; } };
      blasts.forEach(drop); for (var k in _blastsAway) _blastsAway[k].forEach(drop);
  };
  // [systemcheck:blastaway-end]
  var circleKept = circleShape({ yd: 4, as: 'r' });   // the Radius tool's shape, kept on this computer (wp_radius); a thrown blast takes its feet and its name from the item
  try { circleKept = circlePref(JSON.parse(localStorage.getItem('wp_radius') || 'null'), JSON.parse(localStorage.getItem('wp_blast') || 'null')); } catch (e) {}
  var circleKeptPicked = false;   // the kept shape was picked in the options while no shape of the tool's own was on screen: a circle that comes back with its token does not take its place
  var _circleUnitShown = '';   // the unit the size box was last drawn in
  var circleDir = 0;   // the way the last cone was turned (coneAim, the cone being turned, stands above the radius slice)
  var circleCas = circleKept.as === 'd' ? 'd' : 'r';   // how a circle's number was last read: what Circle goes back to from a ring or a cone
  function rulerUnitNow() { return rulerUnitOf(mapMeasureConfig().unit, state.measureUnit === 'metric'); }   // the unit the ruler reads in on the map on screen
  function rulerImpNow() { return rulerUnitOf(mapMeasureConfig().unit, false); }   // the unit the same map reads in under Imperial: a thrown blast's meters are turned from it (blastNum)
  function ownCircle(b) { return !!b && typeof b.yd === 'number' && b.yd > 0; }   // a circle of the Radius tool's own, never a thrown blast
  // What a shape is, for one of the tool's own and for a blast alike. A blast is a circle unless an explosion gave it a shape (the owner, of
  // whether a cone or a ring should explode too: "A cone and a ring, soon"): a ring keeps its inner distance in feet (shape 'ring', inFt), a
  // cone its angle and its aim (shape 'cone', deg, dir). A shape's own numbers stay in yards (as, inn)
  function kindOf(b) { return ownCircle(b) ? circleKind(b.as) : b && (b.shape === 'ring' || b.shape === 'cone') ? b.shape : 'r'; }
  function innerYd(b) { var v = ownCircle(b) ? Number(b.inn) : Number(b && b.inFt) / 3; return isFinite(v) && v > 0 ? v : 0; }   // a ring's inner distance in yards, 0 where there is none
  function playerScreen() { var n = window.wpNet; return !!(n && (n.foreign || (n.active && n.role === 'client'))); }   // someone else's table on this screen, its link up or gone (litViewer's own test): every blast effect is the GM's
  function tokenOf(map, id) { var t = null; ((map && map.whiteboard) || []).forEach(function(w) { if (w && w.id === id && w.isChar) t = w; }); return t; }   // the character token of that id on this screen's copy of the map
  // A circle on a token stands where its token stands, at the token's height unless its own was set. With its token off this screen's copy of
  // the map (deleted, or out of a player's sight) it is lost: not drawn, holding nothing, until the token is back
  function circleFollow(map) {   // true: a circle was lost or found, so what the options show has changed
      var turned = false;
      blasts.forEach(function(b) {
          if (!ownCircle(b) || typeof b.tok !== 'string') return;
          var t = tokenOf(map, b.tok), was = b.lost === true; if (!t) { b.lost = true; if (!was) turned = true; return; }
          var c = tokenCentre(t); b.x = c.x; b.y = c.y; delete b.lost; if (was) turned = true;
          if (b.autoElev) b.elev = tokenElevation(t, map);
      });
      return turned;
  }
  window.wpCircleFollow = function() { if (blasts.some(function(b) { return typeof b.tok === 'string'; })) renderMeasures(); var amN = getActiveMap(); if (amN && amN.type === 'map') { try { doorNearSync(amN); } catch (e) {} } };   // a token moved with no redraw (a drag under way, a move from the table): a circle on a token goes with it
  function shapeHolds(b, r) {   // is the token of this distance row inside b? A thrown blast and a circle by distance, a ring between its two, a cone within its angle too
      if (b.lost) return false;
      if (typeof b.tok === 'string' && r.tok && r.tok.id === b.tok) return false;   // the token a circle sits on is its center, not something inside it
      if (typeof b.spare === 'string' && r.tok && r.tok.id === b.spare) return false;   // an explosion set off from such a circle spares that token still
      if (r.d > blastRadiusYd(b) + 1e-9) return false;
      var k = kindOf(b);   // a blast that an exploded ring or cone left has that shape still
      if (k === 'ring') return r.d >= innerYd(b) - 1e-9;
      if (k === 'cone') { var c = tokenCentre(r.tok); return coneHolds(b.dir, b.deg, c.x - b.x, c.y - b.y); }
      return true;
  }
  // [systemcheck:radius-end]
  var _blastHitIds = [];
  var _armedThrow = null;   // { charId, fieldId, rowId, ft, name, by, damage, gmOnly } while a sheet Throw is armed (one-shot)
  function unitToYd(u) { return { yd: 1, ft: 1 / 3, m: 1 / 0.9144, km: 1000 / 0.9144, mi: 1760 }[u] || 1; }   // by the exact definitions, as ydPer
  function cellYards() { var cfg = mapMeasureConfig(); return cfg.per * unitToYd(cfg.unit); }
  function hexCellOf(x, y, map) {   // same rounding as datamap.js snapToHex (flat-top, s = 30, 52 px rows; the map's own hex where it sets one: backlog 38)
      var LH = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf(map) : null), s = LH && LH.type === 'hex' ? LH.s : 30, h = LH && LH.type === 'hex' ? LH.h : 52;
      if (LH && LH.type === 'hex') { x -= LH.ox || 0; y -= LH.oy || 0; }
      var q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
      var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
      return { q: rx, r: ry };
  }
  function hexDist(a, b) { var dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
  function tokenCentre(t) { return { x: t.x + (t.w || 60) / 2, y: t.y + (t.h || 52) / 2 }; }
  function tokenAtPoint(map, x, y, shown) {   // topmost character token whose box holds the point; shown: never one the GM hid (a reading players get, a thrown blast's height)
      var hit = null;
      (map.whiteboard || []).forEach(function(t) { if (t.isChar && !(shown && t.hidden) && x >= t.x && x <= t.x + (t.w || 60) && y >= t.y && y <= t.y + (t.h || 52)) hit = t; });
      return hit;
  }
  // Horizontal distance in yards between two board points, the way the handbook counts it
  function boardYards(ax, ay, bx, by) {
      if (state.gridType === 'hex') return hexDist(hexCellOf(ax, ay), hexCellOf(bx, by)) * cellYards();
      return Math.hypot(bx - ax, by - ay) / mapMeasureConfig().cellPx * cellYards();
  }
  function blastRadiusYd(b) { return ownCircle(b) ? b.yd : b.ft / 3; }   // the tool's own circle keeps yards; a thrown blast its item's feet
  function blastDistances(b, map) {   // every character token (hidden ones too — the GM is the only viewer)
      var elevOn = stanceOn('elevation');
      return (map.whiteboard || []).filter(function(t) { return t.isChar; }).map(function(t) {
          var c = tokenCentre(t);
          var h = yardsOn(map, b, c);   // 1.5.8: on that map's own grid (a mine may go off on a map that is not on screen)
          var v = elevOn ? tokenElevation(t, map, b.thrown === true) - (b.elev || 0) : 0;   // item 19b H5: on the ground it stands on (a thrown blast, shown to the table, never reads a hidden piece's)
          return { tok: t, h: h, v: v, d: Math.sqrt(h * h + v * v) };
      });
  }
  function blastSvg() {
      var map = getActiveMap(); if (!map) return '';
      var mineH = mineIconsSvg(map); if (!blasts.length) return mineH;   // 1.5.8 explosives: a placed mine's mark at its spot, on the GM's screen
      var pxPerYd = mapMeasureConfig().cellPx / cellYards(), elevOn = stanceOn('elevation'), html = '', ru = rulerUnitNow(), ri = rulerImpNow();
      if (circleFollow(map)) { if (!circleKeptPicked && typeof circleRekept === 'function') circleRekept(); syncBlastMenu(); }   // a circle on a token stands where its token stands now; one lost or found: the options show what is on screen, and the next click places it
      blasts.forEach(function(b, i) {
          if (b.lost) return;   // its token is off this screen's copy of the map
          var rYd = blastRadiusYd(b), rPx = rYd * pxPerYd, own = ownCircle(b);   // the tool's own circle and a thrown blast both read in the ruler's unit (blastSize); a thrown blast keeps its item's feet inside
          var onTok = own && typeof b.tok === 'string';   // on a token: a press at its center is the token's, so its dot takes none (the style sheet's on-tok)
          html += '<g class="blast' + (own ? ' own' : '') + (onTok ? ' on-tok' : '') + '" data-i="' + i + '"><title>' + (onTok ? 'It moves with its token \u00b7 right-click its edge to remove' : 'Drag to move \u00b7 right-click to remove') + '</title>';
          var kind = kindOf(b), DOT = '<circle class="dot" cx="' + b.x + '" cy="' + b.y + '" r="6"></circle>', GRAB = '<circle class="ring" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle>';
          if (kind === 'cone') html += '<path class="area" d="' + conePath(b.x, b.y, rPx, b.dir, b.deg) + '"></path>' + DOT + (own ? '<circle class="blast-aim" data-i="' + i + '" cx="' + svgNum(b.x + rPx * Math.cos(b.dir || 0)) + '" cy="' + svgNum(b.y + rPx * Math.sin(b.dir || 0)) + '" r="7"><title>Drag to turn the cone</title></circle>' : '');   // a path is numbers only (svgNum); a blast's cone has no handle: it went off as it was aimed
          else if (kind === 'ring' && innerYd(b) > 0) html += '<path class="area" fill-rule="evenodd" d="' + ringPath(b.x, b.y, rPx, innerYd(b) * pxPerYd) + '"></path>' + GRAB + DOT;
          else html += '<circle class="area" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle>' + GRAB + DOT;
          if (b.thrown) html += standInSvg('grenade', b.x, b.y, b.icon);   // 1.5.8 explosives: its icon at the center of the blast, the item's own or the stand-in
          var lblName = blastName(b) ? esc(blastName(b)) + ' \u00b7 ' : '', lblSize = esc(blastSize(b, ru, ri));   // a shape of the tool's own and a thrown blast alike in the ruler's unit (1.5.4), the words blastWords says
          var lbl = lblName + lblSize + (elevOn ? ' \u00b7 at ' + fmtElev(b.elev || 0) + ' ' + lenUnit() : '');   // item 19 H1: a height in the viewer's unit.
          html += '<text x="' + (b.x + 8) + '" y="' + (kind === 'cone' ? b.y - 12 : b.y - rPx - 8) + '">' + lbl + '</text>';   // a cone's words stand at its point: it has no top
          if (!playerScreen() && kind !== 'cone' && kind !== 'ring') html += '<text class="blast-boom" data-i="' + i + '" x="' + (b.x + 8) + '" y="' + (b.y - rPx - 26) + '">Boom</text>';   // fires a burst everyone sees (1.5.0)
          blastDistances(b, map).forEach(function(r) {
              if (!shapeHolds(b, r)) return;
              var cvB = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;   // cover follow-ups: the cover each token in range has from the blast's center (local, advisory); item 19 H1: from the blast's height
              html += '<text class="hit" x="' + (r.tok.x + (r.tok.w || 60) / 2) + '" y="' + (r.tok.y - 5) + '" text-anchor="middle">' + esc(rulerLen(r.d, ru)) + (elevOn && r.v ? ' (' + (r.v > 0 ? '\u2191' : '\u2193') + (Math.round(ydOut(Math.abs(r.v)) * 10) / 10) + ')' : '') + (cvB ? ' \u00b7 ' + esc(cvB.name) : '') + '</text>';
          });
          html += '</g>';
      });
      return html + mineH;
  }
  function applyBlastHits() {   // a token inside a thrown blast is marked as hit, one inside circles of the Radius tool alone as measured
      var map = getActiveMap(), hit = Object.create(null);
      if (map && blasts.length) blasts.forEach(function(b) { var own = ownCircle(b); blastDistances(b, map).forEach(function(r) { if (shapeHolds(b, r) && !(own && hit[r.tok.id])) hit[r.tok.id] = own ? 'circle-hit' : 'blast-hit'; }); });
      _blastHitIds.forEach(function(id) { if (state.wbEls[id]) state.wbEls[id].classList.remove('blast-hit', 'circle-hit'); });
      _blastHitIds = Object.keys(hit);
      _blastHitIds.forEach(function(id) { if (state.wbEls[id]) state.wbEls[id].classList.add(hit[id]); });
  }
  window.wpBlastLen = function(ft) { return blastLen(ft, rulerUnitNow(), rulerImpNow()); };   // the sheet's blast tag, in the ruler's unit on the map on screen
  window.wpRulerUnit = function() { return rulerUnitNow() + '|' + rulerImpNow(); };   // ... and that unit with the one its meters are turned from, so the sheet is drawn again on a map in another unit
  window.wpRefreshBlasts = function() { if (blasts.length || _blastHitIds.length || measures.length) renderMeasures(); };   // and the rulers placed: their words read the tokens they end on (a posture, a height) and the table's switches
  window.wpBlasts = function() { return blasts; };   // sandbox testing hook
  window.wpBlastsShown = function(mapId) { return blastsOn(mapId).filter(function(b) { return !!b.wire && b.wireMap === mapId; }).map(function(b) { return { wire: b.wire, charId: b.wireChar }; }); };   // 1.6.0: what the table was told is standing on that map, for one who comes to it after
  window.wpFightBlastsGo = function(mapId) {   // 1.6.0: the last fight on a map is over: the circles of what was thrown there go on every screen. The Radius tool's own stay, and one that waits on its fuse
      var had = blasts.length, fz = typeof _fused !== 'undefined' ? _fused : [], amG = getActiveMap();
      if (typeof mapId === 'string' && amG && amG.id !== mapId) {   // 1.6.3: a map not on screen loses the blasts put aside for it (blastsOn)
          var awayG = blastsOn(mapId).filter(function(b) { return fz.some(function(f) { return f.b === b; }); });
          if (awayG.length) _blastsAway[mapId] = awayG; else delete _blastsAway[mapId];
      } else {
      blastsSet(blasts.filter(function(b) { return ownCircle(b) || fz.some(function(f) { return f.b === b; }); }));
      if (blasts.length !== had) { renderMeasures(); syncBlastMenu(); }
      }
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlastClear) window.wpNet.broadcastBlastClear(mapId);
  };
  function clearBlasts() { blastsSet([]); renderMeasures(); syncBlastMenu(); if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlastClear) { var mc = getActiveMap(); window.wpNet.broadcastBlastClear(mc ? mc.id : null); } }
  // Seat a blast in its grid cell; a blast whose height was never edited follows the token standing there
  function seatBlast(b) {
      if (state.gridType === 'hex') { var hc = snapToHex(b.x, b.y, 30, 'center'); b.x = hc.x; b.y = hc.y; }
      else if (state.gridType === 'square') { var LB = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null) || { size: 50 }, bz = LB.size, bx0 = LB.ox || 0, by0 = LB.oy || 0; b.x = Math.floor((b.x - bx0) / bz) * bz + bz / 2 + bx0; b.y = Math.floor((b.y - by0) / bz) * bz + bz / 2 + by0; }
      if (b.autoElev) { var mapS = getActiveMap(), under = mapS && tokenAtPoint(mapS, b.x, b.y, b.thrown); b.elev = under ? tokenElevation(under, mapS, b.thrown === true) : groundAt(mapS, b.x, b.y, b.thrown === true); }   // item 19b H5: on the ground there (a thrown blast never reads a hidden piece's)   // hidden pieces: a thrown blast (sent to the table) takes no height from a token the GM hid; the GM's own tool reads them, the GM being its only viewer
  }
  function placeBlast(e) {
      var map = getActiveMap(); if (!map) return;
      var box = wbWrap.getBoundingClientRect();
      var x = wbX(e.clientX, e.clientY, box, wbWrap);
      var y = wbY(e.clientX, e.clientY, box, wbWrap);
      if (_armedThrow) {   // a throw from a character sheet: one-shot, host-authoritative, shared to the map
          var ctx = _armedThrow; _armedThrow = null; document.body.classList.remove('placing');
          if (ctx.stray) { if (typeof strayClick === 'function') strayClick(ctx.stray, x, y); var mvS = document.getElementById('moveModeBtn'); if (mvS) mvS.click(); return; }   // 1.6.0 A burst: the way a stray round lands
          if (typeof ctx.aim === 'function') { var mvA = document.getElementById('moveModeBtn'); if (mvA) mvA.click(); ctx.aim({ x: x, y: y }); return; }   // 1.6.0 An attack on a line: where it is aimed
          if (ctx.launch) { if (typeof launchAt === 'function') launchAt({ x: x, y: y, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId }, map); var mvL = document.getElementById('moveModeBtn'); if (mvL) mvL.click(); return; }   // 1.5.9 Chambers from: the GM's Launch, a round's blast with no throw
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { if (window.wpNet.throwReq) window.wpNet.throwReq(ctx.charId, ctx.fieldId, ctx.rowId, x, y, map.id); }
          else placeThrownBlast({ x: x, y: y, ft: ctx.ft, name: ctx.name, by: ctx.by, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId, damage: ctx.damage, gmOnly: ctx.gmOnly });   // 1.5.8 explosives: the row it is thrown from
          var mvB = document.getElementById('moveModeBtn'); if (mvB) mvB.click();
          return;
      }
      // The Radius tool's own circle lands in a cell, at the height of whoever stands there (a token on a catwalk), else the ground.
      // It is this screen's alone, whoever places it: nothing of it is sent, as nothing of a ruler is
      var b = { x: x, y: y, yd: circleKept.yd, as: circleKept.as, name: '', elev: 0, autoElev: true };
      if (b.as === 'ring') b.inn = circleKept.inn; else if (b.as === 'cone') { b.deg = circleKept.deg; b.dir = circleDir; }
      if (circleKept.tok === true) {   // a circle on a token: the click names the token, and the circle sits on it and nowhere else
          var onT = tokenAtPoint(map, x, y); if (!onT) { toast('Click a token to put the circle on it.'); return; }
          b.tok = onT.id;
      } else seatBlast(b);
      pushBlast(b); circleKeptPicked = false; if (typeof b.tok === 'string') circleFollow(map);
      renderMeasures(); syncBlastMenu();
      if (b.as !== 'cone') circleSaid(b, map);   // a cone is said once its aim is let go
      return b;
  }
  function circleSaid(b, map) {   // the notice for a shape of the tool's own: what it is, where it stands, how many tokens it holds
      var n = blastDistances(b, map).filter(function(r) { return shapeHolds(b, r); }).length;
      toast(circleWords(b.yd, b.as, rulerUnitNow(), b.inn, b.deg) + (stanceOn('elevation') ? ', at ' + fmtElev(b.elev) + ' ' + lenUnit() : '') + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' inside. ' + (typeof b.tok === 'string' ? 'It moves with its token. Right-click its edge to remove.' : b.as === 'cone' ? 'Drag it to move, its handle to turn it, right-click to remove.' : 'Drag it to move, right-click to remove.'));
  }
  // A cone in hand follows the pointer once the pointer has really moved: a plain click leaves it turned as the last one was
  function coneTurn(e) {
      var a = coneAim, b = a && a.b; if (!b || blasts.indexOf(b) < 0) { coneAimSet(null); return; }
      if (e.buttons === 0) { coneLetGo(); return; }   // the button was let go where no pointerup came, outside the window: the aim ends here
      if (!a.moved && Math.hypot(e.clientX - a.sx, e.clientY - a.sy) < 6) return;
      a.moved = true;
      var box = wbWrap.getBoundingClientRect(), dx = wbX(e.clientX, e.clientY, box, wbWrap) - b.x, dy = wbY(e.clientX, e.clientY, box, wbWrap) - b.y;
      if (Math.hypot(dx, dy) < 4) return;   // on the point itself there is no way to turn
      b.dir = Math.atan2(dy, dx); renderMeasures();
  }
  function coneLetGo() {
      var a = coneAim; coneAimSet(null); if (!a || !a.b || blasts.indexOf(a.b) < 0) return;
      circleDir = typeof a.b.dir === 'number' && isFinite(a.b.dir) ? a.b.dir : 0;
      if (a.fresh) { var m = getActiveMap(); if (m) circleSaid(a.b, m); }
      syncBlastMenu();
  }
  // A blast thrown from a character sheet: placed on the host, shown to everyone on the map (never the personal quick-tool). opts: x, y (the
  // point clicked), ft, name, by, charId, fieldId, rowId (the row it is thrown from), damage, gmOnly; and from this machine alone: goOff (a mine
  // going off: no roll, no aim), direct (the token struck directly), dtype, notes, icon. mapIn: the map it goes off on (the map on screen else)
  // 1.6.0: what an item's list says of its blast, by the Combat tab's two stats: BlastFills, the yards it fills, and BlastNoDrop. f, the list its row stands on; def, its entry
  function blastStats(sys, f, def) {
      var rl = typeof blastRules === 'function' ? blastRules(sys) : null, S = window.wpSystemCore, out = {}; if (!rl || !S || typeof S.rowStat !== 'function' || !f || !f.list || !def) return out;
      if (rl.fills) { var fv = S.rowStat(f.list, def, rl.fills); if (typeof fv === 'number' && isFinite(fv) && fv > 0) out.fills = Math.min(10000, fv); }
      if (rl.noDrop) { var nv = S.rowStat(f.list, def, rl.noDrop); if (typeof nv === 'number' && isFinite(nv) && nv !== 0) out.noDrop = true; }
      if (rl.itemScale) { var iv = S.rowStat(f.list, def, rl.itemScale); if (typeof iv === 'number' && isFinite(iv) && iv > 0 && iv !== 1) out.iscale = Math.min(1000, iv); }   // 1.6.2 (the core's gap 213): BlastScale, the item's own scale
      return out;
  }
  function placeThrownBlast(opts, mapIn) {
      var map = mapIn || getActiveMap(); if (!map || !opts) return null;
      var pre = typeof throwPrep === 'function' ? throwPrep(opts, map) : null;   // 1.5.8 explosives: its row, its aim, its roll and its scatter (a suite runs this function alone)
      if (pre && pre.stop) { toast(pre.stop); return null; }
      if (pre && pre.mine !== undefined) return pre.mine;
      var amS = getActiveMap(), onScreen = !mapIn || !!(amS && amS.id === map.id), land = pre ? pre.land : { x: opts.x, y: opts.y };   // by its id: the map on screen
      var ft = Math.max(1, Math.min(3000, Math.round(opts.ft || 0))) || 12;
      var b = { x: land.x, y: land.y, ft: ft, name: opts.name || '', elev: (opts.elev !== undefined ? opts.elev : 0), autoElev: opts.elev === undefined, thrown: true, by: opts.by || '' };
      if (pre) {   // 1.5.8: the blast's own id (its card's Apply to all), the damage it rolls, its type, the token struck directly, its notes and its icon
          b.bid = 'b_' + Math.random().toString(36).slice(2, 12); b.dmgExpr = typeof opts.damage === 'string' ? opts.damage : ''; if (pre.direct) b.direct = pre.direct; if (opts.gmOnly) b.gm = true;
          if (typeof opts.charId === 'string' && opts.charId) b.rollBy = opts.charId;   // 1.6.0 (the core's gap 8): whose roll each victim's own dice are, under the GM's rolling
          if (typeof opts.atkM === 'number') b.atkM = opts.atkM; if (typeof opts.defKey === 'string') b.defKey = opts.defKey;   // 1.6.0: a blast's own Defense roll (the host's memory alone)
          var dty = opts.goOff ? opts.dtype : pre.area && pre.area.type; if (typeof dty === 'string' && dty) b.dtype = dty;
          var nts = opts.goOff ? opts.notes : pre.def && !opts.gmOnly ? pre.def.notes : ''; if (typeof nts === 'string' && nts.trim()) b.notes = nts.trim().slice(0, 800);
          var ico = opts.goOff ? opts.icon : pre.def ? pre.def.icon : ''; if (typeof ico === 'string' && ico) b.icon = ico;
          var adB = opts.goOff ? opts.ad : pre.area && pre.area.ad; if (typeof adB === 'number' && isFinite(adB) && adB > 0) b.ad = adB;
          var lcB = opts.goOff ? opts.loc : pre.area && pre.area.loc; if (typeof lcB === 'string' && lcB) b.loc = lcB.slice(0, 60);   // 1.6.2 (the CORE session's batch 6, 11): the location it strikes (the host's memory alone)
          var fgB = opts.goOff ? opts.frag : pre.area && pre.area.frag; if (typeof fgB === 'string' && fgB) { b.frag = { expr: fgB.slice(0, (window.wpSystemCore && window.wpSystemCore.LIMITS && window.wpSystemCore.LIMITS.formula) || 10000), by: typeof opts.charId === 'string' ? opts.charId : '', gm: !!opts.gmOnly }; var fgT = opts.goOff ? opts.fragType : pre.area && pre.area.fragType; if (typeof fgT === 'string' && fgT) b.frag.type = fgT; }   // 1.5.9 (es): its fragmentation, rolled as it goes off (the host's memory alone: broadcastBlast names none of it)
          var afB = opts.goOff ? opts.aff : pre.area && pre.area.aff, BCa = window.wpBlastCore, afC = Array.isArray(afB) && BCa && typeof BCa.cleanAffs === 'function' ? BCa.cleanAffs(afB) : null; if (afC) b.aff = afC; var clB = opts.goOff ? opts.cloud : pre.area && pre.area.cloud, clC = clB && BCa && typeof BCa.cleanCloud === 'function' ? BCa.cleanCloud(clB) : null; if (clC) b.cloud = clC;   // 1.6.2: the cloud it leaves   // 1.5.9 (es): its afflictions, rolled by those it reaches as it goes off (the host's memory alone, as its fragmentation)
          var fsB = opts.goOff ? opts : pre.tr && typeof blastStats === 'function' ? blastStats(getActiveCampaign().system, pre.tr.f, pre.def) : null; if (fsB) { if (typeof fsB.fills === 'number' && fsB.fills > 0) b.fills = fsB.fills; if (fsB.noDrop === true) b.noDrop = true; if (typeof fsB.iscale === 'number' && fsB.iscale > 0) b.iscale = fsB.iscale; }   // 1.6.0: what its list says of it (the host's memory alone, as its fragmentation)
      }
      if (onScreen) seatBlast(b);
      var thrB = opts.charId ? (map.whiteboard || []).filter(function(w) { return w.charId === opts.charId; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] : null;   // cover follow-ups (owner, answer 5): the thrower's token on this map
      var seatB = window.wpFog && window.wpFog.blastSeat ? window.wpFog.blastSeat(map, b.x, b.y, thrB ? thrB.x + (thrB.w || 60) / 2 : opts.x, thrB ? thrB.y + (thrB.h || 52) / 2 : opts.y) : null;   // a blast can't go off inside a wall or a closed door: it goes off in front, on the thrower's side
      if (pre && typeof blastEnvAt === 'function') { var enB = blastEnvAt(getActiveCampaign(), map, b); if (enB) b.env = enB; var rdF = typeof blastRules === 'function' ? blastRules(getActiveCampaign() && getActiveCampaign().system) : null; if (rdF && rdF.radius) { b.cell = blastCell(map); var rdV = blastFig(rdF.radius, function(nm) { var l = String(nm).toLowerCase(); return l === 'blastradius' ? b.ft / 3 : l === 'mapcell' ? b.cell : l === 'blastscale' ? (typeof b.iscale === 'number' && b.iscale > 0 ? b.iscale : 1) : l === 'blastdice' ? (window.wpBlastCore && window.wpBlastCore.diceCount ? window.wpBlastCore.diceCount(b.dmgExpr || '') : 0) : l.indexOf('env.') === 0 && window.wpBlastCore && window.wpBlastCore.envRead ? window.wpBlastCore.envRead(b.env, l.slice(4)) : undefined; }, false); if (typeof rdV === 'number' && rdV > 0) b.ft = Math.max(1, Math.min(3000, Math.round(rdV * 3))); } }   // 1.6.2: the readings where it lands, and its radius by them (vacuum, water)
      if (seatB) { b.x = seatB.x; b.y = seatB.y; if (b.autoElev) { var underB = tokenAtPoint(map, b.x, b.y, true); b.elev = underB ? tokenElevation(underB, map, true) : groundAt(map, b.x, b.y, true); } }
      if (onScreen) { pushBlast(b); renderMeasures(); syncBlastMenu(); }
      else if (typeof blastsAwayPush === 'function') blastsAwayPush(map.id, b);   // the review of finding 6's fix: a map not on screen keeps it aside for when the GM comes to it
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlast) { b.wire = { x: b.x, y: b.y, ft: b.ft, name: opts.gmOnly ? '' : b.name, elev: b.elev, by: b.by }; b.wireMap = map.id; b.wireChar = opts.charId; window.wpNet.broadcastBlast(b.wire, map.id, opts.charId); }   // a GM-only item's blast reaches players unnamed
      var n = blastDistances(b, map).filter(function(r) { return r.d <= blastRadiusYd(b) + 1e-9; }).length;
      var rw = typeof blastSize === 'function' && typeof rulerUnitNow === 'function' ? blastSize({ ft: b.ft }, rulerUnitNow(), typeof rulerImpNow === 'function' ? rulerImpNow() : '') : 'Radius ' + b.ft + ' ft';   // in the ruler's unit, as its label (1.5.4): in meters as the sheet says a measure
      toast((opts.goOff ? (b.name || 'A mine') + (pre && pre.fuse ? ' lands' : ' goes off') : (b.by ? b.by + ' throws ' : 'Thrown: ') + (b.name || 'a blast')) + ', ' + rw.charAt(0).toLowerCase() + rw.slice(1) + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' in range.' + (pre ? pre.said : '') + (seatB ? ' It went off in front of the wall or door it hit.' : '') + (onScreen ? '' : (pre && pre.fuse ? ' It is on ' : ' It went off on ') + ((map.meta && map.meta.title) || map.title || 'another map') + '.'));
      if (pre && pre.area && pre.area.use === true && pre.tr && typeof useOneUp === 'function') useOneUp(getActiveCampaign(), pre.tr);
      if (pre && pre.fuse && typeof fuseSet === 'function') { fuseSet(map, b, opts, n); return b; }   // 1.5.8: it goes off at the start of the next turn
      if (window.wpSoundOn) window.wpSoundOn.fire({ k: opts.mine === true ? 'mine' : 'blast' }, { map: map.id });   // 1.6.2: a blast is shown to all on its map, so its sound is theirs too
      resolveThrow(b, opts, n, map);
      return b;
  }
  window.wpPlaceThrownBlast = placeThrownBlast;   // net.js calls this on the host after validating a player's throw-req
  // The damage half of a throw (host/solo only): roll the item's damage, and in full-auto apply it to every in-range token as one undoable
  // transaction. blastAuto: full = roll+apply, roll = roll to chat (its card can apply it to all in the blast, once), measure = neither
  function resolveThrow(b, opts, nInRange, mapIn) {
      if (b && b.cloud && typeof cloudLay === 'function') cloudLay(b, mapIn);   // 1.6.2: the cloud it leaves, whatever its damage does
      var camp = getActiveCampaign(), sys = camp && camp.system, fgN = b && b.frag ? (opts && opts.name || 'The blast') : '', afN = b && b.aff ? (opts && opts.name || 'The blast') : ''; if (!sys || !opts || !opts.damage) { if (fgN && sys && opts) toast(fgN + ' has no damage roll, so its fragmentation was not rolled.'); if (afN && sys && opts && typeof applyBlastAffs === 'function') applyBlastAffs(b, mapIn, afN); return; }   // 1.5.9 (es): fragmentation rides on the blast's damage; an affliction does not (one that reaches everyone in the blast is rolled at once)
      var combat = sys.combat || {}, auto = combat.blastAuto || 'full';
      if (auto === 'measure') { if (fgN) toast('Blast automation is Measure only, so the fragmentation of ' + fgN + ' was not rolled.'); if (afN) toast('Blast automation is Measure only, so the afflictions of ' + afN + ' were not rolled.'); return; }
      if (window.wpVtt && !window.wpVtt.on('dice')) { if (fgN) toast('Dice are off, so the fragmentation of ' + fgN + ' was not rolled.'); if (afN) toast('Dice are off, so the afflictions of ' + afN + ' were not rolled.'); return; }
      if (!window.wpDice || !window.wpDice.rollFor) return;
      var rlE = typeof blastRules === 'function' ? blastRules(sys) : null; if (auto === 'full' && rlE && rlE.each && b && b.dmgExpr) { applyBlastDamage(b, 0, combat.hpResource, mapIn); return; }   // 1.6.0 (the core's gap 8): each rolls its own dice, so none is rolled for all
      var drO = { gmOnly: !!opts.gmOnly, dmg: true, blast: b && b.bid, used: auto === 'full' }; if (auto === 'full' && rlE && rlE.defend && typeof rlE.defend === 'object' && b && b.noDrop !== true) drO.usedWait = true; var dr = window.wpDice.rollFor(opts.charId, opts.damage, (opts.name || 'Blast') + ' damage', drO);   // a GM-only item's damage stays the GM's; chat cards: a damage card (an item's damage is damage by nature, as on his reference sheets)
      var total = dr && dr.ok && typeof dr.value === 'number' ? dr.value : null;
      if (auto !== 'full' || total === null) { if (fgN && auto === 'roll' && total !== null) toast('The fragmentation of ' + fgN + ' is rolled when you press Apply to all in the blast.'); if (afN && auto === 'roll' && total !== null) toast('The afflictions of ' + afN + ' are rolled when you press Apply to all in the blast.'); return; }
      applyBlastDamage(b, total, combat.hpResource, mapIn);
  }
  var _lastThrowTx = null;
  // [buildcheck:cloud-start] 1.6.2 (the owner, 2026-11-08): the cloud an explosive leaves, laid by the host where it goes off as an ordinary circle
  // piece: smoke where the item says, a hazard's effect while in it and its GM roll for everyone in it (fogcore cleanHazard). piece.cloud is
  // the host's alone ({ s: game seconds left }, or {} for one that stays until cleared): a round of a fight on its map takes a round off it
  // (net.js roundChanged), a move of the game clock takes that time off where no fight runs on its map (calendar.js moveTo). It stays put
  function cloudLay(b, mapIn) {
      var camp = getActiveCampaign(), map = mapIn || getActiveMap(), FC = window.wpFogCore, S = window.wpSystemCore, F = window.wpFormula; if (!camp || !map || !b || !b.cloud || typeof b.cloud !== 'object') return null;
      if (window.wpStream || (window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return null;
      var cl = b.cloud, sys = camp.system || {}, secs = 0;
      if (typeof cl.n === 'string' && cl.n && F && S && typeof S.affLastsSecs === 'function') { var rr = null; try { rr = F.evaluate(cl.n, { vars: function() { return undefined; } }); } catch (e) { rr = null; } var nn = rr && rr.ok && typeof rr.value === 'number' && isFinite(rr.value) ? rr.value : 0; if (nn > 0) secs = S.affLastsSecs(sys, nn, cl.u); }
      var amC = getActiveMap(), pxYd = amC && amC.id === map.id ? mapMeasureConfig().cellPx / cellYards() : 50, yd = typeof cl.r === 'number' && cl.r > 0 ? cl.r : blastRadiusYd(b), r = Math.max(10, yd * pxYd);
      var z = { id: 'wb' + uid() + Math.random().toString(36).slice(2, 5), type: 'circle', x: Math.round(b.x - r), y: Math.round(b.y - r), w: Math.round(r * 2), h: Math.round(r * 2), color: '#8f969c', opacity: 0.45, name: ((b.name || 'A blast') + ' cloud').slice(0, 120), cloud: secs > 0 ? { s: secs } : {} };
      if (cl.smoke === true) z.smoke = true;
      var hz = FC && typeof FC.cleanHazard === 'function' ? FC.cleanHazard({ fx: cl.fx, roll: cl.roll }) : null; if (hz) z.hazard = hz;
      map.whiteboard = map.whiteboard || []; map.whiteboard.push(z); save(); render();
      if (window.wpStepLog) window.wpStepLog('cloud v1', 'laid', { secs: secs, smoke: !!z.smoke, fx: !!(hz && hz.fx), roll: !!(hz && hz.roll) });
      return z;
  }
  function cloudsTick(map, secs) {   // take secs off each cloud on the map; one that runs out goes. How many went
      if (!map || !Array.isArray(map.whiteboard) || !(typeof secs === 'number' && secs > 0)) return 0; var gone = [];
      map.whiteboard.forEach(function(w) { if (w && w.cloud && typeof w.cloud === 'object' && typeof w.cloud.s === 'number' && isFinite(w.cloud.s)) { w.cloud.s = Math.round((w.cloud.s - secs) * 1000) / 1000; if (w.cloud.s <= 0) gone.push(w); } });
      if (!gone.length) return 0;
      map.whiteboard = map.whiteboard.filter(function(w) { return gone.indexOf(w) < 0; });
      gone.forEach(function(w) { toast((w.name || 'A cloud') + ' clears.'); if (window.wpStepLog) window.wpStepLog('cloud v1', 'cleared', {}); });
      return gone.length;
  }
  function cloudHost() { return !window.wpStream && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client'); }
  window.wpCloudRound = function(mapId) {   // net.js roundChanged: a round first reached in a fight on that map
      var camp = getActiveCampaign(), map = camp && camp.items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, S = window.wpSystemCore; if (!map || !cloudHost()) return 0;
      var n = cloudsTick(map, S && typeof S.roundSecs === 'function' ? S.roundSecs(camp.system) : 6); if (n) { save(); render(); } return n;
  };
  window.wpCloudTime = function(secs) {   // calendar.js moveTo: the game clock moved on, on every map where no fight runs
      var camp = getActiveCampaign(), N = window.wpNet, n = 0; if (!camp || !camp.items || !cloudHost()) return 0;
      Object.keys(camp.items).forEach(function(id) { var m = camp.items[id]; if (!m || !Array.isArray(m.whiteboard) || (N && typeof N.fightsOn === 'function' && N.fightsOn(id).length)) return; n += cloudsTick(m, secs); });
      if (n) render(); return n;
  };
  // [buildcheck:cloud-end]
  // [systemcheck:explosives-start]
  // 1.5.8 explosives (the owner, 2026-10-25, by prompt: "Blast damage by the book", "Throw like the site"; and "once it starts using the site
  // throws, it should automatically place an explosive in the area indicated in the throw, following rules on when it automatically detonates
  // and causes damage", "Mines only activate when they are stepped on, as opposed to grenades that automatically detonate once deployed").
  // The host's half: blastcore.js is the pure one. A throw knows what it aims at: the character token clicked, else the point clicked. Where the
  // system's Combat tab names a throw's roll (combat.blast.roll) and the item a throw skill, the host rolls it first, with the range to the aim:
  // a success lands on the aim, a miss scatters from it along the line of the throw by the scatter's feet, a critical failure goes off in the
  // thrower's hand. Where the card names how far and how near a thing may be thrown (max, min, in yards), a throw past them is refused in
  // words. A thrown explosive goes off where it lands, at once. An item marked Placed, not thrown (a mine) is laid as a trigger zone hidden
  // from players and goes off only when a character token steps into its trigger radius, or by the GM's own hand; never when it is placed.
  // Going off uses one up where the item says so (its area's use). A blast's damage takes each token's share by the card's falloff
  // (combat.blast.fall) and, where the system has the damage step, sends it through it: DR at the default location (the first row named
  // Torso), the blast's damage type, the pool. With no falloff a blast is what it always was
  // 1.6.2: the Environment readings where a blast goes off, by the system's readings: its cell's, else the map's, as a token there reads them
  function blastEnvAt(camp, map, b) {
      var FC = window.wpFogCore, env = camp && camp.system && Array.isArray(camp.system.env) ? camp.system.env : []; if (!FC || typeof FC.envAt !== 'function' || !env.length || !map || !b) return null;
      var got = FC.envAt(env.map(function(e) { return e && e.key; }), map, { x: b.x - 30, y: b.y - 26, w: 60, h: 52 }, FC.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell, map.meta && map.meta.cell));
      return got && Object.keys(got).length ? got : null;
  }
  function blastRules(sys) { var c = sys && sys.combat && typeof sys.combat === 'object' ? sys.combat : null; return c && c.blast && typeof c.blast === 'object' && !Array.isArray(c.blast) ? c.blast : null; }
  function blastKind(sys, rules) { var k = rules && typeof rules.kind === 'string' ? rules.kind : '', ks = sys && sys.combat && sys.combat.damage && Array.isArray(sys.combat.damage.kinds) ? sys.combat.damage.kinds : []; return k && ks.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === k.toLowerCase(); }) ? k : ''; }   // 1.6.0: the kind of blow a blast's shares and fragmentation carry, one the damage rules still name
  function throwRowOf(camp, opts) {   // the carried row a throw names, on this machine's own copy: { ch, f, row, def } (def: its definition, the GM's view)
      var S = window.wpSystemCore, sys = camp && camp.system; if (!S || !sys || !opts || typeof opts.charId !== 'string' || typeof opts.fieldId !== 'string' || typeof opts.rowId !== 'string') return null;
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, opts.charId) ? camp.chars[opts.charId] : null; if (!ch) return null;
      var f = S.fieldById(sys, opts.fieldId); if (!f || f.kind !== 'item-list') return null;
      var row = (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).filter(function(r) { return r && r.hid !== 1 && S.rowIdOf(r) === opts.rowId; })[0]; if (!row) return null;
      var rd = S.rowDef(sys, row); return rd && rd.def ? { ch: ch, f: f, row: row, def: rd.def } : null;
  }
  function throwerOf(map, charId) { return charId ? (map.whiteboard || []).filter(function(w) { return w && w.charId === charId && !w.waiting; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] || null : null; }
  function blastBid() { return 'b_' + Math.random().toString(36).slice(2, 12); }
  function yardsOn(map, a, b) {   // yards between two board points on that map: the board's own reading on the map on screen, the map's own grid elsewhere
      var amY = getActiveMap(); if (!map || (amY && amY.id === map.id)) return boardYards(a.x, a.y, b.x, b.y);
      var S = window.wpSystemCore, camp = getActiveCampaign(), d = S && S.rangeDist ? S.rangeDist(camp && camp.system, map, a, b, 'yd') : null;
      return typeof d === 'number' && isFinite(d) ? d : Math.hypot(b.x - a.x, b.y - a.y) / 50;
  }
  // 1.6.0 (the v2 combat module): the throw roll's own names worked into its text before it is rolled as the thrower: ThrowSkill, the item's throw
  // skill; Row.<name>, the thrown row's own figure (its weight, its own ranges); ThrowDistance, the yards to the aim, unless the system has a field
  // of its own by that name, which then keeps its own value. A Row. name that gives no number, or that safe refuses, is left as it was written, as before
  function throwExpr(text, def, rowR, dYd, sys, safe) {
      var t = text.replace(/\bThrowSkill\b/gi, '(' + def.throwSkill + ')');
      if (typeof rowR === 'function') t = t.replace(/\bRow\.([A-Za-z_][A-Za-z0-9_]*)/g, function(m, k) { if (typeof safe === 'function' && !safe(k)) return m; var v = blastFig('Row.' + k, rowR, false); return typeof v === 'number' ? '(' + v + ')' : m; });
      var own = sys && Array.isArray(sys.fields) && sys.fields.some(function(f) { return f && typeof f.key === 'string' && f.key.toLowerCase() === 'throwdistance'; });
      if (!own && typeof dYd === 'number' && isFinite(dYd)) t = t.replace(/\bThrowDistance\b/gi, '(' + Math.round(Math.max(0, dYd) * 100) / 100 + ')');
      return t;
  }
  // ... and which of the thrown row's names may stand as their figure: one that reads nothing GM-only, through the row (a column's formula too), and
  // not on a GM-only row unless the throw is the GM's alone. A figure would hide from the roll's own privacy rule what it was read from
  function rowSafe(sys, tr, rowId, gmOnly) {
      var S = window.wpSystemCore, F = window.wpFormula;
      return function(k) {
          if (!S || !F || !tr || typeof S.rowRollNames !== 'function' || typeof S.gmOnlyNames !== 'function' || typeof S.gmDerivedNames !== 'function') return false;
          var rp = S.rowRollNames(sys, tr.ch, tr.f.id, rowId, ['Row.' + k], F); if (!rp || (rp.gm && !gmOnly)) return false;
          return !(S.gmOnlyNames(sys, rp.names).length || S.gmDerivedNames(sys, F, rp.names).length);
      };
  }
  // 1.6.2 (vehicles, fold (e)): MapCell, one cell of the blast's map in the system's own unit, worked out once a blast and kept on it
  function blastCell(map) { var S = window.wpSystemCore, camp = getActiveCampaign(); return S && typeof S.mapCellIn === 'function' ? S.mapCellIn(camp && camp.system, map) : 1; }
  function blastCellOf(b, map) { if (b && typeof b.cell === 'number' && isFinite(b.cell)) return b.cell; var v = blastCell(map); if (b) b.cell = v; return v; }
  function blastFig(text, vars, dice) {   // a formula of the card's, worked out with these names; null where it gives no number
      var F = window.wpFormula; if (!F || typeof text !== 'string' || !text) return null;
      var o = { vars: vars }; if (!dice) o.random = function() { return NaN; };
      var r = F.evaluate(text, o); if (!r || !r.ok) return null;
      var v = typeof r.value === 'boolean' ? (r.value ? 1 : 0) : r.value; return typeof v === 'number' && isFinite(v) ? v : null;
  }
  function useOneUp(camp, tr) {   // going off (or being placed) uses one up: one less on the thrower's row, the row gone at none, as any row change
      var S = window.wpSystemCore, F = window.wpFormula, sys = camp && camp.system; if (!S || !F || !sys || !tr) return false;
      var q = (tr.row.qty | 0) > 1 ? { op: 'setQty', rowId: S.rowIdOf(tr.row), qty: (tr.row.qty | 0) - 1 } : { op: 'remove', rowId: S.rowIdOf(tr.row) };
      var r = S.applyRowOp(sys, tr.ch, tr.f.id, q, F, {}); if (!r || !r.ok) return false;
      tr.ch.values = tr.ch.values || {}; tr.ch.values[tr.f.id] = r.value; tr.ch.updated = Date.now();
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) { var d = {}; d[tr.f.id] = r.value; window.wpNet.syncCharDelta(tr.ch.id, d); }
      if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(tr.ch.id);
      return true;
  }
  // The throw's own half, before it lands: its row, its aim, how far it may go, its roll and where a miss scatters to. { stop } where it is not
  // thrown at all (said in words); { mine } for a placed one; else { land, direct, said, tr, area, def }. The host's alone
  function throwPrep(opts, map) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, rules = blastRules(sys), amP = getActiveMap(), onScreen = !!(amP && amP.id === map.id);
      var tr = opts.goOff ? null : throwRowOf(camp, opts), def = tr ? tr.def : null, area = def && def.area && typeof def.area === 'object' ? def.area : null;
      var twF = tr && tr.f && tr.f.list && typeof tr.f.list.throwIf === 'string' ? tr.f.list.throwIf : '';   // 1.6.2 Thrown only where: judged on the host's own copy, a placed one as a thrown one
      if (twF && S && F) { var twR = null; try { twR = S.makeResolver(sys, tr.ch, F); twR = twR && typeof twR.row === 'function' ? twR.row(tr.f.id, opts.rowId) : null; } catch (x) { twR = null; } if (typeof twR !== 'function' || !S.rollNeedsOk({ needs: twF }, twR, F)) return { stop: tr.f.list.throwSays || (opts.name || 'That') + ' cannot be thrown or placed now.' }; }
      if (area && area.place === true) return { mine: placeMine(opts, tr, map) };   // a mine is placed, never thrown
      var thrB = throwerOf(map, opts.charId), thrC = thrB ? tokenCentre(thrB) : null;
      var aimT = opts.goOff ? null : tokenAtPoint(map, opts.x, opts.y, true), aim = aimT ? tokenCentre(aimT) : { x: opts.x, y: opts.y };   // the aim: the character token clicked, else the point
      var out = { land: { x: aim.x, y: aim.y }, direct: opts.goOff ? (opts.direct || null) : aimT ? aimT.id : null, said: opts.goOff && typeof opts.said === 'string' ? opts.said.slice(0, 400) : '', tr: tr, area: area, def: def };   // 1.5.9 (es): a launched round's miss says where it went
      var fz = (!opts.goOff || opts.fuseOk === true) && rules && rules.fuse === 'turn' && window.wpNet && typeof window.wpNet.combatFor === 'function' ? window.wpNet.combatFor(map.id) : null; if (fz) out.fuse = true;   // a fuse: a fight on its map
      if (opts.goOff || !rules || !thrC || !tr || !S || !F) return out;
      var R = S.makeResolver(sys, tr.ch, F), rowR = R && typeof R.row === 'function' ? R.row(tr.f.id, opts.rowId) : null, dYd = yardsOn(map, thrC, aim);
      var lenW = function(yd) { return typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd'; };
      var mx = rules.max && rowR ? blastFig(rules.max, rowR, false) : null, mn = rules.min && rowR ? blastFig(rules.min, rowR, false) : null;
      if (mx !== null && dYd > mx + 1e-9) return { stop: 'Too far to throw: the aim is ' + lenW(dYd) + ' away, and ' + (opts.name || 'it') + ' can be thrown ' + lenW(Math.max(0, mx)) + ' at most.' };
      if (mn !== null && dYd < mn - 1e-9) return { stop: 'Too near to throw: the aim is ' + lenW(dYd) + ' away, and ' + (opts.name || 'it') + ' must be thrown ' + lenW(Math.max(0, mn)) + ' at least.' };
      if (!rules.roll || typeof def.throwSkill !== 'string' || !def.throwSkill || !window.wpDice || !window.wpDice.rollFor || !BC) return out;
      var expr = throwExpr(rules.roll, def, rowR, dYd, sys, rowSafe(sys, tr, opts.rowId, !!opts.gmOnly));   // 1.6.0: and the thrown row's own names, and the yards to the aim
      var rc = S.rangeCtx ? S.rangeCtx(sys, map, thrB, { x: aim.x - 30, y: aim.y - 26, w: 60, h: 52 }, { F: F }) : null;
      var tdr = window.wpDice.rollFor(opts.charId, expr, (opts.name || 'Blast') + ' throw', { gmOnly: !!opts.gmOnly, range: rc ? { mod: rc.mod, dist: rc.dist } : undefined });
      if (!tdr || !tdr.ok) return { stop: 'The throw could not be rolled' + (tdr && tdr.error ? ': ' + tdr.error : '.') };
      var oc = BC.throwOutcome(window.wpNet ? window.wpNet.rollCheck : null);   // the throw's pass, critical and margin, as net.diceRoll read them
      if (oc.kind === 'fumble') {   // it drops at the thrower's feet; where the card's hand rule holds of its dice, it goes off in the hand, a direct hit on the thrower
          var inHand = rules.hand && oc.natural !== null ? blastFig(rules.hand, function(n) { return String(n).toLowerCase() === 'natural' ? oc.natural : undefined; }, false) : null;
          out.land = { x: thrC.x, y: thrC.y }; out.direct = inHand ? thrB.id : null; out.said = inHand ? ' A critical failure: it goes off in the thrower\u2019s hand.' : ' A critical failure: it drops at the thrower\u2019s feet.';
      }
      else if (oc.kind === 'miss') {
          var syd = rules.scatter ? blastFig(rules.scatter, function(n) { var l = String(n).toLowerCase(); return l === 'margin' ? oc.margin : l === 'throwdistance' ? dYd : undefined; }, true) : BC.bookScatterYd(oc.margin, dYd);
          syd = typeof syd === 'number' && isFinite(syd) ? Math.max(0, Math.min(1000, syd)) : BC.bookScatterYd(oc.margin, dYd);
          var nWays = rules.ways === 8 ? 8 : 6, sp = BC.scatterPoint(aim, thrC, syd, Math.floor(Math.random() * nWays), onScreen ? mapMeasureConfig().cellPx / cellYards() : 50, nWays);   // the way rolled as a die of the ways' count
          if (sp) { out.land = { x: Math.max(0, sp.x), y: Math.max(0, sp.y) }; out.direct = null; out.said = ' A miss by ' + oc.margin + ': it lands ' + lenW(syd) + ' ' + sp.words.toLowerCase() + ' of the aim.'; }
      }
      return out;
  }
  function torsoOf(sys, ch, want) {   // the damage step's default location: the first row of the location list named Torso, else one that holds the word, else the first. 1.6.2 (11): want, the location a blast names, first: a row of that name or entry key, else one that holds the word. 1.6.3: then the system's Unaimed blows land at (locs.at), by the same rule
      var S = window.wpSystemCore, d = sys && sys.combat && sys.combat.damage, lf = d && d.locs && S ? S.fieldById(sys, d.locs.list) : null; if (!lf) return '';
      var rows = (ch.values && Array.isArray(ch.values[lf.id]) ? ch.values[lf.id] : []).filter(function(r) { return r && r.hid !== 1; }).map(function(r) { var rd = S.rowDef(sys, r); return { id: S.rowIdOf(r), name: rd && rd.def && typeof rd.def.name === 'string' ? rd.def.name : '' }; }).filter(function(x) { return x.id; });
      var keyOf = function(x) { var rw = (ch.values[lf.id] || []).filter(function(r) { return r && S.rowIdOf(r) === x.id; })[0], rd = rw ? S.rowDef(sys, rw) : null; return rd && rd.def && typeof rd.def.key === 'string' ? rd.def.key.toLowerCase() : ''; };
      var named = function(w) { var wl = typeof w === 'string' ? w.trim().toLowerCase() : ''; return wl ? rows.filter(function(x) { return x.name.toLowerCase() === wl || keyOf(x) === wl; })[0] || rows.filter(function(x) { return x.name.toLowerCase().indexOf(wl) >= 0; })[0] : null; };
      var wHit = named(want); if (wHit) return wHit.id;
      var aHit = named(d.locs.at); if (aHit) return aHit.id;   // 1.6.3 (finding 27): the Taking damage rules' Unaimed blows land at, read by the same rule, as sheets.js dmgLocAt reads it for the Take damage window
      var hit = rows.filter(function(x) { return /^torso$/i.test(x.name); })[0] || rows.filter(function(x) { return /torso/i.test(x.name); })[0] || rows[0];
      return hit ? hit.id : '';
  }
  // 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2): a blast's fragmentation, after its shares and in the same pass. It reaches
  // the Combat tab's frag.reach in yards (read with FragDice, the dice it rolls, and 1.6.0 BlastDice, the dice the blast's own damage rolls), else the blast's own radius, and never less; who rolls what is
  // blastcore fragTargets: one roll every token shares, or one each under frag.each, and the token struck directly a roll of its own under
  // frag.direct. Only total cover stops it under frag.cover 'total', where a token partly behind cover takes it all; else the system's cover
  // outcomes, as the blast. Each hit is rolled with the thrower's character (a damage card already applied, kept as private as the item) and
  // goes through the damage step where the system has one, at the default location, by the item's fragmentation type, else the card's, else
  // the blast's, with no falloff and the item's armor divisor only under frag.ad; else off the damage resource. write: the pass's own writer,
  // which keeps what each character held first for the Undo. { hit, shielded } or null where the blast carries none
  function fragPass(b, map, camp, sys, hpId, write, mark) {   // mark (1.5.9, afflictions): told who each hit wounded and whom it reached
      var S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, fg = b && b.frag && typeof b.frag === 'object' ? b.frag : null;
      if (!fg || typeof fg.expr !== 'string' || !fg.expr || !S || !F || !BC || typeof BC.fragTargets !== 'function' || !window.wpDice || typeof window.wpDice.rollFor !== 'function') return null;
      var rules = blastRules(sys), fr = rules && rules.frag && typeof rules.frag === 'object' ? rules.frag : {}, dice = BC.diceCount(fg.expr), rad = blastRadiusYd(b);
      var bDice = BC.diceCount(b.dmgExpr || ''), rch = fr.reach ? blastFig(fr.reach, function(n) { var l = String(n).toLowerCase(); return l === 'fragdice' ? dice : l === 'blastdice' ? bDice : l === 'mapcell' ? blastCellOf(b, map) : l === 'blastscale' ? (typeof b.iscale === 'number' && b.iscale > 0 ? b.iscale : 1) : undefined; }, false) : null;   // 1.6.2 (8): and BlastScale
      var reach = typeof rch === 'number' && isFinite(rch) ? Math.max(rad, Math.min(10000, rch)) : rad;
      var flyF = rules && rules.flying === true && typeof window.wpFlyHit === 'function';   // 1.6.2 (vehicles, fold (d)): it reaches a thing in flight as any token
      var dr = blastDistances(b, map).filter(function(r) { return r && r.tok && (typeof r.tok.charId === 'string' || (flyF && r.tok.fly && !r.tok.charId)) && !(typeof b.spare === 'string' && r.tok.id === b.spare); }), byId = Object.create(null);
      dr.forEach(function(r) { if (!byId[r.tok.id]) byId[r.tok.id] = r; });
      var dfF = b.defended || null; if (dfF) dr = dr.filter(function(r) { return !(dfF[r.tok.id] && dfF[r.tok.id].nf === true); });   // 1.6.0: a Defense that succeeded
      var who = BC.fragTargets(dr.map(function(r) { return { id: r.tok.id, d: r.d + (dfF && dfF[r.tok.id] && dfF[r.tok.id].d > 0 ? dfF[r.tok.id].d : 0) }; }), reach, { direct: typeof b.direct === 'string' ? b.direct : null, own: fr.direct === true, each: fr.each === true });
      var dstep = !!(sys.combat && sys.combat.damage && typeof S.damageStep === 'function'), types = dstep && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [];
      // 1.6.3 (lane B batch "damage"): the first of the item's type, the Combat tab's Fragmentation type and the blast's own that the damage rules still
      // hold. A type removed from Taking damage is passed over, so fragmentation falls back to the blast's own type, as the editor says under the list,
      // where before the first type named won and then counted as none
      var ty = [fg.type, fr.type, b.dtype].filter(function(t) { return typeof t === 'string' && t && types.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === t.toLowerCase(); }); })[0] || '', tyOk = !!ty;
      var label = (b.name || 'Blast') + ' fragmentation', shared, rollOne = function() { var r = window.wpDice.rollFor(fg.by, fg.expr, label, { gmOnly: fg.gm === true, dmg: true, used: true }); return r && r.ok && typeof r.value === 'number' && isFinite(r.value) ? r.value : null; };
      var elevOn = stanceOn('elevation'), hit = 0, shielded = 0;
      who.forEach(function(w) {
          if (flyF && byId[w.id] && byId[w.id].tok.fly && !byId[w.id].tok.charId) {   // a thing in flight: cover as any token, then its wound by D7
              var rf = byId[w.id], tierY = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, rf.tok, map, elevOn ? (b.elev || 0) : 0, 0) : null;
              if (fr.cover === 'total' ? !!(tierY && tierY.block) : S.coverOutcome && S.coverOutcome(sys, tierY) === 'none') { shielded++; return; }
              var amtY = w.own ? rollOne() : (shared === undefined ? (shared = rollOne()) : shared); if (amtY === null) return; if (fr.cover !== 'total' && S.coverDamage) amtY = S.coverDamage(sys, tierY, amtY); amtY = Math.floor(amtY); if (!(amtY > 0)) return;
              var qY = { amt: amtY }; if (tyOk) qY.type = ty; if (fr.ad === true && typeof b.ad === 'number' && b.ad > 0) qY.ad = b.ad;
              if (window.wpFlyHit(rf.tok, qY)) hit++; return;
          }
          var r = byId[w.id], ch = r && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, r.tok.charId) ? camp.chars[r.tok.charId] : null; if (!ch) return;   // own ids only
          var tierF = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;
          if (fr.cover === 'total' ? !!(tierF && tierF.block) : S.coverOutcome && S.coverOutcome(sys, tierF) === 'none') { shielded++; return; }   // stopped before anything is rolled for it
          var amt = w.own ? rollOne() : (shared === undefined ? (shared = rollOne()) : shared); if (amt === null) return;
          if (fr.cover !== 'total' && S.coverDamage) amt = S.coverDamage(sys, tierF, amt);
          amt = Math.floor(amt); if (!(amt > 0)) return;
          var vals = null, lines = null;
          if (dstep) {
              var q = { amt: amt }, loc = typeof torsoOf === 'function' ? torsoOf(sys, ch, b.loc) : ''; if (loc) q.loc = loc; if (tyOk) q.type = ty; var bkF = typeof blastKind === 'function' ? blastKind(sys, rules) : ''; if (bkF) q.kind = bkF; if (fr.ad === true && typeof b.ad === 'number' && b.ad > 0) q.ad = b.ad; if (dice > 0) q.dice = Math.min(100, dice);   // 1.6.0: the dice it rolled, for a figure a die
              var st = S.damageStep(sys, ch, q, F, blastCtxOf(ch, map.id, r.tok.id), { now: Date.now(), inCombat: !!(window.wpNet && typeof window.wpNet.charInCombat === 'function' && window.wpNet.charInCombat(ch.id)) }); if (!st || !st.ok) return; vals = st.values; lines = st.lines; if (st.info && (st.info.majorRoll || st.info.follows) && window.wpSheets && typeof window.wpSheets.majorFollow === 'function') window.wpSheets.majorFollow(ch, st.info, st.values);   // 1.6.0 (B3): a Major Wound's roll is posted
          } else if (hpId) {
              var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return;
              var res = S.applyEdit(sys, ch, hpId, { cur: (typeof e.value === 'number' ? e.value : 0) - amt }, F, {}); if (!res.ok) return;
              vals = {}; vals[hpId] = res.value;
          } else return;
          write(ch, r.tok.charId, vals); hit++; if (typeof mark === 'function') mark(r.tok.charId, dstep ? !!(st && st.info && st.info.wound > 0) : true, true);
          if (lines && window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [(fg.gm === true ? 'Fragmentation' : label) + ':'].concat(lines));   // what it did, to the GM and the character's player
      });
      return { hit: hit, shielded: shielded };
  }
  // The pass's one writer: one entry a character for the Undo, holding what it had before the blast first wrote each field, an effects list among
  // them (1.5.9: a blast's fragmentation and its afflictions write too), each change sent to the table and told to the sheet
  // 1.6.3 (the combat review, finding 10): the context of the very token a blast hits (its posture, facing, round and range), as the Take damage window
  // hands a card's damage through tokenCtxFor, so the system's DR, wound and Major Wound formulas read the same on every path. null where it cannot be had
  function blastCtxOf(ch, mapId, tokId) { var Sh = window.wpSheets; try { return ch && Sh && typeof Sh.tokenCtxAt === 'function' ? Sh.tokenCtxAt(ch.id, mapId, tokId) : null; } catch (e) { return null; } }
  function blastWriter(byChar, hits) {
      return function(ch, charId, vals) {
          var h = byChar[charId]; if (!h) { h = byChar[charId] = { charId: charId, prevs: {} }; hits.push(h); }
          Object.keys(vals).forEach(function(fid) { if (!Object.prototype.hasOwnProperty.call(h.prevs, fid)) h.prevs[fid] = ch.values && Object.prototype.hasOwnProperty.call(ch.values, fid) ? JSON.parse(JSON.stringify(ch.values[fid])) : undefined; });
          ch.values = ch.values || {}; Object.keys(vals).forEach(function(fid) { ch.values[fid] = vals[fid]; }); ch.updated = Date.now();
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta && Object.keys(vals).length) window.wpNet.syncCharDelta(charId, vals);
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(charId);
      };
  }
  // 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 2, its affliction half): a blast's afflictions, after its shares and its fragmentation
  // and in the same pass. Each reaches everyone in the blast's own radius (who all; a character the system's cover outcome shields passed over),
  // else those the blast or its fragmentation wounded, after DR, or under the Combat tab's hurt 'share' those any share of it reached (H7). A
  // character its Only where does not hold for is not touched. Each other rolls the Combat tab's resist roll as itself, Resist standing for the
  // item's resist target read with its own names (an NPC's card the GM's, a GM-only item's kept the GM's); a failure puts the effect on in the list
  // that holds it, else the system's first effects list (applyEffectOp's add: on again and its timer afresh where it is there), for its Lasts
  // where that is set (rolled as the victim) and else the effect's own time. With no resist roll on the card nothing is rolled, and the GM is told
  // who must resist and against what. Each victim's card goes to the GM and its player, naming neither a GM-only item nor a GM-only effect.
  // hurt: { w, s }, the character ids it wounded and reached, in order. { on, resisted, held } or null where the blast carries none
  function affPass(b, map, camp, sys, write, hurt) {
      var S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, A = b && Array.isArray(b.aff) ? b.aff : null;
      if (!A || !A.length || !S || !F || !BC || typeof BC.affTargets !== 'function' || typeof S.applyEffectOp !== 'function' || !window.wpDice || typeof window.wpDice.rollFor !== 'function') return null;
      var rules = blastRules(sys), rs = rules && typeof rules.resist === 'string' ? rules.resist : '', byShare = !!(rules && rules.hurt === 'share'), hu = hurt && typeof hurt === 'object' ? hurt : { w: [], s: [] };
      var defs = Object.create(null); (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string') defs[d.id] = d; });
      var fxLists = (Array.isArray(sys.fields) ? sys.fields : []).filter(function(f) { return f && f.kind === 'effects'; });
      var elevOn = stanceOn('elevation'), inB = null, nm = b.gm === true ? '' : (b.name || ''), out = { on: 0, resisted: 0, held: 0 }, owed = [], gone = 0, odd = 0;
      var inBlast = function() {   // every character in the blast, with whether the system's cover outcome shields it (worked out once)
          if (inB) return inB; inB = [];
          blastDistances(b, map).forEach(function(r) {
              if (!r || !r.tok || typeof r.tok.charId !== 'string' || !shapeHolds(b, r)) return;
              var tier = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, elevOn ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;
              inB.push({ id: r.tok.charId, shielded: !!(S.coverOutcome && S.coverOutcome(sys, tier) === 'none') });
          });
          return inB;
      };
      A.forEach(function(a) {
          if (!a || typeof a.vs !== 'string' || typeof a.fx !== 'string') return;
          var def = Object.prototype.hasOwnProperty.call(defs, a.fx) ? defs[a.fx] : null; if (!def) { gone++; return; }   // an effect the system no longer has
          BC.affTargets(a.who === 'all' ? inBlast() : null, byShare ? hu.s : hu.w, a.who === 'all').forEach(function(cid) {
              var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, cid) ? camp.chars[cid] : null; if (!ch) return;   // own ids only
              var vars = S.makeResolver(sys, ch, F);
              if (typeof a.needs === 'string' && a.needs && !S.rollNeedsOk({ needs: a.needs }, vars, F)) { out.held++; return; }
              if (!rs) { owed.push(String(ch.name || 'A character').slice(0, 60)); return; }
              var rr = window.wpDice.rollFor(cid, rs.replace(/\bResist\b/gi, function() { return '(' + a.vs + ')'; }), nm ? nm + ' resist' : 'Resist', { gmOnly: b.gm === true, priv: ch.npc === true || !ch.ownerId });
              var ck = rr && rr.ok && window.wpNet ? window.wpNet.rollCheck : null; if (!ck || typeof ck.pass !== 'boolean') { odd++; return; }   // a resist roll that is no check puts nothing on
              var bare = (rr.priv === true || b.gm === true) && ch.npc !== true && !!ch.ownerId;   // the review of fold 4: a resist roll kept the GM's (a GM-only item, a GM-only value it read) keeps its figures off its player's card
              var vsW = !bare && typeof ck.total === 'number' && isFinite(ck.total) && typeof ck.target === 'number' && isFinite(ck.target) ? ', ' + ck.total + ' against ' + ck.target : '', head = (nm || 'Affliction') + ':';
              if (ck.pass) { out.resisted++; if (window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [head, 'Resisted' + vsW + '.']); return; }
              var secs = 0, lw = '';
              if (a.lasts && typeof a.lasts.n === 'string' && typeof S.affLastsSecs === 'function') { var lr = F.evaluate(a.lasts.n, { vars: vars }), ln = lr && lr.ok && typeof lr.value === 'number' && isFinite(lr.value) ? lr.value : 0; if (ln > 0) { secs = S.affLastsSecs(sys, ln, a.lasts.u); if (secs > 0) lw = lastsWords(sys, ln, a.lasts.u); } }   // rolled as the victim
              var fl = fxLists.filter(function(f) { var l = ch.values ? ch.values[f.id] : null; return Array.isArray(l) && l.some(function(x) { return x && x.ref === a.fx; }); })[0] || fxLists[0]; if (!fl) { odd++; return; }
              var onB = !!ch.values && Array.isArray(ch.values[fl.id]) && ch.values[fl.id].some(function(x) { return !!x && x.ref === a.fx && x.on !== false; }), res = S.applyEffectOp(sys, ch, fl.id, { op: 'add', rowId: 'x_' + Math.random().toString(36).slice(2, 14), ref: a.fx }, F, { now: Date.now(), inCombat: !!(window.wpNet && typeof window.wpNet.charInCombat === 'function' && window.wpNet.charInCombat(cid)), secs: secs > 0 ? secs : undefined });
              if (!res || !res.ok) { odd++; return; }
              var vals = {}; vals[fl.id] = res.value; if (res.clamp) Object.keys(res.clamp).forEach(function(k) { vals[k] = res.clamp[k]; });
              write(ch, cid, vals); out.on++;
              if (window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, [head, 'Failed to resist' + vsW + '.', (def.vis === 'gm' ? 'An effect' : String(def.name || 'An effect').slice(0, 60)) + ' is on' + (lw ? ' for ' + lw : onB && !res.again ? ' already' : '') + '.']);   // to the GM and the character's player
          });
      });
      var who = nm || 'The blast';
      if (owed.length) toast(who + ': ' + owed.slice(0, 6).join(', ') + (owed.length > 6 ? ' and ' + (owed.length - 6) + ' more' : '') + ' must resist. The Combat tab has no resist roll, so nothing was rolled.');
      if (gone) toast(who + ': the effect an affliction puts on is gone from the system, so it was not rolled.');
      if (odd) toast(who + ': ' + odd + ' resist roll' + (odd === 1 ? '' : 's') + ' could not be judged, so nothing was put on. The resist roll must be a check, such as 3d6 <= Resist.');
      return out;
  }
  function lastsWords(sys, n, u) {   // an affliction's Lasts as words: 4 minutes, 1 turn, 2 watches
      var W = { turns: ['turn', 'turns'], seconds: ['second', 'seconds'], minutes: ['minute', 'minutes'], hours: ['hour', 'hours'], days: ['day', 'days'] }, num = String(Math.round(n * 100) / 100);
      if (Object.prototype.hasOwnProperty.call(W, u)) return num + ' ' + W[u][n === 1 ? 0 : 1];
      var t = sys && sys.combat && sys.combat.turn && Array.isArray(sys.combat.turn.units) ? sys.combat.turn.units : [], hit = t.filter(function(x) { return x && typeof x.key === 'string' && x.key.toLowerCase() === String(u).toLowerCase(); })[0];
      return num + ' ' + String(hit && hit.label ? hit.label : u).slice(0, 60);
  }
  function affNote(ap) { return ap ? (ap.on ? ' · ' + ap.on + ' failed to resist' : '') + (ap.resisted ? ' · ' + ap.resisted + ' resisted' : '') : ''; }   // counts only, as the rest of the notice
  // An item with no damage roll: its afflictions alone, rolled as it goes off (one that reaches everyone in the blast; one that reaches those it
  // hurt reaches no one). Measure only and dice off roll nothing and say so
  function applyBlastAffs(b, mapIn, nm) {
      var camp = getActiveCampaign(), sys = camp && camp.system, map = mapIn || getActiveMap(); if (!sys || !map || !b) return null;
      var auto = (sys.combat && sys.combat.blastAuto) || 'full';
      if (auto === 'measure') { toast('Blast automation is Measure only, so the afflictions of ' + nm + ' were not rolled.'); return null; }
      if (window.wpVtt && !window.wpVtt.on('dice')) { toast('Dice are off, so the afflictions of ' + nm + ' were not rolled.'); return null; }
      var byChar = Object.create(null), hits = [], ap = affPass(b, map, camp, sys, blastWriter(byChar, hits), { w: [], s: [] });
      if (ap && ap.on) { _lastThrowTx = { hits: hits }; save(); syncBlastMenu(); toast(nm + ': ' + ap.on + ' failed to resist' + (ap.resisted ? ', ' + ap.resisted + ' resisted' : '') + '. Undo last throw is in the Radius options.'); }
      else if (ap && ap.resisted) toast(nm + ': ' + ap.resisted + ' resisted.');
      return ap;
  }
  // [vehiclecheck:flyblast-start]
  // 1.6.2 (vehicles, fold (d); the core's answer (A), the Combat tab's Things in flight): a blast hurts what flies inside it as it hurts any token. Its
  // share at its distance (its own dice where the card says each rolls its own, rolled at once since nobody owns it; HitScale 1), cover between them
  // as for a token, then its wound by D7 through wpFlyHit, as a damage card's hit. A thing shot down stays down: Undo last throw puts back characters alone
  function flyBlastPass(b, map, sys, rules, total, fall, dice, eEx, eDice, fillTotal) {
      var S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, n = 0, elevOn = stanceOn('elevation'); if (!S || !F || !BC) return 0;
      blastDistances(b, map).forEach(function(r) {
          if (!r.tok.fly || r.tok.charId || !shapeHolds(b, r)) return;
          var dirE = !!b.direct && r.tok.id === b.direct, cenE = typeof sameCellOn === 'function' && sameCellOn(map, b, tokenCentre(r.tok)), share = total;
          var tier = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, elevOn ? (b.elev || 0) : 0, 0) : null;
          if (fillTotal ? !!(tier && tier.block) : S.coverOutcome && S.coverOutcome(sys, tier) === 'none') return;   // stopped before anything is rolled for it
          if (eEx) {
              var nE = blastFig(rules.each, function(nm) { var l = String(nm).toLowerCase(); if (l.indexOf('env.') === 0) return BC.envRead ? BC.envRead(b.env, l.slice(4)) : 0; if (l === 'mapcell') return blastCellOf(b, map); if (l === 'hitscale') return 1; return l === 'blastdice' ? eDice : l === 'blastdistance' ? Math.max(0, r.d) : l === 'direct' ? (dirE ? 1 : 0) : l === 'centre' ? (cenE ? 1 : 0) : l === 'blastfills' ? (b.fills > 0 ? b.fills : 0) : l === 'blastnodrop' ? (b.noDrop === true ? 1 : 0) : l === 'blastscale' ? (b.iscale > 0 ? b.iscale : 1) : undefined; }, false);
              var exE = typeof nE === 'number' && nE >= 1 ? BC.diceAt(eEx, Math.min(100, Math.floor(nE)), rules.eachAdd === true) : ''; if (!exE) return;
              var rE = window.wpDice && typeof window.wpDice.rollFor === 'function' ? window.wpDice.rollFor(b.rollBy || '', exE, (b.gm === true ? 'Blast' : (b.name || 'Blast')) + ' damage, ' + (r.tok.charName || r.tok.name || 'a thing in flight'), { gmOnly: b.gm === true, dmg: true, used: true }) : null;
              if (!rE || !rE.ok || typeof rE.value !== 'number' || !isFinite(rE.value)) return; share = Math.max(0, Math.floor(rE.value));
          }
          if (fall) { share = BC.fallShare(F, fall, { dmg: share, dist: r.d, dice: dice, direct: dirE, centre: cenE, fills: b.fills, noDrop: b.noDrop, iscale: b.iscale, env: b.env, cell: blastCellOf(b, map), scale: 1 }); if (share === null) return; }
          var amt = Math.floor(fillTotal ? share : S.coverDamage ? S.coverDamage(sys, tier, share) : share); if (!(amt > 0)) return;
          var q = { amt: amt }; if (b.dtype) q.type = b.dtype; if (typeof b.ad === 'number' && b.ad > 0) q.ad = b.ad;
          if (window.wpFlyHit(r.tok, q)) n++;
      });
      if (n && window.wpStepLog) window.wpStepLog('fly v1', 'blast', { n: n });
      return n;
  }
  // [vehiclecheck:flyblast-end]
  function applyBlastDamage(b, total, hpId, mapIn) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, map = mapIn || getActiveMap();
      if (!sys || !S || !F || !map) return;
      var rules = typeof blastRules === 'function' ? blastRules(sys) : null, BC = window.wpBlastCore, fall = rules && rules.fall && BC ? rules.fall : '', step = !!(fall && sys.combat && sys.combat.damage && typeof S.damageStep === 'function');
      if (typeof defendAsk === 'function' && defendAsk(b, total, hpId, map)) return;   // 1.6.0: a blast's own Defense roll: its share waits for the cards
      var flyOn = !!(rules && rules.flying === true && typeof window.wpFlyHit === 'function');   // 1.6.2 (vehicles, fold (d)): things in flight need no damage resource
      var noRes = !hpId && !step; if (noRes) { toast('Full auto is on, but no damage resource is set (System editor ▸ Combat ▸ Damage subtracts from).'); if (!(b && b.frag && sys.combat && sys.combat.damage) && !(b && Array.isArray(b.aff) && b.aff.length) && !flyOn) return; }   // 1.5.9 (es): an affliction that reaches everyone in the blast goes on all the same   // the review of fold 3: the GM is told whether or not a fragmentation goes on through the damage step
      var dfTx = b.defTx || null, byChar = dfTx ? dfTx.by : Object.create(null), hits = dfTx ? dfTx.hits : [], applied = 0, halved = 0, shielded = 0, spared = 0, dice = fall ? BC.diceCount(b.dmgExpr || '') : 0, types = step && Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [];
      var typeOk = !!(b.dtype && types.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === String(b.dtype).toLowerCase(); }));
      var eEx = rules && rules.each && BC && typeof BC.diceAt === 'function' ? (b.dmgExpr || b.eachExpr || '') : '', eDice = eEx ? BC.diceCount(eEx) : 0, eVic = !!(eEx && eDice && rules.eachBy === 'victim'), owed = 0, eachN = 0;   // 1.6.0 (the core's gap 8): each victim's own dice
      if (!eDice) eEx = '';
      var fillTotal = !!(rules && rules.fillCover === 'total' && b && b.fills > 0);   // 1.6.0: an item that fills its area is stopped by total cover alone
      var hurt = { w: [], s: [] }, mark = function(cid, w, sh) { if (w && hurt.w.indexOf(cid) < 0) hurt.w.push(cid); if (sh && hurt.s.indexOf(cid) < 0) hurt.s.push(cid); };   // 1.5.9 (es): whom the blast and its fragmentation wounded, and whom a share reached, in that order
      blastCellOf(b, map);   // 1.6.2 (vehicles, fold (e)): kept on the blast, so a victim’s owed roll reads the same cell
      var write = blastWriter(byChar, hits);   // one entry a character for the Undo (1.5.9: its fragmentation and its afflictions write too)
      blastDistances(b, map).forEach(function(r) {
          if (!shapeHolds(b, r) || !r.tok.charId) return;   // what a blast holds is asked in one place: its radius, a ring's inner distance, a cone's angle, and the token an explosion spares
          var dfT = b.defended ? b.defended[r.tok.id] : null; if (dfT && dfT.d > 0) { r = Object.assign({}, r, { d: r.d + dfT.d }); if (!fall && !shapeHolds(b, r)) { spared++; return; } }   // 1.6.0: a Defense that succeeded takes it as from further off, which may be past its reach
          var ch = camp.chars && typeof r.tok.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, r.tok.charId) ? camp.chars[r.tok.charId] : null; if (!ch || noRes) return;   // own ids only: a token from a file naming '__proto__' writes no damage onto a prototype
          var share = total;
          if (eEx) {   // 1.6.0 (the core's gap 8): this victim's own dice, by the card's formula; rolled now, or owed to its player's card
              var dirE = !!b.direct && r.tok.id === b.direct, cenE = typeof sameCellOn === 'function' && sameCellOn(map, b, tokenCentre(r.tok));
              var nE = blastFig(rules.each, function(nm) { var l = String(nm).toLowerCase(); if (l.indexOf('env.') === 0) return BC.envRead ? BC.envRead(b.env, l.slice(4)) : 0; if (l === 'mapcell') return blastCellOf(b, map); if (l === 'hitscale') return S.hitScaleOf ? S.hitScaleOf(sys, ch, F) : 1; return l === 'blastdice' ? eDice : l === 'blastdistance' ? Math.max(0, r.d) : l === 'direct' ? (dirE ? 1 : 0) : l === 'centre' ? (cenE ? 1 : 0) : l === 'blastfills' ? (b.fills > 0 ? b.fills : 0) : l === 'blastnodrop' ? (b.noDrop === true ? 1 : 0) : l === 'blastscale' ? (b.iscale > 0 ? b.iscale : 1) : undefined; }, false);
              var exE = typeof nE === 'number' && nE >= 1 ? BC.diceAt(eEx, Math.min(100, Math.floor(nE)), rules.eachAdd === true) : ''; if (!exE) { spared++; return; }   // and its adds with its dice, where the card says so
              if (eVic) {
                  var tierV = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, stanceOn('elevation') ? (b.elev || 0) : 0, stanceOn('elevation') ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null;
                  if (fillTotal ? !!(tierV && tierV.block) : S.coverOutcome && S.coverOutcome(sys, tierV) === 'none') { shielded++; return; }
                  if (blastOwe(b, r, ch, map, exE, Math.min(100, Math.floor(nE)), dirE, cenE, tierV)) owed++; return;
              }
              var rE = window.wpDice && typeof window.wpDice.rollFor === 'function' ? window.wpDice.rollFor(b.rollBy || '', exE, (b.gm === true ? 'Blast' : (b.name || 'Blast')) + ' damage, ' + (r.tok.charName || r.tok.name || ch.name || 'a character'), { gmOnly: b.gm === true, dmg: true, used: true }) : null;
              if (!rE || !rE.ok || typeof rE.value !== 'number' || !isFinite(rE.value)) return; share = Math.max(0, Math.floor(rE.value)); eachN++;
          }
          if (fall) { share = BC.fallShare(F, fall, { dmg: share, dist: r.d, dice: dice, direct: !!b.direct && r.tok.id === b.direct, centre: typeof sameCellOn === 'function' && sameCellOn(map, b, tokenCentre(r.tok)), fills: b.fills, noDrop: b.noDrop, iscale: b.iscale, env: b.env, cell: blastCellOf(b, map), scale: S.hitScaleOf ? S.hitScaleOf(sys, ch, F) : 1 }); if (share === null) return; }   // 1.5.8: the token's share by the card's falloff (1.6.0: of its own roll, where each rolls its own)
          var tierC = window.wpFog && window.wpFog.coverAt ? window.wpFog.coverAt(b.x, b.y, r.tok, map, stanceOn('elevation') ? (b.elev || 0) : 0, stanceOn('elevation') ? tokenElevation(r.tok, map, b.thrown === true) : 0) : null, ocC = fillTotal ? (tierC && tierC.block ? 'none' : 'full') : S.coverOutcome ? S.coverOutcome(sys, tierC) : 'full', dmgC = fillTotal ? (tierC && tierC.block ? 0 : share) : S.coverDamage ? S.coverDamage(sys, tierC, share) : share;   // cover follow-ups (owner 2026-09-28): the system's outcome for the cover this token has from the blast (the host's own board)
          if (ocC === 'none' && share > 0) { shielded++; return; }   // shielded: the system's outcome for this grade is none (a half that rounds to 0 took less)
          if (fall && !(dmgC > 0)) { spared++; return; }   // past the falloff's reach: nothing to apply
          var vals = null, lines = null;
          if (step) {   // through the damage step: DR at the default location, the blast's damage type, the pool
              var q = { amt: Math.floor(dmgC) }, loc = typeof torsoOf === 'function' ? torsoOf(sys, ch, b.loc) : ''; if (loc) q.loc = loc; if (typeOk) q.type = b.dtype; var bkS = typeof blastKind === 'function' ? blastKind(sys, rules) : ''; if (bkS) q.kind = bkS; if (typeof b.ad === 'number' && b.ad > 0) q.ad = b.ad;
              var st = S.damageStep(sys, ch, q, F, blastCtxOf(ch, map.id, r.tok.id), { now: Date.now(), inCombat: !!(window.wpNet && typeof window.wpNet.charInCombat === 'function' && window.wpNet.charInCombat(ch.id)) }); if (!st || !st.ok) return;
              vals = st.values; lines = st.lines; if (st.info && (st.info.majorRoll || st.info.follows) && window.wpSheets && typeof window.wpSheets.majorFollow === 'function') window.wpSheets.majorFollow(ch, st.info, st.values);   // 1.6.0 (B3): a Major Wound's roll is posted
          } else {
              var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return;
              var cur = typeof e.value === 'number' ? e.value : 0;
              var res = S.applyEdit(sys, ch, hpId, { cur: cur - dmgC }, F, {}); if (!res.ok) return;
              vals = {}; vals[hpId] = res.value;
          }
          if (ocC === 'half' && dmgC < share) halved++;
          write(ch, r.tok.charId, vals); mark(r.tok.charId, step ? !!(st && st.info && st.info.wound > 0) : dmgC > 0, dmgC > 0);   // 1.5.9 (es): who it wounded, after DR, and whom a share reached, for its afflictions
          if (lines && window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, (b.name && b.gm !== true ? [b.name + ':'] : []).concat(lines, b.notes ? ['Notes: ' + b.notes] : []));   // what it did, to the GM and the character's player
          applied++;
      });
      var flyN = flyOn && typeof flyBlastPass === 'function' ? flyBlastPass(b, map, sys, rules, total, fall, dice, eEx, eDice, fillTotal) : 0;   // 1.6.2 (vehicles, fold (d))
      var fp = typeof fragPass === 'function' ? fragPass(b, map, camp, sys, hpId, write, mark) : null, ap = typeof affPass === 'function' ? affPass(b, map, camp, sys, write, hurt) : null, fragNote = fp ? (fp.hit ? ' · fragmentation hit ' + fp.hit + ' token' + (fp.hit === 1 ? '' : 's') : '') + (fp.shielded ? ' · ' + fp.shielded + ' shielded from fragmentation' : '') : '';   // 1.5.9 (es)
      var coverNote = (halved ? ' · ' + halved + ' behind cover took less' : '') + (shielded ? ' · ' + shielded + ' shielded by cover' : '') + (spared ? ' · ' + spared + ' took nothing' : '') + fragNote + (ap ? affNote(ap) : '') + (owed ? ' · ' + owed + ' to roll their own dice' : '') + (flyN ? ' · ' + flyN + ' in flight hit' : '');   // counts only: never a name (a hidden token counts too)   // 1.6.0 (the core's gap 8): and those whose card waits
      if (applied || (fp && fp.hit) || (ap && ap.on)) { _lastThrowTx = { hits: hits }; save(); syncBlastMenu(); if (b.notes) toast((b.name || 'The blast') + ': ' + b.notes); toast((!applied ? 'No blast damage' : eachN ? 'Blast damage applied to ' + applied + ' token' + (applied === 1 ? '' : 's') + ', each by its own dice' : fall ? 'Blast damage applied to ' + applied + ' token' + (applied === 1 ? '' : 's') + ' by distance' : '−' + total + ' to ' + applied + ' token' + (applied === 1 ? '' : 's')) + coverNote + '. Undo last throw is in the Radius options.'); }
      else if (flyN) toast('The blast hit ' + flyN + ' in flight' + coverNote.replace(/ \u00b7 \d+ in flight hit$/, '') + '.');   // 1.6.2 (vehicles, fold (d)): what flies alone, which Undo last throw does not put back
      else if (owed) { if (b.notes) toast((b.name || 'The blast') + ': ' + b.notes); toast('Blast damage waits:' + coverNote.replace(/^ ·/, '') + '.'); }   // 1.6.0 (the core's gap 8)
      else if (shielded && !spared) toast('No damage: ' + shielded + ' token' + (shielded === 1 ? '' : 's') + ' shielded by cover.');
      else if (shielded || spared) toast('No damage:' + coverNote.replace(/^ ·/, '') + '.');
      if (ap && !ap.on && ap.resisted && !applied && !(fp && fp.hit) && !shielded && !spared) toast((b.name || 'The blast') + ': ' + ap.resisted + ' resisted.');   // 1.5.9 (es): an affliction resisted by all, and nothing else said
  }
  // 1.6.0 (the core's gap 8; the owner, by prompt: "the gm or the victim can roll, controlled by a setting"): under the Combat tab's eachBy
  // 'victim' each character in the blast rolls its own dice from a card: its player's, an NPC's or a GM-only item's the GM's. The host keeps
  // what each card rolls (memory alone, the newest OWED_MAX, gone with the table): the blast, the character and its token, its yards, the dice
  // at that distance and the cover it had as the blast went off. A press rolls it once (the host's dice, as the victim), its falloff reads that
  // roll, its cover is the one it had, and it goes through the damage step as the blast pass's own shares do, an Undo entry of its own
  var _owed = Object.create(null), _owedIds = [], OWED_MAX = 100;
  function blastOwe(b, r, ch, map, expr, n, dir, cen, tier) {
      var id = ''; while (!id || Object.prototype.hasOwnProperty.call(_owed, id)) { id = 'a_'; while (id.length < 10) id += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); }
      _owed[id] = { b: b, mapId: map.id, charId: ch.id, tokId: r.tok.id, d: r.d, expr: expr, n: n, dir: !!dir, cen: !!cen, tier: tier }; _owedIds.push(id); while (_owedIds.length > OWED_MAX) delete _owed[_owedIds.shift()];
      var yd = Math.round(r.d * 10) / 10, label = (b.gm === true ? 'A blast' : (b.name || 'A blast')) + ': ' + n + (n === 1 ? ' die' : ' dice') + ' at ' + yd + ' yd';
      if (window.wpNet && typeof window.wpNet.postBlastDue === 'function') window.wpNet.postBlastDue(ch, id, label, !ch.npc && !!ch.ownerId && b.gm !== true);
      return true;
  }
  function blastOwedRoll(att, pid) {   // pid: the profile id of the player who pressed it; null for the GM's own press
      var o = typeof att === 'string' && Object.prototype.hasOwnProperty.call(_owed, att) ? _owed[att] : null; if (!o) return { error: 'That blast roll was made already, or is not there now.' };
      if (typeof o.go === 'string') { if (pid !== null) return { error: 'That blast roll is not yours to make.' }; return defendGo(o.go) ? { ok: true, amt: 1 } : { error: 'That blast has gone off already.' }; }   // 1.6.0: the GM's Apply now on a blast waiting for its Defense rolls
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore; if (!sys || !S || !F || !BC) return { error: 'That blast roll cannot be made now.' };
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, o.charId) ? camp.chars[o.charId] : null; if (!ch) return { error: 'That character is not there now.' };
      if (pid !== null && (ch.npc || !ch.ownerId || ch.ownerId !== pid || o.b.gm === true)) return { error: 'That blast roll is not yours to make.' };
      if (!window.wpDice || typeof window.wpDice.rollFor !== 'function') return { error: 'Dice are not available.' };
      delete _owed[att]; _owedIds = _owedIds.filter(function(x) { return x !== att; }); blastKeepSoon();
      var rE = window.wpDice.rollFor(ch.id, o.expr, (o.b.gm === true ? 'Blast' : (o.b.name || 'Blast')) + ' damage', { gmOnly: o.b.gm === true, dmg: true, used: true });
      if (!rE || !rE.ok || typeof rE.value !== 'number' || !isFinite(rE.value)) return { error: 'That blast roll could not be made.' };
      var rules = blastRules(sys), fall = rules && rules.fall ? rules.fall : '', share = Math.max(0, Math.floor(rE.value)), hpId = sys.combat ? sys.combat.hpResource : '', step = !!(fall && sys.combat && sys.combat.damage && typeof S.damageStep === 'function');
      if (fall) { share = BC.fallShare(F, fall, { dmg: share, dist: o.d, dice: BC.diceCount(o.b.dmgExpr || ''), direct: o.dir, centre: o.cen, fills: o.b.fills, noDrop: o.b.noDrop, iscale: o.b.iscale, env: o.b.env, cell: typeof o.b.cell === 'number' ? o.b.cell : 1, scale: S.hitScaleOf ? S.hitScaleOf(sys, ch, F) : 1 }); if (share === null) return { error: 'Its falloff could not be worked out.' }; }
      var dmgC = rules && rules.fillCover === 'total' && o.b.fills > 0 ? (o.tier && o.tier.block ? 0 : share) : S.coverDamage ? S.coverDamage(sys, o.tier, share) : share; if (!(dmgC > 0)) return { ok: true, amt: 0 };
      var vals = null, lines = null, st = null;
      if (step) {   // as the blast pass's own shares: DR at the default location, the blast's damage type, its armor divisor
          var types = Array.isArray(sys.combat.damage.types) ? sys.combat.damage.types : [], q = { amt: Math.floor(dmgC) }, loc = typeof torsoOf === 'function' ? torsoOf(sys, ch, o.b.loc) : ''; if (loc) q.loc = loc;
          if (o.b.dtype && types.some(function(y) { return y && typeof y.key === 'string' && y.key.toLowerCase() === String(o.b.dtype).toLowerCase(); })) q.type = o.b.dtype; var bkO = typeof blastKind === 'function' ? blastKind(sys, rules) : ''; if (bkO) q.kind = bkO; if (typeof o.b.ad === 'number' && o.b.ad > 0) q.ad = o.b.ad;
          st = S.damageStep(sys, ch, q, F, blastCtxOf(ch, o.mapId, o.tokId), { now: Date.now(), inCombat: !!(window.wpNet && typeof window.wpNet.charInCombat === 'function' && window.wpNet.charInCombat(ch.id)) }); if (!st || !st.ok) return { error: 'Its damage could not be applied.' };
          vals = st.values; lines = st.lines; if (st.info && (st.info.majorRoll || st.info.follows) && window.wpSheets && typeof window.wpSheets.majorFollow === 'function') window.wpSheets.majorFollow(ch, st.info, st.values);
      } else if (hpId) {
          var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return { error: 'Its damage could not be applied.' };
          var res = S.applyEdit(sys, ch, hpId, { cur: (typeof e.value === 'number' ? e.value : 0) - dmgC }, F, {}); if (!res.ok) return { error: 'Its damage could not be applied.' };
          vals = {}; vals[hpId] = res.value;
      } else return { error: 'No damage resource is set.' };
      var byChar = Object.create(null), hits = []; blastWriter(byChar, hits)(ch, ch.id, vals);
      _lastThrowTx = { hits: hits }; save(); syncBlastMenu();
      if (lines && window.wpNet && typeof window.wpNet.damageCard === 'function') window.wpNet.damageCard(ch, (o.b.name && o.b.gm !== true ? [o.b.name + ':'] : []).concat(lines));
      return { ok: true, amt: dmgC };
  }
  // 1.6.0 A blast's own Defense roll (combat.blast.defend): before its shares a blast asks each character token in its reach for the roll, as a card (net.js
  // defendPost), and waits. A roll's answer takes 1 onto the count, pass or fail, and a success notes its distance and fragmentation and sets the posture. Once
  // every card is answered the pass runs with b.defended, by token id. The GM's card, Apply now, lets it go with no more answers. Who rolled no Defense takes
  // it whole. An item its list says no drop answers (b.noDrop) asks nothing. A launched burst's rounds share one key, so one roll holds for every blast of the
  // burst, those that land later too (_defKept, until the row's next attack). What waits is the host's memory alone, and the count's change is on the pass's
  // own Undo. _defWait: by key, { key, d, want: { token id: attempt id }, res, by, hits, waits: [{ b, total, hpId, map }], go }
  var _defWait = Object.create(null), _defKept = Object.create(null), DEF_MAX = 32;
  function defendKeptGo(key) { delete _defKept[key]; }
  function defendAsk(b, total, hpId, map) {
      var camp = getActiveCampaign(), sys = camp && camp.system, rules = blastRules(sys), d = rules && rules.defend && typeof rules.defend === 'object' ? rules.defend : null, n = window.wpNet;
      if (!d || b.defGo === true || b.noDrop === true || !b.bid || !n || typeof n.defendPost !== 'function') return false;
      var key = typeof b.defKey === 'string' ? b.defKey : b.bid, w = _defWait[key] || null, kept = _defKept[key] || null, rec = w || { key: key, d: d, want: Object.create(null), res: Object.create(null), by: Object.create(null), hits: [], waits: [], go: '' }, posted = 0, first = null;
      blastDistances(b, map).forEach(function(r) {
          if (!shapeHolds(b, r) || !r.tok.charId || rec.want[r.tok.id] || (kept && kept[r.tok.id])) return;
          var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, r.tok.charId) ? camp.chars[r.tok.charId] : null; if (!ch) return;
          var S = window.wpSystemCore, vt = window.wpVtt, rl = function(k) { return !vt || (vt.rulesOn ? vt.rulesOn(k) : vt.on(k)); }, tc = S && typeof S.tokenCtx === 'function' ? S.tokenCtx(map, r.tok, { turning: rl('turning'), posture: rl('posture'), elevation: rl('elevation') }) : null;
          var at = n.defendPost(camp, d.roll, ch, b.gm === true || !b.name ? 'a blast' : b.name, b.direct === r.tok.id && typeof b.atkM === 'number' ? b.atkM : 0, { key: key, tok: r.tok.id, map: map.id }, b.gm === true, tc);
          if (at) { rec.want[r.tok.id] = at; posted++; first = first || ch; }
      });
      if (!posted && !w) { if (kept) b.defended = kept; return false; }
      rec.waits.push({ b: b, total: total, hpId: hpId, map: map });
      if (!w) {
          var ks = Object.keys(_defWait); if (ks.length >= DEF_MAX) defendGo(ks[0]);
          _defWait[key] = rec;
          if (typeof n.postBlastDue === 'function' && first) { var idG = ''; while (!idG || Object.prototype.hasOwnProperty.call(_owed, idG)) { idG = 'a_'; while (idG.length < 10) idG += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(Math.random() * 36)); } _owed[idG] = { go: key }; _owedIds.push(idG); while (_owedIds.length > OWED_MAX) delete _owed[_owedIds.shift()]; rec.go = idG; n.postBlastDue(first, idG, (b.gm === true ? 'A blast' : (b.name || 'A blast')) + ' waits for its Defense rolls', false, true); }
      }
      if (posted) toast((b.gm === true ? 'The blast' : (b.name || 'The blast')) + ' waits for ' + posted + ' Defense roll' + (posted === 1 ? '' : 's') + '. Apply now on your card lets it go.');
      if (window.wpStepLog) window.wpStepLog('blastdefend v1', 'asked', { cards: posted, burst: typeof b.defKey === 'string' });
      return true;
  }
  window.wpBlastDefended = function(def, pass) {   // net.js on the host, as the roll a card asked for is made. def: the attempt's own record
      var w = def && typeof def.key === 'string' ? _defWait[def.key] : null; if (!w || typeof def.tok !== 'string' || !w.want[def.tok]) return false;
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, d = w.d, map = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, def.map) ? camp.items[def.map] : null, tok = map && Array.isArray(map.whiteboard) ? map.whiteboard.filter(function(t) { return t && t.id === def.tok; })[0] : null, ch = tok && camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, tok.charId) ? camp.chars[tok.charId] : null;
      delete w.want[def.tok]; w.res[def.tok] = pass === true ? { d: typeof d.yards === 'number' ? d.yards : 0, nf: d.noFrag === true } : {};
      if (ch && S && F && typeof d.count === 'string' && d.count) {
          var cf = S.fieldById(sys, d.count), all = cf ? S.resolveAll(sys, ch, F) : null, e = all ? all[d.count] : null, stored = ch.values ? ch.values[d.count] : undefined, cur = cf && cf.kind === 'number' && typeof stored === 'number' ? stored : e && typeof e.value === 'number' ? e.value : 0, res = cf ? S.applyEdit(sys, ch, d.count, cf.kind === 'resource' ? { cur: cur + 1 } : cur + 1, F, {}) : null;
          if (res && res.ok) { var vals = {}; vals[d.count] = res.value; blastWriter(w.by, w.hits)(ch, ch.id, vals); save(); }
      }
      if (pass === true && tok && typeof d.posture === 'string' && d.posture && typeof window.wpSetTokenStance === 'function') window.wpSetTokenStance(def.map, def.tok, { posture: d.posture });
      if (window.wpStepLog) window.wpStepLog('blastdefend v1', 'answered', { pass: pass === true, left: Object.keys(w.want).length });
      if (!Object.keys(w.want).length) defendGo(w.key); else blastKeepSoon();
      return true;
  };
  function defendGo(key) {
      var w = _defWait[key]; if (!w) return false; delete _defWait[key];
      var n = window.wpNet; Object.keys(w.want).forEach(function(t) { if (n && typeof n.attemptDrop === 'function') n.attemptDrop(w.want[t]); if (n && typeof n.dueOver === 'function') n.dueOver(w.want[t]); });
      if (w.go && Object.prototype.hasOwnProperty.call(_owed, w.go)) { delete _owed[w.go]; _owedIds = _owedIds.filter(function(x) { return x !== w.go; }); }
      var was = _defKept[key] || null, all = Object.create(null); if (was) Object.keys(was).forEach(function(t) { all[t] = was[t]; }); Object.keys(w.res).forEach(function(t) { all[t] = w.res[t]; });
      if (w.waits.some(function(e) { return typeof e.b.defKey === 'string'; })) { var ks = Object.keys(_defKept); if (ks.length >= DEF_MAX) delete _defKept[ks[0]]; _defKept[key] = all; }
      if (window.wpStepLog) window.wpStepLog('blastdefend v1', 'went', { blasts: w.waits.length, unanswered: Object.keys(w.want).length });
      w.waits.forEach(function(e, i) { e.b.defGo = true; e.b.defended = all; if (i === 0) e.b.defTx = { by: w.by, hits: w.hits }; applyBlastDamage(e.b, e.total, e.hpId, e.map); delete e.b.defTx; });
      blastKeepSoon();
      return true;
  }
  // [blastcheck:blastkeep-start]
  // 1.6.3 (the combat review, finding 1; Fulllion's pick of 2026-11-20: "keep them live"): what a blast still owes is saved with the fight, as its landings
  // are, so the GM's reload leaves every card working: each victim's own roll (_owed), a blast that waits for its Defense rolls (_defWait, with the Apply now
  // card that lets it go) and what a burst's Defense rolls already answered (_defKept). net.js fightsKeep asks wpBlastKeep, fightsBack hands wpBlastBack what
  // the save held. Each blast is kept as data (its place, its size, its damage and what its list said of it), never what it was drawn with; a wait names its
  // map by id; the Undo entries a pass holds keep each field as it was, one that was not there among them. Read back as data: a blast where its numbers are
  // numbers, a character and a map the campaign still holds, the Defense rule the system still has. Nothing is ever sent
  function blastKeepSoon() { var n = window.wpNet; if (n && typeof n.fightsKeepSoon === 'function') n.fightsKeepSoon(); }
  function blastData(b) { var o = {}; Object.keys(b || {}).forEach(function(k) { if (k !== 'defTx' && k !== 'wire' && k !== 'wireMap' && k !== 'wireChar' && k !== 'lost') o[k] = b[k]; }); var s = ''; try { s = JSON.stringify(o); } catch (e) { s = ''; } return s && s.length <= 100000 ? JSON.parse(s) : null; }
  function blastDataRead(b) { if (!b || typeof b !== 'object' || Array.isArray(b) || !['x', 'y', 'ft'].every(function(k) { return typeof b[k] === 'number' && isFinite(b[k]); })) return null; var s = ''; try { s = JSON.stringify(b); } catch (e) { s = ''; } if (!s || s.length > 100000) return null; var o = JSON.parse(s); o.ft = Math.max(1, Math.min(3000, o.ft)); return o; }
  function hitsOut(hits) { return (hits || []).map(function(h) { var v = {}, u = []; Object.keys(h.prevs || {}).forEach(function(f) { if (h.prevs[f] === undefined) u.push(f); else v[f] = h.prevs[f]; }); return { charId: h.charId, v: v, u: u }; }); }
  function hitsIn(list, camp) {   // the Undo entries, each a character the campaign holds with what each field held before the pass first wrote it
      var hits = [], by = Object.create(null); (Array.isArray(list) ? list : []).slice(0, 600).forEach(function(h) {
          if (!h || typeof h.charId !== 'string' || !camp.chars || !Object.prototype.hasOwnProperty.call(camp.chars, h.charId) || by[h.charId]) return; var prevs = {};
          if (h.v && typeof h.v === 'object') Object.keys(h.v).slice(0, 400).forEach(function(f) { if (f.length <= 80) prevs[f] = h.v[f]; });
          if (Array.isArray(h.u)) h.u.slice(0, 400).forEach(function(f) { if (typeof f === 'string' && f.length <= 80) prevs[f] = undefined; });
          var e = { charId: h.charId, prevs: prevs }; by[h.charId] = e; hits.push(e);
      });
      return { by: by, hits: hits };
  }
  function resIn(v) { var o = Object.create(null); if (v && typeof v === 'object') Object.keys(v).slice(0, 600).forEach(function(t) { var r = v[t]; if (t.length <= 80 && r && typeof r === 'object') o[t] = typeof r.d === 'number' && isFinite(r.d) ? { d: Math.max(0, Math.min(1e6, r.d)), nf: r.nf === true } : {}; }); return o; }
  window.wpBlastKeep = function() {   // what the save holds of the blasts that still owe something, or null where none does
      var owed = [], def = [], kept = {};
      _owedIds.forEach(function(id) {
          var o = Object.prototype.hasOwnProperty.call(_owed, id) ? _owed[id] : null; if (!o) return;
          if (typeof o.go === 'string') { owed.push({ id: id, go: o.go }); return; }
          var b = blastData(o.b); if (b) owed.push({ id: id, b: b, mapId: o.mapId, charId: o.charId, tokId: o.tokId, d: o.d, expr: o.expr, n: o.n, dir: o.dir, cen: o.cen, tier: o.tier || null });
      });
      Object.keys(_defWait).forEach(function(k) { var w = _defWait[k]; def.push({ key: w.key, want: w.want, res: w.res, hits: hitsOut(w.hits), go: w.go || '', waits: w.waits.map(function(e) { return { b: blastData(e.b), total: e.total, hpId: e.hpId, map: e.map && e.map.id }; }).filter(function(e) { return !!e.b; }) }); });
      Object.keys(_defKept).forEach(function(k) { kept[k] = _defKept[k]; });
      return owed.length || def.length || Object.keys(kept).length ? JSON.parse(JSON.stringify({ owed: owed, def: def, kept: kept })) : null;
  };
  window.wpBlastBack = function(raw, camp) {   // as the host's table opens: how many owed rolls and waits came back
      if (!raw || typeof raw !== 'object' || !camp || !camp.items || !camp.chars) return 0; var n = 0, sys = camp.system, d = (blastRules(sys) || {}).defend, key = function(v) { return typeof v === 'string' && v && v.length <= 40; }, cid = /^a_[a-z0-9]{8}$/;
      if (d && typeof d === 'object') (Array.isArray(raw.def) ? raw.def : []).slice(0, DEF_MAX).forEach(function(w) {
          if (!w || !key(w.key) || Object.prototype.hasOwnProperty.call(_defWait, w.key)) return;
          var want = Object.create(null); if (w.want && typeof w.want === 'object') Object.keys(w.want).slice(0, 600).forEach(function(t) { if (t.length <= 80 && typeof w.want[t] === 'string' && /^[ab]_[a-z0-9]{8}$/.test(w.want[t])) want[t] = w.want[t]; });
          var waits = (Array.isArray(w.waits) ? w.waits : []).slice(0, 32).map(function(e) { var b = e && blastDataRead(e.b), map = e && typeof e.map === 'string' && Object.prototype.hasOwnProperty.call(camp.items, e.map) ? camp.items[e.map] : null; return b && map && Array.isArray(map.whiteboard) ? { b: b, total: typeof e.total === 'number' && isFinite(e.total) ? e.total : 0, hpId: typeof e.hpId === 'string' ? e.hpId.slice(0, 80) : '', map: map } : null; }).filter(Boolean);
          if (!waits.length) return;
          var hh = hitsIn(w.hits, camp); _defWait[w.key] = { key: w.key, d: d, want: want, res: resIn(w.res), by: hh.by, hits: hh.hits, waits: waits, go: typeof w.go === 'string' && cid.test(w.go) ? w.go : '' }; n++;
      });
      if (raw.kept && typeof raw.kept === 'object') Object.keys(raw.kept).slice(0, DEF_MAX).forEach(function(k) { if (key(k) && !Object.prototype.hasOwnProperty.call(_defKept, k)) _defKept[k] = resIn(raw.kept[k]); });
      (Array.isArray(raw.owed) ? raw.owed : []).slice(-OWED_MAX).forEach(function(o) {
          if (!o || typeof o.id !== 'string' || !cid.test(o.id) || Object.prototype.hasOwnProperty.call(_owed, o.id)) return;
          if (typeof o.go === 'string') { if (!Object.prototype.hasOwnProperty.call(_defWait, o.go)) return; _owed[o.id] = { go: o.go }; _owedIds.push(o.id); n++; return; }
          var b = blastDataRead(o.b), map = typeof o.mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, o.mapId) ? camp.items[o.mapId] : null;
          if (!b || !map || typeof o.charId !== 'string' || !Object.prototype.hasOwnProperty.call(camp.chars, o.charId) || typeof o.tokId !== 'string' || o.tokId.length > 80 || typeof o.expr !== 'string' || !o.expr || typeof o.d !== 'number' || !isFinite(o.d)) return;
          var nD = typeof o.n === 'number' && isFinite(o.n) ? Math.max(1, Math.min(100, Math.floor(o.n))) : 1, tier = o.tier && typeof o.tier === 'object' && !Array.isArray(o.tier) ? JSON.parse(JSON.stringify(o.tier)) : null;
          _owed[o.id] = { b: b, mapId: o.mapId, charId: o.charId, tokId: o.tokId, d: o.d, expr: o.expr.slice(0, (window.wpSystemCore && window.wpSystemCore.LIMITS && window.wpSystemCore.LIMITS.formula) || 10000), n: nD, dir: o.dir === true, cen: o.cen === true, tier: tier }; _owedIds.push(o.id); n++;
      });
      while (_owedIds.length > OWED_MAX) delete _owed[_owedIds.shift()];
      if (n && window.wpStepLog) window.wpStepLog('blastowe v1', 'back', { n: n });
      return n;
  };
  window.wpBlastOwedHas = function(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(_owed, id); };   // net.js chatKeptSettle: a kept card whose roll the blast still owes stays live
  // [blastcheck:blastkeep-end]
  window.wpBlastOwedRoll = function(att, pid) { return blastOwedRoll(att, typeof pid === 'string' ? pid : null); };   // net.js: a player's press, by their profile id
  window.wpBlastOwedPress = function(att) {   // a blast card's Roll on this machine: a player's goes to the host, the GM's is rolled here
      var n = window.wpNet; if (n && n.active && n.role === 'client') return typeof n.blastRoll === 'function' ? n.blastRoll(att) : false;
      var rr = blastOwedRoll(att, null); if (rr && rr.error) { toast(rr.error); return false; } if (rr && rr.ok && !(rr.amt > 0)) toast('Nothing got through.'); return !!(rr && rr.ok);
  };
  // The card's Apply to all in the blast (Roll to chat): the blast its damage was rolled for, still on the map on screen
  window.wpBlastApply = function(bid, total) {
      var camp = getActiveCampaign(), sys = camp && camp.system, b = blasts.filter(function(x) { return x && x.bid === bid; })[0];
      if (!b && typeof blastsAwayFind === 'function' && blastsAwayFind(function(x) { return x && x.bid === bid; })) { toast('That blast is on another map. Open that map to apply it.'); return false; }   // 1.6.3: kept for its map, never lost to a look elsewhere
      if (!b) { toast('That blast is no longer on the map.'); return false; }
      if (typeof total !== 'number' || !isFinite(total)) return false;
      applyBlastDamage(b, total, sys && sys.combat ? sys.combat.hpResource : '');
      return true;
  };
  // Undo the last full-auto throw's damage: restore every field the blast wrote on every character it hurt, host-synced.
  window.wpUndoThrow = function() {
      if (!_lastThrowTx || !_lastThrowTx.hits.length) { toast('Nothing to undo.'); return; }
      var camp = getActiveCampaign(); if (!camp) return;
      _lastThrowTx.hits.forEach(function(h) {
          var ch = camp.chars && typeof h.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, h.charId) ? camp.chars[h.charId] : null; if (!ch) return;
          ch.values = ch.values || {}; var d = {};
          Object.keys(h.prevs || {}).forEach(function(fid) { var pv = h.prevs[fid]; if (pv === undefined) delete ch.values[fid]; else ch.values[fid] = pv; d[fid] = pv === undefined ? null : pv; });
          ch.updated = Date.now();
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) window.wpNet.syncCharDelta(h.charId, d);
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(h.charId);
      });
      var nn = _lastThrowTx.hits.length; _lastThrowTx = null; save(); syncBlastMenu();
      toast('Throw damage undone (' + nn + ' token' + (nn === 1 ? '' : 's') + ').');
  };
  window.wpHasThrowUndo = function() { return !!(_lastThrowTx && _lastThrowTx.hits.length); };
  // A mine: placed where clicked as a trigger zone of its trigger radius, hidden from players (a hidden piece is sent to no one), carrying its
  // blast. Where the card names a throw's roll and the item a throw skill (its placing skill), that roll is made first and a failure sets
  // nothing. It never goes off as it is placed
  function placeMine(opts, tr, map) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, BC = window.wpBlastCore, rules = blastRules(sys), def = tr && tr.def, area = def && def.area;
      if (!BC || !def || !area) return null;
      if (rules && rules.roll && typeof def.throwSkill === 'string' && def.throwSkill && window.wpDice && window.wpDice.rollFor) {
          var plR = S && F ? S.makeResolver(sys, tr.ch, F) : null, plRow = plR && typeof plR.row === 'function' ? plR.row(tr.f.id, S.rowIdOf(tr.row)) : null, plB = throwerOf(map, opts.charId), plD = plB ? yardsOn(map, tokenCentre(plB), { x: opts.x, y: opts.y }) : 0;   // 1.6.0: the row's own names and the yards to where it is placed
          var pr = window.wpDice.rollFor(opts.charId, throwExpr(rules.roll, def, plRow, plD, sys, rowSafe(sys, tr, S.rowIdOf(tr.row), !!opts.gmOnly)), (opts.name || 'Mine') + ' placed', { gmOnly: !!opts.gmOnly });
          if (!pr || !pr.ok) { toast('Placing it could not be rolled' + (pr && pr.error ? ': ' + pr.error : '.')); return null; }
          var pck = window.wpNet ? window.wpNet.rollCheck : null;
          if (pck && !pck.pass && pck.crit === 'fumble') {   // the book: a critical failure sets it off in the planter's cell
              var plT = throwerOf(map, opts.charId), plC = plT ? tokenCentre(plT) : { x: opts.x, y: opts.y };
              if (area.use === true) useOneUp(camp, tr);
              return placeThrownBlast(Object.assign({ goOff: true, mine: true, x: plC.x, y: plC.y, ft: area.ft, name: opts.name || def.name, by: opts.by || '', charId: opts.charId, damage: def.damage || '', gmOnly: !!opts.gmOnly, dtype: area.type, ad: area.ad, loc: area.loc, notes: opts.gmOnly ? '' : def.notes, icon: def.icon, frag: area.frag, fragType: area.fragType, aff: area.aff, cloud: area.cloud }, typeof blastStats === 'function' ? blastStats(sys, tr.f, def) : null), map);
          }
          var unarmed = !!(pck && !pck.pass);   // the book: a failure leaves it unarmed, and the planter knows
      }
      var mine = BC.cleanMine(Object.assign({ ft: area.ft, name: opts.name || def.name, damage: def.damage || '', type: area.type, ad: area.ad, loc: area.loc, trig: area.trig, charId: opts.charId, fieldId: opts.fieldId, rowId: opts.rowId, by: opts.by, gmOnly: !!opts.gmOnly, notes: opts.gmOnly ? '' : def.notes, unarmed: typeof unarmed === 'boolean' ? unarmed : false, frag: area.frag, fragType: area.fragType, aff: area.aff, cloud: area.cloud }, typeof blastStats === 'function' ? blastStats(sys, tr.f, def) : null));   // 1.5.9 (es): and its fragmentation and afflictions
      if (!mine) return null;
      var amM = getActiveMap(), pxYd = amM && amM.id === map.id ? mapMeasureConfig().cellPx / cellYards() : 50, r = Math.max(10, mine.trig * pxYd);
      var z = { id: 'wb' + uid() + Math.random().toString(36).slice(2, 5), type: 'trigger', shape: 'circle', x: Math.round(opts.x - r), y: Math.round(opts.y - r), w: Math.round(r * 2), h: Math.round(r * 2), color: 'transparent', eventMessage: '', hidden: true, name: (mine.name || 'Mine') + ' (mine)', mine: mine };
      if (typeof def.icon === 'string' && def.icon) z.mineIcon = def.icon.slice(0, 64);
      map.whiteboard = map.whiteboard || []; map.whiteboard.push(z);
      if (area.use === true) useOneUp(camp, tr);
      save(); render();
      toast(mine.unarmed ? (opts.by || 'The character') + ' places ' + (mine.name || 'a mine') + ' but fails to arm it: it lies there unarmed and goes off only from its right-click menu.' : (opts.by ? opts.by + ' places ' : 'Placed: ') + (mine.name || 'a mine') + '. It is hidden from your players and goes off when a character steps into it, or from its right-click menu.');
      return z;
  }
  // A mine goes off: its zone is taken off the map and its blast goes off at the zone's center, by the same path as a throw
  function mineOff(map, zone, direct) {
      if (!map || !zone || !zone.mine || !Array.isArray(map.whiteboard)) return null;
      var at = map.whiteboard.indexOf(zone); if (at < 0) return null;
      var m = zone.mine, cx = (Number(zone.x) || 0) + (Number(zone.w) || 0) / 2, cy = (Number(zone.y) || 0) + (Number(zone.h) || 0) / 2;
      map.whiteboard.splice(at, 1); save(); render();
      return placeThrownBlast({ goOff: true, mine: true, x: cx, y: cy, ft: m.ft, name: m.name || 'Mine', by: m.by || '', charId: m.charId, damage: m.damage || '', gmOnly: !!m.gmOnly, direct: direct || null, dtype: m.type, ad: m.ad, loc: m.loc, notes: m.notes, icon: zone.mineIcon, cloud: m.cloud, frag: m.frag, fragType: m.fragType, aff: m.aff, fills: m.fills, noDrop: m.noDrop, iscale: m.iscale }, map);
  }
  // A character token that stepped in (the host's own map: the GM's drag, a player's drop): every mine whose trigger it stands in now and did
  // not stand in where the gesture began goes off, the token struck directly. Never on a player's app or in the stream window
  // 1.6.2 (the CORE session's batch 6, 10): a roll's or an action's Set off: the placed blast nearest the token it is used from, within 2 yards of
  // its center, goes off as one stepped on does (armed or not), the token struck directly. The host's own copy alone; how many went off
  window.wpSetOffNear = function(list) {
      if (window.wpStream || (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') || !Array.isArray(list)) return 0;
      var camp = getActiveCampaign(), n = 0; if (!camp || !camp.items) return 0;
      list.slice(0, 8).forEach(function(q) {
          var map = q && typeof q.map === 'string' && Object.prototype.hasOwnProperty.call(camp.items, q.map) ? camp.items[q.map] : null, tok = map && Array.isArray(map.whiteboard) ? map.whiteboard.filter(function(w) { return w && w.id === q.from; })[0] : null; if (!tok) return;
          var c = tokenCentre(tok), best = null, bd = 2.0001;
          map.whiteboard.forEach(function(z) { if (!z || z.type !== 'trigger' || !z.mine || typeof z.mine !== 'object') return; var d = yardsOn(map, c, { x: (Number(z.x) || 0) + (Number(z.w) || 0) / 2, y: (Number(z.y) || 0) + (Number(z.h) || 0) / 2 }); if (typeof d === 'number' && d < bd) { bd = d; best = z; } });
          if (!best) return; n++; toast((tok.charName || tok.name || 'A character') + ' sets off ' + (best.mine.name || 'a mine') + '.'); mineOff(map, best, tok.id);
      });
      return n;
  };
  window.wpMineCheck = function(map, tok, from) {
      var BC = window.wpBlastCore; if (!BC || !map || !tok || !tok.isChar || tok.waiting || window.wpStream) return 0;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return 0;
      var c = tokenCentre(tok), f0 = from && typeof from === 'object' && isFinite(Number(from.x)) && isFinite(Number(from.y)) ? { x: Number(from.x) + (tok.w || 60) / 2, y: Number(from.y) + (tok.h || 52) / 2 } : null, n = 0;
      var yb = function(a, b2) { return yardsOn(map, a, b2); };
      (map.whiteboard || []).filter(function(w) { return w && w.type === 'trigger' && w.mine && typeof w.mine === 'object' && w.mine.unarmed !== true; }).forEach(function(z) {   // an unarmed mine never goes off by a step
          if (!BC.inTrigger(z, c, yb) || (f0 && BC.inTrigger(z, f0, yb))) return;
          n++; toast((tok.charName || tok.name || 'A character') + ' steps on ' + (z.mine.name || 'a mine') + '.');
          mineOff(map, z, tok.id);
      });
      return n;
  };
  // The fuse (the book, fix log (eo)): a thrown explosive goes off at the start of the next turn of the fight on its map, not at once. It lies
  // there meanwhile, its icon on the map, and the GM is told. Kept in this machine's memory (a fuse outlives no reload)
  var _fused = [];
  function fuseSet(map, b, opts, n) {
      b.fused = true; _fused.push({ mapId: map.id, b: b, opts: opts, n: n });
      if (_fused.length > 64) _fused.splice(0, _fused.length - 64);
      toast((b.name || 'It') + ' lands and goes off at the start of the next turn.');
  }
  window.wpFuseTick = function(mapId) {   // net.js turnStarted, at a turn first reached: every fused explosive on that map goes off
      var camp = getActiveCampaign(), map = camp && camp.items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null; if (!map) return 0;
      var due = _fused.filter(function(f) { return f.mapId === mapId; }); if (!due.length) return 0;
      _fused = _fused.filter(function(f) { return f.mapId !== mapId; });
      due.forEach(function(f) { f.b.fused = false; toast((f.b.name || 'A blast') + ' goes off.'); if (window.wpSoundOn) window.wpSoundOn.fire({ k: 'blast' }, { map: mapId }); resolveThrow(f.b, f.opts, f.n, map); });
      renderMeasures(); return due.length;
  };
  // Whether a point stands in the blast's own cell: the same square or hex on a map with a grid, within half a cell on one with none
  function sameCellOn(map, a, b) {
      var S = window.wpSystemCore, g = S && S.mapGridOf ? S.mapGridOf(map) : state.gridType;
      if (g === 'hex') { var ha = hexCellOf(a.x, a.y, map), hb = hexCellOf(b.x, b.y, map); return ha.q === hb.q && ha.r === hb.r; }
      if (g === 'square') { var LS = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf(map) : null) || { size: 50 }, sz = LS.size, sx0 = LS.ox || 0, sy0 = LS.oy || 0; return Math.floor((a.x - sx0) / sz) === Math.floor((b.x - sx0) / sz) && Math.floor((a.y - sy0) / sz) === Math.floor((b.y - sy0) / sz); }
      return Math.hypot(a.x - b.x, a.y - b.y) < 25;
  }
  // The GM's row on a mine's right-click menu: set it off by hand. The GM's alone, never a player's app or the stream window; fixed words
  function mineRow(items) {
      var n = window.wpNet; if (window.wpStream || (n && (n.foreign || (n.active && n.role === 'client')))) return null;
      var ms = (Array.isArray(items) ? items : []).filter(function(w) { return !!w && w.type === 'trigger' && w.mine && typeof w.mine === 'object'; });
      return ms.length ? { items: ms, html: '<div class="menu-item cm-mine-off" title="It goes off at its center now, as if someone stepped on it."><i class="wib wi-burst"></i> Set off the mine' + (ms.length > 1 ? 's' : '') + '</div>' } : null;
  }
  // The stand-in drawings a thrown explosive and a placed mine wear at their center (blastcore STAND_INS), else the item's own icon where it is
  // a character (an emoji); a glyph of the bundled set takes the stand-in. Numbers through svgNum, words through esc
  function standInSvg(kind, x, y, icon) {
      var BC = window.wpBlastCore, S = window.wpSystemCore, ic = typeof icon === 'string' && icon && S && S.cleanIcon ? S.cleanIcon(icon) : '';
      if (ic && !/^icon:/.test(ic)) return '<text class="blast-ico-t" x="' + svgNum(x) + '" y="' + svgNum(y) + '" text-anchor="middle" dominant-baseline="central">' + esc(ic) + '</text>';
      var ps = BC && BC.STAND_INS && BC.STAND_INS[kind] ? BC.STAND_INS[kind] : null; if (!ps) return '';
      return '<g class="blast-ico ' + (kind === 'mine' ? 'mine-ico' : 'grenade-ico') + '" transform="translate(' + svgNum(x - 12) + ' ' + svgNum(y - 12) + ')">' + ps.map(function(d) { return '<path d="' + d + '"></path>'; }).join('') + '</g>';
  }
  function mineIconsSvg(map) {   // the GM's own screen: each mine at its spot (a player's copy holds none)
      var nM = window.wpNet; if (!map || window.wpStream || (nM && (nM.foreign || (nM.active && nM.role === 'client')))) return '';   // the GM's screen alone (playerScreen's own test)
      return (map.whiteboard || []).filter(function(w) { return w && w.type === 'trigger' && w.mine && typeof w.mine === 'object'; }).map(function(z) { return standInSvg('mine', (Number(z.x) || 0) + (Number(z.w) || 0) / 2, (Number(z.y) || 0) + (Number(z.h) || 0) / 2, z.mineIcon); }).join('');
  }
  // [systemcheck:explosives-end]
  // [systemcheck:launch-start]
  // 1.5.9 Chambers from (the owner, by prompt on 2026-10-25: "A cell and a round", after a sheet website's grenade launchers): a launched round is
  // no throw. Its blast goes off where it is put, with none of a throw's outcomes: no throw roll, no scatter, no drop at the feet, nothing going
  // off in the hand. It is the round last fired, else the next one (Row.fired), and its damage, type, armor divisor, notes and icon are the
  // round's own. On a hit the host puts it on the roller's target (net.js, wpLaunchHit); the GM's Launch puts it where the GM clicks (wpArmLaunch),
  // as for a round that misses where its item says nothing. 1.5.9 (the book's (es), docs/BOOK_ES_ET_PLAN.md section 1): a round whose item says
  // how it lands on a miss (its area's flight) is put down by the host on a miss too (wpLaunchMiss): one that scatters lands as a missed throw does,
  // a yard a point missed and never more than half the distance fired, by the Combat tab's own scatter where it names one; one that flies straight
  // goes on along its line, past the aim, and goes off on the first wall or character in its path, or at its farthest (the launcher list's Flies at
  // most, else the board's edge). One that scatters goes off on a thrown grenade's timing, so it waits for the fuse where the card sets one (the
  // book's fix log (eu), H1). What the book has not ruled yet is the Combat tab's to say (combat.blast.launch). The host's alone, never on a
  // player's app
  function launchRowOf(camp, opts) {   // the launcher's row on this machine's own copy and the round it puts down: { ch, f, row, def, area }
      var S = window.wpSystemCore, sys = camp && camp.system; if (!S || !sys || !opts || typeof opts.charId !== 'string' || typeof opts.fieldId !== 'string' || typeof opts.rowId !== 'string') return null;
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, opts.charId) ? camp.chars[opts.charId] : null; if (!ch) return null;
      var f = S.fieldById(sys, opts.fieldId); if (!f || f.kind !== 'item-list' || !f.list || (!f.list.chamber && opts.own !== true)) return null;   // 1.6.2 (the CORE session): own, the row's own blast (a list roll ticked Bursts at its target)
      var row = (ch.values && Array.isArray(ch.values[f.id]) ? ch.values[f.id] : []).filter(function(r) { return r && r.hid !== 1 && S.rowIdOf(r) === opts.rowId; })[0], sht = opts.shot && typeof opts.shot === 'object' ? opts.shot : null; if (!row && !sht) return null;   // 1.6.0 A burst: the host names the very round, in firing order
      var cp = sht ? sht : opts.own === true ? row : row.fd && typeof row.fd === 'object' ? row.fd : Array.isArray(row.rd) && row.rd[0] && typeof row.rd[0] === 'object' ? row.rd[0] : null; if (!cp) return null;
      var rd = S.rowDef(sys, cp), def = rd && rd.def; if (!def || !def.area || typeof def.area !== 'object') return null;
      return { ch: ch, f: f, row: row, def: def, area: def.area };
  }
  function launchAt(opts, mapIn) {
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return null;
      var camp = getActiveCampaign(), map = mapIn || getActiveMap(); if (!camp || !map || !opts) return null;
      var x = Number(opts.x), y = Number(opts.y); if (!isFinite(x) || !isFinite(y)) return null;
      var lr = launchRowOf(camp, opts); if (!lr) { toast('Nothing to put down there: no round fired or chambered on that row has a blast.'); return null; }
      var hasD = Object.prototype.hasOwnProperty.call(opts, 'direct'), aimT = hasD ? null : tokenAtPoint(map, x, y, true), aim = aimT ? tokenCentre(aimT) : { x: x, y: y }, d = lr.def, a = lr.area, gm = d.vis === 'gm' || lr.f.vis === 'gm';   // the character token clicked, else the point; 1.5.9 (es): a miss names its own point and whom it strikes
      var dir = hasD ? (typeof opts.direct === 'string' ? opts.direct : null) : aimT ? aimT.id : null, po = { goOff: true, launched: true, x: aim.x, y: aim.y, ft: a.ft, name: a.name || d.name || '', by: lr.ch.name || '', charId: opts.charId, fieldId: lr.f.id, rowId: opts.rowId, damage: d.damage || '', gmOnly: gm, direct: dir, dtype: a.type, ad: a.ad, loc: a.loc, notes: gm ? '' : d.notes, icon: d.icon, frag: a.frag, fragType: a.fragType, aff: a.aff, cloud: a.cloud };   // 1.5.9 (es): the round's own fragmentation and afflictions
      var lsS = window.wpSystemCore, lsF = lsS && typeof lsS.fieldById === 'function' && lr.f.list.chamber && typeof blastStats === 'function' ? lsS.fieldById(camp.system, lr.f.list.chamber.from) : null; if (lsF) Object.assign(po, blastStats(camp.system, lsF, d)); else if (opts.own === true && typeof blastStats === 'function') Object.assign(po, blastStats(camp.system, lr.f, d));   // 1.6.0: by the list its round comes from; 1.6.2: a row's own blast by its own list
      if (typeof opts.said === 'string' && opts.said) po.said = opts.said; if (opts.fuse === true) po.fuseOk = true;
      var fsL = typeof blastStats === 'function' ? blastStats(camp.system, lr.f, d) : null; if (fsL) { if (typeof fsL.fills === 'number' && fsL.fills > 0) po.fills = fsL.fills; if (fsL.noDrop === true) po.noDrop = true; if (typeof fsL.iscale === 'number' && fsL.iscale > 0) po.iscale = fsL.iscale; }   // 1.6.0: what its list says of it, as a throw's row is read
      if (typeof opts.margin === 'number' && isFinite(opts.margin)) po.atkM = opts.margin; if (opts.shot) po.defKey = burstKey(opts);   // 1.6.0: a blast's own Defense roll: the attack's margin, read by its direct target, and the burst whose rounds take one roll
      return placeThrownBlast(po, map);
  }
  window.wpLaunchAt = launchAt;
  // 1.6.0 A burst (the owner, by prompt: "both as 2 options depending on how the gm prefers"): a round that failed, past the first, lands a rolled distance off
  // where the first round landed and goes off at the start of the next turn. The Combat tab's launch.stray rolls the distance here, as the round fails, and the
  // GM says the way: the map's six or eight ways, or Click on the map, whose next click gives it, or Skip, which lets it go. It waits as a kind of the bell, in this
  // machine's memory, as a fuse does
  var _strays = Object.create(null), STRAY_MAX = 32, strayN = 0;
  function strayOf(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(_strays, id) ? _strays[id] : null; }
  function strayGone(id) {
      delete _strays[id]; if (window.wpNotices && typeof window.wpNotices.done === 'function') window.wpNotices.done('stray:' + id);
      if (_armedThrow && _armedThrow.stray === id) { _armedThrow = null; document.body.classList.remove('placing'); var mvG = document.getElementById('moveModeBtn'); if (mvG) mvG.click(); }   // its Click on the map, answered another way: the next click is the GM's again
  }
  // Where a burst's first round came down, for the rest of the burst, whose extra dice may be rolled a turn later: { camp, mapId, aim, from, land }. The host's memory
  // alone and never on the row, which reaches its owner, and it lets a target or a shooter go since the attack without losing the burst's place
  var _burstAt = Object.create(null), BURST_MAX = 32;
  function burstKey(o) { return o.charId + '|' + o.fieldId + '|' + o.rowId; }
  function burstHeld(camp, o) { var m = o.shot ? _burstAt[burstKey(o)] : null; return m && m.camp === camp.id ? m : null; }
  // Where a shot was fired: its map, its target and its shooter, the points aim and from, and mem, what its burst keeps, whose points stand in for a token gone
  function shotEnds(camp, o) {
      var has = function(ob, k) { return !!ob && Object.prototype.hasOwnProperty.call(ob, k); }, mem = burstHeld(camp, o), map = typeof o.mapId === 'string' && has(camp.items, o.mapId) ? camp.items[o.mapId] : mem && has(camp.items, mem.mapId) ? camp.items[mem.mapId] : null;
      if (mem && (!map || map.id !== mem.mapId)) mem = null;
      var wb = map && Array.isArray(map.whiteboard) ? map.whiteboard : [], t = typeof o.tid === 'string' ? wb.filter(function(w) { return w && w.id === o.tid && !w.hidden; })[0] : null;
      var sh = t || mem ? wb.filter(function(w) { return w && w.charId === o.charId && !w.waiting; }).sort(function(p, q) { return (q.isChar ? 1 : 0) - (p.isChar ? 1 : 0); })[0] : null;
      return { map: map, wb: wb, t: t || null, sh: sh || null, mem: mem, aim: t ? tokenCentre(t) : mem ? mem.aim : null, from: sh ? tokenCentre(sh) : mem ? mem.from : null };
  }
  // net.js burstAfter, on the host, as an attack lands: o.shot names its first round and b is that round's blast, where it made one. With no shot the row's last burst is forgotten
  window.wpBurstFirst = function(o, b) {
      var camp = getActiveCampaign(); if (!camp || !o || (window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return;
      delete _burstAt[burstKey(o)]; if (!o.shot) { if (typeof defendKeptGo === 'function') defendKeptGo(burstKey(o)); return; }
      var e = shotEnds(camp, o); if (!e.t || !e.sh) return;
      var ks = Object.keys(_burstAt); if (ks.length >= BURST_MAX) delete _burstAt[ks[0]];
      _burstAt[burstKey(o)] = { camp: camp.id, mapId: e.map.id, aim: e.aim, from: e.from, land: b && isFinite(Number(b.x)) && isFinite(Number(b.y)) ? { x: Number(b.x), y: Number(b.y) } : null };   // no landing: it made no blast, so the rest of the burst lands from the aim
      if (window.wpStepLog) window.wpStepLog('burst v1', 'first', { landed: !!_burstAt[burstKey(o)].land });
  };
  function strayLand(id, x, y, words) {
      var s = strayOf(id), camp = getActiveCampaign(); if (!s) return null;
      if (!camp || camp.id !== s.camp) { toast('That stray round is in another campaign. Open it to say which way it lands.'); return null; }
      var map = camp.items && Object.prototype.hasOwnProperty.call(camp.items, s.mapId) ? camp.items[s.mapId] : null; strayGone(id); if (window.wpStepLog) window.wpStepLog('burst v1', map ? 'stray-landed' : 'stray-lost', { yd: s.yd, fuse: s.fuse === true }); if (!map) { toast('The map that stray round landed on is gone.'); return null; }
      var lenW = function(yd) { return typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd'; };
      return launchAt({ charId: s.charId, fieldId: s.fieldId, rowId: s.rowId, shot: s.shot, x: Math.max(0, x), y: Math.max(0, y), direct: null, said: ' A stray round: it lands ' + lenW(s.yd) + ' ' + words + '.', fuse: s.fuse }, map);
  }
  function strayPick(id, way) {
      var s = strayOf(id), BC = window.wpBlastCore; if (!s || !BC) return null;
      var sp = BC.scatterPoint(s.aim, s.from, s.yd, way, s.px, s.ways); return sp ? strayLand(id, sp.x, sp.y, sp.words.toLowerCase() + ' of ' + s.off) : null;
  }
  function strayArm(id) {   // Click on the map: the next click on the stray's own map gives the way
      var s = strayOf(id), am = getActiveMap(); if (!s) return;
      if (!am || am.id !== s.mapId) { toast('Open ' + (s.mapName || 'its map') + ' first: the round landed there.'); return; }
      _armedThrow = { stray: id, name: s.name };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the way ' + s.name + ' lands from ' + s.off + '. Esc cancels, and it waits in the bell.');
  }
  function strayClick(id, x, y) {
      var s = strayOf(id), BC = window.wpBlastCore, am = getActiveMap(); if (!s || !BC) return null;
      if (!am || am.id !== s.mapId) { toast('That round landed on ' + (s.mapName || 'another map') + '. Open it and press Click on the map again. It still waits in the bell.'); return null; }   // the map changed while the click was armed: this click is on another board
      var pt = BC.towardPoint(s.aim, { x: x, y: y }, s.yd, s.px); if (!pt) { toast('Click to one side of ' + s.off + ': a click on it gives no way. It still waits in the bell.'); return null; }
      return strayLand(id, pt.x, pt.y, 'from ' + s.off + ', the way you clicked');
  }
  // net.js on the host: a burst's round that did not hit (o: charId, fieldId, rowId, tid and mapId, the roller's target, and shot, the round), or one that hit with no
  // target left to go off at (o.hit). One that flies straight goes on as a miss does; one with no blast puts nothing down; else the GM places it with Launch, unless it
  // scatters and the card rolls a distance, which it lands from the first round's landing
  window.wpLaunchStray = function(o) {
      var camp = getActiveCampaign(), BC = window.wpBlastCore, F = window.wpFormula; if (!camp || !BC || !o || typeof o !== 'object' || (window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return null;
      var lr = launchRowOf(camp, o); if (!lr) return null;
      var ends = shotEnds(camp, o), map = ends.map, mem = ends.mem, aim = mem && mem.land ? mem.land : ends.aim, sc = ends.from; if (o.hit === true && mem) return window.wpLaunchHit(o);
      if (lr.area.flight === 'line') return window.wpLaunchMiss(Object.assign({}, o, { margin: 1, crit: '' }));
      var nm = lr.area.name || lr.def.name || 'The round', lc = nm.charAt(0).toUpperCase() + nm.slice(1), bl = camp.system && camp.system.combat && camp.system.combat.blast && typeof camp.system.combat.blast === 'object' ? camp.system.combat.blast : {}, ln = bl.launch && typeof bl.launch === 'object' ? bl.launch : {};
      var yd = null; if (lr.area.flight === 'scatter' && typeof ln.stray === 'string' && ln.stray && F) { var sv = F.evaluate(ln.stray, {}); yd = sv && sv.ok && typeof sv.value === 'number' && isFinite(sv.value) ? Math.max(0, Math.min(1000, sv.value)) : null; }
      if (yd === null || !aim || !sc) { toast(lc + ' of the burst has nowhere to land by itself. Place it with Launch on the sheet.'); return null; }
      var dYd = typeof yardsOn === 'function' ? yardsOn(map, sc, ends.aim) : Math.hypot(ends.aim.x - sc.x, ends.aim.y - sc.y) / 50, dPx = Math.hypot(ends.aim.x - sc.x, ends.aim.y - sc.y), id = 's' + (++strayN).toString(36) + Math.random().toString(36).slice(2, 7);   // board pixels to a yard by the distance fired, since the first round may have come down at the shooter's feet, where the line it was fired on still runs to the aim
      var ids = Object.keys(_strays); if (ids.length >= STRAY_MAX) strayGone(ids[0]);
      _strays[id] = { camp: camp.id, mapId: map.id, mapName: (map.meta && map.meta.title) || map.title || '', charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, shot: o.shot, name: nm, aim: aim, from: Math.hypot(aim.x - sc.x, aim.y - sc.y) > 1e-6 ? sc : { x: 2 * sc.x - ends.aim.x, y: 2 * sc.y - ends.aim.y }, off: mem && mem.land ? 'the first round' : 'the aim', yd: yd, px: dYd > 1e-9 && dPx > 0 ? dPx / dYd : 50, ways: bl.ways === 8 ? 8 : 6, fuse: ln.now !== true };
      var lenS = typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd', say = lc + ' strays: it lands ' + lenS + ' off ' + _strays[id].off + '. Which way?';
      if (window.wpNotices && typeof window.wpNotices.wait === 'function') window.wpNotices.wait('stray:' + id, say, 'stray', id);
      if (window.wpStepLog) window.wpStepLog('burst v1', 'stray', { yd: yd, ways: _strays[id].ways });
      toast(say + ' Say it from the bell.');
      return id;
  };
  if (typeof window !== 'undefined') { var nkS = window.wpNoticeKinds = window.wpNoticeKinds || {}; nkS.stray = { label: 'Click on the map', tip: 'The next click on the map gives the way it lands', only: true, still: function(id) { return !!strayOf(id); }, run: strayArm, alt: function(id) { if (!strayOf(id)) return; strayGone(id); if (window.wpStepLog) window.wpStepLog('burst v1', 'stray-skipped', {}); }, altLabel: 'Skip', altTip: 'Let this round go. It lands nowhere', picks: function(id) { var s = strayOf(id), BC = window.wpBlastCore; return !s || !BC ? [] : (s.ways === 8 ? BC.SCATTER_WAYS : BC.SCATTER_WAYS6).map(function(w) { return { label: w, tip: 'It lands this way from ' + s.off + ', along the line it was fired on' }; }); }, pick: strayPick }; }
  window.wpArmAim = function(name, cb) {   // 1.6.0 An attack on a line: the next click on the map says where a roll is aimed, then it is rolled. Any tool taken puts it down, as a Throw
      if (typeof cb !== 'function') return false; var nm = typeof name === 'string' ? name.slice(0, 60) : '';
      _armedThrow = { aim: cb, name: nm };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the map to aim ' + (nm ? nm : 'the line') + '. Esc cancels.');
      return true;
  };
  window.wpArmLaunch = function(ctx) {   // the sheet's Launch (the GM's): the next click on the map puts the round's blast there
      if (!ctx || typeof ctx !== 'object') return;
      var nm = typeof ctx.name === 'string' ? ctx.name.slice(0, 60) : '';
      _armedThrow = { launch: true, charId: ctx.charId, fieldId: ctx.fieldId, rowId: ctx.rowId, name: nm };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the target or a place on the map for ' + (nm ? 'the ' + nm : 'the blast') + '. Esc cancels.');
  };
  window.wpLaunchHit = function(o) {   // net.js on the host: a hit puts the round it fired on the roller's target, on the target's own map
      var camp = getActiveCampaign(); if (!camp || !o || typeof o.mapId !== 'string' || typeof o.tid !== 'string') return null;
      var map = camp.items && Object.prototype.hasOwnProperty.call(camp.items, o.mapId) ? camp.items[o.mapId] : null, t = map && Array.isArray(map.whiteboard) ? map.whiteboard.filter(function(w) { return w && w.id === o.tid && !w.hidden; })[0] : null;
      if (!t && o.shot) {   // 1.6.0 A burst: a hit whose target went since the attack (killed by the first round, say) goes off where the first round landed, and with no such place it is the GM's to place
          if (!launchRowOf(camp, o)) return null;
          var hd = burstHeld(camp, o), mH = hd && camp.items && Object.prototype.hasOwnProperty.call(camp.items, hd.mapId) ? camp.items[hd.mapId] : null; if (window.wpStepLog) window.wpStepLog('burst v1', 'hit-target-gone', { held: !!mH }); if (!mH) return window.wpLaunchStray(o);
          return launchAt({ charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, x: (hd.land || hd.aim).x, y: (hd.land || hd.aim).y, shot: o.shot, direct: null, said: ' Its target is gone, so it goes off where the first round was aimed.' }, mH);
      }
      if (!t) return null;
      if (o.shot) { if (!launchRowOf(camp, o)) return null; var cS = tokenCentre(t); return launchAt({ charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, x: cS.x, y: cS.y, shot: o.shot, margin: o.margin }, map); }   // 1.6.0 A burst: the very round, and one with no blast of its own puts nothing down
      var c = tokenCentre(t); return launchAt({ charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, x: c.x, y: c.y, margin: o.margin, own: o.own === true }, map);
  };
  // [vehiclecheck:fly-start]
  // 1.6.2 (vehicles, fold (d), things in flight; the core's D1 to D7): what an act launches is a small token of its own on the launcher's map, with no sheet. Its figures
  // are on the piece (fly: the host's own, never sent) and its HP is a ring of its own (bars). It moves at the start of each new round of the fight it was launched in,
  // in launch order, and arrives as it enters its target's cell: the roll its item names is then made as the launcher's attack, and on a hit, or with no roll, its
  // blast goes off at the target, else its damage is rolled as a card. Out of rounds it is gone, or goes off where it stands where its item says so.
  // With no fight on its map there are no rounds (the owner, 2026-11-05): a launch flies its whole flight at once, so it arrives straight away where its
  // target is within its Speed times its rounds, and is spent at the end of its flight otherwise
  var _flyN = 0;
  function flyFights(mapId) { var N = window.wpNet; return !!(N && typeof N.fightsOn === 'function' && N.fightsOn(mapId).length); }
  function flyHere() { var N = window.wpNet; return !(N && N.active && N.role === 'client') && !(N && N.stream); }
  function flyMap(camp, id) { return camp && camp.items && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null; }
  function flyTok(map, id) { return map && Array.isArray(map.whiteboard) && typeof id === 'string' ? map.whiteboard.filter(function(w) { return w && w.id === id && !w.waiting; })[0] || null : null; }
  function flySent(camp, map) { var N = window.wpNet; if (N && N.active && N.role === 'host' && getActiveMap() !== map && typeof N.sendItem === 'function') N.sendItem(camp.id, map.id); }
  function flyName(w) { var it = w && w.fly && w.fly.item; return it && it.vis !== 'gm' && typeof it.name === 'string' && it.name ? it.name : 'The missile'; }
  function flyGone(map, w) { var i = map.whiteboard.indexOf(w); if (i >= 0) map.whiteboard.splice(i, 1); if (state.selWbIds) state.selWbIds = state.selWbIds.filter(function(id) { return id !== w.id; }); if (state.selWbId === w.id) state.selWbId = null; }
  function flyFight(mapId, tokId) { var N = window.wpNet, c = N && typeof N.combatOfTok === 'function' ? N.combatOfTok(mapId, tokId) : null; return c && typeof c.n === 'number' ? c.n : undefined; }
  window.wpFlyLaunch = function(list) {   // systemcore applyAct's launch sink, on the host: [{ by, f, r, def, from, map, target }]
      var camp = getActiveCampaign(), S = window.wpSystemCore, BC = window.wpBlastCore; if (!flyHere() || !camp || !S || !BC || !Array.isArray(list)) return 0;
      var n = 0, now = 0, maps = [];
      list.forEach(function(l) {
          var map = l ? flyMap(camp, l.map) : null, from = flyTok(map, l && l.from) || (map && l && typeof l.by === 'string' && typeof S.charTokenOn === 'function' ? S.charTokenOn(map, l.by, '', { hidden: true }) : null), tgt = flyTok(map, l && l.target), fl = S.cleanFlies(l && l.def && l.def.flies);   // 1.6.2 (the core's gap 216): with no token named, the sheet's own token on that map (a vehicle a crew member pressed)
          if (map && tgt && fl && !from) { toast(String(l.def && l.def.name || 'It').slice(0, 60) + ' is not launched: the sheet it is launched from has no token on that map.'); return; }
          if (!map || !from || !tgt || tgt.hidden || !fl) return;
          var g = S.mapGridOf(map), c = tokenCentre(from), tc = tokenCentre(tgt), seat = BC.flyStep({ grid: g, from: c, to: tc, cells: 0 }) || c, W = g === 'hex' ? 30 : 26, H = g === 'hex' ? 26 : 26, nm = typeof l.def.name === 'string' && l.def.name ? l.def.name.slice(0, 60) : 'Missile';
          var fly = Object.assign({}, fl, { by: l.by, f: l.f, r: l.r, target: tgt.id, at: tc, n: Date.now() * 1000 + (++_flyN % 1000), left: fl.rounds, item: l.def }), fn = flyFight(map.id, from.id); if (fn !== undefined) fly.fn = fn; if (fl.path === 'line') fly.line = BC.flyLine({ x: seat.x, y: seat.y }, tc);
          map.whiteboard = Array.isArray(map.whiteboard) ? map.whiteboard : [];
          var piece = { id: 'wb' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), type: 'circle', x: Math.round(seat.x - W / 2), y: Math.round(seat.y - H / 2), w: W, h: H, color: '#e8a33d', name: nm, charName: nm, isChar: true, bars: [{ n: 'HP', cur: fl.hp, max: fl.hp, show: 'all' }, null], fly: fly };
          map.whiteboard.push(piece);
          n++; if (maps.indexOf(map) < 0) maps.push(map);
          if (fn === undefined && !flyFights(map.id)) { now++; for (var k = 0; k < 100 && map.whiteboard.indexOf(piece) >= 0; k++) if (flyOne(camp, map, piece, g)) break; }   // no fight: its whole flight at once
      });
      if (!n) return 0;
      if (window.wpStepLog) window.wpStepLog('fly v1', 'launch', { n: n, now: now });
      save(true); render(); maps.forEach(function(m) { flySent(camp, m); });
      return n;
  };
  function flyBlast(camp, map, w, at, direct) {   // its item's blast where it stands or at its target
      var it = w.fly.item || {}, a = it.area && typeof it.area === 'object' ? it.area : null, ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, w.fly.by) ? camp.chars[w.fly.by] : null; if (!a) return false;
      var gm = it.vis === 'gm', po = { goOff: true, launched: true, x: at.x, y: at.y, ft: a.ft, name: a.name || it.name || '', by: ch && ch.name || '', charId: w.fly.by, fieldId: w.fly.f, rowId: w.fly.r, damage: it.damage || '', gmOnly: gm, direct: direct || null, dtype: a.type, ad: a.ad, loc: a.loc, notes: gm ? '' : it.notes, icon: it.icon, frag: a.frag, fragType: a.fragType, aff: a.aff, cloud: a.cloud };
      placeThrownBlast(po, map); return true;
  }
  function flyArrive(camp, map, w, tgt) {
      var S = window.wpSystemCore, F = window.wpFormula, N = window.wpNet, fl = w.fly, it = fl.item || {}, sys = camp.system || {}, nm = flyName(w), tn = tgt.charName || tgt.name || 'its target', hit = true, rolled = false;
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, fl.by) ? camp.chars[fl.by] : null, rl = typeof fl.roll === 'string' && Array.isArray(sys.rolls) ? sys.rolls.filter(function(x) { return x && x.id === fl.roll && typeof x.formula === 'string'; })[0] : null;
      flyGone(map, w);
      if (fl.roll) {   // D2: the roll the item names, made as the launcher's attack, from where it arrived
          hit = false;
          if (rl && ch && N && typeof N.diceRoll === 'function') {
              var rc = S && typeof S.rangeCtx === 'function' ? S.rangeCtx(sys, map, w, tgt, { F: F }) : null; rc = rc || { mod: 0, dist: 0 }; rc.tid = tgt.id; rc.mapId = map.id;
              var dr = N.diceRoll(rl.formula, { charId: ch.id, act: rl.id, range: rc, label: nm + ' arrives' }), ck = N.rollCheck; rolled = true; hit = !!(dr && dr.ok && ck && ck.pass === true);
          }
      }
      if (window.wpStepLog) window.wpStepLog('fly v1', 'arrive', { rolled: rolled, hit: hit });
      if (!hit) { toast(rolled ? nm + ' reaches ' + tn + ' and misses.' : nm + ' reaches ' + tn + ', but its roll cannot be made. It is spent.'); return; }
      var attW = rolled && N && typeof N.rollMade === 'string' ? N.rollMade : '';   // the core's gap 214: a hit its target may resist waits for that roll
      if (attW && typeof N.flyWait === 'function' && N.flyWait(attW, { m: map.id, w: w, tid: tgt.id, name: nm })) { if (window.wpStepLog) window.wpStepLog('fly v1', 'waits', {}); toast(nm + ' reaches ' + tn + '. It strikes unless ' + tn + ' resists.'); return; }
      flyHit(camp, map, w, tgt);
  }
  // what lands: its blast at the target, else its damage as a card
  function flyHit(camp, map, w, tgt) {
      var fl = w.fly, it = fl.item || {}, nm = flyName(w), tn = tgt.charName || tgt.name || 'its target', ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, fl.by) ? camp.chars[fl.by] : null;
      if (flyBlast(camp, map, w, tokenCentre(tgt), tgt.id)) return;
      if (typeof it.damage === 'string' && it.damage && ch && window.wpDice && typeof window.wpDice.rollFor === 'function') { window.wpDice.rollFor(ch.id, it.damage, nm + ' damage', { gmOnly: it.vis === 'gm', dmg: true }); toast(nm + ' strikes ' + tn + '. Apply its damage from the card.'); return; }
      toast(nm + ' strikes ' + tn + '.');
  }
  // 1.6.2 (the core's gap 214): the target's roll is in. pass: it resisted, so the thing is avoided; else it lands where its target now stands
  window.wpFlyLand = function(fw, pass) {
      var camp = getActiveCampaign(), map = fw && camp ? flyMap(camp, fw.m) : null; if (!flyHere() || !map || !fw.w || !fw.w.fly) return false;
      var nm = flyName(fw.w), tgt = flyTok(map, fw.tid);
      if (window.wpStepLog) window.wpStepLog('fly v1', pass === true ? 'avoided' : 'lands', { here: !!tgt });
      if (pass === true) { toast(nm + ' is avoided.'); return true; }
      if (!tgt) { toast(nm + ' finds nothing to strike: its target is gone.'); return false; }
      flyHit(camp, map, fw.w, tgt); save(true); render(); flySent(camp, map); return true;
  };
  window.wpFlyRound = function(mapId, c) {   // net.js roundChanged, on the host: a new round of a fight on that map moves what flies there, in launch order
      var camp = getActiveCampaign(), map = flyMap(camp, mapId), BC = window.wpBlastCore, S = window.wpSystemCore; if (!flyHere() || !map || !BC || !S || !c || typeof c.n !== 'number' || !Array.isArray(map.whiteboard)) return 0;
      var list = map.whiteboard.filter(function(w) { return w && w.fly && typeof w.fly === 'object' && (w.fly.fn === undefined || w.fly.fn === c.n); }).sort(function(p, q) { return (p.fly.n || 0) - (q.fly.n || 0); }); if (!list.length) return 0;
      var g = S.mapGridOf(map), n = 0;
      list.forEach(function(w) { if (map.whiteboard.indexOf(w) < 0) return; w.fly.fn = c.n; n++; flyOne(camp, map, w, g); });
      if (n) { save(true); render(); flySent(camp, map); }
      return n;
  };
  function flyOne(camp, map, w, g) {   // one round of its flight: its Speed in cells toward its target, a round off; then 'arrived', 'spent' or '' (still flying)
      var BC = window.wpBlastCore, S = window.wpSystemCore, F = window.wpFormula, fl = w.fly;
      var tgt = flyTok(map, fl.target); if (tgt && tgt.hidden) tgt = null; if (tgt) fl.at = tokenCentre(tgt);
      var ch = camp.chars && Object.prototype.hasOwnProperty.call(camp.chars, fl.by) ? camp.chars[fl.by] : { id: '', values: {} };
      var sv = F ? F.evaluate(fl.speed, { vars: S.makeResolver(camp.system, ch, F, S.tokenCtx(map, w, {})) }) : null, cells = sv && sv.ok && typeof sv.value === 'number' && isFinite(sv.value) ? Math.max(0, Math.min(BC.FLY_MAX, Math.floor(sv.value))) : 0;
      var st = fl.at ? BC.flyStep({ grid: g, from: tokenCentre(w), to: fl.at, cells: cells, homing: fl.path !== 'line', line: fl.line }) : null;
      if (st) { w.x = Math.round(st.x - (w.w || 26) / 2); w.y = Math.round(st.y - (w.h || 26) / 2); if (st.line) fl.line = st.line; }
      fl.left = (fl.left || 1) - 1;
      if (st && st.arrived && tgt) { flyArrive(camp, map, w, tgt); return 'arrived'; }
      if (fl.left <= 0) {   // D3: out of rounds, gone, or off where it stands
          var at = tokenCentre(w); flyGone(map, w); if (window.wpStepLog) window.wpStepLog('fly v1', 'spent', { off: fl.end === 'off' });
          if (!(fl.end === 'off' && flyBlast(camp, map, w, at, null))) toast(flyName(w) + ' runs out of flight and is gone.');
          return 'spent';
      }
      return '';
  }
  window.wpFlyHit = function(tok, inp) {   // sheets.js damageFromRoll, on the host: a hit on a thing in flight (D7), its wound by the system's own rule against its Protection
      var camp = getActiveCampaign(), S = window.wpSystemCore, F = window.wpFormula; if (!flyHere() || !camp || !S || !tok || !tok.fly || typeof tok.fly !== 'object') return false;
      var map = null; Object.keys(camp.items || {}).forEach(function(k) { var m = camp.items[k]; if (!map && m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.indexOf(tok) >= 0) map = m; }); if (!map) return false;
      var fl = tok.fly, wd = S.flyWound(camp.system, inp, fl.pro, F), hp = Math.max(0, (typeof fl.hp === 'number' ? fl.hp : 1) - wd), nm = flyName(tok);
      fl.hp = hp; if (Array.isArray(tok.bars) && tok.bars[0] && typeof tok.bars[0] === 'object') tok.bars[0].cur = hp;
      if (window.wpStepLog) window.wpStepLog('fly v1', 'hit', { wound: wd, down: hp <= 0 });
      if (hp <= 0) { flyGone(map, tok); toast(nm + ' takes ' + wd + ' and is shot down.'); }
      else toast(nm + ' takes ' + wd + '. It has ' + hp + ' HP left.');
      save(true); render(); flySent(camp, map); return true;
  };
  // [vehiclecheck:fly-end]
  var LAUNCH_BOARD = 30000;   // the board's own size, in board pixels (the style sheet's #whiteboard)
  // net.js on the host: a launched round that missed (o: charId, fieldId, rowId, tid and mapId, the roller's target, margin, the verdict's, and crit,
  // 'fumble' for a critical failure). Where its item says nothing of a miss, nothing: the GM places it with Launch, as before
  window.wpLaunchMiss = function(o) {
      var camp = getActiveCampaign(), BC = window.wpBlastCore, S = window.wpSystemCore, F = window.wpFormula; if (!camp || !BC || !o || typeof o !== 'object') return null;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return null;
      var lr = launchRowOf(camp, o); if (!lr) return null;
      var fl = lr.area.flight; if (fl !== 'scatter' && fl !== 'line') return null;
      var nm = lr.area.name || lr.def.name || 'the round', ends = shotEnds(camp, o), map = ends.map, wb = ends.wb, t = ends.t, sh = ends.sh;   // 1.6.0 A burst: its own memory stands in for a token gone since the attack
      if (!ends.aim || !ends.from) { toast(nm.charAt(0).toUpperCase() + nm.slice(1) + ' missed, with no target and shooter on one map to tell where it went. Place it with Launch on the sheet.'); return null; }
      var bl = camp.system && camp.system.combat && camp.system.combat.blast && typeof camp.system.combat.blast === 'object' ? camp.system.combat.blast : {}, ln = bl.launch && typeof bl.launch === 'object' ? bl.launch : {};
      var sc = ends.from, aim = ends.aim, mg = BC.missOf({ kind: 'check', pass: false, margin: o.margin }) || 1, base = { charId: o.charId, fieldId: o.fieldId, rowId: o.rowId, shot: o.shot, own: o.own === true };
      var dYd = typeof yardsOn === 'function' ? yardsOn(map, sc, aim) : Math.hypot(aim.x - sc.x, aim.y - sc.y) / 50, dPx = Math.hypot(aim.x - sc.x, aim.y - sc.y), px = dYd > 1e-9 && dPx > 0 ? dPx / dYd : 50;   // board pixels to a yard on that map, as it reads the distance fired
      var lenW = function(yd) { return typeof rulerLen === 'function' && typeof rulerUnitNow === 'function' ? rulerLen(yd, rulerUnitNow()) : Math.round(yd * 10) / 10 + ' yd'; };
      if (o.crit === 'fumble' && ln.fumble === 'none') { toast('A critical failure: ' + nm + ' misfires and goes nowhere. The round is spent.'); return null; }
      if (o.crit === 'fumble' && ln.fumble === 'feet') return launchAt(Object.assign(base, { x: sc.x, y: sc.y, direct: null, said: ' A critical failure: it goes off at the shooter\u2019s feet.', fuse: ln.now !== true && fl === 'scatter' }), map);
      if (fl === 'scatter') {   // as a missed throw: from the aim along the line it was fired on, by the Combat tab's scatter (Margin, ThrowDistance: the distance fired), else the book's
          var syd = null;
          if (typeof bl.scatter === 'string' && bl.scatter && F) { var sv = F.evaluate(bl.scatter, { vars: function(n) { var l = String(n).toLowerCase(); return l === 'margin' ? mg : l === 'throwdistance' ? dYd : undefined; } }); syd = sv && sv.ok ? (typeof sv.value === 'boolean' ? (sv.value ? 1 : 0) : sv.value) : null; }
          syd = typeof syd === 'number' && isFinite(syd) ? Math.max(0, Math.min(1000, syd)) : BC.bookScatterYd(mg, dYd);
          var nW = bl.ways === 8 ? 8 : 6, sp = BC.scatterPoint(aim, sc, syd, Math.floor(Math.random() * nW), px, nW); if (!sp) return null;   // the way rolled as a throw's is
          return launchAt(Object.assign(base, { x: Math.max(0, sp.x), y: Math.max(0, sp.y), direct: null, said: ' A miss by ' + mg + ': it lands ' + lenW(syd) + ' ' + sp.words.toLowerCase() + ' of the aim.', fuse: ln.now !== true }), map);   // the review of fold 2: on a thrown grenade's timing unless the card says at once (the book's (eu), H1)
      }
      var rf = lr.f.list && lr.f.list.chamber && typeof lr.f.list.chamber.reach === 'string' ? lr.f.list.chamber.reach : '', reach = null;   // straight on: as far as Flies at most, from the launcher row's own names, else to the board's edge
      if (rf && S && F && typeof S.makeResolver === 'function') { var R = S.makeResolver(camp.system, lr.ch, F), rowR = R && typeof R.row === 'function' ? R.row(lr.f.id, o.rowId) : null, rv = rowR ? F.evaluate(rf, { vars: rowR, random: function() { return NaN; } }) : null; if (rv && rv.ok && typeof rv.value === 'number' && isFinite(rv.value) && rv.value > 0) reach = rv.value; }
      var end = BC.flightEnd(sc, aim, reach !== null ? reach * px : null, LAUNCH_BOARD); if (!end) return null;
      var aimAt = Math.hypot(end.x - sc.x, end.y - sc.y) > 1e-6 ? Math.min(1, dPx / Math.hypot(end.x - sc.x, end.y - sc.y)) : 1;
      var wall = window.wpFog && typeof window.wpFog.flightWall === 'function' ? window.wpFog.flightWall(map, sc, end) : null;
      var boxes = ln.stop === 'walls' ? [] : wb.filter(function(w) { return w && w.isChar && !w.hidden && !w.waiting && (!sh || w.id !== sh.id) && (!t || w.id !== t.id); }).map(function(w) { return { id: w.id, x: Number(w.x), y: Number(w.y), w: w.w || 60, h: w.h || 52 }; });
      var hb = BC.firstBox(sc, end, boxes, ln.stop === 'past' ? aimAt : 0);
      if (hb && (!wall || hb.t < wall.at)) { var ht = wb.filter(function(w) { return w && w.id === hb.id; })[0], hc = tokenCentre(ht); return launchAt(Object.assign(base, { x: hc.x, y: hc.y, direct: ln.glance === true ? null : hb.id, said: ' A miss: it flies straight on and strikes a character in its path.' }), map); }
      if (wall) return launchAt(Object.assign(base, { x: wall.x, y: wall.y, direct: null, said: ' A miss: it flies straight on into a wall.' }), map);
      return launchAt(Object.assign(base, { x: end.x, y: end.y, direct: null, said: reach !== null ? ' A miss: it flies straight on and goes off at its farthest.' : ' A miss: it flies straight on to the edge of the map.' }), map);
  };
  // [systemcheck:launch-end]
  // [systemcheck:explode-start]
  // Explode (1.5.4, backlog 128; the owner by prompt: "Yes, type is a word", and of who may: "The GM is the only one who should be able to
  // make any blast effects"). The GM sets off the last shape of the Radius tool as an explosion: a circle, and since 128 (e) a ring or a cone
  // too ("A cone and a ring, soon"), which the blast keeps and the table is shown. A damage, a number or a roll, and a damage
  // type, a word, are typed each time: nothing is ever filled in ("no defaults can be done because a damage type and value is needed"). The
  // circle becomes a blast in its place, shown to the table as a thrown blast is, and the damage follows the system's blast setting
  // (combat.blastAuto: full rolls and applies, roll rolls to chat, measure does neither). The type is named on the roll's card and changes no
  // number. It hits the tokens the circle held and no other: the token a circle sat on is spared (spare), and nothing is moved, so a circle
  // whose center is in a wall is refused where a throw would go off in front of it. Every refusal is in fixed words. Of the token a circle
  // sat on the owner said, by prompt: "Ask each time". So the boxes hold a tick, Also hits the token at the center, shown only for a circle
  // on a token and off every time it comes up. Ticked, that one explosion spares nobody
  var EXPLODE_MIN_FT = 1, EXPLODE_MAX_FT = 3000;   // a blast's radius in feet, as placeThrownBlast and a player's app bound it
  function explodeType(v) {   // the damage type as typed: a few plain words on one line, 40 characters at most and never half a character
      if (typeof v !== 'string') return '';
      var out = '';
      Array.from(v.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim()).some(function(ch) {
          if (ch.length === 1 && ch >= '\ud800' && ch <= '\udfff') return false;   // half a character that came alone: left out
          if (out.length + ch.length > 40) return true;
          out += ch; return false;
      });
      return out.trim();
  }
  function explodeWhere() {   // the circle Explode would set off: { c, ft }, or { why } in fixed words
      if (playerScreen()) return { why: 'Only the GM sets off an explosion.' };
      // the shape the options show: none while a shape picked in the options waits for its click, though a circle that came back with its token
      // may be on screen by then (the review of 2026-10-10: Explode set off a circle whose numbers the options no longer showed)
      var map = getActiveMap(), c = map ? lastEdit() : null;
      if (!c) return { why: map && circleKeptPicked && lastOwn() ? 'The shape you picked is waiting for its click. Place it first: Explode sets off the last shape you placed.' : 'Place a shape first. Explode sets off the last shape you placed.' };
      var ft = c.yd * 3, ru = rulerUnitNow();
      if (ft > EXPLODE_MAX_FT) return { why: 'An explosion is at most ' + rulerLen(EXPLODE_MAX_FT / 3, ru) + ' in radius.' };
      if (ft < EXPLODE_MIN_FT) return { why: 'An explosion is at least ' + rulerLen(EXPLODE_MIN_FT / 3, ru) + ' in radius.' };
      if (window.wpFog && window.wpFog.blastSeat && window.wpFog.blastSeat(map, c.x, c.y, c.x, c.y)) return { why: (shapeOf(c.as) === 'cone' ? 'The point of the cone' : shapeOf(c.as) === 'ring' ? 'The center of the ring' : 'The center of the circle') + ' is inside a wall or a closed door. Move it to an open cell first.' };
      return { c: c, ft: ft };
  }
  function explodeAsk(dmg, type) {   // what Explode would set off with what was typed: { c, ft, expr, type }, or { why }
      var q = explodeWhere(); if (q.why) return q;
      var D = window.wpDiceCore, F = window.wpFormula, expr = D && D.cleanExpr ? D.cleanExpr(dmg) : null;
      if (!expr) return { why: 'Type the damage. It is a number or a roll.' };
      var p = F && F.parse ? F.parse(expr) : null;
      if (!p || !p.ok) return { why: 'That damage does not read as a number or a roll.' };
      if (p.names && p.names.length) return { why: 'The damage is a number or a roll. It cannot name a value from a sheet.' };
      var ty = explodeType(type); if (!ty) return { why: 'Type the damage type. It is a word.' };
      return { c: q.c, ft: q.ft, expr: expr, type: ty };
  }
  function explodeCircle(dmg, type, hitFor) {   // true: it went off. hitFor: the very circle whose center token the GM ticked to be hit, else nothing
      var q = explodeAsk(dmg, type); if (q.why) { toast(q.why); return false; }
      var map = getActiveMap(), camp = getActiveCampaign(), sys = camp && camp.system, combat = (sys && sys.combat) || {};
      var auto = !sys ? 'roll' : combat.blastAuto === 'roll' || combat.blastAuto === 'measure' ? combat.blastAuto : 'full';   // with no character system there is nothing to apply the damage to
      var diceOn = !window.wpVtt || window.wpVtt.on('dice'), rolled = false, total = null;
      var rlX = typeof blastRules === 'function' ? blastRules(sys) : null, eachX = auto === 'full' && !!(rlX && rlX.each);   // 1.6.0 (the core's gap 8): each rolls its own dice, so none is rolled for all
      var defX = auto === 'full' && !!(combat.blast && typeof combat.blast === 'object' && combat.blast.defend && typeof combat.blast.defend === 'object');   // 1.6.2 (the owner: a system's rules apply however the event starts): a system that gives its blasts a Defense roll gets it here too; with none, as ever
      if (auto !== 'measure' && diceOn && eachX) { rolled = true; total = 0; }
      else if (auto !== 'measure' && diceOn) {   // the roll first: a damage that cannot be rolled sets nothing off
          if (!window.wpDice || !window.wpDice.rollFor) { toast('Dice are not available.'); return false; }
          var drX = auto === 'full' ? { dmg: true, used: true } : { dmg: true }; if (defX) drX.usedWait = true;
          var dr = window.wpDice.rollFor('', q.expr, 'Explosion, ' + q.type + ' damage', drX);   // the type is named on the card: it changes no number
          if (!dr || dr.error || !dr.ok) return false;   // the roll said why
          rolled = true; total = typeof dr.value === 'number' && isFinite(dr.value) ? dr.value : null;
      }
      var c = q.c, at = blasts.indexOf(c); if (at < 0) return false;   // the circle went while the roll was made: nothing goes off, and no other shape's place is taken
      var b = { x: c.x, y: c.y, ft: q.ft, name: 'Explosion', elev: typeof c.elev === 'number' && isFinite(c.elev) ? c.elev : 0, autoElev: false, thrown: true, by: '' };
      if (rlX && rlX.each && typeof q.expr === 'string' && q.expr) b.eachExpr = q.expr;   // 1.6.0 (the core's gap 8): what each victim rolls at its own dice
      if (defX) b.bid = 'b_' + Math.random().toString(36).slice(2, 12);   // what waits for its Defense rolls goes by the blast's id (defendAsk), the host's alone: it is no part of what the table is shown
      if (typeof c.tok === 'string' && hitFor !== c) b.spare = c.tok;   // the token the circle sat on was not inside it: the explosion does not hit it, unless the GM ticked that it does, for this very circle
      var sent = { x: b.x, y: b.y, ft: b.ft, name: b.name, elev: b.elev, by: '' };   // shown to the table as a thrown blast is: its place, its size, its height and the fixed word
      if (shapeOf(c.as) === 'ring' && c.inn > 0 && c.inn < c.yd) { b.shape = sent.shape = 'ring'; b.inFt = sent.inFt = c.inn * 3; }   // a ring with no hole is the whole disc
      else if (shapeOf(c.as) === 'cone') { b.shape = sent.shape = 'cone'; b.deg = sent.deg = coneDeg(c.deg, 60); b.dir = sent.dir = typeof c.dir === 'number' && isFinite(c.dir) ? c.dir : 0; }   // and its shape, where it has one
      blasts.splice(at, 1, b);   // the shape becomes the blast, where it stood
      if (typeof circleRekept === 'function') circleRekept();
      renderMeasures(); syncBlastMenu();
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlast) { b.wire = sent; b.wireMap = map.id; window.wpNet.broadcastBlast(sent, map.id); }
      if (window.wpSoundOn) window.wpSoundOn.fire({ k: 'blast' }, { map: map.id });   // 1.6.2
      var n = blastDistances(b, map).filter(function(r) { return shapeHolds(b, r); }).length, said = 'Explosion, ' + q.type + '. ' + n + ' token' + (n === 1 ? '' : 's') + ' in range.';
      if (!rolled) { toast(said + (auto === 'measure' ? ' Nothing was rolled. This system\u2019s blasts only measure.' : ' Nothing was rolled. Dice are off.')); return true; }
      if (auto !== 'full') { toast(said); return true; }
      if (total === null) { toast(said + ' The roll gave no number, so no damage was applied.'); return true; }
      toast(said); applyBlastDamage(b, total, combat.hpResource);
      return true;
  }
  // The two boxes under Explode: shown when Explode is pressed, put away when it went off, on Cancel and on a second press. They are emptied
  // every time they are shown or put away, so what was typed for one explosion is never there for the next
  var _el_exBtn = document.getElementById('blastExplodeBtn'), _el_exForm = document.getElementById('blastExplodeForm'), _el_exDmg = document.getElementById('blastDmg'), _el_exType = document.getElementById('blastDmgType');
  var _el_exHitRow = document.getElementById('blastHitCentreRow'), _el_exHit = document.getElementById('blastHitCentre'), _exHitFor = null;   // the tick, and the circle it is being asked for
  // The tick under the two boxes: Also hits the token at the center. It shows only while the boxes are up and the circle that would go off
  // sits on a token. It is unticked whenever the circle it is asked for changes, so a yes for one circle is never there for another
  function explodeHitRow() {
      if (!_el_exHitRow) return;
      var c = _el_exForm && _el_exForm.style.display !== 'none' && !playerScreen() ? lastEdit() : null;
      if (!c || typeof c.tok !== 'string' || shapeOf(c.as) !== 'circle') c = null;
      if (c !== _exHitFor) { _exHitFor = c; if (_el_exHit) _el_exHit.checked = false; }
      _el_exHitRow.style.display = c ? '' : 'none';
  }
  function explodeForm(show) {
      if (_el_exDmg) _el_exDmg.value = ''; if (_el_exType) _el_exType.value = '';
      if (_el_exForm) _el_exForm.style.display = show ? '' : 'none';
      explodeHitRow();   // put away, the tick is asked for no circle, so it is unticked; it comes up again off, whatever it held
      if (show && _el_exDmg && _el_exDmg.focus) _el_exDmg.focus();
  }
  function explodeGo() {   // refused: the boxes stay as typed, to be put right
      var hitFor = _el_exHit && _el_exHit.checked === true && _el_exHitRow && _el_exHitRow.style.display !== 'none' ? _exHitFor : null;
      if (explodeCircle(_el_exDmg ? _el_exDmg.value : '', _el_exType ? _el_exType.value : '', hitFor)) explodeForm(false);
  }
  if (_el_exBtn) _el_exBtn.addEventListener('click', function() {
      if (_el_exForm && _el_exForm.style.display !== 'none') { explodeForm(false); return; }
      var w = explodeWhere(); if (w.why) { toast(w.why); return; }   // nothing to set off: said before anything is asked
      explodeForm(true);
  });
  var _el_exGo = document.getElementById('blastExplodeGo'), _el_exNo = document.getElementById('blastExplodeNo');
  if (_el_exGo) _el_exGo.addEventListener('click', explodeGo);
  if (_el_exNo) _el_exNo.addEventListener('click', function() { explodeForm(false); });
  if (_el_exDmg) _el_exDmg.addEventListener('keydown', function(e) {   // Enter in the damage box goes on to the type: an explosion is never set off from the first box
      if (e.key === 'Enter') { e.preventDefault(); if (_el_exType && _el_exType.focus) _el_exType.focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); explodeForm(false); }
  });
  if (_el_exType) _el_exType.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); explodeGo(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); explodeForm(false); }
  });
  // [systemcheck:explode-end]
  // A sheet Throw button arms a one-shot blast placement (mirrors wpArmFxBurst); the next map click throws it.
  window.wpArmBlast = function(ft, name, ctx) {
      ft = Math.max(1, Math.min(3000, Math.round(ft || 0))); if (!(ft > 0)) return;
      _armedThrow = { charId: ctx && ctx.charId, fieldId: ctx && ctx.fieldId, rowId: ctx && ctx.rowId, ft: ft, name: name || '', by: (ctx && ctx.by) || '', damage: (ctx && ctx.damage) || '', gmOnly: !!(ctx && ctx.gmOnly) };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the map to throw' + (name ? ' the ' + name : '') + '. Esc cancels.');
  };
  // A client's received shared blast (from the host): rendered, never re-broadcast.
  window.wpRenderSharedBlast = function(bl) {
      if (!bl || typeof bl.x !== 'number' || typeof bl.y !== 'number') return;
      var ft = typeof bl.ft === 'number' && isFinite(bl.ft) && bl.ft > 0 ? Math.max(1, Math.min(3000, bl.ft)) : 12;   // the host's number as it is, within a blast's bounds: an explosion set off from a circle is not always a whole number of feet, and a rounded one would hold other tokens than the host's
      var nb = { x: bl.x, y: bl.y, ft: ft, name: typeof bl.name === 'string' ? bl.name.slice(0, 60) : '', elev: typeof bl.elev === 'number' ? bl.elev : 0, autoElev: false, thrown: true, by: typeof bl.by === 'string' ? bl.by.slice(0, 60) : '', shared: true };
      // 128 (e): an exploded ring or cone is shown as that shape. Its numbers are the host's, each checked here: a ring's inner distance inside
      // its radius, a cone's angle a whole number of degrees from 1 to 360 and its aim a finite number. Anything else is a plain circle
      if (bl.shape === 'ring' && typeof bl.inFt === 'number' && isFinite(bl.inFt) && bl.inFt > 0 && bl.inFt < ft) { nb.shape = 'ring'; nb.inFt = bl.inFt; }
      else if (bl.shape === 'cone' && typeof bl.deg === 'number' && typeof bl.dir === 'number' && isFinite(bl.dir) && Math.round(bl.deg) >= 1 && Math.round(bl.deg) <= 360) { nb.shape = 'cone'; nb.deg = Math.round(bl.deg); nb.dir = Math.atan2(Math.sin(bl.dir), Math.cos(bl.dir)); }
      pushBlast(nb);
      renderMeasures();
  };
  window.wpClearSharedBlasts = function() { var had = blasts.some(function(b) { return b.shared; }); blastsSet(blasts.filter(function(b) { return !b.shared; })); if (had) renderMeasures(); };
  // Visual effects (1.5.0): the ✨ panel arms a burst, a click on the map places it (its own Measure sub-mode)
  var _fxArm = null;
  window.wpArmFxBurst = function(look, rPx) { _fxArm = { look: look, r: Math.max(20, Math.min(6000, Math.round(rPx || 160))) }; window.isMeasureMode = true; window.wpMeasureKind = 'fx'; toast(look === 'ping' ? 'Click the map to ping that spot.' : 'Click the map to place the ' + look + ' burst.'); };
  window.wpFxArmed = function() { return _fxArm && window.isMeasureMode && window.wpMeasureKind === 'fx' ? _fxArm.look : ''; };   // the look the panel armed, while the map still waits for its click
  window.wpDisarmFxBurst = function() { if (!_fxArm) return false; _fxArm = null; if (window.wpMeasureKind === 'fx') { window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; } return true; };   // the panel's second press on an armed button
  function placeFx(e) {
      var map = getActiveMap(); if (!map || !_fxArm) { window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; return; }
      var box = wbWrap.getBoundingClientRect();
      var x = wbX(e.clientX, e.clientY, box, wbWrap);
      var y = wbY(e.clientX, e.clientY, box, wbWrap);
      x = Math.max(0, Math.min(30000, x)); y = Math.max(0, Math.min(30000, y));
      var look = _fxArm.look, r = _fxArm.r; _fxArm = null; window.isMeasureMode = false; window.wpMeasureKind = 'ruler';
      if (window.wpFx) window.wpFx.placeBurst(x, y, look, r);
  }
  // The GM's ping (fold P): Alt+click on the play map pings that cell for whoever the effects panel's Ping row names
  // (everyone on the map unless it names one player). Caught on the way down, ahead of the tokens, the selection box and
  // every tool; a player's Alt+click does what it always did.
  if (wbWrap) {
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!e.altKey || e.button !== 0 || !window.wpFx || !window.wpFx.canPing()) return;
          if (window.wpMouse && typeof window.wpMouse.gesture === 'function' && window.wpMouse.gesture('ping') === 'ctrlalt' && !(e.ctrlKey || e.metaKey)) return;   // 1.6.2: the ping on Ctrl + Alt + click where the GM picked it
          var box = wbWrap.getBoundingClientRect();
          var x = wbX(e.clientX, e.clientY, box, wbWrap), y = wbY(e.clientX, e.clientY, box, wbWrap);
          if (!(x >= 0 && x <= 30000 && y >= 0 && y <= 30000)) return;
          e.preventDefault(); e.stopImmediatePropagation(); _pingAlt = true;
          window.wpFx.ping(x, y);
      }, true);
      // The Alt released after a ping is the app's: left unhandled, the desktop window would show its hidden menu bar
      var _pingAlt = false;
      document.addEventListener('keyup', function(e) { if (_pingAlt && e.key === 'Alt') { _pingAlt = false; e.preventDefault(); } }, true);
      wbWrap.addEventListener('dblclick', function(e) { if (e.altKey && window.wpFx && window.wpFx.canPing()) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);   // two quick pings never open a token's Properties
  }
  // Esc cancels an armed throw or FX burst and returns to the arrow, when nothing else was open (1.5.4: esckey.js). With nothing armed it puts
  // the tool in hand away, back to Select (the owner, 2026-10-17, by prompt: "Close the options first (Recommended)": the first Escape closes
  // a tool's options and the tool stays in hand, and the next puts the tool away). Never from a field, whose key it is; Build is Build's own
  // (buildKey, which drops a polygon under way first), and a placement is the placement's (disarmPlacement)
  var ESC_TOOLS = ['drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'panModeBtn', 'envModeBtn'];
  document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape' || (window.wpEsc && !window.wpEsc.free(e))) return;
      if (_armedThrow || _fxArm) { _armedThrow = null; _fxArm = null; document.body.classList.remove('placing'); window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; var mvE = document.getElementById('moveModeBtn'); if (mvE) mvE.click(); return; }
      var tgT = e.target; if (tgT && ((tgT.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(tgT.tagName)) || tgT.isContentEditable === true)) return;
      var held = ESC_TOOLS.filter(function(id) { var b = document.getElementById(id); return !!b && !!b.classList && b.classList.contains('active'); })[0];
      if (held) { var mvT = document.getElementById('moveModeBtn'); if (mvT) mvT.click(); }
  });
  window.wpMeasure = { config: mapMeasureConfig, cellYards: cellYards, pxToYards: function(px) { var c = cellYards(), ppy = c ? mapMeasureConfig().cellPx / c : 0; return ppy ? Math.round(px / ppy * 10) / 10 : null; } };
  // Fog of war (1.5.0): a play-map mode. fog.js owns the menu and the overlay. The toolbar's button opens and closes the menu and nothing
  // else (1.5.4, the owner's pick "Paint only when asked": leaving the fog tool looked like switching fog off); the brush starts from the
  // menu's Paint fog row, which asks wpEnterFogMode. While window.isFogMode is on a click or drag paints reveal/hide cells, datamap.js
  // suppresses token drag/pan/selection, and right-click paints the opposite of the brush in hand.
  // [fogcheck:fogtool-start]
  var _el_fogModeBtn = document.getElementById('fogModeBtn');
  if (_el_fogModeBtn) _el_fogModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var fm = document.getElementById('fogMenu'); if (!window.wpFog) return;
      if (fm && fm.classList.contains('show')) window.wpFog.closeMenu(); else { closeDrawMenu(); window.wpFog.openMenu(); }
  });
  window.wpEnterFogMode = function() {   // a brush of the fog menu was pressed: the fog tool in hand
      if (window.isFogMode) return;
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('fogModeBtn');
      closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  };
  // [fogcheck:fogtool-end]
  // fog.js calls this when the fog tool is put down: the lit brush pressed again, the map's fog or the feature switched off
  window.wpExitFogMode = function() {
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
      if (wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
  };
  if (wbWrap) {
      var _fogPaintBtn = -1;
      var _fogBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: wbX(e.clientX, e.clientY, box, wbWrap), y: wbY(e.clientX, e.clientY, box, wbWrap) }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFogMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fogBoard(e);
          if (e.button === 0 && window.wpFog && window.wpFog.toggleDoorAt && window.wpFog.toggleDoorAt(pt.x, pt.y)) { _fogPaintBtn = -1; e.preventDefault(); return; }   // clicked a door -> toggled it, do not paint
          _fogPaintBtn = e.button;
          hostGestureStart();   // fold M6: a stroke is open until the pointer comes up
          if (window.wpFog) window.wpFog.strokeStart(pt.x, pt.y, e.button === 2);   // 1.5.4: a stroke of the brush in hand (cells, a box, a whole piece)
          e.preventDefault();
      });
      wbWrap.addEventListener('pointermove', function(e) {
          if (!window.isFogMode || _fogPaintBtn < 0) return;
          var pt = _fogBoard(e); if (window.wpFog) window.wpFog.strokeMove(pt.x, pt.y, _fogPaintBtn === 2);
      });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFogMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { if (_fogPaintBtn >= 0) { hostGestureEnd(); if (window.wpFog && window.wpFog.strokeEnd) window.wpFog.strokeEnd(); } _fogPaintBtn = -1; });   // fold M6: the stroke is over (a dragged box is painted now)
      document.addEventListener('pointercancel', function() { if (_fogPaintBtn >= 0) { hostGestureEnd(); if (window.wpFog && window.wpFog.strokeEnd) window.wpFog.strokeEnd(true); } _fogPaintBtn = -1; });   // taken away by the system: a box half dragged paints nothing
  }
  // 1.6.0, the map environment's tool (docs/MAP_ENVIRONMENT_PLAN.md 11 and 14; envtool.js): the GM's, on the machine that owns the campaign.
  // A press, a drag and the release hand the board's points to the tool, as the fog brush's are; datamap.js keeps the board's own drag away
  wireTool({ id: 'envModeBtn', chev: 'envOptBtn', inHand: function() { return !!window.isEnvMode; }, sync: function() { if (window.wpEnvTool) window.wpEnvTool.sync(); }, take: function() {
      if (!window.wpEnvTool || !window.wpEnvTool.may()) return;
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false; window.isFogMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('envModeBtn'); closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });
  if (wbWrap) {
      var _envBtn = -1, _envBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: wbX(e.clientX, e.clientY, box, wbWrap), y: wbY(e.clientX, e.clientY, box, wbWrap) }; };
      wbWrap.addEventListener('pointerdown', function(e) { if (!window.isEnvMode || e.button !== 0 || !window.wpEnvTool) return; var pt = _envBoard(e); _envBtn = 0; window.wpEnvTool.strokeStart(pt.x, pt.y); e.preventDefault(); });
      wbWrap.addEventListener('pointermove', function(e) { if (!window.isEnvMode || _envBtn < 0 || !window.wpEnvTool) return; var pt = _envBoard(e); window.wpEnvTool.strokeMove(pt.x, pt.y); });
      document.addEventListener('pointerup', function() { if (_envBtn >= 0 && window.wpEnvTool) window.wpEnvTool.strokeEnd(); _envBtn = -1; });
      document.addEventListener('pointercancel', function() { if (_envBtn >= 0 && window.wpEnvTool) window.wpEnvTool.strokeEnd(true); _envBtn = -1; });
  }
  // Fill bucket (1.5.0, GM): click or drag grid cells to drop a cell-sized colored shape (hexagon on hex maps,
  // square on square maps) seated in the cell at layer 'back' (below tokens); right-click a cell clears its fill.
  var _el_fillModeBtn = document.getElementById('fillModeBtn'), _el_fillMenu = document.getElementById('fillMenu');
  try { var _fc0 = localStorage.getItem('wp_fillColor'); if (_fc0 && /^#[0-9a-f]{6}$/i.test(_fc0)) state.fillColor = _fc0; } catch (e) {}
  try { state.fillTerrain = Number(localStorage.getItem('wp_fillTerrain')) || 0; } catch (e) { state.fillTerrain = 0; }   // difficult terrain T1: the fill menu's cost (cleaned where it is used), or 0
  var _fci0 = document.getElementById('fillColorInput'); if (_fci0 && /^#[0-9a-f]{6}$/i.test(state.fillColor || '')) _fci0.value = state.fillColor;
  // [fogcheck:fillmenu-start]
  // 1.6.2 (backlog 57; the owner, 2026-11-11, by prompt: "Both"): where the system names kinds of terrain the menu lists them by name beside the
  // cost, and what the menu last had is each campaign's own on this computer (wp_fillTerrainBy: { campaign id: { c: the cost, or 0 while
  // unticked; k: the kind } }, the newest 40, read back as data). A campaign with none yet starts from what this computer last had
  // (wp_fillTerrain), with no kind. A kind is painted at the cost the system gives it now
  var _fillCamp = null, _fillFresh = false;
  function fillCampNow() { try { var c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null; return c && typeof c.id === 'string' && c.id ? c : null; } catch (e) { return null; } }
  function fillKinds() { var S = window.wpSystemCore, c = fillCampNow(); return S && S.terrainKinds && c ? S.terrainKinds(c.system) : []; }
  function fillKindNow() { var k = typeof state.fillTerrainKind === 'string' ? state.fillTerrainKind.toLowerCase() : ''; return k ? fillKinds().filter(function(x) { return x.key.toLowerCase() === k; })[0] || null : null; }
  function fillTerrainBy() {
      var o = Object.create(null), FC = window.wpFogCore, raw = null;
      try { raw = JSON.parse(localStorage.getItem('wp_fillTerrainBy') || 'null'); } catch (e) { raw = null; }
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
      Object.keys(raw).slice(-40).forEach(function(id) { var q = raw[id]; if (!q || typeof q !== 'object' || Array.isArray(q) || id.length > 80) return; o[id] = { c: (FC && FC.cleanTerrain ? FC.cleanTerrain(q.c) : null) || 0, k: (FC && FC.cleanTerrainKind ? FC.cleanTerrainKind(q.k) : null) || '' }; });
      return o;
  }
  function fillTerrainKeep() {
      var c = fillCampNow(); if (!c) return;
      var by = fillTerrainBy(), keep = Object.create(null); delete by[c.id];
      Object.keys(by).slice(-39).forEach(function(id) { keep[id] = by[id]; });
      keep[c.id] = { c: Number(state.fillTerrain) || 0, k: typeof state.fillTerrainKind === 'string' ? state.fillTerrainKind : '' };
      _fillFresh = false;
      try { localStorage.setItem('wp_fillTerrainBy', JSON.stringify(keep)); } catch (e) {}
  }
  // The menu's terrain as the campaign on screen last had it (read once a campaign), a kind at the cost it has now. own, only as true: the
  // campaign's menu is in use (its options are up, or a cell is being painted), and a campaign with nothing kept then keeps what it started
  // from as its own, so that a change made in another campaign later does not move it
  function fillTerrainNow(own) {
      var c = fillCampNow();
      if (c && c.id !== _fillCamp) { _fillCamp = c.id; var by = fillTerrainBy(), q = Object.prototype.hasOwnProperty.call(by, c.id) ? by[c.id] : null; if (q) { state.fillTerrain = q.c; state.fillTerrainKind = q.k; _fillFresh = false; } else { state.fillTerrainKind = ''; _fillFresh = true; } }
      var kd = fillKindNow();
      if (kd) { if (state.fillTerrain) state.fillTerrain = kd.cost; } else if (state.fillTerrainKind && c) state.fillTerrainKind = '';
      if (own === true && _fillFresh && c) fillTerrainKeep();
  }
  function fillKindList(sel, kinds, kd, on) {   // the kinds as option elements with text, made again only when they changed
      var sig = kinds.map(function(k) { return k.key + '\u0001' + k.label + '\u0001' + k.cost; }).join('\u0002');
      if (sel._wpSig !== sig) {
          sel._wpSig = sig; while (sel.firstChild) sel.removeChild(sel.firstChild);
          kinds.forEach(function(k) { var o = document.createElement('option'); o.value = k.key; o.textContent = k.label + ' \u00d7' + k.cost; sel.appendChild(o); });
          var oc = document.createElement('option'); oc.value = ''; oc.textContent = 'Another cost'; sel.appendChild(oc);
      }
      sel.hidden = !kinds.length; sel.value = kd ? kd.key : ''; sel.disabled = !on;
  }
  function syncFillMenu() {
      document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) { sw.classList.toggle('active', sw.dataset.color.toLowerCase() === (state.fillColor || '').toLowerCase()); });
      var cs = document.querySelector('#fillColorRow .draw-swatch.custom'); if (cs) { var preset = document.querySelector('#fillColorRow .draw-swatch[data-color].active'); cs.classList.toggle('active', !preset); cs.style.background = preset ? '' : state.fillColor; }
      var _fi = document.getElementById('fillColorIndicator'); if (_fi) _fi.style.background = state.fillColor;
      var _fmN = document.getElementById('fillMenu'); fillTerrainNow(!!(_fmN && _fmN.classList && _fmN.classList.contains('show')));
      var _ftx = document.getElementById('fillTexture'); if (_ftx && _ftx.dataset && typeof texPackSig === 'function' && typeof fillTexSync === 'function' && _ftx.dataset.pk !== texPackSig()) fillTexSync();   // fold 4 of backlog 222: a pack made or changed since shows its rows
      var _ftc = document.getElementById('fillTerrainChk'), _ftn = document.getElementById('fillTerrainCost'), _fsel = document.getElementById('fillTerrainKind');   // difficult terrain T1
      var _FCs = window.wpFogCore, _ftv = _FCs && _FCs.cleanTerrain ? _FCs.cleanTerrain(state.fillTerrain) : null, _kd = fillKindNow();
      if (_ftc) _ftc.checked = !!_ftv;
      if (_fsel) fillKindList(_fsel, fillKinds(), _kd, !!_ftv);
      var _fkr = document.getElementById('fillTerrainKindRow'); if (_fkr) _fkr.hidden = !_fsel || !!_fsel.hidden;   // the list has a row of its own, put away where the system names no kind
      if (_ftn) { if (document.activeElement !== _ftn) { if (_kd) _ftn.value = _kd.cost; else if (_ftv) _ftn.value = _ftv; } _ftn.disabled = !_ftv || !!_kd; }   // never over a cost being typed: a redraw may ask this while the box has the focus
  }
  function fillTerrainSet() {   // difficult terrain T1: the fill menu's tick, its kind and its cost, kept on this machine (the cost, or 0 while unticked)
      var chk = document.getElementById('fillTerrainChk'), box = document.getElementById('fillTerrainCost'), sel = document.getElementById('fillTerrainKind'), FC = window.wpFogCore;
      var kd = sel && !sel.hidden && sel.value ? fillKinds().filter(function(k) { return k.key === sel.value; })[0] || null : null;
      var n = kd ? kd.cost : (box && FC && FC.cleanTerrain ? FC.cleanTerrain(Number(box.value)) : null) || 2;
      if (box) box.value = n;
      state.fillTerrain = chk && chk.checked ? n : 0; state.fillTerrainKind = kd ? kd.key : '';
      try { localStorage.setItem('wp_fillTerrain', String(state.fillTerrain)); } catch (e) {}
      fillTerrainKeep();
      syncFillMenu();
  }
  ['fillTerrainChk', 'fillTerrainCost', 'fillTerrainKind'].forEach(function(id) { var e0 = document.getElementById(id); if (e0) e0.addEventListener('change', fillTerrainSet); });
  // Options stay up at a press elsewhere, so the board's redraw asks this: with the Fill options up the menu is read again, since another campaign
  // may be on screen or the System editor's Save may have changed the kinds under it (the review of 2026-11-11: it showed one terrain and painted another)
  function fillMenuFollow() { var m = document.getElementById('fillMenu'); if (m && m.classList && m.classList.contains('show')) syncFillMenu(); }
  if (typeof window !== 'undefined' && window) window.wpFillMenuSync = fillMenuFollow;
  // [fogcheck:fillmenu-end]
  // [sinkcheck:texopts-start]
  // The map builder (fold B1): a Texture list's rows are the app's own names, as option values and text nodes, with Plain color for none.
  // Fold B3 (the owner, 2026-10-10: "The Texture list", "A Tile size list"): its last row is A picture, which opens the Image Library, and a
  // picture in use stands in the list under its file's own name. The two rows' values are fixed words that no texture is named by
  var TEX_PIC = '@pic', TEX_PICK = '@pick';
  var TILE_ROWS = [[1, '1 cell'], [2, '2 cells'], [4, '4 cells'], ['whole', 'Whole piece']];
  // One repeat is 50 px a cell on every map, a square cell's width: on a hex map that is a little less than a cell. A painted cell and a
  // hexagon Build lays are each a piece, so Whole piece shows the picture once in each
  var TILE_LINES = { '1': 'The picture repeats. One tile is as wide as one square cell.', '2': 'The picture repeats. One tile is as wide as two square cells.', '4': 'The picture repeats. One tile is as wide as four square cells.', 'whole': 'The picture is stretched over each piece once. A painted cell or a laid hexagon is a piece of its own.' };
  function texPicOf(v) { var FC = window.wpFogCore; return (FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(v) : null) || ''; }
  // A repeat as a chip, a list or this computer's store names it (a text) or as a piece holds it: 1, 2, 4 or 'whole', and 1 for anything else
  function texTileOf(v) { var FC = window.wpFogCore, n = typeof v === 'string' && /^[124]$/.test(v) ? Number(v) : v; return (FC && typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(n) : null) || 1; }
  // Fold 4 of backlog 222 (the owner, by prompt: "Looks list + Texture lists"): the campaign's furnishing packs that hold patterns or blocks, each a
  // group of rows by its own name. A row's value is '@pk:', the pack's id and the key (furncore texRows), which no pattern is named by
  function texPacksNow() {
      var FU = window.wpFurnCore, FC = window.wpFogCore, c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null;
      return FU && typeof FU.cleanPacks === 'function' && FC && typeof FC.cleanTexSrc === 'function' && c && c.furnPacks ? FU.cleanPacks(c.furnPacks, FC.cleanTexSrc) : [];
  }
  function texPackGroups() { var FU = window.wpFurnCore; return FU && typeof FU.texRows === 'function' ? FU.texRows(texPacksNow()) : []; }
  function texRowLabel(r) { var BC = window.wpBuildCore; return r.tex ? ((BC && typeof BC.texName === 'function' && BC.texName(r.tex)) || r.tex) : r.name; }
  function texRowOfPic(src) { var FU = window.wpFurnCore; return src && FU && typeof FU.texRowOf === 'function' ? FU.texRowOf(texPacksNow(), src) : ''; }
  // What the packs' rows are now, so a list filled before a pack was made or changed is filled again (the Fill menu stays up)
  function texPackSig() { return JSON.stringify(texPackGroups().map(function(g) { return [g.id, g.name, g.rows.map(function(r) { return [r.v, r.src, r.t, r.name || '']; })]; })); }
  function texOptionsInto(sel, cur, pic) {
      var BC = window.wpBuildCore; if (!sel || !BC || !Array.isArray(BC.TEXTURES)) return;
      while (sel.firstChild) sel.removeChild(sel.firstChild);
      if (sel.dataset) sel.dataset.pk = texPackSig();
      var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Plain color'; sel.appendChild(o0);
      BC.TEXTURES.forEach(function(n) { var o = document.createElement('option'); o.value = n; o.textContent = typeof BC.texName === 'function' ? BC.texName(n) : n.charAt(0).toUpperCase() + n.slice(1); sel.appendChild(o); });
      var can = typeof BC.picName === 'function' && !!(window.wpFogCore && typeof window.wpFogCore.cleanTexSrc === 'function'), src = can ? texPicOf(pic) : '';
      texPackGroups().forEach(function(g) {   // fold 4: each pack's patterns and blocks, the group named for the pack
          var og = document.createElement('optgroup'); og.label = g.name;
          g.rows.forEach(function(r) { var o = document.createElement('option'); o.value = r.v; o.textContent = texRowLabel(r); og.appendChild(o); });
          sel.appendChild(og);
      });
      var rowV = src ? texRowOfPic(src) : '';   // a pack's picture in use stands as its own row, by its name
      if (src && !rowV) { var op = document.createElement('option'); op.value = TEX_PIC; op.textContent = BC.picName(src); sel.appendChild(op); }
      if (can) { var ok = document.createElement('option'); ok.value = TEX_PICK; ok.textContent = 'A picture\u2026'; sel.appendChild(ok); }
      sel.value = rowV || (src ? TEX_PIC : (BC.cleanTexture(cur) || ''));
  }
  // A Texture list was changed. A name or Plain color is handed on. The picture's own row changes nothing. A picture puts the list back as it
  // was and opens the Image Library, whose pick is handed on only as a path cleanTexSrc keeps. The library says nothing when it is closed
  // with no pick, so nothing waits for one
  function texListPick(value, back, take) {
      if (value === TEX_PIC) { back(); return; }
      if (typeof value === 'string' && value.slice(0, 4) === '@pk:') {   // fold 4: a pack's pattern or block, its picture and how many cells it covers
          var FU = window.wpFurnCore, x = FU && typeof FU.texRowPick === 'function' ? FU.texRowPick(texPacksNow(), value) : null;
          if (x) take({ pic: x.src, tile: x.t }); else back();
          return;
      }
      if (value !== TEX_PICK) { take({ tex: value }); return; }
      back();
      if (typeof window.wpPickImage !== 'function') { if (typeof toast === 'function') toast('The image library is not available here.'); return; }
      window.wpPickImage(function(src) {
          var s = texPicOf(src);
          if (!s) { if (typeof toast === 'function') toast('That picture cannot be a fill. Its name holds two dots together, a # or a % code, or it lies in the sounds or video folder. Rename or move the file and pick it again.'); return; }
          take({ pic: s });
      });
  }
  // A Texture list's last rows act at a choice, never at a key step. A closed list changes its value at every arrow key and typed letter, and
  // here that would open the Image Library, or take a picture off, on the way past. So such a key opens the list instead, where the arrow
  // keys only move and Enter or a click chooses. Alt+Down, F4 and Space open it as they always did, and Tab and Enter are left alone
  var TEX_STEP_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
  function texListStep(e) { return !!e && !e.altKey && !e.ctrlKey && !e.metaKey && typeof e.key === 'string' && (TEX_STEP_KEYS.indexOf(e.key) >= 0 || (e.key.length === 1 && e.key !== ' ')); }
  function texListKeys(sel) {
      if (!sel || typeof sel.addEventListener !== 'function') return;
      sel.addEventListener('keydown', function(e) {
          if (!texListStep(e)) return;
          e.preventDefault();
          if (typeof this.showPicker === 'function') { try { this.showPicker(); } catch (err) {} }
      });
  }
  // The Tile size chips of a menu (buttons that each carry data-tile) and the gray line under them, shown only while a picture is the fill
  function tileRowSync(rowId, lineId, pic, tile, off) {
      var row = document.getElementById(rowId), line = document.getElementById(lineId), on = !!pic && !off, t = String(texTileOf(tile));
      if (row) { row.hidden = !on; Array.prototype.forEach.call(row.querySelectorAll('[data-tile]'), function(b) { var is = b.dataset.tile === t; b.classList.toggle('on', is); b.setAttribute('aria-pressed', is ? 'true' : 'false'); }); }
      if (line) { line.hidden = !on; line.textContent = on ? TILE_LINES[t] : ''; }
  }
  function tileRowWire(rowId, take) {
      var row = document.getElementById(rowId); if (!row) return;
      Array.prototype.forEach.call(row.querySelectorAll('[data-tile]'), function(b) { b.addEventListener('click', function(ev) { ev.stopPropagation(); take(texTileOf(this.dataset.tile)); }); });
  }
  window.wpTexList = { PIC: TEX_PIC, PICK: TEX_PICK, TILES: TILE_ROWS, pick: texListPick, keys: texListKeys, picOf: texPicOf, tileOf: texTileOf, groups: texPackGroups, label: texRowLabel, rowOf: texRowOfPic };   // Properties' Texture row asks the same rule
  // The fill menu's Texture list and its Tile size: the picks are kept on this computer and read back through the cleaners
  function fillTexSync() { texOptionsInto(document.getElementById('fillTexture'), state.fillTexture, state.fillPic); tileRowSync('fillTileRow', 'fillTileLine', state.fillPic, state.fillTile); }
  function fillTexKeep() { try { localStorage.setItem('wp_fillTexture', state.fillTexture); localStorage.setItem('wp_fillPic', state.fillPic || ''); localStorage.setItem('wp_fillTile', String(state.fillTile || 1)); } catch (e) {} }
  function fillTextureInit() {
      var sel = document.getElementById('fillTexture'), BC = window.wpBuildCore, kept = '', keptPic = '', keptTile = '';
      try { kept = localStorage.getItem('wp_fillTexture') || ''; keptPic = localStorage.getItem('wp_fillPic') || ''; keptTile = localStorage.getItem('wp_fillTile') || ''; } catch (e) {}
      state.fillTexture = (BC && BC.cleanTexture ? BC.cleanTexture(kept) : null) || '';
      state.fillPic = texPicOf(keptPic); state.fillTile = texTileOf(keptTile);
      if (!sel) return;
      fillTexSync();
      sel.addEventListener('change', function() {
          texListPick(this.value, fillTexSync, function(p) {
              var B2 = window.wpBuildCore;
              if (p.pic) { state.fillPic = p.pic; if (p.tile) state.fillTile = texTileOf(p.tile); } else { state.fillPic = ''; state.fillTexture = (B2 && B2.cleanTexture ? B2.cleanTexture(p.tex) : null) || ''; }   // fold 4: a pack's row brings its own tile
              fillTexKeep(); fillTexSync();
          });
      });
      texListKeys(sel);
      tileRowWire('fillTileRow', function(t) { state.fillTile = t; fillTexKeep(); fillTexSync(); });
  }
  // [sinkcheck:texopts-end]
  fillTextureInit();
  wireTool({ id: 'fillModeBtn', chev: 'fillOptBtn', inHand: function() { return !!window.isFillMode; }, sync: syncFillMenu, take: function() {
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false; window.isFogMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('fillModeBtn'); closeDrawMenu();
      state.selWbId = null; state.selWbIds = []; render();
  } });
  document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) {
      sw.addEventListener('click', function() { state.fillColor = this.dataset.color; var fi = document.getElementById('fillColorInput'); if (fi) fi.value = this.dataset.color; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  });
  var _fillColorInput = document.getElementById('fillColorInput');
  if (_fillColorInput) _fillColorInput.addEventListener('input', function() { state.fillColor = this.value; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  syncFillMenu();   // show the loaded fill color on the toolbar button at startup
  var _fillDirty = false;
  // Snap a board point to its grid cell (square 50px, or hex). One source of truth for fill + flood-fill.
  function cellSnap(x, y) {
      var cx, cy, w, h, type;
      var LC = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf() : null);   // the map's own cell (backlog 38)
      if (state.gridType === 'hex') { var hc = snapToHex(x, y, 30, 'center'); cx = hc.x; cy = hc.y; w = LC && LC.type === 'hex' ? 2 * LC.s : 60; h = LC && LC.type === 'hex' ? LC.h : 52; type = 'hexagon'; }
      else { var cz = LC && LC.type === 'square' ? LC.size : 50, cx0 = LC && LC.ox || 0, cy0 = LC && LC.oy || 0; cx = Math.floor((x - cx0) / cz) * cz + cz / 2 + cx0; cy = Math.floor((y - cy0) / cz) * cz + cz / 2 + cy0; w = cz; h = cz; type = 'rect'; }
      return { cx: cx, cy: cy, w: w, h: h, type: type, px: Math.round(cx - w / 2), py: Math.round(cy - h / 2) };
  }
  // [fogcheck:fillcell-start]
  // Difficult terrain T1: the fill menu's cost on a cell it paints, new or painted over (true when that changed it); 0 leaves a cell's cost as it was
  // 1.6.2 (backlog 57): where the menu holds a kind of terrain the cell names it, at the cost the kind has now; another cost names none
  function fillTerrainTo(item) {
      if (typeof fillTerrainNow === 'function') fillTerrainNow(true);
      var FC = window.wpFogCore, t = FC && FC.cleanTerrain ? FC.cleanTerrain(state.fillTerrain) : null;
      if (!t) return false;
      var kd = typeof fillKindNow === 'function' ? fillKindNow() : null, k = kd ? kd.key : null;
      if (kd) t = kd.cost;
      if (item.terrain === t && (typeof item.terrainKind === 'string' ? item.terrainKind : null) === k) return false;
      item.terrain = t; if (k) item.terrainKind = k; else delete item.terrainKind; return true;
  }
  // The map builder: the fill menu's texture on a cell it paints, new or painted over (true when that changed it). A name of the app's own
  // list, Plain color, which takes a texture off, or (fold B3) one of the campaign's own pictures with its repeat, which takes the pattern's
  // place. Whatever the menu says, the cell ends with that and nothing else: a pattern or Plain color takes a picture off
  function fillTextureTo(item) {
      var BC = window.wpBuildCore, FC = window.wpFogCore, pic = FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(state.fillPic) : null, tile = pic ? ((typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(state.fillTile) : null) || 1) : null;
      var t = pic ? null : (BC && BC.cleanTexture ? BC.cleanTexture(state.fillTexture) : null), ch = false;
      if (t ? item.texture !== t : item.texture !== undefined) { if (t) item.texture = t; else delete item.texture; ch = true; }
      if (pic ? item.texSrc !== pic : item.texSrc !== undefined) { if (pic) item.texSrc = pic; else delete item.texSrc; ch = true; }
      if (tile ? item.texTile !== tile : item.texTile !== undefined) { if (tile) item.texTile = tile; else delete item.texTile; ch = true; }
      return ch;
  }
  function fillCellAt(x, y, remove) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (remove) { if (existing) { map.whiteboard = map.whiteboard.filter(function(it) { return it !== existing; }); _fillDirty = true; render(); } return; }
      if (existing) { var ch = fillTerrainTo(existing); if (fillTextureTo(existing)) ch = true; if (existing.color !== state.fillColor) { existing.color = state.fillColor; ch = true; } if (ch) { _fillDirty = true; render(); } return; }
      var item = Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      fillTerrainTo(item); fillTextureTo(item); map.whiteboard.push(item); _fillDirty = true; render();
  }
  // Add (or recolor) one fill cell WITHOUT save/render — for batch use by the flood-fill. Returns true if it changed anything.
  function fillCellCore(map, x, y) {
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (existing) { var ch2 = fillTerrainTo(existing); if (fillTextureTo(existing)) ch2 = true; if (existing.color !== state.fillColor) { existing.color = state.fillColor; ch2 = true; } return ch2; }
      var item2 = Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      fillTerrainTo(item2); fillTextureTo(item2); map.whiteboard.push(item2);
      return true;
  }
  // [fogcheck:fillcell-end]
  // Ramer–Douglas–Peucker polyline simplification (iterative, no recursion). Keeps endpoints; drops points within eps of a chord.
  function rdpSimplify(points, eps) {
      var n = points.length;
      if (n < 3) return points.slice();
      var keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
      var stack = [[0, n - 1]], epsSq = eps * eps;
      while (stack.length) {
          var seg = stack.pop(), s = seg[0], e = seg[1];
          if (e <= s + 1) continue;
          var ax = points[s][0], ay = points[s][1], bx = points[e][0], by = points[e][1];
          var maxD = -1, idx = -1;
          for (var i = s + 1; i < e; i++) {
              var dd = distToSegSq(points[i][0], points[i][1], ax, ay, bx, by);
              if (dd > maxD) { maxD = dd; idx = i; }
          }
          if (maxD > epsSq && idx > s) { keep[idx] = 1; stack.push([s, idx]); stack.push([idx, e]); }
      }
      var out = [];
      for (var k = 0; k < n; k++) if (keep[k]) out.push(points[k]);
      return out;
  }
  // Point-in-polygon (ray cast) — used to erase a freeform fill region as a whole item.
  function pointInPoly(x, y, poly) {
      var inside = false, n = poly.length;
      for (var i = 0, j = n - 1; i < n; j = i++) {
          var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
  }
  // Moore-neighbor boundary trace (8-connected) from a component's top-left-most pixel. solid(x,y) => in-component.
  // Returns an ordered loop of pixel coords, or null. Bounded by maxSteps against a stray loop.
  function mooreTrace(solid, cw, ch, sx, sy) {
      var nb = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // clockwise from West
      var start = [sx, sy], startB = [sx - 1, sy];   // arrived from the west (empty: sx,sy is first in raster order for its component)
      var p = [sx, sy], b = [sx - 1, sy];
      var contour = [], maxSteps = cw * ch * 4 + 16, steps = 0;
      do {
          var dx = b[0] - p[0], dy = b[1] - p[1], idx = 0;
          for (var i = 0; i < 8; i++) { if (nb[i][0] === dx && nb[i][1] === dy) { idx = i; break; } }
          var found = false, j = 0, nx = 0, ny = 0;
          for (var k = 1; k <= 8; k++) { j = (idx + k) % 8; nx = p[0] + nb[j][0]; ny = p[1] + nb[j][1]; if (solid(nx, ny)) { found = true; break; } }
          if (!found) { contour.push([p[0], p[1]]); break; }   // isolated pixel
          b = [p[0] + nb[(j + 7) % 8][0], p[1] + nb[(j + 7) % 8][1]];
          p = [nx, ny];
          contour.push([p[0], p[1]]);
          steps++;
      } while ((p[0] !== start[0] || p[1] !== start[1] || b[0] !== startB[0] || b[1] !== startB[1]) && steps < maxSteps);
      return contour.length >= 3 ? contour : null;
  }
  // Trace the OUTER boundary of a flooded pixel region into a loop of pixel coords, or null.
  function traceRegionOutline(vis, cw, ch) {
      var sx = -1, sy = -1;
      for (var yy = 0; yy < ch && sy < 0; yy++) { for (var xx = 0; xx < cw; xx++) { if (vis[yy * cw + xx] === 1) { sx = xx; sy = yy; break; } } }
      if (sx < 0) return null;
      return mooreTrace(function(x, y) { return x >= 0 && y >= 0 && x < cw && y < ch && vis[y * cw + x] === 1; }, cw, ch, sx, sy);
  }
  /* Enclosed HOLES in the flooded region: pixels that are neither wall, nor flooded (visited), nor reachable
     from the raster border ("outside"). Returns one boundary loop per hole component (an interior island such
     as a pillar), so the freeform fill can punch them out and match the grid-on cell behavior. Capped. */
  function traceHoles(vis, isWall, cw, ch) {
      var N = cw * ch, outside = new Uint8Array(N), st = new Int32Array(N), sp = 0;
      var pushOut = function(i) { if (!outside[i] && !isWall(i)) { outside[i] = 1; st[sp++] = i; } };
      for (var x = 0; x < cw; x++) { pushOut(x); pushOut((ch - 1) * cw + x); }
      for (var y = 0; y < ch; y++) { pushOut(y * cw); pushOut(y * cw + cw - 1); }
      while (sp > 0) {
          var oi = st[--sp], ox2 = oi % cw, oy2 = (oi - ox2) / cw;
          if (ox2 > 0) pushOut(oi - 1);
          if (ox2 < cw - 1) pushOut(oi + 1);
          if (oy2 > 0) pushOut(oi - cw);
          if (oy2 < ch - 1) pushOut(oi + cw);
      }
      var mask = new Uint8Array(N), any = false;
      for (var i2 = 0; i2 < N; i2++) { if (!isWall(i2) && vis[i2] !== 1 && !outside[i2]) { mask[i2] = 1; any = true; } }
      if (!any) return [];
      var solid = function(hx, hy) { return hx >= 0 && hy >= 0 && hx < cw && hy < ch && mask[hy * cw + hx] === 1; };
      var loops = [], st2 = new Int32Array(N);
      for (var seed = 0; seed < N && loops.length < 200; seed++) {
          if (mask[seed] !== 1) continue;
          var ssx = seed % cw, ssy = (seed - ssx) / cw;
          var loop = mooreTrace(solid, cw, ch, ssx, ssy);
          if (loop && loop.length >= 3) loops.push(loop);
          var q = 0; st2[q++] = seed; mask[seed] = 2;   // consume this component (4-connected) so it isn't re-traced
          while (q > 0) {
              var k = st2[--q], kx = k % cw, ky = (k - kx) / cw;
              if (kx > 0 && mask[k - 1] === 1) { mask[k - 1] = 2; st2[q++] = k - 1; }
              if (kx < cw - 1 && mask[k + 1] === 1) { mask[k + 1] = 2; st2[q++] = k + 1; }
              if (ky > 0 && mask[k - cw] === 1) { mask[k - cw] = 2; st2[q++] = k - cw; }
              if (ky < ch - 1 && mask[k + cw] === 1) { mask[k + cw] = 2; st2[q++] = k + cw; }
          }
      }
      return loops;
  }
  /* Flood-fill inside drawn lines: rasterize this map's pen strokes into an offscreen canvas as walls,
     flood outward from the click, and — if the flood is fully enclosed (never touches the padded edge) —
     GRID ON: paint every grid cell whose center lands in the flooded region (grid-aligned);
     GRID OFF: trace the flooded outline into one smooth freeform filled region (a tip:'fill' path).
     Grid-aware per the owner's choice; capped both ways. */
  function floodFillWithin(x, y) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var walls = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      map.whiteboard.forEach(function(it) {
          if (!it || it.type !== 'path' || !it.pts || !it.pts.length) return;
          var sx = it.w / (it.baseW || it.w || 1), sy = it.h / (it.baseH || it.h || 1);
          var sw = Math.max(2, (it.strokeWidth || 3));
          var abs = it.pts.map(function(p) { return [it.x + p[0] * sx, it.y + p[1] * sy]; });
          abs.forEach(function(p) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
          walls.push({ abs: abs, sw: sw });
      });
      if (!walls.length) { toast('Draw some lines first. Flood-fill needs an outline to fill inside.'); return; }
      var PAD = 30;
      minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
      if (x < minX || x > maxX || y < minY || y > maxY) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wpx = Math.max(1, maxX - minX), hpx = Math.max(1, maxY - minY);
      var S = Math.min(1, Math.sqrt(1500000 / (wpx * hpx)));   // cap the raster at ~1.5M px
      var cw = Math.max(2, Math.round(wpx * S)), ch = Math.max(2, Math.round(hpx * S));
      var cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = ch;
      var g = cvs.getContext('2d', { willReadFrequently: true }); if (!g) { toast('Flood-fill isn\'t available here.'); return; }
      g.setTransform(S, 0, 0, S, -minX * S, -minY * S);
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineJoin = 'round'; g.lineCap = 'round';
      var minWall = 1.6 / S;   // keep walls at least ~1.6 device px thick so a downscaled raster can't leak through thin seams
      walls.forEach(function(wl) {
          var lw = Math.max(wl.sw, minWall);
          g.lineWidth = lw; g.beginPath();
          wl.abs.forEach(function(p, i) { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
          if (wl.abs.length === 1) { g.arc(wl.abs[0][0], wl.abs[0][1], lw / 2, 0, 6.2832); g.fill(); }
          else g.stroke();
      });
      var img;
      try { img = g.getImageData(0, 0, cw, ch).data; } catch (e) { toast('Couldn\'t read the drawing to flood-fill.'); return; }
      var sxp = Math.round((x - minX) * S), syp = Math.round((y - minY) * S);
      if (sxp < 0 || sxp >= cw || syp < 0 || syp >= ch) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wall = function(i) { return img[i * 4 + 3] > 40; };   // any drawn (alpha) pixel is a wall
      var start = syp * cw + sxp;
      if (wall(start)) { toast('Click in an open space, not on a line.'); return; }
      var visited = new Uint8Array(cw * ch), stack = new Int32Array(cw * ch), sp = 0;
      stack[sp++] = start; visited[start] = 1;
      var touchedEdge = false;
      while (sp > 0) {
          var idx = stack[--sp], cxp = idx % cw, cyp = (idx - cxp) / cw;
          if (cxp === 0 || cyp === 0 || cxp === cw - 1 || cyp === ch - 1) touchedEdge = true;
          var l = idx - 1, r = idx + 1, u = idx - cw, d = idx + cw;
          if (cxp > 0 && !visited[l] && !wall(l)) { visited[l] = 1; stack[sp++] = l; }
          if (cxp < cw - 1 && !visited[r] && !wall(r)) { visited[r] = 1; stack[sp++] = r; }
          if (cyp > 0 && !visited[u] && !wall(u)) { visited[u] = 1; stack[sp++] = u; }
          if (cyp < ch - 1 && !visited[d] && !wall(d)) { visited[d] = 1; stack[sp++] = d; }
      }
      if (touchedEdge) { toast('That space isn\'t fully enclosed by your lines. Close the gaps and try again.'); return; }
      if (state.gridType === 'hex' || state.gridType === 'square') {
          // GRID ON — fill whole cells whose center lands in the flooded region (stays aligned with tokens + measurement).
          // Sample the bbox finer than any cell so none is skipped.
          var step = 20, seen = {}, added = 0, CAP = 20000;
          for (var yy = minY; yy <= maxY + step && added < CAP; yy += step) {
              for (var xx = minX; xx <= maxX + step && added < CAP; xx += step) {
                  var c = cellSnap(xx, yy), key = c.px + ',' + c.py;
                  if (seen[key]) continue; seen[key] = 1;
                  var pxc = Math.round((c.cx - minX) * S), pyc = Math.round((c.cy - minY) * S);
                  if (pxc < 0 || pxc >= cw || pyc < 0 || pyc >= ch) continue;
                  if (!visited[pyc * cw + pxc]) continue;   // this cell's center isn't inside the flooded area
                  if (fillCellCore(map, c.cx, c.cy)) added++;
              }
          }
          if (added) { save(); render(); toast('Filled ' + added + ' cell' + (added === 1 ? '' : 's') + ' inside your lines.'); }
          else { toast('Nothing new to fill there.'); }
          return;
      }
      // GRID OFF — fill the enclosed area as one smooth freeform region: trace the flooded outline into a filled shape.
      var loopPx = traceRegionOutline(visited, cw, ch);
      if (!loopPx || loopPx.length < 3) { toast('Couldn\'t trace that area. Try a cleaner outline.'); return; }
      var toBoard = function(p) { return [minX + (p[0] + 0.5) / S, minY + (p[1] + 0.5) / S]; };   // pixel center → board coords
      var loopBd = loopPx.map(toBoard);
      // Simplify tolerance in board px — but never coarser than ~1/3 the region's own thickness, so a thin channel survives.
      var lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
      loopBd.forEach(function(p) { if (p[0] < lx0) lx0 = p[0]; if (p[0] > lx1) lx1 = p[0]; if (p[1] < ly0) ly0 = p[1]; if (p[1] > ly1) ly1 = p[1]; });
      var thin = Math.min(lx1 - lx0, ly1 - ly0);
      var eps = Math.max(2.5, 1.5 / S);
      if (thin < eps * 3) eps = Math.max(0.4, thin / 3);
      var simp = rdpSimplify(loopBd, eps), epsN = eps;
      while (simp.length > 6000 && epsN < 1e5) { epsN *= 2; simp = rdpSimplify(loopBd, epsN); }   // actually enforce the vertex ceiling
      if (simp.length < 3) { toast('Couldn\'t trace that area. Try a cleaner outline.'); return; }
      var ox = Infinity, oy = Infinity, mx = -Infinity, my = -Infinity;
      simp.forEach(function(p) { if (p[0] < ox) ox = p[0]; if (p[0] > mx) mx = p[0]; if (p[1] < oy) oy = p[1]; if (p[1] > my) my = p[1]; });
      var rw = Math.max(10, mx - ox), rh = Math.max(10, my - oy);
      var toLocal = function(p) { return [+(p[0] - ox).toFixed(2), +(p[1] - oy).toFixed(2)]; };
      var local = simp.map(toLocal);
      // Punch interior islands (e.g. a pillar drawn inside the room) out of the fill, matching the grid-on cell behavior.
      // Keep ONLY holes that lie inside THIS region's outer contour — other enclosed drawings elsewhere on the map are not ours.
      var holes = [];
      traceHoles(visited, wall, cw, ch).forEach(function(hl) {
          var hb = hl.map(toBoard);
          if (!pointInPoly(hb[0][0], hb[0][1], loopBd)) return;
          var hs = rdpSimplify(hb, epsN);
          if (hs.length >= 3) holes.push(hs.map(toLocal));
      });
      var region = Object.assign({ id: 'wb' + uid(), type: 'path', tip: 'fill', x: ox, y: oy, w: rw, h: rh, baseW: rw, baseH: rh,
          z: 10, pts: local, color: state.fillColor, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      if (holes.length) region.holes = holes;
      fillTextureTo(region);   // the fill menu's texture on the freeform area too
      map.whiteboard.push(region);
      save(); render();
      toast('Filled the area inside your lines.');
  }
  if (wbWrap) {
      var _fillPaintBtn = -1;
      var _fillBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: wbX(e.clientX, e.clientY, box, wbWrap), y: wbY(e.clientX, e.clientY, box, wbWrap) }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFillMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fillBoard(e); e.preventDefault();
          var flood = document.getElementById('fillFloodChk');
          if (e.button === 0 && flood && flood.checked) { floodFillWithin(pt.x, pt.y); return; }   // flood is a single-click action (no paint-drag); right-click still erases one cell
          _fillPaintBtn = e.button; fillCellAt(pt.x, pt.y, e.button === 2);
      });
      wbWrap.addEventListener('pointermove', function(e) { if (!window.isFillMode || _fillPaintBtn < 0) return; var pt = _fillBoard(e); fillCellAt(pt.x, pt.y, _fillPaintBtn === 2); });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFillMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { if (_fillPaintBtn >= 0 && _fillDirty) { save(); _fillDirty = false; } _fillPaintBtn = -1; });
  }
  // [systemcheck:radiusopts-start]
  var _el_blastModeBtn = document.getElementById('blastModeBtn');
  var _el_blastMenu = document.getElementById('blastMenu');
  function closeBlastMenu() { if (_el_blastMenu) _el_blastMenu.classList.remove('show'); }
  function lastBlast() { for (var i = blasts.length - 1; i >= 0; i--) if (!blasts[i].lost) return blasts[i]; return null; }   // the last shape or blast on screen: never a circle whose token is off this screen's copy of the map
  // ... and the one the height box reaches: never a shape of the tool's own while a pick waits for its click, since the options show the pick then
  function lastTall() { var b = lastBlast(); return b && circleKeptPicked && ownCircle(b) ? null : b; }
  function syncBlastMenu() {
      if (!_el_blastMenu) return;
      var b = lastTall(), now = circleNow(), ru = rulerUnitNow(); _circleUnitShown = ru;
      var ftIn = document.getElementById('blastFt'); if (ftIn && document.activeElement !== ftIn) ftIn.value = circleTyped(now.yd, now.as, ru);
      var inIn = document.getElementById('blastInner'); if (inIn && document.activeElement !== inIn) inIn.value = circleTyped(now.inn, 'r', ru);
      var dgIn = document.getElementById('blastAngle'); if (dgIn && document.activeElement !== dgIn) dgIn.value = now.deg;
      var unEl = document.getElementById('blastUnit'); if (unEl) unEl.textContent = ru;
      var inW = document.getElementById('blastInnerWrap'); if (inW) inW.style.display = now.as === 'ring' ? '' : 'none';   // a ring's inner distance and a cone's angle show with their own shape only
      var dgW = document.getElementById('blastAngleWrap'); if (dgW) dgW.style.display = now.as === 'cone' ? '' : 'none';
      var shNow = now.tok === true ? 'tok' : shapeOf(now.as);
      document.querySelectorAll('#blastShapeRow .draw-style-btn').forEach(function(x) { x.classList.toggle('active', x.dataset.shape === shNow); });
      var shN = document.getElementById('blastShapeNote'); if (shN) shN.textContent = shapeNote(now.as, now.tok);
      var asRow = document.getElementById('blastAsRow'); if (asRow) asRow.style.display = shNow === 'circle' || shNow === 'tok' ? '' : 'none';   // Radius or Diameter is a circle's question, on a token or not
      document.querySelectorAll('#blastAsRow .draw-style-btn').forEach(function(x) { x.classList.toggle('active', x.dataset.as === now.as); });
      var elIn = document.getElementById('blastElev'); if (elIn && document.activeElement !== elIn) boxHeight(elIn, b ? b.elev || 0 : 0);   // item 19 H1: in the viewer's unit; 1.5.4: its arrows step one yard from the figure it shows
      var elU = document.getElementById('blastElevUnit'); if (elU) elU.textContent = lenUnit();
      var elRow = document.getElementById('blastElevRow'); if (elRow) elRow.style.display = stanceOn('elevation') ? '' : 'none';
      var flat = document.getElementById('blastFlatNote');
      if (flat) {
          flat.style.display = stanceOn('elevation') ? 'none' : '';
          var why = window.wpVtt ? window.wpVtt.whyOff('elevation') : 'own';   // whose setting keeps it flat
          flat.textContent = why === 'gm' ? 'Token elevation is off at this table (the GM\'s setting): flat hex distance.'
              : why === 'local' ? 'Token elevation is off for you at this table (Settings ▸ This campaign): flat hex distance.'
              : 'Token elevation is off for this campaign (Settings ▸ This campaign): flat hex distance.';
      }
      var nOwn = blasts.filter(function(x) { return ownCircle(x) && !x.lost; }).length;   // the shapes on screen: a circle whose token is gone is not one
      var which = document.getElementById('blastWhich'); if (which) which.textContent = nOwn && !circleKeptPicked ? 'The numbers are those of the last shape you placed. You have ' + nOwn + ' on this map.' : now.tok === true ? 'Click a token on the map to put a circle on it.' : now.as === 'ring' ? 'Click a cell on the map to place a ring.' : now.as === 'cone' ? 'Press a cell on the map and drag to aim the cone.' : 'Click a cell on the map to place a circle.';
      if (typeof explodeHitRow === 'function') explodeHitRow();   // the Explode boxes ask about the center token only while the circle that would go off sits on one
  }
  function lastOwn() { for (var i = blasts.length - 1; i >= 0; i--) if (ownCircle(blasts[i]) && !blasts[i].lost) return blasts[i]; return null; }   // the last shape of the tool's own that is on screen
  function lastEdit() { return circleKeptPicked ? null : lastOwn(); }   // the shape the options show and change. None while a shape picked with none on screen waits for its click: a circle that came back with its token since is left as it is, and the options go on showing the pick
  function circleNow() {   // what the options show: the last shape of the tool's own, else the one kept for the next. A number the shape does not carry (a circle has no angle) is the one kept
      var c = lastEdit(); return circleShape(c ? { yd: c.yd, as: c.as, inn: c.as === 'ring' ? c.inn : circleKept.inn, deg: c.as === 'cone' ? c.deg : circleKept.deg, tok: typeof c.tok === 'string' || circleKept.tok === true } : circleKept);   // On a token shows for a circle that sits on one, and for a free circle while the next click is to go onto a token (circleShape keeps the mark for a circle alone)
  }
  // The options: what is measured, the size box, a ring's inner distance, a cone's angle. ch names what changed, each only when it did:
  // { size, as, inner, deg, tok }, as typed (tok: true or false, On a token picked or left). It shapes the last shape of the tool's own
  // and the next one, and is kept on this computer. A thrown blast is its item's size: nothing here changes one
  function setCircle(ch) {
      var ru = rulerUnitNow(), now = circleNow(), kind = ch.as !== undefined ? circleKind(ch.as) : now.as;
      if (_circleUnitShown && _circleUnitShown !== ru) { syncBlastMenu(); return; }   // the unit changed under the boxes: show them as they stand
      var cy = cellYdNow(), yd = ch.size !== undefined ? circleYd(ch.size, kind, ru, cy) : now.yd;
      if (!(yd > 0)) { syncBlastMenu(); return; }   // nothing to read
      circleKept = circleShape({ yd: yd, as: kind, inn: ch.inner !== undefined ? circleYd(ch.inner, 'r', ru, cy) : now.inn, deg: ch.deg !== undefined ? coneDeg(ch.deg, now.deg) : now.deg, tok: ch.tok !== undefined ? ch.tok === true : now.tok });
      try { localStorage.setItem('wp_radius', JSON.stringify(circleKept)); } catch (e) {}
      if (circleKept.as === 'r' || circleKept.as === 'd') circleCas = circleKept.as;
      var c = lastEdit(); if (!c) circleKeptPicked = true;
      if (c) {
          c.yd = circleKept.yd; c.as = circleKept.as; delete c.inn; delete c.deg;
          if (c.as === 'ring') c.inn = circleKept.inn; else if (c.as === 'cone') { c.deg = circleKept.deg; if (typeof c.dir !== 'number' || !isFinite(c.dir)) c.dir = circleDir; }
          if (c.as !== 'cone') delete c.dir;
          if (circleKept.tok !== true && typeof c.tok === 'string') delete c.tok;   // off its token: a shape of its own where it stands
          else if (ch.tok === true && typeof c.tok !== 'string') { var m0 = getActiveMap(), t0 = m0 ? tokenAtPoint(m0, c.x, c.y) : null; if (t0) { c.tok = t0.id; circleFollow(m0); } }   // On a token, picked for a circle already placed: onto the token it stands on, where one is there
          renderMeasures();
      }
      syncBlastMenu();
  }
  // The owed review, 2026-10-09: a Throw armed from a sheet and then left, by taking another tool and not by Esc, stayed armed, and the next
  // click of the Radius tool threw it for real, for the whole table, where its player meant to measure. Taking any tool puts it down
  function disarmThrow() { if (_armedThrow) { _armedThrow = null; document.body.classList.remove('placing'); } if (typeof window !== 'undefined' && window.wpDisarmFxBurst) window.wpDisarmFxBurst(); }   // 1.5.4: a burst armed from the effects panel goes too: left armed, it made a later Escape put away the tool taken since
  // ... and when the last shape of the tool's own goes (set off, or taken off by a right-click), the shape kept for the next click follows
  // what the options then show, an older shape's numbers: a click places what is in sight
  function circleRekept() {
      if (circleKeptPicked || !lastOwn()) return;   // a pick that waits for its click is already the shape kept, and the options show it: a circle that goes meanwhile changes nothing (the review of 2026-10-10: a right-click on one of two circles that came back threw the pick away)
      circleKeptPicked = false; circleKept = circleNow();   // the very shape the options show, On a token included
      if (circleKept.as === 'r' || circleKept.as === 'd') circleCas = circleKept.as;
      try { localStorage.setItem('wp_radius', JSON.stringify(circleKept)); } catch (e) {}
  }
  // While a Throw armed from a sheet is in hand this tool is not, though the mode is its own: its icon TAKES the tool, and so does its small
  // arrow when it opens the options, which puts the Throw down (the review of the fold's own fixes, 2026-10-09: the arrow only opened the
  // options, and the next click threw). The arrow over options that are already up only closes them: nothing there says measure
  wireTool({ id: 'blastModeBtn', chev: 'blastOptBtn', inHand: function() { return !_armedThrow && !!window.isMeasureMode && window.wpMeasureKind === 'blast'; }, sync: syncBlastMenu, take: function() {
      disarmThrow();
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      window.isDrawingMode = false; window.isEraserMode = false;
      if (wbWrap) wbWrap.style.cursor = 'crosshair';
      updateWbToolbar('blastModeBtn');
      closeDrawMenu(); if (_el_measureMenu) _el_measureMenu.classList.remove('show');
      state.selWbId = null; state.selWbIds = []; render();
  } });
  var _el_blastFt = document.getElementById('blastFt');
  if (_el_blastFt) _el_blastFt.addEventListener('change', function() { setCircle({ size: this.value }); });
  var _el_blastInner = document.getElementById('blastInner'), _el_blastAngle = document.getElementById('blastAngle');
  if (_el_blastInner) _el_blastInner.addEventListener('change', function() { setCircle({ inner: this.value }); });
  if (_el_blastAngle) _el_blastAngle.addEventListener('change', function() { setCircle({ deg: this.value }); });
  function circleRead(as, tok) {   // another reading or another shape: the number in the box stays, and is read the new way. tok: On a token picked (true) or another shape (false); a reading leaves it as it is
      var now = circleNow(), n = _el_blastFt ? Number(_el_blastFt.value) : NaN;
      setCircle({ as: as, size: n > 0 ? n : circleTyped(now.yd, now.as, rulerUnitNow()), tok: tok });
  }
  document.querySelectorAll('#blastAsRow .draw-style-btn').forEach(function(x) { x.addEventListener('click', function() { var as = circleAs(this.dataset.as); if (as !== circleNow().as) circleRead(as); }); });
  document.querySelectorAll('#blastShapeRow .draw-style-btn').forEach(function(x) { x.addEventListener('click', function() {
      var sh = this.dataset.shape === 'ring' || this.dataset.shape === 'cone' || this.dataset.shape === 'tok' ? this.dataset.shape : 'circle', now = circleNow(); if (sh === (now.tok === true ? 'tok' : shapeOf(now.as))) return;
      circleRead(sh === 'ring' ? 'ring' : sh === 'cone' ? 'cone' : circleCas, sh === 'tok');
  }); });
  var _el_blastElev = document.getElementById('blastElev');
  if (_el_blastElev) _el_blastElev.addEventListener('input', function() { var b = lastTall(); if (!b) return; var v = ydIn(this.value); b.elev = isFinite(v) ? Math.max(-999, Math.min(999, Math.round(v * 10) / 10)) : 0; b.autoElev = false; renderMeasures(); });   // item 19 H1: typed in the viewer's unit
  if (_el_blastElev) _el_blastElev.addEventListener('change', function() { var b = lastTall(); if (b) boxHeight(this, b.elev || 0); });   // once set, the box shows the height as kept, and steps from there
  var _el_blastClearBtn = document.getElementById('blastClearBtn');
  if (_el_blastClearBtn) _el_blastClearBtn.addEventListener('click', function() {
      if (playerScreen()) { blastsSet(blasts.filter(function(b) { return !ownCircle(b); })); renderMeasures(); syncBlastMenu(); }   // a player clears the circles they placed: a blast the GM threw is the table's
      else clearBlasts();
  });
  var _el_blastUndoThrow = document.getElementById('blastUndoThrow');
  if (_el_blastUndoThrow) _el_blastUndoThrow.addEventListener('click', function() { if (window.wpUndoThrow) window.wpUndoThrow(); });
  if (_el_blastMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_blastMenu.addEventListener(ev, function(e) { e.stopPropagation(); disarmThrow(); }); });   // a press in the tool's options is a wish to measure: a Throw armed while they were up is put down
  // [systemcheck:radiusopts-end]
// [split:body-end]
return { BLAST_CAP: BLAST_CAP, applyBlastHits: applyBlastHits, blastRadiusYd: blastRadiusYd, blastSvg: blastSvg, blastsMapSwitch: blastsMapSwitch, boardYards: boardYards, cellSnap: cellSnap, cellYards: cellYards, circleRekept: circleRekept, closeBlastMenu: closeBlastMenu, coneLetGo: coneLetGo, coneTurn: coneTurn, disarmThrow: disarmThrow, hexCellOf: hexCellOf, hexDist: hexDist, mineOff: mineOff, mineRow: mineRow, ownCircle: ownCircle, placeBlast: placeBlast, placeFx: placeFx, playerScreen: playerScreen, pointInPoly: pointInPoly, pushBlast: pushBlast, seatBlast: seatBlast, syncBlastMenu: syncBlastMenu, texListKeys: texListKeys, texListPick: texListPick, texOptionsInto: texOptionsInto, texTileOf: texTileOf, tileRowSync: tileRowSync, tileRowWire: tileRowWire, tokenAtPoint: tokenAtPoint, tokenCentre: tokenCentre, ydPer: ydPer };   // [split:glue]
}   // [split:glue]
