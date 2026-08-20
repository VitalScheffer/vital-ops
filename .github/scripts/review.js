const fs = require('fs');
const path = require('path');
const { chamarGemini } = require('./lib/gemini');
const { escanear } = require('./lib/security-rules');
const { mapearAreas, inferirEscopoDeclarado, detectarForaDeEscopo } = require('./lib/scope');
const { calcularVeredito, montarComentario, resumoCurto, blocoCard, VEREDITO } = require('./lib/render');
const { buscarComentarioSticky, postarOuAtualizarComentario, aplicarLabelVeredito, sincronizarReview } = require('./lib/github');
const { atualizarCardDoPR } = require('./lib/trello');

// Modelos em ordem de preferência (fallback em 404/429/5xx). Sobrescrevível por
// vars.GEMINI_MODEL (lista separada por vírgula).
//
// Esta lista tem que espelhar a variável GEMINI_MODEL configurada nos repositórios.
// Ela é o que vale se a variável for apagada, e uma lista defasada aqui faria a
// revisão voltar a um modelo antigo sem ninguém perceber.
const DEFAULT_MODELS = [
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.5-flash',
  'gemini-3.1-flash-lite',
  'gemini-3-flash-preview',
  'gemini-2.5-flash',
];
const MODELOS = (process.env.GEMINI_MODEL || '')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const MODELS = MODELOS.length ? MODELOS : DEFAULT_MODELS;

const MAX_DIFF_CHARS = 100000;

// O SESSION_LOG cresce para sempre (hoje, 558 KB) e ia inteiro no prompt, sem teto,
// enquanto o diff tinha limite de 100 mil. Resultado: o histórico ocupava cinco vezes
// mais espaço que o código sendo revisado, e o que importa virava minoria no contexto.
// Só a cauda interessa: o que aconteceu recentemente no projeto.
const MAX_SESSION_LOG_CHARS = 15000;

const SCHEMA_REVISAO = {
  type: 'object',
  properties: {
    resumo: { type: 'string' },
    fora_do_escopo: { type: 'boolean' },
    justificativa_escopo: { type: 'string' },
    achados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severidade: { type: 'string', enum: ['PERIGO', 'MODERADO', 'BAIXO'] },
          categoria: { type: 'string' },
          arquivo: { type: 'string' },
          linha: { type: 'integer' },
          problema: { type: 'string' },
          porque: { type: 'string' },
          recomendacao: { type: 'string' },
        },
        required: ['severidade', 'categoria', 'arquivo', 'linha', 'problema', 'porque', 'recomendacao'],
      },
    },
  },
  required: ['resumo', 'fora_do_escopo', 'achados'],
};

function lerArquivo(caminho, padrao = '') {
  for (const c of [caminho, caminho.toLowerCase()]) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  }
  return padrao;
}

// Converte `git diff --name-status` em lista de caminhos (no rename pega o destino).
function parsearArquivos(nameStatus) {
  return nameStatus
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const partes = l.split('\t');
      return partes[partes.length - 1];
    });
}

function montarPrompt({ title, body, commits, escopoDeclarado, areasAlteradas, sessionLog, diff }) {
  return `Você é um revisor de código RIGOROSO de um CRM em produção onde push na main = deploy automático.
Sua prioridade é SEGURANÇA e BUGS.

Só reporte o que você consegue apontar em uma linha concreta do diff e cuja consequência você consegue descrever. Sem certeza de que é defeito, use severidade menor ou não reporte. Um achado falso custa mais caro que um achado ausente: PERIGO reprova o PR, e reprovar sem motivo ensina o time a ignorar a revisão inteira.

Não reporte preferência de estilo, refatoração sem defeito associado, nem observação genérica do tipo "considere avaliar". Um pré-scan determinístico já cobre segredo hardcoded, .env versionado, eval/exec, TLS desligado e alteração de deploy/CI: não repita esses achados, foque no que exige entender o código.

Três coisas que exigem entender o código e costumam passar batido:

1. CORREÇÃO QUE NÃO FECHA O CASO. Se o PR se apresenta como conserto de um defeito, verifique se ele resolve o problema inteiro ou só o estreita. Conserto que deixa janela de erro é achado: diga qual é a janela e o que o usuário vê dentro dela. "Melhor que antes" não é o mesmo que "corrigido".

2. INTERVALO, TIMEOUT E POLLING. Se o diff introduz um, calcule o pior caso em unidade humana (segundos, minutos) e diga o que acontece nesse intervalo. Um número em milissegundos no código esconde a consequência; 20 * 60 * 1000 é vinte minutos de estado errado na tela.

3. ESTADO QUE PODIA SER DERIVADO. Valor guardado em memória que dá para calcular a partir de outro dado já disponível tende a divergir da verdade, e o conserto vira uma correção periódica em vez de deixar de existir. Se for o caso, diga de onde o valor poderia ser derivado.

Proposta, design ou documentação incluídos no próprio diff são o argumento de quem escreveu, não prova de que a decisão está certa. Avalie a decisão descrita ali com o mesmo rigor do código; não a aceite só porque veio justificada.

Regras de severidade:
- PERIGO: bypass de autenticação/autorização, segredo/credencial hardcoded, DEBUG=True, CORS/CSRF liberado, qualquer coisa que exponha ou quebre produção. Reserve para o que você tem certeza.
- MODERADO: bug provável de lógica/UX, mudança de schema/migration, tratamento de erro fraco, dependência nova, alteração em deploy/CI.
- BAIXO: estilo, nomenclatura, sugestão, débito técnico.

Avalie também se o PR foge do ESCOPO declarado da tarefa (ex.: tarefa de frontend que altera backend, ou vice-versa). Defina fora_do_escopo=true só se as áreas alteradas realmente extrapolarem o que a tarefa pedia.

Contexto da tarefa:
- Título: ${title}
- Descrição: ${body}
- Commits: ${commits}
- Escopo declarado (inferido): ${escopoDeclarado.areas.join(', ') || 'não declarado'}
- Áreas realmente alteradas: ${areasAlteradas.join(', ') || '-'}

Histórico do projeto (SESSION_LOG.md):
${sessionLog}

Diff:
${diff}

Para CADA achado, preencha TODOS os campos:
- "arquivo": o caminho do arquivo afetado.
- "linha": o número da linha (no arquivo novo) onde está o problema — use a numeração do diff.
- "problema": O QUÊ está errado.
- "porque": POR QUÊ isso é um problema/risco (o impacto concreto se for pra produção).
- "recomendacao": COMO CORRIGIR de forma concreta e acionável (o que mudar exatamente; inclua um exemplo curto de código quando ajudar) — não basta apontar.

Responda SOMENTE no JSON do schema. Não repita achados óbvios de segurança que já são evidentes no diff de forma redundante; foque no que importa.`;
}

function normalizarAchadosIA(achados) {
  const validas = new Set(['PERIGO', 'MODERADO', 'BAIXO']);
  return (achados || []).map((a) => ({
    severidade: validas.has(a.severidade) ? a.severidade : 'BAIXO',
    categoria: a.categoria || 'Geral',
    arquivo: a.arquivo || '(geral)',
    linha: a.linha || null,
    problema: a.problema || '',
    porque: a.porque || '',
    recomendacao: a.recomendacao || '',
    fonte: 'ia',
  }));
}

async function obterRevisaoIA(prompt) {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY ausente — seguindo só com o pré-scan determinístico.');
    return { indisponivel: true, achados: [], escopo: {}, resumo: "", modelo: null };
  }

  const { modelo, texto } = await chamarGemini({
    apiKey: process.env.GEMINI_API_KEY,
    modelos: MODELS,
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA_REVISAO, temperature: 0.2 },
  });

  if (!texto) {
    console.error('Nenhum modelo do Gemini respondeu — seguindo só com o pré-scan.');
    return { indisponivel: true, achados: [], escopo: {}, resumo: "", modelo: null };
  }

  try {
    const json = JSON.parse(texto);
    return {
      indisponivel: false,
      achados: normalizarAchadosIA(json.achados),
      escopo: { fora_do_escopo: json.fora_do_escopo === true, justificativa: json.justificativa_escopo || '' },
      resumo: json.resumo || '',
      modelo,
    };
  } catch (err) {
    console.error('JSON inválido do Gemini — seguindo só com o pré-scan:', err.message);
    return { indisponivel: true, achados: [], escopo: {}, resumo: "", modelo: null };
  }
}

function avaliarEscopo({ escopoDeclarado, areasAlteradas, escopoIA }) {
  const determinístico = detectarForaDeEscopo(escopoDeclarado, areasAlteradas);
  if (determinístico) return determinístico;

  // Corroboração para a alegação do LLM: precisa existir área "extra" de fato.
  const naoNeutras = areasAlteradas.filter((a) => a !== 'specs' && a !== 'outros');
  const extras = escopoDeclarado.areas.length
    ? naoNeutras.filter((a) => !escopoDeclarado.areas.includes(a))
    : naoNeutras.length > 1
      ? naoNeutras
      : [];

  if (escopoIA?.fora_do_escopo && extras.length > 0) {
    return {
      severidade: 'PERIGO',
      categoria: 'Escopo',
      arquivo: '(geral)',
      problema: escopoIA.justificativa || `PR altera áreas fora do escopo: ${extras.join(', ')}.`,
      recomendacao: 'Separe o que está fora do escopo em outro PR ou ajuste a descrição da tarefa.',
      fonte: 'ia',
    };
  }
  return null;
}

function dadosDoPR() {
  const repo = process.env.GITHUB_REPOSITORY;
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  return { repo, prNumber: event.pull_request.number, autorLogin: event.pull_request.user?.login || '' };
}

// De-para login do GitHub -> membro do Trello (.github/trello-members.json).
// Login do GitHub não diferencia maiúscula de minúscula, então a busca também
// não pode diferenciar: cadastrar "devvitalcamillo" e receber "DevVitalCamillo"
// deixava o card sem responsável sem avisar ninguém.
function membroTrelloDoAutor(autorLogin) {
  if (!autorLogin) return null;
  const arquivo = path.join(__dirname, '..', 'trello-members.json');
  let mapa;
  try {
    mapa = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  } catch {
    console.error('Trello: .github/trello-members.json ausente ou inválido; card ficará sem responsável.');
    return null;
  }

  const procurado = String(autorLogin).toLowerCase();
  for (const [login, membro] of Object.entries(mapa)) {
    if (login.startsWith('_')) continue;
    if (login.toLowerCase() === procurado) return membro;
  }

  console.error(
    `Trello: o login "${autorLogin}" não está em .github/trello-members.json, ` +
      'então o card ficará sem responsável. Adicione a linha ' +
      `"${autorLogin}": "<usuario ou nome no Trello>".`
  );
  return null;
}

async function run() {
  const title = process.env.PR_TITLE || '';
  const body = process.env.PR_BODY || '';
  const commits = lerArquivo('commits.txt');
  const nameStatus = lerArquivo('changed_files.txt');
  const conflito = lerArquivo('conflicts.txt').toLowerCase().includes('conflito');
  let diff = lerArquivo('diff.txt');

  const arquivos = parsearArquivos(nameStatus);
  if (!diff.trim() && arquivos.length === 0) {
    console.log('Nada para revisar (sem diff e sem arquivos alterados).');
    return;
  }
  if (diff.length > MAX_DIFF_CHARS) {
    diff = diff.slice(0, MAX_DIFF_CHARS) + '\n\n[... diff truncado para a revisão ...]';
  }

  // A cauda, não o começo: as entradas mais recentes ficam no fim do arquivo.
  const sessionLogBruto = lerArquivo('SESSION_LOG.md', 'SESSION_LOG.md não encontrado no checkout.');
  const sessionLog =
    sessionLogBruto.length > MAX_SESSION_LOG_CHARS
      ? '[... histórico antigo omitido ...]\n\n' + sessionLogBruto.slice(-MAX_SESSION_LOG_CHARS)
      : sessionLogBruto;
  const { areas: areasAlteradas } = mapearAreas(arquivos);
  const escopoDeclarado = inferirEscopoDeclarado(`${title}\n${body}\n${commits}`);

  // 1) Pré-scan determinístico (independe do LLM).
  const achados = escanear(diff, arquivos);

  // 2) Revisão de IA (best-effort; cai pro pré-scan se indisponível).
  const prompt = montarPrompt({ title, body, commits, escopoDeclarado, areasAlteradas, sessionLog, diff });
  const ia = await obterRevisaoIA(prompt);
  achados.push(...ia.achados);

  // 3) Fora de escopo (determinístico explícito ou alegação do LLM corroborada).
  const achadoEscopo = avaliarEscopo({ escopoDeclarado, areasAlteradas, escopoIA: ia.escopo });
  if (achadoEscopo) achados.push(achadoEscopo);

  const veredito = calcularVeredito({ achados, conflito, iaIndisponivel: ia.indisponivel });
  const comentario = montarComentario({
    veredito,
    achados,
    escopoDeclarado,
    areasAlteradas,
    conflito,
    modeloUsado: ia.modelo,
    iaIndisponivel: ia.indisponivel,
  });

  const { repo, prNumber, autorLogin } = dadosDoPR();
  const resumo = resumoCurto({ veredito, achados });

  // Trello (best-effort) primeiro, pra já incluir o link do card no comentário.
  // Recupera o link guardado numa revisão anterior pra não criar card duplicado.
  const sticky = await buscarComentarioSticky({ repo, prNumber }).catch(() => null);
  const prevShortlink = sticky?.body?.match(/<!-- card:([A-Za-z0-9]+) -->/)?.[1] || null;

  let cardLinha = '';
  try {
    const prUrl = `https://github.com/${repo}/pull/${prNumber}`;
    const r = await atualizarCardDoPR({
      texto: `${body}\n${commits}\n${process.env.HEAD_REF || ''}`,
      prevShortlink,
      veredito,
      bloco: blocoCard({ veredito, resumoIA: ia.resumo, achados }),
      dadosCard: { nome: `PR #${prNumber}: ${title}`.slice(0, 250), descricaoTarefa: body, prUrl },
      membroTrello: membroTrelloDoAutor(autorLogin),
      cfg: {
        key: process.env.TRELLO_KEY,
        token: process.env.TRELLO_TOKEN,
        listaAprovado: process.env.TRELLO_LIST_APROVADO,
        listaBloqueado: process.env.TRELLO_LIST_BLOQUEADO,
        listaPRAberto: process.env.TRELLO_LIST_PRABERTO,
      },
    });
    console.log('Trello:', JSON.stringify(r));
    if (r.feito && r.shortlink) {
      const acao = r.criado ? 'Card criado no Trello' : 'Card no Trello';
      const atrib = r.membro ? ` · atribuído a \`${r.membro}\`` : '';
      cardLinha = `\n\n🗂️ ${acao}: ${r.url}${atrib} <!-- card:${r.shortlink} -->`;
    }
  } catch (err) {
    console.error('Trello falhou:', err.message);
  }

  await postarOuAtualizarComentario({ repo, prNumber, corpo: comentario + cardLinha });
  await aplicarLabelVeredito({ repo, prNumber, veredito });

  try {
    await sincronizarReview({ repo, prNumber, veredito, corpo: resumo });
  } catch (err) {
    console.error('PR review falhou:', err.message);
  }

  // Sem branch protection (plano free) o check vermelho não bloqueia o merge e só
  // parece um erro de execução. Por padrão saímos com 0 (workflow verde) e o bloqueio
  // é sinalizado por: review "Changes requested" + label 🛑 + comentário + Trello.
  // Pra forçar o check a falhar (ex.: se ligar branch protection), defina a var de
  // repositório BLOQUEAR_REPROVA_CHECK=true.
  const reprovaCheck = process.env.BLOQUEAR_REPROVA_CHECK === 'true';
  const exit = reprovaCheck ? VEREDITO[veredito].exit : 0;
  console.log(`Veredito: ${veredito} (check ${VEREDITO[veredito].exit === 1 ? 'reprovado' : 'aprovado'}, exit ${exit}).`);
  process.exit(exit);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
