/**
 * history.js - dauerhafte Ergebnis-Historie ueber alle Spiele hinweg.
 *
 * Jedes beendete Spiel wird als Datensatz abgelegt. Daraus entstehen die
 * Bestenlisten fuer Tag / Monat / Jahr / Gesamt.
 *
 * Bewusst nur mit Spielernamen (keine internen ids): So lassen sich
 * Ergebnisse von verschiedenen Geraeten per Export/Import zusammenfuehren -
 * die Vorstufe zu einem spaeteren Online-Ranking.
 *
 * @typedef {Object} GameRecord
 * @property {string} id            eindeutige Spiel-id (Dubletten-Erkennung)
 * @property {string} game          Spiel-Kennung, z. B. 'tara-tara'
 * @property {number} finishedAt    Zeitstempel des Spielendes
 * @property {string|null} winner   Name des Siegers
 * @property {Array} players        verdichtete Werte je Spieler
 */
window.PG = window.PG || {};

PG.history = (function () {
  'use strict';

  var KEY = 'pg.history.v1';
  var MAX_RECORDS = 500;

  var listeners = [];

  /* ------------------------------------------------------------ Speicher */

  /** @returns {GameRecord[]} aufsteigend nach Zeit sortiert */
  function all() {
    var data = PG.storage.get(KEY, null);
    if (!data || !Array.isArray(data.games)) return [];
    return data.games.slice().sort(function (a, b) { return a.finishedAt - b.finishedAt; });
  }

  function save(games) {
    // Aeltere Eintraege verwerfen, damit der LocalStorage nicht volllaeuft.
    var trimmed = games.slice(-MAX_RECORDS);
    PG.storage.set(KEY, { version: 1, games: trimmed });
    listeners.slice().forEach(function (fn) { fn(trimmed); });
    return trimmed;
  }

  /** @param {GameRecord} record */
  function add(record) {
    var games = all();
    if (games.some(function (g) { return g.id === record.id; })) return false;
    games.push(record);
    save(games);
    return true;
  }

  function clear() {
    PG.storage.remove(KEY);
    listeners.slice().forEach(function (fn) { fn([]); });
  }

  function subscribe(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ------------------------------------------------------------ Zeitraum */

  var PERIODS = [
    { id: 'day', label: 'Heute' },
    { id: 'month', label: 'Monat' },
    { id: 'year', label: 'Jahr' },
    { id: 'all', label: 'Gesamt' }
  ];

  /** Startzeitpunkt eines Zeitraums (lokale Zeitzone). */
  function periodStart(period) {
    var now = new Date();
    switch (period) {
      case 'day':   return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      case 'month': return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      case 'year':  return new Date(now.getFullYear(), 0, 1).getTime();
      default:      return 0;
    }
  }

  function periodLabel(period) {
    var found = PERIODS.filter(function (p) { return p.id === period; })[0];
    return found ? found.label : 'Gesamt';
  }

  /** Spiele innerhalb eines Zeitraums. */
  function gamesIn(period, gameId) {
    var from = periodStart(period);
    return all().filter(function (g) {
      if (g.finishedAt < from) return false;
      return gameId ? g.game === gameId : true;
    });
  }

  /* ---------------------------------------------------------- Punkte */

  /**
   * Party-Punkte: belohnen Siege, aber auch Mitspielen und schoene Momente.
   * Sieg 10 · Platz 2: 6 · Platz 3: 3 · Teilnahme 1
   * je Rundensieg +2 · je perfektem Treffer +5
   */
  function pointsFor(playerRow) {
    var base = 1;
    if (playerRow.placement === 1) base = 10;
    else if (playerRow.placement === 2) base = 6;
    else if (playerRow.placement === 3) base = 3;
    return base + (playerRow.roundWins || 0) * 2 + (playerRow.perfectHits || 0) * 5;
  }

  /* ------------------------------------------------------- Aggregation */

  function emptyRow(name) {
    return {
      name: name,
      games: 0,
      wins: 0,
      podiums: 0,
      last: 0,               // wie oft Letzter
      rounds: 0,
      totalError: 0,
      best: null,
      worst: null,
      roundWins: 0,
      crownsEarned: 0,
      crownsUsed: 0,
      perfectHits: 0,
      tiebreaks: 0,
      points: 0,
      lastPlayed: 0,
      currentStreak: 0,
      bestStreak: 0,
      average: null,
      winRate: 0
    };
  }

  /**
   * Verdichtet eine Liste von Spielen zu einer Bestenliste.
   * Rein und ohne Speicherzugriff - dadurch einzeln testbar.
   * @param {GameRecord[]} games aufsteigend nach Zeit sortiert
   * @returns {{players: Array, games: number, rounds: number,
   *            crowns: number, perfectHits: number}}
   */
  function summarize(games) {
    var byName = {};
    var totals = { games: games.length, crowns: 0, perfectHits: 0, rounds: 0 };

    games.forEach(function (game) {
      var fieldSize = game.players.length;

      game.players.forEach(function (p) {
        var row = byName[p.name] || (byName[p.name] = emptyRow(p.name));

        row.games += 1;
        row.rounds += p.rounds || 0;
        row.totalError += p.totalError || 0;
        row.roundWins += p.roundWins || 0;
        row.crownsEarned += p.crownsEarned || 0;
        row.crownsUsed += p.crownsUsed || 0;
        row.perfectHits += p.perfectHits || 0;
        row.tiebreaks += p.tiebreaks || 0;
        row.points += pointsFor(p);
        row.lastPlayed = Math.max(row.lastPlayed, game.finishedAt);

        if (p.best !== null && p.best !== undefined) {
          row.best = row.best === null ? p.best : Math.min(row.best, p.best);
        }
        if (p.worst !== null && p.worst !== undefined) {
          row.worst = row.worst === null ? p.worst : Math.max(row.worst, p.worst);
        }

        if (p.placement === 1) {
          row.wins += 1;
          row.currentStreak += 1;
          row.bestStreak = Math.max(row.bestStreak, row.currentStreak);
        } else {
          row.currentStreak = 0;
        }
        if (p.placement !== null && p.placement <= 3) row.podiums += 1;
        if (p.placement === fieldSize && fieldSize > 1) row.last += 1;

        totals.crowns += p.crownsEarned || 0;
        totals.perfectHits += p.perfectHits || 0;
        totals.rounds += p.rounds || 0;
      });
    });

    var players = Object.keys(byName).map(function (name) {
      var row = byName[name];
      row.average = row.rounds ? row.totalError / row.rounds : null;
      row.winRate = row.games ? row.wins / row.games : 0;
      return row;
    });

    return {
      players: players,
      games: totals.games,
      rounds: totals.rounds,
      crowns: totals.crowns,
      perfectHits: totals.perfectHits
    };
  }

  /**
   * Bestenliste fuer einen Zeitraum.
   * @param {string} period 'day' | 'month' | 'year' | 'all'
   * @param {string} [gameId] optional auf ein Spiel einschraenken
   */
  function aggregate(period, gameId) {
    var result = summarize(gamesIn(period, gameId));
    result.from = periodStart(period);
    result.period = period;
    return result;
  }

  /* --------------------------------------------------------- Sortierung */

  var METRICS = [
    { id: 'points',  label: 'Punkte',   short: 'Pkt', desc: 'Party-Punkte aus Siegen, Rundensiegen und perfekten Treffern' },
    { id: 'wins',    label: 'Siege',    short: 'Siege', desc: 'Gewonnene Spiele' },
    { id: 'average', label: 'Ø Abw.',   short: 'Ø g', desc: 'Durchschnittliche Abweichung – kleiner ist besser' },
    { id: 'crowns',  label: 'Kronen',   short: '👑', desc: 'Verdiente Kronen (perfekte Treffer)' }
  ];

  /** Sortiert eine Bestenliste nach der gewaehlten Kennzahl. */
  function sortPlayers(players, metric) {
    var list = players.slice();
    list.sort(function (a, b) {
      switch (metric) {
        case 'wins':
          if (b.wins !== a.wins) return b.wins - a.wins;
          return (a.average === null ? Infinity : a.average) - (b.average === null ? Infinity : b.average);
        case 'average': {
          var aa = a.average === null ? Infinity : a.average;
          var bb = b.average === null ? Infinity : b.average;
          if (aa !== bb) return aa - bb;
          return b.games - a.games;
        }
        case 'crowns':
          if (b.crownsEarned !== a.crownsEarned) return b.crownsEarned - a.crownsEarned;
          return b.perfectHits - a.perfectHits;
        default:
          if (b.points !== a.points) return b.points - a.points;
          return b.wins - a.wins;
      }
    });
    return list;
  }

  /** Die letzten Spiele eines Spielers (neueste zuerst). */
  function recentGamesOf(name, limit) {
    return all().filter(function (g) {
      return g.players.some(function (p) { return p.name === name; });
    }).sort(function (a, b) { return b.finishedAt - a.finishedAt; }).slice(0, limit || 5);
  }

  /* ----------------------------------------------------- Export/Import */

  /** Alle Ergebnisse als JSON-Text (zum Teilen mit Freunden). */
  function exportJson() {
    return JSON.stringify({
      app: 'PartyGames',
      version: 1,
      exportedAt: Date.now(),
      games: all()
    }, null, 2);
  }

  /**
   * Fuehrt fremde Ergebnisse mit den eigenen zusammen.
   * Dubletten werden anhand der Spiel-id erkannt.
   * @param {string} json
   * @returns {{ok: boolean, added?: number, skipped?: number, error?: string}}
   */
  function importJson(json) {
    var parsed;
    try {
      parsed = JSON.parse(json);
    } catch (err) {
      return { ok: false, error: 'Das ist kein gültiges JSON.' };
    }

    var incoming = parsed && Array.isArray(parsed.games) ? parsed.games
      : (Array.isArray(parsed) ? parsed : null);
    if (!incoming) return { ok: false, error: 'Keine Spieldaten gefunden.' };

    var games = all();
    var known = {};
    games.forEach(function (g) { known[g.id] = true; });

    var added = 0, skipped = 0;
    incoming.forEach(function (record) {
      if (!record || !record.id || !Array.isArray(record.players) || !record.finishedAt) {
        skipped += 1;
        return;
      }
      if (known[record.id]) { skipped += 1; return; }
      known[record.id] = true;
      games.push(record);
      added += 1;
    });

    if (added) save(games.sort(function (a, b) { return a.finishedAt - b.finishedAt; }));
    return { ok: true, added: added, skipped: skipped };
  }

  return {
    KEY: KEY,
    PERIODS: PERIODS,
    METRICS: METRICS,
    all: all,
    add: add,
    clear: clear,
    subscribe: subscribe,
    periodStart: periodStart,
    periodLabel: periodLabel,
    gamesIn: gamesIn,
    summarize: summarize,
    aggregate: aggregate,
    sortPlayers: sortPlayers,
    recentGamesOf: recentGamesOf,
    pointsFor: pointsFor,
    exportJson: exportJson,
    importJson: importJson
  };
})();
