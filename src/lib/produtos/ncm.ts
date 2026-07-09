// NCM padrão dos produtos criados no Omie.
//
// Histórico: era 9999.99.99 (neutro, pra o Fiscal corrigir por peça depois), mas
// em 07/07/2026 a SEFAZ passou a rejeitar 9999.99.99 como "NCM inexistente" na
// nota de transferência, então o padrão virou um NCM válido (9403.20.90, móveis).
// Desde 09/07/2026, o usuário pode ESCOLHER o NCM por envio na tela de produtos;
// este valor é só o default quando ele não informa nada.
export const NCM_PADRAO = "9403.20.90";

// Normaliza a entrada do usuário para o formato "XXXX.XX.XX" (com ou sem pontos).
// Se não vier com 8 dígitos, cai no padrão — nunca deixa passar um NCM malformado
// (que quebraria o cadastro no Omie ou a nota fiscal).
export function normalizarNcm(valor: string | null | undefined): string {
  const digitos = (valor ?? "").replace(/\D/g, "");
  if (digitos.length !== 8) return NCM_PADRAO;
  return `${digitos.slice(0, 4)}.${digitos.slice(4, 6)}.${digitos.slice(6, 8)}`;
}
