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

var CACHE_VERSION = 'v1';
var CACHE_NAME = 'partygames-' + CACHE_VERSION;

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',

  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/animations.css',

  './js/core/dom.js',
  './js/core/storage.js',
  './js/core/store.js',
  './js/core/settings.js',
  './js/core/audio.js',
  './js/core/haptics.js',
  './js/core/confetti.js',
  './js/core/registry.js',
  './js/core/history.js',
  './js/core/router.js',
  './js/core/pwa.js',

  './js/ui/icons.js',
  './js/ui/components.js',
  './js/ui/header.js',
  './js/ui/settings-sheet.js',

  './js/games/tara-tara/logic.js',
  './js/games/tara-tara/state.js',
  './js/games/tara-tara/wheel.js',
  './js/games/tara-tara/screens.js',
  './js/games/tara-tara/game.js',

  './js/screens/stats.js',
  './js/tests.js',
  './js/app.js',

  './icons/icon-32.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

/* ------------------------------------------------------------- Installation */

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Einzeln ablegen: eine fehlende Datei soll nicht die ganze
      // Installation scheitern lassen.
      return Promise.all(ASSETS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' })).catch(function (err) {
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

  // Seitenaufrufe: erst Netz (damit Updates ankommen), sonst Cache.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match('./index.html');
        });
      })
    );
    return;
  }

  // Alles andere: erst Cache (schnell und offline), im Hintergrund erneuern.
  event.respondWith(
    caches.match(request).then(function (cached) {
      var network = fetch(request).then(function (response) {
        if (response && response.status === 200) {
          var copy = response.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        return cached;
      });
      return cached || network;
    })
  );
});

/* ------------------------------------------------------------------ Update */

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
