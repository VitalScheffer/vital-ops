import type { EstruturaRel, ParsedItem } from "@/lib/bom/types";

export interface RevisaoDetectada {
  codigo: string;
  revisao: string;
  descricao: string;
  linha: number | null;
}

const MARCADOR_REVISAO = /^Revis(?:ão|ao)\s+R\d*$/i;

export function normalizarRevisao(revisao: string): string {
  return revisao.trim().toUpperCase();
}

/**
 * Mantém a observação manual e troca apenas o marcador que o VitalOps gerencia.
 * O texto final é deliberadamente curto para caber na observação da malha do Omie.
 */
export function observacaoComRevisao(observacao: unknown, revisao?: string): string {
  const partes = String(observacao ?? "")
    .split(/\s*·\s*/)
    .map((parte) => parte.trim())
    .filter(Boolean)
    .filter((parte) => !MARCADOR_REVISAO.test(parte));

  if (revisao?.trim()) partes.unshift(`Revisão ${normalizarRevisao(revisao)}`);
  return partes.join(" · ");
}

/** Lista única de produto/revisão, preservando a ordem em que aparece na BOM. */
export function revisoesDaBOM(itens: ParsedItem[]): RevisaoDetectada[] {
  const vistas = new Set<string>();
  const resultado: RevisaoDetectada[] = [];

  for (const item of itens) {
    if (!item.revisao) continue;
    const revisao = normalizarRevisao(item.revisao);
    const chave = `${item.codigo}\u0000${revisao}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push({
      codigo: item.codigo,
      revisao,
      descricao: item.descricaoProduto,
      linha: item.linha,
    });
  }

  return resultado;
}

/**
 * Junta produto e estrutura porque o produto pode estar duplicado no Omie e,
 * por isso, desmarcado na tabela, enquanto a relação dele ainda é enviada.
 */
export function revisoesDaEntrada(itens: ParsedItem[], estrutura: EstruturaRel[]): RevisaoDetectada[] {
  const resultado = revisoesDaBOM(itens);
  const vistas = new Set(resultado.map((item) => `${item.codigo}\u0000${item.revisao}`));

  for (const relacao of estrutura) {
    if (!relacao.revisao) continue;
    const revisao = normalizarRevisao(relacao.revisao);
    const chave = `${relacao.codigoFilho}\u0000${revisao}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    resultado.push({
      codigo: relacao.codigoFilho,
      revisao,
      descricao: relacao.descricaoFilho,
      linha: null,
    });
  }

  return resultado;
}
