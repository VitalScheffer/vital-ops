// Relatório de requisições (PDF): parte PURA — rótulos e totais, testáveis sem
// abrir PDF. O desenho (layout, marca, tabelas) fica em relatorioPdf.ts, que
// consome os dados estruturados (RequisicaoRelatorio[]) direto.

export interface ItemRelatorio {
  sku: string;
  descricao: string;
  quantidade: number;
  unidade?: string | null; // KG, M3, UN... (cadastro do Omie; null nos itens antigos)
  status: string; // PENDENTE | BAIXADO | FALHA
  motivoErro?: string | null;
}

export interface RequisicaoRelatorio {
  numero: number;
  status: string; // PENDENTE | CONFIRMADA | RECUSADA (a decisão, mesmo se excluída)
  solicitanteNome: string;
  setor: string;
  criadoEm: string; // já formatado (dd/mm/aaaa hh:mm)
  gestor?: string | null;
  decididaEm?: string | null;
  motivoDecisao?: string | null;
  localEstoqueNome?: string | null;
  // Excluída pelo gestor (soft delete) — independe do status da decisão.
  cancelada?: boolean;
  canceladaPor?: string | null;
  canceladaEm?: string | null;
  motivoCancelamento?: string | null;
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

// Quantidade com a unidade do Omie ao lado (ex.: "1.500 KG"). Sem unidade
// cadastrada, sai só o número.
export function quantidadeComUnidade(quantidade: number, unidade?: string | null): string {
  const numero = quantidadeTexto(quantidade);
  const un = unidade?.trim();
  return un ? `${numero} ${un}` : numero;
}

export interface ResumoRelatorio {
  total: number;
  aprovadas: number;
  recusadas: number;
  excluidas: number;
  pendentes: number;
}

// Totais por bucket EXCLUSIVO (somam o total): excluída conta como excluída,
// independente da decisão que tinha antes; o "aguardando" é o que sobra —
// cobre qualquer status novo.
export function resumoRelatorio(requisicoes: readonly RequisicaoRelatorio[]): ResumoRelatorio {
  const total = requisicoes.length;
  const vivas = requisicoes.filter((r) => !r.cancelada);
  const aprovadas = vivas.filter((r) => r.status === "CONFIRMADA").length;
  const recusadas = vivas.filter((r) => r.status === "RECUSADA").length;
  const excluidas = total - vivas.length;
  return { total, aprovadas, recusadas, excluidas, pendentes: total - aprovadas - recusadas - excluidas };
}
