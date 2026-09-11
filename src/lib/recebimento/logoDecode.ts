import { LOGO_VITAL_SCHEFFER_HEADER_PNG_BASE64 } from "./logoHeaderAsset";
import { LOGO_VITAL_SCHEFFER_SPREADSHEET_PNG_BASE64 } from "./logoSpreadsheetAsset";

export const LOGO_HEADER = {
  largura: 840,
  altura: 384,
  wordmarkX: 320,
  baseWordmarkY: 351,
} as const;

export const LOGO_PLANILHA = {
  largura: 159,
  altura: 123,
} as const;

// `atob` existe tanto no navegador quanto no Node (>=16) — evita depender de
// `Buffer`, que não existe no bundle client sem polyfill.
function decodificarPng(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return bytes;
}

export function logoVitalSchefferHeaderPng(): Uint8Array {
  return decodificarPng(LOGO_VITAL_SCHEFFER_HEADER_PNG_BASE64);
}

export function logoVitalSchefferPlanilhaPng(): Uint8Array {
  return decodificarPng(LOGO_VITAL_SCHEFFER_SPREADSHEET_PNG_BASE64);
}
