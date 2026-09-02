/* ============================================================
   2nd-Brain · sb-boot.js — synchronous JSON data loader.
   Runs as a PLAIN script BEFORE every text/babel script, so all
   sb-*.jsx files (including module-top-level reads like sb-home's
   window.SB.STARS destructure) see window.SB_DATA already filled.
   Data manifest: data/index.json — add new packs there.
   Requires an http server (python3 -m http.server); file:// won't fetch.
   ============================================================ */
(function () {
  'use strict';
  function loadJSON(path) {
    var x = new XMLHttpRequest();
    x.open('GET', path, false); // sync on purpose: preserves the original
    try {                       // "data ready before code" execution model
      x.send();
    } catch (e) {
      throw new Error('[sb-boot] fetch failed for ' + path +
        ' — serve over http (cd reference-app && python3 -m http.server 8000)');
    }
    if (x.status !== 200 && x.status !== 0) {
      throw new Error('[sb-boot] HTTP ' + x.status + ' for ' + path);
    }
    return JSON.parse(x.responseText);
  }
  var manifest = loadJSON('data/index.json');
  var D = { __manifest: manifest };
  Object.keys(manifest.files).forEach(function (key) {
    D[key] = loadJSON(manifest.files[key]);
  });
  window.SB_DATA = D;
})();
