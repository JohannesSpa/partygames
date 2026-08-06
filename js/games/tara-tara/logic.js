/**
 * logic.js - Spielregeln von "Tara Tara" als reine Funktionen.
 *
 * Bewusst frei von DOM und Framework: diese Datei laesst sich unveraendert
 * in eine spaetere React/TypeScript-Version uebernehmen und ist einzeln
 * testbar (siehe tests.js).
 *
 * @typedef {Object} RoundResult
 * @property {number}  round     laufende Rundennummer
 * @property {number}  target    ausgeloste Zielmenge in Gramm
 * @property {number}  drunk     tatsaechlich getrunkene Gramm
 * @property {number}  error     Fehlerwert (immer >= 0, kleiner ist besser)
 * @property {boolean} tiebreak  true, wenn aus einer Stichrunde
 *
 * @typedef {Object} Player
 * @property {string}  id
 * @property {string}  name
 * @property {boolean} eliminated
 * @property {number|null} eliminatedRound
 * @property {number|null} placement   1 = Sieger, n = zuerst ausgeschieden
 * @property {number}  roundWins
 * @property {RoundResult[]} history
 *
 * @typedef {Object} Entry
 * @property {string} playerId
 * @property {number} drunk
 * @property {number} error
 */
window.PG = window.PG || {};
PG.taraTara = PG.taraTara || {};

PG.taraTara.logic = (function () {
  'use strict';

  /* ------------------------------------------------------------ Bewertung */

  /**
   * Fehlerwert einer Schaetzung.
   * Zu viel getrunken zaehlt einfach, zu wenig getrunken doppelt.
   * @param {number} target
   * @param {number} drunk
   * @returns {number} immer >= 0
   */
  function score(target, drunk) {
    return drunk >= target ? drunk - target : (target - drunk) * 2;
  }

  /* -------------------------------------------------------------- Spieler */

  var idCounter = 0;

  /** @returns {Player} */
  function createPlayer(name) {
    idCounter += 1;
    return {
      id: 'p' + Date.now().toString(36) + '-' + idCounter,
      name: String(name).trim(),
      eliminated: false,
      eliminatedRound: null,
      placement: null,
      roundWins: 0,
      crowns: 0,        // aktuell verfuegbar
      crownsEarned: 0,  // insgesamt in diesem Spiel verdient
      crownsUsed: 0,    // insgesamt eingeloest
      perfectHits: 0,
      history: []
    };
  }

  /** Setzt einen Spieler fuer ein neues Spiel zurueck (Name und id bleiben). */
  function resetPlayer(player) {
    return {
      id: player.id,
      name: player.name,
      eliminated: false,
      eliminatedRound: null,
      placement: null,
      roundWins: 0,
      crowns: 0,
      crownsEarned: 0,
      crownsUsed: 0,
      perfectHits: 0,
      history: []
    };
  }

  /** @param {Player[]} players */
  function activePlayers(players) {
    return players.filter(function (p) { return !p.eliminated; });
  }

  function findPlayer(players, id) {
    return players.filter(function (p) { return p.id === id; })[0] || null;
  }

  function playerName(players, id) {
    var p = findPlayer(players, id);
    return p ? p.name : '?';
  }

  /* ---------------------------------------------------------- Reihenfolge */

  /**
   * Dreht eine Reihenfolge so, dass sie beim gewuenschten Spieler beginnt.
   * Der Uhrzeigersinn (die Sitzordnung) bleibt dabei erhalten.
   * @param {string[]} order
   * @param {string} startId
   */
  function rotateToStart(order, startId) {
    var index = order.indexOf(startId);
    if (index <= 0) return order.slice();
    return order.slice(index).concat(order.slice(0, index));
  }

  /**
   * Baut die Zugreihenfolge einer Runde.
   * @param {string[]} order      Sitzordnung aller Spieler
   * @param {string[]} eligible   ids der Spieler, die diese Runde spielen
   * @param {string} startId      gewuenschter Startspieler
   */
  function buildQueue(order, eligible, startId) {
    var filtered = order.filter(function (id) { return eligible.indexOf(id) >= 0; });
    if (filtered.indexOf(startId) < 0) {
      // Startspieler nimmt nicht teil: mit dem naechsten im Uhrzeigersinn beginnen.
      var from = order.indexOf(startId);
      for (var i = 1; i <= order.length; i++) {
        var candidate = order[(from + i) % order.length];
        if (filtered.indexOf(candidate) >= 0) { startId = candidate; break; }
      }
    }
    return rotateToStart(filtered, startId);
  }

  /* --------------------------------------------------------- Rundenlogik */

  /**
   * Sortiert die Eintraege einer Runde: kleinster Fehler zuerst.
   * @param {Entry[]} entries
   * @returns {Entry[]} neue, sortierte Liste
   */
  function rankEntries(entries) {
    return entries.slice().sort(function (a, b) { return a.error - b.error; });
  }

  /**
   * Ermittelt alle Spieler mit dem hoechsten (schlechtesten) Fehlerwert.
   * Genau einer -> scheidet aus. Mehrere -> Stichrunde.
   * @param {Entry[]} entries
   * @returns {string[]} ids
   */
  function worstCandidates(entries) {
    if (!entries.length) return [];
    var worst = entries.reduce(function (max, e) { return Math.max(max, e.error); }, -Infinity);
    return entries.filter(function (e) { return e.error === worst; })
                  .map(function (e) { return e.playerId; });
  }

  /* ------------------------------------------------------------ Zufall */

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function shuffle(list) {
    var copy = list.slice();
    for (var i = copy.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = copy[i]; copy[i] = copy[j]; copy[j] = tmp;
    }
    return copy;
  }

  /* ------------------------------------------------------------ Rad */

  /**
   * Waehlt eine "runde" Schrittweite fuer Farbbaender und Beschriftung,
   * damit das Rad auch bei grossen Intervallen lesbar bleibt.
   * @param {number} count Anzahl der Werte im Intervall
   * @param {number} maxLabels gewuenschte Obergrenze an Beschriftungen
   */
  function niceLabelStep(count, maxLabels) {
    var candidates = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
    for (var i = 0; i < candidates.length; i++) {
      if (count / candidates[i] <= maxLabels) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /**
   * Aufteilung des Gluecksrads: JEDER Wert des Intervalls bekommt ein
   * eigenes Segment (Slot). Benachbarte Slots werden zu Farbbaendern an
   * runden Schrittweiten gruppiert - so ist das komplette Intervall
   * vertreten und trotzdem lesbar beschriftet.
   *
   * @param {number} min
   * @param {number} max
   * @param {number} [maxLabels]
   * @returns {{min,max,count,step,slotAngle,bands:Array}}
   */
  function wheelLayout(min, max, maxLabels) {
    var count = max - min + 1;
    var step = niceLabelStep(count, maxLabels || 12);
    var bands = [];

    // Die Baender starten beim Minimum - dadurch traegt das erste Band
    // immer den Anfangswert und alle Beschriftungen sitzen gleichmaessig.
    for (var start = 0; start < count; start += step) {
      var end = Math.min(count, start + step);
      bands.push({
        from: start,
        to: end,
        size: end - start,
        label: min + start,
        labelSlot: start + 0.5   // genau auf dem beschrifteten Wert
      });
    }

    // Ein sehr schmales letztes Band wuerde als Farbsplitter wirken -
    // lieber dem vorherigen Band zuschlagen.
    if (bands.length > 1) {
      var lastBand = bands[bands.length - 1];
      if (lastBand.size < step * 0.5) {
        bands.splice(bands.length - 1, 1);
        bands[bands.length - 1].to = count;
        bands[bands.length - 1].size = count - bands[bands.length - 1].from;
      }
    }

    return {
      min: min,
      max: max,
      count: count,
      step: step,
      slotAngle: 360 / count,
      bands: bands
    };
  }

  /** Zufaelliger Slot-Index auf dem Rad (gleichverteilt ueber das Intervall). */
  function pickWheelIndex(layout) {
    return Math.floor(Math.random() * layout.count);
  }

  /* --------------------------------------------------------- Statistik */

  /**
   * Statistik ueber den gesamten Spielverlauf.
   * @param {Player[]} players
   * @returns {Array<Object>} nach Platzierung sortiert (Sieger zuerst)
   */
  function computeStats(players) {
    var rows = players.map(function (p) {
      var errors = p.history.map(function (r) { return r.error; });
      var sum = errors.reduce(function (a, b) { return a + b; }, 0);
      var under = p.history.filter(function (r) { return r.drunk < r.target; }).length;
      var tiebreaks = p.history.filter(function (r) { return r.tiebreak; }).length;
      return {
        id: p.id,
        name: p.name,
        rounds: p.history.length,
        average: errors.length ? sum / errors.length : null,
        best: errors.length ? Math.min.apply(null, errors) : null,
        worst: errors.length ? Math.max.apply(null, errors) : null,
        totalError: sum,
        roundWins: p.roundWins,
        crowns: p.crowns || 0,
        crownsEarned: p.crownsEarned || 0,
        crownsUsed: p.crownsUsed || 0,
        perfectHits: p.perfectHits || 0,
        under: under,
        tiebreaks: tiebreaks,
        placement: p.placement,
        eliminatedRound: p.eliminatedRound
      };
    });

    rows.sort(function (a, b) {
      var pa = a.placement === null ? 999 : a.placement;
      var pb = b.placement === null ? 999 : b.placement;
      if (pa !== pb) return pa - pb;
      return (a.average === null ? Infinity : a.average) - (b.average === null ? Infinity : b.average);
    });

    return rows;
  }

  /* -------------------------------------------------------- Kronen */

  /**
   * Darf dieser Spieler gerade eine Krone einloesen?
   * Kronen sind nur unmittelbar nach dem eigenen Versuch einloesbar -
   * und nur, wenn vorher schon eine verdient wurde.
   * @param {Player} player
   */
  function canRedeemCrown(player) {
    return !!player && (player.crowns || 0) > 0;
  }

  /* ---------------------------------------------------- Auszeichnungen */

  /**
   * Spassige Auszeichnungen am Spielende - fuer den geselligen Teil.
   * Jede Auszeichnung wird nur vergeben, wenn sie auch verdient ist.
   * @param {Player[]} players
   * @returns {Array<{icon: string, title: string, name: string, detail: string}>}
   */
  function computeAwards(players) {
    var stats = computeStats(players).filter(function (s) { return s.rounds > 0; });
    if (!stats.length) return [];

    var awards = [];

    function best(list, pick, better) {
      return list.reduce(function (acc, row) {
        if (acc === null) return row;
        return better(pick(row), pick(acc)) ? row : acc;
      }, null);
    }

    // Meiste perfekte Treffer
    var sniper = best(stats, function (s) { return s.perfectHits; }, function (a, b) { return a > b; });
    if (sniper && sniper.perfectHits > 0) {
      awards.push({
        icon: '🎯',
        title: 'Scharfschütze',
        name: sniper.name,
        detail: sniper.perfectHits + (sniper.perfectHits === 1 ? ' perfekter Treffer' : ' perfekte Treffer')
      });
    }

    // Meiste verdiente Kronen
    var crowned = best(stats, function (s) { return s.crownsEarned; }, function (a, b) { return a > b; });
    if (crowned && crowned.crownsEarned > 1) {
      awards.push({
        icon: '👑',
        title: 'Gekrönt',
        name: crowned.name,
        detail: crowned.crownsEarned + ' Kronen verdient'
      });
    }

    // Bester Durchschnitt
    var coldest = best(stats, function (s) { return s.average; }, function (a, b) { return a < b; });
    if (coldest) {
      awards.push({
        icon: '🧊',
        title: 'Eiskalt',
        name: coldest.name,
        detail: formatNumber(coldest.average, 1) + ' g Ø Abweichung'
      });
    }

    // Schlechtester Einzelwert
    var wildest = best(stats, function (s) { return s.worst; }, function (a, b) { return a > b; });
    if (wildest && wildest.worst > 0) {
      awards.push({
        icon: '🌋',
        title: 'Ausreißer',
        name: wildest.name,
        detail: wildest.worst + ' g daneben'
      });
    }

    // Stichrunde ueberlebt
    var survivor = stats.filter(function (s) {
      return s.tiebreaks > 0 && s.placement !== null;
    }).sort(function (a, b) { return a.placement - b.placement; })[0];
    if (survivor && survivor.placement <= 2) {
      awards.push({
        icon: '⚔️',
        title: 'Überlebenskünstler',
        name: survivor.name,
        detail: survivor.tiebreaks + ' Stichrunde' + (survivor.tiebreaks === 1 ? '' : 'n') + ' überstanden'
      });
    }

    // Am haeufigsten zu wenig getrunken
    var shy = best(stats, function (s) { return s.under; }, function (a, b) { return a > b; });
    if (shy && shy.under >= 2) {
      awards.push({
        icon: '🐢',
        title: 'Zu zaghaft',
        name: shy.name,
        detail: shy.under + '× unter dem Ziel geblieben'
      });
    }

    return awards;
  }

  /* ------------------------------------------------------- Formatierung */

  /** Zahl mit deutschem Dezimalkomma. */
  function formatNumber(value, decimals) {
    if (value === null || value === undefined || isNaN(value)) return '–';
    var fixed = Number(value).toFixed(decimals === undefined ? 0 : decimals);
    return fixed.replace('.', ',');
  }

  /** Platzierungstext fuer die Statistiktabelle. */
  function placementLabel(placement) {
    if (placement === null || placement === undefined) return '–';
    if (placement === 1) return 'Sieger';
    return 'Platz ' + placement;
  }

  /* -------------------------------------------------------- Validierung */

  /**
   * Prueft den Namen eines neuen Spielers.
   * @returns {{ok: boolean, error?: string, value?: string}}
   */
  function validatePlayerName(rawName, existingPlayers) {
    var name = String(rawName || '').trim().replace(/\s+/g, ' ');
    if (!name) return { ok: false, error: 'Bitte einen Namen eingeben.' };
    if (name.length > 20) return { ok: false, error: 'Maximal 20 Zeichen.' };
    var duplicate = existingPlayers.some(function (p) {
      return p.name.toLowerCase() === name.toLowerCase();
    });
    if (duplicate) return { ok: false, error: 'Diesen Namen gibt es schon.' };
    return { ok: true, value: name };
  }

  /**
   * Prueft das Zielintervall.
   * @returns {{ok: boolean, error?: string, field?: 'min'|'max', min?: number, max?: number}}
   */
  function validateRange(rawMin, rawMax) {
    var minText = String(rawMin || '').trim();
    var maxText = String(rawMax || '').trim();

    if (!minText) return { ok: false, error: 'Bitte einen Minimalwert eingeben.', field: 'min' };
    if (!maxText) return { ok: false, error: 'Bitte einen Maximalwert eingeben.', field: 'max' };
    if (!/^\d+$/.test(minText)) return { ok: false, error: 'Nur positive ganze Zahlen.', field: 'min' };
    if (!/^\d+$/.test(maxText)) return { ok: false, error: 'Nur positive ganze Zahlen.', field: 'max' };

    var min = parseInt(minText, 10);
    var max = parseInt(maxText, 10);

    if (min < 1) return { ok: false, error: 'Das Minimum muss mindestens 1 sein.', field: 'min' };
    if (max > 100000) return { ok: false, error: 'Das Maximum ist zu groß.', field: 'max' };
    if (min >= max) return { ok: false, error: 'Das Minimum muss kleiner als das Maximum sein.', field: 'max' };

    return { ok: true, min: min, max: max };
  }

  /**
   * Prueft die eingegebene Trinkmenge.
   * @returns {{ok: boolean, error?: string, value?: number}}
   */
  function validateAmount(raw) {
    var text = String(raw || '').trim();
    if (!text) return { ok: false, error: 'Bitte die getrunkene Menge eingeben.' };
    if (!/^\d+$/.test(text)) return { ok: false, error: 'Nur positive ganze Zahlen (Gramm).' };
    var value = parseInt(text, 10);
    if (value > 100000) return { ok: false, error: 'Das ist selbst für dich zu viel.' };
    return { ok: true, value: value };
  }

  return {
    score: score,
    createPlayer: createPlayer,
    resetPlayer: resetPlayer,
    activePlayers: activePlayers,
    findPlayer: findPlayer,
    playerName: playerName,
    rotateToStart: rotateToStart,
    buildQueue: buildQueue,
    rankEntries: rankEntries,
    worstCandidates: worstCandidates,
    randomInt: randomInt,
    pickRandom: pickRandom,
    shuffle: shuffle,
    niceLabelStep: niceLabelStep,
    wheelLayout: wheelLayout,
    pickWheelIndex: pickWheelIndex,
    canRedeemCrown: canRedeemCrown,
    computeAwards: computeAwards,
    computeStats: computeStats,
    formatNumber: formatNumber,
    placementLabel: placementLabel,
    validatePlayerName: validatePlayerName,
    validateRange: validateRange,
    validateAmount: validateAmount
  };
})();
