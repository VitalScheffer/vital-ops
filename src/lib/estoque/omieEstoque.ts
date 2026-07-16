// Estoque no Omie: leitura de produtos/saldos e BAIXA (saída) via ajuste.
//
// Calls usados (confirmados na doc oficial em 16/07/2026):
//   • `ListarProdutos` (geral/produtos/) com `produtosPorCodigo` em lote — READ,
//     mesmo call já provado em produção no envio de produtos.
//   • `ListarPosEstoque` (estoque/consulta/) — READ, saldo + CMC de vários SKUs
//     numa chamada só (portado do nextstep/apps/omie/services/estoque.py).
//   • `IncluirAjusteEstoque` (estoque/ajuste/) — WRITE, tipo "SAI" (saída),
//     origem "AJU", motivo "OPS"; `codigo_local_estoque` omitido = local PADRÃO
//     (decisão do Victor, 16/07/2026). `cod_int_ajuste` recebe um id NOSSO
//     determinístico por item → reenviar vira duplicado idempotente, não baixa
//     duas vezes.
//
// Módulo PURO (não toca banco/sessão): recebe `chamar` por parâmetro, igual ao
// envioOmie. Ban-safety (REQUISITOS §6): tudo sequencial, leitura em lote antes
// de escrever (valida código e saldo LOCALMENTE — quantidade sem saldo nem vira
// chamada), freio próprio de sequência de risco e `OmieBlocked` para o lote.

import type { ChamarOptions, OmiePayload } from "@/lib/omie/client";
import { OmieBlocked, OmieDuplicate } from "@/lib/omie/errors";

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
      mapa.set(codigo, { idProd, descricao: texto(registro.descricao) ?? "" });
    }
  }
  return mapa;
}

// -----------------------------------------------------------------------------
// Leitura: saldo por SKU (posição de estoque no local padrão)
// -----------------------------------------------------------------------------

export interface SaldoEstoque {
  saldo: number;
  cmc: number; // custo médio contábil (vira o `valor` obrigatório do ajuste)
}

// `{SKU → saldo/CMC}` numa única chamada. `codigo_local_estoque: 0` = local
// padrão — o MESMO local onde a baixa vai acontecer.
export async function saldosPorCodigo(
  codigos: readonly string[],
  dataPosicao: string, // DD/MM/AAAA (o caller passa a data — módulo puro)
  chamar: ChamarFn,
): Promise<Map<string, SaldoEstoque>> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const mapa = new Map<string, SaldoEstoque>();
  if (unicos.length === 0) return mapa;
  const resp = await chamar("estoque/consulta/", "ListarPosEstoque", {
    nPagina: 1,
    nRegPorPagina: Math.max(unicos.length, 50),
    dDataPosicao: dataPosicao,
    cExibeTodos: "N",
    codigo_local_estoque: 0,
    lista_produtos: unicos.map((cCodigo) => ({ cCodigo })),
  });
  const produtos = resp?.produtos;
  if (!Array.isArray(produtos)) return mapa;
  for (const p of produtos as OmiePayload[]) {
    const codigo = texto(p.cCodigo);
    if (!codigo) continue;
    mapa.set(codigo, { saldo: numero(p.nSaldo) ?? 0, cmc: numero(p.nCMC) ?? 0 });
  }
  return mapa;
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
  saldos: Map<string, SaldoEstoque>; // de saldosPorCodigo
}

// Faixa Unicode dos diacríticos combinantes (mesma técnica do bomFile.ts:
// comparação numérica pra não depender de como o editor grava esses bytes).
const DIACRITICO_MIN = 768;
const DIACRITICO_MAX = 879;

function semAcento(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < DIACRITICO_MIN || code > DIACRITICO_MAX;
    })
    .join("")
    .toLowerCase();
}

// Mensagem amigável pros erros comuns do ajuste. Produto com CONTROLE DE LOTE
// exige `lote_validade` no ajuste — não temos o lote aqui, então orientamos a
// baixa manual no Omie (limitação conhecida e documentada).
function motivoAmigavel(bruto: string): string {
  if (semAcento(bruto).includes("lote")) {
    return (
      "Produto com controle de lote: o Omie exige informar o lote na baixa. " +
      "Dê baixa manual no Omie (Estoque → Ajuste) informando o lote."
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
        motivo: `Saldo insuficiente no local padrão: disponível ${disponivel}, pedido ${item.quantidade}.`,
      });
      continue;
    }

    const cmc = saldo?.cmc ?? 0;
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
          valor: Number((cmc * item.quantidade).toFixed(2)),
          obs: item.obs.slice(0, 500),
        },
        WRITE,
      );
      resultados.push({
        chave: item.chave,
        sku: item.sku,
        outcome: "baixado",
        omieRef: texto(resp?.id_ajuste) ?? texto(resp?.id_movest),
      });
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
