/**
 * settings-sheet.js - Einstellungs-Dialog (Theme, Sound, Haptik, Animationen).
 */
window.PG = window.PG || {};

PG.settingsSheet = (function () {
  'use strict';

  var h = PG.dom.h;

  function open() {
    var current = PG.settings.all();

    var content = h('div', { class: 'stack' },
      h('div', { class: 'field' },
        h('div', { class: 'field__label', text: 'Erscheinungsbild' }),
        PG.ui.segmented({
          value: current.theme,
          options: [
            { value: 'light', label: 'Hell', icon: 'sun' },
            { value: 'dark', label: 'Dunkel', icon: 'moon' },
            { value: 'system', label: 'System', icon: 'monitor' }
          ],
          onChange: function (value) { PG.settings.set('theme', value); }
        })
      ),

      h('div', { class: 'card card--pad-sm', style: { padding: '4px 16px' } },
        PG.ui.switchRow({
          icon: 'volume',
          title: 'Soundeffekte',
          desc: 'Klicks, Glücksrad und Fanfare',
          checked: current.sound,
          onChange: function (value) { PG.settings.set('sound', value); }
        }),
        PG.ui.switchRow({
          icon: 'vibrate',
          title: 'Vibration',
          desc: PG.haptics.supported ? 'Haptisches Feedback' : 'Von diesem Gerät nicht unterstützt',
          checked: current.haptics,
          onChange: function (value) { PG.settings.set('haptics', value); }
        }),
        PG.ui.switchRow({
          icon: 'sparkles',
          title: 'Animationen',
          desc: 'Übergänge, Glücksrad, Konfetti',
          checked: current.animations,
          onChange: function (value) { PG.settings.set('animations', value); }
        })
      ),

      h('div', { class: 'text-subtle text-center', style: { 'margin-top': '4px' } },
        h('span', { text: 'PartyGames · läuft komplett offline im Browser' })
      )
    );

    var dlg = PG.ui.dialog({
      title: 'Einstellungen',
      content: content,
      actions: [
        PG.ui.button({
          label: 'Gespeicherten Spielstand löschen',
          variant: 'danger',
          icon: 'trash',
          onClick: function () {
            dlg.close();
            PG.ui.confirmDialog({
              title: 'Spielstand löschen?',
              text: 'Der aktuell gespeicherte Spielverlauf wird unwiderruflich entfernt.',
              confirmLabel: 'Löschen',
              danger: true,
              onConfirm: function () {
                PG.registry.list().forEach(function (game) {
                  if (typeof game.discard === 'function') game.discard();
                });
                PG.ui.toast('Spielstand gelöscht', { icon: 'check' });
                PG.router.refresh();
              }
            });
          }
        }),
        PG.ui.button({ label: 'Fertig', variant: 'primary', onClick: function () { dlg.close(); } })
      ]
    });

    return dlg;
  }

  return { open: open };
})();
