/**
 * stats.js - Bestenliste und Gesamtstatistik ueber alle Spiele.
 *
 * Zeitraeume: Heute / Monat / Jahr / Gesamt.
 * Kennzahlen: Party-Punkte, Siege, durchschnittliche Abweichung, Kronen.
 *
 * Die Daten kommen aus PG.history und liegen nur lokal im Browser.
 * Ueber Export/Import lassen sich die Ergebnisse mehrerer Geraete
 * zusammenfuehren - die Vorstufe zu einem spaeteren Online-Ranking.
 */
window.PG = window.PG || {};

PG.statsScreen = (function () {
  'use strict';

  var h = PG.dom.h;
  var ui = PG.ui;
  var H = PG.history;
  var fmt = PG.taraTara.logic.formatNumber;

  // Ansichtszustand bleibt zwischen Aufrufen erhalten
  var period = 'all';
  var metric = 'points';

  /* --------------------------------------------------------- Hilfsmittel */

  var MEDALS = ['🥇', '🥈', '🥉'];

  /** "1 Spiel" statt "1 Spiele". */
  function plural(count, one, many) {
    return count + ' ' + (count === 1 ? one : many);
  }

  function relativeDay(timestamp) {
    if (!timestamp) return '–';
    var date = new Date(timestamp);
    var today = new Date();
    var startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    var days = Math.floor((startToday - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000);
    if (days <= 0) return 'heute';
    if (days === 1) return 'gestern';
    if (days < 7) return 'vor ' + days + ' Tagen';
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  /** Wert der aktuell gewaehlten Kennzahl als Text. */
  function metricValue(row) {
    switch (metric) {
      case 'wins':    return String(row.wins);
      case 'average': return row.average === null ? '–' : fmt(row.average, 1);
      case 'crowns':  return String(row.crownsEarned);
      default:        return String(row.points);
    }
  }

  function metricUnit() {
    switch (metric) {
      case 'wins':    return 'Siege';
      case 'average': return 'g Ø';
      case 'crowns':  return 'Kronen';
      default:        return 'Punkte';
    }
  }

  /* ------------------------------------------------------------ Kacheln */

  function tile(label, value, icon) {
    return h('div', { class: 'stat-tile' },
      h('div', { class: 'stat-tile__icon' }, PG.icons.el(icon, 18)),
      h('div', { class: 'stat-tile__value numeric', text: value }),
      h('div', { class: 'stat-tile__label', text: label })
    );
  }

  /* ------------------------------------------------------ Spielerdetail */

  function playerDetail(row) {
    var recent = H.recentGamesOf(row.name, 5);

    var rows = [
      ['Spiele', String(row.games)],
      ['Siege', row.wins + ' (' + Math.round(row.winRate * 100) + ' %)'],
      ['Podestplätze', String(row.podiums)],
      ['Party-Punkte', String(row.points)],
      ['Ø Abweichung', row.average === null ? '–' : fmt(row.average, 1) + ' g'],
      ['Bester Wurf', row.best === null ? '–' : row.best + ' g daneben'],
      ['Schlechtester Wurf', row.worst === null ? '–' : row.worst + ' g daneben'],
      ['Rundensiege', String(row.roundWins)],
      ['Kronen verdient', String(row.crownsEarned)],
      ['Kronen eingelöst', String(row.crownsUsed)],
      ['Perfekte Treffer', String(row.perfectHits)],
      ['Stichrunden', String(row.tiebreaks)],
      ['Aktuelle Siegesserie', String(row.currentStreak)],
      ['Längste Siegesserie', String(row.bestStreak)],
      ['Zuletzt gespielt', relativeDay(row.lastPlayed)]
    ];

    var content = h('div', { class: 'stack' },
      h('div', { class: 'row' },
        ui.avatar(row.name, 'lg'),
        h('div', null,
          h('div', { class: 'title-lg', text: row.name }),
          h('div', { class: 'text-subtle', text: H.periodLabel(period) + ' · ' + plural(row.games, 'Spiel', 'Spiele') })
        )
      ),

      h('div', { class: 'detail-list' }, rows.map(function (pair) {
        return h('div', { class: 'detail-list__row' },
          h('span', { class: 'text-muted', text: pair[0] }),
          h('span', { class: 'text-bold numeric', text: pair[1] })
        );
      })),

      recent.length ? h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: 'Letzte Spiele' }),
        h('ul', { class: 'stack' }, recent.map(function (game) {
          var me = game.players.filter(function (p) {
            return H.normalizeName(p.name) === H.normalizeName(row.name);
          })[0];
          return h('li', { class: 'detail-list__row' },
            h('span', { class: 'text-sm', text: relativeDay(game.finishedAt) + ' · ' + game.gameName }),
            h('span', { class: 'badge ' + (me.placement === 1 ? 'badge--success' : ''),
              text: me.placement === 1 ? 'Sieg' : 'Platz ' + me.placement })
          );
        }))
      ) : null
    );

    var dlg = ui.dialog({
      title: null,
      content: content,
      actions: [ui.button({ label: 'Schließen', variant: 'primary', onClick: function () { dlg.close(); } })]
    });
  }

  /* ----------------------------------------------------- Export/Import */

  function downloadJson(text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var link = h('a', {
        href: url,
        download: 'partygames-ergebnisse-' + new Date().toISOString().slice(0, 10) + '.json'
      });
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
      return true;
    } catch (err) {
      return false;
    }
  }

  function exportDialog() {
    var json = H.exportJson();
    var count = H.all().length;

    var area = h('textarea', { class: 'input code-area', readonly: true, rows: 6 });
    area.value = json;

    var dlg = ui.dialog({
      title: 'Ergebnisse teilen',
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'users',
          text: count + ' gespeicherte Spiele. Schick die Datei oder den Text an deine Freunde – ' +
                'sie können die Ergebnisse importieren und ihr seht eine gemeinsame Bestenliste.'
        }),
        area
      ),
      actions: [
        ui.button({
          label: 'Als Datei speichern', variant: 'primary', icon: 'logOut',
          onClick: function () {
            if (downloadJson(json)) ui.toast('Datei gespeichert', { icon: 'check', variant: 'success' });
            else ui.toast('Download nicht möglich – Text kopieren', { variant: 'danger', icon: 'alert' });
          }
        }),
        ui.button({
          label: 'Text kopieren', icon: 'check',
          onClick: function () {
            ui.copyToClipboard(json).then(function (ok) {
              ui.toast(ok ? 'In die Zwischenablage kopiert' : 'Kopieren nicht möglich – Text markieren',
                ok ? { icon: 'check', variant: 'success' } : { variant: 'danger', icon: 'alert' });
            });
          }
        }),
        ui.button({ label: 'Fertig', variant: 'ghost', onClick: function () { dlg.close(); } })
      ]
    });
  }

  function importDialog(onDone) {
    var area = h('textarea', {
      class: 'input code-area',
      rows: 6,
      placeholder: 'JSON hier einfügen …'
    });

    var fileInput = h('input', {
      type: 'file',
      accept: '.json,application/json',
      class: 'hidden',
      onChange: function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () { area.value = String(reader.result); };
        reader.readAsText(file);
      }
    });

    var dlg = ui.dialog({
      title: 'Ergebnisse importieren',
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'info',
          text: 'Datei auswählen oder JSON einfügen. Bereits vorhandene Spiele werden übersprungen.'
        }),
        ui.button({ label: 'Datei auswählen', icon: 'plus', onClick: function () { fileInput.click(); } }),
        fileInput,
        area
      ),
      actions: [
        ui.button({
          label: 'Importieren', variant: 'primary', icon: 'check',
          onClick: function () {
            var result = H.importJson(area.value);
            if (!result.ok) {
              ui.toast(result.error, { variant: 'danger', icon: 'alert' });
              return;
            }
            dlg.close();
            ui.toast(result.added + ' Spiele importiert' +
              (result.skipped ? ', ' + result.skipped + ' übersprungen' : ''),
              { icon: 'check', variant: 'success' });
            if (onDone) onDone();
          }
        }),
        ui.button({ label: 'Abbrechen', variant: 'ghost', onClick: function () { dlg.close(); } })
      ]
    });
  }

  /* -------------------------------------------------------------- View */

  function view() {
    var data = H.aggregate(period);
    var ranked = H.sortPlayers(data.players, metric);

    var body;

    if (!data.games) {
      body = h('div', { class: 'stack' },
        ui.empty({
          icon: 'chart',
          title: period === 'all' ? 'Noch keine Spiele gewertet' : 'In diesem Zeitraum nichts gespielt',
          text: period === 'all'
            ? 'Spielt eine Runde Tara Tara – danach erscheint hier eure Bestenliste.'
            : 'Wechsle den Zeitraum oder startet ein neues Spiel.'
        })
      );
    } else {
      body = h('div', { class: 'stack' },
        h('div', { class: 'stat-grid' },
          tile(data.games === 1 ? 'Spiel' : 'Spiele', String(data.games), 'play'),
          tile('Spieler', String(data.players.length), 'users'),
          tile(data.rounds === 1 ? 'Runde' : 'Runden', String(data.rounds), 'rotate'),
          tile(data.crowns === 1 ? 'Krone' : 'Kronen', String(data.crowns), 'crown')
        ),

        h('div', { class: 'chip-row' }, H.METRICS.map(function (m) {
          return h('button', {
            class: 'chip',
            type: 'button',
            'aria-pressed': m.id === metric ? 'true' : 'false',
            onClick: function () {
              metric = m.id;
              PG.audio.click();
              PG.router.refresh({ skipAnimation: true });
            }
          }, h('span', { text: m.label }));
        })),

        h('ul', { class: 'stack' }, ranked.map(function (row, index) {
          return h('li', {
            class: ['rank-row', 'fade-in', 'd-' + Math.min(index, 7),
                    index === 0 ? 'rank-row--best' : ''].filter(Boolean).join(' '),
            role: 'button',
            tabindex: '0',
            onClick: function () { PG.audio.click(); playerDetail(row); }
          },
            h('span', { class: 'rank-row__pos', text: MEDALS[index] || String(index + 1) }),
            ui.avatar(row.name, 'sm'),
            h('div', { class: 'rank-row__body' },
              h('div', { class: 'rank-row__name', text: row.name }),
              h('div', { class: 'rank-row__meta', text:
                plural(row.games, 'Spiel', 'Spiele') + ' · ' +
                plural(row.wins, 'Sieg', 'Siege') + ' · ' +
                (row.average === null ? '–' : fmt(row.average, 1) + ' g Ø') +
                (row.crownsEarned ? ' · ' + row.crownsEarned + ' 👑' : '') })
            ),
            h('div', { class: 'text-center' },
              h('div', { class: 'rank-row__score', text: metricValue(row) }),
              h('div', { class: 'text-subtle', style: { 'font-size': '11px' }, text: metricUnit() })
            )
          );
        })),

        (function () {
          // Kleiner Motivations-Hinweis: wer fuehrt gerade?
          var leader = ranked[0];
          if (!leader || ranked.length < 2) return null;
          return ui.notice({
            icon: 'crown',
            variant: 'accent',
            content: h('span', null,
              h('strong', { text: leader.name }),
              h('span', { text: ' führt ' + H.periodLabel(period).toLowerCase() +
                ' · ' + metricValue(leader) + ' ' + metricUnit() +
                (leader.currentStreak > 1 ? ' · ' + leader.currentStreak + ' Siege in Folge!' : '') })
            )
          });
        })()
      );
    }

    var node = h('div', { class: 'screen' },
      h('div', null,
        h('h1', { class: 'title-xl', text: 'Bestenliste' }),
        h('p', { class: 'text-muted', style: { 'margin-top': '4px' },
          text: 'Wer performt am besten? Alle Ergebnisse aus euren Spielen.' })
      ),

      PG.syncUi.card(),

      ui.segmented({
        value: period,
        options: H.PERIODS.map(function (p) { return { value: p.id, label: p.label }; }),
        onChange: function (value) {
          period = value;
          PG.router.refresh({ skipAnimation: true });
        }
      }),

      body,

      h('div', { class: 'actions' },
        h('div', { class: 'row', style: { gap: '8px' } },
          ui.button({ label: 'Teilen', size: 'sm', icon: 'logOut', onClick: exportDialog }),
          ui.button({ label: 'Importieren', size: 'sm', icon: 'plus',
            onClick: function () { importDialog(function () { PG.router.refresh({ skipAnimation: true }); }); } })
        ),
        H.all().length ? ui.button({
          label: 'Verlauf löschen', variant: 'ghost', size: 'sm', icon: 'trash',
          onClick: function () {
            ui.confirmDialog({
              title: 'Verlauf löschen?',
              text: 'Alle gespeicherten Spielergebnisse werden entfernt. Das lässt sich nicht rückgängig machen.',
              confirmLabel: 'Löschen',
              danger: true,
              onConfirm: function () {
                H.clear();
                ui.toast('Verlauf gelöscht', { icon: 'check' });
                PG.router.refresh({ skipAnimation: true });
              }
            });
          }
        }) : null
      )
    );

    return {
      title: 'Bestenliste',
      node: node,
      // Beim Öffnen still im Hintergrund abgleichen (gedrosselt).
      onMount: function () { PG.sync.autoSync(); }
    };
  }

  return {
    view: view,
    setPeriod: function (value) { period = value; }
  };
})();
