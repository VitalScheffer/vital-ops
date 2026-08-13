"use client";

import { AlertTriangle, CheckCircle2, Layers } from "lucide-react";

import { MateriaPrimaSelect } from "@/components/produtos/MateriaPrimaSelect";
import { motivoMateriaPrima, type MateriaPrimaReviewItem } from "@/lib/bom/review";
import type { ItemMat } from "@/lib/produtos/materiaPrima";

interface MateriaPrimaTableProps {
  itens: MateriaPrimaReviewItem[];
  catalogo: readonly ItemMat[];
  onToggle: (id: string, included: boolean) => void;
  onEscolherMat: (id: string, codigoMat: string) => void;
  onQuantidade: (id: string, quantidade: number | null) => void;
  onRecarregarCatalogo: () => void;
  recarregandoCatalogo: boolean;
}

export function MateriaPrimaTable({
  itens,
  catalogo,
  onToggle,
  onEscolherMat,
  onQuantidade,
  onRecarregarCatalogo,
  recarregandoCatalogo,
}: MateriaPrimaTableProps) {
  if (itens.length === 0) return null;

  const incluidas = itens.filter((i) => i.included).length;

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Layers className="h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">Matéria-prima das peças</h3>
          <p className="text-xs text-muted-foreground">
            {incluidas} de {itens.length} peça(s) com a matéria-prima confirmada. Cada uma vira uma linha da estrutura
            da própria peça, com o consumo de UMA peça na unidade do cadastro no Omie (KG no aço, M no perfil de
            borracha, M² no tecido).
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Incluir</th>
              <th className="px-3 py-2 font-medium">Peça</th>
              <th className="px-3 py-2 font-medium">Especificação da BOM</th>
              <th className="px-3 py-2 font-medium">Matéria-prima no Omie</th>
              <th className="px-3 py-2 font-medium">Qtd por peça</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {itens.map((item) => (
              <LinhaMateriaPrima
                key={item.id}
                item={item}
                catalogo={catalogo}
                onToggle={onToggle}
                onEscolherMat={onEscolherMat}
                onQuantidade={onQuantidade}
                onRecarregarCatalogo={onRecarregarCatalogo}
                recarregandoCatalogo={recarregandoCatalogo}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LinhaMateriaPrima({
  item,
  catalogo,
  onToggle,
  onEscolherMat,
  onQuantidade,
  onRecarregarCatalogo,
  recarregandoCatalogo,
}: {
  item: MateriaPrimaReviewItem;
  catalogo: readonly ItemMat[];
  onToggle: MateriaPrimaTableProps["onToggle"];
  onEscolherMat: MateriaPrimaTableProps["onEscolherMat"];
  onQuantidade: MateriaPrimaTableProps["onQuantidade"];
  onRecarregarCatalogo: MateriaPrimaTableProps["onRecarregarCatalogo"];
  recarregandoCatalogo: boolean;
}) {
  const erro = item.included ? motivoMateriaPrima(item) : null;
  const aviso = !erro && item.motivo ? item.motivo : null;

  return (
    <tr className={erro ? "bg-danger-dim/60" : item.included ? undefined : "opacity-70"}>
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={item.included}
          onChange={(e) => onToggle(item.id, e.target.checked)}
          aria-label={`Incluir matéria-prima de ${item.codigoPeca}`}
          className="h-4 w-4 cursor-pointer accent-primary"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <span className="font-mono text-xs text-foreground">{item.codigoPeca}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{item.descricaoPeca}</span>
      </td>
      <td className="px-3 py-2 align-top text-xs text-muted-foreground">
        {item.especificacao || <span className="italic">sem especificação na BOM</span>}
      </td>
      <td className="px-3 py-2 align-top">
        <MateriaPrimaSelect
          value={item.codigoMat}
          catalogo={catalogo}
          onChange={(codigoMat) => onEscolherMat(item.id, codigoMat)}
          ariaLabel={`Matéria-prima de ${item.codigoPeca}`}
          invalido={erro !== null}
          onRecarregar={onRecarregarCatalogo}
          recarregando={recarregandoCatalogo}
        />
        <StatusMateriaPrima item={item} erro={erro} aviso={aviso} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            step="any"
            value={item.quantidade ?? ""}
            onChange={(e) => onQuantidade(item.id, e.target.value === "" ? null : Number(e.target.value))}
            disabled={!item.included}
            aria-label={
              item.unidadeMat
                ? `Quantidade em ${item.unidadeMat} de matéria-prima de ${item.codigoPeca}`
                : `Quantidade de matéria-prima de ${item.codigoPeca}`
            }
            placeholder="0,000"
            className="w-24 rounded-lg border border-border bg-field px-2.5 py-1.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
          />
          {/* A unidade é a do cadastro no Omie, não uma escolha da tela: sem ela
              à vista, "0,842" no perfil de borracha se lê como quilo. */}
          <span className="w-8 shrink-0 text-xs font-medium text-muted-foreground">{item.unidadeMat}</span>
        </div>
      </td>
    </tr>
  );
}

function StatusMateriaPrima({
  item,
  erro,
  aviso,
}: {
  item: MateriaPrimaReviewItem;
  erro: string | null;
  aviso: string | null;
}) {
  if (erro) {
    return (
      <span className="mt-1 flex items-start gap-1 text-xs text-danger">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        {erro}
      </span>
    );
  }
  if (aviso) {
    return (
      <span className="mt-1 flex items-start gap-1 text-xs text-warning">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        {aviso}
      </span>
    );
  }
  if (item.confianca === "exata") {
    return (
      <span className="mt-1 flex items-center gap-1 text-xs text-success">
        <CheckCircle2 className="h-3 w-3 shrink-0" />
        Bate exato com a especificação da BOM.
      </span>
    );
  }
  return null;
}
