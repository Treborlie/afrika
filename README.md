# Mosaik Afrika als Web-App

Das Spiel als Webseite, die sich wie eine App verhält: **ohne Apple-ID, ohne App Store, ohne Ablaufdatum.**
Läuft auf iPhone, iPad, Android und am Computer. Nach dem ersten Öffnen auch ohne Internet.

## Dateien

| Datei | Inhalt |
|---|---|
| `index.html` | Grundgerüst der Seite |
| `style.css` | Aussehen (Handy, Tablet, Computer) |
| `data.js` | Länder, Grenzen, Karte – **automatisch erzeugt**, nicht von Hand ändern |
| `game.js` | Spielregeln, Spielablauf, Computergegner, Spielstände |
| `map.js` | Karte zeichnen, Tippen, Ziehen, Zoomen |
| `ui.js` | Bildschirme und Fenster |
| `sw.js` | Offline-Funktion |
| `manifest.webmanifest`, `icons/` | Name und Icon auf dem Home-Bildschirm |
| `tools/make_data.py` | erzeugt `data.js` neu aus der Mac-App |
| `tools/simulate.js` | Test: 4 Computer spielen eine Partie |

## Auf dem Mac ausprobieren

```bash
cd WebApp && python3 -m http.server 8765
```

Dann im Browser <http://localhost:8765> öffnen.

## Aufs iPhone bringen

Die Dateien müssen einmal **ins Internet** (über HTTPS), damit das iPhone sie laden kann. Kostenlos z. B. mit:

* **GitHub Pages** – GitHub-Konto anlegen, neues Repository, Inhalt von `WebApp` hochladen,
  unter *Settings → Pages* einschalten.
* **Netlify** oder **Cloudflare Pages** – Konto anlegen, den Ordner `WebApp` in das Browserfenster ziehen.

Danach auf dem iPhone:

1. Die Adresse in **Safari** öffnen.
2. Unten auf **Teilen** (□↑) tippen → **„Zum Home-Bildschirm“**.
3. Fertig – das Icon „Mosaik Afrika“ startet das Spiel im Vollbild.

## Gut zu wissen

* **Spielstände** liegen nur auf dem jeweiligen Gerät (im Browser-Speicher). Beim Verlassen der App wird automatisch gesichert.
  Wer sicher gehen will: im Menü *Spiel sichern → Als Datei* eine Kopie speichern.
* Wenn du die App **vom Home-Bildschirm löschst**, sind auch die Spielstände weg.
* **Updates:** neue Dateien hochladen – die App holt sich beim nächsten Start mit Internet die neue Fassung.
* **Sicherheit:** Die Seite lädt nichts von fremden Servern, sendet keine Daten und sperrt fremde Skripte
  (Content-Security-Policy). Geladene Spielstand-Dateien werden vor dem Öffnen geprüft.
* **Test-Modus:** `index.html?demo` startet sofort eine Partie, `?demo&move` öffnet zusätzlich das Angriffs-Fenster.
