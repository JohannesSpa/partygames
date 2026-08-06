/**
 * storage.js - defensiver LocalStorage-Wrapper.
 *
 * Faengt alle Fehlerquellen ab (Private Mode, volles Kontingent, file://
 * mit deaktiviertem Storage) und liefert im Zweifel den Fallback zurueck,
 * damit die App niemals wegen der Persistenz abstuerzt.
 */
window.PG = window.PG || {};

PG.storage = (function () {
  'use strict';

  var available = (function () {
    try {
      var probe = '__pg_probe__';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch (err) {
      return false;
    }
  })();

  /**
   * Liest einen JSON-Wert.
   * @param {string} key
   * @param {*} [fallback]
   */
  function get(key, fallback) {
    if (!available) return fallback;
    try {
      var raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      // Beschaedigter Eintrag: aufraeumen statt dauerhaft zu scheitern.
      try { window.localStorage.removeItem(key); } catch (e) {}
      return fallback;
    }
  }

  /**
   * Schreibt einen JSON-Wert.
   * @returns {boolean} true, wenn gespeichert werden konnte
   */
  function set(key, value) {
    if (!available) return false;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      return false;
    }
  }

  function remove(key) {
    if (!available) return;
    try { window.localStorage.removeItem(key); } catch (err) {}
  }

  /**
   * Erzeugt eine gedrosselte Speicherfunktion (mehrere Aenderungen
   * kurz hintereinander schreiben nur einmal).
   * @param {string} key
   * @param {number} [wait]
   */
  function debouncedSetter(key, wait) {
    var timer = null;
    return function (value) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        set(key, value);
      }, wait || 180);
    };
  }

  return {
    available: available,
    get: get,
    set: set,
    remove: remove,
    debouncedSetter: debouncedSetter
  };
})();
