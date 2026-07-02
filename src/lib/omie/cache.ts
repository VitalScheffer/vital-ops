// Cache de chamadas por (path, call, payload) — escudo da regra dos 60s
// (portado do nextstep/apps/omie/cache.py).
//
// A chave é o sha256 de `path|call|payload canônico`. Só ok/vazio são
// cacheáveis (erro nunca). Invalidar = expirar. A persistência fica atrás de
// `CacheStore`; a geração de chave (pura) mora aqui.

import { createHash } from "node:crypto";

import { Category } from "./taxonomy";

export const CACHEABLE = [Category.OK, Category.EMPTY, Category.NOT_FOUND] as const;
export const DEFAULT_TTL_SECONDS = 60;

// Serialização canônica: chaves ordenadas em todos os níveis, para que payloads
// equivalentes gerem a mesma chave (equivalente ao json.dumps sort_keys=True).
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    return Object.keys(source)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue(source[key]);
        return acc;
      }, {});
  }
  return value;
}

export function cacheKey(path: string, call: string, param: unknown): string {
  const canonical = JSON.stringify(sortValue(param));
  const raw = `${path}|${call}|${canonical}`;
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export interface CacheEntry {
  categoria: Category;
  resposta: unknown;
}

export interface CacheStoreInput {
  key: string;
  path: string;
  call: string;
  param: unknown;
  categoria: Category;
  resposta: unknown;
  ttlSeconds: number;
}

export interface CacheStore {
  // Retorna a entrada não-expirada e cacheável, ou null.
  get(key: string): Promise<CacheEntry | null>;
  store(input: CacheStoreInput): Promise<void>;
  // Expira as leituras cacheadas de um path (chamado após escrita). Retorna
  // quantas entradas foram invalidadas.
  invalidate(path: string): Promise<number>;
}
