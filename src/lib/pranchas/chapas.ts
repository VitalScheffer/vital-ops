// Matéria-prima da BOM vista pela ótica da COMPRA, não do cadastro.
//
// O módulo Produtos já casa cada PEÇA com o item MAT do Omie, mas para OUTRA
// finalidade: montar a estrutura, uma relação por peça, com o consumo de UMA
// unidade. Aqui a pergunta é diferente: "para produzir N conjuntos, quanto
// material eu compro?". Por isso cada ocorrência da peça conta (uma peça que
// entra 4 vezes consome 4 vezes), e o total é multiplicado pelo lote.
//
// A conversão para chapa inteira depende de três informações de fontes
// diferentes, e quando falta uma delas a linha aparece com o motivo em vez de
// sair com número inventado:
//   1. ESPESSURA: a especificação da BOM ("# 0,6000"), já lida por lerEspecificacao;
//   2. MEDIDA DA CHAPA: os parênteses da descrição do cadastro do Omie
//      ("(1200x2000)"). Não é constante: aço vem 1200x2000 e acrílico/PVC
//      1000x2000, conferido no catálogo em 20/08/2026;
//   3. DENSIDADE do material, que não existe em lugar nenhum do Omie e por isso
//      é tabela aqui, com a marcação de quais valores são fechados.

import { ehPeca } from "@/lib/bom/bomParser";
import type { UnidadePeso } from "@/lib/bom/types";
import {
  casarMateriaPrima,
  ehPorPeso,
  lerEspecificacao,
  pistaDoCodigoPeca,
  ROTULO_LIGA,
  type ItemMat,
  type Liga,
} from "@/lib/produtos/materiaPrima";

import type { ItemBom } from "./bom";

export interface Densidade {
  /** kg/m³. */
  valor: number;
  /**
   * `false` quando o número é típico do material, mas varia com fornecedor e
   * com o tipo (PVC expandido, MDF e compensado são os casos). A tela mostra
   * isso na linha: o m² sai de uma estimativa, não de uma constante fechada.
   */
  confirmada: boolean;
}

// Densidades em kg/m³. Aço, acrílico e poliacetal são propriedades do material e
// não variam na prática. Os três marcados como não confirmados mudam conforme o
// fornecedor: quem tiver a ficha técnica (ou pesar uma chapa inteira) corrige o
// número aqui e o m² fica exato.
export const DENSIDADE: Record<Liga, Densidade> = {
  INOX430: { valor: 7700, confirmada: true },
  CARBONO1020: { valor: 7850, confirmada: true },
  ACRILICO: { valor: 1190, confirmada: true },
  POLIACETAL: { valor: 1410, confirmada: true },
  PVC: { valor: 600, confirmada: false },
  MDF: { valor: 750, confirmada: false },
  COMPENSADO: { valor: 600, confirmada: false },
};

export interface MedidaChapa {
  larguraMm: number;
  comprimentoMm: number;
  areaM2: number;
}

// Medida da chapa inteira, que o cadastro do Omie escreve entre parênteses no
// fim da descrição ("... AÇO CARBONO 1020 (1200x2000)"). Exige as DUAS medidas:
// os tubos usam os mesmos parênteses para o comprimento da barra ("(6000mm)"),
// e ler aquilo como chapa daria uma área que não existe.
const RX_MEDIDA = /\((\d{2,5})\s*[x×]\s*(\d{2,5})\s*(?:mm)?\)/i;

export function medidaDaChapa(descricao: string): MedidaChapa | null {
  const m = RX_MEDIDA.exec(descricao);
  if (!m) return null;
  const larguraMm = Number(m[1]);
  const comprimentoMm = Number(m[2]);
  if (!larguraMm || !comprimentoMm) return null;
  return {
    larguraMm,
    comprimentoMm,
    areaM2: (larguraMm / 1000) * (comprimentoMm / 1000),
  };
}

export interface LinhaMateriaPrima {
  /** Chave da linha: o código MAT, ou o código da peça quando não resolveu. */
  id: string;
  codigoMat: string;
  descricaoMat: string;
  /** Unidade do cadastro no Omie ("KG" em toda chapa e tubo). */
  unidade: string;
  /**
   * Total na unidade acima, já com as ocorrências e o lote multiplicados.
   * `null` quando o peso da BOM não responde a pergunta: cadastro que não é
   * medido por peso, ou BOM sem a coluna de peso preenchida.
   */
  quantidade: number | null;
  /** Só para chapa com espessura e densidade conhecidas. */
  areaM2: number | null;
  /** Chapas inteiras a comprar, já com o aproveitamento aplicado. */
  chapas: number | null;
  medida: MedidaChapa | null;
  densidade: number | null;
  densidadeConfirmada: boolean;
  /** Códigos das peças que caem nesta linha, para conferência. */
  pecas: string[];
  /** Por que não deu para converter (ausente quando converteu). */
  motivo?: string;
}

export interface OpcoesMateriaPrima {
  unidadePeso: UnidadePeso;
  /** Quantos conjuntos serão produzidos. */
  multiplicador: number;
  /** Fração da chapa que vira peça (1 = corte sem perda). */
  aproveitamento: number;
}

interface Acumulado {
  id: string;
  codigoMat: string;
  descricaoMat: string;
  unidade: string;
  kg: number;
  espessuraMm: number | null;
  liga: Liga | null;
  ehChapa: boolean;
  pecas: string[];
  /** Peças que entram nesta linha mas vieram SEM peso na BOM. */
  pecasSemPeso: string[];
  motivo?: string;
}

function motivoDaFalta(especificacao: string, ligaRotulo: string | null): string {
  if (!especificacao) {
    return "A BOM não trouxe especificação de matéria-prima nesta linha, então não dá para dizer qual material comprar.";
  }
  const alvo = ligaRotulo ? ` em ${ligaRotulo}` : "";
  return `Não achei no Omie um cadastro${alvo} que bata com "${especificacao}". Confira o cadastro da matéria-prima.`;
}

/**
 * Agrupa a matéria-prima consumida pelas PEÇAS da BOM, por item MAT do Omie.
 *
 * Peça que não resolve o material (sem especificação, ou sem cadastro que bata)
 * aparece em linha própria com o motivo: sumir da lista é o que faz alguém
 * comprar material a menos sem perceber.
 */
export function agruparMateriaPrima(
  itens: readonly ItemBom[],
  catalogo: readonly ItemMat[],
  opcoes: OpcoesMateriaPrima,
): LinhaMateriaPrima[] {
  const porItem = new Map<string, Acumulado>();

  for (const item of itens) {
    if (item.code.comercial || !ehPeca(item.code.key)) continue;
    if (item.peso === null && !item.especificacao) continue;

    const especificacao = item.especificacao.trim();
    const espec = especificacao ? lerEspecificacao(especificacao) : null;
    const pista = pistaDoCodigoPeca(item.code.key);
    const casamento = espec ? casarMateriaPrima(espec, pista, catalogo) : null;
    // Sem o arredondamento de 3 casas do `pesoParaKg`: aquele é o combinado do
    // envio ao Omie, e aqui o mesmo peso é multiplicado por dezenas de peças,
    // onde o corte na terceira casa vira diferença visível no total.
    const kgUnitario = opcoes.unidadePeso === "g" ? (item.peso ?? 0) / 1000 : (item.peso ?? 0);
    const kg = kgUnitario * item.quantidadeEfetiva * opcoes.multiplicador;

    const chave = casamento ? casamento.item.codigo : `sem-mp:${item.code.key}`;
    const existente = porItem.get(chave);
    if (existente) {
      existente.kg += kg;
      if (!existente.pecas.includes(item.code.key)) existente.pecas.push(item.code.key);
      if (item.peso === null && !existente.pecasSemPeso.includes(item.code.key)) {
        existente.pecasSemPeso.push(item.code.key);
      }
      continue;
    }

    porItem.set(chave, {
      id: chave,
      codigoMat: casamento?.item.codigo ?? "",
      descricaoMat: casamento?.item.descricao ?? item.code.desc ?? "",
      unidade: casamento?.item.unidade ?? "",
      kg,
      espessuraMm: espec?.espessura ?? null,
      liga: casamento?.item.liga ?? null,
      ehChapa: espec?.forma === "chapa",
      pecas: [item.code.key],
      pecasSemPeso: item.peso === null ? [item.code.key] : [],
      motivo: casamento
        ? undefined
        : motivoDaFalta(especificacao, pista.liga ? ROTULO_LIGA[pista.liga] : null),
    });
  }

  const linhas = [...porItem.values()].map((acc) => finalizar(acc, opcoes.aproveitamento));
  linhas.sort((a, b) => (a.codigoMat || "zzz").localeCompare(b.codigoMat || "zzz", "pt-BR"));
  return linhas;
}

function finalizar(acc: Acumulado, aproveitamento: number): LinhaMateriaPrima {
  // Peça que entrou na conta sem peso puxa o total para baixo em silêncio: o
  // grupo tem outras peças com peso, então nada fica zerado e a linha ganha
  // cara de conta fechada. É o jeito de comprar material a menos sem perceber.
  const avisoDoPeso =
    acc.pecasSemPeso.length > 0
      ? `A BOM não trouxe o peso de ${acc.pecasSemPeso.join(", ")}, então este total está ABAIXO do consumo real.`
      : undefined;

  const base: LinhaMateriaPrima = {
    id: acc.id,
    codigoMat: acc.codigoMat,
    descricaoMat: acc.descricaoMat,
    unidade: acc.unidade,
    quantidade: acc.kg,
    areaM2: null,
    chapas: null,
    medida: null,
    densidade: null,
    densidadeConfirmada: true,
    pecas: acc.pecas,
    motivo: acc.motivo ?? avisoDoPeso,
  };

  // Cadastro que não é medido por peso (perfil de borracha em M, courvin em M²,
  // estofado em UN): o peso da BOM não diz o consumo, e escrever o quilo debaixo
  // da unidade do cadastro daria "12,4 M" para 12,4 kg. Mesma regra do
  // `review.ts`, que recusa converter peso quando o cadastro não está em KG.
  if (acc.codigoMat && !ehPorPeso(acc.unidade)) {
    return {
      ...base,
      quantidade: null,
      motivo: `O cadastro deste item no Omie está em ${acc.unidade || "unidade não legível"}, e o peso da BOM não diz o consumo nessa unidade. A quantidade precisa ser levantada na mão.`,
    };
  }

  // Peso zerado é BOM sem a coluna preenchida, não consumo zero. Deixar seguir
  // daria "0 m², 0 chapa" com cara de conta feita.
  if (acc.kg === 0) {
    return {
      ...base,
      quantidade: null,
      motivo:
        acc.motivo ??
        "A BOM não trouxe o peso destas peças, então não dá para calcular quanto material comprar.",
    };
  }

  // Só chapa vira m². Tubo e trefilado são comprados em barra, e a conversão de
  // peso para metro linear é outra conta (não pedida, e sem o comprimento da
  // barra no lugar certo do cadastro seria chute).
  if (!acc.ehChapa || !acc.codigoMat) return base;

  const densidade = acc.liga ? DENSIDADE[acc.liga] : undefined;
  if (!acc.espessuraMm || !densidade) {
    return {
      ...base,
      motivo:
        base.motivo ??
        "Não sei a densidade deste material, então o quilo não vira metro quadrado. O total em KG continua valendo.",
    };
  }

  const areaM2 = acc.kg / ((acc.espessuraMm / 1000) * densidade.valor);
  const medida = medidaDaChapa(acc.descricaoMat);

  if (!medida) {
    return {
      ...base,
      areaM2,
      densidade: densidade.valor,
      densidadeConfirmada: densidade.confirmada,
      motivo:
        base.motivo ??
        "O cadastro deste item no Omie não traz a medida da chapa inteira (o \"(1200x2000)\" no fim da descrição), então não dá para dizer quantas chapas comprar.",
    };
  }

  const rendimento = medida.areaM2 * aproveitamento;
  return {
    ...base,
    areaM2,
    chapas: rendimento > 0 ? Math.ceil(areaM2 / rendimento) : null,
    medida,
    densidade: densidade.valor,
    densidadeConfirmada: densidade.confirmada,
  };
}
