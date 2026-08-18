/**
 * sync-ui.js - Oberflaeche fuer die gemeinsame Bestenliste.
 *
 * Gruppe anlegen oder beitreten, Freunde einladen, Abgleich ausloesen und
 * den Status anzeigen. Die eigentliche Arbeit macht PG.sync.
 */
window.PG = window.PG || {};

PG.syncUi = (function () {
  'use strict';

  var h = PG.dom.h;
  var ui = PG.ui;

  /* ------------------------------------------------------------- Hilfsmittel */

  function relativeTime(timestamp) {
    if (!timestamp) return 'noch nie';
    var diff = Date.now() - timestamp;
    if (diff < 60000) return 'gerade eben';
    if (diff < 3600000) return 'vor ' + Math.round(diff / 60000) + ' Min.';
    if (diff < 86400000) return 'vor ' + Math.round(diff / 3600000) + ' Std.';
    return new Date(timestamp).toLocaleDateString('de-DE',
      { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function copyFeedback(text, erfolgMeldung) {
    ui.copyToClipboard(text).then(function (ok) {
      ui.toast(ok ? erfolgMeldung : 'Kopieren nicht möglich – bitte abtippen',
        ok ? { icon: 'check', variant: 'success' } : { icon: 'alert', variant: 'danger' });
    });
  }

  /* ------------------------------------------------------------- Abgleich */

  /** Fuehrt einen Abgleich aus und meldet das Ergebnis. */
  function runSync() {
    PG.router.refresh({ skipAnimation: true });
    PG.sync.syncNow().then(function (result) {
      if (result.ok) {
        ui.toast(
          result.pulled ? result.pulled + ' neue Spiele geladen' : 'Alles auf dem neuesten Stand',
          { icon: 'check', variant: 'success' }
        );
      } else {
        ui.toast(result.error, { icon: 'alert', variant: 'danger' });
      }
      PG.router.refresh({ skipAnimation: true });
    });
  }

  /* ------------------------------------------------------------ Einladung */

  /** Zeigt Code und Einladungslink zum Weitergeben. */
  function inviteDialog() {
    var cfg = PG.sync.config();
    var link = PG.sync.inviteLink();

    var linkField = null;
    if (link) {
      linkField = h('textarea', { class: 'input code-area', rows: 2, readonly: true });
      linkField.value = link;
    }

    var actions = [
      ui.button({
        label: 'Code kopieren', variant: 'primary', icon: 'check',
        onClick: function () { copyFeedback(cfg.group, 'Code kopiert'); }
      })
    ];

    if (link) {
      actions.push(ui.button({
        label: 'Einladungslink kopieren', icon: 'logOut',
        onClick: function () { copyFeedback(link, 'Link kopiert'); }
      }));
    }

    var dlg = ui.dialog({
      title: 'Freunde einladen',
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'users',
          text: 'Wer diesen Code eingibt, spielt auf dieselbe Bestenliste ein. ' +
                'Gib ihn nur an Leute weiter, die mitzählen sollen.'
        }),
        h('div', { class: 'text-center' },
          h('div', { class: 'eyebrow', text: 'Gruppencode' }),
          h('div', { class: 'group-code group-code--lg', text: cfg.group })
        ),
        linkField ? h('div', { class: 'field' },
          h('div', { class: 'field__label', text: 'Einladungslink' }),
          linkField
        ) : null
      ),
      actions: actions.concat([
        ui.button({ label: 'Fertig', variant: 'ghost', onClick: function () { dlg.close(); } })
      ])
    });

    return dlg;
  }

  /* --------------------------------------------------------- Gruppe waehlen */

  /** Gruppe anlegen oder einer bestehenden beitreten. */
  function groupDialog() {
    var current = PG.sync.config();

    var codeField = ui.field({
      label: 'Gruppencode',
      placeholder: 'PARTY-XXXX-XXXX',
      autocapitalize: 'characters',
      maxlength: 32
    });

    var endpointField = ui.field({
      label: 'Server (optional)',
      placeholder: 'https://…/api/sync',
      hint: 'Leer lassen – normalerweise ist das schon im Code hinterlegt.',
      value: current.endpointOverride || ''
    });

    function finish(code) {
      // Leeres Feld = zentrale Einstellung aus js/config.js verwenden
      PG.sync.setEndpoint(endpointField.value());

      var result = PG.sync.join(code);
      if (!result.ok) {
        codeField.setError(result.error);
        PG.audio.error();
        return;
      }

      dlg.close();
      PG.sync.syncNow().then(function (sync) {
        ui.toast(
          sync.ok ? 'Verbunden – ' + sync.pulled + ' Spiele geladen' : sync.error,
          sync.ok ? { icon: 'check', variant: 'success' } : { icon: 'alert', variant: 'danger' }
        );
        PG.router.refresh({ skipAnimation: true });
        if (sync.ok) inviteDialog();
      });
    }

    var dlg = ui.dialog({
      title: 'Gemeinsame Bestenliste',
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'info',
          text: 'Alle mit demselben Gruppencode sehen eine gemeinsame Bestenliste. ' +
                'Kein Konto, kein Passwort – nur der Code.'
        }),
        codeField.el,
        endpointField.el
      ),
      actions: [
        ui.button({
          label: 'Beitreten', variant: 'primary', icon: 'check',
          onClick: function () { finish(codeField.value()); }
        }),
        ui.button({
          label: 'Neue Gruppe erstellen', icon: 'plus',
          onClick: function () { finish(PG.sync.generateCode()); }
        }),
        ui.button({ label: 'Abbrechen', variant: 'ghost', onClick: function () { dlg.close(); } })
      ]
    });

    return dlg;
  }

  /* ---------------------------------------------------------------- Karte */

  /** Karte am Kopf der Bestenliste: Status und Bedienung des Abgleichs. */
  function card() {
    if (!PG.sync.isEnabled()) {
      return ui.card({ class: 'stack' },
        h('div', { class: 'row' },
          h('div', { class: 'notice__icon' }, PG.icons.el('users', 22)),
          h('div', { style: { flex: '1', 'min-width': '0' } },
            h('div', { class: 'title-md', text: 'Gemeinsame Bestenliste' }),
            h('div', { class: 'text-subtle',
              text: 'Ergebnisse aller Handys automatisch zusammenführen.' })
          )
        ),
        ui.button({
          label: 'Einrichten', variant: 'primary', size: 'sm', icon: 'users',
          onClick: groupDialog
        })
      );
    }

    var cfg = PG.sync.config();
    var state = PG.sync.status();

    var statusText;
    if (state === 'syncing') statusText = 'Wird abgeglichen …';
    else if (state === 'error') statusText = cfg.lastError || 'Abgleich fehlgeschlagen';
    else statusText = 'Zuletzt abgeglichen ' + relativeTime(cfg.lastSyncAt);

    var statusBadge = state === 'error' ? ui.badge('Fehler', 'danger', 'alert')
      : state === 'syncing' ? ui.badge('läuft', 'primary', 'rotate')
      : ui.badge('aktiv', 'success', 'check');

    return ui.card({ class: 'stack' },
      h('div', { class: 'row' },
        h('div', { class: 'notice__icon' }, PG.icons.el('users', 22)),
        h('div', { style: { flex: '1', 'min-width': '0' } },
          h('div', { class: 'text-subtle', text: 'Gruppe' }),
          h('div', { class: 'group-code', text: cfg.group })
        ),
        statusBadge
      ),

      h('div', { class: state === 'error' ? 'field__error' : 'text-subtle', text: statusText }),

      h('div', { class: 'row', style: { gap: '8px' } },
        ui.button({
          label: 'Abgleichen', variant: 'primary', size: 'sm', icon: 'rotate',
          disabled: state === 'syncing',
          onClick: runSync
        }),
        ui.button({ label: 'Einladen', size: 'sm', icon: 'users', onClick: inviteDialog }),
        ui.button({
          label: 'Verlassen', variant: 'ghost', size: 'sm', icon: 'logOut',
          onClick: function () {
            ui.confirmDialog({
              title: 'Gruppe verlassen?',
              text: 'Deine Ergebnisse bleiben auf diesem Gerät erhalten, werden aber ' +
                    'nicht mehr abgeglichen.',
              confirmLabel: 'Verlassen',
              danger: true,
              onConfirm: function () {
                PG.sync.leave();
                ui.toast('Gruppe verlassen', { icon: 'check' });
                PG.router.refresh({ skipAnimation: true });
              }
            });
          }
        })
      )
    );
  }

  return {
    card: card,
    runSync: runSync,
    groupDialog: groupDialog,
    inviteDialog: inviteDialog,
    relativeTime: relativeTime
  };
})();
