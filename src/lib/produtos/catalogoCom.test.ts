import { describe, expect, it } from "vitest";

import type { OmiePayload } from "@/lib/omie/client";

import type { ChamarFn } from "./catalogoMat";
import { chaveCom, listarCatalogoCom } from "./catalogoCom";

interface CallRecord {
  path: string;
  call: string;
  param: OmiePayload;
  // O 4º argumento é o que carrega o cache: sem registrá-lo, um teste "confere"
  // o TTL sem olhar para ele.
  options?: { ttlSeconds?: number; revalidar?: boolean };
}

function mockChamar(resposta: (pagina: number) => OmiePayload | null): {
  fn: ChamarFn;
  calls: CallRecord[];
} {
  const calls: CallRecord[] = [];
  const fn: ChamarFn = async (path, call, param, options) => {
    calls.push({ path, call, param, options });
    return resposta(Number(param.pagina ?? 1));
  };
  return { fn, calls };
}

// Formato real da resposta do Omie (leitura de 20/08/2026): a página traz itens
// que só têm "COM" no meio da descrição junto dos comprados de verdade.
function pagina(total: number, itens: OmiePayload[]): OmiePayload {
  return { total_de_paginas: total, produto_servico_cadastro: itens };
}

const COMPRADO = {
  codigo: "COMRZ G3PSF E0635",
  descricao: "COMRZ G3PSF E0635 - RODIZIO 3 POL. GIRATORIO PLASTICO S. FREIO",
  unidade: "un",
};

describe("listarCatalogoCom", () => {
  it("indexa os comprados pela chave sem espaços", async () => {
    const { fn } = mockChamar(() => pagina(1, [COMPRADO]));
    const { itens } = await listarCatalogoCom(fn);
    expect(itens.get("COMRZG3PSFE0635")).toEqual({
      codigo: "COMRZ G3PSF E0635",
      descricao: COMPRADO.descricao,
      unidade: "UN",
    });
  });

  it("descarta o que casou o filtro por acaso, sem ser código COM", async () => {
    const { fn } = mockChamar(() =>
      pagina(1, [
        COMPRADO,
        { codigo: "PRD10324", descricao: "PERFIL DE BORRACHA COM ESPIGA", unidade: "UN" },
      ]),
    );
    expect([...(await listarCatalogoCom(fn)).itens.keys()]).toEqual(["COMRZG3PSFE0635"]);
  });

  it("deixa de fora inativo e bloqueado", async () => {
    const { fn } = mockChamar(() =>
      pagina(1, [
        { ...COMPRADO, codigo: "COMAA 00001 00001", inativo: "S" },
        { ...COMPRADO, codigo: "COMAA 00002 00002", bloqueado: "S" },
        COMPRADO,
      ]),
    );
    expect([...(await listarCatalogoCom(fn)).itens.keys()]).toEqual(["COMRZG3PSFE0635"]);
  });

  it("percorre todas as páginas que o Omie anunciar", async () => {
    const { fn, calls } = mockChamar((p) =>
      pagina(3, [{ ...COMPRADO, codigo: `COMAA 0000${p} 00000` }]),
    );
    const catalogo = await listarCatalogoCom(fn);
    expect(calls).toHaveLength(3);
    expect(catalogo.itens.size).toBe(3);
    expect(catalogo.completo).toBe(true);
  });

  it("marca INCOMPLETO quando uma página do meio volta vazia", async () => {
    // O client devolve null em EMPTY/NOT_FOUND do Omie. Quem consome não pode
    // dizer "não existe no Omie" em cima de meio catálogo.
    const { fn } = mockChamar((p) => (p === 2 ? null : pagina(3, [COMPRADO])));
    const catalogo = await listarCatalogoCom(fn);
    expect(catalogo.completo).toBe(false);
    expect(catalogo.itens.size).toBe(1);
  });

  it("marca INCOMPLETO quando o Omie anuncia mais páginas do que o teto", async () => {
    const { fn, calls } = mockChamar((p) => pagina(999, [{ ...COMPRADO, codigo: `COMAA 0000${p} 00000` }]));
    expect((await listarCatalogoCom(fn)).completo).toBe(false);
    expect(calls.length).toBeLessThanOrEqual(25);
  });

  it("pede a leitura com cache de uma hora e repassa o revalidar da tela", async () => {
    const { fn, calls } = mockChamar(() => pagina(1, [COMPRADO]));
    await listarCatalogoCom(fn, { revalidar: true });
    expect(calls[0].path).toBe("geral/produtos/");
    expect(calls[0].call).toBe("ListarProdutos");
    // Sem isto, ligar o Modo 2 varreria o Omie inteiro a cada clique.
    expect(calls[0].options).toEqual({ ttlSeconds: 3600, revalidar: true });
  });
});

describe("chaveCom", () => {
  it("casa o código com e sem espaço, em qualquer caixa", () => {
    expect(chaveCom("comdb p0381 018ac")).toBe(chaveCom("COMDB P0381 018AC"));
  });
});
