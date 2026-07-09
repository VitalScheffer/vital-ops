"use client";

import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Info,
  ListChecks,
  Loader2,
  MinusCircle,
  Network,
  PencilLine,
  Receipt,
  RotateCcw,
  Send,
  ShieldAlert,
  Warehouse,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import { EstruturaPreview } from "@/components/produtos/EstruturaPreview";
import { FileDropzone } from "@/components/produtos/FileDropzone";
import { PreviewTable } from "@/components/produtos/PreviewTable";
import { registrarPlanilhaGerada } from "@/app/(app)/produtos/actions";
import { enviarAoOmie } from "@/app/(app)/produtos/enviar-actions";
import { criarReport } from "@/app/(app)/reports-actions";
import { IDLE_FORM_STATE } from "@/lib/form";
import type { OutcomeEnvio } from "@/lib/produtos/envioOmie";
import { NCM_PADRAO } from "@/lib/produtos/ncm";
import { lerBomDeArquivo } from "@/lib/bom/bomFile";
import { parseBom, parseEstrutura } from "@/lib/bom/bomParser";
import { baixarBlob } from "@/lib/bom/download";
import {
  bytesParaBlob,
  extrairCodigosExistentes,
  lerBytesArquivo,
  lerBytesTemplate,
  preencherEstrutura,
  preencherProdutos,
  type ResultadoEscrita,
} from "@/lib/bom/omieFile";
import {
  buildEstruturaReview,
  buildProdutoReview,
  estruturaParaEnvio,
  produtosParaEnvio,
  resumoProdutos,
  type EstruturaReviewItem,
  type ProdutoReviewItem,
} from "@/lib/bom/review";
import type { BomRow, EstruturaRel, ParsedItem } from "@/lib/bom/types";

type Tone = "muted" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<Tone, string> = {
  muted: "bg-muted text-muted-foreground ring-border",
  success: "bg-success-dim text-success ring-success/25",
  warning: "bg-warning-dim text-warning ring-warning/25",
  danger: "bg-danger-dim text-danger ring-danger/25",
};

function SummaryCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 ring-1 ring-inset ${TONE_CLASSES[tone]}`}>
      <Icon className="h-5 w-5 shrink-0" />
      <div>
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <p className="text-xs opacity-80">{label}</p>
      </div>
    </div>
  );
}

function nomeArquivoSaida(): string {
  const carimbo = new Date().toISOString().slice(0, 10);
  return `Omie_Produtos_${carimbo}.xlsx`;
}

// A tipagem do resultado vem da própria Server Action (fonte única da verdade).
type EnvioState = Awaited<ReturnType<typeof enviarAoOmie>>;

const OUTCOME_META: Record<OutcomeEnvio, { label: string; icon: typeof CheckCircle2; className: string }> = {
  enviado: { label: "Enviado", icon: CheckCircle2, className: "text-success" },
  ja_existia: { label: "Já existia", icon: RotateCcw, className: "text-warning" },
  falha: { label: "Falha", icon: XCircle, className: "text-danger" },
  nao_enviado: { label: "Não enviado", icon: MinusCircle, className: "text-muted-foreground" },
};

function OutcomeBadge({ outcome }: { outcome: OutcomeEnvio }) {
  const meta = OUTCOME_META[outcome];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${meta.className}`}>
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}

function EnvioResultadoView({ estado }: { estado: EnvioState }) {
  const resultado = estado.resultado;
  if (!resultado) return null;
  const { totais } = resultado;

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
      <header className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold text-foreground">Resultado do envio ao Omie</h2>
      </header>

      {resultado.interrompido && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-dim px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {resultado.bloqueado
              ? "O Omie bloqueou o envio temporariamente (proteção da API). Aguarde e tente novamente mais tarde."
              : "O envio parou por segurança antes de arriscar um bloqueio real do Omie — os itens seguintes não foram enviados."}
            {resultado.motivoInterrupcao ? ` Detalhe: ${resultado.motivoInterrupcao}` : ""}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard icon={CheckCircle2} label="Cadastrados" value={totais.enviados} tone="success" />
        <SummaryCard icon={RotateCcw} label="Já existiam" value={totais.jaExistiam} tone="warning" />
        <SummaryCard icon={XCircle} label="Falhas" value={totais.falhas} tone="danger" />
        <SummaryCard icon={MinusCircle} label="Não enviados" value={totais.naoEnviados} tone="muted" />
      </div>

      {totais.recusados > 0 && (
        <p className="text-xs text-muted-foreground">
          {totais.recusados} item(ns) foram recusados por não estarem marcados como “novo” (duplicados nunca são
          reenviados).
        </p>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Código</th>
              <th className="px-3 py-2 font-medium">Descrição</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {resultado.produtos.map((p) => (
              <tr key={p.codigo} className="border-t border-border/60">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground">{p.codigo}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {p.descricao}
                  {p.motivo ? <span className="mt-0.5 block text-xs text-danger">{p.motivo}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <OutcomeBadge outcome={p.outcome} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resultado.estrutura.length > 0 && (
        <div className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Network className="h-4 w-4 text-primary" />
            Estrutura (pai → filho)
          </h3>
          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Pai</th>
                  <th className="px-3 py-2 font-medium">Filho</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {resultado.estrutura.map((rel) => (
                  <tr key={`${rel.numeroPai}>${rel.numeroFilho}`} className="border-t border-border/60">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-foreground">{rel.codigoPai}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs text-foreground">{rel.codigoFilho}</span>
                      {rel.motivo ? <span className="mt-0.5 block text-xs text-danger">{rel.motivo}</span> : null}
                    </td>
                    <td className="px-3 py-2">
                      <OutcomeBadge outcome={rel.outcome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

// Anexo do report auto = mesmo teto do report manual (cabe na resposta serverless).
const MAX_ANEXO_AUTO_REPORT = 4 * 1024 * 1024;

// Houve algo que valha capturar pro suporte? (mesma regra do servidor `houveFalha`).
function envioTeveFalha(estado: EnvioState): boolean {
  const r = estado.resultado;
  if (!r) return false;
  if (r.interrompido) return true;
  return (
    r.familias.some((f) => f.outcome === "falha") ||
    r.produtos.some((p) => p.outcome === "falha") ||
    r.estrutura.some((e) => e.outcome === "falha")
  );
}

// Detalhamento legível do que falhou — vira a mensagem do report automático, pra
// o suporte cruzar com a planilha anexada sem abrir o banco.
function mensagemFalhaEnvio(estado: EnvioState): string {
  const r = estado.resultado;
  if (!r) return "Falha no envio ao Omie.";
  const linhas: string[] = [
    "Registrado automaticamente: o envio ao Omie teve falha (planilha usada em anexo).",
    `Resumo: ${r.totais.enviados} cadastrado(s), ${r.totais.jaExistiam} já existia(m), ` +
      `${r.totais.falhas} falha(s), ${r.totais.naoEnviados} não enviado(s).`,
  ];
  if (r.interrompido) {
    const causa = r.bloqueado ? "bloqueio do Omie" : "freio de segurança";
    linhas.push(`Lote interrompido (${causa}): ${r.motivoInterrupcao ?? ""}`.trim());
  }
  for (const f of r.familias.filter((x) => x.outcome === "falha")) {
    linhas.push(`Família ${f.familia}: ${f.motivo ?? "falha"}`);
  }
  for (const p of r.produtos.filter((x) => x.outcome === "falha")) {
    linhas.push(`Produto ${p.codigo}: ${p.motivo ?? "falha"}`);
  }
  for (const e of r.estrutura.filter((x) => x.outcome === "falha")) {
    linhas.push(`Estrutura ${e.codigoPai} → ${e.codigoFilho}: ${e.motivo ?? "falha"}`);
  }
  return linhas.join("\n").slice(0, 4000);
}

export function ProdutosClient({ omiePronto = true }: { omiePronto?: boolean }) {
  const [bomFile, setBomFile] = useState<File | null>(null);
  const [omieFile, setOmieFile] = useState<File | null>(null);

  const [bomRows, setBomRows] = useState<BomRow[] | null>(null);
  const [carregandoBom, setCarregandoBom] = useState(false);
  const [erroBom, setErroBom] = useState<string | null>(null);

  const [existingCodes, setExistingCodes] = useState<string[]>([]);
  const [carregandoOmie, setCarregandoOmie] = useState(false);
  const [erroOmie, setErroOmie] = useState<string | null>(null);

  const [localEstoque, setLocalEstoque] = useState("");
  const [ncm, setNcm] = useState(NCM_PADRAO);

  const [gerando, setGerando] = useState(false);
  const [erroGeracao, setErroGeracao] = useState<string | null>(null);
  const [resultadoGeracao, setResultadoGeracao] = useState<ResultadoEscrita | null>(null);
  const [resultadoEstrutura, setResultadoEstrutura] = useState<ResultadoEscrita | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultadoEnvio, setResultadoEnvio] = useState<EnvioState | null>(null);
  const [autoReportado, setAutoReportado] = useState(false);

  // Guardas contra resultados fora de ordem: só o último pedido de leitura
  // (BOM ou Omie) tem permissão de escrever no estado.
  const bomReqId = useRef(0);
  const omieReqId = useRef(0);

  function limparResultadoGeracao() {
    setResultadoGeracao(null);
    setResultadoEstrutura(null);
    setErroGeracao(null);
    setResultadoEnvio(null);
    setErroEnvio(null);
  }

  // A leitura roda em resposta ao evento de seleção do arquivo (padrão
  // recomendado pelo React: "You Might Not Need an Effect"), evitando setState
  // síncrono dentro de um useEffect.
  async function handleBomChange(file: File | null) {
    setBomFile(file);
    limparResultadoGeracao();
    const reqId = bomReqId.current + 1;
    bomReqId.current = reqId;

    if (!file) {
      setBomRows(null);
      setErroBom(null);
      setCarregandoBom(false);
      return;
    }

    setCarregandoBom(true);
    setErroBom(null);
    try {
      const rows = await lerBomDeArquivo(file);
      if (reqId !== bomReqId.current) return;
      setBomRows(rows);
    } catch (e) {
      if (reqId !== bomReqId.current) return;
      setBomRows(null);
      setErroBom(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqId === bomReqId.current) setCarregandoBom(false);
    }
  }

  async function handleOmieChange(file: File | null) {
    setOmieFile(file);
    limparResultadoGeracao();
    const reqId = omieReqId.current + 1;
    omieReqId.current = reqId;

    if (!file) {
      setExistingCodes([]);
      setErroOmie(null);
      setCarregandoOmie(false);
      return;
    }

    setCarregandoOmie(true);
    setErroOmie(null);
    try {
      const bytes = await lerBytesArquivo(file);
      if (reqId !== omieReqId.current) return;
      setExistingCodes(extrairCodigosExistentes(bytes));
    } catch (e) {
      if (reqId !== omieReqId.current) return;
      setErroOmie(e instanceof Error ? e.message : String(e));
    } finally {
      if (reqId === omieReqId.current) setCarregandoOmie(false);
    }
  }

  const parseResult = useMemo(
    () => (bomRows ? parseBom(bomRows, existingCodes) : null),
    [bomRows, existingCodes],
  );
  const estruturaRels = useMemo(() => (bomRows ? parseEstrutura(bomRows) : []), [bomRows]);

  // --- Estado da revisão editável --------------------------------------------
  // Espelha o resultado do parser em estado que o usuário pode editar (incluir/
  // excluir, descrição, família, quantidade). Reconstruímos quando o parse muda
  // de identidade (nova BOM ou novo Omie de referência), sem useEffect: é o
  // padrão do React de ajustar estado durante o render ao detectar a mudança.
  const [produtoReview, setProdutoReview] = useState<ProdutoReviewItem[]>([]);
  const [estruturaReview, setEstruturaReview] = useState<EstruturaReviewItem[]>([]);
  const [itensAnteriores, setItensAnteriores] = useState<ParsedItem[] | null>(null);
  const [relsAnteriores, setRelsAnteriores] = useState<EstruturaRel[] | null>(null);

  if (parseResult && parseResult.itens !== itensAnteriores) {
    setItensAnteriores(parseResult.itens);
    setProdutoReview(buildProdutoReview(parseResult.itens));
  }
  if (estruturaRels !== relsAnteriores) {
    setRelsAnteriores(estruturaRels);
    setEstruturaReview(buildEstruturaReview(estruturaRels));
  }

  function updateProduto(id: string, patch: Partial<ProdutoReviewItem>) {
    setProdutoReview((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updateEstrutura(id: string, patch: Partial<EstruturaReviewItem>) {
    setEstruturaReview((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  const resumo = useMemo(() => resumoProdutos(produtoReview), [produtoReview]);
  const produtosEnvio = useMemo(() => produtosParaEnvio(produtoReview), [produtoReview]);
  const estruturaEnvio = useMemo(() => estruturaParaEnvio(estruturaReview), [estruturaReview]);

  async function handleGerar() {
    if (produtosEnvio.length === 0) return;
    setGerando(true);
    setErroGeracao(null);
    try {
      const bytesBase = omieFile ? await lerBytesArquivo(omieFile) : await lerBytesTemplate();
      const produtos = preencherProdutos(bytesBase, produtosEnvio, ncm);

      // Se houver estrutura pai/filho, preenche também a aba Omie_Produtos_Estrutura
      // no MESMO arquivo (encadeado sobre os bytes já com os produtos).
      let bytesFinais = produtos.bytes;
      let resEstrutura: ResultadoEscrita | null = null;
      if (estruturaEnvio.length > 0) {
        const estrutura = preencherEstrutura(produtos.bytes, estruturaEnvio, localEstoque);
        bytesFinais = estrutura.bytes;
        resEstrutura = estrutura.resultado;
      }

      const arquivoNome = nomeArquivoSaida();
      baixarBlob(bytesParaBlob(bytesFinais), arquivoNome);
      setResultadoGeracao(produtos.resultado);
      setResultadoEstrutura(resEstrutura);

      // Auditoria (best-effort): não bloqueia o download já concluído.
      try {
        await registrarPlanilhaGerada({
          arquivoNome,
          totalProdutos: produtos.resultado.quantidadeEscrita,
          totalEstrutura: resEstrutura?.quantidadeEscrita ?? 0,
          totalErros: resumo.comErro,
        });
      } catch {
        // registrar a auditoria não deve impedir o uso da planilha
      }
    } catch (e) {
      setErroGeracao(e instanceof Error ? e.message : String(e));
    } finally {
      setGerando(false);
    }
  }

  async function handleEnviar() {
    if (produtosEnvio.length === 0) return;
    setEnviando(true);
    setErroEnvio(null);
    setResultadoEnvio(null);
    setAutoReportado(false);
    try {
      const resposta = await enviarAoOmie({
        novos: produtosEnvio,
        estrutura: estruturaEnvio,
        localEstoque,
        arquivoNome: bomFile?.name,
        ncm,
      });
      setResultadoEnvio(resposta);
      if (!resposta.ok) {
        setErroEnvio(resposta.erro ?? "Não foi possível enviar ao Omie.");
      }
      // Captura automática pro suporte: em qualquer falha, cria um report com a
      // planilha usada em anexo + o detalhamento dos erros. Best-effort: nunca
      // atrapalha o envio já concluído.
      if (envioTeveFalha(resposta)) {
        void registrarFalhaComoReport(resposta);
      }
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  async function registrarFalhaComoReport(estado: EnvioState) {
    try {
      const fd = new FormData();
      fd.set("tipo", "PROBLEMA");
      fd.set("titulo", `[Automático] Falha no envio ao Omie: ${bomFile?.name ?? "planilha"}`.slice(0, 120));
      fd.set("mensagem", mensagemFalhaEnvio(estado));
      fd.set("rota", "/produtos");
      // Anexa a planilha usada, se couber no limite; se for grande demais, ainda
      // registra o report (só sem o arquivo).
      if (bomFile && bomFile.size <= MAX_ANEXO_AUTO_REPORT) fd.append("anexos", bomFile);
      const res = await criarReport(IDLE_FORM_STATE, fd);
      if (res.status === "success") setAutoReportado(true);
    } catch {
      // captura de erro não pode gerar outro erro na tela
    }
  }

  const ocupado = gerando || enviando;
  const temSelecionados = produtosEnvio.length > 0;
  const podeGerar = temSelecionados && !ocupado;
  const podeEnviar = temSelecionados && !ocupado;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-primary/5 px-4 py-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          <strong>Revise, corrija e então</strong> envie direto ao Omie — os produtos entram já com os campos
          obrigatórios e o controle de lote ativado. Na tabela abaixo você{" "}
          <span className="font-medium">marca o que vai</span> e edita descrição, família e quantidade. Prefere conferir
          antes no Omie? Também dá pra baixar a planilha e importar na mão.
        </p>
      </div>

      {!omiePronto && (
        <div className="flex items-start gap-2 rounded-2xl bg-warning-dim px-4 py-3 text-sm text-warning ring-1 ring-inset ring-warning/25">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            O envio automático ao Omie está temporariamente indisponível (integração em configuração). Você ainda pode
            baixar a planilha e importá-la no Omie normalmente. Avise o administrador se persistir.
          </span>
        </div>
      )}

      <section className="grid gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2 sm:p-6">
        <FileDropzone
          label="1. BOM do CAD (.xls / .xlsx)"
          hint="Aba com as colunas Nº, PEÇA e QTD."
          accept=".xls,.xlsx"
          file={bomFile}
          onChange={handleBomChange}
          loading={carregandoBom}
        />
        <FileDropzone
          label="2. Seu Omie_Produtos.xlsx atual"
          hint="Pra não duplicar código já cadastrado antes. Sem isso, usamos o template em branco."
          accept=".xls,.xlsx"
          file={omieFile}
          onChange={handleOmieChange}
          optional
          loading={carregandoOmie}
        />
      </section>

      {erroBom && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-dim px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erroBom}</span>
        </div>
      )}
      {erroOmie && (
        <div className="flex items-start gap-2 rounded-2xl bg-danger-dim px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{erroOmie}</span>
        </div>
      )}

      {parseResult && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard icon={CheckCircle2} label="Produtos selecionados" value={resumo.selecionados} tone="success" />
            <SummaryCard icon={AlertTriangle} label="Com erro (corrigir)" value={resumo.comErro} tone="danger" />
            <SummaryCard icon={MinusCircle} label="Ignorados" value={resumo.ignorados} tone="muted" />
            {estruturaReview.length > 0 && (
              <SummaryCard icon={Network} label="Estruturas incluídas" value={estruturaEnvio.length} tone="muted" />
            )}
          </section>

          <section className="space-y-3">
            <div className="flex items-start gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <PencilLine className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Revise antes de gerar/enviar: <strong className="text-foreground">desmarque</strong> o que não deve ir e{" "}
                <strong className="text-foreground">corrija a descrição ou a família</strong> aqui mesmo. O código (SKU)
                é a identidade do produto — se estiver errado, ajuste na BOM. Só os itens marcados e válidos são usados.
              </span>
            </div>
            <PreviewTable
              itens={produtoReview}
              onToggle={(id, included) => updateProduto(id, { included })}
              onDescricao={(id, descricaoProduto) => updateProduto(id, { descricaoProduto })}
              onFamilia={(id, familia) => updateProduto(id, { familia })}
            />
          </section>

          {estruturaReview.length > 0 && (
            <section className="space-y-4">
              <EstruturaPreview
                itens={estruturaReview}
                onToggle={(id, included) => updateEstrutura(id, { included })}
                onQuantidade={(id, quantidade) => updateEstrutura(id, { quantidade })}
              />
              <div className="rounded-2xl border border-border bg-card p-4">
                <label htmlFor="local-estoque" className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Warehouse className="h-4 w-4 text-primary" />
                  Local de Estoque{" "}
                  <span className="text-xs font-normal text-muted-foreground">(para a estrutura pai/filho)</span>
                </label>
                <input
                  id="local-estoque"
                  type="text"
                  value={localEstoque}
                  onChange={(e) => setLocalEstoque(e.target.value)}
                  placeholder="Ex.: Geral, Almoxarifado… (deixe vazio se não usar)"
                  className="mt-2 w-full rounded-xl border border-border bg-field px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                />
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Network className="mt-0.5 h-3 w-3 shrink-0" />
                  O Omie pede o Local de Estoque na aba de estrutura. Se souber o nome do seu local no Omie, informe
                  aqui; senão, deixe em branco.
                </p>
              </div>
            </section>
          )}

          <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start gap-2 rounded-2xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              <Building2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Destino: <span className="font-medium text-foreground">Omie</span> — os produtos são criados ou
                atualizados na sua conta da Vital Scheffer (reenviar não duplica).
              </span>
            </div>

            <div className="rounded-2xl border border-border bg-field/40 p-4">
              <label htmlFor="ncm-padrao" className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Receipt className="h-4 w-4 text-primary" />
                NCM dos produtos novos
              </label>
              <input
                id="ncm-padrao"
                type="text"
                value={ncm}
                onChange={(e) => setNcm(e.target.value)}
                placeholder={NCM_PADRAO}
                inputMode="numeric"
                className="mt-2 w-full max-w-[12rem] rounded-xl border border-border bg-field px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                Vale só para os produtos <span className="font-medium text-foreground">novos</span> deste envio (os que já
                existem no Omie mantêm o NCM atual). O Fiscal ajusta por peça depois, se precisar. Evite 9999.99.99 (a
                SEFAZ rejeita na nota de transferência).
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {resumo.comErro > 0 ? (
                  <span>
                    <strong className="text-danger">{resumo.comErro} item(ns) marcado(s) com erro</strong> não vão até
                    você corrigir a descrição/família — ou desmarcá-los.
                  </span>
                ) : temSelecionados ? (
                  <span>
                    <strong className="text-foreground">{resumo.selecionados} produto(s)</strong> selecionado(s)
                    {estruturaEnvio.length > 0 ? ` e ${estruturaEnvio.length} relação(ões) de estrutura` : ""} prontos
                    para gerar ou enviar.
                  </span>
                ) : (
                  <span>Marque pelo menos um produto válido para gerar a planilha ou enviar ao Omie.</span>
                )}
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
              <button
                type="button"
                disabled={!podeGerar}
                onClick={handleGerar}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground disabled:hover:bg-card"
              >
                {gerando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Gerar planilha (backup)
              </button>
              <button
                type="button"
                disabled={!podeEnviar}
                onClick={handleEnviar}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:brightness-100"
              >
                {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Enviar ao Omie
              </button>
              </div>
            </div>
          </section>

          {erroGeracao && (
            <div className="flex items-start gap-2 rounded-2xl bg-danger-dim px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erroGeracao}</span>
            </div>
          )}

          {resultadoGeracao && !erroGeracao && (
            <div className="flex items-start gap-2 rounded-2xl bg-success-dim px-4 py-3 text-sm text-success ring-1 ring-inset ring-success/25">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Planilha gerada e baixada: {resultadoGeracao.quantidadeEscrita} produto(s) novo(s) na aba
                Omie_Produtos
                {resultadoEstrutura && resultadoEstrutura.quantidadeEscrita > 0
                  ? ` e ${resultadoEstrutura.quantidadeEscrita} relação(ões) pai/filho na aba Omie_Produtos_Estrutura`
                  : ""}
                . Agora é só importar no Omie em “Importar Planilha de Produtos” (passo 3 — Envie a Planilha
                Preenchida).
              </span>
            </div>
          )}

          {erroEnvio && (
            <div className="flex items-start gap-2 rounded-2xl bg-danger-dim px-4 py-3 text-sm text-danger ring-1 ring-inset ring-danger/25">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{erroEnvio}</span>
            </div>
          )}

          {resultadoEnvio?.resultado && <EnvioResultadoView estado={resultadoEnvio} />}

          {autoReportado && (
            <div className="flex items-start gap-2 rounded-2xl bg-primary/5 px-4 py-3 text-sm text-foreground ring-1 ring-inset ring-primary/20">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span>
                Registramos este envio automaticamente para o suporte (com a planilha usada e a lista de erros em
                anexo), pra facilitar a análise. Você acompanha em “Reportar / acompanhar”.
              </span>
            </div>
          )}
        </>
      )}

      {!bomFile && (
        <div className="flex items-center gap-3 rounded-3xl border border-dashed border-border px-5 py-8 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-5 w-5" />
          Envie a BOM exportada do CAD para começar.
        </div>
      )}
    </div>
  );
}
