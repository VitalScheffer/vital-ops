import { describe, expect, it, vi } from "vitest";

import { Category, classifyFault, normalize, parseRetryAfter } from "../taxonomy";

describe("classifyFault", () => {
  it("lista vazia → EMPTY", () => {
    expect(classifyFault("ERROR: Não existem registros para a página [1]!")).toBe(Category.EMPTY);
  });

  it("não cadastrado por código → NOT_FOUND", () => {
    expect(classifyFault("ERROR: Pedido não cadastrado para o Código [25953530] !")).toBe(
      Category.NOT_FOUND,
    );
  });

  it("não cadastrado por código de integração → NOT_FOUND", () => {
    const fault = "ERROR: Pedido de compra não cadastrado para o Código de Integração [INT001] !";
    expect(classifyFault(fault)).toBe(Category.NOT_FOUND);
  });

  it("resposta quebrada do app server → TRANSIENT", () => {
    expect(classifyFault("SOAP-ERROR: Broken response from Application Server (BG)")).toBe(
      Category.TRANSIENT,
    );
  });

  it("consumo redundante → REDUNDANT (antes de BLOCKED)", () => {
    const fault = "Consumo redundante detectado. Aguarde 60 segundos para tentar novamente (REDUNDANT).";
    expect(classifyFault(fault)).toBe(Category.REDUNDANT);
  });

  it("consumo indevido → BLOCKED", () => {
    expect(
      classifyFault("API bloqueada por consumo indevido. Tente novamente em 1200 segundos."),
    ).toBe(Category.BLOCKED);
  });

  it("já cadastrado → DUPLICATE", () => {
    expect(classifyFault("ERROR: Cliente já cadastrado para o CNPJ informado.")).toBe(
      Category.DUPLICATE,
    );
  });

  it("descrição já usada por outro código → DESCRIPTION_CONFLICT", () => {
    const fault =
      "ERROR: A descrição informada já está sendo utilizada pelo produto com código COMDB P0381 018AC.";
    expect(classifyFault(fault)).toBe(Category.DESCRIPTION_CONFLICT);
  });

  it("código já usado por outro id → CODE_CONFLICT", () => {
    const fault =
      "ERROR: O código CREHI PC021 ITSLD informado já está sendo utilizado pelo produto com ID 12123048648.";
    expect(classifyFault(fault)).toBe(Category.CODE_CONFLICT);
  });

  it("código já usado, mensagem no feminino ('utilizada') → CODE_CONFLICT", () => {
    // Forma real que o Omie devolveu (09/07/2026): "O código ... utilizada ...".
    // O gênero do verbo varia; ancoramos no final "com ID <número>".
    const fault =
      "ERROR: O código COMBC PT019 P0158 informado já está sendo utilizada pelo produto com ID 12098952111.";
    expect(classifyFault(fault)).toBe(Category.CODE_CONFLICT);
  });

  it("descrição já usada, mensagem no masculino ('utilizado') → DESCRIPTION_CONFLICT", () => {
    const fault =
      "ERROR: A descrição informada já está sendo utilizado pelo produto com código COMDB P0381 018AC.";
    expect(classifyFault(fault)).toBe(Category.DESCRIPTION_CONFLICT);
  });

  it("desconhecido → ERROR e loga WARNING", () => {
    const logger = { warn: vi.fn() };
    expect(classifyFault("ERROR: Algo totalmente novo aconteceu", logger)).toBe(Category.ERROR);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe("parseRetryAfter", () => {
  it("extrai os segundos de espera", () => {
    expect(parseRetryAfter("Aguarde 60 segundos para tentar novamente (REDUNDANT).")).toBe(60);
    expect(parseRetryAfter("Tente novamente em 1200 segundos.")).toBe(1200);
  });

  it("retorna null sem número", () => {
    expect(parseRetryAfter("erro sem número")).toBeNull();
  });
});

describe("normalize", () => {
  it("remove acentos e caixa", () => {
    expect(normalize("ERROR: Não EXISTEM")).toBe("error: nao existem");
  });
});
