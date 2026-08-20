/**
 * functions/api/sync.js - Cloudflare Pages Function fuer den Abgleich.
 *
 * Ein einziger Endpunkt erledigt beides: mitgeschickte Ergebnisse ablegen
 * und alle seither hinzugekommenen zurueckgeben.
 *
 *   POST /api/sync   { group, since, games: [...] }
 *   ->               { games: [...], seq, count }
 *
 * Die Datensaetze sind unveraenderlich, "INSERT OR IGNORE" macht das
 * Ablegen wiederholbar - ein abgebrochener Abgleich kann gefahrlos erneut
 * gesendet werden.
 *
 * Zugang ueber einen gemeinsamen Gruppencode. Wer den Code kennt, sieht die
 * Ergebnisse der Gruppe und darf welche beisteuern - fuer eine
 * Partybestenliste angemessen, fuer Sensibles ausdruecklich nicht.
 *
 * Erwartete Bindung in den Pages-Einstellungen: D1-Datenbank als "DB".
 */

const MAX_GAMES_PER_REQUEST = 200;
const MAX_PULL = 500;
const CODE_PATTERN = /^[A-Z0-9-]{6,32}$/;

// Erlaubt, die App und die Datenbank getrennt zu betreiben (z. B. App auf
// GitHub Pages, API auf Cloudflare). Der Gruppencode bleibt der einzige
// Zugang - eine Herkunftsbeschraenkung wuerde daran nichts aendern.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: Object.assign({
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }, CORS)
  });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

function fail(message, status = 400) {
  return json({ error: message }, status);
}

/**
 * Sieht der Eintrag brauchbar aus? Bewusst genuegsam geprueft.
 *
 * Es gibt zwei Sorten, die sich dieselbe Ablage teilen:
 *   - Spielergebnisse (Standard, ohne kind)
 *   - Kaderaenderungen (kind: 'member') - Aufnehmen, Umbenennen, Entfernen
 * Beide sind unveraenderlich; eine Aenderung ist ein neuer Eintrag mit
 * neuerem Zeitstempel. Der Server muss davon nichts verstehen, er haengt
 * nur an - die Auswertung passiert auf den Geraeten.
 */
function isValidRecord(record) {
  if (!record || typeof record.id !== 'string' || !record.id.length || record.id.length > 64) {
    return false;
  }

  if (record.kind === 'member') {
    return typeof record.playerId === 'string' && record.playerId.length > 0 &&
      record.playerId.length <= 64 &&
      typeof record.name === 'string' && record.name.length <= 60 &&
      typeof record.updatedAt === 'number' && record.updatedAt > 0;
  }

  return typeof record.finishedAt === 'number' && record.finishedAt > 0 &&
    Array.isArray(record.players) && record.players.length > 0 &&
    record.players.length <= 50;
}

/** Zeitstempel fuer die Sortierung - je nach Sorte ein anderes Feld. */
function timestampOf(record) {
  return Math.floor(record.kind === 'member' ? record.updatedAt : record.finishedAt);
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return fail('Datenbank ist nicht verbunden (Bindung "DB" fehlt).', 500);
  }

  let body;
  try {
    body = await request.json();
  } catch (err) {
    return fail('Ungültige Anfrage.');
  }

  const group = String(body?.group || '').trim().toUpperCase();
  if (!CODE_PATTERN.test(group)) return fail('Ungültiger Gruppencode.');

  const since = Number.isFinite(body?.since) ? Math.max(0, Math.floor(body.since)) : 0;
  const incoming = Array.isArray(body?.games) ? body.games : [];
  if (incoming.length > MAX_GAMES_PER_REQUEST) {
    return fail(`Zu viele Ergebnisse auf einmal (max. ${MAX_GAMES_PER_REQUEST}).`, 413);
  }

  // --- Eingehende Ergebnisse ablegen ---------------------------------------
  const valid = incoming.filter(isValidRecord);
  if (valid.length) {
    const insert = env.DB.prepare(
      'INSERT OR IGNORE INTO games (group_code, id, finished_at, payload) VALUES (?, ?, ?, ?)'
    );
    await env.DB.batch(valid.map((record) => insert.bind(
      group,
      record.id,
      timestampOf(record),
      JSON.stringify(record)
    )));
  }

  // --- Alles Neue zurueckgeben ---------------------------------------------
  const { results } = await env.DB.prepare(
    'SELECT seq, payload FROM games WHERE group_code = ? AND seq > ? ORDER BY seq LIMIT ?'
  ).bind(group, since, MAX_PULL).all();

  const games = [];
  for (const row of results || []) {
    try {
      games.push(JSON.parse(row.payload));
    } catch (err) {
      // Beschaedigter Eintrag: ueberspringen statt den ganzen Abgleich zu kippen
    }
  }

  const lastSeq = results && results.length ? results[results.length - 1].seq : since;

  return json({
    games,
    seq: lastSeq,
    count: games.length,
    stored: valid.length,
    // Hinweis fuer den Client: es liegt noch mehr bereit
    more: (results || []).length === MAX_PULL
  });
}

/** Kleiner Lebenszeichen-Endpunkt zum Testen im Browser. */
export async function onRequestGet({ env }) {
  if (!env.DB) return fail('Datenbank ist nicht verbunden (Bindung "DB" fehlt).', 500);
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM games').first();
  return json({ ok: true, games: row ? row.n : 0 });
}
