// Planilha de baixa de estoque (matéria-prima MAT): modelo pra download e
// leitura/parse do arquivo preenchido. Roda no NAVEGADOR (mesma abordagem do
// módulo Produtos: o servidor não recebe o arquivo, só as linhas já parseadas).

import * as XLSX from "xlsx";

import type { BaixaLinha } from "@/lib/contracts";
import { normalizarCabecalho } from "@/lib/texto";

// Cabeçalhos do modelo oficial. O parser é tolerante (reconhece variações e
// qualquer ordem de colunas), mas o modelo é o caminho feliz.
export const COLUNAS_MODELO = [
  "Produto (código Omie)",
  "Quantidade",
  "Pedido",
  "Nota Fiscal",
  "OP",
  "Solicitante",
  "Observação (finalidade / motivo)",
] as const;

const LINHA_EXEMPLO = ["MAT 001 EXEMPLO", 2, "PED-123", "NF 456", "OP-789", "Fulano da Silva", "Consumo na produção"];

// Bytes de um .xlsx novo com o cabeçalho do modelo + uma linha de exemplo.
export function gerarModeloXlsx(): Uint8Array {
  const ws = XLSX.utils.aoa_to_sheet([[...COLUNAS_MODELO], LINHA_EXEMPLO]);
  ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 24 }, { wch: 32 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Baixa");
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

const MAX_LINHAS_PROCURA_CABECALHO = 10;

interface Colunas {
  sku: number;
  quantidade: number;
  pedido: number;
  notaFiscal: number;
  op: number;
  solicitante: number;
  observacao: number;
}

function acharColunas(linha: string[]): Colunas | null {
  const sku = linha.findIndex(
    (c) => c.includes("produto") || c.includes("codigo") || c === "sku" || c === "material",
  );
  const quantidade = linha.findIndex((c) => c.includes("quantidade") || c.startsWith("qtd") || c.startsWith("quant"));
  if (sku === -1 || quantidade === -1) return null;
  return {
    sku,
    quantidade,
    pedido: linha.findIndex((c) => c.includes("pedido")),
    notaFiscal: linha.findIndex((c) => c.includes("notafiscal") || c === "nf" || c === "nota"),
    op: linha.findIndex((c) => c === "op" || c.includes("ordemdeproducao") || c.includes("ordemproducao")),
    solicitante: linha.findIndex((c) => c.includes("solicit") || c.includes("quempediu")),
    observacao: linha.findIndex(
      (c) => c.includes("observacao") || c.includes("finalidade") || c.includes("motivo") || c === "obs",
    ),
  };
}

function celulaTexto(linha: unknown[], idx: number): string | undefined {
  if (idx < 0) return undefined;
  const valor = String(linha[idx] ?? "").trim();
  return valor.length > 0 ? valor : undefined;
}

export interface PlanilhaBaixa {
  linhas: BaixaLinha[];
  // Problemas por linha (nº da linha no Excel + motivo) — mostrados pro usuário
  // corrigir na planilha; as linhas boas seguem o fluxo normalmente.
  erros: string[];
}

// Extrai a grade de células de um .xlsx/.xls (primeira aba).
function lerGrade(bytes: Uint8Array): unknown[][] {
  const wb = XLSX.read(bytes, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) {
    throw new Error("A planilha está vazia (nenhuma aba encontrada).");
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
}

/** Lê a planilha de baixa preenchida e devolve as linhas + erros de preenchimento. */
export async function lerPlanilhaBaixa(file: File): Promise<PlanilhaBaixa> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let grade: unknown[][];
  try {
    grade = lerGrade(bytes);
  } catch (erro) {
    if (erro instanceof Error && erro.message.includes("vazia")) throw erro;
    throw new Error(
      "Não consegui ler esta planilha. Confira se é um Excel (.xlsx ou .xls) válido — baixe o modelo na tela se precisar.",
    );
  }

  let colunas: Colunas | null = null;
  let linhaCabecalho = -1;
  for (let r = 0; r < Math.min(grade.length, MAX_LINHAS_PROCURA_CABECALHO); r++) {
    const normalizada = (grade[r] ?? []).map((c) => normalizarCabecalho(String(c ?? "")));
    colunas = acharColunas(normalizada);
    if (colunas) {
      linhaCabecalho = r;
      break;
    }
  }
  if (!colunas) {
    throw new Error(
      'Não encontrei as colunas "Produto (código Omie)" e "Quantidade". Baixe o modelo na tela e preencha a partir dele.',
    );
  }

  const linhas: BaixaLinha[] = [];
  const erros: string[] = [];
  for (let r = linhaCabecalho + 1; r < grade.length; r++) {
    const linha = grade[r] ?? [];
    const sku = celulaTexto(linha, colunas.sku);
    const qtdBruta = linha[colunas.quantidade];
    const temAlgo = sku || String(qtdBruta ?? "").trim();
    if (!temAlgo) continue; // linha em branco

    if (!sku) {
      erros.push(`Linha ${r + 1}: sem o código do produto.`);
      continue;
    }
    const quantidade = typeof qtdBruta === "number" ? qtdBruta : Number(String(qtdBruta).replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      erros.push(`Linha ${r + 1} (${sku}): quantidade inválida ("${String(qtdBruta)}").`);
      continue;
    }

    linhas.push({
      sku,
      quantidade,
      pedido: celulaTexto(linha, colunas.pedido),
      notaFiscal: celulaTexto(linha, colunas.notaFiscal),
      op: celulaTexto(linha, colunas.op),
      solicitante: celulaTexto(linha, colunas.solicitante),
      observacao: celulaTexto(linha, colunas.observacao),
    });
  }

  return { linhas, erros };
}
