export type Familia =
  | "COM - COMPONENTES"
  | "SBM - SUBMONTAGEM"
  | "PCF - PEÇAS FABRICADAS"
  | "PCA - PEÇAS ACABADAS";

export interface BomRow {
  linha: number;
  numero: string;
  peca: string;
  quantidade: number | null;
}

export interface ParsedItem {
  linha: number;
  raw: string;
  codigo: string;
  descricaoProduto: string;
  familia: Familia | null;
  status: "novo" | "duplicado" | "erro";
  motivoErro?: string;
}

export interface ParseResult {
  itens: ParsedItem[];
  novos: ParsedItem[];
  duplicados: ParsedItem[];
  erros: ParsedItem[];
}

// Relação pai→filho da estrutura (aba Omie_Produtos_Estrutura), derivada da
// numeração hierárquica da coluna Nº da BOM (ex.: pai "1" -> filhos "1.1", "1.2").
export interface EstruturaRel {
  numeroPai: string;
  numeroFilho: string;
  codigoPai: string;
  codigoFilho: string;
  descricaoFilho: string;
  quantidade: number | null;
}
