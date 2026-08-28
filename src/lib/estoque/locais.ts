// Escolha do local sugerido nos seletores de estoque. PURO (sem Omie, sem
// banco): serve tanto ao Server Component quanto ao componente cliente.
//
// A sugestão é por NOME, e não por código fixo, porque os ids de local são de
// cada empresa/app_key: fixar "12170621031" em código quebraria em qualquer
// outra base. Se o nome não bater, cai no local padrão, que sempre existe.

export interface LocalSelecionavel {
  codigo: string;
  descricao: string;
  padrao: boolean;
}

function semAcentoMaiusculo(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase();
}

function acharPorNome(locais: readonly LocalSelecionavel[], padrao: RegExp): string | undefined {
  return locais.find((local) => padrao.test(semAcentoMaiusculo(local.descricao)))?.codigo;
}

/** Código do local padrão da empresa (ou o primeiro da lista, ou "0"). */
export function codigoPadrao(locais: readonly LocalSelecionavel[]): string {
  return locais.find((local) => local.padrao)?.codigo ?? locais[0]?.codigo ?? "0";
}

/**
 * Origem sugerida: o estoque de matéria-prima.
 *
 * Não é enfeite. O local PADRÃO do Omie está zerado para os cadastros MAT
 * (conferido em 28/08/2026: 0 dos 92 MAT ativos têm saldo lá, contra 19 no
 * Estoque de Matéria-Prima). Abrir no padrão faria toda linha aparecer sem
 * saldo e a pessoa concluiria que a tela está quebrada.
 */
export function origemSugerida(locais: readonly LocalSelecionavel[]): string {
  return acharPorNome(locais, /MATERIA/) ?? codigoPadrao(locais);
}

/** Destino sugerido: Reservado Produção, que é o caso de uso da tela. */
export function destinoSugerido(locais: readonly LocalSelecionavel[], origem: string): string {
  const reservado = acharPorNome(locais, /RESERVADO\s+PRODU/);
  if (reservado && reservado !== origem) return reservado;
  return locais.find((local) => local.codigo !== origem)?.codigo ?? codigoPadrao(locais);
}
