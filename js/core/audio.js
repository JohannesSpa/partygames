/**
 * audio.js - Soundeffekte per WebAudio-Synthese.
 *
 * Bewusst ohne Audiodateien: die App muss unter file:// laufen, wo
 * fetch/XHR auf lokale Dateien blockiert sind. Alle Klaenge werden
 * daher zur Laufzeit erzeugt.
 */
window.PG = window.PG || {};

PG.audio = (function () {
  'use strict';

  var ctx = null;

  /** AudioContext erst bei der ersten Nutzergeste erzeugen (Autoplay-Policy). */
  function context() {
    if (!PG.settings.get('sound')) return null;
    try {
      if (!ctx) {
        var Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        ctx = new Ctor();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    } catch (err) {
      return null;
    }
  }

  /**
   * Spielt einen einzelnen Ton.
   * @param {Object} opts frequency, duration, type, gain, sweepTo, delay
   */
  function tone(opts) {
    var ac = context();
    if (!ac) return;

    var start = ac.currentTime + (opts.delay || 0);
    var dur = opts.duration || 0.12;

    var osc = ac.createOscillator();
    var gain = ac.createGain();

    osc.type = opts.type || 'sine';
    osc.frequency.setValueAtTime(opts.frequency, start);
    if (opts.sweepTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.sweepTo), start + dur);
    }

    var peak = opts.gain === undefined ? 0.13 : opts.gain;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + dur + 0.03);
  }

  /** Kurzes Klicken beim Ueberfahren eines Radsegments. */
  function tick() {
    tone({ frequency: 1750, duration: 0.035, type: 'square', gain: 0.05 });
  }

  /** Bestaetigung einer Eingabe. */
  function confirm() {
    tone({ frequency: 620, duration: 0.09, type: 'triangle', gain: 0.10 });
    tone({ frequency: 930, duration: 0.11, type: 'triangle', gain: 0.08, delay: 0.07 });
  }

  /** Neutraler UI-Klick. */
  function click() {
    tone({ frequency: 420, duration: 0.045, type: 'sine', gain: 0.07 });
  }

  /** Das Rad ist stehengeblieben, die Zielzahl wird enthuellt. */
  function reveal() {
    tone({ frequency: 520, duration: 0.14, type: 'sine', gain: 0.11 });
    tone({ frequency: 780, duration: 0.16, type: 'sine', gain: 0.10, delay: 0.10 });
    tone({ frequency: 1040, duration: 0.22, type: 'sine', gain: 0.09, delay: 0.20 });
  }

  /** Ein Spieler scheidet aus: absteigender Ton. */
  function eliminate() {
    tone({ frequency: 420, duration: 0.55, type: 'sawtooth', gain: 0.10, sweepTo: 110 });
  }

  /** Siegesfanfare. */
  function win() {
    [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
      tone({ frequency: f, duration: 0.38, type: 'triangle', gain: 0.11, delay: i * 0.13 });
    });
  }

  /** Fehlerhafte Eingabe. */
  function error() {
    tone({ frequency: 200, duration: 0.18, type: 'square', gain: 0.07 });
  }

  return {
    tick: tick,
    click: click,
    confirm: confirm,
    reveal: reveal,
    eliminate: eliminate,
    win: win,
    error: error
  };
})();
