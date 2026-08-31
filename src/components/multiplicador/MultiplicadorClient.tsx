"use client";

import { ClipboardList, Download, Eye, FileArchive, FileText, Loader2, Printer, Trash2, Upload } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";

import { puxarOp } from "@/app/(app)/multiplicador/actions";
import { baixarBlob } from "@/lib/bom/download";
import type { ArquivoGerado } from "@/lib/multiplicador/celulas";
import { planilhaDaOp } from "@/lib/multiplicador/opPlanilha";

interface ItemArquivo {
  id: string;
  file: File;
  fator: number;
  quantidade: boolean;
  peso: boolean;
  processando: boolean;
  erro: string | null;
  resultado: ArquivoGerado | null;
}

const ACEITOS = new Set(["pdf", "xls", "xlsx", "csv"]);

const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function extensao(nome: string): string {
  return nome.split(".").pop()?.toLowerCase() ?? "";
}

function baixar(arquivo: ArquivoGerado): void {
  baixarBlob(new Blob([arquivo.bytes as BlobPart], { type: arquivo.mime }), arquivo.nome);
}

export function MultiplicadorClient() {
  const [arquivos, setArquivos] = useState<ItemArquivo[]>([]);
  const [imprimindo, setImprimindo] = useState(false);
  const [baixandoLote, setBaixandoLote] = useState(false);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [erroLote, setErroLote] = useState<string | null>(null);
  const [numeroOp, setNumeroOp] = useState("");
  const [puxando, setPuxando] = useState(false);
  const [erroOp, setErroOp] = useState<string | null>(null);
  const [avisoOp, setAvisoOp] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function adicionar(files: FileList | File[]) {
    const novos = Array.from(files)
      .filter((file) => ACEITOS.has(extensao(file.name)))
      .map((file) => ({
        id: `${file.name}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        fator: 1,
        quantidade: true,
        peso: false,
        processando: false,
        erro: null,
        resultado: null,
      }));
    setArquivos((atual) => [...atual, ...novos]);
  }

  /**
   * Puxa os itens de uma OP do Omie e entra na lista como se fosse um arquivo
   * subido. A planilha é montada AQUI, no navegador: do servidor vem só a lista
   * de itens, e o Multiplicador continua sendo uma tela que processa local.
   *
   * As quantidades da OP já vêm multiplicadas pela quantidade da ordem, então o
   * fator daqui é o "e se eu produzir N vezes essa OP".
   */
  async function puxarDaOp() {
    const numero = numeroOp.trim();
    if (!numero) return;
    setPuxando(true);
    setErroOp(null);
    setAvisoOp(null);
    try {
      const resposta = await puxarOp({ numeroOp: numero });
      if (!resposta.ok) {
        setErroOp(
          resposta.ambiguas?.length
            ? `${resposta.erro} Encontrei: ${resposta.ambiguas.join(", ")}.`
            : (resposta.erro ?? "Não consegui puxar a OP."),
        );
        return;
      }
      if (resposta.itens.length === 0) {
        setErroOp(`A OP ${resposta.numeroOp} não tem itens de material no Omie.`);
        return;
      }

      const planilha = planilhaDaOp(resposta.numeroOp ?? numero, resposta.itens);
      const file = new File([planilha.bytes as BlobPart], planilha.nome, { type: MIME_XLSX });
      setArquivos((atual) => [
        ...atual,
        {
          id: `op-${resposta.numeroOp}-${crypto.randomUUID()}`,
          file,
          fator: 1,
          quantidade: true,
          peso: false,
          processando: false,
          erro: null,
          resultado: null,
        },
      ]);
      setNumeroOp("");
      setAvisoOp(
        `OP ${resposta.numeroOp} (${resposta.produtoCodigo ?? "produto"}, ${resposta.quantidadeOp ?? 0} a produzir): ` +
          `${resposta.itens.length} itens. As quantidades já vêm multiplicadas pela quantidade da ordem; ` +
          "o fator aqui multiplica em cima disso.",
      );
    } catch {
      setErroOp("Não consegui puxar a OP agora. Tente novamente.");
    } finally {
      setPuxando(false);
    }
  }

  function selecionar(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) adicionar(event.target.files);
    event.target.value = "";
  }

  function atualizar(id: string, alteracao: Partial<ItemArquivo>) {
    setArquivos((atual) => atual.map((item) => (item.id === id ? { ...item, ...alteracao, resultado: null, erro: null } : item)));
  }

  async function processar(id: string) {
    const item = arquivos.find((arquivo) => arquivo.id === id);
    if (!item) return;
    atualizar(id, { processando: true });
    try {
      const opcoes = { fator: item.fator, quantidade: item.quantidade, peso: item.peso };
      const resultado =
        extensao(item.file.name) === "pdf"
          ? await (await import("@/lib/multiplicador/pdf")).multiplicarPdf(item.file, opcoes)
          : await (await import("@/lib/multiplicador/planilha")).multiplicarPlanilha(item.file, opcoes);
      setArquivos((atual) => atual.map((arquivo) => (arquivo.id === id ? { ...arquivo, processando: false, resultado, erro: null } : arquivo)));
    } catch (erro) {
      setArquivos((atual) =>
        atual.map((arquivo) =>
          arquivo.id === id ? { ...arquivo, processando: false, resultado: null, erro: erro instanceof Error ? erro.message : "Não consegui processar este arquivo." } : arquivo,
        ),
      );
    }
  }

  async function processarTodos() {
    for (const item of arquivos) await processar(item.id);
  }

  async function baixarImpressao() {
    const pdfs = arquivos.flatMap((item) => (item.resultado?.mime === "application/pdf" ? [item.resultado] : []));
    if (pdfs.length === 0) return;
    setErroLote(null);
    setImprimindo(true);
    try {
      const { juntarPdfsMultiplicados } = await import("@/lib/multiplicador/pdf");
      baixar({ nome: "BOMs-multiplicados-para-impressao.pdf", bytes: await juntarPdfsMultiplicados(pdfs), mime: "application/pdf" });
    } catch (erro) {
      setErroLote(erro instanceof Error ? erro.message : "Não consegui preparar o PDF para impressão.");
    } finally {
      setImprimindo(false);
    }
  }

  async function baixarTodos() {
    const resultados = arquivos.flatMap((item) => (item.resultado ? [item.resultado] : []));
    if (resultados.length === 0) return;
    setErroLote(null);
    setBaixandoLote(true);
    try {
      const { criarZipDeResultados } = await import("@/lib/multiplicador/lote");
      baixar({ nome: "BOMs-multiplicadas.zip", bytes: criarZipDeResultados(resultados), mime: "application/zip" });
    } catch (erro) {
      setErroLote(erro instanceof Error ? erro.message : "Não consegui preparar o arquivo em lote.");
    } finally {
      setBaixandoLote(false);
    }
  }

  async function visualizarImpressao() {
    const pdfs = arquivos.flatMap((item) => (item.resultado?.mime === "application/pdf" ? [item.resultado] : []));
    if (pdfs.length === 0) return;
    // Abre durante o gesto de clique para o navegador não bloquear a prévia
    // depois do processamento assíncrono do PDF.
    const aba = window.open("", "_blank");
    if (!aba) {
      setErroLote("O navegador bloqueou a prévia. Libere pop-ups para o Vital Ops e tente novamente.");
      return;
    }
    setErroLote(null);
    setPrevisualizando(true);
    try {
      const { juntarPdfsMultiplicados } = await import("@/lib/multiplicador/pdf");
      const bytes = await juntarPdfsMultiplicados(pdfs);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      aba.location.href = url;
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (erro) {
      aba.close();
      setErroLote(erro instanceof Error ? erro.message : "Não consegui abrir a prévia do PDF.");
    } finally {
      setPrevisualizando(false);
    }
  }

  const pdfsProntos = arquivos.filter((item) => item.resultado?.mime === "application/pdf").length;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-dashed border-border bg-card p-6 text-center">
        <Upload className="mx-auto h-7 w-7 text-primary" />
        <h2 className="mt-3 font-semibold text-card-foreground">Adicionar BOMs</h2>
        <p className="mt-1 text-sm text-muted-foreground">PDF digital, XLS, XLSX ou CSV. Pode selecionar vários de uma vez.</p>
        <input ref={inputRef} type="file" accept=".pdf,.xls,.xlsx,.csv" multiple className="hidden" onChange={selecionar} />
        <button type="button" onClick={() => inputRef.current?.click()} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
          <Upload className="h-4 w-4" /> Selecionar arquivos
        </button>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Puxar de uma Ordem de Produção</span>
            <input
              value={numeroOp}
              onChange={(event) => setNumeroOp(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void puxarDaOp();
              }}
              placeholder="2026/00802"
              className="w-48 rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary"
            />
          </label>
          <button
            type="button"
            onClick={() => void puxarDaOp()}
            disabled={puxando || numeroOp.trim().length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted disabled:opacity-50"
          >
            {puxando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
            {puxando ? "Puxando..." : "Puxar OP"}
          </button>
          <p className="text-xs text-muted-foreground">
            A lista de material vem direto do Omie e entra aqui como planilha, com a coluna QTD pronta para o fator.
          </p>
        </div>
        {erroOp ? <p className="mt-3 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">{erroOp}</p> : null}
        {avisoOp ? <p className="mt-3 rounded-lg bg-success-dim px-3 py-2 text-sm text-success">{avisoOp}</p> : null}
      </section>

      {arquivos.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="px-4 py-3">Arquivo</th><th className="w-28 px-4 py-3">Fator</th><th className="w-36 px-4 py-3">Multiplicar</th><th className="w-64 px-4 py-3">Resultado</th><th className="w-12 px-4 py-3" /></tr></thead>
              <tbody>
                {arquivos.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><FileText className="h-4 w-4 shrink-0 text-primary" /><span className="max-w-64 truncate font-medium text-card-foreground" title={item.file.name}>{item.file.name}</span></div></td>
                    <td className="px-4 py-3"><input aria-label={`Fator para ${item.file.name}`} type="number" min="0.01" step="0.01" value={item.fator} onChange={(event) => atualizar(item.id, { fator: Number(event.target.value) })} className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-foreground" /></td>
                    <td className="px-4 py-3"><div className="flex gap-3"><label className="flex items-center gap-1.5"><input type="checkbox" checked={item.quantidade} onChange={(event) => atualizar(item.id, { quantidade: event.target.checked })} /> QTD</label><label className="flex items-center gap-1.5"><input type="checkbox" checked={item.peso} onChange={(event) => atualizar(item.id, { peso: event.target.checked })} /> Peso</label></div></td>
                    <td className="px-4 py-3">{item.erro ? <p className="text-xs text-danger">{item.erro}</p> : item.resultado ? <button type="button" onClick={() => baixar(item.resultado!)} className="inline-flex items-center gap-1.5 text-primary underline underline-offset-2"><Download className="h-3.5 w-3.5" /> {item.resultado.nome}</button> : <button type="button" disabled={item.processando} onClick={() => void processar(item.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-card-foreground hover:bg-muted disabled:opacity-50">{item.processando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}{item.processando ? "Multiplicando..." : "Multiplicar"}</button>}</td>
                    <td className="px-4 py-3"><button type="button" onClick={() => setArquivos((atual) => atual.filter((arquivo) => arquivo.id !== item.id))} className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-danger" aria-label={`Remover ${item.file.name}`}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4">
            <p className="text-sm text-muted-foreground">Cada arquivo volta no formato original. PDFs digitais prontos: {pdfsProntos}.</p>
            <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void processarTodos()} disabled={arquivos.some((item) => item.processando)} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50">Multiplicar todos</button><button type="button" onClick={() => void baixarTodos()} disabled={!arquivos.some((item) => item.resultado) || baixandoLote} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted disabled:opacity-50">{baixandoLote ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}{baixandoLote ? "Compactando..." : "Baixar todos (.zip)"}</button><button type="button" onClick={() => void visualizarImpressao()} disabled={pdfsProntos === 0 || previsualizando} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted disabled:opacity-50">{previsualizando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}{previsualizando ? "Abrindo..." : "Visualizar PDF"}</button><button type="button" onClick={() => void baixarImpressao()} disabled={pdfsProntos === 0 || imprimindo} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground hover:bg-muted disabled:opacity-50">{imprimindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}{imprimindo ? "Preparando..." : "Baixar PDF para imprimir"}</button></div>
          </div>
          {erroLote ? <p className="border-t border-danger/20 bg-danger-dim px-4 py-3 text-sm text-danger">{erroLote}</p> : null}
        </section>
      )}
    </div>
  );
}
