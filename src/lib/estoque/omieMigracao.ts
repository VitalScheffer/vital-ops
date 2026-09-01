// Migração de saldo do código ANTIGO para o NOVO, local por local.
//
// O Omie não sabe "trocar o produto de um saldo", igual não sabe transferir
// entre locais. Cada local com saldo vira DUAS escritas: uma saída do cadastro
// antigo e uma entrada do cadastro novo, no MESMO local, com a quantidade
// convertida pelo fator do De/Para.
//
// A anatomia é irmã do `transferirEstoque` (mesma idempotência por
// `cod_int_ajuste`, mesmo estado `entrada_pendente`, mesma pausa de segurança),
// e por um motivo: o risco é o mesmo. A diferença é o eixo. Lá o produto é um
// só e o que muda é o local; aqui o local é um só e o que muda é o produto.
//
// Módulo PURO: recebe `chamar` por parâmetro e não toca em banco.

import { OmieBlocked, OmieDuplicate } from "@/lib/omie/errors";
import type { OmiePayload } from "@/lib/omie/client";
import {
  LOCAL_PADRAO,
  alocarLotesFEFO,
  type AlocacaoLote,
  type ChamarFn,
  type LoteDisponivel,
  type ProdutoEstoque,
  type SaldoEstoque,
} from "./omieEstoque";

const WRITE = { write: true } as const;

// Mesma margem do resto do módulo de estoque: N respostas seguidas fora do
// sucesso limpo pausam a execução antes de chegar perto do bloqueio da app_key.
const LIMITE_SEQUENCIA_RISCO = 5;

const MOTIVO_NAO_MIGRADO = "Migração interrompida antes de chegar neste local.";

export const SUFIXO_SAIDA = "ms";
export const SUFIXO_ENTRADA = "me";

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

function mensagem(erro: unknown): string {
  if (erro instanceof OmieBlocked) {
    return "O Omie está temporariamente indisponível (bloqueio de consumo). Tente de novo em alguns minutos.";
  }
  return erro instanceof Error ? erro.message : String(erro);
}

function localParaOmie(codigo: string): number | undefined {
  return codigo && codigo !== LOCAL_PADRAO ? Number(codigo) : undefined;
}

export interface ItemMigracao {
  /** Id do nosso `MigracaoLegadoItem` — vira o `cod_int_ajuste` das duas pernas. */
  chave: string;
  localCodigo: string;
  /** Quanto sai do cadastro ANTIGO (na unidade dele). */
  quantidadeLegado: number;
  /** Quanto entra no cadastro NOVO (já convertido pelo fator). */
  quantidadeNovo: number;
  obs: string;
  /** A saída já foi lançada num envio anterior: manda só a entrada. */
  saidaFeita?: boolean;
  lotes?: AlocacaoLote[];
}

export type OutcomeMigracao =
  | "migrado"
  | "ja_migrado"
  | "entrada_pendente"
  | "falha"
  | "nao_migrado";

export interface ResultadoItemMigracao {
  chave: string;
  localCodigo: string;
  outcome: OutcomeMigracao;
  motivo?: string;
  refSaida?: string;
  refEntrada?: string;
  custoUnitario?: number;
  lotes?: AlocacaoLote[];
}

export interface ResultadoMigracao {
  itens: ResultadoItemMigracao[];
  interrompido: boolean;
  bloqueado: boolean;
  motivoInterrupcao?: string;
}

export interface ContextoMigracao {
  data: string; // DD/MM/AAAA
  legado: ProdutoEstoque;
  novo: ProdutoEstoque;
  /** Saldo/CMC do cadastro ANTIGO por local (`{localCodigo → saldo}`). */
  saldos: Map<string, SaldoEstoque>;
  /** Lotes do cadastro ANTIGO por local (só quando ele tem controle de lote). */
  lotes?: Map<string, LoteDisponivel[]>;
}

/**
 * Por que a entrada no código novo é recusada quando ele tem controle de lote:
 *
 * o `IncluirAjusteEstoque` de ENTRADA só aceita `lote_validade` apontando para
 * um lote que JÁ existe, e não há como criar lote por essa chamada. Lançar a
 * entrada sem lote num produto que exige lote produziria saldo que a fábrica
 * não consegue baixar depois. Melhor recusar antes de tirar o material do
 * cadastro antigo do que deixar o saldo preso do outro lado.
 */
export function novoAceitaEntrada(novo: ProdutoEstoque): { ok: boolean; motivo?: string } {
  if (novo.controleLote) {
    return {
      ok: false,
      motivo:
        "O cadastro NOVO tem controle de lote e o ajuste de entrada do Omie não cria lote. " +
        "Faça a entrada desse saldo pelo Omie, informando o lote, e depois marque o código antigo como aposentado.",
    };
  }
  return { ok: true };
}

/**
 * Move o saldo do cadastro antigo para o novo, um local por vez.
 *
 * O valor dos DOIS ajustes sai do CMC do cadastro ANTIGO multiplicado pela
 * quantidade que sai dele. É o único jeito de o total não mudar: usar o CMC do
 * cadastro novo (que pode ser zero, ou de outra unidade) na perna de entrada
 * inventaria ou apagaria valor de estoque numa operação que é só uma troca de
 * etiqueta.
 */
export async function migrarSaldo(
  itens: readonly ItemMigracao[],
  ctx: ContextoMigracao,
  chamar: ChamarFn,
): Promise<ResultadoMigracao> {
  const resultados: ResultadoItemMigracao[] = [];
  let interrompido = false;
  let bloqueado = false;
  let motivoInterrupcao: string | undefined;
  let sequenciaRisco = 0;

  const aceita = novoAceitaEntrada(ctx.novo);
  if (!aceita.ok) {
    return {
      itens: itens.map((item) => ({
        chave: item.chave,
        localCodigo: item.localCodigo,
        outcome: "falha" as const,
        motivo: aceita.motivo,
      })),
      interrompido: true,
      bloqueado: false,
      motivoInterrupcao: aceita.motivo,
    };
  }

  const registrarSequencia = (sucessoLimpo: boolean): void => {
    if (sucessoLimpo) {
      sequenciaRisco = 0;
      return;
    }
    sequenciaRisco += 1;
    if (sequenciaRisco >= LIMITE_SEQUENCIA_RISCO) {
      interrompido = true;
      motivoInterrupcao =
        `Migração pausada por segurança após ${LIMITE_SEQUENCIA_RISCO} respostas seguidas ` +
        "fora do sucesso limpo (margem antes do limite de bloqueio da Omie). " +
        "Aguarde alguns minutos e continue de onde parou.";
    }
  };

  for (const item of itens) {
    if (interrompido) {
      resultados.push({
        chave: item.chave,
        localCodigo: item.localCodigo,
        outcome: "nao_migrado",
        motivo: MOTIVO_NAO_MIGRADO,
      });
      continue;
    }

    const saldo = ctx.saldos.get(item.localCodigo);
    const cmc = saldo?.cmc ?? 0;
    const local = localParaOmie(item.localCodigo);
    let alocacaoLote: AlocacaoLote[] | undefined = item.lotes;

    if (!item.saidaFeita) {
      const disponivel = saldo?.saldo ?? 0;
      if (disponivel < item.quantidadeLegado) {
        resultados.push({
          chave: item.chave,
          localCodigo: item.localCodigo,
          outcome: "falha",
          motivo: `Saldo insuficiente neste local: disponível ${disponivel}, pedido ${item.quantidadeLegado}.`,
        });
        continue;
      }

      if (ctx.legado.controleLote) {
        const lotes = ctx.lotes?.get(item.localCodigo) ?? [];
        const alocado = alocarLotesFEFO(item.quantidadeLegado, lotes);
        if (alocado.faltou > 0) {
          resultados.push({
            chave: item.chave,
            localCodigo: item.localCodigo,
            outcome: "falha",
            motivo:
              "O cadastro antigo tem controle de lote e não há lote DISPONÍVEL suficiente neste local " +
              `(faltou ${alocado.faltou}). Parte do saldo pode estar reservada em pedidos/OPs.`,
          });
          continue;
        }
        alocacaoLote = alocado.alocacao;
      }
    }

    const valorTotal = cmc > 0 ? Number((cmc * item.quantidadeLegado).toFixed(2)) : undefined;
    const noLocal: OmiePayload = local ? { codigo_local_estoque: local } : {};

    // --- perna 1: saída do cadastro ANTIGO ---
    let refSaida: string | undefined;
    if (!item.saidaFeita) {
      const loteValidade = alocacaoLote?.map((a) => ({
        nIdLote: Number(a.nIdLote),
        nQtdLote: a.quantidade,
      }));
      try {
        const resp = await chamar(
          "estoque/ajuste/",
          "IncluirAjusteEstoque",
          {
            id_prod: Number(ctx.legado.idProd),
            data: ctx.data,
            quan: item.quantidadeLegado,
            motivo: "OPS",
            origem: "AJU",
            ...(valorTotal !== undefined ? { valor: valorTotal } : {}),
            ...(loteValidade && loteValidade.length > 0 ? { lote_validade: loteValidade } : {}),
            cod_int_ajuste: `${item.chave}-${SUFIXO_SAIDA}`.slice(0, 60),
            tipo: "SAI",
            obs: `Saída p/ ${item.obs}`.slice(0, 500),
            ...noLocal,
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
            localCodigo: item.localCodigo,
            outcome: "nao_migrado",
            motivo: MOTIVO_NAO_MIGRADO,
          });
          continue;
        }
        if (!(erro instanceof OmieDuplicate)) {
          resultados.push({
            chave: item.chave,
            localCodigo: item.localCodigo,
            outcome: "falha",
            motivo: mensagem(erro),
          });
          registrarSequencia(false);
          continue;
        }
        // Duplicado = a saída já foi lançada num envio anterior. Segue para a
        // entrada, que é justamente o que pode estar faltando.
        registrarSequencia(false);
      }
    }

    // --- perna 2: entrada no cadastro NOVO, no MESMO local ---
    try {
      const resp = await chamar(
        "estoque/ajuste/",
        "IncluirAjusteEstoque",
        {
          id_prod: Number(ctx.novo.idProd),
          data: ctx.data,
          quan: item.quantidadeNovo,
          motivo: "OPS",
          origem: "AJU",
          ...(valorTotal !== undefined ? { valor: valorTotal } : {}),
          cod_int_ajuste: `${item.chave}-${SUFIXO_ENTRADA}`.slice(0, 60),
          tipo: "ENT",
          obs: `Entrada p/ ${item.obs}`.slice(0, 500),
          ...noLocal,
        },
        WRITE,
      );
      resultados.push({
        chave: item.chave,
        localCodigo: item.localCodigo,
        outcome: "migrado",
        refSaida,
        refEntrada: texto(resp?.id_ajuste) ?? texto(resp?.id_movest),
        custoUnitario: cmc,
        ...(alocacaoLote ? { lotes: alocacaoLote } : {}),
      });
      registrarSequencia(true);
    } catch (erro) {
      if (erro instanceof OmieDuplicate) {
        resultados.push({
          chave: item.chave,
          localCodigo: item.localCodigo,
          outcome: "ja_migrado",
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
      // Saída passou, entrada não: o material sumiu do código antigo e não
      // apareceu no novo. Estado próprio, nunca "falha" — repetir do zero
      // tiraria saldo de novo do cadastro antigo.
      resultados.push({
        chave: item.chave,
        localCodigo: item.localCodigo,
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
