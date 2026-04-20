/**
 * smart-diff · src/background/apis/ai-router.js
 *
 * Entry point principal — roteia para o provedor correto.
 * Exporta analyzeWithAI(diff, provider, apiKey).
 * Utilitários compartilhados (buildPrompt, parseAIResponse, CATEGORIES) estão em ai-utils.js.
 */

import { analyze as analyzeClaude } from './claude.js';
import { analyze as analyzeOpenai } from './openai.js';
import { analyze as analyzeGemini } from './gemini.js';

export { CATEGORIES, buildPrompt, parseAIResponse } from './ai-utils.js';

export async function analyzeWithAI(diff, provider, apiKey) {
  if (!diff || !diff.trim()) {
    throw new Error('Diff vazio — nenhum arquivo alterado encontrado nessa PR.');
  }

  switch (provider) {
    case 'claude':  return analyzeClaude(diff, apiKey);
    case 'openai':  return analyzeOpenai(diff, apiKey);
    case 'gemini':  return analyzeGemini(diff, apiKey);
    default:
      throw new Error(`Provedor de IA desconhecido: "${provider}". Use 'claude', 'openai' ou 'gemini'.`);
  }
}
