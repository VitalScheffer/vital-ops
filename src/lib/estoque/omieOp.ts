// Ordem de Produção do Omie + TRANSFERÊNCIA de estoque entre locais.
//
// Calls usados (conferidos contra a API real em 28/08/2026):
//   • `ListarOrdemProducao` (produtos/op/) — READ. Com `lExibirItens: true` a OP
//     volta com `itensDetalhes` já EXPLODIDO e MULTIPLICADO pela quantidade da
//     ordem: a OP 2026/00801 (10 unidades) traz `10` de cada peça e `11,7349`
//     do tubo em KG. Ou seja, a conta de "10 UN de chapa a 1 kg vira 10 kg"
//     quem faz é o Omie, não nós. NÃO existe filtro por número da OP no
//     serviço: a listagem vem inteira (76 ordens em 28/08/2026) e o casamento
//     por `cNumOP` é LOCAL. Uma leitura que dá certo é requisição correta e não
//     conta pro bloqueio da app_key (§6 do REQUISITOS).
//   • `ListarProdutos` (geral/produtos/) com `produtosPorCodigo` recebendo
//     `codigo_produto` (o ID INTERNO, não o código) — READ em lote. A OP
//     identifica cada item só pelo id (`nIdProdutoMalha`); confirmado que o
//     filtro aceita id, então uma OP de 75 itens custa 2 chamadas e não 75.
//   • `IncluirAjusteEstoque` (estoque/ajuste/) — WRITE. O Omie NÃO tem método de
//     transferência entre locais: transferir é uma SAÍDA na origem seguida de
//     uma ENTRADA no destino, com o mesmo produto, quantidade e (quando há
//     controle de lote) os mesmos lotes.
//
// Módulo PURO (não toca banco/sessão): recebe `chamar` por parâmetro, igual ao
// omieEstoque. Reaproveita dali produtos, saldos, lotes e FEFO.

import { OmieBlocked, OmieDuplicate } from "@/lib/omie/errors";
import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { semAcento } from "@/lib/texto";
import {
  LOCAL_PADRAO,
  alocarLotesFEFO,
  type AlocacaoLote,
  type ChamarFn,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "./omieEstoque";

const WRITE: ChamarOptions = { write: true };

// Mesmo freio do omieEstoque: a Omie conta TODA resposta fora de sucesso limpo
// pro banimento (10ª incorreta no mesmo método = HTTP 425 por ~30min).
const LIMITE_SEQUENCIA_RISCO = 5;

// TTL curto na listagem de OPs. Ao contrário do catálogo de matéria-prima, a
// lista de ordens muda o tempo todo (a última do dia 28/08 tinha sido criada na
// véspera), então cachear por hora entregaria OP velha. 120s fica acima do piso
// de 60s da própria Omie e ainda segura o F5 repetido.
const TTL_ORDENS_SEGUNDOS = 120;
const REGISTROS_POR_PAGINA = 100;
// Guarda contra um `total_de_paginas` estranho virar laço longo.
const MAX_PAGINAS = 30;

const MOTIVO_NAO_TRANSFERIDO = "Transferência interrompida antes de chegar neste item.";

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

// -----------------------------------------------------------------------------
// Leitura: ordens de produção
// -----------------------------------------------------------------------------

/** Um item da OP como o Omie devolve: só o ID do produto e a quantidade. */
export interface ItemOrdem {
  idProd: string;
  quantidade: number;
  /** Local que a própria OP aponta para o item (informativo — não é a origem). */
  localCodigo?: string;
  /** `cReservado` da OP. Reserva NATIVA do Omie, que não é a nossa transferência. */
  reservado: boolean;
}

export interface OrdemProducao {
  /** `cNumOP`, o número que a pessoa digita na tela (ex.: "2026/00802"). */
  numero: string;
  /** `nCodOP`, id interno. */
  codigo: string;
  idProduto: string;
  quantidade: number;
  dataPrevisao?: string;
  localCodigo?: string;
  concluida: boolean;
  itens: ItemOrdem[];
}

function lerOrdem(registro: OmiePayload): OrdemProducao | null {
  const ident = registro.identificacao as OmiePayload | undefined;
  const numeroOp = texto(ident?.cNumOP)?.trim();
  const codigo = texto(ident?.nCodOP)?.trim();
  if (!numeroOp || !codigo) return null;

  const detalhes = Array.isArray(registro.itensDetalhes) ? (registro.itensDetalhes as OmiePayload[]) : [];
  const itens: ItemOrdem[] = [];
  for (const bruto of detalhes) {
    const idProd = texto(bruto.nIdProdutoMalha)?.trim();
    const quantidade = numero(bruto.nQtde);
    if (!idProd || quantidade === undefined) continue;
    itens.push({
      idProd,
      quantidade,
      localCodigo: texto(bruto.codigo_local_estoque)?.trim(),
      reservado: texto(bruto.cReservado)?.toUpperCase() === "S",
    });
  }

  const outras = registro.outrasInf as OmiePayload | undefined;
  return {
    numero: numeroOp,
    codigo,
    idProduto: texto(ident?.nCodProduto)?.trim() ?? "",
    quantidade: numero(ident?.nQtde) ?? 0,
    dataPrevisao: texto(ident?.dDtPrevisao)?.trim(),
    localCodigo: texto(ident?.codigo_local_estoque)?.trim(),
    concluida: texto(outras?.cConcluida)?.toUpperCase() === "S",
    itens,
  };
}

/**
 * Todas as ordens de produção, com itens. Erros do client sobem pro chamador:
 * sem a lista não dá pra achar OP nenhuma, e inventar uma lista vazia faria a
 * tela dizer "OP não encontrada" para uma OP que existe.
 */
export async function listarOrdensProducao(
  chamar: ChamarFn,
  opcoes: { revalidar?: boolean } = {},
): Promise<OrdemProducao[]> {
  const ordens: OrdemProducao[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    const resp = await chamar(
      "produtos/op/",
      "ListarOrdemProducao",
      { pagina, registros_por_pagina: REGISTROS_POR_PAGINA, lExibirItens: true },
      { ttlSeconds: TTL_ORDENS_SEGUNDOS, revalidar: opcoes.revalidar },
    );
    if (!resp) break;

    const cadastros = resp.cadastros;
    if (Array.isArray(cadastros)) {
      for (const registro of cadastros as OmiePayload[]) {
        const ordem = lerOrdem(registro);
        if (ordem) ordens.push(ordem);
      }
    }

    const totalPaginas = numero(resp.total_de_paginas) ?? 1;
    if (pagina >= totalPaginas) break;
  }

  return ordens;
}

/**
 * Normaliza o número digitado para casar com o `cNumOP` do Omie. A pessoa
 * escreve "2026/802", "2026-00802" ou só "802"; o Omie guarda "2026/00802".
 * Compara pelos DÍGITOS, com o sequencial preenchido de zeros à esquerda.
 */
export function chaveDaOrdem(entrada: string): string {
  const bruto = String(entrada ?? "").trim();
  if (!bruto) return "";
  const partes = bruto.split(/[^\dA-Za-z]+/).filter(Boolean);
  if (partes.length === 0) return "";
  const sequencial = partes[partes.length - 1].replace(/^0+/, "") || "0";
  const ano = partes.length > 1 ? partes[partes.length - 2] : "";
  return ano ? `${ano}/${sequencial}` : sequencial;
}

/**
 * Acha a ordem pelo número digitado. Quando a pessoa não informa o ano, casa
 * pelo sequencial — se mais de um ano tiver o mesmo sequencial, devolve
 * `ambiguas` para a tela pedir o ano em vez de escolher uma por conta própria.
 */
export function acharOrdem(
  numeroDigitado: string,
  ordens: readonly OrdemProducao[],
): { ordem?: OrdemProducao; ambiguas?: OrdemProducao[] } {
  const alvo = chaveDaOrdem(numeroDigitado);
  if (!alvo) return {};

  const casadas = ordens.filter((o) => chaveDaOrdem(o.numero) === alvo);
  if (casadas.length === 1) return { ordem: casadas[0] };
  if (casadas.length > 1) return { ambiguas: casadas };

  // Sem ano: tenta pelo sequencial sozinho.
  if (alvo.includes("/")) return {};
  const porSequencial = ordens.filter((o) => chaveDaOrdem(o.numero).split("/").pop() === alvo);
  if (porSequencial.length === 1) return { ordem: porSequencial[0] };
  if (porSequencial.length > 1) return { ambiguas: porSequencial };
  return {};
}

/**
 * Soma as quantidades do MESMO produto. O Omie repete o item uma vez por peça
 * que o consome (na OP 2026/00802 o `MATTB RD190` aparece com 263,745 e depois
 * com 203,058, porque entra em duas peças diferentes). Mover duas linhas do
 * mesmo SKU sairia como duas movimentações do mesmo material, então a soma
 * acontece ANTES de qualquer coisa. Preserva a ordem da primeira aparição.
 */
export function agregarItens(itens: readonly ItemOrdem[]): ItemOrdem[] {
  const somados = new Map<string, ItemOrdem>();
  for (const item of itens) {
    const atual = somados.get(item.idProd);
    if (atual) {
      atual.quantidade += item.quantidade;
      atual.reservado = atual.reservado || item.reservado;
      continue;
    }
    somados.set(item.idProd, { ...item });
  }
  // Ponto flutuante: 0,1 + 0,2 vira 0,30000000000000004 e isso ia parar na tela
  // e no ajuste do Omie. As quantidades da OP têm no máximo 4 casas.
  for (const item of somados.values()) {
    item.quantidade = Number(item.quantidade.toFixed(4));
  }
  return [...somados.values()];
}

// -----------------------------------------------------------------------------
// Classificação do item (o que é matéria-prima, o que é peça)
// -----------------------------------------------------------------------------

export type GrupoItem = "MAT" | "COM" | "SBM" | "PECA" | "OUTRO";

export const ROTULO_GRUPO: Record<GrupoItem, string> = {
  MAT: "Matéria-prima",
  COM: "Comprado",
  SBM: "Submontagem",
  PECA: "Peça",
  OUTRO: "Outro",
};

// Grupos que a tela mostra por padrão: é o que a fábrica separa e leva pra
// produção. Submontagem e peça só aparecem quando a pessoa pede "toda a BOM".
export const GRUPOS_PADRAO: readonly GrupoItem[] = ["MAT", "COM"];

/**
 * Descobre o grupo do item pela FAMÍLIA do cadastro no Omie, com o código como
 * segunda opinião.
 *
 * A família é a fonte boa porque existe nos dois mundos de código: o novo traz
 * "MAT - MATERIA PRIMA", "SBM - SUBMONTAGEM", "PCA - PEÇAS ACABADAS"; o legado
 * traz "MATÉRIA-PRIMA" sem sigla. O casamento é EXATO contra a sigla (a parte
 * antes de " - ") e contra a lista de nomes legados, nunca por "começa com
 * MAT": a família legada "MATERIAIS DE ESCRITÓRIO" também começaria com MAT e
 * caneta esferográfica viraria matéria-prima.
 */
export function grupoDoItem(codigo: string, familia?: string): GrupoItem {
  const fam = semAcento(familia ?? "").toUpperCase().trim();
  const sigla = fam.includes(" - ") ? fam.slice(0, fam.indexOf(" - ")).trim() : fam;

  if (sigla === "MAT" || sigla === "MATERIA-PRIMA" || sigla === "MATERIA PRIMA") return "MAT";
  if (sigla === "COM") return "COM";
  if (sigla === "SBM") return "SBM";
  if (sigla === "PCA" || sigla === "PCF") return "PECA";

  // Família desconhecida (ou ausente): o código do padrão novo ainda diz.
  const cod = String(codigo ?? "").replace(/\s+/g, "").toUpperCase();
  if (cod.startsWith("MAT")) return "MAT";
  if (cod.startsWith("COM")) return "COM";
  return "OUTRO";
}

// -----------------------------------------------------------------------------
// Leitura: produtos da OP por ID interno (em lote)
// -----------------------------------------------------------------------------

export interface ProdutoOp extends ProdutoEstoque {
  idProd: string;
  codigo: string;
  familia?: string;
  grupo: GrupoItem;
  /**
   * Cadastro inativo ou bloqueado no Omie. NÃO filtramos aqui de propósito: uma
   * OP pode referenciar um produto que foi inativado depois, e sumir com a linha
   * faria a pessoa movimentar menos material do que a ordem pede sem perceber.
   * Quem monta lista de escolha (De/Para, substituto) é que descarta.
   */
  inativo: boolean;
  bloqueado: boolean;
}

const BLOCO_IDS = 50;

function* emBlocos<T>(itens: readonly T[], tamanho: number): Generator<T[]> {
  for (let i = 0; i < itens.length; i += tamanho) {
    yield itens.slice(i, i + tamanho);
  }
}

/**
 * `{id interno → produto}` a partir dos ids que a OP devolve. O filtro
 * `produtosPorCodigo` aceita `codigo_produto` (id interno), então 75 itens
 * custam 2 chamadas. Id ausente do mapa = produto que não voltou do Omie; quem
 * chama decide (a tela mostra a linha como "não identificado" em vez de sumir
 * com ela, senão a pessoa move menos material do que a OP pede sem perceber).
 */
export async function buscarProdutosPorId(
  ids: readonly string[],
  chamar: ChamarFn,
): Promise<Map<string, ProdutoOp>> {
  // Só id NUMÉRICO entra: `codigo_produto` é inteiro no Omie, e um id estranho
  // viraria `NaN` no payload. Requisição inválida é requisição incorreta, e
  // requisição incorreta conta pro bloqueio da app_key (§6 do REQUISITOS).
  const unicos = [
    ...new Set(
      ids
        .map((id) => String(id).trim())
        .filter((id) => id.length > 0 && Number.isFinite(Number(id))),
    ),
  ];
  const mapa = new Map<string, ProdutoOp>();
  if (unicos.length === 0) return mapa;

  for (const bloco of emBlocos(unicos, BLOCO_IDS)) {
    const resp = await chamar("geral/produtos/", "ListarProdutos", {
      pagina: 1,
      registros_por_pagina: bloco.length,
      apenas_importado_api: "N",
      filtrar_apenas_omiepdv: "N",
      produtosPorCodigo: bloco.map((id) => ({ codigo_produto: Number(id) })),
    });
    const lista = resp?.produto_servico_cadastro;
    if (!Array.isArray(lista)) continue;

    for (const registro of lista as OmiePayload[]) {
      const idProd = texto(registro.codigo_produto)?.trim();
      const codigo = texto(registro.codigo)?.trim();
      if (!idProd || !codigo) continue;
      const familia = texto(registro.descricao_familia)?.trim();
      mapa.set(idProd, {
        idProd,
        codigo,
        descricao: texto(registro.descricao) ?? codigo,
        unidade: texto(registro.unidade)?.trim(),
        controleLote: texto(registro.produto_lote)?.toUpperCase() === "S",
        familia,
        grupo: grupoDoItem(codigo, familia),
        inativo: texto(registro.inativo)?.toUpperCase() === "S",
        bloqueado: texto(registro.bloqueado)?.toUpperCase() === "S",
      });
    }
  }

  return mapa;
}

// -----------------------------------------------------------------------------
// Chaves de idempotência
// -----------------------------------------------------------------------------
//
// Todo ajuste que mandamos leva um `cod_int_ajuste` derivado do id do NOSSO
// item, e é ele que faz reenviar virar duplicado em vez de mover material duas
// vezes. Um item pode gerar até quatro ajustes ao longo da vida, e cada um
// precisa de chave própria:
//
//   `<id>-s`       saída na origem (transferência)
//   `<id>-e`       entrada no destino (transferência)
//   `<id>-b<n>`    saída de consumo (baixa), ciclo n
//   `est-<id>-b<n>` entrada de estorno do ciclo n (prefixo do `reverterBaixa`)
//
// O contador `n` existe por causa do estorno: sem ele, baixar de novo depois de
// devolver o material reusaria a chave da baixa anterior, o Omie responderia
// "duplicado" e o app marcaria como baixado sem ter baixado nada.

export const SUFIXO_SAIDA = "s";
export const SUFIXO_ENTRADA = "e";

/** `cod_int_ajuste` da baixa de consumo do ciclo `seq`. */
export function chaveDaBaixa(itemId: string, seq: number): string {
  return `${itemId}-b${Math.max(0, Math.trunc(seq))}`;
}

/** Volta de `<id>-b<n>` para o id do item. */
export function itemDaChaveDeBaixa(chave: string): string {
  return String(chave ?? "").replace(/-b\d+$/, "");
}

// -----------------------------------------------------------------------------
// Escrita: transferência entre locais (SAÍDA na origem + ENTRADA no destino)
// -----------------------------------------------------------------------------

export interface ItemTransferencia {
  /** Id do nosso `MovimentoOpItem` — vira o `cod_int_ajuste` das duas pernas. */
  chave: string;
  sku: string;
  idProd: string;
  quantidade: number;
  obs: string;
  /**
   * A SAÍDA já foi lançada num envio anterior (o item ficou em
   * `entrada_pendente`). Retomar pula a origem e lança só a entrada — reenviar
   * a saída sairia como duplicado, mas gastaria orçamento de ban à toa.
   */
  saidaFeita?: boolean;
  /** Alocação de lote usada na saída, quando a retomada já a conhece. */
  lotes?: AlocacaoLote[];
}

export type OutcomeTransferencia =
  | "transferido"
  | "ja_transferido"
  | "entrada_pendente"
  | "falha"
  | "nao_transferido";

export interface ResultadoItemTransferencia {
  chave: string;
  sku: string;
  outcome: OutcomeTransferencia;
  motivo?: string;
  refSaida?: string;
  refEntrada?: string;
  custoUnitario?: number;
  lotes?: AlocacaoLote[];
}

export interface ResultadoTransferencia {
  itens: ResultadoItemTransferencia[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
}

export interface ContextoTransferencia {
  data: string; // DD/MM/AAAA
  origemCodigo: string;
  destinoCodigo: string;
  produtos: Map<string, ProdutoEstoque>; // por SKU (diz quem tem controle de lote)
  saldos: Map<string, SaldoEstoque>; // saldo/CMC NA ORIGEM
  lotes?: Map<string, LoteDisponivel[]>; // lotes NA ORIGEM (só produto com lote)
}

function localParaOmie(codigo: string): number | undefined {
  return codigo && codigo !== LOCAL_PADRAO ? Number(codigo) : undefined;
}

/**
 * Move os itens da origem para o destino, um a um e sequencialmente.
 *
 * Cada item são DUAS escritas no Omie (o ERP não tem transferência): a saída na
 * origem e a entrada no destino. O `cod_int_ajuste` é determinístico
 * (`<chave>-s` e `<chave>-e`), então reenviar é duplicado idempotente e nunca
 * move o material duas vezes.
 *
 * O estado que importa é o `entrada_pendente`: a saída passou e a entrada não.
 * O material saiu do saldo da origem e NÃO chegou no destino, então ele não
 * pode ser tratado como uma falha comum (repetir do zero baixaria de novo). A
 * tela mostra esse item em destaque e a retomada manda só a perna que falta,
 * com `saidaFeita: true`.
 *
 * Saldo e existência do produto são validados LOCALMENTE antes de escrever:
 * item sem saldo na origem nem vira chamada (§6 do REQUISITOS).
 */
export async function transferirEstoque(
  itens: readonly ItemTransferencia[],
  ctx: ContextoTransferencia,
  chamar: ChamarFn,
): Promise<ResultadoTransferencia> {
  const resultados: ResultadoItemTransferencia[] = [];
  let interrompido = false;
  let bloqueado = false;
  let motivoInterrupcao: string | undefined;
  let sequenciaRisco = 0;
  const consumidoPorLote = new Map<string, number>();

  const origem = localParaOmie(ctx.origemCodigo);
  const destino = localParaOmie(ctx.destinoCodigo);

  const registrarSequencia = (sucessoLimpo: boolean): void => {
    if (sucessoLimpo) {
      sequenciaRisco = 0;
      return;
    }
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrompido = true;
      motivoInterrupcao =
        `Transferência pausada por segurança após ${LIMITE_SEQUENCIA_RISCO} respostas seguidas ` +
        "fora do sucesso limpo (margem antes do limite de bloqueio da Omie). " +
        "Aguarde alguns minutos e continue de onde parou.";
    }
  };

  for (const item of itens) {
    if (interrompido) {
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "nao_transferido",
        motivo: MOTIVO_NAO_TRANSFERIDO,
      });
      continue;
    }

    const produto = ctx.produtos.get(item.sku);
    if (!produto) {
      resultados.push({ chave: item.chave, sku: item.sku, outcome: "falha", motivo: "Código não encontrado no Omie." });
      continue;
    }

    const saldo = ctx.saldos.get(item.sku);
    const cmc = saldo?.cmc ?? 0;
    let alocacaoLote: AlocacaoLote[] | undefined = item.lotes;

    // Só a perna de SAÍDA depende de saldo e de lote na origem. Na retomada a
    // saída já aconteceu: o saldo de hoje já está descontado e conferir de novo
    // reprovaria justamente o item que precisa ser concluído.
    if (!item.saidaFeita) {
      const disponivel = saldo?.saldo ?? 0;
      if (disponivel < item.quantidade) {
        resultados.push({
          chave: item.chave,
          sku: item.sku,
          outcome: "falha",
          motivo: `Saldo insuficiente na origem: disponível ${disponivel}, pedido ${item.quantidade}.`,
        });
        continue;
      }

      if (produto.controleLote) {
        const lotes = ctx.lotes?.get(item.sku) ?? [];
        const alocado = alocarLotesFEFO(item.quantidade, lotes, consumidoPorLote);
        if (alocado.faltou > 0) {
          resultados.push({
            chave: item.chave,
            sku: item.sku,
            outcome: "falha",
            motivo:
              "Produto com controle de lote sem lote DISPONÍVEL suficiente na origem " +
              `(faltou ${alocado.faltou}). Parte do saldo pode estar reservada em pedidos/OPs.`,
          });
          continue;
        }
        alocacaoLote = alocado.alocacao;
      }
    }

    const loteValidade = alocacaoLote?.map((a) => ({ nIdLote: Number(a.nIdLote), nQtdLote: a.quantidade }));
    const valor = cmc > 0 ? { valor: Number((cmc * item.quantidade).toFixed(2)) } : {};
    const base = {
      id_prod: Number(produto.idProd),
      data: ctx.data,
      quan: item.quantidade,
      motivo: "OPS",
      origem: "AJU",
      ...valor,
      ...(loteValidade && loteValidade.length > 0 ? { lote_validade: loteValidade } : {}),
    };

    // --- perna 1: saída na origem ---
    let refSaida: string | undefined;
    if (!item.saidaFeita) {
      try {
        const resp = await chamar(
          "estoque/ajuste/",
          "IncluirAjusteEstoque",
          {
            ...base,
            cod_int_ajuste: `${item.chave}-${SUFIXO_SAIDA}`.slice(0, 60),
            tipo: "SAI",
            obs: `Saída p/ ${item.obs}`.slice(0, 500),
            ...(origem ? { codigo_local_estoque: origem } : {}),
          },
          WRITE,
        );
        refSaida = texto(resp?.id_ajuste) ?? texto(resp?.id_movest);
        registrarSequencia(true);
      } catch (erro) {
        if (erro instanceof OmieBlocked) {
          interrompido = true;
          bloqueado = true;
          motivoInterrupcao = mensagem(erro);
          resultados.push({
            chave: item.chave,
            sku: item.sku,
            outcome: "nao_transferido",
            motivo: MOTIVO_NAO_TRANSFERIDO,
          });
          continue;
        }
        if (!(erro instanceof OmieDuplicate)) {
          resultados.push({ chave: item.chave, sku: item.sku, outcome: "falha", motivo: mensagem(erro) });
          registrarSequencia(false);
          continue;
        }
        // Duplicado = esta saída já foi lançada num envio anterior. Segue para a
        // entrada, que é justamente o que pode estar faltando.
        registrarSequencia(false);
      }

      if (alocacaoLote) {
        for (const a of alocacaoLote) {
          consumidoPorLote.set(a.nIdLote, (consumidoPorLote.get(a.nIdLote) ?? 0) + a.quantidade);
        }
      }
    }

    // --- perna 2: entrada no destino ---
    try {
      const resp = await chamar(
        "estoque/ajuste/",
        "IncluirAjusteEstoque",
        {
          ...base,
          cod_int_ajuste: `${item.chave}-${SUFIXO_ENTRADA}`.slice(0, 60),
          tipo: "ENT",
          obs: `Entrada p/ ${item.obs}`.slice(0, 500),
          ...(destino ? { codigo_local_estoque: destino } : {}),
        },
        WRITE,
      );
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "transferido",
        refSaida,
        refEntrada: texto(resp?.id_ajuste) ?? texto(resp?.id_movest),
        custoUnitario: cmc,
        ...(alocacaoLote ? { lotes: alocacaoLote } : {}),
      });
      registrarSequencia(true);
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        // As duas pernas já existiam: transferência de um envio anterior.
        resultados.push({
          chave: item.chave,
          sku: item.sku,
          outcome: "ja_transferido",
          refSaida,
          custoUnitario: cmc,
          ...(alocacaoLote ? { lotes: alocacaoLote } : {}),
        });
        registrarSequencia(false);
        continue;
      }

      const bloqueio = erro instanceof OmieBlocked;
      if (bloqueio) {
        interrompido = true;
        bloqueado = true;
        motivoInterrupcao = mensagem(erro);
      }
      // A saída passou e a entrada não: o material saiu da origem e não chegou
      // ao destino. Estado próprio, nunca "falha" — repetir do zero baixaria de
      // novo. A retomada manda só a entrada.
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: item.saidaFeita || refSaida !== undefined ? "entrada_pendente" : "falha",
        motivo: mensagem(erro),
        refSaida,
        custoUnitario: cmc,
        ...(alocacaoLote ? { lotes: alocacaoLote } : {}),
      });
      if (!bloqueio) registrarSequencia(false);
    }
  }

  return { itens: resultados, interrompido, bloqueado, motivoInterrupcao };
}
