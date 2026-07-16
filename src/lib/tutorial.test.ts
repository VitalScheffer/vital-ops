import { describe, expect, it } from "vitest";

import { tutorialSeenKey, tutorialStepsFor } from "@/lib/tutorial";

describe("tutorialStepsFor", () => {
  it("sem acesso a Usuários/Auditoria, não vê esses passos (ex.: FUNCIONARIO padrão)", () => {
    const keys = tutorialStepsFor(["home", "produtos"]).map((step) => step.key);
    expect(keys).toEqual(["welcome", "roles", "products", "reopen"]);
  });

  it("com Usuários e Auditoria no menu, vê todos os passos (ex.: GESTOR/ADMIN padrão)", () => {
    const keys = tutorialStepsFor(["home", "produtos", "usuarios", "auditoria"]).map(
      (step) => step.key,
    );
    expect(keys).toEqual(["welcome", "roles", "products", "users", "audit", "reopen"]);
  });

  it("Configurações no menu não adiciona passo (não existe passo de tutorial pra ela)", () => {
    const keys = tutorialStepsFor(["home", "produtos", "usuarios", "auditoria", "configuracoes"]).map(
      (step) => step.key,
    );
    expect(keys).toEqual(["welcome", "roles", "products", "users", "audit", "reopen"]);
  });

  it("Requisições no menu adiciona o passo do módulo (ex.: FABRICA padrão)", () => {
    const keys = tutorialStepsFor(["home", "requisicoes"]).map((step) => step.key);
    expect(keys).toEqual(["welcome", "roles", "requisicoes", "reopen"]);
  });

  it("Baixa de estoque no menu adiciona o passo do módulo", () => {
    const keys = tutorialStepsFor(["home", "baixas"]).map((step) => step.key);
    expect(keys).toEqual(["welcome", "roles", "baixas", "reopen"]);
  });

  it("todo passo tem título e ao menos um parágrafo", () => {
    for (const step of tutorialStepsFor(["home", "produtos", "usuarios", "auditoria"])) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });
});

describe("tutorialSeenKey", () => {
  it("gera uma chave por usuário", () => {
    expect(tutorialSeenKey("abc123")).toBe("vital-ops:tutorial-seen:abc123");
    expect(tutorialSeenKey("abc123")).not.toBe(tutorialSeenKey("def456"));
  });
});
