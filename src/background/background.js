/**
 * smart-diff · src/background/background.js
 *
 * Service worker principal (Manifest V3).
 * Orquestra mensagens entre content script e os módulos de API.
 */

import { getPRFiles, buildDiffText } from './apis/github.js';
import { analyzeWithAI } from './apis/ai-router.js';

// Caracteres máximos de diff por bloco enviado à IA
const MAX_CHARS_PER_CHUNK = 15_000;

// Pausa entre blocos para não estourar rate limit (ms)
const CHUNK_DELAY_MS = 4_000;

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'FETCH_AND_ANALYZE') {
    const tabId = sender.tab?.id;
    handleFetchAndAnalyze(message.payload, tabId)
      .then(result => sendResponse({ success: true,  data: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// ── Core orchestration ────────────────────────────────────────────────────────

async function handleFetchAndAnalyze({ owner, repo, prNumber }, tabId) {
  const settings = await chrome.storage.sync.get([
    'provider', 'keyClaude', 'keyOpenai', 'keyGemini', 'keyGithub'
  ]);

  const provider    = settings.provider   || 'claude';
  const githubToken = settings.keyGithub  || '';
  const aiKeyMap    = {
    claude: settings.keyClaude || '',
    openai: settings.keyOpenai || '',
    gemini: settings.keyGemini || '',
  };
  const aiKey = aiKeyMap[provider] || '';

  if (!aiKey) {
    throw new Error(
      `API Key do provedor "${provider}" não configurada. Abra as configurações da extensão e adicione a chave.`
    );
  }

  const { files, tooLarge, total } = await getPRFiles(owner, repo, prNumber, githubToken);

  if (!files || files.length === 0) {
    throw new Error('Esta PR não possui arquivos alterados ou o diff não está disponível.');
  }

  const chunks = partitionFiles(files, MAX_CHARS_PER_CHUNK);
  const results = [];

  for (let i = 0; i < chunks.length; i++) {
    const label = chunks.length === 1
      ? 'Analisando…'
      : `Analisando bloco ${i + 1} de ${chunks.length}…`;

    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: 'ANALYSIS_PROGRESS', text: label }).catch(() => {});
    }

    const diffText = buildDiffText(chunks[i]);
    const analysis = await analyzeWithAI(diffText, provider, aiKey);
    results.push(analysis);

    if (i < chunks.length - 1) {
      await sleep(CHUNK_DELAY_MS);
    }
  }

  return { analysis: mergeAnalyses(results), tooLarge, fileCount: total };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Divide os arquivos em blocos respeitando o limite de caracteres por bloco.
 * Arquivos sem patch (binários etc.) são agrupados livremente.
 */
function partitionFiles(files, maxChars) {
  const chunks = [];
  let current = [];
  let currentSize = 0;

  for (const file of files) {
    const size = (file.patch || '').length + file.filename.length + 50;

    if (current.length > 0 && currentSize + size > maxChars) {
      chunks.push(current);
      current = [file];
      currentSize = size;
    } else {
      current.push(file);
      currentSize += size;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Combina os resultados de múltiplos blocos num único objeto de análise.
 * Usa o summary do primeiro bloco e une arquivos e ordem de leitura.
 */
function mergeAnalyses(results) {
  return {
    summary:       results[0].summary,
    reading_order: [...new Set(results.flatMap(r => r.reading_order || []))],
    files:         results.flatMap(r => r.files || []),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
