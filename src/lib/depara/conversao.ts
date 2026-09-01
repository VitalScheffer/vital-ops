// Validação de unidade do De/Para e o fator que torna a movimentação possível.
//
// O par antigo → novo quase nunca é uma troca de etiqueta: a mesma chapa está
// cadastrada em M² no código velho e em KG no código novo. Até 31/08/2026 a
// tela resolvia isso desistindo — quando a unidade mudava, a quantidade vinha em
// branco e alguém digitava na mão, toda vez, para todo item. Digitar na mão é
// onde o erro entra, e o número certo é sempre o MESMO para aquele par: um
// fator.
//
// Este módulo responde três perguntas, e só isso:
//   1. As duas unidades são a mesma? (então não há o que converter)
//   2. Se não são, existe fator gravado? (sem ele, movimentar é chutar)
//   3. Quanto sai do cadastro antigo para atender o que a OP pede no novo?
//
// O fator é sempre escrito na direção "1 unidade do NOVO = X unidades do
// ANTIGO", porque é essa a conta que a fábrica precisa: a OP pede em KG (novo) e
// quem tem saldo é o M² (antigo). Guardar na direção inversa obrigaria a dividir
// em todo lugar, e divisão por número digitado por gente é onde mora o zero.
//
// Módulo PURO: sem Omie, sem banco.

/** Casas decimais das quantidades do domínio (mesmo teto do resto do estoque). */
export const CASAS_QUANTIDADE = 4;

function arred(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

// Variações TIPOGRÁFICAS da mesma unidade, e nada além disso. "M2" e "M²" são o
// mesmo metro quadrado escrito de dois jeitos pelo teclado de quem cadastrou;
// "UN" e "PC" NÃO entram aqui, ainda que na prática muita gente use como
// sinônimo — decidir isso sozinho trocaria a unidade de uma matéria-prima sem
// ninguém revisar, que é exatamente o que o De/Para existe para impedir.
const SINONIMOS: Record<string, string> = {
  M2: "M²",
  MQ: "M²",
  "M^2": "M²",
  M3: "M³",
  "M^3": "M³",
  MC: "M³",
  MT: "M",
  METRO: "M",
  KGS: "KG",
  UND: "UN",
  UNID: "UN",
};

/**
 * Unidade comparável: maiúscula, sem espaço, sem ponto final, com as variações
 * tipográficas resolvidas. Unidade vazia vira "" — que é "não sei", e é
 * diferente de "são iguais".
 */
export function normalizarUnidade(unidade: string | null | undefined): string {
  const bruto = String(unidade ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.\s]/g, "");
  if (!bruto) return "";
  return SINONIMOS[bruto] ?? bruto;
}

export interface EntradaConversao {
  unidadeLegado?: string | null;
  unidadeNovo?: string | null;
  /** Fator gravado no De/Para: 1 unidade do NOVO = `fator` unidades do ANTIGO. */
  fator?: number | null;
}

export type SituacaoConversao =
  /** As duas unidades são a mesma: move 1 para 1. */
  | "MESMA_UNIDADE"
  /** Unidades diferentes e fator gravado: dá para converter. */
  | "COM_FATOR"
  /** Unidades diferentes e SEM fator: não dá para movimentar sem alguém decidir. */
  | "FATOR_PENDENTE"
  /** Falta a unidade de um dos lados: não dá nem para comparar. */
  | "UNIDADE_DESCONHECIDA";

export interface AvaliacaoConversao {
  unidadeLegado: string;
  unidadeNovo: string;
  situacao: SituacaoConversao;
  /** As duas unidades batem. */
  mesmaUnidade: boolean;
  /** Precisa de um fator para movimentar (unidades diferentes e conhecidas). */
  exigeFator: boolean;
  /** O fator a usar na conta. 1 quando a unidade é a mesma; ausente sem fator. */
  fator?: number;
  /** Dá para movimentar este par sem digitar quantidade na mão. */
  podeMovimentar: boolean;
  /** Frase pronta para a tela, em pt-BR. */
  mensagem: string;
}

/** Fator inválido: zero, negativo, não numérico ou absurdo. */
function fatorValido(fator: number | null | undefined): number | undefined {
  if (fator === null || fator === undefined) return undefined;
  const n = Number(fator);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/**
 * O "check" da tela: as duas unidades são iguais, ou existe fator para
 * converter?
 *
 * Note que `MESMA_UNIDADE` ignora o fator de propósito. Quando as unidades
 * batem, um fator diferente de 1 gravado por engano (ou herdado de uma correção
 * anterior do par) multiplicaria material sem motivo nenhum. Unidade igual é
 * sempre 1 para 1.
 */
export function avaliarConversao(entrada: EntradaConversao): AvaliacaoConversao {
  const unidadeLegado = normalizarUnidade(entrada.unidadeLegado);
  const unidadeNovo = normalizarUnidade(entrada.unidadeNovo);

  if (!unidadeLegado || !unidadeNovo) {
    return {
      unidadeLegado,
      unidadeNovo,
      situacao: "UNIDADE_DESCONHECIDA",
      mesmaUnidade: false,
      exigeFator: false,
      podeMovimentar: false,
      mensagem:
        "Não deu para ler a unidade dos dois cadastros no Omie. Sem isso não dá para dizer se a conversão é 1 para 1.",
    };
  }

  if (unidadeLegado === unidadeNovo) {
    return {
      unidadeLegado,
      unidadeNovo,
      situacao: "MESMA_UNIDADE",
      mesmaUnidade: true,
      exigeFator: false,
      fator: 1,
      podeMovimentar: true,
      mensagem: `Mesma unidade nos dois (${unidadeNovo}): a quantidade passa igual, sem conversão.`,
    };
  }

  const fator = fatorValido(entrada.fator);
  if (fator === undefined) {
    return {
      unidadeLegado,
      unidadeNovo,
      situacao: "FATOR_PENDENTE",
      mesmaUnidade: false,
      exigeFator: true,
      podeMovimentar: false,
      mensagem:
        `A unidade muda de ${unidadeNovo} (novo) para ${unidadeLegado} (antigo). ` +
        `Informe quantos ${unidadeLegado} equivalem a 1 ${unidadeNovo} para poder movimentar.`,
    };
  }

  return {
    unidadeLegado,
    unidadeNovo,
    situacao: "COM_FATOR",
    mesmaUnidade: false,
    exigeFator: true,
    fator,
    podeMovimentar: true,
    mensagem: `1 ${unidadeNovo} (novo) = ${formatarFator(fator)} ${unidadeLegado} (antigo).`,
  };
}

/** O fator como a tela mostra: até 6 casas, sem zeros à toa. */
export function formatarFator(fator: number): string {
  return Number(fator.toFixed(6)).toLocaleString("pt-BR", { maximumFractionDigits: 6 });
}

/**
 * Quanto sai do cadastro ANTIGO para atender uma quantidade pedida no NOVO.
 *
 * Devolve `null` quando não dá para converter — e devolver null é o ponto: a
 * tela precisa poder distinguir "converti e deu 0,4" de "não sei converter".
 * Um fallback silencioso para a mesma quantidade seria a forma mais rápida de
 * mover 21 kg de um cadastro que está em metro quadrado.
 */
export function quantidadeNoLegado(
  quantidadeNoNovo: number,
  avaliacao: AvaliacaoConversao,
): number | null {
  if (!avaliacao.podeMovimentar || avaliacao.fator === undefined) return null;
  if (!Number.isFinite(quantidadeNoNovo) || quantidadeNoNovo < 0) return null;
  return arred(quantidadeNoNovo * avaliacao.fator);
}

/** O caminho de volta: quanto do NOVO um saldo do ANTIGO representa. */
export function quantidadeNoNovo(
  quantidadeNoLegado: number,
  avaliacao: AvaliacaoConversao,
): number | null {
  if (!avaliacao.podeMovimentar || avaliacao.fator === undefined) return null;
  if (!Number.isFinite(quantidadeNoLegado) || quantidadeNoLegado < 0) return null;
  return arred(quantidadeNoLegado / avaliacao.fator);
}
