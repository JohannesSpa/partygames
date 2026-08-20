/**
 * sync-ui.js - Oberflaeche fuer Gruppen, Kader und Abgleich.
 *
 * Man kann in mehreren Gruppen sein (Freunde, Kollegen …). Jede Gruppe hat
 * einen eigenen Spielerkader; beim Anlegen eines Spiels waehlt man daraus
 * aus. Die eigentliche Arbeit machen PG.sync und PG.roster.
 */
window.PG = window.PG || {};

PG.syncUi = (function () {
  'use strict';

  var h = PG.dom.h;
  var ui = PG.ui;

  /* ------------------------------------------------------------ Hilfsmittel */

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

  function refresh() {
    PG.router.refresh({ skipAnimation: true });
  }

  /* -------------------------------------------------------------- Abgleich */

  /** Gleicht alle Gruppen ab und meldet das Ergebnis. */
  function runSync() {
    refresh();
    PG.sync.syncNow().then(function (result) {
      if (result.ok) {
        var teile = [];
        if (result.pulled) teile.push(result.pulled + ' Spiele');
        if (result.members) teile.push(result.members + ' Kader-Änderungen');
        ui.toast(teile.length ? teile.join(' und ') + ' geladen' : 'Alles auf dem neuesten Stand',
          { icon: 'check', variant: 'success' });
      } else {
        ui.toast(result.error, { icon: 'alert', variant: 'danger' });
      }
      refresh();
    });
  }

  /* ------------------------------------------------------------- Einladung */

  function inviteDialog(code) {
    var link = PG.sync.inviteLink(code);

    var linkField = null;
    if (link) {
      linkField = h('textarea', { class: 'input code-area', rows: 2, readonly: true });
      linkField.value = link;
    }

    var actions = [
      ui.button({
        label: 'Code kopieren', variant: 'primary', icon: 'check',
        onClick: function () { copyFeedback(code, 'Code kopiert'); }
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
          h('div', { class: 'eyebrow', text: PG.sync.groupName(code) }),
          h('div', { class: 'group-code group-code--lg', text: code })
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

  /* ------------------------------------------------------------------ Kader */

  /** Spielerkader einer Gruppe verwalten. */
  function rosterDialog(code) {
    var nameField = ui.field({
      placeholder: 'Name',
      maxlength: 20,
      autocapitalize: 'words',
      enterkeyhint: 'done'
    });
    nameField.el.style.flex = '1';

    var liste = h('div', { class: 'stack' });

    function zeichnen() {
      var kader = PG.roster.members(code);
      PG.dom.clear(liste);

      if (!kader.length) {
        PG.dom.append(liste, ui.empty({
          icon: 'users',
          title: 'Noch niemand im Kader',
          text: 'Trage die Namen ein, die regelmäßig mitspielen.'
        }));
        return;
      }

      PG.dom.append(liste, h('ul', { class: 'stack' }, kader.map(function (m) {
        return h('li', { class: 'player-row' },
          ui.avatar(m.name),
          h('span', { class: 'player-row__name', text: m.name }),
          ui.iconButton({
            icon: 'settings',
            label: m.name + ' umbenennen',
            onClick: function () { umbenennen(m); }
          }),
          ui.iconButton({
            icon: 'trash',
            label: m.name + ' entfernen',
            onClick: function () {
              ui.confirmDialog({
                title: m.name + ' entfernen?',
                text: 'Die bisherigen Ergebnisse bleiben in der Bestenliste erhalten. ' +
                      'Der Name steht nur nicht mehr zur Auswahl.',
                confirmLabel: 'Entfernen',
                danger: true,
                onConfirm: function () {
                  PG.roster.remove(code, m.playerId);
                  PG.sync.autoSync();
                  zeichnen();
                }
              });
            }
          })
        );
      })));
    }

    function umbenennen(member) {
      var feld = ui.field({ label: 'Neuer Name', value: member.name, maxlength: 20 });
      var d = ui.dialog({
        title: member.name + ' umbenennen',
        content: h('div', { class: 'stack' },
          ui.notice({ icon: 'info', text: 'Die Statistik bleibt an der Person hängen.' }),
          feld.el
        ),
        actions: [
          ui.button({
            label: 'Speichern', variant: 'primary', icon: 'check',
            onClick: function () {
              var res = PG.roster.rename(code, member.playerId, feld.value());
              if (!res.ok) { feld.setError(res.error); return; }
              d.close();
              PG.sync.autoSync();
              zeichnen();
              ui.toast('Umbenannt', { icon: 'check', variant: 'success' });
            }
          }),
          ui.button({ label: 'Abbrechen', variant: 'ghost', onClick: function () { d.close(); } })
        ]
      });
      feld.focus();
    }

    function hinzufuegen() {
      var res = PG.roster.add(code, nameField.value());
      if (!res.ok) {
        nameField.setError(res.error);
        PG.audio.error();
        return;
      }
      nameField.setValue('');
      PG.audio.confirm();
      PG.sync.autoSync();
      zeichnen();
      nameField.focus();
    }

    nameField.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); hinzufuegen(); }
    });

    zeichnen();

    var dlg = ui.dialog({
      title: 'Kader · ' + PG.sync.groupName(code),
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'users',
          text: 'Diese Spieler stehen beim Anlegen eines Spiels zur Auswahl. ' +
                'Der Kader gilt für alle Handys dieser Gruppe.'
        }),
        h('div', { class: 'row', style: { 'align-items': 'flex-start' } },
          nameField.el,
          ui.button({ icon: 'plus', variant: 'primary', block: false, silent: true,
            class: 'btn--add', onClick: hinzufuegen })
        ),
        liste
      ),
      actions: [
        ui.button({ label: 'Fertig', variant: 'primary',
          onClick: function () { dlg.close(); refresh(); } })
      ]
    });
    return dlg;
  }

  /* ----------------------------------------------------- Gruppe verwalten */

  function groupDetail(code) {
    var g = PG.sync.group(code);
    var kader = PG.roster.members(code);
    var istAktiv = PG.sync.activeGroup() === code;

    var nameField = ui.field({
      label: 'Anzeigename (optional)',
      placeholder: 'z. B. Freitagsrunde',
      value: g && g.label ? g.label : '',
      maxlength: 30
    });

    var dlg = ui.dialog({
      title: PG.sync.groupName(code),
      content: h('div', { class: 'stack' },
        h('div', { class: 'text-center' },
          h('div', { class: 'eyebrow', text: 'Gruppencode' }),
          h('div', { class: 'group-code', text: code })
        ),
        h('div', { class: 'detail-list' },
          [['Spieler im Kader', String(kader.length)],
           ['Zuletzt abgeglichen', relativeTime(g ? g.lastSyncAt : 0)],
           ['Status', istAktiv ? 'aktive Gruppe' : 'nicht aktiv']
          ].map(function (paar) {
            return h('div', { class: 'detail-list__row' },
              h('span', { class: 'text-muted', text: paar[0] }),
              h('span', { class: 'text-bold', text: paar[1] })
            );
          })
        ),
        nameField.el
      ),
      actions: [
        istAktiv ? null : ui.button({
          label: 'Als aktive Gruppe setzen', variant: 'primary', icon: 'check',
          onClick: function () { PG.sync.setActive(code); dlg.close(); refresh(); }
        }),
        ui.button({
          label: 'Kader verwalten', icon: 'users',
          onClick: function () { dlg.close(); rosterDialog(code); }
        }),
        ui.button({
          label: 'Einladen', icon: 'logOut',
          onClick: function () { dlg.close(); inviteDialog(code); }
        }),
        ui.button({
          label: 'Name speichern', icon: 'settings',
          onClick: function () {
            PG.sync.setLabel(code, nameField.value());
            dlg.close();
            refresh();
            ui.toast('Gespeichert', { icon: 'check', variant: 'success' });
          }
        }),
        ui.button({
          label: 'Gruppe verlassen', variant: 'danger', icon: 'trash',
          onClick: function () {
            dlg.close();
            ui.confirmDialog({
              title: 'Gruppe verlassen?',
              text: 'Die Ergebnisse dieser Gruppe werden von diesem Gerät entfernt. ' +
                    'Auf den anderen Handys bleiben sie erhalten – und wenn du dem Code ' +
                    'später wieder beitrittst, holst du dir alles zurück.',
              confirmLabel: 'Verlassen',
              danger: true,
              onConfirm: function () {
                PG.sync.leave(code);
                ui.toast('Gruppe verlassen', { icon: 'check' });
                refresh();
              }
            });
          }
        })
      ].filter(Boolean)
    });
    return dlg;
  }

  /** Gruppe anlegen oder einer bestehenden beitreten. */
  function groupDialog() {
    var current = PG.sync.config();

    var codeField = ui.field({
      label: 'Gruppencode',
      placeholder: 'PARTY-XXXX-XXXX',
      autocapitalize: 'characters',
      maxlength: 32
    });

    var labelField = ui.field({
      label: 'Anzeigename (optional)',
      placeholder: 'z. B. Freitagsrunde',
      maxlength: 30
    });

    var endpointField = ui.field({
      label: 'Server (optional)',
      placeholder: 'https://…/api/sync',
      hint: 'Leer lassen – normalerweise ist das schon im Code hinterlegt.',
      value: current.endpointOverride || ''
    });

    function finish(code) {
      PG.sync.setEndpoint(endpointField.value());

      var result = PG.sync.join(code, labelField.value());
      if (!result.ok) {
        codeField.setError(result.error);
        PG.audio.error();
        return;
      }

      // Ergebnisse ohne Gruppenzuordnung gehoeren der ersten Gruppe.
      if (PG.sync.groups().length === 1) PG.history.adoptUntagged(result.code);

      dlg.close();
      PG.sync.syncNow({ only: result.code }).then(function (sync) {
        ui.toast(
          sync.ok ? 'Verbunden – ' + sync.pulled + ' Spiele geladen' : sync.error,
          sync.ok ? { icon: 'check', variant: 'success' } : { icon: 'alert', variant: 'danger' }
        );
        refresh();
        if (sync.ok && !result.alreadyMember) inviteDialog(result.code);
      });
    }

    var dlg = ui.dialog({
      title: 'Gruppe hinzufügen',
      content: h('div', { class: 'stack' },
        ui.notice({
          icon: 'info',
          text: 'Alle mit demselben Gruppencode sehen eine gemeinsame Bestenliste. ' +
                'Kein Konto, kein Passwort – nur der Code.'
        }),
        codeField.el,
        labelField.el,
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

  /** Karte am Kopf der Bestenliste: Gruppen, Status, Abgleich. */
  function card() {
    var gruppen = PG.sync.groups();

    if (!gruppen.length) {
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

    var state = PG.sync.status();
    var aktiv = PG.sync.activeGroup();

    var statusBadge = state === 'error' ? ui.badge('Fehler', 'danger', 'alert')
      : state === 'syncing' ? ui.badge('läuft', 'primary', 'rotate')
      : ui.badge('aktiv', 'success', 'check');

    var fehler = gruppen.filter(function (g) { return g.lastError; })[0];

    return ui.card({ class: 'stack' },
      h('div', { class: 'row-between' },
        h('span', { class: 'eyebrow',
          text: gruppen.length === 1 ? 'Gruppe' : gruppen.length + ' Gruppen' }),
        statusBadge
      ),

      h('ul', { class: 'stack' }, gruppen.map(function (g) {
        var kader = PG.roster.members(g.code);
        return h('li', {
          class: ['group-row', g.code === aktiv ? 'group-row--active' : ''].filter(Boolean).join(' '),
          role: 'button',
          tabindex: '0',
          onClick: function () { PG.audio.click(); groupDetail(g.code); }
        },
          h('div', { class: 'group-row__mark' },
            PG.icons.el(g.code === aktiv ? 'check' : 'users', 18)),
          h('div', { style: { flex: '1', 'min-width': '0' } },
            h('div', { class: 'text-bold', text: PG.sync.groupName(g.code) }),
            h('div', { class: 'text-subtle', text:
              kader.length + ' Spieler · ' + relativeTime(g.lastSyncAt) })
          ),
          PG.icons.el('chevronRight', 18)
        );
      })),

      fehler ? h('div', { class: 'field__error', text: fehler.lastError }) : null,

      ui.button({
        label: 'Abgleichen', variant: 'primary', size: 'sm', icon: 'rotate',
        disabled: state === 'syncing',
        onClick: runSync
      }),

      ui.button({
        label: 'Gruppe hinzufügen', size: 'sm', icon: 'plus',
        onClick: groupDialog
      })
    );
  }

  return {
    card: card,
    runSync: runSync,
    groupDialog: groupDialog,
    groupDetail: groupDetail,
    rosterDialog: rosterDialog,
    inviteDialog: inviteDialog,
    relativeTime: relativeTime
  };
})();
