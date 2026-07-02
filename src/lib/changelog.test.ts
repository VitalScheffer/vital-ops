import { describe, expect, it } from "vitest";

import { CHANGELOG } from "@/lib/changelog";

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
});
