import { describe, expect, it } from "vitest";

import { visibleNavFor } from "@/lib/navigation";
import { DEFAULT_ROLE_PERMISSIONS, type RolePermissionsMap } from "@/lib/permissions";
import {
  canAssignRole,
  canCancelRequisicao,
  canDecideRequisicao,
  canManageUsers,
  canViewAudit,
  canViewBaixas,
  canViewConfigurador,
  canViewPranchas,
  canViewProjetos,
  canViewRequisicoes,
} from "@/lib/rbac";

const DEFAULT = DEFAULT_ROLE_PERMISSIONS;

describe("visibleNavFor", () => {
  it("FUNCIONARIO vê os módulos operacionais (sem Usuários, Auditoria nem Configurações)", () => {
    const keys = visibleNavFor("FUNCIONARIO", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos", "pranchas", "configurador", "requisicoes", "baixas"]);
  });

  it("FABRICA vê SÓ Início e Requisições", () => {
    const keys = visibleNavFor("FABRICA", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "requisicoes"]);
  });

  it("FABRICA_GESTOR também vê SÓ Início e Requisições", () => {
    const keys = visibleNavFor("FABRICA_GESTOR", DEFAULT).map((item) => item.key);
    expect(keys).toEqual(["home", "requisicoes"]);
  });

  it("GESTOR vê tudo menos Configurações", () => {
    const keys = visibleNavFor("GESTOR", DEFAULT).map((item) => item.key);
    expect(keys).toEqual([
      "home",
      "produtos",
      "pranchas",
      "configurador",
      "projetos",
      "requisicoes",
      "baixas",
      "usuarios",
      "auditoria",
    ]);
  });

  it("ADMIN vê todos os módulos, incluindo Configurações", () => {
    const keys = visibleNavFor("ADMIN", DEFAULT).map((item) => item.key);
    expect(keys).toEqual([
      "home",
      "produtos",
      "pranchas",
      "configurador",
      "projetos",
      "requisicoes",
      "baixas",
      "usuarios",
      "auditoria",
      "configuracoes",
    ]);
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
    expect(keys).toEqual([
      "home",
      "produtos",
      "pranchas",
      "configurador",
      "projetos",
      "requisicoes",
      "baixas",
      "usuarios",
    ]);
  });

  it("respeita permissões customizadas: Pranchas some sem afetar Produtos", () => {
    const semPranchas: RolePermissionsMap = {
      ...DEFAULT,
      FUNCIONARIO: { ...DEFAULT.FUNCIONARIO, pranchas: false },
    };
    const keys = visibleNavFor("FUNCIONARIO", semPranchas).map((item) => item.key);
    expect(keys).toEqual(["home", "produtos", "configurador", "requisicoes", "baixas"]);
  });

  it("Configurações continua fora do menu de GESTOR mesmo com todos os módulos habilitados", () => {
    const tudoLiberado: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR },
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
    expect(canViewPranchas("FUNCIONARIO", DEFAULT)).toBe(true);
  });

  it("só ADMIN concede o papel ADMIN", () => {
    expect(canAssignRole("ADMIN", "ADMIN", DEFAULT)).toBe(true);
    expect(canAssignRole("GESTOR", "ADMIN", DEFAULT)).toBe(false);
    expect(canAssignRole("GESTOR", "GESTOR", DEFAULT)).toBe(true);
    expect(canAssignRole("GESTOR", "FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canAssignRole("GESTOR", "FABRICA", DEFAULT)).toBe(true);
    expect(canAssignRole("FUNCIONARIO", "FUNCIONARIO", DEFAULT)).toBe(false);
  });

  it("requisições: todo mundo com o módulo solicita, mas só GESTOR/ADMIN/FABRICA_GESTOR decide", () => {
    expect(canViewRequisicoes("FABRICA", DEFAULT)).toBe(true);
    expect(canViewRequisicoes("FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canDecideRequisicao("ADMIN", DEFAULT)).toBe(true);
    expect(canDecideRequisicao("GESTOR", DEFAULT)).toBe(true);
    expect(canDecideRequisicao("FABRICA_GESTOR", DEFAULT)).toBe(true);
    expect(canDecideRequisicao("FUNCIONARIO", DEFAULT)).toBe(false);
    expect(canDecideRequisicao("FABRICA", DEFAULT)).toBe(false);
  });

  it("decidir exige o módulo além do papel: GESTOR sem requisições não decide", () => {
    const semRequisicoes: RolePermissionsMap = {
      ...DEFAULT,
      GESTOR: { ...DEFAULT.GESTOR, requisicoes: false },
    };
    expect(canDecideRequisicao("GESTOR", semRequisicoes)).toBe(false);
  });

  it("excluir requisição: mesma régua de quem decide (Gestor da Fábrica pode; solicitante não)", () => {
    expect(canCancelRequisicao("FABRICA_GESTOR", DEFAULT)).toBe(true);
    expect(canCancelRequisicao("GESTOR", DEFAULT)).toBe(true);
    expect(canCancelRequisicao("ADMIN", DEFAULT)).toBe(true);
    expect(canCancelRequisicao("FABRICA", DEFAULT)).toBe(false);
    expect(canCancelRequisicao("FUNCIONARIO", DEFAULT)).toBe(false);
  });

  it("configurador: papéis de fábrica não têm por padrão (é módulo do comercial)", () => {
    expect(canViewConfigurador("FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canViewConfigurador("FABRICA", DEFAULT)).toBe(false);
    expect(canViewConfigurador("FABRICA_GESTOR", DEFAULT)).toBe(false);
  });

  it("configurador é liberável por perfil customizado (o caso do Comercial)", () => {
    const comercial: RolePermissionsMap = {
      ...DEFAULT,
      "perfil-comercial": {
        products: false,
        pranchas: false,
        configurador: true,
        projetos: false,
        requisicoes: false,
        baixas: false,
        users: false,
        audit: false,
      },
    };
    expect(canViewConfigurador("perfil-comercial", comercial)).toBe(true);
    const keys = visibleNavFor("perfil-comercial", comercial).map((item) => item.key);
    expect(keys).toEqual(["home", "configurador"]);
  });

  it("os dois lados do fluxo são separáveis: perfil de Projetos vê só a fila", () => {
    const projetos: RolePermissionsMap = {
      ...DEFAULT,
      "perfil-projetos": {
        products: false,
        pranchas: false,
        configurador: false,
        projetos: true,
        requisicoes: false,
        baixas: false,
        users: false,
        audit: false,
      },
    };
    expect(canViewProjetos("perfil-projetos", projetos)).toBe(true);
    expect(canViewConfigurador("perfil-projetos", projetos)).toBe(false);
    const keys = visibleNavFor("perfil-projetos", projetos).map((item) => item.key);
    expect(keys).toEqual(["home", "projetos"]);
  });

  it("fila de Projetos não vai para papéis de fábrica nem para funcionário por padrão", () => {
    expect(canViewProjetos("ADMIN", DEFAULT)).toBe(true);
    expect(canViewProjetos("GESTOR", DEFAULT)).toBe(true);
    expect(canViewProjetos("FUNCIONARIO", DEFAULT)).toBe(false);
    expect(canViewProjetos("FABRICA", DEFAULT)).toBe(false);
  });

  it("baixas por planilha: FABRICA não tem por padrão", () => {
    expect(canViewBaixas("FUNCIONARIO", DEFAULT)).toBe(true);
    expect(canViewBaixas("FABRICA", DEFAULT)).toBe(false);
  });
});
