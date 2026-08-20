"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Info,
  Loader2,
  Printer,
  RefreshCw,
  Sparkles,
  Table2,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { carregarCatalogosDeCompra } from "@/app/(app)/pranchas/actions";
import { FileDropzone } from "@/components/produtos/FileDropzone";
import { FolderDropzone } from "@/components/pranchas/FolderDropzone";
import { MateriaPrimaCompra } from "@/components/pranchas/MateriaPrimaCompra";
import { baixarBlob } from "@/lib/bom/download";
import type { UnidadePeso } from "@/lib/bom/types";
import { lerCodigosDoBom, type ItemBom } from "@/lib/pranchas/bom";
import { ehPeca } from "@/lib/bom/bomParser";
import { agruparMateriaPrima } from "@/lib/pranchas/chapas";
import {
  candidatesFor,
  chooseCandidate,
  parseCodeFromFileName,
  type DrawingCode,
  type MatchStatus,
  type Mode,
} from "@/lib/pranchas/codes";
import { agruparComerciais, gerarPlanilhaMateriais } from "@/lib/pranchas/materiais";
import { juntarPdfs, type ParteMerge, type ResultadoMerge } from "@/lib/pranchas/pdf";
import { chaveCom, type ItemCom } from "@/lib/produtos/catalogoCom";
import type { ItemMat } from "@/lib/produtos/materiaPrima";

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

// O Modo 2 é OPT-IN e não mexe no que já existia: quem abre a tela continua
// vendo a lista de comprados como sempre viu, offline. Ligar o modo é o que
// autoriza a consulta ao Omie (unidade de compra e cadastro da matéria-prima).
type ModoMaterial = "classico" | "modo2";

const EXPLICACAO_MODO2 =
  "Modo 2: além dos itens comprados, mostra a matéria-prima que as peças consomem. " +
  "Lê o cadastro do Omie para trazer a unidade de compra, converte o peso da BOM em m² " +
  "e diz quantas chapas inteiras comprar. O modo Clássico continua igual e sem consultar o Omie.";

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

// Mensagem do fim da compilação. Prancha resgatada (o pdf-lib recusou e o pdfjs
// rasterizou) entra na conta das páginas, mas o usuário precisa saber quais são:
// vieram como imagem, então imprimem igual mas não têm texto selecionável.
function mensagemDoResultado(r: ResultadoMerge): Toast {
  const base = `Compilado com ${r.paginas} página(s)`;
  const partes: string[] = [];
  if (r.resgatados.length > 0) {
    partes.push(
      `${r.resgatados.length} prancha(s) vieram fora do padrão e entraram como imagem (imprimem igual): ${r.resgatados.join(", ")}`,
    );
  }
  if (r.falhas.length > 0) {
    partes.push(
      `não deu para ler ${r.falhas.length} PDF(s): ${r.falhas.map((f) => `${f.nome} (${f.motivo})`).join("; ")}`,
    );
  }
  if (partes.length === 0) return { kind: "good", msg: `${base}, pronto para imprimir.` };
  // Prancha resgatada também sai em amarelo, não em verde: virou imagem, e uma
  // pasta inteira resgatada significa arquivo maior e sem texto selecionável.
  // Anunciar isso como sucesso limpo esconderia a troca de qualidade.
  return { kind: "warn", msg: `${base}. ${partes.join(". ")}.` };
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

  const [modoMaterial, setModoMaterial] = useState<ModoMaterial>("classico");
  const [catalogoMat, setCatalogoMat] = useState<ItemMat[] | null>(null);
  const [catalogoCom, setCatalogoCom] = useState<Map<string, ItemCom> | null>(null);
  const [catalogoComCompleto, setCatalogoComCompleto] = useState(true);
  const [catalogoLoading, setCatalogoLoading] = useState(false);
  const [catalogoErro, setCatalogoErro] = useState<string | null>(null);
  const [unidadePeso, setUnidadePeso] = useState<UnidadePeso>("g");
  // Em porcentagem, como a pessoa pensa. 100 = área teórica, sem perda de corte.
  const [aproveitamento, setAproveitamento] = useState(100);

  const bomReqId = useRef(0);

  const catalogoPronto = catalogoMat !== null && catalogoCom !== null;

  async function buscarCatalogos(revalidar = false) {
    setCatalogoLoading(true);
    setCatalogoErro(null);
    try {
      const r = await carregarCatalogosDeCompra(revalidar);
      if (!r.ok || !r.mat || !r.com) {
        setCatalogoErro(r.erro ?? "Não consegui ler os cadastros no Omie.");
        return;
      }
      setCatalogoMat(r.mat);
      setCatalogoCom(new Map(r.com.map((item) => [chaveCom(item.codigo), item])));
      setCatalogoComCompleto(r.comCompleto !== false);
    } catch (e) {
      setCatalogoErro(e instanceof Error ? e.message : "Não consegui ler os cadastros no Omie.");
    } finally {
      setCatalogoLoading(false);
    }
  }

  // Ligar o Modo 2 é o que autoriza a leitura no Omie, e é por isso que a busca
  // sai daqui e não de um efeito: o clique é o evento, e um efeito que dispara
  // setState em cascata só existiria para adivinhar essa mesma intenção.
  function ligarModo2() {
    setModoMaterial("modo2");
    // O que já veio continua valendo: alternar entre os modos não relê o Omie.
    if (!catalogoPronto && !catalogoLoading) void buscarCatalogos();
  }

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

  const modo2Ativo = modoMaterial === "modo2" && catalogoPronto;

  const materiais = useMemo(
    () =>
      agruparComerciais(
        itens,
        multiplicador,
        modo2Ativo ? (catalogoCom ?? undefined) : undefined,
        catalogoComCompleto,
      ),
    [itens, multiplicador, modo2Ativo, catalogoCom, catalogoComCompleto],
  );

  // BOM que tem PEÇA mas não rendeu nenhuma linha de matéria-prima: quem consome
  // matéria-prima é a peça, então a lista vazia aqui é sintoma de BOM sem as
  // colunas de peso/especificação, não de "não tem material".
  const temPecas = useMemo(
    () => itens.some((i) => !i.code.comercial && ehPeca(i.code.key)),
    [itens],
  );

  const materiaPrima = useMemo(() => {
    if (!modo2Ativo || !catalogoMat) return [];
    return agruparMateriaPrima(itens, catalogoMat, {
      unidadePeso,
      multiplicador,
      aproveitamento: aproveitamento / 100,
    });
  }, [modo2Ativo, catalogoMat, itens, unidadePeso, multiplicador, aproveitamento]);

  function handleBaixarMateriais() {
    const base = bomFile ? bomFile.name.replace(/\.[^.]+$/, "") : "materiais";
    baixarBlob(
      gerarPlanilhaMateriais(
        materiais,
        multiplicador,
        base,
        modo2Ativo && materiaPrima.length > 0
          ? { materiaPrima, aproveitamento: aproveitamento / 100 }
          : {},
      ),
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
    setToast(mensagemDoResultado(resultado));
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
            <header className="flex flex-col gap-3 border-b border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-card-foreground">Material de compra</h2>
                  <p className="text-xs text-muted-foreground">
                    Itens comprados da BOM, somados por código, para conferir estoque e separar.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex overflow-hidden rounded-lg border border-border">
                    <button
                      type="button"
                      onClick={() => setModoMaterial("classico")}
                      title="Como sempre foi: só os itens comprados, tudo no navegador."
                      className={`px-3 py-1.5 text-sm transition-colors ${
                        modoMaterial === "classico"
                          ? "bg-primary font-medium text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Clássico
                    </button>
                    <button
                      type="button"
                      onClick={ligarModo2}
                      title={EXPLICACAO_MODO2}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors ${
                        modoMaterial === "modo2"
                          ? "bg-primary font-medium text-primary-foreground"
                          : "bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Modo 2
                    </button>
                  </div>
                  {(materiais.length > 0 || materiaPrima.length > 0) && (
                    <>
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
                    </>
                  )}
                </div>
              </div>

              {modoMaterial === "modo2" && (
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-lg bg-muted/40 p-3">
                  <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>{EXPLICACAO_MODO2}</span>
                  </p>
                  <label
                    className="flex items-center gap-2 text-sm text-foreground"
                    title="Quanto da chapa vira peça depois do corte. 100% é a área teórica, sem sobra."
                  >
                    Aproveitamento da chapa
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={aproveitamento}
                      onChange={(e) =>
                        setAproveitamento(Math.min(100, Math.max(1, Number(e.target.value) || 1)))
                      }
                      className="w-20 rounded-lg border border-border bg-card px-2 py-1.5 text-sm text-foreground"
                    />
                    %
                  </label>
                  <div
                    className="flex items-center gap-2 text-sm text-foreground"
                    title="A BOM não diz em que unidade o CAD exportou a coluna de peso."
                  >
                    Peso da BOM em
                    <div className="inline-flex overflow-hidden rounded-lg border border-border">
                      {(["g", "kg"] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setUnidadePeso(u)}
                          className={`px-3 py-1.5 text-sm transition-colors ${
                            unidadePeso === u
                              ? "bg-primary font-medium text-primary-foreground"
                              : "bg-card text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {u}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void buscarCatalogos(true)}
                    disabled={catalogoLoading}
                    title="Recarregar os cadastros do Omie (para pegar item cadastrado agora)"
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${catalogoLoading ? "animate-spin" : ""}`} />
                    Recarregar do Omie
                  </button>
                </div>
              )}

              {modo2Ativo && !catalogoComCompleto && (
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-dim p-3 text-sm text-warning">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    A leitura do cadastro de comprados no Omie veio incompleta, então esta lista
                    não aponta código fora do cadastro. A unidade dos itens que vieram continua
                    valendo. Tente recarregar do Omie.
                  </p>
                </div>
              )}

              {modoMaterial === "modo2" && catalogoErro && (
                <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-dim p-3 text-sm text-danger">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>{catalogoErro}</p>
                    <button
                      type="button"
                      onClick={() => void buscarCatalogos()}
                      disabled={catalogoLoading}
                      className="mt-1 underline underline-offset-2 disabled:opacity-50"
                    >
                      Tentar de novo
                    </button>
                  </div>
                </div>
              )}
            </header>

            {!temQuantidades ? (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Não consegui separar as colunas da tabela deste PDF (pode ser um PDF
                digitalizado ou um modelo de BOM diferente), então não dá para somar as
                quantidades. Suba a{" "}
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
                      {modo2Ativo && <th className="w-20 px-4 py-2.5 font-medium">Un.</th>}
                      <th className="w-32 px-4 py-2.5 text-right font-medium">Por conjunto</th>
                      <th className="w-28 px-4 py-2.5 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.map((l) => (
                      <tr key={l.codigo} className="border-b border-border/60 last:border-0">
                        <td className="whitespace-nowrap px-4 py-2.5 font-medium text-card-foreground">
                          {l.codigo}
                          {l.noOmie === false && (
                            <span
                              className="ml-2 rounded bg-warning-dim px-1.5 py-0.5 text-xs font-semibold text-warning"
                              title="Este código não está cadastrado (ou está inativo) no Omie. Sem cadastro não dá para comprar nem baixar estoque."
                            >
                              fora do Omie
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">{l.descricao}</td>
                        {modo2Ativo && (
                          <td className="px-4 py-2.5 text-muted-foreground">{l.unidade || "—"}</td>
                        )}
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

          {modoMaterial === "modo2" && (
            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                <div>
                  <h2 className="text-base font-semibold text-card-foreground">
                    Matéria-prima (chapa, tubo e trefilado)
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    O que as peças consomem, somado por cadastro do Omie. O quilo vem do peso da BOM;
                    o m² sai da espessura e da densidade do material, e as chapas, da medida do
                    cadastro com o aproveitamento acima.
                  </p>
                </div>
              </header>

              {catalogoLoading && !catalogoPronto ? (
                <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Lendo os cadastros no Omie...
                </p>
              ) : !catalogoPronto ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Sem os cadastros do Omie não dá para dizer qual chapa cada peça consome.
                </p>
              ) : !temQuantidades ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Este PDF não deixou ler as colunas da tabela, então não há peso nem especificação
                  para converter. Suba a{" "}
                  <strong className="font-medium text-foreground">planilha .xls/.xlsx</strong> do
                  conjunto.
                </p>
              ) : materiaPrima.length === 0 && temPecas ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Esta BOM tem peças, mas nenhuma delas trouxe peso ou especificação de
                  matéria-prima. A planilha exportada do CAD precisa das colunas{" "}
                  <strong className="font-medium text-foreground">PESO</strong> e{" "}
                  <strong className="font-medium text-foreground">DESCRIÇÃO</strong> para esta
                  conta existir.
                </p>
              ) : (
                <MateriaPrimaCompra linhas={materiaPrima} />
              )}
            </section>
          )}

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
