/**
 * sw.js - Service Worker fuer den Offline-Betrieb.
 *
 * Beim ersten Aufruf werden alle Dateien in den Cache gelegt; danach laeuft
 * die App auch ohne Internet. Bei jeder Aenderung an den Dateien muss
 * CACHE_VERSION erhoeht werden - dadurch wird der alte Cache verworfen.
 *
 * Hinweis: Service Worker funktionieren nur ueber HTTPS (oder localhost).
 * Unter file:// laeuft die App weiterhin, nur eben ohne diesen Cache -
 * siehe js/core/pwa.js.
 */

var CACHE_VERSION = 'v10';
var CACHE_NAME = 'partygames-' + CACHE_VERSION;

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',

  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/animations.css',

  './js/config.js',
  './js/core/dom.js',
  './js/core/storage.js',
  './js/core/store.js',
  './js/core/settings.js',
  './js/core/audio.js',
  './js/core/haptics.js',
  './js/core/confetti.js',
  './js/core/registry.js',
  './js/core/history.js',
  './js/core/roster.js',
  './js/core/router.js',
  './js/core/pwa.js',
  './js/core/sync.js',

  './js/ui/icons.js',
  './js/ui/components.js',
  './js/ui/header.js',
  './js/ui/settings-sheet.js',

  './js/games/tara-tara/logic.js',
  './js/games/tara-tara/state.js',
  './js/games/tara-tara/wheel.js',
  './js/games/tara-tara/screens.js',
  './js/games/tara-tara/game.js',

  './js/screens/sync-ui.js',
  './js/screens/stats.js',
  './js/tests.js',
  './js/app.js',

  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ------------------------------------------------------------- Installation */

// Merkt sich, was beim Vorladen schiefging - abrufbar ueber die
// VERSION-Nachricht (siehe unten).
var failedAssets = [];

/**
 * Laedt eine Datei frisch und legt sie ab.
 *
 * Wichtig: Antworten, die aus einer Umleitung stammen, werden als Kopie
 * ohne dieses Merkmal gespeichert. Eine umgeleitete Antwort darf der
 * Browser beim Start einer installierten App nicht verwenden - er bricht
 * sonst mit einem Netzwerkfehler ab. Cloudflare leitet z. B. /index.html
 * grundsaetzlich auf / um.
 */
function cacheFresh(cache, url) {
  return fetch(new Request(url, { cache: 'reload' })).then(function (response) {
    if (!response || !response.ok) {
      throw new Error('HTTP ' + (response ? response.status : '?'));
    }
    return cache.put(url, stripRedirect(response));
  });
}

/** Entfernt das Umleitungs-Merkmal, indem der Rumpf neu verpackt wird. */
function stripRedirect(response) {
  if (!response.redirected) return response;
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      failedAssets = [];
      // Einzeln ablegen: eine fehlende Datei soll nicht die ganze
      // Installation scheitern lassen.
      return Promise.all(ASSETS.map(function (url) {
        return cacheFresh(cache, url).catch(function (err) {
          failedAssets.push(url + ' (' + (err && err.message ? err.message : err) + ')');
          console.warn('[sw] konnte nicht cachen:', url, err);
        });
      }));
    })
  );
});

/* -------------------------------------------------------------- Aktivierung */

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME && key.indexOf('partygames-') === 0) {
          return caches.delete(key);
        }
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ------------------------------------------------------------------- Fetch */

self.addEventListener('fetch', function (event) {
  var request = event.request;

  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  var isNavigation = request.mode === 'navigate';

  event.respondWith(
    caches.match(request, { ignoreSearch: isNavigation }).then(function (cached) {

      var network = fetch(request).then(function (response) {
        // NUR brauchbare Antworten uebernehmen. Ein 404 - etwa weil die
        // Seite offline genommen wurde (privates Repo bei GitHub Pages) -
        // darf den funktionierenden Cache niemals ueberschreiben.
        if (response && response.ok && response.type === 'basic') {
          var copy = stripRedirect(response.clone());
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return null;
      });

      // Vorhanden? Sofort ausliefern (schneller Start, offline sicher) und
      // im Hintergrund auffrischen. Neue Fassungen kommen ueber den
      // Versionswechsel des Service Workers, nicht ueber diesen Weg.
      if (cached) {
        event.waitUntil(network);
        return cached;
      }

      return network.then(function (response) {
        if (response) return response;
        // Notnagel fuer Seitenaufrufe: die Startseite unter './' - dort
        // gibt es keine Umleitung.
        return isNavigation
          ? caches.match('./').then(function (start) { return start || caches.match('./index.html'); })
          : Response.error();
      });
    })
  );
});

/* ------------------------------------------------------------------ Update */

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  // Selbstauskunft: welche Fassung laeuft, wie viele Dateien liegen im
  // Cache, was hat beim Vorladen nicht geklappt.
  if (event.data && event.data.type === 'VERSION' && event.ports && event.ports[0]) {
    var port = event.ports[0];
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.keys();
    }).then(function (keys) {
      port.postMessage({
        version: CACHE_VERSION,
        cacheName: CACHE_NAME,
        cached: keys.length,
        expected: ASSETS.length,
        failed: failedAssets
      });
    }).catch(function (err) {
      port.postMessage({ version: CACHE_VERSION, error: String(err) });
    });
  }
});
