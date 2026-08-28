import { describe, expect, it } from "vitest";

import type { RolePermissionsMap } from "@/lib/permissions";
import { canDecideRequisicao, canViewProjetos } from "@/lib/rbac";

import { idsParaNotificar, type UsuarioParaNotificar } from "../destinatarios";

const permissions: RolePermissionsMap = {
  ADMIN: {
    products: true,
    pranchas: true,
    configurador: true,
    projetos: true,
    requisicoes: true,
    baixas: true,
    movimentacoes: true,
    depara: true,
    users: true,
    audit: true,
  },
  GESTOR: {
    products: true,
    pranchas: true,
    configurador: true,
    projetos: true,
    requisicoes: true,
    baixas: true,
    movimentacoes: true,
    depara: true,
    users: true,
    audit: true,
  },
  FUNCIONARIO: {
    products: true,
    pranchas: true,
    configurador: true,
    projetos: false,
    requisicoes: true,
    baixas: true,
    movimentacoes: true,
    depara: true,
    users: false,
    audit: false,
  },
  FABRICA_GESTOR: {
    products: false,
    pranchas: false,
    configurador: false,
    projetos: false,
    requisicoes: true,
    baixas: false,
    movimentacoes: false,
    depara: false,
    users: false,
    audit: false,
  },
};

const usuarios: UsuarioParaNotificar[] = [
  { id: "admin-1", role: "ADMIN", active: true },
  { id: "gestor-1", role: "GESTOR", active: true },
  { id: "gestor-inativo", role: "GESTOR", active: false },
  { id: "func-1", role: "FUNCIONARIO", active: true },
  { id: "fabrica-gestor-1", role: "FABRICA_GESTOR", active: true },
];

describe("idsParaNotificar", () => {
  it("canDecideRequisicao inclui ADMIN, GESTOR e FABRICA_GESTOR ativos, exclui FUNCIONARIO", () => {
    const destinatarios = idsParaNotificar(usuarios, permissions, canDecideRequisicao);
    expect(destinatarios.sort()).toEqual(["admin-1", "fabrica-gestor-1", "gestor-1"].sort());
  });

  it("ignora usuário inativo mesmo com papel que decide", () => {
    const destinatarios = idsParaNotificar(usuarios, permissions, canDecideRequisicao);
    expect(destinatarios).not.toContain("gestor-inativo");
  });

  it("canViewProjetos inclui só ADMIN e GESTOR (FABRICA_GESTOR não vê Projetos)", () => {
    const destinatarios = idsParaNotificar(usuarios, permissions, canViewProjetos);
    expect(destinatarios.sort()).toEqual(["admin-1", "gestor-1"].sort());
  });

  it("excluirId tira o próprio ator da lista (ex.: um GESTOR que criou a requisição)", () => {
    const destinatarios = idsParaNotificar(usuarios, permissions, canDecideRequisicao, {
      excluirId: "gestor-1",
    });
    expect(destinatarios).not.toContain("gestor-1");
    expect(destinatarios).toContain("admin-1");
  });

  it("lista vazia → sem destinatários", () => {
    expect(idsParaNotificar([], permissions, canDecideRequisicao)).toEqual([]);
  });
});
