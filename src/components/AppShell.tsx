"use client";

import {
  Boxes,
  HelpCircle,
  Home,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { logoutAction } from "@/app/(app)/actions";
import { Tutorial } from "@/components/Tutorial";
import { VitalLogo } from "@/components/VitalLogo";
import type { Role } from "@/lib/contracts";
import type { NavIcon, PublicNavItem } from "@/lib/navigation";

const ICONS: Record<NavIcon, typeof Home> = {
  home: Home,
  products: Boxes,
  users: Users,
  audit: ScrollText,
  settings: Settings,
};

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Administrador",
  GESTOR: "Gestor",
  FUNCIONARIO: "Funcionário",
};

interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

interface AppShellProps {
  user: ShellUser;
  nav: PublicNavItem[];
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ user, nav, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted lg:hidden"
            aria-label="Alternar menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border">
              <VitalLogo className="h-6 w-6" />
            </span>
            <span className="text-lg font-semibold tracking-tight text-card-foreground">
              Vital Ops
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-card-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">
              {user.email} · {ROLE_LABEL[user.role]}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
            aria-label="Abrir tutorial da plataforma"
            title="Como usar a plataforma"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } fixed inset-x-0 top-16 bottom-0 z-20 overflow-y-auto border-b border-border bg-card p-4 lg:sticky lg:top-16 lg:bottom-auto lg:block lg:h-[calc(100vh-4rem)] lg:w-64 lg:shrink-0 lg:self-start lg:border-b-0 lg:border-r`}
        >
          <nav className="flex flex-col gap-1">
            {nav.map((item) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-card-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>

      <footer className="border-t border-border px-4 py-3 text-center sm:px-6">
        <Link
          href="/novidades"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-card-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Novidades — o que mudou na plataforma
        </Link>
      </footer>

      <Tutorial
        userKey={user.id}
        navKeys={nav.map((item) => item.key)}
        open={tutorialOpen}
        onOpenChange={setTutorialOpen}
      />
    </div>
  );
}
