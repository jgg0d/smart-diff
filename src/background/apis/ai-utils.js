/**
 * smart-diff · src/background/apis/ai-utils.js
 *
 * Utilitários compartilhados entre ai-router.js e os módulos de provedor.
 * Extraído para evitar dependência circular.
 */

export const CATEGORIES = {
  'refatoração':        '#3b82f6',
  'lógica de negócio':  '#f59e0b',
  'correção de bug':    '#ef4444',
  'estilo/formatação':  '#6b7280',
  'testes':             '#22c55e',
  'configuração':       '#8b5cf6',
  'segurança':          '#f97316',
  'outro':              '#94a3b8',
};

export function buildPrompt(diff) {
  const categoriesList = Object.keys(CATEGORIES).join(', ');

  return `Você é um engenheiro de software sênior especialista em code review.
Analise semanticamente o diff abaixo de uma Pull Request do GitHub.

Classifique cada arquivo alterado em UMA das seguintes categorias: ${categoriesList}.

Responda EXCLUSIVAMENTE com um JSON válido seguindo exatamente este formato, sem markdown, sem backticks, sem texto adicional:

{
  "summary": "Descrição geral do que essa PR faz em 2-3 frases",
  "reading_order": ["arquivo1.js", "arquivo2.js"],
  "files": [
    {
      "filename": "caminho/do/arquivo.js",
      "category": "categoria em português (use exatamente uma das categorias listadas)",
      "color": "#hexcolor (use a cor correspondente à categoria)",
      "description": "Uma frase descrevendo o que mudou neste arquivo"
    }
  ]
}

Mapa de cores obrigatório por categoria:
- refatoração → #3b82f6
- lógica de negócio → #f59e0b
- correção de bug → #ef4444
- estilo/formatação → #6b7280
- testes → #22c55e
- configuração → #8b5cf6
- segurança → #f97316
- outro → #94a3b8

A "reading_order" deve listar os arquivos em ordem sugerida de leitura para entender a PR, do mais fundamental ao mais derivado.

DIFF DA PULL REQUEST:
${diff}`;
}

export function parseAIResponse(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Resposta da IA está vazia.');
  }

  let jsonStr = raw.trim();

  try {
    return validateStructure(JSON.parse(jsonStr));
  } catch (_) {}

  const mdMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (mdMatch) {
    try {
      return validateStructure(JSON.parse(mdMatch[1].trim()));
    } catch (_) {}
  }

  const braceMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (braceMatch) {
    try {
      return validateStructure(JSON.parse(braceMatch[0]));
    } catch (_) {}
  }

  throw new Error('A IA retornou um JSON inválido ou fora do formato esperado.');
}

function validateStructure(parsed) {
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('JSON não é um objeto.');
  }

  const result = {
    summary:       typeof parsed.summary === 'string' ? parsed.summary : 'Análise realizada.',
    reading_order: Array.isArray(parsed.reading_order) ? parsed.reading_order : [],
    files:         [],
  };

  if (Array.isArray(parsed.files)) {
    result.files = parsed.files.map(f => ({
      filename:    String(f.filename    || 'arquivo desconhecido'),
      category:    normalizeCategory(String(f.category || 'outro')),
      color:       String(f.color       || CATEGORIES['outro']),
      description: String(f.description || ''),
    }));
  }

  return result;
}

function normalizeCategory(cat) {
  const lower = cat.toLowerCase().trim();
  if (CATEGORIES[lower]) return lower;
  for (const key of Object.keys(CATEGORIES)) {
    if (lower.includes(key) || key.includes(lower)) return key;
  }
  return 'outro';
}
