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

## Umgebungsvariablen

- `OPENAI_API_KEY` oder `OPENAI_API_KEY_DEFAULT`: optional fuer die vertiefte KI-Analyse
- `OPENAI_MODEL`: optional, Standard ist `gpt-4o-mini`
- `LANGUAGETOOL_BASE_URL`: optional, Standard ist `https://api.languagetool.org/v2/check`
- `PORT`: optional, Standard ist `3000`

## Upload

Direkt unterstuetzt werden `.txt`, `.md`, `.html` und `.htm`.
Andere Formate koennen per Copy/Paste eingefuegt werden.
