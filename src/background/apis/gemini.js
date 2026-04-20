/**
 * smart-diff · src/background/apis/gemini.js
 *
 * Módulo exclusivo para chamadas à API do Google Gemini.
 * Exporta: analyze(diff, apiKey) → JSON padronizado
 */

const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

import { buildPrompt, parseAIResponse } from './ai-utils.js';

/**
 * Envia o diff para a Gemini API e retorna o JSON de análise padronizado.
 *
 * @param {string} diff   - Texto do diff concatenado
 * @param {string} apiKey - Google AI API Key (AIza…)
 * @returns {Promise<object>} - Objeto de resposta padronizado
 */
export async function analyze(diff, apiKey) {
  if (!apiKey || !apiKey.trim()) {
    throw new Error('API Key do Google Gemini não configurada. Acesse as configurações da extensão.');
  }

  const prompt = buildPrompt(diff);
  const url    = `${GEMINI_ENDPOINT}?key=${encodeURIComponent(apiKey.trim())}`;

  let response;
  try {
    response = await fetch(url, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt }
            ],
          },
        ],
        generationConfig: {
          temperature:    0.2,
          maxOutputTokens: 1536,
          responseMimeType: 'application/json', // força JSON mode no Gemini
        },
        systemInstruction: {
          parts: [
            {
              text: 'You are a senior software engineer performing semantic code review analysis. Always respond ONLY with valid JSON, no markdown, no backticks, no explanations.',
            },
          ],
        },
      }),
    });
  } catch (networkErr) {
    throw new Error(`Falha de rede ao acessar a API do Gemini: ${networkErr.message}`);
  }

  // ── Error handling ────────────────────────────────────────────────────────
  if (response.status === 400) {
    throw new Error('Requisição inválida para o Gemini. Verifique a API Key.');
  }
  if (response.status === 403) {
    throw new Error('API Key do Gemini inválida ou sem permissão.');
  }
  if (response.status === 429) {
    throw new Error('Rate limit do Gemini atingido. Aguarde alguns instantes e tente novamente.');
  }
  if (response.status === 503 || response.status === 500) {
    throw new Error('API do Gemini temporariamente indisponível. Tente novamente em instantes.');
  }
  if (!response.ok) {
    let errMsg = `Gemini API erro ${response.status}`;
    try {
      const errBody = await response.json();
      if (errBody?.error?.message) errMsg += `: ${errBody.error.message}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  const data = await response.json();

  // Extrair texto da resposta (estrutura diferente dos outros providers)
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!rawText) {
    // Verificar bloqueio de segurança
    const blockReason = data?.candidates?.[0]?.finishReason;
    if (blockReason === 'SAFETY') {
      throw new Error('O conteúdo foi bloqueado pelo filtro de segurança do Gemini.');
    }
    throw new Error('Resposta vazia da Gemini API.');
  }

  return parseAIResponse(rawText);
}
