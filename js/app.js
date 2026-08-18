/**
 * app.js - Bootstrap der PartyGames-App.
 *
 * Baut den Rahmen auf, registriert die Startseite und startet den Router.
 * Die Spiele selbst melden sich ueber PG.registry an (siehe registry.js).
 */
(function () {
  'use strict';

  var h = PG.dom.h;
  var ui = PG.ui;

  /* ------------------------------------------------------------ Startseite */

  function gameCard(game) {
    var classes = ['game-card', 'fade-in'];
    if (game.comingSoon) classes.push('game-card--soon');

    return h('button', {
      class: classes.join(' '),
      type: 'button',
      disabled: !!game.comingSoon,
      onClick: function () {
        if (game.comingSoon) return;
        PG.audio.click();
        PG.haptics.light();

        // Laeuft bereits ein Spiel? Dann vor dem Ueberschreiben nachfragen.
        if (game.hasSavedGame && game.hasSavedGame()) {
          ui.confirmDialog({
            title: 'Neues Spiel starten?',
            text: 'Es läuft noch ein gespeichertes Spiel (' + game.savedSummary() + '). Wenn du neu startest, geht es verloren.',
            confirmLabel: 'Neu starten',
            danger: true,
            onConfirm: function () {
              if (game.discard) game.discard();
              game.start();
            }
          });
          return;
        }
        game.start();
      }
    },
      h('div', { class: 'game-card__art' }, PG.icons.el(game.icon || 'sparkles', 30)),
      h('div', { class: 'game-card__body' },
        h('div', { class: 'game-card__title', text: game.name }),
        h('div', { class: 'game-card__tagline', text: game.tagline || '' }),
        game.tags && game.tags.length
          ? h('div', { class: 'row wrap', style: { gap: '6px', 'margin-top': '10px' } },
              game.tags.map(function (tag) { return ui.badge(tag); }))
          : null
      ),
      h('div', { class: 'game-card__chev' }, PG.icons.el('chevronRight', 22))
    );
  }

  function resumeBanner() {
    var running = PG.registry.list().filter(function (game) {
      return game.hasSavedGame && game.hasSavedGame();
    });
    if (!running.length) return null;

    return h('div', { class: 'stack fade-in' },
      running.map(function (game) {
        return ui.card({ class: 'stack' },
          h('div', { class: 'row' },
            h('div', { class: 'notice__icon' }, PG.icons.el('play', 22)),
            h('div', { style: { flex: '1', 'min-width': '0' } },
              h('div', { class: 'title-md', text: 'Spiel fortsetzen' }),
              h('div', { class: 'text-subtle', text: game.name + ' · ' + game.savedSummary() })
            )
          ),
          h('div', { class: 'row', style: { gap: '8px' } },
            ui.button({
              label: 'Fortsetzen',
              variant: 'primary',
              size: 'sm',
              onClick: function () { game.resume(); }
            }),
            ui.button({
              label: 'Verwerfen',
              variant: 'ghost',
              size: 'sm',
              onClick: function () {
                ui.confirmDialog({
                  title: 'Spielstand verwerfen?',
                  text: 'Der gespeicherte Spielverlauf wird gelöscht.',
                  confirmLabel: 'Verwerfen',
                  danger: true,
                  onConfirm: function () {
                    game.discard();
                    ui.toast('Spielstand verworfen', { icon: 'check' });
                    PG.router.refresh({ skipAnimation: true });
                  }
                });
              }
            })
          )
        );
      })
    );
  }

  /** Hinweis zum Installieren – nur solange die App im Browser laeuft. */
  function installBanner() {
    if (!PG.pwa.canInstall()) return null;

    return ui.card({ class: 'stack fade-in' },
      h('div', { class: 'row' },
        h('div', { class: 'notice__icon' }, PG.icons.el('sparkles', 22)),
        h('div', { style: { flex: '1', 'min-width': '0' } },
          h('div', { class: 'title-md', text: 'Als App installieren' }),
          h('div', { class: 'text-subtle', text: PG.pwa.isIos()
            ? 'Über „Teilen" zum Home-Bildschirm hinzufügen – Vollbild und offline.'
            : 'Eigenes Icon, Vollbild und offline spielbar.' })
        )
      ),
      ui.button({
        label: PG.pwa.isIos() ? 'So geht\'s' : 'Installieren',
        variant: 'primary',
        size: 'sm',
        icon: 'plus',
        onClick: function () { PG.pwa.install(); }
      })
    );
  }

  /** Einstieg in die Bestenliste, inkl. kurzem Ticker zum aktuellen Stand. */
  function statsEntry() {
    var today = PG.history.aggregate('day');
    var total = PG.history.aggregate('all');

    var subtitle;
    if (!total.games) {
      subtitle = 'Noch keine Ergebnisse – spielt die erste Runde!';
    } else if (today.games) {
      var leader = PG.history.sortPlayers(today.players, 'points')[0];
      subtitle = 'Heute: ' + today.games + (today.games === 1 ? ' Spiel' : ' Spiele') +
        ' · ' + leader.name + ' führt';
    } else {
      var allTime = PG.history.sortPlayers(total.players, 'points')[0];
      subtitle = total.games + (total.games === 1 ? ' Spiel' : ' Spiele') +
        ' gesamt · ' + allTime.name + ' vorn';
    }

    return h('button', {
      class: 'game-card fade-in',
      type: 'button',
      onClick: function () {
        PG.audio.click();
        PG.haptics.light();
        PG.router.go('stats');
      }
    },
      h('div', { class: 'game-card__art game-card__art--stats' }, PG.icons.el('chart', 28)),
      h('div', { class: 'game-card__body' },
        h('div', { class: 'game-card__title', text: 'Bestenliste' }),
        h('div', { class: 'game-card__tagline', text: subtitle })
      ),
      h('div', { class: 'game-card__chev' }, PG.icons.el('chevronRight', 22))
    );
  }

  function homeScreen() {
    var games = PG.registry.list();

    var node = h('div', { class: 'screen' },
      h('div', { style: { 'padding-top': '4px' } },
        h('h1', { class: 'title-xl', text: 'Partyspiele' }),
        h('p', { class: 'text-muted', style: { 'margin-top': '6px' },
          text: 'Ein Gerät, viele Mitspieler. Wähle ein Spiel und los geht\'s.' })
      ),

      resumeBanner(),

      h('div', { class: 'stack' }, games.map(gameCard)),

      installBanner(),

      h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: 'Wer ist der Beste?' }),
        statsEntry()
      ),

      h('div', { class: 'grow' }),

      h('div', { class: 'text-subtle text-center', style: { 'padding-top': '16px' } },
        h('div', { text: 'Läuft komplett offline im Browser.' }),
        h('div', { text: 'Weitere Spiele folgen.' })
      )
    );

    return {
      brand: true,
      back: false,
      node: node
    };
  }

  /* ----------------------------------------------------------------- Start */

  function boot() {
    PG.settings.apply();
    PG.header.init(document.getElementById('header'));
    PG.router.init(document.getElementById('view'));
    PG.router.register('home', homeScreen);
    PG.router.register('stats', PG.statsScreen.view);
    PG.router.go('home', {}, { root: true });

    // Service Worker + Installationsangebot. Das Angebot trifft erst nach
    // dem Laden ein - dann die Startseite noch einmal aufbauen.
    PG.pwa.init();
    PG.pwa.onChange(function () {
      if (PG.router.current() === 'home') PG.router.refresh({ skipAnimation: true });
    });

    // Gemeinsame Bestenliste: Einladungslink auswerten und im Hintergrund
    // abgleichen. Ohne eingerichtete Gruppe passiert hier nichts.
    PG.sync.init();
    PG.sync.onChange(function () {
      if (PG.router.current() === 'stats') PG.router.refresh({ skipAnimation: true });
    });

    // Selbsttest der Spiellogik: index.html?selftest=1
    if (/[?&]selftest=1/.test(window.location.search) && PG.tests) {
      PG.tests.run();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
