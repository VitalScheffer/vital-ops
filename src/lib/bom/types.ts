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
  // Massa UNITÁRIA da peça (coluna "Peso" do modelo do CAD). A planilha não diz a
  // unidade: o CAD exporta em gramas, mas o usuário escolhe g/kg na tela porque
  // nada no arquivo garante isso. Nas linhas de submontagem o CAD grava a soma
  // dos filhos (peso × QTD), então só usamos o peso das PEÇAS.
  peso: number | null;
  // Especificação da matéria-prima (coluna "DESCRIÇÃO" do modelo do CAD):
  // "TUBO QUAD 25,00x25,00x1,20mm", "# 3,0000", "TREF. Ø6,25".
  especificacao: string;
}

// Unidade em que a coluna "Peso" da BOM foi exportada. O Omie sempre recebe KG
// (é a unidade dos cadastros MAT), então "g" divide por mil na conversão.
export type UnidadePeso = "g" | "kg";

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

// De onde veio uma relação pai→filho:
//   "bom"   — numeração hierárquica da coluna Nº (pai "1" -> filhos "1.1", "1.2");
//   "raiz"  — a MONTAGEM já cadastrada no Omie recebendo as linhas de nível topo;
//   "mp"    — a matéria-prima que uma PEÇA consome (quantidade em KG).
export type OrigemEstrutura = "bom" | "raiz" | "mp";

// Relação pai→filho da estrutura (aba Omie_Produtos_Estrutura). `numeroFilho` é a
// CHAVE da relação dentro do import (o resultado do envio é casado por ele no
// banco), então precisa ser único: a raiz reusa o número da linha de topo e a
// matéria-prima usa o sufixo ".MP" do número da peça.
export interface EstruturaRel {
  numeroPai: string;
  numeroFilho: string;
  codigoPai: string;
  codigoFilho: string;
  descricaoFilho: string;
  quantidade: number | null;
  origem: OrigemEstrutura;
}
