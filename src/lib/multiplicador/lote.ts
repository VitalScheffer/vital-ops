import { zipSync } from "fflate";

import type { ArquivoGerado } from "./celulas";

/** Empacota os arquivos processados sem mudar seus bytes ou extensões. */
export function criarZipDeResultados(arquivos: ArquivoGerado[]): Uint8Array {
  if (arquivos.length === 0) throw new Error("Não há resultados para baixar.");
  const conteudo: Record<string, Uint8Array> = {};
  for (const arquivo of arquivos) conteudo[arquivo.nome] = arquivo.bytes;
  return zipSync(conteudo, { level: 6 });
}
