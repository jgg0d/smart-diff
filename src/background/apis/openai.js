/**
 * smart-diff · src/background/apis/openai.js
 *
 * Módulo exclusivo para chamadas à API da OpenAI.
 * Exporta: analyze(diff, apiKey) → JSON padronizado
 */

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL    = 'gpt-4o';

import { buildPrompt, parseAIResponse } from './ai-utils.js';

/**
 * Envia o diff para a OpenAI API e retorna o JSON de análise padronizado.
 *
 * @param {string} diff   - Texto do diff concatenado
 * @param {string} apiKey - OpenAI API Key (sk-…)
 * @returns {Promise<object>} - Objeto de resposta padronizado
 */
export async function analyze(diff, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API Key da OpenAI não configurada. Acesse as configurações da extensão.');
  }

  const prompt = buildPrompt(diff);

  let response;
  try {
    response = await fetch(OPENAI_ENDPOINT, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model:       OPENAI_MODEL,
        max_tokens:  2048,
        temperature: 0.2,
        messages: [
          {
            role:    'system',
            content: 'You are a senior software engineer performing semantic code review analysis. Always respond ONLY with valid JSON, no markdown, no backticks, no explanations.',
          },
          {
            role:    'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' }, // JSON mode disponível no gpt-4o
      }),
    });
  } catch (networkErr) {
    throw new Error(`Falha de rede ao acessar a API da OpenAI: ${networkErr.message}`);
  }

  // ── Error handling ────────────────────────────────────────────────────────
  if (response.status === 401) {
    throw new Error('API Key da OpenAI inválida ou expirada.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit da OpenAI atingido. Aguarde alguns instantes e tente novamente.');
  }
  if (response.status === 503 || response.status === 500) {
    throw new Error('API da OpenAI temporariamente indisponível. Tente novamente em instantes.');
  }
  if (!response.ok) {
    let errMsg = `OpenAI API erro ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) errMsg += `: ${errBody.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  // Extrair texto da resposta
  const rawText = data?.choices?.[0]?.message?.content || '';
  if (!rawText) {
    throw new Error('Resposta vazia da OpenAI API.');
  }

  return parseAIResponse(rawText);
}
