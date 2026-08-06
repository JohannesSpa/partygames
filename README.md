# PartyGames

Eine Sammlung von Partyspielen für ein Gerät – mobile first, modernes Design,
**komplett offline im Browser lauffähig**. Erstes Spiel: **Tara Tara**.

## Starten

`index.html` doppelklicken. Das war's.

Keine Installation, kein Build, kein Server, keine Internetverbindung nötig.
Alle Daten bleiben im Browser (LocalStorage).

Für die Nutzung am Handy: Ordner aufs Gerät kopieren und `index.html` öffnen –
oder einen beliebigen statischen Server im Ordner starten, z. B.

```bash
py -3 -m http.server 8777
```

## Tara Tara – Spielregeln

1. **Spieler anlegen** – beliebig viele, mindestens zwei. Die Listenreihenfolge
   ist die Sitzordnung im Uhrzeigersinn.
2. **Zielbereich festlegen**, z. B. 50 bis 200 Gramm.
3. **Jede Runde** lost ein Glücksrad eine Zielmenge aus diesem Bereich aus.
   Die Zahl ist erst nach der Animation sichtbar.
4. **Jeder Spieler** trinkt und gibt seine tatsächlich getrunkenen Gramm ein.
5. **Bewertung** – je kleiner der Fehlerwert, desto besser:

   ```js
   if (getrunken >= ziel) fehler = getrunken - ziel;
   else                   fehler = (ziel - getrunken) * 2;   // zu wenig zählt doppelt
   ```

6. **Krone** – wer exakt trifft (Fehler 0), verdient eine Krone für dieses Spiel.
   Sie lässt sich **nur unmittelbar nach einem eigenen Versuch** einlösen: der
   Versuch wird verworfen und der Spieler wirft sofort noch einmal.
   Die Krone für einen perfekten Treffer gibt es erst mit dem Bestätigen –
   sie ist also für einen **späteren** Versuch gedacht.
7. **Rundenende** – Rangliste, der schlechteste Wert scheidet aus.
   Bei **Gleichstand am Ende** entscheidet eine **Stichrunde** nur zwischen den
   betroffenen Spielern (neue Zielzahl, neues Rad).
8. **Startspieler** – Runde 1 zufällig, danach der Beste der Vorrunde.
   Alle übrigen folgen im Uhrzeigersinn.
9. **Spielende** bei einem verbliebenen Spieler: Siegerehrung mit Konfetti,
   Auszeichnungen und Statistik (Ø Fehler, beste/schlechteste Runde,
   Rundensiege, Kronen, Platzierung).

### Auszeichnungen am Spielende

| | | |
|---|---|---|
| 🎯 | Scharfschütze | die meisten perfekten Treffer |
| 👑 | Gekrönt | die meisten verdienten Kronen |
| 🧊 | Eiskalt | beste durchschnittliche Abweichung |
| 🌋 | Ausreißer | schlechtester Einzelwert |
| ⚔️ | Überlebenskünstler | Stichrunde überstanden |
| 🐢 | Zu zaghaft | am häufigsten unter dem Ziel geblieben |

## Bestenliste & Gesamtstatistik

Jedes beendete Spiel landet automatisch in der Historie. Die Bestenliste
(Startseite → *Bestenliste*) zeigt sie über vier Zeiträume: **Heute · Monat ·
Jahr · Gesamt**, sortierbar nach vier Kennzahlen:

- **Party-Punkte** – Sieg 10 · Platz 2: 6 · Platz 3: 3 · Teilnahme 1,
  dazu +2 je Rundensieg und +5 je perfektem Treffer
- **Siege**, **Ø Abweichung** (kleiner ist besser), **Kronen**

Ein Tipp auf einen Spieler öffnet sein Profil: Spiele, Siegquote, Podestplätze,
bester/schlechtester Wurf, Rundensiege, verdiente und eingelöste Kronen,
perfekte Treffer, Stichrunden, aktuelle und längste Siegesserie sowie die
letzten Spiele.

### Ergebnisse von mehreren Geräten zusammenführen

Noch gibt es keinen Server – aber die Daten sind schon dafür vorbereitet
(Spieler werden über ihren Namen identifiziert, jedes Spiel hat eine
eindeutige id):

- **Teilen** exportiert alle Ergebnisse als JSON – als Datei oder über die
  Zwischenablage.
- **Importieren** führt fremde Ergebnisse mit den eigenen zusammen; bereits
  bekannte Spiele werden anhand ihrer id übersprungen.

So sehen Freunde von verschiedenen Orten eine gemeinsame Bestenliste. Später
muss nur der Transportweg durch eine API ersetzt werden – das Datenmodell
bleibt gleich.

## Features

- Animiertes SVG-Glücksrad mit realistischem Auslauf und Tick-Geräusch –
  **jeder Wert des Intervalls hat ein eigenes Segment**; Farbbänder und
  Beschriftung werden automatisch zu runden Schritten gruppiert, damit auch
  50–200 g oder 1–10000 g lesbar bleiben
- Kronen für perfekte Treffer, einlösbar für einen zweiten Versuch
- Bestenliste über Tag / Monat / Jahr / Gesamt mit Spielerprofilen
- Auszeichnungen am Spielende
- Export/Import der Ergebnisse zum Zusammenführen mehrerer Geräte
- Als App installierbar (PWA) und nach dem ersten Aufruf komplett offline
- Dark Mode (hell / dunkel / System)
- Laufendes Spiel wird automatisch gespeichert und kann fortgesetzt werden
- Soundeffekte (per WebAudio erzeugt, keine Dateien) und Vibration – abschaltbar
- Animationen abschaltbar, `prefers-reduced-motion` wird respektiert
- Saubere Validierung aller Eingaben mit verständlichen Fehlermeldungen
- Touch-optimiert: große Buttons, große Zahlen, klare Kontraste

## Aufs Smartphone bringen

Die App ist eine **PWA**: einmal über HTTPS (oder localhost) geöffnet, lässt sie
sich wie eine native App auf dem Home-Bildschirm ablegen – mit eigenem Icon,
im Vollbild und **komplett offline**.

### a) Schnell im WLAN testen

Im Projektordner starten und die IP-Adresse des PCs am Handy öffnen:

```bash
py -3 -m http.server 8777 --bind 0.0.0.0
```

Windows fragt einmal nach der Firewall → für *private Netzwerke* erlauben.
Gut zum Ausprobieren, aber: PC muss laufen, nur im selben WLAN, keine
Installation (Service Worker brauchen HTTPS oder localhost).

### b) Dauerhaft hosten

Der Ordner ist eine rein statische Seite – jeder Hoster genügt:

| Weg | Aufwand |
|---|---|
| **Cloudflare Pages / Netlify** | Ordner per Drag & Drop hochladen, kein Git nötig |
| **GitHub Pages** | Repo anlegen, pushen, in den Einstellungen Pages aktivieren |
| Eigener Webspace | Ordner per FTP hochladen |

Wichtig ist nur, dass `index.html`, `sw.js` und `manifest.webmanifest` im
**selben Verzeichnis** liegen – alle Pfade sind relativ, ein Unterordner
funktioniert also auch.

### c) Auf dem Handy installieren

- **Android / Chrome**: Seite öffnen → Hinweis „Als App installieren" auf der
  Startseite antippen (oder Browsermenü → *App installieren*).
- **iOS / Safari**: Teilen-Symbol → *Zum Home-Bildschirm*. Die App zeigt dazu
  eine kurze Anleitung an.

Danach startet PartyGames ohne Browserleiste und funktioniert ohne Internet.
Spielstände und Bestenliste liegen weiterhin nur auf dem jeweiligen Gerät.

### Nach Änderungen am Code

In [`sw.js`](sw.js) `CACHE_VERSION` erhöhen (`'v3'` → `'v4'`) und neu hochladen.
Installierte Apps melden sich dann beim nächsten Start mit „Neue Version
verfügbar". Neue Dateien zusätzlich in die Liste `ASSETS` eintragen.

Zur Kontrolle lässt sich der Service Worker in der Browserkonsole befragen:

```js
navigator.serviceWorker.getRegistration().then(r => {
  const c = new MessageChannel();
  c.port1.onmessage = e => console.log(e.data);
  (r.waiting || r.active).postMessage({ type: 'VERSION' }, [c.port2]);
});
```

Antwort: Version, Anzahl gecachter Dateien und was beim Vorladen fehlgeschlagen ist.

### Wenn die Seite offline geht

Wird das Repo auf **privat** gestellt, schaltet GitHub Pages die Seite ab und
liefert 404 (Pages für private Repos gibt es nur in bezahlten Plänen).
Für bereits installierte Apps ist das folgenlos: Der Service Worker liefert
grundsätzlich zuerst aus dem Cache, und Antworten, die nicht `ok` sind, werden
**nie** in den Cache übernommen – eine 404-Seite kann die App also nicht
überschreiben. Nur Neuinstallationen und Updates brauchen die Seite wieder
öffentlich.

Wer das Repo dauerhaft privat halten will, deployt statt GitHub Pages über
**Cloudflare Pages** oder **Netlify** – beide bauen auch aus privaten Repos,
ebenfalls kostenlos.

## Projektstruktur

```
index.html                  lädt alle Skripte in Abhängigkeitsreihenfolge
manifest.webmanifest        Name, Farben, Icons – macht die Seite installierbar
sw.js                       Service Worker: cached alles für den Offline-Betrieb
icons/                      App-Icons (32 / 180 / 192 / 512 px)
css/
  tokens.css                Design-Tokens (Farben, Abstände, Schatten), Light + Dark
  base.css                  Reset, Typografie, Layout-Primitives
  components.css            Button, Card, Input, Dialog, Tabelle, Rangliste …
  animations.css            Seitenübergänge, Rad, Konfetti, Ausscheiden
js/
  core/
    dom.js                  h()-Hyperscript statt JSX
    store.js                kleiner Redux-artiger Store
    storage.js              defensiver LocalStorage-Wrapper
    router.js               View-Router mit animierten Übergängen
    settings.js             Theme, Sound, Haptik, Animationen
    audio.js                Soundsynthese (WebAudio)
    haptics.js              navigator.vibrate
    confetti.js             Canvas-Konfetti
    history.js              Ergebnis-Historie, Aggregation, Export/Import
    pwa.js                  Service-Worker-Registrierung, Installation, Updates
    registry.js             Spiel-Registry  ← Erweiterungspunkt
  ui/
    icons.js                Inline-SVG-Icons im Lucide-Stil
    components.js           Button, Card, Field, Badge, Dialog, Toast, Switch …
    header.js               App-Header
    settings-sheet.js       Einstellungs-Dialog
  games/
    tara-tara/
      logic.js              REINE Spielregeln (kein DOM) – einzeln testbar
      state.js              Reducer + Store + Persistenz
      wheel.js              Glücksrad-Komponente
      screens.js            alle Bildschirme des Spiels
      game.js               Registrierung in der Registry
  screens/
    stats.js                Bestenliste, Spielerprofile, Export/Import
  tests.js                  Selbsttest der Spiellogik
  app.js                    Bootstrap + Startseite
```

## Ein weiteres Spiel ergänzen

1. Ordner `js/games/<spiel-id>/` anlegen (gerne mit derselben Aufteilung
   `logic.js` / `state.js` / `screens.js` / `game.js`).
2. In `game.js` die Route registrieren und das Spiel anmelden:

   ```js
   PG.router.register('mein-spiel', PG.meinSpiel.screens.view);

   PG.registry.register({
     id: 'mein-spiel',
     name: 'Mein Spiel',
     tagline: 'Kurze Beschreibung für die Spielkarte',
     icon: 'sparkles',              // Schlüssel aus PG.icons
     tags: ['3+ Spieler'],
     start: function () { PG.router.go('mein-spiel'); }
   });
   ```

3. Die neuen Dateien in `index.html` eintragen.

Die Spielkarte erscheint danach automatisch auf der Startseite – am bestehenden
Code muss nichts geändert werden.

## Selbsttest

`index.html?selftest=1` aufrufen (oder in der Konsole `PG.tests.run()`).
Getestet werden Bewertung, Validierung, Zugreihenfolge, Radaufteilung,
Rundenauswertung, Stichrunde, Kronen, Auszeichnungen, Revanche sowie die
Aggregation der Gesamtstatistik – 97 Prüfungen. Das Ergebnis erscheint als
Dialog und in der Konsole; gespeicherte Spielstände werden dabei nicht
verändert.

## Technische Hinweise

Bewusst ohne Framework und ohne Build-Step, damit die App per Doppelklick unter
`file://` läuft – und über HTTPS zusätzlich als installierbare PWA:

- **Keine ES-Module** – unter `file://` blockiert der Browser Modul-Importe (CORS).
  Deshalb klassische `<script>`-Tags mit dem globalen Namespace `PG`.
- **Kein `fetch` auf lokale Dateien** – alle Assets sind inline (SVG, Sounds
  werden per WebAudio synthetisiert, Favicon als Data-URI).
- **Typisierung** über JSDoc-`@typedef` (`Player`, `RoundResult`, `GameState`).
- **Service Worker und Manifest werden unter `file://` still übersprungen** –
  dort funktioniert die App ohne sie, nur eben ohne Installation und Cache.

### Migration auf React/Vite

`js/games/tara-tara/logic.js` und der Reducer in `state.js` sind frei von DOM und
Framework – beides lässt sich unverändert nach TypeScript übernehmen
(`reducer` → `useReducer`/zustand). Zu ersetzen wären nur `screens.js`
(→ Komponenten), `dom.js` (→ JSX), `router.js` (→ React Router) und die
CSS-Tokens (→ Tailwind-Theme).
