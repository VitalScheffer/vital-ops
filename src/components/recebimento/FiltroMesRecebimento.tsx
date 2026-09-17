"use client";

import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type CriterioMesRecebimento = "inclusao" | "emissao";

interface FiltroMesRecebimentoProps {
  criterioInicial: CriterioMesRecebimento;
  limiteInicial: 10 | 25 | 50;
  mesAtual: string;
  mesInicial: string;
  mesMaisAntigoOmie: string | null;
}

function rotuloMes(mes: string): string {
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(`${mes}-01T12:00:00.000Z`));
}

function anoDe(mes: string): number {
  return Number(mes.slice(0, 4));
}

function chaveMes(ano: number, indice: number): string {
  return `${ano}-${String(indice + 1).padStart(2, "0")}`;
}

export function FiltroMesRecebimento({
  criterioInicial,
  limiteInicial,
  mesAtual,
  mesInicial,
  mesMaisAntigoOmie,
}: FiltroMesRecebimentoProps) {
  const [aberto, setAberto] = useState(false);
  const [criterio, setCriterio] = useState<CriterioMesRecebimento>(criterioInicial);
  const [mes, setMes] = useState(mesInicial);
  const [anoVisivel, setAnoVisivel] = useState(anoDe(mesInicial));
  const menorMes = criterio === "emissao" ? mesMaisAntigoOmie : null;

  function escolherCriterio(proximo: CriterioMesRecebimento) {
    setCriterio(proximo);
    if (proximo === "emissao" && mesMaisAntigoOmie && mes < mesMaisAntigoOmie) {
      setMes(mesMaisAntigoOmie);
      setAnoVisivel(anoDe(mesMaisAntigoOmie));
    }
  }

  function escolherMes(proximo: string) {
    setMes(proximo);
    setAberto(false);
  }

  const podeIrParaAnoAnterior = !menorMes || anoVisivel > anoDe(menorMes);

  return (
    <form action="/recebimento" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <input name="mes" type="hidden" value={mes} />
      <input name="criterio" type="hidden" value={criterio} />

      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium text-muted-foreground">Filtrar por</legend>
        <div className="flex rounded-lg border border-border bg-[#101b1e] p-1 text-xs">
          <button type="button" aria-pressed={criterio === "inclusao"} onClick={() => escolherCriterio("inclusao")} className={`rounded-md px-2.5 py-1.5 ${criterio === "inclusao" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-card-foreground"}`}>
            Inclusão
          </button>
          <button type="button" aria-pressed={criterio === "emissao"} onClick={() => escolherCriterio("emissao")} className={`rounded-md px-2.5 py-1.5 ${criterio === "emissao" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-card-foreground"}`}>
            Emissão da NF
          </button>
        </div>
      </fieldset>

      <div className="relative flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">Mês</span>
        <button type="button" aria-haspopup="dialog" aria-expanded={aberto} aria-label={`Selecionar mês: ${rotuloMes(mes)}`} onClick={() => setAberto((atual) => !atual)} className="inline-flex min-w-44 items-center justify-between gap-2 rounded-lg border border-border bg-[#101b1e] px-3 py-2 text-sm capitalize text-card-foreground outline-none focus-visible:border-primary">
          <span className="inline-flex items-center gap-2"><Calendar className="h-4 w-4 text-primary" /> {rotuloMes(mes)}</span>
          <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${aberto ? "rotate-90" : ""}`} />
        </button>
        {aberto ? (
          <div role="dialog" aria-label="Selecionar mês e ano" className="absolute left-0 top-full z-20 mt-1 w-72 rounded-xl border border-border bg-[#101b1e] p-3 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" aria-label="Ano anterior" disabled={!podeIrParaAnoAnterior} onClick={() => setAnoVisivel((ano) => ano - 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-semibold text-card-foreground">{anoVisivel}</span>
              <button type="button" aria-label="Próximo ano" disabled={anoVisivel >= anoDe(mesAtual)} onClick={() => setAnoVisivel((ano) => ano + 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-card-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              {MESES.map((nome, indice) => {
                const opcao = chaveMes(anoVisivel, indice);
                const indisponivel = opcao > mesAtual || (menorMes !== null && opcao < menorMes);
                return <button key={opcao} type="button" disabled={indisponivel} onClick={() => escolherMes(opcao)} className={`rounded-md px-2 py-2 text-xs font-medium ${opcao === mes ? "bg-primary text-primary-foreground" : "text-card-foreground hover:bg-muted"} disabled:cursor-not-allowed disabled:opacity-35`}>{nome}</button>;
              })}
            </div>
          </div>
        ) : null}
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        Lista
        <select name="limite" defaultValue={String(limiteInicial)} style={{ colorScheme: "dark" }} className="rounded-lg border border-border bg-[#101b1e] px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary">
          {[10, 25, 50].map((opcao) => <option key={opcao} value={opcao} className="bg-[#101b1e] text-white">{opcao} NFs por página</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
        Aplicar
      </button>
      <p className="max-w-72 pb-2 text-xs text-muted-foreground">
        {criterio === "emissao" && mesMaisAntigoOmie ? `Notas disponíveis desde ${rotuloMes(mesMaisAntigoOmie)}.` : "Use o calendário para navegar diretamente entre os anos."}
      </p>
    </form>
  );
}
