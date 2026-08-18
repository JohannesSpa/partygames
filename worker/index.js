/**
 * worker/index.js - Einstiegspunkt fuer den Betrieb als Cloudflare Worker.
 *
 * Cloudflare legt neu verbundene Repositories als "Worker mit statischen
 * Dateien" an. In diesem Modus wird der Ordner functions/ nicht ausgewertet -
 * es braucht einen Einstiegspunkt, der die Anfragen verteilt:
 *
 *   /api/sync   -> dieselbe Logik wie die Pages Function
 *   alles andere -> die statischen Dateien der App
 *
 * Die eigentliche Arbeit macht weiterhin functions/api/sync.js. Dadurch gibt
 * es nur eine Fassung der Schnittstelle, egal ob das Projekt als Worker oder
 * als klassisches Pages-Projekt laeuft.
 */
import * as sync from '../functions/api/sync.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/sync') {
      switch (request.method) {
        case 'POST':    return sync.onRequestPost({ request, env, ctx });
        case 'GET':     return sync.onRequestGet({ request, env, ctx });
        case 'OPTIONS': return sync.onRequestOptions();
        default:
          return new Response(JSON.stringify({ error: 'Methode nicht erlaubt.' }), {
            status: 405,
            headers: { 'Content-Type': 'application/json; charset=utf-8' }
          });
      }
    }

    // Alles Uebrige beantwortet die Auslieferung der statischen Dateien.
    return env.ASSETS.fetch(request);
  }
};
