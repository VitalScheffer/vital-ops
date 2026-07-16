// Normalização de texto compartilhada (antes duplicada em bomFile.ts,
// baixas/planilha.ts e estoque/omieEstoque.ts).

// Faixa Unicode dos diacríticos combinantes (U+0300 a U+036F), usada para tirar
// acento depois do normalize('NFD'). Comparação numérica em vez de regex com
// caractere literal, pra não depender de como o editor grava esses bytes.
const DIACRITICO_MIN = 768;
const DIACRITICO_MAX = 879;

// Minúsculas e sem acento ("Descrição" → "descricao").
export function semAcento(s: string): string {
  return Array.from(s.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < DIACRITICO_MIN || code > DIACRITICO_MAX;
    })
    .join("")
    .toLowerCase();
}

// Chave de comparação de cabeçalho de planilha: sem acento, minúscula e só
// [a-z0-9] ("Nota Fiscal" → "notafiscal", "N.F." → "nf").
export function normalizarCabecalho(s: string): string {
  return semAcento(s).replace(/[^a-z0-9]/g, "");
}
