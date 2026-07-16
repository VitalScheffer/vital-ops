import { listarLocaisEstoque, type LocalEstoque } from "@/lib/estoque/omieEstoque";
import { chamar } from "@/lib/omie";

// Locais de estoque pra popular os seletores das telas (SERVER-ONLY: usa o
// client Omie real, que arrasta Prisma). Best-effort: sem credencial ou com o
// Omie fora, devolve [] e as telas escondem o seletor (a baixa cai no local
// padrão). A leitura é cacheada por 1h no OmieCache.
export async function locaisDisponiveis(): Promise<LocalEstoque[]> {
  if (!process.env.OMIE_APP_KEY || !process.env.OMIE_APP_SECRET) {
    return [];
  }
  try {
    return await listarLocaisEstoque(chamar);
  } catch {
    return [];
  }
}
