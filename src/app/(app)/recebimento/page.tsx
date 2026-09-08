import { Forbidden } from "@/components/Forbidden";
import { RecebimentoClient } from "@/components/recebimento/RecebimentoClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewRecebimento } from "@/lib/rbac";

export const metadata = { title: "Recebimento de NF — Vital Ops" };

export default async function RecebimentoPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!canViewRecebimento(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar o Recebimento de NF." />;
  }

  const notas = await prisma.recebimentoNota.findMany({
    orderBy: { dataEmissao: "desc" },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recebimento de NF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Checklist manual por semana: marque produto a produto o que já foi recebido, tem OC, teve a OC aprovada e
          teve a NF-e lançada no financeiro. Nada aqui conversa com o Omie — é você quem marca.
        </p>
      </header>

      <RecebimentoClient
        notasIniciais={notas.map((nota) => ({
          id: nota.id,
          numero: nota.numero,
          fornecedor: nota.fornecedor,
          dataEmissao: nota.dataEmissao.toISOString(),
          itens: nota.itens.map((item) => ({
            id: item.id,
            produto: item.produto,
            materialRecebido: item.materialRecebido,
            temOC: item.temOC,
            ocAprovado: item.ocAprovado,
            nfeLancada: item.nfeLancada,
          })),
        }))}
      />
    </div>
  );
}
