// popup.js — interacts with background service worker
// Extraído do popup.html porque Manifest V3 bloqueia scripts inline (CSP)

const btnAnalyze   = document.getElementById('btnAnalyze');
const btnSettings  = document.getElementById('btnSettings');
const btnLabel     = document.getElementById('btnLabel');
const btnLoader    = document.getElementById('btnLoader');
const statusDot    = document.getElementById('statusDot');
const statusLabel  = document.getElementById('statusLabel');
const prInfo       = document.getElementById('prInfo');
const prNumber     = document.getElementById('prNumber');
const prTitle      = document.getElementById('prTitle');
const providerChip = document.getElementById('providerChip');
const feedback     = document.getElementById('feedback');

const PROVIDER_LABELS = { claude: 'Claude', openai: 'ChatGPT', gemini: 'Gemini' };

// ── Init ──────────────────────────────────────────────────────────────────
async function init() {
  // Load saved provider
  const { provider = 'claude' } = await chrome.storage.sync.get('provider');
  providerChip.textContent = PROVIDER_LABELS[provider] || provider;
  providerChip.dataset.provider = provider;

  // Detect active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const prMatch = tab?.url?.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);

  if (prMatch) {
    statusDot.className  = 'status-dot on-pr';
    statusLabel.textContent = 'Página de PR detectada';
    prInfo.style.display = 'flex';
    prNumber.textContent = prMatch[3];
    prTitle.textContent  = decodeURIComponent(tab.title?.split('·')[0]?.trim() || '—');
    btnAnalyze.disabled  = false;
  } else {
    statusDot.className  = 'status-dot no-pr';
    statusLabel.textContent = 'Nenhuma PR aberta';
    btnAnalyze.disabled  = true;
  }
}

// ── Analyze ───────────────────────────────────────────────────────────────
btnAnalyze.addEventListener('click', async () => {
  setLoading(true);
  showFeedback('', '');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const response = await sendToContentScript(tab.id, { action: 'ANALYZE_PR' });

    if (response?.success) {
      setLoading(false);
      showFeedback('Análise concluída! Os badges foram injetados na página.', 'success');
      btnLabel.textContent = 'Reanalisar PR';
    } else {
      throw new Error(response?.error || 'Erro desconhecido');
    }
  } catch (err) {
    setLoading(false);
    showFeedback('Erro: ' + (err.message || 'Falha na comunicação com a página.'), 'error');
  }
});

// ── Settings ──────────────────────────────────────────────────────────────
btnSettings.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/interface/settings.html') });
});

// ── Helpers ───────────────────────────────────────────────────────────────
function setLoading(on) {
  btnAnalyze.disabled = on;
  btnLabel.style.display  = on ? 'none' : 'inline';
  btnLoader.style.display = on ? 'flex' : 'none';
}

function showFeedback(msg, type) {
  feedback.textContent     = msg;
  feedback.className       = `feedback ${type}`;
  feedback.style.display   = msg ? 'block' : 'none';
}

// ── Content script bridge ─────────────────────────────────────────────────
async function sendToContentScript(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (err) {
    if (!err.message?.includes('Receiving end does not exist')) throw err;

    // Content script não estava carregado (aba aberta antes da extensão).
    // Injeta programaticamente e tenta de novo.
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/content/content.js'],
    });

    await new Promise(r => setTimeout(r, 400));
    return chrome.tabs.sendMessage(tabId, message);
  }
}

init();
