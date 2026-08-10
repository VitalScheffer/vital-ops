"use client";

import { AlertTriangle, CheckCircle2, Loader2, PackageSearch, Search } from "lucide-react";

import type { MontagemResult } from "@/app/(app)/produtos/mp-actions";

interface MontagemDestinoProps {
  codigo: string;
  onCodigoChange: (codigo: string) => void;
  onVerificar: () => void;
  verificando: boolean;
  resultado: MontagemResult | null;
  detectadoDoArquivo: boolean;
}

export function MontagemDestino({
  codigo,
  onCodigoChange,
  onVerificar,
  verificando,
  resultado,
  detectadoDoArquivo,
}: MontagemDestinoProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <label htmlFor="montagem-destino" className="flex items-center gap-2 text-sm font-medium text-foreground">
        <PackageSearch className="h-4 w-4 text-primary" />
        Montagem de destino{" "}
        <span className="text-xs font-normal text-muted-foreground">(produto que já existe no Omie)</span>
      </label>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          id="montagem-destino"
          type="text"
          value={codigo}
          onChange={(e) => onCodigoChange(e.target.value)}
          placeholder="Ex.: MSVCH MT001 I0POL (deixe vazio para não pendurar em nada)"
          className="w-full rounded-xl border border-border bg-field px-3 py-2 font-mono text-sm text-foreground outline-none transition-colors placeholder:font-sans placeholder:text-muted-foreground focus:border-primary"
        />
        <button
          type="button"
          onClick={onVerificar}
          disabled={verificando || !codigo.trim()}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-card"
        >
          {verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          Conferir no Omie
        </button>
      </div>

      <p className="mt-1.5 text-xs text-muted-foreground">
        Tudo que estiver no nível de topo da BOM entra como filho dessa montagem, em vez de você adicionar item por item
        no Omie.{" "}
        {detectadoDoArquivo
          ? "Peguei o código do nome do arquivo da BOM; confira antes de enviar."
          : "Se o nome do arquivo da BOM for o código da montagem, ele vem preenchido sozinho."}
      </p>

      <ResultadoMontagem resultado={resultado} />
    </div>
  );
}

function ResultadoMontagem({ resultado }: { resultado: MontagemResult | null }) {
  if (!resultado) return null;

  if (!resultado.ok) {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {resultado.erro}
      </p>
    );
  }

  if (!resultado.existe) {
    return (
      <p className="mt-2 flex items-start gap-1.5 text-xs text-danger">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Não achei <span className="font-mono">{resultado.codigo}</span> no Omie. Confira o código: sem ele cadastrado, as
        relações de nível topo falham uma a uma.
      </p>
    );
  }

  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-success">
      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      Encontrada: <span className="font-mono">{resultado.codigo}</span>
      {resultado.descricao ? ` (${resultado.descricao})` : ""}
    </p>
  );
}
