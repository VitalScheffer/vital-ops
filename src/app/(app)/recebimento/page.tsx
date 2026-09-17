import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { Forbidden } from "@/components/Forbidden";
import { FiltroMesRecebimento, type CriterioMesRecebimento } from "@/components/recebimento/FiltroMesRecebimento";
import { RecebimentoClient } from "@/components/recebimento/RecebimentoClient";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewRecebimento } from "@/lib/rbac";
import { obterDataMaisAntigaNotaEntradaOmie } from "@/lib/recebimento/notasOmie";

export const metadata = { title: "Recebimento de NF — Vital Ops" };

const LIMITES_POR_PAGINA = [10, 25, 50] as const;
const MAXIMA_PAGINA = 10_000;
const FUSO_HORARIO = "America/Sao_Paulo";

type LimitePorPagina = (typeof LIMITES_POR_PAGINA)[number];
type RecebimentoSearchParams = {
  pagina?: string | string[];
  limite?: string | string[];
  mes?: string | string[];
  criterio?: string | string[];
};

function valorUnico(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

function paginaValida(valor: string | string[] | undefined): number {
  const texto = valorUnico(valor);
  if (!texto || !/^[1-9]\d*$/.test(texto)) return 1;

  const pagina = Number(texto);
  return Number.isSafeInteger(pagina) && pagina <= MAXIMA_PAGINA ? pagina : 1;
}

function limiteValido(valor: string | string[] | undefined): LimitePorPagina {
  const limite = Number(valorUnico(valor));
  return LIMITES_POR_PAGINA.includes(limite as LimitePorPagina) ? (limite as LimitePorPagina) : 10;
}

function partesSaoPaulo(data: Date): { ano: string; mes: string } {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? "";
  return { ano: valor("year"), mes: valor("month") };
}

function mesAtualSaoPaulo(): string {
  const partes = partesSaoPaulo(new Date());
  return `${partes.ano}-${partes.mes}`;
}

function mesValido(valor: string | string[] | undefined): string {
  const texto = valorUnico(valor);
  if (!texto || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texto)) return mesAtualSaoPaulo();
  return texto;
}

function criterioValido(valor: string | string[] | undefined): CriterioMesRecebimento {
  return valorUnico(valor) === "emissao" ? "emissao" : "inclusao";
}

function mesDaDataOmie(data: string | null): string | null {
  const partes = data ? /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(data) : null;
  return partes ? `${partes[3]}-${partes[2]}` : null;
}

// Desde 2019 São Paulo não observa horário de verão. Guardamos 03:00Z porque
// representa exatamente 00:00 local e evita que um dia do filtro escape em UTC.
function inicioDiaSaoPaulo(chave: string): Date {
  return new Date(`${chave}T03:00:00.000Z`);
}

function intervaloDoMes(mes: string): { inicio: Date; fim: Date } {
  const [ano, mesNumero] = mes.split("-").map(Number) as [number, number];
  const proximo = mesNumero === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mesNumero + 1).padStart(2, "0")}-01`;
  return { inicio: inicioDiaSaoPaulo(`${mes}-01`), fim: inicioDiaSaoPaulo(proximo) };
}

function hrefDaPagina(pagina: number, mes: string, limite: LimitePorPagina, criterio: CriterioMesRecebimento): string {
  const parametros = new URLSearchParams({ mes, limite: String(limite), criterio });
  if (pagina > 1) parametros.set("pagina", String(pagina));
  return `/recebimento?${parametros.toString()}`;
}

export default async function RecebimentoPage({
  searchParams,
}: {
  searchParams: Promise<RecebimentoSearchParams>;
}) {
  const parametros = await searchParams;
  const pagina = paginaValida(parametros.pagina);
  const limite = limiteValido(parametros.limite);
  const criterio = criterioValido(parametros.criterio);
  const mesSolicitado = mesValido(parametros.mes);
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!session?.user?.role || !canViewRecebimento(session.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar o Recebimento de NF." />;
  }

  const mesMaisAntigoOmie = mesDaDataOmie(await obterDataMaisAntigaNotaEntradaOmie());
  const mes = criterio === "emissao" && mesMaisAntigoOmie && mesSolicitado < mesMaisAntigoOmie
    ? mesMaisAntigoOmie
    : mesSolicitado;
  const intervalo = intervaloDoMes(mes);
  const onde = criterio === "emissao"
    ? { dataEmissao: { gte: intervalo.inicio, lt: intervalo.fim } }
    : { criadoEm: { gte: intervalo.inicio, lt: intervalo.fim } };
  const ordenacao: Prisma.RecebimentoNotaOrderByWithRelationInput[] = criterio === "emissao"
    ? [{ dataEmissao: "desc" }, { id: "desc" }]
    : [{ criadoEm: "desc" }, { id: "desc" }];

  const notasComFolga = await prisma.recebimentoNota.findMany({
    where: onde,
    skip: (pagina - 1) * limite,
    take: limite + 1,
    orderBy: ordenacao,
    include: { itens: { orderBy: [{ ordem: "asc" }, { id: "asc" }] } },
  });
  const temProximaPagina = notasComFolga.length > limite;
  const notas = notasComFolga.slice(0, limite);
  const temPaginacao = pagina > 1 || temProximaPagina;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Recebimento de NF</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Acompanhe, semana a semana, o recebimento das notas fiscais de fornecedor: marque, produto a produto, o que
          já foi recebido, se há Ordem de Compra (OC), se a OC foi aprovada e se a NF-e foi lançada no financeiro.
          O checklist é manual. As notas do Omie exibem somente NF-e de entrada para consulta e não alteram estas notas.
        </p>
      </header>

      <FiltroMesRecebimento
        criterioInicial={criterio}
        limiteInicial={limite}
        mesAtual={mesAtualSaoPaulo()}
        mesInicial={mes}
        mesMaisAntigoOmie={mesMaisAntigoOmie}
      />

      <RecebimentoClient
        key={`${criterio}:${mes}:${limite}:${pagina}`}
        notasIniciais={notas.map((nota) => ({
          id: nota.id,
          numero: nota.numero,
          fornecedor: nota.fornecedor,
          dataEmissao: nota.dataEmissao.toISOString(),
          criadoEm: nota.criadoEm.toISOString(),
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
      {temPaginacao ? (
        <nav className="flex items-center justify-between gap-3" aria-label="Paginação das notas fiscais">
          {pagina > 1 ? (
            <Link href={hrefDaPagina(pagina - 1, mes, limite, criterio)} className="text-sm text-primary hover:underline">
              Notas mais recentes
            </Link>
          ) : <span />}
          <span className="text-sm text-muted-foreground">Página {pagina}</span>
          {temProximaPagina ? (
            <Link href={hrefDaPagina(pagina + 1, mes, limite, criterio)} className="text-sm text-primary hover:underline">
              Notas anteriores
            </Link>
          ) : <span />}
        </nav>
      ) : null}
    </div>
  );
}
