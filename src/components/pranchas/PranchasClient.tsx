"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Printer,
  Table2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { FileDropzone } from "@/components/produtos/FileDropzone";
import { FolderDropzone } from "@/components/pranchas/FolderDropzone";
import { baixarBlob } from "@/lib/bom/download";
import { lerCodigosDoBom, type ItemBom } from "@/lib/pranchas/bom";
import {
  candidatesFor,
  chooseCandidate,
  parseCodeFromFileName,
  type DrawingCode,
  type MatchStatus,
  type Mode,
} from "@/lib/pranchas/codes";
import { agruparComerciais, gerarPlanilhaMateriais } from "@/lib/pranchas/materiais";
import { juntarPdfs, type ParteMerge } from "@/lib/pranchas/pdf";

interface IndexedFile {
  file: File;
  name: string;
  code: DrawingCode;
}

interface Row {
  code: DrawingCode;
  chosenFile: IndexedFile | null;
  status: MatchStatus;
  detail: string;
  include: boolean;
  isParent: boolean;
}

type Toast = { kind: "good" | "warn" | "err"; msg: string } | null;

const BADGE: Record<MatchStatus, { label: string; cls: string }> = {
  ok: { label: "OK · BOM", cls: "bg-success-dim text-success" },
  new: { label: "MAIS NOVA", cls: "bg-primary/10 text-primary" },
  old: { label: "SÓ ANTIGA", cls: "bg-warning-dim text-warning" },
  norev: { label: "SEM REVISÃO", cls: "bg-warning-dim text-warning" },
  warn: { label: "REVISÃO A CONFERIR", cls: "bg-warning-dim text-warning" },
  miss: { label: "NÃO ACHOU", cls: "bg-danger-dim text-danger" },
};

function nomeDaPasta(files: File[]): string | null {
  const rel = files.find((f) => f.webkitRelativePath)?.webkitRelativePath;
  if (rel) return rel.split("/")[0];
  return files.length > 0 ? `${files.length} arquivo(s)` : null;
}

export function PranchasClient() {
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [bomLoading, setBomLoading] = useState(false);
  const [bomError, setBomError] = useState<string | null>(null);
  const [codes, setCodes] = useState<DrawingCode[]>([]);
  const [parentKey, setParentKey] = useState<string | null>(null);
  const [itens, setItens] = useState<ItemBom[]>([]);
  const [temQuantidades, setTemQuantidades] = useState(false);
  const [multiplicador, setMultiplicador] = useState(1);

  const [indexed, setIndexed] = useState<IndexedFile[]>([]);
  const [totalPdfs, setTotalPdfs] = useState(0);
  const [folderName, setFolderName] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("exact");
  const [cover, setCover] = useState(true);
  const [includeParent, setIncludeParent] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const [compiling, setCompiling] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);

  const bomReqId = useRef(0);

  const coverPossivel = bomFile != null && bomFile.name.toLowerCase().endsWith(".pdf");

  async function handleBom(file: File | null) {
    const req = ++bomReqId.current;
    setBomFile(file);
    setBomError(null);
    setCodes([]);
    setParentKey(null);
    setItens([]);
    setTemQuantidades(false);
    setOverrides({});
    setResultUrl(null);
    setToast(null);
    if (!file) return;
    setBomLoading(true);
    try {
      const conteudo = await lerCodigosDoBom(file);
      if (req !== bomReqId.current) return; // resposta fora de ordem: ignora
      if (conteudo.desenhos.length === 0) {
        setBomError(
          "Não encontrei nenhum código de desenho neste arquivo. Confira se é o BOM certo e se os códigos seguem o padrão (ex.: CREHS PC001 CCSLD R00).",
        );
      }
      setCodes(conteudo.desenhos);
      setParentKey(conteudo.parentKey);
      setItens(conteudo.itens);
      setTemQuantidades(conteudo.temQuantidades);
    } catch (e) {
      if (req !== bomReqId.current) return;
      setBomError(e instanceof Error ? e.message : "Falha ao ler o arquivo.");
    } finally {
      if (req === bomReqId.current) setBomLoading(false);
    }
  }

  function handleFolder(files: File[]) {
    const idx: IndexedFile[] = [];
    for (const file of files) {
      const code = parseCodeFromFileName(file.name);
      if (code) idx.push({ file, name: file.name, code });
    }
    setIndexed(idx);
    setTotalPdfs(files.length);
    setFolderName(nomeDaPasta(files));
    setResultUrl(null);
    setToast(null);
  }

  const rows = useMemo<Row[]>(() => {
    return codes.map((code) => {
      const cands = candidatesFor(code, indexed);
      const escolha = chooseCandidate(
        code,
        cands.map((c) => c.code),
        mode,
      );
      const chosenFile = escolha.index >= 0 ? cands[escolha.index] : null;
      const isParent = parentKey != null && code.key === parentKey;
      let include = chosenFile != null && escolha.status !== "warn";
      if (overrides[code.raw] !== undefined) include = overrides[code.raw] && chosenFile != null;
      if (!includeParent && isParent) include = false;
      return { code, chosenFile, status: escolha.status, detail: escolha.detail, include, isParent };
    });
  }, [codes, indexed, mode, includeParent, overrides, parentKey]);

  const resumo = useMemo(() => {
    let ok = 0;
    let atencao = 0;
    let faltando = 0;
    let selecionadas = 0;
    for (const r of rows) {
      if (r.status === "miss") faltando++;
      else if (r.status === "warn") atencao++;
      else ok++;
      if (r.include && r.chosenFile) selecionadas++;
    }
    return { ok, atencao, faltando, selecionadas };
  }, [rows]);

  const totalDocs = resumo.selecionadas + (cover && coverPossivel ? 1 : 0);

  const materiais = useMemo(() => agruparComerciais(itens, multiplicador), [itens, multiplicador]);

  function handleBaixarMateriais() {
    const base = bomFile ? bomFile.name.replace(/\.[^.]+$/, "") : "materiais";
    baixarBlob(
      gerarPlanilhaMateriais(materiais, multiplicador, base),
      `${base} - materiais.xlsx`,
    );
  }

  async function compilar(): Promise<{ url: string; name: string } | null> {
    const selecionadas = rows.filter((r) => r.include && r.chosenFile);
    if (selecionadas.length === 0) return null;

    const partes: ParteMerge[] = [];
    if (cover && coverPossivel && bomFile) {
      partes.push({ nome: bomFile.name, bytes: new Uint8Array(await bomFile.arrayBuffer()) });
    }
    for (const r of selecionadas) {
      const arq = r.chosenFile!;
      partes.push({ nome: arq.name, bytes: new Uint8Array(await arq.file.arrayBuffer()) });
    }

    const resultado = await juntarPdfs(partes);
    const base = bomFile ? bomFile.name.replace(/\.[^.]+$/, "") : "pranchas";
    const name = `${base} - pranchas compiladas.pdf`;
    // Cópia para um Uint8Array com buffer ArrayBuffer concreto (o save() do
    // pdf-lib devolve ArrayBufferLike, que o tipo do Blob não aceita direto).
    const url = URL.createObjectURL(
      new Blob([new Uint8Array(resultado.bytes)], { type: "application/pdf" }),
    );

    if (resultUrl) URL.revokeObjectURL(resultUrl);
    setResultUrl(url);
    setToast(
      resultado.falhas.length > 0
        ? {
            kind: "warn",
            msg: `Compilado com ${resultado.paginas} página(s). Não deu para ler ${resultado.falhas.length} PDF(s): ${resultado.falhas.join(", ")}.`,
          }
        : { kind: "good", msg: `Compilado: ${resultado.paginas} página(s), pronto para imprimir.` },
    );
    return { url, name };
  }

  async function handleBaixar() {
    setCompiling(true);
    try {
      const out = await compilar();
      if (!out) return;
      const a = document.createElement("a");
      a.href = out.url;
      a.download = out.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof Error ? e.message : "Falha ao compilar." });
    } finally {
      setCompiling(false);
    }
  }

  async function handleImprimir() {
    setCompiling(true);
    try {
      const out = resultUrl ? { url: resultUrl } : await compilar();
      if (!out) return;
      const iframe = document.createElement("iframe");
      iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      iframe.src = out.url;
      iframe.onload = () => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch {
          window.open(out.url, "_blank");
        }
      };
      document.body.appendChild(iframe);
    } catch (e) {
      setToast({ kind: "err", msg: e instanceof Error ? e.message : "Falha ao imprimir." });
    } finally {
      setCompiling(false);
    }
  }

  const temResultado = codes.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-xl border border-border bg-primary/5 p-4 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <p>
          Suba o <strong className="font-medium text-foreground">BOM do conjunto</strong> (o PDF com a lista de
          peças) e a <strong className="font-medium text-foreground">pasta com os desenhos</strong>. O sistema lê os
          códigos, acha cada prancha na pasta pela versão e revisão certas e junta tudo num{" "}
          <strong className="font-medium text-foreground">PDF único</strong> pronto para imprimir. Tudo roda no seu
          navegador, nenhum arquivo é enviado para servidor.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FileDropzone
          label="Arquivo do conjunto (BOM)"
          hint="PDF do conjunto (ou planilha .xls/.xlsx)"
          accept=".pdf,.xls,.xlsx"
          file={bomFile}
          onChange={handleBom}
          loading={bomLoading}
          loadingLabel="Lendo o BOM..."
          fileIcon={FileText}
        />
        <FolderDropzone
          totalPdfs={totalPdfs}
          reconhecidos={indexed.length}
          folderName={folderName}
          onFiles={handleFolder}
        />
      </div>

      {bomError && (
        <div className="flex items-start gap-3 rounded-xl border border-danger/30 bg-danger-dim p-4 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{bomError}</p>
        </div>
      )}

      {temResultado && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Revisão</span>
              <div className="inline-flex overflow-hidden rounded-lg border border-border">
                {(["exact", "latest"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`px-3 py-1.5 text-sm transition-colors ${
                      mode === m
                        ? "bg-primary font-medium text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {m === "exact" ? "Exata do BOM" : "Mais recente"}
                  </button>
                ))}
              </div>
            </div>

            {coverPossivel && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={cover}
                  onChange={(e) => setCover(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Incluir a folha do BOM como capa
              </label>
            )}

            {parentKey && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={includeParent}
                  onChange={(e) => setIncludeParent(e.target.checked)}
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                Incluir a prancha do próprio conjunto
              </label>
            )}
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <h2 className="text-base font-semibold text-card-foreground">Pranchas do projeto</h2>
              <div className="flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-success-dim px-2.5 py-1 text-success">
                  {resumo.ok} encontrada{resumo.ok === 1 ? "" : "s"}
                </span>
                {resumo.atencao > 0 && (
                  <span className="rounded-full bg-warning-dim px-2.5 py-1 text-warning">
                    {resumo.atencao} revisão a conferir
                  </span>
                )}
                {resumo.faltando > 0 && (
                  <span className="rounded-full bg-danger-dim px-2.5 py-1 text-danger">
                    {resumo.faltando} sem arquivo
                  </span>
                )}
              </div>
            </header>

            {indexed.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Suba a <strong className="font-medium text-foreground">pasta com os desenhos</strong> para casar as
                pranchas.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="w-10 px-4 py-2.5 font-medium">Nº</th>
                      <th className="px-4 py-2.5 font-medium">Peça</th>
                      <th className="px-4 py-2.5 font-medium">Arquivo na pasta</th>
                      <th className="w-40 px-4 py-2.5 font-medium">Status</th>
                      <th className="w-16 px-4 py-2.5 text-center font-medium">Incluir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const badge = BADGE[r.status];
                      return (
                        <tr
                          key={r.code.raw}
                          className={`border-b border-border/60 last:border-0 ${r.include ? "" : "opacity-50"}`}
                        >
                          <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-card-foreground">{r.code.raw}</span>
                            {r.isParent && <span className="ml-1 text-xs text-muted-foreground">(conjunto)</span>}
                            {r.code.desc && <div className="text-xs text-muted-foreground">{r.code.desc}</div>}
                          </td>
                          <td className="px-4 py-3">
                            {r.chosenFile ? (
                              <span className="break-all text-xs text-card-foreground">{r.chosenFile.name}</span>
                            ) : (
                              <span className="text-xs italic text-muted-foreground">não localizado</span>
                            )}
                            {r.detail && <div className="text-xs text-muted-foreground">{r.detail}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={r.include}
                              disabled={!r.chosenFile}
                              onChange={(e) =>
                                setOverrides((prev) => ({ ...prev, [r.code.raw]: e.target.checked }))
                              }
                              className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
              <div>
                <h2 className="text-base font-semibold text-card-foreground">Material de compra</h2>
                <p className="text-xs text-muted-foreground">
                  Itens comprados da BOM, somados por código, para conferir estoque e separar.
                </p>
              </div>
              {materiais.length > 0 && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-foreground">
                    Conjuntos a produzir
                    <input
                      type="number"
                      min={1}
                      value={multiplicador}
                      onChange={(e) => setMultiplicador(Math.max(1, Number(e.target.value) || 1))}
                      className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={handleBaixarMateriais}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
                  >
                    <Table2 className="h-4 w-4" />
                    Baixar Excel
                  </button>
                </div>
              )}
            </header>

            {!temQuantidades ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                O BOM em PDF não traz as quantidades em coluna separada. Suba a{" "}
                <strong className="font-medium text-foreground">planilha .xls/.xlsx</strong> do
                conjunto para montar a lista de materiais.
              </p>
            ) : materiais.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Nenhum item comprado nesta BOM.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Código</th>
                      <th className="px-4 py-2.5 font-medium">Descrição</th>
                      <th className="w-32 px-4 py-2.5 text-right font-medium">Por conjunto</th>
                      <th className="w-28 px-4 py-2.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.map((l) => (
                      <tr key={l.codigo} className="border-b border-border/60 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-card-foreground">
                          {l.codigo}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.descricao}</td>
                        <td className="px-4 py-2.5 text-right text-muted-foreground">{l.unitaria}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-card-foreground">
                          {l.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {toast && (
            <div
              className={`rounded-xl border p-3 text-sm ${
                toast.kind === "err"
                  ? "border-danger/30 bg-danger-dim text-danger"
                  : toast.kind === "warn"
                    ? "border-warning/30 bg-warning-dim text-warning"
                    : "border-success/30 bg-success-dim text-success"
              }`}
            >
              {toast.msg}
            </div>
          )}

          <div className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <p className="text-sm text-muted-foreground">
              {resumo.selecionadas > 0 ? (
                <>
                  <strong className="text-foreground">{resumo.selecionadas}</strong> prancha
                  {resumo.selecionadas === 1 ? "" : "s"}
                  {cover && coverPossivel ? " + capa (BOM)" : ""} · total{" "}
                  <strong className="text-foreground">{totalDocs}</strong> documento{totalDocs === 1 ? "" : "s"}
                </>
              ) : (
                "Nenhuma prancha selecionada."
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleImprimir}
                disabled={compiling || resumo.selecionadas === 0}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </button>
              <button
                type="button"
                onClick={handleBaixar}
                disabled={compiling || resumo.selecionadas === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {compiling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {compiling ? "Compilando..." : "Compilar PDF"}
              </button>
            </div>
          </div>
        </>
      )}

      {!temResultado && !bomError && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground/60" />
          Suba o BOM e a pasta para montar a lista de pranchas.
        </div>
      )}
    </div>
  );
}
