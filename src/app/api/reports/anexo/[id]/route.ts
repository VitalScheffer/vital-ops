import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

// Serve o anexo de um report guardado no banco (bytea). Guarda de acesso: só o
// admin ou o próprio autor do report. Imagens abrem inline; o resto baixa.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.email) {
    return new Response("Não autorizado.", { status: 401 });
  }

  const anexo = await prisma.reportAnexo.findUnique({
    where: { id },
    include: { report: { select: { autorId: true } } },
  });
  if (!anexo) {
    return new Response("Anexo não encontrado.", { status: 404 });
  }

  const admin = session.user.role === "ADMIN";
  const dono = anexo.report.autorId != null && anexo.report.autorId === session.user.id;
  if (!admin && !dono) {
    return new Response("Acesso negado.", { status: 403 });
  }

  const ehImagem = anexo.mime.startsWith("image/");
  const disposition = ehImagem ? "inline" : "attachment";
  const corpo = new Uint8Array(anexo.dados);

  return new Response(corpo, {
    headers: {
      "Content-Type": anexo.mime || "application/octet-stream",
      "Content-Disposition": `${disposition}; filename="${encodeURIComponent(anexo.nome)}"`,
      "Content-Length": String(corpo.byteLength),
      "Cache-Control": "private, max-age=3600",
    },
  });
}
