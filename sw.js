/*
 * Service worker - makes the site installable and usable offline.
 *  - App shell (pages, css, js, icons, manifest): precached; served
 *    stale-while-revalidate so it opens instantly and updates in the background.
 *  - data/ (history.csv, status.json): network-first. Every successful
 *    response is stored; offline, the last stored copy is served with an
 *    X-JW-From-Cache header so the page can say it is showing saved data.
 *  - assets/logos/*: cache-first at runtime (not precached; may 404).
 * Bump VERSION whenever shell files change.
 */
var VERSION = "v2";
var SHELL_CACHE = "jw-shell-" + VERSION;
var DATA_CACHE = "jw-data-v1";
var LOGO_CACHE = "jw-logos-v1";
var KEEP = [SHELL_CACHE, DATA_CACHE, LOGO_CACHE];

var SHELL = [
  "./",
  "index.html",
  "browse.html",
  "market.html",
  "manifest.webmanifest",
  "assets/css/style.css",
  "assets/js/core.js",
  "assets/js/app.js",
  "assets/js/charts.js",
  "assets/js/today.js",
  "assets/js/browse.js",
  "assets/js/market.js",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "assets/icons/icon-maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(function (cache) {
      return cache.addAll(SHELL.map(function (u) { return new Request(u, { cache: "reload" }); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k.indexOf("jw-") === 0 && KEEP.indexOf(k) === -1; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function scopePath(url) {
  // path relative to the SW scope, e.g. "data/history.csv"
  var scope = new URL(self.registration.scope);
  return url.pathname.indexOf(scope.pathname) === 0 ? url.pathname.slice(scope.pathname.length) : url.pathname;
}

function markCached(res) {
  var headers = new Headers(res.headers);
  headers.set("X-JW-From-Cache", "1");
  return res.blob().then(function (body) {
    return new Response(body, { status: res.status, statusText: res.statusText, headers: headers });
  });
}

function networkFirstData(request) {
  var key = request.url.split("?")[0];
  return fetch(request).then(function (res) {
    if (res && res.ok) {
      var copy = res.clone();
      caches.open(DATA_CACHE).then(function (c) { return c.put(key, copy); });
    }
    return res;
  }).catch(function () {
    return caches.open(DATA_CACHE).then(function (c) { return c.match(key); }).then(function (hit) {
      if (hit) return markCached(hit);
      return new Response("offline and no saved copy", { status: 503, statusText: "Offline" });
    });
  });
}

function staleWhileRevalidate(request, event) {
  return caches.open(SHELL_CACHE).then(function (cache) {
    return cache.match(request, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(request).then(function (res) {
        if (res && res.ok && res.type === "basic") cache.put(request, res.clone());
        return res;
      });
      if (hit) {
        event.waitUntil(net.catch(function () {}));
        return hit;
      }
      return net.catch(function () {
        // offline navigation to an uncached URL: fall back to the Today page
        if (request.mode === "navigate") return cache.match("index.html");
        throw new Error("offline");
      });
    });
  });
}

function cacheFirstLogo(request) {
  return caches.open(LOGO_CACHE).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (res) {
        if (res && res.ok) cache.put(request, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  var path = scopePath(url);

  if (path.indexOf("data/") === 0) { event.respondWith(networkFirstData(req)); return; }
  if (path.indexOf("assets/logos/") === 0) { event.respondWith(cacheFirstLogo(req)); return; }
  event.respondWith(staleWhileRevalidate(req, event));
});
