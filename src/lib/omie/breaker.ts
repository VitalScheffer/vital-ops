// Circuit breaker pra não furar os 10 erros seguidos do Omie
// (portado do nextstep/apps/omie/breaker.py).
//
// Soft: N faults consecutivos → pausa curta (fail fast). Hard: o Omie devolveu
// bloqueio → fail fast pela duração informada (fallback 30min). Qualquer
// sucesso zera o contador. A lógica pura (funções abaixo) é testável sem banco;
// a persistência fica atrás de `BreakerStore`.

export const SOFT_THRESHOLD = 6;
export const SOFT_COOLDOWN_MS = 2 * 60 * 1000; // 2 min
export const HARD_BLOCK_MS = 30 * 60 * 1000; // fallback se a msg não trouxer a espera

export type BreakerEstado = "CLOSED" | "SOFT" | "HARD";

export interface BreakerState {
  estado: BreakerEstado;
  faults: number;
  cooldownUntil: Date | null;
  blockedUntil: Date | null;
}

export const INITIAL_STATE: BreakerState = {
  estado: "CLOSED",
  faults: 0,
  cooldownUntil: null,
  blockedUntil: null,
};

export interface FaultOptions {
  blocked?: boolean;
  blockedSeconds?: number | null;
}

// Instante até o qual o breaker está aberto, ou null se fechado.
export function openUntil(state: BreakerState, now: Date = new Date()): Date | null {
  const candidates = [state.cooldownUntil, state.blockedUntil].filter(
    (t): t is Date => t !== null && t.getTime() > now.getTime(),
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b));
}

// Sucesso zera faults e o cooldown soft; preserva um bloqueio hard eventual
// (que na prática já expirou, senão a chamada teria falhado rápido antes).
export function recordOk(state: BreakerState): BreakerState {
  return { ...state, estado: "CLOSED", faults: 0, cooldownUntil: null };
}

export function recordFault(
  state: BreakerState,
  options: FaultOptions = {},
  now: Date = new Date(),
): BreakerState {
  const faults = state.faults + 1;

  if (options.blocked) {
    const waitMs = options.blockedSeconds ? options.blockedSeconds * 1000 : HARD_BLOCK_MS;
    return {
      estado: "HARD",
      faults,
      cooldownUntil: state.cooldownUntil,
      blockedUntil: new Date(now.getTime() + waitMs),
    };
  }

  if (faults >= SOFT_THRESHOLD) {
    return {
      estado: "SOFT",
      faults,
      cooldownUntil: new Date(now.getTime() + SOFT_COOLDOWN_MS),
      blockedUntil: state.blockedUntil,
    };
  }

  return { estado: "CLOSED", faults, cooldownUntil: state.cooldownUntil, blockedUntil: state.blockedUntil };
}

// Estado compartilhado persistido (Postgres em produção; em memória nos testes).
export interface BreakerStore {
  load(): Promise<BreakerState>;
  save(state: BreakerState): Promise<void>;
}

export class Breaker {
  constructor(private readonly store: BreakerStore) {}

  async openUntil(now: Date = new Date()): Promise<Date | null> {
    return openUntil(await this.store.load(), now);
  }

  async recordOk(): Promise<void> {
    await this.store.save(recordOk(await this.store.load()));
  }

  async recordFault(options: FaultOptions = {}): Promise<void> {
    await this.store.save(recordFault(await this.store.load(), options));
  }
}
