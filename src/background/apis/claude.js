/**
 * smart-diff · src/background/apis/claude.js
 *
 * Módulo exclusivo para chamadas à API da Anthropic.
 * Exporta: analyze(diff, apiKey) → JSON padronizado
 */

const CLAUDE_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL    = 'claude-sonnet-4-5-20250929';

import { buildPrompt, parseAIResponse } from './ai-utils.js';

/**
 * Envia o diff para a Claude API e retorna o JSON de análise padronizado.
 *
 * @param {string} diff   - Texto do diff concatenado
 * @param {string} apiKey - Anthropic API Key (sk-ant-…)
 * @returns {Promise<object>} - Objeto de resposta padronizado
 */
export async function analyze(diff, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API Key da Anthropic não configurada. Acesse as configurações da extensão.');
  }

  const prompt = buildPrompt(diff);

  let response;
  try {
    response = await fetch(CLAUDE_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':            'application/json',
        'x-api-key':               apiKey.trim(),
        'anthropic-version':       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 1536,
        messages: [
          { role: 'user', content: prompt }
        ],
      }),
    });
  } catch (networkErr) {
    throw new Error(`Falha de rede ao acessar a API da Anthropic: ${networkErr.message}`);
  }

  // ── Error handling ────────────────────────────────────────────────────────
  if (response.status === 401) {
    throw new Error('API Key da Anthropic inválida ou expirada.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit da Anthropic atingido. Aguarde alguns instantes e tente novamente.');
  }
  if (response.status === 529 || response.status === 503) {
    throw new Error('API da Anthropic temporariamente indisponível. Tente novamente em instantes.');
  }
  if (!response.ok) {
    let errMsg = `Anthropic API erro ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) errMsg += `: ${errBody.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  // Extrair texto da resposta
  const rawText = data?.content?.[0]?.text || '';
  if (!rawText) {
    throw new Error('Resposta vazia da Claude API.');
  }

  return parseAIResponse(rawText);
}
