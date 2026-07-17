// Relatório de requisições (PDF): parte PURA — rótulos e totais, testáveis sem
// abrir PDF. O desenho (layout, marca, tabelas) fica em relatorioPdf.ts, que
// consome os dados estruturados (RequisicaoRelatorio[]) direto.

export interface ItemRelatorio {
  sku: string;
  descricao: string;
  quantidade: number;
  status: string; // PENDENTE | BAIXADO | FALHA
  motivoErro?: string | null;
}

export interface RequisicaoRelatorio {
  numero: number;
  status: string; // PENDENTE | CONFIRMADA | RECUSADA
  solicitanteNome: string;
  setor: string;
  criadoEm: string; // já formatado (dd/mm/aaaa hh:mm)
  gestor?: string | null;
  decididaEm?: string | null;
  motivoDecisao?: string | null;
  localEstoqueNome?: string | null;
  itens: ItemRelatorio[];
}

const STATUS_LABEL: Record<string, string> = {
  PENDENTE: "Aguardando gestor",
  CONFIRMADA: "Aprovada",
  RECUSADA: "Recusada",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  PENDENTE: "pendente",
  BAIXADO: "baixado",
  FALHA: "falha",
};

export function statusRequisicaoLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusItemLabel(status: string): string {
  return ITEM_STATUS_LABEL[status] ?? status;
}

export function quantidadeTexto(quantidade: number): string {
  return quantidade.toLocaleString("pt-BR");
}

export interface ResumoRelatorio {
  total: number;
  aprovadas: number;
  recusadas: number;
  pendentes: number;
}

// Totais por status (o "aguardando" é o que sobra — cobre qualquer status novo).
export function resumoRelatorio(requisicoes: readonly RequisicaoRelatorio[]): ResumoRelatorio {
  const total = requisicoes.length;
  const aprovadas = requisicoes.filter((r) => r.status === "CONFIRMADA").length;
  const recusadas = requisicoes.filter((r) => r.status === "RECUSADA").length;
  return { total, aprovadas, recusadas, pendentes: total - aprovadas - recusadas };
}
