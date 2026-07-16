// Escolha de local de estoque POR ITEM na confirmação de uma requisição
// (opcional — sem escolha, o item herda o local do pedido). Lógica pura,
// separada da Server Action pra ser testável.

const CODIGO_LOCAL = /^\d{1,15}$/;

// Local efetivo de um item: o escolhido pra ele (se válido) ou o do pedido.
export function localEfetivo(localDoItem: unknown, localDoPedido: string): string {
  if (typeof localDoItem === "string" && CODIGO_LOCAL.test(localDoItem.trim())) {
    return localDoItem.trim();
  }
  return localDoPedido;
}

// Agrupa itens pelo local efetivo — cada grupo vira uma leitura de saldo e uma
// leva de baixa naquele local (sequencial entre grupos).
export function agruparPorLocal<T>(itens: readonly T[], localDe: (item: T) => string): Map<string, T[]> {
  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const local = localDe(item);
    const grupo = grupos.get(local);
    if (grupo) {
      grupo.push(item);
    } else {
      grupos.set(local, [item]);
    }
  }
  return grupos;
}
