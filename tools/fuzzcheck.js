/* Fuzz check of the wire (system/app/scripts/net.js) against a malicious peer — item 24 R2, the inside-Waypoint half.
   The WHOLE of net.js is loaded (never sliced): its five import lines are replaced by stubs handed in as parameters, its
   `export { net }` becomes `return net`, and the module runs on a stub window / document / localStorage / Peer that record
   every DOM sink, toast, dialog, save and fetch. The real core modules (dicecore, systemcore, fogcore, formula, safecore,
   buildcore, videocore, calendarcore, librarycore, fxcore, soundcore, musiccore, docrender, vtt, state) are imported for real, so the
   rate limiters, the cleaners and the character system are the app's own. A host world (two maps, one fogged, characters
   with a GM-only field, a hidden token, a trap tile, two admitted players, one waiting peer, strangers) and a client world
   (synced to a stub host) are driven through net._handleMessage with, per message type, a well-formed example and a seeded
   series of mutations (missing / mistyped fields, 1e6-char strings, deep nesting, arrays for objects, numbers past 2^53,
   NaN / Infinity, prototype keys as values and as keys, a flood of 500, replays, out-of-order sequences, a peer that lies).
   Oracles: an exception escaping the handler, a state write outside the sender's rights, a save or fetch a message should
   not cause, a raw hostile string in a markup sink, a dialog raised more than once per type by one peer, prototype
   pollution, an unbounded string kept or drawn, a message past 200 ms. A finding is a failure; identical findings are
   folded into one line with a count (the first message that produced it, and its mutation, printed under it). The
   well-formed example of each kind is also checked to take effect, so a probe reaches the real path and not a gate in
   front of it. The clock is the suite's own: it moves 1.5 s between probes (a limiter judges none of them twice) and
   stands still through a flood.
   Not covered here: fog.js (no module: wpFog is a stub that drops every creature but the player's own on a fogged map),
   sheets.js / library.js / sound.js / music.js / fx.js / video.js / handouts.js (stubs that record their calls, so what
   those modules do with a hostile word is their own suites' business), DOMParser (none under node: the rich-text
   sanitiser falls back to escaping everything, so a text item's markup is not exercised), the real PeerJS packer (an
   emulation of BinaryPack's refusals), a video showing (no RTCPeerConnection media), a GM's second connection from one
   peer id, and the outside half of item 24 (Electron, IPC, the local HTTP server, the updater, WebRTC itself).
   The two known players are admitted through the real key proof: the host challenges each hello with a nonce (the auth message) and the
   suite answers as the player's app does, with HMAC-SHA256(key, 'wp-auth|' + nonce + '|' + the room id dialled + '|' + the player's certificate
   fingerprint + '|' + the host's) computed by Node's own crypto, so the host's WebCrypto check is judged against an independent implementation; the
   player's app's own answer is checked the same way. Every stub connection carries a stub RTCPeerConnection whose two descriptions hold one
   fingerprint each (a host-side connection the host's as its own, a player's the reverse), the library's entry point and pieces table (the
   transport guard wraps them) and its encoding's name; the stub peer has the library's signalling entry point (the gate wraps it). The transport
   probes hand the guard raw messages and the gate signalling messages, and replay a right proof over another connection's certificates.
   The GM's signing key (trust on first use) is judged the same way: each known player's hello carries a nonce, and the snapshot the host signs
   over it is verified by Node's own ECDSA; the private half is looked for in every send. On the player's side the real join is run — a first
   join, an automatic reconnect, a join that walks every generation of the code — against hosts the suite builds with Node's own key pairs: a
   snapshot is taken only when an independent reading of what the app knew (its pins, its room codes) and of the signature says so.
   The host's early proof ('gmhello': the GM's signed answer to a hello, before any admission) is judged in both worlds. Host: it is sent once per
   connection, to a hello that passed the ban, version and password gates, its signature verified by Node's own ECDSA over wp-host, the player's
   nonce, the room id, the GM id and the connection's two fingerprints; it carries the GM id, the public key and the signature and nothing else.
   Client: every mutation of it from every sender, before and after the snapshot, writes nothing to storage, raises no question by itself and
   costs an honest signed table nothing; under a pinned GM a host counts as proven only when an independent reading says so; and an automatic
   reconnect is driven past a stand-in that stays silent, says wait, opens each connection and closes it (with a wait or without), refuses, or
   proves itself as someone else, to the GM — every attempt counting on by one, "Reconnected" said only once the table is taken. The GM's own app
   slow once is passed over unmarked and taken when the round comes back. A join the player began against tables that prove nothing in time ends
   in the late table's own question; a yes to it is a yes to waiting and to nothing else (an unsigned table under the GM's id is still refused).
   A connection closed before any proof is passed over within the join where the GM is known, and reconnects by itself where nothing is. On the
   host, a map renamed just before an admission reaches the players already at the table at that admission (the real admitPlayer). The clock of
   the wait for the proof is the suite's own (the app's five-second timers are set aside at each dial and fired by hand).
   The map builder's secret door (fold B5: a secret door) is in the host world as the GM's own door_secret: a door ticked Secret with a name, a
   colour, a pattern and a picture fill of its own, and a colour named for the wall the players see. Every send a probe causes is read for what
   would give it away (that name, colour or picture, one of the GM's three keys secret / seenColor / seenTexture under any piece, the door in any
   shape but the wall the players are to hold); the write oracle takes no change of it and none of the three keys from any player, on a new
   drawing, a redrawn one and their own token alike; the well-formed map copy sends it back as an open door with no tick; a door request naming
   it is a message kind of its own; and the player's app is seen to keep none of the three keys a host names, on any piece, after every message.
   A plain wall leaves the host in ONE shape (the third review of fold B5), the shape a secret door's copy is made in. So every send is also read
   for a plain wall that is not typed wall, that carries a group, a key of a door or of a way through, or a hex colour with an upper-case letter.
   The host world holds a wall for each: one with no sightType key, one typed with a word the app does not know, one whose colour a file wrote
   in upper case, one that stands in the secret door's own group and wears the look named for the door, and one that keeps what a door and a
   way through left behind.
   Match a wall (the owner, 2026-10-12, by prompt): a secret door DRAWN AS A LINE may be seen at the width, the opacity and the nib of the wall
   line it meets, under three more keys of the GM's own (seenWidth, seenOpacity, seenTip). The host world holds three such doors, each end to end
   with the wall line it was matched to: one whose own width, opacity and nib each differ from its wall's, one beside a wall as a campaign file
   writes it (a width that is text, an opacity of 1, no nib) and one that holds no width, opacity or nib of its own. Every send is read for a
   door of the three in any shape but the wall line the players are to hold (its own width, opacity or nib first), for one of the six keys under
   any piece, and for a plain wall drawn as a line whose width is no number above 0, whose nib is none of round, square and flat, or which
   carries an opacity that is no number under 1. So that no clause is empty the world holds wall lines for each: a width that is text, a word,
   0 and past the bound, an opacity of 1, past 1, below 0 and as text, no nib and a nib the app does not know. Beside them stand a filled
   region, a line that blocks nothing and a door drawn as a line, which keep what they carry, and three pieces that each kept ONE of the three
   keys with no tick. The GM's secret door that is no line carries all three, where they count for nothing. The well-formed map copy sends the
   player's own token and drawing with the three keys and one of the doors back as the sender's own drawing, and the write oracle takes none of
   it. A door request naming one of the doors is a message kind of its own. The player's app is seen to keep none of the three keys a host
   names, each alone and all together.
   A door made as each of the GM's wall lines is made, laid end to end with it and matched to it, is that wall's twin in a whole copy of the map,
   whatever the wall holds on the host.
   Match a wall, round two (what three reviewers confirmed of the first build, 2026-10-12).
   WITH NO FOG CORE AT HAND the host's fallback lays the look Match set over the door's own, by the tests the core's cleaners make. So a matched
   secret door drawn as a line leaves in that copy as it does with the core: each such door of the world is held to the piece the players are
   to hold, key for key, in the no-core copy too, and a batch of doors with every kind of value under the four keys is sent once with the core
   and once without, where each must leave alike. A box and a filled region keep the older fallback: the Wall material's colour, nothing named.
   NO PLAIN WALL CARRIES A LOCK TO PLAYERS. The board draws a piece locked in place fainter on every screen, so a locked wall beside a secret
   door that is not locked showed, and the other way round. The world holds seven plain walls with a lock key on the host (a wall line, a wall
   box whose lock is the number 1, three lines of a player's own of which the GM made two a wall and one a barrier, a one-schema wall whose key
   is there and 0, a wall whose key is false), two secret doors locked in place whose walls are not, and an unlocked secret door matched to the locked wall
   line. Every send is read for a plain wall that carries the key. Six pieces that are no plain wall are locked too and KEEP their lock on the
   wire: a door that is no secret, a token, a shape that blocks nothing, a wall that leads to another map and two drawings of a player's own.
   The host's own map keeps every lock. The well-formed map copy sends the GM's locked wall line back as the sender's own drawing, moved and
   unlocked, the locked wall box moved and unlocked, two locked lines of the sender's own redrawn and unlocked, and leaves three more out, which
   is an erase. It also sends the sender's own token and new drawing as locked in place. The write oracle takes none of it, and takes the key
   locked from no player on any piece.
   A SEE-THROUGH WALL GIVES A SEE-THROUGH DOOR. The world holds a wall line whose colour is the word transparent and a secret door matched to
   it (seenColor: the word). Its far end touches a thick wall line that stands across it and comes first in the map's list, so the core's own
   rule for WHICH wall a door meets (the one it runs along) is what makes the suite's expectation true. The door leaves in every send as its
   wall does, colour and all, with the core and without. On the player's app a hostile host's seenColor of that word is dropped with the other
   five keys, on any piece, and a host's locked on a wall is kept as the host sent it, whatever value it is: the board reads it by truth
   alone (a dim of 85% and a class), and an honest host sends none.
   THE WIDTH AS DRAWN. A wall line resized to twice its size, a door resized to three times its size and a wall whose box was made three times
   as tall are each matched through fogcore secretMatch and sent: by this suite's own reading of how thick a level line is drawn (its width
   times how much taller its box was made) the door's copy and its wall are drawn alike, though their stored widths differ.
   NOT held here, of round two: the bound on the work (fogcore MATCH.work and the answer { over: true }). That is fogcheck's. Nor
   Properties' words, nor the board's and the map picture's own reading of a line: this suite loads neither inspector.js,
   whiteboard.js nor shotcore.js. Some parts of the fallback cannot be told from the wire, and no check here names them: the lock in its
   list of keys, the lower case of a named colour and an opacity of 1 written as a key are each put right by the host's block for a plain
   wall a few lines on, and a width or an opacity that is not finite, or a width past 1e15, is gone before the fallback reads the piece,
   which is a bounded JSON copy by then.
   Match a wall, round three (what round two's reviewers and test writers confirmed, 2026-10-12).
   WHICH WALL ANSWERS is ranked. (As round three had it, and round four ranks anew, see below:) first the LOOK that reaches the door's two ends
   best (2 for an end a wall of that look touches, 1 for one it is near, judged from the end point to the wall's own stroke), then a wall the
   door touches before one it is only near, then a wall that runs the door's own way before one that stands across it, then the nearer, then
   the first in the map's list. What stands of that paragraph in round four is this: a line reaches as far as half
   its drawn width, held to 100 px, and 12 px more. So a wall line whose width is past any board reaches a door 100 px from it: the world's
   own (line_huge) now stands far from every door, and the lines of the sweep stand 40 px and more apart, so that a door laid end to end with
   one of them meets no other. Layouts of a door among wall lines (forty-two in round three, eighty-nine in round four, 121 now) are laid on the host's map for a while, each in a part of its own,
   matched as Properties' Match press does and sent in a whole copy of the map: each door's copy is held to the wall the rule names, each
   answer is asked again with every line drawn from its other end, and the two ends of each bound are laid (a wall 19 px from a door and one
   20 px from it, a wall whose half is held to 100 px at 116 px and at 117).
   THE WIDTH was, in round three, the one at which the door's copy is drawn as the wall's own pen would draw along the door's run where they
   meet (round four reads a stroke along the WALL's own run, and holds the flat nib to a bound: see below). penThick is
   this suite's own reading of a pen, in vectors: a round or a square nib is a stroke as wide as its width across the line in the line's own
   box, the flat nib is a ribbon laid along that box's diagonal, and the box is stretched and turned onto the board. For two lines never
   resized nor turned the answer is the wall's own number bit for bit (but for a flat wall whose ribbon along the door is under a pixel, since
   round four). Where a door runs along the flat nib of its own box, its copy takes the square nib. fogcore seenDrawn says the thinnest and
   the thickest a copy is drawn, which differ for a ribbon with a bend in it.
   A PLAYER'S DRAWING THAT IS A WALL AND LOCKED. Their copy of it says no lock, since no plain wall carries one to players. So a copy of
   theirs that redraws it or leaves it out is answered with the map whole, as for any wall of theirs, and changes nothing. The world holds two
   (the well-formed map copy redraws one and leaves the other out), and a series of copies that each differ from the map as the player holds
   it in ONE thing shows which thing asks for the map: other points, a move along x, a move along y, the drawing left out. A copy that names
   it as it stands, in another colour or in a shape that is no drawing asks for nothing, and neither does a redraw or an erase of a locked
   drawing that is no wall.
   A NEW DRAWING'S NIB. The well-formed map copy sends five new drawings of the player's with tip square, flat, fill, the number 7 and a text
   of markup. The host keeps the first two and no tip at all for the others, and the write oracle takes a tip on a player's drawing only as
   square or flat.
   A COLOUR THAT DRAWS NOTHING is read as the board reads the very text: a secret door whose own colour is the word with a blank either side
   of it, or rgba(255,0,0), is no see-through door, and leaves in the Wall material's colour with the core and without.
   NOT held here, of round three: a player's press on their own locked token (datamap.js), a door's cut of a resized wall (whiteboard.js) and
   Properties' words (inspector.js). This suite loads none of the three. Nor every corner of the geometry: fogcheck holds the core alone.
   Match a wall, round four (what round three's two reviewers confirmed, 2026-10-12). It changed WHICH wall answers and at WHAT width, so the
   layouts of round three were worked out again by hand from the rule as it now stands. Eleven layouts say an answer that round four CHANGED,
   each with what round three answered there (flip): six of round three's own layouts, and five scenarios its reviewers reported. One more of
   round three's layouts, the one for a touch, was laid anew, since both of its walls touch now. Outside the layouts three more answers
   flipped, and each check says so in its name: the world's line past any board laid beside a door, two of the six resized pairs, and a
   redraw that names no nib.
   WHICH WALL ANSWERS, seven ranks. (1) The LOOK that reaches BOTH of the door's ends: 2 for an end a wall of that look touches, 1 for one it
   is near, added, and nothing at all unless the look reaches both. An end is touched within the wall's half and 4 px, near within 12. A
   wall reaches no end where it passes the door's MIDDLE about as near as it passes that end (within half the way from the end to the
   middle, 12 px at the most), unless the door lies ON it. A door whose ends lie 12 px apart or less, a ring, has no two ends. Walls drawn
   alike are one look: the colour whatever its case, each number to a thousandth. (2) A wall that is not ASIDE: aside is a wall that runs
   beside the door or passes its middle clear of both ends. (3) A wall that runs the door's way, within 30 degrees, 30 included. A run is
   read over 40 px of LINE, cut inside a long stretch, and the wall's run is the side of the meeting place that is more like the door's.
   (4) A wall the door touches, by half of each width and 4 px. (5) A wall that ENDS at one of the door's ends. (6) The nearer. (7) The
   first in the map's list. This suite has its OWN reading of all that (r4Judge, r4Look, in section 8), written from the rule in vectors
   with the suite's own measures. Each layout's answer is the hand's, the reading's and the core's, and the same reading is run beside the
   core over 1500 seeded figures.
   THE WIDTH. A stroke, the round and the square nib, is matched as thick as the wall IS drawn along its OWN run where they meet (round
   three read the wall's pen along the door's run). A ribbon, the flat nib, is still read along the door's run, and stays flat only where
   the door's own box needs a nib no more than twice and no less than half as wide and the ribbon is a pixel thick: else the copy takes the
   square nib at the ribbon's thickness, a pixel at the least.
   A REDRAW THAT NAMES NO NIB leaves a round line: a player's map copy that redraws their own square or flat line with no tip key, with
   markup under tip or with the Fill tip takes the nib off the host's line, on the host and on every other copy, and the line named with
   the Fill tip is still an open line. The write oracle also holds that a nib changes only with a redraw.
   A BOX whose colour has blanks around the word transparent draws no fill, and leaves clear again with the core. A wall LINE in that
   colour is stroked in ink: Match names no colour for it.
   NOT held here, of round four: a door's cut of a resized wall (whiteboard.js doorCut), the hand-overs of a press (datamap.js) and the
   keys the GM's undo keeps for a redrawn line (io.js OWN): this suite loads none of the three. Nor the bound on the work, which is
   fogcheck's. With no fog core at hand the host's fallback knows the exact word transparent alone, so a box whose colour has blanks
   around it leaves there in the Wall material's colour: stated in that check, not asserted. And one limit of the rule itself is stated
   where it shows: fogcore seenDrawn reads a door's arm that is shorter than a run with the line beside it, so for a door of two arms 30 px
   long it says one thickness that is neither arm's own.
   Match a wall, round five (what round four's two verifiers and its suite agents confirmed, 2026-10-12). The last corrections. This suite's
   own reading of the rule was written out again for it (r5Judge, r5Look, r5Drawn), and round four's is kept beside it (r4Judge, r4Look) to
   say what round four answered: seventeen of the 121 layouts carry flip5, and by the kept reading they are the very layouts whose answer
   round five changed, and no other. Outside the layouts four more answers flipped, and each check says so in its name: the world's line past any
   board laid beside a door (another reason for the same answer), the thickness fogcore says of a door of two arms 30 px long, a secret
   door that is a box in a colour the board refuses, and a redraw that names a nib for a filled region.
   AN END IN THE STROKE IS REACHED. An end of the door that lies within the wall's half and ONE pixel of the wall is reached whatever the
   door's middle does: a wall that lies over one end and on to the middle, a door that arches off an uncut wall, a straight door over the
   wall of a round room. NOT ASIDE WHERE THE STROKES OVERLAP: a wall beside the door or across its middle is not aside while the door's
   two ends and its middle all lie within the wall's half plus the door's, so a door drawn over an uncut wall a few pixels off is not
   handed to a wall that butts on one of its ends. A RING BY ITS LENGTH: a door has two ends unless they lie within the lesser of 12 px
   and half its own length of each other, so a straight door of 8 or of 12 px has two. HALF RUNS: the wall's run is read on either side
   of its stretch over 40 px and over 20, and the most alike of those read over 20 px of line or more counts, so a wall that turns 16
   to 24 px before the door runs the door's way. THE PAIR THAT SPEAKS is the most alike of the pairs within 4 px of the wall's nearest
   gap, so a wall whose corner lies a few pixels before the door speaks by the leg the door carries on from. THE WIDTH reads each line AS
   DRAWN where they meet, a stretch of 20 px or more by its own direction (a hex lattice's side) and a shorter one by its run, and
   fogcore seenDrawn reads a door's stretches the same way (so the door of two arms 30 px long, of which round four's paragraph says
   otherwise, is now said as it is drawn).
   HELD AS DECIDED, each said in the name of the check that shows it and none to be read as a finding. The allowance for an end in the
   stroke is one pixel: a door drawn over an uncut wall whose ends lie farther off, with walls of another look meeting both its ends, is
   answered by those walls. Past the overlap of the two strokes a wall beside the door is aside. Of a wall's own runs that are exactly as
   like the door's the earliest counts, so one layout (tie-first) answers a wall drawn from one end and none drawn from the other.
   seenDrawn reads a stretch under 20 px by its run. With no fog core at hand the wire's fallback knows the plain word transparent alone.
   A SUM THAT COMES TO 20 PX. The reading keeps a run that was read over 20 px of line to within a billionth, as the rule says. fogcore
   asks whether the sum of the lengths is 20 or more as it comes out, which on a line drawn by hand is 19.999999999999996 for about one
   half run in eleven, and leaves such a run out. So the reading can be asked a second way (edge 'sum'), with every sum taken as it comes
   out, and a seeded figure whose answer differs between the two is not judged: there the core must answer one of the two, and which is
   counted. No layout hangs on such a sum. It was reported with this round as a finding of the source, and the suite is green whichever
   way it is settled.
   A COLOUR THAT DRAWS NOTHING is read as the board's own rule reads the very text. A text that rule takes is clear only as the word
   transparent, a hex colour whose alpha is 0 or an rgba / hsla of four parts whose last is 0. A text it refuses (a blank beside the
   colour, RGBA in capitals, an empty text, 41 characters) draws no fill on a RECTANGLE or a CIRCLE, which is then see-through, and makes
   no see-through door of a hexagon, a diamond or a filled region. Ninety secret doors, five kinds in eighteen colours, are sent and held
   to a table worked out by hand.
   A REDRAW NEVER MAKES A FILLED REGION A LINE. A filled region signed by a player, which only a file can hold, redrawn or moved by a copy
   that names the flat or the square nib, is a filled region still, on the host and on the wire. The write oracle takes a change of a
   filled region's tip from no player.
   NOT held here, of round five: the eraser's flush and Merge Drawings on a resized line (whiteboard.js) and the two hand-overs that pick
   the topmost piece (datamap.js): this suite loads neither. Nor the bound on the work and its answer for a list of pairs too long to
   judge, which is fogcheck's.
   The suite is diagnostic: it exits 1 while it has findings and is not in the CI matrix.
   SKIP_KNOWN below marks a finding the owner has accepted (an exact prefix of its FAIL or FINDING line, with the reason): such a line is
   printed as accepted and counted apart, and the run still exits 1 for any red line not in it.
   Run: node tools/fuzzcheck.js */
'use strict';
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url'), nodeCrypto = require('crypto');
const ROOT = path.join(__dirname, '..', 'system', 'app', 'scripts');
const CANARY = '<svg onload=FUZZCANARY>';   // raw in a markup sink = a finding (escaped it reads &lt;svg…)
const BIG = 'B'.repeat(1e6);
const T0 = Date.now();
/* Accepted findings: [{ prefix: 'FINDING   <kind> — <detail>' or 'FAIL      <check name>', why: 'one line' }]. Empty until the owner accepts one. */
const SKIP_KNOWN = [];
function acceptedBy(line) { return SKIP_KNOWN.find(s => s && typeof s.prefix === 'string' && s.prefix && line.indexOf(s.prefix) === 0) || null; }
/* the table-key proof, as the player's app computes it (hmacHex in net.js over WebCrypto), here by Node's crypto: the two must agree */
const FP_P = 'sha-256 AB:01:23', FP_H = 'sha-256 CD:45:67';   // the player's certificate fingerprint and the host's, on every honest stub connection
const sdpWith = f => ({ type: 'x', sdp: 'v=0\r\ns=-\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:' + f + '\r\n' });
const pcStub = (mine, theirs) => ({ localDescription: sdpWith(mine), remoteDescription: sdpWith(theirs) });
const proofFor = (key, nonce, room, playerFp, hostFp) => nodeCrypto.createHmac('sha256', key).update('wp-auth|' + nonce + '|' + room + '|' + (playerFp || FP_P) + '|' + (hostFp || FP_H)).digest('hex');
/* the GM's signing key: what a snapshot's signature covers, Node's own ECDSA to verify what the host's WebCrypto signs, and a host of the suite's own making */
const snapText = (cn, room, gmId, key) => 'wp-snap|' + cn + '|' + room + '|' + gmId + '|' + key + '|' + FP_P + '|' + FP_H;   // (the honest stub connection's two fingerprints, the player's then the host's)
const sigOk = (pub, sig, text) => { try { return !!pub && typeof sig === 'string' && /^[0-9a-f]{128}$/.test(sig) && nodeCrypto.verify('sha256', Buffer.from(text), { key: nodeCrypto.createPublicKey({ key: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'hex')); } catch (e) { return false; } };
const mkSigner = () => { const kp = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), j = kp.publicKey.export({ format: 'jwk' }); return { pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y }, sign: text => nodeCrypto.sign('sha256', Buffer.from(text), { key: kp.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex') }; };
const hostText = (cn, room, gmId) => 'wp-host|' + cn + '|' + room + '|' + gmId + '|' + FP_P + '|' + FP_H;   // what the host's early proof covers (the same nonce, room, GM id and fingerprints as the snapshot's, under a first word of its own)
const hailShape = m => !!m && JSON.stringify(Object.keys(m).sort()) === JSON.stringify(['gmId', 'gmPub', 'sig', 'type']) && typeof m.gmId === 'string' && !!m.gmPub && JSON.stringify(Object.keys(m.gmPub).sort()) === JSON.stringify(['crv', 'kty', 'x', 'y']) && typeof m.sig === 'string' && /^[0-9a-f]{128}$/.test(m.sig);   // all an early proof carries: who the GM is, the public key, the signature
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/* what a player's app should make of a host's early proof, read independently of net.js: 'refuse' (the room code is another GM's, or the key pinned
   for the GM named did not sign this connection's nonce, the room dialled and that GM id), 'ok' (it did), 'none' (nothing known to judge it by) */
function hailJudge(ls, msg, conn, code) {
    const rd = k => { try { const o = JSON.parse(ls[k] || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
    let gmId = ''; try { gmId = String(msg.gmId || '').slice(0, 80); } catch (e) { return 'refuse'; }
    const pins = rd('wp_gmPins'), rooms = rd('wp_gmRooms'), roomGm = hasOwn(rooms, 'c_' + code) ? rooms['c_' + code] : '', pin = hasOwn(pins, gmId) ? pins[gmId] : null;
    if (roomGm && roomGm !== gmId) return 'refuse';
    if (pin) return sigOk(pin, msg.sig, hostText(conn.wpCn, conn.peer, gmId)) ? 'ok' : 'refuse';
    return 'none';
}
/* what a player's app should do with a snapshot, read independently of net.js: the room code is another GM's → refuse; a key is pinned for the GM
   named → take only on that key's signature over this connection's nonce, the room dialled, the GM id and the table key; nothing known → take */
function gmJudge(ls, msg, conn, code) {
    const rd = k => { try { const o = JSON.parse(ls[k] || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
    let gmId = ''; try { gmId = String(msg.gmId || (msg.notepad && msg.notepad.gmId) || '').slice(0, 80); } catch (e) { return 'refuse'; }
    const pins = rd('wp_gmPins'), rooms = rd('wp_gmRooms'), roomGm = hasOwn(rooms, 'c_' + code) ? rooms['c_' + code] : '', pin = hasOwn(pins, gmId) ? pins[gmId] : null;
    if (roomGm && roomGm !== gmId) return 'refuse';
    if (pin) return sigOk(pin, msg.sig, snapText(conn.wpCn, conn.peer, gmId, typeof msg.key === 'string' ? msg.key : '')) ? 'take' : 'refuse';
    return 'take';
}

/* ---------- a seeded generator (reproducible) ---------- */
let seed = 20261001;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

/* ---------- findings ---------- */
const found = new Map(); let checks = 0, checksFailed = 0, checksAccepted = 0, probes = 0;
function short(v) {
    let s; try { s = JSON.stringify(v, (k, x) => typeof x === 'string' && x.length > 60 ? '<' + x.length + ' chars>' : (typeof x === 'number' && !isFinite(x)) ? String(x) : x); } catch (e) { s = '<unserialisable: ' + e.message + '>'; }
    if (s === undefined) s = String(v);
    return s.length > 240 ? s.slice(0, 240) + '…' : s;
}
function finding(kind, detail, msg, mut) {
    const key = kind + ' | ' + detail;
    const f = found.get(key);
    if (f) { f.n++; return; }
    found.set(key, { kind, detail, n: 1, msg: (msg === undefined ? '' : short(msg)) + (mut ? '   [mutation: ' + mut + ']' : '') });
}
function findingLine(f) { return 'FINDING   ' + f.kind + ' — ' + f.detail; }
const openFindings = () => [...found.values()].filter(f => !acceptedBy(findingLine(f)));   // the findings not accepted: what the per-kind lines and the exit code count
function check(name, ok, detail) {
    checks++;
    if (ok) { console.log('ok        ' + name); return; }
    const line = 'FAIL      ' + name, acc = acceptedBy(line);
    if (acc) { checksAccepted++; console.log('accepted  ' + name + '  (' + acc.why + ')'); return; }
    checksFailed++; console.log(line + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : short(detail)) : ''));
}

/* ---------- a fake clock and manual timers (nothing real fires; each message's timers are flushed by hand) ---------- */
const realNow = Date.now.bind(Date); let clockOff = 0; Date.now = () => realNow() + clockOff;
const realTimeout = globalThis.setTimeout;   // the one real timer the suite keeps: to wait for WebCrypto (the key proof is checked off the main thread)
async function settle(cond, max) { for (let i = 0; i < (max || 500); i++) { if (cond()) return true; await new Promise(r => realTimeout(r, 0)); } return cond(); }   // until the condition holds, a macrotask at a time (an HMAC lands in a few); bounded
const timers = { q: [], seq: 0, intervals: [], cleared: new Set() };
globalThis.setTimeout = function(fn, ms) { const id = ++timers.seq; timers.q.push({ id, fn, ms: Number(ms) || 0 }); return id; };
globalThis.clearTimeout = function(id) { timers.q = timers.q.filter(t => t.id !== id); timers.cleared.add(id); };
globalThis.setInterval = function(fn, ms) { const id = ++timers.seq; timers.intervals.push({ id, fn, ms: Number(ms) || 0 }); return id; };
globalThis.clearInterval = function(id) { timers.intervals = timers.intervals.filter(t => t.id !== id); };
const flushed = { threw: [] };
function flushTimers() {
    for (let round = 0; round < 6 && timers.q.length; round++) {
        const q = timers.q.splice(0);
        q.forEach(t => { try { t.fn(); } catch (e) { flushed.threw.push(e); } });
    }
}
async function drain() { for (let i = 0; i < 6; i++) await new Promise(r => process.nextTick(r)); }

/* ---------- the stub page: every sink recorded ---------- */
const allConfirms = [];
const rec = { html: [], attr: [], text: [], style: [], toasts: [], confirms: [], saves: [], fetches: [], loads: 0, renders: 0, opens: [], warns: [], journal: [], blasts: 0, pics: [], gives: [], combatsOpened: [], reads: 0, cancels: 0 };   // reads / cancels: the stub server's bodies read whole, and cancelled unread
function resetRec() { Object.keys(rec).forEach(k => { if (Array.isArray(rec[k])) rec[k].length = 0; else rec[k] = 0; }); }
function mkEl(tag, id) {
    const el = { tagName: String(tag || 'div').toUpperCase(), id: id || '', children: [], _attrs: {}, _h: {}, dataset: {}, _text: '', _html: '', value: '', checked: false, disabled: false, scrollTop: 0, scrollHeight: 0, offsetParent: null, offsetWidth: 100, offsetHeight: 20, parentNode: null, nodeType: 1, nodeName: String(tag || 'div').toUpperCase(), className: '', hidden: false };
    el.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    const st = {}; st.setProperty = (k, v) => { st[k] = v; rec.style.push({ el: el.id, k, v: String(v) }); }; st.removeProperty = k => { delete st[k]; }; st.getPropertyValue = k => (st[k] === undefined ? '' : String(st[k]));
    el.style = new Proxy(st, { set(o, k, v) { o[k] = v; rec.style.push({ el: el.id, k, v: String(v) }); return true; } });
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); el.children = []; rec.html.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'outerHTML', { get() { return el._html; }, set(v) { rec.html.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v); el.children = []; rec.text.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'innerText', { get() { return el._text; }, set(v) { el._text = String(v); rec.text.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'title', { get() { return el._attrs.title || ''; }, set(v) { el._attrs.title = String(v); rec.text.push({ el: el.id, v: String(v) }); } });
    ['src', 'href'].forEach(k => Object.defineProperty(el, k, { get() { return el._attrs[k] || ''; }, set(v) { el._attrs[k] = String(v); rec.attr.push({ el: el.id, k, v: String(v) }); } }));
    el.setAttribute = (k, v) => { el._attrs[k] = String(v); rec.attr.push({ el: el.id, k, v: String(v) }); };
    el.getAttribute = k => (el._attrs[k] === undefined ? null : el._attrs[k]); el.removeAttribute = k => { delete el._attrs[k]; }; el.hasAttribute = k => el._attrs[k] !== undefined;
    el.insertAdjacentHTML = (p, v) => { rec.html.push({ el: el.id, v: String(v) }); };
    el.addEventListener = (ev, fn) => { (el._h[ev] = el._h[ev] || []).push(fn); }; el.removeEventListener = () => {};
    el.click = () => { (el._h.click || []).forEach(f => f({ target: el, preventDefault() {}, stopPropagation() {} })); };
    el.appendChild = c => { el.children.push(c); if (c && typeof c === 'object') c.parentNode = el; return c; }; el.append = (...c) => c.forEach(x => el.appendChild(x)); el.prepend = el.append;
    el.insertBefore = (c) => el.appendChild(c); el.removeChild = c => c; el.remove = () => {}; el.replaceChildren = (...c) => { el.children = c; };
    el.querySelector = () => null; el.querySelectorAll = () => []; el.closest = () => null; el.contains = () => false; el.focus = () => {}; el.blur = () => {}; el.matches = () => false; el.scrollIntoView = () => {};
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }); el.cloneNode = () => mkEl(tag); el.dispatchEvent = () => true; el.getContext = () => null;
    return el;
}
const byId = new Map();
const document = {
    getElementById(id) { if (!byId.has(id)) byId.set(id, mkEl('div', id)); return byId.get(id); },
    createElement: t => mkEl(t), createElementNS: (ns, t) => mkEl(t), createDocumentFragment: () => mkEl('#fragment'), createTextNode: t => { rec.text.push({ el: '#text', v: String(t) }); return { nodeType: 3, textContent: String(t), nodeValue: String(t) }; },
    body: mkEl('body', 'body'), documentElement: mkEl('html', 'html'), head: mkEl('head', 'head'), addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector: () => null, querySelectorAll: () => [], activeElement: null, hidden: false, visibilityState: 'visible', title: ''
};
function storage() { let m = {}; return { getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { m = {}; }, dump: () => Object.assign({}, m), key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } }; }
const localStorage = storage(), sessionStorage = storage();
const location = { origin: 'http://localhost:3999', href: 'http://localhost:3999/', pathname: '/', search: '', hash: '', host: 'localhost:3999', protocol: 'http:', reload() {} };
const win = {
    document, localStorage, sessionStorage, location, navigator: { clipboard: null, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, open(u) { rec.opens.push(String(u)); return null; },
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: fn => globalThis.setTimeout(fn, 16), cancelAnimationFrame: id => globalThis.clearTimeout(id),
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    appRender() { rec.renders++; }, appToast(m) { rec.toasts.push(String(m)); }
};
win.window = win; win.self = win; win.top = win; win.parent = win;
globalThis.window = win; globalThis.document = document; globalThis.localStorage = localStorage; globalThis.sessionStorage = sessionStorage; globalThis.location = location;
try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true }); } catch (e) {}
globalThis.BroadcastChannel = class { constructor() {} postMessage() {} addEventListener() {} removeEventListener() {} close() {} };
if (typeof globalThis.CustomEvent === 'undefined') globalThis.CustomEvent = class CustomEvent extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } };
globalThis.RTCPeerConnection = class { constructor(cfg) { this.cfg = cfg; this.localDescription = null; rec.rtc = (rec.rtc || 0) + 1; } createDataChannel() { return { close() {} }; } createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0\r\n' }); } createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'v=0\r\n' }); } setLocalDescription(d) { this.localDescription = d; return Promise.resolve(); } setRemoteDescription() { return Promise.resolve(); } addIceCandidate() { return Promise.resolve(); } addTrack() {} getSenders() { return []; } close() {} addEventListener() {} };
globalThis.fetch = function(url, opts) {
    rec.fetches.push({ url: String(url), method: opts && opts.method || 'GET' });
    const u = String(url);
    if (/version/.test(u)) return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.5.0' }) });
    // the local server states every file's length (servefile.js): a picture of the budget probe (/saves/images/pN.png) states 1 MB, any other file its 4 bytes
    const stated = /\/saves\/images\/p\d+\.png$/.test(u) ? 1048576 : 4;
    return Promise.resolve({ ok: true, status: 200, headers: { get: h => (String(h).toLowerCase() === 'content-length' ? String(stated) : null) }, body: { cancel() { rec.cancels++; } }, json: () => Promise.resolve({}), text: () => Promise.resolve(''), arrayBuffer: () => { rec.reads++; return Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer); }, blob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])])) });
};
const warned = []; const realWarn = console.warn.bind(console), realError = console.error.bind(console);
console.warn = (...a) => { warned.push(a.map(x => (x && x.message) || String(x)).join(' ')); };
console.error = (...a) => { warned.push('ERROR ' + a.map(x => (x && x.message) || String(x)).join(' ')); };

/* ---------- the packer PeerJS uses (BinaryPack): what it refuses never reaches a peer ---------- */
function packCheck(v, depth) {
    depth = depth || 0; if (depth > 100000) throw new RangeError('pack: too deep');
    if (typeof v === 'number') { if (Math.floor(v) === v && (v > 18446744073709551615 || v < -9223372036854775808)) throw new Error('Invalid integer'); return; }
    if (typeof v === 'function') throw new Error('Type "function" not yet supported');
    if (v === null || typeof v !== 'object') return;
    if ('BYTES_PER_ELEMENT' in v && !ArrayBuffer.isView(v)) throw new Error('an object with BYTES_PER_ELEMENT is packed as an (empty) typed array');
    const C = v.constructor;
    if (C === undefined) throw new TypeError("Cannot read properties of undefined (reading 'toString')");
    if (Array.isArray(v)) { v.forEach(x => packCheck(x, depth + 1)); return; }
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || C === Date) return;
    if (C !== Object) throw new Error('Type "' + String(C && C.name) + '" not yet supported');
    if (typeof v.hasOwnProperty !== 'function') throw new TypeError('obj.hasOwnProperty is not a function');
    for (const k in v) if (v.hasOwnProperty(k)) packCheck(v[k], depth + 1);
}

/* ---------- PeerJS stubs ---------- */
const peers = [];
class Conn {
    constructor(peer, side) { this.peer = peer; this.open = true; this._h = {}; this.sent = []; this.closedBy = 0; this.serialization = 'binary'; this._chunkedData = {}; this.inner = 0; this.peerConnection = side === 'client' ? pcStub(FP_P, FP_H) : pcStub(FP_H, FP_P); }
    _handleDataMessage() { this.inner++; }   // the library's own entry point (the transport guard wraps it on the instance): counted, so a probe can tell a raw message that reached the decoder from one that did not
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
    emit(ev, ...a) { (this._h[ev] || []).forEach(f => f(...a)); }
    send(m) { packCheck(m); if (!this.open) throw new Error('connection closed'); this.sent.push(m); sentLog.push({ to: this.peer, m }); }
    close() { if (!this.open) return; this.open = false; this.closedBy++; this._chunkedData = {}; this.emit('close'); }
}
const sentLog = [];
class PeerStub {
    constructor(id, opts) { if (typeof id === 'object') { opts = id; id = 'anon_' + peers.length; } this.id = id; this.opts = opts; this._h = {}; this.conns = []; this.sigIn = 0; peers.push(this); }
    _handleMessage() { this.sigIn++; }   // the library's signalling entry point (the gate wraps it on the instance): counted
    getConnection() { return null; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
    emit(ev, ...a) { (this._h[ev] || []).forEach(f => f(...a)); }
    connect(id) { const c = new Conn(id, 'client'); this.conns.push(c); return c; }
    destroy() { this.destroyed = true; } reconnect() {} disconnect() {}
}
globalThis.Peer = PeerStub;

/* ---------- loading net.js whole ---------- */
const netSrcRaw = fs.readFileSync(path.join(ROOT, 'net.js'), 'utf8').replace(/\r\n/g, '\n');
const importLines = netSrcRaw.match(/^import \{[^}]*\} from '\.\/[a-z]+\.js';[^\n]*$/gm) || [];
let body = netSrcRaw;
importLines.forEach(l => { body = body.replace(l, '// (import stubbed by fuzzcheck)'); });
const exportLine = body.match(/^export \{ net \};[^\n]*$/m);
body = body.replace(exportLine[0], 'return net;');
let factory;
try { factory = new Function('state', 'getActiveCampaign', 'findLandingRoom', 'landingPoint', 'getActiveMap', 'save', 'toast', 'load', 'updateCampaignSelect', 'updateSidebarNav', 'showConfirm', body); }
catch (e) { console.log('FAIL      net.js does not compile as one function: ' + e.message); console.log('0 passed, 1 failed.'); process.exit(1); }

/* ---------- the import stubs ---------- */
let stateMod = null;   // the real state.js module (shared with vtt.js)
const stubs = {
    getActiveCampaign() { const a = stateMod.state.appState; return a && a.campaigns && a.activeCampaignId && Object.prototype.hasOwnProperty.call(a.campaigns, a.activeCampaignId) ? a.campaigns[a.activeCampaignId] : null; },
    getActiveMap() { const c = stubs.getActiveCampaign(); const it = c && c.items && c.activeItemId ? c.items[c.activeItemId] : null; return it && it.type === 'map' ? it : null; },
    findLandingRoom() { return null; }, landingPoint() { return null; },
    save(sync) { const n = window.wpNet; const persist = !(n && (n.foreign || (n.active && n.role === 'client'))) && !(stateMod.state.appState && stateMod.state.appState._foreign); rec.saves.push({ sync: !!sync, persist }); if (n && n.onLocalSave) n.onLocalSave(); },
    toast(m) { rec.toasts.push(String(m)); }, load() { rec.loads++; },
    updateCampaignSelect() {}, updateSidebarNav() {},
    showConfirm(text, cb, opts) { const d = { text: String(text), cb, opts, answered: false }; rec.confirms.push(d); allConfirms.push(d); }
};

/* ---------- a stub fog (fog.js is no module: its per-recipient hooks are stubbed, judging by a fixed rule) ---------- */
function mkFogStub() {
    return {
        fogDropIds(pid, camp, map) { if (!map || !map.fog || map.fog.on !== true) return null; const d = {}; (map.whiteboard || []).forEach(w => { if (w && w.isChar && w.id !== 'tok_' + pid.slice(2) && !w.ownerId) d[w.id] = 1; }); return d; },   // a fogged map: a player sees no creature but their own
        sightSigFor() { return 'S'; }, fogLitFor() { return null; }, fogMarksFor() { return null; }, fogOffFor() { return null; },
        invalidateSeen() {}, invalidateVision() {}, redraw() {}, seenKeyOf(map, w) { return (Number(w.x) || 0) + ',' + (Number(w.y) || 0) + ',' + (Number(w.rot) || 0); },
        moveBlocked(map, w, x0, y0, x1, y1) { return x1 >= 600 && x1 < 610; },   // the wall at x 600..610
        lightCount() { return 0; }, lightMoves() { return false; }, marksForget() {}, canSeePoint() { return true; }, sightUnit() { return 'yd'; }
    };
}

/* ---------- the world ---------- */
const K1 = 'a'.repeat(32), K2 = 'b'.repeat(32), K3 = 'c'.repeat(32);   // K3: a known player who is never at the table (the transport probe's)
/* fold B5: a secret door. The GM's own secret door on the open field (the world's door_secret). Its own name, colour, pattern and picture fill
   are the GM's until it is found; the colour named for the players' wall is all of its look that may travel, and SECRET_SEEN is the piece the
   players are to hold in its place (fogcore secretSeen). secretLeak reads ONE send for what would give the door away: its own name, colour or
   picture, one of the GM's three keys under any piece or message, or the door in any shape but that wall. A copy must read as the walls
   beside it do. So it also reads a send for a wall, a door or a barrier whose keys stand in an order of their own, and for a plain wall that
   carries a name or stands in any shape but the one a copy is made in (wallOdd, below). It is asked of every send a probe causes (fireHost)
   and of every send of the run */
const SECRET_KEYS = ['secret', 'seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip'];   // (the last three: Match a wall, the look of a secret door drawn as a line)
const SD = { id: 'door_secret', name: 'Vault of Embers', color: '#a1b2c3', seen: '#445566', pic: '/saves/images/vault-door.png', group: 'g_room' };   // (group: the group the door stands in on the host, with the wall wall_group. The copy has none)
const SECRET_SEEN = { id: SD.id, type: 'rect', blocksSight: true, sightType: 'wall', color: SD.seen, texture: 'bricks', x: 300, y: 600, w: 50, h: 50, layer: 'back-mid' };   // the copy has NO name, whatever the door is called and whatever look is named for it, and NO group, whatever group the door stands in (fogcore secretSeen)
const sortedPairs = o => JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]]));
const seenAsWall = w => { try { return !!w && typeof w === 'object' && sortedPairs(w) === sortedPairs(SECRET_SEEN); } catch (e) { return false; } };   // key for key the wall, whatever the order: one key more (doorOpen: false, a name) is a door given away
const hasOff = w => { try { return Object.keys(w).some(k => w[k] === false || w[k] === null); } catch (e) { return false; } };   // the trace of a control once used on a piece: Is Character unticked, a lock taken off, a link to a room taken away
const keysInOrder = w => { try { const k = Object.keys(w); return JSON.stringify(k) === JSON.stringify(k.slice().sort()); } catch (e) { return true; } };   // the review of fold B5: a wall, a door and a barrier leave with their keys sorted, so the order says nothing of how a piece was made
/* A plain wall carries NO name on the wire (the second review of fold B5; net.js wireWbItem). Build names a piece by its material whatever colour
   and pattern the GM picked, so no rule could give a secret door's copy the name the walls beside it carry. The host sends a plain wall with
   none, and a copy and a wall of one look differ by id and place alone. plainWall is this suite's own reading of which piece that is: it blocks
   sight or is a see-through barrier, is not typed a door, is no token and no waiting token, leads nowhere, and is no picture and no text box.
   NAMED lists the pieces of the open field that have a name on the host. The plain walls leave with none: a wall, a see-through barrier, a
   wall whose Blocks sight flag is the number 1 (the rule takes any truthy flag) and a wall drawn as a line (Build's Wall line, a town's City
   wall). The others keep theirs: a wall's door, a barrier's door, a wall that is a portal, two portals that block nothing, and one piece for
   each other thing the rule excepts (a wall linked to a node, a picture that blocks sight, a text box that blocks sight, a piece whose barrier
   flag is a word and not true, a token that blocks sight, a waiting token that is a barrier).
   WALL_AS says what each plain wall is in the world. ONE_THING names, for each piece that keeps its name and blocks something, the ONE thing
   that makes it no plain wall: with that thing taken away (butFor) this suite's reading calls it a plain wall. So a rule that stops
   excepting that one thing sends the piece with no name, and the suite sees it */
const plainWall = w => !!w && typeof w === 'object' && !!(w.blocksSight || w.barrier === true) && w.sightType !== 'door' && !w.isChar && !w.waiting && !w.targetMapId && !w.nodeId && w.type !== 'image' && w.type !== 'text';
const NAMED = { walls: { wall1: 'Wall', bars1: 'Force field', wall_one: 'Old wall', wall_line: 'City wall' }, kept: { door1: 'Cellar door', gate1: 'Gate', arch1: 'Archway', portal_vis: 'Stairs', portal_locked: 'Barred stairs', node_wall: 'Hall', img_wall: 'Pillar', text_wall: 'Sign', rail_word: 'Railing', tok_statue: 'Statue', wait_p3: 'Cato' } };
const WALL_AS = { wall1: w => w.type === 'rect' && w.blocksSight === true, bars1: w => w.type === 'rect' && w.barrier === true && !w.blocksSight, wall_one: w => w.type === 'rect' && w.blocksSight === 1 && w.barrier !== true, wall_line: w => w.type === 'path' && w.blocksSight === true };
const ONE_THING = {
    door1: w => { w.sightType = 'wall'; }, gate1: w => { w.sightType = 'wall'; }, arch1: w => { delete w.targetMapId; }, node_wall: w => { delete w.nodeId; }, img_wall: w => { w.type = 'rect'; }, text_wall: w => { w.type = 'rect'; },
    rail_word: w => { w.barrier = true; }, tok_statue: w => { delete w.isChar; }, wait_p3: w => { delete w.waiting; }
};
const butFor = (w, id) => { const c = JSON.parse(JSON.stringify(w)); ONE_THING[id](c); return plainWall(c); };
const NAMED_IDS = Object.keys(NAMED.walls).concat(Object.keys(NAMED.kept));
const hostName = id => (hasOwn(NAMED.walls, id) ? NAMED.walls[id] : NAMED.kept[id]);   // the name a piece has on the host
const wireName = id => (hasOwn(NAMED.walls, id) ? null : NAMED.kept[id]);   // what a player is to hold: no name key at all for a plain wall, its own name for the others
const namesOff = (get, want) => NAMED_IDS.filter(id => get(id) !== want(id)).map(id => [id, get(id)]);   // the pieces whose name is not the one wanted, as [id, what was found]: first in a detail
const NAMED_FLOOR = 100;   // each named piece is seen in at least this many sends of the run before its names are judged
/* A plain wall leaves the host in ONE shape (the third review of fold B5; net.js wireWbItem). A secret door's copy is made in that shape (fogcore
   secretSeen): typed wall, with no group, nothing of a door and nothing of a way through, its hex colour in lower case. So whatever a wall
   carries that a copy cannot follow marks the copy as the one wall without it. A wall from a campaign file has no sightType key, where every
   wall the app makes has one, or a word of its maker's own under it. A file may write a hex colour in upper case. The walls of a room grouped
   with its door carry the room's group. A wall that was once a door or a way through may keep what that left behind. wallOdd reads ONE plain
   wall, by this suite's own reading of which piece that is (plainWall), and says the first thing it holds against the one shape, or '' for
   none. The source writes the type whatever the wall carried, so wallOdd wants it to be exactly wall, never only present.
   SHAPED lists the walls of the open field that carry such a thing ON THE HOST, so that no clause of wallOdd is empty. For each, host says
   what the GM's own piece holds and keeps, wire what a player is to hold in its place, and keys the keys a detail prints.
   wall_schema is a wall as a file with one schema for every piece writes it: every key of a door and of a way through is there and empty
   ('' or 0), so every delete of the source's block has a wall behind it whose key reads as false.
   wall_group and wall_schema are also the copy's twins (TWIN_IDS): each wears the look named for the secret door. A copy and a wall made the same way differ by id and place
   alone (twinOff), and asMade reads a piece less those three, in its own order of keys. What these say of a failure is said in short pieces:
   the suite prints a text of more than 60 characters in a detail as its length */
const WALL_NEVER = ['groupId', 'doorOpen', 'doorLock', 'targetMapId', 'nodeId', 'targetRoomId', 'trap', 'portalIcon', 'portalLock'];   // (targetMapId and nodeId: a plain wall leads nowhere, so either can stand on one only as an empty text or a 0, as a file with one schema for every piece writes them. It leaves with neither key)
const WALL_STALE = ['doorOpen', 'doorLock', 'targetRoomId', 'trap', 'portalIcon', 'portalLock'];   // what a door (doorOpen, doorLock) and a way through (targetRoomId, trap, portalIcon, portalLock) leave behind
const emptyKey = (w, k) => hasOwn(w, k) && (w[k] === '' || w[k] === 0);   // a key that is there and reads as false, and is neither false nor null (those two leave by another rule)
const TWIN_IDS = ['wall_group', 'wall_schema'];   // the walls made in the look named for the secret door: each and the door's copy differ by id and place alone
const capsHex = v => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) && /[A-F]/.test(v);   // a six-digit hex colour with an upper-case letter
function wallOdd(w) {
    try {
        if (!hasOwn(w, 'sightType')) return 'has no type';
        if (w.sightType !== 'wall') return 'is not typed wall';
        const k = WALL_NEVER.find(x => hasOwn(w, x)); if (k) return 'carries the key ' + k;
        if (hasOwn(w, 'locked')) return 'carries a lock (the GM\'s Lock in place)';   // Match a wall, round two: the board draws a locked piece fainter, on a player's screen too, so no plain wall leaves with the key, whatever value it holds
        if (capsHex(w.color)) return 'writes a hex colour in upper case';
        if (w.type === 'path' && w.tip !== 'fill') {   // Match a wall: a wall drawn as a line leaves with the width, the opacity and the nib it is DRAWN with, whatever it holds on the host
            if (!(typeof w.strokeWidth === 'number' && isFinite(w.strokeWidth) && w.strokeWidth > 0 && w.strokeWidth <= 1e15)) return 'is a line whose width is no number above 0';
            if (w.tip !== 'round' && w.tip !== 'square' && w.tip !== 'flat') return 'is a line whose nib is none of round, square and flat';
            if (hasOwn(w, 'opacity') && !(typeof w.opacity === 'number' && w.opacity >= 0 && w.opacity < 1)) return 'is a line that carries an opacity that is no number under 1';
        }
    } catch (e) { return 'cannot be read'; }
    return '';
}
const SHAPED = {
    wall1: { keys: ['sightType'], host: w => w.type === 'rect' && w.blocksSight === true && !hasOwn(w, 'sightType'), wire: w => w.sightType === 'wall' },
    wall_typed: { keys: ['sightType'], host: w => w.type === 'rect' && w.blocksSight === true && w.sightType === 'window', wire: w => w.sightType === 'wall' },
    wall_caps: { keys: ['color'], host: w => w.color === '#8C7B5A' && capsHex(w.color), wire: w => w.color === '#8c7b5a' },
    wall_group: { keys: ['groupId'], host: (w, door) => w.groupId === SD.group && !!door && door.groupId === SD.group && w.color === SD.seen && w.texture === 'bricks', wire: w => !hasOwn(w, 'groupId') },
    wall_stale: { keys: WALL_STALE, host: w => WALL_STALE.every(k => hasOwn(w, k)) && w.doorOpen === true && w.trap === true, wire: w => WALL_STALE.every(k => !hasOwn(w, k)) },
    wall_schema: { keys: WALL_NEVER, host: w => WALL_NEVER.every(k => emptyKey(w, k)) && w.color === SD.seen && w.texture === 'bricks', wire: w => WALL_NEVER.every(k => !hasOwn(w, k)) }
};
const SHAPED_IDS = Object.keys(SHAPED);
const inShape = (id, w) => !!w && typeof w === 'object' && plainWall(w) && wallOdd(w) === '' && SHAPED[id].wire(w);   // the piece a player is to hold for that wall
const shapeFound = (id, w) => {   // what a piece holds under the keys judged, one short text a key it holds: first in a detail
    if (!w) return ['gone'];
    const ks = SHAPED[id].keys, held = ks.filter(k => hasOwn(w, k)).map(k => k + ' ' + JSON.stringify(w[k]));
    return (held.length ? held : [ks.length === 1 ? 'no ' + ks[0] : 'none of its ' + ks.length + ' keys']).concat(plainWall(w) ? [] : ['no plain wall']);
};
const shapesOff = get => SHAPED_IDS.filter(id => !inShape(id, get(id))).map(id => [id, shapeFound(id, get(id))]);   // the walls a player does not hold in the one shape, as [id, what was found]
const hostShapesOff = (get, door) => SHAPED_IDS.filter(id => { const w = get(id); return !w || !plainWall(w) || !SHAPED[id].host(w, door); }).map(id => [id, shapeFound(id, get(id))]);   // the walls that no longer carry their thing on the host
const oddWalls = m => piecesIn(m).filter(plainWall).map(w => [w.id, wallOdd(w)]).filter(p => p[1]);   // every plain wall a message carries in another shape, as [id, what it holds against the shape]
const asMade = w => JSON.stringify(Object.keys(w).filter(k => k !== 'id' && k !== 'x' && k !== 'y').map(k => [k, w[k]]));
function twinOff(door, wall) {   // null where the door's copy and the wall differ by id and place alone, else how they differ
    if (!door || !wall) return { missing: [!door ? 'the copy' : '', !wall ? 'the wall' : ''].filter(Boolean) };
    if (asMade(door) === asMade(wall)) return null;
    const only = (a, b) => Object.keys(a).filter(k => !hasOwn(b, k)), differ = Object.keys(door).filter(k => k !== 'id' && k !== 'x' && k !== 'y' && hasOwn(wall, k) && JSON.stringify(door[k]) !== JSON.stringify(wall[k]));
    if (!only(door, wall).length && !only(wall, door).length && !differ.length) return { order: [Object.keys(door), Object.keys(wall)] };   // the same keys and values, in another order
    return { onlyCopy: only(door, wall), onlyWall: only(wall, door), differ: differ.map(k => [k, door[k], wall[k]]) };
}
const bareOfSecret = w => !!w && typeof w === 'object' && SECRET_KEYS.every(k => !Object.prototype.hasOwnProperty.call(w, k));
/* Match a wall (the owner, 2026-10-12, by prompt: "The door is then seen with the colour, width and opacity of the wall line it meets"). A secret
   door DRAWN AS A LINE may carry three more keys of the GM's own, seenWidth, seenOpacity and seenTip, which Properties' Match press sets from
   the wall line the door meets (fogcore secretMatch). The players then hold a wall line there at that wall's colour, width, opacity and nib,
   and the door's own never leave the host. LINE_DOORS are the world's three, each end to end with the wall line it was matched to (wall): own
   is what the GM drew under strokeWidth, opacity and tip, seen what the keys name, and LINE_SEEN the piece a player is to hold in its place.
   door_line has a width, an opacity and a nib of its own, each another than its wall's, so each is replaced where it stands. It also has a
   name, a lock and a group. door_file has a width and an opacity of its own and no nib, beside a wall as a campaign file writes one
   (wall_file: a width that is text, an opacity of 1, no nib, no type, a colour in upper case): its copy holds that width as a number, NO
   opacity at all and the round nib. door_bare has none of the three, so each is added to its copy. On the wire a copy and its wall differ by
   id and place alone (twinOff), since the host sends a wall drawn as a line with the width, the opacity and the nib it is DRAWN with (net.js
   wireWbItem): a width that is no number above 0 draws 3, an opacity that is no number under 1 draws solid and is no key, and a nib that is
   neither square nor flat draws round.
   LINED says, for each line of the open field that this suite reads, what it holds under strokeWidth, opacity and tip ON THE HOST (host) and
   what a player is to hold (wire): a key that is not named is not there. The first eleven are plain walls drawn as lines. The last three
   (made) are none, and keep what they carry: a filled region that is a wall (its tip is fill), a line that blocks nothing and a door drawn as
   a line. RELICS are three pieces that each kept ONE of the three keys with no tick, as a save may hold them: a wall line, an open door drawn
   as a line and a plain shape. No send holds the key, whichever of the three it is */
const LINE_KEYS = ['strokeWidth', 'opacity', 'tip'], SEEN_LINE_KEYS = ['seenWidth', 'seenOpacity', 'seenTip'];
const LINE_DOORS = {
    door_line: { wall: 'wall_meet', y: 100, name: 'Postern of Ash', color: '#c3b2a1', own: { strokeWidth: 13, opacity: 0.4, tip: 'square' }, seen: { color: '#5a5560', width: 6, opacity: 0.7, tip: 'flat' }, more: { layer: 'back-mid', z: 10 } },
    door_file: { wall: 'wall_file', y: 200, color: '#c3b2a2', own: { strokeWidth: 13, opacity: 0.4 }, seen: { color: '#6a6570', width: 5, opacity: 1, tip: 'round' }, more: {} },
    door_bare: { wall: 'wall_thin', y: 300, color: '#c3b2a3', own: {}, seen: { color: '#2b2d31', width: 4, opacity: 0.5, tip: 'square' }, more: { z: 35 } }
};
const LINE_DOOR_IDS = Object.keys(LINE_DOORS);
const lineLook = look => Object.assign({ color: look.color, strokeWidth: look.width, tip: look.tip }, look.opacity < 1 ? { opacity: look.opacity } : {});   // a look as a wall line carries it on the wire: a solid line has no opacity key at all
/* Match a wall, round two. LINE_DOORS2 are two more secret doors drawn as lines, each end to end with its wall line at x 1500 to 1620, clear of
   the three above. door_freeline is NOT locked and its wall, wall_lockline, is locked in place: on the wire the two differ by id and place
   alone, since no plain wall leaves with a lock. door_clear was matched to wall_clear, a wall line whose colour is the word transparent: its
   seenColor is that word, and the players hold a wall line there that draws nothing. Its far end touches wall_cross, a thick wall line that
   stands ACROSS it and comes before wall_clear in the map's list: fogcore secretMatch answers the wall a door runs along, so the look named
   for door_clear is wall_clear's and not the cross wall's.
   LOCK_WALLS are the plain walls of the world that hold the key locked on the host, each with its value there: none leaves with the key.
   LOCK_DOORS are the secret doors the GM locked in place: their copies are plain walls, and leave with none. LOCK_KEPT are locked pieces that
   are no plain wall and keep their lock on the wire: a door that is no secret, a token, a shape that blocks nothing, a wall that leads to
   another map, and two drawings of a player's own (the well-formed map copy sends one back redrawn and leaves the other out) */
const LINE_DOORS2 = {
    door_freeline: { wall: 'wall_lockline', x: 1560, y: 100, color: '#c3b2a6', own: { strokeWidth: 11, opacity: 0.6, tip: 'square' }, seen: { color: '#5b5661', width: 6, opacity: 1, tip: 'round' }, more: {} },
    door_clear: { wall: 'wall_clear', x: 1560, y: 300, color: '#c3b2a5', own: { strokeWidth: 11, opacity: 0.6, tip: 'square' }, seen: { color: 'transparent', width: 6, opacity: 1, tip: 'round' }, more: {} }
};
const LINE_DOOR2_IDS = Object.keys(LINE_DOORS2), LINE_ALL = Object.assign({}, LINE_DOORS, LINE_DOORS2), LINE_ALL_IDS = Object.keys(LINE_ALL);
const LOCK_WALLS = { wall_lockline: true, wall_lockbox: 1, stroke_lockwall: true, stroke_lockout: true, stroke_lockbar: true, wall_schema: 0, wall_one: false };   // (stroke_lockout: round three, a second line of a player's own that the GM made a wall and locked)
const LOCK_DOORS = { door_secret: true, door_line: true };
const LOCK_KEPT = { door_held: true, tok_held: true, rug_held: true, arch_held: true, stroke_locked: true, stroke_lockgone: true };
const LOCK_WALL_IDS = Object.keys(LOCK_WALLS), LOCK_DOOR_IDS = Object.keys(LOCK_DOORS), LOCK_KEPT_IDS = Object.keys(LOCK_KEPT);
const lockOf = w => (!w ? 'gone' : hasOwn(w, 'locked') ? w.locked : 'none');   // what a piece holds under the key of the GM's Lock in place: 'none' where the key is not there at all
const lockedWalls = m => piecesIn(m).filter(w => plainWall(w) && hasOwn(w, 'locked')).map(w => w.id);   // every plain wall a message carries with the key
const LINE_SEEN = {};
LINE_ALL_IDS.forEach(id => { const d = LINE_ALL[id]; LINE_SEEN[id] = Object.assign({ id, type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [60, 0]], x: d.x || 1260, y: d.y, w: 60, h: 1, baseW: 60, baseH: 1 }, d.more, lineLook(d.seen)); });
const heldAs = (w, want) => { try { return !!w && typeof w === 'object' && sortedPairs(w) === sortedPairs(want); } catch (e) { return false; } };   // key for key the piece wanted, whatever the order: one key more is a door given away
const lineHeld = w => JSON.stringify(LINE_KEYS.filter(k => hasOwn(w, k)).map(k => [k, w[k]]));   // what a piece holds under the three keys of a line's look, and which of the three it has
function lineDoorOff(w) {   // what a piece sent in the place of a secret door drawn as a line holds against the wall line the players are to hold there: the door's own width, opacity or nib first
    try {
        const d = LINE_ALL[w.id], want = LINE_SEEN[w.id];
        if (hasOwn(d.own, 'strokeWidth') && w.strokeWidth === d.own.strokeWidth) return 'a secret door drawn as a line at its own width';
        if (hasOwn(d.own, 'opacity') && w.opacity === d.own.opacity) return 'a secret door drawn as a line at its own opacity';
        if (hasOwn(d.own, 'tip') && w.tip === d.own.tip) return 'a secret door drawn as a line with its own nib';
        const k = ['color'].concat(LINE_KEYS).find(x => JSON.stringify(w[x]) !== JSON.stringify(want[x])); if (k) return 'a secret door drawn as a line whose ' + k + ' is not the matched wall\'s';
    } catch (e) {}
    return 'a secret door drawn as a line in a shape that is not the wall line the players are to hold';
}
const LINED = {
    wall_line: { host: { strokeWidth: 8 }, wire: { strokeWidth: 8, tip: 'round' } },   // a town's City wall: a number for its width and no nib named
    stroke_wall: { host: { strokeWidth: 3 }, wire: { strokeWidth: 3, tip: 'round' } },   // a player's own line that the GM made a wall
    stroke_bar: { host: { strokeWidth: 3 }, wire: { strokeWidth: 3, tip: 'round' } },   // ...and one made a see-through barrier
    wall_meet: { host: { strokeWidth: 6, opacity: 0.7, tip: 'flat' }, wire: { strokeWidth: 6, opacity: 0.7, tip: 'flat' } },   // as the app makes one: it leaves as it is
    wall_file: { host: { strokeWidth: '5', opacity: 1 }, wire: { strokeWidth: 5, tip: 'round' } },   // as a file writes one: a width that is text, an opacity of 1, no nib
    wall_thin: { host: { strokeWidth: 4, opacity: 0.5, tip: 'square' }, wire: { strokeWidth: 4, opacity: 0.5, tip: 'square' } },
    line_junk: { host: { strokeWidth: 'thick', opacity: 'faint', tip: 'brush' }, wire: { strokeWidth: 3, tip: 'round' } },   // a word for a width, a word for an opacity, a nib the app does not know
    line_zero: { host: { strokeWidth: 0, opacity: -2, tip: 'square' }, wire: { strokeWidth: 3, opacity: 0, tip: 'square' } },   // a width of 0 draws 3 wide, an opacity below 0 draws at 0
    line_huge: { host: { strokeWidth: '1e16', opacity: '0.25', tip: 'flat' }, wire: { strokeWidth: 1e15, opacity: 0.25, tip: 'flat' } },   // a width past the bound, and an opacity that is text
    line_bar: { host: { strokeWidth: '7.5px', opacity: 2 }, wire: { strokeWidth: 7.5, tip: 'round' } },   // a see-through barrier drawn as a line: a width with its unit, an opacity past 1, no nib
    relic_w: { host: { strokeWidth: 6, tip: 'square' }, wire: { strokeWidth: 6, tip: 'square' } },   // the wall line that kept seenWidth: its own width leaves, and nothing of the key
    region_wall: { made: true, host: { strokeWidth: '5', opacity: 1, tip: 'fill' }, wire: { strokeWidth: '5', opacity: 1, tip: 'fill' } },   // a filled region that is a wall: no line
    line_plain: { made: true, host: { strokeWidth: '5', opacity: 1 }, wire: { strokeWidth: '5', opacity: 1 } },   // a line that blocks nothing: no wall
    door_pen: { made: true, host: { strokeWidth: '5', opacity: 1 }, wire: { strokeWidth: '5', opacity: 1 } }   // a door drawn as a line: no plain wall
};
const LINED_IDS = Object.keys(LINED), LINED_WALLS = LINED_IDS.filter(id => !LINED[id].made), LINED_MADE = LINED_IDS.filter(id => LINED[id].made === true);
const wallLineOn = w => plainWall(w) && w.type === 'path' && w.tip !== 'fill';   // this suite's own reading of a plain wall drawn as a line
const linesOff = (get, side) => LINED_IDS.filter(id => { const w = get(id); return !w || lineHeld(w) !== lineHeld(LINED[id][side]); }).map(id => { const w = get(id); return [id, w ? LINE_KEYS.map(k => (hasOwn(w, k) ? w[k] : 'none')) : 'gone']; });   // the lines that do not hold what is told of them, as [id, what was found under the three keys]
const RELICS = { relic_w: 'seenWidth', relic_o: 'seenOpacity', relic_t: 'seenTip' }, RELIC_IDS = Object.keys(RELICS);
function piecesIn(m) {   // every board piece a message carries: a whole map's, a delta's, a catch-up's, a snapshot's
    const out = [], take = a => { if (Array.isArray(a)) a.forEach(w => { if (w && typeof w === 'object') out.push(w); }); };
    if (!m || typeof m !== 'object') return out;
    try {
        if (m.item && typeof m.item === 'object') take(m.item.whiteboard);
        if (m.whiteboard && typeof m.whiteboard === 'object') take(m.whiteboard.set);
        if (Array.isArray(m.add)) take(m.add.map(a => a && a.item));
        const cs = m.appState && m.appState.campaigns;
        if (cs && typeof cs === 'object') Object.keys(cs).forEach(c => { const its = cs[c] && cs[c].items; if (its && typeof its === 'object') Object.keys(its).forEach(i => { if (its[i] && typeof its[i] === 'object') take(its[i].whiteboard); }); });
    } catch (e) {}
    return out;
}
function secretLeak(m) {   // '' for a send that gives nothing of the secret door away, else what it holds
    let j; try { j = JSON.stringify(m); } catch (e) { return ''; }
    if (typeof j !== 'string') return '';
    if (j.indexOf(SD.name) >= 0) return 'the door\'s own name';
    if (/#a1b2c3/i.test(j)) return 'the door\'s own colour';
    if (j.indexOf(SD.pic) >= 0) return 'the door\'s own picture';
    if (LINE_DOOR_IDS.some(id => !!LINE_DOORS[id].name && j.indexOf(LINE_DOORS[id].name) >= 0)) return 'the own name of a secret door drawn as a line';   // Match a wall
    if (/#c3b2a[1-9]/i.test(j)) return 'the own colour of a secret door drawn as a line';   // (1 to 3: the world's first three. 5 and 6: the two of round two. 4, 7 and 8: doors the suite lays for a while)
    const km = j.match(/"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip)":/); if (km) return 'the GM\'s key ' + km[1];
    if (j.indexOf(SD.id) >= 0 && piecesIn(m).some(w => w.id === SD.id && !seenAsWall(w))) return 'the door in a shape that is not the wall the players are to hold';
    { const off = piecesIn(m).find(w => hasOwn(LINE_SEEN, w.id) && !heldAs(w, LINE_SEEN[w.id])); if (off) return lineDoorOff(off); }   // Match a wall: a secret door drawn as a line in any shape but the wall line it was matched to
    if (piecesIn(m).some(w => (w.blocksSight || w.barrier === true) && !keysInOrder(w))) return 'a wall, a door or a barrier whose keys stand in an order of their own';
    if (piecesIn(m).some(w => plainWall(w) && hasOwn(w, 'name'))) return 'a plain wall that carries a name';
    if (piecesIn(m).some(w => (w.blocksSight || w.barrier === true) && hasOff(w))) return 'a wall, a door or a barrier that carries a key whose value is false or null';
    { const odd = piecesIn(m).filter(plainWall).map(wallOdd).find(Boolean); if (odd) return 'a plain wall that ' + odd; }   // the third review of fold B5: a plain wall in any shape but the one a copy is made in
    return '';
}
function mkCampaign(SC, F) {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8'));
    fx.rolls.push({ id: 'r_heal', label: 'Heal', apply: [{ f: 'f_hp', formula: '2', add: true }] });
    fx.fields.push({ id: 'f_gmword', key: 'GMWord', label: 'GM word', kind: 'text', edit: 'gm', vis: 'gm', hover: false }, { id: 'f_gmtxt', key: 'GMTxt', label: 'GM text', kind: 'text', edit: 'gm', vis: 'all', hover: false });   // item 35: a text only the GM sees and edits (no look of a player's reaches it, and its words never leave)
    fx.combat = { light: { presets: [{ name: 'Torch', bright: 2, dim: 4, unit: 'yd', pick: true }] } };
    const sys = SC.cleanSystem(fx, { F, gmView: true, libCats: {} });
    const tok = (id, o) => Object.assign({ id, type: 'circle', isChar: true, w: 50, h: 50, layer: 'middle' }, o);
    const camp = {
        id: 'c1', name: 'Fuzz Campaign', activeItemId: 'm_open', system: sys,
        players: { u_p1: { name: 'Ayla', key: K1 }, u_p2: { name: 'Bram', key: K2 }, u_p3: { name: 'Cato', key: K3 } }, bannedPlayers: {}, sessionLog: [], turnRules: {},
        chars: {
            c_p1: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', npc: false, values: { f_str: 14, f_dex: 12, f_gmfig: 7, f_hp: { cur: 10, max: 12 }, f_inv: [], f_class: 'Ranger', f_gmword: 'the secret word', f_gmtxt: 'a title the GM gave' }, updated: 1 },
            c_p2: { id: 'c_p2', name: 'Bram', ownerId: 'u_p2', npc: false, values: { f_str: 9, f_gmfig: 3, f_class: 'Bard' }, updated: 1 },
            c_npc: { id: 'c_npc', name: 'Orc', npc: true, values: { f_str: 16, f_gmfig: 99, f_class: 'Brute' }, updated: 1 }
        },
        items: {
            m_open: { id: 'm_open', type: 'map', meta: { title: 'Open Field', gridType: 'square' }, fog: { cell: 50 }, rooms: [], links: [], whiteboard: [
                tok('tok_p1', { charId: 'c_p1', ownerId: 'u_p1', charName: 'Ayla', name: 'Ayla', x: 100, y: 100 }),
                tok('tok_p2', { charId: 'c_p2', ownerId: 'u_p2', charName: 'Bram', name: 'Bram', x: 100, y: 300 }),
                tok('tok_p1plain', { ownerId: 'u_p1', charName: 'Plain', name: 'Plain', x: 100, y: 160 }),
                tok('tok_npc', { charId: 'c_npc', charName: 'Orc', name: 'Orc', x: 300, y: 300, fx: [{ id: 'x_1', n: 'Raging', i: 'icon:fire', on: 1 }] }),
                tok('tok_npc2', { charName: 'Goblin', name: 'Goblin', x: 350, y: 300 }), tok('tok_npc3', { charName: 'Wolf', name: 'Wolf', x: 400, y: 300 }), tok('tok_npc4', { charName: 'Bat', name: 'Bat', x: 450, y: 300 }),
                tok('tok_hidden', { charName: 'Assassin', name: 'Assassin', hidden: true, x: 400, y: 400, gmInfo: 'secret plan' }),
                { id: 'portal_vis', type: 'rect', targetMapId: 'm_fog', name: 'Stairs', x: 500, y: 500, w: 50, h: 50, layer: 'bottom' },
                { id: 'portal_locked', type: 'rect', targetMapId: 'm_fog', portalLock: true, name: 'Barred stairs', x: 250, y: 100, w: 50, h: 50, layer: 'bottom' },   // a portal's own lock (the owner, 2026-10-03): a portal the GM locked for players, three clear cells from tok_p1 — no message of a player's may move anyone through it, set its lock or clear it
                { id: 'trap1', type: 'rect', hidden: true, trap: true, targetMapId: 'm_fog', x: 200, y: 100, w: 50, h: 50, layer: 'bottom' },
                { id: 'door1', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, name: 'Cellar door', x: 150, y: 150, w: 50, h: 50 },   // a named door: a door keeps its name on the wire
                { id: 'door_locked', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, doorLock: true, x: 50, y: 150, w: 50, h: 50 },
                { id: 'wall1', type: 'rect', blocksSight: true, name: 'Wall', x: 600, y: 0, w: 10, h: 400 },   // a plain wall that has a name on the host, as a wall Build lays has: it leaves the host with none (the second review of fold B5). It has NO sightType key, as a wall from a campaign file has none: it leaves typed wall (the third review)
                { id: 'gate1', type: 'rect', barrier: true, sightType: 'door', doorOpen: false, name: 'Gate', x: 150, y: 50, w: 50, h: 50 },   // see-through barriers (1.5.1): a barrier's door beside tok_p1, and a plain barrier — no message but a door request may change either
                { id: 'bars1', type: 'rect', barrier: true, name: 'Force field', x: 650, y: 0, w: 10, h: 400 },   // (a named plain barrier leaves with no name, as the named wall does)
                { id: 'arch1', type: 'rect', blocksSight: true, targetMapId: 'm_fog', name: 'Archway', x: 800, y: 600, w: 50, h: 50, layer: 'bottom' },   // a wall that leads somewhere keeps its name on the wire, as a door does: only a plain wall leaves with none
                { id: 'wall_one', type: 'rect', blocksSight: 1, name: 'Old wall', isChar: false, locked: false, x: 900, y: 0, w: 10, h: 200 },   // the second reader: a wall whose flag is the number 1, as a file may hold one. The rule takes any truthy flag, so it leaves with no name too
                { id: 'wall_line', type: 'path', blocksSight: true, sightType: 'wall', name: 'City wall', nodeId: null, pts: [[0, 0], [40, 0]], color: '#4a4753', strokeWidth: 8, x: 900, y: 250, w: 40, h: 1, baseW: 40, baseH: 1, z: 35 },   // a wall drawn as a line (Build's Wall line, a town's City wall): a plain wall whatever kind of piece it is
                // one piece for each other thing the name rule excepts. Each would be a plain wall but for the one thing named (ONE_THING), and keeps its name on the wire
                { id: 'node_wall', type: 'rect', blocksSight: true, nodeId: 'n_hall', name: 'Hall', x: 900, y: 300, w: 50, h: 50 },   // a wall linked to a node
                { id: 'img_wall', type: 'image', blocksSight: true, src: '/saves/images/pic.png', name: 'Pillar', x: 900, y: 400, w: 50, h: 50, layer: 'bottom' },   // a picture that blocks sight
                { id: 'text_wall', type: 'text', blocksSight: true, text: 'Keep out', name: 'Sign', x: 900, y: 500, w: 60, h: 30 },   // a text box that blocks sight
                { id: 'rail_word', type: 'rect', barrier: 'yes', name: 'Railing', x: 900, y: 560, w: 60, h: 10 },   // a barrier flag that is a word: a barrier counts only as true
                tok('tok_statue', { charName: 'Statue', name: 'Statue', blocksSight: true, x: 900, y: 620 }),   // a token that blocks sight
                { id: 'wait_p3', type: 'circle', waiting: 1, ownerId: 'u_p3', name: 'Cato', barrier: true, x: 900, y: 700, w: 50, h: 50, layer: 'middle' },   // a waiting token that is a barrier
                // the third review of fold B5: a plain wall leaves in ONE shape. Each of these five carries, on the host, one more thing a secret door's copy cannot follow (wall1 above carries the first: no sightType key). SHAPED says what each holds here and what a player is to hold
                { id: 'wall_typed', type: 'rect', blocksSight: true, sightType: 'window', color: '#4a4753', x: 1000, y: 220, w: 10, h: 60 },   // a wall typed with a word the app does not know, as a file may write one: no door, so a plain wall, and it leaves typed wall whatever it carried
                { id: 'wall_caps', type: 'rect', blocksSight: true, sightType: 'wall', color: '#8C7B5A', x: 1000, y: 0, w: 10, h: 200 },   // a wall whose hex colour a file wrote in upper case: it leaves in #8c7b5a
                { id: 'wall_group', type: 'rect', blocksSight: true, sightType: 'wall', groupId: SD.group, color: SD.seen, texture: 'bricks', x: 1000, y: 300, w: 50, h: 50, layer: 'back-mid' },   // a wall of the room the secret door was grouped with, in the look named for the door: it leaves with no group, and then it and the door's copy differ by id and place alone
                { id: 'wall_stale', type: 'rect', blocksSight: true, sightType: 'wall', doorOpen: true, doorLock: true, targetRoomId: 'n_cellar', trap: true, portalIcon: 'stairs', portalLock: true, color: '#4a4753', x: 1000, y: 400, w: 10, h: 150 },   // a wall that was once a door and a way through and keeps what those left behind: it leaves with none of the six keys. It leads nowhere (no targetMapId, no nodeId), so it is no portal and no trap on the host
                { id: 'wall_schema', type: 'rect', blocksSight: true, sightType: 'wall', groupId: '', doorOpen: 0, doorLock: 0, targetMapId: '', nodeId: '', targetRoomId: '', trap: 0, portalIcon: '', portalLock: 0, locked: 0, color: SD.seen, texture: 'bricks', x: 1000, y: 600, w: 50, h: 50, layer: 'back-mid' },   // (locked: 0, round two: the key of the GM's Lock in place, there and empty too. No plain wall leaves with it.) a wall as a file with one schema for every piece writes it, in the look named for the secret door: every key of a door and of a way through is there and empty. It leaves with none of the nine, and then it and the door's copy differ by id and place alone
                { id: 'door_secret', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, locked: true, color: SD.color, name: SD.name, groupId: SD.group, seenColor: SD.seen, seenWidth: 9, seenOpacity: 0.5, seenTip: 'flat', texture: 'planks', texSrc: SD.pic, texTile: 2, x: 300, y: 600, w: 50, h: 50, layer: 'back-mid' },   // fold B5: a secret door (the map builder): the GM's own, clear of every other piece and of the probes' paths. (seenWidth, seenOpacity, seenTip: the three keys of Match a wall count only on a door drawn as a line. Here they count for nothing, and travel no more than the others. locked, round two: the GM locked the door in place, and the walls made in its look are not locked. Its copy carries no lock.) The players hold a wall there in the colour named for it; its own name, colour, pattern and picture never leave the host, and no message of a player's opens it, finds it or changes it
                // Match a wall (the owner, 2026-10-12): three secret doors DRAWN AS LINES, each end to end with the wall line it was matched to (LINE_DOORS). A door's own colour, width, opacity and nib never leave the host: the players hold a wall line there at the matched wall's. All of it stands clear of every other piece and of the probes' paths
                { id: 'wall_meet', type: 'path', blocksSight: true, sightType: 'wall', name: 'Curtain wall', pts: [[0, 0], [60, 0]], color: '#5a5560', strokeWidth: 6, opacity: 0.7, tip: 'flat', layer: 'back-mid', x: 1200, y: 100, w: 60, h: 1, baseW: 60, baseH: 1, z: 10 },   // a wall line as the app makes one: faint, 6 px wide, drawn with the flat nib
                { id: 'door_line', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, doorLock: true, locked: true, secret: true, name: LINE_DOORS.door_line.name, groupId: 'g_yard', pts: [[0, 0], [60, 0]], color: LINE_DOORS.door_line.color, strokeWidth: 13, opacity: 0.4, tip: 'square', seenColor: '#5a5560', seenWidth: 6, seenOpacity: 0.7, seenTip: 'flat', layer: 'back-mid', x: 1260, y: 100, w: 60, h: 1, baseW: 60, baseH: 1, z: 10 },   // thicker and fainter than its wall and drawn with another nib, with a name, a lock and a group (and, round two, the GM's Lock in place, which its wall line does not have)
                { id: 'door_pen', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, pts: [[0, 0], [60, 0]], color: '#6b4a2a', strokeWidth: '5', opacity: 1, x: 1260, y: 140, w: 60, h: 1, baseW: 60, baseH: 1 },   // a door drawn as a line that is no secret, in the cell under door_line: a door leaves as it is, here with a width that is text and an opacity of 1
                { id: 'wall_file', type: 'path', blocksSight: true, pts: [[0, 0], [60, 0]], color: '#6A6570', strokeWidth: '5', opacity: 1, x: 1200, y: 200, w: 60, h: 1, baseW: 60, baseH: 1 },   // a wall line as a campaign file writes one: no type, a colour in upper case, a width that is text, an opacity of 1 and no nib. It leaves 5 wide as a number, with no opacity and the round nib
                { id: 'door_file', type: 'path', blocksSight: true, sightType: 'door', secret: true, pts: [[0, 0], [60, 0]], color: LINE_DOORS.door_file.color, strokeWidth: 13, opacity: 0.4, seenColor: '#6a6570', seenWidth: 5, seenOpacity: 1, seenTip: 'round', x: 1260, y: 200, w: 60, h: 1, baseW: 60, baseH: 1 },   // fainter than its solid wall: the copy carries NO opacity. It has no nib of its own, so the matched one is added
                { id: 'wall_thin', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [60, 0]], color: '#2b2d31', strokeWidth: 4, opacity: 0.5, tip: 'square', x: 1200, y: 300, w: 60, h: 1, baseW: 60, baseH: 1, z: 35 },
                { id: 'door_bare', type: 'path', blocksSight: true, sightType: 'door', secret: true, pts: [[0, 0], [60, 0]], color: LINE_DOORS.door_bare.color, seenColor: '#2b2d31', seenWidth: 4, seenOpacity: 0.5, seenTip: 'square', x: 1260, y: 300, w: 60, h: 1, baseW: 60, baseH: 1, z: 35 },   // no width, opacity or nib of its own: each of the three is added to its copy
                // the lines of the sweep (LINED): a plain wall drawn as a line leaves with the width, the opacity and the nib it is DRAWN with, whatever it holds on the host.
                // Round three: a line reaches a door as far as half its drawn width, held to 100 px, and 12 px. So the three thin lines stand 70 px apart, each with room
                // for a door laid end to end with it that meets no other, and the line whose width is past any board (line_huge) stands at y 760, far from every door
                { id: 'line_junk', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#4a4753', strokeWidth: 'thick', opacity: 'faint', tip: 'brush', x: 1200, y: 400, w: 30, h: 1, baseW: 30, baseH: 1 },   // a word for a width, a word for an opacity and a nib the app does not know: 3 wide, solid, round
                { id: 'line_zero', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#4a4753', strokeWidth: 0, opacity: -2, tip: 'square', x: 1300, y: 400, w: 30, h: 1, baseW: 30, baseH: 1 },   // a width of 0 and an opacity below 0: 3 wide, at an opacity of 0
                { id: 'line_huge', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#4a4753', strokeWidth: '1e16', opacity: '0.25', tip: 'flat', x: 1280, y: 760, w: 30, h: 1, baseW: 30, baseH: 1 },   // a width past the bound, as text, and an opacity that is text. It is drawn 1e15 wide, and reaches a door as a line 200 wide does (round three), so it stands 260 px and more from every other line
                { id: 'line_bar', type: 'path', barrier: true, pts: [[0, 0], [30, 0]], color: '#4a4753', strokeWidth: '7.5px', opacity: 2, x: 1400, y: 400, w: 30, h: 1, baseW: 30, baseH: 1 },   // a see-through barrier drawn as a line, with its width's unit, an opacity past 1 and no nib
                { id: 'region_wall', type: 'path', tip: 'fill', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0], [30, 30], [0, 30]], color: '#4a4753', strokeWidth: '5', opacity: 1, x: 1200, y: 440, w: 30, h: 30, baseW: 30, baseH: 30 },   // a filled region that is a wall is no line: it keeps what it carries
                { id: 'line_plain', type: 'path', pts: [[0, 0], [30, 0]], color: '#ffffff', strokeWidth: '5', opacity: 1, x: 1240, y: 440, w: 30, h: 1, baseW: 30, baseH: 1, z: 35 },   // a line of the GM's that blocks nothing is no wall: it keeps what it carries
                // three pieces that each kept ONE of the three keys with no tick, as a save may hold them (RELICS): the key never leaves, whichever it is
                { id: 'relic_w', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#4a4753', strokeWidth: 6, tip: 'square', seenWidth: 2, x: 1200, y: 500, w: 30, h: 1, baseW: 30, baseH: 1 },   // a wall line that was once a matched secret door
                { id: 'relic_o', type: 'path', blocksSight: true, sightType: 'door', doorOpen: true, pts: [[0, 0], [30, 0]], color: '#6b4a2a', strokeWidth: 6, tip: 'square', seenOpacity: 0.2, x: 1240, y: 500, w: 30, h: 1, baseW: 30, baseH: 1 },   // a door drawn as a line that was found, and stands open
                { id: 'relic_t', type: 'rect', color: '#333333', seenTip: 'flat', x: 1280, y: 500, w: 30, h: 30, layer: 'bottom' },   // a plain shape
                // Match a wall, round two (LINE_DOORS2, LOCK_WALLS, LOCK_KEPT). All of it stands at x 1500 and beyond, clear of every other piece and of the probes' paths
                { id: 'wall_lockline', type: 'path', blocksSight: true, sightType: 'wall', locked: true, pts: [[0, 0], [60, 0]], color: '#5b5661', strokeWidth: 6, tip: 'round', x: 1500, y: 100, w: 60, h: 1, baseW: 60, baseH: 1 },   // a wall line the GM locked in place: the players are sent no lock, and the host's own piece keeps it
                { id: 'door_freeline', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, pts: [[0, 0], [60, 0]], color: LINE_DOORS2.door_freeline.color, strokeWidth: 11, opacity: 0.6, tip: 'square', seenColor: '#5b5661', seenWidth: 6, seenOpacity: 1, seenTip: 'round', x: 1560, y: 100, w: 60, h: 1, baseW: 60, baseH: 1 },   // a secret door that is NOT locked, matched to the locked wall line: a lock on the wall alone would tell the two apart
                { id: 'wall_lockbox', type: 'rect', blocksSight: true, sightType: 'wall', locked: 1, color: '#4a4753', x: 1500, y: 160, w: 10, h: 60 },   // a wall box whose lock is the number 1, as a file may hold one: the key goes whatever its value
                { id: 'wall_cross', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [0, 60]], color: '#101014', strokeWidth: 20, tip: 'square', x: 1620, y: 270, w: 1, h: 60, baseW: 1, baseH: 60 },   // a thick wall line that stands across the far end of door_clear, BEFORE wall_clear in this list: the door runs along wall_clear, so that wall answers
                { id: 'wall_clear', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [60, 0]], color: 'transparent', strokeWidth: 6, tip: 'round', x: 1500, y: 300, w: 60, h: 1, baseW: 60, baseH: 1 },   // a see-through wall line, as a GM draws one over a map that is a picture: its colour is the word transparent
                { id: 'door_clear', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, pts: [[0, 0], [60, 0]], color: LINE_DOORS2.door_clear.color, strokeWidth: 11, opacity: 0.6, tip: 'square', seenColor: 'transparent', seenWidth: 6, seenOpacity: 1, seenTip: 'round', x: 1560, y: 300, w: 60, h: 1, baseW: 60, baseH: 1 },   // the secret door matched to it: seen as nothing drawn, 6 wide with the round nib, where its own look is a colour at 0.6
                { id: 'door_held', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, locked: true, color: '#6b4a2a', x: 1500, y: 400, w: 50, h: 50 },   // the pieces that KEEP their lock on the wire (LOCK_KEPT): a door that is no secret,
                { id: 'rug_held', type: 'rect', locked: true, color: '#333333', x: 1560, y: 400, w: 30, h: 30, layer: 'bottom' },   // a shape that blocks nothing,
                tok('tok_held', { charName: 'Golem', name: 'Golem', locked: true, x: 1500, y: 480 }),   // a token of the GM's,
                { id: 'arch_held', type: 'rect', blocksSight: true, targetMapId: 'm_fog', locked: true, x: 1560, y: 480, w: 50, h: 50, layer: 'bottom' },   // a wall that leads to another map,
                { id: 'stroke_locked', type: 'path', byPlayer: true, ownerId: 'u_p1', locked: true, pts: [[0, 0], [20, 20]], color: '#ffffff', strokeWidth: 3, x: 740, y: 200, w: 20, h: 20, baseW: 20, baseH: 20, z: 35 },   // and two drawings of u_p1's own that the GM locked in place and that block nothing: frozen for their player, who is still told of the lock
                { id: 'stroke_lockgone', type: 'path', byPlayer: true, ownerId: 'u_p1', locked: true, pts: [[0, 0], [20, 0]], color: '#ffffff', strokeWidth: 3, x: 740, y: 240, w: 20, h: 1, baseW: 20, baseH: 1, z: 35 },
                { id: 'stroke_lockwall', type: 'path', byPlayer: true, ownerId: 'u_p1', blocksSight: true, sightType: 'wall', locked: true, pts: [[0, 0], [30, 0]], color: '#ffffff', strokeWidth: 3, x: 700, y: 140, w: 30, h: 1, baseW: 30, baseH: 1, z: 35 },   // a line of u_p1's own that the GM made a wall AND locked in place, and one made a barrier and locked: plain walls, so the players are sent no lock, and still no message of a player's erases, redraws, moves or unlocks either
                { id: 'stroke_lockbar', type: 'path', byPlayer: true, ownerId: 'u_p1', barrier: true, locked: true, pts: [[0, 0], [0, 30]], color: '#ffffff', strokeWidth: 3, x: 720, y: 160, w: 1, h: 30, baseW: 1, baseH: 30, z: 35 },
                { id: 'stroke_lockout', type: 'path', byPlayer: true, ownerId: 'u_p1', blocksSight: true, sightType: 'wall', locked: true, pts: [[0, 0], [30, 0]], color: '#ffffff', strokeWidth: 3, x: 700, y: 260, w: 30, h: 1, baseW: 30, baseH: 1, z: 35 },   // round three: a second line of u_p1's own that the GM made a wall AND locked in place. The well-formed map copy redraws the first (stroke_lockwall) and leaves this one out: their copy of either says no lock, so each is answered with the map whole, and nothing changes
                { id: 'stroke_wall', type: 'path', byPlayer: true, ownerId: 'u_p1', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#ffffff', strokeWidth: 3, x: 700, y: 40, w: 30, h: 1, baseW: 30, baseH: 1, z: 35 },   // 49 (c) (the owner, 2026-10-06: "Lock it for its player"): a line of u_p1's own that the GM made a wall, and one made a see-through barrier — no message of a player's may erase, redraw or move either
                { id: 'stroke_bar', type: 'path', byPlayer: true, ownerId: 'u_p1', barrier: true, pts: [[0, 0], [0, 30]], color: '#ffffff', strokeWidth: 3, x: 720, y: 60, w: 1, h: 30, baseW: 1, baseH: 30, z: 35 },
                { id: 'text1', type: 'text', text: '<b>Welcome</b>', x: 20, y: 20, w: 100, h: 30 },
                { id: 'note1', type: 'rect', gmNoteFor: 'tok_npc', x: 300, y: 260, w: 40, h: 20, gmInfo: 'the orc lies' },
                { id: 'light1', type: 'light', light: { bright: 2, dim: 4, unit: 'yd' }, x: 700, y: 700, w: 20, h: 20 },
                { id: 'img1', type: 'image', src: '/saves/images/pic.png', x: 700, y: 100, w: 100, h: 100, layer: 'bottom' }   // a picture the players are sent a reference to (the asset gate serves a connection only what it was sent)
            ] },
            m_fog: { id: 'm_fog', type: 'map', meta: { title: 'Dark Cellar', gridType: 'square' }, fog: { on: true, cell: 50 }, rooms: [], links: [], whiteboard: [
                tok('tok_far', { charName: 'Lurker', name: 'Lurker', x: 900, y: 900 }), tok('tok_p1b', { ownerId: 'u_p1', charName: 'Ayla', name: 'Ayla', charId: 'c_p1', x: 50, y: 50 }),
                tok('tok_p1pet', { ownerId: 'u_p1', charName: 'Pet', name: 'Pet', locked: true, x: 160, y: 100 })   // a token of theirs the GM locked: frozen for its player (on the cellar, so it does not keep them from leaving the open field through its door — the merged door rule)
            ] },
            d_notes: { id: 'd_notes', type: 'doc', meta: { title: 'Notes' }, blocks: [{ id: 'b1', type: 'p', text: 'Hello' }] },
            pl_1: { id: 'pl_1', type: 'planner', meta: { title: 'Plan' }, content: 'secret' }
        }
    };
    camp.chars.c_p1.looks = { f_class: { fmt: { i: true }, sig: win.wpLook.textSig('Ranger') } }; camp.chars.c_p2.looks = { f_class: { fmt: { i: true }, sig: win.wpLook.textSig('Bard') } };   // item 35: a look each from the start, so the real join snapshot is seen to carry a player their own and nobody else's
    return camp;
}
const clone = o => JSON.parse(JSON.stringify(o));
const cloneMsg = o => { try { return structuredClone(o); } catch (e) { return clone(o); } };

/* ---------- oracles: a snapshot of what a peer may or may not have touched ---------- */
function snapOf(net) {
    try { return clone({ app: stateMod.state.appState, roster: net.roster, targets: net.targets || {}, combats: net.combats || {}, paused: net.paused, pausedPlayers: net.pausedPlayers, travelLocked: net.travelLocked, ls: localStorage.dump(), active: net.active, role: net.role, gmId: net.gmId || '' }); }
    catch (e) { return null; }   // JSON.stringify gave up (a structure too deep to save): the caller reports it
}
function depthOf(o) {   // the deepest nesting a structure holds, walked without recursion
    let best = 0; const stack = [[o, 1]];
    while (stack.length) { const [v, d] = stack.pop(); if (!v || typeof v !== 'object') continue; if (d > best) best = d; if (d > 5000) return d; for (const k of Object.keys(v)) stack.push([v[k], d + 1]); }
    return best;
}
const EMPTY_SNAP = { app: {}, roster: {}, targets: {}, combats: {}, ls: {} };
function diffInto(a, b, p, out) {
    if (a === b) return;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (!(typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))) out.push({ path: p, a, b }); return; }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) { out.push({ path: p, a, b }); return; }
        const ids = x => x.length > 0 && x.every(e => e && typeof e === 'object' && typeof e.id === 'string');
        if (ids(a) && ids(b) || (a.length === 0 && ids(b)) || (b.length === 0 && ids(a))) {
            const A = new Map(a.map(e => [e.id, e])), B = new Map(b.map(e => [e.id, e]));
            A.forEach((e, id) => { if (!B.has(id)) out.push({ path: p + '[id=' + id + ']', a: e, b: undefined }); else diffInto(e, B.get(id), p + '[id=' + id + ']', out); });
            B.forEach((e, id) => { if (!A.has(id)) out.push({ path: p + '[id=' + id + ']', a: undefined, b: e }); });
            return;
        }
        for (let i = 0; i < Math.max(a.length, b.length); i++) diffInto(a[i], b[i], p + '[' + i + ']', out);
        return;
    }
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(k => diffInto(a[k], b[k], p + '.' + k, out));
}
function diffOf(a, b) { const out = []; diffInto(a, b, '', out); return out; }
const PROTO_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype)), ARR_NAMES = new Set(Object.getOwnPropertyNames(Array.prototype));
function protoAdded() {   // the own names a message added to Object.prototype / Array.prototype, removed again so the next probe starts clean
    const added = Object.getOwnPropertyNames(Object.prototype).filter(k => !PROTO_NAMES.has(k)).map(k => 'Object.prototype.' + k).concat(Object.getOwnPropertyNames(Array.prototype).filter(k => !ARR_NAMES.has(k)).map(k => 'Array.prototype.' + k));
    added.forEach(k => { const m = k.match(/^(Object|Array)\.prototype\.(.+)$/); try { delete (m[1] === 'Object' ? Object : Array).prototype[m[2]]; } catch (e) {} });
    return added;
}
function longest(o, depth) {   // the longest string a structure holds (an unbounded value kept)
    depth = depth || 0; if (depth > 60) return 0;
    if (typeof o === 'string') return o.length;
    if (!o || typeof o !== 'object') return 0;
    let m = 0; for (const k of Object.keys(o)) { const l = longest(o[k], depth + 1); if (l > m) m = l; }
    return m;
}

/* ---------- mutation engine ---------- */
function deepNest(n) { let o = { a: 1 }; for (let i = 0; i < n; i++) o = { a: o }; return o; }
const inherited = () => Object.create({ hidden: true, locked: true, ownerId: 'u_p1', id: 'tok_p1', charId: 'c_p1', isChar: true, type: 'map' });
const ownProto = () => JSON.parse('{"__proto__": {"polluted": 1, "hidden": true}, "id": "x"}');
const HOSTILE = [null, true, false, 0, -1, 1.5, NaN, Infinity, -Infinity, 2 ** 53 + 1, 1e300, -1e300, '', 'x', BIG, CANARY, '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', [], [1, 2, 3], [{}], {}, { id: '__proto__' }, deepNest(2000), inherited(), ownProto(), 'ab\u0000‮cd', '\ud83d'.repeat(3)];
const SMALL = [null, 'x', BIG, CANARY, '__proto__', 'constructor', -1, 2 ** 53 + 1, NaN, {}, [], inherited(), ownProto()];
function mutations(tpl) {
    const out = [];
    const base = () => cloneMsg(tpl);
    out.push({ name: 'well-formed', msg: cloneMsg(tpl) });
    Object.keys(tpl).forEach(k => {
        if (k === 'type') return;
        const m = base(); delete m[k]; out.push({ name: 'missing ' + k, msg: m });
        HOSTILE.forEach(h => { const m2 = base(); m2[k] = typeof h === 'object' && h !== null && !Array.isArray(h) && Object.getPrototypeOf(h) !== Object.prototype ? h : h; out.push({ name: k + '=' + short(h), msg: m2 }); });
        const v = tpl[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.keys(v).forEach(sk => {
                const m3 = base(); delete m3[k][sk]; out.push({ name: 'missing ' + k + '.' + sk, msg: m3 });
                SMALL.forEach(h => { const m4 = base(); m4[k][sk] = h; out.push({ name: k + '.' + sk + '=' + short(h), msg: m4 }); });
                const sv = v[sk];
                if (sv && typeof sv === 'object' && !Array.isArray(sv)) Object.keys(sv).forEach(ssk => { SMALL.forEach(h => { const m5 = base(); m5[k][sk][ssk] = h; out.push({ name: k + '.' + sk + '.' + ssk + '=' + short(h), msg: m5 }); }); });
                if (Array.isArray(sv) && sv.length) { const m6 = base(); m6[k][sk] = Array.from({ length: 3000 }, () => clone(sv[0])); out.push({ name: k + '.' + sk + ' ×3000', msg: m6 }); SMALL.forEach(h => { const m7 = base(); m7[k][sk] = [h]; out.push({ name: k + '.' + sk + '=[' + short(h) + ']', msg: m7 }); }); if (sv[0] && typeof sv[0] === 'object') Object.keys(sv[0]).forEach(ek => { SMALL.forEach(h => { const m8 = base(); m8[k][sk][0][ek] = h; out.push({ name: k + '.' + sk + '[0].' + ek + '=' + short(h), msg: m8 }); }); }); }
            });
        }
        if (Array.isArray(v) && v.length) {
            const m9 = base(); m9[k] = Array.from({ length: 3000 }, () => clone(v[0])); out.push({ name: k + ' ×3000', msg: m9 });
            SMALL.forEach(h => { const m10 = base(); m10[k] = [h]; out.push({ name: k + '=[' + short(h) + ']', msg: m10 }); });
            if (v[0] && typeof v[0] === 'object') Object.keys(v[0]).forEach(ek => { SMALL.forEach(h => { const m11 = base(); m11[k][0][ek] = h; out.push({ name: k + '[0].' + ek + '=' + short(h), msg: m11 }); }); });
        }
    });
    [{}, 1, ['x'], tpl.type.toUpperCase(), tpl.type + ' ', '__proto__'].forEach(t => { const m = base(); m.type = t; out.push({ name: 'type=' + short(t), msg: m }); });
    const inh = Object.create(clone(tpl)); out.push({ name: 'every field inherited', msg: inh });   // a packed "__proto__" re-parents the decoded object
    const ap = clone(tpl); Object.defineProperty(ap, '__proto__', { value: { polluted: 1 }, enumerable: true, configurable: true, writable: true }); out.push({ name: 'own __proto__ key', msg: ap });
    return out;
}

/* ======================================================================================================= */
(async function main() {
    /* ---------- the real core modules ---------- */
    const imp = async f => (await import(pathToFileURL(path.join(ROOT, f)).href));
    stateMod = await imp('state.js');
    const skipped = [];
    for (const f of ['dicecore.js', 'formula.js', 'calendarcore.js', 'systemcore.js', 'fogcore.js', 'safecore.js', 'buildcore.js', 'videocore.js', 'librarycore.js', 'fxcore.js', 'soundcore.js', 'musiccore.js', 'docrender.js', 'vtt.js']) {
        try { await imp(f); } catch (e) { skipped.push(f + ': ' + e.message); }
    }
    const SC = window.wpSystemCore, F = window.wpFormula, DC = window.wpDiceCore, FC = window.wpFogCore, BC = window.wpBuildCore;
    check('the core modules load for real (dicecore, systemcore, fogcore, buildcore, formula, vtt…)', !!(SC && F && DC && FC && BC && typeof BC.pieceProps === 'function' && window.wpVtt) && skipped.length === 0, { skipped, buildcore: typeof BC, pieceProps: BC ? typeof BC.pieceProps : 'no buildcore' });

    const sheetsStub = () => ({
        playerSystem: camp => SC.cleanSystem(camp.system, { F, gmView: false, libCats: {} }), readablePages: () => [],
        charChanged() {}, charGone() {}, renderSheet() {}, sheetRefsChanged: () => false, tokenTurned() {}, uploadsChanged() {},
        applyCharFace(id, plan) { rec.pics.push({ id, plan: plan && plan.kind }); return Promise.resolve(true); }, applyTokenFace(mapId, wbId, plan) { rec.pics.push({ wbId, plan: plan && plan.kind }); return Promise.resolve(true); },
        giveCharacter(pid, cid, o) { rec.gives.push({ pid, cid }); }, deleteCharacter(cid) { rec.gives.push({ deleted: cid }); }, sbFinder: () => null, playerFinder: () => null, charFromJson: () => null,
        bellNote() {}, editResult() {}, rollInit: () => ({ error: 'no dice here' }), rolled() {}, roundHook() {}, turnHook() {}, systemOf: () => null, tokenCtxFor: () => null
    });
    function installStubs() {
        Object.assign(window, {
            wpSheets: sheetsStub(), wpFog: mkFogStub(), wpVideo: { audienceChanged() {}, tableLeft() {}, onStream() {}, onStop() {}, onLost() {} },
            wpFx: { tableLeft() {}, onSnapshot() {}, receive() {}, foreign() {}, runningSet: () => [] },
            wpSound: { tableLeft() {}, onSnapshot() {}, onList() {}, onCue() {}, foreign() {}, listMessage: () => (window.wpNet && window.wpNet.role === 'host' ? { type: 'sounds', campId: 'c1', list: [{ id: 's1', name: 'Song', path: '/saves/images/audio/song.mp3', size: 4 }] } : null) },   // the hosted campaign's one sound, sent to each player as they are admitted: the reference the audio asset request names
            wpMusic: { tableLeft() {}, onSnapshot() {}, onList() {}, onControl() {}, controlSnapshot: () => null, listMessage: () => null, idSets: () => null },
            wpCalendar: { refresh() {}, rounds() {}, fightEnded() {} },
            wpDice: { renderCard: () => mkEl('div'), renderApply: () => mkEl('div'), renderDue: () => mkEl('div'), line: () => 'a roll', landed() {}, onDeny() {}, onRolled() {}, closePanel() {}, roll: () => ({}) },
            wpJournalReceive(m) { rec.journal.push(m); }, wpRenderSharedBlast() { rec.blasts++; }, wpClearSharedBlasts() {},
            wpSnapOn: () => true, wpSeatDrop: () => false, wpSeatCell() {}, wpHistFlush() {}, wpHistBarrier() {}, wpResetHistory() {},
            wpRenderCombatStrip() {}, wpRenderPartyStrip() {}, wpSettingsSync() {}, wpSheetsSync() {}, wpOpenCombat(mapId, o) { rec.combatsOpened.push(mapId); },
            wpDefaultAvatar: c => 'data:image/svg+xml,silhouette', wpAutoRoom: () => null, wpPlaceThrownBlast(b) { rec.blasts++; },
            wpDocReaderRefresh() {}, wpDocForeign() {}, wpDocGone() {}, wpHideWelcome() {}, wpJoinFailed() {}
        });
    }

    /* =================================================== HOST WORLD =================================================== */
    installStubs();
    localStorage.clear(); localStorage.setItem('wp_profile', JSON.stringify({ id: 'u_gm', name: 'GM', color: '#aabbcc' }));
    let net;
    try { net = factory(stateMod.state, stubs.getActiveCampaign, stubs.findLandingRoom, stubs.landingPoint, stubs.getActiveMap, stubs.save, stubs.toast, stubs.load, stubs.updateCampaignSelect, stubs.updateSidebarNav, stubs.showConfirm); }
    catch (e) { console.log('FAIL      net.js threw while loading whole: ' + (e.stack || e.message)); console.log(checks + ' passed, ' + (checksFailed + 1) + ' failed.'); process.exit(1); }
    check('net.js loads whole: wpNet set, the sandbox hook present, no stray console output', !!(net && net._handleMessage === net._handleMessage && window.wpNet === net && typeof net._handleMessage === 'function') && warned.length === 0, warned.slice(0, 3));
    await window.wpVersionReady; await drain();
    check('the version gate is live (APP_VERSION read from the stub /api/version)', window.wpAppVersion === '1.5.0');
    flushTimers();   // the 1.2 s rejoin probe (nothing stored: nothing happens)

    const camp0 = mkCampaign(SC, F);
    stateMod.state.appState = { activeCampaignId: 'c1', campaigns: { c1: camp0 } };
    const pristine = clone(camp0);
    document.getElementById('netNameInput').value = 'GM';
    document.getElementById('netHostBtn').click();
    const hostPeer = peers[peers.length - 1];
    check('hosting starts through the real Host button on a stub Peer', !!hostPeer && net.role === 'host' && /^waypoint-/.test(hostPeer.id));
    hostPeer.emit('open'); flushTimers(); await drain();
    await settle(() => !!localStorage.getItem('wp_gmSign'));   // the GM's signing key is made as hosting starts (WebCrypto, off the main thread)
    const GM_PRIV = (() => { try { return JSON.parse(localStorage.getItem('wp_gmSign')).priv; } catch (e) { return null; } })(), GM_D = GM_PRIV && typeof GM_PRIV.d === 'string' && GM_PRIV.d.length >= 40 ? GM_PRIV.d : '';
    check('the GM\'s signing key is made as hosting starts and kept on this machine (wp_gmSign: a P-256 pair with its private half)', !!GM_D && GM_PRIV.kty === 'EC' && GM_PRIV.crv === 'P-256' && typeof GM_PRIV.x === 'string' && typeof GM_PRIV.y === 'string');
    check('the host is active after the peer opens', net.active === true && net.role === 'host');
    resetRec(); warned.length = 0; sentLog.length = 0;

    const conns = {};
    function connect(peerId) { const c = new Conn(peerId); hostPeer.emit('connection', c); return c; }
    function hello(c, profile, extra) { net._handleMessage(Object.assign({ type: 'hello', profile, version: '1.5.0' }, extra || {}), c); flushTimers(); }
    // a known player's admission as their app does it: a plain hello (no key rides in it), the host's challenge (auth: the GM's id and a nonce),
    // a second hello answering with the proof over that nonce and the room id the player dialled; the host checks it over WebCrypto (asynchronous)
    async function admit(c, profile, key) {
        const n0 = c.sent.length;
        c.cn = nodeCrypto.randomBytes(16).toString('hex');   // this connection's own nonce, as the player's app sends it: the snapshot it is given is signed over it
        net._handleMessage({ type: 'hello', profile, version: '1.5.0', cn: c.cn }, c);   // no flushTimers here: the challenge's 2.5 s timer would hand the join to the GM before the answer
        const ch = c.sent.slice(n0).find(m => m.type === 'auth');
        if (!ch || typeof ch.nonce !== 'string' || !ch.nonce) { flushTimers(); return { ok: false, why: 'no challenge', sent: c.sent.slice(n0).map(m => m.type) }; }
        net._handleMessage({ type: 'hello', profile, version: '1.5.0', proof: proofFor(key, ch.nonce, hostPeer.id), fp: [FP_P, FP_H], cn: c.cn }, c);   // the answer clears the challenge timer; the pair the proof was made over is stated beside it, as the app does
        await settle(() => !!net.roster[c.peer] || c.sent.slice(n0).some(m => m.type === 'wait' || m.type === 'denied'));
        flushTimers(); await drain();
        return { ok: !!net.roster[c.peer], why: net.roster[c.peer] ? '' : 'not admitted', sent: c.sent.slice(n0).map(m => m.type), gm: ch.gmId };
    }
    conns.p1 = connect('peer_p1'); const adm1 = await admit(conns.p1, { id: 'u_p1', name: 'Ayla', color: '#112233' }, K1);
    conns.p2 = connect('peer_p2'); const adm2 = await admit(conns.p2, { id: 'u_p2', name: 'Bram' }, K2);
    await drain(); flushTimers();
    const snapP1 = conns.p1.sent.find(m => m.type === 'snapshot');
    check('two known players are challenged (auth naming the GM, a nonce) and admitted on the proof over their table keys, no dialog raised, and each gets a snapshot', adm1.ok && adm2.ok && adm1.gm === 'u_gm' && rec.confirms.length === 0 && net.roster.peer_p1 && net.roster.peer_p1.id === 'u_p1' && net.roster.peer_p2 && net.roster.peer_p2.id === 'u_p2' && !!snapP1 && conns.p2.sent.some(m => m.type === 'snapshot'), { adm1, adm2, confirms: rec.confirms.length });
    check('the snapshot is signed with the GM\'s key: its four public fields (the pair kept on this machine), and a signature Node\'s own crypto verifies over the player\'s nonce, the host\'s room id, the GM id and the table key handed over — and over no other nonce or room', !!snapP1 && !!GM_PRIV && JSON.stringify(snapP1.gmPub) === JSON.stringify({ kty: 'EC', crv: 'P-256', x: GM_PRIV.x, y: GM_PRIV.y }) && sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p1.cn, hostPeer.id, 'u_gm', K1)) && !sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p2.cn, hostPeer.id, 'u_gm', K1)) && !sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p1.cn, hostPeer.id + '-r1', 'u_gm', K1)), snapP1 && { gmPub: snapP1.gmPub, sig: snapP1.sig });
    {   // the host's early proof: ONE gmhello per connection, on the wire before the snapshot
        const hp1 = conns.p1.sent.filter(m => m.type === 'gmhello'), hp2 = conns.p2.sent.filter(m => m.type === 'gmhello'), order = conns.p1.sent.map(m => m.type);
        check('the host proves itself early: each known player\'s connection was sent ONE gmhello — after the challenge, before the snapshot — carrying the GM id, the key\'s four public fields and a signature and nothing else, the signature verified by Node\'s own crypto over wp-host, the player\'s nonce, the host\'s room id, the GM id and the connection\'s two fingerprints — and over no other nonce or room, nor as a snapshot\'s text',
            hp1.length === 1 && hp2.length === 1 && hailShape(hp1[0]) && hp1[0].gmId === 'u_gm' && !!GM_PRIV && JSON.stringify(hp1[0].gmPub) === JSON.stringify({ kty: 'EC', crv: 'P-256', x: GM_PRIV.x, y: GM_PRIV.y }) && order.indexOf('auth') >= 0 && order.indexOf('auth') < order.indexOf('gmhello') && order.indexOf('gmhello') < order.indexOf('snapshot')
            && sigOk(hp1[0].gmPub, hp1[0].sig, hostText(conns.p1.cn, hostPeer.id, 'u_gm')) && !sigOk(hp1[0].gmPub, hp1[0].sig, hostText(conns.p2.cn, hostPeer.id, 'u_gm')) && !sigOk(hp1[0].gmPub, hp1[0].sig, hostText(conns.p1.cn, hostPeer.id + '-r1', 'u_gm')) && !sigOk(hp1[0].gmPub, hp1[0].sig, snapText(conns.p1.cn, hostPeer.id, 'u_gm', K1)) && !sigOk(snapP1.gmPub, snapP1.sig, hostText(conns.p1.cn, hostPeer.id, 'u_gm'))
            && sigOk(hp2[0].gmPub, hp2[0].sig, hostText(conns.p2.cn, hostPeer.id, 'u_gm')), { n: [hp1.length, hp2.length], order, shape: hailShape(hp1[0]) });
    }
    check('the proven key is kept, not re-issued (the snapshot carries the key the player proved)', !!snapP1 && snapP1.key === K1 && stubs.getActiveCampaign().players.u_p1.key === K1 && stubs.getActiveCampaign().players.u_p2.key === K2);
    check('the snapshot carries no GM-only field value, no hidden token, no GM note, no planner, no players record, no table key', (() => { const s = JSON.stringify(snapP1 && snapP1.appState); const m = s && s.match(/tok_hidden|note1|"pl_1"|secret plan|the orc lies|"players":\{|aaaaaaaa|"f_gmfig":(7|3|99)/); return !!s && !m; })(), String((JSON.stringify(snapP1 && snapP1.appState) || '').match(/.{0,60}(tok_hidden|note1|"pl_1"|secret plan|the orc lies|"players":\{|aaaaaaaa|"f_gmfig":(7|3|99)).{0,40}/) || 'leak'));
    check('the snapshot gives the map the player landed on whole and the other map as its stub (possession)', !!snapP1 && snapP1.appState.campaigns.c1.items.m_open && !snapP1.appState.campaigns.c1.items.m_open.stub && snapP1.appState.campaigns.c1.items.m_open.whiteboard.some(w => w.id === 'tok_p1') && snapP1.appState.campaigns.c1.items.m_fog && snapP1.appState.campaigns.c1.items.m_fog.stub === true && snapP1.appState.campaigns.c1.items.m_fog.whiteboard.length === 0);
    // the fogged map whole, as the host gives it when its player arrives there (the client world needs a copy it holds whole, not a stub)
    let mfogForClient = null;
    {
        const n0 = sentLog.length;
        net._handleMessage({ type: 'travel', viaItemId: 'portal_vis' }, conns.p1); flushTimers(); await drain(); flushTimers();
        const given = sentLog.slice(n0).find(s => s.to === 'peer_p1' && s.m.type === 'item' && s.m.itemId === 'm_fog' && s.m.item && !s.m.item.stub);
        check('a travel through the visible portal gives the player the fogged map whole (their own token on it, the far creature dropped by the fog)', !!given && net.roster.peer_p1.location === 'm_fog' && given.m.item.whiteboard.some(w => w.id === 'tok_p1b') && !given.m.item.whiteboard.some(w => w.id === 'tok_far'), given ? given.m.item.whiteboard.map(w => w.id) : sentLog.slice(n0).map(s => s.to + ':' + s.m.type));
        if (given) mfogForClient = clone(given.m);
        const toP1 = sentLog.slice(n0).filter(s => s.to === 'peer_p1'), stageI = toP1.findIndex(s => s.m.type === 'stage'), backI = toP1.findIndex(s => s.m.type === 'mapBack'), backM = backI >= 0 ? toP1[backI].m : null;
        check('the travel takes the map the player left back (possession): one mapBack for m_open after their stage word, carrying the campaign, the map\'s id and its stub\'s meta — nothing of what is on it', stageI >= 0 && backI > stageI && toP1.filter(s => s.m.type === 'mapBack').length === 1 && backM.itemId === 'm_open' && JSON.stringify(Object.keys(backM).sort()) === JSON.stringify(['campId', 'itemId', 'meta', 'type']) && !/whiteboard|rooms|tok_/.test(JSON.stringify(backM)), backM || toP1.map(s => s.m.type));
    }
    conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' });
    check('a stranger\'s hello waits for the GM (one dialog, a wait sent, not admitted)', rec.confirms.length === 1 && conns.w.sent.some(m => m.type === 'wait') && !net.roster.peer_w);
    const joinConfirm = rec.confirms[0];
    const snapshotForClient = clone(snapP1); delete snapshotForClient.gmPub; delete snapshotForClient.sig;   // as an older host gives it: the client world below fuzzes every kind on a table with no signing key; the signed snapshot has its own section at the end
    resetRec(); sentLog.length = 0; warned.length = 0;

    /* ---------- the host templates: one well-formed example per message type ---------- */
    const host = {
        pid: { p1: 'u_p1', p2: 'u_p2' },
        tpl: {
            'hello': { type: 'hello', profile: { id: 'u_new', name: 'Newcomer', color: '#123456', avatar: 'data:image/png;base64,iVBORw0KGgo=', face: '🙂' }, version: '1.5.0', password: '', proof: '', fp: [FP_P, FP_H], cn: 'c'.repeat(32) },   // no key rides in a hello since the proof (a known id is challenged; the answer is a proof, with the pair of fingerprints it was made over)
            'hold': { type: 'hold', ms: 1000 },
            'hb': { type: 'hb' },
            'item': { type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: [{ id: 'tok_p1', x: 120, y: 130, rot: 0, front: 0, elevation: 0, posture: '', fogHand: 'hide', page: 'plan_x', texture: 'bricks', texSrc: '/saves/images/c1/floor.png', texTile: 2, barrier: true, blastStop: true, blocksSight: true, portalLock: true, targetMapId: 'm_fog', sightType: 'door', secret: true, seenColor: '#112233', seenTexture: 'grass', seenWidth: 6, seenOpacity: 0.5, seenTip: 'flat', locked: true }, { id: 'stroke_p1', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [10, 10], [20, 5]], color: '#ffffff', strokeWidth: 3, x: 0, y: 0, w: 20, h: 10, baseW: 20, baseH: 10, opacity: 1, fogHand: 'show', page: 'plan_x', texture: 'grass', texSrc: '/saves/images/c1/floor.png', texTile: 'whole', barrier: true, blocksSight: true, portalLock: true, targetMapId: 'm_fog', sightType: 'door', secret: true, seenColor: '#112233', seenTexture: 'grass', seenWidth: 6, seenOpacity: 0.5, seenTip: 'flat', locked: true },   // (locked, on both: Match a wall, round two. The GM's Lock in place is the GM's alone, and a host takes it from no copy)
                { id: 'portal_locked', type: 'rect', targetMapId: 'm_fog', name: 'Barred stairs', x: 250, y: 100, w: 50, h: 50, layer: 'bottom' }, { id: 'portal_vis', type: 'rect', targetMapId: 'm_fog', name: 'Stairs', x: 500, y: 500, w: 50, h: 50, layer: 'bottom', portalLock: true },   // a portal's own lock: the GM's locked portal sent back unlocked, the open one sent back locked, the player's own token and drawing sent as locked portals — a host takes none of it
                { id: 'gate1', type: 'rect', sightType: 'door', doorOpen: true, x: 150, y: 50, w: 50, h: 50 }, { id: 'bars1', type: 'rect', x: 650, y: 0, w: 10, h: 400 },   // see-through barriers (1.5.1): a copy that sends the GM's gate back unflagged and open, the bars unflagged, and its own token and drawing flagged — a host takes none of it
                { id: 'door_secret', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: true, x: 300, y: 600, w: 50, h: 50, layer: 'back-mid' },   // fold B5: a secret door: the GM's secret door sent back as a door, open and with no tick, and the player's own token and drawing sent as secret doors with a look named for them (secret, seenColor, seenTexture) — a host takes none of it
                { id: 'door_line', type: 'path', ownerId: 'u_p1', blocksSight: true, sightType: 'door', doorOpen: true, pts: [[0, 0], [20, 20]], color: '#ffffff', strokeWidth: 20, opacity: 1, tip: 'round', x: 1262, y: 104, w: 20, h: 20, baseW: 20, baseH: 20 },   // Match a wall: the GM's secret door drawn as a line sent back as the sender's OWN drawing, at another place, an open door of another shape, width and nib with no tick, and the three keys Match sets (seenWidth, seenOpacity, seenTip) on the player's own token and drawing above: a host takes none of it
                { id: 'stroke_wall', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [5, 25]], color: '#ffffff', strokeWidth: 3, x: 300, y: 300, w: 5, h: 25, baseW: 5, baseH: 25 },   // 49 (c): its own line the GM made a wall sent redrawn and moved, and its own line the GM made a barrier (stroke_bar) left out, which is an erase — a host takes neither
                { id: 'wall_lockline', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [15, 15]], color: '#ffffff', strokeWidth: 3, x: 1503, y: 107, w: 15, h: 15, baseW: 15, baseH: 15 }, { id: 'wall_lockbox', type: 'rect', x: 1507, y: 163, w: 10, h: 60 },   // Match a wall, round two: the GM's locked wall line sent back as the sender's OWN drawing, moved, redrawn and with no lock, and the GM's locked wall box sent back moved, with no lock and as no wall
                { id: 'stroke_lockwall', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [6, 18]], color: '#ffffff', strokeWidth: 3, x: 310, y: 330, w: 6, h: 18, baseW: 6, baseH: 18, locked: false }, { id: 'stroke_locked', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [8, 8]], color: '#ffffff', strokeWidth: 3, x: 345, y: 350, w: 8, h: 8, baseW: 8, baseH: 8, locked: false },
                // Match a wall, round three. (1) The sender's own second line that the GM made a wall and locked (stroke_lockout) is left out of this copy, as stroke_lockbar and stroke_lockgone are: an erase the host does not take, answered with the map whole. (2) Five NEW drawings of the sender's own, each with something under tip: the square nib, the flat nib, the Fill tip, a number and a text of markup. A drawing keeps the nib it was drawn with only as square or flat
                { id: 'stroke_sq', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [12, 6]], color: '#ffffff', strokeWidth: 3, x: 360, y: 380, w: 12, h: 6, baseW: 12, baseH: 6, tip: 'square' }, { id: 'stroke_fl', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [12, 6]], color: '#ffffff', strokeWidth: 3, x: 380, y: 380, w: 12, h: 6, baseW: 12, baseH: 6, tip: 'flat' },
                { id: 'stroke_fi', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [12, 0], [12, 6]], color: '#ffffff', strokeWidth: 3, x: 400, y: 380, w: 12, h: 6, baseW: 12, baseH: 6, tip: 'fill' }, { id: 'stroke_num', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [12, 6]], color: '#ffffff', strokeWidth: 3, x: 420, y: 380, w: 12, h: 6, baseW: 12, baseH: 6, tip: 7 },
                { id: 'stroke_mk', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [12, 6]], color: '#ffffff', strokeWidth: 3, x: 440, y: 380, w: 12, h: 6, baseW: 12, baseH: 6, tip: CANARY }] }, a: 1 },   // ...its own line the GM made a wall and locked in place, and its own locked drawing, each sent redrawn, moved and with the lock set false; its own locked barrier line (stroke_lockbar) and its other locked drawing (stroke_lockgone) left out, which is an erase of each: a host takes none of it
            'threats': { type: 'threats', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', threats: [90, 180], a: 2 },
            'needItem': { type: 'needItem', campId: 'c1', itemId: 'm_open' },
            'travel': { type: 'travel', viaItemId: 'portal_vis' },
            'target': { type: 'target', id: 'tok_npc', mapId: 'm_open' },
            'share': { type: 'share', entry: { kind: 'text', text: 'a shared note', title: 'Note', caption: 'cap', notes: 'n', tags: ['t'], id: 'e1', look: { fmt: { spans: [{ s: 2, e: 8, b: true, link: 'https://a.example/' }] }, font: 'Lora', sig: win.wpLook.textSig('a shared note') } }, to: '*' },   // item 35, fold 2b: a note goes with its look
            'share-image': { type: 'share', entry: { kind: 'image', data: new Uint8Array([1, 2, 3, 4]).buffer, mime: 'image/png', title: 'Pic', id: 'e2' }, to: 'gm' },
            'pos': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 150, y: 160, rot: 0, front: 0, final: true, a: 3 },
            'char-edit': { type: 'char-edit', rid: 'r1', charId: 'c_p1', fieldId: 'f_str', value: 12 },
            'char-edits': { type: 'char-edits', rid: 'r2', charId: 'c_p1', values: [{ fieldId: 'f_str', value: 13 }, { fieldId: 'f_dex', value: 11 }] },
            'char-apply': { type: 'char-apply', rid: 'r3', charId: 'c_p1', act: 'r_heal' },
            'turn-hold': { type: 'turn-hold', mapId: 'm_open', row: 'row_p1' },
            'turn-act': { type: 'turn-act', mapId: 'm_open', row: 'row_p1' },
            'turn-end': { type: 'turn-end', mapId: 'm_open', row: 'row_p1' },
            'char-upload': { type: 'char-upload', rid: 'r4', charId: 'c_p1', sheet: { name: 'Ayla', attributes: { ST: 12 }, items: [{ name: 'Rope' }] } },
            'char-item': { type: 'char-item', rid: 'r5', charId: 'c_p1', fieldId: 'f_inv', op: 'add', defId: 'i_rope', rowId: 'w_1', qty: 1 },
            'lib-idx': { type: 'lib-idx', rid: 'r6', campId: 'c1', packId: 'p_core', page: 0 },
            'lib-get': { type: 'lib-get', rid: 'r7', campId: 'c1', packId: 'p_core', ids: ['i_rope'] },
            'char-effect': { type: 'char-effect', rid: 'r8', charId: 'c_p1', fieldId: 'f_fx', op: 'add', ref: 'e_ward', rowId: 'x_1' },
            'char-style': { type: 'char-style', rid: 'r9', charId: 'c_p1', fieldId: 'f_class', look: { fmt: { b: true }, sig: win.wpLook.textSig('Ranger') } },   // item 35: the look of a text of their own sheet
            'throw-req': { type: 'throw-req', charId: 'c_p1', fieldId: 'f_inv', rowId: 'w_1', mapId: 'm_open', x: 200, y: 200 },
            'door-req': { type: 'door-req', mapId: 'm_open', itemId: 'door1' },
            'door-req-secret': { type: 'door-req', mapId: 'm_open', itemId: 'door_secret' },   // fold B5: a secret door: a door request naming it is answered as a wall's is — with nothing — and changes nothing
            'door-req-line': { type: 'door-req', mapId: 'm_open', itemId: 'door_line' },   // Match a wall: the same for a secret door drawn as a line, which the GM also locked: answered with nothing, and nothing of the three doors changes
            'char-pic': { type: 'char-pic', rid: 'r9', charId: 'c_p1', face: 'default', img: 'data:image/png;base64,iVBORw0KGgo=' },
            'char-make': { type: 'char-make', rid: 'r10', name: 'Hero' },
            'char-name': { type: 'char-name', rid: 'r11', charId: 'c_p1', name: 'Ayla the Bold' },
            'char-done': { type: 'char-done', rid: 'r12', charId: 'c_p1' },
            'char-delete': { type: 'char-delete', rid: 'r12d', charId: 'c_p1' },
            'char-token': { type: 'char-token', rid: 'r13', name: 'Just Tok' },
            'tok-pic': { type: 'tok-pic', rid: 'r14', mapId: 'm_open', wbId: 'tok_p1plain', img: 'data:image/png;base64,iVBORw0KGgo=' },
            'tok-light': { type: 'tok-light', rid: 'r15', mapId: 'm_open', wbId: 'tok_p1', on: true, preset: 0, name: 'Torch' },
            'my-look': { type: 'my-look', face: '🙂' },
            'video-up': { type: 'video-up', act: 'ask', id: '0123456789abcdef', sdp: 'v=0\r\n', cand: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } },
            'roll-req': { type: 'roll-req', rid: 'r16', expr: '1d20 + 3', label: 'Attack' },
            'roll-req-char': { type: 'roll-req', rid: 'r17', expr: 'd20 + STRmod + Prof', charId: 'c_p1', act: 'r_atk', mod: 0 },
            'asset-req': { type: 'asset-req', path: '/saves/images/pic.png' },
            'asset-req-audio': { type: 'asset-req', path: '/saves/images/audio/song.mp3' },
            'chat': { type: 'chat', text: 'hello table', from: { id: 'u_gm', name: 'GM', gm: true }, scope: 'whisper' },
            'unknown': { type: 'zzz-unknown', campId: 'c1', payload: 1 },
            // the players' own answers and the host→player words, sent AT the host (no host branch: must be ignored)
            'snapshot@host': { type: 'snapshot', gmId: 'u_evil', key: 'k', appState: { activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', items: {} } } } },
            'stage@host': { type: 'stage', stage: { campId: 'c1', itemId: 'm_fog' } },
            'roster@host': { type: 'roster', roster: [{ id: 'u_gm', name: 'X' }] },
            'combats@host': { type: 'combats', combats: { m_open: { rows: [{ id: 'r', name: 'x' }] } } },
            'roll@host': { type: 'roll', id: 'r', from: { id: 'u_p1', name: 'A' }, expr: '1d6', draws: [[6]], v: 1, ts: 1 },
            'kicked@host': { type: 'kicked' }, 'end@host': { type: 'end' }, 'denied@host': { type: 'denied', reason: CANARY, update: true },
            'itemDelta@host': { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: [{ id: 'tok_npc', x: 0, y: 0 }], del: ['tok_p2'] } },
            'char@host': { type: 'char', campId: 'c1', char: { id: 'c_p2', name: 'Stolen', ownerId: 'u_p1', values: {} } },
            'handout@host': { type: 'handout', kind: 'text', text: 'x', title: 'T' },
            'fogDiff@host': { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', drop: ['tok_far'] }
        }
    };
    // a combat on m_open so the turn-* branches have rows to find
    function seedCombat() { net.combats = { m_open: { mapId: 'm_open', round: 1, turn: 0, rows: [{ id: 'row_p1', name: 'Ayla', tokId: 'tok_p1', init: 15 }, { id: 'row_npc', name: 'Orc', tokId: 'tok_npc', init: 10 }, { id: 'row_p2', name: 'Bram', tokId: 'tok_p2', init: 5 }] } }; }
    seedCombat();

    let readmits = 0, readmitFailed = [];
    async function resetWorld() {
        const camp = stubs.getActiveCampaign();
        camp.items = clone(pristine.items); camp.chars = clone(pristine.chars); camp.players = Object.assign({}, clone(pristine.players), { u_p1: Object.assign({}, camp.players.u_p1 || {}, { key: K1 }), u_p2: Object.assign({}, camp.players.u_p2 || {}, { key: K2 }) }); camp.turnRules = {}; camp.activeItemId = 'm_open';
        camp.sessionLog = (camp.sessionLog || []).slice(-50); delete camp.uploads;
        // a player a probe left on another map is brought back as the host brings one — a summon to the GM's map: that map given whole again, the stage
        // word, the map they left taken back — so the host's record of what each connection holds agrees with where the roster says its player is
        Object.keys(net.roster).forEach(k => { const c = net.conns.find(x => x.peer === k); if (net.roster[k].location !== 'm_open' && c && c.open) net.summonPlayer(k); net.roster[k].location = 'm_open'; net.roster[k].detached = false; });
        ['u_p1', 'u_p2'].forEach(pid => { if (camp.players[pid]) camp.players[pid].lastMap = 'm_open'; });   // the record agrees with the roster (renderRoster copies the roster's location onto it: a stale record would read as a write by whatever probe first redraws the roster)
        net.paused = false; net.pausedPlayers = {}; net.travelLocked = false; net.targets = {}; seedCombat();
        clockOff += 61000;   // every rate-limit window has passed
        ['p1', 'p2'].forEach(k => { if (conns[k] && conns[k].open) net._handleMessage({ type: 'hb' }, conns[k]); });   // the players are heard from (the live-duplicate rule reads lastSeen)
        for (const k of ['p1', 'p2']) {   // a player a probe cost their connection comes back as their app would: a hello, the challenge, the proof
            if (conns[k].open && net.roster['peer_' + k]) continue;
            if (conns[k].open) conns[k].close();   // open but no longer on the roster (removed): the connection goes, as the host's kick closes it
            flushTimers(); conns[k] = connect('peer_' + k); readmits++;
            const r = await admit(conns[k], { id: 'u_' + k, name: k === 'p1' ? 'Ayla' : 'Bram' }, k === 'p1' ? K1 : K2);
            if (!r.ok) readmitFailed.push(k + ': ' + r.why + ' ' + JSON.stringify(r.sent));
        }
        if (!conns.w.open) { conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' }); }
        resetRec(); flushed.threw.length = 0; warned.length = 0;
    }

    /* ---------- who may touch what (host) ---------- */
    function allowedHost(ch, pid, msg, before, after) {
        const p = ch.path; let m;
        if (/^\.ls\./.test(p)) return false;   // the host's own storage: no player writes it
        if (!pid) return false;
        if ((m = p.match(/^\.app\.campaigns\.c1\.items\.([^.]+)\.whiteboard\[id=([^\]]+)\](?:\.(.+))?$/))) {
            const mapB = before.app.campaigns.c1.items[m[1]], mapA = after.app.campaigns.c1.items[m[1]];
            const tokA = mapA && (mapA.whiteboard || []).find(x => x.id === m[2]), tokB = mapB && (mapB.whiteboard || []).find(x => x.id === m[2]);
            if (tokB && tokB.locked && tokB.type === 'path' && tokB.byPlayer === true) return false;   // Match a wall, round two: a drawing of a player's own that the GM locked in place is frozen for its player, whether or not the player was sent the lock (a plain wall leaves with none): no message erases it, redraws it, moves it or unlocks it
            if (tokB && tokB.secret === true) return false;   // fold B5: a secret door, as it stood before the message, is the GM's whole — no message of a player's opens it, finds it, moves it, takes it away or changes any key of it, a door request included
            if (!m[3] && tokA && !tokB && SECRET_KEYS.some(k => hasOwn(tokA, k))) return false;   // ...and no message adds a piece of any kind that holds one of the three keys (a key set on a piece that is there already is refused by the keys' own rule below)
            if (!m[3] && tokA && !tokB && tokA.type === 'path' && ['portalLock', 'targetMapId', 'barrier', 'blastStop', 'blocksSight', 'fogHand', 'page', 'texture', 'texSrc', 'texTile', 'secret', 'seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip', 'locked'].some(k => Object.prototype.hasOwnProperty.call(tokA, k))) return false;   // a drawing a player hands the host is the drawing alone: never a portal, a locked one, a wall or a barrier (a new piece arrives whole, so its keys are judged here)
            if (!m[3] && tokA && !tokB && tokA.type === 'path' && hasOwn(tokA, 'tip') && tokA.tip !== 'square' && tokA.tip !== 'flat') return false;   // Match a wall, round three: a new drawing of a player's keeps the nib it was drawn with only as square or flat (round is no key at all). The Fill tip would make it a filled region, and a number or a text of markup is no nib
            if (!m[3] && tokB && !tokA && tokB.type === 'path' && tokB.byPlayer === true && (tokB.blocksSight || tokB.barrier === true)) return false;   // 49 (c): a drawing the GM made a wall or a barrier is the GM's piece from then on — no message of a player's erases it, their own included
            if (!m[3]) { const obj = tokA || tokB; return !!obj && ((obj.type === 'path' && obj.byPlayer === true && obj.ownerId === pid) || (msg.type === 'hello' && obj.ownerId === pid) || ((msg.type === 'travel' || msg.type === 'pos' || msg.type === 'item' || msg.type === 'char-token' || msg.type === 'char-done') && (obj.ownerId === pid || obj.waiting))); }
            const tok = tokB || tokA; if (!tok) return false;
            const key = m[3].split(/[.[]/)[0];
            if (key === 'barrier' || key === 'blocksSight' || key === 'blastStop' || key === 'fogHand') return false;   // what stops movement, sight or a blast is the GM's alone, on a player's own drawing too
            if (key === 'texture') return false;   // the map builder (fold B1): a piece's texture is the GM's alone, set by the Build tool: no message of a player's sets it or clears it, on their own token or drawing too
            if (key === 'texSrc' || key === 'texTile') return false;   // the map builder (fold B3): the picture a piece wears as its fill, and its repeat, are the GM's alone: a path a player could set would be a path the host then sends the table, and serves
            if (key === 'tip' && tokA && hasOwn(tokA, 'tip') && tokA.tip !== 'square' && tokA.tip !== 'flat') return false;   // Match a wall, round three: ...and a redraw sets a nib on a drawing only as one of those two
            if (key === 'tip' && tokA && tokB && JSON.stringify(tokA.pts) === JSON.stringify(tokB.pts) && tokA.x === tokB.x && tokA.y === tokB.y) return false;   // Match a wall, round four: ...and a nib changes only with a redraw. A message that leaves a drawing where it stands, with the points it has, neither sets a nib on it nor takes one off (a redraw that names no nib takes a square or a flat one off: the line is round, as its drawer's screen shows)
            if (key === 'tip' && tokB && tokB.tip === 'fill') return false;   // Match a wall, round five: ...and no message changes the tip of a FILLED REGION. Its player may redraw its points, but a redraw that names a nib for it does not make it a line
            if (key === 'locked') return false;   // Match a wall, round two: the GM's Lock in place is the GM's alone, on any piece: no message of a player's sets it or clears it, on their own token or drawing too
            if (key === 'page') return false;   // backlog 125: a pin, the page a piece opens, is the GM's alone: no message of a player's sets it or clears it, on their own token or drawing too
            if (key === 'portalLock' || key === 'targetMapId') return false;   // a portal's own lock (and what makes a piece a portal) is the GM's alone: no message of a player's sets it or clears it, on their own token or drawing too
            if (key === 'secret' || key === 'seenColor' || key === 'seenTexture' || key === 'seenWidth' || key === 'seenOpacity' || key === 'seenTip') return false;   // fold B5: a secret door's tick and the look named for it are the GM's alone: no message of a player's sets one or clears one, on their own token or drawing too (Match a wall: the width, the opacity and the nib of a door drawn as a line among them)
            if (tok.type === 'path' && tok.byPlayer === true && (tok.blocksSight || tok.barrier === true)) return false;   // 49 (c): ...nor redraws or moves it: no key of such a drawing is its player's to change
            if (tok.type === 'path' && tok.byPlayer === true && tok.ownerId === pid) return true;
            if (tok.ownerId === pid && !tok.hidden && !tok.locked && /^(x|y|rot|front|elevation|posture|threats|light|face|isChar|charName|name|charStats|waiting|color|charId)$/.test(key)) return true;
            if (tok.ownerId === pid && (msg.type === 'tok-pic' || msg.type === 'char-pic') && /^(src|pic|face|frame)$/.test(key)) return true;
            if (msg.type === 'door-req' && tok.sightType === 'door' && key === 'doorOpen' && !tok.doorLock && !tok.hidden) return true;
            return false;
        }
        if ((m = p.match(/^\.app\.campaigns\.c1\.chars(?:\.([^.]+))?/))) { if (!m[1]) return msg.type === 'char-make' || msg.type === 'char-token'; const c = after.app.campaigns.c1.chars[m[1]] || before.app.campaigns.c1.chars[m[1]]; return !!c && c.ownerId === pid && !c.npc; }
        if (/^\.app\.campaigns\.c1\.(sessionLog|uploads)(\.|\[|$)/.test(p)) return true;
        if ((m = p.match(/^\.app\.campaigns\.c1\.players(?:\.([^.]+))?/))) return !m[1] || m[1] === pid;
        if ((m = p.match(/^\.roster\.([^.]+)/))) { const r = after.roster[m[1]] || before.roster[m[1]]; return !!r && r.id === pid; }
        if ((m = p.match(/^\.targets\.([^.]+)/))) return m[1] === pid;
        if (/^\.combats/.test(p)) return /^turn-/.test(msg.type);
        if (/^\.app\.campaigns\.c1\.items\.[^.]+\.meta\.(lastWbX|lastWbY)$/.test(p)) return msg.type === 'travel';
        return false;
    }
    const senderPid = (who, msg) => who === 'p1' ? 'u_p1' : who === 'p2' ? 'u_p2' : (msg && msg.type === 'hello' && msg.profile && typeof msg.profile.id === 'string') ? msg.profile.id : null;

    const confirmsBy = new Map();
    async function fireHost(who, kind, mut, msg, opts) {
        opts = opts || {};
        probes++;
        let conn;
        if (who === 's') conn = connect('peer_s' + probes);   // a stranger: a fresh connection each time (closing it is the gate's answer)
        else conn = conns[who];
        if (!conn || !conn.open) { await resetWorld(); conn = who === 's' ? connect('peer_s' + probes) : conns[who]; }
        clockOff += 1500;   // past every per-message spacing: the handler judges this probe, not a limiter still in its window (a flood runs on a still clock)
        const before = snapOf(net); const sentBefore = sentLog.length; resetRec(); warned.length = 0; flushed.threw.length = 0;
        const t0 = performance.now(); let threw = null;
        try { net._handleMessage(msg, conn); } catch (e) { threw = e; } finally { net.applyingRemote = false; }
        try { flushTimers(); } catch (e) { threw = threw || e; }
        await drain(); flushTimers();
        const dt = performance.now() - t0;
        let after = snapOf(net);
        const tag = kind + ' from ' + (who === 's' ? 'a stranger' : who === 'w' ? 'the waiting peer' : 'an admitted player');
        if (!after || !before) { finding('a structure nested past 200 levels is kept in the campaign (a save would fail: JSON.stringify of it overflows on Node 22)', tag, { msg, depth: 'past what JSON.stringify can serialise here' }, mut); after = after || EMPTY_SNAP; }
        else { const dp = depthOf(after.app); if (dp > 200) finding('a structure nested past 200 levels is kept in the campaign (a save would fail: JSON.stringify of it overflows on Node 22)', tag, { msg, depth: dp + ' levels' }, mut); }
        if (threw) finding('exception escapes handleMessage', tag + ' — ' + (threw.constructor.name + ': ' + String(threw.message).slice(0, 120)), msg, mut);
        flushed.threw.forEach(e => finding('exception in a timer the message armed', tag + ' — ' + String(e.message).slice(0, 120), msg, mut));
        const changes = before && after !== EMPTY_SNAP ? diffOf(before, after) : [];
        const pid = senderPid(who, msg);
        const bad = changes.filter(ch => !allowedHost(ch, pid, msg, before, after));
        if (bad.length) finding('state written outside the sender\'s rights', tag + ' → ' + bad[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]'), { msg, change: bad[0] }, mut);
        if (threw && changes.length) finding('half-applied: an exception after state changed', tag + ' → ' + changes.slice(0, 2).map(c => c.path).join('; '), msg, mut);
        const padd = protoAdded(); if (padd.length) finding('prototype pollution', tag + ' → ' + padd.join(', '), msg, mut);
        if (net.targets && Object.getPrototypeOf(net.targets) !== Object.prototype) { finding('net.targets re-parented (a "__proto__" key)', tag, msg); net.targets = {}; }
        if (net.combats && Object.getPrototypeOf(net.combats) !== Object.prototype) { finding('net.combats re-parented (a "__proto__" key)', tag, msg); seedCombat(); }
        const persisted = rec.saves.filter(s => s.persist);
        if (persisted.length && (who === 's' || who === 'w')) finding('a disk save caused by an unadmitted peer', 'any message but hb/hello from a waiting peer or a stranger: the gate closes the connection, and the close handler saves to disk and broadcasts the roster', msg, kind + ' from ' + who);
        else if (persisted.length && !changes.length && msg.type !== 'hello') finding('a disk save with nothing changed', tag, msg, mut);
        rec.fetches.forEach(f => { if (!/^\/saves\/images\//.test(f.url)) finding('a fetch outside /saves/images/', tag + ' → ' + f.url.slice(0, 80), msg); });
        if (rec.fetches.length && !/^asset-req/.test(kind)) finding('a fetch the message should not cause', tag + ' → ' + rec.fetches[0].url.slice(0, 80), msg);
        rec.html.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('raw hostile string in a markup sink (innerHTML)', tag + ' → #' + h.el, msg); });
        rec.attr.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('raw hostile string in an attribute sink', tag + ' → #' + h.el + '.' + h.k, msg); });
        rec.style.forEach(h => { if (/NaN|undefined|\[object|Infinity/.test(h.v)) finding('garbage reaches a CSS value', tag + ' → ' + h.k + '=' + h.v.slice(0, 40), msg); });
        [].concat(rec.html, rec.text, rec.attr).forEach(h => { if (h.v.length > 60000) finding('an unbounded string reaches the page', tag + ' → #' + h.el + ' (' + h.v.length + ' chars)', msg); });
        if (longest(after.app) > 100000) finding('an unbounded string is kept in the campaign (and would be saved)', tag, msg, mut);
        if (longest(after.roster) > 100000) finding('an unbounded string is kept on the roster', tag, msg, mut);
        rec.confirms.forEach(c => { const k = msg.type + '|' + (pid || conn.peer); confirmsBy.set(k, (confirmsBy.get(k) || 0) + 1); if (confirmsBy.get(k) === 2) finding('a dialog raised more than once per message type by one peer', msg.type + ' from ' + (pid || 'a stranger') + ' → "' + c.text.slice(0, 80) + '"', msg); });
        if (dt > 200 && !opts.again) { const t1 = performance.now(); try { net._handleMessage(clone(msg), conn); } catch (e) {} finally { net.applyingRemote = false; } flushTimers(); const dt2 = performance.now() - t1; if (dt2 > 200) finding('one message takes more than 200 ms', tag + ' (' + Math.round(dt) + ' ms, again ' + Math.round(dt2) + ' ms)', msg, mut); }
        if (GM_D && sentLog.slice(sentBefore).some(s => { try { return JSON.stringify(s.m).indexOf(GM_D) >= 0; } catch (e) { return false; } })) finding('the GM\'s signing key (its private half) is sent', tag, msg, mut);
        sentLog.slice(sentBefore).forEach(s => { const why = secretLeak(s.m); if (why) finding('a secret door is given away in a send', tag + ' → ' + s.m.type + ' to ' + s.to + ' holds ' + why, msg, mut); });   // fold B5: a secret door
        warned.forEach(w => { if (/wire send failed/.test(w)) finding('a send the packer refused (console.warn)', tag + ' → ' + w.slice(0, 100), msg); });
        if (who === 's' || who === 'w') {
            const toThem = sentLog.slice(sentBefore).filter(s => s.to === conn.peer && s.m.type !== 'hb' && s.m.type !== 'denied' && s.m.type !== 'wait' && !(s.m.type === 'gmhello' && hailShape(s.m)));   // (the host's early proof — who the GM is, the public key, a signature — is all a peer not yet admitted may be sent besides)
            if (toThem.length) finding('an unadmitted peer is sent something of the table', tag + ' → ' + toThem[0].m.type, msg);
        }
        return { threw, changes, dt };
    }

    const campH = () => stubs.getActiveCampaign(), tokH = id => campH().items.m_open.whiteboard.find(w => w.id === id);
    const expectHost = {
        'item': o => tokH('tok_p1').x === 120 && tokH('tok_p1').y === 130 && !!tokH('stroke_p1') && tokH('stroke_p1').byPlayer === true && o.p2.some(m => m.type === 'itemDelta' || m.type === 'item')
            && JSON.stringify(tokH('stroke_wall')) === JSON.stringify({ id: 'stroke_wall', type: 'path', byPlayer: true, ownerId: 'u_p1', blocksSight: true, sightType: 'wall', pts: [[0, 0], [30, 0]], color: '#ffffff', strokeWidth: 3, x: 700, y: 40, w: 30, h: 1, baseW: 30, baseH: 1, z: 35 })   // 49 (c): the line the GM made a wall is as it was, redraw and move refused
            && !!tokH('stroke_bar') && tokH('stroke_bar').barrier === true && o.p1.some(m => m.type === 'item' && m.itemId === 'm_open' && (m.item.whiteboard || []).some(w => w.id === 'stroke_bar'))   // ...the one made a barrier is not erased, and the sender gets the map whole with it
            && ['stroke_lockwall', 'stroke_lockout'].every(id => JSON.stringify(tokH(id)) === JSON.stringify(pristine.items.m_open.whiteboard.find(w => w.id === id)) && tokH(id).locked === true && tokH(id).blocksSight === true
                && o.p1.some(m => m.type === 'item' && m.itemId === 'm_open' && (m.item.whiteboard || []).some(w => w.id === id && w.blocksSight === true && !hasOwn(w, 'locked'))))   // Match a wall, round three: the sender's two lines that the GM made a wall AND locked, one sent redrawn and one left out, are as they were, and the map sent back whole holds both, with no lock
            && ['stroke_sq', 'stroke_fl', 'stroke_fi', 'stroke_num', 'stroke_mk'].every(id => !!tokH(id) && tokH(id).byPlayer === true && tokH(id).ownerId === 'u_p1') && tokH('stroke_sq').tip === 'square' && tokH('stroke_fl').tip === 'flat'
            && ['stroke_fi', 'stroke_num', 'stroke_mk'].every(id => !hasOwn(tokH(id), 'tip')),   // ...and of the five new drawings sent with something under tip, the square and the flat nib are kept and the Fill tip, the number and the markup are no key at all

        'threats': () => JSON.stringify(tokH('tok_p1').threats) === '[90,180]',
        'needItem': o => o.p1.some(m => m.type === 'item' && m.itemId === 'm_open'),
        'travel': o => net.roster.peer_p1.location === 'm_fog' && o.p1.some(m => m.type === 'stage') && o.p1.some(m => m.type === 'mapBack' && m.itemId === 'm_open') && !o.p2.some(m => m.type === 'mapBack'),
        'target': o => net.targets.u_p1 && net.targets.u_p1.id === 'tok_npc' && o.p2.some(m => m.type === 'targets'),
        'share': o => o.p2.some(m => m.type === 'handout' && m.title === 'Note' && m.sharedById === 'u_p1' && !!m.look && m.look.font === 'Lora' && JSON.stringify(m.look.fmt) === JSON.stringify({ spans: [{ s: 2, e: 8, b: true, link: 'https://a.example/' }] })),   // (relayed with its look, cleaned for the text as relayed)
        'share-image': () => rec.journal.length === 1 && rec.journal[0].mime === 'image/png' && rec.journal[0].data instanceof ArrayBuffer,
        'pos': o => tokH('tok_p1').x === 150 && tokH('tok_p1').y === 160 && o.p2.some(m => m.type === 'pos' && m.x === 150),
        'char-edit': o => campH().chars.c_p1.values.f_str === 12 && o.p1.some(m => m.type === 'char-ack'),
        'char-edits': () => campH().chars.c_p1.values.f_str === 13 && campH().chars.c_p1.values.f_dex === 11,
        'char-apply': o => o.p1.some(m => m.type === 'char-ack') && o.p1.some(m => m.type === 'apply'),
        'turn-hold': () => net.combats.m_open.turn === 1 && net.combats.m_open.rows.some(r => r.id === 'row_p1' && r.held === 1),
        'turn-end': () => net.combats.m_open.turn === 1,
        'char-upload': o => o.p1.some(m => m.type === 'char-upload-ans' && typeof m.n === 'number'),
        'char-item': o => Array.isArray(campH().chars.c_p1.values.f_inv) && campH().chars.c_p1.values.f_inv.length === 1 && o.p1.some(m => m.type === 'char-ack'),
        'lib-idx': o => o.p1.some(m => m.type === 'lib-idx-ans'),
        'char-effect': o => o.p1.some(m => m.type === 'char-ack') && Array.isArray(campH().chars.c_p1.values.f_fx) && campH().chars.c_p1.values.f_fx.length === 1,
        'char-style': o => !!(campH().chars.c_p1.looks && campH().chars.c_p1.looks.f_class && campH().chars.c_p1.looks.f_class.fmt.b === true) && o.p1.some(m => m.type === 'charstyle-ack') && o.p1.some(m => m.type === 'charStyle') && !o.p2.some(m => m.type === 'charStyle'),
        'door-req': () => tokH('door1').doorOpen === true,
        'door-req-secret': o => JSON.stringify(tokH('door_secret')) === JSON.stringify(pristine.items.m_open.whiteboard.find(w => w.id === 'door_secret')) && !o.p1.concat(o.p2).some(m => m.type === 'door-deny' || m.type === 'item' || m.type === 'itemDelta'),   // fold B5: a secret door: as the GM left it, nobody told a thing
        'door-req-line': o => LINE_DOOR_IDS.every(id => JSON.stringify(tokH(id)) === JSON.stringify(pristine.items.m_open.whiteboard.find(w => w.id === id))) && tokH('door_line').doorLock === true && !o.p1.concat(o.p2).some(m => m.type === 'door-deny' || m.type === 'item' || m.type === 'itemDelta'),   // Match a wall: the three secret doors drawn as lines as the GM left them, nobody told a thing (not even that the one named is locked)
        'char-pic': o => rec.pics.length === 1 && o.p1.some(m => m.type === 'char-pic-ans' && m.ok === true),
        'char-make': o => o.p1.some(m => m.type === 'char-make-ans' && m.reason === 'have'),
        'char-name': o => o.p1.some(m => m.type === 'char-name-ans' && m.reason === 'notmaking'),
        'char-done': o => o.p1.some(m => m.type === 'char-done-ans' && m.reason === 'notmaking'),
        'char-delete': o => o.p1.some(m => m.type === 'char-delete-ans' && m.reason === 'inplay'),
        'char-token': o => o.p1.some(m => m.type === 'char-token-ans' && m.reason === 'have'),
        'tok-pic': o => rec.pics.length === 1 && o.p1.some(m => m.type === 'tok-pic-ans' && m.ok === true),
        'tok-light': o => tokH('tok_p1').light && tokH('tok_p1').light.name === 'Torch' && o.p1.some(m => m.type === 'tok-light-ans' && m.ok === true) && o.p2.some(m => m.type === 'item' || m.type === 'itemDelta'),
        'my-look': o => net.roster.peer_p1.face === '\ud83d\ude42' && o.p2.some(m => m.type === 'roster'),
        'roll-req': o => o.p2.some(m => m.type === 'roll' && m.expr === '1d20 + 3') && o.p1.some(m => m.type === 'roll'),
        'roll-req-char': o => o.p2.some(m => m.type === 'roll' && m.as === 'Ayla'),
        'asset-req': o => rec.fetches.length === 1 && o.p1.some(m => m.type === 'asset' && m.path === '/saves/images/pic.png'),
        'asset-req-audio': o => o.p1.some(m => m.type === 'asset-part'),
        'chat': o => o.p2.some(m => m.type === 'chat' && m.text === 'hello table' && m.from.id === 'u_p1' && !m.from.gm) && !o.p1.some(m => m.type === 'chat')
    };
    /* ---------- generic fuzz over every host type from each sender ---------- */
    console.log('# host world: ' + Object.keys(host.tpl).length + ' message kinds × mutations × senders');
    for (const kind of Object.keys(host.tpl)) {
        const tpl = host.tpl[kind];
        await resetWorld();
        const muts = mutations(tpl);
        for (const m of muts) {
            const s1 = conns.p1.sent.length, s2 = conns.p2.sent.length;
            await fireHost('p1', kind, m.name, m.msg);
            if (m.name === 'well-formed' && expectHost[kind]) { let ok = false; try { ok = !!expectHost[kind]({ p1: conns.p1.sent.slice(s1), p2: conns.p2.sent.slice(s2) }); } catch (e) { ok = false; } check('host: the well-formed ' + kind + ' takes effect (the fuzz reaches the real path)', ok, { p1: conns.p1.sent.slice(s1).map(x => x.type + (x.reason ? ':' + x.reason : '') + (x.message || x.msg ? ' (' + (x.message || x.msg) + ')' : '')), p2: conns.p2.sent.slice(s2).map(x => x.type), toasts: rec.toasts.slice(0, 3), journal: rec.journal.length }); }
        }
        await resetWorld();
        for (const m of muts.slice(0, 14)) { await fireHost('w', kind, m.name, m.msg); if (!conns.w.open) { conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' }); } }
        for (const m of muts.slice(0, 14)) { await fireHost('s', kind, m.name, m.msg); }
        // the second player sends the first player's own message: nothing of p1's may move
        await resetWorld();
        await fireHost('p2', kind + ' (p2 sends p1\'s message)', 'well-formed', cloneMsg(tpl));
        // a flood of 500 well-formed from p1
        await resetWorld(); const sb = sentLog.length; const tf = performance.now(); let threwN = 0;
        for (let i = 0; i < 500; i++) { const m = cloneMsg(tpl); if (m.rid) m.rid = 'f' + i; if (m.a !== undefined) m.a = i + 10; try { net._handleMessage(m, conns.p1); } catch (e) { threwN++; } finally { net.applyingRemote = false; } if (!conns.p1.open) break; }
        flushTimers(); await drain(); flushTimers();
        const dtf = performance.now() - tf, outN = sentLog.length - sb;
        if (dtf > 2000) finding('a flood of 500 takes more than 2 s', kind + ' (' + Math.round(dtf) + ' ms)', tpl);
        if (outN > 1500) finding('a flood of 500 is amplified past 1500 sends', kind + ' → ' + outN + ' messages out', tpl);
        if (rec.toasts.length > 60) finding('a flood of 500 raises more than 60 toasts on the GM', kind + ' → ' + rec.toasts.length, tpl);
        if (rec.saves.length > 60) finding('a flood of 500 causes more than 60 disk saves', kind + ' → ' + rec.saves.length, tpl);
        if (threwN) finding('exception escapes handleMessage', kind + ' during a flood', tpl);
        checks++; const bad = openFindings().some(f => f.detail.indexOf(kind + ' ') === 0 || f.detail.indexOf(kind + ' (') === 0 || f.detail.indexOf(kind + '|') === 0);
        if (bad) checksFailed++;
        console.log((bad ? 'FAIL      ' : 'ok        ') + 'host: ' + kind + ' — ' + muts.length + ' mutations × p1, 14 × waiting, 14 × stranger, p2, a flood of 500');
    }

    /* ---------- ordered scenarios on the host ---------- */
    function drainDialogs() { for (let n = 0; n < 60; n++) { const d = allConfirms.find(x => !x.answered); if (!d) return; d.answered = true; d.cb(false); flushTimers(); } }
    await resetWorld();
    {   // a drag: moves, a final, then a stale move after the drop; a replayed final; an item patch with an old number
        const seq = [{ x: 110, y: 100, final: false }, { x: 120, y: 100, final: false }, { x: 130, y: 100, final: true }, { x: 115, y: 100, final: false }, { x: 130, y: 100, final: true }];
        let bad = false;
        for (const s of seq) { const r = await fireHost('p1', 'pos sequence', 'drag then stale', Object.assign({ type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', rot: 0, front: 0, a: 7 }, s)); if (r.threw) bad = true; }
        const old = clone(host.tpl.item); old.a = 1; await fireHost('p1', 'item replay', 'old action number', old);
        check('host: a drag, its drop, a stale move after it and a replayed patch run without a throw', !bad);
    }
    {   // a drop on the hidden trap tile travels; one into the wall is refused
        await resetWorld();
        await fireHost('p1', 'pos onto trap', 'final on the hidden trap tile', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 200, y: 100, rot: 0, front: 0, final: true, a: 9 });
        check('host: a drop on a hidden trap tile travels the player (a stage sent, their location moved)', net.roster.peer_p1.location === 'm_fog' && conns.p1.sent.some(m => m.type === 'stage'));
        await resetWorld();
        await fireHost('p1', 'pos into wall', 'final past the wall', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 602, y: 100, rot: 0, front: 0, final: true, a: 9 });
        const tk = stubs.getActiveCampaign().items.m_open.whiteboard.find(w => w.id === 'tok_p1');
        check('host: a drop through a wall is put back and the mover told', tk.x === 100 && conns.p1.sent.some(m => m.type === 'pos' && m.x === 100) && conns.p1.sent.some(m => m.type === 'turn-note'));
    }
    {   // the players' own words at the host: 'travel' naming the hidden trap by id tells nothing
        await resetWorld(); const sb = conns.p1.sent.length;
        await fireHost('p1', 'travel naming the trap', 'hidden portal id', { type: 'travel', viaItemId: 'trap1' });
        check('host: naming a hidden trap tile in a travel moves nobody and answers nothing', net.roster.peer_p1.location === 'm_open' && conns.p1.sent.length === sb);
    }
    {   // a portal's own lock (the owner, 2026-10-03): a travel naming the locked portal and a drop on it, against the whole of net.js
        await resetWorld(); const den = () => conns.p1.sent.filter(m => m.type === 'travelDenied' && m.reason === 'portal'), stages = () => conns.p1.sent.filter(m => m.type === 'stage').length, s0 = stages(), d0 = den().length;
        await fireHost('p1', 'travel through the locked portal', 'the locked portal\'s id', { type: 'travel', viaItemId: 'portal_locked' }); const d1 = den().length - d0;
        await fireHost('p1', 'travel through the locked portal', 'again within 4 s', { type: 'travel', viaItemId: 'portal_locked' }); const d2 = den().length - d0;
        await fireHost('p1', 'pos onto the locked portal', 'final on the locked portal', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 250, y: 100, rot: 0, front: 0, final: true, a: 9 }); const d3 = den().length - d0;
        const tkL = stubs.getActiveCampaign().items.m_open.whiteboard.find(w => w.id === 'tok_p1'), landed = !!tkL && tkL.x === 250 && tkL.y === 100;
        clockOff += 4001; await fireHost('p1', 'travel through the locked portal', 'after 4 s', { type: 'travel', viaItemId: 'portal_locked' }); const d4 = den().length - d0;
        const pl = stubs.getActiveCampaign().items.m_open.whiteboard.find(w => w.id === 'portal_locked');
        check('host: a travel naming the portal the GM locked, and a drop of the player\'s own token on it, move nobody (no stage word, their location kept, the token resting where it was dropped) and are answered with one travelDenied of reason "portal" in 4 s — nothing but the reason in it — and again after 4 s; the portal stays locked',
            net.roster.peer_p1.location === 'm_open' && stages() === s0 && landed && d1 === 1 && d2 === 1 && d3 === 1 && d4 === 2 && den().every(m => Object.keys(m).length === 2) && !!pl && pl.portalLock === true, { d: [d1, d2, d3, d4], loc: net.roster.peer_p1.location, landed });
        await resetWorld(); const sU = stages();
        await fireHost('p1', 'travel through the open portal', 'the open portal beside it', { type: 'travel', viaItemId: 'portal_vis' });
        check('host: the open portal beside it still lets the same player through (one stage word, their location moved)', net.roster.peer_p1.location === 'm_fog' && stages() === sU + 1);
        await resetWorld();   // a drawing of the player's own, drawn and then redrawn as a locked portal: the host takes the redraw and nothing else (the write oracle judges each key that changed)
        await fireHost('p1', 'item', 'the well-formed copy (it adds the drawing)', clone(host.tpl.item));
        const redraw = clone(host.tpl.item), stR = redraw.item.whiteboard.find(w => w.id === 'stroke_p1'); stR.pts = [[0, 0], [12, 12], [30, 5]]; stR.x = 5; stR.portalLock = true; stR.targetMapId = 'm_fog';
        await fireHost('p1', 'item redraw as a locked portal', 'the drawing redrawn and sent as a locked portal', redraw);
        const stH = stubs.getActiveCampaign().items.m_open.whiteboard.find(w => w.id === 'stroke_p1');
        check('host: a player\'s own drawing redrawn and sent as a locked portal lands as the redraw alone — the write oracle sees the drawing change and no key a player may not write', !!stH && JSON.stringify(stH.pts) === JSON.stringify([[0, 0], [12, 12], [30, 5]]) && !openFindings().some(f => /item redraw as a locked portal/.test(f.detail)), stH && Object.keys(stH));
    }
    {   // needItem with a prototype key as the item id (the inventory's worry 5)
        await resetWorld(); const sb = sentLog.length; let threw = null;
        for (const id of ['constructor', '__proto__', 'hasOwnProperty', 'toString', 'pl_1', 'd_notes', 'tok_hidden']) { const r = await fireHost('p1', 'needItem', 'item id ' + id, { type: 'needItem', campId: 'c1', itemId: id }); if (r.threw) threw = r.threw; }
        const got = sentLog.slice(sb).filter(s => s.to === 'peer_p1' && s.m.type === 'item');
        got.filter(g => g.m.itemId in Object.prototype).forEach(g => finding('needItem names an item id without own(): a prototype key reaches sendItem', 'needItem ' + g.m.itemId + ' from an admitted player → an item sent (' + short(g.m.item).slice(0, 40) + '); constructor / toString / hasOwnProperty make a send the packer refuses', g.m));
        check('host: needItem of a prototype key, a planner or a hidden token sends no item (and throws nowhere)', !threw && got.every(g => !(g.m.itemId in Object.prototype) && g.m.item && (g.m.item.type === 'map' || g.m.item.type === 'doc')) && !got.some(g => JSON.stringify(g.m).indexOf('secret') >= 0), { threw: threw && threw.message, items: got.map(g => g.m.itemId) });
    }
    {   // 'target': one Start-combat dialog per NPC token the player names — how many dialogs can one player queue?
        await resetWorld(); net.combats = {}; const stub = stubs.getActiveCampaign(); for (let i = 0; i < 40; i++) stub.items.m_open.whiteboard.push({ id: 'npcx' + i, type: 'circle', isChar: true, charName: 'Mob ' + i, x: 10 * i, y: 500, w: 50, h: 50 });
        resetRec(); let n = 0;
        for (let i = 0; i < 40; i++) { net._handleMessage({ type: 'target', id: 'npcx' + i, mapId: 'm_open' }, conns.p1); n += rec.confirms.length; rec.confirms.length = 0; clockOff += 120; }
        clockOff += 6000;
        if (n > 1) finding('UI trap: a player queues a Start-combat dialog on the GM per NPC token named', 'target from u_p1 → ' + n + ' dialogs for 40 tokens (only Settings ▸ targetAsk off stops it)', { type: 'target', id: 'npcx…', mapId: 'm_open' });
        check('host: the Start-combat offer is raised at most once per player (' + n + ' dialogs for 40 NPC tokens targeted in turn)', n <= 1);
    }
    {   // approvedIds: the GM says yes to a join whose connection dropped meanwhile; the NEXT hello claiming that id is admitted without a key
        await resetWorld(); drainDialogs(); resetRec(); clockOff += 20000;
        const cS = connect('peer_dropper'); hello(cS, { id: 'u_drop', name: 'Dropper' });
        const dlg = rec.confirms[rec.confirms.length - 1];
        cS.close(); flushTimers();
        const dlgOk = !!dlg; if (dlg) { dlg.answered = true; dlg.cb(true); } flushTimers();
        const cT = connect('peer_thief'); hello(cT, { id: 'u_drop', name: 'Thief' }); flushTimers(); await drain();
        const admitted = !!net.roster.peer_thief;
        if (admitted) finding('identity: a yes to a dropped join admits the next hello claiming that public id, with no table key', 'hello from peer_thief as u_drop (approvedIds) → admitted, a fresh key issued', { type: 'hello', profile: { id: 'u_drop' } });
        check('host: a join approved after its connection dropped is not open to any later hello claiming that id', dlgOk && !admitted);
        if (admitted) net.kickPlayer('peer_thief'); flushTimers();
    }
    {   // the password lockout is table-wide
        await resetWorld(); document.getElementById('netPassInput').value = 'secret'; resetRec();
        for (let i = 0; i < 20; i++) { const c = connect('peer_guess' + i); hello(c, { id: 'u_g' + i, name: 'G' }, { password: 'wrong' }); flushTimers(); }
        const cOk = connect('peer_right'); hello(cOk, { id: 'u_right', name: 'R' }, { password: 'secret' }); flushTimers();
        const lockedOut = cOk.sent.some(m => m.type === 'denied' && /Too many/.test(m.reason));
        if (lockedOut) finding('denial of service: 20 wrong passwords from anyone lock every join for a minute', 'hello with the right password after a stranger\'s 20 wrong ones → denied', { type: 'hello', password: 'wrong' });
        check('host: a stranger\'s wrong passwords do not lock out a player with the right one', !lockedOut);
        document.getElementById('netPassInput').value = ''; clockOff += 61000;
    }
    {   // a second connection claiming an admitted player's id while they are live
        await resetWorld(); const cD = connect('peer_dup'); const admD = await admit(cD, { id: 'u_p1', name: 'Ayla2' }, K1);
        check('host: a live duplicate of an admitted id is denied before any challenge (no auth sent, no proof asked), though it holds the right key', !admD.ok && !net.roster.peer_dup && cD.sent.some(m => m.type === 'denied') && !cD.sent.some(m => m.type === 'auth'), admD);
    }
    {   // hold: a zombie connection kept alive; unadmitted connections uncounted
        await resetWorld(); const before = net.conns.length;
        for (let i = 0; i < 300; i++) { const c = connect('peer_zombie' + i); net._handleMessage({ type: 'hb' }, c); }
        const n = net.conns.length - before;
        if (n >= 300) finding('resource: unadmitted connections that only heartbeat are kept with no count cap', n + ' heartbeating strangers held for 10 min each (a DataChannel, _connMeta and lastSeen apiece)', { type: 'hb' });
        check('host: the number of unadmitted heartbeating connections is capped', n < 300);
        net.conns.slice(before).forEach(c => c.close()); flushTimers();
    }
    {   // the asset path: the bytes read for one connection are budgeted (150 MB a minute, judged on each file's stated length before the read; cluster J #5).
        // The asset gate serves a connection only a file it was sent a reference to, so the 200 pictures (each stating 1 MB) are first put on the
        // player's map and the map sent (an honest battle map with many pictures); then each is asked for in one burst
        await resetWorld(); resetRec();
        const mapA = stubs.getActiveCampaign().items.m_open;
        for (let i = 0; i < 200; i++) mapA.whiteboard.push({ id: 'img_' + i, type: 'image', src: '/saves/images/p' + i + '.png', x: 800 + i, y: 800, w: 10, h: 10, layer: 'bottom' });
        net.sendItem('c1', 'm_open'); flushTimers(); await drain(); flushTimers();
        const refsNoted = conns.p1.sent.some(m => (m.type === 'item' || m.type === 'itemDelta') && JSON.stringify(m).indexOf('/saves/images/p199.png') >= 0);
        resetRec();
        for (let i = 0; i < 200; i++) net._handleMessage({ type: 'asset-req', path: '/saves/images/p' + i + '.png' }, conns.p1);
        await drain(); flushTimers(); await drain();
        const busyN = conns.p1.sent.filter(m => m.type === 'asset' && m.error === 'busy' && /\/p\d+\.png$/.test(m.path)).length, servedN = conns.p1.sent.filter(m => m.type === 'asset' && !m.error && /\/p\d+\.png$/.test(m.path)).length;
        if (rec.reads > 150) finding('resource: pictures read for one connection past 150 MB in a minute, each up to 26 MB held in memory', 'asset-req ×200 of 1 MB each from u_p1 (every path one the map they were sent names) → ' + rec.reads + ' MB read by the host', { type: 'asset-req', path: '/saves/images/pN.png' });
        check('host: the 200 pictures reached the player as references (the probe asks for files the gate will serve)', refsNoted);
        check('host: the pictures read for one connection are budgeted by bytes — of 200 asked in one burst, each stating 1 MB, at most 150 MB are read and served in a minute and the rest are answered busy with their bodies cancelled unread (' + rec.reads + ' read, ' + servedN + ' served, ' + busyN + ' busy, ' + rec.cancels + ' cancelled)', rec.reads <= 150 && servedN === rec.reads && servedN + busyN === 200 && rec.cancels === busyN && busyN > 0);
        clockOff += 11000; resetRec(); net._handleMessage({ type: 'asset-req', path: '/saves/images/never-sent.png' }, conns.p1); await drain();   // past the asset limiter's window: judged by the gate, not refused as busy
        check('host: a picture path this connection was never sent a reference to is answered as missing and never read', rec.fetches.length === 0 && conns.p1.sent.some(m => m.type === 'asset' && m.path === '/saves/images/never-sent.png' && m.error === 'missing'), conns.p1.sent.filter(m => m.type === 'asset').slice(-1));
        let bad = false; for (const p of ['/saves/data.json', '/api/data', '/saves/images/../data.json', '/saves/images/%2e%2e/data.json', 'http://evil/x.png', '/saves/images/a.png?x=1', '/saves/images/a\u0000.png', '\\saves\\images\\a.png']) { resetRec(); net._handleMessage({ type: 'asset-req', path: p }, conns.p1); await drain(); if (rec.fetches.some(f => !/^\/saves\/images\/[^.]/.test(f.url) || /\.\./.test(f.url))) bad = true; }
        check('host: an asset path outside /saves/images/ (dot segments, %2e%2e, another origin, a query, NUL, backslashes) fetches nothing', !bad);
    }
    {   // chat flood: each line re-renders the whole chat on the GM
        await resetWorld(); resetRec(); const t = performance.now(); let n = 0;
        for (let i = 0; i < 2000; i++) { const before = rec.renders; net._handleMessage({ type: 'chat', text: 'spam ' + i }, i % 2 ? conns.p1 : conns.p2); if (rec.toasts.length) n++; }
        const dt = performance.now() - t;
        check('host: a 2000-line chat storm from two players is held by the limiter in under 2 s (' + Math.round(dt) + ' ms)', dt < 2000);
    }
    {   // what a stranger costs: every junk message closes its connection — and the close handler saves to disk and broadcasts the roster
        await resetWorld(); resetRec(); const sb = sentLog.length;
        for (let i = 0; i < 50; i++) { const c = connect('peer_junk' + i); net._handleMessage({ type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: [] } }, c); flushTimers(); }
        const saves = rec.saves.filter(s => s.persist).length, rosters = sentLog.slice(sb).filter(s => s.m.type === 'roster').length;
        if (saves >= 50) finding('resource: a stranger\'s junk message costs the GM a disk save and a roster broadcast (the close handler\'s)', '50 junk messages from 50 connections → ' + saves + ' saves, ' + rosters + ' roster messages', { type: 'item' });
        check('host: a stranger\'s junk message does not cost a disk save', saves < 50);
    }
    {   // the transport, below handleMessage (the outside audit's cluster T): the guard on a connection's entry point, the handler's shape check, the gate on the peer's, and a right proof replayed over another connection's certificates
        await resetWorld(); resetRec(); drainDialogs(); const before = net.conns.length; let threwT = '';
        const tryIt = fn => { try { fn(); } catch (e) { threwT += String(e && e.message) + '; '; } };
        const bigRaw = (() => { const n = 39990, u = new Uint8Array(8 + n); u.set([0x81, 0xb1, 0x61, 0xd9, 0, 0, (n >> 8) & 255, n & 255]); u.fill(0x78, 8); return u.buffer; })();   // a well-formed packet ({ a: 'xxx…' }) of 40,000 bytes: only its size is wrong
        const raws = [['oversized', bigRaw], ['a list at the top', new Uint8Array([0x93, 1, 2, 3]).buffer], ['a count its bytes cannot hold', new Uint8Array([0x81, 0xb1, 0x61, 0xdd, 0xff, 0xff, 0xff, 0xff]).buffer], ['a key naming the prototype', new Uint8Array([0x81, 0xb9, 0x5f, 0x5f, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x5f, 0x5f, 0x80]).buffer], ['a text', 'text'], ['a third large message under way', null]];
        const rawOut = raws.map((r, i) => { const c = connect('peer_raw' + i); if (r[1] === null) { for (let k = 1; k <= 3; k++) { c._chunkedData = {}; for (let q = 1; q <= k; q++) c._chunkedData[q] = { data: [new Uint8Array(4)], count: 1, total: 4 }; tryIt(() => c._handleDataMessage({ data: new Uint8Array([0x81, 0xb1, 0x61, 0x01]).buffer })); } } else tryIt(() => c._handleDataMessage({ data: r[1] })); flushTimers(); return { what: r[0], closed: !c.open, decoded: c.inner, listed: net.conns.includes(c) }; });
        rawOut.filter(o => !o.closed || o.listed || (o.what !== 'a third large message under way' && o.decoded > 0)).forEach(o => finding('transport: a raw message the guard should refuse is decoded, or its connection kept', 'raw message (' + o.what + ') from a stranger → closed ' + o.closed + ', decoded ' + o.decoded + ', still listed ' + o.listed, { raw: o.what }));
        const okRaw = connect('peer_rawok'); tryIt(() => okRaw._handleDataMessage({ data: new Uint8Array([0x81, 0xb4, 0x74, 0x79, 0x70, 0x65, 0xb2, 0x68, 0x62]).buffer }));
        check('host: a stranger\'s raw message the transport guard refuses — oversized, no map at the top, a count its bytes cannot hold, a key naming the prototype, not bytes at all, a third large message under way — closes the connection (the first five before the library decodes anything) and leaves nothing listed; an honest packet reaches the library', rawOut.every(o => o.closed && !o.listed) && rawOut.slice(0, 5).every(o => o.decoded === 0) && okRaw.open && okRaw.inner === 1 && threwT === '', { rawOut, threwT });
        okRaw.close(); flushTimers();
        // what the library hands the handler that is no binary data connection of its own class
        const cj = new Conn('peer_json'); cj.serialization = 'json'; const cn = new Conn('peer_noclass'); cn._handleDataMessage = null; const n1 = net.conns.length;
        tryIt(() => hostPeer.emit('connection', new Object('stranger'))); tryIt(() => hostPeer.emit('connection', cj)); tryIt(() => hostPeer.emit('connection', cn)); tryIt(() => hostPeer.emit('connection', null));
        if (net.conns.length !== n1) finding('transport: the host lists a thing that is no binary data connection', 'connection events with a String object, a json-encoded connection, one with no entry point and null → ' + (net.conns.length - n1) + ' listed', { type: 'connection' });
        check('host: a thing that is no connection, a connection in another encoding and one whose transport cannot be guarded are closed and never listed — nothing thrown', net.conns.length === n1 && !cj.open && !cn.open && threwT === '', { listed: net.conns.length - n1, threwT });
        // the signalling path: nothing a stranger can send reaches the library, a Waypoint's offer does
        const sig0 = hostPeer.sigIn;
        for (let i = 0; i < 200; i++) tryIt(() => hostPeer._handleMessage({ type: i % 2 ? 'CANDIDATE' : 'ANSWER', src: 'stranger', payload: { connectionId: 'dc_' + i, candidate: { candidate: BIG }, sdp: { type: 'answer', sdp: BIG } } }));
        ['constructor', 'toString', '__proto__', 'nope', 'json', 'raw'].forEach(ser => tryIt(() => hostPeer._handleMessage({ type: 'OFFER', src: 'stranger', payload: { type: 'data', connectionId: 'dc_o', serialization: ser, sdp: { type: 'offer', sdp: 'v=0' } } })));
        [{ type: 'OFFER', src: 'stranger', payload: { type: 'media', connectionId: 'mc_1', sdp: { type: 'offer', sdp: 'v=0' } } }, { type: 'OFFER', src: 'stranger', payload: { type: 'data', connectionId: 'dc_big', serialization: 'binary', sdp: { type: 'offer', sdp: BIG } } }, { type: 'ID-TAKEN', src: 'stranger' }, { type: 'EXPIRE', src: 'stranger' }, { type: 'OFFER' }, null, 'OFFER', { type: 'OFFER', src: {}, payload: [] }, ownProto()].forEach(m => tryIt(() => hostPeer._handleMessage(m)));
        const sigQuiet = hostPeer.sigIn - sig0; tryIt(() => hostPeer._handleMessage({ type: 'OFFER', src: 'kay', payload: { type: 'data', connectionId: 'dc_kay', serialization: 'binary', reliable: true, sdp: { type: 'offer', sdp: 'v=0\r\n' } } }));
        if (sigQuiet) finding('transport: a signalling message a stranger can send reaches the library', sigQuiet + ' of 215 hostile signalling messages passed the gate', { type: 'CANDIDATE / ANSWER / OFFER' });
        check('host: answers and candidates for connections nobody holds, offers naming another connection class, a call, an oversized description, the service\'s words with a sender on them and malformed messages never reach the library — a Waypoint\'s offer does; nothing thrown', sigQuiet === 0 && hostPeer.sigIn === sig0 + 1 && threwT === '', { sigQuiet, passed: hostPeer.sigIn - sig0, threwT });
        // a right proof made over ANOTHER connection's certificates (whoever sits between ends each leg with its own): never admitted
        resetRec(); const cm = new Conn('peer_between'); cm.peerConnection = pcStub(FP_H, 'sha-256 EE:05:99'); hostPeer.emit('connection', cm);
        const admM = await admit(cm, { id: 'u_p3', name: 'Cato' }, K3); const dlgM = rec.confirms[rec.confirms.length - 1];
        if (admM.ok) finding('identity: a proof passed along from another channel admits (the proof is not bound to the connection it travels on)', 'hello from peer_between as u_p3 with the right proof over the player\'s own leg → admitted', { type: 'hello', proof: '…', fp: [FP_P, FP_H] });
        if (dlgM) finding('identity: a right key proven over another connection is put to the GM as a question (it is refused: both ends were readable and they differ)', 'hello from peer_between as u_p3 → "' + dlgM.text.slice(0, 80) + '"', { type: 'hello', proof: '…', fp: [FP_P, FP_H] });
        const denM = cm.sent.filter(m => m.type === 'denied').map(m => m.reason), toldM = rec.toasts.filter(t => /^Cato was turned away: /.test(t)), logM = (stubs.getActiveCampaign().sessionLog || []).filter(e => e.kind === 'table' && /^Cato was turned away: /.test(e.text));
        const between = !admM.ok && !net.roster.peer_between && !dlgM && JSON.stringify(denM) === JSON.stringify(['This table could not check your connection. Try joining again.']) && toldM.length === 1 && logM.length === 1 && stubs.getActiveCampaign().players.u_p3.key === K3 && !cm.sent.some(m => m.type === 'wait' || m.type === 'snapshot');
        flushTimers();   // the refused connection is closed (400 ms after the word)
        // again and again inside the minute: refused each time, the GM told once
        const nToast = rec.toasts.length; let againOk = true;
        for (let i = 0; i < 3; i++) { const cx = new Conn('peer_between' + i); cx.peerConnection = pcStub(FP_H, 'sha-256 EE:05:99'); hostPeer.emit('connection', cx); const ax = await admit(cx, { id: 'u_p3', name: 'Cato' }, K3); if (ax.ok || !cx.sent.some(m => m.type === 'denied')) againOk = false; flushTimers(); }
        const quietM = rec.toasts.length === nToast && rec.confirms.length === 0;
        const c3 = connect('peer_p3'), nDlg = rec.confirms.length, adm3 = await admit(c3, { id: 'u_p3', name: 'Cato' }, K3);
        check('host: a right proof made over another connection\'s certificates admits nobody and asks nobody — the join is refused in the app\'s own words, the connection closed, no key issued, and the GM told once by a notice naming the player (a toast and a Session Log line; three more tries inside the minute say nothing more); the same player over their own connection\'s pair goes straight in, nobody asked', between && cm.open === false && againOk && quietM && adm3.ok && rec.confirms.length === nDlg, { admM, den: denM, told: toldM.length, logged: logM.length, againOk, quietM, adm3 });
        c3.close(); flushTimers(); await drain(); flushTimers();
    }
    {   // the GM-only field through the players' paths: a roll naming it, an edit of it, an apply reading it
        await resetWorld(); const sb = sentLog.length;
        await fireHost('p1', 'roll-req GM field', 'expr names the GM-only field', { type: 'roll-req', rid: 'g1', expr: '1d20 + GMFig', charId: 'c_p1' });
        await fireHost('p1', 'char-edit GM field', 'the GM-only field', { type: 'char-edit', rid: 'g2', charId: 'c_p1', fieldId: 'f_gmfig', value: 1 });
        await fireHost('p1', 'char-edit other\'s char', 'another player\'s character', { type: 'char-edit', rid: 'g3', charId: 'c_p2', fieldId: 'f_str', value: 1 });
        await fireHost('p1', 'char-edit npc', 'the NPC', { type: 'char-edit', rid: 'g4', charId: 'c_npc', fieldId: 'f_str', value: 1 });
        const camp = stubs.getActiveCampaign(), out = sentLog.slice(sb);
        check('host: the GM-only field is neither rolled by name, nor edited, nor is another\'s character or the NPC', camp.chars.c_p1.values.f_gmfig === 7 && camp.chars.c_p2.values.f_str === 9 && camp.chars.c_npc.values.f_str === 16 && !out.some(s => s.m.type === 'roll' && /GMFig/.test(JSON.stringify(s.m.names || ''))) && out.filter(s => s.m.type === 'char-deny').length >= 3, { gmfig: camp.chars.c_p1.values.f_gmfig, p2: camp.chars.c_p2.values.f_str, npc: camp.chars.c_npc.values.f_str, out: out.map(s => s.m.type + (s.m.reason ? ':' + s.m.reason : '')) });
        check('host: nothing sent to any player carries the GM-only value, the hidden token or the GM note', !out.some(s => /"f_gmfig":(7|3|99)|tok_hidden|the orc lies|secret plan/.test(JSON.stringify(s.m))));
        const sbL = sentLog.length, sigL = t => win.wpLook.textSig(t), lookL = t => ({ fmt: { b: true }, sig: sigL(t) }), clockL = clockOff; clockOff += 20000;
        const seedL = { f_gmtxt: lookL('a title the GM gave') }; stubs.getActiveCampaign().chars.c_p1.looks = JSON.parse(JSON.stringify(seedL));   // a look of the GM's own on a text the player sees and may not edit
        const styles = [['a text the player sees and only the GM edits', { charId: 'c_p1', fieldId: 'f_gmtxt', look: { fmt: { i: true }, sig: sigL('a title the GM gave') } }], ['taking off the GM\'s look there', { charId: 'c_p1', fieldId: 'f_gmtxt', look: null }], ['the GM-only text', { charId: 'c_p1', fieldId: 'f_gmword', look: lookL('the secret word') }], ['another player\'s character', { charId: 'c_p2', fieldId: 'f_class', look: lookL('Bard') }], ['the NPC', { charId: 'c_npc', fieldId: 'f_class', look: lookL('Brute') }], ['a number', { charId: 'c_p1', fieldId: 'f_str', look: lookL('14') }], ['other words', { charId: 'c_p1', fieldId: 'f_class', look: lookL('Wizard') }]];
        for (let k = 0; k < styles.length; k++) { clockOff += 500; await fireHost('p1', 'char-style ' + styles[k][0], styles[k][0], Object.assign({ type: 'char-style', rid: 'gs' + k }, styles[k][1])); }
        const outL = sentLog.slice(sbL), campL = stubs.getActiveCampaign();
        check('host: a player\'s look reaches no text they may not edit, be it hidden from them or in their sight, nor takes off a look the GM set there, and it reaches no character of another player and no NPC, a number takes none, and a look made for other words is no look: each is refused, nothing is kept, and the GM-only words are sent to nobody', JSON.stringify(campL.chars.c_p1.looks) === JSON.stringify(seedL) && JSON.stringify(campL.chars.c_p2.looks) === JSON.stringify({ f_class: { fmt: { i: true }, sig: sigL('Bard') } }) && campL.chars.c_npc.looks === undefined && outL.filter(s => s.m.type === 'charstyle-deny').length === styles.length && styles.length === 7 && !outL.some(s => s.m.type === 'charStyle' || s.m.type === 'charstyle-ack') && !outL.some(s => /the secret word/.test(JSON.stringify(s.m))), { looks: ['c_p1', 'c_p2', 'c_npc'].map(id => campL.chars[id].looks), out: outL.map(s => s.m.type + (s.m.reason ? ':' + s.m.reason : '')) });
    }
    {   // the early proof and the gates: a stranger whose hello passes them is sent it; a removed id, an older version and a wrong password are not
        await resetWorld(); drainDialogs(); resetRec(); clockOff += 20000;
        const cnOf = () => nodeCrypto.randomBytes(16).toString('hex'), realWait = ms => new Promise(r => realTimeout(r, ms));
        const cOk = connect('peer_hail_ok'), cnOk = cnOf(); hello(cOk, { id: 'u_hail', name: 'Hail' }, { cn: cnOk });
        const atOnce = cOk.sent.map(m => m.type); await settle(() => cOk.sent.some(m => m.type === 'gmhello'), 200);
        const hOk = cOk.sent.filter(m => m.type === 'gmhello');
        net._handleMessage({ type: 'hello', profile: { id: 'u_hail', name: 'Hail' }, version: '1.5.0', cn: cnOf() }, cOk); await realWait(30);   // a second hello, another nonce: no second proof
        stubs.getActiveCampaign().bannedPlayers.u_banned = true;
        const cBan = connect('peer_hail_ban'); hello(cBan, { id: 'u_banned', name: 'Banned' }, { cn: cnOf() });
        const cOld = connect('peer_hail_old'); hello(cOld, { id: 'u_old', name: 'Old' }, { cn: cnOf(), version: '1.4.9' });
        document.getElementById('netPassInput').value = 'secret';
        const cPw = connect('peer_hail_pw'); hello(cPw, { id: 'u_pw', name: 'Pw' }, { cn: cnOf(), password: 'wrong' });
        const cPwOk = connect('peer_hail_pwok'); hello(cPwOk, { id: 'u_pwok', name: 'PwOk' }, { cn: cnOf(), password: 'secret' });
        document.getElementById('netPassInput').value = '';
        const cNone = connect('peer_hail_none'); hello(cNone, { id: 'u_none', name: 'None' });   // no nonce (an older app)
        await settle(() => cPwOk.sent.some(m => m.type === 'gmhello'), 200); await realWait(30);
        const hailN = c => c.sent.filter(m => m.type === 'gmhello').length;
        check('host: the early proof follows the gates — a stranger\'s hello with a nonce is told to wait at once and sent ONE gmhello (Node\'s crypto verifies it over that nonce and this room; a second hello gets no second), and with the right session password likewise; a banned id, an older version, a wrong password and a hello with no nonce are sent none; each proof carries the GM id, the public key and the signature alone',
            JSON.stringify(atOnce) === JSON.stringify(['wait']) && hOk.length === 1 && hailN(cOk) === 1 && hailShape(hOk[0]) && sigOk(hOk[0].gmPub, hOk[0].sig, hostText(cnOk, hostPeer.id, 'u_gm')) && hailN(cPwOk) === 1 && hailN(cBan) === 0 && hailN(cOld) === 0 && hailN(cPw) === 0 && hailN(cNone) === 0
            && [cBan, cOld, cPw].every(c => c.sent.some(m => m.type === 'denied')), { atOnce, n: [hailN(cOk), hailN(cPwOk), hailN(cBan), hailN(cOld), hailN(cPw), hailN(cNone)] });
        delete stubs.getActiveCampaign().bannedPlayers.u_banned; [cOk, cBan, cOld, cPw, cPwOk, cNone].forEach(c => c.close()); flushTimers(); drainDialogs(); clockOff += 61000;
    }
    {   // the waiting peer and the stranger across the whole run heard nothing of the table
        const leak = sentLog.filter(s => /^peer_(w|s\d+|junk|zombie|guess|dropper|hail)/.test(s.to) && !/^(hb|wait|denied|auth)$/.test(s.m.type) && !(s.m.type === 'gmhello' && hailShape(s.m)));
        check('host: across the run, no waiting peer or stranger was sent anything but hb / wait / denied / auth and the host\'s early proof (the GM id, the public key and a signature, nothing else)', leak.length === 0, leak.slice(0, 3).map(l => l.to + ':' + l.m.type));
        const priv = !!GM_D && sentLog.some(s => { try { return JSON.stringify(s.m).indexOf(GM_D) >= 0; } catch (e) { return false; } });
        check('host: across the run, nothing sent to anyone holds the private half of the GM\'s signing key', !!GM_D && !priv);
    }
    /* ---------- fold B5: a secret door (the map builder), on the host. The GM's door_secret on the open field is a WALL to the players until it is
       found: in the join snapshot, in every copy, to a door request and in what the GM's own edits of it send. No message of a player's makes one,
       finds one, opens one or changes one ---------- */
    {
        const doorH = () => tokH(SD.id), pristineSD = JSON.stringify(pristine.items.m_open.whiteboard.find(w => w.id === SD.id)), eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const said = (c, n) => c.sent.slice(n).map(m => m.type + (m.reason ? ':' + m.reason : ''));
        const doorIn = m => piecesIn(m).find(w => w.id === SD.id) || null;
        const calm = async () => { flushTimers(); await drain(); flushTimers(); };
        const level = async () => { stubs.save(false); await calm(); };   // the GM's save: the table's copy of the map on screen is level with the host's
        const carry = n => sentLog.slice(n).filter(s => /^peer_p[12]$/.test(s.to) && (s.m.type === 'item' || s.m.type === 'itemDelta') && s.m.itemId === 'm_open');
        const noneOpen = re => !openFindings().some(f => re.test(f.detail));
        const reqS = { type: 'door-req', mapId: 'm_open', itemId: SD.id };

        // 1. the world, and the join snapshot
        await resetWorld(); await calm();
        check('host (a secret door): the world\'s door_secret is a secret door by the app\'s own judge (fogcore secretOn), and the piece this suite expects the players to hold is the one fogcore secretSeen gives for it, with no name and with no table of names left in the core to give it one, so the probes reach the real rule', typeof FC.secretOn === 'function' && typeof FC.secretSeen === 'function' && FC.secretOn(doorH()) === true && seenAsWall(FC.secretSeen(doorH())) && !hasOwn(FC.secretSeen(doorH()), 'name') && FC.secretName === undefined && FC.SECRET_NAMES === undefined && typeof doorH().name === 'string' && JSON.stringify(doorH()) === pristineSD, { seenName: typeof FC.secretSeen === 'function' ? (hasOwn(FC.secretSeen(doorH()), 'name') ? FC.secretSeen(doorH()).name : null) : 'no secretSeen', table: [typeof FC.secretName, typeof FC.SECRET_NAMES], secretOn: typeof FC.secretOn === 'function' ? FC.secretOn(doorH()) : 'no secretOn', seen: typeof FC.secretSeen === 'function' ? FC.secretSeen(doorH()) : 'no secretSeen', door: doorH() });
        const sdOf = snap => { const cs = snap && snap.appState && snap.appState.campaigns, it = cs && cs.c1 && cs.c1.items ? cs.c1.items.m_open : null; return it && Array.isArray(it.whiteboard) ? it.whiteboard.find(w => w && w.id === SD.id) || null : null; };
        const snapP2 = conns.p2.sent.find(m => m.type === 'snapshot');
        check('host (a secret door): the join snapshot gives each player the GM\'s secret door as a wall — its id and its box, a wall\'s type, the colour the GM named for it and the Wall material\'s pattern — with no door key, no lock, no name, no pattern or picture of its own and none of the GM\'s three keys, anywhere in the snapshot', seenAsWall(sdOf(snapP1)) && seenAsWall(sdOf(snapP2)) && secretLeak(snapP1) === '' && secretLeak(snapP2) === '', { p1: sdOf(snapP1), p2: sdOf(snapP2), leak: [secretLeak(snapP1), secretLeak(snapP2)] });
        // 1b. a plain wall has no name on the wire (the second review of fold B5): the world's named pieces, on the host and in the join snapshot
        const wallIds = Object.keys(NAMED.walls), keptIds = Object.keys(NAMED.kept);
        const pieceOf = (snap, id) => { const cs = snap && snap.appState && snap.appState.campaigns, it = cs && cs.c1 && cs.c1.items ? cs.c1.items.m_open : null; return it && Array.isArray(it.whiteboard) ? it.whiteboard.find(w => w && w.id === id) || null : null; };
        const nameOf = w => (!w ? 'gone' : hasOwn(w, 'name') ? w.name : null);   // null: the piece is there and has no name key at all
        // the world as the title tells it: each plain wall is the kind of piece named for it, and each piece that keeps its name is no plain wall for ONE reason (the two portals block nothing at all)
        const notAsTold = wallIds.filter(id => !tokH(id) || !WALL_AS[id] || !WALL_AS[id](tokH(id)) || !plainWall(tokH(id)))
            .concat(keptIds.filter(id => !tokH(id) || plainWall(tokH(id)) || (ONE_THING[id] ? !butFor(tokH(id), id) : !!(tokH(id).blocksSight || tokH(id).barrier === true || !tokH(id).targetMapId))));
        const hostOff = namesOff(id => nameOf(tokH(id)), hostName), snapOff = [snapP1, snapP2].map(snap => namesOff(id => nameOf(pieceOf(snap, id)), wireName)), snapOdd = [snapP1, snapP2].map(snap => wallIds.filter(id => !plainWall(pieceOf(snap, id))));
        check('host (a plain wall has no name): the world holds four pieces that have a name on the host and are plain walls by this suite\'s own reading: a wall, a see-through barrier, a wall whose Blocks sight flag is the number 1, and a wall drawn as a line. Beside them it holds eleven named pieces that are none. Nine would be a plain wall but for one thing: a door, a barrier\'s door, a wall that is a portal, a wall linked to a node, a picture that blocks sight, a text box that blocks sight, a piece whose barrier flag is a word, a token that blocks sight and a waiting token that is a barrier. Two are portals that block nothing. The join snapshot gives each player the four plain walls with no name and the eleven others under their own, and the host\'s own pieces keep every name',
            wallIds.length === 4 && keptIds.length === 11 && Object.keys(ONE_THING).length === 9 && Object.keys(ONE_THING).every(id => hasOwn(NAMED.kept, id)) && notAsTold.length === 0 && hostOff.length === 0
            && snapOff.every(l => l.length === 0) && snapOdd.every(l => l.length === 0),
            { notAsTold, hostOff, p1Off: snapOff[0], p2Off: snapOff[1], notPlainInSnapshot: snapOdd, counts: [wallIds.length, keptIds.length, Object.keys(ONE_THING).length] });
        // 1c. a plain wall leaves in ONE shape (the third review of fold B5): the six walls of the world that carry, on the host, a thing a copy cannot follow
        const shapeHost = hostShapesOff(tokH, doorH()), shapeSnap = [snapP1, snapP2].map(snap => shapesOff(id => pieceOf(snap, id))), twinSnap = [snapP1, snapP2].map(snap => TWIN_IDS.map(id => twinOff(sdOf(snap), pieceOf(snap, id)))), oddSnap = [snapP1, snapP2].map(oddWalls);
        check('host (a plain wall leaves in one shape): the world holds six plain walls that each carry, on the host, a thing a secret door\'s copy cannot follow. One has no sightType key, as a wall from a campaign file has none. One is typed window, a word the app does not know. One writes its colour #8C7B5A. One stands in the secret door\'s own group and wears the look named for the door. One keeps doorOpen, doorLock, targetRoomId, trap, portalIcon and portalLock. One is a wall as a file with one schema for every piece writes it, in the look named for the door: groupId, doorOpen, doorLock, targetMapId, nodeId, targetRoomId, trap, portalIcon and portalLock are each there and empty. The join snapshot gives each player the first two typed wall, the third in #8c7b5a, the fourth with no group, the fifth with none of the six keys and the sixth with none of the nine, targetMapId and nodeId among them. In the snapshot the wall of the door\'s group and the one-schema wall each differ from the door\'s copy by id and place alone, and no plain wall stands in another shape. The host\'s own pieces keep what they carry',
            SHAPED_IDS.length === 6 && shapeHost.length === 0 && doorH().groupId === SD.group && shapeSnap.every(l => l.length === 0) && twinSnap.every(l => l.length === TWIN_IDS.length && l.every(t => t === null)) && oddSnap.every(l => l.length === 0),
            { p1Off: shapeSnap[0], p2Off: shapeSnap[1], twin: twinSnap, hostOff: shapeHost, doorGroup: doorH().groupId, oddWalls: oddSnap.map(l => l.slice(0, 4)) });

        // 1d. Match a wall: the world's three secret doors drawn as lines beside the wall lines they were matched to, the lines of the sweep, and the join snapshot
        const wbH = () => campH().items.m_open.whiteboard, pristineOf = id => JSON.stringify(pristine.items.m_open.whiteboard.find(w => w.id === id)), pieceIn = (m, id) => piecesIn(m).find(w => w.id === id) || null;
        const lineDoorsMoved = () => LINE_DOOR_IDS.filter(id => JSON.stringify(tokH(id)) !== pristineOf(id));   // the secret doors drawn as lines that are not byte for byte as the GM left them
        // round three: a wall line reaches a door as far as half its drawn width, held to 100 px, and 12 px more. gapOf is this suite's own measure of the gap between two straight lines
        // of the board that do not cross. The world's wall line whose width is past any board must stand out of reach of every door, or it would answer for one of them
        const endsOf = w => { const s = FC.pathSegs(w); return [[s[0][0], s[0][1]], [s[s.length - 1][2], s[s.length - 1][3]]]; };
        const ptLine = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0; return Math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1]); };
        const gapOf = (v, w) => { const a = endsOf(v), b = endsOf(w); return Math.min(ptLine(a[0], b[0], b[1]), ptLine(a[1], b[0], b[1]), ptLine(b[0], a[0], a[1]), ptLine(b[1], a[0], a[1])); };
        const hugeGaps = LINE_ALL_IDS.map(id => Math.round(gapOf(tokH(id), tokH('line_huge'))));
        const hugeWas = Object.assign(clone(tokH('line_huge')), { id: 'line_huge_was', y: 400 }), hugeHit = FC.secretMatch(tokH('door_bare'), [tokH('wall_thin'), hugeWas]), hugeAlone = FC.secretMatch(tokH('door_bare'), [hugeWas]);   // the same line where it stood in round two, 100 px under door_bare: asked beside the door's own wall, and alone
        const hugeOn = Object.assign(clone(tokH('line_huge')), { id: 'line_huge_on', x: 1260, y: 350, pts: [[0, 0], [60, 0]], w: 60, baseW: 60 }), hugeOnHit = FC.secretMatch(tokH('door_bare'), [tokH('wall_thin'), hugeOn]);   // round four: that line laid 50 px under the door for all the door's length, so that the door's two ends lie inside its stroke, which reaches 100 px a side
        // round five. An END in the stroke is reached whatever the middle does, and a wall is not aside where the two strokes overlap. The line's stroke reaches 100 px a side, so with the pixel
        // an end is allowed, an end within 101 px of it lies in it. The door has no width of its own and is drawn 3 wide, so the two strokes overlap as far as 101.5 px. hugeEnds is how far
        // each end of the door lies from the line where it stood in round two, by this suite's own measure. Two more stand-ins, each as long as the door: 101.25 px under it (no end in the
        // stroke, the strokes still overlap) and 103 px under it (past the overlap: beside the door, and aside). Each is asked with a wall of the thin look that stands across the door 13 px
        // beyond its far end, only near it, which comes before a wall that is aside and after one that is not
        const hugeEnds = endsOf(tokH('door_bare')).map(p => ptLine(p, endsOf(hugeWas)[0], endsOf(hugeWas)[1]));
        const hugeLie = Object.assign(clone(tokH('line_huge')), { id: 'line_huge_lie', x: 1260, y: 401.25, pts: [[0, 0], [60, 0]], w: 60, baseW: 60 }), hugeOff = Object.assign(clone(hugeLie), { id: 'line_huge_off', y: 403 });
        const farAcross = { id: 'wall_far_across', type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [0, 80]], color: '#2b2d31', strokeWidth: 4, opacity: 0.5, tip: 'square', x: 1333, y: 260, w: 1, h: 80, baseW: 1, baseH: 80 };
        const hugeLieHit = FC.secretMatch(tokH('door_bare'), [farAcross, hugeLie]), hugeOffHit = FC.secretMatch(tokH('door_bare'), [farAcross, hugeOff]), hugeAt5 = [gapOf(tokH('door_bare'), hugeLie), gapOf(tokH('door_bare'), hugeOff), gapOf(tokH('door_bare'), farAcross)];
        const HUGE_LOOK = { color: '#4a4753', width: 1e15, opacity: 0.25, tip: 'flat' }, hugeAt = [Math.round(gapOf(tokH('door_bare'), hugeWas)), Math.round(gapOf(tokH('door_bare'), hugeOn))];   // (how far each stand-in lies from the door, by this suite's own measure)
        const matchOff = LINE_DOOR_IDS.map(id => {   // what is not as told of a door, first in the detail
            const d = LINE_DOORS[id], w = tokH(id), wall = tokH(d.wall), bad = [];
            if (!w || !wall || typeof FC.secretMatch !== 'function' || typeof FC.lineOf !== 'function' || FC.secretOn(w) !== true || FC.lineOf(w) !== true) return [id, 'no secret door drawn as a line beside its wall'];
            if (lineHeld(w) !== lineHeld(d.own) || w.color !== d.color) bad.push('its own look');
            const hit = FC.secretMatch(w, wbH()), alone = FC.secretMatch(w, [wall]);
            if (JSON.stringify(hit) !== JSON.stringify(d.seen) || JSON.stringify(alone) !== JSON.stringify(d.seen)) bad.push(['the wall it meets', hit, alone]);
            else if (w.seenColor !== FC.cleanSeenColor(hit.color) || w.seenWidth !== FC.cleanSeenWidth(hit.width) || w.seenOpacity !== FC.cleanSeenOpacity(hit.opacity) || w.seenTip !== FC.cleanSeenTip(hit.tip)) bad.push('the keys Match sets');
            if (!heldAs(FC.secretSeen(w), LINE_SEEN[id])) bad.push(['the piece the core gives', FC.secretSeen(w)]);
            return bad.length ? [id, bad] : null;
        }).filter(Boolean);
        check('host (Match a wall): the world holds three secret doors drawn as lines, by the app\'s own judges (fogcore secretOn and lineOf), each end to end with a wall line. One has a width, an opacity and a nib of its own, each another than its wall\'s, and a name, a lock and a group. One has a width and an opacity of its own and no nib, beside a wall as a campaign file writes one: a width that is text, an opacity of 1 and no nib. One has no width, opacity or nib of its own. For each, fogcore secretMatch answers the look of that wall line, asked with the map\'s own pieces and asked with the wall alone. The door\'s four keys are that look as the cleaners keep it, which is what Properties\' Match press sets. And the piece this suite expects the players to hold is the one fogcore secretSeen gives, so the probes reach the real rule. Round three: a wall line reaches a door as far as half its drawn width, held to 100 px, and 12 px more. The world\'s wall line whose width is the text 1e16 is drawn 1e15 wide, so it stands more than 200 px from each of the five secret doors drawn as lines, by this suite\'s own measure of the gap between two lines. Laid where it stood in round two, 100 px under the door that has no width of its own, it still meets that door: asked alone, it answers. Beside the door\'s own wall it does not answer, as since round four, and ROUND FIVE GIVES ANOTHER REASON for it. The line is 30 px long and its stroke reaches 101 px with the pixel an end is allowed. The door\'s far end, 100.5 px from the line, lies in that stroke and is reached, and its first end, 102 px off, is not. So the line reaches one end only, as the door\'s own wall does, and the ends say nothing. It is not aside, the two walls are alike in every rank, and the door\'s own wall, which touches the door, is the nearer. (Round four called the line beside the door, and aside.) Laid 50 px under the door for all the door\'s length, both of the door\'s ends lie in its stroke: it reaches both and answers in the place of the door\'s wall. Round five, asked with a wall of the thin look that stands across the door 13 px beyond its far end and is only near it: laid 101.25 px under the door for all its length, the line has no end of the door in its stroke, yet the two strokes still overlap, the door being drawn 3 wide, so the line is not aside and answers before that wall. Laid 103 px under the door, past the overlap, it runs beside the door and is aside, and the wall across the far end answers',
            hugeGaps.length === 5 && hugeGaps.every(g => g > 200) && hugeAt[0] === 100 && hugeAt[1] === 50 && JSON.stringify(hugeHit) === JSON.stringify(LINE_DOORS.door_bare.seen) && JSON.stringify(hugeAlone) === JSON.stringify(HUGE_LOOK) && JSON.stringify(hugeOnHit) === JSON.stringify(HUGE_LOOK) && JSON.stringify(HUGE_LOOK) !== JSON.stringify(LINE_DOORS.door_bare.seen)
            && hugeEnds.length === 2 && hugeEnds[0] > 101.5 && hugeEnds[1] > 100 && hugeEnds[1] <= 101 && hugeAt5[0] === 101.25 && hugeAt5[1] === 103 && hugeAt5[2] === 13 && JSON.stringify(hugeLieHit) === JSON.stringify(HUGE_LOOK) && JSON.stringify(hugeOffHit) === JSON.stringify(LINE_DOORS.door_bare.seen)
            && JSON.stringify(FC.secretMatch(tokH('door_bare'), [tokH('wall_thin'), tokH('line_huge')])) === JSON.stringify(LINE_DOORS.door_bare.seen) &&
            LINE_DOOR_IDS.length === 3 && matchOff.length === 0 && tokH('door_line').name === LINE_DOORS.door_line.name && tokH('door_line').doorLock === true && tokH('door_line').groupId === 'g_yard' && lineDoorsMoved().length === 0, { matchOff, moved: lineDoorsMoved(), hugeGaps, hugeAt, hugeHit, hugeAlone, hugeOnHit, hugeEnds, hugeAt5, hugeLieHit, hugeOffHit });
        const linesHost = linesOff(tokH, 'host'), notAsRead = LINED_IDS.filter(id => { const w = tokH(id); return !w || wallLineOn(w) === (LINED[id].made === true); });
        const relicOff = RELIC_IDS.filter(id => { const w = tokH(id); return !w || JSON.stringify(SECRET_KEYS.filter(k => hasOwn(w, k))) !== JSON.stringify([RELICS[id]]); });
        check('host (Match a wall): the world holds fourteen lines whose width, opacity and nib this suite reads. Eleven are plain walls drawn as lines, by this suite\'s own reading: a town\'s City wall with a number for its width and no nib, a player\'s own two lines that the GM made a wall and a see-through barrier, the three walls the secret doors were matched to, a line with a word for its width, a word for its opacity and a nib the app does not know, a line 0 wide at an opacity of -2, a line whose width is the text 1e16 and whose opacity is the text 0.25, a barrier line whose width is the text 7.5px at an opacity of 2 with no nib, and a wall line that kept seenWidth. Three are none: a filled region that is a wall, a line that blocks nothing and a door drawn as a line, each with a width that is the text 5 and an opacity of 1. Three pieces each hold ONE of seenWidth, seenOpacity and seenTip and no tick: that wall line, an open door drawn as a line and a plain shape. And the GM\'s secret door that is no line carries all three',
            LINED_IDS.length === 14 && LINED_WALLS.length === 11 && LINED_MADE.length === 3 && linesHost.length === 0 && notAsRead.length === 0 && RELIC_IDS.length === 3 && relicOff.length === 0 && SEEN_LINE_KEYS.every(k => hasOwn(doorH(), k)) && FC.lineOf(doorH()) === false && FC.secretOn(doorH()) === true,
            { linesHost, notAsRead, relicOff, rectDoor: SEEN_LINE_KEYS.map(k => doorH()[k]) });
        const lineSnap = [snapP1, snapP2].map(snap => ({
            doors: LINE_DOOR_IDS.filter(id => !heldAs(pieceOf(snap, id), LINE_SEEN[id])).map(id => [id, pieceOf(snap, id) ? lineDoorOff(pieceOf(snap, id)) : 'gone']),
            twins: LINE_DOOR_IDS.map(id => twinOff(pieceOf(snap, id), pieceOf(snap, LINE_DOORS[id].wall))).filter(Boolean),
            lines: linesOff(id => pieceOf(snap, id), 'wire'),
            relics: RELIC_IDS.filter(id => !pieceOf(snap, id) || !bareOfSecret(pieceOf(snap, id))),
            odd: oddWalls(snap).slice(0, 4), leak: secretLeak(snap)
        }));
        check('host (Match a wall): the join snapshot gives each player each of the three secret doors drawn as lines as a wall line at the matched wall\'s colour, width, opacity and nib: 6 wide at 0.7 with the flat nib, 5 wide with the round nib and NO opacity, and 4 wide at 0.5 with the square nib. None holds the door\'s own colour, width, opacity or nib, a door key, a lock, a group or a name, and each differs from the wall line it was matched to by id and place alone. The eleven wall lines leave as they are drawn: a width that is a number (3 for a word and for 0, 5 for the text 5, 7.5 for the text 7.5px, 1e15 for the text 1e16), an opacity only under 1 (0 for -2, 0.25 for its text, none for 1, for 2 and for a word) and one of the three nibs (round for none and for one the app does not know). The filled region, the plain line and the door drawn as a line keep the text 5 and the opacity of 1. None of the three pieces that kept one key holds it, and nothing in the snapshot holds one of the six keys',
            lineSnap.every(o => !o.doors.length && !o.twins.length && !o.lines.length && !o.relics.length && !o.odd.length && o.leak === ''), lineSnap);

        // 1e. Match a wall, round two: no plain wall carries a lock to the players, and a see-through wall gives a see-through door. The world, and the join snapshot
        const R2_IDS = LOCK_WALL_IDS.concat(LOCK_DOOR_IDS, LOCK_KEPT_IDS, LINE_DOOR2_IDS, ['wall_clear', 'wall_cross']);
        const r2Moved = () => R2_IDS.filter(id => JSON.stringify(tokH(id)) !== pristineOf(id));   // the pieces of round two that are not byte for byte as the GM left them
        const lockHostOff = LOCK_WALL_IDS.filter(id => !tokH(id) || !plainWall(tokH(id)) || lockOf(tokH(id)) !== LOCK_WALLS[id]).map(id => [id, 'no plain wall with that lock', lockOf(tokH(id))])
            .concat(LOCK_DOOR_IDS.filter(id => !tokH(id) || FC.secretOn(tokH(id)) !== true || tokH(id).locked !== true).map(id => [id, 'no secret door locked in place', lockOf(tokH(id))]))
            .concat(LOCK_DOOR_IDS.filter(id => !!tokH(id) && hasOwn(FC.secretSeen(tokH(id)), 'locked')).map(id => [id, 'the copy the core gives carries the lock']))
            .concat(LOCK_KEPT_IDS.filter(id => !tokH(id) || plainWall(tokH(id)) || FC.secretOn(tokH(id)) === true || tokH(id).locked !== true).map(id => [id, 'no locked piece that is no plain wall', lockOf(tokH(id))]));
        const match2Off = LINE_DOOR2_IDS.map(id => {   // what is not as told of a door of round two, first in the detail
            const d = LINE_DOORS2[id], w = tokH(id), wall = tokH(d.wall), bad = [];
            if (!w || !wall || typeof FC.secretMatch !== 'function' || FC.secretOn(w) !== true || FC.lineOf(w) !== true) return [id, 'no secret door drawn as a line beside its wall'];
            if (lineHeld(w) !== lineHeld(d.own) || w.color !== d.color) bad.push('its own look');
            const hit = FC.secretMatch(w, wbH());
            if (JSON.stringify(hit) !== JSON.stringify(d.seen)) bad.push(['the wall it meets', hit]);
            else if (w.seenColor !== FC.cleanSeenColor(hit.color) || w.seenWidth !== FC.cleanSeenWidth(hit.width) || w.seenOpacity !== FC.cleanSeenOpacity(hit.opacity) || w.seenTip !== FC.cleanSeenTip(hit.tip)) bad.push('the keys Match sets');
            if (!heldAs(FC.secretSeen(w), LINE_SEEN[id])) bad.push(['the piece the core gives', FC.secretSeen(w)]);
            return bad.length ? [id, bad] : null;
        }).filter(Boolean);
        const crossAt = wbH().findIndex(w => w.id === 'wall_cross'), clearAt = wbH().findIndex(w => w.id === 'wall_clear'), crossAlone = tokH('door_clear') && tokH('wall_cross') ? FC.secretMatch(tokH('door_clear'), [tokH('wall_cross')]) : 'gone', clearLook = FC.secretLook(tokH('door_clear'));
        check('host (Match a wall, round two): the world holds seven plain walls with a lock key on the host, by this suite\'s own reading of a plain wall: a wall line and a player\'s own three lines (two made a wall, one a see-through barrier) locked in place, a wall box whose lock is the number 1, the one-schema wall whose key is there and 0, and a wall whose key is false. Two secret doors are locked in place, by the app\'s own judge: the box, and the line that has a name and a group, whose wall line is not locked. An unlocked secret door drawn as a line stands end to end with the locked wall line. Six locked pieces are no plain wall and no secret door: a door, a token, a shape that blocks nothing, a wall that leads to another map and two drawings of a player\'s own. fogcore secretSeen gives each locked secret door a copy with no lock. A wall line whose colour is the word transparent has a secret door matched to it, and the door\'s far end touches a thick wall line that stands across it and comes first in the map\'s list. Asked with the map\'s own pieces, fogcore secretMatch answers for each of the two doors the wall it runs along (for the see-through one: transparent, 6 wide, solid, the round nib), where asked with the cross wall alone it answers that wall, 20 wide. Each door\'s four keys are that look as the cleaners keep it, and the piece this suite expects the players to hold is the one fogcore secretSeen gives: for the see-through door a wall line whose colour is the word transparent, which fogcore secretLook calls clear',
            LOCK_WALL_IDS.length === 7 && LOCK_DOOR_IDS.length === 2 && LOCK_KEPT_IDS.length === 6 && lockHostOff.length === 0 && !hasOwn(tokH('wall_meet'), 'locked') && !hasOwn(tokH('wall_group'), 'locked') && !hasOwn(tokH('door_freeline'), 'locked') && tokH('wall_lockline').locked === true
            && LINE_DOOR2_IDS.length === 2 && LINE_ALL_IDS.length === 5 && match2Off.length === 0 && tokH('wall_clear').color === 'transparent' && tokH('door_clear').seenColor === 'transparent' && crossAt >= 0 && crossAt < clearAt
            && JSON.stringify(crossAlone) === JSON.stringify({ color: '#101014', width: 20, opacity: 1, tip: 'square' }) && clearLook.clear === true && clearLook.color === 'transparent' && LINE_SEEN.door_clear.color === 'transparent' && !hasOwn(LINE_SEEN.door_clear, 'opacity') && r2Moved().length === 0,
            { lockHostOff, match2Off, crossAt, clearAt, crossAlone, clearLook, moved: r2Moved() });
        const r2Snap = [snapP1, snapP2].map(snap => ({
            walls: LOCK_WALL_IDS.concat(LOCK_DOOR_IDS).filter(id => { const w = pieceOf(snap, id); return !w || !plainWall(w) || hasOwn(w, 'locked'); }).map(id => [id, lockOf(pieceOf(snap, id))]),
            kept: LOCK_KEPT_IDS.filter(id => lockOf(pieceOf(snap, id)) !== true).map(id => [id, lockOf(pieceOf(snap, id))]),
            any: lockedWalls(snap),
            doors: LINE_DOOR2_IDS.filter(id => !heldAs(pieceOf(snap, id), LINE_SEEN[id])).map(id => [id, pieceOf(snap, id) ? lineDoorOff(pieceOf(snap, id)) : 'gone']),
            twins: LINE_DOOR2_IDS.concat(['door_line']).map(id => [id, twinOff(pieceOf(snap, id), pieceOf(snap, LINE_ALL[id].wall))]).concat(TWIN_IDS.map(id => [id, twinOff(sdOf(snap), pieceOf(snap, id))])).filter(p => p[1]),
            clear: ['wall_clear', 'door_clear'].map(id => (pieceOf(snap, id) ? pieceOf(snap, id).color : 'gone')), leak: secretLeak(snap)
        }));
        check('host (Match a wall, round two): the join snapshot gives each player the seven plain walls that hold a lock key on the host, and the copies of the two secret doors locked in place, as plain walls with no lock key at all. The six locked pieces that are no plain wall keep their lock: the door, the token, the shape that blocks nothing, the wall that leads to another map and the two drawings of a player\'s own. No plain wall anywhere in the snapshot carries the key. The locked secret door drawn as a line and its unlocked wall line differ by id and place alone, and so do the unlocked secret door and the locked wall line it was matched to, the locked box and each of the two walls made in its look, and the see-through wall line and its door: both of that pair are sent in the colour transparent, 6 wide with the round nib and no opacity, and neither of the two doors of round two holds its own colour, width, opacity or nib',
            r2Snap.every(o => !o.walls.length && !o.kept.length && !o.any.length && !o.doors.length && !o.twins.length && o.clear.join() === 'transparent,transparent' && o.leak === ''), r2Snap);

        // 2. a copy asked for whole: as the GM left the door, and with the door open, locked for players and in a group on the GM's own screen
        await level(); const n0 = sentLog.length, need = { type: 'needItem', campId: 'c1', itemId: 'm_open' };
        await fireHost('p1', 'needItem with a secret door on the map', 'the open field whole', clone(need));
        Object.assign(doorH(), { doorOpen: true, doorLock: true, groupId: 'g_vault' });
        await fireHost('p1', 'needItem with a secret door on the map', 'the door open, locked for players and in a group on the host', clone(need));
        campH().items.m_open.fog.on = true;   // the same map with its fog on: no shared copy any more, one made for this player alone (fogCopyFor)
        await fireHost('p1', 'needItem with a secret door on the map', 'the map\'s fog on: the copy made for this player alone', clone(need));
        const wholes = sentLog.slice(n0).filter(s => s.to === 'peer_p1' && s.m.type === 'item' && s.m.itemId === 'm_open' && s.m.item && !s.m.item.stub), fogged = wholes[2] && wholes[2].m.item;
        check('host (a secret door): the map asked for whole holds the secret door as that same wall — and again while the door stands open, locked for players and in a group on the GM\'s own screen, and again on the copy made for one player once the map\'s fog is on (the creatures they do not see dropped from it): nothing of the door is on any of the three', wholes.length === 3 && wholes.every(s => seenAsWall(doorIn(s.m)) && secretLeak(s.m) === '') && !!fogged && !!fogged.fog && fogged.fog.on === true && !fogged.whiteboard.some(w => w.id === 'tok_npc') && wholes[0].m.item.whiteboard.some(w => w.id === 'tok_npc') && noneOpen(/^needItem with a secret door on the map /), wholes.map(s => doorIn(s.m)));

        // 3. a player's door request naming it, beside the same request for a wall and for a door
        await resetWorld(); await calm();
        const ask = async (who, mut, id) => { const c = conns[who], o = conns[who === 'p1' ? 'p2' : 'p1'], a = c.sent.length, b = o.sent.length; await fireHost(who, id === SD.id ? 'door-req for the secret door' : 'door-req (a control beside the secret door)', mut, { type: 'door-req', mapId: 'm_open', itemId: id }); return { me: said(c, a), other: said(o, b) }; };
        const farWall = await ask('p2', 'a wall, from a player far from it', 'wall1'), farSecret = await ask('p2', 'from a player far from it', SD.id), farDoor = await ask('p2', 'a door, from a player far from it', 'door1');
        check('host (a secret door): a door request naming the secret door from a player far from it is answered as one naming a wall is — with nothing, to anyone — where the same request for a door is told "far"; the door is as the GM left it', eq(farWall.me, []) && eq(farSecret.me, []) && eq(farSecret.other, []) && eq(farDoor.me, ['door-deny:far']) && JSON.stringify(doorH()) === pristineSD, { farWall, farSecret, farDoor });
        await fireHost('p1', 'pos beside the secret door', 'a drop in the cell beside it', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 250, y: 600, rot: 0, front: 0, final: true, a: 9 });
        const beside = tokH('tok_p1').x === 250 && tokH('tok_p1').y === 600;
        const nearSecret = await ask('p1', 'from a player whose token stands beside it', SD.id), shut = JSON.stringify(doorH()) === pristineSD;
        const nearDoor = await ask('p1', 'a door, from a player whose token stands beside it', 'door1'), opened = tokH('door1').doorOpen === true;
        check('host (a secret door): with the player\'s own token in the cell beside it, their door request naming the secret door opens nothing and tells nobody anything — the door byte for byte as the GM left it, no map sent — where the same player\'s request for the door beside their other token opens that door and the table is sent the map', beside && eq(nearSecret.me, []) && eq(nearSecret.other, []) && shut && opened && nearDoor.other.some(t => t === 'item' || t === 'itemDelta'), { beside, nearSecret, shut, nearDoor, opened });
        doorH().doorLock = true;
        const lockSecret = await ask('p1', 'the GM locked it for players', SD.id), lockDoor = await ask('p1', 'a door the GM locked', 'door_locked');
        check('host (a secret door): the GM\'s lock on a secret door is never said — a request naming it is answered with nothing, where a locked door answers "locked" (the word would say that the wall is a door)', eq(lockSecret.me, []) && eq(lockSecret.other, []) && eq(lockDoor.me, ['door-deny:locked']) && doorH().doorLock === true && doorH().secret === true, { lockSecret, lockDoor });
        delete doorH().doorLock; doorH().doorOpen = true;
        const openSecret = await ask('p1', 'it stands open on the host', SD.id), heldOpen = doorH().doorOpen === true && doorH().secret === true;
        const b1 = conns.p1.sent.length, b2 = conns.p2.sent.length, doorB = JSON.stringify(doorH()); let burstThrew = 0;
        for (let i = 0; i < 30; i++) { clockOff += 150; try { net._handleMessage(clone(reqS), conns.p1); } catch (e) { burstThrew++; } finally { net.applyingRemote = false; } }   // (150 ms apart: past the door limiter's spacing, so several of the thirty reach the rule itself)
        await calm();
        const burst = said(conns.p1, b1).concat(said(conns.p2, b2));
        check('host (a secret door): a secret door that stands open on the GM\'s own screen is not closed by a player\'s request (a door would be), and thirty more, a moment apart, change nothing and are answered with nothing; across these probes the write oracle saw no change of the door', eq(openSecret.me, []) && eq(openSecret.other, []) && heldOpen && burstThrew === 0 && eq(burst, []) && JSON.stringify(doorH()) === doorB && noneOpen(/^door-req for the secret door /) && noneOpen(/^door-req \(a control beside the secret door\) /), { openSecret, heldOpen, burstThrew, burst });

        // 3b. every message of a player's that names a piece by its id, naming a wall and naming the secret door: the same answers, to both players
        const named = id => [
            { type: 'door-req', mapId: 'm_open', itemId: id }, { type: 'travel', viaItemId: id }, { type: 'target', id: id, mapId: 'm_open' },
            { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: id, x: 320, y: 620, rot: 0, front: 0, final: true, a: 9 }, { type: 'threats', campId: 'c1', itemId: 'm_open', wbId: id, threats: [90], a: 9 },
            { type: 'tok-pic', rid: 'sd1', mapId: 'm_open', wbId: id, img: 'data:image/png;base64,iVBORw0KGgo=' }, { type: 'tok-light', rid: 'sd2', mapId: 'm_open', wbId: id, on: true, preset: 0, name: 'Torch' }
        ];
        const answers = async id => { const out = []; for (const m of named(id)) { await resetWorld(); await calm(); const a = conns.p1.sent.length, b = conns.p2.sent.length; await fireHost('p1', m.type + ' naming ' + (id === SD.id ? 'the secret door' : 'a wall'), 'the piece named by its id', m); out.push(m.type + ' > ' + said(conns.p1, a).join(',') + ' | ' + said(conns.p2, b).join(',')); } return out; };
        const ansWall = await answers('wall1'), ansSecret = await answers(SD.id);
        check('host (a secret door): every message of a player\'s that names a piece by its id — a door request, a travel, a target, a move, threat marks, a picture, a light — is answered for the secret door as it is for a wall, kind for kind and reason for reason, to the sender and to the other player, and changes nothing of the door', eq(ansWall, ansSecret) && ansWall.length === 7 && JSON.stringify(doorH()) === pristineSD && noneOpen(/ naming the secret door /), { wall: ansWall, secret: ansSecret });

        // 4. the well-formed map copy, and the player's own drawing redrawn as a secret door: the write oracle judges each key that changed
        await resetWorld(); await calm();
        await fireHost('p1', 'item with a secret door', 'the well-formed copy: the door sent back open and with no tick, the three keys on its own token and on its own new drawing', clone(host.tpl.item));
        const tkS = tokH('tok_p1'), stS = tokH('stroke_p1'), plain = w => !!w && bareOfSecret(w) && !hasOwn(w, 'sightType') && !hasOwn(w, 'blocksSight') && !hasOwn(w, 'doorOpen');
        check('host (a secret door): the well-formed map copy — the GM\'s secret door sent back as a door, open and with no tick, the player\'s own token and new drawing sent as secret doors with a look named for them — moves the token and adds the drawing and nothing else: the door is byte for byte as the GM left it, and neither piece of the player\'s holds secret, seenColor, seenTexture or a door\'s type', JSON.stringify(doorH()) === pristineSD && !!tkS && tkS.x === 120 && tkS.y === 130 && plain(tkS) && !!stS && stS.byPlayer === true && plain(stS) && noneOpen(/^item with a secret door /), { door: doorH(), tok: tkS && Object.keys(tkS), stroke: stS && Object.keys(stS) });
        const reS = clone(host.tpl.item), rS = reS.item.whiteboard.find(w => w.id === 'stroke_p1'); rS.pts = [[0, 0], [14, 9], [28, 3]]; rS.x = 7;
        await fireHost('p1', 'item redraw as a secret door', 'its own drawing redrawn and sent as a secret door', reS);
        const stR2 = tokH('stroke_p1');
        check('host (a secret door): a player\'s own drawing redrawn and sent as a secret door lands as the redraw alone — the write oracle sees the drawing change and none of the three keys, on it or on their token, and the GM\'s door is untouched', !!stR2 && eq(stR2.pts, [[0, 0], [14, 9], [28, 3]]) && stR2.x === 7 && plain(stR2) && plain(tokH('tok_p1')) && JSON.stringify(doorH()) === pristineSD && noneOpen(/^item redraw as a secret door /), stR2 && Object.keys(stR2));

        // 4b. Match a wall: the same two copies also carry the three keys Match sets, and one of the GM's secret doors drawn as lines claimed as the sender's own drawing
        const tplW = host.tpl.item.item.whiteboard, tplClaim = tplW.find(w => w.id === 'door_line') || null;
        check('host (Match a wall): the well-formed map copy and the redraw also send the player\'s own token and drawing with seenWidth, seenOpacity and seenTip, and send the GM\'s secret door drawn as a line back as the sender\'s own drawing: an open door at another place, of another shape, width and nib, with no tick. Neither piece of the player\'s holds one of the three keys, each of the three secret doors drawn as lines is byte for byte as the GM left it, and the write oracle saw nothing',
            tplW[0].id === 'tok_p1' && tplW[1].id === 'stroke_p1' && SEEN_LINE_KEYS.every(k => hasOwn(tplW[0], k) && hasOwn(tplW[1], k)) && !!tplClaim && tplClaim.ownerId === 'u_p1' && tplClaim.type === 'path' && tplClaim.doorOpen === true && !hasOwn(tplClaim, 'secret') && tplClaim.x !== tokH('door_line').x && tplClaim.y !== tokH('door_line').y
            && !!tokH('tok_p1') && !!tokH('stroke_p1') && SEEN_LINE_KEYS.every(k => !hasOwn(tokH('tok_p1'), k) && !hasOwn(tokH('stroke_p1'), k)) && lineDoorsMoved().length === 0 && tokH('door_line').ownerId === undefined && noneOpen(/^item with a secret door /) && noneOpen(/^item redraw as a secret door /),
            { moved: lineDoorsMoved(), tok: tokH('tok_p1') && Object.keys(tokH('tok_p1')), stroke: tokH('stroke_p1') && Object.keys(tokH('stroke_p1')) });

        // 4b2. Match a wall, round three: a new drawing's nib. The two copies above also send five NEW drawings of the sender's own with something under tip. A drawing of a
        //      player's keeps the nib it was drawn with only as square or flat, on the host's map and in what the table is sent of it, so that every screen draws it as its
        //      drawer's does. Round is no key at all, which is how every screen reads a line with none.
        //      ROUND FOUR FLIPS what a redraw does where its copy names no nib. Round three kept the nib the host's line had. Now such a redraw leaves a ROUND line, as its
        //      drawer's screen shows it: a redraw with no tip key at all, with markup under tip or with the Fill tip takes a square or a flat nib off the host's line, and
        //      every other copy follows. The Fill tip is no nib a player may name: the line it is named for stays an OPEN line, on the host and on the wire. And a nib still
        //      changes only with a redraw: a copy that names a drawing where it stands, with the points it has, changes nothing of it, whatever it says or does not say under tip
        const NIBS = { stroke_sq: 'square', stroke_fl: 'flat', stroke_fi: null, stroke_num: null, stroke_mk: null }, NIB_IDS = Object.keys(NIBS), nibOf = w => (!w ? 'gone' : hasOwn(w, 'tip') ? w.tip : null);   // (null: the drawing is there and has no tip key)
        const nibSentTo = (from, id) => sentLog.slice(from).filter(s => piecesIn(s.m).some(w => w.id === id)), nibHost = NIB_IDS.map(id => nibOf(tokH(id)));
        const nibSent = NIB_IDS.map(id => nibSentTo(0, id)), nibWrong = NIB_IDS.map((id, i) => nibSent[i].filter(s => piecesIn(s.m).some(w => w.id === id && nibOf(w) !== NIBS[id])).length), nibTpl = NIB_IDS.map(id => { const w = tplW.find(x => x.id === id); return w ? w.tip : 'not in the copy'; });
        const openLine = (w, pts) => !!w && w.type === 'path' && w.tip !== 'fill' && !hasOwn(w, 'holes') && Array.isArray(w.pts) && w.pts.length === pts && FC.lineOf(w) === true && FC.pathSegs(w).length === pts - 1;   // an open line of that many points: one stretch fewer, where a filled region closes with one more
        const fillNew = openLine(tokH('stroke_fi'), 3) && nibSent[2].every(s => piecesIn(s.m).filter(w => w.id === 'stroke_fi').every(w => openLine(w, 3)));   // the NEW drawing that named the Fill tip
        // the first redraw: one drawing with NO tip key at all, one that names the Fill tip, and two that name a nib
        const reN = clone(host.tpl.item), nOf = id => reN.item.whiteboard.find(w => w.id === id), nAt = sentLog.length, rePts = [[0, 0], [10, 4]], reFill = [[0, 0], [10, 4], [10, 9]];
        Object.assign(nOf('stroke_sq'), { pts: rePts }); delete nOf('stroke_sq').tip; Object.assign(nOf('stroke_fl'), { pts: reFill, tip: 'fill' }); Object.assign(nOf('stroke_num'), { pts: rePts, tip: 'flat' }); Object.assign(nOf('stroke_mk'), { pts: rePts, tip: 'square' });
        const sqNamed = hasOwn(nOf('stroke_sq'), 'tip');
        await fireHost('p1', 'item redraw with another nib', 'four of its own new drawings redrawn: one with no tip key at all, one that names the Fill tip, two that name a nib', reN);
        const NIB_RE = ['stroke_sq', 'stroke_fl', 'stroke_num', 'stroke_mk'], nibAfter = NIB_IDS.map(id => nibOf(tokH(id))), nibRedrawn = NIB_RE.map(id => !!tokH(id) && JSON.stringify(tokH(id).pts) === JSON.stringify(id === 'stroke_fl' ? reFill : rePts));
        const nibSentAfter = NIB_RE.map(id => nibSentTo(nAt, id).filter(s => s.to === 'peer_p2').map(s => nibOf(piecesIn(s.m).find(w => w.id === id))));
        const fillRe = openLine(tokH('stroke_fl'), 3) && nibSentTo(nAt, 'stroke_fl').every(s => piecesIn(s.m).filter(w => w.id === 'stroke_fl').every(w => openLine(w, 3)));   // the line REDRAWN under the Fill tip
        clockOff += 1500; const nW = conns.p2.sent.length; try { net._handleMessage(clone(need), conns.p2); } finally { net.applyingRemote = false; } await calm();
        const nibWhole = conns.p2.sent.slice(nW).filter(m => m.type === 'item' && m.itemId === 'm_open' && m.item && !m.item.stub).pop() || null, nibInWhole = NIB_IDS.map(id => (nibWhole ? nibOf(piecesIn(nibWhole).find(w => w.id === id)) : 'no whole copy'));   // ...and a whole copy of the map, as the other player's app asks for one
        // the second redraw: the drawing that is flat by now, redrawn with markup under tip. And the drawing that is square by now, named where it stands with the points it has and NO tip key: no redraw
        const reM = clone(reN), mOf = id => reM.item.whiteboard.find(w => w.id === id), mAt = sentLog.length, mkWas = JSON.stringify(tokH('stroke_mk'));
        Object.assign(mOf('stroke_num'), { pts: [[0, 0], [9, 5]], tip: CANARY }); delete mOf('stroke_mk').tip;
        await fireHost('p1', 'item redraw that names no nib', 'a flat line of its own redrawn with markup under tip, and a square line of its own named as it stands with no tip key', reM);
        const nibLast = NIB_IDS.map(id => nibOf(tokH(id))), numSent = nibSentTo(mAt, 'stroke_num').filter(s => s.to === 'peer_p2').map(s => nibOf(piecesIn(s.m).find(w => w.id === 'stroke_num'))), mkSent = nibSentTo(mAt, 'stroke_mk').map(s => nibOf(piecesIn(s.m).find(w => w.id === 'stroke_mk')));
        check('host (Match a wall, rounds three and four): a player\'s drawing keeps the nib it was drawn with only as square or flat. The well-formed map copy sends five new drawings of the sender\'s own with the square nib, the flat nib, the Fill tip, the number 7 and a text of markup under tip. The host\'s map holds the first with the square nib, the second with the flat nib and the other three with no tip key at all, which every screen draws round. The table is sent them so: each of the ' + nibSent.map(l => l.length).join(', ') + ' sends that carry one of the five holds it with that nib or with none, and the other player was sent each. The one that named the Fill tip is an OPEN line of three points, two stretches by fogcore\'s own reading, on the host and in every send. A redraw that NAMES a nib sets it: the drawing that has none, redrawn with the flat nib, takes it, and another takes the square nib. ROUND FOUR FLIPS the redraw that names none, where round three kept the nib the host\'s line had: the square line redrawn with no tip key at all is round on the host, in what the other player is sent of it and in a whole copy of the map sent to that player afterwards, and the flat line redrawn under the Fill tip is round too, and still an open line of three points. Redrawn once more with markup under tip, the line that had taken the flat nib is round. And a nib changes only with a redraw: the line that had taken the square nib, named where it stands with the points it has and no tip key, is byte for byte as it was, and no send says otherwise. The write oracle saw nothing',
            JSON.stringify(nibTpl) === JSON.stringify(['square', 'flat', 'fill', 7, CANARY]) && JSON.stringify(nibHost) === JSON.stringify(['square', 'flat', null, null, null]) && nibSent.every(l => l.length >= 2 && l.some(s => s.to === 'peer_p2')) && nibWrong.every(n => n === 0) && fillNew
            && sqNamed === false && JSON.stringify(nibAfter) === JSON.stringify([null, null, null, 'flat', 'square']) && nibRedrawn.every(Boolean) && JSON.stringify(nibSentAfter) === JSON.stringify([[null], [null], ['flat'], ['square']]) && fillRe && JSON.stringify(nibInWhole) === JSON.stringify([null, null, null, 'flat', 'square'])
            && JSON.stringify(nibLast) === JSON.stringify([null, null, null, null, 'square']) && JSON.stringify(tokH('stroke_num').pts) === JSON.stringify([[0, 0], [9, 5]]) && JSON.stringify(numSent) === JSON.stringify([null]) && JSON.stringify(tokH('stroke_mk')) === mkWas && mkSent.every(t => t === 'square')
            && NIB_IDS.every(id => tokH(id).byPlayer === true && tokH(id).ownerId === 'u_p1')
            && noneOpen(/^item with a secret door /) && noneOpen(/^item redraw as a secret door /) && noneOpen(/^item redraw with another nib /) && noneOpen(/^item redraw that names no nib /) && noneOpen(/^item from an admitted player/),
            { nibHost, nibAfter, nibLast, nibWrong, nibRedrawn, fillNew, fillRe, nibSentAfter: short(nibSentAfter), nibInWhole, numSent, mkSent, sent: nibSent.map(l => l.length) });

        // 4c. Match a wall, round two: the same two copies also claim, move, redraw, unlock and leave out what the GM locked in place. Five of the seven are plain
        //     walls (round three added the sender's second line that the GM made a wall and locked, which the copies leave out), so no player was sent their lock:
        //     the host's own map keeps it, and the patch gate judges by that map
        const claimOf = id => tplW.find(w => w.id === id) || null, lineClaim = claimOf('wall_lockline'), boxClaim = claimOf('wall_lockbox'), wallClaim = claimOf('stroke_lockwall'), ownClaim = claimOf('stroke_locked');
        const LOCK_PROBED = ['wall_lockline', 'wall_lockbox', 'stroke_lockwall', 'stroke_lockout', 'stroke_lockbar', 'stroke_locked', 'stroke_lockgone'], probedMoved = () => LOCK_PROBED.filter(id => !tokH(id) || JSON.stringify(tokH(id)) !== pristineOf(id) || !tokH(id).locked);
        check('host (Match a wall, round two): the well-formed map copy and the redraw also send the GM\'s locked wall line back as the sender\'s own drawing, moved, redrawn and with no lock, and the GM\'s locked wall box moved, with no lock and as no wall. They send the sender\'s own line that the GM made a wall and locked in place, and their own drawing that the GM locked in place, each redrawn, moved and with its lock set false. They leave out the sender\'s own second line that the GM made a wall and locked, their own line that the GM made a barrier and locked, and their other locked drawing, which is an erase of each. And they send the sender\'s own token and new drawing as locked in place. The patch gate takes none of it: neither of those two holds a lock, each of the seven pieces is byte for byte as the GM left it and still locked on the host\'s own map, the GM\'s wall line has no owner, and the write oracle saw nothing, in these probes and in the well-formed copy\'s own run',
            !!lineClaim && lineClaim.ownerId === 'u_p1' && lineClaim.type === 'path' && !hasOwn(lineClaim, 'locked') && !!tokH('wall_lockline') && lineClaim.x !== tokH('wall_lockline').x && JSON.stringify(lineClaim.pts) !== JSON.stringify(tokH('wall_lockline').pts)
            && !!boxClaim && !hasOwn(boxClaim, 'locked') && !hasOwn(boxClaim, 'blocksSight') && !!tokH('wall_lockbox') && boxClaim.x !== tokH('wall_lockbox').x
            && !!wallClaim && wallClaim.ownerId === 'u_p1' && wallClaim.locked === false && !!tokH('stroke_lockwall') && wallClaim.x !== tokH('stroke_lockwall').x && JSON.stringify(wallClaim.pts) !== JSON.stringify(tokH('stroke_lockwall').pts)
            && !!ownClaim && ownClaim.ownerId === 'u_p1' && ownClaim.locked === false && !!tokH('stroke_locked') && ownClaim.x !== tokH('stroke_locked').x && JSON.stringify(ownClaim.pts) !== JSON.stringify(tokH('stroke_locked').pts)
            && tplW[0].locked === true && tplW[1].locked === true && !!tokH('tok_p1') && !hasOwn(tokH('tok_p1'), 'locked') && !!tokH('stroke_p1') && !hasOwn(tokH('stroke_p1'), 'locked')
            && !claimOf('stroke_lockout') && !claimOf('stroke_lockbar') && !claimOf('stroke_lockgone') && LOCK_PROBED.length === 7 && probedMoved().length === 0 && tokH('wall_lockline').ownerId === undefined && ['stroke_lockwall', 'stroke_lockout', 'stroke_lockbar', 'stroke_locked', 'stroke_lockgone'].every(id => tokH(id).ownerId === 'u_p1' && tokH(id).byPlayer === true)
            && noneOpen(/^item with a secret door /) && noneOpen(/^item redraw as a secret door /) && noneOpen(/^item from an admitted player/) && noneOpen(/^item \(p2 sends p1's message\)/),
            { moved: probedMoved(), locks: LOCK_PROBED.map(id => lockOf(tokH(id))) });

        // 4d. Match a wall, round three: a drawing of the player's own that the GM made a wall AND locked in place. Their copy of it says no lock (no plain wall carries one to
        //     players), so a copy of theirs that redraws it or leaves it out is answered with the map whole, saying that patch's number, as for any wall of theirs, and changes
        //     nothing. Each copy here is the map as the player holds it (every drawing of theirs as it stands, as their app hands one back: no lock, no wall) but for ONE thing,
        //     so the answer is that thing's alone. The well-formed copy above redraws one such line and leaves another out among much else that asks for the map already
        await resetWorld(); await calm();
        let lockA = 7000;   // (past every action number of the run so far, so each whole map is seen to say its own patch's)
        const mineNow = () => wbH().filter(w => w.type === 'path' && w.byPlayer === true && w.ownerId === 'u_p1' && !w.hidden).map(w => ({ id: w.id, type: 'path', ownerId: 'u_p1', pts: clone(w.pts), color: w.color, strokeWidth: w.strokeWidth, x: w.x, y: w.y, w: w.w, h: w.h, baseW: w.baseW, baseH: w.baseH }));
        const lockCopy = async (mut, change) => {   // one copy of the map from p1, and what came of it
            const list = mineNow(); change(list, id => list.find(w => w.id === id));
            const msg = { type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: list.filter(w => !w.gone) }, a: ++lockA }, was = JSON.stringify(wbH()), a = conns.p1.sent.length, b = conns.p2.sent.length;
            await fireHost('p1', 'item naming a locked wall of the player\'s own', mut, msg);
            const mine = conns.p1.sent.slice(a), wholes = mine.filter(m => m.type === 'item' && m.itemId === 'm_open' && !!m.item && !m.item.stub && Array.isArray(m.item.whiteboard));
            return { mut, whole: wholes.length, says: wholes.length ? wholes[0].ack === msg.a : null, holds: wholes.length ? ['stroke_lockwall', 'stroke_lockout', 'stroke_lockbar'].every(id => { const w = pieceIn(wholes[0], id); return !!w && plainWall(w) && !hasOwn(w, 'locked'); }) : null, deltas: mine.filter(m => m.type === 'itemDelta').length, other: said(conns.p2, b).filter(t => t === 'item' || t === 'itemDelta').length, same: JSON.stringify(wbH()) === was };
        };
        const LOCK_COPIES = [
            // [what differs from the map as the player holds it, the change, whether the player is to be sent the map whole]
            ['nothing: every drawing of theirs named as it stands', () => {}, false],
            ['the locked wall line redrawn in place (other points)', (l, of) => { of('stroke_lockwall').pts = [[0, 0], [12, 7], [30, 0]]; }, true],
            ['the locked wall line moved along x alone', (l, of) => { of('stroke_lockwall').x += 5; }, true],
            ['the locked wall line moved along y alone', (l, of) => { of('stroke_lockwall').y += 5; }, true],
            ['the locked wall line in another colour and width, where it stands', (l, of) => { Object.assign(of('stroke_lockwall'), { color: '#ff0000', strokeWidth: 9 }); }, false],
            ['the locked wall line named as a box, which is no drawing', (l, of) => { const w = of('stroke_lockwall'); w.type = 'rect'; delete w.pts; w.x += 9; }, false],
            ['the locked wall line left out', (l, of) => { of('stroke_lockwall').gone = true; }, true],
            ['the second locked wall line left out', (l, of) => { of('stroke_lockout').gone = true; }, true],
            ['the second locked wall line redrawn', (l, of) => { of('stroke_lockout').pts = [[0, 0], [30, 4]]; }, true],
            ['the locked barrier line redrawn', (l, of) => { of('stroke_lockbar').pts = [[0, 0], [3, 30]]; }, true],
            ['the locked barrier line left out', (l, of) => { of('stroke_lockbar').gone = true; }, true],
            ['a locked drawing that is no wall redrawn and moved', (l, of) => { Object.assign(of('stroke_locked'), { pts: [[0, 0], [9, 9]], x: 300 }); }, false],
            ['a locked drawing that is no wall left out', (l, of) => { of('stroke_lockgone').gone = true; }, false],
            ['a wall line of theirs that is not locked, redrawn', (l, of) => { of('stroke_wall').pts = [[0, 0], [30, 5]]; }, true]
        ];
        const mineIds = mineNow().map(w => w.id), lockRuns = [];
        for (const row of LOCK_COPIES) lockRuns.push(await lockCopy(row[0], row[1]));
        const lockRunsOff = lockRuns.map((r, i) => { const want = LOCK_COPIES[i][2]; return r.whole === (want ? 1 : 0) && (want ? r.says === true && r.holds === true : true) && r.deltas === 0 && r.other === 0 && r.same ? null : [r.mut, r]; }).filter(Boolean);
        check('host (Match a wall, round three): a drawing of the player\'s own that the GM made a wall AND locked in place is answered as any wall of theirs is. The player\'s copy of it says no lock, since no plain wall carries one to players. Fourteen copies of the map are sent, each the map as the player holds it but for one thing. A copy that names every drawing of theirs as it stands asks for nothing. A copy that redraws the locked wall line with other points, moves it along x alone or along y alone, or leaves it out, is answered with ONE whole copy of the map to its sender, which says that patch\'s number and holds the line again as a plain wall with no lock. So is one that redraws or leaves out the second such line, or the line the GM made a see-through barrier and locked. A copy that names the locked wall line in another colour and width where it stands, or as a box, which is no drawing, asks for nothing. Neither does a redraw or an erase of a locked drawing that is no wall: its player was sent the lock, and their own app holds it. A wall line of theirs that is not locked, redrawn, is answered with the map as before. In every one of the fourteen nothing on the host\'s map changes, no other player is sent a thing, and the write oracle saw nothing',
            LOCK_COPIES.length === 14 && LOCK_COPIES.filter(r => r[2]).length === 9 && lockRunsOff.length === 0 && ['stroke_wall', 'stroke_bar', 'stroke_lockwall', 'stroke_lockout', 'stroke_lockbar', 'stroke_locked', 'stroke_lockgone'].every(id => mineIds.indexOf(id) >= 0)
            && ['stroke_lockwall', 'stroke_lockout'].every(id => tokH(id).locked === true && tokH(id).blocksSight === true && FC.strokeHeld(tokH(id)) === true) && tokH('stroke_lockbar').locked === true && tokH('stroke_lockbar').barrier === true && FC.strokeHeld(tokH('stroke_locked')) === false
            && probedMoved().length === 0 && noneOpen(/^item naming a locked wall of the player's own /),
            { lockRunsOff: lockRunsOff.slice(0, 3), wrong: lockRunsOff.map(o => o[0]), mineIds });

        // 4e. Match a wall, round five: a FILLED REGION signed by a player. Only a file can sign one so (the app's own client never sends such a copy), and its player may redraw
        //     its points and move it, as any drawing of theirs. But a redraw never makes it a LINE: a copy that names the flat or the square nib for it, with other points or with
        //     only another place, leaves it a filled region, on the host and in what the table is sent. ROUND FIVE FLIPS those two: round four laid the named nib over the Fill
        //     tip, and the region became an open line. Each copy here is the map as the player holds it but for the region
        await resetWorld(); await calm();
        wbH().push({ id: 'region_p1', type: 'path', byPlayer: true, ownerId: 'u_p1', tip: 'fill', pts: [[0, 0], [24, 0], [24, 16], [0, 16]], color: '#8a8a9a', strokeWidth: 3, x: 900, y: 900, w: 24, h: 16, baseW: 24, baseH: 16, z: 35 });
        await level();   // the table's copy holds it, as after a load of the file that signed it
        const regH = () => tokH('region_p1'), isRegion = (w, pts) => !!w && w.type === 'path' && w.tip === 'fill' && Array.isArray(w.pts) && w.pts.length === pts && FC.lineOf(w) === false && FC.pathSegs(w).length === pts;   // a filled region of that many points: as many stretches, since it closes, where an open line has one fewer, and no line by fogcore's own judge
        const REG_COPIES = [
            // [what the copy says of the region, the change, whether the host is to take a change]
            ['named as it stands, under the Fill tip', w => { w.tip = 'fill'; }, false],
            ['named as it stands, under the flat nib', w => { w.tip = 'flat'; }, false],
            ['redrawn with other points, under the flat nib', w => { w.pts = [[0, 0], [30, 0], [30, 20], [10, 25]]; w.tip = 'flat'; }, true],
            ['moved along x alone, under the square nib', w => { w.x += 7; w.tip = 'square'; }, true],
            ['redrawn with five points, no nib named', w => { w.pts = [[0, 0], [30, 0], [30, 20], [10, 25], [0, 12]]; }, true],
            ['redrawn with three points, under the Fill tip', w => { w.pts = [[0, 0], [20, 0], [20, 14]]; w.tip = 'fill'; }, true]
        ];
        const regStart = isRegion(regH(), 4), regRuns = [];
        for (const row of REG_COPIES) {
            const was = JSON.stringify(regH()), list = mineNow(), mine = list.find(w => w.id === 'region_p1'), n = sentLog.length; row[1](mine);
            await fireHost('p1', 'item redraw of a filled region of the player\'s own', row[0], { type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: list }, a: ++lockA });
            const sent = sentLog.slice(n).filter(s => piecesIn(s.m).some(w => w.id === 'region_p1')).map(s => [s.to, piecesIn(s.m).find(w => w.id === 'region_p1')]);
            regRuns.push({ mut: row[0], changed: JSON.stringify(regH()) !== was, tip: regH() ? regH().tip : 'gone', region: isRegion(regH(), mine.pts.length) && JSON.stringify(regH().pts) === JSON.stringify(mine.pts) && regH().x === mine.x && regH().y === mine.y, sent: sent.map(s => [s[0], s[1].tip, isRegion(s[1], mine.pts.length)]) });
        }
        const regOff = regRuns.filter((r, i) => !(r.region && r.tip === 'fill' && r.changed === REG_COPIES[i][2] && r.sent.every(s => s[1] === 'fill' && s[2] === true) && (REG_COPIES[i][2] ? r.sent.some(s => s[0] === 'peer_p2') : r.sent.length === 0)));
        check('host (Match a wall, round five): a filled region signed by a player stays a filled region. Only a file can sign one so, and its player may redraw its points and move it, as any drawing of theirs. Six copies of the map are sent, each the map as the player holds it but for the region. Named as it stands, under the Fill tip or under the flat nib, it is no redraw: nothing changes and nothing is sent. Redrawn with other points under the FLAT nib, moved along x alone under the SQUARE nib, redrawn with no nib named and redrawn under the Fill tip, the change is taken each time, points and place, and the region is a FILLED REGION afterwards: the Fill tip, as many stretches as points by fogcore\'s own reading, and no line by fogcore lineOf, on the host and in every send that carries it, and the other player is sent each. ROUND FIVE FLIPS the two that name a nib: round four laid the nib over the Fill tip, and the region became an open line on every screen. The write oracle, which holds since round five that no message of a player\'s changes the tip of a filled region, saw nothing',
            regStart && REG_COPIES.length === 6 && REG_COPIES.filter(r => r[2]).length === 4 && regOff.length === 0 && isRegion(regH(), 3) && regH().byPlayer === true && regH().ownerId === 'u_p1' && regH().x === 907 && noneOpen(/^item redraw of a filled region of the player's own /),
            { regOff, runs: regRuns.map(r => [r.mut, r.changed, r.tip, r.region, r.sent]) });

        // 5. across the run: every send so far, to anyone (before the two probes below, whose answers say the path the player asked by, and
        //    before the door is found, when its own look is the table's to see)
        {
            const carried = sentLog.filter(s => !!doorIn(s.m)), leaks = [];
            for (const s of sentLog) { const why = secretLeak(s.m); if (why) { leaks.push([s.to + ':' + s.m.type, why]); if (leaks.length >= 20) break; } }
            check('host (a secret door): across the run, nothing sent to anyone gives the secret door away — the ' + carried.length + ' sends that carry it each hold it as the wall the players are to hold, and no send holds its own name, colour or picture, nor one of the GM\'s three keys. No wall, door or barrier in any send has its keys in an order of its own or a key whose value is false or null, and no plain wall in any send carries a name, a group or a key of a door or of a way through, is typed anything but wall, or writes a hex colour with an upper-case letter', carried.length >= 100 && carried.every(s => seenAsWall(doorIn(s.m))) && leaks.length === 0, { carried: carried.length, leaks: leaks.slice(0, 3) });
            {   // the clause above is not empty: two walls of the world carry such keys on the host, and they are sent often
                const offIds = ['wall_one', 'wall_line'], offHost = offIds.map(id => hasOff(tokH(id))), offSent = offIds.map(id => sentLog.reduce((n, s) => n + piecesIn(s.m).filter(w => w.id === id).length, 0)), offLeft = offIds.map(id => sentLog.reduce((n, s) => n + piecesIn(s.m).filter(w => w.id === id && hasOff(w)).length, 0));
                check('host (a wall\'s leftover keys): a wall that carries isChar false and locked false on the host, and one that carries nodeId null, the traces of controls once used, reach the players often and never with such a key, while the host\'s own pieces keep them', offHost.every(Boolean) && offSent.every(n => n >= 20) && offLeft.every(n => n === 0), { offHost, offSent, offLeft });
            }
            const count = (id, f) => sentLog.reduce((n, s) => n + piecesIn(s.m).filter(w => w.id === id && f(w)).length, 0);
            const wallsSeen = wallIds.map(id => count(id, () => true)), wallsNamed = wallIds.map(id => count(id, w => hasOwn(w, 'name'))), wallsOdd = wallIds.map(id => count(id, w => !plainWall(w)));
            const keptSeen = keptIds.map(id => count(id, () => true)), keptWrong = keptIds.map(id => count(id, w => w.name !== NAMED.kept[id]));
            const runOff = [];   // what was wrong, piece by piece: first in the detail
            wallIds.forEach((id, i) => { if (wallsSeen[i] < NAMED_FLOOR) runOff.push(id + ' sent ' + wallsSeen[i] + ' times'); if (wallsNamed[i]) runOff.push(id + ' sent with a name ' + wallsNamed[i] + ' times'); if (wallsOdd[i]) runOff.push(id + ' sent as no plain wall ' + wallsOdd[i] + ' times'); });
            keptIds.forEach((id, i) => { if (keptSeen[i] < NAMED_FLOOR) runOff.push(id + ' sent ' + keptSeen[i] + ' times'); if (keptWrong[i]) runOff.push(id + ' sent under another name or none ' + keptWrong[i] + ' times'); });
            const hostStill = namesOff(id => nameOf(tokH(id)), hostName);
            check('host (a plain wall has no name): across the run, the four plain walls that have a name on the host (the wall, the barrier, the wall whose flag is the number 1 and the wall drawn as a line) were sent ' + wallsSeen.join(', ') + ' times, each time as a plain wall and never with a name. The eleven named pieces that keep a name (two doors, the wall that is a portal, two portals, the wall linked to a node, the picture, the text box, the piece whose barrier flag is a word, the token and the waiting token) were sent ' + keptSeen.join(', ') + ' times, each time under their own name. The host\'s own pieces still hold every name',
                wallIds.length === 4 && keptIds.length === 11 && wallsSeen.every(n => n >= NAMED_FLOOR) && wallsNamed.every(n => n === 0) && wallsOdd.every(n => n === 0) && keptSeen.every(n => n >= NAMED_FLOOR) && keptWrong.every(n => n === 0)
                && runOff.length === 0 && hostStill.length === 0,
                { runOff, hostOff: hostStill, floor: NAMED_FLOOR, wallsSeen, keptSeen });
            {   // the third review of fold B5: the clauses that hold a plain wall to its one shape are not empty either. The world holds a wall for each thing a copy cannot follow, and each is sent often
                const shSeen = SHAPED_IDS.map(id => count(id, () => true)), shWrong = SHAPED_IDS.map(id => count(id, w => !inShape(id, w))), shOff = [];   // what was wrong, wall by wall: first in the detail
                SHAPED_IDS.forEach((id, i) => {
                    if (shSeen[i] < NAMED_FLOOR) shOff.push(id + ' sent ' + shSeen[i] + ' times');
                    if (shWrong[i]) { const first = sentLog.map(s => piecesIn(s.m).find(w => w.id === id && !inShape(id, w))).find(Boolean); shOff.push([id, 'sent in another shape', shWrong[i], 'times, the first with'].concat(shapeFound(id, first))); }
                });
                const both = sentLog.filter(s => !!doorIn(s.m) && TWIN_IDS.every(id => piecesIn(s.m).some(w => w.id === id))), twins = [].concat.apply([], both.map(s => TWIN_IDS.map(id => twinOff(doorIn(s.m), piecesIn(s.m).find(w => w.id === id))))).filter(Boolean), shHost = hostShapesOff(tokH, doorH());
                check('host (a plain wall leaves in one shape): across the run, the wall with no sightType key, the wall typed window, the wall written in #8C7B5A, the wall of the secret door\'s group, the wall that keeps what a door and a way through left behind and the wall a one-schema file writes with every such key empty were sent ' + shSeen.join(', ') + ' times. Each time the first two were typed wall, the third was in #8c7b5a, the fourth had no group, the fifth had none of doorOpen, doorLock, targetRoomId, trap, portalIcon and portalLock, and the sixth had none of those, no groupId, no targetMapId and no nodeId. In the ' + both.length + ' sends that carry the door\'s copy and both, the wall of the door\'s group and the one-schema wall each differ from the door\'s copy by id and place alone. The host\'s own pieces keep what they carry, and the door still stands in that group',
                    SHAPED_IDS.length === 6 && shSeen.every(n => n >= NAMED_FLOOR) && shWrong.every(n => n === 0) && shOff.length === 0 && both.length >= NAMED_FLOOR && twins.length === 0 && shHost.length === 0 && doorH().groupId === SD.group,
                    { shOff, twinsOff: twins.length, twin: twins[0] || null, hostOff: shHost, doorGroup: doorH().groupId, floor: NAMED_FLOOR, shSeen, both: both.length });
            }
            {   // Match a wall: the clauses that hold a secret door drawn as a line to its wall line, and a wall line to the look it is drawn with, are not empty either
                const ldSeen = LINE_DOOR_IDS.map(id => count(id, () => true)), ldWrong = LINE_DOOR_IDS.map(id => count(id, w => !heldAs(w, LINE_SEEN[id])));
                const pairs = LINE_DOOR_IDS.map(id => sentLog.filter(s => !!pieceIn(s.m, id) && !!pieceIn(s.m, LINE_DOORS[id].wall))), pairOff = [].concat.apply([], LINE_DOOR_IDS.map((id, i) => pairs[i].map(s => twinOff(pieceIn(s.m, id), pieceIn(s.m, LINE_DOORS[id].wall))))).filter(Boolean);
                const lnSeen = LINED_IDS.map(id => count(id, () => true)), lnWrong = LINED_IDS.map(id => count(id, w => lineHeld(w) !== lineHeld(LINED[id].wire)));
                const rlSeen = RELIC_IDS.map(id => count(id, () => true)), rlKeys = RELIC_IDS.map(id => count(id, w => !bareOfSecret(w)));
                const lineOff = [];   // what was wrong, piece by piece: first in the detail
                LINE_DOOR_IDS.forEach((id, i) => {
                    if (ldSeen[i] < NAMED_FLOOR) lineOff.push(id + ' sent ' + ldSeen[i] + ' times');
                    if (ldWrong[i]) { const first = sentLog.map(s => piecesIn(s.m).find(w => w.id === id && !heldAs(w, LINE_SEEN[id]))).find(Boolean); lineOff.push([id, 'sent in another shape', ldWrong[i], 'times, the first as', lineDoorOff(first)]); }
                    if (pairs[i].length < NAMED_FLOOR) lineOff.push(id + ' sent beside its wall ' + pairs[i].length + ' times');
                });
                LINED_IDS.forEach((id, i) => {
                    if (lnSeen[i] < NAMED_FLOOR) lineOff.push(id + ' sent ' + lnSeen[i] + ' times');
                    if (lnWrong[i]) { const first = sentLog.map(s => piecesIn(s.m).find(w => w.id === id && lineHeld(w) !== lineHeld(LINED[id].wire))).find(Boolean); lineOff.push([id, 'sent with another width, opacity or nib', lnWrong[i], 'times, the first with'].concat(LINE_KEYS.map(k => (hasOwn(first, k) ? first[k] : 'none')))); }
                });
                RELIC_IDS.forEach((id, i) => { if (rlSeen[i] < NAMED_FLOOR) lineOff.push(id + ' sent ' + rlSeen[i] + ' times'); if (rlKeys[i]) lineOff.push(id + ' sent with a key of the GM\'s ' + rlKeys[i] + ' times'); });
                const wallLines = sentLog.reduce((n, s) => n + piecesIn(s.m).filter(wallLineOn).length, 0), wallLinesOdd = sentLog.reduce((n, s) => n + piecesIn(s.m).filter(w => wallLineOn(w) && wallOdd(w) !== '').length, 0);
                check('host (Match a wall): across the run, the three secret doors drawn as lines were sent ' + ldSeen.join(', ') + ' times, each time as the wall line the players are to hold: at the matched wall\'s colour, width, opacity and nib, never at the door\'s own, and never with a door key, a lock, a group, a name or one of the six keys. In the ' + pairs.map(p => p.length).join(', ') + ' sends that carry a door\'s copy and the wall it was matched to, the two differ by id and place alone. The ' + wallLines + ' plain walls drawn as lines in the sends each carry a width that is a number above 0, one of the nibs round, square and flat, and an opacity only as a number under 1. The fourteen lines this suite reads were sent ' + lnSeen.join(', ') + ' times, each time as told: the eleven wall lines as they are drawn, and the filled region, the plain line and the door drawn as a line with the text 5 and the opacity of 1 they carry. The three pieces that kept one key were sent ' + rlSeen.join(', ') + ' times and never with it. The host\'s own pieces hold all of it still',
                    LINE_DOOR_IDS.length === 3 && LINED_IDS.length === 14 && lineOff.length === 0 && pairOff.length === 0 && wallLines >= LINED_WALLS.length * NAMED_FLOOR && wallLinesOdd === 0 && linesOff(tokH, 'host').length === 0 && lineDoorsMoved().length === 0 && RELIC_IDS.every(id => hasOwn(tokH(id), RELICS[id])),
                    { lineOff, twinsOff: pairOff.length, twin: pairOff[0] || null, wallLinesOdd, hostOff: linesOff(tokH, 'host'), moved: lineDoorsMoved(), floor: NAMED_FLOOR });
            }
            {   // Match a wall, round two: the clause that holds a plain wall to carrying no lock is not empty, nor the one that holds a see-through wall's door to its wall
                const lwIds = LOCK_WALL_IDS.concat(LOCK_DOOR_IDS), lwSeen = lwIds.map(id => count(id, () => true)), lwLock = lwIds.map(id => count(id, w => hasOwn(w, 'locked'))), lwOdd = lwIds.map(id => count(id, w => !plainWall(w)));
                const lkSeen = LOCK_KEPT_IDS.map(id => count(id, () => true)), lkOff = LOCK_KEPT_IDS.map(id => count(id, w => w.locked !== true));
                const d2Seen = LINE_DOOR2_IDS.map(id => count(id, () => true)), d2Wrong = LINE_DOOR2_IDS.map(id => count(id, w => !heldAs(w, LINE_SEEN[id])));
                const PAIRED = LINE_DOOR2_IDS.concat(['door_line']), pairs2 = PAIRED.map(id => sentLog.filter(s => !!pieceIn(s.m, id) && !!pieceIn(s.m, LINE_ALL[id].wall))), pair2Off = [].concat.apply([], PAIRED.map((id, i) => pairs2[i].map(s => twinOff(pieceIn(s.m, id), pieceIn(s.m, LINE_ALL[id].wall))))).filter(Boolean);
                const anyLock = sentLog.reduce((n, s) => n + lockedWalls(s.m).length, 0), plainSent = sentLog.reduce((n, s) => n + piecesIn(s.m).filter(plainWall).length, 0);
                const clearSeen = ['wall_clear', 'door_clear'].map(id => count(id, () => true)), clearOff = ['wall_clear', 'door_clear'].map(id => count(id, w => w.color !== 'transparent' || w.strokeWidth !== 6 || w.tip !== 'round' || hasOwn(w, 'opacity')));
                const r2Off = [];   // what was wrong, piece by piece: first in the detail
                lwIds.forEach((id, i) => { if (lwSeen[i] < NAMED_FLOOR) r2Off.push(id + ' sent ' + lwSeen[i] + ' times'); if (lwLock[i]) r2Off.push(id + ' sent with a lock ' + lwLock[i] + ' times'); if (lwOdd[i]) r2Off.push(id + ' sent as no plain wall ' + lwOdd[i] + ' times'); });
                LOCK_KEPT_IDS.forEach((id, i) => { if (lkSeen[i] < NAMED_FLOOR) r2Off.push(id + ' sent ' + lkSeen[i] + ' times'); if (lkOff[i]) r2Off.push(id + ' sent without its lock ' + lkOff[i] + ' times'); });
                LINE_DOOR2_IDS.forEach((id, i) => {
                    if (d2Seen[i] < NAMED_FLOOR) r2Off.push(id + ' sent ' + d2Seen[i] + ' times');
                    if (d2Wrong[i]) { const first = sentLog.map(s => piecesIn(s.m).find(w => w.id === id && !heldAs(w, LINE_SEEN[id]))).find(Boolean); r2Off.push([id, 'sent in another shape', d2Wrong[i], 'times, the first as', lineDoorOff(first)]); }
                });
                PAIRED.forEach((id, i) => { if (pairs2[i].length < NAMED_FLOOR) r2Off.push(id + ' sent beside its wall ' + pairs2[i].length + ' times'); });
                ['wall_clear', 'door_clear'].forEach((id, i) => { if (clearSeen[i] < NAMED_FLOOR) r2Off.push(id + ' sent ' + clearSeen[i] + ' times'); if (clearOff[i]) r2Off.push(id + ' sent in another look than transparent, 6 wide, round and solid ' + clearOff[i] + ' times'); });
                check('host (Match a wall, round two): across the run, the seven plain walls that hold a lock key on the host and the copies of the two secret doors locked in place were sent ' + lwSeen.join(', ') + ' times, each time as a plain wall and never with a lock. Not one of the ' + plainSent + ' plain walls in the sends carries the key. The six locked pieces that are no plain wall (the door, the token, the shape that blocks nothing, the wall that leads to another map and the two drawings of a player\'s own) were sent ' + lkSeen.join(', ') + ' times, each time with their lock. The two secret doors of round two were sent ' + d2Seen.join(', ') + ' times, each time as the wall line the players are to hold. In the ' + pairs2.map(p => p.length).join(', ') + ' sends that carry the unlocked door and its locked wall line, the see-through door and its see-through wall line, and the locked door and its unlocked wall line, the two of each pair differ by id and place alone. The see-through wall line and its door were sent ' + clearSeen.join(', ') + ' times, each time in the colour transparent, 6 wide with the round nib and no opacity. The host\'s own pieces hold every lock and every look still',
                    lwIds.length === 9 && r2Off.length === 0 && anyLock === 0 && plainSent >= lwIds.length * NAMED_FLOOR && pair2Off.length === 0 && r2Moved().length === 0 && LOCK_WALL_IDS.every(id => lockOf(tokH(id)) === LOCK_WALLS[id]) && LOCK_DOOR_IDS.concat(LOCK_KEPT_IDS).every(id => tokH(id).locked === true),
                    { r2Off, anyLock, twinsOff: pair2Off.length, twin: pair2Off[0] || null, moved: r2Moved(), floor: NAMED_FLOOR });
            }
        }

        // 6. the door's own picture fill: its path was sent to nobody, so the asset gate serves it to nobody
        clockOff += 11000; resetRec(); const a0 = conns.p1.sent.length;
        try { net._handleMessage({ type: 'asset-req', path: SD.pic }, conns.p1); } finally { net.applyingRemote = false; } await drain(); flushTimers(); await drain();
        const unserved = conns.p1.sent.slice(a0).filter(m => m.type === 'asset' && m.path === SD.pic);
        check('host (a secret door): the picture the secret door wears as its own fill is asked for by a player and answered as missing, nothing fetched — its path reached nobody, so the asset gate serves it to nobody', rec.fetches.length === 0 && unserved.length === 1 && unserved[0].error === 'missing', { fetches: rec.fetches.length, unserved });

        // 6b. with no fog core at hand (the module did not load): the door still leaves as a wall, in the Wall material's colour, and a request
        //     naming it is still answered with nothing, where the GM's lock on the door beside it is still said. The core is away only while the
        //     host handles each message, and these sends are judged here (the wall is not the one the core gives)
        await resetWorld(); await calm(); Object.assign(doorH(), { doorLock: true, groupId: 'g_vault' });
        const noCore = m => { const was = window.wpFogCore; let threw = ''; window.wpFogCore = null; try { net._handleMessage(m, conns.p1); } catch (e) { threw = String(e && e.message) + '; '; } finally { window.wpFogCore = was; net.applyingRemote = false; } return threw; };
        clockOff += 1500; const c0 = conns.p1.sent.length; let threwNC = noCore(clone(need));
        clockOff += 1500; threwNC += noCore(clone(reqS));   // (each door request past the limiter's spacing of the one before)
        clockOff += 1500; threwNC += noCore({ type: 'door-req', mapId: 'm_open', itemId: 'door_locked' });
        await calm();
        const sentNC = conns.p1.sent.slice(c0), wholeNC = sentNC.filter(m => m.type === 'item' && m.itemId === 'm_open' && m.item && !m.item.stub), doorNC = wholeNC[0] ? doorIn(wholeNC[0]) : null, deniesNC = sentNC.filter(m => m.type === 'door-deny').map(m => m.reason);
        const bareWall = Object.assign({}, SECRET_SEEN, { color: '#3f3b47' }); delete bareWall.texture;   // the fallback: the Wall material's colour and no pattern, and no name, as SECRET_SEEN has none
        const nameNC = id => nameOf(wholeNC[0] ? piecesIn(wholeNC[0]).find(w => w.id === id) || null : null);
        check('host (a secret door): with no fog core at hand the secret door still leaves as a wall — the Wall material\'s colour, no door key, no lock, no group, no name, no pattern or picture and none of the three keys, nothing of its own look anywhere in the copy — and a request naming it is still answered with nothing, where the lock of the door beside it is still said. The rule for a name needs no core: the four named plain walls still leave with none, and the eleven pieces that keep a name still carry theirs', threwNC === '' && wholeNC.length === 1 && !!doorNC && sortedPairs(doorNC) === sortedPairs(bareWall) && !hasOwn(doorNC, 'name') && wallIds.every(id => nameNC(id) === null) && keptIds.every(id => nameNC(id) === NAMED.kept[id]) && namesOff(nameNC, wireName).length === 0 && !/Vault of Embers|#a1b2c3|vault-door|"(secret|seenColor|seenTexture)":/i.test(JSON.stringify(wholeNC[0])) && eq(deniesNC, ['locked']) && window.wpFogCore === FC && doorH().secret === true && doorH().doorLock === true, { namesOff: namesOff(nameNC, wireName), threwNC, deniesNC, doorNC });
        const shapeNC = shapesOff(id => (wholeNC[0] ? piecesIn(wholeNC[0]).find(w => w.id === id) || null : null)), oddNC = wholeNC[0] ? oddWalls(wholeNC[0]) : [['no copy', 'was not sent']];
        check('host (a plain wall leaves in one shape): the rule for the shape needs no fog core. In the copy sent with none at hand the six walls leave as they do with it. The first two are typed wall, the third is in #8c7b5a, the fourth has no group, the fifth has none of the six keys and the sixth none of the nine, targetMapId and nodeId among them. No plain wall of that copy stands in another shape, and the secret door\'s fallback wall is one of them', wholeNC.length === 1 && shapeNC.length === 0 && oddNC.length === 0 && !!doorNC && plainWall(doorNC) && wallOdd(doorNC) === '', { shapeNC, oddNC: oddNC.slice(0, 4), doorNC });

        // 6c. Match a wall, with no fog core at hand: a wall drawn as a line is still sent as it is drawn (net.js writes that reading out), and a secret door
        //     drawn as a line is still a wall line that holds none of the six keys. Round two: the fallback lays the look Match set over the door's own, by
        //     the tests the core's cleaners make, so a matched door leaves in that copy as it does with the core: the piece the players are to hold
        const pieceNC = id => (wholeNC[0] ? pieceIn(wholeNC[0], id) : null), linesNC = linesOff(pieceNC, 'wire'), relicNC = RELIC_IDS.filter(id => !pieceNC(id) || !bareOfSecret(pieceNC(id)));
        const doorsNC = LINE_ALL_IDS.filter(id => !heldAs(pieceNC(id), LINE_SEEN[id])).map(id => [id, pieceNC(id) ? lineDoorOff(pieceNC(id)) : 'gone', pieceNC(id)]), twinsNC = LINE_ALL_IDS.map(id => [id, twinOff(pieceNC(id), pieceNC(LINE_ALL[id].wall))]).filter(p => p[1]);
        const shapedNC = LINE_ALL_IDS.filter(id => { const w = pieceNC(id); return !w || !wallLineOn(w) || wallOdd(w) !== '' || !keysInOrder(w) || !bareOfSecret(w) || ['name', 'doorOpen', 'doorLock', 'groupId', 'locked'].some(k => hasOwn(w, k)); });
        check('host (Match a wall): the rule for a wall drawn as a line needs no fog core. In the copy sent with none at hand the eleven wall lines leave as they do with it: each with a width that is a number, an opacity only under 1 and one of the three nibs, the text 5 as 5, the text 7.5px as 7.5, the text 1e16 as 1e15, a word and 0 as 3. The filled region, the plain line and the door drawn as a line keep what they carry. Each of the three secret doors drawn as lines still leaves as a plain wall drawn as a line: typed wall, with no door key, no lock, no group and no name, its keys in order. And it leaves in the look Match set for it, as it does with the core: key for key the wall line the players are to hold, at the matched wall\'s colour, width, opacity and nib (6 wide at 0.7 with the flat nib, 5 wide with the round nib and NO opacity, 4 wide at 0.5 with the square nib), never in the Wall material\'s colour and never at the door\'s own width, opacity or nib, so that it and the wall line it was matched to differ by id and place alone. The two doors of round two leave alike: the unlocked door as its locked wall line does, and the door matched to the see-through wall line in the colour transparent, as that wall. The three pieces that kept one key leave without it, and nothing in the copy holds one of the six keys or a door\'s own name or colour',
            wholeNC.length === 1 && linesNC.length === 0 && LINE_DOOR_IDS.length === 3 && LINE_ALL_IDS.length === 5 && doorsNC.length === 0 && twinsNC.length === 0 && shapedNC.length === 0
            && pieceNC('door_line').color === '#5a5560' && pieceNC('door_line').strokeWidth === 6 && pieceNC('door_line').opacity === 0.7 && pieceNC('door_line').tip === 'flat' && pieceNC('door_file').strokeWidth === 5 && pieceNC('door_file').tip === 'round' && !hasOwn(pieceNC('door_file'), 'opacity') && pieceNC('door_bare').strokeWidth === 4 && pieceNC('door_bare').tip === 'square'
            && pieceNC('door_clear').color === 'transparent' && pieceNC('wall_clear').color === 'transparent' && LINE_ALL_IDS.every(id => pieceNC(id).color !== '#3f3b47') && relicNC.length === 0
            && !/Postern of Ash|#c3b2a[1-9]|"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip)":/i.test(JSON.stringify(wholeNC[0])), { linesNC, doorsNC, twinsNC, shapedNC, relicNC });

        // 6d. Match a wall, round two, with no fog core at hand: no plain wall carries a lock (the rule stands in the host's own block for a plain wall, and needs no core)
        const lockNC = {
            walls: LOCK_WALL_IDS.concat(LOCK_DOOR_IDS).filter(id => { const w = pieceNC(id); return !w || !plainWall(w) || hasOwn(w, 'locked'); }).map(id => [id, lockOf(pieceNC(id))]),
            kept: LOCK_KEPT_IDS.filter(id => lockOf(pieceNC(id)) !== true).map(id => [id, lockOf(pieceNC(id))]), any: wholeNC[0] ? lockedWalls(wholeNC[0]) : ['no copy']
        };
        check('host (Match a wall, round two): the rule for a lock needs no fog core. In the copy sent with none at hand the seven plain walls that hold a lock key on the host leave with none, and so do the fallback walls of the two secret doors the GM locked in place, the box and the line. The six locked pieces that are no plain wall keep their lock: the door that is no secret, the token, the shape that blocks nothing, the wall that leads to another map and the two drawings of a player\'s own. No plain wall of that copy carries the key, and the host\'s own pieces keep every lock',
            wholeNC.length === 1 && lockNC.walls.length === 0 && lockNC.kept.length === 0 && lockNC.any.length === 0 && LOCK_WALL_IDS.every(id => lockOf(tokH(id)) === LOCK_WALLS[id]) && LOCK_DOOR_IDS.concat(LOCK_KEPT_IDS).every(id => tokH(id).locked === true), lockNC);

        // 6e. the fallback reads the look Match set by the tests the core's cleaners make. A batch of secret doors drawn as lines, each with one kind of value under
        //     one of the four keys, is sent in a whole copy of the map once with no core at hand and once with it: each door must leave alike both times, as
        //     the wall line this suite expects. NC_BATCH: [id, what the door holds beside its own look, how the wall line the players hold differs from ncWall
        //     (a key named null is not there at all)]. The doors stand at x 1700, clear of every wall line: nothing is matched here, the keys are set as told
        const ncWall = { color: '#3f3b47', strokeWidth: 9, opacity: 0.8, tip: 'square' };   // a door that names nothing: the Wall material's colour at the door's own width, opacity and nib
        const NC_BATCH = [
            ['nc_none', {}, {}],
            ['nc_all', { seenColor: '#AaBbCc', seenWidth: 2.5, seenOpacity: 0.5, seenTip: 'round' }, { color: '#aabbcc', strokeWidth: 2.5, opacity: 0.5, tip: 'round' }],
            ['nc_w_num', { seenWidth: 0.5 }, { strokeWidth: 0.5 }], ['nc_w_cap', { seenWidth: 1e15 }, { strokeWidth: 1e15 }],
            ['nc_w_text', { seenWidth: '6' }, {}], ['nc_w_zero', { seenWidth: 0 }, {}], ['nc_w_neg', { seenWidth: -4 }, {}],
            ['nc_o_num', { seenOpacity: 0.25 }, { opacity: 0.25 }], ['nc_o_zero', { seenOpacity: 0 }, { opacity: 0 }], ['nc_o_one', { seenOpacity: 1 }, { opacity: null }],
            ['nc_o_neg', { seenOpacity: -0.1 }, {}], ['nc_o_past', { seenOpacity: 1.01 }, {}], ['nc_o_text', { seenOpacity: '0.5' }, {}],
            ['nc_t_round', { seenTip: 'round' }, { tip: 'round' }], ['nc_t_flat', { seenTip: 'flat' }, { tip: 'flat' }], ['nc_t_square', { tip: 'flat', seenTip: 'square' }, { tip: 'square' }],
            ['nc_t_fill', { seenTip: 'fill' }, {}], ['nc_t_word', { seenTip: 'Round' }, {}],
            ['nc_c_caps', { seenColor: '#AABBCC' }, { color: '#aabbcc' }], ['nc_c_clear', { seenColor: 'transparent' }, { color: 'transparent' }],
            ['nc_c_word', { seenColor: 'Transparent' }, {}], ['nc_c_short', { seenColor: '#abc' }, {}], ['nc_c_long', { seenColor: '#aabbccdd' }, {}], ['nc_c_lead', { seenColor: ' #aabbcc' }, {}], ['nc_c_num', { seenColor: 5 }, {}], ['nc_c_list', { seenColor: ['#aabbcc'] }, {}],
            ['nc_own_clear', { color: 'transparent' }, { color: 'transparent' }], ['nc_own_named', { color: 'transparent', seenColor: '#aabbcc' }, { color: '#aabbcc' }],
            ['nc_own_blank', { color: ' transparent ' }, {}], ['nc_own_rgb3', { color: 'rgba(255,0,0)' }, {}],   // (round three: a colour that draws nothing is read as the board reads the very text. A blank beside the word makes it no colour at all, and rgba(255,0,0) is plain red: neither door is see-through)
            ['nc_tex', { texture: 'planks', seenTexture: 'bricks' }, {}],
            ['nc_lock', { locked: true, doorLock: true, name: 'NC door', groupId: 'g_nc' }, {}]
        ];
        const ncBox = i => ({ pts: [[0, 0], [40, 0]], x: 1700, y: 20 + 20 * i, w: 40, h: 1, baseW: 40, baseH: 1 });
        const ncDoor = (row, i) => Object.assign({ id: row[0], type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, color: '#c3b2a8', strokeWidth: 9, opacity: 0.8, tip: 'square' }, ncBox(i), row[1]);
        const ncWant = (row, i) => { const o = Object.assign({ id: row[0], type: 'path', blocksSight: true, sightType: 'wall' }, ncBox(i), ncWall, row[2]); Object.keys(o).forEach(k => { if (o[k] === null) delete o[k]; }); return o; };
        const regBase = { id: 'nc_region', type: 'path', tip: 'fill', blocksSight: true, pts: [[0, 0], [30, 0], [30, 30], [0, 30]], strokeWidth: 9, opacity: 0.8, x: 1760, y: 20, w: 30, h: 30, baseW: 30, baseH: 30 };   // a secret door that is a FILLED REGION, with all four keys named: no line, so the fallback lays nothing over it
        NC_BATCH.forEach((row, i) => { wbH().push(ncDoor(row, i)); });
        wbH().push(Object.assign({}, regBase, { sightType: 'door', doorOpen: false, secret: true, color: '#c3b2a8', seenColor: '#aabbcc', seenWidth: 2.5, seenOpacity: 0.5, seenTip: 'flat' }));
        const boxBase = { id: 'nc_boxclear', type: 'rect', blocksSight: true, x: 1760, y: 80, w: 30, h: 30 };   // a secret door that is a BOX whose own colour is the word transparent, with nothing named: clear with the core, and the box's fallback keeps it clear
        wbH().push(Object.assign({}, boxBase, { sightType: 'door', doorOpen: false, secret: true, color: 'transparent' }));
        const blankBase = { id: 'nc_boxblank', type: 'rect', blocksSight: true, x: 1760, y: 130, w: 30, h: 30 };   // round four: a secret door that is a BOX whose own colour is the word transparent with a blank either side. The board gives such a box no fill at all, so it is as see-through as the box above, and with the core it leaves clear. (A LINE in that colour is stroked in ink and is not: nc_own_blank)
        wbH().push(Object.assign({}, blankBase, { sightType: 'door', doorOpen: false, secret: true, color: ' transparent ' }));
        const batchJudged = NC_BATCH.every(row => FC.secretOn(tokH(row[0])) === true && FC.lineOf(tokH(row[0])) === true) && FC.secretOn(tokH('nc_region')) === true && FC.lineOf(tokH('nc_region')) === false && FC.secretOn(tokH('nc_boxclear')) === true;
        const wholeOf = list => list.filter(m => m.type === 'item' && m.itemId === 'm_open' && m.item && !m.item.stub).pop() || null;
        clockOff += 1500; const e0 = conns.p1.sent.length, threwNB = noCore(clone(need)); await calm(); const mapNB = wholeOf(conns.p1.sent.slice(e0));
        clockOff += 1500; const e1 = conns.p1.sent.length; let threwCB = ''; try { net._handleMessage(clone(need), conns.p1); } catch (e) { threwCB = String(e && e.message); } finally { net.applyingRemote = false; } await calm(); const mapCB = wholeOf(conns.p1.sent.slice(e1));
        const lookSent = w => (w ? ['color'].concat(LINE_KEYS).map(k => (hasOwn(w, k) ? w[k] : 'none')) : 'gone');
        const batchOff = NC_BATCH.map((row, i) => { const want = ncWant(row, i), a = mapNB ? pieceIn(mapNB, row[0]) : null, b = mapCB ? pieceIn(mapCB, row[0]) : null; return heldAs(a, want) && heldAs(b, want) && keysInOrder(a) && keysInOrder(b) ? null : [row[0], 'with no core', lookSent(a), 'with the core', lookSent(b), 'wanted', lookSent(want)]; }).filter(Boolean);
        const regNB = mapNB ? pieceIn(mapNB, 'nc_region') : null, regCB = mapCB ? pieceIn(mapCB, 'nc_region') : null, batchLeak = [mapNB, mapCB].map(m => (m ? String(JSON.stringify(m).match(/#c3b2a8|NC door|g_nc|planks|"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip)":/i) || '') : 'no copy'));
        const blankNB = mapNB ? pieceIn(mapNB, 'nc_boxblank') : null, blankCB = mapCB ? pieceIn(mapCB, 'nc_boxblank') : null;
        check('host (Match a wall, round two): with no fog core at hand a secret door drawn as a line still leaves in the look Match set for it, read by the tests the core\'s cleaners make. A batch of ' + NC_BATCH.length + ' such doors, each 9 wide at 0.8 with the square nib in a colour of its own, is sent in a whole copy of the map once with no core and once with it, and each door leaves alike both times, as the wall line this suite expects. A door that names nothing leaves in the Wall material\'s colour at its own width, opacity and nib. A width leaves as named where it is a number above 0 (0.5, 1e15), and as the door\'s own where it is the text 6, 0 or below 0. An opacity leaves as named where it is a number from 0 to under 1 (0.25 and 0), as no key at all where it is 1, and as the door\'s own where it is below 0, past 1 or text. A nib leaves as named where it is round, flat or square, and as the door\'s own for fill and for Round. A colour leaves as named, in lower case, where it is six hex digits (#AABBCC as #aabbcc), as the word transparent for that word, and as the Wall material\'s for Transparent, #abc, #aabbccdd, a hex colour after a space, a number and a list that holds a hex colour. A door whose own colour is the word transparent leaves clear until a colour is named for it, and so does a secret door that is a box, with the core and without. Round three: a colour that draws nothing is read as the board reads the very text, so a door drawn as a LINE whose own colour is the word with a blank either side of it, which the board strokes in ink, or rgba(255,0,0), which is plain red, is no see-through door and leaves in the Wall material\'s colour, with the core and without. Round four: a BOX in that colour with the blanks gets no fill at all from any board, so with the core it leaves clear again, in the colour transparent and with no pattern, as the box whose colour is the word does. (With no core at hand the fallback knows the exact word alone: there such a box is still a plain wall with none of the door\'s own, clear or in the Wall material\'s colour. That much is held, and no more.) No door leaves with a pattern, a lock, a door lock, a name or a group, in its own colour or with one of the six keys. A secret door that is a filled region keeps the older fallback: the Wall material\'s colour and nothing of the four keys named for it, still a filled region 9 wide at 0.8, where the core gives it the named colour and the Wall pattern',
            NC_BATCH.length === 32 && batchJudged && threwNB === '' && threwCB === '' && !!mapNB && !!mapCB && batchOff.length === 0 && batchLeak.join('') === '' && oddWalls(mapNB).length === 0 && oddWalls(mapCB).length === 0
            && heldAs(pieceIn(mapNB, 'nc_boxclear'), Object.assign({}, boxBase, { sightType: 'wall', color: 'transparent' })) && heldAs(pieceIn(mapCB, 'nc_boxclear'), Object.assign({}, boxBase, { sightType: 'wall', color: 'transparent' }))
            && FC.secretOn(tokH('nc_boxblank')) === true && tokH('nc_boxblank').color === ' transparent ' && heldAs(blankCB, Object.assign({}, blankBase, { sightType: 'wall', color: 'transparent' }))
            && (heldAs(blankNB, Object.assign({}, blankBase, { sightType: 'wall', color: 'transparent' })) || heldAs(blankNB, Object.assign({}, blankBase, { sightType: 'wall', color: '#3f3b47' })))
            && heldAs(regNB, Object.assign({}, regBase, { sightType: 'wall', color: '#3f3b47' })) && heldAs(regCB, Object.assign({}, regBase, { sightType: 'wall', color: '#aabbcc', texture: 'bricks' })) && window.wpFogCore === FC,
            { batchOff: batchOff.slice(0, 4), wrong: batchOff.length, batchLeak, batchJudged, threw: [threwNB, threwCB], regNB: lookSent(regNB), regCB: lookSent(regCB), blankNB: blankNB && [blankNB.color, blankNB.texture || 'no pattern'], blankCB: blankCB && [blankCB.color, blankCB.texture || 'no pattern'] });

        // 7. the GM's own edits. What only the GM sees of the door sends the table nothing; another look named for the wall reaches the table as
        //    that wall; once the door is found (fogcore secretReveal: what the menu's row and opening it do) it is a door for everyone
        await resetWorld(); await level();
        let g0 = sentLog.length; const gD = doorH();
        Object.assign(gD, { doorOpen: true, doorLock: true, groupId: 'g_vault', color: '#0a0b0c', name: SD.name + ', ajar', texture: 'stone' }); await level();
        const quiet = carry(g0);
        check('host (a secret door): the GM opening, locking, grouping, renaming, recolouring and repatterning the secret door on their own screen sends the table nothing of the map at the next save: the wall the players hold has not changed', quiet.length === 0, quiet.map(s => s.to + ':' + s.m.type));
        g0 = sentLog.length; delete gD.seenColor; await level();   // no look named for it any more: the Wall material's own, the very look Build names a piece Wall for
        const unlook = carry(g0), wantWall = Object.assign({}, SECRET_SEEN, { color: '#3f3b47' }), toBoth = list => list.length >= 2 && ['peer_p1', 'peer_p2'].every(p => list.some(s => s.to === p));
        const coreWall = FC.secretSeen(gD);   // the core's own answer, before the host's rule for a wall's name is asked
        check('host (a secret door): with no look named for it the wall reaches both players at the next save in the Wall material\'s own colour and pattern, and still with no name. Build names a wall of that look Wall, and the copy takes no name from its look: the core\'s own copy has none, and the piece on the wire has none', toBoth(unlook) && unlook.every(s => !!doorIn(s.m) && sortedPairs(doorIn(s.m)) === sortedPairs(wantWall) && !hasOwn(doorIn(s.m), 'name') && keysInOrder(doorIn(s.m))) && coreWall !== gD && sortedPairs(coreWall) === sortedPairs(wantWall) && !hasOwn(coreWall, 'name') && !hasOwn(gD, 'seenColor') && gD.name === SD.name + ', ajar', { coreName: nameOf(coreWall), sentNames: unlook.map(s => [s.to, nameOf(doorIn(s.m))]), core: coreWall, sent: unlook.map(s => [s.to, doorIn(s.m)]), host: gD });
        g0 = sentLog.length; gD.seenColor = '#778899'; gD.seenTexture = ''; await level();
        const relook = carry(g0), wantLook = Object.assign({}, SECRET_SEEN, { color: '#778899' }); delete wantLook.texture;
        check('host (a secret door): another look the GM names for it (a colour, and a plain colour for its pattern) reaches both players at the next save as that wall — still a wall, with no pattern, no door key and none of the three keys', relook.length >= 2 && ['peer_p1', 'peer_p2'].every(p => relook.some(s => s.to === p)) && relook.every(s => !!doorIn(s.m) && sortedPairs(doorIn(s.m)) === sortedPairs(wantLook) && !('name' in doorIn(s.m)) && keysInOrder(doorIn(s.m)) &&!/"(secret|seenColor|seenTexture|doorOpen|doorLock|groupId|texSrc)":/.test(JSON.stringify(doorIn(s.m)))), relook.map(s => [s.to, doorIn(s.m)]));
        // a wall as Build lays one (buildcore pieceProps, run for real, as the Build tool asks it) where the GM picked that colour and Plain color
        // for it: the piece is named by its MATERIAL, whatever was picked. On the wire it has no name, so the door's copy and the wall beside it
        // differ by id and place alone
        const builtProps = BC && typeof BC.pieceProps === 'function' ? BC.pieceProps('wall', { color: '#778899', texture: '' }) : null;
        campH().items.m_open.whiteboard.push(Object.assign({ id: 'wall_built', type: 'rect', x: 350, y: 600, w: 50, h: 50 }, builtProps || {})); await level();
        clockOff += 1500; const side0 = conns.p1.sent.length;
        try { net._handleMessage(clone(need), conns.p1); } finally { net.applyingRemote = false; } await calm();
        const sideMap = conns.p1.sent.slice(side0).filter(m => m.type === 'item' && m.itemId === 'm_open' && m.item && !m.item.stub).pop() || null, sideDoor = sideMap ? doorIn(sideMap) : null, sideWall = sideMap ? piecesIn(sideMap).find(w => w.id === 'wall_built') || null : null;
        const lessPlace = w => (w ? JSON.stringify(Object.keys(w).filter(k => k !== 'id' && k !== 'x' && k !== 'y').map(k => [k, w[k]])) : 'none');   // in the piece's own order of keys
        const sideOff = !sideDoor || !sideWall ? { missing: [!sideDoor ? 'the door' : '', !sideWall ? 'the wall' : ''] } : {   // how the two differ, first in the detail: a key only one has, a value that differs, the order
            onlyDoor: Object.keys(sideDoor).filter(k => !hasOwn(sideWall, k)), onlyWall: Object.keys(sideWall).filter(k => !hasOwn(sideDoor, k)),
            differ: Object.keys(sideDoor).filter(k => k !== 'id' && k !== 'x' && k !== 'y' && hasOwn(sideWall, k) && JSON.stringify(sideDoor[k]) !== JSON.stringify(sideWall[k])).map(k => [k, sideDoor[k], sideWall[k]]),
            order: JSON.stringify(Object.keys(sideDoor)) === JSON.stringify(Object.keys(sideWall)) ? 'the same' : [Object.keys(sideDoor), Object.keys(sideWall)] };
        check('host (a secret door): a wall Build laid beside it (buildcore pieceProps, run for real) in the look the GM named for the door is named Wall on the host, by its material. In a whole copy of the map that wall has no name, and the door\'s copy and the wall differ by id and place alone: the same keys in the same order with the same values', !!builtProps && !!sideDoor && !!sideWall && lessPlace(sideDoor) === lessPlace(sideWall) && !hasOwn(sideWall, 'name') && !hasOwn(sideDoor, 'name') && plainWall(sideWall) && plainWall(sideDoor) && sideWall.x === 350 && sideDoor.x === 300 && tokH('wall_built').name === 'Wall' && plainWall(tokH('wall_built')), { hostName: tokH('wall_built') ? nameOf(tokH('wall_built')) : 'gone', sideOff, built: builtProps });
        g0 = sentLog.length; const wasSecret = FC.secretReveal(gD); await level();
        const shown = carry(g0), shownDoors = shown.map(s => doorIn(s.m));
        check('host (a secret door): once the GM finds it, the next save gives both players the door as the door it is — a door\'s type, open and locked as the GM has it, its own name, colour, pattern, picture and group — and still none of the three keys, though the look named for it stays on the GM\'s own piece', wasSecret === true && shown.length >= 2 && ['peer_p1', 'peer_p2'].every(p => shown.some(s => s.to === p)) && shownDoors.every(w => !!w && w.sightType === 'door' && w.blocksSight === true && w.doorOpen === true && w.doorLock === true && w.name === SD.name + ', ajar' && w.color === '#0a0b0c' && w.texture === 'stone' && w.texSrc === SD.pic && w.groupId === 'g_vault' && bareOfSecret(w)) && !hasOwn(doorH(), 'secret') && doorH().seenColor === '#778899', { wasSecret, shownDoors, host: doorH() });
        clockOff += 1500; const d0 = conns.p1.sent.length;
        try { net._handleMessage(clone(reqS), conns.p1); } finally { net.applyingRemote = false; } await calm();
        clockOff += 11000; resetRec(); const a1 = conns.p1.sent.length;
        try { net._handleMessage({ type: 'asset-req', path: SD.pic }, conns.p1); } finally { net.applyingRemote = false; } await drain(); flushTimers(); await drain();
        const served = conns.p1.sent.slice(a1).filter(m => m.type === 'asset' && m.path === SD.pic);
        check('host (a secret door): a found door answers as a door — the same request that was met with nothing is now told the door is locked — and the picture it wears, sent to the table with it, is now served to the player who asks', said(conns.p1, d0).indexOf('door-deny:locked') >= 0 && rec.fetches.length === 1 && served.length === 1 && !served[0].error, { said: said(conns.p1, d0), fetches: rec.fetches.length, served: served.map(m => m.error || 'served') });
        await resetWorld(); await level();   // the door is the GM's secret again, and the table's copy level with it
        /* 8. Match a wall: a secret door drawn as a line. A player's messages that name it are answered as for its wall line. Once the door is matched,
              what the GM draws behind the wall sends the table nothing. Another wall matched reaches the table as that wall. A key that names nothing
              counts for nothing, and each of the three counts only where it is set. Found, the door is the door it is for everyone */
        {
            const lD = () => tokH('door_line'), lineIn = m => pieceIn(m, 'door_line');
            // 8a. the door requests: the player's own token in the cell under the door, the door itself (which the GM locked), its wall line, and a door drawn as a line a cell away
            await resetWorld(); await calm();
            const askL = async (mut, id) => { const a = conns.p1.sent.length, b = conns.p2.sent.length; await fireHost('p1', id === 'door_line' ? 'door-req for the secret door drawn as a line' : 'door-req (a control beside the secret door drawn as a line)', mut, { type: 'door-req', mapId: 'm_open', itemId: id }); return { me: said(conns.p1, a), other: said(conns.p2, b) }; };
            await fireHost('p1', 'pos under the secret door drawn as a line', 'a drop in the cell under it', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 1270, y: 110, rot: 0, front: 0, final: true, a: 9 });
            const underL = tokH('tok_p1').x === 1270 && tokH('tok_p1').y === 110;
            const nearL = await askL('from a player whose token stands under it, the door locked by the GM', 'door_line'), stillL = lineDoorsMoved().length === 0;
            const nearW = await askL('its wall line', 'wall_meet'), nearP = await askL('a door drawn as a line, in the same cell', 'door_pen'), openedP = tokH('door_pen').doorOpen === true;
            check('host (Match a wall): with the player\'s own token in the cell under it, their door request naming the secret door drawn as a line opens nothing and tells nobody anything, as the same request for the wall line beside it does. The GM\'s lock on it is not said, and the door is byte for byte as the GM left it. The same player\'s request for the door drawn as a line in that cell opens that door, and the table is sent the map',
                underL && eq(nearL.me, []) && eq(nearL.other, []) && stillL && eq(nearW.me, []) && eq(nearW.other, []) && openedP && nearP.other.some(t => t === 'item' || t === 'itemDelta') && noneOpen(/^door-req for the secret door drawn as a line /) && noneOpen(/^door-req \(a control beside the secret door drawn as a line\) /) && noneOpen(/^pos under the secret door drawn as a line /), { underL, nearL, stillL, nearW, nearP, openedP });
            // 8b. every message of a player's that names a piece by its id, naming the wall line and naming the door
            const answersL = async id => { const out = []; for (const m of named(id)) { await resetWorld(); await calm(); const a = conns.p1.sent.length, b = conns.p2.sent.length; await fireHost('p1', m.type + ' naming ' + (id === 'door_line' ? 'the secret door drawn as a line' : 'a wall line'), 'the piece named by its id', m); out.push(m.type + ' > ' + said(conns.p1, a).join(',') + ' | ' + said(conns.p2, b).join(',')); } return out; };
            const ansWallL = await answersL('wall_meet'), ansDoorL = await answersL('door_line');
            check('host (Match a wall): every message of a player\'s that names a piece by its id (a door request, a travel, a target, a move, threat marks, a picture, a light) is answered for the secret door drawn as a line as it is for the wall line it was matched to, kind for kind and reason for reason, to the sender and to the other player, and changes nothing of any of the three doors', eq(ansWallL, ansDoorL) && ansWallL.length === 7 && lineDoorsMoved().length === 0 && noneOpen(/ naming the secret door drawn as a line /) && noneOpen(/ naming a wall line /), { wall: ansWallL, door: ansDoorL });

            // 8c. the GM's own edits (no probe is fired while the door stands in another look than the world's: each send is judged here)
            const baseL = Object.assign({}, LINE_SEEN.door_line); ['color'].concat(LINE_KEYS).forEach(k => { delete baseL[k]; });
            const wantL = look => Object.assign({}, baseL, look), gotL = list => list.map(s => [s.to, lineIn(s.m)]);
            const allL = (list, want) => toBoth(list) && list.every(s => heldAs(lineIn(s.m), want) && keysInOrder(lineIn(s.m)) && !/"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip)":/.test(JSON.stringify(s.m)));
            const stepL = async change => { const n = sentLog.length; change(lD()); await level(); return carry(n); };
            await resetWorld(); await level();
            const ownA = await stepL(d => { Object.assign(d, { strokeWidth: 25, opacity: 0.9, tip: 'flat', color: '#0a0b0c', name: 'Postern, ajar', doorOpen: true, groupId: 'g_other' }); });
            check('host (Match a wall): the GM redrawing a matched secret door behind the wall (another width, another opacity, another nib, another colour and name, open, in another group) sends the table nothing of the map at the next save: the wall line the players hold has not changed', ownA.length === 0 && lD().strokeWidth === 25 && lD().opacity === 0.9 && lD().tip === 'flat', ownA.map(s => s.to + ':' + s.m.type));
            const toThin = await stepL(d => { Object.assign(d, { seenColor: '#2b2d31', seenWidth: 4, seenOpacity: 0.5, seenTip: 'square' }); });
            check('host (Match a wall): matched to another wall line (4 wide at 0.5 with the square nib, in #2b2d31), the door reaches both players at the next save as that wall line, still a wall, with none of the six keys and nothing of what the GM drew', allL(toThin, wantL({ color: '#2b2d31', strokeWidth: 4, opacity: 0.5, tip: 'square' })), gotL(toThin));
            const toFile = await stepL(d => { Object.assign(d, { seenColor: '#6a6570', seenWidth: 5, seenOpacity: 1, seenTip: 'round' }); });
            check('host (Match a wall): matched to a solid wall line (5 wide with the round nib, an opacity of 1), the door reaches both players as that wall line with NO opacity key at all: the door\'s own 0.9 is not sent, and neither is a 1', allL(toFile, wantL({ color: '#6a6570', strokeWidth: 5, tip: 'round' })) && toFile.every(s => !hasOwn(lineIn(s.m), 'opacity')), gotL(toFile));
            const toJunk = await stepL(d => { Object.assign(d, { seenWidth: 0, seenOpacity: 1.5, seenTip: 'brush' }); });
            check('host (Match a wall): a width of 0, an opacity past 1 and a nib that is none of the three name nothing. The wall line is then drawn as the door is, 25 wide at 0.9 with the flat nib, in the colour still named for it, and none of the junk is sent', allL(toJunk, wantL({ color: '#6a6570', strokeWidth: 25, opacity: 0.9, tip: 'flat' })), gotL(toJunk));
            const toOne = await stepL(d => { d.seenWidth = 7; delete d.seenOpacity; delete d.seenTip; });
            check('host (Match a wall): each of the three keys counts only where it is set. With a width alone named, the wall line is 7 wide and keeps the door\'s own opacity and nib', allL(toOne, wantL({ color: '#6a6570', strokeWidth: 7, opacity: 0.9, tip: 'flat' })), gotL(toOne));
            const toNone = await stepL(d => { ['seenColor', 'seenTexture'].concat(SEEN_LINE_KEYS).forEach(k => { delete d[k]; }); });   // what Back to the Wall look takes off
            check('host (Match a wall): with none of the five look keys left, as after Back to the Wall look, the door reads as it did before Match: a wall line in the Wall material\'s colour at the door\'s own width, opacity and nib', allL(toNone, wantL({ color: '#3f3b47', strokeWidth: 25, opacity: 0.9, tip: 'flat' })) && lD().secret === true && SEEN_LINE_KEYS.every(k => !hasOwn(lD(), k)), gotL(toNone));
            const again = await stepL(d => { Object.assign(d, { seenColor: '#5a5560', seenWidth: 6, seenOpacity: 0.7, seenTip: 'flat' }); });
            const n9 = sentLog.length, wasL = FC.secretReveal(lD()); await level();
            const shownL = carry(n9), shownLs = shownL.map(s => lineIn(s.m));
            check('host (Match a wall): matched again to its first wall, the door is the wall line the players held at the start. Once the GM finds it, the next save gives both players the door as the door it is: a door\'s type, open and locked as the GM has it, in its own colour, width, opacity and nib, under its own name and in its group, and still with none of the six keys, though the look named for it stays on the GM\'s own piece',
                allL(again, LINE_SEEN.door_line) && wasL === true && toBoth(shownL) && shownLs.every(w => !!w && w.sightType === 'door' && w.blocksSight === true && w.doorOpen === true && w.doorLock === true && w.name === 'Postern, ajar' && w.color === '#0a0b0c' && w.strokeWidth === 25 && w.opacity === 0.9 && w.tip === 'flat' && w.groupId === 'g_other' && bareOfSecret(w))
                && !hasOwn(lD(), 'secret') && lD().seenColor === '#5a5560' && lD().seenWidth === 6 && lD().seenOpacity === 0.7 && lD().seenTip === 'flat', { again: gotL(again), wasL, shownLs, host: lD() });
            check('host (Match a wall, round two): a door that is no secret keeps its lock on the wire. Both secret doors the GM locked in place, the box and the line, were sent as walls with no lock while they were secret. Found, each is sent to both players as the door it is with the lock it carries, since the lock of a door says nothing a wall beside it could be told from',
                shownDoors.length >= 2 && shownDoors.every(w => !!w && w.sightType === 'door' && w.locked === true) && shownLs.length >= 2 && shownLs.every(w => !!w && w.sightType === 'door' && w.locked === true) && allL(again, LINE_SEEN.door_line) && again.every(s => !hasOwn(lineIn(s.m), 'locked')) && lD().locked === true,
                { box: shownDoors.map(lockOf), line: shownLs.map(lockOf), secretLine: again.map(s => lockOf(lineIn(s.m))) });

            // 8d. a wall line as Build's own pen lays one and a door line beside it, which the GM drew over and ticked Secret: before the press and after it
            await resetWorld(); await level();
            const pen = id => (BC && typeof BC.penPreset === 'function' ? BC.penPreset(id) : null), geo = pts => (BC && typeof BC.wallLine === 'function' ? BC.wallLine(pts) : null);
            const asLaid = (id, L, pre) => Object.assign({ id, type: 'path', x: L.x, y: L.y, w: L.w, h: L.h, baseW: L.baseW, baseH: L.baseH, z: 10, pts: L.pts }, pre);   // as whiteboard.js buildWallItem makes a line under the pen's preset
            const penW = pen('wall'), penD = pen('door'), gW = geo([[1400, 600], [1460, 600]]), gDr = geo([[1460, 600], [1520, 600]]), penOk = !!(penW && penD && gW && gDr);
            const wallP = penOk ? asLaid('wall_laid', gW, penW) : null, doorP = penOk ? Object.assign(asLaid('door_laid', gDr, penD), { strokeWidth: 12, opacity: 0.5, tip: 'round', secret: true }) : null;   // the door as the GM then has it: wider, fainter, with another nib, ticked Secret
            if (penOk) wbH().push(wallP, doorP);
            const wholeNow = async () => { clockOff += 1500; const n = conns.p1.sent.length; try { net._handleMessage(clone(need), conns.p1); } finally { net.applyingRemote = false; } await calm(); return conns.p1.sent.slice(n).filter(m => m.type === 'item' && m.itemId === 'm_open' && m.item && !m.item.stub).pop() || null; };
            await level(); const mapB = await wholeNow(), offB = mapB ? twinOff(pieceIn(mapB, 'door_laid'), pieceIn(mapB, 'wall_laid')) : { missing: ['the copy'] };
            const hitP = penOk ? FC.secretMatch(doorP, wbH()) : null;
            if (hitP) { const cP = FC.cleanSeenColor(hitP.color); doorP.seenWidth = FC.cleanSeenWidth(hitP.width); doorP.seenOpacity = FC.cleanSeenOpacity(hitP.opacity); doorP.seenTip = FC.cleanSeenTip(hitP.tip); if (cP) doorP.seenColor = cP; }   // as Properties' Match press sets them (inspector.js setItemSeen): each through its cleaner, the door's own look left alone
            await level(); const mapA = await wholeNow(), offA = mapA ? twinOff(pieceIn(mapA, 'door_laid'), pieceIn(mapA, 'wall_laid')) : { missing: ['the copy'] };
            check('host (Match a wall): a wall line as Build\'s own pen lays one (buildcore penPreset and wallLine, run for real) and a door line laid end to end with it, which the GM then made 12 wide at 0.5 with the round nib and ticked Secret. Before the press the door\'s copy tells itself from the wall: it alone carries an opacity, and its width and nib differ. fogcore secretMatch then answers the wall\'s look, 6 wide, solid, with the square nib, in the Wall material\'s colour. With the three keys set through their cleaners, as Properties\' Match press sets them, the door\'s copy and the wall differ by id and place alone in a whole copy of the map, while the GM\'s own piece keeps the width, opacity and nib it was drawn with',
                penOk && !!offB && eq(offB.onlyCopy, ['opacity']) && eq(offB.onlyWall, []) && eq((offB.differ || []).map(d => d[0]).sort(), ['strokeWidth', 'tip']) && eq(hitP, { color: '#3f3b47', width: 6, opacity: 1, tip: 'square' }) && offA === null && !!mapA && plainWall(pieceIn(mapA, 'door_laid')) && wallOdd(pieceIn(mapA, 'door_laid')) === '' && secretLeak(mapA) === ''
                && doorP.strokeWidth === 12 && doorP.opacity === 0.5 && doorP.tip === 'round' && doorP.name === 'Door' && tokH('wall_laid').name === 'Wall', { penOk, before: offB, hit: hitP, after: offA });

            // 8f-0. Round three: this suite's OWN reading of how thick a pen draws along a direction on the board, in vectors (penThick). The board draws a line in
            //     its own box (baseW by baseH), stretched to the piece's box (w by h) and turned with it. A round or a square nib is a stroke as wide as its width
            //     ACROSS the line in that own box. The flat nib is a ribbon: the line moved by half its width, times the root of a half, along both axes of the own
            //     box, so it is as thick as its nib reaches across the run and has no thickness at all along the nib
            const r3Line = (pts, o) => { const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x = Math.min.apply(null, xs), y = Math.min.apply(null, ys), w = Math.max(1, Math.max.apply(null, xs) - x), h = Math.max(1, Math.max.apply(null, ys) - y); return Object.assign({ type: 'path', blocksSight: true, sightType: 'wall', pts: pts.map(p => [p[0] - x, p[1] - y]), x, y, w, h, baseW: w, baseH: h }, o); };   // a line through those points of the board, never resized: its box is its own
            const r3Turn = (v, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
            const r3Num = v => (typeof v === 'number' ? v : parseFloat(v)), r3Wide = w => { const n = r3Num(w.strokeWidth); return isFinite(n) && n > 0 ? Math.min(n, 1e15) : 3; }, r3Solid = w => { const n = r3Num(w.opacity); return isFinite(n) && n < 1 ? Math.max(0, n) : 1; }, r3Nib = w => (w.tip === 'square' || w.tip === 'flat' ? w.tip : 'round');   // a line's width, opacity and nib as every screen draws them
            const r3Scale = w => [w.w / w.baseW, w.h / w.baseH], r3Plain = w => w.w === w.baseW && w.h === w.baseH && !w.rot;   // (plain: never resized nor turned)
            function penThick(w, dir, wide, nib) {   // w: the line (its box and its turn); dir: [dx, dy] on the board; wide and nib: the width and the nib it is drawn with (its own where none is given)
                const len = Math.hypot(dir[0], dir[1]), u = [dir[0] / len, dir[1] / len], sc = r3Scale(w), rot = w.rot || 0, sw = wide === undefined ? r3Wide(w) : wide, tip = nib || r3Nib(w);
                if (tip === 'flat') { const end = r3Turn([Math.SQRT1_2 * sw * sc[0], Math.SQRT1_2 * sw * sc[1]], rot); return Math.abs(u[0] * end[1] - u[1] * end[0]); }   // the ribbon's two edges lie that far apart, measured across the run
                const own = r3Turn(u, -rot), v = [own[0] / sc[0], own[1] / sc[1]], vl = Math.hypot(v[0], v[1]), across = r3Turn([-v[1] / vl * sw * sc[0], v[0] / vl * sw * sc[1]], rot);   // the run inside the own box, the pen's width across it there, and that width carried onto the board
                return Math.abs(u[0] * across[1] - u[1] * across[0]);
            }
            const r3Close = (a, b) => typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b) && Math.abs(a - b) <= 1e-4 * Math.max(1, Math.abs(a), Math.abs(b));   // (the core writes the root of a half as 0.70711)
            const r3Steps = (from, to, step) => { const out = [], n = Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / step); for (let i = 0; i <= n; i++) out.push([from[0] + (to[0] - from[0]) * i / n, from[1] + (to[1] - from[1]) * i / n]); return out; };   // a line as a hand draws it: a point every few pixels
            const r3Sized = (pts, sx, sy, o) => { const p = r3Line(pts, o); p.baseW = p.w / sx; p.baseH = p.h / sy; p.pts = p.pts.map(q => [q[0] / sx, q[1] / sy]); return p; };   // the same line on the board, in a box that was resized by sx and sy: its pen is stretched with it
            // 8f-1. Rounds four and five: this suite's OWN reading of WHICH wall line answers a door drawn as a line, and at what width, written out from the rule as it
            //     is told (r5Judge, r5Look), in vectors and with this suite's own measures (ptLine, penThick). It shares no line with fogcore: a line's points are
            //     carried onto the board here (r4Board), its stretches are pairs of points, and a distance is a length, never a square. Round five rewrote five parts
            //     of it, each marked (R5).
            //     A RUN is the way a line goes at one of its stretches, read over a SPAN of line: as much before the stretch as after it (side 0), the span that ENDS
            //     with it (side -1) or the span that BEGINS with it (side 1), cut inside a stretch where the span ends there. A stretch as long as the span is its
            //     own run. The DOOR's run is read around its stretch, over 40 px.
            //     (R5) THE WALL's RUNS at a stretch are FOUR: on either side of it, each over 40 px and over 20 px, those that were read over 20 px of line or more.
            //     With none that long, the run around the stretch. The one most like the door's run counts, the earliest of the four where two are as alike.
            //     (R5) THE PAIR THAT SPEAKS for a wall is, of the pairs of stretches whose gap is within 4 px of the wall's nearest gap, the one whose two runs are
            //     most alike, then the nearer, then the door's earliest stretch. (Round four took the pairs within one squared pixel.)
            //     THE SEVEN RANKS. (1) the LOOK that reaches BOTH ends of the door: 2 for an end a wall of that look touches (the end point within the wall's half
            //     and 4 px), 1 for one it is near (12 px), added, and nothing unless the look reaches both. (R5) An end that lies IN the wall's stroke, within its
            //     half and a pixel, is always reached, whatever the door's middle does. Any other end is not reached where the wall passes the door's middle
            //     about as near as it passes that end (within the widest reach, and no more than a margin farther: half the way from that end to the middle,
            //     12 px at the most). (R5) A door has two ends unless they lie within the lesser of 12 px and half the door's own length of each other.
            //     (2) a wall that is not ASIDE: aside is beside the door (it reaches neither end and passes both ends and the middle at about one distance) or
            //     past its middle clear of both ends, (R5) unless the door LIES over it: its two ends and its middle all within the wall's half plus the door's.
            //     (3) a wall that runs the door's way, a cosine of 0.86 or more. (4) a wall the door touches (half of each line and 4 px). (5) a wall whose own
            //     first or last point lies at one of the door's ends. (6) the nearer. (7) the first in the list.
            //     THE WIDTH. (R5) Each line is read AS DRAWN where they meet: a stretch 20 px long or more by its own direction, a shorter one by its run (the
            //     door's around its stretch, the wall's the run that counted). A stroke (the round and the square nib): as thick as the wall IS drawn there. A
            //     ribbon (the flat nib): as thick as the wall's nib draws along the DOOR's direction, with the flat nib where the door's own box needs a nib no
            //     more than twice and no less than half as wide and the ribbon is a pixel thick or more, else with the square nib at the ribbon's thickness, a
            //     pixel at the least.
            //     A RUN READ OVER EXACTLY 20 PX. Whether a run was read over 20 px of line is asked of a sum of lengths. Where the line is long enough a half run
            //     is read over the whole 20 px, and the sum of a stretch and the small lengths before it may come out a hair under 20 (19.999999999999996) on a
            //     line drawn by hand. This reading KEEPS such a run (within a billionth of 20 px), which is what the rule says: read over half a run of line.
            //     Asked with edge 'sum' it takes the sum as it comes out, stretch by stretch, and leaves out a run whose sum is under 20 by any amount. So that
            //     the two can be told apart, a length here is the root of the sum of the squares and the lengths are added in the order the line is walked.
            //     A figure whose answer differs between the two askings hangs on the last bit of a sum, and the sweep below does not judge it
            const r4Board = w => { const sc = r3Scale(w), cx = w.x + w.w / 2, cy = w.y + w.h / 2; return w.pts.map(p => { const q = [w.x + p[0] * sc[0], w.y + p[1] * sc[1]]; if (!w.rot) return q; const t = r3Turn([q[0] - cx, q[1] - cy], w.rot); return [cx + t[0], cy + t[1]]; }); };   // a line's points on the board: its own box stretched to the piece's, and turned about its middle
            const r4Legs = w => { const p = r4Board(w), out = []; for (let i = 1; i < p.length; i++) if (p[i][0] !== p[i - 1][0] || p[i][1] !== p[i - 1][1]) out.push([p[i - 1], p[i]]); return out; };   // its stretches, each from one point to the next
            const r4Len = s => Math.sqrt((s[1][0] - s[0][0]) * (s[1][0] - s[0][0]) + (s[1][1] - s[0][1]) * (s[1][1] - s[0][1])), r4Way = s => [s[1][0] - s[0][0], s[1][1] - s[0][1]], r4Far = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
            const r4Turns = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);   // which side of the line from a to b the point c lies on
            const r4Gap = (s, t) => (r4Turns(s[0], s[1], t[0]) * r4Turns(s[0], s[1], t[1]) < 0 && r4Turns(t[0], t[1], s[0]) * r4Turns(t[0], t[1], s[1]) < 0 ? 0 : Math.min(ptLine(s[0], t[0], t[1]), ptLine(s[1], t[0], t[1]), ptLine(t[0], s[0], s[1]), ptLine(t[1], s[0], s[1])));   // the gap between two stretches: none where they cross
            const r4Off = (p, legs) => Math.min.apply(null, legs.map(s => ptLine(p, s[0], s[1])));   // how far a point lies from a line
            const r4Walk = (legs, k, way, left) => {   // the point a line reaches `left` px of line before its stretch k (way -1) or after it (way 1), and how much line that was: it stops where the line ends
                let at = way < 0 ? legs[k][0] : legs[k][1], went = 0;
                for (let i = k + way; left > 0 && legs[i]; i += way) {
                    const to = way < 0 ? legs[i][0] : legs[i][1], len = r4Len(legs[i]);
                    if (len > left) return { at: [at[0] + (to[0] - at[0]) * left / len, at[1] + (to[1] - at[1]) * left / len], went: went + left };
                    left -= len; went += len; at = to;
                }
                return { at, went };
            };
            const r5Run = (legs, k, side, span) => {   // (R5: over a span) the way a line runs at its stretch k, and how much line that was read over
                const own = r4Len(legs[k]), more = span - own;
                if (!(more > 0)) return { way: r4Way(legs[k]), over: own, span };
                const p = side === 1 ? { at: legs[k][0], went: 0 } : r4Walk(legs, k, -1, side === -1 ? more : more / 2), q = side === -1 ? { at: legs[k][1], went: 0 } : r4Walk(legs, k, 1, side === 1 ? more : more / 2);
                const way = [q.at[0] - p.at[0], q.at[1] - p.at[1]];
                return { way: way[0] || way[1] ? way : r4Way(legs[k]), over: own + p.went + q.went, span };
            };
            const r4Alike = (a, b) => { const la = Math.hypot(a[0], a[1]), lb = Math.hypot(b[0], b[1]); return la > 0 && lb > 0 ? Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1]) / (la * lb)) : 0; };   // how alike two runs are: 1 for the same way, 0 for across
            const r5Runs = (legs, j, edge) => {   // (R5) the runs of a wall at its stretch j that may speak for it. edge 'sum': a run counts only where its sum of lengths is 20 or more as it comes out. Otherwise within a billionth, as the rule has it
                const four = [r5Run(legs, j, -1, 40), r5Run(legs, j, 1, 40), r5Run(legs, j, -1, 20), r5Run(legs, j, 1, 20)];
                const long = four.filter(r => r.over >= (edge === 'sum' ? 20 : 20 - 1e-9));
                return long.length ? long : [r5Run(legs, j, 0, 40)];
            };
            const r5Most = (doorWay, runs) => runs.reduce((best, r) => { const alike = r4Alike(doorWay, r.way); return !best || alike > best.alike + 1e-12 ? { way: r.way, alike, span: r.span } : best; }, null);   // (R5) of those runs the one most like the door's, the EARLIEST where two are as alike (to a trillionth: two runs that mirror each other about the door's way tie exactly, whatever the last bit of a sum says)
            const r5Draw = (legs, k, run) => (r4Len(legs[k]) >= 20 ? r4Way(legs[k]) : run);   // (R5) the way a line is DRAWN at its stretch k: a stretch of 20 px or more by its own direction, a shorter one by the run handed in
            const r4Thou = n => Math.round(n * 1000) / 1000;
            const r4Seen = w => { const sc = r3Scale(w); return JSON.stringify([String(w.color).toLowerCase(), r4Thou(r3Wide(w)), r4Thou(r3Solid(w)), r3Nib(w), r4Thou(sc[0]), r4Thou(sc[1])]); };   // walls of one look are DRAWN alike: the colour whatever its case, each number to a thousandth
            function r5Judge(door, pieces, note, edge) {   // the wall lines a door meets, each with its ranks, and the one that answers (win: null where none meets it). note, where one is handed in, is told the least margin by which any bound of the rule was met or missed (edge). edge: see the heading, 'sum' for the sweep's second asking
                const D = r4Legs(door), A = D[0][0], B = D[D.length - 1][1], total = D.reduce((n, s) => n + r4Len(s), 0), found = [], looks = {};
                let least = Infinity; const by = (a, b) => { const d = Math.abs(a - b); if (d < least) least = d; };
                let M = A, gone = 0;   // the door's middle: half its length along its stretches
                for (const s of D) { const l = r4Len(s); if (gone + l >= total / 2) { const t = l > 0 ? (total / 2 - gone) / l : 0; M = [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t]; break; } gone += l; }
                const apart = Math.min(12, total / 2), two = r4Far(A, B) > apart, ga = Math.min(r4Far(A, M) / 2, 12), gb = Math.min(r4Far(B, M) / 2, 12);   // (R5: apart) a ring has no two ends, a short straight door has
                const xs = [].concat.apply([], D.map(s => [s[0][0], s[1][0]])), ys = [].concat.apply([], D.map(s => [s[0][1], s[1][1]])), box = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
                const widest = w => Math.min(100, r3Wide(w) * Math.max.apply(null, r3Scale(w)) / 2), half = (w, way) => Math.min(100, penThick(w, way) / 2);   // half a line's drawn width: at the most whichever way it runs, and along a run. Held to 100 px
                pieces.forEach(W => {
                    if (W === door || !wallLineOn(W) || W.hidden) return;
                    const L = r4Legs(W), R = 12 + widest(door) + widest(W), pairs = []; let near = Infinity;
                    L.forEach((s, j) => D.forEach((d, k) => { const g = r4Gap(d, s); if (g <= R) { pairs.push({ g, k, j }); if (g < near) near = g; } }));
                    if (!pairs.length) return;
                    let say = null;   // (R5) the pair of stretches that speaks for this wall: of those within 4 px of its nearest gap, the two runs most alike, then the nearer, then the door's earliest stretch
                    pairs.forEach(p => {
                        by(p.g, near + 4); if (!(p.g <= near + 4)) return;
                        const most = r5Most(r5Run(D, p.k, 0, 40).way, r5Runs(L, p.j, edge));
                        if (!say || most.alike > say.alike + 1e-9 || (Math.abs(most.alike - say.alike) <= 1e-9 && (p.g < say.g || (p.g === say.g && p.k < say.k)))) say = { alike: most.alike, way: most.way, span: most.span, g: p.g, k: p.k, j: p.j };
                    });
                    const runD = r5Run(D, say.k, 0, 40).way, runW = say.way, hd = half(door, runD), hw = half(W, runW);
                    by(near, hd + hw + 12);
                    if (!(near <= hd + hw + 12)) return;   // it does not meet the door
                    const read = L.filter(s => !(Math.max(s[0][0], s[1][0]) + R < box[0] || Math.min(s[0][0], s[1][0]) - R > box[2] || Math.max(s[0][1], s[1][1]) + R < box[1] || Math.min(s[0][1], s[1][1]) - R > box[3]));   // the stretches of the wall within the widest reach of the door's own box: the ends are judged from those
                    const e0 = r4Off(A, read), e1 = r4Off(B, read), em = r4Off(M, read);
                    const in0 = e0 <= hw + 1, in1 = e1 <= hw + 1;   // (R5) an end IN the wall's stroke is reached, whatever the middle does
                    const lies = e0 <= hw + hd && e1 <= hw + hd && em <= hw + hd;   // (R5) the two strokes overlap at the door's two ends and at its middle: the door was drawn over this wall
                    const past = two && em <= R;
                    const out0 = past && !in0 && em < e0 + ga, out1 = past && !in1 && em < e1 + gb;
                    const off = (out0 && out1 && e0 < em + ga && e1 < em + gb) || (past && e0 >= em + ga && e1 >= em + gb), aside = !lies && off;   // beside the door, or across its middle: aside, but for a door that lies over the wall
                    const look = r4Seen(W), reach = looks[look] || (looks[look] = [0, 0]), s0 = out0 ? 0 : e0 <= hw + 4 ? 2 : e0 <= hw + 12 ? 1 : 0, s1 = out1 ? 0 : e1 <= hw + 4 ? 2 : e1 <= hw + 12 ? 1 : 0;
                    reach[0] = Math.max(reach[0], s0); reach[1] = Math.max(reach[1], s1);
                    const Wa = L[0][0], Wz = L[L.length - 1][1], endsAt = Math.min(r4Far(Wa, A), r4Far(Wa, B), r4Far(Wz, A), r4Far(Wz, B)) <= hw + 12;
                    by(near, hd + hw + 4); by(say.alike, 0.86); by(em, R); by(em, e0 + ga); by(em, e1 + gb); by(e0, em + ga); by(e1, em + gb); by(Math.min(r4Far(Wa, A), r4Far(Wa, B), r4Far(Wz, A), r4Far(Wz, B)), hw + 12);
                    [e0, e1].forEach(e => { by(e, hw + 1); by(e, hw + 4); by(e, hw + 12); }); [e0, e1, em].forEach(e => { by(e, hw + hd); });
                    by(r4Len(D[say.k]), 20); by(r4Len(L[say.j]), 20);
                    const drawD = r5Draw(D, say.k, runD), drawW = r5Draw(L, say.j, runW);
                    found.push({ W, look, aside, lies, along: say.alike >= 0.86, touch: near <= hd + hw + 4, endsAt, near, runD, runW, drawD, drawW, ends: [s0, s1], pair: [say.k, say.j],
                        r5: { endIn: past && !(in0 && in1 && em <= hw + 1) && ((in0 && em < e0 + ga) || (in1 && em < e1 + gb)), kept: lies && off, half: say.span === 20, far: say.g * say.g > near * near + 1, short: two && r4Far(A, B) <= 12, own: r4Alike(drawD, runD) < 1 - 1e-9 || r4Alike(drawW, runW) < 1 - 1e-9 } });   // (r5: where one of round five's own rules shows in this wall's judging, for the sweep's counts. endIn: an end in the stroke that round four would not have counted, the wall passing the middle about as near and the door not wholly in the stroke. kept: beside the door or across it, yet not aside. half: the run that counted was read over 20 px. far: the pair that speaks lies more than a squared pixel past the nearest. short: two ends no more than 12 px apart. own: a stretch drawn another way than its run)
                });
                let win = null;
                found.forEach(f => {
                    const r = looks[f.look]; f.rank = [two && r[0] && r[1] ? r[0] + r[1] : 0, f.aside ? 0 : 1, f.along ? 1 : 0, f.touch ? 1 : 0, f.endsAt ? 1 : 0];
                    if (!win) { win = f; return; }
                    const i = f.rank.findIndex((v, n) => v !== win.rank[n]);
                    if (i >= 0 ? f.rank[i] > win.rank[i] : f.near < win.near) win = f;
                });
                by(r4Far(A, B), apart);
                if (note) note.edge = Math.min(note.edge === undefined ? Infinity : note.edge, least);
                return { found, win, two };
            }
            const r4Clear = c => typeof c === 'string' && (/^transparent$/i.test(c) || /^#(?:[0-9a-f]{3}0|[0-9a-f]{6}00)$/i.test(c));   // a line's colour that draws nothing, as this suite's layouts spell one: the word, or a hex colour whose last part is 0
            function r5Look(door, f, note) {   // the look Match is to answer for the wall that wins, and how thick the door's copy is then drawn where they meet (thick). note: as for r5Judge
                const W = f.W, nib = r3Nib(W), color = r4Clear(W.color) ? 'transparent' : /^#[0-9a-f]{6}$/i.test(String(W.color)) ? String(W.color).toLowerCase() : null;
                let tip = nib, thick, width;
                if (nib !== 'flat') { thick = penThick(W, f.drawW); width = thick / penThick(door, f.drawD, 1, nib); }   // (R5: each as drawn where they meet)
                else {
                    thick = penThick(W, f.drawD);
                    const perW = penThick(W, f.drawD, 1, 'flat'), perD = penThick(door, f.drawD, 1, 'flat'), needs = perD > 1e-9 ? perW / perD : Infinity;   // how many times as wide a nib the door's own box needs for that ribbon
                    if (note) note.edge = Math.min(note.edge === undefined ? Infinity : note.edge, Math.abs(thick - 1), Math.abs(needs - 2), Math.abs(needs - 0.5));
                    if (thick < 1 || needs > 2 + 1e-9 || needs < 0.5 - 1e-9) { tip = 'square'; thick = Math.max(thick, 1); width = thick / penThick(door, f.drawD, 1, 'square'); }
                    else width = r3Wide(W) * needs;
                }
                return { color, width: Math.min(width, 1e15), opacity: r3Solid(W), tip, thick };
            }
            // ROUND FOUR's reading, kept as this suite had it (r4Judge and r4Look, less their notes). It says what round four answered, so that each layout below that
            //     claims a flip of round five is held to it, and the sweep can count the figures whose answer round five changed. Round four read a run over 40 px
            //     alone and took the more alike of the two side runs, let only the pairs within one squared pixel of the nearest speak, counted an end in the stroke
            //     only where the door's two ends AND its middle lay in it, called every wall beside the door aside, gave a door two ends only where they lay more than
            //     12 px apart, and read every width along a run
            const r4Run = (legs, k, side) => r5Run(legs, k, side, 40);
            const r4WallRun = (doorWay, legs, j) => {   // the run of a wall at its stretch j that counted for a door's run
                const a = r4Run(legs, j, -1), b = r4Run(legs, j, 1), ca = r4Alike(doorWay, a.way), cb = r4Alike(doorWay, b.way);
                if (a.over >= 20 && b.over >= 20) return cb > ca + 1e-12 ? { way: b.way, alike: cb } : { way: a.way, alike: ca };   // (the run that ends with the stretch at a tie, to a trillionth)
                if (a.over >= 20) return { way: a.way, alike: ca };
                if (b.over >= 20) return { way: b.way, alike: cb };
                const r = r4Run(legs, j, 0); return { way: r.way, alike: r4Alike(doorWay, r.way) };
            };
            function r4Judge(door, pieces) {
                const D = r4Legs(door), A = D[0][0], B = D[D.length - 1][1], total = D.reduce((n, s) => n + r4Len(s), 0), found = [], looks = {};
                let M = A, gone = 0;
                for (const s of D) { const l = r4Len(s); if (gone + l >= total / 2) { const t = l > 0 ? (total / 2 - gone) / l : 0; M = [s[0][0] + (s[1][0] - s[0][0]) * t, s[0][1] + (s[1][1] - s[0][1]) * t]; break; } gone += l; }
                const two = r4Far(A, B) > 12, ga = Math.min(r4Far(A, M) / 2, 12), gb = Math.min(r4Far(B, M) / 2, 12);
                const xs = [].concat.apply([], D.map(s => [s[0][0], s[1][0]])), ys = [].concat.apply([], D.map(s => [s[0][1], s[1][1]])), box = [Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys)];
                const widest = w => Math.min(100, r3Wide(w) * Math.max.apply(null, r3Scale(w)) / 2), half = (w, way) => Math.min(100, penThick(w, way) / 2);
                pieces.forEach(W => {
                    if (W === door || !wallLineOn(W) || W.hidden) return;
                    const L = r4Legs(W), R = 12 + widest(door) + widest(W), pairs = []; let near = Infinity;
                    L.forEach((s, j) => D.forEach((d, k) => { const g = r4Gap(d, s); if (g <= R) { pairs.push({ g, k, j }); if (g < near) near = g; } }));
                    if (!pairs.length) return;
                    let say = null;
                    pairs.filter(p => p.g * p.g <= near * near + 1).forEach(p => { const alike = r4WallRun(r4Run(D, p.k, 0).way, L, p.j).alike; if (!say || alike > say.alike + 1e-9 || (Math.abs(alike - say.alike) <= 1e-9 && (p.g < say.g || (p.g === say.g && p.k < say.k)))) say = { alike, g: p.g, k: p.k, j: p.j }; });
                    const runD = r4Run(D, say.k, 0).way, runW = r4WallRun(runD, L, say.j).way, hd = half(door, runD), hw = half(W, runW);
                    if (!(near <= hd + hw + 12)) return;
                    const read = L.filter(s => !(Math.max(s[0][0], s[1][0]) + R < box[0] || Math.min(s[0][0], s[1][0]) - R > box[2] || Math.max(s[0][1], s[1][1]) + R < box[1] || Math.min(s[0][1], s[1][1]) - R > box[3]));
                    const e0 = r4Off(A, read), e1 = r4Off(B, read), em = r4Off(M, read);
                    const on = e0 <= hw + 1 && e1 <= hw + 1 && em <= hw + 1, past = two && !on && em <= R;
                    const out0 = past && em < e0 + ga, out1 = past && em < e1 + gb;
                    const aside = (out0 && out1 && e0 < em + ga && e1 < em + gb) || (past && e0 >= em + ga && e1 >= em + gb);
                    const look = r4Seen(W), reach = looks[look] || (looks[look] = [0, 0]), s0 = out0 ? 0 : e0 <= hw + 4 ? 2 : e0 <= hw + 12 ? 1 : 0, s1 = out1 ? 0 : e1 <= hw + 4 ? 2 : e1 <= hw + 12 ? 1 : 0;
                    reach[0] = Math.max(reach[0], s0); reach[1] = Math.max(reach[1], s1);
                    const Wa = L[0][0], Wz = L[L.length - 1][1], endsAt = Math.min(r4Far(Wa, A), r4Far(Wa, B), r4Far(Wz, A), r4Far(Wz, B)) <= hw + 12;
                    found.push({ W, look, aside, along: say.alike >= 0.86, touch: near <= hd + hw + 4, endsAt, near, runD, runW });
                });
                let win = null;
                found.forEach(f => {
                    const r = looks[f.look]; f.rank = [two && r[0] && r[1] ? r[0] + r[1] : 0, f.aside ? 0 : 1, f.along ? 1 : 0, f.touch ? 1 : 0, f.endsAt ? 1 : 0];
                    if (!win) { win = f; return; }
                    const i = f.rank.findIndex((v, n) => v !== win.rank[n]);
                    if (i >= 0 ? f.rank[i] > win.rank[i] : f.near < win.near) win = f;
                });
                return { found, win };
            }
            function r4Look(door, f) {
                const W = f.W, nib = r3Nib(W), color = r4Clear(W.color) ? 'transparent' : /^#[0-9a-f]{6}$/i.test(String(W.color)) ? String(W.color).toLowerCase() : null;
                let tip = nib, thick, width;
                if (nib !== 'flat') { thick = penThick(W, f.runW); width = thick / penThick(door, f.runD, 1, nib); }
                else {
                    thick = penThick(W, f.runD);
                    const perW = penThick(W, f.runD, 1, 'flat'), perD = penThick(door, f.runD, 1, 'flat'), needs = perD > 1e-9 ? perW / perD : Infinity;
                    if (thick < 1 || needs > 2 + 1e-9 || needs < 0.5 - 1e-9) { tip = 'square'; thick = Math.max(thick, 1); width = thick / penThick(door, f.runD, 1, 'square'); }
                    else width = r3Wide(W) * needs;
                }
                return { color, width: Math.min(width, 1e15), opacity: r3Solid(W), tip, thick };
            }
            const r5Other = (a, b) => !a !== !b || (!!a && (a.color !== b.color || a.opacity !== b.opacity || a.tip !== b.tip || !r3Close(a.width, b.width)));   // two looks, or a look and none, that are not one answer
            const r5Drawn = (door, wide, nib) => { const D = r4Legs(door), t = D.map((s, k) => penThick(door, r5Draw(D, k, r5Run(D, k, 0, 40).way), wide, nib)); return [Math.min.apply(null, t), Math.max.apply(null, t)]; };   // (R5: each stretch as drawn) the thinnest and the thickest a door's copy is drawn over its own stretches, at that width with that nib
            // 8e. a door made as each of the GM's nine wall lines is made, laid end to end with it and matched to it: whatever the wall holds on the host, the two leave alike
            await resetWorld(); await level();
            const TWINNED = LINED_WALLS.filter(id => !tokH(id).byPlayer), nibOther = { round: 'square', square: 'flat', flat: 'round' };
            const twinDoors = TWINNED.map(id => { const wall = tokH(id), d = clone(wall); SECRET_KEYS.concat(['name']).forEach(k => { delete d[k]; }); return Object.assign(d, { id: 'twin_' + id, x: wall.x + wall.w, sightType: 'door', doorOpen: false, secret: true, color: '#c3b2a4', strokeWidth: 17, opacity: 0.33, tip: nibOther[LINED[id].wire.tip] }); });
            twinDoors.forEach(d => { wbH().push(d); });
            const twinHits = twinDoors.map(d => FC.secretMatch(d, wbH())), twinAlone = twinDoors.map((d, i) => FC.secretMatch(d, [tokH(TWINNED[i])]));
            const twinReach = [].concat.apply([], twinDoors.map((d, i) => wbH().filter(w => wallLineOn(w) && w.id !== TWINNED[i] && gapOf(d, w) <= 12 + 17 / 2 + Math.min(100, r3Wide(w) / 2)).map(w => [d.id, w.id])));   // round three: the other wall lines of the map that a door could meet, by this suite's own measure (12 px, half the door's 17 and half the wall's width, held to 100): none
            twinDoors.forEach((d, i) => { const hit = twinHits[i]; if (!hit) return; const c = FC.cleanSeenColor(hit.color), sw = FC.cleanSeenWidth(hit.width), so = FC.cleanSeenOpacity(hit.opacity), st = FC.cleanSeenTip(hit.tip); if (sw !== null) d.seenWidth = sw; if (so !== null) d.seenOpacity = so; if (st !== null) d.seenTip = st; if (c) d.seenColor = c; });   // as Properties' Match press sets them: each through its cleaner, the door's own look left alone
            await level(); const mapT = await wholeNow();
            const hitsOff = TWINNED.map((id, i) => { const wire = LINED[id].wire, hit = twinHits[i]; return !hit || hit.width !== wire.strokeWidth || hit.opacity !== (hasOwn(wire, 'opacity') ? wire.opacity : 1) || hit.tip !== wire.tip || hit.color !== String(tokH(id).color).toLowerCase() || JSON.stringify(twinAlone[i]) !== JSON.stringify(hit) ? [id, hit, twinAlone[i]] : null; }).filter(Boolean);
            const twinsOffT = TWINNED.map(id => [id, mapT ? twinOff(pieceIn(mapT, 'twin_' + id), pieceIn(mapT, id)) : { missing: ['the copy'] }]).filter(p => p[1]);
            const ownSent = mapT ? twinDoors.filter(d => { const w = pieceIn(mapT, d.id); return !w || w.strokeWidth === 17 || w.opacity === 0.33 || w.color === '#c3b2a4' || !bareOfSecret(w); }).map(d => d.id) : ['no copy'];
            check('host (Match a wall): a secret door made as each of the GM\'s nine wall lines is made, laid end to end with it, 17 wide at 0.33 with another nib and in another colour, and matched to it as Properties\' Match press does: fogcore secretMatch asked with the map\'s own pieces, each key through its cleaner. Whatever the wall holds on the host (a width that is a number, the text 5, the text 7.5px, the text 1e16, a word or 0, an opacity under 1, of 1, past 1, below 0, as text or as a word, a nib, none or one the app does not know), fogcore reads the very look the host sends that wall with, the same asked with that wall alone (round three: no other wall line of the map stands within reach of a door, by this suite\'s own measure of 12 px and half of each width, a half held to 100 px, and the wall whose width is the text 1e16 reaches as far as that), and in a whole copy of the map each door\'s copy and its wall differ by id and place alone. No copy holds the door\'s own colour, width or opacity',
                TWINNED.length === 9 && twinDoors.every(d => FC.secretOn(d) === true) && twinReach.length === 0 && hitsOff.length === 0 && twinsOffT.length === 0 && ownSent.length === 0 && !!mapT && oddWalls(mapT).length === 0, { hitsOff, twinsOffT: twinsOffT.slice(0, 3), ownSent });

            // 8f. round two, the width as drawn. The board draws a pen line in its own box (baseW by baseH) stretched to the piece's box (w by h), and its stroke with
            //     it. drawnOf is this suite's own reading of how thick a LEVEL line is drawn: its stored width times how much taller its box was made. Round three:
            //     that is so for a stroke, the round and the square nib. The FLAT nib is a ribbon laid along the diagonal of the line's own box, and a level ribbon is
            //     the root of a half as thick as its width times how much taller its box was made. So each pair is laid twice, with the flat nib and with the round
            //     one, and each is also held to penThick, the reading in vectors above. Each pair is matched as Properties' Match press does (fogcore secretMatch
            //     asked with the map's own pieces, each key through its cleaner) and then sent.
            //     ROUND FOUR FLIPS TWO OF THE SIX. A flat-nibbed copy stays flat only where the door's own box needs a nib no more than twice and no less than half
            //     as wide as its wall's. A wall resized to twice its size beside a door never resized needs exactly twice: flat, 12, as before. A door resized to
            //     three times its size needs a third (round three answered flat and 2): the copy now takes the SQUARE nib, 6 times the root of a half over 3 stored,
            //     which its tripled box draws as thick as the wall's ribbon. A wall made three times as tall needs three times (round three answered flat and 12):
            //     the SQUARE nib, 12 times the root of a half. So on the wire those two copies differ from their walls by nib too. The three round pairs are as
            //     they were. The suite's own reading of the width rule (r5Look) is asked for each pair, and must name the nib and the width the core answers
            await resetWorld(); await level();
            const lvl = (id, x, y, o) => Object.assign({ id, type: 'path', blocksSight: true, sightType: 'wall', pts: [[0, 0], [60, 0]], x, y, w: 60, h: 1, baseW: 60, baseH: 1 }, o);
            const sDoor = { sightType: 'door', doorOpen: false, secret: true, color: '#c3b2a7', strokeWidth: 9, opacity: 0.45, tip: 'round' };
            const drawnOf = w => (w && typeof w.strokeWidth === 'number' && w.baseH > 0 ? w.strokeWidth * w.h / w.baseH * (w.tip === 'flat' ? Math.SQRT1_2 : 1) : NaN), near = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-9;
            const SIZED = [
                { wall: lvl('wall_big', 1700, 100, { color: '#5b5662', strokeWidth: 6, tip: 'flat', w: 120, h: 2 }), door: lvl('door_by', 1820, 100, sDoor), tip: 'flat', width: 12, drawn: 12 * Math.SQRT1_2, differ: ['h', 'strokeWidth', 'w'] },   // a wall line resized to twice its size, a door never resized: the door's box needs a nib exactly twice as wide, which is still the flat nib
                { wall: lvl('wall_sm', 1700, 200, { color: '#5b5663', strokeWidth: 6, tip: 'flat' }), door: lvl('door_big', 1760, 200, Object.assign({}, sDoor, { w: 180, h: 3 })), tip: 'square', width: 6 * Math.SQRT1_2 / 3, drawn: 6 * Math.SQRT1_2, differ: ['h', 'strokeWidth', 'tip', 'w'], was: 'flat and 2' },   // a door resized to three times its size, a wall never resized: a nib a third as wide (FLIPPED by round four: the square nib at the ribbon's thickness)
                { wall: lvl('wall_tall', 1700, 300, { color: '#5b5664', strokeWidth: 4, tip: 'flat', h: 3 }), door: lvl('door_tall', 1760, 300, sDoor), tip: 'square', width: 12 * Math.SQRT1_2, drawn: 12 * Math.SQRT1_2, differ: ['h', 'strokeWidth', 'tip'], was: 'flat and 12' },   // a wall whose box was made three times as tall alone: a nib three times as wide (FLIPPED by round four: the square nib at the ribbon's thickness)
                // round three: the same three with the round nib, a stroke. Drawn 12, 6 and 12 px thick, as round two had it for every nib
                { wall: lvl('wall_big_r', 1700, 400, { color: '#5b566a', strokeWidth: 6, tip: 'round', w: 120, h: 2 }), door: lvl('door_by_r', 1820, 400, sDoor), tip: 'round', width: 12, drawn: 12, differ: ['h', 'strokeWidth', 'w'] },
                { wall: lvl('wall_sm_r', 1700, 500, { color: '#5b566b', strokeWidth: 6, tip: 'round' }), door: lvl('door_big_r', 1760, 500, Object.assign({}, sDoor, { w: 180, h: 3 })), tip: 'round', width: 2, drawn: 6, differ: ['h', 'strokeWidth', 'w'] },
                { wall: lvl('wall_tall_r', 1700, 600, { color: '#5b566c', strokeWidth: 4, tip: 'round', h: 3 }), door: lvl('door_tall_r', 1760, 600, sDoor), tip: 'round', width: 12, drawn: 12, differ: ['h', 'strokeWidth'] }
            ];
            SIZED.forEach(p => { wbH().push(p.wall, p.door); });
            SIZED.forEach(p => { const hit = FC.secretMatch(p.door, wbH()); p.hit = hit; if (!hit || hit.over) return; const c = FC.cleanSeenColor(hit.color), sw = FC.cleanSeenWidth(hit.width), so = FC.cleanSeenOpacity(hit.opacity), st = FC.cleanSeenTip(hit.tip); if (sw !== null) p.door.seenWidth = sw; if (so !== null) p.door.seenOpacity = so; if (st !== null) p.door.seenTip = st; if (c) p.door.seenColor = c; });
            await level(); const mapS = await wholeNow();
            const sizedOff = SIZED.map(p => {   // what is not as told of a pair, first in the detail
                const cw = mapS ? pieceIn(mapS, p.wall.id) : null, cd = mapS ? pieceIn(mapS, p.door.id) : null, bad = [], kept = p.tip === p.wall.tip, alike = kept ? near : r3Close;   // (kept: the copy wears its wall's nib, and the numbers are exact. Where it takes the square nib the core's root of a half, 0.70711, is in them)
                if (!p.hit || p.hit.tip !== p.tip || !alike(p.hit.width, p.width)) bad.push(['the width and nib Match answers', p.hit ? [p.hit.width, p.hit.tip] : 'no wall']);
                { const J = r5Judge(p.door, [p.wall, p.door]), look = J.win ? r5Look(p.door, J.win) : null; if (!look || look.tip !== p.tip || !r3Close(look.width, p.width) || !r3Close(look.thick, p.drawn) || !p.hit || p.hit.tip !== look.tip || !r3Close(p.hit.width, look.width)) bad.push(['this suite\'s own reading of the rule', look && [look.width, look.tip, look.thick]]); }
                if (!cw || !cd) { bad.push('not sent'); return [p.door.id, bad]; }
                if (!alike(cd.strokeWidth, p.width) || cw.strokeWidth !== p.wall.strokeWidth) bad.push(['the stored widths sent', cd.strokeWidth, cw.strokeWidth]);
                if (!alike(drawnOf(cd), p.drawn) || !near(drawnOf(cw), p.drawn)) bad.push(['drawn', drawnOf(cd), drawnOf(cw)]);
                if (!r3Close(penThick(cd, [1, 0]), p.drawn) || !r3Close(penThick(cw, [1, 0]), p.drawn)) bad.push(['drawn, by the reading in vectors', penThick(cd, [1, 0]), penThick(cw, [1, 0])]);
                { const sd = typeof FC.seenDrawn === 'function' ? FC.seenDrawn(p.door) : 'no such function'; if (!Array.isArray(sd) || sd.length !== 2 || !r3Close(sd[0], p.drawn) || !r3Close(sd[1], p.drawn)) bad.push(['fogcore seenDrawn', sd]); }   // round three: the thinnest and the thickest over the door's own runs, with the nib its copy wears. One figure twice for a straight door
                const off = twinOff(cd, cw); if (!off || !off.differ || off.onlyCopy.length || off.onlyWall.length || JSON.stringify(off.differ.map(d => d[0]).sort()) !== JSON.stringify(p.differ)) bad.push(['how the two differ', off]);
                if (cd.color !== p.wall.color || cd.tip !== p.tip || cw.tip !== p.wall.tip || hasOwn(cd, 'opacity') || !bareOfSecret(cd) || cd.w !== p.door.w || cd.h !== p.door.h || cd.sightType !== 'wall') bad.push(['the copy', lookSent(cd)]);
                return bad.length ? [p.door.id, bad] : null;
            }).filter(Boolean);
            check('host (Match a wall, round two): the width is matched AS DRAWN. The board stretches a pen line\'s box and its stroke with it, so a resized line is drawn thicker or thinner than its stored width. With the round nib: a wall line resized to twice its size (6 stored, 12 drawn) beside a door never resized, where fogcore secretMatch answers 12 and the door\'s copy leaves 12 wide where its wall leaves 6 wide in its doubled box. A door resized to three times its size beside a wall never resized, 6 wide, where the answer is 2 and the copy leaves 2 wide in the door\'s tripled box. A wall whose box was made three times as tall alone (4 stored), where the answer is 12. Each is also laid with the flat nib, which is a ribbon, and ROUND FOUR FLIPS TWO of those three: a copy stays flat only where the door\'s own box needs a nib no more than twice and no less than half as wide as its wall\'s. The doubled wall needs exactly twice, and its door still answers flat and 12. The tripled door needs a third (round three answered flat and 2) and the wall three times as tall needs three times (round three answered flat and 12): each copy now takes the SQUARE nib at the thickness of its wall\'s ribbon, about 1.41 stored in the tripled box and about 8.49 stored. By this suite\'s own reading of how thick a level line is drawn, its stored width times how much taller its box was made for a stroke, and the root of a half of that for the flat nib, each copy and its wall are drawn alike: 12, 6 and 12 px with the round nib, about 8.49, 4.24 and 8.49 px beside the flat walls. The reading in vectors (penThick) says the same, this suite\'s own reading of the width rule (r5Look) names each nib and width, and fogcore seenDrawn says that thickness for each door, twice, as the thinnest and the thickest of a straight door. On the wire a copy and its wall differ by id, place, box and stored width alone, and by nib where the copy took the square one: the same colour, no opacity, and none of the six keys or of the door\'s own look',
                SIZED.length === 6 && SIZED.filter(p => p.wall.tip === 'flat').length === 3 && SIZED.filter(p => p.wall.tip === 'round').length === 3 && SIZED.filter(p => p.tip === 'square' && !!p.was).length === 2 && SIZED.every(p => FC.secretOn(p.door) === true && FC.lineOf(p.door) === true) && sizedOff.length === 0 && !!mapS && oddWalls(mapS).length === 0 && !/#c3b2a7/i.test(JSON.stringify(mapS)), { sizedOff, hits: SIZED.map(p => p.hit) });

            // 8g. round two, a see-through wall's door under the GM's own edits (no probe is fired while the door stands in another look than the world's: each send is judged here)
            await resetWorld(); await level();
            const cD = () => tokH('door_clear'), clearIn = m => pieceIn(m, 'door_clear');
            const baseC = Object.assign({}, LINE_SEEN.door_clear); ['color'].concat(LINE_KEYS).forEach(k => { delete baseC[k]; });
            const wantC = look => Object.assign({}, baseC, look), gotC = list => list.map(s => [s.to, lookSent(clearIn(s.m))]);
            const allC = (list, want) => toBoth(list) && list.every(s => heldAs(clearIn(s.m), want) && keysInOrder(clearIn(s.m)) && !/"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip)":/.test(JSON.stringify(s.m)));
            const stepC = async change => { const n = sentLog.length; change(cD()); await level(); return carry(n); };
            const ownC = await stepC(d => { Object.assign(d, { color: '#0a0b0c', strokeWidth: 30, opacity: 0.3, tip: 'flat', locked: true, name: 'Hidden way', groupId: 'g_way', doorOpen: true }); });
            check('host (Match a wall, round two): the GM redrawing the door behind a see-through wall (a dark colour, 30 wide at 0.3 with the flat nib, a name, a group, open, locked in place) sends the table nothing of the map at the next save: the wall line the players hold there still draws nothing', ownC.length === 0 && cD().color === '#0a0b0c' && cD().locked === true && cD().seenColor === 'transparent', ownC.map(s => s.to + ':' + s.m.type));
            const toPen = await stepC(d => { d.seenColor = '#5B5661'; }), toClear = await stepC(d => { d.seenColor = 'transparent'; }), toWord = await stepC(d => { d.seenColor = 'TRANSPARENT'; });
            const toOwn = await stepC(d => { delete d.seenColor; d.color = 'rgba(0, 0, 0, 0)'; });
            check('host (Match a wall, round two): the colour seen is a six-digit hex colour or the word transparent, and nothing else. Named #5B5661, the door reaches both players at the next save as a wall line in #5b5661, 6 wide with the round nib and no opacity. Named transparent again, it reaches them as the wall line that draws nothing. Named TRANSPARENT, which is not the word, it names nothing: the door\'s own colour is dark now, so the wall line is in the Wall material\'s colour. With no colour named and the door\'s own colour made rgba(0, 0, 0, 0), the door draws nothing itself and its copy is clear again. No send holds the door\'s own width, opacity, nib, name, group or lock, or one of the six keys',
                allC(toPen, wantC({ color: '#5b5661', strokeWidth: 6, tip: 'round' })) && allC(toClear, LINE_SEEN.door_clear) && allC(toWord, wantC({ color: '#3f3b47', strokeWidth: 6, tip: 'round' })) && allC(toOwn, wantC({ color: 'transparent', strokeWidth: 6, tip: 'round' })) && cD().locked === true && cD().strokeWidth === 30,
                { toPen: gotC(toPen), toClear: gotC(toClear), toWord: gotC(toWord), toOwn: gotC(toOwn) });
            // a wall that draws nothing under another spelling than the word. Match answers the word, the one clear colour a secret door may be seen in. The wall itself
            // leaves as it is spelled, so on the wire the two differ by that spelling: a limit of a copy, held here so that it is not taken for a new leak
            await resetWorld(); await level();
            tokH('wall_clear').color = '#00000000'; await level();
            const hitSp = FC.secretMatch(cD(), wbH());
            if (hitSp && !hitSp.over) { const cS = FC.cleanSeenColor(hitSp.color); cD().seenWidth = FC.cleanSeenWidth(hitSp.width); cD().seenOpacity = FC.cleanSeenOpacity(hitSp.opacity); cD().seenTip = FC.cleanSeenTip(hitSp.tip); if (cS) cD().seenColor = cS; }
            await level(); const mapSp = await wholeNow(), offSp = mapSp ? twinOff(clearIn(mapSp), pieceIn(mapSp, 'wall_clear')) : { missing: ['the copy'] };
            check('host (Match a wall, round two): a wall line that draws nothing under another spelling than the word (#00000000) still gives a see-through door: fogcore secretMatch answers the colour transparent for it, and the door\'s copy leaves in that word. One limit is held as a limit: the wall itself leaves as it is spelled, so in a whole copy of the map the two differ by the spelling of a colour that draws nothing, and by nothing else',
                JSON.stringify(hitSp) === JSON.stringify({ color: 'transparent', width: 6, opacity: 1, tip: 'round' }) && cD().seenColor === 'transparent' && !!offSp && !!offSp.differ && offSp.onlyCopy.length === 0 && offSp.onlyWall.length === 0 && JSON.stringify(offSp.differ) === JSON.stringify([['color', 'transparent', '#00000000']]) && !!mapSp && secretLeak(mapSp) === '',
                { hitSp, offSp });
            // a secret door that is a BOX seen as nothing drawn: clear with no pattern named, and a pattern on a clear ground once one is named
            await resetWorld(); await level();
            const stepB = async change => { const n = sentLog.length; change(doorH()); await level(); return carry(n); };
            const boxClear = await stepB(d => { d.seenColor = 'transparent'; }), clearB = FC.secretLook(doorH()).clear, boxPat = await stepB(d => { d.seenTexture = 'stone'; }), clearP = FC.secretLook(doorH()).clear;
            const wantBoxClear = Object.assign({}, SECRET_SEEN, { color: 'transparent' }); delete wantBoxClear.texture;
            const allB = (list, want) => toBoth(list) && list.every(s => heldAs(doorIn(s.m), want) && keysInOrder(doorIn(s.m)) && !/"(secret|seenColor|seenTexture|seenWidth|seenOpacity|seenTip|locked)":/.test(JSON.stringify(doorIn(s.m))));
            check('host (Match a wall, round two): the word transparent may be named for a secret door that is a box too. With no pattern named, the box reaches both players at the next save as a wall that draws nothing: the colour transparent and NO pattern, where a hex colour would wear the Wall material\'s bricks. With the pattern stone named beside it, it reaches them as that pattern on a clear ground. fogcore secretLook calls the first clear and the second not, which is what Properties tells the GM. Neither send holds the door\'s own colour, pattern, picture, name, group or lock',
                allB(boxClear, wantBoxClear) && boxClear.every(s => !hasOwn(doorIn(s.m), 'texture')) && allB(boxPat, Object.assign({}, SECRET_SEEN, { color: 'transparent', texture: 'stone' })) && clearB === true && clearP === false && doorH().locked === true && doorH().seenColor === 'transparent',
                { boxClear: boxClear.map(s => [s.to, doorIn(s.m)]), boxPat: boxPat.map(s => [s.to, doorIn(s.m)]) });
            // round five: a colour that draws NOTHING is read as the board's own rule reads the very text. A secret door of each kind that is no line, in each of eighteen colours, with
            // nothing named for it, is sent in a whole copy of the map. COLOURS5: [id, the text, whether the board's colour rule TAKES it, whether it is a CLEAR FORM]. Both verdicts were
            // worked out by hand. The board's rule takes a hex colour of 3 to 8 digits, rgb / rgba / hsl / hsla in lower case with digits, dots, commas, blanks and per cent signs between
            // its brackets, a word of 1 to 20 letters, or var(--name), and nothing longer than 40 characters. The clear forms are the word transparent in any case, a hex colour of 4 or 8
            // digits whose alpha is 0, and an rgba or hsla of FOUR parts whose last is 0.
            // A text the rule TAKES is clear only as a clear form, on every kind of piece. A text it REFUSES draws no fill at all on a RECTANGLE or a CIRCLE, which is then see-through,
            // whatever the text says. A HEXAGON and a DIAMOND then show their own ground and a FILLED REGION is filled in ink: none of those is see-through, and each leaves in the Wall look.
            // ROUND FIVE FLIPS two kinds of row. Round four read a box's colour without the blanks around it, and took every piece that is no line for a box: a hexagon in the word
            // with a blank either side left clear (now the Wall look), and a rectangle in ' #ff0000 ' left as a brick wall (now clear, as the board draws it)
            await resetWorld(); await level();
            const C5_40 = 'rgba(0, 0, 0,' + ' '.repeat(25) + '0)', C5_41 = 'rgba(0, 0, 0,' + ' '.repeat(26) + '0)';   // a clear form 40 characters long, which the rule takes, and the same 41 long, which it refuses for its length
            const COLOURS5 = [
                ['word', 'transparent', true, true], ['caps', 'TRANSPARENT', true, true], ['hex8', '#12345600', true, true], ['hex4', '#1230', true, true], ['rgba0', 'rgba(0, 0, 0, 0)', true, true], ['hsla0', 'hsla(0,0%,0%,0.0)', true, true], ['long40', C5_40, true, true],
                ['red3', 'rgba(255,0,0)', true, false], ['half', 'rgba(0,0,0,0.5)', true, false], ['hex3', '#000', true, false], ['hex6', '#00ff00', true, false], ['name', 'red', true, false],
                ['blank', ' transparent ', false, false], ['tab', 'transparent\t', false, false], ['blankhex', ' #ff0000 ', false, false], ['upper', 'RGBA(0,0,0,0)', false, false], ['empty', '', false, false], ['long41', C5_41, false, false]
            ];
            const KINDS5 = [['rect', true, { type: 'rect' }], ['circle', true, { type: 'circle' }], ['hexagon', false, { type: 'hexagon' }], ['diamond', false, { type: 'diamond' }], ['region', false, { type: 'path', tip: 'fill', pts: [[0, 0], [30, 0], [30, 30], [0, 30]], baseW: 30, baseH: 30 }]];   // [kind, whether the board draws NO fill on it for a text its rule refuses, the piece]
            const C5 = [].concat.apply([], KINDS5.map((kind, ki) => COLOURS5.map((col, ci) => ({ kind: kind[0], col: col[0], clear: col[2] ? col[3] : kind[1], piece: Object.assign({ id: 'c5_' + kind[0] + '_' + col[0], blocksSight: true, sightType: 'door', doorOpen: false, secret: true, color: col[1], x: 1700 + 40 * ci, y: 20 + 40 * ki, w: 30, h: 30 }, kind[2]) }))));
            C5.forEach(c => { wbH().push(c.piece); });
            await level(); const map5 = await wholeNow();
            const c5Off = C5.map(c => {   // what is not as told of a piece
                const cd = map5 ? pieceIn(map5, c.piece.id) : null, look = FC.secretLook(c.piece), want = c.clear ? ['transparent', 'none'] : ['#3f3b47', 'bricks'];
                if (!cd) return [c.piece.id, 'not sent'];
                const got = [cd.color, hasOwn(cd, 'texture') ? cd.texture : 'none'];
                return FC.secretOn(c.piece) === true && look.clear === c.clear && JSON.stringify(got) === JSON.stringify(want) && cd.sightType === 'wall' && cd.type === c.piece.type && bareOfSecret(cd) && plainWall(cd) ? null : [c.piece.id, c.clear ? 'to be clear' : 'to be the Wall look', got, look.clear];
            }).filter(Boolean);
            const c5Count = f => C5.filter(f).length, c5Is = (kind, col) => C5.find(c => c.kind === kind && c.col === col).clear;
            check('host (Match a wall, round five): a colour that draws nothing is read as the board\'s own rule reads the very text. ' + C5.length + ' secret doors, five kinds that are no line (a rectangle, a circle, a hexagon, a diamond and a filled region) in eighteen colours each, with nothing named for them, are sent in a whole copy of the map, and each is held to a table worked out by hand. A text the board\'s rule TAKES is see-through only as a clear form, on every kind: the word transparent in either case, a hex colour of 4 or of 8 digits whose alpha is 0, rgba(0, 0, 0, 0), hsla(0,0%,0%,0.0) and an rgba of four parts 40 characters long leave clear, in the colour transparent with no pattern. rgba(255,0,0), which is plain red, rgba(0,0,0,0.5), #000, #00ff00 and red leave in the Wall material\'s colour with its bricks. A text the rule REFUSES draws no fill at all on a rectangle or a circle, which then leave clear whatever the text says: the word with a blank either side, the word and a tab, a hex colour between blanks, RGBA(0,0,0,0) in capitals, an empty text and a clear form 41 characters long. As a hexagon, a diamond or a filled region the same six are no see-through door, since the board gives the first two their own ground and fills the third in ink: each leaves in the Wall look. ROUND FIVE FLIPS both halves of that against round four, which read a box\'s colour without the blanks around it and took every piece that is no line for a box. fogcore secretLook calls each of the ninety clear or not as this table does, which is what Properties tells the GM. Every copy is a plain wall of the door\'s own kind with none of the six keys, and none holds the colour it was drawn in',
                C5.length === 90 && COLOURS5.length === 18 && c5Count(c => c.clear) === 5 * 7 + 2 * 6 && c5Off.length === 0 && c5Is('rect', 'blankhex') === true && c5Is('hexagon', 'blank') === false && c5Is('region', 'word') === true && c5Is('circle', 'red3') === false && C5_40.length === 40 && C5_41.length === 41
                && !!map5 && oddWalls(map5).length === 0 && C5.every(c => { const cd = pieceIn(map5, c.piece.id); return !!cd && (c.piece.color === 'transparent' || c.piece.color === '' || JSON.stringify(cd).indexOf(JSON.stringify(c.piece.color)) < 0); }),   // (but for the word itself, which is the copy's own colour, and the empty text)
                { c5Off: c5Off.slice(0, 6), wrong: c5Off.length });
            // the GM's own Lock in place, as the next save tells the table of it: nothing for a plain wall or a secret door, the door itself for a door that is no secret
            await resetWorld(); await level();
            const stepW = async change => { const n = sentLog.length; change(); await level(); return carry(n); };
            const lockQuiet = await stepW(() => { tokH('wall_meet').locked = true; delete tokH('wall_lockline').locked; tokH('wall_lockbox').locked = false; tokH('bars1').locked = true; tokH('door_freeline').locked = true; delete tokH('door_line').locked; delete doorH().locked; });
            const lockLoud = await stepW(() => { delete tokH('door_held').locked; }), heldSent = lockLoud.map(s => pieceIn(s.m, 'door_held'));
            check('host (Match a wall, round two): the GM locking a wall line and a see-through barrier in place, unlocking another wall line and a wall box, locking one secret door and unlocking two more sends the table nothing of the map at the next save: no wall the players hold has changed, and a send would say that one had. Unlocking a door that is no secret does reach both players at the next save, as that door with no lock',
                lockQuiet.length === 0 && tokH('wall_meet').locked === true && tokH('bars1').locked === true && tokH('door_freeline').locked === true && !hasOwn(tokH('wall_lockline'), 'locked') && !hasOwn(tokH('door_line'), 'locked') && !hasOwn(doorH(), 'locked')
                && toBoth(lockLoud) && heldSent.every(w => !!w && w.sightType === 'door' && w.blocksSight === true && !hasOwn(w, 'locked')) && lockLoud.every(s => lockedWalls(s.m).length === 0 && secretLeak(s.m) === ''),
                { quiet: lockQuiet.map(s => s.to + ':' + s.m.type), loud: lockLoud.map(s => [s.to, heldSent.map(lockOf)]) });

            // 8h. Match a wall, rounds three, four and five. WHICH WALL ANSWERS, and AT WHAT WIDTH, as the wire shows it.
            //     Each layout is a secret door drawn as a line with the wall lines around it, laid in a part of the map of its own, 700 px from the next, so
            //     that no layout reaches another (a line reaches as far as half its width, held to 100 px, and 12 px more). The door runs from (100, 100) to
            //     (160, 100) of its part unless its points are given, 9 wide at 0.45 with the round nib. want names the wall whose look the rule gives, or
            //     null where no wall meets the door. Each want was worked out by hand from the rule as round five tells it (the seven ranks in the heading
            //     of r5Judge above), and r5Judge, this suite's own reading of that rule, is asked for every layout too: the hand, the reading and the core
            //     must name one look. A row with flip is a scenario whose answer ROUND FOUR changed: flip says what round three answered there. A row with
            //     flip5 is one whose answer ROUND FIVE changed, or would have been another in round four: flip5 says what round four answered there.
            //     The two walls a rank is shown with are made alike in every rank above it. So where a rank is to decide between a wall in line with the door
            //     and a wall at its other end, that wall begins AT the door's end and goes straight down (R4_ELL): both then end at an end of the door,
            //     which round four ranks too.
            //     In the numbers worked out below a wall 6 wide has a half of 3, the door 9 wide a half of 4.5, the door's middle is (130, 100) and the margin
            //     at either end is 12 px (half the way to the middle is 15), unless the row says otherwise
            const R5_C = Math.sqrt(3) / 2, R5_RING = [[130, 60], 50];   // (the cosine of 30 degrees, for a hex lattice's sides; and a round room: its middle and its radius, on whose wall (100, 100) and (160, 100) lie)
            const R5_ROOM = [[80, 60], [90, 90], [100, 100], [116, 108], [130, 110], [144, 108], [160, 100], [170, 90], [180, 60]];   // the lower wall of that round room: nine points, each exactly 50 px from its middle
            const r5Arm = arm => r3Steps([100 - arm, 40], [100 - arm, 100], 2).concat(r3Steps([102 - arm, 100], [100, 100], 2));   // a wall drawn by hand, a point every 2 px, that comes straight down and turns level `arm` px before the door's first end
            const R3_A = { color: '#50506a', strokeWidth: 6, tip: 'round' }, R3_B = { color: '#70507a', strokeWidth: 6, tip: 'round' }, R3_DOOR = { sightType: 'door', doorOpen: false, secret: true, color: '#c3b2a9', strokeWidth: 9, opacity: 0.45, tip: 'round' };
            const R3_HUGE = { color: '#4a4753', strokeWidth: '1e16', opacity: '0.25', tip: 'flat' }, R3_END = [[40, 100], [100, 100]], R3_FAR = [[160, 100], [220, 100]], R3_CROSS = [[160, 70], [160, 130]], R4_ELL = [[160, 100], [160, 160]];
            const R4_STEP = [[100, 100], [100, 102]].concat(r3Steps([104, 102], [160, 102], 4));   // a door drawn by hand whose first stretch is a pixel step straight down: its run there is read over 40 px of its line, 19 px on, and is all but level
            const R3 = [
                // (1) the LOOK that reaches BOTH of the door's ENDS
                { id: 'gap', why: 'a door in a gap of its wall, whose two halves are one look, answers that wall by its two ends, though a short wall of another look lies over its first end and comes first in the list', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, R3_A]], want: 'a' },
                { id: 'gap-hand', why: '...and so does a door drawn by hand, a point every 5 px: its two ends are its first point and its last', pts: r3Steps([100, 100], [160, 100], 5), walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, R3_A]], want: 'a' },
                { id: 'ends21', flip: 'the wall that touches one end', why: 'ROUND FOUR FLIPS THIS. The ends speak only for a look that reaches BOTH: a look that is near both ends answers before a wall that touches one end and reaches no other, which round three ranked first', walls: [['b', [[40, 108], [92, 108]], R3_B], ['b2', [[168, 100], [228, 100]], R3_B], ['a', R3_END, R3_A]], want: 'b' },
                { id: 'ends32', why: 'of two looks that each reach both ends, a touch counts 2 and a near end 1: a look that touches one end and is near the other answers before a look that is near both and comes first', walls: [['b', [[40, 108], [92, 108]], R3_B], ['b2', [[168, 108], [228, 108]], R3_B], ['a', R3_END, R3_A], ['a2', [[168, 100], [228, 100]], R3_A]], want: 'a' },
                { id: 'ends43', why: '...and a look that touches both ends before one that touches one and is near the other', walls: [['b', [[40, 104], [100, 104]], R3_B], ['b2', [[168, 100], [228, 100]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, R3_A]], want: 'a' },
                { id: 'endtouch', why: 'an end is TOUCHED within the wall\'s half and 4 px, and NEAR within its half and 12 px: four walls come straight down to the door\'s line, two of one look 6.5 px outside its ends, a touch each, and two of another look 9 px inside them, on the door itself, near each. The first look answers, though the second is nearer and comes first', walls: [['b', [[109, 40], [109, 100]], R3_B], ['b2', [[151, 40], [151, 100]], R3_B], ['a', [[93.5, 40], [93.5, 100]], R3_A], ['a2', [[166.5, 40], [166.5, 100]], R3_A]], want: 'a' },
                { id: 'nearend', why: 'a wall that lies over the middle of the door, clear of both its ends, reaches neither and is ASIDE: the wall that is near one end, 8 px short of it, answers, though the other lies on the door and comes first', walls: [['b', [[118, 100], [142, 100]], R3_B], ['a', [[32, 100], [92, 100]], R3_A]], want: 'a' },
                { id: 'beside', why: 'a wall that runs BESIDE the door reaches neither of its ends: a wall 14 wide, 11 px off a door 20 wide for all its length, passes its two ends and its middle at one distance, 11 px where its half and a pixel are 8. Were its ends counted it would touch both and answer. As it is no look reaches both ends, and the wall at the door\'s first end answers as the nearer: round five no longer calls the thick wall aside, since the two strokes overlap, 11 px against halves of 7 and 10, and the two walls are alike in every rank', door: { strokeWidth: 20 }, walls: [['b', [[100, 111], [160, 111]], Object.assign({}, R3_B, { strokeWidth: 14 })], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'beside-aside', why: '...and 18 px off, past the overlap of the two strokes, it is aside as well: a wall that stands across the door 14 px beyond its far end answers before it, though the thick wall runs the door\'s way, has its own ends by the door\'s and comes first', door: { strokeWidth: 20 }, walls: [['b', [[100, 118], [160, 118]], Object.assign({}, R3_B, { strokeWidth: 14 })], ['a', [[174, 60], [174, 140]], R3_A]], want: 'a' },
                { id: 'cap-ends', why: '...whatever its width: a wall whose width is the text 1e16, 116 px beside the door, meets it and reaches neither of its ends, so the wall at its first end answers', walls: [['b', [[115, 216], [145, 216]], R3_HUGE], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'half-over', flip5: 'the look that is near both ends', why: 'ROUND FIVE FLIPS THIS. An end that lies IN a wall\'s stroke is reached whatever the door\'s middle does: a wall that lies over the first end, 1.5 px from the end point where its half and a pixel are 4, and on to the middle, reaches that end. Its look touches the far end with another wall, so it reaches both ends, 2 and 2, and answers before the look that is only near both. Round four gave a wall no end where it passes the middle about as near, and answered the other look', walls: [['b', [[90, 97], [130, 103]], R3_B], ['b2', R3_FAR, R3_B], ['a', [[32, 100], [92, 100]], R3_A], ['a2', [[166, 106], [220, 150]], R3_A]], want: 'b' },
                { id: 'half-beside', why: 'a wall reaches no end that is NOT in its stroke where it passes the door\'s MIDDLE about as near as it passes that end: a wall that runs beside the door from before its first end to its middle, 5.5 px off, passes both at 5.5 px and does not reach that end. So its look, which touches the far end with another wall, reaches one end only and says nothing, and the look that is near both ends answers', walls: [['b', [[90, 94.5], [130, 94.5]], R3_B], ['b2', R3_FAR, R3_B], ['a', [[32, 100], [92, 100]], R3_A], ['a2', [[166, 106], [220, 150]], R3_A]], want: 'a' },
                { id: 'short-gap', why: 'a door 20 px long in a gap of its wall, whose two halves each run on 1.5 px over it: each end lies in the stroke of its half and is reached, though each half passes the door\'s middle 8.5 px off. A wall of another look that ends at its first end too, runs its way and comes first does not answer. (Round four reached the same answer by its margin, which the next four rows show for an end that is not in the stroke.)', pts: [[100, 100], [120, 100]], walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 100], [101.5, 100]], R3_A], ['a2', [[118.5, 100], [180, 100]], R3_A]], want: 'a' },
                { id: 'margin-in', why: '"about as near" is within half the way from that end to the middle: a door 20 px long, whose middle is 10 px from either end, so the margin is 5. Its wall\'s two halves pass 5 px to the side of it, outside their stroke, and each runs on 1 px past its end. Each passes the middle 10.3 px off, which is more than its end\'s 5 and the margin of 5: the end is reached, touched, and the look answers by both ends', pts: [[100, 100], [120, 100]], walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 105], [101, 105]], R3_A], ['a2', [[119, 105], [180, 105]], R3_A]], want: 'a' },
                { id: 'margin-out', why: '...and where each half runs on 2 px past its end it passes the middle 9.4 px off, under 5 and 5: neither end is reached, the ends say nothing, no wall is aside, the three run the door\'s way, touch it and end at an end of it, and the nearer answers, the wall of another look that ends on the door\'s first end', pts: [[100, 100], [120, 100]], walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 105], [102, 105]], R3_A], ['a2', [[118, 105], [180, 105]], R3_A]], want: 'c' },
                { id: 'long-over', why: 'a wall that runs on 16.5 px over the first end of a door 60 px long: the end lies in its stroke and is reached, so its look answers by both ends', walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 100], [116.5, 100]], R3_A], ['a2', R3_FAR, R3_A]], want: 'a' },
                { id: 'margin-long-in', why: 'the margin is 12 px at the most, however long the door: a wall 5 px to the side of a door 60 px long that runs on 13 px past its first end passes the middle 17.7 px off, more than the end\'s 5 and 12. It reaches that end, where half the way to the middle, 15, would have denied it, and its look answers by both ends', walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 105], [113, 105]], R3_A], ['a2', R3_FAR, R3_A]], want: 'a' },
                { id: 'margin-long-out', why: '...and one that runs on 15 px passes the middle 15.8 px off, under 5 and 12, and does not reach it: the ends say nothing. Its own end then lies 15.8 px from the door\'s, past its half and 12, so the two walls that end on the door\'s ends come before it, alike in every rank, and the first in the list answers', walls: [['c', [[45, 75], [100, 100]], R3_B], ['a', [[40, 105], [115, 105]], R3_A], ['a2', R3_FAR, R3_A]], want: 'c' },
                { id: 'past-reach', why: 'a wall passes the door\'s middle only within the widest reach of the two lines: two walls of one look come straight up to 10 px under the door, 10 px inside each of its ends, 14 px from an end and 22 px from the middle. Each is near its end, so that look answers by both ends, before the wall in line that touches one end and comes first', walls: [['b', R3_END, R3_B], ['a', [[110, 170], [110, 110]], R3_A], ['a2', [[150, 170], [150, 110]], R3_A]], want: 'a' },
                { id: 'ends-first', why: 'the ends rank before everything else: a look that touches one end with a wall across it and is near the other with a wall across and only near answers before a look that is near both ends with walls in line, which touch the door, run its way and end at its ends', walls: [['b', [[32, 100], [92, 100]], R3_B], ['b2', [[168, 100], [228, 100]], R3_B], ['a', [[100, 40], [100, 160]], R3_A], ['a2', [[173, 60], [173, 140]], R3_A]], want: 'a' },
                { id: 'two-in', why: 'a straight door has two ends, however short: a door 13 px long in a gap of its wall answers that wall, by its two ends, though a wall of another look ends at its first end too and comes first', pts: [[100, 100], [113, 100]], walls: [['c', [[40, 104], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[113, 100], [173, 100]], R3_A]], want: 'a' },
                { id: 'two-out', flip5: 'the first in the list', why: 'ROUND FIVE FLIPS THIS. A door 12 px long has two ends too: a door has none only where its ends lie within the lesser of 12 px and HALF ITS OWN LENGTH of each other, which is 6 here. Its wall reaches both, each half the end it lies on, and answers. Round four called every door of 12 px or less a ring, and let the list decide', pts: [[100, 100], [112, 100]], walls: [['c', [[40, 104], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[112, 100], [172, 100]], R3_A]], want: 'a' },
                { id: 'two-short', flip5: 'the first in the list', why: '...and so has a door 8 px long, whose ends lie 8 px apart where half its length is 4', pts: [[100, 100], [108, 100]], walls: [['c', [[40, 104], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[108, 100], [168, 100]], R3_A]], want: 'a' },
                { id: 'vee-in', flip5: 'the first in the list', why: '...by half its length and no less: a door bent double, two arms of 10 px whose ends lie 11 px apart, has two ends, since half its length is 10. Its wall reaches both and answers', pts: [[100, 100], [105.5, 108.35], [111, 100]], walls: [['c', [[40, 104], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[111, 100], [171, 100]], R3_A]], want: 'a' },
                { id: 'u-30', why: '...the LESSER of the two: a door of three sides, 40, 30 and 40 px, has its ends 30 px apart, well under half its length of 110. They lie more than 12 px apart, so the door has two ends, and its wall answers by both', pts: [[100, 100], [100, 140], [130, 140], [130, 100]], walls: [['c', [[40, 96], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[130, 100], [190, 100]], R3_A]], want: 'a' },
                { id: 'u-12', why: '...more than 12 px, exactly: a door of three sides, 10, 12 and 10 px, whose ends lie 12 px apart where half its length is 16, has none. The three walls are alike in every other rank: each runs the door\'s way where they meet, the level ones 30.3 degrees off the door\'s run there, whose cosine of 0.864 is still 0.86 or more, and each touches the door and ends on an end of it. The first in the list answers', pts: [[100, 100], [100, 110], [112, 110], [112, 100]], walls: [['c', [[40, 96], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[112, 100], [172, 100]], R3_A]], want: 'c' },
                { id: 'vee-out', why: '...and the same door bent a little further, its ends 9 px apart, has none: the ends say nothing, no wall is aside, the three walls are alike in every other rank, and the first in the list answers', pts: [[100, 100], [104.5, 108.93], [109, 100]], walls: [['c', [[40, 104], [100, 100]], R3_B], ['a', R3_END, R3_A], ['a2', [[109, 100], [169, 100]], R3_A]], want: 'c' },
                { id: 'ring', flip: 'the wall at its seam', why: 'ROUND FOUR FLIPS THIS. A door whose two ends are one place, a ring of six sides, has no two ends to reach: the wall that lies along one of its sides answers before the wall that only touches its seam, which round three ranked first for reaching both of its ends', pts: [[160, 100], [140, 134.64], [100, 134.64], [80, 100], [100, 65.36], [140, 65.36], [160, 100]], walls: [['b', [[160, 100], [220, 100]], R3_B], ['a', [[110, 134.64], [130, 134.64]], R3_A]], want: 'a' },
                { id: 'ring-middle', why: '...and nothing runs beside a ring or past its middle: a wall that lies along the side of the ring that ends half way round it, where a door with two ends has its middle, is not aside, and answers before the wall at the seam', pts: [[160, 100], [140, 134.64], [100, 134.64], [80, 100], [100, 65.36], [140, 65.36], [160, 100]], walls: [['b', [[160, 100], [220, 100]], R3_B], ['a', [[95, 125.98], [80, 100]], R3_A]], want: 'a' },
                { id: 'on', why: 'a door drawn over an uncut wall lies ON it, its two ends inside the wall\'s stroke: that wall reaches both its ends and answers, though a wall of another look ends at its far end and comes first', walls: [['b', R4_ELL, R3_B], ['a', [[40, 100], [220, 100]], R3_A]], want: 'a' },
                { id: 'on-in', why: '...within the wall\'s half and a pixel: a door 3.5 px off the middle of an uncut wall 6 wide has both ends in its stroke', walls: [['b', R4_ELL, R3_B], ['a', [[40, 103.5], [220, 103.5]], R3_A]], want: 'a' },
                { id: 'on-ends-in', why: '...which is what the ENDS go by, at exactly a pixel past the half: a door 4 px off an uncut wall 6 wide is reached at both ends by it, 2 and 2, and that wall answers before a look that is only near both ends, 1 and 1', walls: [['b', [[40, 108], [92, 108]], R3_B], ['b2', [[168, 100], [228, 100]], R3_B], ['a', [[40, 104], [220, 104]], R3_A]], want: 'a' },
                { id: 'on-ends-out', why: '...and a door 4.5 px off it is not: the wall passes its ends and its middle at one distance, so it reaches neither end. Walls of another look that meet BOTH of the door\'s ends then answer by the ends, though they are only near them and the door was drawn over the first wall: the ends rank first. (That is the rule as decided: the allowance for an end in the stroke is one pixel.)', walls: [['b', [[40, 108], [92, 108]], R3_B], ['b2', [[168, 100], [228, 100]], R3_B], ['a', [[40, 104.5], [220, 104.5]], R3_A]], want: 'b' },
                { id: 'on-out', flip5: 'the wall at the far end', why: 'ROUND FIVE FLIPS THIS. A door 5 px off the middle of an uncut wall 6 wide has no end in its stroke, and that wall reaches neither end. But the two strokes overlap at the door\'s two ends and at its middle, 5 px against halves of 3 and 4.5: the door was drawn over that wall, however roughly, and the wall is not ASIDE. No look reaches both ends, and the wall that runs the door\'s way answers before the wall that stands across its far end. Round four called the first wall aside, and answered the other', walls: [['b', R4_ELL, R3_B], ['a', [[40, 105], [220, 105]], R3_A]], want: 'a' },
                { id: 'lies-in', flip5: 'the wall at the far end', why: '...as far as the two strokes overlap, half of the wall and half of the door: 7.5 px off is still not aside', walls: [['b', R4_ELL, R3_B], ['a', [[40, 107.5], [220, 107.5]], R3_A]], want: 'a' },
                { id: 'lies-out', why: '...and 8 px off is: beyond the overlap of the two strokes a wall beside the door for all its length is aside, and comes after the wall that stands across the far end, though it touches the door and runs its way', walls: [['b', R4_ELL, R3_B], ['a', [[40, 108], [220, 108]], R3_A]], want: 'b' },
                { id: 'lies-arch', why: '...at the door\'s two ends AND at its middle: a door that arches 11 px off its own line, over an uncut wall 5 px to the side of its ends, has both ends within the overlap and its middle 16 px off the wall. The door does not lie over that wall, which passes its ends and its middle at about one distance: it is beside the door and aside, and the wall at the far end answers', pts: [[100, 100], [130, 89], [160, 100]], walls: [['b', R4_ELL, R3_B], ['a', [[40, 105], [220, 105]], R3_A]], want: 'b' },
                { id: 'lies-slant', why: '...and at EACH end: an uncut wall that slants a little under the door, 8.2 px from its first end, 7 from its middle and 5.8 from its far end, is past the overlap at the first end. The door does not lie over it, and it is aside', walls: [['b', R4_ELL, R3_B], ['a', [[40, 110.5], [220, 103.5]], R3_A]], want: 'b' },
                { id: 'lies-slant2', why: '...whichever end that is: the same wall slanting the other way, 8.2 px from the door\'s far end', walls: [['b', R4_ELL, R3_B], ['a', [[40, 103.5], [220, 110.5]], R3_A]], want: 'b' },
                { id: 'arch', flip5: 'the wall at the far end', why: 'ROUND FIVE FLIPS THIS. An end in the stroke is reached WHATEVER THE MIDDLE DOES: a door that arches 10 px off an uncut wall, its two ends on it, is reached at both ends by that wall, which answers. Round four asked the middle too, called the wall beside the door and aside, and answered the wall at the far end', pts: [[100, 100], [130, 90], [160, 100]], walls: [['b', R4_ELL, R3_B], ['a', [[40, 100], [220, 100]], R3_A]], want: 'a' },
                { id: 'chord', flip5: 'the wall at the far end', why: '...and so is a straight door over the wall of a ROUND ROOM: the door is a chord of the room, its two ends on the wall and its middle 10 px inside it, clear of the wall\'s stroke and of the two strokes\' overlap. The room\'s wall reaches both ends and answers, though a wall of another look ends at the far end and comes first', walls: [['b', R4_ELL, R3_B], ['a', R5_ROOM, R3_A]], want: 'a' },
                // walls of one look are DRAWN alike: colour, width, opacity, nib and scale. Two halves that differ in one of the five are two looks. Neither then reaches both ends, the ends
                // say nothing, and the three walls are alike in every other rank (each runs the door's way, touches it and ends at one of its ends): the first in the list answers
                { id: 'look-colour', why: 'two halves that differ in colour alone are two looks', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { color: '#50506b' })]], want: 'b' },
                { id: 'look-width', why: 'two halves that differ in width alone are two looks', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { strokeWidth: 5 })]], want: 'b' },
                { id: 'look-thousandth', why: '...by two thousandths of a pixel', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { strokeWidth: 6.002 })]], want: 'b' },
                { id: 'look-opacity', why: 'two halves that differ in opacity alone are two looks', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { opacity: 0.5 })]], want: 'b' },
                { id: 'look-nib', why: 'two halves that differ in nib alone are two looks', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { tip: 'square' })]], want: 'b' },
                { id: 'look-scale', why: 'two halves of which one was resized to twice its size are two looks', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, R3_A, [2, 2]]], want: 'b' },
                { id: 'look-case', why: 'round four: walls drawn alike are one look whatever the case of the colour. A half whose colour a file wrote in upper case and a half in lower case are one wall, which answers by its two ends', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { color: '#50506A' })]], want: 'a' },
                { id: 'look-bits', why: '...and whatever the numbers say past the third decimal, as two walls resized together differ: a half 6.0004 wide at an opacity of 0.9996 in a box 1.0003 times its size is the same look', walls: [['b', [[90, 97], [130, 103]], R3_B], ['a', R3_END, R3_A], ['a2', R3_FAR, Object.assign({}, R3_A, { strokeWidth: 6.0004, opacity: 0.9996 }), [1.0003, 1.0003]]], want: 'a' },
                // (2) a wall that meets the door before one that only runs BESIDE it
                { id: 'aside-last', why: 'a wall that only runs BESIDE the door comes after every wall that meets it: a wall that stands across the door 14 px beyond its far end, only near it, answers before a wall of another look that runs beside the door 8 px off, touches it, runs its way and comes first', walls: [['b', [[100, 108], [160, 108]], R3_B], ['a', [[174, 60], [174, 140]], R3_A]], want: 'a' },
                { id: 'aside-cross', why: '...and so does a wall that lies over the door\'s MIDDLE clear of both its ends: a wall in line with the door 12 px short of it, only near, answers before a wall that lies on the middle of the door, touches it, runs its way and comes first', walls: [['b', [[118, 100], [142, 100]], R3_B], ['a', [[28, 100], [88, 100]], R3_A]], want: 'a' },
                // (3) a wall that runs the door's own way before one that stands across it
                { id: 'tee', flip: 'the wall it butts on', why: 'ROUND FOUR FLIPS THIS. A door that carries on from its own wall, beginning 8 px after it, and butts on another wall is reached at one end by each look: the ends say nothing, and the wall that runs the door\'s way answers. Round three ranked the wall it butts on first, for touching an end where the door\'s own wall was only near', pts: [[108, 100], [160, 100]], walls: [['b', [[160, 40], [160, 160]], R3_B], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'ell', why: 'a wall that runs the door\'s own way answers before one that stands across it, each ending at one end of the door and touching it', walls: [['b', R4_ELL, R3_B], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'cross', why: 'a wall end to end with the door answers before a thicker wall that stands across its other end and comes first in the list', walls: [['b', R3_CROSS, Object.assign({}, R3_B, { strokeWidth: 20, tip: 'square' })], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'angle', why: 'the same way is within 30 degrees: a wall that leaves one end at 25 degrees answers before a wall that leaves the other at 35', walls: [['b', [[160, 100], [209, 134]], R3_B], ['a', [[46, 75], [100, 100]], R3_A]], want: 'a' },
                { id: 'angle30', why: '...30 included, round four: a wall that leaves one end at 30 degrees, as an edge of a hex lattice does, runs the door\'s way, and one that leaves the other end at 31 degrees does not', walls: [['b', [[160, 100], [211.43, 130.9]], R3_B], ['a', [[48.04, 70], [100, 100]], R3_A]], want: 'a' },
                { id: 'hook', why: 'a run is read over 40 px of the line, never from one stretch: a wall drawn by hand that ends on the door in three pixel steps straight up still runs the door\'s way', walls: [['b', R4_ELL, R3_B], ['a', [[40, 106], [100, 106], [100, 104], [100, 102], [100, 100]], R3_A]], want: 'a' },
                { id: 'bend', why: '...and over no more: a wall drawn by hand that runs the door\'s way for its last 30 px, after 150 px straight down, still runs the door\'s way', walls: [['b', R4_ELL, R3_B], ['a', r3Steps([70, -50], [70, 100], 10).concat(r3Steps([72, 100], [100, 100], 2)), R3_A]], want: 'a' },
                { id: 'overlap', why: 'the pair of stretches that speaks for a wall is the one whose two runs are most alike: a wall drawn by hand that comes straight down onto the door\'s first end and then runs on over the door for 30 px runs the door\'s way, whichever end it was drawn from', walls: [['b', R3_CROSS, R3_B], ['a', r3Steps([100, 40], [100, 100], 2).concat(r3Steps([102, 100], [130, 100], 2)), R3_A]], want: 'a' },
                { id: 'corner-run', flip: 'the first in the list', why: 'ROUND FOUR FLIPS THIS. A run is read over 40 px of LINE, and a stretch as long is its own run: a wall of long stretches that turns a corner one cell before the door still runs the door\'s way on its last cell. Round three read the chord across the corner, at 45 degrees, and let the list decide', walls: [['b', R4_ELL, R3_B], ['a', [[50, 50], [50, 100], [100, 100]], R3_A]], want: 'a' },
                { id: 'arm30', why: '...and a shorter last arm still runs the door\'s way: the arm\'s own 30 px count as a run, and the 40 px that end at the door, cut 10 px inside the long stretch before the corner, lean only 18 degrees off it', walls: [['b', R4_ELL, R3_B], ['a', [[70, 40], [70, 100], [100, 100]], R3_A]], want: 'a' },
                { id: 'dogleg', why: '...over 40 px and no less: a wall drawn by hand that runs level and then comes down to the door\'s first end at 45 degrees for its last 24 px. Over the 40 px of line that end at the door it goes 33 across and 17 down, 27 degrees off the door\'s way, so it runs the door\'s way, where its last 20 px alone stand at 45', walls: [['b', R4_ELL, R3_B], ['a', r3Steps([40, 83.03], [83.03, 83.03], 4).concat(r3Steps([84.44, 84.44], [100, 100], 2)), R3_A]], want: 'a' },
                { id: 'arm20', flip5: 'the first in the list', why: 'ROUND FIVE ADDS THE HALF RUN. A wall\'s run is also read over 20 px on either side of its stretch: a wall drawn by hand that comes straight down and turns level 20 px before the door runs the door\'s way, by the 20 px that end at the door. The 40 px that end there go 20 down and 20 across, at 45 degrees, which is all round four read: it found neither wall running the door\'s way and let the list decide', walls: [['b', R4_ELL, R3_B], ['a', r5Arm(20), R3_A]], want: 'a' },
                { id: 'arm24', flip5: 'the first in the list', why: '...and so does one that turns 24 px before the door, whose 40 px lean 34 degrees off the door\'s way', walls: [['b', R4_ELL, R3_B], ['a', r5Arm(24), R3_A]], want: 'a' },
                { id: 'arm16', flip5: 'the first in the list', why: '...and one that turns 16 px before it: the 20 px that end at the door go 16 across and 4 down, 14 degrees off', walls: [['b', R4_ELL, R3_B], ['a', r5Arm(16), R3_A]], want: 'a' },
                { id: 'arm12', why: '...over 20 px and no less: a wall that turns 12 px before the door goes 12 across and 8 down over its last 20 px, 34 degrees off, and does not run the door\'s way. The two walls are then alike in every rank and the first in the list answers', walls: [['b', R4_ELL, R3_B], ['a', r5Arm(12), R3_A]], want: 'b' },
                { id: 'band-in', flip5: 'the wall at the far end', why: 'ROUND FIVE: the pair of stretches that speaks for a wall is the most alike of those within 4 px of its nearest gap. A wall of two long stretches has its corner 13 px before the door, and its other leg leans away over the door at 45 degrees, passing the door\'s first end 9.2 px off where the level leg ends 13 px off, 3.8 px farther. The level leg speaks, and the wall runs the door\'s way. Round four let only the nearest pair speak, the leaning leg, and answered the wall at the far end', walls: [['b', R4_ELL, R3_B], ['a', [[-80, 100], [87, 100], [193, -6]], R3_A]], want: 'a' },
                { id: 'band-out', why: '...within 4 px and no more: with the corner 14 px before the door the leaning leg passes 9.9 px off and the level leg lies 4.1 px farther. Only the leaning leg speaks, the wall does not run the door\'s way, and the wall that ends on the door\'s far end answers', walls: [['b', R4_ELL, R3_B], ['a', [[-80, 100], [86, 100], [192, -6]], R3_A]], want: 'b' },
                { id: 'tie-first', turned: null, why: 'HELD AS DECIDED, and not a finding: of a wall\'s runs that are exactly as like the door\'s run the EARLIEST counts, so an exact tie of two of one wall\'s own runs may answer by the end the wall was drawn from. A flat wall 20 wide arches under the door\'s first end, its level top of 10 px lying 23 px under it and its two legs falling away alike on either side. The two runs of 20 px at that top tie, and point two ways. By the one that ends with the top the wall\'s ribbon is 17 px thick there and reaches the door, by 4.5 and 8.5 and 12. By the one that begins with it the ribbon is 10.5 px thick and does not, by 4.5 and 5.3 and 12. Drawn from its first point the wall meets the door and answers. Drawn from its other end it does not, and no wall answers', walls: [['a', [[65, 138], [95, 123], [105, 123], [135, 138]], { color: '#5b567f', strokeWidth: 20, tip: 'flat' }]], want: 'a', width: 20 },
                { id: 'leg', why: 'a wall may turn a corner right where it meets the door, and the leg that runs the door\'s way is the one that counts: a wall drawn by hand that comes level to the door\'s first end and then turns straight down runs the door\'s way', walls: [['b', R3_CROSS, R3_B], ['a', r3Steps([40, 100], [100, 100], 4).concat(r3Steps([100, 104], [100, 160], 4)), R3_A]], want: 'a' },
                { id: 'leg30', why: '...a leg counting where it has 20 px of line: the same with a level leg only 30 px long, which is all the line the wall has before the corner', walls: [['b', R3_CROSS, R3_B], ['a', r3Steps([70, 100], [100, 100], 3).concat(r3Steps([100, 104], [100, 160], 4)), R3_A]], want: 'a' },
                { id: 'firststep', why: '...but a side of the meeting place counts only where it has 20 px of line: a wall that begins at the door\'s far end with one level pixel step and then goes straight down stands across the door', walls: [['b', [[160, 100], [162, 100], [162, 160]], R3_B], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'firststep12', why: '...20 px of line and no less: a wall that begins at the door\'s far end with a level stretch of 12 px before it goes straight down. That stretch by itself, 12 px of line, says nothing. The 20 px that begin with it go 12 across and 8 down, 34 degrees off the door, and the 40 px go 12 across and 28 down: the wall stands across the door', walls: [['b', [[160, 100], [172, 100], [172, 160]], R3_B], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'door-step', why: 'the DOOR\'s run is read around the middle of its stretch, as much line before it as after it: a door drawn by hand whose first stretch is a pixel step straight down still runs level there, as the wall that ends at that point does', pts: R4_STEP, walls: [['b', [[160, 102], [160, 162]], R3_B], ['a', R3_END, R3_A]], want: 'a' },
                // (4) a wall the door touches before one it is only near
                { id: 'touch', why: 'two lines TOUCH within half of each width and 4 px: a wall 20 wide whose end is 18 px from the door touches it, by 4.5 and 10 and 4, and answers before a wall 3 wide 11 px from it, which is only near, by 4.5 and 1.5 and 4, though it is nearer and comes first. (Round three allowed a pixel. Its own two walls, 14 and 9 px off, both touch now.)', walls: [['b', [[171, 100], [231, 100]], Object.assign({}, R3_B, { strokeWidth: 3 })], ['a', [[22, 100], [82, 100]], Object.assign({}, R3_A, { strokeWidth: 20 })]], want: 'a' },
                { id: 'along-over-touch', why: 'the way a wall runs ranks before the touch: a wall in line with the door 12 px short of it, only near, answers before a wall that stands across its far end, touches it and comes first', walls: [['b', R4_ELL, R3_B], ['a', [[28, 100], [88, 100]], R3_A]], want: 'a' },
                { id: 'touch-over-endsat', why: '...and the touch before where a wall ends: a wall that crosses the door\'s first end and ends nowhere near it answers before a wall in line with the door that stops 12 px short of it and comes first', walls: [['b', [[28, 100], [88, 100]], R3_B], ['a', [[70, 94], [130, 106]], R3_A]], want: 'a' },
                // (5) a wall that ENDS at one of the door's ends before one that passes it
                { id: 'ends-at', why: 'a wall that ENDS at one of the door\'s ends, within its half and 12 px, answers before one that passes it: a wall that comes in at 60 degrees and stops 10 px short of the door\'s first end, before a wall that runs straight through that end, is nearer and comes first', walls: [['b', [[100, 40], [100, 160]], R3_B], ['a', [[55, 22.06], [95, 91.34]], R3_A]], want: 'a' },
                { id: 'ends-at2', why: '...whichever of its own two ends that is: the same wall drawn from the door outward', walls: [['b', [[100, 40], [100, 160]], R3_B], ['a', [[95, 91.34], [55, 22.06]], R3_A]], want: 'a' },
                // (6) the nearer, (7) the first in the map's list
                { id: 'nearer', why: 'of two walls in line with the door, one at each end and both touching it, the nearer answers, though the one 3 px short of its end comes first', walls: [['b', [[163, 100], [223, 100]], R3_B], ['a', R3_END, R3_A]], want: 'a' },
                { id: 'first', why: 'two walls that are alike in every rank, one at each end: the first in the map\'s list answers', walls: [['a', R3_END, R3_A], ['b', R3_FAR, R3_B]], want: 'a' },
                { id: 'first2', why: '...whichever that is', walls: [['b', R3_FAR, R3_B], ['a', R3_END, R3_A]], want: 'b' },
                // how far: half of each width, held to 100 px, and 12 px
                { id: 'reach-in', why: 'a wall 6 wide whose end is 19 px from a door 9 wide meets it: 4.5 and 3 and 12 is 19.5', walls: [['a', [[21, 100], [81, 100]], R3_A]], want: 'a' },
                { id: 'reach-out', why: '...and one 20 px from it does not', walls: [['a', [[20, 100], [80, 100]], R3_A]], want: null },
                { id: 'cap-in', why: 'a wall whose width is past any board (the text 1e16) reaches as far as 100 px for its half: 116 px beside the door it meets it, by 4.5 and 100 and 12', walls: [['a', [[115, 216], [145, 216]], R3_HUGE]], want: 'a' },
                { id: 'cap-out', why: '...and 117 px beside it, it does not', walls: [['a', [[115, 217], [145, 217]], R3_HUGE]], want: null },
                { id: 'flatdoor-in', why: 'a half is the width times the pen\'s factor along the line\'s own run: a level door 20 wide with the FLAT nib is a ribbon 14.1 thick, so a wall 6 wide whose end is 22 px from it meets it, by 7.07 and 3 and 12', door: { strokeWidth: 20, tip: 'flat' }, walls: [['a', [[18, 100], [78, 100]], R3_A]], want: 'a' },
                { id: 'flatdoor-out', why: '...and one 23 px from it does not, where a door 20 wide with the round nib would reach it', door: { strokeWidth: 20, tip: 'flat' }, walls: [['a', [[17, 100], [77, 100]], R3_A]], want: null },
                { id: 'flatwall-in', why: 'the same for the wall: a level wall 20 wide with the flat nib whose end is 23 px from a door 9 wide meets it, by 4.5 and 7.07 and 12', walls: [['a', [[17, 100], [77, 100]], { color: '#50506a', strokeWidth: 20, tip: 'flat' }]], want: 'a' },
                { id: 'flatwall-out', why: '...and one 24 px from it does not', walls: [['a', [[16, 100], [76, 100]], { color: '#50506a', strokeWidth: 20, tip: 'flat' }]], want: null },
                { id: 'tall-across-in', why: 'a wall\'s half is read along the WALL\'s own run where they meet: an upright wall whose box was made three times as tall is still drawn 6 wide. 19 px beyond the door\'s far end it meets the door, by 4.5 and 3 and 12, and gives its own 6', walls: [['a', [[179, 70], [179, 130]], { color: '#5b5677', strokeWidth: 6, tip: 'round' }, [1, 3]]], want: 'a', width: 6, drawn: 6 },
                { id: 'tall-across-out', why: '...and 20 px beyond it, it does not, where its pen along the door\'s run would be 18 wide and reach it', walls: [['a', [[180, 70], [180, 130]], { color: '#5b5677', strokeWidth: 6, tip: 'round' }, [1, 3]]], want: null },
                // the width: for two lines never resized nor turned, the wall's own number bit for bit, whatever the nib and whatever angle they meet at
                { id: 'slant-round', why: 'a wall 7.3 wide with the round nib, met at 25 degrees', walls: [['a', [[46, 75], [100, 100]], { color: '#50506a', strokeWidth: 7.3, tip: 'round' }]], want: 'a', width: 7.3 },
                { id: 'slant-square', why: '...with the square nib', walls: [['a', [[46, 75], [100, 100]], { color: '#50506a', strokeWidth: 7.3, tip: 'square' }]], want: 'a', width: 7.3 },
                { id: 'slant-flat', why: '...with the flat nib', walls: [['a', [[46, 75], [100, 100]], { color: '#50506a', strokeWidth: 7.3, tip: 'flat' }]], want: 'a', width: 7.3 },
                { id: 'thin-flat-in', why: 'a flat wall 1.42 wide is a ribbon just over a pixel thick along a level door: the flat nib and the wall\'s own number', walls: [['a', R3_END, { color: '#5b5673', strokeWidth: 1.42, tip: 'flat' }]], want: 'a', width: 1.42 },
                { id: 'thin-flat', why: '...but for a flat wall whose ribbon along the door is under a pixel, round four: one 1.4 wide gives the SQUARE nib a pixel wide', walls: [['a', R3_END, { color: '#5b5672', strokeWidth: 1.4, tip: 'flat' }]], want: 'a', tip: 'square', width: 1, drawn: 1 },
                { id: 'both45', flip: 'flat and 8', why: 'ROUND FOUR FLIPS THIS. A flat wall and its door that both run along the nib, at 45 degrees, never resized: the wall\'s ribbon has no thickness at all there, so the copy takes the SQUARE nib a pixel wide. Round three answered the flat nib and the wall\'s own 8, a copy that drew nothing', pts: [[100, 100], [140, 140]], walls: [['a', [[60, 60], [100, 100]], { color: '#50506a', strokeWidth: 8, tip: 'flat' }]], want: 'a', tip: 'square', width: 1, drawn: 1 },
                // ...and where a box was resized or turned. A stroke (the round and the square nib): as thick as the wall IS drawn where they meet (round five: along its stretch's own direction where that stretch is 20 px or more, else along the run that counted)
                { id: 'big-round', why: 'a wall resized to twice its size, 6 stored and 12 drawn, with the round nib', walls: [['a', R3_END, { color: '#5b5662', strokeWidth: 6, tip: 'round' }, [2, 2]]], want: 'a', width: 12, drawn: 12 },
                { id: 'tall-round', why: 'a level wall whose box was made three times as tall alone, 4 stored, with the round nib', walls: [['a', R3_END, { color: '#5b5664', strokeWidth: 4, tip: 'round' }, [1, 3]]], want: 'a', width: 12, drawn: 12 },
                { id: 'doorbig-round', why: 'a door resized to three times its size beside a wall 6 wide never resized, with the round nib: 2 stored for the copy, 6 drawn', sized: [3, 3], walls: [['a', R3_END, { color: '#5b5663', strokeWidth: 6, tip: 'round' }]], want: 'a', width: 2, drawn: 6 },
                { id: 'wide-slant', flip: 'more than 7', why: 'ROUND FOUR FLIPS THIS. A level wall stretched to twice its length is still drawn 6 thick, and a door that leaves it at 25 degrees takes that 6, the wall\'s own number: the copy is as thick as the wall IS drawn where they meet. Round three read the wall\'s pen along the DOOR\'s run and answered more than 7', pts: [[100, 100], [154, 125]], walls: [['a', R3_END, { color: '#5b5665', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 6, drawn: 6 },
                { id: 'wide-upright', flip: '12', why: '...and so does an upright door that stands on the end of such a wall drawn with the square nib, where round three answered 12', pts: [[100, 100], [100, 160]], walls: [['a', R3_END, { color: '#5b566e', strokeWidth: 6, tip: 'square' }, [2, 1]]], want: 'a', width: 6, drawn: 6 },
                { id: 'tall-upright', flip: '4', why: 'a level wall made three times as tall, 4 stored, is drawn 12 thick, and an upright door on its end takes 12, where round three answered the 4 its pen would draw upright', pts: [[100, 100], [100, 160]], walls: [['a', R3_END, { color: '#5b566f', strokeWidth: 4, tip: 'round' }, [1, 3]]], want: 'a', width: 12, drawn: 12 },
                { id: 'leg-level', why: 'the wall\'s run is that of the LEG that meets the door: a wall with a corner, stretched to twice its width, is drawn 6 thick along its level leg and 12 along its upright one. A door that carries on from the level leg takes 6', walls: [['a', [[40, 40], [40, 100], [100, 100]], { color: '#5b5670', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 6, drawn: 6 },
                { id: 'leg-upright', why: '...and a door that carries on from the upright leg takes 12', pts: [[40, 40], [40, -20]], walls: [['a', [[40, 40], [40, 100], [100, 100]], { color: '#5b5671', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 12, drawn: 12 },
                { id: 'leg-hand', why: '...read on the side of the meeting place that counts, with none of the other leg in it: a wall drawn by hand, stretched to twice its width, that comes level to the door\'s first end and then turns straight down gives the 6 of its level leg, whichever end it was drawn from', walls: [['a', r3Steps([40, 100], [100, 100], 4).concat(r3Steps([100, 104], [100, 160], 4)), { color: '#5b5676', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 6, drawn: 6 },
                // A ribbon (the flat nib): as thick as the wall's nib draws along the DOOR where they meet (round five: as the door is drawn there). Flat where the door's own box needs a nib no more than twice and no less than half as wide
                { id: 'big-flat', why: 'a flat wall resized to twice its size: the door\'s box needs a nib exactly twice as wide, which is still the flat nib. 12 stored for the copy, a ribbon 12 times the root of a half thick', walls: [['a', R3_END, { color: '#5b5662', strokeWidth: 6, tip: 'flat' }, [2, 2]]], want: 'a', width: 12, drawn: 12 * Math.SQRT1_2 },
                { id: 'doortwice-flat', why: 'a door resized to twice its size beside a flat wall 6 wide: a nib exactly half as wide, which is still the flat nib. 3 stored', sized: [2, 2], walls: [['a', R3_END, { color: '#5b566d', strokeWidth: 6, tip: 'flat' }]], want: 'a', width: 3, drawn: 6 * Math.SQRT1_2 },
                { id: 'tall-flat', flip: 'flat and 12', why: 'ROUND FOUR FLIPS THIS. A level flat wall whose box was made three times as tall alone, 4 stored: the door\'s box would need a nib three times as wide, so the copy takes the SQUARE nib at the thickness of the wall\'s ribbon, 12 times the root of a half. Round three answered the flat nib and 12', walls: [['a', R3_END, { color: '#5b5664', strokeWidth: 4, tip: 'flat' }, [1, 3]]], want: 'a', tip: 'square', width: 12 * Math.SQRT1_2, drawn: 12 * Math.SQRT1_2 },
                { id: 'doorbig-flat', flip: 'flat and 2', why: 'ROUND FOUR FLIPS THIS. A door resized to three times its size beside a flat wall 6 wide: a nib a third as wide, so the copy takes the SQUARE nib, 6 times the root of a half over 3 stored, drawn as thick as the wall\'s ribbon. Round three answered the flat nib and 2', sized: [3, 3], walls: [['a', R3_END, { color: '#5b5663', strokeWidth: 6, tip: 'flat' }]], want: 'a', tip: 'square', width: 6 * Math.SQRT1_2 / 3, drawn: 6 * Math.SQRT1_2 },
                { id: 'turned30', flip: 'flat and about 2.67', why: 'ROUND FOUR FLIPS THIS. A door whose box was turned by 30 degrees beside a level flat wall 7.3 wide: along the door the wall\'s ribbon is about 1.89 thick, and the door\'s own box, whose nib is turned with it, would need a nib well under half as wide. So the copy takes the SQUARE nib at 1.89. Round three answered the flat nib', door: { rot: 30 }, walls: [['a', [[44, 85], [104, 85]], { color: '#5b5666', strokeWidth: 7.3, tip: 'flat' }]], want: 'a', tip: 'square', width: 7.3 * Math.SQRT1_2 * (Math.cos(Math.PI / 6) - Math.sin(Math.PI / 6)), drawn: 7.3 * Math.SQRT1_2 * (Math.cos(Math.PI / 6) - Math.sin(Math.PI / 6)) },
                { id: 'turned180', why: 'a door whose box was turned upside down: the wall\'s own number bit for bit', door: { rot: 180 }, walls: [['a', R3_END, { color: '#5b5667', strokeWidth: 7.3, tip: 'flat' }]], want: 'a', width: 7.3 },
                { id: 'square', why: 'a door that runs along the flat nib of its own box, at 45 degrees, beside a flat wall stretched to twice its length: no width makes a ribbon there, so the copy takes the SQUARE nib at the thickness of the wall\'s ribbon', pts: [[100, 100], [140, 140]], walls: [['a', [[20, 100], [100, 100]], { color: '#5b5668', strokeWidth: 8, tip: 'flat' }, [2, 1]]], want: 'a', tip: 'square', width: 4, drawn: 4 },
                { id: 'door-step-flat', flip5: 'flat and 6 times 15 over 17', why: 'ROUND FIVE FLIPS THIS WIDTH. The ribbon is read along the door\'s run WHERE THEY MEET: a door drawn by hand whose first stretch is a pixel step straight down, beside a flat wall stretched to twice its length. The step touches the wall and the next stretch, 4 px level, lies 2 px from it, within the 4 px of the pair that speaks, and runs more like the wall: over 40 px it goes 22 across and 2 down. The copy is the flat nib, 6 times 18 over 20 wide. Round four let the step speak, whose run goes 19 across and 2 down, and answered 6 times 15 over 17', pts: R4_STEP, walls: [['a', R3_END, { color: '#5b5675', strokeWidth: 6, tip: 'flat' }, [2, 1]]], want: 'a', width: 6 * 18 / 20, drawn: 6 * Math.SQRT1_2 * 18 / Math.hypot(22, 2) },
                // round five: each line is read AS DRAWN where they meet, a stretch of 20 px or more by its own direction
                { id: 'hex-side', flip5: 'about 6.66', why: 'ROUND FIVE: a stretch of half a run or more is read by its OWN direction, as the board draws it. A wall along two sides of a hex lattice, 30 px each, stretched to twice its width, ends on the door\'s first end with a side that runs 30 degrees off the door. That side is drawn 6 times half the root of 7 thick, about 7.94, and the door\'s copy takes that. Round four read the wall\'s run over 40 px, round the corner, 16 degrees off, and answered about 6.66', walls: [['a', [[100 - 60 * R5_C, 100], [100 - 30 * R5_C, 85], [100, 100]], { color: '#5b5678', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 3 * Math.sqrt(7), drawn: 3 * Math.sqrt(7) },
                { id: 'hex-short', why: '...20 px or more, and no less: the same wall along two sides of 15 px. Its last side is under half a run and is read by its run: the 30 px of line that end at the door are all the wall has, and run level, along which the stretched wall is drawn 6 thick, its own number bit for bit, where the side by itself is drawn about 7.94', walls: [['a', [[100 - 30 * R5_C, 100], [100 - 15 * R5_C, 92.5], [100, 100]], { color: '#5b567e', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 6, drawn: 6 },
                { id: 'door-leg-flat', flip5: 'flat and about 3.43', why: '...and so is the door: a door that runs level for 25 px and then turns straight down, beside a flat wall stretched to twice its length. Its first stretch is read by its own direction, level, along which the door\'s own box needs the very nib of its wall: flat and the wall\'s own 6. Round four read the door\'s run over 40 px, 25 across and 7.5 down, and answered about 3.43', pts: [[100, 100], [125, 100], [125, 160]], walls: [['a', R3_END, { color: '#5b5679', strokeWidth: 6, tip: 'flat' }, [2, 1]]], want: 'a', width: 6, drawn: 6 * Math.SQRT1_2 },
                { id: 'door-leg-tall', flip5: 'square and about 0.99', why: '...and the door\'s own box is read along the door AS DRAWN too: the same door in a box made three times as tall, beside a flat wall 6 wide never resized. Along its level stretch the door\'s box would need a nib a third as wide, so the copy takes the SQUARE nib at the thickness of the wall\'s ribbon there, 6 times the root of a half, which is a third of that stored. Round four read both along the door\'s run across its corner, where the ribbon is thinner, and answered the square nib at about 0.99', pts: [[100, 100], [125, 100], [125, 160]], sized: [1, 3], walls: [['a', R3_END, { color: '#5b567d', strokeWidth: 6, tip: 'flat' }]], want: 'a', tip: 'square', width: 6 * Math.SQRT1_2 / 3, drawn: 6 * Math.SQRT1_2 },
                { id: 'hook-wide', flip5: 'about 6.27', why: 'ROUND FIVE: a stretch UNDER 20 px is still read by its run, and the pair that speaks is the most alike within 4 px. A wall drawn by hand, stretched to twice its width, ends on the door in three pixel steps straight up. The first of the steps, 4 px from the door, speaks: its run over 40 px goes 38 across and 2 up, along which the stretched wall is drawn about 6.02 thick. Read by the step\'s own direction, straight up, it would be 12. Round four let only the last step speak, whose run goes 34 across and 6 up, and answered about 6.27', walls: [['a', [[40, 106], [100, 106], [100, 104], [100, 102], [100, 100]], { color: '#5b567c', strokeWidth: 6, tip: 'round' }, [2, 1]]], want: 'a', width: 12 * Math.hypot(19, 2) / Math.hypot(38, 2), drawn: 12 * Math.hypot(19, 2) / Math.hypot(38, 2) },
                // a colour that draws nothing, read as the board reads the very text for a LINE
                { id: 'ink-blank', why: 'a wall line whose colour has a blank either side of the word transparent is stroked in ink by every board: Match names no colour for it, and the door\'s copy leaves in the Wall material\'s colour at that wall\'s width and nib', walls: [['a', R3_END, { color: ' transparent ', strokeWidth: 6, tip: 'round' }]], want: 'a', colour: null, width: 6 }
            ];
            R3.forEach((L, i) => {   // each layout in its own part of the map
                const ox = 2400 + 700 * (i % 8), oy = 700 * Math.floor(i / 8), put = p => { p.x += ox; p.y += oy; return p; };
                const made = (pts, look, sized) => (sized ? r3Sized(pts, sized[0], sized[1], look) : r3Line(pts, look));   // (a fourth thing in a wall's row, and sized on a layout: the box was resized by that much each way)
                L.door = put(Object.assign(made(L.pts || [[100, 100], [160, 100]], {}, L.sized), R3_DOOR, L.door || {}, { id: 'r3_' + L.id + '_door' }));
                L.walls = L.walls.map(row => put(Object.assign(made(row[1], row[2], row[3]), { id: 'r3_' + L.id + '_' + row[0] })));
                L.wall = L.want ? L.walls.find(w => w.id === 'r3_' + L.id + '_' + L.want) : null;
                L.judge = r5Judge(L.door, L.walls.concat([L.door])); L.look = L.judge.win ? r5Look(L.door, L.judge.win) : null;   // this suite's own reading of the rule, with the layout's own pieces
                const bySum = r5Judge(L.door, L.walls.concat([L.door]), null, 'sum'), sumLook = bySum.win ? r5Look(L.door, bySum.win) : null;   // ...and asked again with every sum of lengths taken as it comes out: no layout may hang on the last bit of one
                L.hangs = r5Other(L.look, sumLook) || (!!L.look && r4Seen(L.judge.win.W) !== r4Seen(bySum.win.W));
                const was = r4Judge(L.door, L.walls.concat([L.door])); L.look4 = was.win ? r4Look(L.door, was.win) : null;   // what ROUND FOUR answered, by this suite's reading of round four, kept
                L.changed = r5Other(L.look, L.look4) || (!!L.look && r4Seen(L.judge.win.W) !== r4Seen(was.win.W));   // round five changed this layout's answer: another look, another width or nib, or a wall where there was none
            });
            const r3Flip = w => { const c = clone(w); c.pts = c.pts.slice().reverse(); return c; };   // the same line, drawn from its other end
            const r3Same = (hit, L) => {   // what a core's answer holds against the wall this suite expects, '' for nothing
                const W = L.wall; if (!W) return hit === null ? '' : 'a wall, where none meets the door';
                if (!hit || hit.over) return 'no wall';
                if (hit.color !== (hasOwn(L, 'colour') ? L.colour : String(W.color).toLowerCase())) return 'another wall\'s colour';
                if (hit.opacity !== r3Solid(W)) return 'another opacity';
                if (hit.tip !== (L.tip || r3Nib(W))) return 'another nib';
                if (L.width !== undefined && hit.width !== L.width && !(L.width !== r3Wide(W) && r3Close(hit.width, L.width))) return 'another width than ' + L.width;   // (bit for bit where it is the wall's own number)
                if (r3Plain(W) && r3Plain(L.door) && !L.tip && hit.width !== r3Wide(W)) return 'another number than the wall\'s own, for two lines never resized nor turned';
                return '';
            };
            const r5Reads = (hit, L) => {   // what this suite's own reading of the rule holds against the hand's want and against the core's answer, '' for nothing
                const J = L.judge, look = L.look;
                if (L.hangs) return 'the reading hangs on a sum of lengths that is 20 px within a billionth: it names another answer where the sum is taken as it comes out';
                if (!L.wall) return J.win ? 'the reading names a wall where the hand names none' : '';
                if (!J.win || r4Seen(J.win.W) !== r4Seen(L.wall)) return 'the reading names another look than the hand';
                if (L.tip && look.tip !== L.tip) return 'the reading names another nib than the hand';
                if (L.width !== undefined && !r3Close(look.width, L.width)) return 'the reading names another width than the hand: ' + look.width;
                if (L.drawn !== undefined && !r3Close(look.thick, L.drawn)) return 'the reading draws the copy another thickness than the hand: ' + look.thick;
                if (!hit || hit.over || hit.color !== look.color || hit.opacity !== look.opacity || hit.tip !== look.tip || !r3Close(hit.width, look.width)) return 'the core answers another look than the reading';
                return '';
            };
            await resetWorld(); await level();
            R3.forEach(L => { L.walls.forEach(w => { wbH().push(w); }); wbH().push(L.door); });
            const r3Set = (door, hit) => { if (!hit || hit.over) return; const c = FC.cleanSeenColor(hit.color), sw = FC.cleanSeenWidth(hit.width), so = FC.cleanSeenOpacity(hit.opacity), st = FC.cleanSeenTip(hit.tip); if (sw !== null) door.seenWidth = sw; if (so !== null) door.seenOpacity = so; if (st !== null) door.seenTip = st; if (c) door.seenColor = c; };   // as Properties' Match press sets them: each through its cleaner, the door's own look left alone
            R3.forEach(L => {
                L.hit = FC.secretMatch(L.door, wbH());   // as Properties' Match press asks: with the map's own pieces
                L.alone = FC.secretMatch(L.door, L.walls.concat([L.door]));   // ...with the layout's own pieces alone: nothing else on the map reaches it
                L.flipped = FC.secretMatch(r3Flip(L.door), L.walls.map(r3Flip));   // ...and with every line of it drawn from its other end
                r3Set(L.door, L.hit);
            });
            // a door drawn by hand with a bend in it, beside a flat wall: its copy is a ribbon that is thicker along one arm than along the other, and fogcore seenDrawn says both
            const bentPts = r3Steps([100, 100], [160, 100], 4).concat(r3Steps([163.2, 102.4], [220, 145], 4)), bentAt = [2400 + 700 * (R3.length % 8), 700 * Math.floor(R3.length / 8)];
            const bentWall = Object.assign(r3Line(R3_END, { color: '#5b5669', strokeWidth: 7, tip: 'flat' }), { id: 'r3_bent_a' }), bentDoor = Object.assign(r3Line(bentPts, {}), R3_DOOR, { id: 'r3_bent_door' });
            [bentWall, bentDoor].forEach(p => { p.x += bentAt[0]; p.y += bentAt[1]; wbH().push(p); });
            const bentHit = FC.secretMatch(bentDoor, wbH()); r3Set(bentDoor, bentHit);
            // rounds four and five: a door of two arms at a right angle, beside a flat wall. Round four read every stretch along its run over 40 px of LINE, so for arms 30 px long the
            // run at either arm took in 5 px of the other. ROUND FIVE reads a stretch of 20 px or more by its OWN direction, as the board draws it: three such doors, with arms of 30,
            // of 20 and of 19 px. Only the last is still read by its run
            const ARMS = [30, 20, 19].map((len, i) => {
                const at = [bentAt[0] + 700 * (i + 1), bentAt[1]], wall = Object.assign(r3Line(R3_END, { color: ['#5b5674', '#5b567a', '#5b567b'][i], strokeWidth: 7, tip: 'flat' }), { id: 'r5_arm' + len + '_a' }), door = Object.assign(r3Line([[100, 100], [100 + len, 100], [100 + len, 100 + len]], {}), R3_DOOR, { id: 'r5_arm' + len + '_door' });
                [wall, door].forEach(p => { p.x += at[0]; p.y += at[1]; wbH().push(p); });
                const hit = FC.secretMatch(door, wbH()); r3Set(door, hit);
                return { len, wall, door, hit };
            });
            await level(); const mapR = await wholeNow();
            const r3Off = R3.map(L => {   // what is not as told of a layout, first in the detail
                const bad = [], cd = mapR ? pieceIn(mapR, L.door.id) : null, cw = L.wall && mapR ? pieceIn(mapR, L.wall.id) : null, why = r3Same(L.hit, L), reads = r5Reads(L.hit, L);
                if (why) bad.push(['the core answers', why, L.hit && !L.hit.over ? [L.hit.color, L.hit.width, L.hit.opacity, L.hit.tip] : L.hit]);
                if (reads) bad.push(['this suite\'s own reading', reads, L.judge.found.map(f => [f.W.id.slice(-2), f.rank.join('')])]);
                if (JSON.stringify(L.alone) !== JSON.stringify(L.hit)) bad.push(['asked with its own pieces alone', L.alone]);
                if (JSON.stringify(L.flipped) !== JSON.stringify(hasOwn(L, 'turned') ? L.turned : L.hit)) bad.push(['with every line drawn from its other end', L.flipped]);   // (turned: the one layout whose answer is ANOTHER from the other end, an exact tie of two runs of one wall. Its row says what and why)
                if (!cd || (L.wall && !cw)) { bad.push('not sent'); return [L.id, bad]; }
                if (!wallLineOn(cd) || wallOdd(cd) !== '' || !bareOfSecret(cd) || cd.color === R3_DOOR.color) bad.push(['the copy is no plain wall line', lookSent(cd)]);
                if (!L.wall) { if (JSON.stringify(lookSent(cd)) !== JSON.stringify(['#3f3b47', L.door.strokeWidth, L.door.opacity, L.door.tip])) bad.push(['the copy of a door no wall meets', lookSent(cd)]); return bad.length ? [L.id, bad] : null; }
                if (bad.length || !L.look) return [L.id, bad.length ? bad : ['the reading names no wall']];
                const drawD = L.judge.win.drawD, drawn = penThick(cd, drawD);   // the way the door is drawn where the two meet, by the reading (round five: its stretch's own direction where that is 20 px or more, else its run), and how thick the copy is drawn along it
                if (cd.color !== (L.colour === null ? '#3f3b47' : cw.color) || JSON.stringify(cd.opacity) !== JSON.stringify(cw.opacity) || cd.tip !== L.look.tip) bad.push(['the copy and its wall', lookSent(cd), lookSent(cw)]);
                if (r3Plain(L.wall) && r3Plain(L.door) && L.look.tip === cw.tip && cd.strokeWidth !== cw.strokeWidth) bad.push(['the stored widths sent', cd.strokeWidth, cw.strokeWidth]);
                if (!r3Close(drawn, L.look.thick)) bad.push(['drawn where they meet', drawn, L.look.thick]);
                if (L.drawn !== undefined && !r3Close(drawn, L.drawn)) bad.push(['drawn', drawn]);
                const sd = typeof FC.seenDrawn === 'function' ? FC.seenDrawn(L.door) : 'no such function', own = r5Drawn(cd, cd.strokeWidth, cd.tip); if (!Array.isArray(sd) || sd.length !== 2 || !r3Close(sd[0], own[0]) || !r3Close(sd[1], own[1])) bad.push(['fogcore seenDrawn', sd, own]);
                return bad.length ? [L.id, bad] : null;
            }).filter(Boolean);
            const r3Of = id => R3.find(L => L.id === id), r3Count = f => R3.filter(f).length, r3Flips = R3.filter(L => !!L.flip).map(L => L.id), r5Flips = R3.filter(L => !!L.flip5).map(L => L.id), r5Hang = R3.filter(L => L.hangs).map(L => L.id), r5Changed = R3.filter(L => L.changed).map(L => L.id);
            check('host (Match a wall, rounds three to five): WHICH WALL ANSWERS. ' + R3.length + ' layouts of a secret door drawn as a line among wall lines are laid on the map, each in a part of its own, matched as Properties\' Match press does (fogcore secretMatch asked with the map\'s own pieces, each key through its cleaner) and sent in a whole copy of the map. Each answer was worked out by hand from the seven ranks as round five has them, and this suite\'s own reading of them (r5Judge) names the same look for every layout. (1) The LOOK that reaches BOTH of the door\'s ends: a door in a gap of its wall answers that wall though a wall of another look lies over one end and comes first, a touch at an end counts 2 and a near end 1, an end is touched within the wall\'s half and 4 px and near within 12, and walls drawn alike are one look whatever the case of a colour or the fourth decimal of a number, where two that differ in colour, width, opacity, nib or scale are two. An end that lies IN the wall\'s stroke, within its half and a pixel, is reached whatever the door\'s middle does. Any other end is not reached by a wall that passes the middle about as near, within half the way from that end to the middle and 12 px at the most. A door has two ends unless they lie within the lesser of 12 px and half its own length of each other. (2) A wall that is not aside before one that is: aside is a wall beside the door or across its middle, unless the two strokes overlap at the door\'s two ends and at its middle. (3) A wall that runs the door\'s own way, within 30 degrees, 30 included, a run being read over 40 px of line, the wall\'s also over 20 px on either side of its stretch, and the pair of stretches that speaks being the most alike of those within 4 px of the wall\'s nearest. (4) A wall the door touches, by half of each width and 4 px, before one it is only near. (5) A wall that ends at one of the door\'s ends before one that passes it. (6) The nearer. (7) The first in the map\'s list. Round four flipped ' + r3Flips.length + ' of them against round three (' + r3Flips.join(', ') + '). ROUND FIVE FLIPS ' + r5Flips.length + ' against round four (' + r5Flips.join(', ') + '), and each of those rows says what round four answered. By this suite\'s reading of round four, kept beside the new one (r4Judge), those are the very layouts whose answer round five changed, and no other. A wall that lies over one end of the door and on to its middle reaches that end. A door that arches off an uncut wall, and a straight door over the wall of a round room, are reached at both ends by that wall. A door drawn 5 px or 7.5 px off an uncut wall is not handed to the wall that stands across its far end. A straight door of 12 px or of 8 px, and a door bent double whose ends lie 11 px apart, have two ends. A wall that turns level 16, 20 or 24 px before the door runs the door\'s way, and one that turns 12 px before it does not. A wall whose corner lies 13 px before the door speaks by its level leg, and at 14 px by the leg that leans over the door. And five widths, which the next check tells. Beside them stand the two sides of each new bound: the margin at an end that is not in the stroke (half the way to the middle, 12 px at the most), the overlap of the strokes at each end and at the middle, a door of three sides whose ends lie 30 px apart (two ends) and 12 px apart (none). Held as the rule DECIDED, so that neither is taken for a new finding: a door 4.5 px off an uncut wall, past the one pixel an end is allowed, with walls of another look near both its ends, is answered by those walls, and a wall 8 px beside the door, past the overlap of the two strokes, is aside. A wall meets a door as far as half of each width and 12 px, a half held to 100 px: 19 px yes and 20 px no for a wall 6 wide, 116 px yes and 117 px no for a wall whose width is the text 1e16. A half is the width times the pen\'s factor along the line\'s own run: a level door or wall 20 wide with the flat nib is a ribbon 14.1 px thick, and reaches 7.07 px for its half where a round nib reaches 10. Each answer is the same asked with the layout\'s own pieces alone, and with every line drawn from its other end, but for ONE layout that shows a limit held as decided: where two of one wall\'s own runs are exactly as like the door\'s run the earliest counts, so a flat wall that arches under the door\'s end, its two legs falling away alike, meets the door drawn from one end and does not drawn from the other. No layout hangs on a sum of lengths that comes to 20 px within a billionth: the reading names the same answer with every sum taken as it comes out. In the copy sent, each door is a plain wall line in its wall\'s colour and opacity, with the nib the rule gives and none of the six keys, drawn where the two meet as thick as this suite\'s reading says. A door no wall meets leaves in the Wall material\'s colour at its own width, opacity and nib, and so does the door beside a wall whose colour is no colour',
                R3.length === 121 && r3Count(L => hasOwn(L, 'turned')) === 1 && r3Of('tie-first').turned === null && r3Count(L => L.want === null) === 5 && r3Count(L => L.want === 'b') === 16 && r3Count(L => L.want === 'c') === 4 && r3Flips.length === 11 && r5Flips.length === 17 && JSON.stringify(r5Changed) === JSON.stringify(r5Flips) && r5Hang.length === 0 && r3Off.length === 0 && !!mapR && oddWalls(mapR).length === 0 && secretLeak(mapR) === '' && !/#c3b2a9/i.test(JSON.stringify(mapR)),
                { wrong: r3Off.map(o => o[0]), first: r3Off[0] || null, rule: r3Off.length ? r3Of(r3Off[0][0]).why : '', hang: r5Hang, changed: r5Changed });
            const r3Widths = ['slant-round', 'slant-square', 'slant-flat', 'thin-flat-in', 'turned180', 'wide-slant', 'wide-upright', 'leg-level', 'door-leg-flat', 'hex-short'].map(id => [id, r3Of(id).hit ? r3Of(id).hit.width : 'no wall', mapR && pieceIn(mapR, r3Of(id).door.id) ? pieceIn(mapR, r3Of(id).door.id).strokeWidth : 'not sent', r3Wide(r3Of(id).wall)]);
            const sentOf = id => (mapR ? pieceIn(mapR, r3Of(id).door.id) : null), wallOf = id => (mapR ? pieceIn(mapR, r3Of(id).wall.id) : null);
            const r4Squares = ['thin-flat', 'both45', 'tall-flat', 'doorbig-flat', 'turned30', 'square', 'door-leg-tall'].map(id => { const d = sentOf(id), w = wallOf(id); return [id, d ? d.tip : 'not sent', w ? w.tip : 'not sent', d ? penThick(d, r3Of(id).judge.win.drawD) : NaN, w ? Math.max(1, penThick(w, r3Of(id).judge.win.drawD)) : NaN]; });   // the copies that took the square nib: [layout, the copy's nib, its wall's, how thick the copy is drawn along the door where they meet, how thick the wall's ribbon is there, a pixel at the least]
            const r4Flats = ['slant-flat', 'thin-flat-in', 'big-flat', 'doortwice-flat', 'turned180', 'door-step-flat', 'door-leg-flat', 'flatwall-in', 'cap-in'].map(id => [id, sentOf(id) ? sentOf(id).tip : 'not sent']);
            const r5Widths = [['door-step-flat', 6 * 18 / 20, 'flat'], ['hex-side', 3 * Math.sqrt(7), 'round'], ['door-leg-flat', 6, 'flat'], ['door-leg-tall', 6 * Math.SQRT1_2 / 3, 'square'], ['hook-wide', 12 * Math.hypot(19, 2) / Math.hypot(38, 2), 'round']].map(row => [row[0], r3Of(row[0]).hit ? r3Of(row[0]).hit.width : 'no wall', sentOf(row[0]) ? sentOf(row[0]).strokeWidth : 'not sent', row[1], sentOf(row[0]) ? sentOf(row[0]).tip : 'not sent', row[2]]);   // round five's three widths: [layout, the width Match answers, the width the copy is sent with, the hand's, the copy's nib, the hand's]
            check('host (Match a wall, rounds three to five): THE WIDTH, by this suite\'s own reading of a pen in vectors (penThick) and of the rule (r5Look). For two lines never resized nor turned it is the wall\'s own number bit for bit, whatever the nib and whatever angle they meet at: 7.3 for a wall met at 25 degrees with the round, the square and the flat nib, 7.3 again for a door whose box was turned upside down, and 1.42 for a flat wall whose ribbon along the door is just over a pixel. A STROKE, the round and the square nib, is matched as thick as the wall IS drawn where they meet. A wall resized to twice its size (6 stored) gives 12, a wall made three times as tall (4 stored) gives 12 to a door in line with it and to an upright door on its end, and a door resized to three times its size beside a wall 6 wide gives 2. Round four flipped the wall stretched one way and met at an angle: a level wall lengthened to twice its length is still drawn 6 thick, and gives its own 6, bit for bit, to a door that leaves it at 25 degrees and to an upright door on its end, where round three read the wall\'s pen along the door\'s run and answered more than 7 and 12. A wall with a corner gives the thickness of the leg that meets the door: 6 from its level leg and 12 from its upright one. A RIBBON, the flat nib, is matched as thick as the wall\'s nib draws along the DOOR where they meet, and stays flat only where the door\'s own box needs a nib no more than twice and no less than half as wide: exactly twice (a doubled wall, 12) and exactly half (a doubled door, 3) are still flat. Round four flipped the rest to the SQUARE nib at the thickness of the wall\'s ribbon, a pixel at the least: a wall three times as tall (round three: flat and 12), a door three times its size (flat and 2), a door turned by 30 degrees (flat), a flat wall and door that both run along the nib (flat and 8, which drew nothing: now a pixel) and a flat wall under a pixel thick along the door. Each of those copies leaves with the square nib where its wall leaves flat, drawn along the door as thick as the wall\'s ribbon is there. ROUND FIVE FLIPS FIVE WIDTHS. Each line is read AS DRAWN where they meet: a stretch of 20 px or more by its own direction, as the board draws it, and a shorter one by its run. A stretched wall that ends on the door with a side of a hex lattice, 30 px long and 30 degrees off the door, gives the thickness of that side, 3 times the root of 7, about 7.94, where round four read its run round the corner and answered about 6.66. A door that runs level for 25 px before it turns, beside a stretched flat wall, takes the wall\'s own 6 with the flat nib, where round four read the door\'s run across its corner and answered about 3.43. And for a door drawn by hand that begins with a pixel step, the stretch after the step speaks, being more like the wall and within 4 px of the nearest: 6 times 18 over 20, where round four answered 6 times 15 over 17. The door\'s own box is read along the door as drawn too: the door with the level 25 px in a box made three times as tall takes the square nib at a third of the ribbon\'s thickness, about 1.41, where round four answered about 0.99. And a stretch under 20 px is still read by its run: a stretched wall that ends on the door in pixel steps straight up gives about 6.02, by the run of the step that speaks, where its own direction would give 12 and round four, which let another step speak, gave about 6.27. For each layout fogcore seenDrawn says the thinnest and the thickest the copy is drawn over the door\'s own stretches, as this suite reads them',
                r3Widths.every(r => r[1] === r[3] && r[2] === r[1]) && JSON.stringify(r3Widths.map(r => r[1])) === JSON.stringify([7.3, 7.3, 7.3, 1.42, 7.3, 6, 6, 6, 6, 6])
                && r4Squares.every(r => r[1] === 'square' && r[2] === 'flat' && r3Close(r[3], r[4])) && r4Flats.every(r => r[1] === 'flat') && ['big-round', 'tall-round', 'doorbig-round', 'tall-upright', 'leg-upright'].every(id => !!sentOf(id) && sentOf(id).tip === 'round' && r3Close(sentOf(id).strokeWidth, r3Of(id).width))
                && r3Count(L => !!L.flip && (L.width !== undefined || !!L.tip)) === 7 && r3Count(L => !!L.flip5 && L.width !== undefined) === 5 && r5Widths.length === 5 && r5Widths.every(r => r3Close(r[1], r[3]) && r3Close(r[2], r[3]) && r[4] === r[5]) && r3Off.length === 0,
                { r3Widths, r4Squares, r4Flats, r5Widths, wrong: r3Off.map(o => o[0]) });
            const bentCopy = mapR ? pieceIn(mapR, 'r3_bent_door') : null, bentSegs = FC.pathSegs(bentDoor), bentThick = bentCopy ? bentSegs.map(s => penThick(bentCopy, [s[2] - s[0], s[3] - s[1]])) : [], bentLo = Math.min.apply(null, bentThick), bentHi = Math.max.apply(null, bentThick), bentSd = typeof FC.seenDrawn === 'function' ? FC.seenDrawn(bentDoor) : null;
            const armFull = 7 * Math.SQRT1_2, armRun19 = 7 * Math.SQRT1_2 * 8.5 / Math.hypot(19, 10.5), armWant = { 30: armFull, 20: armFull, 19: armRun19 };   // (by hand: an arm of 20 px or more is read by its own direction, along which a ribbon 7 wide is the root of a half of 7 thick. An arm of 19 px is read by its run: over 40 px of line it goes 19 one way and 10.5 the other, and the ribbon is the root of a half of 7 times the difference of the two over the run's length)
            const armRead = ARMS.map(a => { const copy = mapR ? pieceIn(mapR, a.door.id) : null; return { len: a.len, hit: a.hit, wall: a.wall.color, copy: lookSent(copy), sd: typeof FC.seenDrawn === 'function' ? FC.seenDrawn(a.door) : null, own: copy ? r5Drawn(copy, copy.strokeWidth, copy.tip) : [NaN, NaN], each: copy ? [penThick(copy, [1, 0]), penThick(copy, [0, 1])] : [NaN, NaN] }; });
            const armOff = armRead.filter(a => !(JSON.stringify(a.hit) === JSON.stringify({ color: a.wall, width: 7, opacity: 1, tip: 'flat' }) && JSON.stringify(a.copy) === JSON.stringify([a.wall, 7, 'none', 'flat']) && Array.isArray(a.sd) && a.sd.length === 2 && r3Close(a.sd[0], armWant[a.len]) && r3Close(a.sd[1], armWant[a.len]) && r3Close(a.own[0], armWant[a.len]) && r3Close(a.own[1], armWant[a.len]) && r3Close(a.each[0], armFull) && r3Close(a.each[1], armFull)));
            check('host (Match a wall, rounds three to five): a door drawn by hand with a bend in it, level for 60 px and then down at 37 degrees, beside a flat wall 7 wide never resized: its copy leaves flat and 7 wide, as its wall. A ribbon is not equally thick along both arms: by this suite\'s own reading the copy is drawn about 4.95 px thick along the level arm and about 0.99 px along the other. fogcore seenDrawn answers those two, the thinnest first and the thickest second, which is what Properties tells the GM. ROUND FIVE FLIPS what it says of a door of two arms 30 px long each, at a right angle, beside the same kind of wall. A stretch of 20 px or more is read by its own direction, as the board draws it, so seenDrawn answers about 4.95 px twice, which is how thick each arm is drawn. Round four read each arm along its run over 40 px of line, which took in 5 px of the other arm, and said about 4.07 px. Arms of exactly 20 px are read the same way, 4.95 twice. Arms of 19 px are still read by their run, which goes 19 one way and 10.5 the other: seenDrawn says about 1.94 px twice where each arm is drawn about 4.95 px thick. That is the rule as decided for a stretch under 20 px, held here so that it is not taken for a new finding. Each of the three copies leaves flat and 7 wide too, in its wall\'s colour and with no opacity',
                JSON.stringify(bentHit) === JSON.stringify({ color: '#5b5669', width: 7, opacity: 1, tip: 'flat' }) && !!bentCopy && bentCopy.strokeWidth === 7 && bentCopy.tip === 'flat' && bentCopy.color === '#5b5669' && bentSegs.length > 20 && r3Close(bentHi, 7 * Math.SQRT1_2) && r3Close(bentLo, 7 * Math.SQRT1_2 * 0.2)
                && Array.isArray(bentSd) && bentSd.length === 2 && r3Close(bentSd[0], bentLo) && r3Close(bentSd[1], bentHi) && bentSd[0] < bentSd[1]
                && ARMS.length === 3 && armOff.length === 0 && r3Close(armRun19, 1.9382) && armFull > 2 * armRun19,
                { bentHit, bentSd, own: [bentLo, bentHi], copy: lookSent(bentCopy), armOff: armOff.map(a => [a.len, a.hit, a.copy, a.sd, a.own, a.each]), armWant });
            // The same reading over seeded figures: a door among wall lines of two looks, in fifteen families. Ten are round four's (a gap, a T, an L, a corridor, a line beside, a free end,
            // slanted walls, a wall across the middle, a wall in line at each end, a wall that stops short of one end and one that runs through the other). Five are for what ROUND FIVE
            // changed: a door drawn OVER an uncut wall a few pixels off with a wall of another look at its far end (an end in the stroke, the overlap of the strokes), a straight door
            // over a wall that BOWS away under its middle (the same, whatever the middle does), a wall that TURNS a corner 6 to 32 px before the door (the half run), a wall with a
            // KNEE, its corner a few pixels before the door and its other leg leaning away over it (the pair that speaks), and a SHORT door of 6 to 13 px in a gap of its wall (two
            // ends by half its length). Level or turned, each line drawn with two points a stretch or by hand with a slip at its two ends, some of the lines resized, each figure
            // asked of fogcore with its own pieces. A generator of its own: the run's own seeded generator is not touched, so the probes after this are the probes they were.
            // NOT JUDGED, and counted: a figure in which some bound of the rule is met or missed by under a millionth (r5Judge's note), one in which two looks tie in every rank and
            // their gaps differ by under a millionth, and one that HANGS ON A SUM: the reading names another answer when it is asked with edge 'sum' (see its heading). In such a
            // figure the core must still answer one of the two, and which is counted
            let r5Seed = 20261012; const r5Rnd = () => { r5Seed = (r5Seed * 1664525 + 1013904223) >>> 0; return r5Seed / 4294967296; }, r5Pick = a => a[Math.floor(r5Rnd() * a.length)];
            const R5_LOOKS = [{ color: '#50506a', strokeWidth: 6, tip: 'round' }, { color: '#70507a', strokeWidth: 6, tip: 'round' }, { color: '#50706a', strokeWidth: 3, tip: 'square' }, { color: '#30306a', strokeWidth: 16, tip: 'round' }, { color: '#30606a', strokeWidth: 8, tip: 'flat' }];
            const R5_FAMS = ['gap', 'tee', 'ell', 'corridor', 'beside', 'free', 'slant', 'cross', 'inline', 'through', 'over', 'bow', 'turn', 'knee', 'short'];
            const r5Figure = () => {
                const fam = r5Pick(R5_FAMS), slip = r5Pick([0.7, 1.3, 2.1, 3.2, 5.3]), la = r5Pick(R5_LOOKS), lb = r5Pick(R5_LOOKS.filter(l => l !== la)), len = fam === 'short' ? r5Pick([6.2, 8.4, 11.3, 12.6]) : r5Pick([20.5, 41, 62, 93]), ang = r5Pick([0, 0, 0.3, 0.52, 1.0]), byHand = r5Rnd() < 0.6, off = r5Pick([5.3, 8.6, 14.2, 20.9]);
                const co = Math.cos(ang), si = Math.sin(ang), at = p => [300 + p[0] * co - p[1] * si, 300 + p[0] * si + p[1] * co];
                const hand = pts => { const all = []; for (let i = 1; i < pts.length; i++) r3Steps(pts[i - 1], pts[i], 4).forEach((p, n) => { if (i === 1 || n > 0) all.push(p); }); return all.map((p, i) => { const e = i === 0 || i === all.length - 1 ? slip : 0.6; return [p[0] + (r5Rnd() * 2 - 1) * e, p[1] + (r5Rnd() * 2 - 1) * e]; }); };   // a line as a hand draws it through those corners: a point every 4 px, each a little off, its two ends by as much as the slip
                const mk = (pts, look) => r3Line(byHand ? hand(pts.map(at)) : pts.map(at), look);
                const door = Object.assign(mk([[0, 0], [len, 0]], {}), R3_DOOR, fam !== 'short' && r5Rnd() < 0.2 ? { strokeWidth: 20 } : {}, r5Rnd() < 0.15 ? { tip: 'flat' } : {}), walls = [];
                if (fam === 'gap') { walls.push(mk([[-80, 0], [0, 0]], la), mk([[len, 0], [len + 80, 0]], la)); if (r5Rnd() < 0.6) walls.push(mk([[len / 2 - 30, off], [len / 2 + 60, off]], lb)); if (r5Rnd() < 0.4) walls.push(mk([[0, -60], [0, 60]], lb)); }
                if (fam === 'tee') walls.push(mk([[-90, 0], [0, 0]], la), mk([[len, -70], [len, 70]], lb));
                if (fam === 'ell') walls.push(mk([[-90, 0], [0, 0]], la), mk([[len, 0], [len, 80]], lb));
                if (fam === 'corridor') walls.push(mk([[0, -90], [0, 90]], la), mk([[len, -90], [len, 90]], la), mk([[-20, off], [len + 20, off]], lb));
                if (fam === 'beside') walls.push(mk([[-90, 0], [0, 0]], la), mk([[-10, off], [len + 10, off]], lb));
                if (fam === 'free') walls.push(mk([[-90, 0], [-r5Pick([0, 3.3, 8.6, 14.2]), 0]], la), mk([[len + r5Pick([0, 6.4, 13.1]), -40], [len + 40, 30]], lb));
                if (fam === 'slant') walls.push(mk([[-70, -40], [0, 0]], la), mk([[len, 0], [len + 60, 45]], lb));
                if (fam === 'cross') walls.push(mk([[len / 2, -50], [len / 2, 50]], la), mk([[-60, 0], [-r5Pick([0, 5.3]), 0]], lb));
                if (fam === 'inline') walls.push(mk([[-90, 0], [-r5Pick([1.7, 6.4, 9.3, 13.1]), 0]], la), mk([[len + r5Pick([1.7, 6.4, 9.3, 13.1]), 0], [len + 90, 0]], lb));
                if (fam === 'through') walls.push(mk([[0, -70], [0, -r5Pick([0.4, 2.3, 6.1, 11.2])]], la), mk([[len, -60], [len, 60]], lb));
                if (fam === 'over') { const o = r5Pick([0, 2.2, 3.4, 5.1, 6.8, 9.3]); walls.push(mk([[-80, o], [len + 80, o]], la), r5Rnd() < 0.5 ? mk([[len, 0], [len, 80]], lb) : mk([[len, -60], [len, 60]], lb)); }
                if (fam === 'bow') { const sag = r5Pick([3.1, 6.2, 11.4]); walls.push(mk([[-60, -2 * sag], [0, 0], [len / 2, sag], [len, 0], [len + 60, -2 * sag]], la), mk([[len, 0], [len, 70]], lb)); }
                if (fam === 'turn') { const arm = r5Pick([6.3, 12.4, 16.2, 20.3, 24.4, 31.7]); walls.push(mk([[-arm, -70], [-arm, 0], [0, 0]], la), mk([[len, 0], [len, 80]], lb)); }
                if (fam === 'knee') { const d = r5Pick([3.3, 5.2, 9.1, 13.3, 14.6]); walls.push(mk([[-120, 0], [-d, 0], [70 - d, -70]], la), mk([[len, 0], [len, 80]], lb)); }
                if (fam === 'short') walls.push(mk([[-70, 0], [0, 0]], la), mk([[len, 0], [len + 70, 0]], la), mk([[-30, 4], [0, 0]], lb));
                if (r5Rnd() < 0.5) walls.reverse();
                const resize = w => { if (r5Rnd() < 0.25) { const sx = r5Pick([0.6, 1, 1.7, 2.6]), sy = r5Pick([0.6, 1, 1.7, 2.6]); w.baseW = w.w / sx; w.baseH = w.h / sy; w.pts = w.pts.map(q => [q[0] / sx, q[1] / sy]); } };   // the same line on the board, in a box that was resized
                walls.forEach((w, i) => { resize(w); w.id = 'r5_fig_' + i; }); resize(door); door.id = 'r5_fig_door';
                return { fam, door, list: walls.concat([door]) };
            };
            const r5Tally = { figures: 0, judged: 0, edge: 0, hang: 0, hangSum: 0, hangKeep: 0, none: 0, decided: [0, 0, 0, 0, 0, 0, 0], notFirst: 0, notNearest: 0, square: 0, fams: {}, r5: { endIn: 0, kept: 0, half: 0, far: 0, short: 0, own: 0 }, changed: 0, changedWall: 0, changedIn: {} }, r5Parts = [];
            const r5Is = (hit, look) => (!look ? hit === null : !!hit && !hit.over && hit.color === look.color && hit.opacity === look.opacity && hit.tip === look.tip && r3Close(hit.width, look.width));   // the core answers that very look, or no wall where there is none
            for (let n = 0; n < 2000; n++) {
                const fig = r5Figure(), note = {}, J = r5Judge(fig.door, fig.list, note), look = J.win ? r5Look(fig.door, J.win, note) : null, hit = FC.secretMatch(fig.door, fig.list);
                const S = r5Judge(fig.door, fig.list, null, 'sum'), sLook = S.win ? r5Look(fig.door, S.win) : null;   // the same asked with every sum of lengths taken as it comes out
                r5Tally.figures++;
                if (!look !== !sLook || (!!look && (look.color !== sLook.color || look.opacity !== sLook.opacity || look.tip !== sLook.tip || !r3Close(look.width, sLook.width)))) {
                    r5Tally.hang++; if (r5Is(hit, sLook)) r5Tally.hangSum++; else if (r5Is(hit, look)) r5Tally.hangKeep++; else r5Parts.push([n, fig.fam, 'hangs on a sum, and the core answers neither of the two', hit && [hit.color, hit.width, hit.tip]]);
                    continue;
                }
                const rivals = J.win ? J.found.filter(f => f.look !== J.win.look) : [], tie = rivals.some(f => f.rank.join() === J.win.rank.join() && Math.abs(f.near - J.win.near) < 1e-6);
                if (note.edge < 1e-6 || tie) { r5Tally.edge++; continue; }
                r5Tally.judged++; r5Tally.fams[fig.fam] = (r5Tally.fams[fig.fam] || 0) + 1;
                { const J4 = r4Judge(fig.door, fig.list), look4 = J4.win ? r4Look(fig.door, J4.win) : null; if (r5Other(look, look4)) { r5Tally.changed++; r5Tally.changedIn[fig.fam] = (r5Tally.changedIn[fig.fam] || 0) + 1; if (!look4 || !look || look4.color !== look.color) r5Tally.changedWall++; } }   // what round four answered there, by this suite's reading of round four, kept
                if (!J.win) { r5Tally.none++; if (hit !== null) r5Parts.push([n, fig.fam, 'a wall, where none meets the door']); continue; }
                if (!r5Is(hit, look)) r5Parts.push([n, fig.fam, hit && [hit.color, hit.width, hit.tip], [look.color, look.width, look.tip], J.found.map(f => [f.W.id.slice(-1), f.rank.join('')])]);
                if (look.tip !== r3Nib(J.win.W)) r5Tally.square++;
                Object.keys(r5Tally.r5).forEach(k => { if (J.found.some(f => f.r5[k])) r5Tally.r5[k]++; });   // round five's own rules, wherever one shows in the judging of a wall of this figure
                if (rivals.length) {   // which rank told the winner from the best wall of another look
                    const best = rivals.reduce((b, f) => { const i = f.rank.findIndex((v, k) => v !== b.rank[k]); return (i >= 0 ? f.rank[i] > b.rank[i] : f.near < b.near) ? f : b; }), by = J.win.rank.findIndex((v, k) => v !== best.rank[k]);
                    r5Tally.decided[by >= 0 ? by : J.win.near !== best.near ? 5 : 6]++;
                    if (J.found.indexOf(J.win) > J.found.indexOf(best)) r5Tally.notFirst++;
                    if (rivals.some(f => f.near < J.win.near - 1e-6)) r5Tally.notNearest++;
                }
            }
            check('host (Match a wall, rounds four and five): the seven ranks and the width over 2000 seeded figures. A door among wall lines of two looks, in fifteen families. Ten are round four\'s: a gap of its wall, a T, an L, a corridor, a line beside it, a free end, slanted walls, a wall across its middle, a wall in line at each end, a wall that stops short of one end and one that runs through the other. Five are for what ROUND FIVE changed: a door drawn over an uncut wall up to 9 px off with a wall of another look at its far end, a straight door over a wall that bows away under its middle, a wall that turns a corner 6 to 32 px before the door, a wall whose corner lies a few pixels before the door with its other leg leaning away over it, and a short door of 6 to 13 px in a gap of its wall. Level or turned, drawn with two points a stretch or by hand with a slip of up to 5 px at each end, a quarter of the lines resized, the door at times 20 wide or flat. For every figure judged, fogcore secretMatch, asked with the figure\'s own pieces, answers the very look this suite\'s own reading of the rule names (r5Judge for the wall, r5Look for its width and nib), or no wall where the reading finds none. A figure in which a bound of the rule is met or missed by under a millionth, or two looks tie in every rank within a millionth of a pixel, is not judged: more than eight figures in ten are, and each family in at least 90 figures. Nor is a figure that HANGS ON A SUM, one whose answer is another where a run that was read over 20 px of line to within a billionth is left out, as it is wherever the sum of its lengths comes out a hair under 20: there are few, and in each the core answers one of the two. The figures are no easy ones: in hundreds the wall that answers is not the nearest of another look, in hundreds it is not the first in the list, each of the first five ranks tells the winner from the best wall of another look in a count of figures, and some copies take the square nib from a flat wall. And each of round five\'s own rules shows in the judging of a count of them: an end in the stroke of a wall that round four would not have counted, a wall beside the door or across it that the overlap of the strokes keeps from being aside, a run of 20 px that counts before the runs of 40, a pair that speaks that is not the nearest, a door of 12 px or less with two ends, and a stretch drawn another way than its run. By this suite\'s reading of round four, kept beside the new one (r4Judge, r4Look), ROUND FIVE CHANGED THE ANSWER in more than 200 of the figures judged, the wall that answers in more than 100 of them, and the answer of a count of figures in each of the five new families',
                r5Tally.figures === 2000 && r5Tally.judged >= 1700 && R5_FAMS.length === 15 && R5_FAMS.every(f => r5Tally.fams[f] >= 90) && r5Parts.length === 0 && r5Tally.hang <= 20 && r5Tally.hangSum + r5Tally.hangKeep === r5Tally.hang
                && r5Tally.notNearest >= 300 && r5Tally.notFirst >= 400 && r5Tally.decided.slice(0, 5).every(n => n >= 20) && r5Tally.square >= 20
                && r5Tally.r5.endIn >= 60 && r5Tally.r5.kept >= 50 && r5Tally.r5.half >= 300 && r5Tally.r5.far >= 300 && r5Tally.r5.short >= 30 && r5Tally.r5.own >= 10
                && r5Tally.changed >= 200 && r5Tally.changedWall >= 100 && r5Tally.changedIn.over >= 25 && r5Tally.changedIn.bow >= 30 && r5Tally.changedIn.turn >= 15 && r5Tally.changedIn.knee >= 20 && r5Tally.changedIn.short >= 12,
                { tally: r5Tally, parts: r5Parts.slice(0, 3) });
        }
        await resetWorld(); await level();   // the doors are the GM's secrets again, and the table's copy level with them
    }
    {   // the GM never saw a raw hostile string in markup: the roster, the players panel, the chat
        await resetWorld(); resetRec();
        drainDialogs(); resetRec();
        const cH = connect('peer_hostile'); hello(cH, { id: 'u_hostile', name: CANARY + '" onmouseover="x', color: 'red' }); flushTimers();
        const dlg = rec.confirms[rec.confirms.length - 1]; if (dlg) { dlg.answered = true; dlg.cb(true); } flushTimers(); await drain();
        document.getElementById('netPlayersBtn').click();
        const raw = rec.html.filter(h => h.v.indexOf(CANARY) >= 0);
        check('host: a hostile player name reaches the roster and the Players panel escaped, never raw', raw.length === 0 && rec.html.some(h => /FUZZCANARY/.test(h.v)), raw.slice(0, 1));
        if (net.roster.peer_hostile) net.kickPlayer('peer_hostile'); flushTimers();
    }
    // every host dialog shown in the run is a known one
    check('host: every dialog raised was a join request or a Start-combat offer', rec.confirms.concat([]).every(c => /wants to join|Start combat/.test(c.text)) && [...confirmsBy.keys()].every(k => /^(hello|target)\|/.test(k)), [...confirmsBy.keys()].slice(0, 5));

    {   // a map renamed just before an admission (its save had not run yet): the players already at the table hear of it at that admission
        await resetWorld(); drainDialogs(); resetRec();
        const campR = stubs.getActiveCampaign(); stubs.save(false);
        const stubsTo = (c, n0) => c.sent.slice(n0).filter(m => m.type === 'item' && m.itemId === 'm_fog').map(m => (m.item && m.item.stub === true ? 'stub:' : 'whole:') + (m.item && m.item.meta && m.item.meta.title));
        let nR = conns.p1.sent.length; campR.items.m_fog.meta.title = 'Cellar, renamed'; stubs.save(false);
        const control = stubsTo(conns.p1, nR);   // the ordinary way: a rename, then the GM's save
        nR = conns.p1.sent.length; campR.items.m_fog.meta.title = 'Cellar, renamed again';   // a rename whose save has not run when a returning player is admitted by their proof
        const c3 = connect('peer_p3x'), a3 = await admit(c3, { id: 'u_p3', name: 'Cato' }, K3), atAdmit = stubsTo(conns.p1, nR), snap3 = c3.sent.find(m => m.type === 'snapshot');
        const early3 = c3.sent.slice(0, c3.sent.indexOf(snap3)).filter(m => m.type === 'item').length;
        stubs.save(false); stubs.save(false);
        check('host: a map renamed just before an admission (the real admitPlayer) reaches the players already at the table as its stub afresh, at that admission — once, not again at the saves that follow — while the newcomer reads the new name in their snapshot and is sent no map before it',
            a3.ok && JSON.stringify(control) === JSON.stringify(['stub:Cellar, renamed']) && JSON.stringify(atAdmit) === JSON.stringify(['stub:Cellar, renamed again']) && JSON.stringify(stubsTo(conns.p1, nR)) === JSON.stringify(['stub:Cellar, renamed again'])
            && !!snap3 && snap3.appState.campaigns.c1.items.m_fog.meta.title === 'Cellar, renamed again' && snap3.appState.campaigns.c1.items.m_fog.stub === true && early3 === 0,
            { admitted: a3.ok, control, atAdmit, after: stubsTo(conns.p1, nR), snapTitle: snap3 && snap3.appState.campaigns.c1.items.m_fog.meta.title, early3 });
        campR.items.m_fog.meta.title = 'Dark Cellar'; stubs.save(false);
        c3.close(); flushTimers(); await drain(); drainDialogs(); resetRec();
    }

    /* =================================================== CLIENT WORLD =================================================== */
    console.log('# client world');
    // the host instance leaves; a second instance of net.js is loaded as the player's app (its own module state)
    net.leaveSession(true); flushTimers();
    installStubs(); window.wpStream = false; window.wpPopout = false;
    localStorage.clear(); localStorage.setItem('wp_profile', JSON.stringify({ id: 'u_p1', name: 'Ayla', color: '#112233' }));
    localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: K1 }));
    const own = { activeCampaignId: 'camp_tutorial', campaigns: { camp_tutorial: { id: 'camp_tutorial', name: 'My Own', activeItemId: 'home', items: { home: { id: 'home', type: 'map', meta: { title: 'Home' }, whiteboard: [{ id: 'mytok', type: 'circle', isChar: true, ownerId: 'u_p1', x: 1, y: 1, w: 50, h: 50 }], rooms: [], links: [] } }, chars: {} } } };
    stateMod.state.appState = clone(own);
    let cnet;
    try { cnet = factory(stateMod.state, stubs.getActiveCampaign, stubs.findLandingRoom, stubs.landingPoint, stubs.getActiveMap, stubs.save, stubs.toast, stubs.load, stubs.updateCampaignSelect, stubs.updateSidebarNav, stubs.showConfirm); }
    catch (e) { console.log('FAIL      net.js (client instance) threw while loading: ' + e.message); cnet = null; }
    check('a second instance of net.js loads as the player\'s app', !!cnet && window.wpNet === cnet);
    await window.wpVersionReady; await drain(); flushTimers();
    resetRec(); warned.length = 0;
    document.getElementById('netCodeInput').value = 'abcdef'; document.getElementById('netNameInput').value = 'Ayla';
    document.getElementById('netJoinBtn').click();
    const cpeer = peers[peers.length - 1]; cpeer.emit('open'); flushTimers();
    const hconn = cpeer.conns[0]; hconn.emit('open'); flushTimers(); await drain();
    check('the join runs through the real Join button: a hello with this player\'s profile goes out, carrying no key and no proof (a known name is challenged first)', !!hconn && hconn.sent.some(m => m.type === 'hello' && m.profile && m.profile.id === 'u_p1' && !('key' in m) && !('proof' in m)) && !hconn.sent.some(m => JSON.stringify(m).indexOf(K1) >= 0) && cnet.role === 'client' && cnet.active === true, hconn && hconn.sent.map(m => m.type));
    const staleConn = new Conn(hconn.peer + '-stale');   // a connection kept wired after a reconnect (never conns[0])
    const otherConn = new Conn('waypoint-other');        // a host other than the one this player is synced to

    const ctpl = {
        'snapshot': snapshotForClient,
        'charStyle': { type: 'charStyle', campId: 'c1', id: 'c_p1', looks: { f_class: { fmt: { b: true }, sig: win.wpLook.textSig('Ranger') }, f_gmword: { fmt: { b: true }, sig: win.wpLook.textSig('the secret word') } } }, 'charstyle-ack': { type: 'charstyle-ack', rid: 'x3' }, 'charstyle-deny': { type: 'charstyle-deny', rid: 'x4', reason: 'stale' },   // item 35: first, while the app still holds the host's copy of the character as the snapshot left it
        'item': { type: 'item', campId: 'c1', itemId: 'm_open', item: snapshotForClient.appState.campaigns.c1.items.m_open, ack: 1 },
        'item-fog': mfogForClient || { type: 'item', campId: 'c1', itemId: 'm_fog', item: { id: 'm_fog', type: 'map', meta: { title: 'Dark Cellar' }, fog: { on: true, cell: 50 }, whiteboard: [], rooms: [], links: [] } },   // the fogged map whole, as the host gave it when the player arrived there
        'item-doc': { type: 'item', campId: 'c1', itemId: 'd_notes', item: { id: 'd_notes', type: 'doc', meta: { title: 'Notes' }, blocks: [{ id: 'b1', type: 'p', text: CANARY }] } },
        'item-planner': { type: 'item', campId: 'c1', itemId: 'pl_x', item: { id: 'pl_x', type: 'planner', meta: { title: CANARY }, content: '<script>1</script>' } },
        'itemDelta': { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: [{ id: 'tok_npc', type: 'circle', isChar: true, x: 10, y: 10, w: 50, h: 50, secret: true, seenColor: '#112233', seenTexture: 'grass', seenWidth: 6, seenOpacity: 0.5, seenTip: 'flat' }], del: ['tok_npc2'], order: ['tok_p1', 'tok_npc'] }, meta: { title: 'Renamed', gridType: 'hex', cell: 1e300, bg: 'http://evil/x.png' }, links: [['a', 'b', 1, { label: 'L', notes: 'n' }]], cats: { c1: { color: 'red' } }, ack: 2 },
        'itemGone': { type: 'itemGone', campId: 'c1', itemId: 'm_fog' },
        'mapBack': { type: 'mapBack', campId: 'c1', itemId: 'm_fog', meta: { title: CANARY, playerLock: true, parentId: 'm_open', sortIndex: 2 } },   // possession: a map the player left is taken back — its stub in its place
        'mapBack-shown': { type: 'mapBack', campId: 'c1', itemId: 'm_open', meta: { title: 'Open Field' }, item: { id: 'm_open', type: 'map', whiteboard: [{ id: 'evil', type: 'text', text: CANARY }] }, whiteboard: [{ id: 'evil2', type: 'text', text: CANARY }] },   // the map on screen, with a map riding in the word: no honest host sends either
        'stage': { type: 'stage', stage: { campId: 'c1', itemId: 'm_open' }, personal: true },
        'pause': { type: 'pause', on: true }, 'pausePlayer': { type: 'pausePlayer', on: false }, 'snap': { type: 'snap', on: true },
        'stance': { type: 'stance', flags: { elevation: true, posture: false }, camps: {}, campId: 'c1' },
        'travelLock': { type: 'travelLock', on: false }, 'travelDenied': { type: 'travelDenied', reason: 'closed', map: 'Cellar' },
        'handout': { type: 'handout', kind: 'text', text: 'note', title: 'T', caption: 'c', id: 'sh_1', campId: 'c1', gmId: 'u_gm', look: { fmt: { b: true }, font: 'Lora', sig: win.wpLook.textSig('note') } },   // item 35, fold 2b: a page may come with a look
        'notepad': { type: 'notepad', on: true, text: 'hi', campId: 'c1', gmId: 'u_gm', campaign: 'C', gm: 'GM', look: { fmt: { b: true, spans: [{ s: 0, e: 1, link: 'https://a.example/' }] }, font: 'Lora', sig: win.wpLook.textSig('hi') } },   // item 35, fold 3a: the pad may come with a look, so the seeded mutations reach its cleaner
        'combats': { type: 'combats', combats: { m_open: { mapId: 'm_open', round: 1, turn: 0, rows: [{ id: 'row_p1', name: 'Ayla', tokId: 'tok_p1' }, { id: 'row_npc', name: 'Orc', tokId: 'tok_npc' }] } } },
        'targets': { type: 'targets', targets: { u_p2: { id: 'tok_npc', mapId: 'm_open', name: 'Bram' } } },
        'pos': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p2', x: 200, y: 210, rot: 45, front: 0, final: true },
        'pos-own': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 90, y: 90, rot: 0, front: 0, final: true, ack: 3 },
        'wait': { type: 'wait' }, 'auth': { type: 'auth', gmId: 'u_gm', nonce: 'n'.repeat(32) },
        'gmhello': { type: 'gmhello', gmId: 'u_gm', gmPub: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'B'.repeat(43) }, sig: 'f'.repeat(128) },   // the host's early proof: read before the snapshot only (after it the branch is inert by design)
        'denied': { type: 'denied', reason: 'no', update: false }, 'kicked': { type: 'kicked' }, 'end': { type: 'end' },
        'char-upload-ans': { type: 'char-upload-ans', rid: 'u1', n: 1, auto: 0, left: 0 }, 'char-pic-ans': { type: 'char-pic-ans', rid: 'p1', ok: true },
        'char-make-ans': { type: 'char-make-ans', rid: 'm1', ok: true, charId: 'c_new' }, 'tok-light-ans': { type: 'tok-light-ans', rid: 'l1', reason: 'cap' },
        'char-review': { type: 'char-review', outcome: 'back', name: 'Ayla', note: 'fix it' }, 'char-upload-done': { type: 'char-upload-done', charId: 'c_p1', done: 1, of: 2 },
        'chars': { type: 'chars', campId: 'c1', chars: { c_p1: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', values: { f_str: 15, f_class: 'Ranger' }, looks: { f_class: { fmt: { u: true }, sig: win.wpLook.textSig('Ranger') } } }, c_p2: { id: 'c_p2', name: 'Bram', ownerId: 'u_p2', partial: true, values: { f_class: 'Bard' }, looks: { f_class: { fmt: { u: true }, sig: win.wpLook.textSig('Bard') } } } } },
        'char': { type: 'char', campId: 'c1', char: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', values: { f_str: 16, f_class: 'Ranger' }, looks: { f_class: { fmt: { st: true }, sig: win.wpLook.textSig('Ranger') } } } },
        'charDelta': { type: 'charDelta', campId: 'c1', id: 'c_p1', values: { f_str: 17, f_gmfig: 5 }, unseen: [] },
        'charGone': { type: 'charGone', campId: 'c1', id: 'c_p2' }, 'char-ack': { type: 'char-ack', rid: 'x1' }, 'char-deny': { type: 'char-deny', rid: 'x2', reason: 'slow', msg: 'm' },
        'door-deny': { type: 'door-deny', reason: 'locked' },
        'system': { type: 'system', campId: 'c1', system: snapshotForClient.appState.campaigns.c1.system },
        'docStyle': { type: 'docStyle', campId: 'c1', docStyle: { font: 'serif', textColor: '#112233' } },
        'campFog': { type: 'campFog', campId: 'c1', fog: { sight: 'f_dsv', emptyFog: true } },
        'clock': { type: 'clock', campId: 'c1', clock: { t: 3600, notes: [{ id: 'n_1', day: 1, text: 'Market' }] } },
        'fogDiff': { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', add: [{ item: { id: 'tok_new', type: 'circle', isChar: true, x: 1, y: 1, w: 50, h: 50, secret: true, seenColor: '#112233', seenTexture: 'grass', seenWidth: 6, seenOpacity: 0.5, seenTip: 'flat' }, after: null }], drop: ['tok_far'], lit: [], capped: false, marks: [{ c: 3, r: 3, k: 1, s: 1 }] },   // item 19b: a mark's word s (a creature hidden in a seen cell), cleaned by the player's app
        'campName': { type: 'campName', campId: 'c1', name: 'Renamed' },
        'libManifest': { type: 'libManifest', campId: 'c1', packs: [{ id: 'p_core', name: 'Core', n: 1, hash: 'abcdef12' }] },
        'lib-idx-ans': { type: 'lib-idx-ans', rid: 'q1', packId: 'p_core', hash: 'abcdef12', page: 0, pages: 1, rows: [] },
        'turnRules': { type: 'turnRules', campId: 'c1', timers: 'owner', fill: 'owner' },
        'newPlayers': { type: 'newPlayers', campId: 'c1', token: 'on', sight: true, create: 'live', fromFile: true },
        'sounds': { type: 'sounds', campId: 'c1', list: [] }, 'sound': { type: 'sound', id: 's1', act: 'play' },
        'music': { type: 'music', campId: 'c1', music: {} }, 'music-ctl': { type: 'music-ctl', act: 'play', id: 't1' },
        'fx': { type: 'fx', kind: 'flash', look: 'gold', mapId: 'm_open' },
        'video': { type: 'video', act: 'offer', id: '0123456789abcdef', name: 'Clip', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' },
        'blast': { type: 'blast', mapId: 'm_open', blast: { x: 1, y: 1, ft: 10, name: CANARY, shape: 'cone', deg: 60, dir: 1 } }, 'blastClear': { type: 'blastClear' },
        'apply': { type: 'apply', id: 'a_1', from: { id: 'u_p2', name: 'Bram' }, label: 'Heal', lines: [{ f: 'HP', text: '+3' }], ts: 1 },
        'acts-left': { type: 'acts-left', charId: 'c_p1', left: { attack: 1 }, mode: 'warn' },
        'turn-note': { type: 'turn-note', text: 'Your turn.', charId: 'c_p1' },
        'due': { type: 'due', id: 'd_1', charId: 'c_p1', from: { id: 'u_gm', name: 'GM', gm: true }, label: 'Regen', ts: 1 },
        'roll': { type: 'roll', id: 'r_abc', from: { id: 'u_p2', name: 'Bram' }, expr: '1d20 + 3', draws: [[17]], v: F.VERSION, ts: 1, label: 'Attack' },
        'roll-deny': { type: 'roll-deny', rid: 'zz', reason: 'slow' },
        'asset-part': { type: 'asset-part', path: '/saves/images/audio/s.mp3', i: 0, n: 1, data: new Uint8Array([1]).buffer },
        'asset': { type: 'asset', path: '/saves/images/pic.png', mime: 'text/html', data: new Uint8Array([60, 115]).buffer },
        'chat': { type: 'chat', text: 'hi', from: { id: 'u_p2', name: 'Bram', gm: true, color: 'red' }, scope: 'global', ts: 1, toName: '' },
        'chat-history': { type: 'chat-history', log: [{ from: { id: 'u_p2', name: 'Bram' }, text: 'old', ts: 1 }, { from: { id: 'u_p2', name: 'Bram' }, roll: { id: 'r_old', from: { id: 'u_p2', name: 'Bram' }, expr: '1d6', draws: [[4]], v: F.VERSION, ts: 2 } }] },
        'roster': { type: 'roster', roster: [{ id: 'u_p1', name: 'Ayla', location: 'm_open', color: '#112233', avatar: 'data:image/png;base64,iVBORw0KGgo=' }, { id: 'u_p2', name: 'Bram', location: 'm_open' }], away: { u_p3: 'm_fog' } },
        'unknown': { type: 'zzz', x: 1 },
        // the players' own words sent AT a player (no client branch: must be ignored)
        'char-edit@client': { type: 'char-edit', rid: 'r1', charId: 'c_p1', fieldId: 'f_str', value: 1 }, 'needItem@client': { type: 'needItem', campId: 'c1', itemId: 'm_open' }, 'hello@client': { type: 'hello', profile: { id: 'u_gm' } }
    };

    const confirmsC = new Map(); const ownCamp = () => stateMod.state.appState.campaigns.camp_tutorial;
    const campC = () => stateMod.state.appState.campaigns.c1, tokC = (mid, id) => (campC().items[mid].whiteboard || []).find(w => w.id === id);
    const expectClient = {
        'itemDelta': () => tokC('m_open', 'tok_npc').x === 10 && !tokC('m_open', 'tok_npc2') && campC().items.m_open.meta.title === 'Renamed',
        'itemGone': () => !campC().items.m_fog,
        'mapBack': () => { const m = campC().items.m_fog; return !!m && m.stub === true && m.whiteboard.length === 0 && m.rooms.length === 0 && !m.fog && m.meta.title === CANARY && m.meta.playerLock === true && Object.keys(m.meta).length === 4; },
        'mapBack-shown': () => { const m = campC().items.m_open; return !!m && m.stub === true && m.whiteboard.length === 0 && JSON.stringify(m).indexOf(CANARY) < 0 && campC().activeItemId === 'm_open'; },
        'stage': () => campC().activeItemId === 'm_open' && rec.toasts.some(t => /arrive/.test(t)),
        'pause': () => cnet.paused === true, 'snap': () => cnet.tableSnapOn === true, 'stance': () => !!cnet.stance,
        'handout': () => rec.journal.length === 1, 'notepad': () => cnet.notepad && cnet.notepad.on === true && JSON.stringify(cnet.notepad.look) === JSON.stringify({ fmt: { b: true }, font: 'Lora', sig: win.wpLook.textSig('hi') }),   // (the look as the rule of the pad cleans it: its link is gone)
        'combats': () => cnet.combats.m_open && cnet.combats.m_open.rows.length === 2,
        'targets': () => cnet.targets.u_p2 && cnet.targets.u_p2.id === 'tok_npc',
        'pos': () => tokC('m_open', 'tok_p2').x === 200 && tokC('m_open', 'tok_p2').rot === 45,
        // 'auth' is answered before the snapshot only (checked there); after it the branch is inert by design
        'chars': () => campC().chars.c_p1.values.f_str === 15 && !!campC().chars.c_p1.looks && campC().chars.c_p1.looks.f_class.fmt.u === true && !('looks' in campC().chars.c_p2), 'char': () => campC().chars.c_p1.values.f_str === 16 && !!campC().chars.c_p1.looks && campC().chars.c_p1.looks.f_class.fmt.st === true,
        'charDelta': () => campC().chars.c_p1.values.f_str === 17 && campC().chars.c_p1.values.f_gmfig === undefined,
        'charStyle': () => !!campC().chars.c_p1.looks && Object.keys(campC().chars.c_p1.looks).join() === 'f_class' && campC().chars.c_p1.looks.f_class.fmt.b === true,
        'charGone': () => !campC().chars.c_p2, 'campName': () => campC().name === 'Renamed', 'clock': () => campC().clock && campC().clock.t === 3600,
        'fogDiff': () => !!tokC('m_fog', 'tok_new') && !tokC('m_fog', 'tok_far'), 'docStyle': () => campC().docStyle && campC().docStyle.font === 'serif',
        'turnRules': () => campC().turnRules.timers === 'owner', 'acts-left': () => cnet.actsLeft && cnet.actsLeft.c_p1 && cnet.actsLeft.c_p1.left.attack === 1,
        'chat': () => rec.text.some(t => t.v === 'hi'), 'turn-note': () => rec.toasts.some(t => t === 'Your turn.'), 'travelDenied': () => rec.toasts.some(t => /Cellar/.test(t)),
        'roster': () => cnet.roster.u_p2 && cnet.roster.u_p2.name === 'Bram' && cnet.away.u_p3 === 'm_fog' && rec.html.some(h => /Bram/.test(h.v)),
        'denied': () => rec.text.some(t => t.v === 'no') && cnet.leaving === false, 'end': () => rec.text.some(t => /ended/.test(t.v))
    };
    const HELD_KEYS = [K1, 'VICTIMKEY'.repeat(3)];   // the table keys this player holds (for u_gm and for another GM): none may ever be sent, in any field
    let revived = 0; const revivedOdd = [];
    async function fireClient(from, kind, mut, msg) {
        probes++;
        const conn = from === 'host' ? hconn : from === 'stale' ? staleConn : otherConn;
        clockOff += 1500;
        const before = snapOf(cnet); resetRec(); warned.length = 0; flushed.threw.length = 0; const sb = sentLog.length;
        const lsBefore = localStorage.dump();
        const wasActive = cnet.active, wasForeign = cnet.foreign, wasSynced = cnet.syncedPeer;
        const authMay = msg && msg.type === 'auth' && conn && !conn.wpAuthDone;   // the auth branch marks the connection as it starts its (asynchronous) answer
        const t0 = performance.now(); let threw = null;
        try { cnet._handleMessage(msg, conn); } catch (e) { threw = e; } finally { cnet.applyingRemote = false; }
        try { flushTimers(); } catch (e) { threw = threw || e; }
        await drain(); flushTimers();
        if (conn && conn.wpSnapWait) { await settle(() => !conn.wpSnapWait); await drain(); flushTimers(); }   // a snapshot whose signature is being checked (off the main thread): its oracles wait for the verdict
        if (authMay && conn.wpAuthDone) await settle(() => sentLog.length > sb);   // the proof is computed off the main thread: wait for the answer so this probe's oracles see it
        const dt = performance.now() - t0;
        let after = snapOf(cnet);
        const tag = kind + ' from ' + (from === 'host' ? 'the synced host' : from === 'stale' ? 'a stale connection' : 'another host');
        if (!after || !before) { finding('client: a structure nested past 200 levels is kept in the campaign copy (JSON.stringify of it overflows on Node 22)', tag, { msg, depth: 'past what JSON.stringify can serialise here' }, mut); after = after || EMPTY_SNAP; }
        else { const dp = depthOf(after.app); if (dp > 200) finding('client: a structure nested past 200 levels is kept in the campaign copy (JSON.stringify of it overflows on Node 22)', tag, { msg, depth: dp + ' levels' }, mut); }
        if (threw) finding('exception escapes handleMessage (client)', tag + ' — ' + threw.constructor.name + ': ' + String(threw.message).slice(0, 120), msg, mut);
        flushed.threw.forEach(e => finding('exception in a timer the message armed (client)', tag + ' — ' + String(e.message).slice(0, 120), msg, mut));
        const changes = before && after !== EMPTY_SNAP ? diffOf(before, after) : [];
        const padd = protoAdded(); if (padd.length) finding('prototype pollution (client)', tag + ' → ' + padd.join(', '), msg, mut);
        if (cnet.targets && Object.getPrototypeOf(cnet.targets) !== Object.prototype) { finding('client: net.targets re-parented by a "__proto__" key from the host', tag, msg, mut); cnet.targets = {}; }
        if (cnet.combats && Object.getPrototypeOf(cnet.combats) !== Object.prototype) { finding('client: net.combats re-parented by a "__proto__" key from the host', tag, msg, mut); cnet.combats = {}; }
        if (from !== 'host') { const w = changes.filter(c => !/^\.(active|role)$/.test(c.path)); if (w.length) finding('client: a connection other than the synced host writes state', tag + ' → ' + w[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]').replace(/\.whiteboard.*$/, '.whiteboard'), msg, mut); }
        if (!cnet.foreign) { const w = changes.filter(c => /^\.app\.campaigns\.camp_tutorial/.test(c.path)); if (w.length) finding('client: a message before the snapshot writes into the player\'s OWN campaign', tag + ' → ' + w[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]').replace(/\.whiteboard.*$/, '.whiteboard'), msg, mut); }
        const lsAfter = localStorage.dump(); Object.keys(lsAfter).concat(Object.keys(lsBefore)).forEach(k => { if (lsAfter[k] !== lsBefore[k] && k !== 'wp_vtt_local' && !(k === 'wp_tableKeys' && msg.type === 'snapshot')) finding('client: localStorage written by a message', tag + ' → ' + k, msg, mut); });
        if (msg.type === 'snapshot' && lsAfter.wp_tableKeys !== lsBefore.wp_tableKeys) { try { const k = JSON.parse(lsAfter.wp_tableKeys); if (k.u_victim !== 'VICTIMKEY'.repeat(3) || Object.keys(k).some(x => x !== 'u_victim' && x !== 'u_gm')) finding('client: a snapshot stores its key under ANY gmId the host names (another GM\'s key overwritten, localStorage bloats)', tag, { msg, wp_tableKeys: k }, mut); } catch (e) {} }
        const outK = sentLog.slice(sb).filter(s => { let j; try { j = JSON.stringify(s.m); } catch (e) { j = ''; } return HELD_KEYS.some(k => j.indexOf(k) >= 0); });
        if (outK.length) finding('client: a table key this player holds is sent (the key never travels: a proof over it does)', tag + ' → ' + outK[0].m.type + ' carrying a held key, for gmId ' + short(msg.gmId), msg);
        if (msg && msg.type === 'auth') sentLog.slice(sb).filter(s => s.m.type === 'hello' && 'proof' in s.m).forEach(s => {   // a proof, when one goes out, is over the key held for the GM named, the host's nonce and the room THIS app dialled — never over a room or a text the host chose
            const held = { u_gm: K1, u_victim: 'VICTIMKEY'.repeat(3) }, k = typeof msg.gmId === 'string' && Object.prototype.hasOwnProperty.call(held, msg.gmId) ? held[msg.gmId] : null;
            const want = k && typeof msg.nonce === 'string' && msg.nonce.length >= 16 && msg.nonce.length <= 128 ? proofFor(k, msg.nonce, conn.peer) : null;   // … and over this connection's two certificate fingerprints, the pair stated beside it
            if (s.m.proof !== want || JSON.stringify(s.m.fp) !== JSON.stringify([FP_P, FP_H])) finding('client: the auth answer\'s proof is not the one over the room this app dialled (or one is sent with no usable key or nonce)', tag + ' → proof ' + short(s.m.proof) + ' for gmId ' + short(msg.gmId), msg, mut);
        });
        if (rec.saves.length) finding('client: a message reaches save()', tag + (rec.saves.some(s => s.persist) ? ' AND it would persist' : ' (io.js refuses it while foreign)'), msg, mut);
        rec.fetches.forEach(f => finding('client: a message causes a fetch', tag + ' → ' + f.url.slice(0, 80), msg, mut));
        rec.html.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('client: raw hostile string in a markup sink (innerHTML)', tag + ' → #' + h.el, msg); });
        rec.attr.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('client: raw hostile string in an attribute sink', tag + ' → #' + h.el + '.' + h.k, msg); });
        rec.attr.forEach(h => { if (/^(src|href)$/.test(h.k) && /^(https?:)?\/\//.test(h.v)) finding('client: a web address reaches src/href (an IP beacon)', tag + ' → ' + h.v.slice(0, 60), msg); });
        rec.style.forEach(h => { if (/NaN|undefined|\[object|Infinity/.test(h.v)) finding('client: garbage from the host reaches a CSS value', tag + ' → ' + h.k + '=' + h.v.slice(0, 40), msg, mut); });
        [].concat(rec.html, rec.text, rec.attr).forEach(h => { if (h.v.length > 60000) finding('client: an unbounded string reaches the page', tag + ' → #' + h.el + ' (' + h.v.length + ' chars)', msg, mut); });
        if (longest(after.app) > 100000) finding('client: an unbounded string is kept in the campaign copy', tag, msg, mut);
        if (longest(after.roster) > 100000) finding('client: an unbounded string is kept on the roster copy', tag, msg, mut);
        const hostedC = after.app.campaigns && after.app.campaigns.c1; if (hostedC && hostedC.items) Object.keys(hostedC.items).forEach(id => { const it = hostedC.items[id]; if (it && it.type === 'map' && Array.isArray(it.whiteboard)) it.whiteboard.forEach(w => { if (w && ['x', 'y', 'rot', 'front'].some(k => w[k] !== undefined && (typeof w[k] !== 'number' || !isFinite(w[k])))) finding('client: untyped geometry from the host is kept on a token of the copy', tag + ' → ' + id + '/' + w.id, { msg, kept: { x: w.x, y: w.y, rot: w.rot, front: w.front } }, mut); }); });
        if (hostedC && hostedC.items) Object.keys(hostedC.items).forEach(id => { const it = hostedC.items[id]; if (it && typeof it === 'object' && Array.isArray(it.whiteboard)) it.whiteboard.forEach(w => { if (w && typeof w === 'object' && !bareOfSecret(w)) finding('client: a key of a secret door (secret, seenColor, seenTexture, seenWidth, seenOpacity, seenTip) named by the host is kept on a piece of the copy', tag + ' → ' + id + '/' + String(w.id).slice(0, 40), { msg, kept: SECRET_KEYS.filter(k => hasOwn(w, k)) }, mut); }); });   // fold B5: a secret door: the three keys are a GM's own and never travel, so a player's app keeps none a host names (the well-formed delta and catch-up carry them, so every mutation is judged)
        rec.confirms.forEach(c => { const k = msg.type; confirmsC.set(k, (confirmsC.get(k) || 0) + 1); if (confirmsC.get(k) === 2) finding('client: a dialog the host can raise again and again, with its own text', msg.type + ' → "' + c.text.slice(0, 80) + '"', msg); });
        if (rec.confirms.some(c => c.text.indexOf(CANARY) >= 0)) finding('client: a dialog shows host-chosen text verbatim', tag, msg);
        if (dt > 200) { const t1 = performance.now(); try { cnet._handleMessage(clone(msg), conn); } catch (e) {} finally { cnet.applyingRemote = false; } flushTimers(); const dt2 = performance.now() - t1; if (dt2 > 200) finding('client: one message takes more than 200 ms', tag + ' (' + Math.round(dt) + ' ms, again ' + Math.round(dt2) + ' ms)', msg, mut); }
        warned.forEach(w => { if (/wire send failed/.test(w)) finding('client: a send the packer refused', tag + ' → ' + w.slice(0, 100), msg); });
        const endsSession = from === 'host' && conn === hconn && /^(denied|kicked|end)$/.test(String(msg && msg.type));   // the dialled host's own three words end the join: the app's load() of its own campaign is the honest teardown
        if (rec.loads && !endsSession) finding('client: a message makes the app reload its own campaign (load())', tag, msg, mut);
        // the handlers that end the session leave marks a later probe must not inherit
        cnet.leaving = false;
        if (wasActive && (!cnet.active || cnet.role !== 'client' || !hconn.open)) {   // the join was torn down (as the app does on denied / kicked / end): the stand-in connection and the join are revived, synced again only if they were, so the next probe is judged on a live join as a re-dial would give
            if (!endsSession) revivedOdd.push(tag);   // torn down by a word that should not end it: the scenario checks say so; noted here too
            cnet.active = true; cnet.role = 'client'; cnet.conns = [hconn]; hconn.open = true; revived++;
            cnet.foreign = wasForeign; cnet.syncedPeer = wasSynced;
        }
        return { threw, changes, dt };
    }

    // 1. before the snapshot: the player's own campaign is in memory; the host (or a stale connection) names it
    const preTypes = ['item', 'itemDelta', 'pos', 'stage', 'pause', 'handout', 'combats', 'targets', 'chat-history', 'notepad', 'denied', 'char-upload-done'];
    for (const k of preTypes) {
        const m = clone(ctpl[k]); const s = JSON.stringify(m).replace(/"c1"/g, '"camp_tutorial"').replace(/"m_open"/g, '"home"').replace(/"tok_p2"/g, '"mytok"');
        await fireClient('host', k + ' (pre-snapshot)', 'naming the player\'s own campaign', JSON.parse(s));
        await fireClient('stale', k + ' (pre-snapshot)', 'naming the player\'s own campaign', JSON.parse(s));
    }
    check('client: before the snapshot nothing from a host names or changes the player\'s own campaign in memory', !openFindings().some(f => /before the snapshot/.test(f.kind)), openFindings().filter(f => /before the snapshot/.test(f.kind)).map(f => f.detail).slice(0, 3));
    // the key challenge, before the snapshot (that is when a host asks). The app answers once per connection; the suite clears that mark
    // between probes so each is judged as the first challenge of a fresh connection
    {
        const N = 'n'.repeat(32); let s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth', 'well-formed (the GM this app holds a key for)', { type: 'auth', gmId: 'u_gm', nonce: N });
        const said = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: the well-formed auth takes effect — one hello answers it with the proof over the key held for this GM, the host\'s nonce and the room this app dialled; no key in any field', said.length === 1 && said[0].proof === proofFor(K1, N, hconn.peer) && !('key' in said[0]) && said[0].profile && said[0].profile.id === 'u_p1' && JSON.stringify(said).indexOf(K1) < 0, said);
        s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth (victim gmId)', 'gmId of another GM', { type: 'auth', gmId: 'u_victim', nonce: N });
        const saidV = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: an auth naming another GM\'s id is never answered with that GM\'s table key — a proof bound to the room this app dialled at most (useless at that GM\'s own room), and no held key in any field', saidV.length === 1 && JSON.stringify(saidV).indexOf('VICTIMKEY') < 0 && JSON.stringify(saidV).indexOf(K1) < 0 && !('key' in saidV[0]) && !openFindings().some(f => /key this player holds is sent|not the one over the room/.test(f.kind)), saidV);
        s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth (no nonce)', 'a host from before the proof asks with no nonce', { type: 'auth', gmId: 'u_gm' });
        const saidO = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: an auth with no usable nonce (an older host) gets a plain hello — no proof, no key', saidO.length === 1 && !('proof' in saidO[0]) && !('key' in saidO[0]) && JSON.stringify(saidO).indexOf(K1) < 0, saidO);
        await fireClient('stale', 'auth', 'from a stale connection', { type: 'auth', gmId: 'u_victim', nonce: N });
        await fireClient('other', 'auth', 'from another host', { type: 'auth', gmId: 'u_gm', nonce: N });
        check('client: an auth on a connection other than the one this app dialled is not answered', !sentLog.some(s => s.to !== hconn.peer && s.m.type === 'hello'));
        // the auth branch itself fuzzed, before the snapshot (after it the branch is inert by design): each mutation as the first challenge of its connection
        const s1 = sentLog.length;
        for (const m of mutations(ctpl.auth)) { hconn.wpAuthDone = false; await fireClient('host', 'auth', m.name, m.msg); }
        check('client: every mutation of the auth challenge is answered with at most one hello, never a held key, and a proof only over the room dialled', !openFindings().some(f => /^exception escapes handleMessage \(client\)/.test(f.kind) && /^auth /.test(f.detail)) && !sentLog.slice(s1).some(s => HELD_KEYS.some(k => JSON.stringify(s.m).indexOf(k) >= 0)), openFindings().filter(f => /^auth /.test(f.detail)).map(f => f.kind).slice(0, 3));
        hconn.wpAuthDone = false;
    }

    // the host's early proof, before the snapshot (that is when a host gives it), on a table this app knows nothing of: every mutation, from every
    // sender, each as the first of its connection — nothing is stored, nothing asked, the join left as it was
    {
        const f0 = found.size, ls0 = JSON.stringify(localStorage.dump()), revived0 = revived; let n = 0;
        for (const m of mutations(ctpl.gmhello)) { for (const from of ['host', 'stale', 'other']) { hconn.wpHailed = false; staleConn.wpHailed = false; otherConn.wpHailed = false; await fireClient(from, 'gmhello (pre-snapshot)', m.name, m.msg); n++; } }
        check('client: every mutation of the host\'s early proof before the snapshot (' + n + ' probes, from the dialled host, a stale connection and another host) writes nothing to storage, raises no question, proves no host and leaves the join waiting as it was — on a table this app knows nothing against, no proof is expected and none is judged',
            found.size === f0 && JSON.stringify(localStorage.dump()) === ls0 && revived === revived0 && cnet.active === true && hconn.open && hconn.wpHostOk !== true && !cnet.syncedPeer, { newFindings: found.size - f0, revived: revived - revived0, active: cnet.active });
        hconn.wpHailed = false;
    }

    // 2. the snapshot, then every type from the synced host with mutations; from a stale and another connection the well-formed example
    await fireClient('host', 'snapshot', 'well-formed (the real one the host made for this player)', clone(snapshotForClient));
    check('client: the snapshot syncs (foreign, the hosted campaign on screen, the key remembered under the real gmId)', cnet.foreign === true && stateMod.state.appState.activeCampaignId === 'c1' && cnet.syncedPeer === hconn.peer && JSON.parse(localStorage.getItem('wp_tableKeys')).u_gm === snapshotForClient.key);
    const snapEvil = clone(snapshotForClient); snapEvil.gmId = 'u_victim'; snapEvil.key = 'OVERWRITTEN';
    await fireClient('host', 'snapshot (gmId=victim)', 'a second snapshot naming another GM', snapEvil);
    check('client: a snapshot cannot overwrite the key held for another GM', JSON.parse(localStorage.getItem('wp_tableKeys')).u_victim === 'VICTIMKEY'.repeat(3));
    await fireClient('host', 'snapshot', 'the real one again', clone(snapshotForClient));
    // the fogged map, held as a stub from the snapshot, is given whole as the host does when its player arrives there
    check('client: the snapshot holds the fogged map as a stub (the player has not been there)', !!campC().items.m_fog && campC().items.m_fog.stub === true);
    await fireClient('host', 'item-fog', 'the fogged map whole, as the host gives it on arrival', clone(ctpl['item-fog']));
    check('client: the fogged map given whole replaces its stub (the player\'s own token on it)', !!campC().items.m_fog && !campC().items.m_fog.stub && !!tokC('m_fog', 'tok_p1b'), campC().items.m_fog && { stub: campC().items.m_fog.stub, ids: (campC().items.m_fog.whiteboard || []).map(w => w.id) });
    const pristineC = clone(stateMod.state.appState);
    function resetClient() { stateMod.state.appState = clone(pristineC); cnet.leaving = false; cnet.foreign = true; cnet.active = true; cnet.role = 'client'; cnet.conns = [hconn]; cnet.syncedPeer = hconn.peer; resetRec(); }

    {   // the real join snapshot, as this player's app keeps it: their own whole copy with its look, no other copy with one, and the host's word that it knows looks
        resetClient(); const ccL = campC().chars;
        check('client: the real join snapshot gives the player their own character\'s look and no other copy one, and says that this host knows text looks', !!(ccL.c_p1 && ccL.c_p1.looks && ccL.c_p1.looks.f_class && ccL.c_p1.looks.f_class.fmt.i === true) && Object.keys(ccL).every(id => id === 'c_p1' || !('looks' in ccL[id])) && Object.keys(ccL).length >= 2 && cnet.looksOk() === true && snapshotForClient.looks === true, { chars: Object.keys(ccL).map(id => [id, ccL[id].partial === true, Object.keys(ccL[id].looks || {})]), ok: cnet.looksOk(), said: snapshotForClient.looks });
    }
    for (const kind of Object.keys(ctpl)) {
        if (kind === 'snapshot') continue;
        const tpl = ctpl[kind];
        resetClient();
        const muts = mutations(tpl);
        for (const m of muts) {
            const s0 = sentLog.length;
            await fireClient('host', kind, m.name, m.msg);
            if (m.name === 'well-formed' && expectClient[kind]) { let ok = false; try { ok = !!expectClient[kind](sentLog.slice(s0).map(x => x.m)); } catch (e) { ok = false; } check('client: the well-formed ' + kind + ' takes effect (the fuzz reaches the real path)', ok, { toasts: rec.toasts.slice(0, 3) }); }
            if (/^(end|kicked|denied)/.test(kind)) { cnet.leaving = false; cnet.active = true; cnet.role = 'client'; }
        }
        resetClient();
        for (const m of muts.slice(0, 10)) { await fireClient('stale', kind, m.name, m.msg); }
        for (const m of muts.slice(0, 10)) { await fireClient('other', kind, m.name, m.msg); }
        // a flood of 500 from the host
        resetClient(); const tf = performance.now(); let threwN = 0, rendersB = rec.renders;
        for (let i = 0; i < 500; i++) { const m = clone(tpl); if (m.id && typeof m.id === 'string') m.id = 'r_' + i; try { cnet._handleMessage(m, hconn); } catch (e) { threwN++; } finally { cnet.applyingRemote = false; cnet.leaving = false; } }
        flushTimers(); await drain(); flushTimers();
        const dtf = performance.now() - tf;
        if (dtf > 2000) finding('client: a flood of 500 takes more than 2 s', kind + ' (' + Math.round(dtf) + ' ms)', tpl);
        if (threwN) finding('exception escapes handleMessage (client)', kind + ' during a flood', tpl);
        checks++; const bad = openFindings().some(f => f.detail.indexOf(kind + ' ') === 0 || f.detail.indexOf(kind + '|') === 0 || f.detail === kind);
        if (bad) checksFailed++;
        console.log((bad ? 'FAIL      ' : 'ok        ') + 'client: ' + kind + ' — ' + muts.length + ' mutations × host, 10 × stale, 10 × another host, a flood of 500');
    }
    {   // the snapshot itself fuzzed (after the real one so the app stays synced)
        const muts = mutations(snapshotForClient).filter(m => !/appState=|\.campaigns/.test(m.name) || /appState=\{\}|appState=null|appState=\[\]/.test(m.name)).slice(0, 80);
        resetClient();
        for (const m of muts) { localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: snapshotForClient.key })); await fireClient('host', 'snapshot', m.name, m.msg); if (stateMod.state.appState.activeCampaignId !== 'c1') resetClient(); }
        const hostile = clone(snapshotForClient); hostile.appState.campaigns.c1.items.m_open.whiteboard.push({ id: 'evil', type: 'text', text: '<img src=x onerror=alert(1)>' + CANARY, x: 0, y: 0, w: 1, h: 1 }, { id: 'evil2', type: 'circle', isChar: true, x: '1e3', y: {}, w: NaN, light: { bright: 1e300 }, senses: [{ id: 'x', r: 1 }], blind: true, ownerId: 'u_p1', fxb: [{ n: CANARY, i: 'x', t: 'buff' }] },
            { id: 'evil3', type: 'rect', targetMapId: 'm_fog', portalLock: 'yes', x: 0, y: 0, w: 10, h: 10 }, { id: 'evil4', type: 'rect', targetMapId: 'm_fog', portalLock: 1, x: 0, y: 0, w: 10, h: 10 }, { id: 'evil5', type: 'rect', targetMapId: 'm_fog', portalLock: { on: true }, x: 0, y: 0, w: 10, h: 10 });   // a portal's own lock: only true is kept
        hostile.appState.campaigns.c1.items.__proto__ = { polluted: 1 }; hostile.appState.campaigns.constructor = { id: 'constructor', type: 'map', items: {} };
        hostile.appState.campaigns.c1.players = { u_p1: { key: 'STOLEN' } };
        await fireClient('host', 'snapshot', 'hostile items, a players record, prototype keys as campaign ids', hostile);
        const camp = stateMod.state.appState.campaigns.c1;
        const txt = camp && camp.items.m_open.whiteboard.find(w => w.id === 'evil');
        check('client: a hostile snapshot keeps no players record, no prototype-keyed campaign, and its text item is rebuilt by the sanitiser (escaped here: no DOMParser under node)', camp && !camp.players && !Object.prototype.hasOwnProperty.call(stateMod.state.appState.campaigns, 'constructor') && (!txt || txt.text.indexOf(CANARY) < 0), txt && txt.text.slice(0, 80));
        const ev2 = camp && camp.items.m_open.whiteboard.find(w => w.id === 'evil2');
        check('client: a token\'s senses, blind tick and effects from the host are cleaned again on its own token (fxb bounded with a cleaned icon, senses the cleaner\'s or gone, blind only as true)', !!ev2 && (!ev2.fxb || ev2.fxb.every(e => typeof e.n === 'string' && e.n.length <= 60 && typeof e.i === 'string')) && (ev2.senses === undefined || Array.isArray(ev2.senses)) && (ev2.blind === undefined || ev2.blind === true), ev2 && { fxb: ev2.fxb, senses: ev2.senses, blind: ev2.blind });
        const plC = id => { const w = camp && camp.items.m_open.whiteboard.find(x => x.id === id); return w ? (Object.prototype.hasOwnProperty.call(w, 'portalLock') ? w.portalLock : 'none') : 'gone'; };
        check('client: a portal\'s lock from the host is kept only as true — the host\'s own locked portal with its lock, a hostile "yes", 1 or object dropped while the portal itself stays', plC('portal_locked') === true && plC('evil3') === 'none' && plC('evil4') === 'none' && plC('evil5') === 'none' && plC('portal_vis') === 'none', [plC('portal_locked'), plC('evil3'), plC('evil4'), plC('evil5')]);
        resetClient();
    }
    {   // ordering on the client: a roll replayed, a delta before its item, chat-history from.id unbounded, a stale drag
        resetClient(); const r = clone(ctpl.roll);
        await fireClient('host', 'roll replay', 'the same record twice', r); await fireClient('host', 'roll replay', 'the same record twice', r);
        await fireClient('host', 'itemDelta before item', 'a delta for a map not held', Object.assign(clone(ctpl.itemDelta), { itemId: 'm_unknown' }));
        const asked = sentLog.some(s => s.m.type === 'needItem' && s.m.itemId === 'm_unknown');
        check('client: a delta for a map it does not hold asks the host for the whole map', asked);
        resetRec();
        const h = clone(ctpl['chat-history']); h.log = [{ from: { id: BIG, name: 'x' }, text: 'y', ts: 'now' }];
        await fireClient('host', 'chat-history', 'from.id of 1e6 chars, ts a string', h);
        const big = rec.text.concat(rec.html).some(x => x.v.length > 60000);
        check('client: a chat-history line with a 1e6-char sender id is bounded before it is kept or drawn', !big && !openFindings().some(f => /unbounded/.test(f.kind) && /chat-history/.test(f.detail)));
    }
    {   // the end / kicked / denied words: each ends the session once; a stale connection may not
        resetClient(); resetRec(); const was = cnet.active;
        await fireClient('stale', 'end', 'from a stale connection', { type: 'end' });
        const endedByStale = !(cnet.active === was && !rec.toasts.some(t => /ended/.test(t)));
        if (endedByStale) finding('client: a connection other than the synced host ends the session', 'end from a stale connection (the end branch has no gate on the connection it came by; denied and kicked take the dialled host\'s word only)', { type: 'end' });
        check('client: an "end" from a connection other than the synced host does not end the session', !endedByStale, rec.toasts.slice(0, 2));
        resetClient(); resetRec();
        await fireClient('host', 'denied', 'update dialog with host text', { type: 'denied', reason: 'Run this command to fix your install: ' + CANARY, update: true });
        check('client: a "denied" with update:true raises a dialog with the host\'s own text (an avenue for a phishing-style prompt)', rec.confirms.length === 0, rec.confirms.map(c => c.text.slice(0, 60)));
        resetClient();
    }
    {   // a portal's own lock: the host's refusal is said in the app's own fixed words, whatever rides beside the reason
        resetClient(); resetRec();
        await fireClient('host', 'travelDenied', 'reason portal with host text beside it', { type: 'travelDenied', reason: 'portal', map: CANARY, text: CANARY, portal: CANARY });
        check('client: a travelDenied of reason "portal" is said in the app\'s own fixed words — nothing of the message in them', rec.toasts.some(t => t === 'That way is locked — the GM will unlock it when the time comes.') && !rec.toasts.some(t => t.indexOf(CANARY) >= 0), rec.toasts.slice(0, 3));
        resetClient();
    }
    /* ---------- fold B5: a secret door (the map builder), on the player's app. The real host's secret door is held as the wall it was sent as,
       and whatever a host says of a piece, none of the GM's three keys is kept — by any way a piece comes in ---------- */
    {
        resetClient(); resetRec(); const f0 = found.size;
        const pc = (mid, id) => { const it = campC().items[mid]; return (it && Array.isArray(it.whiteboard) ? it.whiteboard : []).find(w => w && w.id === id) || null; };
        check('client (a secret door): the real join snapshot leaves the player\'s app holding the GM\'s secret door as the wall the host sent — a wall\'s type, the look named for it, no door key and none of the three keys', seenAsWall(pc('m_open', SD.id)), pc('m_open', SD.id));
        const nameC = id => { const w = pc('m_open', id); return !w ? 'gone' : hasOwn(w, 'name') ? w.name : null; };
        check('client (a plain wall has no name): the real join snapshot leaves the player\'s app holding the world\'s four named plain walls with no name (the wall, the barrier, the wall whose flag is the number 1 and the wall drawn as a line), and the eleven named pieces that keep a name under their own', Object.keys(NAMED.walls).length === 4 && Object.keys(NAMED.kept).length === 11 && Object.keys(NAMED.walls).every(id => nameC(id) === null) && Object.keys(NAMED.kept).every(id => nameC(id) === NAMED.kept[id]) && namesOff(nameC, wireName).length === 0, { namesOff: namesOff(nameC, wireName), held: NAMED_IDS.length });
        const shapeC = shapesOff(id => pc('m_open', id)), twinC = TWIN_IDS.map(id => twinOff(pc('m_open', SD.id), pc('m_open', id))).find(Boolean) || null;
        check('client (a plain wall leaves in one shape): the real join snapshot leaves the player\'s app holding the world\'s six walls as the host sent them. The wall with no sightType key on the host and the wall typed window there are typed wall, the wall written in #8C7B5A is in #8c7b5a, the wall of the secret door\'s group has no group, the wall that kept what a door and a way through left behind has none of the six keys, and the wall a one-schema file wrote with every such key empty has none of the nine, targetMapId and nodeId among them. On the player\'s app the wall of the door\'s group and the one-schema wall each differ from the secret door\'s copy by id and place alone', SHAPED_IDS.length === 6 && shapeC.length === 0 && twinC === null, { shapeC, twinC });
        const evil = () => [
            { id: 'evil_sd1', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, seenColor: '#112233', seenTexture: 'grass', color: '#6b4a2a', name: 'Door', x: 0, y: 0, w: 50, h: 50 },   // a door ticked secret, as a GM's own save holds one
            { id: 'evil_sd2', type: 'rect', secret: 'yes', seenColor: CANARY, seenTexture: { a: 1 }, x: 60, y: 0, w: 50, h: 50 },   // junk under the three keys, on a plain shape
            { id: 'evil_sd3', type: 'path', blocksSight: true, sightType: 'door', secret: 1, seenColor: null, seenTexture: '', pts: [[0, 0], [10, 0]], x: 0, y: 60, w: 10, h: 1 },   // a line door; a null and an empty text are still keys
            { id: 'evil_sd4', type: 'circle', waiting: 1, ownerId: 'u_p2', name: 'W', secret: true, seenColor: '#112233', seenTexture: 'grass', x: 0, y: 120, w: 50, h: 50 },   // a waiting token
            { id: 'evil_sd5', type: 'circle', isChar: true, ownerId: 'u_p1', secret: true, seenColor: '#112233', seenTexture: 'grass', x: 0, y: 180, w: 50, h: 50 }   // a token of this player's own
        ];
        const ids = evil().map(w => w.id), kept = (mid, list) => list.map(id => { const w = pc(mid, id); return w ? (bareOfSecret(w) ? 'bare' : 'keys') : 'gone'; }), allBare = (a, n) => a.length === n && a.every(x => x === 'bare');
        const whole = clone(ctpl.item); evil().forEach(w => whole.item.whiteboard.push(w));
        await fireClient('host', 'item with a secret door\'s keys', 'five pieces that carry the keys, on the map this player is on', whole);
        const k1 = kept('m_open', ids), d1 = pc('m_open', 'evil_sd1');
        resetClient();
        await fireClient('host', 'itemDelta with a secret door\'s keys', 'five pieces set', { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: evil(), del: [] } });
        const k2 = kept('m_open', ids);
        resetClient();
        await fireClient('host', 'fogDiff with a secret door\'s keys', 'four pieces added to the fogged map', { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', add: evil().slice(0, 4).map(w => ({ item: w, after: null })) });
        const k3 = kept('m_fog', ids.slice(0, 4));
        resetClient();
        const hs = clone(snapshotForClient); evil().forEach(w => hs.appState.campaigns.c1.items.m_open.whiteboard.push(w));
        await fireClient('host', 'snapshot with a secret door\'s keys', 'five pieces on the map it gives whole', hs);
        const k4 = kept('m_open', ids);
        check('client (a secret door): a hostile host\'s pieces that carry secret, seenColor and seenTexture — a door ticked secret, a plain shape with junk under the keys, a line door, a waiting token and this player\'s own token — are each kept, and kept without the three keys, by every way a piece comes in: a whole map, a delta, a catch-up of a fogged map and a snapshot; the door itself stays the door the host sent, and the oracle that reads the copy after every message found nothing', allBare(k1, 5) && allBare(k2, 5) && allBare(k3, 4) && allBare(k4, 5) && !!d1 && d1.sightType === 'door' && d1.blocksSight === true && d1.color === '#6b4a2a' && found.size === f0, { whole: k1, delta: k2, catchUp: k3, snapshot: k4, door: d1, newFindings: found.size - f0 });
        resetClient();
    }
    /* ---------- Match a wall, on the player's app. The real host's secret doors drawn as lines are held as the wall lines they were sent as, each beside
       the wall it was matched to, and whatever a host says of a piece, none of the three keys Match sets is kept, by any way a piece comes in ---------- */
    {
        resetClient(); resetRec(); const f0 = found.size;
        const pc = (mid, id) => { const it = campC().items[mid]; return (it && Array.isArray(it.whiteboard) ? it.whiteboard : []).find(w => w && w.id === id) || null; };
        const doorsC = LINE_DOOR_IDS.filter(id => !heldAs(pc('m_open', id), LINE_SEEN[id])), twinsC = LINE_DOOR_IDS.map(id => twinOff(pc('m_open', id), pc('m_open', LINE_DOORS[id].wall))).filter(Boolean);
        const linesC = linesOff(id => pc('m_open', id), 'wire'), relicsC = RELIC_IDS.filter(id => !pc('m_open', id) || !bareOfSecret(pc('m_open', id)));
        check('client (Match a wall): the real join snapshot leaves the player\'s app holding each of the host\'s three secret doors drawn as lines as the wall line the host sent, at the matched wall\'s colour, width, opacity and nib, with no door key and none of the six keys. On the player\'s app each differs from the wall line it was matched to by id and place alone. The fourteen lines are held as the host sent them: the eleven wall lines with a width that is a number, an opacity only under 1 and one of the three nibs, the filled region, the plain line and the door drawn as a line as they were made. The three pieces that kept one key on the host are held without it',
            LINE_DOOR_IDS.length === 3 && doorsC.length === 0 && twinsC.length === 0 && LINED_IDS.length === 14 && linesC.length === 0 && relicsC.length === 0, { doorsC, twin: twinsC[0] || null, linesC, relicsC });
        const evilL = () => [
            { id: 'evil_ln1', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, seenColor: '#112233', seenWidth: 6, seenOpacity: 0.7, seenTip: 'flat', color: '#6b4a2a', strokeWidth: 12, opacity: 0.5, tip: 'square', pts: [[0, 0], [60, 0]], x: 0, y: 240, w: 60, h: 1 },   // a matched secret door drawn as a line, as a GM's own save holds one
            { id: 'evil_ln2', type: 'path', seenWidth: 4, color: '#ffffff', strokeWidth: 3, pts: [[0, 0], [10, 0]], x: 0, y: 260, w: 10, h: 1 },   // seenWidth alone, on a plain line
            { id: 'evil_ln3', type: 'rect', seenOpacity: 0.5, x: 0, y: 280, w: 50, h: 50 },   // seenOpacity alone, on a plain shape
            { id: 'evil_ln4', type: 'rect', blocksSight: true, sightType: 'wall', seenTip: 'flat', x: 60, y: 280, w: 50, h: 50 },   // seenTip alone, on a wall
            { id: 'evil_ln5', type: 'path', seenWidth: CANARY, seenOpacity: { a: 1 }, seenTip: ['flat'], pts: [[0, 0], [10, 0]], x: 0, y: 340, w: 10, h: 1 },   // junk under the three keys
            { id: 'evil_ln6', type: 'path', blocksSight: true, sightType: 'door', seenWidth: null, seenOpacity: 0, seenTip: '', pts: [[0, 0], [10, 0]], x: 0, y: 360, w: 10, h: 1 },   // a null, a 0 and an empty text are still keys
            { id: 'evil_ln7', type: 'circle', waiting: 1, ownerId: 'u_p2', name: 'W', seenWidth: 6, seenOpacity: 0.7, seenTip: 'flat', x: 0, y: 400, w: 50, h: 50 },   // a waiting token
            { id: 'evil_ln8', type: 'circle', isChar: true, ownerId: 'u_p1', seenWidth: 6, seenOpacity: 0.7, seenTip: 'flat', x: 0, y: 460, w: 50, h: 50 }   // a token of this player's own
        ];
        const idsL = evilL().map(w => w.id), keptL = (mid, list) => list.map(id => { const w = pc(mid, id); return w ? (bareOfSecret(w) ? 'bare' : SECRET_KEYS.filter(k => hasOwn(w, k)).join('+')) : 'gone'; }), allBareL = (a, n) => a.length === n && a.every(x => x === 'bare');
        const wholeL = clone(ctpl.item); evilL().forEach(w => wholeL.item.whiteboard.push(w));
        await fireClient('host', 'item with the keys Match sets', 'eight pieces that carry them, on the map this player is on', wholeL);
        const kl1 = keptL('m_open', idsL), dl1 = pc('m_open', 'evil_ln1');
        resetClient();
        await fireClient('host', 'itemDelta with the keys Match sets', 'eight pieces set', { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: evilL(), del: [] } });
        const kl2 = keptL('m_open', idsL);
        resetClient();
        await fireClient('host', 'fogDiff with the keys Match sets', 'seven pieces added to the fogged map', { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', add: evilL().slice(0, 7).map(w => ({ item: w, after: null })) });
        const kl3 = keptL('m_fog', idsL.slice(0, 7));
        resetClient();
        const hsL = clone(snapshotForClient); evilL().forEach(w => hsL.appState.campaigns.c1.items.m_open.whiteboard.push(w));
        await fireClient('host', 'snapshot with the keys Match sets', 'eight pieces on the map it gives whole', hsL);
        const kl4 = keptL('m_open', idsL);
        check('client (Match a wall): a hostile host\'s pieces that carry seenWidth, seenOpacity and seenTip are each kept, and kept without one of them, by every way a piece comes in: a whole map, a delta, a catch-up of a fogged map and a snapshot. They are a matched secret door drawn as a line with all six keys, a plain line with seenWidth alone, a plain shape with seenOpacity alone, a wall with seenTip alone, a line with junk under the three, a line door with a null, a 0 and an empty text under them, a waiting token and this player\'s own token. The line door itself stays the door the host sent, at its own width, opacity and nib, and the oracle that reads the copy after every message found nothing',
            idsL.length === 8 && allBareL(kl1, 8) && allBareL(kl2, 8) && allBareL(kl3, 7) && allBareL(kl4, 8) && !!dl1 && dl1.sightType === 'door' && dl1.blocksSight === true && dl1.strokeWidth === 12 && dl1.opacity === 0.5 && dl1.tip === 'square' && dl1.color === '#6b4a2a' && found.size === f0, { whole: kl1, delta: kl2, catchUp: kl3, snapshot: kl4, door: dl1, newFindings: found.size - f0 });
        resetClient();
    }
    /* ---------- Match a wall, round two, on the player's app. The real host sends no plain wall with a lock, and the see-through wall line and its door alike.
       A hostile host: seenColor is the GM's own key whatever it holds, the word transparent included, and is dropped with the other five. The key locked is
       NOT cleaned by the player's app: it is kept as the host sent it, on a wall as on any piece, whatever value it is. The board reads it by truth alone
       (a piece drawn at 85% and a class), so all a host can do with it is dim its own wall on this player's screen. This is pinned as what the app does today ---------- */
    {
        resetClient(); resetRec(); const f0 = found.size;
        const pc = (mid, id) => { const it = campC().items[mid]; return (it && Array.isArray(it.whiteboard) ? it.whiteboard : []).find(w => w && w.id === id) || null; };
        const lockC = {
            walls: LOCK_WALL_IDS.concat(LOCK_DOOR_IDS).filter(id => { const w = pc('m_open', id); return !w || !plainWall(w) || hasOwn(w, 'locked'); }).map(id => [id, lockOf(pc('m_open', id))]),
            kept: LOCK_KEPT_IDS.filter(id => lockOf(pc('m_open', id)) !== true).map(id => [id, lockOf(pc('m_open', id))]),
            any: (campC().items.m_open.whiteboard || []).filter(w => plainWall(w) && hasOwn(w, 'locked')).map(w => w.id),
            doors: LINE_DOOR2_IDS.filter(id => !heldAs(pc('m_open', id), LINE_SEEN[id])).map(id => [id, pc('m_open', id) ? lineDoorOff(pc('m_open', id)) : 'gone']),
            twins: LINE_DOOR2_IDS.concat(['door_line']).map(id => [id, twinOff(pc('m_open', id), pc('m_open', LINE_ALL[id].wall))]).filter(p => p[1])
        };
        check('client (Match a wall, round two): the real join snapshot leaves the player\'s app holding the host\'s seven plain walls that are locked or carry a lock key there, and the copies of its two locked secret doors, with no lock key at all, so the board dims none of them. The six locked pieces that are no plain wall are held with their lock: the door, the token, the shape that blocks nothing, the wall that leads to another map and the two drawings of this player\'s own. The see-through wall line and the door matched to it are both held in the colour transparent, 6 wide with the round nib, and on the player\'s app each of the three pairs (that one, the unlocked door and its locked wall line, the locked door and its unlocked wall line) differs by id and place alone',
            lockC.walls.length === 0 && lockC.kept.length === 0 && lockC.any.length === 0 && lockC.doors.length === 0 && lockC.twins.length === 0 && pc('m_open', 'wall_clear').color === 'transparent' && pc('m_open', 'door_clear').color === 'transparent', lockC);
        const evilR = () => [
            { id: 'evil_r1', type: 'path', blocksSight: true, sightType: 'wall', seenColor: 'transparent', color: '#4a4753', strokeWidth: 6, tip: 'round', pts: [[0, 0], [60, 0]], x: 0, y: 520, w: 60, h: 1 },   // the word under seenColor, on a wall line
            { id: 'evil_r2', type: 'path', blocksSight: true, sightType: 'door', doorOpen: false, secret: true, seenColor: 'transparent', seenWidth: 6, seenOpacity: 1, seenTip: 'round', color: '#6b4a2a', strokeWidth: 12, tip: 'square', pts: [[0, 0], [60, 0]], x: 60, y: 520, w: 60, h: 1 },   // a secret door matched to a see-through wall, as a GM's own save holds one
            { id: 'evil_r3', type: 'rect', seenColor: 'transparent', color: 'transparent', x: 0, y: 540, w: 50, h: 50 },   // on a plain shape whose OWN colour is that word: the key goes, the piece's own colour stays
            { id: 'evil_r4', type: 'rect', blocksSight: true, sightType: 'wall', locked: true, color: '#4a4753', x: 60, y: 540, w: 50, h: 50 },   // a wall locked in place, which an honest host sends with no lock
            { id: 'evil_r5', type: 'path', blocksSight: true, sightType: 'wall', locked: 'yes', color: '#4a4753', strokeWidth: 6, tip: 'round', pts: [[0, 0], [10, 0]], x: 0, y: 600, w: 10, h: 1 },   // a word for a lock, on a wall line
            { id: 'evil_r6', type: 'rect', barrier: true, locked: 1, x: 60, y: 600, w: 50, h: 50 },   // the number 1, on a see-through barrier
            { id: 'evil_r7', type: 'rect', blocksSight: true, sightType: 'wall', locked: { on: true }, x: 120, y: 600, w: 50, h: 50 },   // an object
            { id: 'evil_r8', type: 'rect', blocksSight: true, sightType: 'wall', locked: false, x: 180, y: 600, w: 50, h: 50 },   // false
            { id: 'evil_r9', type: 'rect', blocksSight: true, sightType: 'wall', locked: CANARY, x: 240, y: 600, w: 50, h: 50 }   // markup
        ];
        const sentR = evilR(), idsR = sentR.map(w => w.id), LOCKED_R = idsR.filter(id => hasOwn(sentR.find(w => w.id === id), 'locked'));
        const keptR = (mid, list) => list.map(id => { const w = pc(mid, id), was = sentR.find(x => x.id === id); return !w ? 'gone' : !bareOfSecret(w) ? 'keys: ' + SECRET_KEYS.filter(k => hasOwn(w, k)).join('+') : JSON.stringify(lockOf(w)) !== JSON.stringify(lockOf(was)) ? 'lock: ' + short(lockOf(w)) : w.color !== was.color ? 'colour: ' + short(w.color) : 'as sent'; });
        const allAsSent = (a, n) => a.length === n && a.every(x => x === 'as sent');
        const wholeR = clone(ctpl.item); evilR().forEach(w => wholeR.item.whiteboard.push(w));
        await fireClient('host', 'item with the keys of round two', 'nine pieces that carry the word transparent under seenColor or a lock on a wall, on the map this player is on', wholeR);
        const kr1 = keptR('m_open', idsR), dr2 = pc('m_open', 'evil_r2'), locksR = LOCKED_R.map(id => lockOf(pc('m_open', id)));
        resetClient();
        await fireClient('host', 'itemDelta with the keys of round two', 'nine pieces set', { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: evilR(), del: [] } });
        const kr2 = keptR('m_open', idsR);
        resetClient();
        await fireClient('host', 'fogDiff with the keys of round two', 'nine pieces added to the fogged map', { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', add: evilR().map(w => ({ item: w, after: null })) });
        const kr3 = keptR('m_fog', idsR);
        resetClient();
        const hsR = clone(snapshotForClient); evilR().forEach(w => hsR.appState.campaigns.c1.items.m_open.whiteboard.push(w));
        await fireClient('host', 'snapshot with the keys of round two', 'nine pieces on the map it gives whole', hsR);
        const kr4 = keptR('m_open', idsR);
        check('client (Match a wall, round two): what the player\'s app does with a hostile host\'s seenColor of the word transparent and with a host\'s lock on a wall, by every way a piece comes in (a whole map, a delta, a catch-up of a fogged map and a snapshot). The word under seenColor is dropped with the other five keys, as any value under it is: on a wall line, on a matched secret door drawn as a line, which stays the door the host sent at its own colour, width and nib, and on a plain shape whose own colour is that word, which keeps its own colour. The key locked is kept as the host sent it on a wall, a wall line and a see-through barrier, whatever it holds: true, the word yes, the number 1, an object, false and a text of markup. The player\'s app has no rule of its own for that key on a piece that is no waiting token. An honest host sends a plain wall with none, and the oracle that reads the copy after every message found nothing',
            idsR.length === 9 && LOCKED_R.length === 6 && allAsSent(kr1, 9) && allAsSent(kr2, 9) && allAsSent(kr3, 9) && allAsSent(kr4, 9) && JSON.stringify(locksR) === JSON.stringify([true, 'yes', 1, { on: true }, false, CANARY])
            && !!dr2 && dr2.sightType === 'door' && dr2.color === '#6b4a2a' && dr2.strokeWidth === 12 && dr2.tip === 'square' && found.size === f0,
            { whole: kr1, delta: kr2, catchUp: kr3, snapshot: kr4, locks: locksR.map(short), door: dr2, newFindings: found.size - f0 });
        resetClient();
    }
    {   // the player's own moves are never undone by a host's pos for their token with a pending action? (actPos) — and a host's pos geometry is typed
        resetClient(); resetRec();
        await fireClient('host', 'pos typed', 'strings and objects as geometry', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p2', x: 'calc(1px)', y: { a: 1 }, rot: 'NaNdeg', front: [] });
        const t2 = stateMod.state.appState.campaigns.c1.items.m_open.whiteboard.find(w => w.id === 'tok_p2');
        check('client: a host\'s pos is applied to the copy only with numeric geometry', typeof t2.x === 'number' && typeof t2.y === 'number' && typeof t2.rot === 'number', { x: t2.x, y: t2.y, rot: t2.rot });
    }
    check('client: every dialog raised in the run was one the app owns (none with host text)', !openFindings().some(f => /dialog/.test(f.kind) && /client/.test(f.kind)));
    check('client: across the run the join was torn down only by denied / kicked / end from the dialled host (' + revived + ' revivals of the stand-in join)', revivedOdd.length === 0, revivedOdd.slice(0, 3));

    /* ---------- the GM this app knows (the signing key, trust on first use): the real join against hosts that are and are not that GM ---------- */
    {
        const gmS = mkSigner(), sqS = mkSigner();   // the GM's pair and a stand-in host's, both Node's own: nothing here is signed by the app's code
        const lsJ = k => { try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
        const signedSnap = (signer, c, over) => { const s = Object.assign(clone(snapshotForClient), over || {}); s.gmPub = Object.assign({}, signer.pub); s.sig = signer.sign(snapText(c.wpCn, c.peer, s.gmId, s.key)); return s; };
        // The app gives a host it knows the GM of five seconds from its hello to prove itself (HOST_PROOF_MS). The suite's timers all fire at a flush, so
        // each dial sets that connection's proof timer aside: a scenario then plays inside the window, and late(c) is the five seconds passing.
        const PROOF_MS = 5000, proofT = new Map();
        const holdProof = c => { const mine = timers.q.filter(t => t.ms === PROOF_MS); timers.q = timers.q.filter(t => t.ms !== PROOF_MS); proofT.set(c, (proofT.get(c) || []).concat(mine)); return mine.length; };
        const late = c => { const due = (proofT.get(c) || []).filter(t => !timers.cleared.has(t.id)); proofT.set(c, []); due.forEach(t => { try { t.fn(); } catch (e) { flushed.threw.push(e); } }); return due.length; };   // the time is up — unless the app cleared its timer
        const dial = () => { const p = peers[peers.length - 1]; p.emit('open'); flushTimers(); const c = p.conns[0]; c.emit('open'); c.proofArmed = holdProof(c); flushTimers(); return c; };   // the newest peer registers and its connection to the room opens (its hello goes out; the wait for the host's proof is the suite's to end)
        const freshJoin = () => { document.getElementById('netJoinBtn').click(); return dial(); };   // a join the player begins, through the real Join button
        const give = async (c, m) => { let threw = null; try { cnet._handleMessage(m, c); } catch (e) { threw = e; } finally { cnet.applyingRemote = false; } await settle(() => !c.wpSnapWait); await drain(); return threw; };
        const SAID = 'This table\u2019s GM is not the one you know from this room code \u2014 the GM may have reinstalled, or someone else is at that code.';
        const ASKED = 'This table\u2019s GM is not the one you know from this room code. The GM may have reinstalled or moved to another computer \u2014 or someone else is at that code. If you are not sure, ask your GM before you say yes. Trust this table\u2019s GM from now on, and join?';
        const canary = () => [].concat(rec.html, rec.text, rec.attr).some(x => x.v.indexOf(CANARY) >= 0) || rec.toasts.some(t => t.indexOf(CANARY) >= 0) || rec.confirms.some(d => d.text.indexOf(CANARY) >= 0);
        cnet.leaveSession(true); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
        localStorage.removeItem('wp_gmPins'); localStorage.removeItem('wp_gmRooms'); localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: K1 }));
        resetRec(); warned.length = 0;

        // 1. first use
        const c1 = freshJoin(), h1 = c1.sent.find(m => m.type === 'hello');
        const t1 = await give(c1, signedSnap(gmS, c1));
        check('client (the GM this app knows): a first join pins the GM — the hello carries this connection\'s own nonce, the snapshot signed over it, the room dialled, the GM id and the table key is taken, the GM\'s key kept by its four public fields, the room code remembered as that GM\'s, the table key stored, no question asked',
            !t1 && !!h1 && h1.cn === c1.wpCn && /^[0-9a-f]{32}$/.test(String(h1.cn)) && !('key' in h1) && cnet.syncedPeer === c1.peer && cnet.foreign === true && JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(gmS.pub) && lsJ('wp_gmRooms').c_abcdef === 'u_gm' && lsJ('wp_tableKeys').u_gm === K1 && rec.confirms.length === 0,
            { threw: t1 && t1.message, cn: h1 && h1.cn, synced: cnet.syncedPeer, pins: lsJ('wp_gmPins'), rooms: lsJ('wp_gmRooms'), confirms: rec.confirms.length });

        // 2. the link drops; the app dials again by itself; the next generation of the code is held by someone else, the one after by the GM
        resetRec(); const keys0 = localStorage.getItem('wp_tableKeys'), pins0 = localStorage.getItem('wp_gmPins'), app0 = JSON.stringify(stateMod.state.appState);
        c1.close(); flushTimers();
        peers[peers.length - 1].emit('error', { type: 'peer-unavailable' }); flushTimers();   // the generation that last answered is gone
        const c2 = dial(), evil = signedSnap(sqS, c2, { key: 'e'.repeat(32), reason: CANARY, notepad: { type: 'notepad', on: true, text: CANARY, gmId: 'u_gm', campaign: CANARY, gm: CANARY } });
        evil.appState.campaigns.c1.name = 'Not your table ' + CANARY;
        const t2 = await give(c2, evil), t2b = await give(c2, { type: 'chat', text: CANARY, from: { id: 'u_gm', name: 'GM', gm: true } });
        const after2 = { open: c2.open, synced: cnet.syncedPeer, same: JSON.stringify(stateMod.state.appState) === app0, keys: localStorage.getItem('wp_tableKeys') === keys0, pins: localStorage.getItem('wp_gmPins') === pins0, confirms: rec.confirms.length, said: rec.toasts.filter(t => t.indexOf(SAID) === 0).length, canary: canary(), active: cnet.active };
        flushTimers();   // the reconnect goes on: the generations after it are not there, and the round comes back to the one refused
        const gone = () => { const p = peers[peers.length - 1]; p.emit('open'); const id = p.conns[0].peer; p.emit('error', { type: 'peer-unavailable' }); flushTimers(); return id; };
        const walked = [gone(), gone(), gone()];
        const c3 = dial(), t3 = await give(c3, signedSnap(gmS, c3));
        check('client (the GM this app knows): on an automatic reconnect a snapshot from whoever holds the next generation of the room code — its own key pair, the GM\'s id, its own text — is refused: nothing synced or applied, nothing more read from it, the stored key and the pin untouched, the connection closed from this side, no question, the notice in the app\'s own words; the reconnect then dials the generations after it and, the round done, passes over the one it refused — where the GM answers, its own snapshot is taken with no question',
            !t2 && !t2b && c2.peer === 'waypoint-abcdef-r1' && after2.open === false && after2.synced === null && after2.same && after2.keys && after2.pins && after2.confirms === 0 && after2.said === 1 && !after2.canary && after2.active === true
            && JSON.stringify(walked) === JSON.stringify(['waypoint-abcdef-r2', 'waypoint-abcdef-r3', 'waypoint-abcdef']) && !t3 && c3.peer === 'waypoint-abcdef-r2' && cnet.syncedPeer === c3.peer && rec.confirms.length === 0 && rec.toasts.filter(t => t.indexOf(SAID) === 0).length === 1 && localStorage.getItem('wp_gmPins') === pins0 && lsJ('wp_tableKeys').u_gm === K1,
            { c2: c2.peer, after2, walked, c3: c3.peer, synced: cnet.syncedPeer, toasts: rec.toasts.slice(0, 4) });

        // 3. every variation of the signed snapshot, each on a join of its own: taken only when the independent reading says so
        const others = [
            ['another key pair, rightly signing its own snapshot under the GM\'s id', c => signedSnap(sqS, c)],
            ['the GM\'s signature made for another connection\'s nonce', c => { const s = signedSnap(gmS, c); s.sig = gmS.sign(snapText('0'.repeat(32), c.peer, 'u_gm', K1)); return s; }],
            ['the GM\'s signature made for another room id', c => { const s = signedSnap(gmS, c); s.sig = gmS.sign(snapText(c.wpCn, c.peer + '-r1', 'u_gm', K1)); return s; }],
            ['the table key changed after signing', c => Object.assign(signedSnap(gmS, c), { key: 'f'.repeat(32) })],
            ['no key and no signature (as an older host)', c => { const s = signedSnap(gmS, c); delete s.gmPub; delete s.sig; return s; }],
            ['another GM id at this room code, rightly signed by its own key', c => signedSnap(sqS, c, { gmId: 'u_other', notepad: null })],
            ['the signature in upper case', c => { const s = signedSnap(gmS, c); s.sig = s.sig.toUpperCase(); return s; }],
            ['the pinned key shown, signed by another', c => { const s = signedSnap(sqS, c); s.gmPub = Object.assign({}, gmS.pub); return s; }]
        ];
        const tplS = { type: 'snapshot', gmId: 'u_gm', key: K1, gmPub: Object.assign({}, gmS.pub), sig: 'f'.repeat(128) }, nMut = mutations(tplS).length;
        let took = 0, refused = 0, stricter = 0, tookOther = 0; const f0 = found.size;
        for (let i = 0; i < nMut + others.length; i++) {
            probes++;
            const c = freshJoin(); let msg, name;
            if (i < nMut) {
                const m = mutations({ type: 'snapshot', gmId: 'u_gm', key: K1, gmPub: Object.assign({}, gmS.pub), sig: gmS.sign(snapText(c.wpCn, c.peer, 'u_gm', K1)) })[i]; msg = m.msg; name = m.name;
                if (msg && typeof msg === 'object') Object.keys(snapshotForClient).forEach(k => { if (!hasOwn(tplS, k) && !hasOwn(msg, k)) msg[k] = clone(snapshotForClient[k]); });   // the rest of a snapshot rides along (none of it is signed)
            } else { name = others[i - nMut][0]; msg = others[i - nMut][1](c); }
            const lsB = localStorage.dump(), want = msg && msg.type === 'snapshot' ? gmJudge(lsB, msg, c, 'abcdef') : 'refuse';
            resetRec(); warned.length = 0;
            const thr = await give(c, msg); flushTimers();
            const tk = cnet.syncedPeer === c.peer && cnet.active === true, lsA = localStorage.dump();
            if (thr) finding('exception escapes handleMessage (client)', 'signed snapshot — ' + thr.constructor.name + ': ' + String(thr.message).slice(0, 120), msg, name);
            if (tk && want === 'refuse') finding('client: a table is taken from a host that is not the GM this app knows', 'a snapshot under a pinned GM, at a room code this app knows → synced', msg, name);
            if (!tk && ['wp_tableKeys', 'wp_gmPins', 'wp_gmRooms'].some(k => lsA[k] !== lsB[k])) finding('client: a refused table changes what this app knows of its GMs or its table keys', 'a snapshot under a pinned GM', msg, name);
            if (rec.confirms.length) finding('client: a refused table raises a question before the join has run its course', 'a snapshot under a pinned GM → "' + rec.confirms[0].text.slice(0, 60) + '"', msg, name);
            if (canary()) finding('client: a refused table\'s text reaches the page', 'a snapshot under a pinned GM', msg, name);
            if (tk) { took++; if (i >= nMut) tookOther++; } else if (want === 'take') stricter++; else refused++;
        }
        check('client (the GM this app knows): ' + (nMut + others.length) + ' variations of the GM\'s signed snapshot, each on a join of its own (' + took + ' taken, ' + refused + ' refused, ' + stricter + ' refused though rightly signed) — one is taken only when Node\'s own crypto finds the pinned key\'s signature over this connection\'s nonce, the room dialled, the GM id and the table key; none of the ' + others.length + ' forgeries is',
            found.size === f0 && took >= 1 && refused >= 40 && tookOther === 0, { took, refused, stricter, tookOther, newFindings: found.size - f0 });

        // 3b. the host's early proof, under the pin: the GM this app knows proves itself as its hello is answered; the wait then is the GM's own
        const gmHail = (signer, c, over) => { const m = Object.assign({ type: 'gmhello', gmId: 'u_gm' }, over || {}); m.gmPub = Object.assign({}, signer.pub); m.sig = signer.sign(hostText(c.wpCn, c.peer, m.gmId)); return m; };
        const proven = c => c.wpHostOk === true;
        const giveH = async (c, m) => { let threw = null; try { cnet._handleMessage(m, c); } catch (e) { threw = e; } finally { cnet.applyingRemote = false; } await settle(() => c.wpHostOk === true || c.wpSnapDead === true || !c.open, 40); await drain(); return threw; };   // until the proof's verdict is in
        {
            resetRec(); const cA = freshJoin(), lsA0 = JSON.stringify(localStorage.dump()), hA = cA.sent.find(m => m.type === 'hello');
            const tA = await giveH(cA, gmHail(gmS, cA)), lateA = late(cA);
            cnet._handleMessage({ type: 'wait' }, cA); flushTimers();
            const mid = { armed: cA.proofArmed, proven: proven(cA), open: cA.open, active: cnet.active, synced: cnet.syncedPeer, ls: JSON.stringify(localStorage.dump()) === lsA0, confirms: rec.confirms.length, late: lateA, waiting: rec.text.some(t => /waiting for the GM to let you in/.test(t.v)) };
            const tA2 = await give(cA, signedSnap(gmS, cA));
            check('client (the early proof): at a room code this app knows the GM of, the hello starts a five-second wait for the host\'s proof; the GM\'s gmhello — signed over this connection\'s nonce, the room dialled, the GM id and the two fingerprints — marks the host as proven and ends that wait, storing nothing and asking nothing; the join then waits on the GM as ever and the signed snapshot is taken',
                !tA && !tA2 && !!hA && hA.cn === cA.wpCn && mid.armed === 1 && mid.proven && mid.open && mid.active === true && mid.synced === null && mid.ls && mid.confirms === 0 && mid.late === 0 && mid.waiting && cnet.syncedPeer === cA.peer && rec.confirms.length === 0, mid);
        }
        // 3c. every variation of the early proof, each on a join of its own: a host counts as proven only when the independent reading says so
        {
            const tplH = { type: 'gmhello', gmId: 'u_gm', gmPub: Object.assign({}, gmS.pub), sig: 'f'.repeat(128) }, nMutH = mutations(tplH).length;
            const forged = [
                ['a key pair of its own, rightly signing under the GM\'s id', c => gmHail(sqS, c)],
                ['the GM\'s proof made for another connection\'s nonce', c => { const m = gmHail(gmS, c); m.sig = gmS.sign(hostText('0'.repeat(32), c.peer, 'u_gm')); return m; }],
                ['the GM\'s proof made for another room id', c => { const m = gmHail(gmS, c); m.sig = gmS.sign(hostText(c.wpCn, c.peer + '-r1', 'u_gm')); return m; }],
                ['a snapshot\'s signature shown as the proof', c => { const m = gmHail(gmS, c); m.sig = gmS.sign(snapText(c.wpCn, c.peer, 'u_gm', K1)); return m; }],
                ['another GM id at this room code, rightly signed by its own key', c => gmHail(sqS, c, { gmId: 'u_other' })],
                ['the pinned key shown, signed by another', c => { const m = gmHail(sqS, c); m.gmPub = Object.assign({}, gmS.pub); return m; }],
                ['no key and no signature', () => ({ type: 'gmhello', gmId: 'u_gm' })]
            ];
            let okN = 0, refN = 0, idleN = 0, okForged = 0; const f0h = found.size;
            for (let i = 0; i < nMutH + forged.length; i++) {
                probes++;
                const c = freshJoin(); let msg, name;
                if (i < nMutH) { const m = mutations({ type: 'gmhello', gmId: 'u_gm', gmPub: Object.assign({}, gmS.pub), sig: gmS.sign(hostText(c.wpCn, c.peer, 'u_gm')) })[i]; msg = m.msg; name = m.name; }
                else { name = forged[i - nMutH][0]; msg = forged[i - nMutH][1](c); }
                const lsB = localStorage.dump(), want = msg && msg.type === 'gmhello' ? hailJudge(lsB, msg, c, 'abcdef') : 'none';
                resetRec(); warned.length = 0;
                const thr = await giveH(c, msg);
                if (thr) finding('exception escapes handleMessage (client)', 'early proof — ' + thr.constructor.name + ': ' + String(thr.message).slice(0, 120), msg, name);
                if (proven(c) && want !== 'ok') finding('client: a host counts as proven that is not the GM this app knows', 'an early proof under a pinned GM, at a room code this app knows', msg, name);
                if (JSON.stringify(localStorage.dump()) !== JSON.stringify(lsB)) finding('client: an early proof writes to this app\'s storage', 'an early proof under a pinned GM', msg, name);
                if (rec.confirms.length) finding('client: an early proof raises a question by itself', 'an early proof under a pinned GM → "' + rec.confirms[0].text.slice(0, 60) + '"', msg, name);
                if (cnet.syncedPeer) finding('client: an early proof syncs a table', 'an early proof under a pinned GM', msg, name);
                if (canary()) finding('client: an early proof\'s text reaches the page', 'an early proof under a pinned GM', msg, name);
                if (proven(c)) { okN++; if (i >= nMutH) okForged++; } else if (c.wpSnapDead === true) refN++; else idleN++;
            }
            check('client (the early proof): ' + (nMutH + forged.length) + ' variations of the GM\'s early proof, each on a join of its own (' + okN + ' proven, ' + refN + ' not waited on, ' + idleN + ' not read) — a host counts as proven only when Node\'s own crypto finds the pinned key\'s signature over this connection\'s nonce, the room dialled and the GM id; none of the ' + forged.length + ' forgeries does; nothing is written to storage, no question is raised by it and no table is synced',
                found.size === f0h && okN >= 1 && refN >= 40 && okForged === 0, { okN, refN, idleN, okForged, newFindings: found.size - f0h });
            // from any other sender it changes nothing: the GM's own proof and its signed table are then taken as ever
            let costly = 0, n2 = 0;
            for (const m of mutations({ type: 'gmhello', gmId: 'u_gm', gmPub: Object.assign({}, gmS.pub), sig: 'f'.repeat(128) }).slice(0, 40).concat([{ name: 'a rightly signed proof of another key', sq: true }, { name: 'the GM\'s own proof for this very connection', own: true }])) {
                probes += 2; n2++;
                const c = freshJoin(), st = new Conn(c.peer), ot = new Conn('waypoint-other'), lsB = JSON.stringify(localStorage.dump()), msg = m.sq ? gmHail(sqS, c) : m.own ? gmHail(gmS, c) : m.msg;
                resetRec(); let thr = null; [st, ot].forEach(from => { try { cnet._handleMessage(msg, from); } catch (e) { thr = e; } finally { cnet.applyingRemote = false; } });
                await settle(() => false, 3); await drain();
                const quietNow = !proven(c) && c.open && c.wpSnapDead !== true && st.wpHailed === undefined && ot.wpHailed === undefined && JSON.stringify(localStorage.dump()) === lsB;
                const t1 = await giveH(c, gmHail(gmS, c)), t2 = await give(c, signedSnap(gmS, c));
                if (thr || t1 || t2 || !quietNow || !proven(c) || cnet.syncedPeer !== c.peer || rec.confirms.length) { costly++; finding('client: an early proof from a connection other than the dialled host changes the join, or costs the GM\'s own signed table', 'gmhello from a stale connection and another host, then the GM\'s proof and snapshot', msg, m.name); }
            }
            check('client (the early proof): from a stale connection or another host it is not read (' + n2 + ' variations, each sent by both) — nothing proven, nothing refused, nothing stored — and the dialled GM\'s own proof and signed snapshot are then taken as ever', costly === 0, { costly });
        }
        // 3d. an automatic reconnect, against a stand-in at every other generation of the code: one that proves nothing (silent, or saying wait, until its
        // five seconds are up — or closing the connection it opened, with or without a wait), one that proves itself as another GM, one that refuses
        // (denied, kicked, end) — none is waited on or believed, none ends or restarts the reconnect, and the GM, back at its own generation, is taken
        const LATE = 'A table answered at this room code but did not show in time that it is your GM\u2019s.';
        const LATE_ASK = 'The table at this room code did not show in time that it is your GM\u2019s. It may only be slow \u2014 or someone else is at that code. Join again and wait for it as long as it takes? Your app still checks that it is your GM before you are joined.';
        const backN = () => rec.toasts.filter(t => /Reconnected/.test(t)).length, attemptNow = () => Number(rec.text.map(t => (t.v.match(/attempt (\d+) of 30/) || [])[1]).filter(Boolean).pop() || 0);
        const genOf = c => (c.peer.match(/-r(\d)$/) || [0, 0])[1] | 0, isGone = () => { const p = peers[peers.length - 1]; p.emit('open'); p.emit('error', { type: 'peer-unavailable' }); flushTimers(); };
        {
            const cS0 = freshJoin(); await giveH(cS0, gmHail(gmS, cS0)); await give(cS0, signedSnap(gmS, cS0));
            const sessionOk = cnet.syncedPeer === cS0.peer && cS0.peer === 'waypoint-abcdef';
            resetRec(); const pinsR = localStorage.getItem('wp_gmPins'), keysR = localStorage.getItem('wp_tableKeys'), appR = JSON.stringify(stateMod.state.appState);
            cS0.close(); flushTimers();
            const logR = [], badR = [], words = ['denied', 'kicked', 'end'], quiet = ['late', 'wait-late', 'close', 'wait-close'], attR = []; let cG = null, guard = 0, refusals = 0, quiets = 0, armedAll = true;
            while (!cG && guard++ < 40) {
                const p = peers[peers.length - 1]; p.emit('open'); const c0 = p.conns[0], gen = genOf(c0);
                attR.push(attemptNow());
                if (gen === 0 && logR.length < 16) { p.emit('error', { type: 'peer-unavailable' }); flushTimers(); logR.push('0:gone'); continue; }   // the GM is not back yet
                c0.emit('open'); c0.proofArmed = holdProof(c0); flushTimers(); if (c0.proofArmed !== 1) armedAll = false;
                if (gen === 0) { cG = c0; break; }
                if (gen === 1) {
                    const how = quiet[quiets++ % 4];
                    if (/wait/.test(how)) { cnet._handleMessage({ type: 'wait' }, c0); flushTimers(); }
                    const stillOpen = c0.open; if (!stillOpen) badR.push('closed before its time was up');
                    if (/close/.test(how)) { c0.close(); late(c0); } else late(c0);   // it closes the connection it opened (the clock then finds nothing to do) — or its five seconds pass
                    logR.push('1:' + how);
                }
                else if (gen === 2) { await giveH(c0, gmHail(sqS, c0, { reason: CANARY })); logR.push('2:other'); }
                else { const w = words[refusals++ % 3]; try { cnet._handleMessage({ type: w, reason: CANARY + ' go away', update: false }, c0); } catch (e) { badR.push('threw: ' + e.message); } finally { cnet.applyingRemote = false; } logR.push('3:' + w); }
                if (c0.open) badR.push(logR[logR.length - 1] + ': the connection was kept');
                if (cnet.active !== true || cnet.leaving === true || cnet.role !== 'client') badR.push(logR[logR.length - 1] + ': the reconnect was ended');
                if (rec.confirms.length) badR.push(logR[logR.length - 1] + ': a question was raised');
                if (rec.loads) badR.push(logR[logR.length - 1] + ': the app went back to its own campaign');
                if (backN()) badR.push(logR[logR.length - 1] + ': "Reconnected" was said with no table taken');
                if (canary()) badR.push(logR[logR.length - 1] + ': the host\'s text reached the page');
                if (JSON.stringify(stateMod.state.appState) !== appR || localStorage.getItem('wp_gmPins') !== pinsR || localStorage.getItem('wp_tableKeys') !== keysR) badR.push(logR[logR.length - 1] + ': something was applied or stored');
                flushTimers();   // the next attempt
            }
            attR.forEach((a, i) => { if (i && a !== attR[i - 1] + 1) badR.push('attempt ' + a + ' after attempt ' + attR[i - 1] + ': the count did not go on by one'); });
            const saidR = rec.toasts.filter(t => t.indexOf(SAID) === 0).length, lateR = rec.toasts.filter(t => t.indexOf(LATE) === 0).length;
            const tG = cG ? await giveH(cG, gmHail(gmS, cG)) : null, backMid = backN(), tG2 = cG ? await give(cG, signedSnap(gmS, cG)) : null;
            badR.forEach(b => finding('client: an automatic reconnect is held, ended or misled by a host that is not the GM this session was with', b, { type: 'gmhello / wait / denied / kicked / end / a connection opened and closed' }));
            check('client (the early proof, an automatic reconnect): with the GM gone and a stand-in at every other generation of the code — one that proves nothing (silent or saying wait until its five seconds are up, or closing each connection it opened, with a wait or without: passed over, the round coming back to it), one that proves itself with a key of its own (passed over at once, and not dialled again), one that refuses with denied, kicked and end in turn (not believed: nothing shown, the reconnect not ended, the round coming back to it) — nothing is applied, stored or asked, each notice is said once in the app\'s own words, "Reconnected" is not said while no table is taken, every attempt counts on by one (never started over, never held at one generation), and the GM, back at its own generation, proves itself and its table is taken with no question — said then, once',
                sessionOk && armedAll && badR.length === 0 && JSON.stringify(logR) === JSON.stringify(['0:gone', '1:late', '2:other', '3:denied', '0:gone', '1:wait-late', '3:kicked', '3:end', '0:gone', '1:close', '3:denied', '3:kicked', '0:gone', '1:wait-close', '3:end', '3:denied']) && !!cG && cG.peer === 'waypoint-abcdef' && attR[0] === 1 && attR.length === 17 && saidR === 1 && lateR === 1 && !tG && !tG2 && backMid === 0 && backN() === 1 && proven(cG) && cnet.syncedPeer === cG.peer && rec.confirms.length === 0 && localStorage.getItem('wp_gmPins') === pinsR,
                { sessionOk, armedAll, badR, logR, cG: cG && cG.peer, attR, saidR, lateR, backMid, back: backN(), synced: cnet.syncedPeer });
            // the GM itself slow once (its proof would land after the five seconds), the other generations not there: passed over, not marked — and
            // prompt when the round comes back, it is taken
            resetRec(); cG.close(); flushTimers();
            const slowLog = []; let cT = null, slowDone = false, gS = 0;
            while (!cT && gS++ < 12 && !rec.loads) {
                const p = peers[peers.length - 1]; p.emit('open'); const c0 = p.conns[0], gen = genOf(c0);
                if (gen !== 0) { p.emit('error', { type: 'peer-unavailable' }); flushTimers(); slowLog.push(gen + ':gone'); continue; }
                c0.emit('open'); c0.proofArmed = holdProof(c0); flushTimers();
                if (!slowDone) { slowDone = true; late(c0); slowLog.push('0:slow'); try { cnet._handleMessage(gmHail(gmS, c0), c0); } catch (e) {} finally { cnet.applyingRemote = false; } flushTimers(); continue; }   // (its proof, landing after the app let go, is not read)
                cT = c0; slowLog.push('0:prompt');
            }
            const tT = cT ? await giveH(cT, gmHail(gmS, cT)) : null, tT2 = cT ? await give(cT, signedSnap(gmS, cT)) : null;
            check('client (the early proof, an automatic reconnect): the GM\'s own app slow once — no proof within its five seconds — is passed over in words of its own (never "not the one you know") and NOT marked as refused: the round comes back to its generation, and prompt this time its proof and its table are taken, with no question and nothing restored',
                JSON.stringify(slowLog) === JSON.stringify(['0:slow', '1:gone', '2:gone', '3:gone', '0:prompt']) && !!cT && !tT && !tT2 && proven(cT) && cnet.syncedPeer === cT.peer && rec.loads === 0 && rec.confirms.length === 0 && rec.toasts.filter(t => t.indexOf(SAID) === 0).length === 0 && rec.toasts.filter(t => t.indexOf(LATE) === 0).length === 1 && backN() === 1,
                { slowLog, synced: cnet.syncedPeer, loads: rec.loads, toasts: rec.toasts.slice(0, 5) });
            cG = cT || cG;
            // and a refusal from a host that HAS proven itself on a reconnect is its own word, taken as ever
            resetRec(); cG.close(); flushTimers();
            const cP = dial(), tP = await giveH(cP, gmHail(gmS, cP)); let tP2 = null; try { cnet._handleMessage({ type: 'denied', reason: 'The GM declined your request to join.' }, cP); } catch (e) { tP2 = e; } finally { cnet.applyingRemote = false; }
            const saidP = rec.text.some(t => t.v === 'The GM declined your request to join.'); flushTimers();
            check('client (the early proof, an automatic reconnect): a refusal from the host that has proven itself as the GM is the GM\'s own — shown and acted on as before (the reconnect ends, the app goes back to its own campaign)', !tP && !tP2 && cP.peer === 'waypoint-abcdef' && saidP && cnet.active === false && rec.loads === 1 && cP.open === false, { peer: cP.peer, saidP, active: cnet.active, loads: rec.loads });
            cnet.leaveSession(true); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
            // a join the player begins: hosts that say wait and prove nothing are not waited on; ONE question at the end, in words of its own
            resetRec(); const atS = []; let cW = freshJoin();
            for (let g = 0; g < 4; g++) { atS.push(cW.peer); cnet._handleMessage({ type: 'wait' }, cW); flushTimers(); late(cW); flushTimers(); if (g < 3) cW = dial(); }
            const qS = rec.confirms.slice(), stS = { active: cnet.active, synced: cnet.syncedPeer, pins: localStorage.getItem('wp_gmPins') === pinsR, said: rec.text.some(t => t.v === LATE + ' You have not joined.'), notOther: !rec.text.some(t => t.v.indexOf(SAID) === 0) };
            if (qS[0]) qS[0].cb(false); flushTimers();
            check('client (the early proof, a join the player begins): at a room code this app knows the GM of, a host that says wait and proves nothing is not waited on — each generation is passed over when its five seconds are up, and the join ends unjoined, said in words of its own (a table that did not show in time, never "not the one you know"), with ONE question (its own words, never answered by Enter); a no changes nothing',
                JSON.stringify(atS) === JSON.stringify(['waypoint-abcdef', 'waypoint-abcdef-r1', 'waypoint-abcdef-r2', 'waypoint-abcdef-r3']) && qS.length === 1 && qS[0].text === LATE_ASK && !!qS[0].opts && qS[0].opts.noEnter === true && stS.active === false && stS.synced === null && stS.pins && stS.said && stS.notOther && localStorage.getItem('wp_gmPins') === pinsR, { atS, asked: qS.map(d => d.text.slice(0, 60)), stS });
            // a yes to that question is a yes to waiting longer, and to nothing else: an unsigned table under the GM's id is still refused
            resetRec(); let cL = freshJoin(); late(cL); flushTimers(); isGone(); isGone(); isGone();
            const qL = rec.confirms.slice(); if (qL[0]) qL[0].cb(true);
            const cY = dial(), uns = clone(snapshotForClient); delete uns.gmPub; delete uns.sig; uns.gmId = 'u_gm'; uns.key = 'e'.repeat(32);
            cnet._handleMessage({ type: 'wait' }, cY); flushTimers(); const armY = [cY.proofArmed, cY.open, late(cY), rec.text.some(t => /waiting for the GM to let you in/.test(t.v))], tY = await give(cY, uns); flushTimers();   // no clock on this join: its wait is waited on
            const afterUns = { synced: cnet.syncedPeer, pins: localStorage.getItem('wp_gmPins') === pinsR, key: JSON.parse(localStorage.getItem('wp_tableKeys') || '{}').u_gm === K1, open: cY.open };
            isGone(); isGone(); isGone(); const qU = rec.confirms.slice(1); if (qU[0]) qU[0].cb(false); flushTimers();
            check('client (the early proof, a join the player begins): a yes to the late table\'s question joins again and waits on that table with no clock, and is a yes to nothing else — whoever then answers with an unsigned table under the GM\'s id is refused as ever (nothing synced, the pin and the table key untouched), and that join ends in its own ONE question, the existing one',
                qL.length === 1 && qL[0].text === LATE_ASK && JSON.stringify(armY) === JSON.stringify([0, true, 0, true]) && !tY && afterUns.synced === null && afterUns.pins && afterUns.key && qU.length === 1 && qU[0].text === ASKED && localStorage.getItem('wp_gmPins') === pinsR, { asked: qL.map(d => d.text.slice(0, 40)), armY, afterUns, then: qU.map(d => d.text.slice(0, 40)) });
            resetRec(); cL = freshJoin(); late(cL); flushTimers(); isGone(); isGone(); isGone();
            const qM = rec.confirms.slice(); if (qM[0]) qM[0].cb(true);
            const cZ2 = dial(), tZ1 = await giveH(cZ2, gmHail(gmS, cZ2)), tZ2 = await give(cZ2, signedSnap(gmS, cZ2));
            check('client (the early proof, a join the player begins): after that yes the GM\'s own proof and signed table are taken with no second question',
                qM.length === 1 && !tZ1 && !tZ2 && proven(cZ2) && cnet.syncedPeer === cZ2.peer && rec.confirms.length === 1 && localStorage.getItem('wp_gmPins') === pinsR && backN() === 0, { asked: qM.length, synced: cnet.syncedPeer, confirms: rec.confirms.length });
            cnet.leaveSession(true); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
            // a join the player begins, and whoever holds the first generation opens each connection and closes it without a word
            resetRec(); const cJ0 = freshJoin(); cJ0.close(); flushTimers();
            const cJ1 = dial(), j1 = { peer: cJ1.peer, retry: cJ1.wpRetry, attempt: attemptNow(), loads: rec.loads, lost: rec.toasts.filter(t => /Connection lost/.test(t)).length };
            const tJ1 = await giveH(cJ1, gmHail(gmS, cJ1)), tJ2 = await give(cJ1, signedSnap(gmS, cJ1));
            check('client (the early proof, a join the player begins): at a room code this app knows the GM of, a connection that opens and is closed before any proof is passed over as a host that did not prove itself — the join goes on to the next generation as a join the player began (no automatic reconnect is started at the generation that closed it), and the GM there is taken',
                j1.peer === 'waypoint-abcdef-r1' && j1.retry === false && j1.attempt === 0 && j1.loads === 0 && j1.lost === 0 && !tJ1 && !tJ2 && cnet.syncedPeer === cJ1.peer && rec.confirms.length === 0, j1);
            cnet.leaveSession(true); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
            // the same where this app knows nothing of the code's GM (a first join): the dropped join reconnects by itself, as before — and is not held
            const lsRooms = localStorage.getItem('wp_gmRooms'), lsPins = localStorage.getItem('wp_gmPins'); localStorage.removeItem('wp_gmRooms'); localStorage.removeItem('wp_gmPins');
            resetRec(); let cF = freshJoin(); const walkF = [];
            for (let i = 0; i < 6; i++) { cF.close(); flushTimers(); const p = peers[peers.length - 1]; p.emit('open'); cF = p.conns[0]; walkF.push(genOf(cF) + ':' + attemptNow() + ':' + (cF.wpRetry === true)); cF.emit('open'); holdProof(cF); flushTimers(); }
            check('client (a first join, nothing known of the table): a connection that opens and is closed before any table is taken starts the automatic reconnect as before, and that reconnect is not held — every attempt counts on by one and the generations are dialled in turn, "Reconnected" never said',
                JSON.stringify(walkF) === JSON.stringify(['0:1:true', '1:2:true', '2:3:true', '3:4:true', '0:5:true', '1:6:true']) && backN() === 0 && rec.loads === 0 && rec.confirms.length === 0, { walkF, back: backN() });
            cnet.leaveSession(); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
            if (lsRooms !== null) localStorage.setItem('wp_gmRooms', lsRooms); if (lsPins !== null) localStorage.setItem('wp_gmPins', lsPins);
        }

        // 4. a join the player begins, and every generation of the code answers as someone else: asked once, at the end, in the app's own words
        const walk = async () => { const at = []; let c = freshJoin(); for (let g = 0; g < 4; g++) { at.push(c.peer); await give(c, signedSnap(sqS, c, { reason: CANARY, notepad: { type: 'notepad', on: true, text: CANARY, gmId: 'u_gm', campaign: CANARY, gm: CANARY } })); flushTimers(); if (g < 3) c = dial(); } return at; };
        resetRec(); const at1 = await walk(), q1 = rec.confirms.slice(), nPeers = peers.length;
        const said1 = rec.text.some(t => t.v.indexOf(SAID + ' You have not joined.') === 0), state1 = { active: cnet.active, synced: cnet.syncedPeer, pins: localStorage.getItem('wp_gmPins') === pins0, keys: lsJ('wp_tableKeys').u_gm === K1, canary: canary() };
        if (q1[0]) q1[0].cb(false);
        flushTimers(); const afterNo = { peers: peers.length - nPeers, active: cnet.active, pins: localStorage.getItem('wp_gmPins') === pins0 };
        check('client (the GM this app knows): a join the player begins tries each generation of the code in turn when the one that answers is not their GM, and ends unjoined — said in the app\'s own words, nothing of the host\'s text shown — with ONE question (the app\'s own words, never answered by Enter); a no changes nothing and dials nothing',
            JSON.stringify(at1) === JSON.stringify(['waypoint-abcdef', 'waypoint-abcdef-r1', 'waypoint-abcdef-r2', 'waypoint-abcdef-r3']) && q1.length === 1 && q1[0].text === ASKED && !!q1[0].opts && q1[0].opts.noEnter === true && said1 && state1.active === false && state1.synced === null && state1.pins && state1.keys && !state1.canary && afterNo.peers === 0 && afterNo.active === false && afterNo.pins,
            { at1, asked: q1.map(d => d.text.slice(0, 50)), said1, state1, afterNo });
        resetRec(); await walk(); const q2 = rec.confirms.slice();
        if (q2[0]) q2[0].cb(true);
        const cY = dial(), tY = await give(cY, signedSnap(sqS, cY)), yes = { asked: q2.length, synced: cnet.syncedPeer === cY.peer, pin: JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(sqS.pub), confirms: rec.confirms.length };
        const cZ = freshJoin(), tZ = await give(cZ, signedSnap(gmS, cZ)), then = { synced: cnet.syncedPeer === cZ.peer, pin: JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(sqS.pub) };   // and from then on the key said yes to is the one known: the old one is refused in its turn
        check('client (the GM this app knows): a yes joins again and takes the table that answered with that very key — pinned in place of the old one, no second question — and from then on that is the GM this app knows',
            !tY && !tZ && yes.asked === 1 && yes.synced && yes.pin && yes.confirms === 1 && then.synced === false && then.pin, { yes, then });
        cnet.leaveSession(true); flushTimers(); resetRec();
    }

    /* ---------- the summary ---------- */
    check('host: every player a probe cost their connection was readmitted through the proof (' + readmits + ' readmissions)', readmitFailed.length === 0, readmitFailed.slice(0, 3));
    const list = [...found.values()], open = openFindings(), acceptedF = list.filter(f => !open.includes(f));
    open.forEach(f => { console.log(findingLine(f) + (f.n > 1 ? '  (×' + f.n + ')' : '') + (f.msg ? '\n          message: ' + f.msg : '')); });
    acceptedF.forEach(f => { console.log('accepted  ' + f.kind + ' — ' + f.detail + (f.n > 1 ? '  (×' + f.n + ')' : '') + '  (' + acceptedBy(findingLine(f)).why + ')'); });
    const passed = checks - checksFailed - checksAccepted, accepted = checksAccepted + acceptedF.length;
    console.log('# ' + probes + ' messages fired, ' + list.length + ' distinct findings (' + open.length + ' open, ' + acceptedF.length + ' accepted), ' + Math.round((Date.now() - T0 - clockOff) / 1000) + ' s');
    console.log(passed + ' passed, ' + (checksFailed + open.length) + ' failed' + (accepted ? ', ' + accepted + ' accepted' : '') + '.');
    summed = true;
    process.exit(checksFailed + open.length ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite itself threw: ' + (e.stack || e.message)); console.log(checks + ' passed, ' + (checksFailed + 1) + ' failed.'); summed = true; process.exit(1); });
let summed = false;
process.on('exit', c => { if (!summed) { realError('fuzzcheck: the run ended before its summary (a promise nothing answered)'); process.exitCode = 1; } });
