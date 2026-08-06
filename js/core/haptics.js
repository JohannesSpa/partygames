/**
 * haptics.js - haptisches Feedback auf unterstuetzten Geraeten.
 * Auf Desktop-Browsern schlicht ein No-op.
 */
window.PG = window.PG || {};

PG.haptics = (function () {
  'use strict';

  var supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

  function vibrate(pattern) {
    if (!supported || !PG.settings.get('haptics')) return;
    try { navigator.vibrate(pattern); } catch (err) {}
  }

  return {
    supported: supported,
    light: function () { vibrate(10); },
    medium: function () { vibrate(24); },
    heavy: function () { vibrate([34, 40, 34]); },
    success: function () { vibrate([16, 60, 16, 60, 40]); },
    warning: function () { vibrate([60, 50, 60]); },
    vibrate: vibrate
  };
})();
