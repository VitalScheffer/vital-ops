// Escrita no CADASTRO de produto do Omie. Hoje só uma operação: aposentar um
// código antigo (inativar).
//
// É a única escrita do app que não mexe em saldo, e a mais definitiva: um
// cadastro inativo some das buscas, dos pedidos e das estruturas novas. Por
// isso ela nunca é consequência automática de outra ação — quem chama é o botão
// de migração do De/Para, depois de mover o saldo e com confirmação explícita
// na tela.
//
// Módulo PURO no sentido do resto do estoque: recebe `chamar` por parâmetro.

import type { ChamarFn } from "./omieEstoque";
import { OmieBlocked } from "@/lib/omie/errors";

const WRITE = { write: true } as const;

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

export interface ResultadoInativacao {
  ok: boolean;
  /** Já estava inativo no Omie: nada a fazer, e isso NÃO é erro. */
  jaInativo?: boolean;
  motivo?: string;
}

/** O cadastro já está inativo no Omie? Leitura barata antes de escrever. */
export async function produtoInativo(idProd: string, chamar: ChamarFn): Promise<boolean | undefined> {
  const resp = await chamar("geral/produtos/", "ConsultarProduto", {
    codigo_produto: Number(idProd),
  });
  const inativo = texto(resp?.inativo)?.toUpperCase();
  return inativo === undefined ? undefined : inativo === "S";
}

/**
 * Inativa o cadastro no Omie.
 *
 * A chamada vai com o mínimo (`codigo_produto` + `inativo`), que é o que o
 * `AlterarProduto` precisa para uma alteração parcial. Mandar descrição, código
 * e NCM junto "por garantia" seria pior: qualquer divergência entre o que
 * temos em memória e o cadastro atual reescreveria o produto com dado velho, e
 * o conflito de código/descrição do Omie viraria um erro que ninguém entende.
 *
 * "Já inativo" volta como sucesso com `jaInativo`. Repetir a aposentadoria
 * depois de uma queda no meio precisa terminar em "está do jeito que eu quero",
 * não em vermelho.
 */
export async function inativarProduto(
  idProd: string,
  chamar: ChamarFn,
): Promise<ResultadoInativacao> {
  try {
    const jaEstava = await produtoInativo(idProd, chamar);
    if (jaEstava === true) return { ok: true, jaInativo: true };
  } catch (erro) {
    // Não conseguir CONFERIR não impede tentar inativar; a escrita abaixo é
    // idempotente do ponto de vista do resultado (inativo continua inativo).
    if (erro instanceof OmieBlocked) return { ok: false, motivo: mensagem(erro) };
  }

  try {
    await chamar(
      "geral/produtos/",
      "AlterarProduto",
      { codigo_produto: Number(idProd), inativo: "S" },
      WRITE,
    );
    return { ok: true };
  } catch (erro) {
    return { ok: false, motivo: mensagem(erro) };
  }
}
