/**
 * sync.js - Abgleich ueber mehrere Geraete, fuer beliebig viele Gruppen.
 *
 * Grundgedanke: Alles, was abgeglichen wird, ist ein unveraenderlicher
 * Eintrag mit eindeutiger id - Spielergebnisse ebenso wie Kader-Aenderungen.
 * Dadurch kann es keine Konflikte geben: Abgleich heisst "neue Eintraege
 * hinschicken, neue Eintraege abholen", und ein Abbruch darf beliebig oft
 * wiederholt werden.
 *
 * Die App bleibt offline-first: der LocalStorage ist die Wahrheit, der
 * Server nur ein Briefkasten zwischen den Geraeten.
 *
 * Man kann in mehreren Gruppen gleichzeitig sein (Freunde, Kollegen …).
 * Jede Gruppe hat ihren eigenen Zaehlerstand; eine davon ist die aktive.
 */
window.PG = window.PG || {};

PG.sync = (function () {
  'use strict';

  var KEY = 'pg.sync.v2';
  var LEGACY_KEY = 'pg.sync.v1';
  var SAME_ORIGIN_ENDPOINT = 'api/sync';
  var PUSH_LIMIT = 200;
  var AUTO_INTERVAL = 20000;
  var TIMEOUT = 12000;

  var CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;

  var listeners = [];
  var state = 'idle';            // 'idle' | 'syncing' | 'error'
  var lastAutoAt = 0;
  var running = null;

  /* ------------------------------------------------------------ Einstellung */

  function defaultEndpoint() {
    var configured = PG.config && PG.config.syncEndpoint;
    return (configured && String(configured).trim()) || SAME_ORIGIN_ENDPOINT;
  }

  function emptyGroup(code) {
    return { code: code, label: '', lastSeq: 0, syncedIds: [], lastSyncAt: 0, lastError: null };
  }

  /**
   * Liest die Einstellung. Uebernimmt dabei einmalig eine alte
   * Einzelgruppen-Konfiguration.
   */
  function config() {
    var stored = PG.storage.get(KEY, null);

    if (!stored) {
      var legacy = PG.storage.get(LEGACY_KEY, null);
      if (legacy && legacy.group) {
        stored = {
          version: 2,
          groups: [{
            code: legacy.group,
            label: '',
            lastSeq: legacy.lastSeq || 0,
            syncedIds: Array.isArray(legacy.syncedIds) ? legacy.syncedIds : [],
            lastSyncAt: legacy.lastSyncAt || 0,
            lastError: legacy.lastError || null
          }],
          activeGroup: legacy.group,
          endpointOverride: legacy.endpointOverride || null
        };
        PG.storage.set(KEY, stored);
        PG.storage.remove(LEGACY_KEY);
      }
    }

    stored = stored || {};
    var groups = Array.isArray(stored.groups) ? stored.groups : [];
    var active = stored.activeGroup || (groups[0] ? groups[0].code : null);

    return {
      version: 2,
      groups: groups,
      activeGroup: groups.some(function (g) { return g.code === active; }) ? active : (groups[0] ? groups[0].code : null),
      endpoint: stored.endpointOverride || defaultEndpoint(),
      endpointOverride: stored.endpointOverride || null
    };
  }

  function saveConfig(changes) {
    var next = Object.assign(config(), changes);
    PG.storage.set(KEY, {
      version: 2,
      groups: next.groups,
      activeGroup: next.activeGroup,
      endpointOverride: next.endpointOverride
    });
    return next;
  }

  /** Aendert die Daten EINER Gruppe. */
  function updateGroup(code, changes) {
    var cfg = config();
    var groups = cfg.groups.map(function (g) {
      return g.code === code ? Object.assign({}, g, changes) : g;
    });
    return saveConfig({ groups: groups });
  }

  function groups() { return config().groups; }

  function group(code) {
    return config().groups.filter(function (g) { return g.code === code; })[0] || null;
  }

  function activeGroup() { return config().activeGroup; }

  function isEnabled() { return config().groups.length > 0; }

  function status() {
    if (!isEnabled()) return 'off';
    return state;
  }

  function notify() {
    listeners.slice().forEach(function (fn) { fn(status(), config()); });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /* ------------------------------------------------------------ Gruppencode */

  function generateCode() {
    function block(length) {
      var out = '';
      var random = new Uint8Array(length);
      if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(random);
      else for (var r = 0; r < length; r++) random[r] = Math.floor(Math.random() * 256);
      for (var i = 0; i < length; i++) out += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
      return out;
    }
    return 'PARTY-' + block(4) + '-' + block(4);
  }

  function validateCode(raw) {
    var code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return { ok: false, error: 'Bitte einen Gruppencode eingeben.' };
    if (!CODE_PATTERN.test(code)) {
      return { ok: false, error: 'Nur Buchstaben, Ziffern und Bindestriche (6–32 Zeichen).' };
    }
    return { ok: true, code: code };
  }

  /**
   * Gruppe beitreten bzw. anlegen. Bestehende Gruppen bleiben erhalten.
   * @param {string} rawCode
   * @param {string} [label] frei waehlbarer Anzeigename
   */
  function join(rawCode, label) {
    var check = validateCode(rawCode);
    if (!check.ok) return check;

    var cfg = config();
    if (cfg.groups.some(function (g) { return g.code === check.code; })) {
      saveConfig({ activeGroup: check.code });
      notify();
      return { ok: true, code: check.code, alreadyMember: true };
    }

    var neu = emptyGroup(check.code);
    neu.label = String(label || '').trim().slice(0, 30);
    saveConfig({ groups: cfg.groups.concat([neu]), activeGroup: check.code });
    state = 'idle';
    notify();
    return { ok: true, code: check.code };
  }

  /** Gruppe verlassen. Die Ergebnisse dieser Gruppe werden lokal entfernt. */
  function leave(code) {
    var cfg = config();
    var rest = cfg.groups.filter(function (g) { return g.code !== code; });
    saveConfig({
      groups: rest,
      activeGroup: cfg.activeGroup === code ? (rest[0] ? rest[0].code : null) : cfg.activeGroup
    });
    PG.roster.clearGroup(code);
    PG.history.removeGroup(code);
    state = 'idle';
    notify();
  }

  function setActive(code) {
    saveConfig({ activeGroup: code });
    notify();
  }

  function setLabel(code, label) {
    updateGroup(code, { label: String(label || '').trim().slice(0, 30) });
    notify();
  }

  /** Anzeigename einer Gruppe (frei vergeben oder der Code). */
  function groupName(code) {
    var g = group(code);
    return (g && g.label) || code || '';
  }

  function inviteLink(code) {
    var ziel = code || activeGroup();
    if (!ziel) return null;
    return window.location.href.split('#')[0] + '#join=' + encodeURIComponent(ziel);
  }

  /* --------------------------------------------------------------- Auswahl */

  /**
   * Welche Eintraege muessen noch hochgeladen werden?
   * @param {Array} records
   * @param {string[]} syncedIds
   * @param {number} [limit]
   */
  function selectUnsynced(records, syncedIds, limit) {
    var known = {};
    (syncedIds || []).forEach(function (id) { known[id] = true; });
    var out = [];
    for (var i = 0; i < records.length && out.length < (limit || PUSH_LIMIT); i++) {
      if (!known[records[i].id]) out.push(records[i]);
    }
    return out;
  }

  function mergeSyncedIds(existing, added) {
    var seen = {};
    var out = [];
    (existing || []).concat(added || []).forEach(function (id) {
      if (!seen[id]) { seen[id] = true; out.push(id); }
    });
    return out.slice(-2000);
  }

  /** Entfernt lokale Zusatzfelder (mit _ am Anfang) vor dem Senden. */
  function stripLocal(record) {
    var copy = {};
    Object.keys(record).forEach(function (k) {
      if (k.charAt(0) !== '_') copy[k] = record[k];
    });
    return copy;
  }

  /* ----------------------------------------------------------- Uebertragung */

  function request(url, payload) {
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT);

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
      cache: 'no-store'
    }).then(function (response) {
      clearTimeout(timer);
      return response.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (err) { data = null; }
        if (!response.ok) {
          throw new Error((data && data.error) || ('Server antwortet mit ' + response.status));
        }
        if (!data || !Array.isArray(data.games)) {
          throw new Error('Unerwartete Antwort vom Server.');
        }
        return data;
      });
    }, function (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new Error('Zeitüberschreitung – Server nicht erreichbar.');
      }
      throw new Error('Keine Verbindung zum Server.');
    });
  }

  /**
   * Gleicht EINE Gruppe ab: Spielergebnisse und Kader in einem Aufruf.
   * @param {string} code
   * @returns {Promise<{ok, pushed?, pulled?, error?}>}
   */
  function syncGroup(code) {
    var cfg = config();
    var g = group(code);
    if (!g) return Promise.resolve({ ok: false, error: 'Unbekannte Gruppe.' });

    // Zu sendende Eintraege: Spiele dieser Gruppe + Kaderaenderungen
    var spiele = PG.history.recordsOfGroup(code).map(stripLocal);
    var kader = PG.roster.events(code);
    var offen = selectUnsynced(spiele.concat(kader), g.syncedIds, PUSH_LIMIT);

    return request(cfg.endpoint, {
      group: code,
      since: g.lastSeq,
      games: offen
    }).then(function (data) {
      var eingehendeSpiele = [];
      var eingehenderKader = [];

      data.games.forEach(function (eintrag) {
        if (eintrag && eintrag.kind === 'member') eingehenderKader.push(eintrag);
        else eingehendeSpiele.push(eintrag);
      });

      var spieleErgebnis = PG.history.mergeRecords(eingehendeSpiele, code);
      var kaderErgebnis = PG.roster.mergeEvents(code, eingehenderKader);

      updateGroup(code, {
        lastSeq: typeof data.seq === 'number' ? data.seq : g.lastSeq,
        syncedIds: mergeSyncedIds(g.syncedIds,
          offen.map(function (e) { return e.id; })
            .concat(data.games.map(function (e) { return e.id; }))),
        lastSyncAt: Date.now(),
        lastError: null
      });

      return {
        ok: true,
        pushed: offen.length,
        pulled: spieleErgebnis.added,
        members: kaderErgebnis.added
      };
    }, function (err) {
      updateGroup(code, { lastError: err.message });
      return { ok: false, error: err.message };
    });
  }

  /**
   * Gleicht alle Gruppen ab (nacheinander).
   * @param {{only?: string}} [opts] nur eine bestimmte Gruppe
   */
  function syncNow(opts) {
    opts = opts || {};
    var cfg = config();
    var ziele = opts.only ? cfg.groups.filter(function (g) { return g.code === opts.only; }) : cfg.groups;

    if (!ziele.length) return Promise.resolve({ ok: false, error: 'Keine Gruppe eingerichtet.' });
    if (running) return running;
    if (navigator.onLine === false) {
      return Promise.resolve({ ok: false, error: 'Offline – wird später nachgeholt.', offline: true });
    }

    state = 'syncing';
    notify();

    var gesamt = { ok: true, pushed: 0, pulled: 0, members: 0, fehler: [] };

    running = ziele.reduce(function (kette, g) {
      return kette.then(function () {
        return syncGroup(g.code).then(function (res) {
          if (res.ok) {
            gesamt.pushed += res.pushed || 0;
            gesamt.pulled += res.pulled || 0;
            gesamt.members += res.members || 0;
          } else {
            gesamt.ok = false;
            gesamt.fehler.push(groupName(g.code) + ': ' + res.error);
          }
        });
      });
    }, Promise.resolve()).then(function () {
      state = gesamt.ok ? 'idle' : 'error';
      running = null;
      notify();
      if (!gesamt.ok) gesamt.error = gesamt.fehler.join(' · ');
      return gesamt;
    });

    return running;
  }

  function autoSync() {
    if (!isEnabled()) return;
    var now = Date.now();
    if (now - lastAutoAt < AUTO_INTERVAL) return;
    lastAutoAt = now;
    syncNow();
  }

  /* ---------------------------------------------------------- Einladungen */

  function handleInvite(code) {
    var check = validateCode(code);
    if (!check.ok) return;
    var cfg = config();
    var schonDabei = cfg.groups.some(function (g) { return g.code === check.code; });

    var h = PG.dom.h;
    var dlg = PG.ui.dialog({
      title: 'Einladung',
      content: h('div', { class: 'stack' },
        PG.ui.notice({
          icon: 'users',
          text: schonDabei
            ? 'Du bist in dieser Gruppe bereits dabei. Soll sie die aktive werden?'
            : 'Du wurdest zu einer gemeinsamen Bestenliste eingeladen.'
        }),
        h('div', { class: 'text-center' },
          h('div', { class: 'eyebrow', text: 'Gruppencode' }),
          h('div', { class: 'group-code', text: check.code })
        )
      ),
      actions: [
        PG.ui.button({
          label: schonDabei ? 'Aktiv setzen' : 'Beitreten', variant: 'primary', icon: 'check',
          onClick: function () {
            dlg.close();
            join(check.code);
            syncNow({ only: check.code }).then(function (result) {
              PG.ui.toast(
                result.ok ? 'Verbunden – ' + result.pulled + ' Spiele geladen' : result.error,
                result.ok ? { icon: 'check', variant: 'success' } : { icon: 'alert', variant: 'danger' }
              );
              PG.router.refresh({ skipAnimation: true });
            });
          }
        }),
        PG.ui.button({ label: 'Abbrechen', variant: 'ghost', onClick: function () { dlg.close(); } })
      ]
    });
  }

  /* ------------------------------------------------------------------ Start */

  function init() {
    var match = /[#&]join=([^&]+)/.exec(window.location.hash || '');
    if (match) {
      var invited = decodeURIComponent(match[1]);
      try {
        window.history.replaceState(null, '', window.location.href.split('#')[0]);
      } catch (err) {
        window.location.hash = '';
      }
      handleInvite(invited);
    }

    if (isEnabled()) autoSync();
    window.addEventListener('online', function () { autoSync(); });
  }

  return {
    init: init,
    config: config,
    groups: groups,
    group: group,
    groupName: groupName,
    activeGroup: activeGroup,
    setActive: setActive,
    setLabel: setLabel,
    isEnabled: isEnabled,
    status: status,
    onChange: onChange,
    generateCode: generateCode,
    validateCode: validateCode,
    join: join,
    leave: leave,
    inviteLink: inviteLink,
    selectUnsynced: selectUnsynced,
    mergeSyncedIds: mergeSyncedIds,
    stripLocal: stripLocal,
    syncGroup: syncGroup,
    syncNow: syncNow,
    autoSync: autoSync,
    defaultEndpoint: defaultEndpoint,
    setEndpoint: function (url) {
      var trimmed = String(url || '').trim();
      saveConfig({ endpointOverride: trimmed || null });
    }
  };
})();
