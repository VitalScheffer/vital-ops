"use server";

import { auth } from "@/lib/auth";
import { puxarOpSchema, type PuxarOpInput } from "@/lib/contracts";
import {
  acharOrdem,
  agregarItens,
  buscarProdutosPorId,
  listarOrdensProducao,
  type GrupoItem,
} from "@/lib/estoque/omieOp";
import { chamar } from "@/lib/omie";
import { OmieBlocked } from "@/lib/omie/errors";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewPranchas } from "@/lib/rbac";

// Puxar uma OP para dentro do Multiplicador. LEITURA pura: nada é escrito no
// Omie e nada é gravado no banco. A planilha em si é montada no navegador, para
// o Multiplicador continuar sendo o que ele é (processamento local) — daqui sai
// só a lista de itens.
//
// A permissão é a mesma da tela (`pranchas`): quem já pode compilar prancha e
// multiplicar BOM não ganha poder novo por ler uma ordem de produção.

export interface ItemOpPlanilha {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  grupo: GrupoItem;
}

export interface ResultadoPuxarOp {
  ok: boolean;
  erro?: string;
  ambiguas?: string[];
  numeroOp?: string;
  produtoCodigo?: string;
  produtoDescricao?: string;
  quantidadeOp?: number;
  itens: ItemOpPlanilha[];
}

const VAZIO: ItemOpPlanilha[] = [];

export async function puxarOp(input: PuxarOpInput): Promise<ResultadoPuxarOp> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false, erro: "Sessão expirada. Entre novamente.", itens: VAZIO };
  }
  const permissions = await getRolePermissionsMap();
  if (!canViewPranchas(session.user.role, permissions)) {
    return { ok: false, erro: "Você não tem permissão para usar o Multiplicador.", itens: VAZIO };
  }
  if (!process.env.OMIE_APP_KEY || !process.env.OMIE_APP_SECRET) {
    return { ok: false, erro: "Integração com o Omie não configurada no servidor.", itens: VAZIO };
  }

  const parsed = puxarOpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, erro: "Informe o número da OP.", itens: VAZIO };

  try {
    const ordens = await listarOrdensProducao(chamar);
    const { ordem, ambiguas } = acharOrdem(parsed.data.numeroOp, ordens);

    if (ambiguas) {
      return {
        ok: false,
        erro: "Mais de uma OP com esse número. Informe o ano (ex.: 2026/802).",
        ambiguas: ambiguas.map((o) => o.numero),
        itens: VAZIO,
      };
    }
    if (!ordem) {
      return {
        ok: false,
        erro: `Não encontrei a OP ${parsed.data.numeroOp} no Omie. Confira o número.`,
        itens: VAZIO,
      };
    }

    const itens = agregarItens(ordem.itens);
    const produtos = await buscarProdutosPorId(
      [ordem.idProduto, ...itens.map((i) => i.idProd)].filter(Boolean),
      chamar,
    );

    // Item que não voltou do Omie entra na planilha com o id no lugar do
    // código, e não some: uma lista de material com uma linha a menos é pior do
    // que uma linha estranha, porque ninguém percebe a que falta.
    const linhas: ItemOpPlanilha[] = itens.map((item) => {
      const produto = produtos.get(item.idProd);
      return {
        codigo: produto?.codigo ?? `#${item.idProd}`,
        descricao: produto?.descricao ?? "Produto não encontrado no Omie",
        unidade: produto?.unidade ?? "",
        quantidade: item.quantidade,
        grupo: produto?.grupo ?? "OUTRO",
      };
    });

    const produtoOp = produtos.get(ordem.idProduto);
    return {
      ok: true,
      numeroOp: ordem.numero,
      produtoCodigo: produtoOp?.codigo,
      produtoDescricao: produtoOp?.descricao,
      quantidadeOp: ordem.quantidade,
      itens: linhas,
    };
  } catch (erro) {
    const mensagem =
      erro instanceof OmieBlocked
        ? "O Omie está temporariamente indisponível (bloqueio de consumo). Tente de novo em alguns minutos."
        : "Não consegui consultar o Omie agora. Tente novamente.";
    return { ok: false, erro: mensagem, itens: VAZIO };
  }
}
