import { describe, expect, it } from "vitest";

import {
  Breaker,
  type BreakerState,
  type BreakerStore,
  HARD_BLOCK_MS,
  INITIAL_STATE,
  SOFT_THRESHOLD,
  openUntil,
  recordFault,
  recordOk,
} from "../breaker";

describe("breaker — lógica pura", () => {
  it("fechado quando novo", () => {
    expect(openUntil(INITIAL_STATE)).toBeNull();
  });

  it("abre soft ao atingir o limite", () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < SOFT_THRESHOLD; i += 1) {
      state = recordFault(state);
    }
    expect(openUntil(state)).not.toBeNull();
    expect(state.faults).toBe(SOFT_THRESHOLD);
    expect(state.estado).toBe("SOFT");
  });

  it("abaixo do limite continua fechado", () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < SOFT_THRESHOLD - 1; i += 1) {
      state = recordFault(state);
    }
    expect(openUntil(state)).toBeNull();
  });

  it("sucesso zera o contador", () => {
    let state = INITIAL_STATE;
    for (let i = 0; i < SOFT_THRESHOLD; i += 1) {
      state = recordFault(state);
    }
    state = recordOk(state);
    expect(openUntil(state)).toBeNull();
    expect(state.faults).toBe(0);
  });

  it("bloqueio hard usa a duração informada", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const state = recordFault(INITIAL_STATE, { blocked: true, blockedSeconds: 1200 }, now);
    expect(state.estado).toBe("HARD");
    expect(state.blockedUntil?.getTime()).toBe(now.getTime() + 1200 * 1000);
    expect(openUntil(state, now)).not.toBeNull();
  });

  it("bloqueio hard sem duração cai no fallback de 30min", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const state = recordFault(INITIAL_STATE, { blocked: true }, now);
    expect(state.blockedUntil?.getTime()).toBe(now.getTime() + HARD_BLOCK_MS);
  });

  it("openUntil devolve o maior instante entre cooldown e block", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const state: BreakerState = {
      estado: "HARD",
      faults: 9,
      cooldownUntil: new Date(now.getTime() + 60 * 1000),
      blockedUntil: new Date(now.getTime() + 1200 * 1000),
    };
    expect(openUntil(state, now)?.getTime()).toBe(now.getTime() + 1200 * 1000);
  });
});

// Store em memória para exercitar a classe Breaker sem banco.
class MemoryBreakerStore implements BreakerStore {
  state: BreakerState = { ...INITIAL_STATE };

  async load(): Promise<BreakerState> {
    return this.state;
  }

  async save(next: BreakerState): Promise<void> {
    this.state = next;
  }
}

describe("Breaker — com store em memória", () => {
  it("persiste faults, abre e depois zera no sucesso", async () => {
    const store = new MemoryBreakerStore();
    const breaker = new Breaker(store);

    for (let i = 0; i < SOFT_THRESHOLD; i += 1) {
      await breaker.recordFault();
    }
    expect(await breaker.openUntil()).not.toBeNull();
    expect(store.state.faults).toBe(SOFT_THRESHOLD);

    await breaker.recordOk();
    expect(await breaker.openUntil()).toBeNull();
    expect(store.state.faults).toBe(0);
  });

  it("bloqueio hard abre o breaker pela duração informada", async () => {
    const store = new MemoryBreakerStore();
    const breaker = new Breaker(store);
    await breaker.recordFault({ blocked: true, blockedSeconds: 1200 });
    expect(await breaker.openUntil()).not.toBeNull();
    expect(store.state.estado).toBe("HARD");
  });
});
