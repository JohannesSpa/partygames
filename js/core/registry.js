/**
 * registry.js - Spiel-Registry.
 *
 * Erweiterungspunkt der App: Ein neues Partyspiel meldet sich hier an und
 * erscheint automatisch auf der Startseite. Bestehender Code muss dafuer
 * nicht angefasst werden.
 *
 * @typedef {Object} GameDefinition
 * @property {string}   id          eindeutige Kennung, z. B. 'tara-tara'
 * @property {string}   name        Anzeigename
 * @property {string}   tagline     kurze Beschreibung fuer die Spielkarte
 * @property {string}   icon        Schluessel aus PG.icons
 * @property {string[]} [tags]      z. B. ['2+ Spieler', '15 Min.']
 * @property {boolean}  [comingSoon] true = Karte deaktiviert anzeigen
 * @property {() => void} start     startet das Spiel (rendert den ersten Screen)
 * @property {() => boolean} [hasSavedGame] gespeicherter Spielstand vorhanden?
 * @property {() => void} [resume]  gespeichertes Spiel fortsetzen
 * @property {() => void} [discard] gespeicherten Spielstand verwerfen
 */
window.PG = window.PG || {};

PG.registry = (function () {
  'use strict';

  /** @type {GameDefinition[]} */
  var games = [];

  /** @param {GameDefinition} definition */
  function register(definition) {
    if (!definition || !definition.id) {
      throw new Error('registry.register: id fehlt');
    }
    if (games.some(function (g) { return g.id === definition.id; })) {
      throw new Error('registry.register: doppelte id "' + definition.id + '"');
    }
    games.push(definition);
  }

  function list() {
    return games.slice();
  }

  function get(id) {
    return games.filter(function (g) { return g.id === id; })[0] || null;
  }

  return { register: register, list: list, get: get };
})();
