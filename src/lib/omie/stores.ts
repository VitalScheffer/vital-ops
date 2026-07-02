// Persistência do breaker e do cache em Postgres (Prisma). A lógica pura vive
// em breaker.ts/cache.ts; aqui é só o adaptador de banco.

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";
import type { BreakerEstado, BreakerState, BreakerStore } from "./breaker";
import { CACHEABLE, type CacheEntry, type CacheStore, type CacheStoreInput } from "./cache";
import { Category } from "./taxonomy";

const BREAKER_ID = 1;

export class PrismaBreakerStore implements BreakerStore {
  async load(): Promise<BreakerState> {
    const row =
      (await prisma.omieBreaker.findUnique({ where: { id: BREAKER_ID } })) ??
      (await prisma.omieBreaker.create({ data: { id: BREAKER_ID } }));
    return {
      estado: row.estado as BreakerEstado,
      faults: row.faults,
      cooldownUntil: row.cooldownUntil,
      blockedUntil: row.blockedUntil,
    };
  }

  async save(state: BreakerState): Promise<void> {
    await prisma.omieBreaker.update({
      where: { id: BREAKER_ID },
      data: {
        estado: state.estado,
        faults: state.faults,
        cooldownUntil: state.cooldownUntil,
        blockedUntil: state.blockedUntil,
      },
    });
  }
}

const CACHEABLE_VALUES = CACHEABLE.map((c) => c as string);

export class PrismaCacheStore implements CacheStore {
  async get(key: string): Promise<CacheEntry | null> {
    const row = await prisma.omieCache.findFirst({
      where: {
        chave: key,
        expiraEm: { gt: new Date() },
        categoria: { in: CACHEABLE_VALUES },
      },
    });
    if (!row) {
      return null;
    }
    return { categoria: row.categoria as Category, resposta: row.resposta };
  }

  async store(input: CacheStoreInput): Promise<void> {
    const expiraEm = new Date(Date.now() + input.ttlSeconds * 1000);
    const param = input.param as Prisma.InputJsonValue;
    const resposta = input.resposta as Prisma.InputJsonValue;
    await prisma.omieCache.upsert({
      where: { chave: input.key },
      create: {
        chave: input.key,
        path: input.path,
        call: input.call,
        param,
        categoria: input.categoria,
        resposta,
        expiraEm,
      },
      update: {
        path: input.path,
        call: input.call,
        param,
        categoria: input.categoria,
        resposta,
        expiraEm,
      },
    });
  }

  async invalidate(path: string): Promise<number> {
    const now = new Date();
    const result = await prisma.omieCache.updateMany({
      where: { path, expiraEm: { gt: now } },
      data: { expiraEm: now },
    });
    return result.count;
  }
}
