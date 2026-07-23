import type {
  Acabamento3d,
  GrupoCatalogo,
  ProdutoCatalogo,
} from "@/lib/configurador/catalogo";
import type { EscolhasBrutas } from "@/lib/configurador/codigo";

// Ponte entre as escolhas do formulário e o modelo 3D. Puro e sem three.js de
// propósito: o que decide o que aparece na tela é testável sem navegador, e o
// componente do visualizador só obedece.
//
// O modelo é UM arquivo com todas as peças acesas. Marcar uma opção não troca
// de arquivo: apaga e acende nó (`peca:<chave>`) e troca o material das peças
// pintáveis. Por isso a resposta na tela é instantânea, sem recarregar nada.

export interface Estado3d {
  // Peças a apagar. Quem não está aqui fica visível.
  ocultas: ReadonlySet<string>;
  // Acabamento do modelo inteiro e as exceções por peça (ex.: tampo inox com o
  // resto pintado).
  acabamentoGeral: Acabamento3d;
  acabamentoPorPeca: Readonly<Record<string, Acabamento3d>>;
  // O que a combinação escolhida tem e o 3D não mostra.
  avisos: readonly AvisoModelo[];
}

export interface AvisoModelo {
  grupoRotulo: string;
  opcaoRotulo: string;
  texto: string;
}

function opcaoMarcada(grupo: GrupoCatalogo, escolhas: EscolhasBrutas) {
  const codigo = escolhas[grupo.codigo]?.opcao;
  return grupo.opcoes.find((opcao) => opcao.codigo === codigo);
}

// Um grupo "mexe no 3D" quando alguma das suas opções acende peça ou troca
// acabamento. Serve para marcar esses grupos na tela: o vendedor descobre onde
// olhar sem precisar testar opção por opção.
export function grupoMexeNo3d(grupo: GrupoCatalogo): boolean {
  return grupo.opcoes.some((opcao) => opcao.pecas3d !== undefined || opcao.acabamento3d);
}

export function estado3d(produto: ProdutoCatalogo, escolhas: EscolhasBrutas): Estado3d {
  const ocultas = new Set<string>();
  const acabamentoPorPeca: Record<string, Acabamento3d> = {};
  const avisos: AvisoModelo[] = [];
  let acabamentoGeral: Acabamento3d = "pintado";

  for (const grupo of produto.grupos) {
    const marcada = opcaoMarcada(grupo, escolhas);

    // Peças que o GRUPO controla: a união do que suas opções acendem. Fora
    // dessa união ninguém mexe — peça sem dono fica sempre visível.
    const controladas = new Set<string>();
    for (const opcao of grupo.opcoes) {
      for (const peca of opcao.pecas3d ?? []) controladas.add(peca);
    }
    for (const peca of controladas) {
      if (!marcada?.pecas3d?.includes(peca)) ocultas.add(peca);
    }

    if (marcada?.acabamento3d) {
      const { acabamento, pecas } = marcada.acabamento3d;
      if (pecas) {
        for (const peca of pecas) acabamentoPorPeca[peca] = acabamento;
      } else {
        acabamentoGeral = acabamento;
      }
    }

    if (marcada?.aviso3d) {
      avisos.push({
        grupoRotulo: grupo.rotulo,
        opcaoRotulo: marcada.rotulo,
        texto: marcada.aviso3d,
      });
    }
  }

  return { ocultas, acabamentoGeral, acabamentoPorPeca, avisos };
}

// Acabamento de uma peça: a exceção dela, se houver, senão o geral. O
// visualizador chama isto para cada nó do arquivo.
export function acabamentoDaPeca(estado: Estado3d, peca: string): Acabamento3d {
  return estado.acabamentoPorPeca[peca] ?? estado.acabamentoGeral;
}
