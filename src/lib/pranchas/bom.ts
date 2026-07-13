import { lerBomDeArquivo } from "@/lib/bom/bomFile";

import { extractCodes, parseCodeFromFileName, type DrawingCode } from "./codes";
import { extrairTextoPdf } from "./pdf";

export interface CodigosDoBom {
  codes: DrawingCode[];
  // Chave de família do próprio conjunto (derivada do nome do arquivo do BOM),
  // para a opção de incluir a prancha da montagem. null se o nome não tiver código.
  parentKey: string | null;
}

/**
 * Lê o arquivo principal (BOM) e devolve os códigos de desenho na ordem em que
 * aparecem. Aceita o PDF do conjunto (padrão) ou a planilha .xls/.xlsx exportada
 * do CAD (mesmo leitor do módulo Produtos).
 */
export async function lerCodigosDoBom(file: File): Promise<CodigosDoBom> {
  const nome = file.name.toLowerCase();
  let texto: string;

  if (nome.endsWith(".pdf")) {
    texto = await extrairTextoPdf(file);
  } else {
    const rows = await lerBomDeArquivo(file);
    texto = rows.map((r) => `${r.numero} ${r.peca} ${r.quantidade ?? ""}`).join(" \n ");
  }

  const parent = parseCodeFromFileName(file.name);
  return { codes: extractCodes(texto), parentKey: parent?.key ?? null };
}
