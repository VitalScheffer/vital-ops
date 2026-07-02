import { DESCRICAO_MAX } from "./bomParser";
import type { EstruturaRel, Familia, ParsedItem } from "./types";

// Estado da TELA DE REVISÃO EDITÁVEL (só cliente). A partir do resultado do
// parser, o usuário revisa/corrige antes de gerar a planilha ou enviar ao Omie:
// inclui/exclui itens, edita descrição e família dos produtos, e a quantidade
// das relações de estrutura. Este módulo é PURO (sem React/DOM) para ser testável
// e não altera a lógica de envio — apenas prepara os dados EDITADOS e INCLUÍDOS.

// Ordem exibida no select de família (o parser usa exatamente estes rótulos).
export const FAMILIAS: readonly Familia[] = [
  "COM - COMPONENTES",
  "SBM - SUBMONTAGEM",
  "PCF - PEÇAS FABRICADAS",
  "PCA - PEÇAS ACABADAS",
];

export interface ProdutoReviewItem {
  id: string;
  linha: number;
  raw: string;
  // Código é a identidade/SKU do produto: read-only na tela (corrige-se na BOM).
  codigo: string;
  // Editáveis na revisão:
  descricaoProduto: string;
  familia: Familia | null;
  included: boolean;
  // Status original vindo do parser (novo/duplicado/erro), só para exibição.
  status: ParsedItem["status"];
  motivoErro?: string;
}

export interface EstruturaReviewItem {
  id: string;
  numeroPai: string;
  numeroFilho: string;
  // Códigos pai/filho são read-only (identidade). Editável: quantidade e incluir.
  codigoPai: string;
  codigoFilho: string;
  descricaoFilho: string;
  quantidade: number | null;
  included: boolean;
}

export interface ResumoProdutos {
  selecionados: number; // incluídos e válidos → vão para gerar/enviar
  comErro: number; // incluídos mas inválidos (precisam de correção)
  ignorados: number; // não incluídos (desmarcados)
}

// Duplicados e itens com erro já entram DESMARCADOS (não vão por padrão); só os
// "novo" entram marcados.
function inclusaoPadrao(status: ParsedItem["status"]): boolean {
  return status === "novo";
}

export function buildProdutoReview(itens: ParsedItem[]): ProdutoReviewItem[] {
  return itens.map((item, index) => ({
    id: `${item.linha}-${index}`,
    linha: item.linha,
    raw: item.raw,
    codigo: item.codigo,
    descricaoProduto: item.descricaoProduto,
    familia: item.familia,
    included: inclusaoPadrao(item.status),
    status: item.status,
    motivoErro: item.motivoErro,
  }));
}

export function buildEstruturaReview(rels: EstruturaRel[]): EstruturaReviewItem[] {
  return rels.map((rel, index) => ({
    id: `${rel.numeroFilho}-${index}`,
    numeroPai: rel.numeroPai,
    numeroFilho: rel.numeroFilho,
    codigoPai: rel.codigoPai,
    codigoFilho: rel.codigoFilho,
    descricaoFilho: rel.descricaoFilho,
    quantidade: rel.quantidade,
    included: true,
  }));
}

/**
 * Motivo pelo qual um produto NÃO pode ir (ou `null` se está válido). Fonte única
 * da validação e da mensagem inline exibida na tela.
 */
export function motivoProduto(item: ProdutoReviewItem): string | null {
  if (!item.codigo.trim()) {
    return item.motivoErro ?? "Código inválido — corrija a linha na BOM e reenvie o arquivo.";
  }
  const descricao = item.descricaoProduto.trim();
  if (!descricao) return "Informe a descrição do produto.";
  if (descricao.length > DESCRICAO_MAX) {
    return `Descrição muito longa: ${descricao.length} caracteres (máximo ${DESCRICAO_MAX}).`;
  }
  return null;
}

export function produtoValido(item: ProdutoReviewItem): boolean {
  return motivoProduto(item) === null;
}

/** Motivo pelo qual uma relação de estrutura é inválida (ou `null` se válida). */
export function motivoEstrutura(item: EstruturaReviewItem): string | null {
  if (item.quantidade === null) return null;
  if (!Number.isFinite(item.quantidade) || item.quantidade < 0) {
    return "Quantidade inválida: use um número igual ou maior que zero.";
  }
  return null;
}

export function estruturaValida(item: EstruturaReviewItem): boolean {
  return motivoEstrutura(item) === null;
}

export function resumoProdutos(itens: ProdutoReviewItem[]): ResumoProdutos {
  let selecionados = 0;
  let comErro = 0;
  let ignorados = 0;
  for (const item of itens) {
    if (!item.included) {
      ignorados += 1;
      continue;
    }
    if (produtoValido(item)) selecionados += 1;
    else comErro += 1;
  }
  return { selecionados, comErro, ignorados };
}

/**
 * Converte os produtos INCLUÍDOS e VÁLIDOS de volta ao formato do parser
 * (`ParsedItem` com status "novo") — é isso que o gerar/enviar consomem.
 * O usuário decidiu incluir, então tudo que sai daqui vai como "novo" (o
 * `UpsertProduto` é idempotente: reenviar apenas atualiza).
 */
export function produtosParaEnvio(itens: ProdutoReviewItem[]): ParsedItem[] {
  return itens
    .filter((item) => item.included && produtoValido(item))
    .map((item) => ({
      linha: item.linha,
      raw: item.raw,
      codigo: item.codigo,
      descricaoProduto: item.descricaoProduto.trim(),
      familia: item.familia,
      status: "novo" as const,
    }));
}

/** Converte as relações INCLUÍDAS e VÁLIDAS de volta ao formato `EstruturaRel`. */
export function estruturaParaEnvio(itens: EstruturaReviewItem[]): EstruturaRel[] {
  return itens
    .filter((item) => item.included && estruturaValida(item))
    .map((item) => ({
      numeroPai: item.numeroPai,
      numeroFilho: item.numeroFilho,
      codigoPai: item.codigoPai,
      codigoFilho: item.codigoFilho,
      descricaoFilho: item.descricaoFilho,
      quantidade: item.quantidade,
    }));
}
