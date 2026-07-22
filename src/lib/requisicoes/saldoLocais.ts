// Leitura do saldo por local na hora de reprocessar itens com falha: qual local
// consegue atender o pedido. Lógica pura, separada do componente pra ser
// testável (o componente só decide o que pintar na tela).

export interface ItemComSaldo {
  quantidade: number; // o que o item precisa
  saldos: Record<string, number>; // código do local → saldo hoje
}

// Quantos itens o local atende (saldo >= quantidade pedida). É a MESMA conta que
// `baixarEstoque` refaz antes de chamar o Omie, então o que conta aqui é o que
// deve passar na baixa.
export function itensCobertos(codigoLocal: string, itens: readonly ItemComSaldo[]): number {
  return itens.filter((item) => (item.saldos[codigoLocal] ?? 0) >= item.quantidade).length;
}

// Primeiro local que atende TODOS os itens, pra já deixar o seletor nele.
// `undefined` quando nenhum local sozinho dá conta (aí o gestor decide: escolhe
// o local por item ou resolve o saldo no Omie antes).
//
// Existe porque o default anterior (o local salvo no pedido) era justamente o
// que TINHA ACABADO DE FALHAR: abrir e clicar repetia o mesmo erro.
export function localQueCobreTudo(
  locais: readonly { codigo: string }[],
  itens: readonly ItemComSaldo[],
): string | undefined {
  if (itens.length === 0) return undefined;
  return locais.find((local) => itensCobertos(local.codigo, itens) === itens.length)?.codigo;
}
