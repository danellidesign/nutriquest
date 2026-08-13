# NutriQuest

NutriQuest ist eine webbasierte Single-Page-Applikation für gamifiziertes Ernährungstracking. 
Das Projekt umfasst eine Client-Server-Architektur mit eingebetteter SQLite-Datenbank, zustandsloser JWT-Authentifizierung und der Anbindung an die externe Open Food Facts API.

## Systemvoraussetzungen

* Node.js (v14 oder höher)
* npm
* Moderner Webbrowser
* Für den Barcode-Scanner: Integrierte Webcam oder Smartphone-Kamera

## Installation und Start

1. **Abhängigkeiten installieren:**
   Im Hauptverzeichnis des Projekts folgenden Befehl ausführen:
   ```bash
   npm install
   ```
   
2. **Backend-Server starten:**
   Entwicklungsserver starten. Die SQLite-DB wird beim ersten Start automatisch initialisiert:
   ```bash
   npx ts-node src/backend/server.ts
   ```

3. **Webbrowser öffnen und zu http://localhost:3000 navigieren**