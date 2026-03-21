const fileInput = document.getElementById('fileInput');
const sampleButton = document.getElementById('sampleButton');
const analyzeButton = document.getElementById('analyzeButton');
const textInput = document.getElementById('textInput');
const fileMeta = document.getElementById('fileMeta');
const statusBadge = document.getElementById('statusBadge');
const textStats = document.getElementById('textStats');
const scoreRing = document.getElementById('scoreRing');
const scoreValue = document.getElementById('scoreValue');
const summaryText = document.getElementById('summaryText');
const categoryGrid = document.getElementById('categoryGrid');
const prioritiesBox = document.getElementById('prioritiesBox');
const suggestionsBox = document.getElementById('suggestionsBox');
const templatesBox = document.getElementById('templatesBox');
const spellcheckStatus = document.getElementById('spellcheckStatus');
const spellcheckBox = document.getElementById('spellcheckBox');
const literatureStatus = document.getElementById('literatureStatus');
const literatureBox = document.getElementById('literatureBox');
const paragraphBox = document.getElementById('paragraphBox');
const quoteBox = document.getElementById('quoteBox');
const sentenceBox = document.getElementById('sentenceBox');
const styleBox = document.getElementById('styleBox');

const SAMPLE_TEXT = `Viele Schulen diskutieren derzeit, ob Handys im Unterricht grundsätzlich verboten werden sollen. Meiner Meinung nach wäre ein vollständiges Verbot zwar einfach umzusetzen, aber pädagogisch zu kurz gedacht. Einerseits lenken Smartphones ab, weil Nachrichten, Spiele und soziale Medien die Konzentration schwächen. Andererseits sind digitale Geräte längst Teil des Alltags und damit auch Teil schulischer Bildung.

Zum Beispiel können Schülerinnen und Schüler mit dem Handy schnell Begriffe nachschlagen, Umfragen durchführen oder Ergebnisse dokumentieren. Wenn Lehrpersonen klare Regeln setzen, lässt sich diese Nutzung sinnvoll steuern. Laut verschiedenen Schulversuchen verbessert sich die Mitarbeit oft dann, wenn digitale Werkzeuge gezielt in Lernphasen eingebaut werden.

Zwar könnte man einwenden, dass nicht alle Jugendlichen verantwortungsvoll mit ihren Geräten umgehen. Dennoch überzeugt dieses Gegenargument nur teilweise, denn genau deshalb muss Schule den reflektierten Umgang mit digitalen Medien einüben. Ein pauschales Verbot löst das Problem nicht, sondern verschiebt es bloss.

Abschliessend zeigt sich, dass Schulen nicht in erster Linie Handys verbieten, sondern ihren Einsatz klug regeln sollten. So lernen Jugendliche, Technik verantwortungsvoll und zielgerichtet zu nutzen.`;

function setStatus(kind, text) {
  statusBadge.className = `status-badge ${kind}`;
  statusBadge.textContent = text;
}

function updateTextStats() {
  const text = normalizeText(textInput.value);
  const words = (text.match(/[A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]+(?:-[A-Za-zÀ-ÖØ-öø-ÿÄÖÜäöüß]+)*/g) || []).length;
  const sentences = text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((entry) => entry.trim())
    .filter(Boolean).length;
  const paragraphs = text.split(/\n\s*\n/).map((entry) => entry.trim()).filter(Boolean).length;

  textStats.innerHTML = `
    <span>${words} Wörter</span>
    <span>${sentences} Sätze</span>
    <span>${paragraphs} Absätze</span>
  `;
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function setScore(score) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  scoreValue.textContent = String(Math.round(safeScore));
  scoreRing.style.background = `
    radial-gradient(circle at center, #fffaf1 0 56%, transparent 57%),
    conic-gradient(#a6402d 0deg, #e0b25c ${safeScore * 3.6}deg, rgba(31, 26, 22, 0.1) ${safeScore * 3.6}deg)
  `;
}

function createCategoryItem(category) {
  return `
    <article class="category-item">
      <strong>${escapeHtml(category.label)} · ${Math.round(category.score)}</strong>
      <p>${escapeHtml(category.observation)}</p>
      <span class="category-pill ${escapeClassName(category.status)}">${escapeHtml(category.status)}</span>
    </article>
  `;
}

function createStackItem(title, text) {
  return `
    <article class="stack-item">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </article>
  `;
}

function createTemplateItem(template) {
  return `
    <article class="template-item">
      <strong>${escapeHtml(template.label)}</strong>
      <p>${escapeHtml(template.text)}</p>
    </article>
  `;
}

function createPriorityItem(item) {
  return `
    <article class="priority-item ${escapeClassName(item.severity || 'low')}">
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.action || '')}</p>
      <div class="meta-line">Priorität: ${escapeHtml(item.severity || 'niedrig')}</div>
      <div class="evidence-line">${escapeHtml(item.reason || '')}</div>
    </article>
  `;
}

function createParagraphItem(item) {
  return `
    <article class="stack-item">
      <strong>Abschnitt ${item.index} · ${escapeHtml(item.role)}</strong>
      <p>${escapeHtml(item.diagnosis)}</p>
      <div class="meta-line">${escapeHtml(item.revisionGoal)}</div>
      <div class="evidence-line">${escapeHtml(item.snippet || '')}</div>
    </article>
  `;
}

function createSentenceWorkItem(item) {
  return `
    <article class="stack-item">
      <strong>${escapeHtml(item.issue)}</strong>
      <p>${escapeHtml(item.revisionGoal)}</p>
      <div class="meta-line">${escapeHtml(item.suggestion)}</div>
      <div class="evidence-line">${escapeHtml(item.original)}</div>
    </article>
  `;
}

function createQuoteItem(item) {
  return `
    <article class="stack-item">
      <strong>${escapeHtml(item.label)}</strong>
      <p>${escapeHtml(item.diagnosis)}</p>
      <div class="evidence-line">${escapeHtml(item.sentence || '')}</div>
    </article>
  `;
}

function createSpellcheckItem(match) {
  const replacements = Array.isArray(match.replacements) ? match.replacements : [];
  return `
    <article class="stack-item">
      <strong>${escapeHtml(match.message || 'Hinweis')}</strong>
      <p>${escapeHtml(match.rule?.description || match.category?.name || 'Rechtschreib- oder Grammatikhinweis')}</p>
      ${match.sentence ? `<div class="spell-snippet">${escapeHtml(match.sentence)}</div>` : ''}
      ${
        replacements.length
          ? `<div class="replacement-list">${replacements
              .map((entry) => `<span class="replacement">${escapeHtml(entry)}</span>`)
              .join('')}</div>`
          : ''
      }
    </article>
  `;
}

function createLiteratureItem(entry) {
  const matched = entry.matchedSource || {};
  const links = Array.isArray(entry.links) ? entry.links : [];
  const issues = Array.isArray(entry.issues) ? entry.issues.filter(Boolean) : [];
  const matchedLine = [matched.title, matched.author, matched.year].filter(Boolean).join(' | ');

  return `
    <article class="priority-item ${escapeClassName(mapReferenceSeverity(entry.status))}">
      <strong>${escapeHtml(entry.raw || 'Referenz')}</strong>
      <p>Status: ${escapeHtml(entry.status || 'unsicher')} · Score: ${escapeHtml(String(entry.score || 0))}</p>
      ${matchedLine ? `<div class="meta-line">${escapeHtml(matchedLine)}</div>` : ''}
      ${issues.length ? `<div class="evidence-line">${escapeHtml(issues.join(' '))}</div>` : ''}
      ${
        links.length
          ? `<div class="meta-line">${links
              .slice(0, 2)
              .map((link) => `<a href="${escapeAttribute(link)}" target="_blank" rel="noreferrer">${escapeHtml(link)}</a>`)
              .join(' · ')}</div>`
          : ''
      }
    </article>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeClassName(value) {
  return String(value || '')
    .replace(/[^\wäöüÄÖÜß-]/g, '')
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/Ä/g, 'A')
    .replace(/Ö/g, 'O')
    .replace(/Ü/g, 'U')
    .replace(/ß/g, 'ss');
}

async function readUploadedFile(file) {
  const lowerName = String(file?.name || '').toLowerCase();
  const supportedTextExtensions = ['.txt', '.md', '.text', '.html', '.htm'];
  const isDocx =
    lowerName.endsWith('.docx') ||
    file?.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const isSupportedTextFile = supportedTextExtensions.some((extension) => lowerName.endsWith(extension));

  if (lowerName.endsWith('.doc') && !isDocx) {
    throw new Error('Bitte die Word-Datei zuerst als .docx speichern und dann erneut hochladen.');
  }

  if (isDocx) {
    const arrayBuffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const response = await postJson('/api/extract-document', {
      fileName: file.name,
      mimeType: file.type,
      base64
    });
    return String(response.text || '');
  }

  if (!isSupportedTextFile) {
    throw new Error('Unterstützt werden derzeit .txt, .md, .html und .docx.');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsText(file, 'utf-8');
  });
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }

  return window.btoa(binary);
}

async function postJson(path, payload) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const text = await response.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: text || `HTTP ${response.status}` };
  }

  if (!response.ok) {
    throw new Error(data.details || data.error || `HTTP ${response.status}`);
  }

  return data;
}

function renderArgumentation(result) {
  const heuristic = result.heuristic || {};
  const ai = result.ai || {};
  const categories = Array.isArray(heuristic.categories) ? heuristic.categories : [];
  const suggestions = [];
  const priorities = Array.isArray(heuristic.priorityActions) ? heuristic.priorityActions : [];
  const paragraphFeedback = Array.isArray(heuristic.structureMap?.paragraphFeedback)
    ? heuristic.structureMap.paragraphFeedback
    : [];
  const quoteAnalysis = heuristic.quoteAnalysis || {};
  const quoteFindings = Array.isArray(quoteAnalysis.findings) ? quoteAnalysis.findings : [];
  const sentenceWork = Array.isArray(heuristic.sentenceWork) ? heuristic.sentenceWork : [];
  const styleAlerts = Array.isArray(heuristic.styleAlerts) ? heuristic.styleAlerts : [];

  (heuristic.suggestions || []).forEach((entry) => {
    suggestions.push({ title: 'Heuristischer Hinweis', text: entry });
  });

  (ai.improvements || []).forEach((entry) => {
    suggestions.push({ title: 'KI-Verbesserung', text: entry });
  });

  if (ai.error) {
    suggestions.push({ title: 'KI-Status', text: ai.error });
  }

  categoryGrid.innerHTML = categories.map(createCategoryItem).join('');
  setScore(heuristic.overallScore || 0);

  const summaryParts = [heuristic.verdict];
  if (ai.summary) summaryParts.push(ai.summary);
  summaryText.textContent = summaryParts.filter(Boolean).join(' ');

  if (suggestions.length) {
    suggestionsBox.classList.remove('empty-state');
    suggestionsBox.innerHTML = suggestions
      .slice(0, 7)
      .map((entry) => createStackItem(entry.title, entry.text))
      .join('');
  } else {
    suggestionsBox.classList.add('empty-state');
    suggestionsBox.textContent = 'Keine zusätzlichen Vorschläge vorhanden.';
  }

  if (priorities.length) {
    prioritiesBox.classList.remove('empty-state');
    prioritiesBox.innerHTML = priorities.map(createPriorityItem).join('');
  } else {
    prioritiesBox.classList.add('empty-state');
    prioritiesBox.textContent = 'Keine priorisierten Arbeitsschritte vorhanden.';
  }

  const templates = [
    ...(heuristic.rewriteTemplates || []),
    ...((ai.lineEdits || []).map((entry) => ({
      label: entry.why || 'Überarbeitung',
      text: `${entry.before || 'Ausgangssatz'} -> ${entry.after || 'Verbesserung'}`
    })))
  ];

  if (templates.length) {
    templatesBox.classList.remove('empty-state');
    templatesBox.innerHTML = templates.slice(0, 6).map(createTemplateItem).join('');
  } else {
    templatesBox.classList.add('empty-state');
    templatesBox.textContent = 'Keine Formulierungshilfen vorhanden.';
  }

  if (paragraphFeedback.length) {
    paragraphBox.classList.remove('empty-state');
    paragraphBox.innerHTML = paragraphFeedback.map(createParagraphItem).join('');
  } else {
    paragraphBox.classList.add('empty-state');
    paragraphBox.textContent = 'Keine Abschnittsdiagnose vorhanden.';
  }

  if (quoteFindings.length || quoteAnalysis.observation) {
    quoteBox.classList.remove('empty-state');
    const header = quoteAnalysis.observation
      ? createStackItem(
          'Überblick',
          `${quoteAnalysis.observation} ${quoteAnalysis.advice || ''} Wörtlich: ${
            quoteAnalysis.literalCount || 0
          }, sinngemäss: ${quoteAnalysis.paraphraseCount || 0}.`
        )
      : '';
    quoteBox.innerHTML = `${header}${quoteFindings.map(createQuoteItem).join('')}`;
  } else {
    quoteBox.classList.add('empty-state');
    quoteBox.textContent = 'Keine besondere Zitatarbeit erkannt.';
  }

  if (sentenceWork.length) {
    sentenceBox.classList.remove('empty-state');
    sentenceBox.innerHTML = sentenceWork.map(createSentenceWorkItem).join('');
  } else {
    sentenceBox.classList.add('empty-state');
    sentenceBox.textContent = 'Keine Satzdiagnose vorhanden.';
  }

  if (styleAlerts.length) {
    styleBox.classList.remove('empty-state');
    styleBox.innerHTML = styleAlerts
      .map((entry) => createStackItem(entry.title, `${entry.evidence} ${entry.advice}`))
      .join('');
  } else {
    styleBox.classList.add('empty-state');
    styleBox.textContent = 'Keine auffälligen Stilprobleme erkannt.';
  }
}

function renderSpellcheck(result) {
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const extras = [];
  const summary = result.summary || {};

  if (result.truncated) {
    extras.push('Der Text wurde für die Prüfung in Abschnitte aufgeteilt.');
  }

  const topCategories = Array.isArray(summary.topCategories) ? summary.topCategories : [];
  const summaryTextParts = [];

  if (summary.quickFeedback) summaryTextParts.push(summary.quickFeedback);
  if (topCategories.length) {
    summaryTextParts.push(
      `Häufigste Kategorien: ${topCategories
        .map((entry) => `${entry.name} (${entry.count})`)
        .join(', ')}`
    );
  }
  if (extras.length) summaryTextParts.push(extras.join(' '));

  spellcheckStatus.textContent = `${matches.length} Treffer gefunden. ${summaryTextParts.join(' ')}`.trim();

  if (matches.length) {
    spellcheckBox.classList.remove('empty-state');
    spellcheckBox.innerHTML = matches.map(createSpellcheckItem).join('');
  } else {
    spellcheckBox.classList.add('empty-state');
    spellcheckBox.textContent = 'Keine Rechtschreib- oder Grammatiktreffer gefunden.';
  }
}

function mapReferenceSeverity(status) {
  if (status === 'verifiziert') return 'low';
  if (status === 'wahrscheinlich korrekt') return 'low';
  if (status === 'unsicher') return 'medium';
  return 'high';
}

function renderLiterature(result) {
  const references = Array.isArray(result.references) ? result.references : [];
  const summary = result.summary || {};
  const topSourceTypes = Array.isArray(summary.topSourceTypes) ? summary.topSourceTypes : [];

  const summaryParts = [];
  if (summary.quickFeedback) summaryParts.push(summary.quickFeedback);
  summaryParts.push(
      `Verifiziert: ${summary.verified || 0}, wahrscheinlich korrekt: ${summary.probable || 0}, unsicher: ${summary.uncertain || 0}, nicht bestätigt: ${summary.unverified || 0}.`
  );
  if (topSourceTypes.length) {
    summaryParts.push(
      `Trefferquellen: ${topSourceTypes.map((entry) => `${entry.name} (${entry.count})`).join(', ')}`
    );
  }

  literatureStatus.textContent = summaryParts.join(' ');

  if (references.length) {
    literatureBox.classList.remove('empty-state');
    literatureBox.innerHTML = references.map(createLiteratureItem).join('');
  } else {
    literatureBox.classList.add('empty-state');
    literatureBox.textContent = 'Keine auswertbaren Literaturhinweise erkannt.';
  }
}

async function handleAnalyze() {
  const text = normalizeText(textInput.value);
  updateTextStats();

  if (text.length < 120) {
    setStatus('error', 'Zu kurz');
    summaryText.textContent = 'Bitte füge einen längeren argumentativen Text ein oder lade eine Datei hoch.';
    return;
  }

  analyzeButton.disabled = true;
  setStatus('loading', 'Prüfe');
  summaryText.textContent = 'Die Analyse läuft. Argumentation und Rechtschreibung werden parallel ausgewertet.';
  spellcheckStatus.textContent = 'Rechtschreibprüfung läuft ...';
  literatureStatus.textContent = 'Literaturprüfung läuft ...';

  const [analysisResult, spellcheckResult, literatureResult] = await Promise.allSettled([
    postJson('/api/argumentation-review', { text }),
    postJson('/api/languagetool-check', { text, language: 'de-CH' }),
    postJson('/api/literature-check', { text })
  ]);

  if (analysisResult.status === 'fulfilled') {
    renderArgumentation(analysisResult.value);
  } else {
    summaryText.textContent =
      analysisResult.reason?.message || 'Die Argumentationsanalyse konnte nicht durchgeführt werden.';
  }

  if (spellcheckResult.status === 'fulfilled') {
    renderSpellcheck(spellcheckResult.value);
  } else {
    spellcheckStatus.textContent =
      spellcheckResult.reason?.message || 'Die Rechtschreibprüfung konnte nicht geladen werden.';
    spellcheckBox.classList.add('empty-state');
    spellcheckBox.textContent = 'Keine LanguageTool-Treffer verfügbar.';
  }

  if (literatureResult.status === 'fulfilled') {
    renderLiterature(literatureResult.value);
  } else {
    literatureStatus.textContent =
      literatureResult.reason?.message || 'Die Literaturverifikation konnte nicht geladen werden.';
    literatureBox.classList.add('empty-state');
    literatureBox.textContent = 'Keine Literaturtreffer verfügbar.';
  }

  if (
    analysisResult.status === 'fulfilled' ||
    spellcheckResult.status === 'fulfilled' ||
    literatureResult.status === 'fulfilled'
  ) {
    setStatus('success', 'Fertig');
  } else {
    setStatus('error', 'Fehler');
  }

  analyzeButton.disabled = false;
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const content = await readUploadedFile(file);
    textInput.value = content;
    fileMeta.textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
    updateTextStats();
    setStatus('neutral', 'Geladen');
  } catch (error) {
    setStatus('error', 'Uploadfehler');
    fileMeta.textContent = error.message || 'Datei konnte nicht verarbeitet werden.';
  }
});

sampleButton.addEventListener('click', () => {
  textInput.value = SAMPLE_TEXT;
  fileMeta.textContent = 'Beispieltext geladen.';
  updateTextStats();
  setStatus('neutral', 'Bereit');
});

analyzeButton.addEventListener('click', handleAnalyze);
textInput.addEventListener('input', updateTextStats);

setScore(0);
updateTextStats();
