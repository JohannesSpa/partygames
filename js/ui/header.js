/**
 * header.js - App-Header (sticky) mit Zurueck-Button, Titel und Aktion.
 * Wird vom Router bei jedem View-Wechsel neu befuellt.
 */
window.PG = window.PG || {};

PG.header = (function () {
  'use strict';

  var h = PG.dom.h;
  var root = null;
  var inner = null;

  function init(el) {
    root = el;
    root.className = 'app-header';
    inner = h('div', { class: 'app-header__inner' });
    root.appendChild(inner);

    // Feine Trennlinie einblenden, sobald gescrollt wird.
    window.addEventListener('scroll', function () {
      root.classList.toggle('is-scrolled', window.scrollY > 4);
    }, { passive: true });
  }

  /**
   * @param {{title?: string, brand?: boolean, back?: boolean|Function,
   *          onBack?: Function, action?: Node}} opts
   */
  function render(opts) {
    if (!inner) return;
    opts = opts || {};
    PG.dom.clear(inner);

    // Links: Zurueck oder Platzhalter (haelt den Titel zentriert)
    if (opts.back) {
      inner.appendChild(PG.ui.iconButton({
        icon: 'arrowLeft',
        label: 'Zurück',
        onClick: function () { if (opts.onBack) opts.onBack(); }
      }));
    } else {
      inner.appendChild(h('div', { class: 'icon-btn icon-btn--ghost-fixed' }));
    }

    // Mitte: Markenzeile oder Titel
    if (opts.brand) {
      inner.appendChild(h('div', { class: 'app-header__brand' },
        h('span', { class: 'logo-dot' }, PG.icons.el('sparkles', 16)),
        h('span', { text: 'PartyGames' })
      ));
    } else {
      inner.appendChild(h('div', { class: 'app-header__title', text: opts.title || '' }));
    }

    // Rechts: Aktion oder Einstellungen
    inner.appendChild(opts.action || PG.ui.iconButton({
      icon: 'settings',
      label: 'Einstellungen',
      onClick: function () { PG.settingsSheet.open(); }
    }));
  }

  return { init: init, render: render };
})();
