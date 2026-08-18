/**
 * config.js - die eine Stelle, an der etwas eingetragen werden muss.
 *
 * Alles andere funktioniert ohne Konfiguration. Wird hier etwas geaendert,
 * gilt es nach dem naechsten Veroeffentlichen fuer ALLE Geraete - niemand
 * muss etwas von Hand eintippen.
 */
window.PG = window.PG || {};

PG.config = {
  /**
   * Adresse der Schnittstelle fuer die gemeinsame Bestenliste.
   *
   *   ''                                          App und API liegen unter
   *                                               derselben Adresse
   *                                               (Cloudflare Pages) - Standard
   *
   *   'https://partygames.pages.dev/api/sync'     App woanders (z. B. GitHub
   *                                               Pages), API bei Cloudflare
   *
   * Solange hier nichts steht und die App nicht auf Cloudflare liegt, bleibt
   * die Bestenliste einfach lokal - die App funktioniert vollstaendig weiter.
   */
  syncEndpoint: ''
};
