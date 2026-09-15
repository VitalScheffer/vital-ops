import Link from "next/link";

import { Forbidden } from "@/components/Forbidden";
import { RecebimentoClient } from "@/components/recebimento/RecebimentoClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewRecebimento } from "@/lib/rbac";

export const metadata = { title: "Recebimento de NF — Vital Ops" };

const NOTAS_POR_PAGINA = 50;
const MAXIMA_PAGINA = 10_000;

function paginaValida(valor: string | string[] | undefined): number {
  const texto = Array.isArray(valor) ? valor[0] : valor;
  if (!texto || !/^[1-9]\d*$/.test(texto)) return 1;

  const pagina = Number(texto);
  return Number.isSafeInteger(pagina) && pagina <= MAXIMA_PAGINA ? pagina : 1;
}

export default async function RecebimentoPage({
  searchParams,
}: {
  searchParams: Promise<{ pagina?: string | string[] }>;
}) {
  const pagina = paginaValida((await searchParams).pagina);
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user?.role || !canViewRecebimento(session.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar o Recebimento de NF." />;
  }

  const notasComFolga = await prisma.recebimentoNota.findMany({
    skip: (pagina - 1) * NOTAS_POR_PAGINA,
    take: NOTAS_POR_PAGINA + 1,
    orderBy: [{ dataEmissao: "desc" }, { id: "desc" }],
    include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
  });
  const temProximaPagina = notasComFolga.length > NOTAS_POR_PAGINA;
  const notas = notasComFolga.slice(0, NOTAS_POR_PAGINA);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recebimento de NF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe semana a semana o recebimento das notas fiscais de fornecedor: marque, produto a produto, o que
          já foi recebido, se há Ordem de Compra (OC), se a OC foi aprovada e se a NF-e foi lançada no financeiro.
          O checklist é manual. As notas do Omie exibem NF-e de entrada e de venda somente para consulta e não alteram estas notas.
        </p>
      </header>

      <RecebimentoClient
        key={pagina}
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
      <nav className="flex items-center justify-between gap-3" aria-label="Paginação das notas fiscais">
        {pagina > 1 ? (
          <Link href={pagina === 2 ? "/recebimento" : `/recebimento?pagina=${pagina - 1}`} className="text-sm text-primary hover:underline">
            Notas mais recentes
          </Link>
        ) : (
          <span />
        )}
        <span className="text-sm text-muted-foreground">Página {pagina}</span>
        {temProximaPagina ? (
          <Link href={`/recebimento?pagina=${pagina + 1}`} className="text-sm text-primary hover:underline">
            Notas anteriores
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </div>
  );
}
