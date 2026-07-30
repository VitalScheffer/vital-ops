// Regras específicas de Django / Django REST Framework.
// Carregado só em repositório que realmente usa a stack (ver detectarStacks em
// security-rules.js). Num projeto Spring ou Next elas nunca casariam, então mantê-las
// ligadas seria só ruído.

const REGRAS_LINHA = [
  {
    id: 'auth-allow-any',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /\bAllowAny\b/,
    problema: 'Endpoint exposto com AllowAny (sem exigir autenticação).',
    recomendacao: 'Use IsAuthenticated/permissão por setor; AllowAny só em endpoint público intencional.',
  },
  {
    id: 'auth-permission-vazio',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /permission_classes\s*=\s*\[\s*\]/,
    problema: 'permission_classes = [] deixa a view sem nenhuma permissão.',
    recomendacao: 'Defina as permissões explícitas (DRF puro).',
  },
  {
    id: 'auth-authentication-vazio',
    severidade: 'PERIGO',
    categoria: 'Auth',
    regex: /authentication_classes\s*=\s*\[\s*\]/,
    problema: 'authentication_classes = [] desliga a autenticação da view.',
    recomendacao: 'Remova ou configure a autenticação correta.',
  },
  {
    id: 'config-debug-true',
    severidade: 'PERIGO',
    categoria: 'Config',
    regex: /\bDEBUG\s*=\s*True\b/,
    problema: 'DEBUG = True. Em produção expõe stacktraces e desliga proteções.',
    recomendacao: 'DEBUG deve vir de variável de ambiente e ser False em produção.',
  },
  {
    id: 'config-allowed-hosts-wild',
    severidade: 'PERIGO',
    categoria: 'Config',
    regex: /ALLOWED_HOSTS\s*=\s*\[[^\]]*['"]\*['"]/,
    problema: "ALLOWED_HOSTS com '*' aceita qualquer host (risco de Host header).",
    recomendacao: 'Liste os hosts permitidos explicitamente.',
  },
  {
    id: 'config-cors-all',
    severidade: 'PERIGO',
    categoria: 'Config',
    regex: /CORS_(ALLOW_ALL_ORIGINS|ORIGIN_ALLOW_ALL)\s*=\s*True/,
    problema: 'CORS liberado para qualquer origem.',
    recomendacao: 'Restrinja CORS às origens conhecidas.',
  },
  {
    id: 'sec-csrf-exempt',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /csrf_exempt/,
    problema: 'csrf_exempt desliga a proteção CSRF na view.',
    recomendacao: 'Confirme que a view não aceita estado mutável via browser.',
  },
  {
    id: 'sec-mark-safe',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /mark_safe\s*\(/,
    problema: 'mark_safe injeta HTML sem sanitização (risco de XSS).',
    recomendacao: 'Sanitize o conteúdo antes de marcar como seguro.',
  },
];

const REGRAS_CAMINHO = [
  {
    id: 'schema-migration',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => /\/migrations\/\d{3,}.*\.py$/.test(p),
    problema: 'Nova migration / mudança de schema (deploy roda migrate).',
    recomendacao: 'Confirme reversibilidade e impacto em dados de produção.',
  },
  {
    id: 'settings-tocado',
    severidade: 'MODERADO',
    categoria: 'Config',
    teste: (p) => /(^|\/)settings(_[a-z]+)?\.py$/.test(p),
    problema: 'Arquivo de settings alterado.',
    recomendacao: 'Cheque chaves de segurança (DEBUG, ALLOWED_HOSTS, SECRET_KEY, CORS).',
  },
];

// `except:` seguido só de `pass`/`...` engole o erro. Precisa olhar a linha seguinte,
// por isso é tratado à parte das regras de uma linha só.
const FALHA_SILENCIOSA = {
  id: 'sec-falha-silenciosa',
  severidade: 'MODERADO',
  categoria: 'Robustez',
  abre: /^\s*except\b.*:\s*$/,
  silencia: /^\s*(pass|\.\.\.)\s*$/,
  problema: 'except seguido de pass/... engole o erro silenciosamente.',
  recomendacao: 'Logue ou trate o erro; não silencie em caminho crítico.',
};

module.exports = { REGRAS_LINHA, REGRAS_CAMINHO, PARES: [FALHA_SILENCIOSA] };
