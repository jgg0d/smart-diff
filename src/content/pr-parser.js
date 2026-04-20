/**
 * smart-diff · src/content/pr-parser.js
 *
 * Responsável por extrair owner, repo e PR number da URL atual
 * e montar os dados necessários para a chamada da API.
 */

/**
 * Regex para URLs de PR do GitHub:
 * https://github.com/{owner}/{repo}/pull/{prNumber}[/...]
 */
const PR_URL_REGEX = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/;

/**
 * Extrai os dados da PR da URL fornecida.
 *
 * @param {string} [url=window.location.href] - URL a ser parseada
 * @returns {{ owner: string, repo: string, prNumber: string } | null}
 */
export function parsePRFromURL(url = window.location.href) {
  const match = url.match(PR_URL_REGEX);
  if (!match) return null;

  return {
    owner:    match[1],
    repo:     match[2],
    prNumber: match[3],
  };
}

/**
 * Verifica se a URL atual é uma página de PR do GitHub.
 *
 * @param {string} [url=window.location.href]
 * @returns {boolean}
 */
export function isPRPage(url = window.location.href) {
  return PR_URL_REGEX.test(url);
}

/**
 * Extrai o título da PR a partir do DOM do GitHub.
 * Fallback para a tag <title> do documento.
 *
 * @returns {string}
 */
export function getPRTitle() {
  // GitHub renderiza o título no h1 da PR
  const h1 = document.querySelector('.js-issue-title, [data-testid="issue-title"], h1.gh-header-title .js-issue-title');
  if (h1) return h1.textContent.trim();

  // Fallback: <title> da página (remove " · Pull Request #N · owner/repo · GitHub")
  const title = document.title || '';
  return title.split('·')[0].trim() || 'Pull Request';
}
