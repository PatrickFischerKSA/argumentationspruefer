const path = require('path');
const fs = require('fs');
const express = require('express');
const mammoth = require('mammoth');

loadEnvFile(path.join(__dirname, '.env.local'));
loadEnvFile(path.join(__dirname, '.env'));

const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'argumentationspruefer',
    keyConfigured: Boolean(resolveApiKey()),
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    languageToolBaseUrl: process.env.LANGUAGETOOL_BASE_URL || 'https://api.languagetool.org/v2/check',
    locale: 'de-CH'
  });
});

app.post('/api/argumentation-review', async (req, res) => {
  const text = normalizeInputText(req.body?.text);

  if (text.length < 120) {
    return res.status(400).json({
      error: 'Bitte einen Text mit mindestens 120 Zeichen hochladen oder einfuegen.'
    });
  }

  const heuristic = analyzeArgumentation(text);
  const apiKey = resolveApiKey();
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  let ai = {
    available: Boolean(apiKey),
    used: false,
    error: apiKey ? '' : 'Kein OpenAI-Key konfiguriert. Es wird nur die lokale Analyse angezeigt.'
  };

  if (apiKey) {
    try {
      ai = await createAiArgumentationReview({ text, heuristic, apiKey, model });
    } catch (error) {
      ai = {
        available: true,
        used: false,
        error: error.message || 'Die KI-Analyse konnte nicht geladen werden.'
      };
    }
  }

  return res.json({
    ok: true,
    heuristic,
    ai,
    meta: {
      keyConfigured: Boolean(apiKey),
      model,
      locale: 'de-CH'
    }
  });
});

app.post('/api/languagetool-check', async (req, res) => {
  const text = normalizeInputText(req.body?.text);
  const language = typeof req.body?.language === 'string' ? req.body.language : 'de-CH';

  if (!text) {
    return res.status(400).json({ error: 'Es wurde kein Text zum Pruefen uebermittelt.' });
  }

  try {
    const result = await runLanguageToolCheck(text, { language });
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(502).json({
      error: 'LanguageTool-Pruefung fehlgeschlagen.',
      details: error.message || 'Unbekannter Fehler'
    });
  }
});

app.post('/api/extract-document', async (req, res) => {
  const fileName = typeof req.body?.fileName === 'string' ? req.body.fileName : '';
  const mimeType = typeof req.body?.mimeType === 'string' ? req.body.mimeType : '';
  const base64 = typeof req.body?.base64 === 'string' ? req.body.base64 : '';

  if (!base64) {
    return res.status(400).json({ error: 'Es wurde keine Datei uebermittelt.' });
  }

  const extension = path.extname(fileName).toLowerCase();

  if (extension === '.doc') {
    return res.status(415).json({
      error: 'Das alte Word-Format .doc wird noch nicht unterstuetzt. Bitte als .docx speichern und erneut hochladen.'
    });
  }

  if (
    extension !== '.docx' &&
    mimeType !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return res.status(415).json({ error: 'Nur .docx-Dateien koennen hier als Word-Datei verarbeitet werden.' });
  }

  try {
    const buffer = Buffer.from(base64, 'base64');
    const extracted = await mammoth.extractRawText({ buffer });
    const text = normalizeInputText(extracted.value || '');

    if (!text) {
      return res.status(422).json({
        error: 'Aus der Word-Datei konnte kein lesbarer Text extrahiert werden.'
      });
    }

    return res.json({
      ok: true,
      text
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Die Word-Datei konnte nicht verarbeitet werden.',
      details: error.message || 'Unbekannter Fehler'
    });
  }
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const idx = trimmed.indexOf('=');
    if (idx < 1) return;

    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

function resolveApiKey() {
  return process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY_DEFAULT || '';
}

function normalizeInputText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMarkerOccurrences(text, markers) {
  return markers.reduce((sum, marker) => {
    const regex = new RegExp(`\\b${escapeRegExp(marker)}\\b`, 'gi');
    const matches = text.match(regex);
    return sum + (matches ? matches.length : 0);
  }, 0);
}

function splitWords(text) {
  return text.match(/[A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]+(?:-[A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]+)*/g) || [];
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function scoreStatus(score) {
  if (score >= 75) return 'stark';
  if (score >= 50) return 'solide';
  return 'ausbaufaehig';
}

function analyzeArgumentation(text) {
  const lowerText = text.toLowerCase();
  const paragraphs = text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean);
  const sentences = splitSentences(text);
  const words = splitWords(text);

  const thesisMarkers = [
    'ich bin der meinung',
    'meiner meinung nach',
    'ich finde',
    'ich behaupte',
    'meine these',
    'es ist klar',
    'ich vertrete die auffassung',
    'meines erachtens'
  ];
  const reasonMarkers = [
    'weil',
    'denn',
    'da',
    'deshalb',
    'daher',
    'folglich',
    'somit',
    'zum einen',
    'zum anderen',
    'erstens',
    'zweitens',
    'darum'
  ];
  const evidenceMarkers = [
    'zum beispiel',
    'beispielsweise',
    'etwa',
    'laut',
    'studie',
    'statistik',
    'zahl',
    'zahlen',
    'beleg',
    'quelle'
  ];
  const counterMarkers = [
    'allerdings',
    'jedoch',
    'andererseits',
    'hingegen',
    'zwar',
    'obwohl',
    'dennoch',
    'trotzdem',
    'einwand',
    'gegenargument'
  ];
  const conclusionMarkers = [
    'zusammenfassend',
    'abschliessend',
    'abschließend',
    'fazit',
    'insgesamt',
    'schlussendlich',
    'darum zeigt sich',
    'somit laesst sich'
  ];
  const appealMarkers = [
    'wir sollten',
    'man sollte',
    'deshalb sollten wir',
    'es ist noetig',
    'es braucht',
    'ich fordere',
    'darum muss'
  ];

  const firstPart = paragraphs.slice(0, Math.max(1, Math.ceil(paragraphs.length / 3))).join(' ');
  const lastPart = paragraphs.slice(-Math.max(1, Math.ceil(paragraphs.length / 3))).join(' ');

  const thesisCount = countMarkerOccurrences(lowerText, thesisMarkers);
  const reasonCount = countMarkerOccurrences(lowerText, reasonMarkers);
  const evidenceCount =
    countMarkerOccurrences(lowerText, evidenceMarkers) +
    (text.match(/\d+(?:[.,]\d+)?\s?(?:%|prozent|million(?:en)?|milliarden?)/gi) || []).length +
    (text.match(/[„"][^„”"]{8,}[”"]/g) || []).length;
  const counterCount = countMarkerOccurrences(lowerText, counterMarkers);
  const conclusionCount = countMarkerOccurrences(lastPart.toLowerCase(), conclusionMarkers);
  const appealCount = countMarkerOccurrences(lowerText, appealMarkers);
  const connectorCount = reasonCount + counterCount + conclusionCount;

  const avgSentenceLength = sentences.length ? words.length / sentences.length : 0;
  const avgParagraphLength = paragraphs.length ? words.length / paragraphs.length : words.length;
  const rhetoricalQuestions = (text.match(/\?/g) || []).length;
  const exclamations = (text.match(/!/g) || []).length;

  const structureScore = clamp(
    30 + Math.min(paragraphs.length, 6) * 8 + Math.min(connectorCount, 6) * 5 + (conclusionCount > 0 ? 12 : 0),
    0,
    100
  );
  const thesisScore = clamp(
    25 + Math.min(thesisCount, 3) * 18 + Math.min(countMarkerOccurrences(firstPart.toLowerCase(), thesisMarkers), 2) * 12,
    0,
    100
  );
  const evidenceScore = clamp(18 + Math.min(evidenceCount, 5) * 15, 0, 100);
  const counterScore = clamp(15 + Math.min(counterCount, 4) * 18, 0, 100);
  const languageScore = clamp(
    45 +
      (avgSentenceLength >= 11 && avgSentenceLength <= 24 ? 22 : avgSentenceLength <= 32 ? 10 : -8) +
      Math.min(rhetoricalQuestions, 2) * 8 +
      Math.min(exclamations, 1) * 4 +
      Math.min(appealCount, 3) * 7,
    0,
    100
  );
  const coherenceScore = clamp(
    28 +
      Math.min(reasonCount, 6) * 9 +
      Math.min(connectorCount, 5) * 7 +
      (avgParagraphLength >= 45 && avgParagraphLength <= 140 ? 8 : 0),
    0,
    100
  );

  const categories = [
    {
      id: 'these',
      label: 'These und Position',
      score: thesisScore,
      status: scoreStatus(thesisScore),
      observation:
        thesisScore >= 75
          ? 'Die zentrale Position ist gut erkennbar und frueh im Text verankert.'
          : thesisScore >= 50
            ? 'Eine Position ist erkennbar, koennte aber noch deutlicher und frueher formuliert werden.'
            : 'Die Hauptthese bleibt zu implizit oder erscheint erst spaet im Text.',
      advice:
        'Formuliere zu Beginn einen klaren Leitsatz, auf den sich die folgenden Abschnitte sichtbar beziehen.'
    },
    {
      id: 'begruendung',
      label: 'Begruendung und Logik',
      score: coherenceScore,
      status: scoreStatus(coherenceScore),
      observation:
        coherenceScore >= 75
          ? 'Die Gedankenschritte greifen gut ineinander und werden sprachlich verbunden.'
          : coherenceScore >= 50
            ? 'Die Argumentation ist grundsaetzlich nachvollziehbar, wirkt aber stellenweise sprunghaft.'
            : 'Zwischen den Aussagen fehlen verbindende Begruendungen oder klare Uebergaenge.',
      advice:
        'Nutze mehr kausale und folgernde Verknuepfungen wie "weil", "daher" oder "folglich", um Schlussketten sichtbarer zu machen.'
    },
    {
      id: 'belege',
      label: 'Belege und Beispiele',
      score: evidenceScore,
      status: scoreStatus(evidenceScore),
      observation:
        evidenceScore >= 75
          ? 'Mehrere Beispiele oder Belege stuetzen die Aussagen ueberzeugend ab.'
          : evidenceScore >= 50
            ? 'Es gibt einzelne Beispiele, doch einige Behauptungen bleiben noch unbelegt.'
            : 'Wichtige Aussagen stehen weitgehend ohne Beispiel, Quelle oder konkreten Fall da.',
      advice:
        'Ergaenze kritische Aussagen mit einem Beispiel, einer Zahl oder einem klar benannten Einzelfall.'
    },
    {
      id: 'gegenargument',
      label: 'Gegenargumente und Differenzierung',
      score: counterScore,
      status: scoreStatus(counterScore),
      observation:
        counterScore >= 75
          ? 'Der Text nimmt Einwaende auf und differenziert die eigene Position sichtbar.'
          : counterScore >= 50
            ? 'Ansaetze zur Differenzierung sind vorhanden, koennten aber expliziter ausgebaut werden.'
            : 'Der Text bleibt einseitig und setzt sich kaum mit moeglichen Einwaenden auseinander.',
      advice:
        'Baue mindestens ein Gegenargument ein und entkraefte es anschliessend mit einer klaren Gewichtung.'
    },
    {
      id: 'aufbau',
      label: 'Aufbau und Schluss',
      score: structureScore,
      status: scoreStatus(structureScore),
      observation:
        structureScore >= 75
          ? 'Die Gliederung traegt den Gedankengang, und der Schluss buendelt das Ergebnis gut.'
          : structureScore >= 50
            ? 'Der Aufbau funktioniert, koennte aber mit markanterem Schluss und klareren Abschnitten gewinnen.'
            : 'Der Text braucht eine deutlichere Gliederung mit Einleitung, Mittelteil und Schluss.',
      advice:
        'Setze auf eine klare Dreiteilung: Ausgangsthese, argumentative Entfaltung, buendelndes Fazit.'
    },
    {
      id: 'sprache',
      label: 'Sprachliche Wirkung',
      score: languageScore,
      status: scoreStatus(languageScore),
      observation:
        languageScore >= 75
          ? 'Der Stil wirkt adressatenbezogen und unterstuetzt die Ueberzeugungskraft des Textes.'
          : languageScore >= 50
            ? 'Die Sprache ist brauchbar, koennte aber praeziser und wirkungsbewusster eingesetzt werden.'
            : 'Der Stil bleibt noch zu allgemein oder monoton, um stark zu ueberzeugen.',
      advice:
        'Schaerfe Schluesselbegriffe und setze pointierte Formulierungen gezielt statt zu oft ein.'
    }
  ];

  const strengths = categories
    .filter((entry) => entry.score >= 70)
    .map((entry) => `${entry.label}: ${entry.observation}`);

  const suggestions = categories
    .filter((entry) => entry.score < 70)
    .sort((a, b) => a.score - b.score)
    .slice(0, 4)
    .map((entry) => `${entry.label}: ${entry.advice}`);

  const overallScore = Math.round(
    thesisScore * 0.2 +
      coherenceScore * 0.25 +
      evidenceScore * 0.2 +
      counterScore * 0.15 +
      structureScore * 0.1 +
      languageScore * 0.1
  );

  return {
    overallScore,
    verdict:
      overallScore >= 80
        ? 'Die Argumentation wirkt bereits ueberzeugend und gut strukturiert.'
        : overallScore >= 60
          ? 'Die Argumentation ist tragfaehig, hat aber noch Ausbaupotenzial bei Praezision und Absicherung.'
          : 'Die Grundidee ist erkennbar, braucht aber klarere Struktur und belastbarere Begruendungen.',
    stats: {
      characters: text.length,
      words: words.length,
      sentences: sentences.length,
      paragraphs: paragraphs.length,
      averageSentenceLength: Number(avgSentenceLength.toFixed(1)),
      rhetoricalQuestions
    },
    signals: {
      thesisMarkers: thesisCount,
      reasonMarkers: reasonCount,
      evidenceMarkers: evidenceCount,
      counterMarkers: counterCount,
      conclusionMarkers: conclusionCount
    },
    categories,
    strengths: strengths.length ? strengths : ['Der Text verfolgt bereits eine erkennbare argumentative Absicht.'],
    suggestions,
    rewriteTemplates: buildRewriteTemplates({
      thesisScore,
      evidenceScore,
      counterScore,
      structureScore
    })
  };
}

function buildRewriteTemplates(scores) {
  const templates = [];

  if (scores.thesisScore < 70) {
    templates.push({
      label: 'These schaerfen',
      text: 'Meine zentrale These lautet: ..., weil ... und weil ... .'
    });
  }

  if (scores.evidenceScore < 70) {
    templates.push({
      label: 'Beleg ergaenzen',
      text: 'Das zeigt sich zum Beispiel an ..., denn dort wird deutlich, dass ... .'
    });
  }

  if (scores.counterScore < 70) {
    templates.push({
      label: 'Gegenargument einbauen',
      text: 'Zwar koennte man einwenden, dass ... , dennoch ueberzeugt dieses Argument weniger, weil ... .'
    });
  }

  if (scores.structureScore < 70) {
    templates.push({
      label: 'Schluss formulieren',
      text: 'Abschliessend zeigt sich, dass ... . Deshalb ist ... ueberzeugender als ... .'
    });
  }

  if (!templates.length) {
    templates.push({
      label: 'Stil verdichten',
      text: 'Entscheidend ist nicht nur ..., sondern vor allem ..., weil dadurch ... sichtbar wird.'
    });
  }

  return templates;
}

async function createAiArgumentationReview({ text, heuristic, apiKey, model }) {
  const excerpt = text.length > 12000 ? `${text.slice(0, 12000)}\n\n[Text gekuerzt]` : text;
  const prompt = `
Du bist eine praezise, konstruktive Deutschlehrperson.
Analysiere die folgende Argumentation auf Deutsch (Schweizer Standardsprache).
Nutze die heuristischen Vorbefunde nur als Orientierung, nicht als Wahrheit.
Antworte ausschliesslich als JSON ohne Markdown.

Schema:
{
  "available": true,
  "used": true,
  "summary": "2-3 Saetze",
  "strengths": ["..."],
  "improvements": ["..."],
  "line_edits": [
    {
      "before": "kurzer problematischer Ausschnitt",
      "after": "verbesserte Formulierung",
      "why": "kurze Begruendung"
    }
  ]
}

Heuristik:
${JSON.stringify(heuristic, null, 2)}

Text:
${excerpt}
  `.trim();

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'user',
          content: [{ type: 'input_text', text: prompt }]
        }
      ],
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    const details = (await response.text()).slice(0, 1200);
    throw new Error(`KI-Analyse fehlgeschlagen: ${details}`);
  }

  const data = await response.json();
  const outputText =
    data.output_text ||
    (Array.isArray(data.output) && data.output[0]?.content?.[0]?.text) ||
    '';

  let parsed;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error('Die KI-Antwort war kein gueltiges JSON.');
  }

  return {
    available: true,
    used: true,
    summary: String(parsed.summary || ''),
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
    improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
    lineEdits: Array.isArray(parsed.line_edits) ? parsed.line_edits.slice(0, 5) : []
  };
}

function buildLanguageToolChunks(text, maxLength = 18000) {
  if (text.length <= maxLength) {
    return [{ text, start: 0 }];
  }

  const chunks = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + maxLength, text.length);

    if (end < text.length) {
      const paragraphBreak = text.lastIndexOf('\n\n', end);
      const sentenceBreak = text.lastIndexOf('. ', end);
      const boundary = Math.max(paragraphBreak, sentenceBreak);
      if (boundary > start + 2000) {
        end = boundary + (boundary === paragraphBreak ? 2 : 1);
      }
    }

    chunks.push({
      text: text.slice(start, end),
      start
    });
    start = end;
  }

  return chunks.slice(0, 8);
}

async function runLanguageToolCheck(text, options = {}) {
  const baseUrl = process.env.LANGUAGETOOL_BASE_URL || 'https://api.languagetool.org/v2/check';
  const language = options.language || 'de-CH';
  const chunks = buildLanguageToolChunks(text);
  const matches = [];

  for (const chunk of chunks) {
    const payload = new URLSearchParams({
      text: chunk.text,
      language
    });

    const response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        Accept: 'application/json'
      },
      body: payload.toString()
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 1000);
      throw new Error(`HTTP ${response.status}: ${details || response.statusText}`);
    }

    const data = await response.json();
    const chunkMatches = Array.isArray(data.matches) ? data.matches : [];

    chunkMatches.forEach((match) => {
      matches.push({
        message: match.message || 'Hinweis',
        shortMessage: match.shortMessage || '',
        offset: Number(match.offset || 0) + chunk.start,
        length: Number(match.length || 0),
        replacements: Array.isArray(match.replacements)
          ? match.replacements.slice(0, 4).map((entry) => entry.value).filter(Boolean)
          : [],
        sentence: match.sentence || '',
        context: match.context || null,
        rule: {
          id: match.rule?.id || '',
          description: match.rule?.description || ''
        },
        category: {
          id: match.rule?.category?.id || '',
          name: match.rule?.category?.name || ''
        },
        issueType: match.rule?.issueType || ''
      });
    });
  }

  matches.sort((a, b) => a.offset - b.offset);

  return {
    language,
    baseUrl,
    chunkCount: chunks.length,
    matchCount: matches.length,
    truncated: text.length > chunks.reduce((sum, chunk) => sum + chunk.text.length, 0),
    matches: matches.slice(0, 80)
  };
}

module.exports = {
  app,
  analyzeArgumentation,
  runLanguageToolCheck,
  buildLanguageToolChunks,
  normalizeInputText
};

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Argumentationspruefer läuft auf http://localhost:${port}`);
  });
}
