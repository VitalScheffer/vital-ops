import { chamar, type OmiePayload } from "@/lib/omie";

const PEDIDOS_POR_PAGINA = 50;
const CACHE_SECONDS = 5 * 60;

export interface PedidoVendaOmieDTO {
  id: string;
  numero: string;
  etapa: string;
  dataPrevisao: string | null;
  quantidadeItens: number | null;
  origem: string | null;
}

export type VendasOmieDTO =
  | {
      status: "ok";
      total: number;
      pedidos: PedidoVendaOmieDTO[];
      atualizadoEm: string;
    }
  | { status: "error"; message: string };

function comoObjeto(valor: unknown): OmiePayload | null {
  return typeof valor === "object" && valor !== null ? (valor as OmiePayload) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function inteiro(valor: unknown): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? Math.trunc(valor) : null;
}

function etapasDaResposta(resposta: OmiePayload | null): Record<string, string> {
  if (!resposta || !Array.isArray(resposta.cadastros)) return {};

  return Object.fromEntries(
    resposta.cadastros.flatMap((cadastro) => {
      const etapas = comoObjeto(cadastro)?.etapas;
      if (!Array.isArray(etapas)) return [];
      return etapas.flatMap((etapa) => {
        const dado = comoObjeto(etapa);
        const codigo = texto(dado?.cCodigo);
        const descricao = texto(dado?.cDescricao);
        return codigo && descricao ? [[codigo, descricao]] : [];
      });
    }),
  );
}

function pedidosDaResposta(resposta: OmiePayload | null, etapas: Record<string, string>): PedidoVendaOmieDTO[] {
  if (!resposta || !Array.isArray(resposta.pedido_venda_produto)) return [];

  return resposta.pedido_venda_produto.flatMap((pedido) => {
    const cabecalho = comoObjeto(comoObjeto(pedido)?.cabecalho);
    const id = inteiro(cabecalho?.codigo_pedido);
    const numero = texto(cabecalho?.numero_pedido);
    if (id === null || !numero) return [];

    const codigoEtapa = texto(cabecalho?.etapa);
    return [
      {
        id: String(id),
        numero,
        etapa: (codigoEtapa && etapas[codigoEtapa]) || (codigoEtapa ? `Etapa ${codigoEtapa}` : "Sem etapa"),
        dataPrevisao: texto(cabecalho?.data_previsao),
        quantidadeItens: inteiro(cabecalho?.quantidade_itens),
        origem: texto(cabecalho?.origem_pedido),
      },
    ];
  });
}

// Categoria independente do Recebimento: apenas espelha pedidos do Omie e não
// persiste nem altera nenhum dado. Removê-la não exige migration.
export async function listarVendasOmie(): Promise<VendasOmieDTO> {
  try {
    const [respostaEtapas, primeiraPagina] = await Promise.all([
      chamar("produtos/etapafat", "ListarEtapasFaturamento", { pagina: 1, registros_por_pagina: 50 }, { ttlSeconds: CACHE_SECONDS }),
      chamar("produtos/pedido", "ListarPedidos", { pagina: 1, registros_por_pagina: 1, apenas_resumo: "S", ordenar_por: "CODIGO" }, { ttlSeconds: CACHE_SECONDS }),
    ]);

    if (!primeiraPagina) {
      return { status: "ok", total: 0, pedidos: [], atualizadoEm: new Date().toISOString() };
    }

    const total = inteiro(primeiraPagina.total_de_registros) ?? 0;
    const totalPaginas = inteiro(primeiraPagina.total_de_paginas) ?? 1;
    const respostaPedidos = await chamar(
      "produtos/pedido",
      "ListarPedidos",
      { pagina: Math.max(totalPaginas, 1), registros_por_pagina: PEDIDOS_POR_PAGINA, apenas_resumo: "S", ordenar_por: "CODIGO" },
      { ttlSeconds: CACHE_SECONDS },
    );

    return {
      status: "ok",
      total,
      pedidos: pedidosDaResposta(respostaPedidos, etapasDaResposta(respostaEtapas)),
      atualizadoEm: new Date().toISOString(),
    };
  } catch (erro) {
    console.warn("[recebimento] Não foi possível consultar Vendas no Omie.", erro);
    return { status: "error", message: "Não foi possível consultar Vendas no Omie agora." };
  }
}
