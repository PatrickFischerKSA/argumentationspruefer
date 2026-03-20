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
const suggestionsBox = document.getElementById('suggestionsBox');
const templatesBox = document.getElementById('templatesBox');
const spellcheckStatus = document.getElementById('spellcheckStatus');
const spellcheckBox = document.getElementById('spellcheckBox');

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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsText(file, 'utf-8');
  });
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
}

function renderSpellcheck(result) {
  const matches = Array.isArray(result.matches) ? result.matches : [];
  const extras = [];

  if (result.truncated) {
    extras.push('Der Text wurde für die Prüfung in Abschnitte aufgeteilt.');
  }

  spellcheckStatus.textContent = `${matches.length} Treffer gefunden${extras.length ? ` · ${extras.join(' ')}` : ''}`;

  if (matches.length) {
    spellcheckBox.classList.remove('empty-state');
    spellcheckBox.innerHTML = matches.map(createSpellcheckItem).join('');
  } else {
    spellcheckBox.classList.add('empty-state');
    spellcheckBox.textContent = 'Keine Rechtschreib- oder Grammatiktreffer gefunden.';
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

  const [analysisResult, spellcheckResult] = await Promise.allSettled([
    postJson('/api/argumentation-review', { text }),
    postJson('/api/languagetool-check', { text, language: 'de-CH' })
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

  if (analysisResult.status === 'fulfilled' || spellcheckResult.status === 'fulfilled') {
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
