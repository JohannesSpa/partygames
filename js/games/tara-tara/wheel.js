/**
 * wheel.js - animiertes Gluecksrad (SVG + Web Animations API).
 *
 * Das Rad bildet das KOMPLETTE Intervall ab: jeder Wert zwischen Minimum und
 * Maximum besitzt ein eigenes Segment. Damit auch grosse Intervalle lesbar
 * bleiben, werden benachbarte Werte zu Farbbaendern an runden Schrittweiten
 * gruppiert und nur diese beschriftet (siehe logic.wheelLayout).
 *
 * Das Rad landet ehrlich auf dem gezogenen Segment - es wird nichts
 * nachtraeglich "gedreht".
 */
window.PG = window.PG || {};
PG.taraTara = PG.taraTara || {};

PG.taraTara.wheel = (function () {
  'use strict';

  var h = PG.dom.h;
  var svgEl = PG.dom.svg;
  var L = PG.taraTara.logic;

  var SEGMENT_COLORS = ['#4338ca', '#6366f1', '#4f46e5', '#f97316'];
  var SPIN_DURATION = 4400;

  var CX = 100, CY = 100, R = 97;

  /** Punkt auf dem Kreis; Winkel in Grad, 0 = oben, im Uhrzeigersinn. */
  function pointOnCircle(angleDeg, radius) {
    var rad = (angleDeg - 90) * Math.PI / 180;
    return { x: CX + radius * Math.cos(rad), y: CY + radius * Math.sin(rad) };
  }

  /** Pfad eines Kreissegments (Tortenstueck) von startAngle bis endAngle. */
  function segmentPath(startAngle, endAngle, radius) {
    var r = radius || R;
    var a = pointOnCircle(startAngle, r);
    var b = pointOnCircle(endAngle, r);
    var largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
    return 'M ' + CX + ' ' + CY +
           ' L ' + a.x.toFixed(2) + ' ' + a.y.toFixed(2) +
           ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + b.x.toFixed(2) + ' ' + b.y.toFixed(2) +
           ' Z';
  }

  /** Aktuellen Drehwinkel eines Elements aus der CSS-Matrix lesen. */
  function currentRotation(el) {
    var transform = window.getComputedStyle(el).transform;
    if (!transform || transform === 'none') return 0;
    var match = transform.match(/matrix\(([^)]+)\)/);
    if (!match) return 0;
    var parts = match[1].split(',').map(parseFloat);
    return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
  }

  /**
   * Erzeugt ein Gluecksrad fuer das Intervall [min, max].
   * @param {{min: number, max: number, maxLabels?: number}} opts
   * @returns {{el, spin, layout, isSpinning}}
   */
  function create(opts) {
    var layout = L.wheelLayout(opts.min, opts.max, opts.maxLabels || 12);
    var slot = layout.slotAngle;

    /* --- Farbbaender ---------------------------------------------------- */

    var bandNodes = layout.bands.map(function (band, i) {
      return svgEl('path', {
        d: segmentPath(band.from * slot, band.to * slot),
        fill: SEGMENT_COLORS[i % SEGMENT_COLORS.length]
      });
    });

    /* --- feine Teilstriche pro Wert (nur wenn sie sichtbar waeren) ------ */

    var tickNodes = [];
    if (slot >= 1.1) {
      for (var i = 1; i < layout.count; i++) {
        var outer = pointOnCircle(i * slot, R);
        var inner = pointOnCircle(i * slot, R * 0.9);
        tickNodes.push(svgEl('line', {
          x1: inner.x.toFixed(2), y1: inner.y.toFixed(2),
          x2: outer.x.toFixed(2), y2: outer.y.toFixed(2),
          stroke: 'rgba(255,255,255,.28)',
          'stroke-width': slot > 6 ? '0.8' : '0.5'
        }));
      }
    }

    /* --- Beschriftung der Baender --------------------------------------- */

    var labelNodes = [];
    layout.bands.forEach(function (band) {
      if (band.label === null) return;
      var mid = band.labelSlot * slot;
      var pos = pointOnCircle(mid, R * 0.68);
      labelNodes.push(svgEl('text', {
        x: pos.x.toFixed(2),
        y: pos.y.toFixed(2),
        fill: '#ffffff',
        'font-size': layout.bands.length > 14 ? '11' : '15',
        'font-weight': '800',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        transform: 'rotate(' + mid.toFixed(2) + ' ' + pos.x.toFixed(2) + ' ' + pos.y.toFixed(2) + ')',
        text: String(band.label)
      }));
    });

    /* --- Markierung des Treffers (erst nach dem Drehen sichtbar) -------- */

    var hitMarker = svgEl('path', {
      d: '',
      fill: '#ffffff',
      opacity: '0'
    });

    var disc = svgEl('svg', {
      class: 'wheel__svg',
      viewBox: '0 0 200 200',
      'aria-hidden': 'true'
    },
      bandNodes,
      tickNodes,
      hitMarker,
      labelNodes,
      svgEl('circle', { cx: CX, cy: CY, r: R, fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': '3' })
    );

    var pointer = h('div', { class: 'wheel__pointer' },
      svgEl('svg', { viewBox: '0 0 24 30', width: 30, height: 36 },
        svgEl('path', { d: 'M12 30 2 8a10 10 0 1 1 20 0Z', fill: 'currentColor' })
      )
    );

    var hub = h('div', { class: 'wheel__hub' }, PG.icons.el('gauge', 30));

    var el = h('div', {
      class: 'wheel',
      role: 'img',
      'aria-label': 'Glücksrad von ' + layout.min + ' bis ' + layout.max + ' Gramm'
    }, disc, pointer, hub);

    var spinning = false;

    /** Hebt das getroffene Segment hervor. */
    function markHit(index) {
      // Sehr schmale Slots wuerden unsichtbar bleiben - Markierung
      // mindestens 1.6 Grad breit zeichnen.
      var width = Math.max(slot, 1.6);
      var center = (index + 0.5) * slot;
      hitMarker.setAttribute('d', segmentPath(center - width / 2, center + width / 2));
      hitMarker.setAttribute('opacity', '.85');
    }

    /**
     * Dreht das Rad und meldet die getroffene Zahl.
     * @param {(value: number) => void} done
     */
    function spin(done) {
      if (spinning) return;
      spinning = true;

      var index = L.pickWheelIndex(layout);
      var value = layout.min + index;
      var center = (index + 0.5) * slot;
      // Innerhalb des Slots leicht variieren, aber sicher im Segment bleiben.
      var jitter = (Math.random() - 0.5) * slot * 0.7;
      var turns = 5 + Math.floor(Math.random() * 3);
      var rotation = turns * 360 + (360 - center) + jitter;

      function finish() {
        spinning = false;
        markHit(index);
        PG.audio.reveal();
        PG.haptics.success();
        done(value);
      }

      if (!PG.settings.motionEnabled()) {
        disc.style.transform = 'rotate(' + rotation + 'deg)';
        setTimeout(finish, 60);
        return;
      }

      var animation = disc.animate(
        [{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + rotation + 'deg)' }],
        { duration: SPIN_DURATION, easing: 'cubic-bezier(.12,.72,.15,1)', fill: 'forwards' }
      );

      // Tick-Geraeusch an den Bandgrenzen (bei feinen Rastern waere ein
      // Klick pro Wert ein Dauerton).
      var tickAngle = 360 / Math.max(8, layout.bands.length);
      var lastTick = -1;
      var ticking = true;

      (function tickLoop() {
        if (!ticking) return;
        var angle = ((currentRotation(disc) % 360) + 360) % 360;
        var slotIndex = Math.floor(angle / tickAngle);
        if (slotIndex !== lastTick) {
          if (lastTick !== -1) {
            PG.audio.tick();
            pointer.classList.remove('is-ticking');
            void pointer.offsetWidth;
            pointer.classList.add('is-ticking');
          }
          lastTick = slotIndex;
        }
        requestAnimationFrame(tickLoop);
      })();

      animation.onfinish = function () {
        ticking = false;
        pointer.classList.remove('is-ticking');
        finish();
      };
    }

    return {
      el: el,
      spin: spin,
      layout: layout,
      isSpinning: function () { return spinning; }
    };
  }

  return { create: create };
})();
