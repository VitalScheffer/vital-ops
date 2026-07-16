// Formatação de data/hora para a UI, sempre no fuso da empresa (São Paulo) —
// a Vercel roda em UTC e a hora "crua" confundiria o usuário.
export function formatarDataHora(data: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(data);
}
