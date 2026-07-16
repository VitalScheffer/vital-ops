// Relatório de requisições (PDF): parte PURA — transforma os dados numa lista
// de linhas tipadas que o gerador de PDF só desenha. Assim o conteúdo do
// relatório é testável sem abrir PDF.

import { formatarNumeroRequisicao } from "@/lib/contracts";

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

export interface LinhaRelatorio {
  texto: string;
  estilo: "titulo" | "subtitulo" | "secao" | "normal" | "detalhe";
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

function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function quantidadeTexto(quantidade: number): string {
  return quantidade.toLocaleString("pt-BR");
}

// Monta as linhas do relatório: cabeçalho com período e totais, depois um
// bloco por requisição (ordem de número) com os itens.
export function montarLinhasRelatorio(
  requisicoes: readonly RequisicaoRelatorio[],
  periodo: { de: string; ate: string }, // já formatado dd/mm/aaaa
  geradoEm: string,
): LinhaRelatorio[] {
  const linhas: LinhaRelatorio[] = [];
  linhas.push({ texto: "Relatório de Requisições — Vital Ops", estilo: "titulo" });
  linhas.push({ texto: `Período: ${periodo.de} a ${periodo.ate} · Gerado em ${geradoEm}`, estilo: "subtitulo" });

  const total = requisicoes.length;
  const aprovadas = requisicoes.filter((r) => r.status === "CONFIRMADA").length;
  const recusadas = requisicoes.filter((r) => r.status === "RECUSADA").length;
  const pendentes = total - aprovadas - recusadas;
  linhas.push({
    texto: `Total: ${total} pedido(s) — ${aprovadas} aprovado(s), ${recusadas} recusado(s), ${pendentes} aguardando`,
    estilo: "subtitulo",
  });
  linhas.push({ texto: "", estilo: "normal" });

  if (total === 0) {
    linhas.push({ texto: "Nenhuma requisição no período.", estilo: "normal" });
    return linhas;
  }

  for (const req of requisicoes) {
    linhas.push({
      texto: `${formatarNumeroRequisicao(req.numero)} — ${statusLabel(req.status)}`,
      estilo: "secao",
    });
    linhas.push({
      texto: `Solicitante: ${req.solicitanteNome} · Setor: ${req.setor} · Pedido em ${req.criadoEm}`,
      estilo: "normal",
    });
    if (req.status !== "PENDENTE") {
      const partes = [
        `${req.status === "CONFIRMADA" ? "Aprovada" : "Recusada"}${req.gestor ? ` por ${req.gestor}` : ""}`,
      ];
      if (req.decididaEm) partes.push(`em ${req.decididaEm}`);
      if (req.status === "CONFIRMADA" && req.localEstoqueNome) partes.push(`— baixa no local ${req.localEstoqueNome}`);
      if (req.motivoDecisao) partes.push(`— motivo: ${req.motivoDecisao}`);
      linhas.push({ texto: partes.join(" "), estilo: "normal" });
    }
    for (const item of req.itens) {
      const situacao = ITEM_STATUS_LABEL[item.status] ?? item.status;
      const erro = item.status === "FALHA" && item.motivoErro ? ` (${item.motivoErro})` : "";
      linhas.push({
        texto: `• ${item.sku} — ${item.descricao} — qtd ${quantidadeTexto(item.quantidade)} — ${situacao}${erro}`,
        estilo: "detalhe",
      });
    }
    linhas.push({ texto: "", estilo: "normal" });
  }

  return linhas;
}
