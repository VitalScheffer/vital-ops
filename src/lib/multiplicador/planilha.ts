import * as XLSX from "xlsx";

import {
  localizarColunas,
  multiplicarNumero,
  validarColunasSelecionadas,
  type ArquivoGerado,
  type OpcoesMultiplicacao,
} from "./celulas";

const MAX_LINHAS_CABECALHO = 20;

function extensao(nome: string): "xlsx" | "xls" | "csv" {
  const ext = nome.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls" || ext === "csv") return ext;
  throw new Error("Formato de planilha não suportado. Use XLS, XLSX ou CSV.");
}

function nomeMultiplicado(nome: string): string {
  const ponto = nome.lastIndexOf(".");
  return ponto > 0 ? `${nome.slice(0, ponto)}-multiplicado${nome.slice(ponto)}` : `${nome}-multiplicado`;
}

function multiplicarAba(sheet: XLSX.WorkSheet, opcoes: OpcoesMultiplicacao): boolean {
  const ref = sheet["!ref"];
  if (!ref) return false;
  const range = XLSX.utils.decode_range(ref);
  const ultimaCabecalho = Math.min(range.e.r, range.s.r + MAX_LINHAS_CABECALHO - 1);

  for (let linha = range.s.r; linha <= ultimaCabecalho; linha++) {
    const cabecalho = Array.from({ length: range.e.c - range.s.c + 1 }, (_, indice) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: linha, c: range.s.c + indice })];
      return cell?.v ?? "";
    });
    const colunas = localizarColunas(cabecalho);
    if (colunas.quantidade < 0 && colunas.peso < 0) continue;
    validarColunasSelecionadas(colunas, opcoes);

    for (let r = linha + 1; r <= range.e.r; r++) {
      for (const coluna of [
        opcoes.quantidade ? colunas.quantidade : -1,
        opcoes.peso ? colunas.peso : -1,
      ]) {
        if (coluna < 0) continue;
        const endereco = XLSX.utils.encode_cell({ r, c: range.s.c + coluna });
        const cell = sheet[endereco];
        if (!cell || cell.v === "" || cell.v === null || cell.v === undefined) continue;
        cell.v = multiplicarNumero(cell.v, opcoes.fator);
        cell.t = "n";
        delete cell.w;
      }
    }
    return true;
  }
  return false;
}

export async function multiplicarPlanilha(file: File, opcoes: OpcoesMultiplicacao): Promise<ArquivoGerado> {
  const tipo = extensao(file.name);
  const workbook = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const alterou = workbook.SheetNames.some((nome) => multiplicarAba(workbook.Sheets[nome], opcoes));
  if (!alterou) throw new Error("Não encontrei cabeçalho de BOM com QTD ou PESO nesta planilha.");

  const bytes = XLSX.write(workbook, { bookType: tipo, type: "array" }) as ArrayBuffer;
  const mime =
    tipo === "csv"
      ? "text/csv;charset=utf-8"
      : tipo === "xls"
        ? "application/vnd.ms-excel"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return { nome: nomeMultiplicado(file.name), bytes: new Uint8Array(bytes), mime };
}
