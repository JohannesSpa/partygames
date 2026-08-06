/**
 * tests.js - Selbsttest der Spiellogik.
 *
 * Aufruf: index.html?selftest=1
 * Ergebnisse erscheinen in der Konsole und als Dialog in der App.
 * Der Test laeuft ausschliesslich gegen reine Funktionen und den Reducer -
 * es wird kein gespeicherter Spielstand veraendert.
 */
window.PG = window.PG || {};

PG.tests = (function () {
  'use strict';

  var results = [];

  function check(name, condition, detail) {
    results.push({ name: name, ok: !!condition, detail: detail || '' });
  }

  function eq(name, actual, expected) {
    var ok = JSON.stringify(actual) === JSON.stringify(expected);
    check(name, ok, ok ? '' : 'erwartet ' + JSON.stringify(expected) + ', bekommen ' + JSON.stringify(actual));
  }

  function run() {
    results = [];
    var L = PG.taraTara.logic;
    var S = PG.taraTara.state;
    var H = PG.history;
    var reduce = S.reducer;

    /** Ein kompletter Zug: Menge eingeben und Ergebnis bestaetigen. */
    function play(state, drunk) {
      return reduce(reduce(state, { type: 'submitTurn', drunk: drunk }), { type: 'confirmTurn' });
    }

    /* --- Bewertung ---------------------------------------------------- */
    eq('score: exakt getroffen', L.score(143, 143), 0);
    eq('score: 20 g zu viel zählt einfach', L.score(140, 160), 20);
    eq('score: 10 g zu wenig zählt doppelt', L.score(150, 140), 20);
    eq('score: 1 g zu wenig', L.score(100, 99), 2);
    eq('score: nichts getrunken', L.score(50, 0), 100);

    /* --- Validierung -------------------------------------------------- */
    eq('range: min >= max unzulässig', L.validateRange('200', '50').ok, false);
    eq('range: gleiche Werte unzulässig', L.validateRange('50', '50').ok, false);
    eq('range: Kommazahl unzulässig', L.validateRange('50,5', '200').ok, false);
    eq('range: negativ unzulässig', L.validateRange('-5', '200').ok, false);
    eq('range: gültig', L.validateRange('50', '200').ok, true);
    eq('amount: leer unzulässig', L.validateAmount('').ok, false);
    eq('amount: Buchstaben unzulässig', L.validateAmount('viel').ok, false);
    eq('amount: 0 ist erlaubt', L.validateAmount('0').ok, true);

    /* --- Reihenfolge -------------------------------------------------- */
    eq('rotateToStart', L.rotateToStart(['a', 'b', 'c', 'd'], 'c'), ['c', 'd', 'a', 'b']);
    eq('buildQueue überspringt Ausgeschiedene',
      L.buildQueue(['a', 'b', 'c', 'd'], ['a', 'c', 'd'], 'c'), ['c', 'd', 'a']);
    eq('buildQueue: Startspieler nicht dabei -> nächster im Uhrzeigersinn',
      L.buildQueue(['a', 'b', 'c', 'd'], ['a', 'c'], 'b'), ['c', 'a']);

    /* --- Gluecksrad: das komplette Intervall ---------------------------- */
    var wheel = L.wheelLayout(50, 200, 12);
    eq('Rad: jeder Wert des Intervalls hat ein Segment', wheel.count, 151);
    eq('Rad: Vollkreis aufgeteilt', Math.round(wheel.slotAngle * wheel.count), 360);
    check('Rad: Baender decken alle Slots luecklos ab', (function () {
      var next = 0;
      return wheel.bands.every(function (band) {
        var ok = band.from === next;
        next = band.to;
        return ok;
      }) && next === wheel.count;
    })());
    check('Rad: nicht zu viele Beschriftungen',
      wheel.bands.filter(function (b) { return b.label !== null; }).length <= 14);
    check('Rad: Beschriftungen liegen im Intervall', wheel.bands.every(function (b) {
      return b.label === null || (b.label >= 50 && b.label <= 200);
    }));

    var smallWheel = L.wheelLayout(1, 5, 12);
    eq('Rad: kleines Intervall -> ein Segment je Wert', smallWheel.count, 5);
    eq('Rad: kleines Intervall -> Schrittweite 1', smallWheel.step, 1);
    eq('Rad: kleines Intervall -> alle beschriftet',
      smallWheel.bands.map(function (b) { return b.label; }), [1, 2, 3, 4, 5]);

    var hugeWheel = L.wheelLayout(1, 10000, 12);
    eq('Rad: sehr grosses Intervall bleibt lesbar', hugeWheel.bands.length <= 14, true);
    eq('Rad: sehr grosses Intervall behaelt alle Werte', hugeWheel.count, 10000);

    /* --- Kompletter Spieldurchlauf ------------------------------------ */
    var st = S.initialState();
    ['Anna', 'Tom', 'Lisa', 'Max'].forEach(function (name) {
      st = reduce(st, { type: 'addPlayer', name: name });
    });
    eq('4 Spieler angelegt', st.players.length, 4);

    st = reduce(st, { type: 'startGame', min: 50, max: 200 });
    st = Object.assign({}, st, { startPlayerId: st.order[0] }); // deterministisch testen
    st = reduce(st, { type: 'setTarget', target: 100 });

    eq('Zugreihenfolge = Sitzordnung ab Startspieler', st.queue, st.order);
    eq('Phase nach Zielzahl', st.phase, 'turn');

    // Anna 100 (0), Tom 110 (10), Lisa 90 (20), Max 80 (40)
    [100, 110, 90, 80].forEach(function (drunk) { st = play(st, drunk); });

    eq('Phase nach der Runde', st.phase, 'ranking');
    eq('Rangliste aufsteigend', st.lastRound.entries.map(function (e) { return e.error; }), [0, 10, 20, 40]);
    eq('Schlechtester scheidet aus', L.playerName(st.players, st.lastRound.eliminatedId), 'Max');
    eq('Platzierung des Ausgeschiedenen', L.findPlayer(st.players, st.lastRound.eliminatedId).placement, 4);
    eq('Rundensieg für Anna', L.findPlayer(st.players, st.order[0]).roundWins, 1);
    eq('Noch drei Spieler aktiv', L.activePlayers(st.players).length, 3);
    eq('Spiel läuft weiter', st.gameOver, false);

    st = reduce(st, { type: 'nextRound' });
    eq('Runde 2 beginnt beim Vorrundensieger', st.startPlayerId, st.order[0]);
    eq('Rundenzaehler', st.round, 2);

    /* --- Gleichstand -> Stichrunde ------------------------------------ */
    st = reduce(st, { type: 'setTarget', target: 100 });
    // Anna 100 (0), Tom 90 (20), Lisa 90 (20) -> Gleichstand beim schlechtesten Wert
    [100, 90, 90].forEach(function (drunk) { st = play(st, drunk); });

    eq('Gleichstand erkannt', (st.lastRound.tieIds || []).length, 2);
    eq('Niemand scheidet sofort aus', st.lastRound.eliminatedId, null);
    eq('Alle drei noch aktiv', L.activePlayers(st.players).length, 3);
    eq('Rundensieg zaehlt auch bei Gleichstand am Ende',
      L.findPlayer(st.players, st.order[0]).roundWins, 2);

    st = reduce(st, { type: 'startTiebreak' });
    eq('Stichrunde: Phase', st.phase, 'wheel');
    eq('Stichrunde: Flag gesetzt', st.isTiebreak, true);

    st = reduce(st, { type: 'setTarget', target: 60 });
    eq('Stichrunde: nur die Gleichstands-Spieler', st.queue.length, 2);

    st = play(st, 60);    // Fehler 0
    st = play(st, 100);   // Fehler 40
    eq('Stichrunde: genau einer scheidet aus', L.activePlayers(st.players).length, 2);
    check('Stichrunden-Ergebnis ist markiert',
      L.findPlayer(st.players, st.lastRound.eliminatedId).history.slice(-1)[0].tiebreak === true);

    /* --- Endphase ----------------------------------------------------- */
    st = reduce(st, { type: 'nextRound' });
    st = reduce(st, { type: 'setTarget', target: 100 });
    st = play(st, 101);   // Fehler 1
    st = play(st, 130);   // Fehler 30

    eq('Spielende erkannt', st.gameOver, true);
    check('Gewinner ermittelt', !!st.winnerId);
    eq('Gewinner hat Platz 1', L.findPlayer(st.players, st.winnerId).placement, 1);

    st = reduce(st, { type: 'showWinner' });
    eq('Phase Siegerehrung', st.phase, 'winner');

    /* --- Statistik ---------------------------------------------------- */
    var stats = L.computeStats(st.players);
    eq('Statistik: alle Spieler enthalten', stats.length, 4);
    eq('Statistik: Sieger steht oben', stats[0].placement, 1);
    check('Statistik: Durchschnitt berechnet', stats[0].average !== null && !isNaN(stats[0].average));
    check('Statistik: bester Wert <= schlechtester Wert', stats[0].best <= stats[0].worst);
    eq('Formatierung mit Komma', L.formatNumber(7.25, 1), '7,3');

    /* --- Revanche ----------------------------------------------------- */
    var rematch = reduce(st, { type: 'rematch' });
    eq('Revanche: alle wieder aktiv', L.activePlayers(rematch.players).length, 4);
    eq('Revanche: Historie geleert', rematch.players[0].history.length, 0);
    eq('Revanche: Runde 1', rematch.round, 1);
    eq('Revanche: Kronen zurueckgesetzt', rematch.players[0].crowns, 0);

    /* --- Kronen -------------------------------------------------------- */
    var c = S.initialState();
    ['Ida', 'Jan', 'Kim'].forEach(function (name) {
      c = reduce(c, { type: 'addPlayer', name: name });
    });
    c = reduce(c, { type: 'startGame', min: 10, max: 100 });
    c = Object.assign({}, c, { startPlayerId: c.order[0] });
    c = reduce(c, { type: 'setTarget', target: 50 });

    var idaId = c.order[0];
    c = reduce(c, { type: 'submitTurn', drunk: 50 });
    eq('Krone: perfekter Treffer erkannt', c.pendingResult.perfect, true);
    eq('Krone: erst mit dem Bestaetigen verdient', L.findPlayer(c.players, idaId).crowns, 0);

    c = reduce(c, { type: 'confirmTurn' });
    eq('Krone: nach dem Bestaetigen gutgeschrieben', L.findPlayer(c.players, idaId).crowns, 1);
    eq('Krone: perfekte Treffer gezaehlt', L.findPlayer(c.players, idaId).perfectHits, 1);

    c = play(c, 55);   // Jan: Fehler 5
    c = play(c, 70);   // Kim: Fehler 20 -> scheidet aus
    c = reduce(c, { type: 'nextRound' });
    c = reduce(c, { type: 'setTarget', target: 40 });

    c = reduce(c, { type: 'submitTurn', drunk: 100 });   // Ida: Fehler 60
    eq('Krone: direkt nach dem Versuch einloesbar', c.pendingResult.crownsAvailable, 1);

    var redeemed = reduce(c, { type: 'redeemCrown' });
    eq('Krone: Versuch verworfen', redeemed.pendingResult, null);
    eq('Krone: verbraucht', L.findPlayer(redeemed.players, idaId).crowns, 0);
    eq('Krone: als eingeloest gezaehlt', L.findPlayer(redeemed.players, idaId).crownsUsed, 1);
    eq('Krone: derselbe Spieler ist erneut dran', redeemed.queue[redeemed.turnIndex], idaId);
    eq('Krone: zweiter Versuch markiert', redeemed.turnRetries, 1);

    redeemed = play(redeemed, 41);
    var ida = L.findPlayer(redeemed.players, idaId);
    eq('Krone: nur der zweite Versuch zaehlt', ida.history.slice(-1)[0].drunk, 41);
    eq('Krone: ohne Krone kein weiteres Einloesen', L.canRedeemCrown(ida), false);
    eq('Krone: ohne Krone bleibt redeemCrown wirkungslos',
      reduce(redeemed, { type: 'redeemCrown' }) === redeemed, true);

    /* --- Auszeichnungen ------------------------------------------------ */
    var awards = L.computeAwards(redeemed.players);
    check('Auszeichnungen werden vergeben', awards.length > 0, 'bekommen ' + awards.length);
    check('Auszeichnung "Scharfschütze" geht an Ida', awards.some(function (a) {
      return a.title === 'Scharfschütze' && a.name === 'Ida';
    }));

    /* --- Gesamtstatistik ----------------------------------------------- */
    var fakeGames = [
      { id: 'x1', game: 'tara-tara', gameName: 'Tara Tara', finishedAt: 1000, winner: 'Ida', players: [
        { name: 'Ida', placement: 1, rounds: 3, totalError: 9, best: 0, worst: 5,
          roundWins: 2, crownsEarned: 1, crownsUsed: 0, perfectHits: 1, tiebreaks: 0, under: 1 },
        { name: 'Jan', placement: 2, rounds: 3, totalError: 30, best: 2, worst: 20,
          roundWins: 0, crownsEarned: 0, crownsUsed: 0, perfectHits: 0, tiebreaks: 1, under: 2 }
      ] },
      { id: 'x2', game: 'tara-tara', gameName: 'Tara Tara', finishedAt: 2000, winner: 'Ida', players: [
        { name: 'Ida', placement: 1, rounds: 2, totalError: 6, best: 1, worst: 4,
          roundWins: 1, crownsEarned: 0, crownsUsed: 1, perfectHits: 0, tiebreaks: 0, under: 0 },
        { name: 'Jan', placement: 2, rounds: 2, totalError: 20, best: 4, worst: 16,
          roundWins: 0, crownsEarned: 0, crownsUsed: 0, perfectHits: 0, tiebreaks: 0, under: 1 }
      ] }
    ];

    var sum = H.summarize(fakeGames);
    eq('Statistik: Spiele gezaehlt', sum.games, 2);
    eq('Statistik: Spieler zusammengefasst', sum.players.length, 2);
    eq('Statistik: Kronen summiert', sum.crowns, 1);

    var idaRow = sum.players.filter(function (p) { return p.name === 'Ida'; })[0];
    var janRow = sum.players.filter(function (p) { return p.name === 'Jan'; })[0];
    eq('Statistik: Siege', idaRow.wins, 2);
    eq('Statistik: Siegesserie', idaRow.currentStreak, 2);
    eq('Statistik: Ø Abweichung ueber alle Runden', idaRow.average, 3);
    eq('Statistik: bester Wert', idaRow.best, 0);
    eq('Statistik: schlechtester Wert', idaRow.worst, 5);
    eq('Statistik: Party-Punkte Ida', idaRow.points, 31);
    eq('Statistik: Party-Punkte Jan', janRow.points, 12);
    eq('Statistik: Siegquote', Math.round(idaRow.winRate * 100), 100);
    eq('Statistik: Jan hat keine Serie', janRow.currentStreak, 0);

    eq('Statistik: Sortierung nach Punkten', H.sortPlayers(sum.players, 'points')[0].name, 'Ida');
    eq('Statistik: Sortierung nach Ø (kleiner ist besser)',
      H.sortPlayers(sum.players, 'average')[0].name, 'Ida');
    eq('Statistik: Sortierung nach Kronen', H.sortPlayers(sum.players, 'crowns')[0].name, 'Ida');

    eq('Zeitraum: Tagesbeginn liegt in der Vergangenheit', H.periodStart('day') <= Date.now(), true);
    eq('Zeitraum: Gesamt beginnt bei 0', H.periodStart('all'), 0);
    eq('Import: ungueltiges JSON wird abgefangen', H.importJson('kein json').ok, false);
    eq('Import: leere Liste ist gueltig', H.importJson('{"games":[]}').added, 0);

    /* --- Ergebnis-Datensatz -------------------------------------------- */
    var record = S.buildRecord(st);
    eq('Datensatz: Spieler enthalten', record.players.length, 4);
    eq('Datensatz: Sieger vermerkt', record.winner, L.findPlayer(st.players, st.winnerId).name);
    check('Datensatz: nur Namen, keine internen ids',
      record.players.every(function (p) { return !p.id; }));

    return report();
  }

  function report() {
    var failed = results.filter(function (r) { return !r.ok; });

    results.forEach(function (r) {
      if (r.ok) console.log('%c PASS ', 'background:#22c55e;color:#fff', r.name);
      else console.error('FAIL', r.name, r.detail);
    });
    console.log('Selbsttest: ' + (results.length - failed.length) + '/' + results.length + ' bestanden');

    if (PG.ui && PG.ui.dialog) {
      var h = PG.dom.h;
      var dlg = PG.ui.dialog({
        title: 'Selbsttest',
        content: h('div', { class: 'stack' },
          h('div', {
            class: failed.length ? 'notice notice--accent' : 'notice',
            text: (results.length - failed.length) + ' von ' + results.length + ' Prüfungen bestanden'
          }),
          h('ul', { class: 'stack' }, results.map(function (r) {
            return h('li', { class: 'row', style: { gap: '8px', 'font-size': '14px' } },
              PG.icons.el(r.ok ? 'check' : 'x', 16),
              h('span', { text: r.name + (r.detail ? ' – ' + r.detail : '') })
            );
          }))
        ),
        actions: [PG.ui.button({ label: 'Schließen', variant: 'primary', onClick: function () { dlg.close(); } })]
      });
    }

    return { total: results.length, failed: failed.length, results: results.slice() };
  }

  return { run: run };
})();
