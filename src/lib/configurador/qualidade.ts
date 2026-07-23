// Nível de qualidade do modelo 3D. É escolha do vendedor (e o cliente também
// pode trocar): "Padrão" é o mais leve e o que vale quando nada foi escolhido;
// "Alta" e "Máxima" acendem luz, sombra e acabamento a mais.
//
// Só o TIPO e a lista moram aqui — o que cada nível faz no three (exposição,
// luzes, sombra, oclusão) fica no `Visualizador3D`, porque é específico do
// renderizador. Aqui é o que a URL, os botões e a página compartilham.

export type Qualidade = "padrao" | "alta" | "maxima";

export const QUALIDADE_PADRAO: Qualidade = "padrao";

export interface OpcaoQualidade {
  chave: Qualidade;
  rotulo: string;
  descricao: string;
}

export const QUALIDADES: readonly OpcaoQualidade[] = [
  { chave: "padrao", rotulo: "Padrão", descricao: "Mais leve" },
  { chave: "alta", rotulo: "Alta", descricao: "Luz e sombra" },
  { chave: "maxima", rotulo: "Máxima", descricao: "Melhor acabamento" },
];

export function ehQualidade(valor: unknown): valor is Qualidade {
  return valor === "padrao" || valor === "alta" || valor === "maxima";
}

// Aceita o que vier da URL (string, lista ou nada) e devolve um nível válido,
// caindo no padrão quando não reconhece.
export function qualidadeDaUrl(valor: string | string[] | undefined | null): Qualidade {
  const bruto = Array.isArray(valor) ? valor[0] : valor;
  return ehQualidade(bruto) ? bruto : QUALIDADE_PADRAO;
}
