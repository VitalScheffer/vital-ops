import type { Prisma } from "@prisma/client";
import { Filter, Search } from "lucide-react";
import Link from "next/link";

import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewAudit } from "@/lib/rbac";

export const metadata = { title: "Auditoria — Vital Ops" };

const MAX_ROWS = 200;

const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

// O user-agent cru sempre começa com "Mozilla/5.0…" (padrão histórico) — traduz
// pro nome do navegador de verdade (o UA completo fica no tooltip).
function nomeNavegador(ua: string | null): string {
  if (!ua) return "—";
  if (/\bEdg\//.test(ua)) return "Edge";
  if (/\bOPR\/|Opera/.test(ua)) return "Opera";
  if (/\bChrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/\bFirefox\//.test(ua)) return "Firefox";
  if (/\bSafari\//.test(ua)) return "Safari";
  return "Outro";
}

interface AuditSearchParams {
  q?: string | string[];
  action?: string | string[];
  from?: string | string[];
  to?: string | string[];
}

function first(value?: string | string[]): string {
  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }
  return value?.trim() ?? "";
}

function buildWhere(filters: {
  q: string;
  action: string;
  from: string;
  to: string;
}): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};
  if (filters.q) {
    // PostgreSQL: LIKE é case-sensitive por padrão — precisa do mode
    // "insensitive" (vira ILIKE) pra buscar sem se importar com maiúsculas.
    where.actorEmail = { contains: filters.q, mode: "insensitive" };
  }
  if (filters.action) {
    where.action = { contains: filters.action, mode: "insensitive" };
  }
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) {
    createdAt.gte = new Date(`${filters.from}T00:00:00`);
  }
  if (filters.to) {
    createdAt.lte = new Date(`${filters.to}T23:59:59.999`);
  }
  if (filters.from || filters.to) {
    where.createdAt = createdAt;
  }
  return where;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

// Auditoria (ADMIN/GESTOR): lista o AuditLog com filtros por pessoa, ação e período.
export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<AuditSearchParams>;
}) {
  const session = await auth();
  const permissions = await getRolePermissionsMap();
  if (!canViewAudit(session!.user.role, permissions)) {
    return <Forbidden message="A auditoria é restrita a quem tem esse módulo liberado." />;
  }

  const params = await searchParams;
  const filters = {
    q: first(params.q),
    action: first(params.action),
    from: first(params.from),
    to: first(params.to),
  };

  const where = buildWhere(filters);
  const [logs, knownActions] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: MAX_ROWS,
    }),
    prisma.auditLog.findMany({
      distinct: ["action"],
      select: { action: true },
      orderBy: { action: "asc" },
    }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Auditoria</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Histórico de quem fez o quê, quando e de onde.
        </p>
      </header>

      <Panel title="Filtros">
        <form method="get" className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-q" className="text-sm font-medium text-card-foreground">
                Pessoa (e-mail)
              </label>
              <input id="f-q" name="q" defaultValue={filters.q} placeholder="nome@…" className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-action" className="text-sm font-medium text-card-foreground">
                Ação
              </label>
              <input
                id="f-action"
                name="action"
                defaultValue={filters.action}
                placeholder="ex.: user.create"
                list="known-actions"
                className={inputClass}
              />
              <datalist id="known-actions">
                {knownActions.map((row) => (
                  <option key={row.action} value={row.action} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-from" className="text-sm font-medium text-card-foreground">
                De
              </label>
              <input id="f-from" name="from" type="date" defaultValue={filters.from} className={inputClass} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-to" className="text-sm font-medium text-card-foreground">
                Até
              </label>
              <input id="f-to" name="to" type="date" defaultValue={filters.to} className={inputClass} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Filter className="h-4 w-4" />
              Filtrar
            </button>
            <Link href="/auditoria" className="text-sm text-muted-foreground hover:text-foreground">
              Limpar
            </Link>
          </div>
        </form>
      </Panel>

      <Panel
        title={`Registros (${logs.length}${logs.length === MAX_ROWS ? "+" : ""})`}
        description={
          logs.length === MAX_ROWS
            ? `Mostrando os ${MAX_ROWS} mais recentes. Refine os filtros para ver o resto.`
            : undefined
        }
      >
        {logs.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Search className="h-4 w-4" />
            Nenhum registro encontrado para os filtros atuais.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Data/hora</th>
                  <th className="px-3 py-2 font-medium">Quem</th>
                  <th className="px-3 py-2 font-medium">Ação</th>
                  <th className="px-3 py-2 font-medium">Entidade</th>
                  <th className="px-3 py-2 font-medium">Resumo</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Navegador</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border/60 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {dateTimeFormat.format(log.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-card-foreground">{log.actorEmail}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-xs text-card-foreground">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {log.entity}
                      {log.entityId ? <span className="text-muted-foreground/70"> · {log.entityId}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-card-foreground">{log.summary}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{log.ip ?? "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground" title={log.userAgent ?? undefined}>
                      {nomeNavegador(log.userAgent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
