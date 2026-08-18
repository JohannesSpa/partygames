/**
 * state.js - Zustandsverwaltung von "Tara Tara".
 *
 * Reducer + Store + Persistenz. Der Reducer ist rein (kein DOM, keine
 * Seiteneffekte) und laesst sich spaeter 1:1 in React uebernehmen.
 *
 * Phasen:
 *   players  -> Spieler anlegen
 *   range    -> Zielintervall festlegen
 *   wheel    -> Gluecksrad dreht die Zielzahl aus
 *   turn     -> Spieler geben nacheinander ihre Menge ein
 *   ranking  -> Rangliste + Ausscheiden bzw. Gleichstand
 *   winner   -> Siegerehrung + Statistik
 */
window.PG = window.PG || {};
PG.taraTara = PG.taraTara || {};

PG.taraTara.state = (function () {
  'use strict';

  var L = PG.taraTara.logic;
  var STORAGE_KEY = 'pg.game.tara-tara.v1';
  var SCHEMA_VERSION = 2;

  /* ------------------------------------------------------- Initialzustand */

  function newGameId() {
    return 'g-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function initialState() {
    return {
      version: SCHEMA_VERSION,
      phase: 'players',
      players: [],
      order: [],
      min: 50,
      max: 200,
      round: 0,
      target: null,
      queue: [],
      turnIndex: 0,
      entries: [],
      isTiebreak: false,
      tieIds: null,
      startPlayerId: null,
      lastMainRanking: [],
      lastRound: null,
      // Ergebnis des laufenden Zuges, solange es noch bestaetigt oder per
      // Krone verworfen werden kann.
      pendingResult: null,
      turnRetries: 0,
      gameOver: false,
      winnerId: null,
      gameId: null,
      startedAt: null,
      recorded: false,
      updatedAt: Date.now()
    };
  }

  /* ------------------------------------------------------------- Helfer */

  /** Flache Kopie mit Patch - haelt den Reducer lesbar. */
  function patch(state, changes) {
    return Object.assign({}, state, changes, { updatedAt: Date.now() });
  }

  /** Ersetzt einen Spieler unveraenderlich. */
  function updatePlayer(players, id, changes) {
    return players.map(function (p) {
      return p.id === id ? Object.assign({}, p, changes) : p;
    });
  }

  function activeIds(state) {
    return state.players.filter(function (p) { return !p.eliminated; })
                        .map(function (p) { return p.id; });
  }

  /* ----------------------------------------------------------- Auswertung */

  /**
   * Wertet eine abgeschlossene Runde aus: Rangliste bilden, Ausscheiden
   * bestimmen oder eine Stichrunde vorbereiten.
   * @param {Object} state Zustand MIT vollstaendigen entries
   */
  function evaluateRound(state) {
    var ranked = L.rankEntries(state.entries);
    var roundWinnerId = ranked[0].playerId;
    var tied = L.worstCandidates(state.entries);

    var lastRound = {
      round: state.round,
      target: state.target,
      isTiebreak: state.isTiebreak,
      entries: ranked,
      winnerId: roundWinnerId,
      tieIds: null,
      eliminatedId: null
    };

    var players = state.players;
    var lastMainRanking = state.isTiebreak
      ? state.lastMainRanking
      : ranked.map(function (e) { return e.playerId; });

    // Gleichstand beim schlechtesten Wert -> Stichrunde
    if (tied.length > 1) {
      lastRound.tieIds = tied;

      // Der Rundensieg steht trotzdem fest, solange der Beste nicht selbst
      // am Gleichstand beteiligt ist (sonst waren alle exakt gleich gut).
      if (!state.isTiebreak && tied.indexOf(roundWinnerId) < 0) {
        var tieWinner = L.findPlayer(players, roundWinnerId);
        players = updatePlayer(players, roundWinnerId, { roundWins: tieWinner.roundWins + 1 });
      }

      return patch(state, {
        phase: 'ranking',
        players: players,
        lastRound: lastRound,
        lastMainRanking: lastMainRanking,
        tieIds: tied
      });
    }

    // Genau ein Schlechtester -> scheidet aus
    var eliminatedId = tied[0];
    var activeCount = L.activePlayers(players).length;

    players = updatePlayer(players, eliminatedId, {
      eliminated: true,
      eliminatedRound: state.round,
      placement: activeCount
    });

    // Rundensieg nur in regulaeren Runden und nur, wenn der Beste bleibt
    if (!state.isTiebreak && roundWinnerId !== eliminatedId) {
      var winner = L.findPlayer(players, roundWinnerId);
      players = updatePlayer(players, roundWinnerId, { roundWins: winner.roundWins + 1 });
    }

    lastRound.eliminatedId = eliminatedId;

    var remaining = players.filter(function (p) { return !p.eliminated; });
    var gameOver = remaining.length <= 1;
    var winnerId = null;

    if (gameOver && remaining.length === 1) {
      winnerId = remaining[0].id;
      players = updatePlayer(players, winnerId, { placement: 1 });
    }

    return patch(state, {
      phase: 'ranking',
      players: players,
      lastRound: lastRound,
      lastMainRanking: lastMainRanking,
      tieIds: null,
      gameOver: gameOver,
      winnerId: winnerId
    });
  }

  /* -------------------------------------------------------------- Reducer */

  function reducer(state, action) {
    switch (action.type) {

      case 'reset':
        return initialState();

      /* --- Spielerverwaltung --- */

      case 'addPlayer': {
        var player = L.createPlayer(action.name);
        return patch(state, {
          players: state.players.concat([player]),
          order: state.order.concat([player.id])
        });
      }

      case 'removePlayer':
        return patch(state, {
          players: state.players.filter(function (p) { return p.id !== action.id; }),
          order: state.order.filter(function (id) { return id !== action.id; })
        });

      case 'goToRange':
        return patch(state, { phase: 'range' });

      case 'goToPlayers':
        return patch(state, { phase: 'players' });

      /* --- Spielstart --- */

      case 'startGame': {
        var ids = state.order.slice();
        return patch(state, {
          phase: 'wheel',
          players: state.players.map(L.resetPlayer),
          min: action.min,
          max: action.max,
          round: 1,
          isTiebreak: false,
          tieIds: null,
          target: null,
          entries: [],
          queue: [],
          turnIndex: 0,
          lastRound: null,
          lastMainRanking: [],
          pendingResult: null,
          gameOver: false,
          winnerId: null,
          gameId: newGameId(),
          startedAt: Date.now(),
          recorded: false,
          // Runde 1: ein zufaelliger Spieler beginnt
          startPlayerId: L.pickRandom(ids)
        });
      }

      /* --- Gluecksrad hat die Zielzahl ausgeworfen --- */

      case 'setTarget': {
        var eligible = state.isTiebreak ? state.tieIds.slice() : activeIds(state);
        var queue = L.buildQueue(state.order, eligible, state.startPlayerId);
        return patch(state, {
          phase: 'turn',
          target: action.target,
          queue: queue,
          turnIndex: 0,
          entries: [],
          pendingResult: null,
          turnRetries: 0
        });
      }

      /* --- Ein Spieler hat seine Menge eingegeben ---
         Das Ergebnis ist noch nicht endgueltig: der Spieler kann jetzt -
         und nur jetzt - eine Krone einloesen und neu werfen. */

      case 'submitTurn': {
        var playerId = state.queue[state.turnIndex];
        var error = L.score(state.target, action.drunk);
        var player = L.findPlayer(state.players, playerId);

        return patch(state, {
          pendingResult: {
            playerId: playerId,
            drunk: action.drunk,
            error: error,
            perfect: error === 0,
            // Kronen aus frueheren Runden - die Krone fuer DIESEN Treffer
            // gibt es erst beim Bestaetigen.
            crownsAvailable: player.crowns || 0
          }
        });
      }

      /* --- Ergebnis bestaetigen: jetzt wird es Teil der Runde --- */

      case 'confirmTurn': {
        var pending = state.pendingResult;
        if (!pending) return state;

        var result = {
          round: state.round,
          target: state.target,
          drunk: pending.drunk,
          error: pending.error,
          tiebreak: state.isTiebreak
        };

        var current = L.findPlayer(state.players, pending.playerId);
        var changes = { history: current.history.concat([result]) };

        // Perfekter Treffer -> Krone fuer dieses Spiel
        if (pending.perfect) {
          changes.crowns = (current.crowns || 0) + 1;
          changes.crownsEarned = (current.crownsEarned || 0) + 1;
          changes.perfectHits = (current.perfectHits || 0) + 1;
        }

        var players = updatePlayer(state.players, pending.playerId, changes);
        var entries = state.entries.concat([
          { playerId: pending.playerId, drunk: pending.drunk, error: pending.error }
        ]);
        var nextIndex = state.turnIndex + 1;

        var next = patch(state, {
          players: players,
          entries: entries,
          turnIndex: nextIndex,
          pendingResult: null,
          turnRetries: 0
        });

        // Alle durch? Dann sofort auswerten.
        return nextIndex >= state.queue.length ? evaluateRound(next) : next;
      }

      /* --- Krone einloesen: Versuch verwerfen und nochmal werfen --- */

      case 'redeemCrown': {
        var open = state.pendingResult;
        if (!open) return state;

        var owner = L.findPlayer(state.players, open.playerId);
        if (!L.canRedeemCrown(owner)) return state;

        return patch(state, {
          players: updatePlayer(state.players, open.playerId, {
            crowns: owner.crowns - 1,
            crownsUsed: (owner.crownsUsed || 0) + 1
          }),
          // Der verworfene Versuch zaehlt nicht - der Spieler ist erneut dran.
          pendingResult: null,
          turnRetries: (state.turnRetries || 0) + 1
        });
      }

      /* --- Stichrunde bei Gleichstand --- */

      case 'startTiebreak': {
        var tie = state.tieIds || [];
        // Startspieler: der Gleichstands-Spieler, der in der letzten
        // Zugreihenfolge am weitesten vorne stand.
        var first = state.queue.filter(function (id) { return tie.indexOf(id) >= 0; })[0] || tie[0];
        return patch(state, {
          phase: 'wheel',
          isTiebreak: true,
          target: null,
          entries: [],
          queue: [],
          turnIndex: 0,
          pendingResult: null,
          turnRetries: 0,
          startPlayerId: first
        });
      }

      /* --- Naechste regulaere Runde --- */

      case 'nextRound': {
        var remainingIds = activeIds(state);
        // Startspieler: bester Spieler der letzten regulaeren Runde,
        // der noch im Spiel ist.
        var starter = state.lastMainRanking.filter(function (id) {
          return remainingIds.indexOf(id) >= 0;
        })[0] || remainingIds[0];

        return patch(state, {
          phase: 'wheel',
          round: state.round + 1,
          isTiebreak: false,
          tieIds: null,
          target: null,
          entries: [],
          queue: [],
          turnIndex: 0,
          pendingResult: null,
          turnRetries: 0,
          startPlayerId: starter
        });
      }

      /* --- Spielende --- */

      case 'showWinner':
        return patch(state, { phase: 'winner' });

      /** Ergebnis wurde in die Gesamtstatistik uebernommen (nur einmal). */
      case 'markRecorded':
        return patch(state, { recorded: true });

      /* --- Revanche: gleiche Spieler, gleiches Intervall --- */

      case 'rematch':
        return patch(state, {
          phase: 'wheel',
          players: state.players.map(L.resetPlayer),
          round: 1,
          isTiebreak: false,
          tieIds: null,
          target: null,
          entries: [],
          queue: [],
          turnIndex: 0,
          lastRound: null,
          lastMainRanking: [],
          pendingResult: null,
          turnRetries: 0,
          gameOver: false,
          winnerId: null,
          gameId: newGameId(),
          startedAt: Date.now(),
          recorded: false,
          startPlayerId: L.pickRandom(state.order)
        });

      /* --- Neues Spiel: Namen behalten, alles andere zuruecksetzen --- */

      case 'newGame':
        return Object.assign(initialState(), {
          players: state.players.map(L.resetPlayer),
          order: state.order.slice(),
          min: state.min,
          max: state.max
        });

      default:
        return state;
    }
  }

  /* ------------------------------------------------- Ergebnis-Datensatz */

  /**
   * Verdichtet ein beendetes Spiel zu einem Eintrag fuer die Gesamtstatistik.
   * Bewusst nur mit Namen (keine internen ids) - damit sich Ergebnisse
   * verschiedener Geraete spaeter zusammenfuehren lassen.
   * @param {Object} state
   */
  function buildRecord(state) {
    var stats = L.computeStats(state.players);
    var winner = L.findPlayer(state.players, state.winnerId);

    return {
      // Formatversion des Datensatzes - erleichtert spaetere Aenderungen,
      // wenn Ergebnisse schon auf mehreren Geraeten liegen.
      v: 1,
      id: state.gameId || newGameId(),
      game: 'tara-tara',
      gameName: 'Tara Tara',
      startedAt: state.startedAt || null,
      finishedAt: Date.now(),
      min: state.min,
      max: state.max,
      rounds: state.round,
      winner: winner ? winner.name : null,
      players: stats.map(function (s) {
        return {
          name: s.name,
          // Vereinheitlichter Schluessel: "Anna" und "anna" sind dieselbe Person
          nameKey: PG.history.normalizeName(s.name),
          placement: s.placement,
          rounds: s.rounds,
          totalError: s.totalError,
          average: s.average,
          best: s.best,
          worst: s.worst,
          roundWins: s.roundWins,
          crownsEarned: s.crownsEarned,
          crownsUsed: s.crownsUsed,
          perfectHits: s.perfectHits,
          tiebreaks: s.tiebreaks,
          under: s.under
        };
      })
    };
  }

  /* ---------------------------------------------------------------- Store */

  var store = PG.createStore(initialState(), reducer);
  var persist = PG.storage.debouncedSetter(STORAGE_KEY, 150);

  // Jede Zustandsaenderung sichern, sobald ein Spiel laeuft.
  store.subscribe(function (state) {
    if (state.phase === 'players' && state.players.length === 0) {
      PG.storage.remove(STORAGE_KEY);
      return;
    }
    persist(state);
  });

  /** Gibt es einen fortsetzbaren Spielstand (Spiel laeuft bereits)? */
  function hasSaved() {
    var saved = PG.storage.get(STORAGE_KEY, null);
    return !!(saved && saved.version === SCHEMA_VERSION &&
              saved.phase !== 'players' && saved.players && saved.players.length >= 2);
  }

  /** Liest den gespeicherten Zustand (oder null). */
  function readSaved() {
    var saved = PG.storage.get(STORAGE_KEY, null);
    if (!saved || saved.version !== SCHEMA_VERSION) return null;
    return saved;
  }

  /** Laedt den gespeicherten Zustand in den Store. */
  function loadSaved() {
    var saved = readSaved();
    if (!saved) return false;
    store.replace(saved);
    return true;
  }

  function discard() {
    PG.storage.remove(STORAGE_KEY);
    store.replace(initialState());
  }

  return {
    store: store,
    reducer: reducer,
    initialState: initialState,
    evaluateRound: evaluateRound,
    buildRecord: buildRecord,
    hasSaved: hasSaved,
    readSaved: readSaved,
    loadSaved: loadSaved,
    discard: discard,
    STORAGE_KEY: STORAGE_KEY
  };
})();
