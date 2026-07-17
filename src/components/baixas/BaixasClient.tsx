"use client";

import { AlertTriangle, Download, Keyboard, PackageMinus, PlayCircle, RefreshCw, Sheet } from "lucide-react";
import { useRef, useState } from "react";

import {
  conferirBaixa,
  continuarBaixa,
  executarBaixa,
  type ResultadoConferencia,
  type ResultadoExecucao,
} from "@/app/(app)/baixas/actions";
import { BaixaManualCart } from "@/components/baixas/BaixaManualCart";
import { FileDropzone } from "@/components/produtos/FileDropzone";
import { Select } from "@/components/ui/Select";
import { gerarModeloXlsx, lerPlanilhaBaixa, type PlanilhaBaixa } from "@/lib/baixas/planilha";
import { baixarBlob } from "@/lib/bom/download";
import type { BaixaLinha, Role } from "@/lib/contracts";

export interface LocalOpcao {
  codigo: string;
  descricao: string;
  padrao: boolean;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

const OUTCOME_LABEL: Record<string, string> = {
  baixado: "baixado ✓",
  ja_baixado: "já baixado ↺",
  falha: "falha ✗",
  nao_baixado: "não baixado —",
};

function outcomeClass(outcome: string): string {
  if (outcome === "baixado" || outcome === "ja_baixado") return "text-primary";
  if (outcome === "falha") return "text-destructive";
  return "text-muted-foreground";
}

type Modo = "planilha" | "manual";

interface BaixasClientProps {
  defaultSolicitante: string;
  // Locais de estoque da empresa (vem do servidor, cacheado). Vazio = seletor
  // escondido e tudo acontece no local padrão.
  locais: LocalOpcao[];
  role: Role;
}

// Só gestor (e admin) vê o alerta de estoque mínimo na conferência.
const PAPEIS_MINIMO: readonly Role[] = ["ADMIN", "GESTOR", "FABRICA_GESTOR"];

export function BaixasClient({ defaultSolicitante, locais, role }: BaixasClientProps) {
  const mostrarMinimo = PAPEIS_MINIMO.includes(role);
  const [modo, setModo] = useState<Modo>("planilha");
  const [solicitante, setSolicitante] = useState(defaultSolicitante);
  const [localCodigo, setLocalCodigo] = useState(
    () => locais.find((local) => local.padrao)?.codigo ?? locais[0]?.codigo ?? "0",
  );
  // Planilha
  const [file, setFile] = useState<File | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState<string | null>(null);
  const [planilha, setPlanilha] = useState<PlanilhaBaixa | null>(null);
  // Digitado na tela
  const [linhasManuais, setLinhasManuais] = useState<BaixaLinha[]>([]);
  // Comum
  const [conferencia, setConferencia] = useState<ResultadoConferencia | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [execucao, setExecucao] = useState<ResultadoExecucao | null>(null);
  const [executando, setExecutando] = useState(false);
  // Guarda contra resultado fora de ordem ao trocar de arquivo rapidamente.
  const reqId = useRef(0);

  const linhasAtivas: BaixaLinha[] = modo === "manual" ? linhasManuais : (planilha?.linhas ?? []);
  const nomeOrigem = modo === "manual" ? "Digitada na tela" : (file?.name ?? "planilha");

  function baixarModelo() {
    const bytes = gerarModeloXlsx();
    baixarBlob(
      new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "Modelo_Baixa_Estoque.xlsx",
    );
  }

  function trocarModo(novo: Modo) {
    if (novo === modo) return;
    reqId.current++;
    setModo(novo);
    setFile(null);
    setPlanilha(null);
    setLinhasManuais([]);
    setConferencia(null);
    setExecucao(null);
    setErroLeitura(null);
  }

  async function conferir(linhas: BaixaLinha[], id: number, local: string) {
    setConferindo(true);
    try {
      const resultado = await conferirBaixa({ itens: linhas, localCodigo: local });
      if (reqId.current === id) setConferencia(resultado);
    } finally {
      if (reqId.current === id) setConferindo(false);
    }
  }

  // Trocar o local re-confere na hora — é assim que dá pra "ver qual local tem"
  // o material antes de baixar.
  async function onLocalChange(novoLocal: string) {
    setLocalCodigo(novoLocal);
    setExecucao(null);
    if (linhasAtivas.length > 0) {
      await conferir(linhasAtivas, reqId.current, novoLocal);
    }
  }

  async function onFileChange(novo: File | null) {
    const id = ++reqId.current;
    setFile(novo);
    setPlanilha(null);
    setConferencia(null);
    setExecucao(null);
    setErroLeitura(null);
    if (!novo) return;

    setLendo(true);
    try {
      const lida = await lerPlanilhaBaixa(novo);
      if (reqId.current !== id) return;
      setPlanilha(lida);
      if (lida.linhas.length > 0) {
        await conferir(lida.linhas, id, localCodigo);
      }
    } catch (erro) {
      if (reqId.current === id) {
        setErroLeitura(erro instanceof Error ? erro.message : String(erro));
      }
    } finally {
      if (reqId.current === id) setLendo(false);
    }
  }

  // Carrinho manual reportou novas linhas: guarda e zera uma conferência antiga
  // (o que estava conferido não vale mais depois de editar).
  function onLinhasManuais(linhas: BaixaLinha[]) {
    reqId.current++;
    setLinhasManuais(linhas);
    setConferencia(null);
    setExecucao(null);
  }

  async function conferirManual() {
    const id = ++reqId.current;
    setExecucao(null);
    await conferir(linhasManuais, id, localCodigo);
  }

  async function executar() {
    if (linhasAtivas.length === 0 || solicitante.trim().length === 0) return;
    const id = reqId.current;
    setExecutando(true);
    try {
      const resultado = await executarBaixa({
        arquivoNome: nomeOrigem,
        solicitante: solicitante.trim(),
        itens: linhasAtivas,
        localCodigo,
      });
      if (reqId.current === id) setExecucao(resultado);
    } finally {
      if (reqId.current === id) setExecutando(false);
    }
  }

  async function continuar() {
    if (!execucao?.importId) return;
    const id = reqId.current;
    setExecutando(true);
    try {
      const resultado = await continuarBaixa(execucao.importId);
      if (reqId.current === id) {
        setExecucao(
          resultado.ok
            ? {
                ...resultado,
                totais: {
                  baixados: execucao.totais.baixados + resultado.totais.baixados,
                  falhas: execucao.totais.falhas + resultado.totais.falhas,
                  naoBaixados: resultado.totais.naoBaixados,
                },
              }
            : { ...resultado, importId: resultado.importId ?? execucao.importId },
        );
      }
    } finally {
      if (reqId.current === id) setExecutando(false);
    }
  }

  const linhasOk = conferencia?.ok ? conferencia.itens.filter((item) => item.ok).length : 0;
  const linhasProblema = conferencia?.ok ? conferencia.itens.filter((item) => !item.ok).length : 0;
  const podeExecutar = !executando && !conferindo && linhasOk > 0 && solicitante.trim().length > 0;
  const podeConferirManual = modo === "manual" && !conferindo && !executando && linhasManuais.length > 0;
  const ocupado = conferindo || executando;

  const botaoModo = (valor: Modo, Icon: typeof Sheet, texto: string) => (
    <button
      type="button"
      onClick={() => trocarModo(valor)}
      disabled={ocupado}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
        modo === valor
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-card-foreground hover:bg-muted"
      }`}
    >
      <Icon className="h-4 w-4" />
      {texto}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-64 flex-1 flex-col gap-1.5 sm:max-w-sm">
          <label htmlFor="baixa-solicitante" className="text-sm font-medium text-card-foreground">
            Quem solicitou a entrega
          </label>
          <input
            id="baixa-solicitante"
            value={solicitante}
            onChange={(e) => setSolicitante(e.target.value)}
            maxLength={120}
            placeholder="Nome de quem pediu o material"
            className={inputClass}
          />
        </div>
        {locais.length > 0 ? (
          <div className="flex min-w-56 flex-col gap-1.5 sm:max-w-xs">
            <label htmlFor="baixa-local" className="text-sm font-medium text-card-foreground">
              Local de estoque
            </label>
            <Select
              id="baixa-local"
              value={localCodigo}
              onChange={(e) => onLocalChange(e.target.value)}
              disabled={conferindo || executando}
            >
              {locais.map((local) => (
                <option key={local.codigo} className="bg-card text-foreground" value={local.codigo}>
                  {local.descricao}
                  {local.padrao ? " (padrão)" : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        {modo === "planilha" ? (
          <button
            type="button"
            onClick={baixarModelo}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm text-card-foreground transition-colors hover:bg-muted"
          >
            <Download className="h-4 w-4" />
            Baixar modelo (.xlsx)
          </button>
        ) : null}
      </div>

      {locais.length > 0 ? (
        <p className="-mt-4 text-xs text-muted-foreground">
          O saldo da conferência e a baixa usam o local escolhido. Troque o local para ver qual tem o material.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {botaoModo("planilha", Sheet, "Subir planilha")}
        {botaoModo("manual", Keyboard, "Digitar na tela")}
      </div>

      {modo === "planilha" ? (
        <>
          <FileDropzone
            label="Planilha de baixa preenchida"
            hint="Excel (.xlsx ou .xls) com as colunas do modelo: Produto (código Omie) e Quantidade — Pedido, NF, OP, Solicitante e Observação (finalidade/motivo) são opcionais. A Observação vai para o movimento no Omie."
            accept=".xlsx,.xls"
            file={file}
            onChange={onFileChange}
            loading={lendo}
          />

          {erroLeitura ? (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {erroLeitura}
            </p>
          ) : null}

          {planilha && planilha.erros.length > 0 ? (
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <p className="mb-1 flex items-center gap-1.5 font-medium text-card-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                Linhas ignoradas (corrija na planilha se precisar delas):
              </p>
              <ul className="list-inside list-disc text-muted-foreground">
                {planilha.erros.map((erro) => (
                  <li key={erro}>{erro}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <BaixaManualCart onLinhas={onLinhasManuais} disabled={ocupado} />
          <button
            type="button"
            onClick={conferirManual}
            disabled={!podeConferirManual}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${conferindo ? "animate-spin" : ""}`} />
            {conferindo ? "Conferindo…" : "Conferir no Omie"}
          </button>
        </>
      )}

      {conferencia && !conferencia.ok ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {conferencia.erro}
        </p>
      ) : null}

      {conferencia?.ok && !execucao ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-card-foreground">
              Conferência no Omie: {linhasOk} ok
              {linhasProblema > 0 ? `, ${linhasProblema} com problema` : ""}
            </h3>
            <button
              type="button"
              onClick={() => linhasAtivas.length > 0 && conferir(linhasAtivas, reqId.current, localCodigo)}
              disabled={conferindo}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${conferindo ? "animate-spin" : ""}`} />
              Conferir de novo
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[36rem] text-sm">
              <thead>
                <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Código</th>
                  <th className="px-3 py-2 font-medium">Descrição (Omie)</th>
                  <th className="px-3 py-2 font-medium">Qtd</th>
                  <th className="px-3 py-2 font-medium">Saldo no local</th>
                  <th className="px-3 py-2 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {conferencia.itens.map((item, index) => (
                  <tr key={`${item.sku}-${index}`} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 font-mono text-xs text-card-foreground">{item.sku}</td>
                    <td className="px-3 py-2 text-card-foreground">{item.descricao ?? "—"}</td>
                    <td className="px-3 py-2 text-card-foreground">{item.quantidade.toLocaleString("pt-BR")}</td>
                    <td className="px-3 py-2 text-card-foreground">
                      {item.saldo !== undefined ? item.saldo.toLocaleString("pt-BR") : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {item.ok ? (
                        <>
                          <span className="text-primary">ok ✓</span>
                          {mostrarMinimo && item.abaixoDoMinimo ? (
                            <span className="block text-xs text-warning">
                              fica abaixo do mínimo ({item.estoqueMinimo?.toLocaleString("pt-BR")}) — repor
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-destructive">{item.motivo}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {linhasProblema > 0 ? (
            <p className="text-xs text-muted-foreground">
              Linhas com problema NÃO serão baixadas (ficam registradas como falha). Você pode corrigir e
              conferir de novo, ou executar assim mesmo só com as linhas ok.
            </p>
          ) : null}

          <button
            type="button"
            onClick={executar}
            disabled={!podeExecutar}
            className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            <PackageMinus className="h-4 w-4" />
            {executando ? "Dando baixa…" : `Dar baixa no Omie (${linhasOk} item(ns))`}
          </button>
        </section>
      ) : null}

      {execucao ? (
        <section className="flex flex-col gap-3">
          {execucao.ok ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-2xl font-semibold text-primary">{execucao.totais.baixados}</p>
                  <p className="text-xs text-muted-foreground">baixado(s) no Omie</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-2xl font-semibold text-destructive">{execucao.totais.falhas}</p>
                  <p className="text-xs text-muted-foreground">com falha</p>
                </div>
                <div className="rounded-lg border border-border bg-card p-3">
                  <p className="text-2xl font-semibold text-card-foreground">{execucao.totais.naoBaixados}</p>
                  <p className="text-xs text-muted-foreground">não baixado(s) (pendentes)</p>
                </div>
              </div>

              {execucao.interrompido ? (
                <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm">
                  <p className="flex items-center gap-1.5 font-medium text-card-foreground">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    {execucao.motivoInterrupcao ?? "A baixa foi interrompida antes do fim."}
                  </p>
                  <p className="text-muted-foreground">
                    O que já foi baixado ficou salvo. Use o botão abaixo para retomar só o restante — nada é
                    baixado duas vezes.
                  </p>
                  <button
                    type="button"
                    onClick={continuar}
                    disabled={executando}
                    className="inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    <PlayCircle className="h-4 w-4" />
                    {executando ? "Retomando…" : "Continuar baixa"}
                  </button>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Código</th>
                      <th className="px-3 py-2 font-medium">Descrição</th>
                      <th className="px-3 py-2 font-medium">Qtd</th>
                      <th className="px-3 py-2 font-medium">Resultado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {execucao.itens.map((item, index) => (
                      <tr key={`${item.sku}-${index}`} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-card-foreground">{item.sku}</td>
                        <td className="px-3 py-2 text-card-foreground">{item.descricao ?? "—"}</td>
                        <td className="px-3 py-2 text-card-foreground">{item.quantidade.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2">
                          <span className={outcomeClass(item.outcome)}>{OUTCOME_LABEL[item.outcome]}</span>
                          {item.motivo && item.outcome === "falha" ? (
                            <span className="block text-xs text-muted-foreground">{item.motivo}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {execucao.erro}
              </p>
              {execucao.importId ? (
                <button
                  type="button"
                  onClick={continuar}
                  disabled={executando}
                  className="inline-flex items-center gap-1.5 self-start rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  <PlayCircle className="h-4 w-4" />
                  {executando ? "Tentando de novo…" : "Tentar de novo"}
                </button>
              ) : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
