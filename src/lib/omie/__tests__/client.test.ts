import { describe, expect, it, vi } from "vitest";

import type { BreakerState, BreakerStore } from "../breaker";
import { Breaker } from "../breaker";
import type { CacheStore } from "../cache";
import { chamar, type OmieClientDeps } from "../client";
import { OmieDescriptionConflict, OmieDuplicate, OmieError } from "../errors";

function memoryBreaker(): Breaker {
  let state: BreakerState = { estado: "CLOSED", faults: 0, cooldownUntil: null, blockedUntil: null };
  const store: BreakerStore = {
    async load() {
      return state;
    },
    async save(next) {
      state = next;
    },
  };
  return new Breaker(store);
}

function noopCache(): CacheStore {
  return {
    async get() {
      return null;
    },
    async store() {},
    async invalidate() {
      return 0;
    },
  };
}

function fakeResponse(status: number, body: string): Response {
  return { status, text: async () => body } as unknown as Response;
}

function deps(fetchImpl: typeof fetch): OmieClientDeps {
  return {
    breaker: memoryBreaker(),
    cache: noopCache(),
    fetchImpl,
    credentials: () => ({ appKey: "k", appSecret: "s" }),
    baseUrl: "https://fake.omie.test/api/v1",
    logger: { warn: vi.fn() },
  };
}

async function chamarEspera(fetchImpl: typeof fetch): Promise<unknown> {
  try {
    return await chamar("geral/produtos/", "UpsertProduto", {}, { write: true }, deps(fetchImpl));
  } catch (erro) {
    return erro;
  }
}

// REQUISITOS §6: "Erro vem como HTTP 200 + faultstring (semântica invertida);
// HTTP 500 às vezes é validação (não transitório)". O client precisa
// classificar o corpo mesmo quando o status é 500, não só quando é 200.
describe("chamar — classificação independe do status HTTP", () => {
  it("HTTP 500 com faultstring de duplicidade → OmieDuplicate", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse(500, JSON.stringify({ faultstring: "ERROR: Cliente já cadastrado para o CNPJ informado." })),
    );
    const erro = await chamarEspera(fetchImpl);
    expect(erro).toBeInstanceOf(OmieDuplicate);
  });

  it("HTTP 500 com faultstring de descrição em uso → OmieDescriptionConflict", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse(
        500,
        JSON.stringify({
          faultstring:
            "ERROR: A descrição informada já está sendo utilizada pelo produto com código COMDB P0381 018AC.",
          faultcode: "SOAP-ENV:Client-143",
        }),
      ),
    );
    const erro = await chamarEspera(fetchImpl);
    expect(erro).toBeInstanceOf(OmieDescriptionConflict);
    expect((erro as Error).message).toContain("COMDB P0381 018AC");
  });

  it("HTTP 500 sem corpo reconhecível continua um OmieError retryable", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(500, "Internal Server Error"));
    const erro = await chamarEspera(fetchImpl);
    expect(erro).toBeInstanceOf(OmieError);
    expect((erro as OmieError).retryable).toBe(true);
  });

  it("HTTP 200 com faultstring de vazio continua devolvendo null (regressão)", async () => {
    const fetchImpl = vi.fn(async () =>
      fakeResponse(200, JSON.stringify({ faultstring: "ERROR: Não existem registros para a página [1]!" })),
    );
    const resultado = await chamar("geral/x/", "Listar", {}, {}, deps(fetchImpl));
    expect(resultado).toBeNull();
  });

  it("HTTP 200 sem faultstring devolve a resposta normalmente (regressão)", async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(200, JSON.stringify({ codigo_produto: 42 })));
    const resultado = await chamar("geral/produtos/", "UpsertProduto", {}, { write: true }, deps(fetchImpl));
    expect(resultado).toMatchObject({ codigo_produto: 42 });
  });
});
