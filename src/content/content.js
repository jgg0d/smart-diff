/**
 * smart-diff · src/content/content.js
 *
 * Content script principal — injetado em github.com/:owner/:repo/pull/:number pages.
 *
 * No Manifest V3, content scripts declarados no manifest rodam em "isolated world"
 * e NÃO suportam `import` estático entre arquivos. A solução idiomática é
 * carregar os módulos dinamicamente via chrome.runtime.getURL() + dynamic import().
 *
 * Responsabilidades:
 * 1. Detecta se está numa página de PR
 * 2. Escuta mensagens do popup (ANALYZE_PR)
 * 3. Orquestra pr-parser.js e dom-injector.js
 * 4. Comunica com o background service worker via chrome.runtime.sendMessage
 */

(async function smartDiffContentScript() {
  if (window.__smartDiffLoaded) return;
  window.__smartDiffLoaded = true;


  // ── Dynamic imports (MV3 pattern) ────────────────────────────────────────────
  const prParser    = await import(chrome.runtime.getURL('src/content/pr-parser.js'));
  const domInjector = await import(chrome.runtime.getURL('src/content/dom-injector.js'));

  const { parsePRFromURL, isPRPage } = prParser;
  const {
    injectAnalysis,
    injectError,
    showLoadingBar,
    removeLoadingBar,
    updateLoadingText,
  } = domInjector;

  // ── State ──────────────────────────────────────────────────────────────────
  let isAnalyzing = false;

  // ── Inicialização ──────────────────────────────────────────────────────────

  if (!isPRPage()) {
    console.debug('[SmartDiff] Não é uma página de PR. Content script em standby.');
  }

  // GitHub é uma SPA: observa mudanças de URL para detectar navegação entre PRs
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      isAnalyzing = false;
      removeLoadingBar();
    }
  }).observe(document.body, { subtree: true, childList: true });

  // ── Message Listener ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'ANALYZE_PR') {
      handleAnalyzePR()
        .then(result => sendResponse(result))
        .catch(err   => sendResponse({ success: false, error: err.message }));
      return true; // resposta assíncrona
    }

    if (message.action === 'PING') {
      sendResponse({ alive: true, isPR: isPRPage() });
      return true;
    }

    if (message.action === 'ANALYSIS_PROGRESS') {
      updateLoadingText(message.text);
      return false;
    }
  });

  // ── Core Handler ───────────────────────────────────────────────────────────

  /**
   * Fluxo de análise completo acionado pelo popup.
   */
  async function handleAnalyzePR() {
    if (isAnalyzing) {
      return { success: false, error: 'Análise já em andamento. Aguarde.' };
    }

    if (!isPRPage()) {
      return { success: false, error: 'Esta não é uma página de Pull Request do GitHub.' };
    }

    const prData = parsePRFromURL();
    if (!prData) {
      return { success: false, error: 'Não foi possível extrair os dados da PR da URL.' };
    }

    await ensureFilesTabLoaded();

    isAnalyzing = true;
    showLoadingBar();

    try {
      const response = await chrome.runtime.sendMessage({
        action:  'FETCH_AND_ANALYZE',
        payload: prData,
      });

      removeLoadingBar();
      isAnalyzing = false;

      if (!response || !response.success) {
        const errMsg = response?.error || 'Erro desconhecido no processamento.';
        injectError(errMsg);
        return { success: false, error: errMsg };
      }

      injectAnalysis(response.data.analysis, {
        tooLarge:  response.data.tooLarge,
        fileCount: response.data.fileCount,
      });

      return { success: true };

    } catch (err) {
      removeLoadingBar();
      isAnalyzing = false;

      const errMsg = err.message || 'Falha inesperada.';
      injectError(errMsg);
      return { success: false, error: errMsg };
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Tenta garantir que o conteúdo da aba "Files changed" esteja carregado.
   * No GitHub, o diff só é renderizado quando o usuário clica na aba.
   */
  async function ensureFilesTabLoaded() {
    if (location.pathname.endsWith('/files')) return;

    const filesTab = document.querySelector(
      'a[href*="/files"], [data-tab-item="files-tab"] a, .tabnav-tab[href*="/files"]'
    );

    if (filesTab) {
      filesTab.click();
      await wait(800);
    }
  }

  function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

})();
