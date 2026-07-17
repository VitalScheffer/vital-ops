// Relatório de consumo das baixas (matéria-prima): parte PURA — agrupa os itens
// baixados (não estornados) do período por produto, OP e finalidade, com valor
// em R$ (custo médio × quantidade). O desenho do PDF fica em consumoPdf.ts.

export interface ItemConsumo {
  sku: string;
  descricao: string;
  quantidade: number;
  valor: number; // custoUnitario × quantidade (R$)
  op?: string | null;
  finalidade?: string | null; // observacao livre da baixa
}

export interface GrupoConsumo {
  chave: string; // nome do produto / OP / finalidade
  quantidade: number;
  valor: number;
}

export interface ResumoConsumo {
  totalValor: number;
  totalItens: number;
  porProduto: GrupoConsumo[];
  porOp: GrupoConsumo[];
  porFinalidade: GrupoConsumo[];
}

function agrupar(itens: readonly ItemConsumo[], chaveDe: (item: ItemConsumo) => string): GrupoConsumo[] {
  const mapa = new Map<string, GrupoConsumo>();
  for (const item of itens) {
    const chave = chaveDe(item);
    const atual = mapa.get(chave) ?? { chave, quantidade: 0, valor: 0 };
    atual.quantidade += item.quantidade;
    atual.valor += item.valor;
    mapa.set(chave, atual);
  }
  // Maior valor primeiro (o que mais pesou no consumo aparece no topo).
  return [...mapa.values()].sort((a, b) => b.valor - a.valor);
}

export function resumoConsumo(itens: readonly ItemConsumo[]): ResumoConsumo {
  return {
    totalValor: itens.reduce((soma, item) => soma + item.valor, 0),
    totalItens: itens.length,
    porProduto: agrupar(itens, (item) => item.descricao || item.sku),
    porOp: agrupar(itens, (item) => (item.op?.trim() ? item.op.trim() : "(sem OP)")),
    porFinalidade: agrupar(itens, (item) => (item.finalidade?.trim() ? item.finalidade.trim() : "(sem finalidade)")),
  };
}

export function formatarReais(valor: number): string {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
