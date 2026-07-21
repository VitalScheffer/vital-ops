import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { novidadesDesde, VERSAO_ATUAL } from "@/lib/changelog";
import type { ApiError } from "@/lib/contracts";
import { BUILD_ATUAL, type VersaoResponse } from "@/lib/versao";

// GET /api/versao?desde=<versão de changelog que o navegador está rodando>
//
// Responde o que ESTE servidor está servindo (versão do changelog + build) e,
// se a do navegador for anterior, quais novidades entraram no meio. O navegador
// não consegue montar essa lista sozinho: o bundle dele é o antigo e não contém
// as entradas novas.
//
// Nunca pode ser cacheada — uma resposta guardada devolveria para sempre a
// versão da hora em que foi gravada, e o aviso nunca apareceria.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json<ApiError>({ error: "Não autenticado" }, { status: 401 });
  }

  const desde = new URL(request.url).searchParams.get("desde");

  return NextResponse.json<VersaoResponse>(
    { versao: VERSAO_ATUAL, build: BUILD_ATUAL, novidades: novidadesDesde(desde) },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
