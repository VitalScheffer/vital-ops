// Pré-scan determinístico do diff. NÃO depende do LLM: pega padrões catastróficos
// conhecidos (segredo hardcoded, SQL cru, deploy/CI etc.) e força o achado
// independente do que o Gemini "achar". É a rede de segurança que impede um PERIGO
// de ser "aprovado com ressalvas".
//
// Adaptado do nextstep (Django/DRF) pro vital-ops (Next.js 16 + Prisma + Auth.js):
// as regras genéricas (segredo, eval, TLS, .env versionado, dangerouslySetInnerHTML,
// deploy/CI) foram mantidas; as regras específicas de Django (AllowAny,
// permission_classes, DEBUG=True, ALLOWED_HOSTS, csrf_exempt, mark_safe, migrations
// .py) foram trocadas pelos equivalentes desta stack (SQL cru do Prisma, catch vazio
// em TS, migration/schema do Prisma).

// Linhas que leem de ambiente não são segredo hardcoded — não acusar.
const LE_DE_AMBIENTE = /(process\.env|getenv|settings\.|config\(|env\(|ENV\[|\bvars\.|\bsecrets\.)/i;

// Regras aplicadas a cada LINHA ADICIONADA do diff.
const REGRAS_LINHA = [
  {
    id: 'segredo-aws-key',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /AKIA[0-9A-Z]{16}/,
    problema: 'Possível AWS Access Key ID hardcoded.',
    recomendacao: 'Remova a credencial e rotacione a chave imediatamente.',
  },
  {
    id: 'segredo-private-key',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    problema: 'Chave privada commitada no repositório.',
    recomendacao: 'Remova do git, rotacione e guarde como secret.',
  },
  {
    id: 'segredo-credencial-literal',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /\b(api[_-]?key|secret|token|senha|password|passwd|pwd)\b\s*[:=]\s*['"][^'"\s]{6,}['"]/i,
    guard: LE_DE_AMBIENTE,
    problema: 'Credencial/segredo aparentemente hardcoded.',
    recomendacao: 'Use variável de ambiente/secret (Vercel Environment Variables); se for real, rotacione.',
  },
  {
    id: 'config-env-versionado',
    severidade: 'PERIGO',
    categoria: 'Segredo',
    regex: /^\s*[A-Z0-9_]+\s*=\s*.+/,
    soArquivo: /(^|\/)\.env(\.|$)/,
    problema: 'Arquivo .env versionado (provável vazamento de segredos).',
    recomendacao: 'Remova o .env do git e confirme que está no .gitignore (`.env*`).',
  },
  {
    id: 'sec-eval-exec',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /\beval\s*\(|child_process\.exec\s*\(/,
    problema: 'Uso de eval/exec — risco de execução arbitrária ou injeção de comando.',
    recomendacao: 'Evite; se inevitável, valide/escape rigorosamente a entrada (prefira execFile com args separados).',
  },
  {
    id: 'sec-tls-verify-false',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /rejectUnauthorized\s*:\s*false|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]?0/,
    problema: 'Verificação de certificado TLS desativada.',
    recomendacao: 'Mantenha a verificação de certificado ligada; resolva o problema real do certificado.',
  },
  {
    id: 'sec-dangerous-html',
    severidade: 'MODERADO',
    categoria: 'Segurança',
    regex: /dangerouslySetInnerHTML/,
    problema: 'Injeção de HTML sem sanitização (risco de XSS).',
    recomendacao: 'Sanitize o conteúdo antes de renderizar, ou evite dangerouslySetInnerHTML.',
  },
  {
    id: 'sec-raw-sql',
    severidade: 'PERIGO',
    categoria: 'Segurança',
    regex: /\$queryRawUnsafe\s*\(|\$executeRawUnsafe\s*\(/,
    problema: 'SQL cru sem parametrização segura (Prisma $queryRawUnsafe/$executeRawUnsafe).',
    recomendacao: 'Prefira $queryRaw/$executeRaw com template literal (parametrizado) ou o query builder do Prisma.',
  },
];

// Regras aplicadas ao CAMINHO dos arquivos alterados.
const REGRAS_CAMINHO = [
  {
    id: 'deploy-pipeline',
    severidade: 'PERIGO',
    categoria: 'Deploy/CI',
    teste: (p) => p.startsWith('.github/workflows/'),
    problema: 'Alteração em workflow de deploy/CI (push na branch principal aciona deploy automático no Vercel).',
    recomendacao: 'Revise com atenção: erro aqui quebra o deploy de produção.',
  },
  {
    id: 'schema-migration',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => p.startsWith('prisma/migrations/'),
    problema: 'Nova migration / mudança de schema (o build do Vercel roda `prisma migrate deploy`).',
    recomendacao: 'Confirme reversibilidade e impacto em dados de produção antes de mergear.',
  },
  {
    id: 'schema-prisma-tocado',
    severidade: 'MODERADO',
    categoria: 'Schema',
    teste: (p) => p === 'prisma/schema.prisma',
    problema: 'Arquivo de schema Prisma alterado.',
    recomendacao: 'Confira se falta gerar/aplicar uma migration (`npx prisma migrate dev`) e o impacto em dados existentes.',
  },
  {
    id: 'config-central-tocada',
    severidade: 'MODERADO',
    categoria: 'Config',
    teste: (p) =>
      p === 'src/lib/db.ts' ||
      p === 'src/lib/auth.ts' ||
      p === 'src/lib/auth.config.ts' ||
      p === 'prisma.config.ts' ||
      p === 'next.config.ts',
    problema: 'Arquivo de configuração central alterado (banco, autenticação ou build).',
    recomendacao: 'Revise com atenção — erro aqui afeta login/banco/build da aplicação inteira.',
  },
];

const FALHA_SILENCIOSA = {
  id: 'sec-catch-vazio',
  severidade: 'MODERADO',
  categoria: 'Robustez',
  problema: 'catch vazio engole o erro silenciosamente.',
  recomendacao: 'Logue ou trate o erro; não silencie em caminho crítico (Server Action, auth, envio ao Omie).',
};

function novoAchado(regra, arquivo, trecho, linha) {
  return {
    id: regra.id,
    severidade: regra.severidade,
    categoria: regra.categoria,
    arquivo: arquivo || '(desconhecido)',
    linha: linha || null,
    problema: regra.problema,
    porque: regra.porque || '',
    recomendacao: regra.recomendacao,
    trecho: trecho ? trecho.trim().slice(0, 140) : '',
    fonte: 'regra',
  };
}

// Extrai (arquivo, linhaAdicionada, número da linha) do diff unificado, lendo o
// cabeçalho de hunk (@@ -a,b +c,d @@) pra numerar as linhas do arquivo novo.
function* linhasAdicionadas(diff) {
  let arquivo = null;
  let linhaNova = 0;
  const linhas = diff.split('\n');
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (linha.startsWith('+++ b/')) {
      arquivo = linha.slice(6).trim();
      linhaNova = 0;
      continue;
    }
    if (linha.startsWith('+++') || linha.startsWith('---')) continue;
    const hunk = linha.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
    if (hunk) {
      linhaNova = parseInt(hunk[1], 10);
      continue;
    }
    if (linha.startsWith('-') || linha.startsWith('\\')) continue; // removida / "No newline"
    if (linha.startsWith('+')) {
      const proxima = linhas[i + 1];
      yield {
        arquivo,
        conteudo: linha.slice(1),
        linha: linhaNova,
        proximaAdicionada: proxima && proxima.startsWith('+') ? proxima.slice(1) : null,
      };
      linhaNova++;
      continue;
    }
    linhaNova++; // linha de contexto
  }
}

// catch vazio numa linha só: `catch { }` / `catch (e) { }` / `} catch {}`.
const CATCH_VAZIO_UMA_LINHA = /\bcatch\s*(\([^)]*\))?\s*\{\s*\}/;
// abre um catch e não fecha na mesma linha: `catch (e) {` ou `catch {`.
const CATCH_ABRE_BLOCO = /\bcatch\s*(\([^)]*\))?\s*\{\s*$/;

function escanearDiff(diff) {
  if (!diff) return [];
  const achados = [];
  for (const { arquivo, conteudo, linha, proximaAdicionada } of linhasAdicionadas(diff)) {
    for (const regra of REGRAS_LINHA) {
      if (regra.soArquivo && !(arquivo && regra.soArquivo.test(arquivo))) continue;
      if (regra.guard && regra.guard.test(conteudo)) continue;
      if (regra.regex.test(conteudo)) achados.push(novoAchado(regra, arquivo, conteudo, linha));
    }

    const catchVazioMesmaLinha = CATCH_VAZIO_UMA_LINHA.test(conteudo);
    const catchAbreEFechaVazio =
      CATCH_ABRE_BLOCO.test(conteudo) && proximaAdicionada && /^\s*\}\s*$/.test(proximaAdicionada);
    if (catchVazioMesmaLinha || catchAbreEFechaVazio) {
      achados.push(novoAchado(FALHA_SILENCIOSA, arquivo, conteudo, linha));
    }
  }
  return achados;
}

function escanearCaminhos(arquivos) {
  const achados = [];
  for (const arq of arquivos) {
    for (const regra of REGRAS_CAMINHO) {
      if (regra.teste(arq)) achados.push(novoAchado(regra, arq, '', null));
    }
  }
  return achados;
}

// Dedup por (arquivo + id): várias linhas batendo na mesma regra viram um achado só.
function dedup(achados) {
  const vistos = new Set();
  const saida = [];
  for (const a of achados) {
    const chave = `${a.arquivo}::${a.id}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(a);
  }
  return saida;
}

function escanear(diff, arquivos = []) {
  return dedup([...escanearDiff(diff), ...escanearCaminhos(arquivos)]);
}

module.exports = { escanear, escanearDiff, escanearCaminhos };
