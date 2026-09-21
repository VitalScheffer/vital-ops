// Orquestração do envio de produtos ao Omie (Fase 2, parte 2).
//
// Fluxo SEQUENCIAL e ban-safe (REQUISITOS §6/§7): famílias → produtos → estrutura.
// Nada de disparo em paralelo. Confia no breaker/cache do client Omie
// (src/lib/omie) e usa a estratégia write-then-handle-duplicate: NÃO consulta
// antes; chama Upsert/Incluir e trata OmieDuplicate como sucesso idempotente.
//
// Módulo PURO: não toca no banco nem na sessão — recebe `chamar` por parâmetro
// (facilita mockar nos testes). A persistência/auditoria fica na Server Action.

import type { EstruturaRel, Familia, ParsedItem } from "@/lib/bom/types";
import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { OmieBlocked, OmieCodeConflict, OmieDescriptionConflict, OmieDuplicate } from "@/lib/omie/errors";
import { normalizarNcm } from "./ncm";

// Assinatura mínima de `chamar` do client Omie (o real é compatível com esta).
export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

const WRITE: ChamarOptions = { write: true };

// Fixos confirmados pelo usuário (REQUISITOS §7/§8). O NCM deixou de ser fixo em
// 09/07/2026: o usuário escolhe por envio na tela; `NCM_PADRAO` é só o default.
const UNIDADE_FIXA = "UN";
const TIPO_ITEM_FIXO = "04";

const MOTIVO_NAO_ENVIADO = "Lote interrompido antes de chegar neste item.";

// "atualizado" só existe na estrutura: a relação já estava no Omie com outra
// quantidade e foi sobrescrita (AlterarEstrutura).
export type OutcomeEnvio = "enviado" | "atualizado" | "ja_existia" | "falha" | "nao_enviado";
export type OutcomeRemocao = "removido" | "falha" | "nao_enviado";

export interface FamiliaResultado {
  familia: Familia;
  codFamilia: string;
  nomeFamilia: string;
  codigoFamilia?: string; // id da família retornado pelo Omie (para exibição)
  outcome: OutcomeEnvio;
  motivo?: string;
}

export interface ProdutoResultado {
  codigo: string;
  descricao: string;
  outcome: OutcomeEnvio;
  motivo?: string;
  omieCodigoProduto?: string;
}

export interface EstruturaResultado {
  numeroPai: string;
  numeroFilho: string;
  codigoPai: string;
  codigoFilho: string;
  outcome: OutcomeEnvio;
  motivo?: string;
  detalhe?: string; // informativo, não é erro (ex.: "Quantidade 1 → 4")
}

// Linha que estava na estrutura do Omie e não está na BOM enviada: sai do Omie
// pra estrutura ficar igual à BOM. Vem do próprio Omie, então não tem número
// da BOM: guarda o que é preciso pra alguém recolocar à mão, se for o caso.
export interface RemocaoResultado {
  codigoPai: string;
  codigoFilho: string;
  descricaoFilho?: string;
  quantidade?: number;
  idMalha?: string;
  outcome: OutcomeRemocao;
  motivo?: string;
}

export interface EnvioTotais {
  produtos: number; // total de itens "novo" processados
  enviados: number;
  jaExistiam: number;
  falhas: number;
  naoEnviados: number; // não alcançados por interrupção do lote
  recusados: number; // recebidos mas que não eram "novo" (não enviados de propósito)
}

export interface EnvioResultado {
  familias: FamiliaResultado[];
  produtos: ProdutoResultado[];
  estrutura: EstruturaResultado[];
  remocoes: RemocaoResultado[];
  // Pais que talvez já tivessem estrutura no Omie mas não foram lidos (leitura
  // pausada ou com erro): neles só houve inclusão, sem sobrescrever quantidade
  // nem remover o que saiu da BOM. A tela pede pra reenviar.
  paisNaoConferidos: string[];
  interrompido: boolean;
  bloqueado: boolean; // interrompido especificamente por bloqueio do Omie/breaker
  motivoInterrupcao?: string;
  totais: EnvioTotais;
}

export interface EnvioInput {
  novos: ParsedItem[];
  estrutura: EstruturaRel[];
  // NCM escolhido pelo usuário para os produtos NOVOS deste envio. Ausente/inválido
  // cai no NCM_PADRAO. Não afeta produtos que já existem (esses são pulados).
  ncm?: string;
}

function semEspaco(codigo: string): string {
  return codigo.replace(/\s+/g, "");
}

// `intMalha` é o "código de integração da malha" que o Omie EXIGE em cada item do
// IncluirEstrutura (erro "O preenchimento da tag [intMalha] é obrigatório!" quando
// ausente). É `string20` (máx. 20 chars), então "PAI-FILHO" concatenado estoura.
// Geramos um id determinístico de "pai|filho" (dois hashes independentes, FNV-1a +
// djb2, em base36) — cabe em 20 chars, é ESTÁVEL entre reenvios (a mesma relação
// vira duplicado idempotente) e ÚNICO por par pai/filho (a mesma peça em duas
// submontagens diferentes recebe intMalha distinto, senão uma das duas seria
// recusada como duplicada e ficaria sem vínculo).
function intMalhaDe(codigoPai: string, codigoFilho: string): string {
  const chave = `${semEspaco(codigoPai)}|${semEspaco(codigoFilho)}`;
  let fnv = 0x811c9dc5;
  let djb = 5381;
  for (let i = 0; i < chave.length; i++) {
    const c = chave.charCodeAt(i);
    fnv = Math.imul(fnv ^ c, 0x01000193) >>> 0;
    djb = (((djb << 5) + djb + c) >>> 0);
  }
  // Separador entre os dois hashes: remove a ambiguidade de concatenação
  // ("1a"+"2b3" vs "1a2"+"b3"). O "-" é aceito no intMalha (ex. da doc: "MALHA-001").
  // Comprimento máximo: 7 + 1 + 7 = 15, dentro do string20.
  return `${fnv.toString(36)}-${djb.toString(36)}`.slice(0, 20);
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

// A família é gravada com a DESCRIÇÃO igual ao rótulo inteiro que aparece na
// seleção ("SBM - SUBMONTAGEM"), a pedido do Vitor (09/07/2026) — antes gravava só
// "SUBMONTAGEM". O código continua o prefixo curto ("SBM"), que é a chave estável do
// Upsert (mudar o código/codInt criaria uma família NOVA em vez de atualizar a
// existente). "SBM - SUBMONTAGEM" → { codFamilia: "SBM", nomeFamilia: "SBM - SUBMONTAGEM" }.
function partesFamilia(familia: Familia): { codFamilia: string; nomeFamilia: string } {
  const [cod] = familia.split(" - ");
  return { codFamilia: cod.trim(), nomeFamilia: familia };
}

function familiasDistintas(itens: ParsedItem[]): Familia[] {
  const vistas = new Set<Familia>();
  const ordem: Familia[] = [];
  for (const item of itens) {
    if (!item.familia || vistas.has(item.familia)) continue;
    vistas.add(item.familia);
    ordem.push(item.familia);
  }
  return ordem;
}

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

// Extrai o código do produto conflitante da mensagem do Omie (conflito de
// DESCRIÇÃO): "...produto com código COMDB P0381 018AC." → "COMDB P0381 018AC".
const CODIGO_CONFLITANTE = /produto com c[oó]digo\s+([^.]+)\.?\s*$/i;

function extrairCodigoConflitante(mensagem: string): string | null {
  const match = CODIGO_CONFLITANTE.exec(mensagem.trim());
  return match ? match[1].trim() : null;
}

// Extrai o ID interno do produto conflitante da mensagem do Omie (conflito de
// CÓDIGO): "...produto com ID 12123048648." → "12123048648".
const ID_CONFLITANTE = /produto com id\s+(\d+)/i;

function extrairIdConflitante(mensagem: string): string | null {
  const match = ID_CONFLITANTE.exec(mensagem);
  return match ? match[1] : null;
}

interface ProdutoExistente {
  codigoProduto?: string;
  codigoProdutoIntegracao?: string;
}

// Busca (READ, não conta como escrita) o produto já cadastrado sob outro
// código — usado só depois de um conflito de descrição confirmado pelo Omie,
// nunca preventivamente (write-then-handle-duplicate, REQUISITOS §6).
async function resolverProdutoExistente(codigo: string, chamar: ChamarFn): Promise<ProdutoExistente | null> {
  const resp = await chamar("geral/produtos/", "ListarProdutos", {
    pagina: 1,
    registros_por_pagina: 1,
    apenas_importado_api: "N",
    filtrar_apenas_omiepdv: "N",
    produtosPorCodigo: [{ codigo }],
  });
  const lista = resp?.produto_servico_cadastro;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  const produto = lista[0] as OmiePayload;
  return {
    codigoProduto: texto(produto.codigo_produto),
    codigoProdutoIntegracao: texto(produto.codigo_produto_integracao) || undefined,
  };
}

// Busca (READ) o produto já cadastrado sob outro ID interno — usado só depois
// de um conflito de CÓDIGO confirmado pelo Omie (a mensagem já cita o ID do
// cadastro existente). `ConsultarProduto` aceita `codigo_produto` (ID interno)
// como chave principal (doc oficial: "É o ID do produto e será utilizado
// apenas nas APIs como chave principal para localizar um produto").
async function resolverProdutoExistentePorId(
  codigoProduto: string,
  chamar: ChamarFn,
): Promise<ProdutoExistente | null> {
  const resp = await chamar("geral/produtos/", "ConsultarProduto", {
    codigo_produto: Number(codigoProduto),
  });
  if (!resp) return null;
  return {
    codigoProduto: texto(resp.codigo_produto),
    codigoProdutoIntegracao: texto(resp.codigo_produto_integracao) || undefined,
  };
}

// Um cadastro já existente no Omie descoberto pela pré-checagem em lote.
interface CadastroExistente {
  idProduto?: string; // codigo_produto (ID interno do Omie)
  intProduto?: string; // codigo_produto_integracao real, quando preenchido
}

// Divide uma lista em blocos de tamanho fixo (respeita o limite de registros por
// página da Omie na leitura em lote).
function emBlocos<T>(itens: T[], tamanho: number): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) blocos.push(itens.slice(i, i + tamanho));
  return blocos;
}

const BLOCO_PRECHECK = 50;

// Pré-checa (LEITURA em lote) quais códigos já estão cadastrados no Omie. Uma
// leitura que dá certo é requisição CORRETA — não conta pro contador de bloqueio
// da Omie (que dispara na 10ª requisição INCORRETA no mesmo método). Isso deixa o
// orquestrador PULAR o UpsertProduto dos que já existem, que hoje volta erro de
// conflito e é justamente o que estoura esse contador (peça padrão já cadastrada).
// Reusa o mesmo call já provado em produção (`ListarProdutos` + `produtosPorCodigo`),
// só que com vários códigos por chamada. Falha na leitura NÃO interrompe o envio:
// só perde a otimização (cai no caminho antigo de tentar o Upsert e tratar o
// conflito); apenas `OmieBlocked` (bloqueio real) interrompe o lote.
async function precarregarExistentes(
  codigos: string[],
  chamar: ChamarFn,
  interromper: (erro: unknown) => void,
): Promise<{ mapa: Map<string, CadastroExistente>; completo: boolean }> {
  const mapa = new Map<string, CadastroExistente>();
  // `completo` = todos os blocos foram lidos. Quando um bloco falha, a ausência
  // de um código no mapa deixa de significar "não existe no Omie" — só "não deu
  // pra saber" —, e quem decide a partir disso precisa saber a diferença.
  let completo = true;
  for (const bloco of emBlocos(codigos, BLOCO_PRECHECK)) {
    try {
      const resp = await chamar("geral/produtos/", "ListarProdutos", {
        pagina: 1,
        registros_por_pagina: 100,
        apenas_importado_api: "N",
        filtrar_apenas_omiepdv: "N",
        produtosPorCodigo: bloco.map((codigo) => ({ codigo })),
      });
      const lista = resp?.produto_servico_cadastro;
      if (!Array.isArray(lista)) continue;
      for (const registro of lista as OmiePayload[]) {
        const codigo = texto(registro.codigo);
        if (!codigo) continue;
        mapa.set(semEspaco(codigo), {
          idProduto: texto(registro.codigo_produto),
          intProduto: texto(registro.codigo_produto_integracao) || undefined,
        });
      }
    } catch (erro) {
      completo = false;
      if (erro instanceof OmieBlocked) {
        interromper(erro);
        break;
      }
      // Qualquer outro erro: só perde a otimização deste bloco.
    }
  }
  return { mapa, completo };
}

// Um produto SEM estrutura faz o `ConsultarEstrutura` voltar vazio, e vazio no
// Omie é resposta de ERRO: conta pro bloqueio da app_key, que dispara na 10ª
// requisição incorreta SEGUIDA do mesmo método (§6). Numa BOM com muitos pais
// ainda sem malha (é o caso quando a matéria-prima entra: cada PEÇA vira um pai),
// ler um atrás do outro queimaria esse orçamento. Por isso a leitura pausa depois
// de alguns vazios seguidos (só uma leitura com itens zera a conta); os pais
// seguintes recebem só inclusão e voltam em `paisNaoConferidos`. No reenvio eles
// já têm estrutura, a leitura dá certo e o espelho completa.
const LIMITE_VAZIOS_SEGUIDOS = 3;

// Uma linha da estrutura que o Omie JÁ tem num pai (ConsultarEstrutura.itens).
interface LinhaMalha {
  idMalha?: string;
  intMalha?: string;
  idProdMalha?: string;
  intProdMalha?: string;
  codProdMalha?: string;
  descrProdMalha?: string;
  quantProdMalha?: number;
  percPerdaProdMalha?: unknown;
  obsProdMalha?: unknown;
}

function numero(valor: unknown): number | undefined {
  if (valor === undefined || valor === null || valor === "") return undefined;
  const n = Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

function linhaMalha(it: OmiePayload): LinhaMalha {
  return {
    idMalha: texto(it.idMalha) || undefined,
    intMalha: texto(it.intMalha) || undefined,
    idProdMalha: texto(it.idProdMalha) || undefined,
    intProdMalha: texto(it.intProdMalha) || undefined,
    codProdMalha: texto(it.codProdMalha) || undefined,
    descrProdMalha: texto(it.descrProdMalha) || undefined,
    quantProdMalha: numero(it.quantProdMalha),
    percPerdaProdMalha: it.percPerdaProdMalha,
    obsProdMalha: it.obsProdMalha,
  };
}

// Lê a estrutura que o Omie já tem num pai, pra sobrescrever: alterar a
// quantidade do que mudou, incluir o que falta e remover o que saiu da BOM.
// `null` = NÃO deu pra ler, e isso é diferente de vazia: sem saber o que existe,
// o espelho não pode remover nem alterar nada.
//
// IMPORTANTE: esta leitura NUNCA interrompe o lote. `ConsultarEstrutura` do MESMO
// idProduto em menos de 60s volta como "consumo redundante", que o client lança
// como `OmieBlocked` (não é bloqueio real da chave). Se a gente interrompesse aqui,
// um reenvio rápido pararia o envio à toa. Quem decide parar por bloqueio REAL são
// as escritas, que aí sim veem o `consumo indevido`.
async function lerEstruturaAtual(idPai: string, chamar: ChamarFn): Promise<LinhaMalha[] | null> {
  try {
    const resp = await chamar("geral/malha/", "ConsultarEstrutura", { idProduto: Number(idPai) });
    const itens = resp?.itens;
    return Array.isArray(itens) ? (itens as OmiePayload[]).map(linhaMalha) : [];
  } catch {
    return null;
  }
}

// Quantidade da relação: `??` só cobre null/undefined; um NaN vindo do parser
// viraria JSON null, então exige um número finito de verdade (senão, 1).
function quantidadeDe(rel: EstruturaRel): number {
  return typeof rel.quantidade === "number" && Number.isFinite(rel.quantidade) ? rel.quantidade : 1;
}

// Soma sem o lixo do ponto flutuante (0,1 + 0,2 = 0,30000000000000004).
function arredondar(valor: number): number {
  return Math.round(valor * 1e6) / 1e6;
}

function mesmaQuantidade(atual: number | undefined, desejada: number): boolean {
  return atual !== undefined && Math.abs(atual - desejada) < 1e-6;
}

function formatarQuantidade(valor: number | undefined): string {
  return valor === undefined ? "?" : valor.toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

// A linha do Omie é identificada pelo id interno da malha; o código de
// integração só serve de reserva (linhas incluídas à mão costumam vir sem ele).
function refLinha(linha: LinhaMalha): OmiePayload | null {
  if (linha.idMalha) return { idMalha: Number(linha.idMalha) };
  if (linha.intMalha) return { intMalha: linha.intMalha };
  return null;
}

// Um filho que a BOM quer no pai, já consolidado: a mesma peça repetida sob o
// MESMO pai (mesmo número na BOM) soma numa linha só, porque o Omie guarda uma
// quantidade por peça. Se o pai aparece em dois lugares da BOM (a mesma
// submontagem usada duas vezes), os filhos dela são os mesmos: vale a
// quantidade da primeira ocorrência, sem somar de novo.
interface FilhoDesejado {
  codigoPai: string;
  codigoFilho: string;
  chaveFilho: string; // código sem espaço, em maiúsculas
  idFilho?: string;
  intFilho: string; // código de integração do filho (o real, quando conhecido)
  quant: number;
  instancia: string; // número do pai na BOM onde a quantidade foi somada
  indices: number[]; // posições das relações de origem em `input.estrutura`
}

interface PaiDesejado {
  chave: string;
  codigoPai: string;
  filhos: Map<string, FilhoDesejado>;
}

function casaLinha(linha: LinhaMalha, filho: FilhoDesejado): boolean {
  // Com os dois ids na mão, eles decidem sozinhos: código igual com id diferente
  // é outro cadastro.
  if (filho.idFilho && linha.idProdMalha) return linha.idProdMalha === filho.idFilho;
  if (linha.codProdMalha && semEspaco(linha.codProdMalha).toUpperCase() === filho.chaveFilho) return true;
  return Boolean(linha.intProdMalha && semEspaco(linha.intProdMalha).toUpperCase() === semEspaco(filho.intFilho).toUpperCase());
}

// Resolve um conflito (descrição OU código) reaproveitando o cadastro
// existente no Omie. Compartilhado pelas duas categorias — só muda como
// extrai a chave da mensagem e como busca o cadastro (§7).
async function tratarConflito(
  item: ParsedItem,
  erroOriginal: Error,
  chave: string | null,
  buscar: (chave: string, chamar: ChamarFn) => Promise<ProdutoExistente | null>,
  chamar: ChamarFn,
  integracaoReal: Map<string, string>,
  interromper: (erro: unknown) => void,
): Promise<ProdutoResultado> {
  try {
    const existente = chave ? await buscar(chave, chamar) : null;
    if (existente) {
      if (existente.codigoProdutoIntegracao) {
        integracaoReal.set(semEspaco(item.codigo), existente.codigoProdutoIntegracao);
      }
      return {
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "ja_existia",
        omieCodigoProduto: existente.codigoProduto,
      };
    }
  } catch (erroResolucao) {
    if (erroResolucao instanceof OmieBlocked) {
      interromper(erroResolucao);
      return {
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "falha",
        motivo: mensagem(erroOriginal),
      };
    }
    // Não deu pra confirmar o cadastro existente (erro na busca) — cai no
    // fallback abaixo em vez de assumir sucesso sem confirmar.
  }
  return {
    codigo: item.codigo,
    descricao: item.descricaoProduto,
    outcome: "falha",
    motivo: `${mensagem(erroOriginal)} Não foi possível localizar o cadastro existente automaticamente — confira manualmente no Omie.`,
  };
}

interface Interrupcao {
  interrompido: boolean;
  bloqueado: boolean;
  motivo?: string;
}

// A Omie conta TODA resposta fora de sucesso limpo pro seu próprio contador de
// banimento — inclusive duplicado/conflito, que pra nós é um outcome bom, mas
// pra Omie ainda é uma resposta de erro (REQUISITOS §6: "resultado vazio =
// erro, conta pro ban"; §7: reenviar estrutura já existente em massa "conta
// como erro e pode bloquear"). Como nosso próprio reaproveitamento de conflito
// faz uma leitura (ConsultarProduto/ListarProdutos) que costuma dar OK logo
// em seguida, o breaker do client é resetado a cada vez — ele não enxerga essa
// sequência de escritas ruins se acumulando. Por isso o orquestrador conta por
// conta própria, bem abaixo do limite real da Omie (10 seguidos), e pausa o
// envio antes de arriscar o bloqueio de verdade da chave.
const LIMITE_SEQUENCIA_RISCO = 5;

/**
 * Envia ao Omie os produtos "novos" de uma BOM e suas relações de estrutura,
 * garantindo as famílias antes. Antes dos produtos, faz uma PRÉ-CHECAGEM em lote
 * (leitura, não conta pro bloqueio da Omie) pra descobrir quais códigos JÁ existem
 * e PULAR o Upsert deles — reenviar um cadastro existente volta erro de conflito, e
 * é isso que estoura o contador de bloqueio (10 requisições incorretas no mesmo
 * método). A Estrutura referencia pai/filho pelo ID interno do Omie quando conhecido.
 * Idempotente: `Upsert*` atualiza no reenvio e
 * `OmieDuplicate` conta como sucesso. A estrutura de cada pai enviado é um
 * ESPELHO da BOM: lê o que o Omie já tem, sobrescreve a quantidade que mudou,
 * inclui o que falta e remove o que saiu (ver a etapa 3). Conflito de descrição/código (peça
 * padrão já cadastrada sob outro código/ID, ex. parafuso/dobradiça) é
 * resolvido buscando e reaproveitando o cadastro existente — não para o lote.
 * Só `OmieBlocked` (breaker/app_key realmente bloqueado) PARA o lote inteiro
 * e marca o restante como não enviado; qualquer outro erro (classificado ou
 * não) é falha só daquele item, e o orquestrador segue pros próximos. Além
 * disso, uma SEQUÊNCIA de `LIMITE_SEQUENCIA_RISCO` respostas seguidas fora do
 * sucesso limpo (falha, duplicado, conflito) pausa o envio por segurança —
 * mesmo sem bloqueio explícito, a Omie conta essas respostas pro PRÓPRIO
 * limite de banimento, e o breaker do client não enxerga isso sozinho (a
 * leitura de resolução de conflito costuma dar OK e resetar o contador dele).
 */
export async function orquestrarEnvio(input: EnvioInput, chamar: ChamarFn): Promise<EnvioResultado> {
  const novos = input.novos.filter((i) => i.status === "novo");
  const recusados = input.novos.length - novos.length;
  const ncm = normalizarNcm(input.ncm);

  const familias: FamiliaResultado[] = [];
  const produtos: ProdutoResultado[] = [];
  const idPorFamilia = new Map<Familia, unknown>();
  // Nosso código (sem espaço) → codigo_produto_integracao REAL, quando um item
  // foi resolvido por reaproveitamento (conflito de descrição ou de código). A
  // Estrutura usa isso pra referenciar o cadastro que realmente existe no Omie.
  const integracaoReal = new Map<string, string>();
  // Nosso código (sem espaço) → codigo_produto (ID interno do Omie), de quem já
  // existia (pré-check) OU foi enviado/reaproveitado agora. A Estrutura prefere
  // referenciar pelo ID interno (idProduto/idProdMalha), que não depende do
  // código de integração estar preenchido no cadastro.
  const idOmiePorCodigo = new Map<string, string>();
  // Códigos (sem espaço, maiúsculos) que JÁ estavam cadastrados no Omie antes
  // deste lote: só esses podem ter estrutura pra sobrescrever. Quem foi criado
  // agora não tem malha, e perguntar volta vazio (que conta como erro no Omie).
  const preexistentes = new Set<string>();
  const interrupcao: Interrupcao = { interrompido: false, bloqueado: false };
  let sequenciaRisco = 0;

  // Só bloqueio real (OmieBlocked) para o lote inteiro — qualquer outro erro
  // vira falha isolada do item, e o caller segue pros próximos.
  const interromper = (erro: unknown) => {
    if (!(erro instanceof OmieBlocked)) return;
    interrupcao.interrompido = true;
    interrupcao.bloqueado = true;
    interrupcao.motivo = mensagem(erro);
  };

  // Chamar depois de CADA resultado (família/produto/estrutura). Zera a
  // sequência em sucesso limpo; qualquer outra coisa soma, e ao bater o limite
  // pausa o envio por segurança (bloqueado fica false — não é um bloqueio real
  // da Omie, é a nossa própria margem de segurança).
  const registrarSequencia = (outcome: OutcomeEnvio | OutcomeRemocao, custoOmie = true) => {
    if (interrupcao.interrompido) return;
    // Sucesso limpo OU passo sem chamada ao Omie (item pulado por já existir)
    // zeram a sequência — só resposta ruim de uma chamada REAL soma pro freio.
    const sucessoLimpo = outcome === "enviado" || outcome === "atualizado" || outcome === "removido";
    if (sucessoLimpo || !custoOmie) {
      sequenciaRisco = 0;
      return;
    }
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrupcao.interrompido = true;
      interrupcao.motivo =
        `Envio pausado por segurança: ${LIMITE_SEQUENCIA_RISCO} respostas seguidas do Omie fora do ` +
        "sucesso direto (duplicado/conflito/falha). Isso também conta pro limite de bloqueio da " +
        "própria Omie — paramos aqui pra não arriscar travar a chave de verdade. Revise os itens " +
        "marcados e reenvie o restante em seguida.";
    }
  };

  // 1. Famílias primeiro (COM/SBM/PCF/PCA) — garante o id antes dos produtos.
  for (const familia of familiasDistintas(novos)) {
    if (interrupcao.interrompido) break;
    const { codFamilia, nomeFamilia } = partesFamilia(familia);
    try {
      const resp = await chamar(
        "geral/familias/",
        "UpsertFamilia",
        { codInt: codFamilia, codFamilia, nomeFamilia, inativo: "N" },
        WRITE,
      );
      const rawId = resp?.codigo;
      idPorFamilia.set(familia, rawId);
      familias.push({ familia, codFamilia, nomeFamilia, codigoFamilia: texto(rawId), outcome: "enviado" });
      registrarSequencia("enviado");
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        // Upsert raramente duplica; se acontecer, seguimos sem o id da família.
        idPorFamilia.set(familia, undefined);
        familias.push({ familia, codFamilia, nomeFamilia, outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        continue;
      }
      familias.push({ familia, codFamilia, nomeFamilia, outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
      interromper(erro);
    }
  }

  // 1.5. Pré-checagem em lote: descobre quais códigos JÁ existem no Omie (leitura,
  // não conta pro bloqueio) pra pular o UpsertProduto deles adiante. Inclui também
  // os códigos que só aparecem na estrutura (pai/filho fora de "novos"), pra a
  // Estrutura conseguir referenciá-los pelo ID interno.
  const codigosParaChecar = new Set<string>();
  for (const item of novos) codigosParaChecar.add(item.codigo);
  for (const rel of input.estrutura) {
    codigosParaChecar.add(rel.codigoPai);
    codigosParaChecar.add(rel.codigoFilho);
  }
  const precheck = interrupcao.interrompido
    ? { mapa: new Map<string, CadastroExistente>(), completo: false }
    : await precarregarExistentes([...codigosParaChecar], chamar, interromper);
  const existentes = precheck.mapa;
  for (const [chave, cadastro] of existentes) {
    if (cadastro.idProduto) idOmiePorCodigo.set(chave, cadastro.idProduto);
    if (cadastro.intProduto) integracaoReal.set(chave, cadastro.intProduto);
    preexistentes.add(chave.toUpperCase());
  }

  // 2. Produtos (idempotente via UpsertProduto).
  for (const item of novos) {
    if (interrupcao.interrompido) {
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "nao_enviado",
        motivo: MOTIVO_NAO_ENVIADO,
      });
      continue;
    }

    const chaveItem = semEspaco(item.codigo);

    // Já cadastrado no Omie (descoberto na pré-checagem): NÃO reenvia o Upsert —
    // reenviar volta erro de conflito, que é o que estoura o contador de bloqueio
    // da Omie. Reaproveita o cadastro (ID interno guardado pra Estrutura). Como
    // não houve chamada ao Omie, não conta pro freio (custoOmie = false).
    const jaExiste = existentes.get(chaveItem);
    if (jaExiste) {
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "ja_existia",
        omieCodigoProduto: jaExiste.idProduto,
      });
      registrarSequencia("ja_existia", false);
      continue;
    }

    const param: OmiePayload = {
      codigo_produto_integracao: semEspaco(item.codigo),
      codigo: item.codigo,
      descricao: item.descricaoProduto,
      unidade: UNIDADE_FIXA,
      ncm,
      tipoItem: TIPO_ITEM_FIXO,
      // Controle de lote sempre ativo (REQUISITOS §7). Campo confirmado na doc
      // da API de produtos: `produto_lote` ("S"/"N").
      produto_lote: "S",
    };
    const rawFamiliaId = item.familia ? idPorFamilia.get(item.familia) : undefined;
    if (rawFamiliaId !== undefined && rawFamiliaId !== null) param.codigo_familia = rawFamiliaId;

    try {
      const resp = await chamar("geral/produtos/", "UpsertProduto", param, WRITE);
      const idProduto = texto(resp?.codigo_produto);
      if (idProduto) idOmiePorCodigo.set(chaveItem, idProduto);
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "enviado",
        omieCodigoProduto: idProduto,
      });
      registrarSequencia("enviado");
    } catch (erro) {
      // Duplicado e conflito querem dizer que o cadastro JÁ existia (com outro
      // código ou id): pode ter estrutura, então entra na conferência.
      if (erro instanceof OmieDuplicate || erro instanceof OmieDescriptionConflict || erro instanceof OmieCodeConflict) {
        preexistentes.add(chaveItem.toUpperCase());
      }
      if (erro instanceof OmieDuplicate) {
        produtos.push({ codigo: item.codigo, descricao: item.descricaoProduto, outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        continue;
      }
      if (erro instanceof OmieDescriptionConflict) {
        // Descrição já usada por OUTRO código — comum em peça padrão reaproveitada
        // entre BOMs (parafuso, dobradiça). Decisão do Vitor (08/07/2026): SEMPRE
        // reaproveitar o cadastro existente em vez de pedir pra renomear — o item
        // já pode estar em outro produto com ordem de produção ou saldo em
        // estoque. NÃO é sinal de risco de bloqueio do app_key: não para o lote.
        const codigoExistente = extrairCodigoConflitante(erro.message);
        const resultado = await tratarConflito(
          item,
          erro,
          codigoExistente,
          resolverProdutoExistente,
          chamar,
          integracaoReal,
          interromper,
        );
        if (resultado.omieCodigoProduto) idOmiePorCodigo.set(chaveItem, resultado.omieCodigoProduto);
        produtos.push(resultado);
        registrarSequencia(resultado.outcome);
        continue;
      }
      if (erro instanceof OmieCodeConflict) {
        // Código (SKU) já usado por OUTRO id interno — mesma política do
        // conflito de descrição (reaproveitar automaticamente), só que a
        // mensagem do Omie cita o ID interno do cadastro existente em vez do
        // código, então a busca é por ConsultarProduto/codigo_produto.
        const idExistente = extrairIdConflitante(erro.message);
        const resultado = await tratarConflito(
          item,
          erro,
          idExistente,
          resolverProdutoExistentePorId,
          chamar,
          integracaoReal,
          interromper,
        );
        if (resultado.omieCodigoProduto) idOmiePorCodigo.set(chaveItem, resultado.omieCodigoProduto);
        produtos.push(resultado);
        registrarSequencia(resultado.outcome);
        continue;
      }
      produtos.push({
        codigo: item.codigo,
        descricao: item.descricaoProduto,
        outcome: "falha",
        motivo: mensagem(erro),
      });
      registrarSequencia("falha");
      interromper(erro);
    }
  }

  // Tudo que o Omie reconhece OU que este lote criou. Comparado em MAIÚSCULAS: o
  // código da montagem é digitado à mão na tela, e uma diferença só de caixa não
  // pode virar acusação de "não existe". Inclui `existentes` direto, e não só os
  // mapas derivados dele: um cadastro achado na pré-checagem sem `codigo_produto`
  // utilizável existe do mesmo jeito.
  const codigosDoLote = new Set(novos.map((item) => semEspaco(item.codigo)));
  const conhecidos = new Set<string>();
  for (const chave of [
    ...idOmiePorCodigo.keys(),
    ...integracaoReal.keys(),
    ...existentes.keys(),
    ...codigosDoLote,
  ]) {
    conhecidos.add(chave.toUpperCase());
  }

  // A MONTAGEM de destino é a única referência da estrutura que o usuário digita
  // à mão, e ela se repete em TODA linha de nível topo: um código errado viraria
  // dezenas de escritas recusadas em sequência, que é exatamente o que estoura o
  // limite de bloqueio da app_key. Então, quando dá pra afirmar que ela não está
  // cadastrada (pré-checagem completa), falhamos essas relações sem chamar o Omie.
  // Vale só pra origem "raiz": os demais códigos vêm da própria BOM ou do catálogo
  // MAT, e o caminho antigo (tentar e tratar o erro) segue valendo pra eles.
  const montagemAusente = (chave: string): boolean =>
    precheck.completo && !conhecidos.has(chave.toUpperCase());

  // Os mapas de código guardam a caixa de onde vieram (BOM, Omie); na estrutura a
  // busca é em MAIÚSCULAS, pelo mesmo motivo de `conhecidos`: a montagem digitada
  // em minúsculas precisa achar o id interno pra estrutura dela ser lida.
  const idPorChave = new Map<string, string>();
  for (const [chave, id] of idOmiePorCodigo) idPorChave.set(chave.toUpperCase(), id);
  const intPorChave = new Map<string, string>();
  for (const [chave, int] of integracaoReal) intPorChave.set(chave.toUpperCase(), int);

  // 3. Estrutura: ESPELHO por pai. Cada pai do envio termina com a estrutura da
  // BOM no Omie: o que já estava com a mesma quantidade fica como está, a
  // quantidade diferente é sobrescrita (AlterarEstrutura), o que falta é incluído
  // (IncluirEstrutura) e o que o Omie tem a mais sai (ExcluirEstrutura). Pai que
  // não está no envio não é lido nem mexido.
  const resultados: Array<EstruturaResultado | undefined> = new Array(input.estrutura.length);
  const remocoes: RemocaoResultado[] = [];
  const paisNaoConferidos: string[] = [];

  const chavesDaRelacao = (indice: number) => {
    const rel = input.estrutura[indice];
    return {
      numeroPai: rel.numeroPai,
      numeroFilho: rel.numeroFilho,
      codigoPai: rel.codigoPai,
      codigoFilho: rel.codigoFilho,
    };
  };

  // Toda relação que virou este filho recebe o mesmo resultado.
  const marcar = (filho: FilhoDesejado, parcial: Pick<EstruturaResultado, "outcome" | "motivo" | "detalhe">) => {
    for (const indice of filho.indices) resultados[indice] = { ...chavesDaRelacao(indice), ...parcial };
  };

  const pais = new Map<string, PaiDesejado>();
  input.estrutura.forEach((rel, indice) => {
    const chavePai = semEspaco(rel.codigoPai).toUpperCase();
    if (!interrupcao.interrompido && rel.origem === "raiz" && montagemAusente(chavePai)) {
      resultados[indice] = {
        ...chavesDaRelacao(indice),
        outcome: "falha",
        motivo: `A montagem ${rel.codigoPai} não está cadastrada no Omie. Confira o código antes de reenviar.`,
      };
      // NÃO mexe no freio: essa falha é NOSSA, não veio de resposta do Omie.
      // Zerar a sequência aqui (que é o que `registrarSequencia` faz quando não
      // houve chamada) desarmaria o freio justamente no cenário que ele existe
      // pra pegar — montagem errada intercalada com escritas que falham de
      // verdade, cada relação de topo limpando o contador da anterior.
      return;
    }

    let pai = pais.get(chavePai);
    if (!pai) {
      pai = { chave: chavePai, codigoPai: rel.codigoPai, filhos: new Map() };
      pais.set(chavePai, pai);
    }
    const chaveFilho = semEspaco(rel.codigoFilho).toUpperCase();
    const idFilho = idPorChave.get(chaveFilho);
    const chaveDesejo = idFilho ? `id:${idFilho}` : `cod:${chaveFilho}`;
    const quant = quantidadeDe(rel);
    const filho = pai.filhos.get(chaveDesejo);
    if (!filho) {
      pai.filhos.set(chaveDesejo, {
        codigoPai: rel.codigoPai,
        codigoFilho: rel.codigoFilho,
        chaveFilho,
        idFilho,
        intFilho: intPorChave.get(chaveFilho) ?? semEspaco(rel.codigoFilho),
        quant,
        instancia: rel.numeroPai,
        indices: [indice],
      });
      return;
    }
    if (rel.numeroPai === filho.instancia) filho.quant = arredondar(filho.quant + quant);
    filho.indices.push(indice);
  });

  const incluirFilho = async (filho: FilhoDesejado, idPai: string | undefined) => {
    // Referência de pai/filho: prefere o ID INTERNO do Omie (idProduto/idProdMalha),
    // que não depende do código de integração estar preenchido no cadastro — vale
    // tanto pra quem já existia (pré-check) quanto pra quem acabou de ser enviado.
    // Só cai pro código de integração (intProduto/intProdMalha, código SEM espaço)
    // como fallback quando o ID interno não é conhecido. Formato confirmado na doc
    // da API de malha: pai no topo, filhos no array `itemMalhaIncluir` (um por
    // chamada, pro resultado por relação continuar granular).
    const chavePai = semEspaco(filho.codigoPai);
    const refPai = idPai
      ? { idProduto: Number(idPai) }
      : { intProduto: intPorChave.get(chavePai.toUpperCase()) ?? chavePai };
    const refFilho = filho.idFilho ? { idProdMalha: Number(filho.idFilho) } : { intProdMalha: filho.intFilho };
    try {
      await chamar(
        "geral/malha/",
        "IncluirEstrutura",
        {
          ...refPai,
          itemMalhaIncluir: [
            {
              // intMalha é OBRIGATÓRIO pelo Omie (string20); sem ele o item falha.
              intMalha: intMalhaDe(filho.codigoPai, filho.codigoFilho),
              ...refFilho,
              quantProdMalha: filho.quant,
            },
          ],
        },
        WRITE,
      );
      marcar(filho, { outcome: "enviado" });
      registrarSequencia("enviado");
    } catch (erro) {
      // IncluirEstrutura não tem Upsert → duplicado = já existe = ok.
      if (erro instanceof OmieDuplicate) {
        marcar(filho, { outcome: "ja_existia" });
        registrarSequencia("ja_existia");
        return;
      }
      marcar(filho, { outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
      interromper(erro);
    }
  };

  const alterarFilho = async (filho: FilhoDesejado, idPai: string, linha: LinhaMalha) => {
    const ref = refLinha(linha);
    if (!ref) {
      // Sem chamada ao Omie: falha nossa, não mexe no freio (ver montagem acima).
      marcar(filho, {
        outcome: "falha",
        motivo:
          `O Omie não informou o identificador desta linha da estrutura. ` +
          `Ajuste a quantidade à mão para ${formatarQuantidade(filho.quant)}.`,
      });
      return;
    }
    // Perda e observação voltam como estão: alguém pode ter preenchido à mão no
    // Omie, e sobrescrever a quantidade não deve apagar isso.
    const itemAlterar: OmiePayload = { ...ref, quantProdMalha: filho.quant };
    if (linha.idProdMalha) itemAlterar.idProdMalha = Number(linha.idProdMalha);
    if (linha.percPerdaProdMalha !== undefined && linha.percPerdaProdMalha !== null) {
      itemAlterar.percPerdaProdMalha = linha.percPerdaProdMalha;
    }
    if (linha.obsProdMalha !== undefined && linha.obsProdMalha !== null && linha.obsProdMalha !== "") {
      itemAlterar.obsProdMalha = linha.obsProdMalha;
    }
    try {
      const resp = await chamar(
        "geral/malha/",
        "AlterarEstrutura",
        { idProduto: Number(idPai), itemMalhaAlterar: [itemAlterar] },
        WRITE,
      );
      if (resp === null) {
        // "Não encontrado": a linha sumiu entre a leitura e a escrita.
        marcar(filho, {
          outcome: "falha",
          motivo: "O Omie não achou esta linha da estrutura para alterar (pode ter sido mexida agora). Reenvie.",
        });
        registrarSequencia("falha");
        return;
      }
      marcar(filho, {
        outcome: "atualizado",
        detalhe: `Quantidade no Omie: ${formatarQuantidade(linha.quantProdMalha)} → ${formatarQuantidade(filho.quant)}`,
      });
      registrarSequencia("atualizado");
    } catch (erro) {
      marcar(filho, { outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
      interromper(erro);
    }
  };

  const removerLinha = async (pai: PaiDesejado, idPai: string, linha: LinhaMalha) => {
    const base = {
      codigoPai: pai.codigoPai,
      codigoFilho:
        linha.codProdMalha ?? linha.intProdMalha ?? (linha.idProdMalha ? `id ${linha.idProdMalha}` : "?"),
      descricaoFilho: linha.descrProdMalha,
      quantidade: linha.quantProdMalha,
      idMalha: linha.idMalha,
    };
    if (interrupcao.interrompido) {
      remocoes.push({ ...base, outcome: "nao_enviado", motivo: MOTIVO_NAO_ENVIADO });
      return;
    }
    const ref = refLinha(linha);
    if (!ref) {
      remocoes.push({
        ...base,
        outcome: "falha",
        motivo: "O Omie não informou o identificador desta linha da estrutura. Remova à mão no Omie.",
      });
      return;
    }
    try {
      const resp = await chamar("geral/malha/", "ExcluirEstrutura", { idProduto: Number(idPai), ...ref }, WRITE);
      remocoes.push({ ...base, outcome: "removido" });
      // "Não encontrado" = a linha já não estava lá: o efeito é o mesmo, mas foi
      // resposta de erro do Omie, então soma pro freio como um duplicado soma.
      registrarSequencia(resp === null ? "ja_existia" : "removido");
    } catch (erro) {
      remocoes.push({ ...base, outcome: "falha", motivo: mensagem(erro) });
      registrarSequencia("falha");
      interromper(erro);
    }
  };

  const espelharPai = async (pai: PaiDesejado, idPai: string | undefined, atuais: LinhaMalha[] | null) => {
    // Casa TODAS as linhas do Omie com os filhos da BOM antes de escrever: se o
    // lote parar no meio, o que faltou remover já é conhecido e vai pra tela.
    const usadas = new Set<LinhaMalha>();
    const sobras: LinhaMalha[] = [];
    const plano: Array<{ filho: FilhoDesejado; linha?: LinhaMalha }> = [];
    for (const filho of pai.filhos.values()) {
      const casadas = (atuais ?? []).filter((linha) => !usadas.has(linha) && casaLinha(linha, filho));
      for (const linha of casadas) usadas.add(linha);
      // A mesma peça em duas linhas no Omie (incluída de novo à mão, por
      // exemplo): fica a primeira, as outras saem.
      sobras.push(...casadas.slice(1));
      plano.push({ filho, linha: casadas[0] });
    }
    if (atuais) sobras.push(...atuais.filter((linha) => !usadas.has(linha)));

    // Inclui/altera primeiro e remove depois: se o lote parar no meio, sobra
    // item no Omie em vez de faltar.
    for (const { filho, linha } of plano) {
      if (interrupcao.interrompido) break;
      if (!linha || !idPai) {
        await incluirFilho(filho, idPai);
      } else if (mesmaQuantidade(linha.quantProdMalha, filho.quant)) {
        // Sem chamada ao Omie, não conta pro freio.
        marcar(filho, { outcome: "ja_existia" });
        registrarSequencia("ja_existia", false);
      } else {
        await alterarFilho(filho, idPai, linha);
      }
    }
    if (!idPai) return;
    for (const linha of sobras) await removerLinha(pai, idPai, linha);
  };

  let vaziosSeguidos = 0;
  for (const pai of pais.values()) {
    if (interrupcao.interrompido) break;
    const idPai = idPorChave.get(pai.chave);
    // Pode ter estrutura: já existia antes do lote, ou a pré-checagem falhou e
    // não dá pra afirmar que foi criado agora (o Upsert atualiza o que existe).
    const podeTerEstrutura = preexistentes.has(pai.chave) || !precheck.completo;

    let atuais: LinhaMalha[] | null = null;
    if (!idPai) {
      // Sem o id interno não dá pra ler a malha: só inclusão, como sempre foi.
      if (podeTerEstrutura) paisNaoConferidos.push(pai.codigoPai);
    } else if (!podeTerEstrutura) {
      atuais = []; // criado agora: não tem malha
    } else if (vaziosSeguidos >= LIMITE_VAZIOS_SEGUIDOS) {
      paisNaoConferidos.push(pai.codigoPai);
    } else {
      atuais = await lerEstruturaAtual(idPai, chamar);
      vaziosSeguidos = atuais && atuais.length > 0 ? 0 : vaziosSeguidos + 1;
      if (atuais === null) paisNaoConferidos.push(pai.codigoPai);
    }
    await espelharPai(pai, idPai, atuais);
  }

  // Array.from (e não .map): `resultados` nasce esparso e o map pula os buracos.
  const estrutura: EstruturaResultado[] = Array.from(
    resultados,
    (resultado, indice) =>
      resultado ?? { ...chavesDaRelacao(indice), outcome: "nao_enviado", motivo: MOTIVO_NAO_ENVIADO },
  );

  const contar = (o: OutcomeEnvio) => produtos.filter((p) => p.outcome === o).length;
  return {
    familias,
    produtos,
    estrutura,
    remocoes,
    paisNaoConferidos,
    interrompido: interrupcao.interrompido,
    bloqueado: interrupcao.bloqueado,
    motivoInterrupcao: interrupcao.motivo,
    totais: {
      produtos: produtos.length,
      enviados: contar("enviado"),
      jaExistiam: contar("ja_existia"),
      falhas: contar("falha"),
      naoEnviados: contar("nao_enviado"),
      recusados,
    },
  };
}
