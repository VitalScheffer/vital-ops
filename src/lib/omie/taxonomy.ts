// Classificação de resposta do Omie por parse do `faultstring`
// (portado do nextstep/apps/omie/taxonomy.py).
//
// O `faultcode` varia por operação (5113/105/202 são todos "não encontrei"),
// então o sinal estável é o texto — casado por palavra-chave normalizada
// (casefold + sem acento), ignorando o valor interpolado entre [...].
// Faultstring não reconhecido é ERROR e é logado em WARNING.

export enum Category {
  OK = "ok",
  EMPTY = "empty", // lista sem registros
  NOT_FOUND = "not_found", // registro específico não cadastrado
  BLOCKED = "blocked", // consumo indevido / API bloqueada
  DUPLICATE = "duplicate", // já cadastrado (idempotência de escrita)
  DESCRIPTION_CONFLICT = "description_conflict", // descrição já usada por OUTRO código
  CODE_CONFLICT = "code_conflict", // código já usado por OUTRO id interno
  TRANSIENT = "transient", // resposta quebrada do app server (BG) — retryable
  REDUNDANT = "redundant", // req idêntica <60s — espera curta e tenta de novo
  ERROR = "error", // validação / fatal / desconhecido
}

// Categorias que o caller recebe como resultado vazio (não exceção).
export const EMPTY_LIKE = [Category.EMPTY, Category.NOT_FOUND] as const;

// Categorias que contam como fault pro breaker (o Omie conta vazio também).
export const FAULT_LIKE = [
  Category.EMPTY,
  Category.NOT_FOUND,
  Category.BLOCKED,
  Category.DESCRIPTION_CONFLICT,
  Category.CODE_CONFLICT,
  Category.TRANSIENT,
  Category.REDUNDANT,
  Category.ERROR,
] as const;

export interface WarnLogger {
  warn(message: string): void;
}

// casefold + remove acentos → 'Não existem' e 'nao existem' batem igual.
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Ordem importa: padrões mais específicos primeiro. REDUNDANT antes de BLOCKED
// (a redundância também menciona "consumo", mas é "consumo redundante").
const REGISTRY: ReadonlyArray<[Category, RegExp]> = [
  [Category.REDUNDANT, /consumo redundante|redundant/],
  [Category.BLOCKED, /consumo indevido|bloquead/],
  [Category.TRANSIENT, /broken response|soap-error/],
  [Category.DUPLICATE, /ja cadastrad|ja existe/],
  [Category.DESCRIPTION_CONFLICT, /descricao informada ja esta sendo utilizada/],
  [Category.CODE_CONFLICT, /informado ja esta sendo utilizado pelo produto com id/],
  [Category.EMPTY, /nao existem registros/],
  [Category.NOT_FOUND, /nao cadastrad. para o codigo/],
];

const RETRY_AFTER = /(\d+)\s*segundos/;

// Resposta quebrada do app server costuma vir como corpo não-JSON — esta
// checagem deixa o caller tratar isso como transitório (retryable).
export function looksTransient(text: string): boolean {
  const msg = normalize(text);
  return msg.includes("broken response") || msg.includes("soap-error");
}

// Extrai os segundos de espera da mensagem ("Tente novamente em N segundos",
// "Aguarde N segundos"). null se não houver número.
export function parseRetryAfter(faultstring: string): number | null {
  const match = RETRY_AFTER.exec(normalize(faultstring));
  return match ? Number(match[1]) : null;
}

// Mapeia um faultstring pra uma categoria. Desconhecido → ERROR + WARNING.
export function classifyFault(faultstring: string, logger: WarnLogger = console): Category {
  const msg = normalize(faultstring);
  for (const [category, pattern] of REGISTRY) {
    if (pattern.test(msg)) {
      return category;
    }
  }
  logger.warn(`omie faultstring não reconhecido: ${faultstring}`);
  return Category.ERROR;
}
