import { describe, expect, it } from "vitest";

import { nomeArquivoRecebimento } from "./nomeArquivo";

const EXTRAIDO_EM = new Date("2026-09-11T13:25:07.000Z");

describe("nomeArquivoRecebimento", () => {
  it("inclui o número da nota e o instante da extração em São Paulo", () => {
    expect(nomeArquivoRecebimento(["12345"], EXTRAIDO_EM, "xlsx")).toBe(
      "recebimento-nf-12345-extraido-em-2026-09-11_10-25-07.xlsx",
    );
  });

  it("identifica lotes sem criar nomes excessivamente longos", () => {
    expect(nomeArquivoRecebimento(["98765", "123/2026", "NF ÁBC", "44", "55", "98765"], EXTRAIDO_EM, "pdf")).toBe(
      "recebimento-nfs-98765-123-2026-NF-ABC-44-mais-1-extraido-em-2026-09-11_10-25-07.pdf",
    );
  });
});
