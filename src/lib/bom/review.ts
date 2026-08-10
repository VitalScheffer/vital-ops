import {
  casarMateriaPrima,
  lerEspecificacao,
  pesoParaKg,
  pistaDoCodigoPeca,
  ROTULO_LIGA,
  type Confianca,
  type ItemMat,
} from "@/lib/produtos/materiaPrima";

import { DESCRICAO_MAX, ehPeca, extrairCodigoDaPeca } from "./bomParser";
import type { BomRow, EstruturaRel, Familia, ParsedItem, UnidadePeso } from "./types";

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
  // "raiz" = relação com a MONTAGEM já cadastrada (a tela destaca essas).
  origem: EstruturaRel["origem"];
}

// Uma linha da revisão de MATÉRIA-PRIMA: a peça (PC) da BOM de um lado, o item
// MAT que ela consome do outro, e a quantidade em KG. `codigoMat` vazio = não
// resolvido (o motivo diz por quê e a linha entra desmarcada).
export interface MateriaPrimaReviewItem {
  id: string;
  linha: number;
  numeroPeca: string;
  codigoPeca: string;
  descricaoPeca: string;
  especificacao: string;
  // Valor cru da coluna "Peso", na unidade que o usuário escolheu na tela.
  pesoBruto: number | null;
  codigoMat: string;
  descricaoMat: string;
  quantidadeKg: number | null;
  confianca: Confianca | null;
  motivo?: string;
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
    origem: rel.origem,
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
      origem: item.origem,
    }));
}

// --- Matéria-prima ----------------------------------------------------------

// Sufixo do `numeroFilho` das relações de matéria-prima. O status do envio é
// casado por esse número no banco, então ele precisa ser único e não pode colidir
// com a numeração do CAD (que é só dígitos e pontos).
const SUFIXO_MP = ".MP";

function motivoSemResolver(especificacao: string, ligaRotulo: string | null): string {
  const onde = ligaRotulo ? ` em ${ligaRotulo.toLowerCase()}` : "";
  return `Nenhum item MAT cadastrado no Omie bate com "${especificacao}"${onde}. Escolha na mão ou cadastre a matéria-prima.`;
}

/**
 * Monta a revisão de matéria-prima a partir das linhas da BOM. Só as PEÇAS (PC)
 * consomem MP; submontagens e comprados ficam de fora. O peso da BOM é unitário
 * (nas linhas de submontagem o CAD grava a soma dos filhos, que não usamos).
 *
 * Entra MARCADO só o que casou EXATO: bitola apenas parecida, especificação
 * ilegível ou item não encontrado entram desmarcados com o motivo, para ninguém
 * mandar matéria-prima adivinhada pro Omie.
 */
export function buildMateriaPrimaReview(
  rows: BomRow[],
  catalogo: readonly ItemMat[],
  unidadePeso: UnidadePeso,
): MateriaPrimaReviewItem[] {
  const itens: MateriaPrimaReviewItem[] = [];

  for (const row of rows) {
    const info = extrairCodigoDaPeca(row.peca);
    if (!info || !ehPeca(info.codigo)) continue;

    const base = {
      id: `mp-${row.linha}`,
      linha: row.linha,
      numeroPeca: row.numero.trim(),
      codigoPeca: info.codigo,
      descricaoPeca: info.descricao,
      especificacao: row.especificacao.trim(),
      pesoBruto: row.peso,
      codigoMat: "",
      descricaoMat: "",
      quantidadeKg: null as number | null,
      confianca: null as Confianca | null,
      included: false,
    };

    if (!base.especificacao) {
      itens.push({ ...base, motivo: "A linha não traz a especificação do material na BOM." });
      continue;
    }
    if (row.peso === null) {
      itens.push({ ...base, motivo: "A linha não traz o peso da peça na BOM." });
      continue;
    }

    const quantidadeKg = pesoParaKg(row.peso, unidadePeso);
    const espec = lerEspecificacao(base.especificacao);
    if (!espec) {
      itens.push({
        ...base,
        quantidadeKg,
        motivo: `Não consegui interpretar "${base.especificacao}". Escolha a matéria-prima na mão.`,
      });
      continue;
    }

    const pista = pistaDoCodigoPeca(info.codigo);
    const casamento = casarMateriaPrima(espec, pista, catalogo);
    if (!casamento) {
      itens.push({
        ...base,
        quantidadeKg,
        motivo: motivoSemResolver(base.especificacao, pista.liga ? ROTULO_LIGA[pista.liga] : null),
      });
      continue;
    }

    const exata = casamento.confianca === "exata";
    itens.push({
      ...base,
      codigoMat: casamento.item.codigo,
      descricaoMat: casamento.item.descricao,
      quantidadeKg,
      confianca: casamento.confianca,
      included: exata,
      motivo: exata
        ? undefined
        : `Bitola parecida, não idêntica (diferença de ${casamento.diferencaMaxMm.toFixed(2)} mm). Confira antes de marcar.`,
    });
  }

  return itens;
}

/** Motivo pelo qual uma linha de matéria-prima não pode ir (ou `null` se válida). */
export function motivoMateriaPrima(item: MateriaPrimaReviewItem): string | null {
  if (!item.codigoMat.trim()) return item.motivo ?? "Escolha a matéria-prima desta peça.";
  if (item.quantidadeKg === null) return "Informe a quantidade consumida em KG.";
  if (!Number.isFinite(item.quantidadeKg) || item.quantidadeKg <= 0) {
    return "Quantidade inválida: use um número maior que zero.";
  }
  return null;
}

export function materiaPrimaValida(item: MateriaPrimaReviewItem): boolean {
  return motivoMateriaPrima(item) === null;
}

/**
 * Converte as linhas INCLUÍDAS e VÁLIDAS em relações de estrutura PEÇA → MAT.
 * A quantidade vai em KG, que é a unidade de todo cadastro MAT no Omie.
 */
export function materiaPrimaParaEnvio(itens: MateriaPrimaReviewItem[]): EstruturaRel[] {
  return itens
    .filter((item) => item.included && materiaPrimaValida(item))
    .map((item) => ({
      numeroPai: item.numeroPeca,
      numeroFilho: `${item.numeroPeca || item.linha}${SUFIXO_MP}`,
      codigoPai: item.codigoPeca,
      codigoFilho: item.codigoMat,
      descricaoFilho: item.descricaoMat,
      quantidade: item.quantidadeKg,
      origem: "mp" as const,
    }));
}

export interface ResumoMateriaPrima {
  selecionadas: number;
  pendentes: number; // precisam de conferência ou escolha manual
}

export function resumoMateriaPrima(itens: MateriaPrimaReviewItem[]): ResumoMateriaPrima {
  let selecionadas = 0;
  let pendentes = 0;
  for (const item of itens) {
    if (item.included && materiaPrimaValida(item)) selecionadas += 1;
    else pendentes += 1;
  }
  return { selecionadas, pendentes };
}
