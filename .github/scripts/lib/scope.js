// Classifica arquivos em áreas e infere o escopo pretendido da tarefa a partir do
// título/descrição/commits, pra acusar quando o PR mexe fora do que a tarefa pedia
// (ex.: tarefa "só UI" que altera Server Action/RBAC — perigoso com deploy automático
// no push). Adaptado do nextstep (Django + frontend/ separados) pro vital-ops
// (Next.js 16 App Router + Prisma num único app — sem pasta frontend/ própria).

// Ordem importa: a primeira que casar vence (migration antes de schema, server antes
// de ui — senão tudo debaixo de src/app/ cairia em "ui").
const AREAS = [
  { area: 'migration', teste: (p) => p.startsWith('prisma/migrations/') },
  { area: 'schema', teste: (p) => p === 'prisma/schema.prisma' },
  {
    area: 'ci/infra',
    teste: (p) =>
      p.startsWith('.github/') ||
      /(^|\/)Dockerfile/.test(p) ||
      p === 'vercel.json' ||
      p === 'next.config.ts' ||
      p === 'package.json',
  },
  { area: 'specs', teste: (p) => p.startsWith('docs/') || p === 'AGENTS.md' || /\.md$/.test(p) },
  {
    area: 'server',
    teste: (p) =>
      p.startsWith('src/app/api/') ||
      /\/actions\.ts$/.test(p) ||
      p.startsWith('src/lib/'),
  },
  { area: 'ui', teste: (p) => p.startsWith('src/components/') || p.startsWith('src/app/') },
];

function classificarArquivo(caminho) {
  const p = caminho.trim();
  for (const { area, teste } of AREAS) {
    if (teste(p)) return area;
  }
  return 'outros';
}

function mapearAreas(arquivos) {
  const contagem = {};
  for (const arq of arquivos) {
    const area = classificarArquivo(arq);
    contagem[area] = (contagem[area] || 0) + 1;
  }
  return { areas: Object.keys(contagem).sort(), contagem };
}

// Normaliza um termo de escopo (de conventional commit ou palavra-chave) numa área.
const SINONIMOS = [
  { area: 'ui', termos: /\b(ui|frontend|front|tela|css|estilo|componente|design|layout)\b/i },
  { area: 'server', termos: /\b(server|backend|back|api|action|prisma|banco|db|rbac|permiss(a|ã)o|auth)\b/i },
  { area: 'ci/infra', termos: /\b(ci|deploy|infra|workflow|pipeline|docker|vercel)\b/i },
];

function normalizarTermo(termo) {
  for (const { area, termos } of SINONIMOS) {
    if (termos.test(termo)) return area;
  }
  return null;
}

// Lê escopo de conventional commit: feat(server): ... -> server (explícito).
function inferirEscopoDeclarado(texto) {
  const t = texto || '';
  const areas = new Set();
  let explicito = false;

  const re = /\b(?:feat|fix|chore|refactor|style|docs|test|perf|build|ci)\(([^)]+)\)/gi;
  for (const m of t.matchAll(re)) {
    const area = normalizarTermo(m[1]);
    if (area) {
      areas.add(area);
      explicito = true;
    }
  }

  if (areas.size === 0) {
    for (const { area, termos } of SINONIMOS) {
      if (termos.test(t)) areas.add(area);
    }
  }

  return { areas: [...areas].sort(), explicito };
}

// Áreas neutras: mexer nelas junto não conta como "fora de escopo".
const NEUTRAS = new Set(['specs']);

// Só acusa deterministicamente quando o escopo é EXPLÍCITO (conventional commit),
// pra não bloquear PR por inferência fraca. Caso contrário, deixa o LLM julgar.
function detectarForaDeEscopo(escopoDeclarado, areasAlteradas) {
  if (!escopoDeclarado.explicito || escopoDeclarado.areas.length === 0) return null;
  const declarado = new Set(escopoDeclarado.areas);
  const extras = areasAlteradas.filter((a) => !declarado.has(a) && !NEUTRAS.has(a) && a !== 'outros');
  if (extras.length === 0) return null;
  return {
    id: 'fora-de-escopo',
    severidade: 'PERIGO',
    categoria: 'Escopo',
    arquivo: '(geral)',
    problema: `Tarefa declarada como [${escopoDeclarado.areas.join(', ')}] mas o PR também altera [${extras.join(', ')}].`,
    recomendacao: 'Separe as mudanças fora do escopo em outro PR ou ajuste a descrição da tarefa.',
    fonte: 'regra',
  };
}

module.exports = {
  classificarArquivo,
  mapearAreas,
  inferirEscopoDeclarado,
  detectarForaDeEscopo,
};
