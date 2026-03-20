# Argumentationspruefer

Ein webbasiertes Pruefungstool fuer Argumentationen mit:

- Upload fuer Textdateien
- fachlicher Argumentationsanalyse mit lokalen Heuristiken
- optionaler KI-Vertiefung ueber OpenAI
- Rechtschreib- und Grammatikpruefung in Deutschschweizer Rechtschreibung (`de-CH`) ueber LanguageTool

## Start

```bash
npm install
npm start
```

Danach ist die App unter `http://localhost:3000` erreichbar.

## Live Deployment

Das Repo ist fuer ein einfaches Deployment auf Render vorbereitet.

### Render

1. Repository auf GitHub mit Render verbinden
2. Neue Web Service aus `render.yaml` erstellen
3. In Render den Secret `OPENAI_API_KEY` setzen, falls die vertiefte KI-Analyse aktiv sein soll
4. Deploy starten

Danach ist die App ueber die von Render vergebene URL erreichbar.

## Umgebungsvariablen

- `OPENAI_API_KEY` oder `OPENAI_API_KEY_DEFAULT`: optional fuer die vertiefte KI-Analyse
- `OPENAI_MODEL`: optional, Standard ist `gpt-4o-mini`
- `LANGUAGETOOL_BASE_URL`: optional, Standard ist `https://api.languagetool.org/v2/check`
- `PORT`: optional, Standard ist `3000`

## Upload

Direkt unterstuetzt werden `.txt`, `.md`, `.html` und `.htm`.
Andere Formate koennen per Copy/Paste eingefuegt werden.

## Dateien fuer Deployment

- `.env.example`: Vorlage fuer lokale Konfiguration
- `render.yaml`: Render-Konfiguration fuer die Live-Bereitstellung
