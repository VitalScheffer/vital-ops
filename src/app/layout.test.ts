import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const caminhoLayout = path.join(process.cwd(), "src", "app", "layout.tsx");
const caminhoScriptTema = path.join(process.cwd(), "public", "theme-init.js");

async function aplicarTema(salvo: Record<string, string | null>) {
  const setAttribute = vi.fn();
  const script = await readFile(caminhoScriptTema, "utf8");
  vm.runInNewContext(script, {
    localStorage: { getItem: (chave: string) => salvo[chave] ?? null },
    document: { documentElement: { setAttribute } },
  });
  return setAttribute;
}

describe("inicializador de tema", () => {
  it("é um arquivo estático, sem injeção de HTML no layout", async () => {
    const layout = await readFile(caminhoLayout, "utf8");

    expect(layout).not.toContain("dangerouslySetInnerHTML");
    expect(layout).toContain('src="/theme-init.js"');
  });

  it("aplica somente os valores de tema permitidos", async () => {
    const permitido = await aplicarTema({ "vs-theme": "dark", "vs-sparkle": "on" });
    expect(permitido).toHaveBeenCalledWith("data-theme", "dark");
    expect(permitido).toHaveBeenCalledWith("data-sparkle", "on");

    const malicioso = await aplicarTema({ "vs-theme": '<img src=x onerror=alert(1)>', "vs-sparkle": "<script>" });
    expect(malicioso).not.toHaveBeenCalled();
  });
});
