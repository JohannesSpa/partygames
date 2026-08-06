/**
 * confetti.js - Konfetti-Animation auf einem Canvas-Overlay.
 * Ohne Fremdbibliothek: einfache Partikelsimulation mit requestAnimationFrame.
 */
window.PG = window.PG || {};

PG.confetti = (function () {
  'use strict';

  var COLORS = ['#6366f1', '#4f46e5', '#f97316', '#fb923c', '#22c55e', '#fbbf24', '#ec4899'];

  var canvas = null;
  var raf = null;
  var particles = [];
  var running = false;

  function ensureCanvas() {
    if (canvas) return canvas;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    resize();
    window.addEventListener('resize', resize);
    return canvas;
  }

  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Erzeugt einen Schwung Partikel an einer Ursprungsposition. */
  function spawn(count, originX, originY, power) {
    for (var i = 0; i < count; i++) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      var speed = power * (0.55 + Math.random() * 0.85);
      particles.push({
        x: originX,
        y: originY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - power * 0.45,
        w: 6 + Math.random() * 7,
        h: 9 + Math.random() * 10,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.32,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1
      });
    }
  }

  function frame() {
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.vy += 0.34;          // Schwerkraft
      p.vx *= 0.992;         // Luftwiderstand
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.004;

      if (p.y > window.innerHeight + 40 || p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
      ctx.fillStyle = p.color;
      // Flatternder Streifen: Breite pulsiert ueber die Rotation.
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.rot)), p.h);
      ctx.restore();
    }

    if (particles.length > 0) {
      raf = requestAnimationFrame(frame);
    } else {
      stop();
    }
  }

  /**
   * Startet die Konfetti-Animation.
   * @param {{bursts?: number, particles?: number}} [opts]
   */
  function start(opts) {
    if (!PG.settings.motionEnabled()) return;
    opts = opts || {};
    running = true;
    ensureCanvas();

    var bursts = opts.bursts || 3;
    var perBurst = opts.particles || 70;

    for (var b = 0; b < bursts; b++) {
      (function (index) {
        setTimeout(function () {
          // Nach einem stop() duerfen nachlaufende Timer nichts mehr erzeugen.
          if (!running) return;
          ensureCanvas();
          var x = window.innerWidth * (0.2 + Math.random() * 0.6);
          var y = window.innerHeight * (0.28 + Math.random() * 0.18);
          spawn(perBurst, x, y, 11);
          if (!raf) raf = requestAnimationFrame(frame);
        }, index * 320);
      })(b);
    }
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    particles = [];
    if (canvas) {
      window.removeEventListener('resize', resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvas = null;
    }
  }

  return { start: start, stop: stop };
})();
