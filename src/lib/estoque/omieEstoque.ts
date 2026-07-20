// Estoque no Omie: leitura de produtos/saldos e BAIXA (saída) via ajuste.
//
// Calls usados (confirmados na doc oficial em 16/07/2026):
//   • `ListarProdutos` (geral/produtos/) com `produtosPorCodigo` em lote — READ,
//     mesmo call já provado em produção no envio de produtos. Traz também
//     `produto_lote` (S/N) → sabemos QUAIS produtos exigem lote na baixa.
//   • `ListarPosEstoque` (estoque/consulta/) — READ, saldo + CMC de vários SKUs
//     numa chamada só (portado do nextstep/apps/omie/services/estoque.py).
//   • `ConsultarLote` (produtos/produtoslote/) — READ, lotes + saldo por lote de
//     UM produto num local (só para produtos com controle de lote). A saída FEFO
//     consome primeiro o lote que vence antes (validade mais próxima).
//   • `IncluirAjusteEstoque` (estoque/ajuste/) — WRITE, tipo "SAI" (saída),
//     origem "AJU", motivo "OPS"; `codigo_local_estoque` omitido = local PADRÃO
//     (decisão do Victor, 16/07/2026). `cod_int_ajuste` recebe um id NOSSO
//     determinístico por item → reenviar vira duplicado idempotente, não baixa
//     duas vezes. Produto com controle de lote leva `lote_validade`
//     (`[{nIdLote, nQtdLote}]`); produto sem custo médio (CMC 0) omite `valor`
//     (o Omie preenche o custo sozinho na saída — a baixa só consome o estoque).
//
// Módulo PURO (não toca banco/sessão): recebe `chamar` por parâmetro, igual ao
// envioOmie. Ban-safety (REQUISITOS §6): tudo sequencial, leitura em lote antes
// de escrever (valida código e saldo LOCALMENTE — quantidade sem saldo nem vira
// chamada), freio próprio de sequência de risco e `OmieBlocked` para o lote.

import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { OmieBlocked, OmieDuplicate } from "@/lib/omie/errors";
import { semAcento } from "@/lib/texto";

export type ChamarFn = (
  path: string,
  call: string,
  param: OmiePayload,
  options?: ChamarOptions,
) => Promise<OmiePayload | null>;

const WRITE: ChamarOptions = { write: true };
const BLOCO_LISTAGEM = 50;

// Pausa de segurança própria (mesma lógica/limiar do envioOmie): a Omie conta
// TODA resposta fora de sucesso limpo pro banimento (10ª incorreta no mesmo
// método = HTTP 425 por ~30min); pausamos bem antes.
const LIMITE_SEQUENCIA_RISCO = 5;

const MOTIVO_NAO_BAIXADO = "Baixa interrompida antes de chegar neste item.";

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

function numero(valor: unknown): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

function mensagem(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}

function* emBlocos<T>(itens: readonly T[], tamanho: number): Generator<T[]> {
  for (let i = 0; i < itens.length; i += tamanho) {
    yield itens.slice(i, i + tamanho);
  }
}

// -----------------------------------------------------------------------------
// Leitura: produtos por código (lote)
// -----------------------------------------------------------------------------

export interface ProdutoEstoque {
  idProd: string; // codigo_produto (id interno do Omie)
  descricao: string;
  // produto_lote === "S": exige informar o lote consumido na baixa (saída).
  // Omitido/false quando o produto não tem controle de lote.
  controleLote?: boolean;
}

// Resolve vários SKUs numa leitura em lote. SKU ausente do mapa = não existe no
// Omie. Lança `OmieBlocked` (caller decide) e propaga outros erros do client.
export async function buscarProdutosPorCodigo(
  codigos: readonly string[],
  chamar: ChamarFn,
): Promise<Map<string, ProdutoEstoque>> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const mapa = new Map<string, ProdutoEstoque>();
  for (const bloco of emBlocos(unicos, BLOCO_LISTAGEM)) {
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
      const idProd = texto(registro.codigo_produto);
      if (!codigo || !idProd) continue;
      const controleLote = texto(registro.produto_lote)?.toUpperCase() === "S";
      mapa.set(codigo, {
        idProd,
        descricao: texto(registro.descricao) ?? "",
        ...(controleLote ? { controleLote: true } : {}),
      });
    }
  }
  return mapa;
}

export interface ProdutoResumo {
  codigo: string; // SKU (o que o solicitante escolhe)
  descricao: string;
}

// Busca de catálogo para o autocomplete (requisição/baixa). Uma leitura por
// termo, cacheada. Primeiro por PARTE da descrição (`filtrar_apenas_descricao`
// com curinga `%TEXTO%` = contém); se NÃO achar nada, tenta o termo como CÓDIGO
// exato (ex.: "PRD00026"), porque o filtro de descrição não pega o SKU. Ignora
// inativos/bloqueados. Termo < 2 chars → [] sem chamar.
export async function buscarProdutosPorDescricao(
  termo: string,
  chamar: ChamarFn,
  limite: number = 20,
): Promise<ProdutoResumo[]> {
  const q = termo.trim();
  if (q.length < 2) return [];
  const resp = await chamar("geral/produtos/", "ListarProdutos", {
    pagina: 1,
    registros_por_pagina: limite,
    apenas_importado_api: "N",
    filtrar_apenas_omiepdv: "N",
    filtrar_apenas_descricao: `%${q}%`,
  });
  const lista = resp?.produto_servico_cadastro;
  const saida: ProdutoResumo[] = [];
  if (Array.isArray(lista)) {
    for (const registro of lista as OmiePayload[]) {
      if (texto(registro.inativo)?.toUpperCase() === "S") continue;
      if (texto(registro.bloqueado)?.toUpperCase() === "S") continue;
      const codigo = texto(registro.codigo);
      if (!codigo) continue;
      const descricao = texto(registro.descricao) ?? "";
      // Convenção manual da empresa: produto descontinuado ganha o prefixo
      // "INATIVO1-"/"INATIVO-" na DESCRIÇÃO (o cadastro segue ativo no Omie,
      // então o campo `inativo` não pega). Fora da busca.
      if (semAcento(descricao).trimStart().startsWith("inativo")) continue;
      saida.push({ codigo, descricao });
    }
  }
  if (saida.length > 0) return saida;

  // Nada por descrição: o pessoal costuma digitar o CÓDIGO (SKU) do produto, que
  // o filtro de descrição não acha. Tenta como código exato.
  const porCodigo = await buscarProdutosPorCodigo([q], chamar);
  const doCodigo: ProdutoResumo[] = [];
  for (const [codigo, produto] of porCodigo) {
    doCodigo.push({ codigo, descricao: produto.descricao });
  }
  return doCodigo;
}

export interface SaldoProduto {
  saldo: number; // soma de nSaldo em TODOS os locais
}

// Saldo TOTAL (todos os locais) de um ou mais SKUs numa chamada. `lista_local_estoque:
// "TODOS"` traz uma linha por (produto × local); somamos nSaldo por código. `cExibeTodos:
// "S"` evita a armadilha "conjunto zerado = fault". Usado pra mostrar o estoque ao lado do
// produto escolhido na requisição.
export async function saldoTotalPorCodigo(
  codigos: readonly string[],
  dataPosicao: string,
  chamar: ChamarFn,
): Promise<Map<string, number>> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const mapa = new Map<string, number>();
  if (unicos.length === 0) return mapa;
  const resp = await chamar("estoque/consulta/", "ListarPosEstoque", {
    nPagina: 1,
    nRegPorPagina: Math.max(unicos.length * 8, 50),
    dDataPosicao: dataPosicao,
    cExibeTodos: "S",
    lista_local_estoque: "TODOS",
    lista_produtos: unicos.map((cCodigo) => ({ cCodigo })),
  });
  const produtos = resp?.produtos;
  if (!Array.isArray(produtos)) return mapa;
  for (const p of produtos as OmiePayload[]) {
    const codigo = texto(p.cCodigo);
    if (!codigo) continue;
    mapa.set(codigo, (mapa.get(codigo) ?? 0) + (numero(p.nSaldo) ?? 0));
  }
  return mapa;
}

// -----------------------------------------------------------------------------
// Leitura: locais de estoque + saldo por SKU num local
// -----------------------------------------------------------------------------

// Local padrão: o `ListarPosEstoque` aceita `codigo_local_estoque: 0` como
// atalho pro padrão, e o `IncluirAjusteEstoque` assume o padrão quando o campo
// é omitido.
export const LOCAL_PADRAO = "0";

export interface LocalEstoque {
  codigo: string; // codigo_local_estoque (id do Omie — pode passar de 2^31, fica String)
  descricao: string;
  padrao: boolean;
}

// Locais de estoque ativos da empresa da app_key (READ paginado, cache 1h —
// mesma consulta do nextstep). A lista é dinâmica: NUNCA fixar códigos de
// local em código (cada empresa/chave tem os seus).
export async function listarLocaisEstoque(chamar: ChamarFn): Promise<LocalEstoque[]> {
  const locais: LocalEstoque[] = [];
  let pagina = 1;
  for (;;) {
    const resp = await chamar(
      "estoque/local/",
      "ListarLocaisEstoque",
      { nPagina: pagina, nRegPorPagina: 50 },
      { ttlSeconds: 3600 },
    );
    if (!resp) break;
    const encontrados = resp.locaisEncontrados;
    if (Array.isArray(encontrados)) {
      for (const loc of encontrados as OmiePayload[]) {
        if (loc.inativo === "S") continue;
        const codigo = texto(loc.codigo_local_estoque);
        if (!codigo) continue;
        locais.push({
          codigo,
          descricao: texto(loc.descricao) ?? codigo,
          padrao: loc.padrao === "S",
        });
      }
    }
    const totalPaginas = numero(resp.nTotPaginas) ?? 1;
    if (pagina >= totalPaginas) break;
    pagina += 1;
  }
  return locais;
}

// Nome do local pra histórico/auditoria (best-effort: lista cacheada por 1h;
// se a leitura falhar, o registro fica só com o código).
export async function nomeDoLocal(codigoLocal: string, chamar: ChamarFn): Promise<string | undefined> {
  try {
    const locais = await listarLocaisEstoque(chamar);
    if (codigoLocal === LOCAL_PADRAO) {
      return locais.find((local) => local.padrao)?.descricao;
    }
    return locais.find((local) => local.codigo === codigoLocal)?.descricao;
  } catch {
    return undefined;
  }
}

export interface SaldoEstoque {
  saldo: number;
  cmc: number; // custo médio contábil (vira o `valor` obrigatório do ajuste)
  estoqueMinimo?: number; // estoque_minimo do Omie (0/ausente = sem mínimo definido)
}

// `{SKU → saldo/CMC}` numa única chamada, no local pedido (LOCAL_PADRAO = "0"
// = local padrão). `cExibeTodos: "S"` é OBRIGATÓRIO aqui: com "N", um conjunto
// de SKUs todo zerado no local vira fault "Não existem registros" (= EMPTY =
// conta pro orçamento de ban); com "S" a resposta traz os zeros sem fault.
export async function saldosPorCodigo(
  codigos: readonly string[],
  dataPosicao: string, // DD/MM/AAAA (o caller passa a data — módulo puro)
  chamar: ChamarFn,
  codigoLocal: string = LOCAL_PADRAO,
): Promise<Map<string, SaldoEstoque>> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const mapa = new Map<string, SaldoEstoque>();
  if (unicos.length === 0) return mapa;
  const resp = await chamar("estoque/consulta/", "ListarPosEstoque", {
    nPagina: 1,
    nRegPorPagina: Math.max(unicos.length, 50),
    dDataPosicao: dataPosicao,
    cExibeTodos: "S",
    codigo_local_estoque: Number(codigoLocal),
    lista_produtos: unicos.map((cCodigo) => ({ cCodigo })),
  });
  const produtos = resp?.produtos;
  if (!Array.isArray(produtos)) return mapa;
  for (const p of produtos as OmiePayload[]) {
    const codigo = texto(p.cCodigo);
    if (!codigo) continue;
    mapa.set(codigo, {
      saldo: numero(p.nSaldo) ?? 0,
      cmc: numero(p.nCMC) ?? 0,
      estoqueMinimo: numero(p.estoque_minimo) ?? 0,
    });
  }
  return mapa;
}

// -----------------------------------------------------------------------------
// Leitura: lotes disponíveis de um produto (controle de lote)
// -----------------------------------------------------------------------------

export interface LoteDisponivel {
  nIdLote: string; // id interno do lote no Omie (vai no lote_validade da baixa)
  numero: string; // cNumLote (nº do lote, só para exibição/log)
  saldo: number; // nSaldoLote (entrada − saída) no local consultado
  validade?: string; // dDataValidade (DD/MM/AAAA) — ordena a saída FEFO
}

// Lotes COM saldo (> 0) de um produto num local. Produto sem controle de lote /
// sem lote com saldo → []. `nIdLocal` filtra pelo local (omitido no padrão "0",
// quando o Omie assume o local padrão da empresa). Best-effort: propaga
// OmieBlocked/erros do client (o caller decide), resposta sem `lotes` → [].
export async function consultarLotes(
  idProd: string,
  chamar: ChamarFn,
  codigoLocal: string = LOCAL_PADRAO,
): Promise<LoteDisponivel[]> {
  const param: OmiePayload = { nCodProd: Number(idProd) };
  if (codigoLocal && codigoLocal !== LOCAL_PADRAO) {
    param.nIdLocal = Number(codigoLocal);
  }
  const resp = await chamar("produtos/produtoslote/", "ConsultarLote", param);
  const lotes = resp?.lotes;
  if (!Array.isArray(lotes)) return [];
  const saida: LoteDisponivel[] = [];
  for (const registro of lotes as OmiePayload[]) {
    const nIdLote = texto(registro.nIdLote);
    const saldo = numero(registro.nSaldoLote) ?? 0;
    if (!nIdLote || saldo <= 0) continue;
    saida.push({
      nIdLote,
      numero: texto(registro.cNumLote) ?? "",
      saldo,
      validade: texto(registro.dDataValidade) || undefined,
    });
  }
  return saida;
}

// Resolve os lotes de vários SKUs (só os que têm controle de lote), sequencial e
// ban-safe — uma leitura por produto no MESMO local da baixa. Usada pelo caller
// para pré-carregar o `ContextoBaixa.lotes` antes de escrever.
export async function lotesPorCodigo(
  produtos: ReadonlyMap<string, ProdutoEstoque>,
  skus: readonly string[],
  chamar: ChamarFn,
  codigoLocal: string = LOCAL_PADRAO,
): Promise<Map<string, LoteDisponivel[]>> {
  const mapa = new Map<string, LoteDisponivel[]>();
  const vistos = new Set<string>();
  for (const sku of skus) {
    const chave = sku.trim();
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    const produto = produtos.get(chave);
    if (!produto?.controleLote) continue;
    mapa.set(chave, await consultarLotes(produto.idProd, chamar, codigoLocal));
  }
  return mapa;
}

// Arredonda para 4 casas (o mesmo teto das quantidades Decimal do domínio),
// matando poeira de ponto flutuante da soma/subtração das alocações.
function arred(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

// Chave ordenável da validade → "AAAAMMDD"; sem validade (ou formato não
// reconhecido) vai pro fim (consome por último os lotes sem data). Aceita
// "DD/MM/AAAA" (padrão das datas do Omie) e "AAAA-MM-DD" (ISO), por robustez.
function chaveValidade(validade?: string): string {
  const bruto = validade?.trim();
  if (!bruto) return "99999999";
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(bruto);
  if (br) return `${br[3]}${br[2]}${br[1]}`;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(bruto);
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`;
  return "99999999";
}

// FEFO ("first expired, first out"): vence antes sai antes; empate pelo lote mais
// antigo (id menor).
function compararFEFO(a: LoteDisponivel, b: LoteDisponivel): number {
  const va = chaveValidade(a.validade);
  const vb = chaveValidade(b.validade);
  if (va !== vb) return va < vb ? -1 : 1;
  return Number(a.nIdLote) - Number(b.nIdLote);
}

export interface AlocacaoLote {
  nIdLote: string;
  quantidade: number;
}

// Distribui `quantidade` entre os lotes por FEFO. `jaConsumido` desconta o que
// outros itens do MESMO lote já pegaram nesta rodada (SKU repetido na planilha).
// `faltou > 0` = a soma dos saldos de lote não cobre o pedido.
export function alocarLotesFEFO(
  quantidade: number,
  lotes: readonly LoteDisponivel[],
  jaConsumido?: ReadonlyMap<string, number>,
): { alocacao: AlocacaoLote[]; faltou: number } {
  const alocacao: AlocacaoLote[] = [];
  let restante = quantidade;
  for (const lote of [...lotes].sort(compararFEFO)) {
    if (restante <= 1e-9) break;
    const disponivel = lote.saldo - (jaConsumido?.get(lote.nIdLote) ?? 0);
    if (disponivel <= 0) continue;
    const usar = arred(Math.min(disponivel, restante));
    alocacao.push({ nIdLote: lote.nIdLote, quantidade: usar });
    restante = arred(restante - usar);
  }
  return { alocacao, faltou: restante > 1e-9 ? arred(restante) : 0 };
}

// -----------------------------------------------------------------------------
// Escrita: baixa (saída) item a item
// -----------------------------------------------------------------------------

export interface ItemBaixa {
  // Identidade NOSSA do item (id do RequisicaoItem/BaixaItem). Vira o
  // `cod_int_ajuste` (string60) — chave de idempotência do reenvio.
  chave: string;
  sku: string;
  quantidade: number;
  // Observação do movimento no Omie (quem pediu, setor, pedido/NF/OP…).
  obs: string;
}

export type OutcomeBaixa = "baixado" | "ja_baixado" | "falha" | "nao_baixado";

export interface ResultadoItemBaixa {
  chave: string;
  sku: string;
  outcome: OutcomeBaixa;
  motivo?: string;
  omieRef?: string; // id_ajuste devolvido pelo Omie
  custoUnitario?: number; // CMC usado (relatório de consumo + valor do estorno)
  lotes?: AlocacaoLote[]; // alocação de lote usada (o estorno reverte nos mesmos lotes)
}

export interface ResultadoBaixa {
  itens: ResultadoItemBaixa[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
}

export interface ContextoBaixa {
  data: string; // DD/MM/AAAA
  produtos: Map<string, ProdutoEstoque>; // de buscarProdutosPorCodigo
  saldos: Map<string, SaldoEstoque>; // de saldosPorCodigo (do MESMO local da baixa)
  // Lotes por SKU (de lotesPorCodigo), só para produtos com controle de lote e
  // no MESMO local da baixa. Ausente = sem controle de lote (baixa sem lote).
  lotes?: Map<string, LoteDisponivel[]>;
  // Local de estoque da baixa. LOCAL_PADRAO/ausente = local padrão (campo
  // omitido no IncluirAjusteEstoque).
  codigoLocal?: string;
}

// Mensagem amigável pros erros comuns do ajuste. A baixa por lote agora é
// automática (FEFO), mas se o Omie ainda reclamar de lote — ex. o cadastro do
// produto marca controle de lote depois que já lemos os produtos, ou não há
// lote com saldo — orientamos a conferir os lotes no Omie.
function motivoAmigavel(bruto: string): string {
  if (semAcento(bruto).includes("lote")) {
    return (
      "Produto com controle de lote: o Omie recusou a baixa por lote. " +
      "Confira os lotes do produto no Omie (pode não haver lote com saldo neste local)."
    );
  }
  return bruto;
}

// Baixa SEQUENCIAL dos itens no local padrão. Valida saldo LOCALMENTE antes de
// chamar (saldo insuficiente/produto desconhecido = falha SEM gastar chamada) —
// não consome orçamento de erro da Omie com problema evitável (§6).
export async function baixarEstoque(
  itens: readonly ItemBaixa[],
  ctx: ContextoBaixa,
  chamar: ChamarFn,
): Promise<ResultadoBaixa> {
  const resultados: ResultadoItemBaixa[] = [];
  let interrompido = false;
  let bloqueado = false;
  let motivoInterrupcao: string | undefined;
  let sequenciaRisco = 0;
  // Quanto cada lote já teve reservado por itens ANTERIORES desta rodada (SKU
  // repetido na planilha consome do mesmo lote sem estourar o saldo dele).
  const consumidoPorLote = new Map<string, number>();

  const registrarSequencia = (sucessoLimpo: boolean, custoOmie: boolean): void => {
    if (!custoOmie) return;
    if (sucessoLimpo) {
      sequenciaRisco = 0;
      return;
    }
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrompido = true;
      motivoInterrupcao =
        `Baixa pausada por segurança após ${LIMITE_SEQUENCIA_RISCO} respostas seguidas ` +
        "fora do sucesso limpo (margem antes do limite de bloqueio da Omie). " +
        "Aguarde alguns minutos e reenvie o restante.";
    }
  };

  for (const item of itens) {
    if (interrompido) {
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "nao_baixado",
        motivo: MOTIVO_NAO_BAIXADO,
      });
      continue;
    }

    const produto = ctx.produtos.get(item.sku);
    if (!produto) {
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "falha",
        motivo: "Código não encontrado no Omie.",
      });
      continue;
    }

    const saldo = ctx.saldos.get(item.sku);
    const disponivel = saldo?.saldo ?? 0;
    if (disponivel < item.quantidade) {
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "falha",
        motivo: `Saldo insuficiente neste local de estoque: disponível ${disponivel}, pedido ${item.quantidade}.`,
      });
      continue;
    }

    // Produto com controle de lote: escolhe de qual(is) lote(s) sai a quantidade
    // (FEFO) e monta o `lote_validade`. Sem lote com saldo (ou lote não
    // pré-carregado) = falha LOCAL, sem gastar chamada nem orçamento de ban. O
    // consumo só é registrado APÓS a baixa dar certo (mais abaixo) — reservar
    // antes faria uma falha/duplicado "segurar" saldo de lote de outro item do
    // mesmo SKU nesta rodada.
    let loteValidade: { nIdLote: number; nQtdLote: number }[] | undefined;
    let alocacaoLote: AlocacaoLote[] | undefined;
    if (produto.controleLote) {
      const lotes = ctx.lotes?.get(item.sku) ?? [];
      const alocado = alocarLotesFEFO(item.quantidade, lotes, consumidoPorLote);
      if (alocado.faltou > 0) {
        resultados.push({
          chave: item.chave,
          sku: item.sku,
          outcome: "falha",
          motivo:
            "Produto com controle de lote sem lote com saldo suficiente neste local " +
            `(faltou ${alocado.faltou}). Confira os lotes do produto no Omie.`,
        });
        continue;
      }
      alocacaoLote = alocado.alocacao;
      loteValidade = alocado.alocacao.map((a) => ({ nIdLote: Number(a.nIdLote), nQtdLote: a.quantidade }));
    }

    const cmc = saldo?.cmc ?? 0;
    const localEscolhido = ctx.codigoLocal && ctx.codigoLocal !== LOCAL_PADRAO ? ctx.codigoLocal : undefined;
    try {
      const resp = await chamar(
        "estoque/ajuste/",
        "IncluirAjusteEstoque",
        {
          cod_int_ajuste: item.chave.slice(0, 60),
          id_prod: Number(produto.idProd),
          data: ctx.data,
          quan: item.quantidade,
          tipo: "SAI",
          motivo: "OPS",
          origem: "AJU",
          // Saída: o Omie preenche o valor pelo CMC. Só mandamos quando há custo
          // médio (> 0); sem custo, omitimos — o Omie baixa a 0 (só consome o
          // estoque) em vez de rejeitar por "custo médio unitário não informado".
          ...(cmc > 0 ? { valor: Number((cmc * item.quantidade).toFixed(2)) } : {}),
          obs: item.obs.slice(0, 500),
          ...(loteValidade ? { lote_validade: loteValidade } : {}),
          ...(localEscolhido ? { codigo_local_estoque: Number(localEscolhido) } : {}),
        },
        WRITE,
      );
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "baixado",
        omieRef: texto(resp?.id_ajuste) ?? texto(resp?.id_movest),
        custoUnitario: cmc,
        ...(alocacaoLote ? { lotes: alocacaoLote } : {}),
      });
      // Só uma baixa NOVA consome o lote nesta rodada (o ja_baixado/duplicado de
      // uma rodada anterior já está descontado no saldo lido do lote).
      if (alocacaoLote) {
        for (const a of alocacaoLote) {
          consumidoPorLote.set(a.nIdLote, (consumidoPorLote.get(a.nIdLote) ?? 0) + a.quantidade);
        }
      }
      registrarSequencia(true, true);
    } catch (erro) {
      if (erro instanceof OmieBlocked) {
        interrompido = true;
        bloqueado = true;
        motivoInterrupcao = mensagem(erro);
        resultados.push({
          chave: item.chave,
          sku: item.sku,
          outcome: "nao_baixado",
          motivo: MOTIVO_NAO_BAIXADO,
        });
        continue;
      }
      if (erro instanceof OmieDuplicate) {
        // `cod_int_ajuste` repetido = esta baixa JÁ aconteceu num envio
        // anterior (reenvio após pausa/bloqueio). Sucesso idempotente.
        resultados.push({ chave: item.chave, sku: item.sku, outcome: "ja_baixado" });
        registrarSequencia(false, true);
        continue;
      }
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "falha",
        motivo: motivoAmigavel(mensagem(erro)),
      });
      registrarSequencia(false, true);
    }
  }

  return { itens: resultados, interrompido, bloqueado, motivoInterrupcao };
}

// -----------------------------------------------------------------------------
// Estorno: reverter uma baixa (entrada compensatória)
// -----------------------------------------------------------------------------

export interface ItemReversao {
  chave: string; // id do BaixaItem (vira `est-<chave>` = cod_int do estorno)
  sku: string;
  idProd: string; // codigo_produto (id interno)
  quantidade: number;
  custoUnitario: number; // valor da entrada (mesmo CMC da baixa)
  lotes?: AlocacaoLote[]; // lotes a devolver (a MESMA alocação da baixa)
  obs: string;
}

export type OutcomeReversao = "estornado" | "ja_estornado" | "falha" | "nao_estornado";

export interface ResultadoItemReversao {
  chave: string;
  sku: string;
  outcome: OutcomeReversao;
  motivo?: string;
  omieRef?: string;
}

export interface ResultadoReversao {
  itens: ResultadoItemReversao[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
}

const MOTIVO_NAO_ESTORNADO = "Estorno interrompido antes de chegar neste item.";

// Estorno: lança a ENTRADA (tipo "ENT") de cada item, nos MESMOS lotes que a
// baixa consumiu (ENT com `lote_validade` por `nIdLote` SOMA de volta no lote).
// Sequencial e ban-safe; `cod_int_ajuste = est-<chave>` é determinístico →
// reenviar não estorna duas vezes (OmieDuplicate = já estornado).
export async function reverterBaixa(
  itens: readonly ItemReversao[],
  data: string,
  chamar: ChamarFn,
  codigoLocal?: string,
): Promise<ResultadoReversao> {
  const resultados: ResultadoItemReversao[] = [];
  let interrompido = false;
  let bloqueado = false;
  let motivoInterrupcao: string | undefined;
  let sequenciaRisco = 0;
  const localEscolhido = codigoLocal && codigoLocal !== LOCAL_PADRAO ? codigoLocal : undefined;

  const contarRisco = () => {
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrompido = true;
      motivoInterrupcao =
        "Estorno pausado por segurança (margem antes do limite do Omie). Tente de novo em alguns minutos.";
    }
  };

  for (const item of itens) {
    if (interrompido) {
      resultados.push({ chave: item.chave, sku: item.sku, outcome: "nao_estornado", motivo: MOTIVO_NAO_ESTORNADO });
      continue;
    }
    const loteValidade = item.lotes?.map((a) => ({ nIdLote: Number(a.nIdLote), nQtdLote: a.quantidade }));
    try {
      const resp = await chamar(
        "estoque/ajuste/",
        "IncluirAjusteEstoque",
        {
          cod_int_ajuste: `est-${item.chave}`.slice(0, 60),
          id_prod: Number(item.idProd),
          data,
          quan: item.quantidade,
          tipo: "ENT",
          motivo: "OPS",
          origem: "AJU",
          ...(item.custoUnitario > 0 ? { valor: Number((item.custoUnitario * item.quantidade).toFixed(2)) } : {}),
          obs: item.obs.slice(0, 500),
          ...(loteValidade && loteValidade.length > 0 ? { lote_validade: loteValidade } : {}),
          ...(localEscolhido ? { codigo_local_estoque: Number(localEscolhido) } : {}),
        },
        WRITE,
      );
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "estornado",
        omieRef: texto(resp?.id_ajuste) ?? texto(resp?.id_movest),
      });
      sequenciaRisco = 0;
    } catch (erro) {
      if (erro instanceof OmieBlocked) {
        interrompido = true;
        bloqueado = true;
        motivoInterrupcao = mensagem(erro);
        resultados.push({ chave: item.chave, sku: item.sku, outcome: "nao_estornado", motivo: MOTIVO_NAO_ESTORNADO });
        continue;
      }
      if (erro instanceof OmieDuplicate) {
        // `est-<chave>` repetido = este item JÁ foi estornado antes. Idempotente.
        resultados.push({ chave: item.chave, sku: item.sku, outcome: "ja_estornado" });
        contarRisco();
        continue;
      }
      resultados.push({ chave: item.chave, sku: item.sku, outcome: "falha", motivo: mensagem(erro) });
      contarRisco();
    }
  }

  return { itens: resultados, interrompido, bloqueado, motivoInterrupcao };
}

// Data de hoje no formato do Omie (DD/MM/AAAA), no fuso de São Paulo — a Vercel
// roda em UTC e a virada de dia local importa pra posição de estoque.
export function dataOmieHoje(agora: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return formatter.format(agora);
}
