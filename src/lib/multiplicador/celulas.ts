import { normalizarCabecalho } from "@/lib/texto";

export interface ColunasBom {
  quantidade: number;
  peso: number;
}

export interface OpcoesMultiplicacao {
  fator: number;
  quantidade: boolean;
  peso: boolean;
}

export interface ArquivoGerado {
  nome: string;
  bytes: Uint8Array;
  mime: string;
}

export function validarFator(fator: number): void {
  if (!Number.isFinite(fator) || fator <= 0) throw new Error("O fator precisa ser maior que zero.");
}

function ehQuantidade(cabecalho: string): boolean {
  return cabecalho.includes("qtd") || cabecalho.includes("quantidade");
}

function ehPeso(cabecalho: string): boolean {
  return (cabecalho.startsWith("peso") || cabecalho.startsWith("massa")) && !cabecalho.includes("total");
}

export function localizarColunas(cabecalho: unknown[]): ColunasBom {
  const normalizados = cabecalho.map((valor) => normalizarCabecalho(String(valor ?? "")));
  return {
    quantidade: normalizados.findIndex(ehQuantidade),
    peso: normalizados.findIndex(ehPeso),
  };
}

export function multiplicarNumero(valor: unknown, fator: number): number {
  validarFator(fator);
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) throw new Error("Encontrei um número inválido para multiplicar.");
    return valor * fator;
  }
  const texto = String(valor ?? "").trim();
  if (!texto) throw new Error("Encontrei uma célula vazia para multiplicar.");
  const normalizado = texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto;
  const numero = Number(normalizado);
  if (!Number.isFinite(numero)) throw new Error(`Não consegui multiplicar o valor "${texto}".`);
  return numero * fator;
}

export function validarColunasSelecionadas(colunas: ColunasBom, opcoes: OpcoesMultiplicacao): void {
  validarFator(opcoes.fator);
  if (!opcoes.quantidade && !opcoes.peso) throw new Error("Marque quantidade, peso ou os dois.");
  if (opcoes.quantidade && colunas.quantidade < 0) throw new Error("Não encontrei a coluna QTD/Quantidade neste arquivo.");
  if (opcoes.peso && colunas.peso < 0) throw new Error("Não encontrei a coluna PESO/Massa neste arquivo.");
}
