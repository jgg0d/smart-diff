# Smart Diff

Extensão para Google Chrome que melhora a experiência de code review no GitHub, agrupando e classificando semanticamente as mudanças de uma Pull Request com IA.

Quando você abre uma PR, a Smart Diff injeta **badges coloridas** acima de cada arquivo classificando o tipo de mudança (refatoração, lógica de negócio, correção de bug, testes, etc.) e adiciona um **painel de sumário** no topo com uma descrição geral da PR e uma sugestão de ordem de leitura.

---

## Funcionalidades

- Detecção automática de páginas de Pull Request (`github.com/*/pull/*`)
- Extração do diff via GitHub API
- Classificação semântica com IA em 7 categorias
- Badges coloridas injetadas acima de cada arquivo alterado
- Painel de sumário com descrição geral + ordem de leitura sugerida
- Suporte a 3 provedores de IA: Claude, ChatGPT e Gemini
- Tudo processado client-side, sem servidor próprio
- Chaves salvas via `chrome.storage.sync`

---

## Categorias e cores

| Categoria          | Cor       | Hex       |
| ------------------ | --------- | --------- |
| Refatoração        | Azul      | `#3b82f6` |
| Lógica de negócio  | Amarelo   | `#f59e0b` |
| Correção de bug    | Vermelho  | `#ef4444` |
| Estilo/formatação  | Cinza     | `#6b7280` |
| Testes             | Verde     | `#22c55e` |
| Configuração       | Roxo      | `#8b5cf6` |
| Segurança          | Laranja   | `#f97316` |

---

## Estrutura de pastas

```
smart-diff/
├── manifest.json
└── src/
    ├── interface/
    │   ├── popup.html          # Tela do ícone da extensão
    │   └── settings.html       # Tela de configurações
    ├── icons/
    │   ├── icon16.png
    │   ├── icon48.png
    │   └── icon128.png
    ├── styles/
    │   ├── popup.css
    │   ├── settings.css
    │   └── injected.css        # Estilos dos badges e painel
    ├── background/
    │   ├── background.js       # Service worker (MV3)
    │   └── apis/
    │       ├── github.js       # getPRFiles(owner, repo, prNumber, token)
    │       ├── claude.js       # analyze(diff, apiKey) — Anthropic
    │       ├── openai.js       # analyze(diff, apiKey) — OpenAI
    │       ├── gemini.js       # analyze(diff, apiKey) — Google
    │       └── ai-router.js    # analyzeWithAI(diff, provider, apiKey)
    └── content/
        ├── content.js          # Content script principal
        ├── pr-parser.js        # Extrai owner/repo/PR da URL
        └── dom-injector.js     # Injeta badges e painel no DOM do GitHub
```

---

## Stack técnica

- **Manifest V3** — padrão atual do Chrome
- **JavaScript puro com ES Modules** — sem frameworks, sem build step
- **`chrome.storage.sync`** — chaves e preferências sincronizadas entre dispositivos
- **100% client-side** — nenhum servidor intermediário, suas chaves nunca saem do seu navegador

### Provedores de IA suportados

| Provedor | Modelo                    | Endpoint                                                                             |
| -------- | ------------------------- | ------------------------------------------------------------------------------------ |
| Claude   | `claude-sonnet-4-5-20250929`| `https://api.anthropic.com/v1/messages`                                             |
| ChatGPT  | `gpt-4o`                  | `https://api.openai.com/v1/chat/completions`                                        |
| Gemini   | `gemini-2.0-flash`        | `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent` |

---

## Formato de resposta padronizado

Todos os três módulos de IA retornam o mesmo formato, normalizado pelo `ai-router.js`:

```json
{
  "summary": "Descrição geral do que essa PR faz em 2-3 frases.",
  "reading_order": ["arquivo1.js", "arquivo2.js"],
  "files": [
    {
      "filename": "src/auth/login.js",
      "category": "lógica de negócio",
      "color": "#f59e0b",
      "description": "Muda o fluxo de validação do login."
    }
  ]
}
```

---

## Como instalar

1. Baixe ou clone este repositório
2. Abra `chrome://extensions` no Chrome
3. Ative o **Modo de desenvolvedor** (canto superior direito)
4. Clique em **Carregar sem compactação**
5. Selecione a pasta raiz do projeto (`smart-diff/`)
6. Clique no ícone da extensão na barra do Chrome
7. Clique no ícone de engrenagem para abrir as configurações e inserir suas chaves

---

## Como obter as credenciais

### GitHub Personal Access Token

- Acesse: [github.com/settings/tokens/new](https://github.com/settings/tokens/new)
- Escopo mínimo: `repo` (para ler PRs de repositórios privados)
- Para repos públicos o token é opcional, mas recomendado — sem ele você tem limite de 60 requisições/hora
- O token começa com `ghp_…` e só é exibido uma vez, copie na hora

### Claude (Anthropic)

- Acesse: [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys)
- Crie uma conta e adicione crédito (a API é paga)
- Gere uma chave que começa com `sk-ant-…`

### ChatGPT (OpenAI)

- Acesse: [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- Crie uma conta e adicione crédito ou use o tier gratuito inicial
- Gere uma chave que começa com `sk-…`

### Gemini (Google)

- Acesse: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Precisa apenas de uma conta Google
- Tem tier gratuito generoso no `gemini-2.0-flash`
- A chave começa com `AIza…`

---

## Como usar

1. Abra uma página de PR no GitHub: `github.com/owner/repo/pull/123`
2. Clique no ícone da extensão — o popup mostra "Página de PR detectada" em verde
3. Clique em **Analisar PR**
4. Em alguns segundos aparecem:
   - O banner de sumário acima da lista de arquivos com a descrição geral e a ordem de leitura sugerida
   - Badges coloridas categorizando cada arquivo alterado
5. Passe o mouse sobre uma badge para ver a descrição específica daquele arquivo

---

## Decisões técnicas relevantes

### 1. Manifest V3 + ES Modules em content scripts

Content scripts declarados no manifest no MV3 rodam em *isolated world* e **não suportam `import`/`export` estático** entre arquivos. A solução que usei em `content.js` é carregar `pr-parser.js` e `dom-injector.js` via `chrome.runtime.getURL()` + `await import(...)` dinâmico. Por isso esses dois módulos estão em `web_accessible_resources` no `manifest.json`.

### 2. Background como ES Module

O service worker aceita `import` estático, então `background.js` importa `github.js` e `ai-router.js` normalmente, com `"type": "module"` declarado no manifest.

### 3. Chamada direta do Claude no browser

A Anthropic bloqueia chamadas diretas do navegador por padrão. Adicionei o header `anthropic-dangerous-direct-browser-access: true` em `claude.js` para permitir a chamada client-side.

### 4. Parse robusto da resposta da IA

OpenAI usa `response_format: { type: "json_object" }` e Gemini usa `responseMimeType: "application/json"` — ambos forçam JSON válido. Mesmo assim, `parseAIResponse()` no `ai-router.js` faz parse em 3 camadas como fallback:

1. Parse direto do JSON
2. Extração de bloco markdown ```` ```json ... ``` ````
3. Match do primeiro bloco `{ ... }` encontrado na string

Se nada funcionar, lança erro. Também há `validateStructure()` e `normalizeCategory()` que garantem campos obrigatórios e fazem fuzzy match na categoria caso a IA invente uma variação.

### 5. Tratamento de erros coberto

- API Key ausente ou não configurada
- GitHub Token inválido ou sem permissão
- Rate limit 429 em qualquer das APIs
- JSON inválido ou fora do formato esperado (com fallback de parse)
- Timeout ou falha de rede
- PR com mais de 100 arquivos (warning sugerindo análise por partes)

### 6. SPA awareness

O GitHub é uma SPA e muda de URL sem recarregar a página. Um `MutationObserver` em `content.js` detecta navegação entre PRs e limpa o estado.

---

## Privacidade

- Nenhum servidor intermediário — sua extensão chama as APIs diretamente
- Chaves salvas apenas no `chrome.storage.sync` do seu navegador
- O diff enviado para a IA contém código da PR que você está revisando, tenha ciência disso ao analisar repositórios privados sensíveis

---

## Licença

MIT
