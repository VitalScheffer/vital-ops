"use client";

import {
  Bug,
  Check,
  Lightbulb,
  Loader2,
  MessageSquarePlus,
  Paperclip,
  Send,
  TriangleAlert,
  X,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useActionState, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";

import {
  criarReport,
  listarReports,
  resolverReport,
  type ReportView,
} from "@/app/(app)/reports-actions";
import { FormFeedback } from "@/components/FormFeedback";
import { Select } from "@/components/ui/Select";
import { IDLE_FORM_STATE } from "@/lib/form";

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

const STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ANALISE: "Em análise",
  RESOLVIDO: "Resolvido",
};

const STATUS_CLASS: Record<string, string> = {
  ABERTO: "bg-warning-dim text-warning",
  EM_ANALISE: "bg-primary/10 text-primary",
  RESOLVIDO: "bg-success-dim text-success",
};

const TIPO_LABEL: Record<string, string> = {
  PROBLEMA: "Problema",
  SUGESTAO: "Sugestão",
  ERRO_SISTEMA: "Erro do sistema",
};

export function ReportDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
        aria-label="Reportar um problema ou sugestão"
        title="Reportar / acompanhar"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>
      {open && <ReportModal onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportModal({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const titleId = useId();
  const [tab, setTab] = useState<"enviar" | "acompanhar">("enviar");
  const [reports, setReports] = useState<ReportView[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0);

  const [state, formAction, pending] = useActionState(criarReport, IDLE_FORM_STATE);
  const [handled, setHandled] = useState(state);

  // Ao enviar com sucesso: recarrega a lista e leva o usuário para "acompanhar".
  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") {
      setTab("acompanhar");
      setReload((n) => n + 1);
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (tab !== "acompanhar") return;
    let vivo = true;
    const carregar = async () => {
      setLoading(true);
      try {
        const res = await listarReports();
        if (!vivo) return;
        setReports(res.reports);
        setIsAdmin(res.isAdmin);
      } finally {
        if (vivo) setLoading(false);
      }
    };
    void carregar();
    return () => {
      vivo = false;
    };
  }, [tab, reload]);

  // Portal para o <body>: o botão fica no header, que tem backdrop-blur. Um
  // ancestral com backdrop-filter/transform vira "containing block" do position:
  // fixed, prendendo o modal ao header (64px) em vez da tela. O portal escapa disso.
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/50"
        tabIndex={-1}
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-card-foreground">
            Reportar e acompanhar
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-1 border-b border-border px-4 pt-3">
          {(["enviar", "acompanhar"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-t-lg px-3 py-2 text-sm font-medium transition-colors ${
                tab === t
                  ? "border-b-2 border-primary text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "enviar" ? "Enviar" : isAdmin ? "Todos os reports" : "Meus reports"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {tab === "enviar" ? (
            <form id="report-form" action={formAction} className="flex flex-col gap-3.5">
              <input type="hidden" name="rota" value={pathname} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="report-tipo" className="text-sm font-medium text-card-foreground">
                  Tipo
                </label>
                <Select id="report-tipo" name="tipo" defaultValue="PROBLEMA">
                  <option className="bg-card text-foreground" value="PROBLEMA">
                    Problema / erro
                  </option>
                  <option className="bg-card text-foreground" value="SUGESTAO">
                    Sugestão / melhoria
                  </option>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="report-titulo" className="text-sm font-medium text-card-foreground">
                  Título
                </label>
                <input
                  id="report-titulo"
                  name="titulo"
                  required
                  maxLength={120}
                  placeholder="Ex.: erro ao enviar planilha ao Omie"
                  className="rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="report-msg" className="text-sm font-medium text-card-foreground">
                  Descreva o que aconteceu (ou a ideia)
                </label>
                <textarea
                  id="report-msg"
                  name="mensagem"
                  required
                  rows={3}
                  maxLength={4000}
                  placeholder="Quanto mais detalhe, mais fácil de resolver."
                  className="resize-y rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="report-anexos" className="text-sm font-medium text-card-foreground">
                  Anexos (opcional)
                </label>
                <input
                  id="report-anexos"
                  name="anexos"
                  type="file"
                  multiple
                  accept="image/*,.pdf,.xlsx,.xls,.csv"
                  className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-card-foreground hover:file:bg-border"
                />
                <p className="text-xs text-muted-foreground">
                  Prints, fotos ou a planilha que deu erro. Até 5 arquivos, 4 MB cada.
                </p>
              </div>
              <FormFeedback state={state} />
            </form>
          ) : (
            <ReportList
              reports={reports}
              isAdmin={isAdmin}
              loading={loading}
              onChanged={() => setReload((n) => n + 1)}
            />
          )}
        </div>

        {tab === "enviar" && (
          <div className="border-t border-border px-6 py-3.5">
            <button
              type="submit"
              form="report-form"
              disabled={pending}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {pending ? "Enviando…" : "Enviar report"}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function tipoIcon(tipo: string) {
  if (tipo === "SUGESTAO") return <Lightbulb className="h-4 w-4 text-primary" />;
  if (tipo === "ERRO_SISTEMA") return <TriangleAlert className="h-4 w-4 text-danger" />;
  return <Bug className="h-4 w-4 text-warning" />;
}

function ReportList({
  reports,
  isAdmin,
  loading,
  onChanged,
}: {
  reports: ReportView[];
  isAdmin: boolean;
  loading: boolean;
  onChanged: () => void;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </p>
    );
  }
  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum report ainda.</p>;
  }
  return (
    <ul className="flex flex-col gap-3">
      {reports.map((r) => (
        <li key={r.id} className="rounded-xl border border-border bg-field/40 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              {tipoIcon(r.tipo)}
              <span className="text-sm font-medium text-card-foreground">{r.titulo}</span>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[r.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </div>
          <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">{r.mensagem}</p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            {TIPO_LABEL[r.tipo] ?? r.tipo} · {dateFormat.format(new Date(r.criadoEm))}
            {isAdmin && r.autorEmail ? ` · ${r.autorEmail}` : ""}
            {r.rota ? ` · ${r.rota}` : ""}
          </p>
          {r.anexos.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {r.anexos.map((a) =>
                a.mime.startsWith("image/") ? (
                  <a
                    key={a.id}
                    href={`/api/reports/anexo/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    title={a.nome}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/reports/anexo/${a.id}`}
                      alt={a.nome}
                      className="h-16 w-16 rounded-lg border border-border object-cover"
                    />
                  </a>
                ) : (
                  <a
                    key={a.id}
                    href={`/api/reports/anexo/${a.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted"
                  >
                    <Paperclip className="h-3.5 w-3.5" />
                    {a.nome}
                  </a>
                ),
              )}
            </div>
          ) : null}
          {r.resposta ? (
            <div className="mt-2 rounded-lg bg-success-dim/60 px-3 py-2 text-sm text-foreground">
              <span className="font-medium text-success">Resposta: </span>
              {r.resposta}
            </div>
          ) : null}
          {isAdmin ? <AdminResolve report={r} onChanged={onChanged} /> : null}
        </li>
      ))}
    </ul>
  );
}

function AdminResolve({ report, onChanged }: { report: ReportView; onChanged: () => void }) {
  const [state, action, pending] = useActionState(resolverReport, IDLE_FORM_STATE);
  const [handled, setHandled] = useState(state);
  const [aberto, setAberto] = useState(false);

  if (state !== handled) {
    setHandled(state);
    if (state.status === "success") {
      setAberto(false);
      onChanged();
    }
  }

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
      >
        <Check className="h-3.5 w-3.5" />
        Tratar
      </button>
    );
  }

  return (
    <form action={action} className="mt-3 flex flex-col gap-2 border-t border-border pt-3">
      <input type="hidden" name="id" value={report.id} />
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-card-foreground">Status</label>
        <Select name="status" defaultValue={report.status === "ERRO_SISTEMA" ? "ABERTO" : report.status}>
          <option className="bg-card text-foreground" value="ABERTO">
            Aberto
          </option>
          <option className="bg-card text-foreground" value="EM_ANALISE">
            Em análise
          </option>
          <option className="bg-card text-foreground" value="RESOLVIDO">
            Resolvido
          </option>
        </Select>
      </div>
      <textarea
        name="resposta"
        rows={2}
        defaultValue={report.resposta ?? ""}
        maxLength={4000}
        placeholder="Resposta para quem reportou (opcional)"
        className="resize-y rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary"
      />
      <FormFeedback state={state} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Salvar
        </button>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
