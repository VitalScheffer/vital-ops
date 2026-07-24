// Contexto técnico de um report ERRO_SISTEMA (o que vai no `Report.contexto`).
//
// O boundary só tinha a mensagem, e mensagem de erro de browser raramente diz
// ONDE quebrou: um "Failed to construct 'Image'" custou uma investigação inteira
// para virar "faltava o import". O stack resolve isso em segundos.
//
// `type` e não `interface` de propósito: o Prisma exige que o valor de um campo
// Json case com `InputJsonObject`, e só o type alias ganha a assinatura de
// índice implícita que esse encaixe pede.
export type ContextoErro = {
  // Quantas vezes o MESMO erro caiu na mesma tela dentro da janela de dedupe.
  ocorrencias: number;
  // `digest` só existe quando o erro veio do servidor (Server Component).
  digest?: string;
  stack?: string;
  // Só a partir da 2ª ocorrência: quando o erro repetiu pela última vez.
  ultimaEm?: string;
};

// Erro repetido é quase sempre o MESMO episódio: o error boundary remonta (Fast
// Refresh, "Tentar de novo", re-render) e registra de novo. Foi o que gerou 6
// cards idênticos em 4 segundos. Dentro desta janela o repetido vira contador no
// report que já está aberto, em vez de card novo.
export const JANELA_DEDUPE_MS = 10 * 60 * 1000;

// Teto de erros DISTINTOS registrados por janela. O dedupe acima resolve o mesmo
// erro repetido; este resolve o caso de alguém variar a mensagem de propósito
// para criar registro sem fim (a ação de registro não exige sessão). Uma hora de
// operação normal não chega perto de 50 erros diferentes: se chegar, o problema
// é grande demais para depender do 51º card.
export const MAX_ERROS_POR_JANELA = 50;
export const JANELA_CAP_MS = 60 * 60 * 1000;

// O stack de produção vem minificado, mas chunk e linha ainda localizam o
// arquivo pelo source map. Cortado para não virar despejo de log no banco.
const MAX_STACK = 4000;

// Lê um `contexto` vindo do banco (Json, então pode ser qualquer coisa) de volta
// para o formato conhecido. Report antigo não tem `ocorrencias`: conta como 1.
export function lerContextoErro(valor: unknown): ContextoErro {
  const bruto =
    valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {};

  const ocorrencias =
    typeof bruto.ocorrencias === "number" && Number.isFinite(bruto.ocorrencias)
      ? Math.max(1, Math.floor(bruto.ocorrencias))
      : 1;

  return {
    ocorrencias,
    ...(typeof bruto.digest === "string" ? { digest: bruto.digest } : {}),
    ...(typeof bruto.stack === "string" ? { stack: bruto.stack } : {}),
    ...(typeof bruto.ultimaEm === "string" ? { ultimaEm: bruto.ultimaEm } : {}),
  };
}

// Contexto de um erro visto pela primeira vez.
export function contextoErroInicial(entrada: { digest?: string; stack?: string }): ContextoErro {
  return {
    ocorrencias: 1,
    ...(entrada.digest ? { digest: entrada.digest } : {}),
    ...(entrada.stack ? { stack: entrada.stack.slice(0, MAX_STACK) } : {}),
  };
}

// Mesma coisa acontecendo de novo: soma a ocorrência e guarda o stack se o
// report antigo não tinha (report gravado antes desta mudança, por exemplo).
export function contextoErroRepetido(
  anterior: unknown,
  entrada: { stack?: string },
  quando: Date,
): ContextoErro {
  const base = lerContextoErro(anterior);
  return {
    ...base,
    ...(base.stack || !entrada.stack ? {} : { stack: entrada.stack.slice(0, MAX_STACK) }),
    ocorrencias: base.ocorrencias + 1,
    ultimaEm: quando.toISOString(),
  };
}
