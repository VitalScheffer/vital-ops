import type { ProdutoCatalogo } from "@/lib/configurador/catalogo";
import {
  escolhasDeSelecoes,
  rotuloDaSelecao,
  type EscolhaBruta,
  type SelecaoResolvida,
} from "@/lib/configurador/codigo";
import { formatarDataHora } from "@/lib/datas";

// Histórico do configurador: as configurações já enviadas, prontas para serem
// repetidas com um clique. Agrupado por CÓDIGO (a identidade da combinação), não
// por registro — se a mesma maca foi pedida cinco vezes, ela aparece uma vez só,
// com a contagem. É isso que responde "é a mesma configuração, só puxa do
// histórico" sem transformar a lista num paredão de repetidos.

export interface RegistroHistorico {
  numero: number;
  codigo: string;
  produtoSlug: string;
  selecoes: unknown;
  observacoes: string | null;
  autorNome: string;
  criadoEm: Date;
}

export interface ItemHistorico {
  codigo: string;
  numero: number; // o envio mais recente com esta combinação
  vezes: number;
  autorNome: string;
  quando: string;
  desvios: string[];
  observacoes: string;
  // Já no formato do formulário: clicar em "Usar" é só jogar isto no estado.
  escolhas: Record<string, EscolhaBruta>;
}

export function desviosDoSnapshot(selecoes: unknown): SelecaoResolvida[] {
  if (!Array.isArray(selecoes)) {
    return [];
  }
  return (selecoes as SelecaoResolvida[]).filter((selecao) => selecao && selecao.padrao === false);
}

// `registros` precisa vir do mais recente para o mais antigo: o primeiro de cada
// código é o que vira o item (data e observações mais recentes daquela combinação).
export function montarHistorico(
  produto: ProdutoCatalogo,
  registros: readonly RegistroHistorico[],
  limite = 6,
): ItemHistorico[] {
  const porCodigo = new Map<string, ItemHistorico>();

  for (const registro of registros) {
    if (registro.produtoSlug !== produto.slug) {
      continue;
    }

    const existente = porCodigo.get(registro.codigo);
    if (existente) {
      existente.vezes += 1;
      continue;
    }

    porCodigo.set(registro.codigo, {
      codigo: registro.codigo,
      numero: registro.numero,
      vezes: 1,
      autorNome: registro.autorNome,
      quando: formatarDataHora(registro.criadoEm),
      desvios: desviosDoSnapshot(registro.selecoes).map(rotuloDaSelecao),
      observacoes: registro.observacoes ?? "",
      escolhas: escolhasDeSelecoes(produto, registro.selecoes),
    });
  }

  return [...porCodigo.values()].slice(0, limite);
}
