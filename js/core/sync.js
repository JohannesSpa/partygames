/**
 * sync.js - Abgleich der Ergebnis-Historie ueber mehrere Geraete.
 *
 * Grundgedanke: Spielergebnisse sind unveraenderlich und tragen eine
 * eindeutige id. Dadurch kann es keine Konflikte geben - Abgleich heisst
 * schlicht "neue Datensaetze hinschicken, neue Datensaetze abholen".
 * Ein abgebrochener Abgleich darf beliebig oft wiederholt werden.
 *
 * Die App bleibt offline-first: der LocalStorage ist die Wahrheit, der
 * Server nur ein Briefkasten zwischen den Geraeten. Ohne Netz aendert sich
 * nichts, der Rueckstand wird beim naechsten Mal nachgeholt.
 *
 * Zugang ueber einen gemeinsamen Gruppencode statt Benutzerkonten - wer den
 * Code hat, sieht die Bestenliste der Gruppe und kann Ergebnisse beisteuern.
 */
window.PG = window.PG || {};

PG.sync = (function () {
  'use strict';

  var KEY = 'pg.sync.v1';
  var SAME_ORIGIN_ENDPOINT = 'api/sync';
  var PUSH_LIMIT = 200;          // Datensaetze je Anfrage
  var AUTO_INTERVAL = 20000;     // fruehestens alle 20 s automatisch
  var TIMEOUT = 12000;

  // Verwechslungssichere Zeichen (kein 0/O, kein 1/I)
  var CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  var CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;

  var listeners = [];
  var state = 'idle';            // 'idle' | 'syncing' | 'error'
  var lastAutoAt = 0;
  var running = null;

  /* ------------------------------------------------------------ Einstellung */

  /**
   * Standardadresse aus js/config.js - dadurch muss sie nur einmal zentral
   * gepflegt werden und gilt nach dem Veroeffentlichen fuer alle Geraete.
   */
  function defaultEndpoint() {
    var configured = PG.config && PG.config.syncEndpoint;
    return (configured && String(configured).trim()) || SAME_ORIGIN_ENDPOINT;
  }

  function config() {
    var stored = PG.storage.get(KEY, null) || {};
    return {
      group: stored.group || null,
      // Eine geraetespezifische Eingabe hat Vorrang, sonst gilt die
      // zentrale Einstellung.
      endpoint: stored.endpointOverride || defaultEndpoint(),
      endpointOverride: stored.endpointOverride || null,
      lastSeq: stored.lastSeq || 0,
      syncedIds: Array.isArray(stored.syncedIds) ? stored.syncedIds : [],
      lastSyncAt: stored.lastSyncAt || 0,
      lastError: stored.lastError || null
    };
  }

  function saveConfig(changes) {
    var next = Object.assign(config(), changes);
    PG.storage.set(KEY, next);
    return next;
  }

  function isEnabled() {
    return !!config().group;
  }

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

  /** Erzeugt einen neuen Gruppencode, z. B. PARTY-K7M2-QX94. */
  function generateCode() {
    function block(length) {
      var out = '';
      var random = new Uint8Array(length);
      if (window.crypto && window.crypto.getRandomValues) {
        window.crypto.getRandomValues(random);
      } else {
        for (var r = 0; r < length; r++) random[r] = Math.floor(Math.random() * 256);
      }
      for (var i = 0; i < length; i++) out += CODE_ALPHABET[random[i] % CODE_ALPHABET.length];
      return out;
    }
    return 'PARTY-' + block(4) + '-' + block(4);
  }

  /**
   * Prueft und vereinheitlicht einen eingegebenen Code.
   * @returns {{ok: boolean, code?: string, error?: string}}
   */
  function validateCode(raw) {
    var code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '');
    if (!code) return { ok: false, error: 'Bitte einen Gruppencode eingeben.' };
    if (!CODE_PATTERN.test(code)) {
      return { ok: false, error: 'Nur Buchstaben, Ziffern und Bindestriche (6–32 Zeichen).' };
    }
    return { ok: true, code: code };
  }

  /** Tritt einer Gruppe bei bzw. legt sie an. Danach wird alles abgeholt. */
  function join(rawCode) {
    var check = validateCode(rawCode);
    if (!check.ok) return check;
    saveConfig({ group: check.code, lastSeq: 0, syncedIds: [], lastError: null });
    state = 'idle';
    notify();
    return { ok: true, code: check.code };
  }

  /** Verlaesst die Gruppe. Die lokalen Ergebnisse bleiben erhalten. */
  function leave() {
    PG.storage.remove(KEY);
    state = 'idle';
    notify();
  }

  /** Einladungslink, den man Freunden schicken kann. */
  function inviteLink() {
    var cfg = config();
    if (!cfg.group) return null;
    var base = window.location.href.split('#')[0];
    return base + '#join=' + encodeURIComponent(cfg.group);
  }

  /* --------------------------------------------------------------- Auswahl */

  /**
   * Welche Datensaetze muessen noch hochgeladen werden?
   * Rein und dadurch einzeln testbar.
   * @param {Array} records lokale Historie
   * @param {string[]} syncedIds bereits bestaetigte ids
   * @param {number} [limit]
   * @returns {Array}
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

  /** Haelt die Liste bestaetigter ids in Grenzen. */
  function mergeSyncedIds(existing, added) {
    var seen = {};
    var out = [];
    (existing || []).concat(added || []).forEach(function (id) {
      if (!seen[id]) { seen[id] = true; out.push(id); }
    });
    return out.slice(-1000);
  }

  /* ----------------------------------------------------------- Uebertragung */

  function request(url, payload) {
    // Eigener Zeitrahmen: ein haengender Aufruf soll die App nicht blockieren.
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
   * Fuehrt einen Abgleich durch: senden und holen in einem Aufruf.
   * @param {{silent?: boolean}} [opts]
   * @returns {Promise<{ok: boolean, pushed?: number, pulled?: number, error?: string}>}
   */
  function syncNow(opts) {
    opts = opts || {};
    var cfg = config();

    if (!cfg.group) return Promise.resolve({ ok: false, error: 'Keine Gruppe eingerichtet.' });
    if (running) return running;
    if (navigator.onLine === false) {
      return Promise.resolve({ ok: false, error: 'Offline – wird später nachgeholt.', offline: true });
    }

    state = 'syncing';
    notify();

    var outgoing = selectUnsynced(PG.history.all(), cfg.syncedIds, PUSH_LIMIT);

    running = request(cfg.endpoint, {
      group: cfg.group,
      since: cfg.lastSeq,
      games: outgoing
    }).then(function (data) {
      var merged = PG.history.mergeRecords(data.games);

      saveConfig({
        lastSeq: typeof data.seq === 'number' ? data.seq : cfg.lastSeq,
        syncedIds: mergeSyncedIds(cfg.syncedIds,
          outgoing.map(function (g) { return g.id; })
            .concat(data.games.map(function (g) { return g.id; }))),
        lastSyncAt: Date.now(),
        lastError: null
      });

      state = 'idle';
      running = null;
      notify();
      return { ok: true, pushed: outgoing.length, pulled: merged.added };
    }, function (err) {
      saveConfig({ lastError: err.message });
      state = 'error';
      running = null;
      notify();
      return { ok: false, error: err.message };
    });

    return running;
  }

  /** Abgleich im Hintergrund - gedrosselt, ohne Rueckmeldung an den Nutzer. */
  function autoSync() {
    if (!isEnabled()) return;
    var now = Date.now();
    if (now - lastAutoAt < AUTO_INTERVAL) return;
    lastAutoAt = now;
    syncNow({ silent: true });
  }

  /* ---------------------------------------------------------- Einladungen */

  /** Fragt nach, bevor ein Einladungslink die Gruppe wechselt. */
  function handleInvite(code) {
    var check = validateCode(code);
    if (!check.ok) return;
    if (config().group === check.code) return;

    var h = PG.dom.h;
    var dlg = PG.ui.dialog({
      title: 'Einladung',
      content: h('div', { class: 'stack' },
        PG.ui.notice({
          icon: 'users',
          text: config().group
            ? 'Du bist bereits in einer Gruppe. Möchtest du zu dieser wechseln?'
            : 'Du wurdest zu einer gemeinsamen Bestenliste eingeladen.'
        }),
        h('div', { class: 'text-center' },
          h('div', { class: 'eyebrow', text: 'Gruppencode' }),
          h('div', { class: 'group-code', text: check.code })
        )
      ),
      actions: [
        PG.ui.button({
          label: 'Beitreten', variant: 'primary', icon: 'check',
          onClick: function () {
            dlg.close();
            join(check.code);
            syncNow().then(function (result) {
              PG.ui.toast(
                result.ok ? 'Verbunden – ' + result.pulled + ' Spiele geladen' : result.error,
                result.ok ? { icon: 'check', variant: 'success' }
                          : { icon: 'alert', variant: 'danger' }
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
    // Einladungslink: #join=CODE
    var match = /[#&]join=([^&]+)/.exec(window.location.hash || '');
    if (match) {
      var invited = decodeURIComponent(match[1]);
      // Hash entfernen, damit ein Neuladen nicht erneut fragt
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
    syncNow: syncNow,
    autoSync: autoSync,
    defaultEndpoint: defaultEndpoint,
    /** Leerer Wert = zentrale Einstellung verwenden. */
    setEndpoint: function (url) {
      var trimmed = String(url || '').trim();
      saveConfig({ endpointOverride: trimmed || null });
    }
  };
})();
