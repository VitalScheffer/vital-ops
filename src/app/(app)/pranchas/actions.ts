"use server";

import { auth } from "@/lib/auth";
import { chamar } from "@/lib/omie";
import { listarCatalogoCom, type ItemCom } from "@/lib/produtos/catalogoCom";
import { listarCatalogoMat } from "@/lib/produtos/catalogoMat";
import type { ItemMat } from "@/lib/produtos/materiaPrima";

// Apoio do Modo 2 do compilador de pranchas. O modo clássico não passa por aqui:
// ele roda inteiro no navegador, e é essa a promessa que a tela faz.
//
// As duas chamadas são LEITURAS (não contam pro limite de bloqueio da app_key
// quando dão certo) e ficam uma hora no cache do client, então trocar de modo
// várias vezes na mesma tarde não conversa com o Omie de novo.

export interface CatalogosResult {
  ok: boolean;
  erro?: string;
  mat?: ItemMat[];
  com?: ItemCom[];
  /**
   * `false` quando a varredura dos comprados parou antes do fim. A tela usa isso
   * para NÃO apontar "código fora do Omie" em cima de meio catálogo.
   */
  comCompleto?: boolean;
}

/**
 * Catálogos que o Modo 2 precisa: a matéria-prima (para saber qual chapa cada
 * peça consome, com a medida da chapa inteira) e os comprados (para a unidade
 * de compra e para apontar código que não existe no cadastro).
 *
 * `revalidar` é o botão de recarregar da tela, para quem acabou de cadastrar
 * algo no Omie e não quer esperar o cache vencer.
 */
export async function carregarCatalogosDeCompra(revalidar = false): Promise<CatalogosResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente." };
  }

  try {
    // Em série, de propósito: são duas leituras paginadas na mesma app_key, e
    // disparar as duas juntas só aumenta a chance de esbarrar no limite de
    // chamadas simultâneas do Omie sem ganhar tempo perceptível na tela.
    const mat = await listarCatalogoMat(chamar, { revalidar });
    const com = await listarCatalogoCom(chamar, { revalidar });
    return { ok: true, mat, com: [...com.itens.values()], comCompleto: com.completo };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: `Não consegui ler os cadastros no Omie: ${motivo}` };
  }
}
