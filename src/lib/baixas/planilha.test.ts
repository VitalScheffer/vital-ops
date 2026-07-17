import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import { COLUNAS_MODELO, gerarModeloXlsx, lerPlanilhaBaixa } from "./planilha";

function arquivoDe(aoa: unknown[][], nome = "baixa.xlsx"): File {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Baixa");
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new File([bytes], nome, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("lerPlanilhaBaixa", () => {
  it("lê o modelo oficial (todas as colunas, qualquer linha em branco ignorada)", async () => {
    const file = arquivoDe([
      [...COLUNAS_MODELO],
      ["MAT 001", 2, "PED-1", "NF 10", "OP-5", "Fulano"],
      ["", "", "", "", "", ""],
      ["MAT 002", 1.5, "", "", "", ""],
    ]);
    const { linhas, erros } = await lerPlanilhaBaixa(file);
    expect(erros).toEqual([]);
    expect(linhas).toEqual([
      { sku: "MAT 001", quantidade: 2, pedido: "PED-1", notaFiscal: "NF 10", op: "OP-5", solicitante: "Fulano" },
      { sku: "MAT 002", quantidade: 1.5, pedido: undefined, notaFiscal: undefined, op: undefined, solicitante: undefined },
    ]);
  });

  it("lê a coluna Observação (finalidade/motivo) e reconhece variações do cabeçalho", async () => {
    const modelo = arquivoDe([
      [...COLUNAS_MODELO],
      ["MAT 001", 2, "", "", "", "", "Consumo na produção"],
    ]);
    const { linhas } = await lerPlanilhaBaixa(modelo);
    expect(linhas[0].observacao).toBe("Consumo na produção");

    const variacao = arquivoDe([
      ["SKU", "Qtd", "Finalidade"],
      ["MAT 002", 1, "Manutenção"],
    ]);
    const { linhas: outras } = await lerPlanilhaBaixa(variacao);
    expect(outras[0].observacao).toBe("Manutenção");
  });

  it("reconhece variações de cabeçalho (SKU/Qtd/N.F.) em qualquer ordem", async () => {
    const file = arquivoDe([
      ["Qtd", "SKU", "N.F."],
      [3, "MAT 009", "123"],
    ]);
    const { linhas } = await lerPlanilhaBaixa(file);
    expect(linhas).toEqual([
      { sku: "MAT 009", quantidade: 3, pedido: undefined, notaFiscal: "123", op: undefined, solicitante: undefined },
    ]);
  });

  it("aceita quantidade com vírgula (1,5) como texto", async () => {
    const file = arquivoDe([
      ["Produto (código Omie)", "Quantidade"],
      ["MAT 001", "1,5"],
    ]);
    const { linhas } = await lerPlanilhaBaixa(file);
    expect(linhas[0].quantidade).toBe(1.5);
  });

  it("linha sem código ou com quantidade inválida vira erro apontando a linha do Excel", async () => {
    const file = arquivoDe([
      ["Produto (código Omie)", "Quantidade"],
      ["", 2],
      ["MAT 002", "abc"],
      ["MAT 003", 0],
      ["MAT 004", 1],
    ]);
    const { linhas, erros } = await lerPlanilhaBaixa(file);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].sku).toBe("MAT 004");
    expect(erros).toHaveLength(3);
    expect(erros[0]).toContain("Linha 2");
    expect(erros[1]).toContain("MAT 002");
    expect(erros[2]).toContain("MAT 003");
  });

  it("sem as colunas obrigatórias, explica e manda baixar o modelo", async () => {
    const file = arquivoDe([
      ["Coisa", "Outra"],
      ["x", "y"],
    ]);
    await expect(lerPlanilhaBaixa(file)).rejects.toThrow(/Baixe o modelo/);
  });

  it("o modelo gerado é lido de volta pelo próprio parser", async () => {
    const bytes = gerarModeloXlsx();
    const file = new File([bytes as BlobPart], "Modelo_Baixa_Estoque.xlsx");
    const { linhas, erros } = await lerPlanilhaBaixa(file);
    expect(erros).toEqual([]);
    expect(linhas).toHaveLength(1); // a linha de exemplo
    expect(linhas[0].sku).toBe("MAT 001 EXEMPLO");
  });
});
