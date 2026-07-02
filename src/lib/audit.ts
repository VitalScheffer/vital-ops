import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

// Helper único de auditoria (REQUISITOS §5): grava toda ação relevante em
// AuditLog, capturando IP real (x-forwarded-for na Vercel) e user-agent.
// Chame em TODA mutation para não deixar buraco.

export interface AuditActor {
  id?: string | null;
  email: string;
}

export interface AuditInput {
  actor: AuditActor;
  action: string; // ex.: "user.create", "produto.enviar", "requisicao.confirmar"
  entity: string; // ex.: "User", "ProdutoImport", "Requisicao"
  entityId?: string | null;
  summary: string; // texto legível em pt-BR
  before?: unknown; // estado anterior (quando aplicável)
  after?: unknown; // estado posterior (quando aplicável)
  omieTarget?: string | null; // empresa/CNPJ da app_key, quando a ação toca o Omie
  req?: Request | Headers; // para extrair IP e user-agent
}

function headersOf(req?: Request | Headers): Headers | null {
  if (!req) {
    return null;
  }
  return req instanceof Headers ? req : req.headers;
}

// Em produção (Vercel/proxy) o IP real vem em x-forwarded-for (1º da lista). No
// dev local (localhost, sem proxy) esses headers não existem → cai pra loopback.
// Normaliza loopback IPv6 (::1 / ::ffff:127.0.0.1) e desembrulha IPv4-em-IPv6.
function clientIp(headers: Headers | null): string | null {
  if (!headers) {
    return null;
  }
  const raw = (headers.get("x-forwarded-for")?.split(",")[0] ?? headers.get("x-real-ip") ?? "").trim();
  if (!raw || raw === "::1" || raw === "::ffff:127.0.0.1") {
    return "127.0.0.1";
  }
  return raw.replace(/^::ffff:/, "");
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return value as Prisma.InputJsonValue;
}

export async function audit(input: AuditInput): Promise<void> {
  const headers = headersOf(input.req);
  await prisma.auditLog.create({
    data: {
      actorId: input.actor.id ?? null,
      actorEmail: input.actor.email,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId ?? null,
      summary: input.summary,
      before: toJson(input.before),
      after: toJson(input.after),
      ip: clientIp(headers),
      userAgent: headers?.get("user-agent") ?? null,
      omieTarget: input.omieTarget ?? null,
    },
  });
}
