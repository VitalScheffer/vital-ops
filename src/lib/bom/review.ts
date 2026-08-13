import {
  casarMateriaPrima,
  ehPorPeso,
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
// MAT que ela consome do outro, e a quantidade consumida por peça.
// `codigoMat` vazio = não resolvido (o motivo diz por quê e a linha entra
// desmarcada).
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
  // Unidade em que `quantidade` está expressa, que é a do cadastro no Omie
  // ("KG", "M", "M²", "UN"). É preenchida em DOIS momentos: ao escolher o item
  // MAT e, mesmo sem item escolhido, quando o peso da BOM já entrou no campo
  // (aí vale "KG"). Guardar isso é o que permite detectar depois que a
  // quantidade que está na tela ficou na unidade errada.
  unidadeMat: string;
  // Consumo de UMA peça, na unidade acima. Só o KG sai do peso da BOM; metro,
  // metro quadrado e unidade são digitados na tela.
  quantidade: number | null;
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

// Peça que a BOM entrega sem NADA para trabalhar: nem a geometria nem a massa.
// É o caso do perfil de borracha ("MCPSO PC006 BPCSR"), que não é comprado por
// quilo e sim por metro, então o CAD não tem o que exportar nessas colunas.
// Constatar "falta a especificação" seria um beco sem saída (ela nunca virá):
// a saída é escolher o item e digitar o consumo na unidade do cadastro.
const MOTIVO_SEM_ESPEC_NEM_PESO =
  "A BOM não traz especificação nem peso desta peça (é o caso dos perfis vendidos por metro). " +
  "Escolha a matéria-prima e informe a quantidade na unidade do cadastro.";

function motivoForaDoPeso(unidade: string): string {
  return `Cadastro em ${unidade}: o peso da BOM não diz o consumo. Informe a quantidade em ${unidade}.`;
}

function motivoSemResolver(especificacao: string, ligaRotulo: string | null): string {
  const onde = ligaRotulo
    ? ` em ${ligaRotulo.toLowerCase()}`
    : " (e o código da peça não diz o material, então não dá pra escolher entre as ligas)";
  return `Nenhum item MAT cadastrado no Omie bate com "${especificacao}"${onde}. Escolha na mão ou cadastre a matéria-prima.`;
}

/**
 * A BOM traz as colunas de matéria-prima? Modelos antigos do CAD não têm peso
 * nem especificação, e aí a seção de MP inteira não faz sentido: ela renderizaria
 * uma linha por peça, todas vazias, com um aviso alarmante e sem catálogo
 * carregado. Mesma condição usada para decidir se vale ler o catálogo no Omie.
 */
export function bomTemMateriaPrima(rows: readonly BomRow[]): boolean {
  return rows.some((row) => row.peso !== null || row.especificacao.trim() !== "");
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
  if (!bomTemMateriaPrima(rows)) return [];

  const itens: MateriaPrimaReviewItem[] = [];
  // A mesma peça pode aparecer em mais de uma submontagem. O consumo de MP é da
  // PEÇA, não da posição na árvore: repetir a relação só rende um duplicado no
  // Omie por reenvio, e duplicado conta pro freio de segurança do lote.
  const jaVistas = new Set<string>();

  for (const row of rows) {
    const info = extrairCodigoDaPeca(row.peca);
    if (!info || !ehPeca(info.codigo)) continue;

    const repetida = jaVistas.has(info.codigo);
    jaVistas.add(info.codigo);

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
      unidadeMat: "",
      quantidade: null as number | null,
      confianca: null as Confianca | null,
      included: false,
    };

    if (repetida) {
      itens.push({
        ...base,
        motivo: `${info.codigo} já aparece antes na BOM. A matéria-prima é cadastrada uma vez por peça, então esta linha fica de fora.`,
      });
      continue;
    }

    if (!base.especificacao) {
      itens.push({
        ...base,
        motivo:
          row.peso === null
            ? MOTIVO_SEM_ESPEC_NEM_PESO
            : "A linha não traz a especificação do material na BOM.",
      });
      continue;
    }
    if (row.peso === null) {
      itens.push({ ...base, motivo: "A linha não traz o peso da peça na BOM." });
      continue;
    }

    // A partir daqui a linha TEM peso, então o campo já pode nascer preenchido em
    // KG — e a unidade acompanha, para a tela e a troca de item saberem em que
    // unidade esse número está.
    const emKg = { quantidade: pesoParaKg(row.peso, unidadePeso), unidadeMat: "KG" };
    const espec = lerEspecificacao(base.especificacao);
    if (!espec) {
      itens.push({
        ...base,
        ...emKg,
        motivo: `Não consegui interpretar "${base.especificacao}". Escolha a matéria-prima na mão.`,
      });
      continue;
    }

    const pista = pistaDoCodigoPeca(info.codigo);
    const casamento = casarMateriaPrima(espec, pista, catalogo);
    if (!casamento) {
      itens.push({
        ...base,
        ...emKg,
        motivo: motivoSemResolver(base.especificacao, pista.liga ? ROTULO_LIGA[pista.liga] : null),
      });
      continue;
    }

    const escolhido = {
      ...base,
      codigoMat: casamento.item.codigo,
      descricaoMat: casamento.item.descricao,
      unidadeMat: casamento.item.unidade,
      confianca: casamento.confianca,
    };

    // Item que não é medido por peso: a sugestão continua valendo (poupa achar o
    // item na lista), mas o peso da BOM NÃO vira a quantidade dele. Converter ali
    // mandaria as gramas da peça como se fossem metros pro Omie.
    if (!ehPorPeso(casamento.item.unidade)) {
      itens.push({ ...escolhido, motivo: motivoForaDoPeso(casamento.item.unidade) });
      continue;
    }

    const exata = casamento.confianca === "exata";
    itens.push({
      ...escolhido,
      quantidade: emKg.quantidade,
      included: exata,
      motivo: exata
        ? undefined
        : `Bitola parecida, não idêntica (diferença de ${casamento.diferencaMaxMm.toFixed(2)} mm). Confira antes de marcar.`,
    });
  }

  return itens;
}

/**
 * Aplica um catálogo recém-lido sobre uma revisão JÁ EM ANDAMENTO, sem desfazer
 * o trabalho de quem está na tela. É o que sustenta o botão de recarregar:
 * cadastrou a matéria-prima que faltava no Omie, recarrega e continua de onde
 * parou (e também o primeiro carregamento, que chega depois da BOM ser lida).
 *
 * Só recebem sugestão nova as linhas AINDA NÃO RESOLVIDAS — as que estão sem
 * item MAT e com um motivo explicando por quê. Ficam como estão:
 *   - linha com item escolhido (pela sugestão automática ou na mão);
 *   - linha que a pessoa esvaziou de propósito (sem item e sem motivo), porque
 *     isso é uma decisão dela, não uma pendência.
 *
 * Trocar a BOM ou a unidade do peso continua sendo reconstrução do zero: ali as
 * linhas são outras, não há o que preservar.
 */
export function aplicarCatalogoNaRevisao(
  atual: readonly MateriaPrimaReviewItem[],
  base: readonly MateriaPrimaReviewItem[],
): MateriaPrimaReviewItem[] {
  const novaPorId = new Map(base.map((item) => [item.id, item]));
  return atual.map((item) => {
    const pendente = item.codigoMat.trim() === "" && item.motivo !== undefined;
    if (!pendente) return item;
    return novaPorId.get(item.id) ?? item;
  });
}

/**
 * Aplica a matéria-prima ESCOLHIDA NA MÃO sobre uma linha da revisão. A escolha
 * substitui a sugestão automática, então some o motivo e a marcação de confiança
 * (eles descreviam a sugestão, não a decisão de quem está na tela).
 *
 * A quantidade é o ponto delicado. Ela pode já estar preenchida em KG, vinda do
 * peso da BOM, e KG não vira metro: trocar para um item de OUTRA unidade limpa o
 * campo, para a pessoa informar o consumo na unidade nova. Trocar entre itens da
 * mesma unidade preserva. E ESVAZIAR o seletor (`mat` nulo) não mexe na
 * quantidade nem na unidade: quem esvaziou por engano consegue voltar, já que o
 * KG do peso não é recalculável sem reler a BOM.
 */
export function aplicarEscolhaDeMateriaPrima(
  item: MateriaPrimaReviewItem,
  mat: ItemMat | null,
): MateriaPrimaReviewItem {
  const escolhido = {
    ...item,
    confianca: null,
    motivo: undefined,
    included: mat !== null,
  };
  if (!mat) return { ...escolhido, codigoMat: "", descricaoMat: "" };

  const trocouUnidade = item.unidadeMat !== "" && item.unidadeMat !== mat.unidade;
  return {
    ...escolhido,
    codigoMat: mat.codigo,
    descricaoMat: mat.descricao,
    unidadeMat: mat.unidade,
    quantidade: trocouUnidade ? null : item.quantidade,
  };
}

/** Motivo pelo qual uma linha de matéria-prima não pode ir (ou `null` se válida). */
export function motivoMateriaPrima(item: MateriaPrimaReviewItem): string | null {
  if (!item.codigoMat.trim()) return item.motivo ?? "Escolha a matéria-prima desta peça.";
  if (item.quantidade === null) {
    const unidade = item.unidadeMat.trim();
    return unidade ? `Informe a quantidade consumida em ${unidade}.` : "Informe a quantidade consumida.";
  }
  if (!Number.isFinite(item.quantidade) || item.quantidade <= 0) {
    return "Quantidade inválida: use um número maior que zero.";
  }
  return null;
}

export function materiaPrimaValida(item: MateriaPrimaReviewItem): boolean {
  return motivoMateriaPrima(item) === null;
}

/**
 * Converte as linhas INCLUÍDAS e VÁLIDAS em relações de estrutura PEÇA → MAT.
 * A quantidade vai CRUA: no Omie ela sempre vale na unidade do item filho, então
 * o mesmo campo carrega KG do aço, metro do perfil de borracha e m² do courvin.
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
      quantidade: item.quantidade,
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
