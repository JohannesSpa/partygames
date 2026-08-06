/**
 * dom.js - minimale Hyperscript-Helfer.
 *
 * Ersetzt JSX/React ohne Build-Step: `h()` erzeugt echte DOM-Knoten,
 * die sich wie Komponenten zusammensetzen lassen.
 *
 * Beispiel:
 *   h('div', { class: 'card' }, h('h2', { text: 'Titel' }), listItems)
 */
window.PG = window.PG || {};

PG.dom = (function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * Haengt beliebige Kinder (Knoten, Strings, Arrays, null) an ein Element.
   * @param {Node} parent
   * @param {*} child
   */
  function append(parent, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (c) { append(parent, c); });
      return;
    }
    if (child instanceof Node) {
      parent.appendChild(child);
      return;
    }
    parent.appendChild(document.createTextNode(String(child)));
  }

  /**
   * Setzt Attribute/Properties/Listener auf ein Element.
   * Unterstuetzte Sonderfaelle: class, text, html, style (Objekt),
   * dataset (Objekt), on<Event> (Funktion), value/checked/disabled.
   * @param {Element} el
   * @param {Object} props
   */
  function applyProps(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (key) {
      var value = props[key];
      if (value === null || value === undefined || value === false) return;

      if (key === 'class' || key === 'className') {
        el.setAttribute('class', Array.isArray(value) ? value.filter(Boolean).join(' ') : value);
      } else if (key === 'text') {
        el.textContent = String(value);
      } else if (key === 'html') {
        el.innerHTML = value;
      } else if (key === 'style' && typeof value === 'object') {
        Object.keys(value).forEach(function (k) { el.style.setProperty(k, value[k]); });
      } else if (key === 'dataset' && typeof value === 'object') {
        Object.keys(value).forEach(function (k) { el.dataset[k] = value[k]; });
      } else if (key.indexOf('on') === 0 && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === 'value' || key === 'checked' || key === 'disabled') {
        el[key] = value;
      } else {
        el.setAttribute(key, value === true ? '' : value);
      }
    });
  }

  /**
   * Erzeugt ein HTML-Element.
   * @param {string} tag
   * @param {Object} [props]
   * @param {...*} children
   * @returns {HTMLElement}
   */
  function h(tag, props) {
    var el = document.createElement(tag);
    applyProps(el, props);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  /**
   * Erzeugt ein SVG-Element (eigener Namespace noetig).
   * @param {string} tag
   * @param {Object} [props]
   * @param {...*} children
   * @returns {SVGElement}
   */
  function svg(tag, props) {
    var el = document.createElementNS(SVG_NS, tag);
    applyProps(el, props);
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }

  /** Erzeugt ein DocumentFragment aus beliebig vielen Kindern. */
  function frag() {
    var f = document.createDocumentFragment();
    for (var i = 0; i < arguments.length; i++) append(f, arguments[i]);
    return f;
  }

  /** Entfernt alle Kinder eines Elements. */
  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  /** Ersetzt den Inhalt eines Containers (beliebig viele Kinder). */
  function setContent(container) {
    clear(container);
    for (var i = 1; i < arguments.length; i++) append(container, arguments[i]);
    return container;
  }

  /** Kurzform fuer querySelector im Dokument oder in einem Kontext. */
  function qs(selector, context) {
    return (context || document).querySelector(selector);
  }

  return {
    h: h,
    svg: svg,
    frag: frag,
    clear: clear,
    setContent: setContent,
    append: append,
    qs: qs
  };
})();
