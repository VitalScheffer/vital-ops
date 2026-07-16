import { describe, expect, it } from "vitest";

import { agruparPorLocal, localEfetivo } from "./locaisPorItem";

describe("localEfetivo", () => {
  it("usa o local do item quando é um código válido", () => {
    expect(localEfetivo("5940905787", "0")).toBe("5940905787");
    expect(localEfetivo(" 111 ", "0")).toBe("111");
  });

  it("cai no local do pedido quando o do item está vazio/ausente/inválido", () => {
    expect(localEfetivo("", "111")).toBe("111");
    expect(localEfetivo(undefined, "111")).toBe("111");
    expect(localEfetivo(null, "111")).toBe("111");
    expect(localEfetivo("abc", "111")).toBe("111");
    expect(localEfetivo("1; DROP TABLE", "111")).toBe("111");
  });
});

describe("agruparPorLocal", () => {
  it("agrupa preservando a ordem dos itens dentro de cada local", () => {
    const itens = [
      { id: "a", local: "1" },
      { id: "b", local: "2" },
      { id: "c", local: "1" },
    ];
    const grupos = agruparPorLocal(itens, (i) => i.local);
    expect([...grupos.keys()]).toEqual(["1", "2"]);
    expect(grupos.get("1")?.map((i) => i.id)).toEqual(["a", "c"]);
    expect(grupos.get("2")?.map((i) => i.id)).toEqual(["b"]);
  });
});
