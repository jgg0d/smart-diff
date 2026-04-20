/**
 * smart-diff · src/background/apis/github.js
 *
 * Módulo exclusivo para comunicação com a GitHub REST API v3.
 * Responsabilidade: buscar os arquivos e diffs de uma Pull Request.
 */

const GITHUB_API = 'https://api.github.com';
const MAX_FILES  = 100; // Limite de segurança antes de alertar o usuário

/**
 * Busca todos os arquivos (com patch/diff) de uma Pull Request.
 *
 * @param {string} owner     - Dono do repositório (ex: "facebook")
 * @param {string} repo      - Nome do repositório (ex: "react")
 * @param {number|string} prNumber - Número da PR
 * @param {string} [token]   - GitHub Personal Access Token (opcional para repos públicos)
 * @returns {Promise<{ files: Array, tooLarge: boolean }>}
 */
export async function getPRFiles(owner, repo, prNumber, token = '') {
  const headers = {
    'Accept':     'application/vnd.github.v3.diff+json',
    'User-Agent': 'SmartDiff-Extension/1.0',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // GitHub paginates at 30 files by default; we request 100 per page
  const allFiles = [];
  let page = 1;

  while (true) {
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100&page=${page}`;

    let response;
    try {
      response = await fetch(url, { headers });
    } catch (networkErr) {
      throw new Error(`Falha de rede ao acessar a GitHub API: ${networkErr.message}`);
    }

    // ── Error handling ──────────────────────────────────────────────────────
    if (response.status === 401) {
      throw new Error('GitHub Token inválido ou expirado. Verifique nas configurações.');
    }
    if (response.status === 403) {
      const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
      if (rateLimitRemaining === '0') {
        const reset = response.headers.get('x-ratelimit-reset');
        const resetTime = reset ? new Date(parseInt(reset) * 1000).toLocaleTimeString('pt-BR') : 'em breve';
        throw new Error(`Rate limit da GitHub API atingido. Tente novamente às ${resetTime}.`);
      }
      throw new Error('Sem permissão para acessar este repositório. Verifique o escopo do Token.');
    }
    if (response.status === 404) {
      throw new Error('Repositório ou PR não encontrado. Verifique se você tem acesso.');
    }
    if (response.status === 429) {
      throw new Error('Too Many Requests (429) na GitHub API. Aguarde alguns minutos.');
    }
    if (!response.ok) {
      throw new Error(`GitHub API retornou erro ${response.status}.`);
    }

    const files = await response.json();

    // Fim da paginação
    if (!files || files.length === 0) break;

    allFiles.push(...files);

    // Verificação de PR muito grande
    if (allFiles.length >= MAX_FILES) {
      return {
        files:    allFiles.slice(0, MAX_FILES),
        tooLarge: true,
        total:    allFiles.length,
      };
    }

    // Se retornou menos de 100, não há próxima página
    if (files.length < 100) break;

    page++;
  }

  return {
    files:    allFiles,
    tooLarge: false,
    total:    allFiles.length,
  };
}

/**
 * Converte a lista de arquivos da API em um diff textual compacto para a IA.
 * Remove linhas de contexto (prefixo espaço) e numera hunks com [H0], [H1]…
 * Reduz tamanho em ~50% sem perder informação semântica.
 *
 * @param {Array} files - Array de file objects da GitHub API
 * @returns {string} - Diff compacto e formatado
 */
export function buildDiffText(files) {
  return files
    .map(f => {
      const patch = f.patch || '[binário ou sem diff disponível]';
      return `### ${f.filename} (${f.status})\n${compactPatch(patch)}`;
    })
    .join('\n\n---\n\n');
}

function compactPatch(patch) {
  if (patch.startsWith('[')) return patch;
  let hunkIdx = -1;
  return patch
    .split('\n')
    .map(line => {
      if (line.startsWith('@@')) {
        hunkIdx++;
        return `[H${hunkIdx}] ${line}`;
      }
      if (line.startsWith('+') || line.startsWith('-')) return line;
      return null;
    })
    .filter(l => l !== null)
    .join('\n');
}
