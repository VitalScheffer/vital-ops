import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError } from "@/lib/contracts";
import { criarRequisicaoSchema } from "@/lib/contracts";

// O módulo Requisições (Fase 3) foi implementado com SERVER ACTIONS na própria
// tela (src/app/(app)/requisicoes/actions.ts: criarRequisicao/decidirRequisicao),
// não por esta rota. O stub fica documentando o contrato para uma eventual
// integração externa futura (ex.: outro sistema criando requisições via HTTP).

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }
  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Use a tela /requisicoes (Server Actions)." },
    { status: 501 },
  );
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  // Valida o payload já no stub para deixar o contrato explícito.
  const parsed = criarRequisicaoSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json<ApiError>(
      { error: "Payload inválido", detail: parsed.error.message },
      { status: 422 },
    );
  }

  return NextResponse.json<ApiError>(
    { error: "Não implementado", detail: "Use a tela /requisicoes (Server Actions)." },
    { status: 501 },
  );
}
