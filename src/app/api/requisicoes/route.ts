import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError } from "@/lib/contracts";
import { criarRequisicaoSchema } from "@/lib/contracts";

// STUB — Módulo Requisições de fábrica (Fase 3). Contrato definido; lógica depois.
//
// GET  /api/requisicoes    → lista requisições (próprias p/ FUNCIONARIO; do setor
//        p/ GESTOR). resposta: Requisicao[] (ver src/lib/contracts/requisicao.ts)
// POST /api/requisicoes    → cria requisição (valida com criarRequisicaoSchema).
//        fluxo: solicita → gestor confirma → baixa estoque (MAT) no Omie.
//
// A confirmação/recusa e a baixa de estoque terão rotas próprias na Fase 3.

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Módulo Requisições (Fase 3)." },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  // Valida o payload já no stub para deixar o contrato explícito ao frontend.
  const parsed = criarRequisicaoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Payload inválido", detail: parsed.error.message },
      { status: 422 },
    );
  }

  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Módulo Requisições (Fase 3)." },
    { status: 501 },
  );
}
