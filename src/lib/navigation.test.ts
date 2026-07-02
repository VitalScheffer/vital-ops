import { describe, expect, it } from "vitest";

import { visibleNavFor } from "@/lib/navigation";
import { DEFAULT_ROLE_PERMISSIONS, type RolePermissionsMap } from "@/lib/permissions";
import { canAssignRole, canManageUsers, canViewAudit } from "@/lib/rbac";

const DEFAULT = DEFAULT_ROLE_PERMISSIONS;

describe("visibleNavFor", () => {
  it("FUNCIONARIO vê Início e Produtos (sem Usuários, Auditoria nem Configurações)", () => {
    const keys = visibleNavFor("FUNCIONARIO", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos"]);
  });

  it("GESTOR vê Início, Produtos, Usuários e Auditoria (sem Configurações)", () => {
    const keys = visibleNavFor("GESTOR", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos", "usuarios", "auditoria"]);
  });

  it("ADMIN vê todos os módulos, incluindo Configurações", () => {
    const keys = visibleNavFor("ADMIN", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos", "usuarios", "auditoria", "configuracoes"]);
  });

  it("itens expostos ao cliente não carregam função de visibilidade", () => {
    for (const item of visibleNavFor("ADMIN", DEFAULT)) {
      expect(item).not.toHaveProperty("visibleTo");
    }
  });

  it("respeita permissões customizadas: GESTOR sem Auditoria some do menu", () => {
    const semAuditoria: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR, audit: false },
    };
    const keys = visibleNavFor("GESTOR", semAuditoria).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos", "usuarios"]);
  });

  it("Configurações continua fora do menu de GESTOR mesmo com todos os módulos habilitados", () => {
    const tudoLiberado: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { products: true, users: true, audit: true },
    };
    const keys = visibleNavFor("GESTOR", tudoLiberado).map((item) => item.key);
    expect(keys).not.toContain("configuracoes");
  });
});

describe("rbac", () => {
  it("gestão de usuários/auditoria é de ADMIN e GESTOR por padrão", () => {
    expect(canManageUsers("ADMIN", DEFAULT)).toBe(true);
    expect(canManageUsers("GESTOR", DEFAULT)).toBe(true);
    expect(canManageUsers("FUNCIONARIO", DEFAULT)).toBe(false);
    expect(canViewAudit("FUNCIONARIO", DEFAULT)).toBe(false);
  });

  it("só ADMIN concede o papel ADMIN", () => {
    expect(canAssignRole("ADMIN", "ADMIN", DEFAULT)).toBe(true);
    expect(canAssignRole("GESTOR", "ADMIN", DEFAULT)).toBe(false);
    expect(canAssignRole("GESTOR", "GESTOR", DEFAULT)).toBe(true);
    expect(canAssignRole("GESTOR", "FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canAssignRole("FUNCIONARIO", "FUNCIONARIO", DEFAULT)).toBe(false);
  });
});
