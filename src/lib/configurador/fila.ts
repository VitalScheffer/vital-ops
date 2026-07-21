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

export interface AtendidaAnterior {
  numero: number;
  projetoCad: string;
}

export interface RegistroAtendido {
  codigo: string;
  numero: number;
  projetoCad: string | null;
}

// Índice "combinação → projeto já desenhado", montado de uma vez a partir das
// configurações já atendidas. É o que evita a equipe redesenhar uma maca que já
// tem projeto: se o código bate, o desenho existe.
//
// Recebe os registros do mais recente para o mais antigo; o primeiro de cada
// código ganha (o projeto mais atual daquela combinação). Uma consulta a mais na
// página, em vez de uma por linha da fila.
export function mapaJaDesenhado(
  atendidas: readonly RegistroAtendido[],
): Map<string, AtendidaAnterior> {
  const mapa = new Map<string, AtendidaAnterior>();
  for (const registro of atendidas) {
    if (!registro.projetoCad || mapa.has(registro.codigo)) {
      continue;
    }
    mapa.set(registro.codigo, { numero: registro.numero, projetoCad: registro.projetoCad });
  }
  return mapa;
}
