import { describe, expect, it } from "vitest";

import { pcpConfiguracaoSchema, pcpConfiguracoesQuerySchema } from "@/lib/contracts";
import {
  filtroDeConfiguracoes,
  normalizarSelecoes,
  paraPayloadPcp,
  PCP_FOLGA_PROXIMO_DESDE_MS,
  proximoDesdeDaPagina,
  type RegistroConfiguracao,
  SELECAO_CONFIGURACAO,
} from "@/lib/pcp/configuracoes";

function consulta(bruto: Record<string, string | undefined>) {
  const resultado = pcpConfiguracoesQuerySchema.safeParse(bruto);
  if (!resultado.success) {
    throw new Error(`consulta inválida no teste: ${resultado.error.message}`);
  }
  return resultado.data;
}

const REGISTRO: RegistroConfiguracao = {
  numero: 7,
  codigo: "MACA-INOX-R8",
  produtoSlug: "maca-hospitalar",
  produtoNome: "Maca hospitalar",
  autorNome: "Vitor",
  foraDoPadrao: 1,
  observacoes: "entregar sem rodízio",
  selecoes: [
    {
      grupoCodigo: "MAT",
      grupoRotulo: "Material",
      opcaoCodigo: "INOX",
      opcaoRotulo: "Inox",
      texto: null,
      padrao: false,
    },
  ],
  status: "ATENDIDA",
  projetoCad: "PRJ-1234",
  respostaNota: null,
  respondidoEm: new Date("2026-08-05T12:00:00.000Z"),
  criadoEm: new Date("2026-08-01T09:30:00.000Z"),
};

describe("SELECAO_CONFIGURACAO", () => {
  it("não pede nenhum identificador de pessoa ao banco", () => {
    const campos = Object.keys(SELECAO_CONFIGURACAO);
    expect(campos).not.toContain("autorId");
    expect(campos).not.toContain("autorEmail");
    expect(campos).not.toContain("respondidoPorId");
    expect(campos).not.toContain("id");
    expect(campos).not.toContain("autor");
    expect(campos).not.toContain("respondidoPor");
  });
});

describe("filtroDeConfiguracoes", () => {
  it("filtra pelo status padrão (ATENDIDA) quando ninguém pede nada", () => {
    expect(filtroDeConfiguracoes(consulta({}))).toEqual({ status: "ATENDIDA" });
  });

  it("filtra pelo status pedido", () => {
    expect(filtroDeConfiguracoes(consulta({ status: "RECUSADA" }))).toEqual({
      status: "RECUSADA",
    });
  });

  it("não filtra status nenhum em TODAS", () => {
    expect(filtroDeConfiguracoes(consulta({ status: "TODAS" }))).toEqual({});
  });

  it("filtra por respondidoEm com fallback em criadoEm quando tem desde", () => {
    const desde = "2026-08-01T00:00:00.000Z";
    const filtro = filtroDeConfiguracoes(consulta({ status: "ATENDIDA", desde }));

    expect(filtro.OR).toEqual([
      { respondidoEm: { gte: new Date(desde) } },
      { respondidoEm: null, criadoEm: { gte: new Date(desde) } },
    ]);
  });
});

// ACHADO 4: sem `proximoDesde` na resposta, o cliente tem que adivinhar a marca
// d'água, e as duas deduções naturais ("último + 1ms" e "agora") perdem
// registro.
describe("proximoDesdeDaPagina", () => {
  const AGORA = new Date("2026-08-07T15:00:00.000Z");

  function pagina(datas: Array<{ respondidoEm: string | null; criadoEm: string }>) {
    return datas.map((data, indice) =>
      paraPayloadPcp({
        ...REGISTRO,
        numero: indice + 1,
        respondidoEm: data.respondidoEm ? new Date(data.respondidoEm) : null,
        criadoEm: new Date(data.criadoEm),
      }),
    );
  }

  it("volta a folga a partir da maior movimentação da página", () => {
    const itens = pagina([
      { respondidoEm: "2026-08-07T14:00:00.000Z", criadoEm: "2026-08-01T09:00:00.000Z" },
      { respondidoEm: "2026-08-07T14:30:00.000Z", criadoEm: "2026-08-01T09:00:00.000Z" },
    ]);

    expect(proximoDesdeDaPagina(itens, undefined, AGORA)).toBe(
      new Date(Date.parse("2026-08-07T14:30:00.000Z") - PCP_FOLGA_PROXIMO_DESDE_MS).toISOString(),
    );
  });

  it("usa criadoEm quando a configuração ainda não foi respondida", () => {
    const itens = pagina([
      { respondidoEm: null, criadoEm: "2026-08-07T14:45:00.000Z" },
    ]);

    expect(proximoDesdeDaPagina(itens, undefined, AGORA)).toBe(
      new Date(Date.parse("2026-08-07T14:45:00.000Z") - PCP_FOLGA_PROXIMO_DESDE_MS).toISOString(),
    );
  });

  it("nunca anda para trás do desde que o cliente pediu", () => {
    const desde = new Date("2026-08-07T14:50:00.000Z");
    const itens = pagina([
      { respondidoEm: "2026-08-07T14:51:00.000Z", criadoEm: "2026-08-01T09:00:00.000Z" },
    ]);

    expect(proximoDesdeDaPagina(itens, desde, AGORA)).toBe(desde.toISOString());
  });

  it("repete o desde quando a página vem vazia (não desce mais 5 min a cada sync)", () => {
    const desde = new Date("2026-08-07T10:00:00.000Z");
    expect(proximoDesdeDaPagina([], desde, AGORA)).toBe(desde.toISOString());
  });

  it("ancora em agora menos a folga quando não veio desde nem registro", () => {
    expect(proximoDesdeDaPagina([], undefined, AGORA)).toBe(
      new Date(AGORA.getTime() - PCP_FOLGA_PROXIMO_DESDE_MS).toISOString(),
    );
  });

  it("cobre o empate no mesmo milissegundo cortado pelo limite", () => {
    // Backfill: um UPDATE só carimba todo mundo com o mesmo instante. Avançar
    // para "último + 1ms" jogaria fora o resto do empate; a folga traz de volta.
    const carimbo = "2026-08-07T14:00:00.000Z";
    const itens = pagina([
      { respondidoEm: carimbo, criadoEm: "2026-08-01T09:00:00.000Z" },
      { respondidoEm: carimbo, criadoEm: "2026-08-01T09:00:00.000Z" },
    ]);

    expect(Date.parse(proximoDesdeDaPagina(itens, undefined, AGORA))).toBeLessThan(
      Date.parse(carimbo),
    );
  });
});

describe("paraPayloadPcp", () => {
  it("monta o payload no formato do contrato", () => {
    const payload = paraPayloadPcp(REGISTRO);

    expect(pcpConfiguracaoSchema.safeParse(payload).success).toBe(true);
    expect(payload.numeroFormatado).toBe("CFG-0007");
    expect(payload.respondidoEm).toBe("2026-08-05T12:00:00.000Z");
    expect(payload.criadoEm).toBe("2026-08-01T09:30:00.000Z");
    expect(payload.selecoes).toHaveLength(1);
  });

  it("deixa respondidoEm nulo quando ainda não houve resposta", () => {
    const payload = paraPayloadPcp({ ...REGISTRO, status: "ENVIADA", respondidoEm: null });
    expect(payload.respondidoEm).toBeNull();
  });
});

describe("normalizarSelecoes", () => {
  it("devolve lista vazia para snapshot que não é array", () => {
    expect(normalizarSelecoes(null)).toEqual([]);
    expect(normalizarSelecoes("ops")).toEqual([]);
    expect(normalizarSelecoes({})).toEqual([]);
  });

  it("descarta item sem grupo ou sem opção", () => {
    expect(normalizarSelecoes([null, {}, { grupoCodigo: "MAT" }, { opcaoCodigo: "INOX" }])).toEqual(
      [],
    );
  });

  it("cai na sigla quando o snapshot antigo não tem rótulo", () => {
    expect(normalizarSelecoes([{ grupoCodigo: "MAT", opcaoCodigo: "INOX" }])).toEqual([
      {
        grupoCodigo: "MAT",
        grupoRotulo: "MAT",
        opcaoCodigo: "INOX",
        opcaoRotulo: "INOX",
        texto: null,
        padrao: false,
      },
    ]);
  });

  it("preserva texto livre e a marca de fora do padrão", () => {
    const [selecao] = normalizarSelecoes([
      {
        grupoCodigo: "PESO",
        grupoRotulo: "Peso",
        opcaoCodigo: "OUT",
        opcaoRotulo: "Outro peso",
        texto: "200 kg",
        padrao: false,
      },
    ]);

    expect(selecao.texto).toBe("200 kg");
    expect(selecao.padrao).toBe(false);
  });
});

describe("pcpConfiguracoesQuerySchema", () => {
  it("aplica os defaults", () => {
    expect(consulta({})).toEqual({ status: "ATENDIDA", limite: 100 });
  });

  it("apara o limite no teto e recusa limite inválido", () => {
    expect(consulta({ limite: "5000" }).limite).toBe(200);
    expect(consulta({ limite: "50" }).limite).toBe(50);
    expect(pcpConfiguracoesQuerySchema.safeParse({ limite: "zero" }).success).toBe(false);
    expect(pcpConfiguracoesQuerySchema.safeParse({ limite: "0" }).success).toBe(false);
    expect(pcpConfiguracoesQuerySchema.safeParse({ limite: "-1" }).success).toBe(false);
    expect(pcpConfiguracoesQuerySchema.safeParse({ limite: "1.5" }).success).toBe(false);
  });

  it("recusa status fora do enum e data que não é ISO", () => {
    expect(pcpConfiguracoesQuerySchema.safeParse({ status: "QUALQUER" }).success).toBe(false);
    expect(pcpConfiguracoesQuerySchema.safeParse({ desde: "ontem" }).success).toBe(false);
  });

  // ACHADO 3: em TODAS os dois grupos (respondidos e não respondidos) se
  // misturam, a ordenação deixa de ser monotônica na chave filtrada e a
  // paginação por marca d'água PULA registro em silêncio.
  it("recusa status=TODAS junto com desde, dizendo o que fazer", () => {
    const resultado = pcpConfiguracoesQuerySchema.safeParse({
      status: "TODAS",
      desde: "2026-08-01T00:00:00.000Z",
    });

    expect(resultado.success).toBe(false);
    expect(resultado.error?.issues[0]?.message).toContain("sincronize por status");
  });

  it("continua aceitando TODAS sem desde e um status fixo com desde", () => {
    expect(pcpConfiguracoesQuerySchema.safeParse({ status: "TODAS" }).success).toBe(true);
    expect(
      pcpConfiguracoesQuerySchema.safeParse({
        status: "ATENDIDA",
        desde: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
