import { ArrowRightLeft, ListFilter, PackageX, Ruler, ShieldCheck, Wand2 } from "lucide-react";

import { carregarFila, entradasEmAposentados } from "@/app/(app)/de-para/actions";
import { DeParaClient } from "@/components/depara/DeParaClient";
import { EntradasTardias } from "@/components/depara/EntradasTardias";
import { Forbidden } from "@/components/Forbidden";
import { Panel } from "@/components/Panel";
import { auth } from "@/lib/auth";
import { formatarDataHora } from "@/lib/datas";
import { prisma } from "@/lib/db";
import { locaisDisponiveis } from "@/lib/estoque/estoque.server";
import { origemSugerida } from "@/lib/estoque/locais";
import { getRolePermissionsMap } from "@/lib/permissions.server";
import { canViewDePara } from "@/lib/rbac";

export const metadata = { title: "De/Para de códigos — Vital Ops" };

function ComoFunciona() {
  const passos = [
    {
      icon: ListFilter,
      titulo: "1. A fila sai do estoque",
      texto:
        "A lista mostra os cadastros ATIVOS no padrão ANTIGO que ainda têm saldo no local escolhido e cuja descrição se lê como matéria-prima (chapa, tubo, trefilado). Caneta, papel e cadastro inativo ou bloqueado não entram.",
    },
    {
      icon: Wand2,
      titulo: "2. A sugestão é automática",
      texto:
        "O sistema lê forma, bitola e liga da descrição antiga e procura o cadastro MAT com a mesma geometria. É o mesmo motor que a tela de Produtos usa para achar a matéria-prima de uma peça.",
    },
    {
      icon: ShieldCheck,
      titulo: "3. Quem decide é você",
      texto:
        "Nada é ligado sozinho. Onde a descrição antiga diz uma liga que o catálogo novo não tem (inox 200 x 430) ou onde a unidade muda (M² x KG), a linha vem com aviso e exige confirmação.",
    },
    {
      icon: Ruler,
      titulo: "4. A unidade tem que fechar",
      texto:
        "Se os dois cadastros estão na mesma unidade, a quantidade passa 1 para 1. Se muda (M² x KG), a linha pede o fator uma vez — 1 KG do novo = quantos M² do antigo — e a partir daí toda movimentação já vem convertida, sem ninguém digitar.",
    },
    {
      icon: ArrowRightLeft,
      titulo: "5. A Movimentação usa o mapa",
      texto:
        "Depois de ligado, quando uma OP pedir o código novo e ele estiver sem saldo, a tela de Movimentação por OP mostra em qual código antigo o material está parado e quanto tem.",
    },
    {
      icon: PackageX,
      titulo: "6. Quando terminar, aposente",
      texto:
        "\"Aposentar código antigo\" confere o que ainda roda com ele (OP aberta, requisição, pedido de compra), move TODO o saldo local por local para o código novo e, se você marcar, inativa o cadastro no Omie. Se depois entrar NF no código velho, a tela avisa.",
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {passos.map((passo) => (
        <div key={passo.titulo} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <passo.icon className="h-5 w-5" />
          </span>
          <h2 className="text-sm font-semibold text-card-foreground">{passo.titulo}</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">{passo.texto}</p>
        </div>
      ))}
    </section>
  );
}

export default async function DeParaPage() {
  const session = await auth();
  const permissions = await getRolePermissionsMap();

  if (!canViewDePara(session!.user.role, permissions)) {
    return <Forbidden message="Você não tem permissão para acessar o De/Para de códigos." />;
  }

  const [locais, ultimos, total, aposentados] = await Promise.all([
    locaisDisponiveis(),
    prisma.deParaProduto.findMany({
      orderBy: { atualizadoEm: "desc" },
      take: 8,
      select: {
        codigoLegado: true,
        codigoNovo: true,
        confianca: true,
        atualizadoEm: true,
        confirmadoPor: { select: { name: true } },
      },
    }),
    prisma.deParaProduto.count(),
    prisma.deParaProduto.count({ where: { aposentadoEm: { not: null } } }),
  ]);

  // A leitura de saldo dos aposentados só acontece quando EXISTE aposentado.
  // Um alerta que custa uma chamada ao Omie em toda abertura da tela, mesmo
  // quando não há nada para alertar, é orçamento de ban gasto à toa.
  const entradas = aposentados > 0 ? await entradasEmAposentados() : null;

  // A primeira fila é montada AQUI, no servidor: o cliente abre com a lista
  // pronta em vez de piscar vazio e buscar num efeito de montagem.
  const localInicial = origemSugerida(locais);
  const filaInicial = locais.length > 0 ? await carregarFila(localInicial) : null;

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">De/Para de códigos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O estoque físico ainda está lançado nos códigos antigos (PRD) e as ordens de produção novas já pedem os
          códigos novos (MAT). Aqui você liga um ao outro, uma vez por item.
        </p>
      </header>

      {entradas?.ok && entradas.entradas.length > 0 ? <EntradasTardias entradas={entradas.entradas} /> : null}

      <ComoFunciona />

      <Panel
        title="Fila de conversão"
        description="Cadastros antigos ATIVOS com saldo, a sugestão automática e a sua decisão. Nada é ligado sem confirmação."
      >
        {locais.length === 0 || !filaInicial ? (
          <p className="rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
            Não consegui ler os locais de estoque do Omie agora. Tente recarregar a página em alguns minutos.
          </p>
        ) : (
          <DeParaClient locais={locais} localInicial={localInicial} filaInicial={filaInicial} />
        )}
      </Panel>

      <Panel title="Últimas decisões" description={`${total} item(ns) ligado(s) até agora.`}>
        {ultimos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma decisão registrada ainda.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ultimos.map((linha) => (
              <li
                key={linha.codigoLegado}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
              >
                <span className="font-mono text-sm text-card-foreground">
                  {linha.codigoLegado} → {linha.codigoNovo ?? "sem equivalente"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {linha.confianca.toLowerCase()} · {linha.confirmadoPor?.name ?? "sem autor"} ·{" "}
                  {formatarDataHora(linha.atualizadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
