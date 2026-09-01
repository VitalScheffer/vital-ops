// O que ainda está RODANDO com o código antigo.
//
// Aposentar um cadastro não é só mover saldo. Se existe OP aberta que consome
// aquele código, requisição interna esperando baixa ou pedido de compra a
// caminho, inativar o cadastro deixa esses documentos apontando para um produto
// que sumiu — e o problema só aparece semanas depois, no chão de fábrica.
//
// Esta é a conferência que roda ANTES da migração. Ela não impede nada sozinha:
// mostra o que existe, com nome e número, para a pessoa decidir. O servidor só
// exige que a decisão seja explícita (`confirmaPendencias`).
//
// Módulo PURO no sentido do resto do estoque: recebe `chamar` por parâmetro e
// as pendências do NOSSO banco já lidas pelo caller.

import type { OmiePayload } from "@/lib/omie/client";
import type { ChamarFn } from "@/lib/estoque/omieEstoque";
import { listarOrdensProducao } from "@/lib/estoque/omieOp";

const REGISTROS_POR_PAGINA = 50;
// Teto de páginas do pedido de compra: guarda contra um total estranho virar
// laço longo. 20 páginas × 50 = 1000 pedidos, muito acima do volume real.
const MAX_PAGINAS_COMPRA = 20;

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

function numero(valor: unknown): number | undefined {
  const n = typeof valor === "number" ? valor : Number(valor);
  return Number.isFinite(n) ? n : undefined;
}

export interface OpPendente {
  numero: string;
  quantidade: number;
  dataPrevisao?: string;
  /** A OP já reservou este item pela reserva NATIVA do Omie. */
  reservado: boolean;
}

export interface CompraPendente {
  numero: string;
  fornecedor?: string;
  quantidade: number;
  dataPrevisao?: string;
}

export interface RequisicaoPendente {
  numero: number;
  solicitante: string;
  quantidade: number;
  status: string;
}

export interface PendenciasLegado {
  /** OPs NÃO concluídas cujo material inclui o código antigo. */
  ops: OpPendente[];
  /** Pedidos de compra em aberto com o código antigo. */
  compras: CompraPendente[];
  /** Requisições do Vital Ops ainda não baixadas com o código antigo. */
  requisicoes: RequisicaoPendente[];
  /** Alguma leitura do Omie falhou: a lista está incompleta, e a tela diz isso. */
  incompleto: boolean;
  avisos: string[];
}

export const PENDENCIAS_VAZIAS: PendenciasLegado = {
  ops: [],
  compras: [],
  requisicoes: [],
  incompleto: false,
  avisos: [],
};

/** Existe pelo menos uma pendência aberta? */
export function temPendencia(p: PendenciasLegado): boolean {
  return p.ops.length > 0 || p.compras.length > 0 || p.requisicoes.length > 0;
}

/**
 * OPs não concluídas que consomem `idProd`.
 *
 * O casamento é pelo id INTERNO do produto e não pelo código: é assim que a OP
 * guarda o item (`nIdProdutoMalha`), e é o único jeito de a conferência
 * continuar certa se alguém renomear o cadastro entre a leitura e a migração.
 *
 * A lista de OPs é a MESMA leitura cacheada que a tela de Movimentação já faz,
 * então na prática esta conferência não custa chamada nova.
 */
export async function opsQueUsam(
  idProd: string,
  chamar: ChamarFn,
): Promise<OpPendente[]> {
  const ordens = await listarOrdensProducao(chamar);
  const achadas: OpPendente[] = [];
  for (const ordem of ordens) {
    if (ordem.concluida) continue;
    for (const item of ordem.itens) {
      if (item.idProd !== idProd) continue;
      achadas.push({
        numero: ordem.numero,
        quantidade: item.quantidade,
        dataPrevisao: ordem.dataPrevisao,
        reservado: item.reservado,
      });
      break;
    }
  }
  return achadas;
}

/**
 * Pedidos de compra em aberto que trazem `idProd`.
 *
 * Conferido contra a API em 01/09/2026: nesta base o `PesquisarPedCompra`
 * responde "não existem registros" — a empresa não usa o módulo de Pedido de
 * Compra do Omie. A conferência fica assim mesmo: custa uma leitura, o client
 * devolve `null` no vazio (categoria EMPTY) e, no dia em que passarem a usar o
 * módulo, a tela já avisa sem ninguém precisar lembrar de ligar isso.
 */
export async function comprasQueUsam(
  idProd: string,
  chamar: ChamarFn,
): Promise<CompraPendente[]> {
  const achadas: CompraPendente[] = [];

  for (let pagina = 1; pagina <= MAX_PAGINAS_COMPRA; pagina++) {
    const resp = await chamar(
      "produtos/pedidocompra/",
      "PesquisarPedCompra",
      { nPagina: pagina, nRegsPorPagina: REGISTROS_POR_PAGINA, lApenasAlterados: "N" },
      { ttlSeconds: 600 },
    );
    if (!resp) break;

    const pedidos = resp.pedido_compra_produto ?? resp.pedidos_compra ?? resp.cadastros;
    if (Array.isArray(pedidos)) {
      for (const bruto of pedidos as OmiePayload[]) {
        const cabecalho = (bruto.cabecalho ?? bruto.pedido ?? bruto) as OmiePayload;
        // "Recebido"/"Cancelado" não é pendência: o documento já morreu.
        const situacao = texto(cabecalho.codigo_situacao ?? cabecalho.cCodSit)?.trim();
        if (situacao === "50" || situacao === "60") continue;

        const itens = Array.isArray(bruto.produtos) ? (bruto.produtos as OmiePayload[]) : [];
        for (const item of itens) {
          const id = texto(item.codigo_produto ?? item.nCodProd)?.trim();
          if (id !== idProd) continue;
          achadas.push({
            numero: texto(cabecalho.numero ?? cabecalho.codigo_pedido) ?? "sem número",
            fornecedor: texto(cabecalho.codigo_fornecedor ?? cabecalho.nCodFor),
            quantidade: numero(item.quantidade ?? item.nQtde) ?? 0,
            dataPrevisao: texto(cabecalho.data_previsao ?? cabecalho.dDtPrevisao),
          });
          break;
        }
      }
    }

    const totalPaginas = numero(resp.total_de_paginas ?? resp.nTotPaginas) ?? 1;
    if (pagina >= totalPaginas) break;
  }

  return achadas;
}

export interface EntradaPendencias {
  idProd: string;
  /** Requisições do NOSSO banco, já lidas pelo caller (que tem o Prisma). */
  requisicoes: RequisicaoPendente[];
}

/**
 * A conferência completa.
 *
 * Cada leitura do Omie é isolada num try próprio de propósito: uma delas falhar
 * não pode apagar as outras. Uma lista de pendências incompleta apresentada
 * como completa é pior do que nenhuma — ela autoriza a migração dizendo "não
 * tem nada aberto" quando ninguém olhou.
 */
export async function conferirPendencias(
  entrada: EntradaPendencias,
  chamar: ChamarFn,
): Promise<PendenciasLegado> {
  const avisos: string[] = [];
  let incompleto = false;

  let ops: OpPendente[] = [];
  try {
    ops = await opsQueUsam(entrada.idProd, chamar);
  } catch {
    incompleto = true;
    avisos.push("Não consegui ler as ordens de produção do Omie agora: pode haver OP aberta com este código.");
  }

  let compras: CompraPendente[] = [];
  try {
    compras = await comprasQueUsam(entrada.idProd, chamar);
  } catch {
    incompleto = true;
    avisos.push("Não consegui ler os pedidos de compra do Omie agora: pode haver compra a caminho com este código.");
  }

  return { ops, compras, requisicoes: entrada.requisicoes, incompleto, avisos };
}
