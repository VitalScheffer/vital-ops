import {
  ArrowRight,
  Boxes,
  ClipboardList,
  Home,
  Layers,
  PackageMinus,
  Ruler,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";

import { auth } from "@/lib/auth";
import type { Role } from "@/lib/contracts";
import type { NavIcon } from "@/lib/navigation";
import { visibleNavFor } from "@/lib/navigation";
import { getRolePermissionsMap } from "@/lib/permissions.server";

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home,
  products: Boxes,
  pranchas: Layers,
  configurador: SlidersHorizontal,
  projetos: Ruler,
  requisicoes: ClipboardList,
  baixas: PackageMinus,
  users: Users,
  audit: ScrollText,
  settings: Settings,
};

const ROLE_INTRO: Record<Role, string> = {
  ADMIN: "Você tem acesso total: gestão de usuários, setores e auditoria.",
  GESTOR: "Você aprova, cadastra usuários do seu setor e acompanha a auditoria.",
  FUNCIONARIO: "Aqui ficam os módulos e cadastros disponíveis para você.",
  FABRICA: "Peça material ao estoque e acompanhe seus pedidos por aqui.",
  FABRICA_GESTOR: "Os pedidos de material da fábrica chegam aqui para você confirmar ou recusar.",
};

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// Landing por papel: saudação + atalhos apenas para os módulos visíveis.
export default async function DashboardPage() {
  const session = await auth();
  const role = session!.user.role;
  const name = session!.user.name ?? session!.user.email ?? "";

  // Início não vira atalho de si mesmo.
  const permissions = await getRolePermissionsMap();
  const shortcuts = visibleNavFor(role, permissions).filter((item) => item.key !== "home");

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Olá, {firstName(name)}.
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{ROLE_INTRO[role]}</p>
      </section>

      {shortcuts.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
          Nenhum módulo adicional disponível para o seu papel no momento. Novos
          módulos (Produtos e Requisições) chegam nas próximas fases.
        </p>
      ) : (
        <section className="grid gap-4 sm:grid-cols-2">
          {shortcuts.map((item) => {
            const Icon = ICONS[item.icon];
            return (
              <Link
                key={item.key}
                href={item.href}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </span>
                <div>
                  <h2 className="flex items-center gap-1 text-base font-semibold text-card-foreground">
                    {item.label}
                    <ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}
