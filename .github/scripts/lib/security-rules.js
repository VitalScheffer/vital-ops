// Pré-scan determinístico do diff. NÃO depende do LLM: pega padrões catastróficos
// conhecidos e força o achado independente do que o Gemini "achar". É a rede de
// segurança que impede um PERIGO de ser "aprovado com ressalvas".
//
// As regras são compostas: `rules/core.js` vale para qualquer repositório, e os
// módulos de stack (django, spring, next, prisma, infra) entram só onde a stack
// realmente existe. Antes tudo morava num arquivo só, que foi copiado para 13
// repositórios e já começou a divergir; corrigir uma regex exigia repetir a mesma
// edição em cada cópia.

const fs = require('fs');
const path = require('path');
const core = require('./rules/core');

// Marcador -> módulo. A detecção olha o checkout (o workflow faz checkout completo),
// então "tem pom.xml" é evidência direta de que as regras de Spring fazem sentido ali.
const STACKS = [
  { nome: 'django', modulo: 'django', marcadores: ['manage.py'] },
  { nome: 'spring', modulo: 'spring', marcadores: ['pom.xml', 'build.gradle', 'build.gradle.kts'] },
  {
    nome: 'next',
    modulo: 'next',
    marcadores: ['next.config.js', 'next.config.ts', 'next.config.mjs', 'frontend/next.config.js'],
  },
  { nome: 'prisma', modulo: 'prisma', marcadores: ['prisma/schema.prisma'] },
  { nome: 'infra', modulo: 'infra', marcadores: ['docker-compose.yml', 'docker-compose.yaml', 'mosquitto.conf'] },
];

/**
 * Stacks presentes no repositório.
 *
 * REVISOR_STACKS sobrescreve a detecção (lista separada por vírgula). Serve para
 * teste e para o caso de um repositório cuja stack não é adivinhável pelos arquivos.
 */
function detectarStacks(raiz = process.cwd()) {
  const forcado = (process.env.REVISOR_STACKS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (forcado.length) return forcado;

  return STACKS.filter((s) => s.marcadores.some((m) => fs.existsSync(path.join(raiz, m)))).map((s) => s.nome);
}

function carregarModulo(nome) {
  try {
    return require(`./rules/${nome}`);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND') return null;
    throw err;
  }
}

function montarRegras(stacks) {
  const linha = [...core.REGRAS_LINHA];
  const caminho = [...core.REGRAS_CAMINHO];
  const pares = [];

  for (const nome of stacks) {
    const mod = carregarModulo(nome);
    if (!mod) continue;
    linha.push(...(mod.REGRAS_LINHA || []));
    caminho.push(...(mod.REGRAS_CAMINHO || []));
    pares.push(...(mod.PARES || []));
  }

  return { linha, caminho, pares };
}

function ehTeste(arquivo) {
  return !!arquivo && (core.ARQUIVO_DE_TESTE.test(arquivo) || core.NOME_DE_TESTE.test(arquivo));
}

function novoAchado(regra, arquivo, trecho, linha, severidade) {
  return {
    id: regra.id,
    severidade: severidade || regra.severidade,
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

function escanearDiff(diff, regras = montarRegras(detectarStacks())) {
  if (!diff) return [];
  const { linha: regrasLinha, pares } = regras;
  const achados = [];

  for (const { arquivo, conteudo, linha, proximaAdicionada } of linhasAdicionadas(diff)) {
    // Documentação não é código: aplicar regex de código em prosa gera achado a
    // partir de uma frase. Um README que diz "não existe auto-login neste sistema"
    // virava PERIGO de bypass de autenticação.
    if (arquivo && core.ARQUIVO_DE_PROSA.test(arquivo)) continue;

    // Código gerado ou de terceiro não passa por revisão humana, então acusá-lo não
    // muda decisão nenhuma e só enche o relatório.
    if (arquivo && (core.CAMINHO_GERADO.test(arquivo) || core.ARQUIVO_GERADO.test(arquivo))) continue;

    const emTeste = ehTeste(arquivo);

    for (const regra of regrasLinha) {
      if (regra.soArquivo && !(arquivo && regra.soArquivo.test(arquivo))) continue;
      if (regra.naoArquivo && arquivo && regra.naoArquivo.test(arquivo)) continue;
      if (regra.guard && regra.guard.test(conteudo)) continue;
      if (!regra.regex.test(conteudo)) continue;

      // Credencial em fixture/seed quase sempre é valor de mentira. Rebaixar em vez
      // de ignorar mantém o achado visível sem reprovar o PR por causa dele.
      const severidade = emTeste && regra.rebaixarEmTeste ? 'MODERADO' : regra.severidade;
      achados.push(novoAchado(regra, arquivo, conteudo, linha, severidade));
    }

    for (const par of pares) {
      if (par.abre.test(conteudo) && proximaAdicionada && par.silencia.test(proximaAdicionada)) {
        achados.push(novoAchado(par, arquivo, conteudo, linha));
      }
    }
  }

  return achados;
}

function escanearCaminhos(arquivos, regras = montarRegras(detectarStacks())) {
  const achados = [];
  for (const arq of arquivos) {
    for (const regra of regras.caminho) {
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

function escanear(diff, arquivos = [], opcoes = {}) {
  const stacks = opcoes.stacks || detectarStacks(opcoes.raiz);
  const regras = montarRegras(stacks);
  return dedup([...escanearDiff(diff, regras), ...escanearCaminhos(arquivos, regras)]);
}

module.exports = { escanear, escanearDiff, escanearCaminhos, detectarStacks, montarRegras };
