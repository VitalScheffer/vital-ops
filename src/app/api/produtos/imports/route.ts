import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError } from "@/lib/contracts";

// STUB — Módulo Produtos (Fase 2). Contrato definido; lógica implementada depois.
//
// GET  /api/produtos/imports          → lista os imports de BOM do usuário/setor
//        resposta: ProdutoImport[] (ver src/lib/contracts/produto.ts)
// POST /api/produtos/imports          → cria um import a partir da planilha BOM
//        body (multipart): arquivo .xlsx; resposta: ProdutoImport (status RASCUNHO)
//        parse pela lógica portada de omie-bom-converter (src/lib/bom/ — a criar)
//
// O envio ao Omie (UpsertFamilia/UpsertProduto/IncluirEstrutura) roda pela fila
// sequencial, respeitando o breaker/cache do client Omie (src/lib/omie).

async function ensureAuthenticated(): Promise<ApiError | null> {
  const session = await auth();
  return session?.user ? null : { error: "Não autenticado" };
}

export async function GET() {
  const unauthorized = await ensureAuthenticated();
  if (unauthorized) {
    return NextResponse.json<ApiError>(unauthorized, { status: 401 });
  }
  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Módulo Produtos (Fase 2)." },
    { status: 501 },
  );
}

export async function POST() {
  const unauthorized = await ensureAuthenticated();
  if (unauthorized) {
    return NextResponse.json<ApiError>(unauthorized, { status: 401 });
  }
  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Módulo Produtos (Fase 2)." },
    { status: 501 },
  );
}
