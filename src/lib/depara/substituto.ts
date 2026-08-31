// Substituto legado: qual cadastro ANTIGO segura o saldo que a OP pede no
// código NOVO.
//
// O De/Para (`depara.ts`) resolve a pergunta na direção que a pessoa revisa:
// "este PRD vira qual MAT?". A tela de movimentação precisa da direção
// INVERSA, e a partir de uma OP: "a OP pede MATCH 00090 IN430, não tem saldo,
// quem tem?". Este módulo monta esse índice.
//
// Duas origens, e a diferença entre elas aparece na tela:
//   • `confirmado` — alguém revisou e gravou no De/Para. É a resposta boa.
//   • `automatico` — ninguém revisou ainda; o casamento por geometria e liga
//     achou um candidato. Serve para não travar a fábrica enquanto a fila de
//     revisão não anda, mas nunca entra selecionado sozinho e sempre carrega o
//     motivo da dúvida.
//
// Módulo PURO: recebe as listas já lidas e não fala com o Omie.

import type { ItemMat } from "@/lib/produtos/materiaPrima";
import { sugerirEquivalente, type ItemLegado } from "./depara";

export type OrigemSubstituto = "confirmado" | "automatico";

export interface Substituto {
  codigo: string;
  idProd: string;
  descricao: string;
  /** Unidade do cadastro antigo. Ausente = não foi possível ler no Omie. */
  unidade?: string;
  saldo: number;
  origem: OrigemSubstituto;
  /** A unidade do cadastro antigo difere da que a OP pede. */
  unidadeMuda: boolean;
  /** O que a pessoa precisa ler ANTES de mover este item no lugar do novo. */
  avisos: string[];
}

/** Um legado com saldo, já com id e (quando conhecida) a unidade do cadastro. */
export interface LegadoComSaldo extends ItemLegado {
  idProd: string;
}

/** Uma linha do De/Para já confirmada por gente. */
export interface DeParaConfirmado {
  codigoLegado: string;
  codigoNovo: string;
  unidadeLegado?: string | null;
}

function unidadeNormal(unidade: string | null | undefined): string {
  return (unidade ?? "").trim().toUpperCase();
}

/**
 * `{código novo → candidatos legados}`, ordenado por qualidade: primeiro os
 * confirmados, depois os automáticos, e dentro de cada grupo o de MAIOR saldo.
 *
 * A ordem importa porque a tela mostra o primeiro como opção mais provável. Um
 * automático nunca passa na frente de um confirmado, mesmo com mais saldo:
 * quantidade de material não é argumento contra uma decisão que uma pessoa já
 * tomou.
 */
export function indexarSubstitutos(
  legados: readonly LegadoComSaldo[],
  catalogo: readonly ItemMat[],
  confirmados: readonly DeParaConfirmado[],
): Map<string, Substituto[]> {
  const porLegado = new Map(confirmados.map((c) => [c.codigoLegado, c]));
  const indice = new Map<string, Substituto[]>();

  const adicionar = (codigoNovo: string, substituto: Substituto): void => {
    const atual = indice.get(codigoNovo);
    if (atual) atual.push(substituto);
    else indice.set(codigoNovo, [substituto]);
  };

  for (const legado of legados) {
    if ((legado.saldo ?? 0) <= 0) continue;

    const confirmado = porLegado.get(legado.codigo);
    if (confirmado) {
      adicionar(confirmado.codigoNovo, {
        codigo: legado.codigo,
        idProd: legado.idProd,
        descricao: legado.descricao,
        unidade: legado.unidade,
        saldo: legado.saldo ?? 0,
        origem: "confirmado",
        unidadeMuda: false, // resolvido em `anotarUnidades`, que conhece a unidade do novo
        avisos: [],
      });
      continue;
    }

    const sugestao = sugerirEquivalente(legado, catalogo);
    if (!sugestao.codigoNovo) continue;
    adicionar(sugestao.codigoNovo, {
      codigo: legado.codigo,
      idProd: legado.idProd,
      descricao: legado.descricao,
      unidade: legado.unidade,
      saldo: legado.saldo ?? 0,
      origem: "automatico",
      unidadeMuda: false,
      avisos: [
        "Ninguém revisou este par ainda: a ligação foi deduzida da descrição. " +
          "Confirme no De/Para antes de tratar como certa.",
        ...sugestao.alertas,
      ],
    });
  }

  for (const lista of indice.values()) {
    lista.sort((a, b) => {
      if (a.origem !== b.origem) return a.origem === "confirmado" ? -1 : 1;
      return b.saldo - a.saldo;
    });
  }

  return indice;
}

/**
 * Fecha o aviso de unidade, que só dá para calcular sabendo a unidade dos DOIS
 * lados: a do cadastro antigo e a que a OP pede.
 *
 * Este é o "avisar quando o PRD não bater com a nomenclatura nova" na sua forma
 * mais concreta: a OP pede 21,66 em KG e o cadastro antigo está em M². Mover o
 * mesmo número seria inventar material. Quem consome marca a linha para exigir
 * a quantidade na mão.
 */
export function anotarUnidades(
  substitutos: readonly Substituto[],
  unidadeDoNovo: string | undefined,
): Substituto[] {
  const nova = unidadeNormal(unidadeDoNovo);
  return substitutos.map((substituto) => {
    const antiga = unidadeNormal(substituto.unidade);
    const muda = antiga !== "" && nova !== "" && antiga !== nova;
    if (!muda) return { ...substituto, unidadeMuda: false };
    return {
      ...substituto,
      unidadeMuda: true,
      avisos: [
        `A OP pede em ${nova} e este cadastro está em ${antiga}. ` +
          "A quantidade NÃO se converte sozinha: informe quanto vai sair, na unidade do cadastro antigo.",
        ...substituto.avisos,
      ],
    };
  });
}
