import type { ChangelogEntry } from "@/lib/changelog";

// Dois sinais diferentes de "tem coisa nova no ar", de propósito:
//
// 1. VERSÃO (changelog): alguém escreveu uma novidade para o usuário. Vale
//    interromper com um modal, porque há o que contar.
// 2. BUILD (commit): subiu código, mas sem novidade escrita — correção pequena,
//    ajuste de layout. Não vale modal; vale um botão discreto no cabeçalho para
//    quem quiser pegar a correção na hora.
//
// O botão do cabeçalho também é a saída para quem fechou o modal com "Agora
// não": o aviso sai da frente, mas o caminho para atualizar continua à mão.

/** Identidade deste build, inlinada pelo `env` do next.config.ts. */
export const BUILD_ATUAL: string = process.env.NEXT_PUBLIC_BUILD ?? "dev";

export interface VersaoResponse {
  /** Versão do changelog que o servidor está publicando. */
  versao: string;
  /** Identidade do build que o servidor está servindo. */
  build: string;
  /** Entradas do changelog publicadas depois da versão que o navegador tem. */
  novidades: ChangelogEntry[];
}

export type EstadoAtualizacao =
  | { tipo: "atual" }
  /** Build diferente, sem novidade escrita: só o botão no cabeçalho. */
  | { tipo: "silenciosa"; build: string }
  /** Changelog novo: modal com o que mudou (mais o botão no cabeçalho). */
  | { tipo: "novidade"; build: string; versao: string; novidades: ChangelogEntry[] };
