import { describe, expect, it } from "vitest";

import {
  CHANGELOG,
  novidadesDesde,
  versaoDaEntrada,
  VERSAO_ATUAL,
  type ChangelogEntry,
} from "@/lib/changelog";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

describe("CHANGELOG", () => {
  it("não está vazio", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("toda entrada tem data válida, título e ao menos um item", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(DATE_RE);
      expect(entry.title.trim().length).toBeGreaterThan(0);
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(item.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("datas em ordem cronológica decrescente (mais recente primeiro)", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(CHANGELOG[i - 1].date >= CHANGELOG[i].date).toBe(true);
    }
  });

  // A versão é derivada de (data + título). Se duas entradas colidirem, o aviso
  // de versão nova para de aparecer em silêncio — daí este teste ser obrigatório.
  it("nenhuma entrada gera versão duplicada", () => {
    const versoes = CHANGELOG.map(versaoDaEntrada);
    expect(new Set(versoes).size).toBe(versoes.length);
  });
});

describe("VERSAO_ATUAL", () => {
  it("é a entrada mais recente do changelog", () => {
    expect(VERSAO_ATUAL).toBe(versaoDaEntrada(CHANGELOG[0]));
  });
});

describe("novidadesDesde", () => {
  const entrada = (date: string, title: string): ChangelogEntry => ({
    date,
    title,
    items: ["x"],
  });

  it("não devolve nada quando o navegador já está na versão publicada", () => {
    expect(novidadesDesde(VERSAO_ATUAL)).toEqual([]);
  });

  it("devolve só o que entrou depois da versão do navegador", () => {
    const terceira = versaoDaEntrada(CHANGELOG[2]);
    const novidades = novidadesDesde(terceira);
    expect(novidades).toHaveLength(2);
    expect(novidades[0]).toEqual(CHANGELOG[0]);
    expect(novidades[1]).toEqual(CHANGELOG[1]);
    // A própria versão do navegador não entra: ela já foi vista.
    expect(novidades.map(versaoDaEntrada)).not.toContain(terceira);
  });

  it("sem versão de origem, não mostra nada", () => {
    // Primeiro carregamento / navegador sem a constante: não faz sentido avisar.
    expect(novidadesDesde(null)).toEqual([]);
    expect(novidadesDesde("")).toEqual([]);
  });

  it("versão desconhecida mostra só a mais recente, não o changelog inteiro", () => {
    // Entrada renomeada depois de publicada, ou aba aberta há muitas versões.
    const novidades = novidadesDesde(versaoDaEntrada(entrada("2020-01-01", "sumiu")));
    expect(novidades).toEqual([CHANGELOG[0]]);
  });
});
