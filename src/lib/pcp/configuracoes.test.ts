import { describe, expect, it } from "vitest";

import { pcpConfiguracaoSchema, pcpConfiguracoesQuerySchema } from "@/lib/contracts";
import {
  filtroDeConfiguracoes,
  normalizarSelecoes,
  paraPayloadPcp,
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
    const filtro = filtroDeConfiguracoes(consulta({ status: "TODAS", desde }));

    expect(filtro.OR).toEqual([
      { respondidoEm: { gte: new Date(desde) } },
      { respondidoEm: null, criadoEm: { gte: new Date(desde) } },
    ]);
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
});
