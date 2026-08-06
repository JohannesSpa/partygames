/**
 * icons.js - Inline-SVG-Icons im Lucide-Stil (24x24, Strichstaerke 2).
 *
 * Statt einer kompletten Icon-Library werden nur die tatsaechlich
 * benoetigten Pfade mitgeliefert - passend zum "keine Abhaengigkeiten"-Ansatz.
 */
window.PG = window.PG || {};

PG.icons = (function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';

  var PATHS = {
    arrowLeft:   '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    arrowRight:  '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    chevronRight:'<path d="m9 18 6-6-6-6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    plus:        '<path d="M12 5v14"/><path d="M5 12h14"/>',
    check:       '<path d="M20 6 9 17l-5-5"/>',
    x:           '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    trash:       '<path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    users:       '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    target:      '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    trophy:      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    crown:       '<path d="m3 6 4.5 4L12 4l4.5 6L21 6l-2 11H5L3 6Z"/><path d="M5 21h14"/>',
    scale:       '<path d="M12 3v18"/><path d="M7 21h10"/><path d="M5 7h14"/><path d="m5 7-3 6a3 3 0 0 0 6 0Z"/><path d="m19 7 3 6a3 3 0 0 1-6 0Z"/>',
    gauge:       '<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
    sparkles:    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="M19 15.5l.75 1.75L21.5 18l-1.75.75L19 20.5l-.75-1.75L16.5 18l1.75-.75L19 15.5Z"/><path d="M5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4L3.5 17.5l1.4-.6.6-1.4Z"/>',
    settings:    '<path d="M3 6h18"/><path d="M3 12h18"/><path d="M3 18h18"/><circle cx="8" cy="6" r="2.4"/><circle cx="16" cy="12" r="2.4"/><circle cx="10" cy="18" r="2.4"/>',
    sun:         '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon:        '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    monitor:     '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
    volume:      '<path d="M11 5 6 9H2v6h4l5 4V5Z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    vibrate:     '<path d="m2 8 2 2-2 2 2 2-2 2"/><path d="m22 8-2 2 2 2-2 2 2 2"/><rect width="8" height="14" x="8" y="5" rx="1.5"/>',
    zap:         '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>',
    swords:      '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="M18.5 21.5 21.5 18.5"/><path d="M21 3h-3L6.5 14.5"/><path d="m5 19 3 3"/>',
    play:        '<path d="m6 3 14 9-14 9V3Z"/>',
    rotate:      '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    chart:       '<path d="M3 3v18h18"/><rect x="7" y="11" width="3" height="7" rx="1"/><rect x="12" y="7" width="3" height="11" rx="1"/><rect x="17" y="4" width="3" height="14" rx="1"/>',
    home:        '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 22V12h6v10"/>',
    info:        '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    alert:       '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    clock:       '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    userPlus:    '<path d="M15 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M19 8v6"/><path d="M22 11h-6"/>',
    logOut:      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>'
  };

  /**
   * Erzeugt ein Icon als SVG-Element.
   * @param {string} name  Schluessel aus PATHS
   * @param {number} [size] Kantenlaenge in px (Default 22)
   * @returns {SVGElement}
   */
  function el(name, size) {
    var svg = document.createElementNS(NS, 'svg');
    var s = size || 22;
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = PATHS[name] || PATHS.info;
    return svg;
  }

  function has(name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
  }

  return { el: el, has: has, names: Object.keys(PATHS) };
})();
