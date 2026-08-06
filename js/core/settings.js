/**
 * settings.js - App-Einstellungen (Theme, Sound, Haptik, Animationen).
 * Wird sofort beim Start angewandt und im LocalStorage gehalten.
 */
window.PG = window.PG || {};

PG.settings = (function () {
  'use strict';

  var KEY = 'pg.settings.v1';

  var DEFAULTS = {
    theme: 'system',   // 'system' | 'light' | 'dark'
    sound: true,
    haptics: true,
    animations: true
  };

  var data = Object.assign({}, DEFAULTS, PG.storage.get(KEY, {}));
  var listeners = [];

  function notify() {
    listeners.slice().forEach(function (fn) { fn(data); });
  }

  /** Schreibt Theme und Motion-Flag auf das <html>-Element. */
  function apply() {
    var root = document.documentElement;
    if (data.theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', data.theme);
    }
    root.setAttribute('data-motion', data.animations ? 'on' : 'off');

    // Adressleisten-Farbe an das Theme anpassen (mobile Browser).
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var dark = data.theme === 'dark' ||
        (data.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      meta.setAttribute('content', dark ? '#0b0d14' : '#f3f4f7');
    }
  }

  function get(key) {
    return data[key];
  }

  function set(key, value) {
    if (data[key] === value) return;
    data[key] = value;
    PG.storage.set(KEY, data);
    apply();
    notify();
  }

  function all() {
    return Object.assign({}, data);
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /**
   * Duerfen Animationen laufen? Beruecksichtigt zusaetzlich die
   * Systemeinstellung "Bewegung reduzieren".
   */
  function motionEnabled() {
    if (!data.animations) return false;
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Systemtheme-Wechsel live uebernehmen, solange 'system' aktiv ist.
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var onChange = function () { if (data.theme === 'system') apply(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);

  return {
    get: get,
    set: set,
    all: all,
    apply: apply,
    subscribe: subscribe,
    motionEnabled: motionEnabled
  };
})();
