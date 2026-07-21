import type { ConfiguracaoStatus } from "@/lib/contracts";

// Regras da fila da equipe de Projetos, puras e testáveis. As Server Actions
// chamam daqui em vez de espalhar comparação de string pelo código.

// Configuração que ainda espera resposta da equipe.
export const STATUS_ABERTOS: readonly ConfiguracaoStatus[] = ["ENVIADA", "EM_ANALISE"];

// Assumir ("estou olhando") só faz sentido no primeiro passo.
export const STATUS_ASSUMIVEL: ConfiguracaoStatus = "ENVIADA";

export function estaAberta(status: string): boolean {
  return (STATUS_ABERTOS as readonly string[]).includes(status);
}

export function podeAssumir(status: string): boolean {
  return status === STATUS_ASSUMIVEL;
}

// Cor do status, compartilhada pelas duas telas do fluxo (o vendedor vê o mesmo
// verde de "atendida" que a equipe de Projetos). Os RÓTULOS, esses sim, mudam
// por tela: o que para o vendedor é "enviada", para quem desenha é "nova".
export const CLASSE_STATUS: Record<string, string> = {
  ENVIADA: "bg-primary/10 text-primary",
  EM_ANALISE: "bg-warning-dim text-warning",
  ATENDIDA: "bg-success-dim text-success",
  RECUSADA: "bg-danger-dim text-danger",
};

export function classeStatus(status: string): string {
  return CLASSE_STATUS[status] ?? "bg-muted text-muted-foreground";
}

// O que a equipe de Projetos já respondeu para uma combinação. Serve aos dois
// lados: na fila evita redesenhar o que já tem projeto, e no configurador mostra
// ao vendedor o projeto e o recado de quem desenhou, na hora em que ele monta
// uma combinação que já foi respondida antes.
export interface RespostaConhecida {
  numero: number;
  status: string;
  projetoCad: string | null;
  nota: string | null;
  quem: string | null;
  quando: string;
}

export interface RegistroRespondido {
  codigo: string;
  numero: number;
  status: string;
  projetoCad: string | null;
  respostaNota: string | null;
  respondidoPorNome: string | null;
  respondidoQuando: string;
}

// Índice "combinação → resposta já dada". Recebe os registros do mais recente
// para o mais antigo; o primeiro de cada código ganha (a resposta mais atual
// daquela combinação). Uma consulta por página, não uma por linha.
export function mapaRespostas(
  respondidas: readonly RegistroRespondido[],
): Map<string, RespostaConhecida> {
  const mapa = new Map<string, RespostaConhecida>();
  for (const registro of respondidas) {
    if (mapa.has(registro.codigo)) {
      continue;
    }
    mapa.set(registro.codigo, {
      numero: registro.numero,
      status: registro.status,
      projetoCad: registro.projetoCad,
      nota: registro.respostaNota,
      quem: registro.respondidoPorNome,
      quando: registro.respondidoQuando,
    });
  }
  return mapa;
}

// A resposta só serve de atalho para não redesenhar quando ela de fato virou
// projeto: recusada não tem desenho para reaproveitar.
export function temProjetoParaReusar(resposta: RespostaConhecida | undefined): boolean {
  return Boolean(resposta && resposta.status === "ATENDIDA" && resposta.projetoCad);
}
