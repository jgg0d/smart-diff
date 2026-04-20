/**
 * smart-diff · src/content/dom-injector.js
 *
 * Toda a manipulação do DOM do GitHub:
 * - Injeta badges coloridas acima de cada arquivo
 * - Renderiza o painel de sumário com ordem de leitura
 * - Remove injeções anteriores (re-análise)
 *
 * Seletores atualizados para o markup do GitHub 2025/2026.
 * Estrutura real capturada do DOM:
 *
 *   div[class*="diffEntry"]
 *     └── div[class*="diffHeaderWrapper"]
 *           └── div[class*="diff-file-header"]
 *                 └── h3[class*="file-name"]
 *                       └── a.Link--primary > code  ← nome do arquivo
 */

// ── IDs para limpeza ──────────────────────────────────────────────────────────
const PANEL_ID = 'sd-summary-panel';
const BADGE_CLASS = 'sd-file-header';
const LOADING_BAR_ID = 'sd-loading-bar';

// ── Category → color map ──────────────────────────────────────────────────────
const CAT_COLORS = {
  'refatoração': '#3b82f6',
  'lógica de negócio': '#f59e0b',
  'correção de bug': '#ef4444',
  'estilo/formatação': '#6b7280',
  'testes': '#22c55e',
  'configuração': '#8b5cf6',
  'segurança': '#f97316',
  'outro': '#94a3b8',
};

// ── Estado interno ────────────────────────────────────────────────────────────
let _observer = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function injectAnalysis(analysis, meta = {}) {
  removeExisting();

  if (meta.tooLarge) {
    injectWarning(
      `⚠️ Esta PR tem ${meta.fileCount}+ arquivos. Apenas os primeiros 100 foram analisados.`
    );
  }

  injectSummaryPanel(analysis);
  injectFileBadges(analysis.files || []);
}

export function showLoadingBar() {
  removeLoadingBar();
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.id = LOADING_BAR_ID;
  wrap.className = 'sd-loading-wrap';
  wrap.innerHTML = `
    <div class="sd-loading-track"></div>
    <span class="sd-loading-label" id="sd-loading-label">Iniciando análise…</span>
  `;
  anchor.parentElement.insertBefore(wrap, anchor);
}

export function updateLoadingText(text) {
  const label = document.getElementById('sd-loading-label');
  if (label) label.textContent = text;
}

export function removeLoadingBar() {
  document.getElementById(LOADING_BAR_ID)?.remove();
}

export function injectError(message) {
  removeExisting();
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const el = document.createElement('div');
  el.className = 'sd-error';
  el.id = PANEL_ID;
  el.textContent = `Smart Diff — ${message}`;
  anchor.parentElement.insertBefore(el, anchor);
}

// ── Private helpers ───────────────────────────────────────────────────────────

function removeExisting() {
  stopObserver();
  document.getElementById(PANEL_ID)?.remove();
  document.querySelectorAll('.' + BADGE_CLASS).forEach(el => el.remove());
  removeLoadingBar();
}

function injectSummaryPanel(analysis) {
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const panel = document.createElement('div');
  panel.id = PANEL_ID;
  panel.className = 'sd-panel';

  panel.innerHTML = `
    <div class="sd-panel-header">
      <div class="sd-panel-title">
        <span class="sd-panel-logo">⟨/⟩</span>
        Smart Diff — Análise Semântica
      </div>
      <button class="sd-panel-close" id="sd-close-btn" title="Fechar painel">×</button>
    </div>
    <div class="sd-panel-body">
      <p class="sd-summary-text">${escapeHtml(analysis.summary || '')}</p>
      ${buildReadingOrderHTML(analysis.reading_order || [])}
    </div>
  `;

  anchor.parentElement.insertBefore(panel, anchor);
  panel.querySelector('#sd-close-btn')?.addEventListener('click', () => panel.remove());
}

/**
 * Injeta badges em todos os arquivos presentes no DOM e inicia
 * MutationObserver para arquivos carregados progressivamente.
 */
function injectFileBadges(files) {
  if (!files.length) return;

  const fileMap = new Map(files.map(f => [f.filename, f]));

  injectBadgesNow(fileMap);
  startObserver(fileMap);
}

/**
 * Percorre todos os containers de arquivo no DOM atual e injeta badges.
 * Suporta o markup novo (2025/2026) e o markup legado do GitHub.
 */
function injectBadgesNow(fileMap) {
  // ── Markup novo (GitHub 2025/2026) ──────────────────────────────────────
  // Cada arquivo: div[class*="diffEntry"]
  // Nome do arquivo: a.Link--primary (ou code dentro dele)
  document.querySelectorAll('[class*="diffEntry"]').forEach(entry => {
    if (entry.querySelector('.' + BADGE_CLASS)) return; // já tem badge

    const path = extractPathNewMarkup(entry);
    if (!path) return;

    const fileData = fuzzyFindFile(path, fileMap);
    if (!fileData) return;

    const headerWrap = entry.querySelector('[class*="diffHeaderWrapper"]');
    const badge = buildBadgeElement(fileData);

    if (headerWrap) {
      headerWrap.insertAdjacentElement('beforebegin', badge);
    } else {
      entry.insertAdjacentElement('afterbegin', badge);
    }
  });

  // ── Markup legado ────────────────────────────────────────────────────────
  // Fallback para repos que ainda usam o markup antigo
  document.querySelectorAll('.file[data-path], [data-tagsearch-path].file-header, .js-details-container > .file').forEach(fileEl => {
    tryInjectBadgeOnElement(fileEl, fileMap);
  });

  document.querySelectorAll('[data-path]').forEach(el => {
    tryInjectBadgeOnElement(el.closest('.file') || el, fileMap);
  });

  document.querySelectorAll('.file-header').forEach(header => {
    const pathEl = header.querySelector('[data-path], .link-gray-dark, a[title]');
    if (!pathEl) return;

    const filename = pathEl.getAttribute('data-path') ||
      pathEl.getAttribute('title') ||
      pathEl.textContent.trim();

    const fileData = fuzzyFindFile(filename, fileMap);
    if (fileData && !header.previousElementSibling?.classList.contains(BADGE_CLASS)) {
      const badge = buildBadgeElement(fileData);
      header.parentElement.insertBefore(badge, header);
    }
  });
}

/**
 * Extrai o caminho do arquivo a partir de um diffEntry do markup novo.
 * Remove caracteres invisíveis (LRM/RLM) que o GitHub injeta no texto.
 */
function extractPathNewMarkup(entry) {
  const link = entry.querySelector('a.Link--primary');
  if (link) {
    const code = link.querySelector('code');
    const raw = (code ? code.textContent : link.textContent) || '';
    const clean = raw.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim();
    if (clean) return clean;
  }
  // Fallback: qualquer code dentro do file-name
  const code = entry.querySelector('[class*="file-name"] code');
  if (code) return code.textContent?.replace(/[\u200e\u200f\u202a-\u202e]/g, '').trim() || null;

  return null;
}

/**
 * MutationObserver para diff carregado progressivamente ao rolar.
 */
function startObserver(fileMap) {
  stopObserver();

  const root = document.querySelector(
    '[class*="PullRequestDiffsList"], #files, .js-diff-progressive-container'
  );
  if (!root) return;

  let timer = null;
  _observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => injectBadgesNow(fileMap), 300);
  });

  _observer.observe(root, { childList: true, subtree: true });
}

function stopObserver() {
  _observer?.disconnect();
  _observer = null;
}

/**
 * Tenta injetar badge num elemento de arquivo (markup legado).
 */
function tryInjectBadgeOnElement(fileEl, fileMap) {
  if (!fileEl) return;
  if (fileEl.previousElementSibling?.classList.contains(BADGE_CLASS)) return;

  const path = fileEl.getAttribute('data-path') ||
    fileEl.querySelector('[data-path]')?.getAttribute('data-path') ||
    fileEl.querySelector('.link-gray-dark')?.textContent?.trim() ||
    fileEl.querySelector('a[title]')?.getAttribute('title');

  if (!path) return;

  const fileData = fuzzyFindFile(path, fileMap);
  if (!fileData) return;

  const badge = buildBadgeElement(fileData);
  fileEl.parentElement.insertBefore(badge, fileEl);
}

/**
 * Busca fuzzy: match exato → normalização de barras → sufixo.
 */
function fuzzyFindFile(path, fileMap) {
  if (!path) return null;

  if (fileMap.has(path)) return fileMap.get(path);

  const normalized = path.replace(/\\/g, '/').replace(/^\//, '');
  if (fileMap.has(normalized)) return fileMap.get(normalized);

  for (const [key, val] of fileMap.entries()) {
    if (key.endsWith('/' + normalized) || normalized.endsWith('/' + key) || key === normalized) {
      return val;
    }
  }

  return null;
}

function buildBadgeElement(fileData) {
  const wrapper = document.createElement('div');
  wrapper.className = BADGE_CLASS + ' sd-file-header';

  const cat = fileData.category || 'outro';
  const color = CAT_COLORS[cat] || fileData.color || '#94a3b8';

  const badge = document.createElement('span');
  badge.className = 'sd-badge';
  badge.dataset.cat = cat;
  badge.dataset.description = fileData.description || '';

  badge.innerHTML = `
    <span class="sd-badge-dot" style="background:${color}"></span>
    ${escapeHtml(cat)}
  `;

  wrapper.appendChild(badge);
  return wrapper;
}

function buildReadingOrderHTML(readingOrder) {
  if (!readingOrder.length) return '';

  const items = readingOrder
    .map((file, i) => `
      <li class="sd-reading-item">
        <span class="sd-reading-num">${i + 1}.</span>
        <span class="sd-reading-file">${escapeHtml(file)}</span>
      </li>
    `)
    .join('');

  return `
    <div class="sd-reading-section">
      <span class="sd-reading-label">Ordem de leitura sugerida</span>
      <ul class="sd-reading-list">${items}</ul>
    </div>
  `;
}

function injectWarning(message) {
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const el = document.createElement('div');
  el.className = 'sd-warning';
  el.textContent = `Smart Diff — ${message}`;
  anchor.parentElement.insertBefore(el, anchor);
}

/**
 * Encontra o melhor ponto de ancoragem para inserir o painel.
 * Suporta tanto o markup novo quanto o legado.
 */
function findSummaryAnchor() {
  const selectors = [
    '[class*="PullRequestDiffsList"]',
    '#files',
    '.js-diff-progressive-container',
    '.pr-toolbar',
    '.diffbar',
    '#files_bucket',
    '.repository-content',
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }

  return null;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}