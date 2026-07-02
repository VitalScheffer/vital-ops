import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import type { ApiError, MeResponse, Role } from "@/lib/contracts";
import { prisma } from "@/lib/db";

// GET /api/auth/me — usuário logado + papel + setores.
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { setores: { include: { setor: true } } },
  });
  if (!user) {
    return NextResponse.json<ApiError>({ error: "Usuário não encontrado" }, { status: 404 });
  }

  const body: MeResponse = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    active: user.active,
    setores: user.setores.map((membership) => ({
      id: membership.setor.id,
      nome: membership.setor.nome,
    })),
  };
  return NextResponse.json(body);
}
