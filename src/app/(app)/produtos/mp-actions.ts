"use server";

import { z } from "zod";

import { auth } from "@/lib/auth";
import { normalizarCodigoMontagem } from "@/lib/bom/montagem";
import { buscarProdutosPorCodigo } from "@/lib/estoque/omieEstoque";
import { chamar } from "@/lib/omie";
import { listarCatalogoMat } from "@/lib/produtos/catalogoMat";
import type { ItemMat } from "@/lib/produtos/materiaPrima";

// Apoio da tela de Produtos para as duas informações que só o servidor tem:
// o catálogo de matéria-prima e a conferência da montagem de destino. As duas
// são LEITURAS no Omie (não contam pro limite de bloqueio quando dão certo).

export interface CatalogoMatResult {
  ok: boolean;
  erro?: string;
  itens?: ItemMat[];
}

/** Catálogo MAT do Omie, já interpretado, para sugerir a MP de cada peça. */
export async function carregarCatalogoMat(): Promise<CatalogoMatResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente." };
  }

  try {
    return { ok: true, itens: await listarCatalogoMat(chamar) };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return {
      ok: false,
      erro: `Não consegui ler o catálogo de matéria-prima no Omie: ${motivo}`,
    };
  }
}

const codigoSchema = z.string().trim().min(1).max(60);

export interface MontagemResult {
  ok: boolean;
  erro?: string;
  /** Encontrada no Omie? `false` = o código não existe lá (não dá pra pendurar nada). */
  existe?: boolean;
  codigo?: string;
  descricao?: string;
}

/**
 * Confere se a MONTAGEM de destino existe no Omie ANTES do envio. Sem essa
 * conferência, um código errado só apareceria no fim, com uma falha por relação
 * de nível topo — e falha de escrita é o que conta pro bloqueio da app_key.
 */
export async function verificarMontagem(codigo: string): Promise<MontagemResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente." };
  }

  const parsed = codigoSchema.safeParse(codigo);
  if (!parsed.success) {
    return { ok: false, erro: "Informe o código da montagem." };
  }

  const procurado = normalizarCodigoMontagem(parsed.data);

  try {
    const encontrados = await buscarProdutosPorCodigo([procurado], chamar);
    // O mapa vem chaveado pelo código que o OMIE devolveu, não pelo que a pessoa
    // digitou: procuramos sem diferenciar caixa nem espaço sobrando, senão um
    // "msvch mt001 i0pol" viraria "não achei" para um cadastro que existe.
    const achado = [...encontrados].find(([codigo]) => normalizarCodigoMontagem(codigo) === procurado);
    if (!achado) return { ok: true, existe: false, codigo: parsed.data };
    const [codigoOmie, produto] = achado;
    // Devolve o código EXATAMENTE como está no Omie: a tela adota essa forma, e
    // é ela que vai como pai da estrutura no envio.
    return { ok: true, existe: true, codigo: codigoOmie, descricao: produto.descricao };
  } catch (erro) {
    const motivo = erro instanceof Error ? erro.message : String(erro);
    return { ok: false, erro: `Não consegui conferir a montagem no Omie: ${motivo}` };
  }
}
