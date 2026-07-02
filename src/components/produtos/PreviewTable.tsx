"use client";

import { AlertTriangle, Copy, Sparkles } from "lucide-react";

import { Select } from "@/components/ui/Select";
import { DESCRICAO_MAX } from "@/lib/bom/bomParser";
import { FAMILIAS, motivoProduto, type ProdutoReviewItem } from "@/lib/bom/review";
import type { Familia, ParsedItem } from "@/lib/bom/types";

const STATUS_CONFIG = {
  novo: {
    label: "Novo",
    icon: Sparkles,
    classes: "bg-success-dim text-success ring-success/30",
  },
  duplicado: {
    label: "Duplicado",
    icon: Copy,
    classes: "bg-warning-dim text-warning ring-warning/30",
  },
  erro: {
    label: "Erro",
    icon: AlertTriangle,
    classes: "bg-danger-dim text-danger ring-danger/30",
  },
} as const;

function StatusBadge({ status }: { status: ParsedItem["status"] }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cfg.classes}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

interface PreviewTableProps {
  itens: ProdutoReviewItem[];
  onToggle: (id: string, included: boolean) => void;
  onDescricao: (id: string, value: string) => void;
  onFamilia: (id: string, value: Familia | null) => void;
}

export function PreviewTable({ itens, onToggle, onDescricao, onFamilia }: PreviewTableProps) {
  if (itens.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Incluir</th>
              <th className="px-3 py-2 font-medium">Código (SKU)</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Família</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.map((item) => (
              <ProdutoRow
                key={item.id}
                item={item}
                onToggle={onToggle}
                onDescricao={onDescricao}
                onFamilia={onFamilia}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProdutoRow({
  item,
  onToggle,
  onDescricao,
  onFamilia,
}: {
  item: ProdutoReviewItem;
  onToggle: PreviewTableProps["onToggle"];
  onDescricao: PreviewTableProps["onDescricao"];
  onFamilia: PreviewTableProps["onFamilia"];
}) {
  const erro = item.included ? motivoProduto(item) : null;
  const semCodigo = !item.codigo.trim();
  const tamanho = item.descricaoProduto.trim().length;
  const contadorExcedido = tamanho > DESCRICAO_MAX;

  return (
    <tr className={erro ? "bg-danger-dim/60" : item.included ? undefined : "opacity-60"}>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={item.included}
          onChange={(e) => onToggle(item.id, e.target.checked)}
          aria-label={`Incluir ${item.codigo || `linha ${item.linha}`}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>

      <td className="whitespace-nowrap px-3 py-2 align-top font-mono text-xs text-foreground">
        {item.codigo || <span className="not-italic text-muted-foreground">— sem código —</span>}
      </td>

      <td className="px-3 py-2 align-top">
        {semCodigo ? (
          <div className="text-danger">{item.motivoErro ?? "Corrija esta linha na BOM."}</div>
        ) : (
          <div className="flex min-w-[16rem] flex-col gap-1">
            <input
              type="text"
              value={item.descricaoProduto}
              onChange={(e) => onDescricao(item.id, e.target.value)}
              disabled={!item.included}
              aria-label={`Descrição de ${item.codigo}`}
              aria-invalid={erro ? true : undefined}
              className="w-full rounded-lg border border-border bg-field px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              {erro ? <span className="text-danger">{erro}</span> : <span aria-hidden="true" />}
              <span className={contadorExcedido ? "font-medium text-danger" : "text-muted-foreground"}>
                {tamanho}/{DESCRICAO_MAX}
              </span>
            </div>
          </div>
        )}
      </td>

      <td className="px-3 py-2 align-top">
        <Select
          containerClassName="min-w-[13rem]"
          value={item.familia ?? ""}
          onChange={(e) => onFamilia(item.id, e.target.value === "" ? null : (e.target.value as Familia))}
          disabled={!item.included || semCodigo}
          aria-label={`Família de ${item.codigo || `linha ${item.linha}`}`}
        >
          <option value="" className="bg-card text-foreground">
            — não reconhecida
          </option>
          {FAMILIAS.map((familia) => (
            <option key={familia} value={familia} className="bg-card text-foreground">
              {familia}
            </option>
          ))}
        </Select>
      </td>

      <td className="whitespace-nowrap px-3 py-2 align-top">
        <StatusBadge status={item.status} />
      </td>
    </tr>
  );
}
