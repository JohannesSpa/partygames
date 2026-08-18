-- Datenbankschema fuer den Ergebnis-Abgleich (Cloudflare D1 / SQLite).
--
-- Einspielen:
--   wrangler d1 execute partygames --remote --file=./schema.sql
--
-- Ein Spielergebnis ist unveraenderlich. "seq" ist die laufende Nummer, an
-- der sich die Geraete orientieren: jeder Client merkt sich die zuletzt
-- gesehene Nummer und holt beim naechsten Mal nur noch das, was danach kam.

CREATE TABLE IF NOT EXISTS games (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code  TEXT    NOT NULL,
  id          TEXT    NOT NULL,
  finished_at INTEGER NOT NULL,
  payload     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch() * 1000),

  -- Dubletten-Schutz: dasselbe Spiel kann pro Gruppe nur einmal existieren.
  -- Dadurch darf ein abgebrochener Abgleich beliebig oft wiederholt werden.
  UNIQUE (group_code, id)
);

-- Der Abgleich fragt immer "alles einer Gruppe ab Nummer X" ab.
CREATE INDEX IF NOT EXISTS idx_games_group_seq ON games (group_code, seq);
