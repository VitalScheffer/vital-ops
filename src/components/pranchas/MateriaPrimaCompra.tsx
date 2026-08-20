"use client";

import { AlertTriangle, Layers } from "lucide-react";

import type { LinhaMateriaPrima } from "@/lib/pranchas/chapas";

// Tabela do Modo 2: a matéria-prima que as PEÇAS da BOM consomem, somada por
// item do Omie. O que interessa em compra é a última coluna (chapas inteiras);
// as do meio ficam à vista de propósito, para a conta poder ser conferida na
// mão sem abrir o código.

function numero(valor: number, casas = 3): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

interface Props {
  linhas: readonly LinhaMateriaPrima[];
}

export function MateriaPrimaCompra({ linhas }: Props) {
  if (linhas.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        Nenhuma peça com matéria-prima nesta BOM.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">Material</th>
            <th className="w-20 px-4 py-2.5 font-medium">Un.</th>
            <th className="w-28 px-4 py-2.5 text-right font-medium">Total</th>
            <th className="w-24 px-4 py-2.5 text-right font-medium">m²</th>
            <th className="w-32 px-4 py-2.5 text-right font-medium">Chapas a comprar</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.id} className="border-b border-border/60 last:border-0 align-top">
              <td className="px-4 py-2.5">
                <span className="font-medium text-card-foreground">
                  {l.codigoMat || "sem matéria-prima resolvida"}
                </span>
                {l.descricaoMat && (
                  <div className="text-xs text-muted-foreground">{l.descricaoMat}</div>
                )}
                <div className="mt-0.5 text-xs text-muted-foreground/80">
                  Peças: {l.pecas.join(", ")}
                </div>
                {l.motivo && (
                  <div className="mt-1 flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{l.motivo}</span>
                  </div>
                )}
                {!l.motivo && !l.densidadeConfirmada && (
                  <div className="mt-1 text-xs text-warning">
                    m² calculado com densidade estimada ({numero(l.densidade ?? 0, 0)} kg/m³): confira
                    a ficha do fornecedor antes de fechar a compra.
                  </div>
                )}
              </td>
              <td className="px-4 py-2.5 text-muted-foreground">{l.unidade || "—"}</td>
              <td className="px-4 py-2.5 text-right text-card-foreground">
                {l.quantidade === null ? "—" : numero(l.quantidade)}
              </td>
              <td className="px-4 py-2.5 text-right text-muted-foreground">
                {l.areaM2 === null ? "—" : numero(l.areaM2)}
              </td>
              <td className="px-4 py-2.5 text-right">
                {l.chapas === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-card-foreground">
                    <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                    {l.chapas}
                    {l.medida && (
                      <span className="text-xs font-normal text-muted-foreground">
                        de {l.medida.larguraMm}x{l.medida.comprimentoMm}
                      </span>
                    )}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
