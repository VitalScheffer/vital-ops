"use client";

import { Network } from "lucide-react";

import { motivoEstrutura, type EstruturaReviewItem } from "@/lib/bom/review";

interface EstruturaPreviewProps {
  itens: EstruturaReviewItem[];
  onToggle: (id: string, included: boolean) => void;
  onQuantidade: (id: string, value: number | null) => void;
}

export function EstruturaPreview({ itens, onToggle, onQuantidade }: EstruturaPreviewProps) {
  if (itens.length === 0) return null;

  const incluidas = itens.filter((i) => i.included).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Network className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Estrutura pai/filho</h3>
          <p className="text-xs text-muted-foreground">
            {incluidas} de {itens.length} relação(ões) incluída(s) — vão para a aba{" "}
            <span className="font-mono">Omie_Produtos_Estrutura</span>
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Incluir</th>
              <th className="px-3 py-2 font-medium">Nº</th>
              <th className="px-3 py-2 font-medium">Produto Pai</th>
              <th className="px-3 py-2 font-medium">Produto Filho</th>
              <th className="px-3 py-2 font-medium">Qtd</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.map((item) => (
              <EstruturaRow key={item.id} item={item} onToggle={onToggle} onQuantidade={onQuantidade} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EstruturaRow({
  item,
  onToggle,
  onQuantidade,
}: {
  item: EstruturaReviewItem;
  onToggle: EstruturaPreviewProps["onToggle"];
  onQuantidade: EstruturaPreviewProps["onQuantidade"];
}) {
  const erro = item.included ? motivoEstrutura(item) : null;

  return (
    <tr className={erro ? "bg-danger-dim/60" : item.included ? undefined : "opacity-60"}>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={item.included}
          onChange={(e) => onToggle(item.id, e.target.checked)}
          aria-label={`Incluir estrutura ${item.codigoPai} → ${item.codigoFilho}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-muted-foreground">
        {item.numeroFilho}
      </td>
      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-foreground">{item.codigoPai}</td>
      <td className="px-3 py-2 align-top">
        <span className="font-mono text-xs text-foreground">{item.codigoFilho}</span>
        <span className="text-muted-foreground"> — {item.descricaoFilho}</span>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-1">
          <input
            type="number"
            min={0}
            step="any"
            value={item.quantidade ?? ""}
            onChange={(e) => onQuantidade(item.id, e.target.value === "" ? null : Number(e.target.value))}
            disabled={!item.included}
            aria-label={`Quantidade de ${item.codigoFilho} em ${item.codigoPai}`}
            aria-invalid={erro ? true : undefined}
            placeholder="—"
            className="w-24 rounded-lg border border-border bg-field px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          {erro && <span className="text-xs text-danger">{erro}</span>}
        </div>
      </td>
    </tr>
  );
}
