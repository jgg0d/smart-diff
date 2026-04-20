/**
 * smart-diff · src/content/dom-injector.js
 *
 * Toda a manipulação do DOM do GitHub:
 * - Injeta badges coloridas acima de cada arquivo
 * - Renderiza o painel de sumário com ordem de leitura
 * - Remove injeções anteriores (re-análise)
 */

// ── Seletores do GitHub (atualizar se o GitHub mudar o markup) ────────────────

// Container que lista todos os arquivos na aba "Files changed"
const FILES_CONTAINER_SEL = '#files';

// Cabeçalho de cada arquivo (onde o nome do arquivo aparece)
const FILE_HEADER_SEL = '.file-header[data-path], [data-tagsearch-path], .js-file-header';

// Elemento pai de cada arquivo (wrapper completo)
const FILE_WRAPPER_SEL = '.file, [data-file-deleted], .js-file-content, .js-diff-progressive-container > div';

// Onde injetar o painel de sumário (acima da listagem de arquivos)
const SUMMARY_ANCHOR_SEL = '#files_tab_counter, .pr-toolbar, .diffbar, #files .diff-view';

// ── IDs para limpeza ──────────────────────────────────────────────────────────
const PANEL_ID         = 'sd-summary-panel';
const BADGE_CLASS      = 'sd-file-header';
const LOADING_BAR_ID   = 'sd-loading-bar';

// ── Category → color map (espelho de ai-router.js) ────────────────────────────
const CAT_COLORS = {
  'refatoração':        '#3b82f6',
  'lógica de negócio':  '#f59e0b',
  'correção de bug':    '#ef4444',
  'estilo/formatação':  '#6b7280',
  'testes':             '#22c55e',
  'configuração':       '#8b5cf6',
  'segurança':          '#f97316',
  'outro':              '#94a3b8',
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Injeta o painel de sumário e os badges nos arquivos.
 *
 * @param {object} analysis - Objeto padronizado da IA
 * @param {{ tooLarge?: boolean, fileCount?: number }} meta
 */
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

/**
 * Mostra a barra de carregamento com texto de progresso.
 */
export function showLoadingBar() {
  removeLoadingBar();
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const wrap = document.createElement('div');
  wrap.id        = LOADING_BAR_ID;
  wrap.className = 'sd-loading-wrap';
  wrap.innerHTML = `
    <div class="sd-loading-track"></div>
    <span class="sd-loading-label" id="sd-loading-label">Iniciando análise…</span>
  `;
  anchor.parentElement.insertBefore(wrap, anchor);
}

/**
 * Atualiza o texto de progresso na barra de carregamento.
 * @param {string} text
 */
export function updateLoadingText(text) {
  const label = document.getElementById('sd-loading-label');
  if (label) label.textContent = text;
}

/**
 * Remove a barra de carregamento.
 */
export function removeLoadingBar() {
  document.getElementById(LOADING_BAR_ID)?.remove();
}

/**
 * Injeta um banner de erro acima dos arquivos.
 *
 * @param {string} message
 */
export function injectError(message) {
  removeExisting();
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const el = document.createElement('div');
  el.className = 'sd-error';
  el.id        = PANEL_ID; // reutiliza o ID para limpeza posterior
  el.textContent = `Smart Diff — ${message}`;
  anchor.parentElement.insertBefore(el, anchor);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Remove todas as injeções anteriores do Smart Diff.
 */
function removeExisting() {
  document.getElementById(PANEL_ID)?.remove();
  document.querySelectorAll('.' + BADGE_CLASS).forEach(el => el.remove());
  removeLoadingBar();
}

/**
 * Injeta o painel de sumário acima da listagem de arquivos.
 */
function injectSummaryPanel(analysis) {
  const anchor = findSummaryAnchor();
  if (!anchor) return;

  const panel = document.createElement('div');
  panel.id        = PANEL_ID;
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

  // Botão fechar
  panel.querySelector('#sd-close-btn')?.addEventListener('click', () => panel.remove());
}

/**
 * Injeta badges acima de cada arquivo na aba "Files changed".
 */
function injectFileBadges(files) {
  if (!files.length) return;

  // Mapear filename → dados da análise para busca rápida
  const fileMap = new Map(files.map(f => [f.filename, f]));

  // Selecionar todos os wrappers de arquivo
  const fileEls = document.querySelectorAll(
    '.file[data-path], [data-tagsearch-path].file-header, .js-details-container > .file'
  );

  fileEls.forEach(fileEl => {
    tryInjectBadgeOnElement(fileEl, fileMap);
  });

  // GitHub também usa este seletor em algumas versões
  document.querySelectorAll('[data-path]').forEach(el => {
    tryInjectBadgeOnElement(el.closest('.file') || el, fileMap);
  });

  // Estratégia de fallback: procurar pelo nome de arquivo nos links
  document.querySelectorAll('.file-header').forEach(header => {
    const pathEl = header.querySelector('[data-path], .link-gray-dark, a[title]');
    if (!pathEl) return;

    const filename = pathEl.getAttribute('data-path') ||
                     pathEl.getAttribute('title')     ||
                     pathEl.textContent.trim();

    const fileData = fuzzyFindFile(filename, fileMap);
    if (fileData && !header.previousElementSibling?.classList.contains(BADGE_CLASS)) {
      const badge = buildBadgeElement(fileData);
      header.parentElement.insertBefore(badge, header);
    }
  });
}

/**
 * Tenta injetar badge num elemento de arquivo.
 */
function tryInjectBadgeOnElement(fileEl, fileMap) {
  if (!fileEl) return;

  // Evitar duplicatas
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
 * Busca fuzzy: tenta match exato primeiro, depois sufixo.
 */
function fuzzyFindFile(path, fileMap) {
  if (!path) return null;

  // Match exato
  if (fileMap.has(path)) return fileMap.get(path);

  // Normaliza barras
  const normalized = path.replace(/\\/g, '/');
  if (fileMap.has(normalized)) return fileMap.get(normalized);

  // Match por sufixo (o GitHub às vezes mostra caminho relativo)
  for (const [key, val] of fileMap.entries()) {
    if (key.endsWith(normalized) || normalized.endsWith(key)) return val;
  }

  return null;
}

/**
 * Cria o elemento de badge para um arquivo.
 */
function buildBadgeElement(fileData) {
  const wrapper = document.createElement('div');
  wrapper.className = BADGE_CLASS + ' sd-file-header';

  const cat   = fileData.category || 'outro';
  const color = CAT_COLORS[cat] || fileData.color || '#94a3b8';

  const badge = document.createElement('span');
  badge.className        = 'sd-badge';
  badge.dataset.cat      = cat;
  badge.dataset.description = fileData.description || '';

  badge.innerHTML = `
    <span class="sd-badge-dot" style="background:${color}"></span>
    ${escapeHtml(cat)}
  `;

  wrapper.appendChild(badge);
  return wrapper;
}

/**
 * Constrói o HTML da seção de ordem de leitura.
 */
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

/**
 * Injeta warning (PR muito grande, etc.).
 */
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
 */
function findSummaryAnchor() {
  // Tenta vários seletores em ordem de preferência
  const selectors = [
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

/**
 * Escapa HTML para evitar XSS no conteúdo da IA.
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
