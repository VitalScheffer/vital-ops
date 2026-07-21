import { describe, expect, it } from "vitest";

import {
  buildRolePermissionsMap,
  DEFAULT_ROLE_PERMISSIONS,
  hasModuleAccess,
  rotuloPapel,
} from "@/lib/permissions";

describe("buildRolePermissionsMap", () => {
  it("sem linhas no banco, cai no padrão atual (ADMIN/GESTOR tudo, FUNCIONARIO só Produtos e Pranchas)", () => {
    expect(buildRolePermissionsMap([])).toEqual(DEFAULT_ROLE_PERMISSIONS);
  });

  it("aplica as linhas do banco por cima do padrão", () => {
    const map = buildRolePermissionsMap([
      { role: "GESTOR", module: "audit", enabled: false },
    ]);
    expect(map.GESTOR).toEqual({
      products: true,
      pranchas: true,
      configurador: true,
      requisicoes: true,
      baixas: true,
      users: true,
      audit: false,
    });
    expect(map.FUNCIONARIO).toEqual(DEFAULT_ROLE_PERMISSIONS.FUNCIONARIO);
  });

  it("FABRICA por padrão só tem Requisições, mas o admin pode liberar mais", () => {
    expect(buildRolePermissionsMap([]).FABRICA).toEqual({
      products: false,
      pranchas: false,
      configurador: false,
      requisicoes: true,
      baixas: false,
      users: false,
      audit: false,
    });
    const map = buildRolePermissionsMap([
      { role: "FABRICA", module: "baixas", enabled: true },
    ]);
    expect(map.FABRICA.baixas).toBe(true);
  });

  it("permite habilitar um módulo extra para FUNCIONARIO", () => {
    const map = buildRolePermissionsMap([
      { role: "FUNCIONARIO", module: "users", enabled: true },
    ]);
    expect(map.FUNCIONARIO.users).toBe(true);
  });

  it("ignora linhas com role ou module desconhecidos", () => {
    const map = buildRolePermissionsMap([
      { role: "SUPERADMIN", module: "audit", enabled: true },
      { role: "GESTOR", module: "faturamento", enabled: true },
    ]);
    expect(map).toEqual(DEFAULT_ROLE_PERMISSIONS);
  });

  it("perfil customizado começa SEM nada e recebe só o que a matriz marcar", () => {
    const map = buildRolePermissionsMap(
      [{ role: "perfil-abc", module: "requisicoes", enabled: true }],
      ["perfil-abc"],
    );
    expect(map["perfil-abc"]).toEqual({
      products: false,
      pranchas: false,
      configurador: false,
      requisicoes: true,
      baixas: false,
      users: false,
      audit: false,
    });
    // os fixos seguem intactos
    expect(map.FUNCIONARIO).toEqual(DEFAULT_ROLE_PERMISSIONS.FUNCIONARIO);
  });

  it("trava ADMIN em true mesmo se o banco disser o contrário", () => {
    const map = buildRolePermissionsMap([
      { role: "ADMIN", module: "audit", enabled: false },
      { role: "ADMIN", module: "pranchas", enabled: false },
      { role: "ADMIN", module: "requisicoes", enabled: false },
      { role: "ADMIN", module: "baixas", enabled: false },
      { role: "ADMIN", module: "users", enabled: false },
      { role: "ADMIN", module: "products", enabled: false },
      { role: "ADMIN", module: "configurador", enabled: false },
    ]);
    expect(map.ADMIN).toEqual({
      products: true,
      pranchas: true,
      configurador: true,
      requisicoes: true,
      baixas: true,
      users: true,
      audit: true,
    });
  });
});

describe("hasModuleAccess", () => {
  it("lê o mapa por papel e módulo", () => {
    expect(hasModuleAccess("FUNCIONARIO", "products", DEFAULT_ROLE_PERMISSIONS)).toBe(true);
    expect(hasModuleAccess("FUNCIONARIO", "pranchas", DEFAULT_ROLE_PERMISSIONS)).toBe(true);
    expect(hasModuleAccess("FUNCIONARIO", "audit", DEFAULT_ROLE_PERMISSIONS)).toBe(false);
  });

  it("papel ausente do mapa não quebra, só nega acesso", () => {
    expect(
      hasModuleAccess("FUNCIONARIO", "products", { FUNCIONARIO: undefined } as never),
    ).toBe(false);
  });
});

describe("rotuloPapel", () => {
  it("resolve papel fixo, perfil customizado e cai no código como último recurso", () => {
    expect(rotuloPapel("ADMIN")).toBe("Administrador");
    expect(rotuloPapel("FABRICA_GESTOR")).toBe("Gestor da Fábrica");
    expect(rotuloPapel("cabc123", { cabc123: "Compras" })).toBe("Compras");
    expect(rotuloPapel("desconhecido")).toBe("desconhecido");
  });
});
