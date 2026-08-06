/**
 * game.js - Anmeldung von "Tara Tara" in der Spiel-Registry.
 *
 * Das ist der einzige Beruehrungspunkt zwischen Spiel und App-Rahmen.
 * Ein weiteres Partyspiel braucht nur einen eigenen Ordner und eine
 * analoge Registrierung - hier muss nichts geaendert werden.
 */
(function () {
  'use strict';

  var S = PG.taraTara.state;

  // Route registrieren: welcher Bildschirm gezeigt wird, entscheidet die Phase.
  PG.router.register('tara-tara', PG.taraTara.screens.view);

  PG.registry.register({
    id: 'tara-tara',
    name: 'Tara Tara',
    tagline: 'Triff die ausgeloste Menge so genau wie möglich – wer am weitesten daneben liegt, fliegt raus.',
    icon: 'scale',
    tags: ['2+ Spieler', 'Ausscheidung', 'Glücksrad'],

    /** Neues Spiel starten (Namen aus der letzten Runde bleiben erhalten). */
    start: function () {
      var st = S.store.getState();
      if (st.phase !== 'players') {
        S.store.dispatch({ type: 'newGame' });
      }
      PG.router.go('tara-tara');
    },

    hasSavedGame: function () {
      return S.hasSaved();
    },

    /** Kurzbeschreibung des gespeicherten Stands fuer das Fortsetzen-Banner. */
    savedSummary: function () {
      var saved = S.readSaved();
      if (!saved) return '';
      var active = saved.players.filter(function (p) { return !p.eliminated; }).length;
      if (saved.phase === 'winner') return 'Siegerehrung steht an';
      return 'Runde ' + saved.round + ' · ' + active + ' von ' + saved.players.length + ' Spielern im Rennen';
    },

    resume: function () {
      if (S.loadSaved()) {
        PG.router.go('tara-tara');
      } else {
        PG.ui.toast('Kein Spielstand gefunden', { variant: 'danger', icon: 'alert' });
      }
    },

    discard: function () {
      S.discard();
    }
  });
})();
