// De/Para do código legado (PRD…) para o cadastro novo de matéria-prima (MAT…).
//
// O Omie está no meio de uma troca de padrão de código: o estoque FÍSICO ainda
// está lançado nos códigos antigos ("PRD00620 - CHAPA 0,90 X 1200 X 2000 MM ACO
// INOX 200", em M²) e as ordens de produção novas já pedem os códigos novos
// ("MATCH 00060 IN430 - CHAPA ESP 0,60 AÇO INOX 430", em KG). Sem uma tabela
// ligando os dois, a tela de movimentação por OP encontra saldo zero em quase
// todo item, porque o saldo está do outro lado da migração.
//
// Este módulo SUGERE o equivalente; quem decide é a pessoa na tela. A sugestão
// nunca é aplicada sozinha, e por um motivo concreto: a descrição legada diz a
// liga de um jeito que não é comparável ("ACO INOX 200" é série 200, o cadastro
// novo é 430) e a unidade muda de M² para KG. Casar isso às cegas trocaria a
// matéria-prima de uma OP inteira.
//
// Módulo PURO: recebe o catálogo MAT já indexado (de `catalogoMat.ts`) e não
// toca em Omie nem em banco.

import {
  casarMateriaPrima,
  lerEspecificacao,
  ligaDoTexto,
  parteDescritiva,
  ROTULO_FORMA,
  ROTULO_LIGA,
  type ItemMat,
} from "@/lib/produtos/materiaPrima";

/** Um cadastro no padrão antigo, como vem do Omie. */
export interface ItemLegado {
  codigo: string;
  descricao: string;
  unidade?: string;
  /** Saldo no local consultado. Só ordena a fila de revisão; não afeta o casamento. */
  saldo?: number;
}

export type ConfiancaDePara = "EXATA" | "APROXIMADA" | "SEM_SUGESTAO";

export interface SugestaoDePara {
  codigoNovo?: string;
  descricaoNovo?: string;
  unidadeNovo?: string;
  confianca: ConfiancaDePara;
  /** Por que casou (ou por que não casou), em pt-BR, para aparecer na linha. */
  motivo: string;
  /** A unidade muda do cadastro antigo para o novo (ex.: M² → KG). */
  unidadeMuda: boolean;
  /** Avisos que a pessoa precisa ler ANTES de confirmar. */
  alertas: string[];
}

function unidadeNormal(unidade: string | undefined): string {
  return (unidade ?? "").trim().toUpperCase();
}

// Série do inox escrita na descrição ("ACO INOX 200", "AISI 304", "INOX 430").
// O catálogo novo é todo 430; qualquer outra série na descrição antiga é outra
// matéria-prima, ainda que a geometria bata. O `ligaDoTexto` do módulo de
// matéria-prima trata todo INOX como 430 (regra boa para o catálogo NOVO, onde
// só existe 430), então é aqui que a diferença precisa aparecer.
const SERIE_INOX = /\bINOX\s*(\d{3})\b|\bAISI\s*(\d{3})\b/;
const SERIE_DO_CATALOGO = "430";

function serieInox(texto: string): string | null {
  const achado = SERIE_INOX.exec(texto.toUpperCase());
  if (!achado) return null;
  return achado[1] ?? achado[2] ?? null;
}

/**
 * Sugere o item MAT equivalente a um cadastro legado.
 *
 * O casamento é o MESMO motor que a tela de Produtos usa para descobrir a
 * matéria-prima de uma peça (`casarMateriaPrima`): geometria lida da descrição
 * contra a geometria dos cadastros MAT, filtrada por forma e liga. A diferença
 * é a origem da pista: na BOM ela vem do código da peça; aqui o código antigo
 * não diz nada ("PRD00620"), então forma e liga saem da própria descrição.
 */
export function sugerirEquivalente(
  legado: ItemLegado,
  catalogo: readonly ItemMat[],
): SugestaoDePara {
  const texto = parteDescritiva(legado.codigo, legado.descricao);
  const alertas: string[] = [];

  const espec = lerEspecificacao(texto);
  if (!espec) {
    return {
      confianca: "SEM_SUGESTAO",
      motivo: "Não deu para ler forma e medida na descrição (chapa, tubo ou trefilado).",
      unidadeMuda: false,
      alertas,
    };
  }

  const liga = ligaDoTexto(texto);
  const serie = serieInox(texto);
  if (liga === "INOX430" && serie && serie !== SERIE_DO_CATALOGO) {
    alertas.push(
      `A descrição antiga diz inox ${serie} e todo o catálogo novo é 430. ` +
        "Confirme com a engenharia antes de aceitar.",
    );
  }

  const casamento = casarMateriaPrima(espec, { liga, formas: [espec.forma] }, catalogo);
  if (!casamento) {
    const comLiga = liga ? ` em ${ROTULO_LIGA[liga].toLowerCase()}` : "";
    return {
      confianca: "SEM_SUGESTAO",
      motivo: `Nenhum cadastro MAT com a mesma bitola de ${ROTULO_FORMA[espec.forma].toLowerCase()}${comLiga}.`,
      unidadeMuda: false,
      alertas,
    };
  }

  const unidadeAntiga = unidadeNormal(legado.unidade);
  const unidadeNova = unidadeNormal(casamento.item.unidade);
  const unidadeMuda = unidadeAntiga !== "" && unidadeNova !== "" && unidadeAntiga !== unidadeNova;
  if (unidadeMuda) {
    alertas.push(
      `A unidade muda de ${unidadeAntiga} para ${unidadeNova}: o saldo NÃO se converte sozinho ` +
        "(de m² para kg dependeria da espessura e da densidade).",
    );
  }

  const exata = casamento.confianca === "exata" && alertas.length === 0;
  const motivo = exata
    ? "Mesma forma, mesma bitola e mesma liga do cadastro novo."
    : casamento.confianca === "aproximada"
      ? `Bitola parecida, diferença de ${casamento.diferencaMaxMm.toFixed(2)} mm. Confira antes de aceitar.`
      : "Bitola bate, mas há avisos para conferir antes de aceitar.";

  return {
    codigoNovo: casamento.item.codigo,
    descricaoNovo: casamento.item.descricao,
    unidadeNovo: casamento.item.unidade,
    confianca: exata ? "EXATA" : "APROXIMADA",
    motivo,
    unidadeMuda,
    alertas,
  };
}

/** Uma linha da fila de revisão: o legado, a sugestão e o que já foi decidido. */
export interface LinhaDePara extends ItemLegado {
  sugestao: SugestaoDePara;
  /** Decisão já gravada no banco (quando existe). */
  decidido?: {
    codigoNovo: string | null;
    confianca: string;
    confirmadoPor?: string;
    confirmadoEm?: string;
  };
}

/**
 * Monta a fila de revisão. Ordena por saldo decrescente porque a fila é longa e
 * o que trava a produção é o item que tem material parado no código velho: quem
 * senta para revisar precisa começar por ele, não pelo alfabeto.
 */
export function montarFila(
  legados: readonly ItemLegado[],
  catalogo: readonly ItemMat[],
): LinhaDePara[] {
  return legados
    .map((legado) => ({ ...legado, sugestao: sugerirEquivalente(legado, catalogo) }))
    .sort((a, b) => (b.saldo ?? 0) - (a.saldo ?? 0) || a.codigo.localeCompare(b.codigo, "pt-BR"));
}
