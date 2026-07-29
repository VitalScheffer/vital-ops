import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError } from "@/lib/contracts";
import { pushUnsubscribeSchema } from "@/lib/contracts";
import { desinscrever } from "@/lib/push";

// POST /api/push/unsubscribe — apaga a assinatura do navegador atual. Idempotente
// de propósito (devolve ok mesmo se já não existir) — o botão "desativar" não
// precisa saber se é a primeira vez ou não.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json<ApiError>({ error: "Payload inválido" }, { status: 422 });
  }

  await desinscrever(session.user.id, parsed.data.endpoint);

  return NextResponse.json({ ok: true });
}
