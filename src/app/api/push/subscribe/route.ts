import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError } from "@/lib/contracts";
import { pushSubscribeSchema } from "@/lib/contracts";
import { inscrever } from "@/lib/push";

// POST /api/push/subscribe — grava/atualiza a assinatura de Web Push do
// navegador atual para o usuário logado. Sem auditoria de propósito: é
// registro de dispositivo/navegador, não mutação de negócio.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const parsed = pushSubscribeSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json<ApiError>({ error: "Payload inválido" }, { status: 422 });
  }

  await inscrever({
    userId: session.user.id,
    endpoint: parsed.data.endpoint,
    keys: parsed.data.keys,
    userAgent: request.headers.get("user-agent"),
  });

  return NextResponse.json({ ok: true });
}
