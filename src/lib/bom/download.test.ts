import { afterEach, describe, expect, it, vi } from "vitest";

import { baixarBlob } from "./download";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("baixarBlob", () => {
  it("mantém o URL vivo até o navegador receber o clique de download", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:arquivo"), revokeObjectURL });
    vi.stubGlobal("document", {
      createElement: vi.fn(() => ({ href: "", download: "", click, remove })),
      body: { appendChild: vi.fn() },
    });

    baixarBlob(new Blob(["conteúdo"]), "resultado.pdf");

    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:arquivo");
  });
});
