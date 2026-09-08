import { describe, expect, it } from "vitest";

import { agruparPorSemana, rotuloSemana } from "./semanas";

describe("rotuloSemana", () => {
  it("rotula uma segunda-feira até o domingo seguinte, dentro do mesmo mês", () => {
    // 2026-08-10 é uma segunda-feira.
    const rotulo = rotuloSemana(new Date("2026-08-12T12:00:00"));
    expect(rotulo).toBe("Agosto 10-16");
  });

  it("cruza o fim do mês mostrando os dois meses", () => {
    // Semana de 2026-08-24 (segunda) a 2026-08-30 (domingo) — mesmo mês, então
    // usa outra data pra cruzar: 2026-08-31 (segunda) até 2026-09-06.
    const rotulo = rotuloSemana(new Date("2026-08-31T00:00:00"));
    expect(rotulo).toBe("Agosto 31 - Setembro 06");
  });
});

describe("agruparPorSemana", () => {
  it("agrupa itens na mesma semana sob a mesma chave", () => {
    const itens = [
      { id: "a", data: new Date("2026-08-11T09:00:00") },
      { id: "b", data: new Date("2026-08-13T09:00:00") },
    ];

    const grupos = agruparPorSemana(itens, (item) => item.data);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].itens.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("separa itens de semanas diferentes em grupos diferentes, mais recente primeiro", () => {
    const itens = [
      { id: "semana1", data: new Date("2026-08-11T09:00:00") },
      { id: "semana2", data: new Date("2026-08-20T09:00:00") },
    ];

    const grupos = agruparPorSemana(itens, (item) => item.data);

    expect(grupos).toHaveLength(2);
    expect(grupos[0].itens[0].id).toBe("semana2");
    expect(grupos[1].itens[0].id).toBe("semana1");
  });
});
