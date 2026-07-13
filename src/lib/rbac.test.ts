import { describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS, type RolePermissionsMap } from "@/lib/permissions";
import { canEditUser, canManageUsers, canViewAudit, canViewPranchas, wouldRemoveLastAdmin } from "@/lib/rbac";

const DEFAULT = DEFAULT_ROLE_PERMISSIONS;

describe("canEditUser", () => {
  it("FUNCIONARIO nunca edita ninguém", () => {
    expect(canEditUser("FUNCIONARIO", "FUNCIONARIO", DEFAULT)).toBe(false);
    expect(canEditUser("FUNCIONARIO", "GESTOR", DEFAULT)).toBe(false);
  });

  it("GESTOR edita FUNCIONARIO e GESTOR, mas NÃO edita ADMIN", () => {
    expect(canEditUser("GESTOR", "FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canEditUser("GESTOR", "GESTOR", DEFAULT)).toBe(true);
    expect(canEditUser("GESTOR", "ADMIN", DEFAULT)).toBe(false);
  });

  it("ADMIN edita qualquer papel, inclusive outro ADMIN", () => {
    expect(canEditUser("ADMIN", "FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canEditUser("ADMIN", "GESTOR", DEFAULT)).toBe(true);
    expect(canEditUser("ADMIN", "ADMIN", DEFAULT)).toBe(true);
  });

  it("sem acesso ao módulo 'users', GESTOR perde a edição mesmo de FUNCIONARIO", () => {
    const semUsuarios: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR, users: false },
    };
    expect(canEditUser("GESTOR", "FUNCIONARIO", semUsuarios)).toBe(false);
  });
});

describe("canManageUsers / canViewAudit (configuráveis por RolePermission)", () => {
  it("padrão: ADMIN e GESTOR gerenciam usuários e veem auditoria; FUNCIONARIO não", () => {
    expect(canManageUsers("ADMIN", DEFAULT)).toBe(true);
    expect(canManageUsers("GESTOR", DEFAULT)).toBe(true);
    expect(canManageUsers("FUNCIONARIO", DEFAULT)).toBe(false);
    expect(canViewAudit("ADMIN", DEFAULT)).toBe(true);
    expect(canViewAudit("GESTOR", DEFAULT)).toBe(true);
    expect(canViewAudit("FUNCIONARIO", DEFAULT)).toBe(false);
  });

  it("admin pode tirar a Auditoria do GESTOR sem afetar Usuários", () => {
    const semAuditoria: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR, audit: false },
    };
    expect(canViewAudit("GESTOR", semAuditoria)).toBe(false);
    expect(canManageUsers("GESTOR", semAuditoria)).toBe(true);
  });
});

describe("canViewPranchas (configurável por RolePermission)", () => {
  it("por padrão todos os papéis acessam Pranchas", () => {
    expect(canViewPranchas("ADMIN", DEFAULT)).toBe(true);
    expect(canViewPranchas("GESTOR", DEFAULT)).toBe(true);
    expect(canViewPranchas("FUNCIONARIO", DEFAULT)).toBe(true);
  });

  it("pode retirar Pranchas sem retirar Produtos", () => {
    const semPranchas: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR, pranchas: false },
    };
    expect(canViewPranchas("GESTOR", semPranchas)).toBe(false);
  });
});

describe("wouldRemoveLastAdmin", () => {
  const base = {
    targetIsAdmin: true,
    targetIsActive: true,
    activeAdminCount: 1,
    nextRole: "ADMIN" as const,
    nextActive: true,
  };

  it("bloqueia rebaixar o único ADMIN ativo", () => {
    expect(wouldRemoveLastAdmin({ ...base, nextRole: "GESTOR" })).toBe(true);
  });

  it("bloqueia desativar o único ADMIN ativo", () => {
    expect(wouldRemoveLastAdmin({ ...base, nextActive: false })).toBe(true);
  });

  it("permite rebaixar quando há outro ADMIN ativo", () => {
    expect(
      wouldRemoveLastAdmin({ ...base, activeAdminCount: 2, nextRole: "GESTOR" }),
    ).toBe(false);
  });

  it("permite quando o alvo continua ADMIN e ativo", () => {
    expect(wouldRemoveLastAdmin(base)).toBe(false);
  });

  it("ignora quando o alvo não é ADMIN ativo hoje", () => {
    expect(
      wouldRemoveLastAdmin({
        ...base,
        targetIsAdmin: false,
        nextRole: "FUNCIONARIO",
      }),
    ).toBe(false);
    expect(
      wouldRemoveLastAdmin({
        ...base,
        targetIsActive: false,
        nextActive: false,
      }),
    ).toBe(false);
  });
});
