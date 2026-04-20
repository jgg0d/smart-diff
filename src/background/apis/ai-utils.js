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
  return `Analise o diff abaixo e responda APENAS com JSON válido (sem markdown, sem texto fora do JSON):

{
  "summary": "2-3 frases sobre o que a PR faz",
  "reading_order": ["arquivo1.js"],
  "files": [{
    "filename": "caminho/arquivo.js",
    "category": "categoria",
    "color": "#hex",
    "description": "Uma frase sobre o arquivo",
    "hunks": [{"i": 0, "desc": "Uma frase descrevendo o que muda neste bloco"}]
  }]
}

Categorias e cores: refatoração (#3b82f6), lógica de negócio (#f59e0b), correção de bug (#ef4444), estilo/formatação (#6b7280), testes (#22c55e), configuração (#8b5cf6), segurança (#f97316), outro (#94a3b8).
Para cada arquivo que tiver blocos marcados com [H0], [H1]… no diff, inclua o array "hunks" mapeando cada índice a uma descrição de uma frase. Não omita hunks se existirem marcadores [H] no diff do arquivo.
reading_order: do mais fundamental ao mais derivado.

DIFF:
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
      hunks:       Array.isArray(f.hunks)
        ? f.hunks.map(h => ({ i: Number(h.i ?? 0), desc: String(h.desc || '') }))
        : [],
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
