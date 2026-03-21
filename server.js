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

app.post('/api/literature-check', async (req, res) => {
  const text = normalizeInputText(req.body?.text);

  if (!text) {
    return res.status(400).json({ error: 'Es wurde kein Text zur Literaturpruefung uebermittelt.' });
  }

  try {
    const result = await runLiteratureCheck(text);
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(502).json({
      error: 'Literaturverifikation fehlgeschlagen.',
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
  const paragraphData = paragraphs.map((paragraph, index) => ({
    index,
    text: paragraph,
    lower: paragraph.toLowerCase(),
    words: splitWords(paragraph).length
  }));

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
  const fillerMarkers = [
    'irgendwie',
    'sozusagen',
    'eigentlich',
    'ein bisschen',
    'gewissermassen',
    'halt',
    'quasi',
    'natuerlich'
  ];
  const emphasisMarkers = [
    'sehr',
    'extrem',
    'wirklich',
    'offensichtlich',
    'klar',
    'eindeutig'
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
  const fillerCount = countMarkerOccurrences(lowerText, fillerMarkers);
  const emphasisCount = countMarkerOccurrences(lowerText, emphasisMarkers);
  const passiveCount = countPassivePatterns(text);
  const nominalizationCount = countNominalizations(words);
  const repeatedWords = findRepeatedKeywords(words);
  const sentenceDiagnostics = analyzeSentences(sentences);
  const paragraphDiagnostics = analyzeParagraphs(paragraphData, {
    thesisMarkers,
    reasonMarkers,
    evidenceMarkers,
    counterMarkers,
    conclusionMarkers
  });
  const audienceScore = clamp(
    35 +
      Math.min(appealCount, 3) * 12 +
      Math.min(rhetoricalQuestions, 2) * 8 +
      (sentenceDiagnostics.longSentenceCount <= 2 ? 10 : 0),
    0,
    100
  );

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
    },
    {
      id: 'adressat',
      label: 'Adressatenfuehrung',
      score: audienceScore,
      status: scoreStatus(audienceScore),
      observation:
        audienceScore >= 75
          ? 'Der Text fuehrt Lesende klar und wirkt argumentativ gut ausgerichtet.'
          : audienceScore >= 50
            ? 'Der Text ist ansprechbar, koennte aber die Leserfuehrung sichtbarer machen.'
            : 'Der Text bleibt zu allgemein und fuehrt die Lesenden noch zu wenig durch die Argumentation.',
      advice:
        'Markiere staerker, warum ein Gedankenschritt fuer die Lesenden wichtig ist und wohin er fuehrt.'
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

  const styleAlerts = buildStyleAlerts({
    repeatedWords,
    fillerCount,
    emphasisCount,
    passiveCount,
    nominalizationCount,
    sentenceDiagnostics
  });
  const priorityActions = buildPriorityActions({
    categories,
    paragraphDiagnostics,
    sentenceDiagnostics,
    styleAlerts
  });
  const sentenceWork = buildSentenceWork(sentences, sentenceDiagnostics);

  const overallScore = Math.round(
    thesisScore * 0.2 +
      coherenceScore * 0.25 +
      evidenceScore * 0.2 +
      counterScore * 0.15 +
      structureScore * 0.1 +
      languageScore * 0.05 +
      audienceScore * 0.05
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
      conclusionMarkers: conclusionCount,
      passivePatterns: passiveCount,
      nominalizations: nominalizationCount,
      fillerMarkers: fillerCount
    },
    categories,
    strengths: strengths.length ? strengths : ['Der Text verfolgt bereits eine erkennbare argumentative Absicht.'],
    suggestions,
    priorityActions,
    structureMap: {
      introDetected: paragraphDiagnostics.introDetected,
      conclusionDetected: paragraphDiagnostics.conclusionDetected,
      paragraphFeedback: paragraphDiagnostics.feedback
    },
    sentenceWork,
    styleAlerts,
    languageHeuristics: {
      repeatedWords,
      fillerCount,
      emphasisCount,
      passiveCount,
      nominalizationCount,
      longSentenceCount: sentenceDiagnostics.longSentenceCount
    },
    rewriteTemplates: buildRewriteTemplates({
      thesisScore,
      evidenceScore,
      counterScore,
      structureScore,
      languageScore
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

  if (scores.languageScore < 70) {
    templates.push({
      label: 'Begruendung praezisieren',
      text: 'Dieses Argument ueberzeugt vor allem deshalb, weil ... und dadurch ... deutlich wird.'
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

function countPassivePatterns(text) {
  const matches = text.match(/\b(?:wird|werden|wurde|wurden|worden)\s+[A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]+(?:t|en)\b/gi);
  return matches ? matches.length : 0;
}

function countNominalizations(words) {
  return words.filter((word) => /(?:ung|keit|heit|tion|ismus|tät)$/i.test(word)).length;
}

function findRepeatedKeywords(words) {
  const stopwords = new Set([
    'und', 'oder', 'aber', 'doch', 'denn', 'weil', 'dass', 'das', 'die', 'der', 'dem', 'den',
    'ein', 'eine', 'einer', 'einem', 'einen', 'ist', 'sind', 'war', 'waren', 'wie', 'mit',
    'auch', 'nicht', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'wenn', 'dann', 'man', 'wir',
    'sie', 'ich', 'du', 'er', 'es', 'zu', 'im', 'in', 'am', 'an', 'auf', 'fuer', 'für', 'von',
    'des', 'so', 'als', 'bei', 'aus', 'einerseits', 'andererseits', 'dies', 'diese', 'dieser'
  ]);

  const counts = new Map();
  words.forEach((raw) => {
    const word = raw.toLowerCase();
    if (word.length < 5 || stopwords.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([word, count]) => ({ word, count }));
}

function analyzeSentences(sentences) {
  const diagnostics = sentences.map((sentence, index) => {
    const wordCount = splitWords(sentence).length;
    const lower = sentence.toLowerCase();
    const hasWeakStart = /^(ich finde|man sieht|es ist|es gibt|ich denke|meiner meinung nach)/i.test(sentence);
    const hasEnumeration = /\b(?:erstens|zweitens|drittens|zum einen|zum anderen)\b/i.test(sentence);
    const hasQuote = /["„].+["”]/.test(sentence);
    const issueHints = [];

    if (wordCount >= 30) issueHints.push('zu lang');
    if (wordCount <= 5) issueHints.push('zu kurz');
    if (hasWeakStart) issueHints.push('schwacher Einstieg');
    if (lower.includes('weil') && !/[,:;]/.test(sentence) && wordCount >= 24) issueHints.push('verschachtelt');

    return {
      index,
      sentence,
      wordCount,
      hasWeakStart,
      hasEnumeration,
      hasQuote,
      issueHints
    };
  });

  return {
    diagnostics,
    longSentenceCount: diagnostics.filter((entry) => entry.wordCount >= 30).length,
    shortSentenceCount: diagnostics.filter((entry) => entry.wordCount <= 5).length,
    weakStartCount: diagnostics.filter((entry) => entry.hasWeakStart).length
  };
}

function analyzeParagraphs(paragraphData, markerConfig) {
  const feedback = paragraphData.map((paragraph, index) => {
    const role = determineParagraphRole(index, paragraphData.length, paragraph.lower, markerConfig);
    const markerCounts = {
      thesis: countMarkerOccurrences(paragraph.lower, markerConfig.thesisMarkers),
      reasons: countMarkerOccurrences(paragraph.lower, markerConfig.reasonMarkers),
      evidence: countMarkerOccurrences(paragraph.lower, markerConfig.evidenceMarkers),
      counter: countMarkerOccurrences(paragraph.lower, markerConfig.counterMarkers),
      conclusion: countMarkerOccurrences(paragraph.lower, markerConfig.conclusionMarkers)
    };

    let diagnosis = 'Der Abschnitt erfuellt seine Funktion grundsaetzlich.';
    let revisionGoal = 'Abschnitt sprachlich weiter zuspitzen.';

    if (role === 'einleitung' && markerCounts.thesis === 0) {
      diagnosis = 'Die Einleitung fuehrt ins Thema ein, markiert die Kernthese aber noch zu wenig deutlich.';
      revisionGoal = 'In der Einleitung einen klaren Leitsatz oder Standpunkt benennen.';
    } else if (role === 'hauptteil' && markerCounts.reasons === 0) {
      diagnosis = 'Im Hauptteil fehlt hier eine sichtbare Begruendung oder Ueberleitung.';
      revisionGoal = 'Kausale Verknuepfung oder Begruendungssatz ergaenzen.';
    } else if (role === 'hauptteil' && markerCounts.evidence === 0 && paragraph.words >= 55) {
      diagnosis = 'Der Abschnitt behauptet viel, liefert aber noch wenig Konkretion.';
      revisionGoal = 'Beispiel, Zahl, Beobachtung oder Quelle einfuegen.';
    } else if (role === 'schluss' && markerCounts.conclusion === 0) {
      diagnosis = 'Der Schluss wirkt noch offen und buendelt das Ergebnis nicht klar genug.';
      revisionGoal = 'Fazit markieren und die Hauptaussage pointiert abschliessen.';
    } else if (paragraph.words >= 120) {
      diagnosis = 'Der Abschnitt ist sehr dicht und koennte fuer Lesende leichter gefuehrt werden.';
      revisionGoal = 'Abschnitt teilen oder einen klaren Schlusssatz setzen.';
    }

    return {
      index: index + 1,
      role,
      snippet: paragraph.text.slice(0, 160),
      diagnosis,
      revisionGoal,
      markerCounts
    };
  });

  return {
    introDetected: feedback.some((entry) => entry.role === 'einleitung'),
    conclusionDetected: feedback.some((entry) => entry.role === 'schluss'),
    feedback
  };
}

function determineParagraphRole(index, total, lowerParagraph, markerConfig) {
  if (index === 0) return 'einleitung';
  if (index === total - 1) return 'schluss';
  if (countMarkerOccurrences(lowerParagraph, markerConfig.conclusionMarkers) > 0) return 'schluss';
  return 'hauptteil';
}

function buildStyleAlerts(data) {
  const alerts = [];

  if (data.repeatedWords.length) {
    const top = data.repeatedWords[0];
    alerts.push({
      title: 'Wortwiederholung',
      evidence: `Das Wort "${top.word}" taucht ${top.count} Mal auf.`,
      advice: 'Pruefe Synonyme oder fasse Wiederholungen zusammen, wenn sie nicht bewusst gesetzt sind.'
    });
  }

  if (data.fillerCount >= 2) {
    alerts.push({
      title: 'Fuellwoerter',
      evidence: `${data.fillerCount} eher weiche Formulierungen machen die Aussage unpraeziser.`,
      advice: 'Streiche Fuellwoerter oder ersetze sie durch konkrete Aussagen.'
    });
  }

  if (data.passiveCount >= 2) {
    alerts.push({
      title: 'Passivformen',
      evidence: `${data.passiveCount} Passivkonstruktionen koennen die Aussagekraft abschwaechen.`,
      advice: 'Wo moeglich aktiv formulieren: Wer handelt? Wer begruendet?'
    });
  }

  if (data.nominalizationCount >= 8) {
    alerts.push({
      title: 'Nominalstil',
      evidence: 'Der Text nutzt mehrere abstrakte Hauptwoerter auf -ung, -keit oder -tion.',
      advice: 'Pruefe, ob sich manche Stellen mit starken Verben direkter formulieren lassen.'
    });
  }

  if (data.sentenceDiagnostics.longSentenceCount >= 2) {
    alerts.push({
      title: 'Lange Saetze',
      evidence: `${data.sentenceDiagnostics.longSentenceCount} Saetze sind sehr lang.`,
      advice: 'Teile besonders verschachtelte Saetze in Hauptaussage und Begruendung auf.'
    });
  }

  return alerts;
}

function buildPriorityActions(data) {
  const actions = [];
  const weakestCategories = [...data.categories]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3);

  weakestCategories.forEach((category) => {
    actions.push({
      title: category.label,
      severity: category.score < 45 ? 'hoch' : category.score < 65 ? 'mittel' : 'niedrig',
      reason: category.observation,
      action: category.advice
    });
  });

  const paragraphNeed = data.paragraphDiagnostics.feedback.find((entry) =>
    entry.diagnosis !== 'Der Abschnitt erfuellt seine Funktion grundsaetzlich.'
  );
  if (paragraphNeed) {
    actions.push({
      title: `Abschnitt ${paragraphNeed.index} ueberarbeiten`,
      severity: 'mittel',
      reason: paragraphNeed.diagnosis,
      action: paragraphNeed.revisionGoal
    });
  }

  if (data.styleAlerts[0]) {
    actions.push({
      title: data.styleAlerts[0].title,
      severity: 'niedrig',
      reason: data.styleAlerts[0].evidence,
      action: data.styleAlerts[0].advice
    });
  }

  return actions.slice(0, 5);
}

function buildSentenceWork(sentences, diagnostics) {
  const entries = [];

  diagnostics.diagnostics.forEach((entry) => {
    if (!entry.issueHints.length || entries.length >= 4) return;

    let revisionGoal = 'Satz praezisieren.';
    let suggestion = 'Formuliere die Hauptaussage zuerst und fuehre die Begruendung anschliessend aus.';

    if (entry.issueHints.includes('zu lang')) {
      revisionGoal = 'Satz aufteilen und Lesefluss verbessern.';
      suggestion = 'Teile den Satz an der staerksten gedanklichen Zäsur in zwei Aussagen.';
    } else if (entry.issueHints.includes('schwacher Einstieg')) {
      revisionGoal = 'Mit einer konkreten Aussage statt mit einer Vorformel starten.';
      suggestion = 'Beginne direkt mit der Behauptung oder Beobachtung statt mit "Ich finde ..."';
    } else if (entry.issueHints.includes('zu kurz')) {
      revisionGoal = 'Satz inhaltlich staerker anbinden.';
      suggestion = 'Ergaenze, warum diese Aussage fuer die Argumentation wichtig ist.';
    }

    entries.push({
      original: entry.sentence,
      issue: entry.issueHints.join(', '),
      revisionGoal,
      suggestion
    });
  });

  return entries;
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
    summary: summarizeLanguageToolMatches(matches),
    matches: matches.slice(0, 80)
  };
}

function summarizeLanguageToolMatches(matches) {
  const byCategory = new Map();
  const byIssueType = new Map();

  matches.forEach((match) => {
    const categoryName = match.category?.name || 'Sonstige Hinweise';
    const issueType = match.issueType || 'other';
    byCategory.set(categoryName, (byCategory.get(categoryName) || 0) + 1);
    byIssueType.set(issueType, (byIssueType.get(issueType) || 0) + 1);
  });

  const topCategories = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  const severity =
    matches.length >= 18 ? 'hoch' :
      matches.length >= 8 ? 'mittel' :
        matches.length > 0 ? 'niedrig' : 'keine';

  return {
    severity,
    topCategories,
    issueTypes: Object.fromEntries(byIssueType),
    quickFeedback:
      matches.length === 0
        ? 'Keine auffaelligen Rechtschreib- oder Grammatiktreffer.'
        : matches.length < 6
          ? 'Nur wenige Treffer. Eine kurze gezielte Ueberarbeitung sollte genuegen.'
          : matches.length < 15
            ? 'Mehrere sprachliche Treffer. Vor der Abgabe lohnt sich eine systematische Korrekturrunde.'
            : 'Viele sprachliche Treffer. Erst die wichtigsten Fehlertypen bereinigen, dann nochmals pruefen.'
  };
}

async function runLiteratureCheck(text) {
  const references = findReferenceCandidates(text).slice(0, 12);

  if (!references.length) {
    return {
      references: [],
      summary: {
        verified: 0,
        probable: 0,
        uncertain: 0,
        unverified: 0,
        quickFeedback: 'Keine verwertbaren Literaturhinweise erkannt.',
        topSourceTypes: []
      }
    };
  }

  const results = [];
  for (const reference of references) {
    // Sequential keeps public APIs polite and avoids rate spikes.
    results.push(await verifyReference(reference));
  }

  return {
    references: results,
    summary: summarizeReferenceResults(results)
  };
}

function findReferenceCandidates(text) {
  const candidates = [];
  const seen = new Set();

  function pushCandidate(candidate) {
    const key = `${candidate.type}:${normalizeReferenceKey(candidate.raw)}`;
    if (!candidate.raw || seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  }

  const urlRegex = /\bhttps?:\/\/[^\s<>()]+/gi;
  for (const match of text.match(urlRegex) || []) {
    pushCandidate({
      raw: match,
      type: 'url',
      url: match
    });
  }

  const doiRegex = /\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/gi;
  for (const match of text.match(doiRegex) || []) {
    pushCandidate({
      raw: match,
      type: 'doi',
      doi: match
    });
  }

  const isbnRegex = /\b(?:ISBN(?:-1[03])?:?\s*)?((?:97[89][-\s]?)?\d(?:[-\s]?\d){8,16}[\dX])\b/gi;
  let isbnMatch;
  while ((isbnMatch = isbnRegex.exec(text))) {
    const normalized = normalizeIsbn(isbnMatch[1]);
    if (!normalized || (normalized.length !== 10 && normalized.length !== 13)) continue;
    pushCandidate({
      raw: isbnMatch[0],
      type: 'isbn',
      isbn: normalized
    });
  }

  const inlineReferenceRegex =
    /\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’.-]+,\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’.\s-]{1,40})[:.]\s*([^.\n]{4,140})\.\s*((?:19|20)\d{2})\b/g;
  let inlineMatch;
  while ((inlineMatch = inlineReferenceRegex.exec(text))) {
    const title = cleanInlineText(inlineMatch[2]);
    if (!looksLikeReferenceTitle(title)) continue;
    pushCandidate({
      raw: cleanInlineText(inlineMatch[0]),
      type: 'book_candidate',
      author: cleanInlineText(inlineMatch[1]),
      title,
      year: inlineMatch[3]
    });
  }

  const lines = text.split(/\n+/).map((entry) => entry.trim()).filter(Boolean);
  lines.forEach((line) => {
    const parsed = parseBibliographyLine(line);
    if (parsed) pushCandidate(parsed);
  });

  const quoteRegex = /[„"]([^"”“]{12,180})[”“"]/g;
  let quoteMatch;
  while ((quoteMatch = quoteRegex.exec(text))) {
    const title = quoteMatch[1].trim();
    if (looksLikeReferenceTitle(title)) {
      pushCandidate({
        raw: quoteMatch[0],
        type: 'title_candidate',
        title
      });
    }
  }

  return candidates;
}

function parseBibliographyLine(line) {
  if (line.length < 18 || line.length > 260) return null;
  if (/^https?:\/\//i.test(line)) return null;
  if (/https?:\/\//i.test(line) || /\b10\.\d{4,9}\//i.test(line)) return null;

  const yearMatch = line.match(/\b(19|20)\d{2}\b/);
  const hasAuthorShape = /^[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’.-]+(?:,\s*[A-ZÄÖÜ][A-Za-zÄÖÜäöüß'’.-]+)?/.test(line);
  const hasTitleMarker = /[.:]/.test(line) || /[„"].+[”“"]/.test(line);

  if (!yearMatch && !hasTitleMarker) return null;
  if (!hasAuthorShape && !/[„"].+[”“"]/.test(line)) return null;

  const quotedTitle = line.match(/[„"]([^"”“]{8,180})[”“"]/);
  let title = quotedTitle ? quotedTitle[1].trim() : '';

  if (!title) {
    const parts = line.split(/[.:]/).map((entry) => entry.trim()).filter(Boolean);
    if (parts.length >= 2) {
      title = parts[1];
    } else if (line.includes(',')) {
      const commaParts = line.split(',').map((entry) => entry.trim()).filter(Boolean);
      if (commaParts.length >= 2) title = commaParts[1];
    }
  }

  if (!title || !looksLikeReferenceTitle(title)) return null;

  const author = parseAuthorFromLine(line);

  return {
    raw: line,
    type: inferReferenceTypeFromLine(line),
    title,
    author,
    year: yearMatch ? yearMatch[0] : ''
  };
}

function parseAuthorFromLine(line) {
  const beforeTitle = line.split(/[.:]/)[0].trim();
  if (!beforeTitle || beforeTitle.split(/\s+/).length > 6) return '';
  return beforeTitle;
}

function inferReferenceTypeFromLine(line) {
  if (/\b(?:journal|zeitschrift|vol\.|nr\.|no\.|pp\.|seiten)\b/i.test(line)) return 'article_candidate';
  return 'book_candidate';
}

function looksLikeReferenceTitle(title) {
  const words = splitWords(title);
  if (!words.length || words.length > 22) return false;
  if (words.length === 1) return words[0].length >= 5;
  return true;
}

function normalizeReferenceKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s:/.-]/g, '')
    .replace(/[.;:,)\]]+$/g, '')
    .trim();
}

function normalizeIsbn(value) {
  return String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

async function verifyReference(reference) {
  try {
    if (reference.type === 'url') return await verifyUrlReference(reference);
    if (reference.type === 'doi') return await verifyDoiReference(reference);
    if (reference.type === 'isbn') return await verifyIsbnReference(reference);
    return await verifyTitleReference(reference);
  } catch (error) {
    return {
      raw: reference.raw,
      type: reference.type,
      status: 'unsicher',
      score: 35,
      matchedSource: null,
      issues: [`Verifikation abgebrochen: ${error.message || 'unbekannter Fehler'}`],
      links: []
    };
  }
}

async function verifyUrlReference(reference) {
  const response = await fetchWithTimeout(reference.url, {
    redirect: 'follow'
  });

  if (!response.ok) {
    return finalizeReference(reference, {
      score: 25,
      status: 'nicht bestaetigt',
      issues: [`URL antwortet mit HTTP ${response.status}.`]
    });
  }

  const contentType = response.headers.get('content-type') || '';
  const body = (await response.text()).slice(0, 30000);
  const titleMatch = body.match(/<title[^>]*>([^<]+)<\/title>/i);

  return finalizeReference(reference, {
    score: 94,
    status: 'verifiziert',
    matchedSource: {
      title: titleMatch ? cleanInlineText(titleMatch[1]) : '',
      sourceType: 'url',
      finalUrl: response.url,
      contentType
    },
    issues: titleMatch ? [] : ['URL erreichbar, aber Seitentitel nicht eindeutig auslesbar.'],
    links: [response.url]
  });
}

async function verifyDoiReference(reference) {
  const encodedDoi = encodeURIComponent(reference.doi);
  const response = await fetchWithTimeout(`https://api.crossref.org/works/${encodedDoi}`);
  const data = await safeJson(response);
  const item = data?.message;

  if (!item) {
    return finalizeReference(reference, {
      score: 30,
      status: 'nicht bestaetigt',
      issues: ['DOI konnte bei Crossref nicht bestaetigt werden.']
    });
  }

  return finalizeReference(reference, {
    score: 100,
    status: 'verifiziert',
    matchedSource: mapCrossrefItem(item),
    links: buildReferenceLinks({ doi: reference.doi, url: item.URL })
  });
}

async function verifyIsbnReference(reference) {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${reference.isbn}&format=json&jscmd=data`;
  const response = await fetchWithTimeout(url);
  const data = await safeJson(response);
  const item = data?.[`ISBN:${reference.isbn}`];

  if (!item) {
    return finalizeReference(reference, {
      score: 28,
      status: 'nicht bestaetigt',
      issues: ['ISBN konnte nicht bestaetigt werden.']
    });
  }

  return finalizeReference(reference, {
    score: 98,
    status: 'verifiziert',
    matchedSource: {
      title: item.title || '',
      author: Array.isArray(item.authors) ? item.authors.map((entry) => entry.name).join(', ') : '',
      year: item.publish_date || '',
      publisher: Array.isArray(item.publishers) ? item.publishers.map((entry) => entry.name).join(', ') : '',
      sourceType: 'openlibrary'
    },
    links: [item.url || `https://openlibrary.org/isbn/${reference.isbn}`].filter(Boolean)
  });
}

async function verifyTitleReference(reference) {
  const [googleItem, crossrefItem] = await Promise.allSettled([
    queryGoogleBooks(reference),
    queryCrossref(reference)
  ]);

  const candidates = [];
  if (googleItem.status === 'fulfilled' && googleItem.value) candidates.push(googleItem.value);
  if (crossrefItem.status === 'fulfilled' && crossrefItem.value) candidates.push(crossrefItem.value);

  if (!candidates.length) {
    return finalizeReference(reference, {
      score: 34,
      status: 'nicht bestaetigt',
      issues: ['Kein belastbarer Treffer in den abgefragten Literaturquellen.']
    });
  }

  const best = candidates.sort((a, b) => b.score - a.score)[0];
  const status =
    best.score >= 90 ? 'verifiziert' :
      best.score >= 70 ? 'wahrscheinlich korrekt' :
        best.score >= 45 ? 'unsicher' : 'nicht bestaetigt';

  return finalizeReference(reference, {
    score: best.score,
    status,
    matchedSource: best.matchedSource,
    issues: best.issues,
    links: best.links
  });
}

async function queryGoogleBooks(reference) {
  const queryParts = [];
  if (reference.title) queryParts.push(`intitle:${reference.title}`);
  if (reference.author) queryParts.push(`inauthor:${reference.author}`);
  const query = encodeURIComponent(queryParts.join(' ') || reference.raw);
  const response = await fetchWithTimeout(`https://www.googleapis.com/books/v1/volumes?q=${query}&maxResults=3`);
  const data = await safeJson(response);
  const items = Array.isArray(data?.items) ? data.items : [];
  if (!items.length) return null;

  const mapped = items.map((entry) => {
    const info = entry.volumeInfo || {};
    const score = scoreReferenceMatch(reference, {
      title: info.title || '',
      author: Array.isArray(info.authors) ? info.authors.join(', ') : '',
      year: String(info.publishedDate || '').slice(0, 4)
    });

    return {
      score,
      matchedSource: {
        title: info.title || '',
        author: Array.isArray(info.authors) ? info.authors.join(', ') : '',
        year: info.publishedDate || '',
        publisher: info.publisher || '',
        sourceType: 'google_books'
      },
      issues: buildReferenceIssues(reference, {
        title: info.title || '',
        author: Array.isArray(info.authors) ? info.authors.join(', ') : '',
        year: String(info.publishedDate || '').slice(0, 4)
      }),
      links: [info.infoLink || info.previewLink].filter(Boolean)
    };
  });

  return mapped.sort((a, b) => b.score - a.score)[0];
}

async function queryCrossref(reference) {
  const params = new URLSearchParams({
    rows: '3',
    query: reference.title || reference.raw
  });
  if (reference.title) params.set('query.title', reference.title);
  if (reference.author) params.set('query.author', reference.author);

  const response = await fetchWithTimeout(`https://api.crossref.org/works?${params.toString()}`);
  const data = await safeJson(response);
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];
  if (!items.length) return null;

  const mapped = items.map((item) => {
    const normalized = mapCrossrefItem(item);
    const score = scoreReferenceMatch(reference, normalized);
    return {
      score,
      matchedSource: {
        ...normalized,
        sourceType: 'crossref'
      },
      issues: buildReferenceIssues(reference, normalized),
      links: buildReferenceLinks({ doi: normalized.doi, url: normalized.url })
    };
  });

  return mapped.sort((a, b) => b.score - a.score)[0];
}

function scoreReferenceMatch(reference, candidate) {
  let score = 20;
  const titleSimilarity = computeTokenSimilarity(reference.title || reference.raw, candidate.title || '');
  score += Math.round(titleSimilarity * 45);

  if (reference.author) {
    const authorSimilarity = computeTokenSimilarity(reference.author, candidate.author || '');
    score += Math.round(authorSimilarity * 20);
  }

  if (reference.year && candidate.year) {
    score += reference.year === String(candidate.year).slice(0, 4) ? 15 : -10;
  }

  if (reference.type === 'book_candidate' && /book|books|google_books|openlibrary/.test(candidate.sourceType || '')) {
    score += 8;
  }

  if (reference.type === 'article_candidate' && /crossref/.test(candidate.sourceType || '')) {
    score += 8;
  }

  return clamp(score, 0, 100);
}

function computeTokenSimilarity(a, b) {
  const tokensA = new Set(splitWords(normalizeReferenceKey(a)));
  const tokensB = new Set(splitWords(normalizeReferenceKey(b)));
  if (!tokensA.size || !tokensB.size) return 0;

  let overlap = 0;
  tokensA.forEach((token) => {
    if (tokensB.has(token)) overlap += 1;
  });

  return overlap / Math.max(tokensA.size, tokensB.size);
}

function buildReferenceIssues(reference, candidate) {
  const issues = [];

  if (reference.title && computeTokenSimilarity(reference.title, candidate.title || '') < 0.55) {
    issues.push('Titel nur teilweise passend.');
  }

  if (reference.author && candidate.author && computeTokenSimilarity(reference.author, candidate.author) < 0.45) {
    issues.push('Autorenschaft weicht teilweise ab.');
  }

  if (reference.year && candidate.year && reference.year !== String(candidate.year).slice(0, 4)) {
    issues.push(`Jahr im Text (${reference.year}) weicht vom Treffer (${String(candidate.year).slice(0, 4)}) ab.`);
  }

  return issues;
}

function mapCrossrefItem(item) {
  return {
    title: Array.isArray(item.title) ? item.title[0] || '' : '',
    author: Array.isArray(item.author)
      ? item.author
          .map((entry) => [entry.family, entry.given].filter(Boolean).join(', '))
          .filter(Boolean)
          .join('; ')
      : '',
    year: item.issued?.['date-parts']?.[0]?.[0] ? String(item.issued['date-parts'][0][0]) : '',
    publisher: item.publisher || '',
    doi: item.DOI || '',
    url: item.URL || ''
  };
}

function buildReferenceLinks(input) {
  const links = [];
  if (input.url) links.push(input.url);
  if (input.doi) links.push(`https://doi.org/${input.doi}`);
  return [...new Set(links)];
}

function finalizeReference(reference, result) {
  return {
    raw: reference.raw,
    type: reference.type,
    status: result.status || 'unsicher',
    score: result.score || 0,
    matchedSource: result.matchedSource || null,
    issues: Array.isArray(result.issues) ? result.issues : [],
    links: Array.isArray(result.links) ? result.links : []
  };
}

function summarizeReferenceResults(results) {
  const summary = {
    verified: 0,
    probable: 0,
    uncertain: 0,
    unverified: 0,
    quickFeedback: '',
    topSourceTypes: []
  };

  const sourceTypes = new Map();

  results.forEach((result) => {
    if (result.status === 'verifiziert') summary.verified += 1;
    else if (result.status === 'wahrscheinlich korrekt') summary.probable += 1;
    else if (result.status === 'unsicher') summary.uncertain += 1;
    else summary.unverified += 1;

    const sourceType = result.matchedSource?.sourceType || result.type;
    sourceTypes.set(sourceType, (sourceTypes.get(sourceType) || 0) + 1);
  });

  summary.topSourceTypes = [...sourceTypes.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([name, count]) => ({ name, count }));

  summary.quickFeedback =
    summary.verified + summary.probable === 0
      ? 'Keine Referenz konnte belastbar bestaetigt werden.'
      : summary.unverified === 0 && summary.uncertain === 0
        ? 'Die meisten erkannten Literaturhinweise wirken bibliografisch plausibel.'
        : 'Ein Teil der Literaturhinweise ist bestaetigt, andere sollten bibliografisch nachgeschaerft werden.';

  return summary;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Number(options.timeoutMs || 9000));

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'argumentationspruefer/1.0',
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        ...(options.headers || {})
      }
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJson(response) {
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    throw new Error(`HTTP ${response.status}: ${details || response.statusText}`);
  }
  return response.json();
}

function cleanInlineText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

module.exports = {
  app,
  analyzeArgumentation,
  runLanguageToolCheck,
  runLiteratureCheck,
  findReferenceCandidates,
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
