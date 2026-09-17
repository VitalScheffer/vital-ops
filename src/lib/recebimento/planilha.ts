// Exportação em Excel do checklist de Recebimento de NF — CLIENT-ONLY
// (exceljs no navegador). Mesmo visual do PDF (ver ./pdf.ts): faixa da marca
// no topo, uma seção por semana, um bloco por NF com seu próprio cabeçalho de
// colunas, produto a produto.

import { LOGO_PLANILHA, logoVitalSchefferPlanilhaPng } from "./logoDecode";
import { agruparPorSemana } from "./semanas";

export interface ItemRecebimentoExport {
  produto: string;
  materialRecebido: boolean;
  temOC: boolean;
  ocAprovado: boolean;
  nfeLancada: boolean;
}

export interface NotaRecebimentoExport {
  numero: string;
  fornecedor: string;
  dataEmissao: Date;
  itens: ItemRecebimentoExport[];
}

const EVENTOS = [
  { chave: "materialRecebido" as const, rotulo: "Material Recebido" },
  { chave: "temOC" as const, rotulo: "Tem OC" },
  { chave: "ocAprovado" as const, rotulo: "Ordem de Compra Aprovada" },
  { chave: "nfeLancada" as const, rotulo: "NF-e Lançada" },
];
const COL_INICIO = 2;
const COL_PRODUTO = COL_INICIO;
const COL_PRODUTO_FIM = 4;
const COL_EVENTO_INICIO = 5;
const TOTAL_COLS = COL_EVENTO_INICIO - 1 + EVENTOS.length; // Produto (3 colunas) + 4 eventos
const LARGURA_COLUNA_B = 22;
const LARGURA_COLUNA_C = 14;
const ALTURA_CABECALHO_PT = 92;

const COR = {
  petroleo: "FF0A5560",
  turquesa: "FF13B6A8",
  agua: "FF5FD0C4",
  aguaClara: "FFD4F2ED",
  tinta: "FF13262B",
  branco: "FFFFFFFF",
  cinza: "FF6B7378",
  faixaSecao: "FFEDF6F5",
  cabecalhoColuna: "FFDEE6E8",
  regua: "FFDEE6E8",
};

function dataBr(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(data);
}

export async function gerarRecebimentoXlsx(notas: readonly NotaRecebimentoExport[], geradoEm: string): Promise<Uint8Array> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Vital Ops";
  const ws = wb.addWorksheet("Recebimento", {
    pageSetup: {
      paperSize: 9, // A4
      orientation: "portrait",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
    },
  });
  ws.views = [{ showGridLines: false }];

  ws.columns = [
    { width: 5.3 },
    { width: LARGURA_COLUNA_B },
    { width: LARGURA_COLUNA_C },
    { width: 26 },
    { width: 20 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 5.3 },
  ];

  const ultimaColLetra = String.fromCharCode("A".charCodeAt(0) + TOTAL_COLS - 1);
  const primeiraColLetra = String.fromCharCode("A".charCodeAt(0) + COL_INICIO - 1);
  const mesclarLinha = (linha: number) => ws.mergeCells(`${primeiraColLetra}${linha}:${ultimaColLetra}${linha}`);
  const mesclarProduto = (linha: number) =>
    ws.mergeCells(`${primeiraColLetra}${linha}:${String.fromCharCode("A".charCodeAt(0) + COL_PRODUTO_FIM - 1)}${linha}`);

  const preencherFaixa = (linha: number, cor: string) => {
    for (let c = 1; c <= TOTAL_COLS + 1; c++) {
      ws.getCell(linha, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cor } };
    }
  };

  // Faixa da marca: logotipo (ícone + "Vital Scheffer") + "Vital Ops" (texto de
  // verdade, não faz parte da imagem) + título + data de geração.
  preencherFaixa(1, COR.petroleo);
  ws.getRow(1).height = ALTURA_CABECALHO_PT;
  ws.getRow(2).height = 14;
  ws.mergeCells("E1:H1");
  ws.getCell("E1").value = {
    richText: [
      { text: "Recebimento de NF", font: { bold: true, size: 28, color: { argb: COR.branco } } },
      { text: `\nGerado em ${geradoEm}`, font: { name: "Sora", size: 12, color: { argb: COR.aguaClara } } },
    ],
  };
  ws.getCell("E1").alignment = { vertical: "middle", horizontal: "right", indent: 2, wrapText: true };
  // A assinatura fica inteira em uma única linha na coluna C.
  ws.getCell("C1").value = "Vital Ops";
  ws.getCell("C1").font = { name: "Sora", bold: true, size: 13, color: { argb: COR.agua } };
  ws.getCell("C1").alignment = { vertical: "middle", horizontal: "left", wrapText: false };

  // A caixa transparente já incorpora o alinhamento aprovado dentro de B1.
  // A ancora inteira evita que importadores de XLSX descartem offsets fracionarios.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bytes crus; exceljs aceita Buffer/Uint8Array em runtime no navegador.
  const logoId = wb.addImage({ buffer: logoVitalSchefferPlanilhaPng() as any, extension: "png" });
  ws.addImage(logoId, {
    tl: { col: 1, row: 0 },
    ext: { width: LOGO_PLANILHA.largura, height: LOGO_PLANILHA.altura },
  });

  let linha = 3;

  if (notas.length === 0) {
    ws.getCell(linha, COL_PRODUTO).value = "Nenhuma nota registrada.";
    ws.getCell(linha, COL_PRODUTO).font = { italic: true, color: { argb: COR.cinza } };
  }

  const grupos = agruparPorSemana(notas, (nota) => nota.dataEmissao);
  for (const grupo of grupos) {
    preencherFaixa(linha, COR.faixaSecao);
    mesclarLinha(linha);
    ws.getCell(linha, COL_PRODUTO).value = grupo.rotulo;
    ws.getCell(linha, COL_PRODUTO).font = { bold: true, size: 16, color: { argb: COR.tinta } };
    ws.getCell(linha, COL_PRODUTO).alignment = { vertical: "middle", indent: 1 };
    ws.getRow(linha).height = 30;
    linha += 1;

    for (const nota of grupo.itens) {
      ws.getRow(linha).height = 24;
      ws.mergeCells(`B${linha}:F${linha}`);
      ws.getCell(linha, COL_PRODUTO).value = `NF ${nota.numero} · ${nota.fornecedor}`;
      ws.getCell(linha, COL_PRODUTO).font = { bold: true, size: 14, color: { argb: COR.petroleo } };
      ws.getCell(linha, COL_PRODUTO).alignment = { vertical: "middle" };
      ws.mergeCells(`G${linha}:H${linha}`);
      ws.getCell(linha, 7).value = dataBr(nota.dataEmissao);
      ws.getCell(linha, 7).font = { size: 12, color: { argb: COR.cinza } };
      ws.getCell(linha, 7).alignment = { horizontal: "right", vertical: "middle" };
      linha += 1;

      ws.getRow(linha).height = 22;
      preencherFaixa(linha, COR.cabecalhoColuna);
      mesclarProduto(linha);
      ws.getCell(linha, COL_PRODUTO).value = "Produto";
      ws.getCell(linha, COL_PRODUTO).font = { bold: true, size: 12, color: { argb: COR.tinta } };
      ws.getCell(linha, COL_PRODUTO).alignment = { vertical: "middle" };
      EVENTOS.forEach((evento, i) => {
        const cel = ws.getCell(linha, COL_EVENTO_INICIO + i);
        cel.value = evento.rotulo;
        cel.font = { bold: true, size: 12, color: { argb: COR.tinta } };
        cel.alignment = { horizontal: "center", vertical: "middle" };
      });
      linha += 1;

      for (const item of nota.itens) {
        ws.getRow(linha).height = 24;
        mesclarProduto(linha);
        ws.getCell(linha, COL_PRODUTO).value = item.produto;
        ws.getCell(linha, COL_PRODUTO).font = { size: 13, color: { argb: COR.tinta } };
        ws.getCell(linha, COL_PRODUTO).alignment = { vertical: "middle" };
        EVENTOS.forEach((evento, i) => {
          const cel = ws.getCell(linha, COL_EVENTO_INICIO + i);
          cel.value = item[evento.chave] ? "✓" : "";
          cel.font = { bold: true, size: 16, color: { argb: COR.turquesa } };
          cel.alignment = { horizontal: "center", vertical: "middle" };
        });
        for (let c = COL_INICIO; c <= TOTAL_COLS; c++) {
          ws.getCell(linha, c).border = { bottom: { style: "thin", color: { argb: COR.regua } } };
        }
        linha += 1;
      }
      linha += 1;
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
