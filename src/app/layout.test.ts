import { readFile } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const caminhoLayout = path.join(process.cwd(), "src", "app", "layout.tsx");
const caminhoScriptTema = path.join(process.cwd(), "public", "theme-init.js");

async function aplicarTema(salvo: Record<string, string | null>, falharAoLer = false) {
  const setAttribute = vi.fn();
  const warn = vi.fn();
  const script = await readFile(caminhoScriptTema, "utf8");
  vm.runInNewContext(script, {
    localStorage: { getItem: (chave: string) => (falharAoLer ? (() => { throw new Error("storage bloqueado"); })() : salvo[chave] ?? null) },
    document: { documentElement: { setAttribute } },
    console: { warn },
  });
  return { setAttribute, warn };
}

describe("inicializador de tema", () => {
  it("é um arquivo estático, sem injeção de HTML no layout", async () => {
    const layout = await readFile(caminhoLayout, "utf8");

    expect(layout).not.toContain("dangerouslySetInnerHTML");
    expect(layout).toContain('src="/theme-init.js"');
  });

  it("aplica somente os valores de tema permitidos", async () => {
    const permitido = await aplicarTema({ "vs-theme": "dark", "vs-sparkle": "on" });
    expect(permitido.setAttribute).toHaveBeenCalledWith("data-theme", "dark");
    expect(permitido.setAttribute).toHaveBeenCalledWith("data-sparkle", "on");

    const malicioso = await aplicarTema({ "vs-theme": '<img src=x onerror=alert(1)>', "vs-sparkle": "<script>" });
    expect(malicioso.setAttribute).not.toHaveBeenCalled();
  });

  it("registra a indisponibilidade do storage sem impedir o carregamento", async () => {
    const resultado = await aplicarTema({}, true);

    expect(resultado.setAttribute).not.toHaveBeenCalled();
    expect(resultado.warn).toHaveBeenCalledWith("[theme-init] localStorage indisponivel; mantendo o tema do sistema.");
  });
});
