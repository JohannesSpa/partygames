# -*- coding: utf-8 -*-
"""
Test-Server fuer die Entwicklung - bildet die Cloudflare Pages Function nach.

Liefert die App aus und beantwortet /api/sync genau wie functions/api/sync.js,
nur mit SQLite statt D1. Damit laesst sich der Abgleich lokal durchspielen,
ohne etwas in der Cloud anzulegen.

    py -3 tools/mock-sync-server.py [port]

Nur fuer Tests gedacht: keine Ratenbegrenzung, keine Absicherung.
"""
import json
import os
import re
import sqlite3
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(ROOT, 'tools', 'mock-sync.sqlite')

CODE_PATTERN = re.compile(r'^[A-Z0-9-]{6,32}$')
MAX_GAMES_PER_REQUEST = 200
MAX_PULL = 500


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS games (
          seq         INTEGER PRIMARY KEY AUTOINCREMENT,
          group_code  TEXT    NOT NULL,
          id          TEXT    NOT NULL,
          finished_at INTEGER NOT NULL,
          payload     TEXT    NOT NULL,
          created_at  INTEGER NOT NULL DEFAULT 0,
          UNIQUE (group_code, id)
        )
    """)
    conn.execute('CREATE INDEX IF NOT EXISTS idx_games_group_seq ON games (group_code, seq)')
    conn.commit()
    return conn


def is_valid_record(record):
    return (isinstance(record, dict)
            and isinstance(record.get('id'), str) and 0 < len(record['id']) <= 64
            and isinstance(record.get('finishedAt'), (int, float)) and record['finishedAt'] > 0
            and isinstance(record.get('players'), list) and 0 < len(record['players']) <= 50)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    # --- Hilfsmittel ---------------------------------------------------------

    def send_json(self, data, status=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def fail(self, message, status=400):
        self.send_json({'error': message}, status)

    # --- Routen --------------------------------------------------------------

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path.split('?')[0] == '/api/sync':
            conn = init_db()
            count = conn.execute('SELECT COUNT(*) FROM games').fetchone()[0]
            conn.close()
            self.send_json({'ok': True, 'games': count})
            return
        super().do_GET()

    def do_POST(self):
        if self.path.split('?')[0] != '/api/sync':
            self.fail('Unbekannter Endpunkt.', 404)
            return

        length = int(self.headers.get('Content-Length') or 0)
        try:
            body = json.loads(self.rfile.read(length) or b'{}')
        except Exception:
            self.fail('Ungueltige Anfrage.')
            return

        group = str(body.get('group') or '').strip().upper()
        if not CODE_PATTERN.match(group):
            self.fail('Ungueltiger Gruppencode.')
            return

        since = body.get('since') or 0
        since = max(0, int(since)) if isinstance(since, (int, float)) else 0

        incoming = body.get('games') or []
        if len(incoming) > MAX_GAMES_PER_REQUEST:
            self.fail('Zu viele Ergebnisse auf einmal.', 413)
            return

        conn = init_db()
        valid = [r for r in incoming if is_valid_record(r)]
        for record in valid:
            conn.execute(
                'INSERT OR IGNORE INTO games (group_code, id, finished_at, payload) VALUES (?, ?, ?, ?)',
                (group, record['id'], int(record['finishedAt']), json.dumps(record))
            )
        conn.commit()

        rows = conn.execute(
            'SELECT seq, payload FROM games WHERE group_code = ? AND seq > ? ORDER BY seq LIMIT ?',
            (group, since, MAX_PULL)
        ).fetchall()
        conn.close()

        games = []
        for _, payload in rows:
            try:
                games.append(json.loads(payload))
            except Exception:
                pass

        self.send_json({
            'games': games,
            'seq': rows[-1][0] if rows else since,
            'count': len(games),
            'stored': len(valid),
            'more': len(rows) == MAX_PULL
        })


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    init_db().close()
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    print('PartyGames Test-Server: http://127.0.0.1:%d' % port)
    print('Datenbank: %s' % DB_PATH)
    server.serve_forever()


if __name__ == '__main__':
    main()
