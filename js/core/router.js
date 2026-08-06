/**
 * router.js - schlanker View-Router mit animierten Uebergaengen.
 *
 * Kein History-API: unter file:// ist pushState nicht zuverlaessig.
 * Stattdessen ein interner Stack; "Zurueck" laeuft ueber den Header-Button
 * und die Hardware-/Browser-Zurueck-Taste (popstate, sofern verfuegbar).
 *
 * Eine Route ist eine Funktion, die einen View-Deskriptor liefert:
 *   { title?: string, brand?: boolean, back?: boolean|Function,
 *     headerAction?: Node, node: Node }
 */
window.PG = window.PG || {};

PG.router = (function () {
  'use strict';

  var routes = {};
  var stack = [];          // [{ name, params }]
  var viewEl = null;
  var currentDescriptor = null;

  function init(el) {
    viewEl = el;
  }

  /**
   * @param {string} name
   * @param {(params: Object) => Object} renderFn
   */
  function register(name, renderFn) {
    routes[name] = renderFn;
  }

  function currentEntry() {
    return stack.length ? stack[stack.length - 1] : null;
  }

  /**
   * Wechselt zu einer Route.
   * @param {string} name
   * @param {Object} [params]
   * @param {{replace?: boolean, root?: boolean, back?: boolean}} [opts]
   */
  function go(name, params, opts) {
    opts = opts || {};
    if (!routes[name]) throw new Error('router: unbekannte Route "' + name + '"');

    if (opts.root) stack = [];
    else if (opts.replace && stack.length) stack.pop();

    stack.push({ name: name, params: params || {} });
    render({ back: !!opts.back });
  }

  /** Eine Ebene zurueck. Liefert false, wenn schon die Wurzel erreicht ist. */
  function back() {
    if (stack.length <= 1) return false;
    stack.pop();
    render({ back: true });
    return true;
  }

  /** Rendert die aktuelle Route neu (z. B. nach einer Zustandsaenderung). */
  function refresh(opts) {
    if (!currentEntry()) return;
    render(opts || {});
  }

  function canGoBack() {
    return stack.length > 1;
  }

  /**
   * Baut den View auf und animiert den Uebergang.
   * @param {{back?: boolean, skipAnimation?: boolean}} opts
   */
  function render(opts) {
    var entry = currentEntry();
    if (!entry || !viewEl) return;

    var descriptor = routes[entry.name](entry.params) || {};
    currentDescriptor = descriptor;

    // Header aktualisieren (Titel, Zurueck-Button, Aktionen)
    if (PG.header) {
      PG.header.render({
        title: descriptor.title,
        brand: descriptor.brand,
        back: descriptor.back === undefined ? canGoBack() : descriptor.back,
        onBack: typeof descriptor.back === 'function' ? descriptor.back : back,
        action: descriptor.headerAction
      });
    }

    var animate = PG.settings.motionEnabled() && !opts.skipAnimation;
    var enterClass = opts.back ? 'view-enter-back' : 'view-enter';

    var screen = descriptor.node;
    if (animate && screen && screen.classList) screen.classList.add(enterClass);

    PG.dom.setContent(viewEl, screen);
    viewEl.scrollTop = 0;
    if (window.scrollTo) window.scrollTo(0, 0);

    if (typeof descriptor.onMount === 'function') {
      // Nach dem Einhaengen aufrufen, damit Groessen/Animationen stimmen.
      requestAnimationFrame(function () { descriptor.onMount(screen); });
    }
  }

  // Browser-/Android-Zurueck abfangen, wenn verfuegbar.
  try {
    window.history.replaceState({ pg: 0 }, '');
    window.addEventListener('popstate', function () {
      if (canGoBack()) {
        back();
        window.history.pushState({ pg: stack.length }, '');
      }
    });
  } catch (err) {
    // Unter file:// kann das fehlschlagen - der Header-Button genuegt dann.
  }

  return {
    init: init,
    register: register,
    go: go,
    back: back,
    refresh: refresh,
    canGoBack: canGoBack,
    current: function () { var e = currentEntry(); return e ? e.name : null; }
  };
})();
