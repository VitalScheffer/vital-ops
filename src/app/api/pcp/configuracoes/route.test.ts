import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isPublicPath, isServiceApiPath } from "@/lib/auth.config";
import { PCP_FOLGA_PROXIMO_DESDE_MS } from "@/lib/pcp/configuracoes";
import { limparJanelas, totalDeJanelas } from "@/lib/pcp/janela";
import { PCP_TOKEN_MIN_CARACTERES } from "@/lib/pcp/token";

// O banco e a auditoria são substituídos: este teste é sobre a porta de entrada
// (token, parâmetros, formato da resposta), não sobre o Postgres.
const { findMany, auditar } = vi.hoisted(() => ({
  findMany: vi.fn(),
  auditar: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { configuracao: { findMany } } }));
vi.mock("@/lib/audit", () => ({ audit: auditar }));

const { GET } = await import("@/app/api/pcp/configuracoes/route");

const TOKEN = "t".repeat(PCP_TOKEN_MIN_CARACTERES);
const URL_BASE = "https://ops.vitalscheffer.com.br/api/pcp/configuracoes";

const REGISTRO = {
  numero: 7,
  codigo: "MACA-INOX",
  produtoSlug: "maca-hospitalar",
  produtoNome: "Maca hospitalar",
  autorNome: "Vitor",
  foraDoPadrao: 1,
  observacoes: null,
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

function chamar(query = "", cabecalhos: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`${URL_BASE}${query}`, { headers: cabecalhos }));
}

function comToken(query = ""): Promise<Response> {
  return chamar(query, { authorization: `Bearer ${TOKEN}` });
}

function argumentosDoFindMany() {
  return findMany.mock.calls.at(-1)?.[0];
}

interface LinhaAuditada {
  action: string;
  summary: string;
  actor: { email: string };
}

function acoesAuditadas(acao: string): LinhaAuditada[] {
  return auditar.mock.calls
    .map((chamada) => chamada[0] as LinhaAuditada)
    .filter((linha) => linha.action === acao);
}

beforeEach(() => {
  vi.stubEnv("PCP_BRIDGE_TOKEN", TOKEN);
  findMany.mockReset();
  findMany.mockResolvedValue([REGISTRO]);
  auditar.mockReset();
  auditar.mockResolvedValue(undefined);
  limparJanelas();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("liberação da rota no proxy", () => {
  it("tira do guard de sessão SÓ o caminho exato da ponte", () => {
    expect(isServiceApiPath("/api/pcp/configuracoes")).toBe(true);
    expect(isPublicPath("/api/pcp/configuracoes")).toBe(true);

    expect(isServiceApiPath("/api/pcpx/configuracoes")).toBe(false);
    expect(isPublicPath("/api/pcpx/configuracoes")).toBe(false);
    expect(isPublicPath("/api/requisicoes")).toBe(false);
    expect(isPublicPath("/projetos")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });

  // ACHADO 5: com liberação por PREFIXO, qualquer rota criada sob /api/pcp/
  // daqui a seis meses nasceria fora do guard de sessão, em silêncio.
  it("não libera rota irmã hipotética sob /api/pcp/", () => {
    expect(isServiceApiPath("/api/pcp/ordens")).toBe(false);
    expect(isPublicPath("/api/pcp/ordens")).toBe(false);

    expect(isServiceApiPath("/api/pcp/configuracoes/7")).toBe(false);
    expect(isPublicPath("/api/pcp/configuracoes/7")).toBe(false);

    expect(isServiceApiPath("/api/pcp/")).toBe(false);
    expect(isPublicPath("/api/pcp/")).toBe(false);
  });
});

describe("autenticação", () => {
  it("responde 401 genérico sem header Authorization", async () => {
    const resposta = await chamar();

    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: "nao autorizado" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("responde 401 com token errado, sem dizer o motivo", async () => {
    const resposta = await chamar("", { authorization: `Bearer ${"x".repeat(40)}` });

    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: "nao autorizado" });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("responde 401 com esquema errado ou header malformado", async () => {
    expect((await chamar("", { authorization: TOKEN })).status).toBe(401);
    expect((await chamar("", { authorization: `Basic ${TOKEN}` })).status).toBe(401);
    expect((await chamar("", { authorization: "Bearer" })).status).toBe(401);
  });

  it("audita a recusa sem levar o token para o log", async () => {
    await chamar("", { authorization: `Bearer ${"x".repeat(40)}` });

    expect(auditar).toHaveBeenCalledTimes(1);
    const registrado = JSON.stringify(auditar.mock.calls[0]?.[0]);
    expect(registrado).toContain("pcp.acesso_negado");
    expect(registrado).not.toContain("x".repeat(40));
    expect(registrado).not.toContain(TOKEN);
  });

  it("não audita leitura de rotina bem-sucedida", async () => {
    await comToken();
    expect(auditar).not.toHaveBeenCalled();
  });

  it("não deixa uma rajada de recusas inundar o AuditLog", async () => {
    const errado = { authorization: `Bearer ${"x".repeat(40)}` };
    for (let i = 0; i < 40; i += 1) {
      // IP trocado a cada tentativa: o teto GLOBAL tem que segurar assim mesmo,
      // porque x-forwarded-for é escolhido por quem chama.
      await chamar("", { ...errado, "x-forwarded-for": `203.0.113.${i}` });
    }

    // 30 recusas detalhadas (o teto) + 1 linha de resumo do apagão.
    expect(acoesAuditadas("pcp.acesso_negado").length).toBe(30);
    expect(acoesAuditadas("pcp.acesso_negado_suprimido").length).toBe(1);
  });

  // ACHADO 2: o teto global sozinho deixa quem conhece a URL gastar as 30
  // recusas e, pelo resto da janela, sondar sem virar linha nenhuma — a
  // tentativa que interessa é justamente a que não fica registrada.
  it("registra UMA linha de resumo quando o teto de auditoria apaga a trilha", async () => {
    const errado = { authorization: `Bearer ${"x".repeat(40)}` };
    for (let i = 0; i < 200; i += 1) {
      await chamar("", { ...errado, "x-forwarded-for": `203.0.113.${i}` });
    }

    const resumos = acoesAuditadas("pcp.acesso_negado_suprimido");
    // UMA por janela, mesmo com a rajada continuando: o sinal não pode virar o
    // próximo flood da tabela.
    expect(resumos.length).toBe(1);
    expect(resumos[0].summary).toMatch(/\d+ recusas/);
    expect(resumos[0].summary).not.toContain("x".repeat(40));
    expect(resumos[0].actor.email).toBe("ponte-pcp@sistema");
  });

  it("responde 503 sem PCP_BRIDGE_TOKEN no ambiente, mesmo com token no header", async () => {
    vi.stubEnv("PCP_BRIDGE_TOKEN", "");
    const semVariavel = await comToken();
    expect(semVariavel.status).toBe(503);
    await expect(semVariavel.json()).resolves.toEqual({ erro: "ponte desativada" });

    vi.stubEnv("PCP_BRIDGE_TOKEN", undefined);
    expect((await comToken()).status).toBe(503);

    // Segredo curto demais conta como "não configurada".
    vi.stubEnv("PCP_BRIDGE_TOKEN", "curto");
    expect((await chamar("", { authorization: "Bearer curto" })).status).toBe(503);

    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("resposta", () => {
  it("devolve 200 no formato { configuracoes, total, proximoDesde }", async () => {
    const resposta = await comToken();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("Cache-Control")).toBe("no-store");

    const corpo = await resposta.json();
    expect(corpo.total).toBe(1);
    expect(corpo.configuracoes).toHaveLength(1);
    expect(corpo.configuracoes[0]).toEqual({
      numero: 7,
      numeroFormatado: "CFG-0007",
      codigo: "MACA-INOX",
      produtoSlug: "maca-hospitalar",
      produtoNome: "Maca hospitalar",
      autorNome: "Vitor",
      foraDoPadrao: 1,
      observacoes: null,
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
      respondidoEm: "2026-08-05T12:00:00.000Z",
      criadoEm: "2026-08-01T09:30:00.000Z",
    });
  });

  // ACHADO 4: sem cursor explícito, o cliente deduz a marca d'água — e as duas
  // deduções naturais ("último + 1ms" e "agora") perdem registro.
  it("devolve proximoDesde já com a folga, para o cliente não adivinhar", async () => {
    const corpo = await (await comToken()).json();

    expect(corpo.proximoDesde).toBe(
      new Date(
        Date.parse("2026-08-05T12:00:00.000Z") - PCP_FOLGA_PROXIMO_DESDE_MS,
      ).toISOString(),
    );
    // A folga é para trás: reconsultar repete registro (o cliente deduplica por
    // `numero`) em vez de pular.
    expect(Date.parse(corpo.proximoDesde)).toBeLessThan(
      Date.parse(corpo.configuracoes[0].respondidoEm),
    );
  });

  it("devolve proximoDesde utilizável mesmo com a página vazia", async () => {
    findMany.mockResolvedValue([]);

    const corpo = await (await comToken("?desde=2026-08-01T00:00:00.000Z")).json();

    expect(corpo.total).toBe(0);
    // Repete o `desde` que veio: sem novidade, a marca d'água não anda (nem
    // para a frente, perdendo commit atrasado, nem para trás, sem fim).
    expect(corpo.proximoDesde).toBe("2026-08-01T00:00:00.000Z");
  });

  it("nunca leva identificação pessoal no payload", async () => {
    findMany.mockResolvedValue([
      // Mesmo se o banco devolvesse os campos de pessoa, eles não podem sair.
      { ...REGISTRO, autorId: "user_1", autorEmail: "vitor@vitalscheffer.com.br", respondidoPorId: "user_2" },
    ]);

    const corpo = await (await comToken()).text();

    expect(corpo).not.toContain("autorId");
    expect(corpo).not.toContain("autorEmail");
    expect(corpo).not.toContain("respondidoPorId");
    expect(corpo).not.toContain("vitalscheffer.com.br");
    expect(corpo).not.toContain("user_1");
    expect(corpo).toContain("Vitor");
  });
});

describe("parâmetros de consulta", () => {
  it("filtra por ATENDIDA e limita em 100 por padrão", async () => {
    await comToken();

    expect(argumentosDoFindMany()).toMatchObject({
      where: { status: "ATENDIDA" },
      take: 100,
    });
  });

  it("aceita outro status e o coringa TODAS", async () => {
    await comToken("?status=EM_ANALISE");
    expect(argumentosDoFindMany().where).toEqual({ status: "EM_ANALISE" });

    await comToken("?status=TODAS");
    expect(argumentosDoFindMany().where).toEqual({});
  });

  it("filtra por desde usando respondidoEm com fallback em criadoEm", async () => {
    await comToken("?status=ENVIADA&desde=2026-08-01T00:00:00Z");

    expect(argumentosDoFindMany().where.OR).toEqual([
      { respondidoEm: { gte: new Date("2026-08-01T00:00:00Z") } },
      { respondidoEm: null, criadoEm: { gte: new Date("2026-08-01T00:00:00Z") } },
    ]);
  });

  // ACHADO 3: a combinação pula registro em silêncio (NULL no fim do ASC), e o
  // contrato anunciava TODAS como coringa para pedir a fila inteira.
  it("responde 400 em status=TODAS junto com desde, e diz o que fazer", async () => {
    const resposta = await comToken("?status=TODAS&desde=2026-08-01T00:00:00Z");

    expect(resposta.status).toBe(400);
    const corpo = await resposta.json();
    expect(corpo.erro).toBe("parametros invalidos");
    expect(corpo.detalhe).toContain("sincronize por status");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("apara o limite no teto de 200", async () => {
    await comToken("?limite=5000");
    expect(argumentosDoFindMany().take).toBe(200);

    await comToken("?limite=25");
    expect(argumentosDoFindMany().take).toBe(25);
  });

  it("responde 400 com detalhe útil em parâmetro inválido", async () => {
    const status = await comToken("?status=QUALQUER");
    expect(status.status).toBe(400);
    const corpo = await status.json();
    expect(corpo.erro).toBe("parametros invalidos");
    expect(corpo.detalhe).toContain("status");

    expect((await comToken("?desde=ontem")).status).toBe(400);
    expect((await comToken("?limite=0")).status).toBe(400);
    expect((await comToken("?limite=abc")).status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});

// ACHADO 1: a chave da janela de auditoria saía do `x-forwarded-for` CRU e o
// Map só descartava entrada expirada. Sem token nenhum, quem variasse o header a
// cada requisição escrevia uma entrada nova (viva por 5 min) de tamanho
// escolhido por ele, no mesmo processo que serve o resto do app.
describe("memória da janela sob rajada sem token", () => {
  it("não cresce sem teto com x-forwarded-for variado e gigante", async () => {
    const errado = { authorization: `Bearer ${"x".repeat(40)}` };
    for (let i = 0; i < 1_500; i += 1) {
      await chamar("", {
        ...errado,
        // Origem diferente a cada chamada e com tamanho ridículo: nem a
        // quantidade nem o tamanho das chaves podem ser escolhidos por quem
        // chama.
        "x-forwarded-for": `203.0.113.${i}-${"9".repeat(500)}`,
      });
    }

    expect(totalDeJanelas()).toBeLessThanOrEqual(1024);
  });

  it("continua respondendo 401 depois do teto (nada de 500)", async () => {
    const errado = { authorization: `Bearer ${"x".repeat(40)}` };
    for (let i = 0; i < 1_500; i += 1) {
      await chamar("", { ...errado, "x-forwarded-for": `198.51.100.${i}` });
    }

    const resposta = await chamar("", { ...errado, "x-forwarded-for": "198.51.100.254" });
    expect(resposta.status).toBe(401);
    await expect(resposta.json()).resolves.toEqual({ erro: "nao autorizado" });
  });
});

describe("rate limit", () => {
  it("responde 429 com Retry-After ao estourar a janela do token", async () => {
    let ultima: Response | null = null;
    for (let i = 0; i < 61; i += 1) {
      ultima = await comToken();
    }

    expect(ultima?.status).toBe(429);
    await expect(ultima?.json()).resolves.toEqual({ erro: "muitas requisicoes" });
    expect(Number(ultima?.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
