"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";

import { relatorioRequisicoes } from "@/app/(app)/requisicoes/actions";
import { baixarBlob } from "@/lib/bom/download";
import { montarLinhasRelatorio } from "@/lib/requisicoes/relatorio";

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

function hojeISO(): string {
  const agora = new Date();
  const ano = agora.getFullYear();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function primeiroDiaDoMesISO(): string {
  return `${hojeISO().slice(0, 8)}01`;
}

function isoParaBR(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

// Relatório em PDF do que foi solicitado/aprovado/recusado no período
// (gestor/admin). Os dados vêm da Server Action; o PDF é gerado no navegador
// (pdf-lib, mesmo esquema do módulo Pranchas) e baixado na hora.
export function RelatorioRequisicoes() {
  const [de, setDe] = useState(primeiroDiaDoMesISO);
  const [ate, setAte] = useState(hojeISO);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const dados = await relatorioRequisicoes({ de, ate });
      if (!dados.ok) {
        setErro(dados.erro ?? "Não consegui gerar o relatório.");
        return;
      }
      const geradoEm = new Intl.DateTimeFormat("pt-BR", {
        timeZone: "America/Sao_Paulo",
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date());
      const linhas = montarLinhasRelatorio(dados.requisicoes, { de: isoParaBR(de), ate: isoParaBR(ate) }, geradoEm);
      const { gerarRelatorioPdf } = await import("@/lib/requisicoes/relatorioPdf");
      const bytes = await gerarRelatorioPdf(linhas);
      baixarBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `Relatorio_Requisicoes_${de}_a_${ate}.pdf`,
      );
    } catch {
      setErro("Não consegui gerar o PDF. Tente novamente.");
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          De
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-card-foreground">
          Até
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputClass} />
        </label>
        <button
          type="button"
          onClick={gerar}
          disabled={gerando || !de || !ate}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          <FileDown className="h-4 w-4" />
          {gerando ? "Gerando…" : "Baixar relatório (PDF)"}
        </button>
      </div>
      {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
    </div>
  );
}
