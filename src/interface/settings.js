// settings.js — settings page logic
// Extraído do settings.html porque Manifest V3 bloqueia scripts inline (CSP)

const providerRadios = document.querySelectorAll('input[name="provider"]');
const fieldGroups = {
  claude: document.getElementById('fieldClaude'),
  openai: document.getElementById('fieldOpenai'),
  gemini: document.getElementById('fieldGemini'),
};
const keyClaude    = document.getElementById('keyClaude');
const keyOpenai    = document.getElementById('keyOpenai');
const keyGemini    = document.getElementById('keyGemini');
const keyGithub    = document.getElementById('keyGithub');
const btnSave      = document.getElementById('btnSave');
const saveConfirm  = document.getElementById('saveConfirm');
const btnBack      = document.getElementById('btnBack');

// ── Load saved settings ────────────────────────────────────────────────
async function loadSettings() {
  const data = await chrome.storage.sync.get([
    'provider', 'keyClaude', 'keyOpenai', 'keyGemini', 'keyGithub'
  ]);
  const provider = data.provider || 'claude';
  document.querySelector(`input[value="${provider}"]`).checked = true;
  if (data.keyClaude) keyClaude.value = data.keyClaude;
  if (data.keyOpenai) keyOpenai.value = data.keyOpenai;
  if (data.keyGemini) keyGemini.value = data.keyGemini;
  if (data.keyGithub) keyGithub.value = data.keyGithub;
  highlightActiveProvider(provider);
}

// ── Highlight active provider field ───────────────────────────────────
function highlightActiveProvider(active) {
  Object.entries(fieldGroups).forEach(([key, el]) => {
    el.classList.toggle('active-provider', key === active);
  });
  document.querySelectorAll('.provider-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.provider === active);
  });
}

providerRadios.forEach(r => {
  r.addEventListener('change', () => highlightActiveProvider(r.value));
});

// ── Save ──────────────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  const provider = document.querySelector('input[name="provider"]:checked')?.value || 'claude';
  await chrome.storage.sync.set({
    provider,
    keyClaude:  keyClaude.value.trim(),
    keyOpenai:  keyOpenai.value.trim(),
    keyGemini:  keyGemini.value.trim(),
    keyGithub:  keyGithub.value.trim(),
  });
  btnSave.classList.add('saved');
  saveConfirm.textContent = '✓ Salvo!';
  saveConfirm.className   = 'save-confirm visible';
  setTimeout(() => {
    btnSave.classList.remove('saved');
    saveConfirm.className = 'save-confirm';
  }, 2500);
});

// ── Show/hide password toggles ────────────────────────────────────────
document.querySelectorAll('.toggle-vis').forEach(btn => {
  btn.addEventListener('click', () => {
    const inp = document.getElementById(btn.dataset.target);
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
});

// ── Back button ───────────────────────────────────────────────────────
btnBack.addEventListener('click', e => {
  e.preventDefault();
  window.close();
});

loadSettings();
