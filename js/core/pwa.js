/**
 * pwa.js - Installation als App und Offline-Betrieb.
 *
 * Der Service Worker laeuft nur ueber HTTPS oder localhost. Unter file://
 * (Doppelklick auf index.html) wird alles hier still uebersprungen - die App
 * funktioniert dann wie bisher, nur ohne Cache und ohne Installation.
 */
window.PG = window.PG || {};

PG.pwa = (function () {
  'use strict';

  var deferredPrompt = null;   // beforeinstallprompt-Ereignis (Chrome/Edge/Android)
  var listeners = [];
  var registration = null;

  /** Laeuft die App bereits als installierte App? */
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches ||
           window.navigator.standalone === true;
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  }

  /** Kontext, in dem Service Worker erlaubt sind. */
  function isSupportedContext() {
    var protocol = window.location.protocol;
    var host = window.location.hostname;
    return 'serviceWorker' in navigator &&
           (protocol === 'https:' || host === 'localhost' || host === '127.0.0.1');
  }

  /** Kann ein Installations-Hinweis angezeigt werden? */
  function canInstall() {
    if (isStandalone()) return false;
    if (deferredPrompt) return true;
    // iOS bietet keinen Dialog an - dort hilft nur eine Anleitung.
    return isIos() && isSupportedContext();
  }

  function notify() {
    listeners.slice().forEach(function (fn) { fn(); });
  }

  /** Wird aufgerufen, wenn sich der Installationsstatus aendert. */
  function onChange(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ------------------------------------------------------------ Installation */

  /** Zeigt den Installationsdialog bzw. die Anleitung fuer iOS. */
  function install() {
    if (deferredPrompt) {
      var prompt = deferredPrompt;
      deferredPrompt = null;
      prompt.prompt();
      prompt.userChoice.then(function (choice) {
        if (choice && choice.outcome === 'accepted') {
          PG.ui.toast('PartyGames wird installiert', { icon: 'check', variant: 'success' });
        }
        notify();
      });
      return;
    }

    // iOS Safari: Schritt-fuer-Schritt erklaeren
    var h = PG.dom.h;
    var dlg = PG.ui.dialog({
      title: 'Zum Home-Bildschirm',
      content: h('div', { class: 'stack' },
        PG.ui.notice({
          icon: 'info',
          text: 'In Safari lässt sich PartyGames mit zwei Schritten wie eine App ablegen:'
        }),
        h('div', { class: 'detail-list' },
          [
            ['1.', 'Unten auf das Teilen-Symbol tippen (Quadrat mit Pfeil nach oben)'],
            ['2.', '„Zum Home-Bildschirm" wählen und mit „Hinzufügen" bestätigen']
          ].map(function (pair) {
            return h('div', { class: 'detail-list__row' },
              h('span', { class: 'text-bold', text: pair[0] }),
              h('span', { class: 'text-sm', style: { 'text-align': 'right' }, text: pair[1] })
            );
          })
        ),
        h('div', { class: 'text-subtle text-center',
          text: 'Danach startet die App im Vollbild – ohne Browserleiste.' })
      ),
      actions: [PG.ui.button({ label: 'Alles klar', variant: 'primary', onClick: function () { dlg.close(); } })]
    });
  }

  /* ---------------------------------------------------------------- Updates */

  /** Bietet an, eine neue Version zu laden. */
  function offerUpdate(worker) {
    var dlg = PG.ui.dialog({
      title: 'Neue Version verfügbar',
      content: PG.dom.h('p', { class: 'text-muted',
        text: 'Es liegt eine aktualisierte Fassung von PartyGames bereit. ' +
              'Ein laufendes Spiel bleibt gespeichert.' }),
      actions: [
        PG.ui.button({
          label: 'Jetzt aktualisieren', variant: 'primary', icon: 'rotate',
          onClick: function () {
            dlg.close();
            worker.postMessage('SKIP_WAITING');
          }
        }),
        PG.ui.button({ label: 'Später', variant: 'ghost', onClick: function () { dlg.close(); } })
      ]
    });
  }

  /* ------------------------------------------------------------------ Start */

  function init() {
    // Installationsangebot merken (Chrome, Edge, Android)
    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredPrompt = event;
      notify();
    });

    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      PG.ui.toast('PartyGames ist installiert', { icon: 'check', variant: 'success' });
      notify();
    });

    if (!isSupportedContext()) return;

    // Manifest erst hier einhaengen: unter file:// wuerde der Browser
    // sonst eine Fehlermeldung in der Konsole hinterlassen.
    if (!document.querySelector('link[rel="manifest"]')) {
      var link = document.createElement('link');
      link.rel = 'manifest';
      link.href = 'manifest.webmanifest';
      document.head.appendChild(link);
    }

    navigator.serviceWorker.register('sw.js').then(function (reg) {
      registration = reg;

      reg.addEventListener('updatefound', function () {
        var worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function () {
          // Nur melden, wenn schon eine alte Version lief.
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            offerUpdate(worker);
          }
        });
      });
    }).catch(function (err) {
      console.warn('[pwa] Service Worker nicht registriert:', err);
    });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  }

  return {
    init: init,
    install: install,
    canInstall: canInstall,
    isStandalone: isStandalone,
    isIos: isIos,
    isSupportedContext: isSupportedContext,
    onChange: onChange,
    registration: function () { return registration; }
  };
})();
