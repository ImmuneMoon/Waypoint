/* The public half of the key that signs Waypoint's one-click updates: updater.js takes an update only when its signature
   checks against this key. It lives in the shell, which only the installer replaces, so an update cannot bring a key of
   its own. Written by tools/signkey.js: never edit it by hand, and never put a private key here.
   Empty ('') means no key has been made yet: no one-click update is taken at all. */
'use strict';
const UPDATE_PUBKEY = '';
module.exports = { UPDATE_PUBKEY };
