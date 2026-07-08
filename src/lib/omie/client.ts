// Client base do Omie ERP (portado do nextstep/apps/omie/client.py).
//
// Fluxo de `chamar`: breaker → cache → POST → classifica → atualiza breaker/cache.
// A classificação por `faultstring` roda independente do status HTTP (o Omie
// às vezes valida via 5xx, não só 200 — ver REQUISITOS §6).
// Contrato de retorno:
//   • OK                    → objeto da resposta
//   • EMPTY/NOT_FOUND       → null (vazio/ausência; o caller decide []/null)
//   • BLOCKED/REDUNDANT     → lança OmieBlocked
//   • DUPLICATE             → lança OmieDuplicate (escrita idempotente)
//   • DESCRIPTION_CONFLICT  → lança OmieDescriptionConflict (descrição em uso por outro código)
//   • erro/5xx sem corpo/rede → lança OmieError (com retryable)

import { Breaker } from "./breaker";
import { type CacheStore, DEFAULT_TTL_SECONDS, cacheKey } from "./cache";
import { OMIE_BASE_URL, OMIE_TIMEOUT_MS, type OmieCredentials, omieCredentials } from "./config";
import { OmieBlocked, OmieDescriptionConflict, OmieDuplicate, OmieError } from "./errors";
import { PrismaBreakerStore, PrismaCacheStore } from "./stores";
import { Category, EMPTY_LIKE, type WarnLogger, classifyFault, parseRetryAfter } from "./taxonomy";

export type OmiePayload = Record<string, unknown>;

export interface ChamarOptions {
  write?: boolean;
  ttlSeconds?: number;
  timeoutMs?: number;
}

// Dependências injetáveis (facilita teste; a produção usa defaultDeps).
export interface OmieClientDeps {
  breaker: Breaker;
  cache: CacheStore;
  fetchImpl: typeof fetch;
  credentials: () => OmieCredentials;
  baseUrl: string;
  logger: WarnLogger;
}

const EMPTY_VALUES = new Set<string>(EMPTY_LIKE.map((c) => c as string));

export function defaultDeps(): OmieClientDeps {
  return {
    breaker: new Breaker(new PrismaBreakerStore()),
    cache: new PrismaCacheStore(),
    fetchImpl: fetch,
    credentials: omieCredentials,
    baseUrl: OMIE_BASE_URL,
    logger: console,
  };
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  const clean = path.replace(/^\/+|\/+$/g, "");
  return `${base}/${clean}/`;
}

function isRecord(value: unknown): value is OmiePayload {
  return typeof value === "object" && value !== null;
}

function retryableFaultcode(faultcode?: string): boolean {
  return typeof faultcode === "string" && faultcode.toLowerCase().includes("server");
}

async function safeText(resp: Response): Promise<string> {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

export async function chamar(
  path: string,
  call: string,
  param: OmiePayload,
  options: ChamarOptions = {},
  deps: OmieClientDeps = defaultDeps(),
): Promise<OmiePayload | null> {
  const write = options.write ?? false;
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  const blockedUntil = await deps.breaker.openUntil();
  if (blockedUntil) {
    throw new OmieBlocked("Omie indisponível (breaker aberto).", { retryAfter: blockedUntil });
  }

  const key = cacheKey(path, call, param);
  if (!write) {
    const hit = await deps.cache.get(key);
    if (hit) {
      return EMPTY_VALUES.has(hit.categoria) ? null : (hit.resposta as OmiePayload);
    }
  }

  const { appKey, appSecret } = deps.credentials();
  const body = { call, app_key: appKey, app_secret: appSecret, param: [param] };

  let resp: Response;
  try {
    resp = await deps.fetchImpl(buildUrl(deps.baseUrl, path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs ?? OMIE_TIMEOUT_MS),
    });
  } catch (error) {
    await deps.breaker.recordFault();
    throw new OmieError(`falha de rede: ${String(error)}`, { retryable: true });
  }

  return handle(path, call, param, resp, { write, ttlSeconds, key }, deps);
}

interface HandleContext {
  write: boolean;
  ttlSeconds: number;
  key: string;
}

async function handle(
  path: string,
  call: string,
  param: OmiePayload,
  resp: Response,
  ctx: HandleContext,
  deps: OmieClientDeps,
): Promise<OmiePayload | null> {
  const rawBody = await safeText(resp);
  let bodyJson: unknown;
  try {
    bodyJson = rawBody ? JSON.parse(rawBody) : undefined;
  } catch {
    bodyJson = undefined;
  }

  const faultstring = isRecord(bodyJson) ? (bodyJson.faultstring as string | undefined) : undefined;

  // O Omie normalmente devolve erro como HTTP 200 + `faultstring` (semântica
  // invertida), mas HTTP 5xx às vezes também é validação, não só infra
  // (REQUISITOS §6) — por isso classificamos o corpo antes de desistir por status.
  if (!faultstring) {
    if (resp.status >= 500) {
      await deps.breaker.recordFault();
      const detail = rawBody.slice(0, 500).trim();
      const message = detail ? `HTTP ${resp.status}: ${detail}` : `HTTP ${resp.status}`;
      throw new OmieError(message, { retryable: true, status: resp.status });
    }

    if (bodyJson === undefined) {
      // Corpo não-JSON é quase sempre resposta quebrada/infra do Omie → retryable.
      await deps.breaker.recordFault();
      throw new OmieError(`resposta não-JSON (HTTP ${resp.status})`, {
        retryable: true,
        status: resp.status,
      });
    }

    await deps.breaker.recordOk();
    const resposta = isRecord(bodyJson) ? bodyJson : {};
    await deps.cache.store({
      key: ctx.key,
      path,
      call,
      param,
      categoria: Category.OK,
      resposta,
      ttlSeconds: ctx.ttlSeconds,
    });
    if (ctx.write) {
      await deps.cache.invalidate(path);
    }
    return resposta;
  }

  const faultcode = isRecord(bodyJson) ? (bodyJson.faultcode as string | undefined) : undefined;
  const category = classifyFault(faultstring, deps.logger);

  if (category === Category.EMPTY || category === Category.NOT_FOUND) {
    await deps.breaker.recordFault(); // o Omie conta vazio/não-encontrado nos 10
    await deps.cache.store({
      key: ctx.key,
      path,
      call,
      param,
      categoria: category,
      resposta: bodyJson,
      ttlSeconds: ctx.ttlSeconds,
    });
    return null;
  }

  if (category === Category.BLOCKED) {
    await deps.breaker.recordFault({ blocked: true, blockedSeconds: parseRetryAfter(faultstring) });
    throw new OmieBlocked(faultstring, { retryAfter: (await deps.breaker.openUntil()) ?? undefined });
  }

  if (category === Category.REDUNDANT) {
    // Específico do payload (o cache normalmente evita) — conta como fault, mas
    // não congela o app_key inteiro; o caller espera os segundos e refaz.
    await deps.breaker.recordFault();
    const wait = parseRetryAfter(faultstring) ?? 60;
    throw new OmieBlocked(faultstring, { retryAfter: new Date(Date.now() + wait * 1000) });
  }

  if (category === Category.DUPLICATE) {
    await deps.breaker.recordFault();
    throw new OmieDuplicate(faultstring, { faultcode });
  }

  if (category === Category.DESCRIPTION_CONFLICT) {
    await deps.breaker.recordFault();
    throw new OmieDescriptionConflict(faultstring, { faultcode });
  }

  if (category === Category.TRANSIENT) {
    await deps.breaker.recordFault();
    throw new OmieError(faultstring, { retryable: true, faultcode });
  }

  await deps.breaker.recordFault();
  throw new OmieError(faultstring, {
    retryable: retryableFaultcode(faultcode),
    faultcode,
    status: resp.status,
  });
}
