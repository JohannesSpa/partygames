/**
 * screens.js - alle Bildschirme von "Tara Tara".
 *
 * Jede Funktion liefert einen View-Deskriptor fuer den Router:
 *   { title, back, node, onMount }
 * Welcher Bildschirm gezeigt wird, entscheidet allein state.phase -
 * dadurch fuehrt ein wiederhergestellter Spielstand automatisch an die
 * richtige Stelle im Spielverlauf.
 */
window.PG = window.PG || {};
PG.taraTara = PG.taraTara || {};

PG.taraTara.screens = (function () {
  'use strict';

  var h = PG.dom.h;
  var ui = PG.ui;
  var L = PG.taraTara.logic;
  var S = PG.taraTara.state;

  /** Merker: nach dem naechsten Render das Namensfeld fokussieren. */
  var focusNameInput = false;

  function state() { return S.store.getState(); }

  /** Action ausfuehren und den aktuellen View neu aufbauen. */
  function commit(action, opts) {
    S.store.dispatch(action);
    PG.router.refresh(opts);
  }

  function leaveToHome() {
    PG.router.go('home', {}, { root: true, back: true });
  }

  /* ================================================================
     1. Spieler anlegen
     ================================================================ */

  /** Gruppe, fuer die das naechste Spiel zaehlen soll. */
  var chosenGroup = null;

  function currentGroup() {
    var vorhanden = PG.sync.groups().map(function (g) { return g.code; });
    if (chosenGroup === '') return '';                 // bewusst ohne Gruppe
    if (chosenGroup && vorhanden.indexOf(chosenGroup) >= 0) return chosenGroup;
    return PG.sync.activeGroup() || '';
  }

  /** Auswahl, fuer welche Gruppe das Spiel zaehlt (nur wenn es mehrere gibt). */
  function groupChooser() {
    var gruppen = PG.sync.groups();
    if (!gruppen.length) return null;

    var aktuell = currentGroup();

    if (gruppen.length === 1 && aktuell === gruppen[0].code) {
      // Nur eine Gruppe: kein Umschalter noetig, nur der Hinweis.
      return h('div', { class: 'row-between' },
        h('span', { class: 'eyebrow', text: 'Zählt für' }),
        ui.badge(PG.sync.groupName(gruppen[0].code), 'primary', 'users')
      );
    }

    var optionen = gruppen.map(function (g) {
      return { value: g.code, label: PG.sync.groupName(g.code) };
    }).concat([{ value: '', label: 'Ohne Gruppe' }]);

    return h('div', { class: 'stack' },
      h('div', { class: 'eyebrow', text: 'Zählt für' }),
      h('div', { class: 'chip-row' }, optionen.map(function (option) {
        return h('button', {
          class: 'chip',
          type: 'button',
          'aria-pressed': option.value === aktuell ? 'true' : 'false',
          onClick: function () {
            chosenGroup = option.value;
            PG.audio.click();
            // Spielerliste leeren: der Kader der neuen Gruppe ist ein anderer.
            commit({ type: 'reset' });
          }
        }, h('span', { text: option.label }));
      }))
    );
  }

  function playersScreen(st) {
    var gruppe = currentGroup();
    var kader = gruppe ? PG.roster.members(gruppe) : [];
    var imSpiel = {};
    st.players.forEach(function (p) { if (p.playerId) imSpiel[p.playerId] = p; });

    var nameField = ui.field({
      placeholder: kader.length ? 'Neuen Spieler aufnehmen' : 'Name eingeben',
      maxlength: 20,
      autocapitalize: 'words',
      enterkeyhint: 'done'
    });
    nameField.el.style.flex = '1';

    function addPlayer() {
      var roh = nameField.value();

      // Mit Gruppe: der Name wandert zusaetzlich dauerhaft in den Kader.
      if (gruppe) {
        var vorhanden = PG.roster.findByName(gruppe, roh);
        if (vorhanden) {
          if (imSpiel[vorhanden.playerId]) {
            nameField.setError('Spielt bereits mit.');
            PG.audio.error();
            return;
          }
          focusNameInput = true;
          PG.audio.confirm();
          commit({ type: 'addPlayer', name: vorhanden.name, playerId: vorhanden.playerId });
          return;
        }

        var neu = PG.roster.add(gruppe, roh);
        if (!neu.ok) {
          nameField.setError(neu.error);
          PG.audio.error();
          PG.haptics.warning();
          return;
        }
        focusNameInput = true;
        PG.audio.confirm();
        PG.haptics.light();
        PG.sync.autoSync();
        commit({ type: 'addPlayer', name: neu.member.name, playerId: neu.member.playerId });
        return;
      }

      // Ohne Gruppe: wie bisher, nur fuer dieses eine Spiel.
      var check = L.validatePlayerName(roh, st.players);
      if (!check.ok) {
        nameField.setError(check.error);
        PG.audio.error();
        PG.haptics.warning();
        return;
      }
      focusNameInput = true;
      PG.audio.confirm();
      PG.haptics.light();
      commit({ type: 'addPlayer', name: check.value });
    }

    nameField.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); addPlayer(); }
    });

    /** Kader-Chips: antippen nimmt jemanden ins Spiel oder wieder heraus. */
    function kaderAuswahl() {
      if (!kader.length) return null;
      return h('div', { class: 'stack' },
        h('div', { class: 'row-between' },
          h('span', { class: 'eyebrow', text: 'Wer ist dabei?' }),
          h('span', { class: 'text-subtle',
            text: st.players.length + ' von ' + kader.length + ' ausgewählt' })
        ),
        h('div', { class: 'chip-row chip-row--wrap' }, kader.map(function (m) {
          var dabei = !!imSpiel[m.playerId];
          return h('button', {
            class: 'chip chip--player',
            type: 'button',
            'aria-pressed': dabei ? 'true' : 'false',
            onClick: function () {
              PG.haptics.light();
              if (dabei) {
                commit({ type: 'removePlayer', id: imSpiel[m.playerId].id });
              } else {
                PG.audio.click();
                commit({ type: 'addPlayer', name: m.name, playerId: m.playerId });
              }
            }
          },
            PG.icons.el(dabei ? 'check' : 'plus', 15),
            h('span', { text: m.name })
          );
        }))
      );
    }

    var liste = st.players.length
      ? h('ul', { class: 'stack' }, st.players.map(function (player, index) {
          return h('li', { class: 'player-row fade-in d-' + Math.min(index, 7) },
            ui.avatar(player.name),
            h('span', { class: 'player-row__name', text: player.name }),
            ui.badge('#' + (index + 1)),
            ui.iconButton({
              icon: 'trash',
              label: player.name + ' entfernen',
              onClick: function () {
                PG.haptics.medium();
                commit({ type: 'removePlayer', id: player.id });
              }
            })
          );
        }))
      : ui.empty({
          icon: 'users',
          title: 'Noch keine Spieler',
          text: kader.length
            ? 'Tippe oben auf die Namen, die heute mitspielen.'
            : 'Mindestens zwei Spieler werden benötigt.'
        });

    var node = h('div', { class: 'screen' },
      h('div', null,
        h('h1', { class: 'title-xl', text: 'Wer spielt mit?' }),
        h('p', { class: 'text-muted', style: { 'margin-top': '4px' },
          text: 'Die Reihenfolge der Liste ist die Sitzordnung im Uhrzeigersinn.' })
      ),

      groupChooser(),
      kaderAuswahl(),

      h('div', { class: 'row', style: { 'align-items': 'flex-start' } },
        nameField.el,
        ui.button({
          icon: 'plus',
          variant: 'primary',
          block: false,
          silent: true,
          class: 'btn--add',
          onClick: addPlayer
        })
      ),

      liste,

      h('div', { class: 'actions' },
        h('div', { class: 'text-subtle text-center', text:
          st.players.length < 2
            ? 'Noch ' + (2 - st.players.length) + ' Spieler bis zum Start'
            : st.players.length + ' Spieler bereit' }),
        ui.button({
          label: 'Weiter',
          variant: 'primary',
          iconRight: 'arrowRight',
          disabled: st.players.length < 2,
          onClick: function () { commit({ type: 'goToRange' }); }
        })
      )
    );

    return {
      title: 'Tara Tara',
      back: leaveToHome,
      node: node,
      onMount: function () {
        if (focusNameInput) {
          focusNameInput = false;
          nameField.focus();
        }
      }
    };
  }

  /* ================================================================
     2. Zielintervall festlegen
     ================================================================ */

  function rangeScreen(st) {
    var minField = ui.field({
      label: 'Minimum',
      inputClass: 'input--number',
      inputmode: 'numeric',
      value: st.min,
      unit: 'g',
      maxlength: 6
    });

    var maxField = ui.field({
      label: 'Maximum',
      inputClass: 'input--number',
      inputmode: 'numeric',
      value: st.max,
      unit: 'g',
      maxlength: 6
    });

    function applyPreset(min, max) {
      minField.setValue(min);
      maxField.setValue(max);
      minField.clearError();
      maxField.clearError();
    }

    var presets = h('div', { class: 'row wrap', style: { gap: '8px' } },
      [[20, 100], [50, 200], [100, 330], [200, 500]].map(function (pair) {
        return ui.button({
          label: pair[0] + '–' + pair[1] + ' g',
          size: 'sm',
          block: false,
          onClick: function () { applyPreset(pair[0], pair[1]); }
        });
      })
    );

    function start() {
      var check = L.validateRange(minField.value(), maxField.value());
      if (!check.ok) {
        (check.field === 'min' ? minField : maxField).setError(check.error);
        PG.audio.error();
        PG.haptics.warning();
        return;
      }
      PG.haptics.medium();
      commit({ type: 'startGame', min: check.min, max: check.max, group: currentGroup() });
    }

    var node = h('div', { class: 'screen' },
      h('div', null,
        h('h1', { class: 'title-xl', text: 'Zielbereich' }),
        h('p', { class: 'text-muted', style: { 'margin-top': '4px' },
          text: 'Aus diesem Bereich wird jede Runde eine Zielmenge ausgelost.' })
      ),

      ui.card({ },
        h('div', { class: 'row', style: { 'align-items': 'flex-start' } },
          h('div', { style: { flex: '1' } }, minField.el),
          h('div', { class: 'text-subtle', style: { 'padding-top': '38px', 'font-weight': '700' }, text: 'bis' }),
          h('div', { style: { flex: '1' } }, maxField.el)
        )
      ),

      h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: 'Schnellauswahl' }),
        presets
      ),

      ui.notice({
        icon: 'info',
        content: h('span', null,
          h('strong', { text: 'So wird gewertet: ' }),
          h('span', { text: 'Zu viel getrunken zählt einfach, zu wenig getrunken doppelt. Wer am weitesten daneben liegt, fliegt raus.' })
        )
      }),

      h('div', { class: 'actions' },
        ui.button({ label: 'Spiel starten', variant: 'accent', icon: 'play', onClick: start })
      )
    );

    return {
      title: 'Zielbereich',
      back: function () { commit({ type: 'goToPlayers' }, { back: true }); },
      node: node
    };
  }

  /* ================================================================
     3. Gluecksrad
     ================================================================ */

  function wheelScreen(st) {
    var wheel = PG.taraTara.wheel.create({ min: st.min, max: st.max });
    var participants = st.isTiebreak
      ? (st.tieIds || [])
      : L.activePlayers(st.players).map(function (p) { return p.id; });

    var resultBox = h('div', { class: 'text-center', style: { 'min-height': '104px' } },
      h('div', { class: 'eyebrow', text: 'Zielmenge' }),
      h('div', { class: 'numeric display-number', text: '?', style: { color: 'var(--text-subtle)' } })
    );

    var actionSlot = h('div', { class: 'actions' });

    /** Dreher starten - ausgeloest vom Button ODER vom Rad selbst. */
    function startSpin() {
      PG.dom.setContent(actionSlot, ui.button({ label: 'Dreht ...', disabled: true }));
      PG.haptics.medium();
      wheel.spin(function (value) { showResult(value); });
    }

    function showSpinButton() {
      PG.dom.setContent(actionSlot, ui.button({
        label: 'Rad drehen',
        variant: 'accent',
        icon: 'zap',
        onClick: startSpin
      }));
    }

    // Tippen auf das Rad startet es ebenfalls
    wheel.onActivate(startSpin);

    function showResult(value) {
      PG.dom.setContent(resultBox,
        h('div', { class: 'eyebrow', text: 'Zielmenge' }),
        h('div', { class: 'numeric display-number pop-in' },
          h('span', { text: String(value) }),
          h('span', { class: 'unit', text: 'g' })
        )
      );
      PG.dom.setContent(actionSlot, ui.button({
        label: 'Los geht\'s',
        variant: 'primary',
        iconRight: 'arrowRight',
        onClick: function () { commit({ type: 'setTarget', target: value }); }
      }));
    }

    showSpinButton();

    var heading = st.isTiebreak ? 'Stichrunde' : 'Runde ' + st.round;

    var node = h('div', { class: 'screen' },
      h('div', { class: 'text-center' },
        h('div', { class: 'eyebrow', text: st.isTiebreak ? 'Gleichstand entscheiden' : 'Neue Zielmenge' }),
        h('h1', { class: 'title-lg', text: heading })
      ),

      st.isTiebreak
        ? ui.notice({
            icon: 'swords',
            variant: 'accent',
            content: h('span', null,
              h('strong', { text: 'Stichrunde: ' }),
              h('span', { text: participants.map(function (id) { return L.playerName(st.players, id); }).join(' vs. ') })
            )
          })
        : null,

      h('div', { class: 'grow center-y' },
        wheel.el,
        resultBox
      ),

      h('div', { class: 'row', style: { 'justify-content': 'center', gap: '8px' } },
        ui.badge(participants.length + ' im Rennen', 'primary', 'users'),
        ui.badge(st.min + '–' + st.max + ' g', null, 'scale')
      ),

      h('div', { class: 'text-subtle text-center', text: 'Tippe auf das Rad oder den Button.' }),

      actionSlot
    );

    return {
      title: heading,
      back: leaveToHome,
      node: node
    };
  }

  /* ================================================================
     4. Zug eines Spielers
     ================================================================ */

  /** Gemeinsamer Kopfbereich des Zug-Bildschirms. */
  function turnHeader(st, player, position, total) {
    return [
      h('div', { class: 'stack' },
        h('div', { class: 'row-between' },
          h('span', { class: 'eyebrow', text: st.isTiebreak ? 'Stichrunde' : 'Runde ' + st.round }),
          h('span', { class: 'text-subtle', text: 'Spieler ' + position + ' von ' + total })
        ),
        ui.progress(position / total)
      ),

      h('div', { class: 'row', style: { gap: '14px' } },
        ui.avatar(player.name, 'lg'),
        h('div', { style: { 'min-width': '0', flex: '1' } },
          h('div', { class: 'title-lg', text: player.name }),
          h('div', { class: 'text-subtle', text:
            st.turnRetries ? 'zweiter Versuch – Krone eingelöst' : 'ist an der Reihe' })
        ),
        player.crowns > 0
          ? h('span', { class: 'crown-badge', title: 'Verfügbare Kronen' },
              h('span', { text: '👑' }), h('span', { text: String(player.crowns) }))
          : null
      ),

      ui.card({ class: 'text-center' },
        h('div', { class: 'eyebrow', text: 'Ziel' }),
        h('div', { class: 'numeric display-number' },
          h('span', { text: String(st.target) }),
          h('span', { class: 'unit', text: 'g' })
        )
      )
    ];
  }

  /** 4a) Eingabe der getrunkenen Menge. */
  function turnScreen(st) {
    // Liegt ein noch nicht bestaetigtes Ergebnis vor, zeigen wir dieses.
    if (st.pendingResult) return turnResultScreen(st);

    var playerId = st.queue[st.turnIndex];
    var player = L.findPlayer(st.players, playerId);
    var total = st.queue.length;
    var position = st.turnIndex + 1;

    var amountField = ui.field({
      label: 'Getrunkene Gramm',
      inputClass: 'input--number input--xl',
      inputmode: 'numeric',
      placeholder: '0',
      unit: 'g',
      maxlength: 6,
      enterkeyhint: 'done'
    });

    function confirmAmount() {
      var check = L.validateAmount(amountField.value());
      if (!check.ok) {
        amountField.setError(check.error);
        PG.audio.error();
        PG.haptics.warning();
        return;
      }
      PG.audio.confirm();
      PG.haptics.medium();
      commit({ type: 'submitTurn', drunk: check.value });
    }

    amountField.input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); confirmAmount(); }
    });

    var node = h('div', { class: 'screen' },
      turnHeader(st, player, position, total),

      h('div', { class: 'stack' },
        amountField.el,
        ui.button({ label: 'Bestätigen', variant: 'primary', icon: 'check', onClick: confirmAmount })
      ),

      h('div', { class: 'actions' },
        h('div', { class: 'text-subtle text-center',
          text: player.crowns > 0
            ? 'Nach dem Bestätigen kannst du eine Krone einlösen und neu werfen.'
            : 'Zu wenig zählt doppelt – lieber etwas zu viel.' })
      )
    );

    return {
      title: st.isTiebreak ? 'Stichrunde' : 'Runde ' + st.round,
      back: leaveToHome,
      node: node,
      onMount: function () { amountField.focus(); }
    };
  }

  /**
   * 4b) Ergebnis des Zuges - der einzige Moment, in dem eine Krone
   * eingelöst werden kann.
   */
  function turnResultScreen(st) {
    var pending = st.pendingResult;
    var player = L.findPlayer(st.players, pending.playerId);
    var total = st.queue.length;
    var position = st.turnIndex + 1;
    var error = pending.error;
    var canRedeem = pending.crownsAvailable > 0;

    var resultCard = h('div', { class: 'card text-center pop-in' },
      h('div', { class: 'eyebrow', text: 'Abweichung' }),
      h('div', {
        class: 'numeric display-number',
        style: { color: error === 0 ? 'var(--green-500)' : 'var(--accent)' },
        text: String(error)
      }),
      h('div', { class: 'text-muted', text:
        error === 0 ? 'Perfekt getroffen!' :
        pending.drunk > st.target ? (pending.drunk - st.target) + ' g zu viel' :
        (st.target - pending.drunk) + ' g zu wenig (zählt doppelt)' })
    );

    var actions = h('div', { class: 'stack' });

    if (pending.perfect) {
      // Der Treffer bringt eine Krone - einlösbar nach einem spaeteren Versuch.
      PG.dom.setContent(actions,
        h('div', { class: 'crown-earned fade-in' },
          h('div', { class: 'crown-earned__icon', text: '👑' }),
          h('div', null,
            h('div', { class: 'text-bold', text: 'Krone verdient!' }),
            h('div', { class: 'text-sm text-muted',
              text: player.name + ' kann sie nach einem späteren Versuch einlösen und neu werfen.' })
          )
        ),
        ui.button({ label: 'Weiter', variant: 'primary', iconRight: 'arrowRight',
          onClick: function () { commit({ type: 'confirmTurn' }); } })
      );
    } else if (canRedeem) {
      PG.dom.setContent(actions,
        ui.button({
          label: 'Krone einlösen – neuer Versuch',
          variant: 'accent',
          icon: 'crown',
          onClick: function () {
            PG.haptics.heavy();
            PG.audio.reveal();
            ui.toast(player.name + ' löst eine Krone ein!', { icon: 'crown', variant: 'success' });
            commit({ type: 'redeemCrown' });
          }
        }),
        ui.button({ label: 'Ergebnis behalten', variant: 'primary', iconRight: 'arrowRight',
          onClick: function () { commit({ type: 'confirmTurn' }); } }),
        h('div', { class: 'text-subtle text-center',
          text: 'Verfügbar: ' + pending.crownsAvailable + ' Krone' + (pending.crownsAvailable === 1 ? '' : 'n') +
                ' · nur jetzt einlösbar' })
      );
    } else {
      PG.dom.setContent(actions,
        ui.button({ label: 'Weiter', variant: 'primary', iconRight: 'arrowRight',
          onClick: function () { commit({ type: 'confirmTurn' }); } })
      );
    }

    var node = h('div', { class: 'screen' },
      turnHeader(st, player, position, total),
      resultCard,
      actions
    );

    return {
      title: st.isTiebreak ? 'Stichrunde' : 'Runde ' + st.round,
      back: leaveToHome,
      node: node,
      onMount: function () {
        if (pending.perfect) {
          PG.confetti.start({ bursts: 1, particles: 45 });
          PG.haptics.success();
        }
        // Ohne Krone im Gepäck geht es von allein weiter - flüssiger Ablauf.
        if (!canRedeem && !pending.perfect) {
          setTimeout(function () {
            var now = S.store.getState();
            if (now.pendingResult === pending && PG.router.current() === 'tara-tara') {
              commit({ type: 'confirmTurn' });
            }
          }, PG.settings.motionEnabled() ? 1250 : 400);
        }
      }
    };
  }

  /* ================================================================
     5. Rangliste am Rundenende
     ================================================================ */

  function rankingScreen(st) {
    var lastRound = st.lastRound;
    var entries = lastRound.entries;
    var worstError = entries[entries.length - 1].error;
    var bestError = entries[0].error;
    var rows = [];

    var list = h('ul', { class: 'stack' }, entries.map(function (entry, index) {
      var player = L.findPlayer(st.players, entry.playerId);
      var isTied = lastRound.tieIds && lastRound.tieIds.indexOf(entry.playerId) >= 0;
      var isEliminated = lastRound.eliminatedId === entry.playerId;

      var classes = ['rank-row', 'fade-in', 'd-' + Math.min(index, 7)];
      if (entry.error === bestError) classes.push('rank-row--best');
      if (entry.error === worstError && !isTied) classes.push('rank-row--worst');
      if (isTied) classes.push('rank-row--tied');

      var row = h('li', { class: classes.join(' ') },
        h('span', { class: 'rank-row__pos', text: String(index + 1) }),
        ui.avatar(player.name, 'sm'),
        h('div', { class: 'rank-row__body' },
          h('div', { class: 'rank-row__name', text: player.name }),
          h('div', { class: 'rank-row__meta', text: entry.drunk + ' g getrunken' +
            (player.crowns ? ' · 👑 ' + player.crowns : '') })
        ),
        index === 0 ? ui.badge('Beste', 'success', 'crown') : null,
        h('span', { class: 'rank-row__score', text: String(entry.error) })
      );

      if (isEliminated) rows.push(row);
      return row;
    }));

    var hasTie = !!lastRound.tieIds;
    var eliminatedName = lastRound.eliminatedId ? L.playerName(st.players, lastRound.eliminatedId) : null;

    var actions = h('div', { class: 'actions' });
    if (hasTie) {
      PG.dom.setContent(actions, ui.button({
        label: 'Stichrunde starten',
        variant: 'accent',
        icon: 'swords',
        onClick: function () { commit({ type: 'startTiebreak' }); }
      }));
    } else if (st.gameOver) {
      PG.dom.setContent(actions, ui.button({
        label: 'Zur Siegerehrung',
        variant: 'accent',
        icon: 'trophy',
        onClick: function () { commit({ type: 'showWinner' }); }
      }));
    } else {
      PG.dom.setContent(actions, ui.button({
        label: 'Nächste Runde',
        variant: 'primary',
        iconRight: 'arrowRight',
        onClick: function () { commit({ type: 'nextRound' }); }
      }));
    }

    var heading = lastRound.isTiebreak ? 'Stichrunde' : 'Runde ' + lastRound.round;

    var noticeSlot = h('div');
    if (hasTie) {
      PG.dom.setContent(noticeSlot, ui.notice({
        icon: 'swords',
        variant: 'accent',
        content: h('span', null,
          h('strong', { text: 'Gleichstand! ' }),
          h('span', { text: lastRound.tieIds.map(function (id) { return L.playerName(st.players, id); }).join(' und ') +
            ' liegen mit ' + worstError + ' gleichauf. Eine Stichrunde entscheidet.' })
        )
      }));
    }

    var node = h('div', { class: 'screen' },
      h('div', { class: 'row-between' },
        h('div', null,
          h('div', { class: 'eyebrow', text: 'Ergebnis' }),
          h('h1', { class: 'title-lg', text: heading })
        ),
        ui.badge('Ziel ' + lastRound.target + ' g', 'primary', 'target')
      ),

      noticeSlot,
      list,

      h('div', { class: 'text-subtle text-center',
        text: 'Kleinster Wert = beste Runde. Der schlechteste Wert scheidet aus.' }),

      actions
    );

    return {
      title: heading,
      back: leaveToHome,
      node: node,
      onMount: function () {
        if (!eliminatedName) return;
        var delay = PG.settings.motionEnabled() ? 850 : 0;
        setTimeout(function () {
          rows.forEach(function (row) { row.classList.add('is-eliminated'); });
          PG.audio.eliminate();
          PG.haptics.warning();
          ui.toast(eliminatedName + ' scheidet aus.', { variant: 'danger', icon: 'logOut', duration: 3000 });
        }, delay);
      }
    };
  }

  /* ================================================================
     6. Siegerehrung + Statistik
     ================================================================ */

  function statsTable(st) {
    var rows = L.computeStats(st.players);

    return h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('thead', null,
          h('tr', null,
            ['Spieler', 'Ø Fehler', 'Beste', 'Schlecht.', 'Runden', 'Siege', '👑', 'Platz'].map(function (label) {
              return h('th', { text: label });
            })
          )
        ),
        h('tbody', null, rows.map(function (row) {
          return h('tr', null,
            h('td', { text: row.name }),
            h('td', { class: 'num', text: L.formatNumber(row.average, 1) }),
            h('td', { class: 'num', text: L.formatNumber(row.best, 0) }),
            h('td', { class: 'num', text: L.formatNumber(row.worst, 0) }),
            h('td', { class: 'num', text: String(row.rounds) }),
            h('td', { class: 'num', text: String(row.roundWins) }),
            h('td', { class: 'num', text: String(row.crownsEarned) }),
            h('td', { text: L.placementLabel(row.placement) })
          );
        }))
      )
    );
  }

  function winnerScreen(st) {
    var winner = L.findPlayer(st.players, st.winnerId) || st.players[0];
    var stats = L.computeStats(st.players);
    var winnerStats = stats.filter(function (r) { return r.id === winner.id; })[0];
    var awards = L.computeAwards(st.players);

    var node = h('div', { class: 'screen' },
      h('div', { class: 'text-center', style: { 'padding-top': '8px' } },
        h('div', { class: 'trophy', text: '🏆' }),
        h('div', { class: 'eyebrow', style: { 'margin-top': '10px' }, text: 'Gewinner' }),
        h('h1', { class: 'title-xl winner-name', text: winner.name })
      ),

      h('div', { class: 'row wrap', style: { 'justify-content': 'center', gap: '8px' } },
        ui.badge(L.formatNumber(winnerStats.average, 1) + ' Ø Fehler', 'primary', 'target'),
        ui.badge(winnerStats.roundWins + ' Rundensiege', 'accent', 'crown'),
        ui.badge(winnerStats.rounds + ' Runden', null, 'clock')
      ),

      awards.length ? h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: 'Auszeichnungen' }),
        h('ul', { class: 'stack' }, awards.map(function (award, index) {
          return h('li', { class: 'award fade-in d-' + Math.min(index, 7) },
            h('span', { class: 'award__icon', text: award.icon }),
            h('div', { style: { flex: '1', 'min-width': '0' } },
              h('div', { class: 'award__title', text: award.title + ' · ' + award.name }),
              h('div', { class: 'award__meta', text: award.detail })
            )
          );
        }))
      ) : null,

      h('div', { class: 'stack' },
        h('div', { class: 'eyebrow', text: 'Statistik' }),
        statsTable(st)
      ),

      h('div', { class: 'actions' },
        ui.button({
          label: 'Bestenliste ansehen',
          icon: 'chart',
          onClick: function () { PG.confetti.stop(); PG.router.go('stats'); }
        }),
        ui.button({
          label: 'Neue Runde starten',
          variant: 'accent',
          icon: 'rotate',
          onClick: function () {
            PG.confetti.stop();
            commit({ type: 'rematch' });
          }
        }),
        ui.button({
          label: 'Neues Spiel',
          icon: 'users',
          onClick: function () {
            PG.confetti.stop();
            commit({ type: 'newGame' });
          }
        }),
        ui.button({
          label: 'Spiel beenden',
          variant: 'ghost',
          icon: 'check',
          onClick: function () {
            PG.confetti.stop();
            // Schliesst das Spiel endgueltig ab: der gespeicherte Verlauf
            // wird verworfen, damit die Startseite nicht dauerhaft die
            // Siegerehrung zum Fortsetzen anbietet. Das Ergebnis steht zu
            // diesem Zeitpunkt bereits in der Bestenliste.
            S.discard();
            ui.toast('Spiel abgeschlossen', { icon: 'check', variant: 'success' });
            leaveToHome();
          }
        })
      )
    );

    return {
      title: 'Siegerehrung',
      back: function () { PG.confetti.stop(); leaveToHome(); },
      node: node,
      onMount: function () {
        PG.confetti.start({ bursts: 3, particles: 80 });
        PG.audio.win();
        PG.haptics.success();

        // Das Ergebnis ist zu diesem Zeitpunkt bereits erfasst - das
        // uebernimmt state.js, sobald das Spiel entschieden ist.
      }
    };
  }

  /* ================================================================
     Router-Einstieg: der Bildschirm ergibt sich aus der Phase
     ================================================================ */

  function view() {
    var st = state();
    switch (st.phase) {
      case 'range':   return rangeScreen(st);
      case 'wheel':   return wheelScreen(st);
      case 'turn':    return turnScreen(st);
      case 'ranking': return rankingScreen(st);
      case 'winner':  return winnerScreen(st);
      case 'players':
      default:        return playersScreen(st);
    }
  }

  return { view: view };
})();
