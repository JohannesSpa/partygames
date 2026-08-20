/**
 * roster.js - Spielerkader je Gruppe.
 *
 * Jede Gruppe fuehrt eine Liste ihrer Spieler. Beim Anlegen eines Spiels
 * waehlt man daraus aus, statt Namen zu tippen - dadurch bleiben die
 * Schreibweisen stabil und jeder Spieler behaelt seine Statistik.
 *
 * Der Kader wird genauso abgeglichen wie die Spielergebnisse: als Folge
 * unveraenderlicher Eintraege. Umbenennen oder Entfernen erzeugt einen
 * NEUEN Eintrag mit neuerem Zeitstempel, der den alten ueberstimmt. Damit
 * bleibt der Server dumm (nur anhaengen) und der Abgleich konfliktfrei.
 *
 * @typedef {Object} MemberEvent
 * @property {'member'} kind
 * @property {string} id        eindeutige Kennung DIESES Eintrags
 * @property {string} playerId  Kennung der Person (bleibt beim Umbenennen)
 * @property {string} name      Anzeigename
 * @property {boolean} [removed]
 * @property {number} updatedAt
 */
window.PG = window.PG || {};

PG.roster = (function () {
  'use strict';

  var KEY = 'pg.roster.v1';

  var listeners = [];

  /* ------------------------------------------------------------ Speicher */

  /** @returns {{[groupCode: string]: MemberEvent[]}} */
  function raw() {
    return PG.storage.get(KEY, null) || {};
  }

  function save(all) {
    PG.storage.set(KEY, all);
    listeners.slice().forEach(function (fn) { fn(all); });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* --------------------------------------------------------- Kennungen */

  function newId(prefix) {
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  /* ------------------------------------------------------- Auswertung */

  /**
   * Verdichtet die Eintragsfolge zum aktuellen Kader.
   * Je Person zaehlt der juengste Eintrag; entfernte fallen heraus.
   * Rein und dadurch einzeln testbar.
   * @param {MemberEvent[]} events
   * @returns {Array<{playerId: string, name: string, updatedAt: number}>}
   */
  function reduceEvents(events) {
    var byPlayer = {};

    (events || []).forEach(function (event) {
      if (!event || !event.playerId) return;
      var current = byPlayer[event.playerId];
      if (!current || (event.updatedAt || 0) >= (current.updatedAt || 0)) {
        byPlayer[event.playerId] = event;
      }
    });

    return Object.keys(byPlayer)
      .map(function (id) { return byPlayer[id]; })
      .filter(function (event) { return !event.removed; })
      .map(function (event) {
        return { playerId: event.playerId, name: event.name, updatedAt: event.updatedAt || 0 };
      })
      .sort(function (a, b) { return a.name.localeCompare(b.name, 'de'); });
  }

  /** Aktueller Kader einer Gruppe. */
  function members(groupCode) {
    if (!groupCode) return [];
    return reduceEvents(raw()[groupCode]);
  }

  /** Alle Roh-Eintraege einer Gruppe (fuer den Abgleich). */
  function events(groupCode) {
    if (!groupCode) return [];
    return (raw()[groupCode] || []).slice();
  }

  function findByName(groupCode, name) {
    var key = PG.history.normalizeName(name);
    return members(groupCode).filter(function (m) {
      return PG.history.normalizeName(m.name) === key;
    })[0] || null;
  }

  function findById(groupCode, playerId) {
    return members(groupCode).filter(function (m) { return m.playerId === playerId; })[0] || null;
  }

  /* --------------------------------------------------------- Aenderungen */

  /** Legt einen Eintrag ab und meldet ihn zum Abgleich an. */
  function push(groupCode, event) {
    var all = raw();
    var list = all[groupCode] || (all[groupCode] = []);
    if (list.some(function (e) { return e.id === event.id; })) return event;
    list.push(event);
    // Der Verlauf je Gruppe bleibt ueberschaubar - trotzdem begrenzen.
    if (list.length > 500) all[groupCode] = list.slice(-500);
    save(all);
    return event;
  }

  /**
   * Neuen Spieler aufnehmen.
   * @returns {{ok: boolean, member?: Object, error?: string}}
   */
  function add(groupCode, rawName) {
    var name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: 'Bitte einen Namen eingeben.' };
    if (name.length > 20) return { ok: false, error: 'Maximal 20 Zeichen.' };
    if (findByName(groupCode, name)) return { ok: false, error: 'Diesen Namen gibt es schon.' };

    var event = {
      kind: 'member',
      id: newId('m'),
      playerId: newId('p'),
      name: name,
      updatedAt: Date.now()
    };
    push(groupCode, event);
    return { ok: true, member: { playerId: event.playerId, name: name, updatedAt: event.updatedAt } };
  }

  /** Spieler umbenennen - die Statistik bleibt an der Person haengen. */
  function rename(groupCode, playerId, rawName) {
    var name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: 'Bitte einen Namen eingeben.' };
    if (name.length > 20) return { ok: false, error: 'Maximal 20 Zeichen.' };

    var vorhanden = findByName(groupCode, name);
    if (vorhanden && vorhanden.playerId !== playerId) {
      return { ok: false, error: 'Diesen Namen gibt es schon.' };
    }

    push(groupCode, {
      kind: 'member',
      id: newId('m'),
      playerId: playerId,
      name: name,
      updatedAt: Date.now()
    });
    return { ok: true };
  }

  /** Spieler aus dem Kader nehmen. Seine Ergebnisse bleiben erhalten. */
  function remove(groupCode, playerId) {
    var current = findById(groupCode, playerId);
    push(groupCode, {
      kind: 'member',
      id: newId('m'),
      playerId: playerId,
      name: current ? current.name : '',
      removed: true,
      updatedAt: Date.now()
    });
    return { ok: true };
  }

  /** Alle Eintraege einer Gruppe verwerfen (beim Verlassen). */
  function clearGroup(groupCode) {
    var all = raw();
    delete all[groupCode];
    save(all);
  }

  /* -------------------------------------------------------- Abgleich */

  /** Prueft einen eingehenden Eintrag. */
  function isValidEvent(event) {
    return !!(event && event.kind === 'member' &&
      typeof event.id === 'string' && event.id &&
      typeof event.playerId === 'string' && event.playerId &&
      typeof event.name === 'string' &&
      typeof event.updatedAt === 'number' && event.updatedAt > 0);
  }

  /**
   * Fremde Eintraege einarbeiten (Dubletten anhand der Eintrags-id).
   * @returns {{added: number, skipped: number}}
   */
  function mergeEvents(groupCode, incoming) {
    if (!Array.isArray(incoming) || !incoming.length) return { added: 0, skipped: 0 };

    var all = raw();
    var list = all[groupCode] || (all[groupCode] = []);
    var known = {};
    list.forEach(function (e) { known[e.id] = true; });

    var added = 0, skipped = 0;
    incoming.forEach(function (event) {
      if (!isValidEvent(event) || known[event.id]) { skipped += 1; return; }
      known[event.id] = true;
      list.push(event);
      added += 1;
    });

    if (added) save(all);
    return { added: added, skipped: skipped };
  }

  return {
    KEY: KEY,
    members: members,
    events: events,
    reduceEvents: reduceEvents,
    findByName: findByName,
    findById: findById,
    add: add,
    rename: rename,
    remove: remove,
    clearGroup: clearGroup,
    isValidEvent: isValidEvent,
    mergeEvents: mergeEvents,
    subscribe: subscribe,
    newId: newId
  };
})();
