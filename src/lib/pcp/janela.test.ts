import { beforeEach, describe, expect, it } from "vitest";

import {
  type Janela,
  limparJanelas,
  registrarUso,
  totalDeJanelas,
} from "@/lib/pcp/janela";

const JANELA: Janela = { limite: 3, janelaMs: 1000, noTetoDeChaves: "recusar" };

describe("registrarUso", () => {
  beforeEach(() => {
    limparJanelas();
  });

  it("permite até o limite e barra o excedente", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite; i += 1) {
      expect(registrarUso("chave", JANELA, agora).permitido).toBe(true);
    }

    const barrado = registrarUso("chave", JANELA, agora);
    expect(barrado.permitido).toBe(false);
    expect(barrado.esperarSegundos).toBe(1);
  });

  it("conta cada chave separadamente", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite + 1; i += 1) {
      registrarUso("uma", JANELA, agora);
    }

    expect(registrarUso("uma", JANELA, agora).permitido).toBe(false);
    expect(registrarUso("outra", JANELA, agora).permitido).toBe(true);
  });

  it("libera de novo quando a janela vira", () => {
    const agora = 1_000_000;
    for (let i = 0; i < JANELA.limite + 1; i += 1) {
      registrarUso("chave", JANELA, agora);
    }
    expect(registrarUso("chave", JANELA, agora).permitido).toBe(false);

    expect(registrarUso("chave", JANELA, agora + JANELA.janelaMs + 1).permitido).toBe(true);
  });

  it("informa quantos usos a chave já acumulou na janela", () => {
    const agora = 1_000_000;
    expect(registrarUso("chave", JANELA, agora).usos).toBe(1);
    expect(registrarUso("chave", JANELA, agora).usos).toBe(2);

    for (let i = 0; i < 10; i += 1) {
      registrarUso("chave", JANELA, agora);
    }
    // Continua contando depois de barrar: é o número que a linha de resumo da
    // auditoria mostra.
    expect(registrarUso("chave", JANELA, agora).usos).toBe(13);
  });
});

// ACHADO 1: sem teto, quem varia a chave a cada requisição (o `x-forwarded-for`
// é dele) enfia uma entrada nova de 5 minutos no Map por chamada, sem token
// nenhum, no mesmo processo que serve o resto do app.
describe("teto de chaves", () => {
  beforeEach(() => {
    limparJanelas();
  });

  it("para de criar chave nova acima do teto, e não cresce mais", () => {
    const agora = 1_000_000;
    for (let i = 0; i < 5_000; i += 1) {
      registrarUso(`origem-${i}`, JANELA, agora);
    }

    expect(totalDeJanelas()).toBeLessThanOrEqual(1024);
  });

  it("falha FECHADO no teto quando a janela pede recusar", () => {
    const agora = 1_000_000;
    for (let i = 0; i < 5_000; i += 1) {
      registrarUso(`origem-${i}`, JANELA, agora);
    }

    const nova = registrarUso("origem-nunca-vista", JANELA, agora);
    expect(nova.permitido).toBe(false);
    expect(nova.usos).toBe(0);
    expect(nova.esperarSegundos).toBeGreaterThan(0);
  });

  it("falha ABERTO no teto quando a janela pede permitir, sem guardar a chave", () => {
    const abreNoTeto: Janela = { ...JANELA, noTetoDeChaves: "permitir" };
    const agora = 1_000_000;
    for (let i = 0; i < 5_000; i += 1) {
      registrarUso(`origem-${i}`, abreNoTeto, agora);
    }

    const antes = totalDeJanelas();
    expect(registrarUso("origem-nunca-vista", abreNoTeto, agora).permitido).toBe(true);
    expect(totalDeJanelas()).toBe(antes);
  });

  it("não barra chave JÁ existente por causa do teto", () => {
    const agora = 1_000_000;
    // A chave conhecida entra primeiro, antes de o Map encher.
    expect(registrarUso("conhecida", JANELA, agora).permitido).toBe(true);
    for (let i = 0; i < 5_000; i += 1) {
      registrarUso(`origem-${i}`, JANELA, agora);
    }

    expect(registrarUso("conhecida", JANELA, agora).permitido).toBe(true);
    // E continua funcionando na janela seguinte: reaproveitar entrada expirada
    // não faz o Map crescer, então o teto não pode atrapalhar.
    expect(registrarUso("conhecida", JANELA, agora + JANELA.janelaMs + 1).permitido).toBe(true);
  });
});
