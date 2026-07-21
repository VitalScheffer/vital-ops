"use client";

import {
  Boxes,
  ClipboardList,
  HelpCircle,
  Home,
  Layers,
  LogOut,
  Menu,
  PackageMinus,
  Ruler,
  ScrollText,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { logoutAction } from "@/app/(app)/actions";
import { NotificacoesBell } from "@/components/NotificacoesBell";
import { BotaoAtualizar, NovaVersaoModal, useNovaVersao } from "@/components/NovaVersao";
import { ReportDialog } from "@/components/ReportDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tutorial } from "@/components/Tutorial";
import { VitalLogo } from "@/components/VitalLogo";
import type { Role } from "@/lib/contracts";
import type { NavIcon, PublicNavItem } from "@/lib/navigation";
import type { Notificacao } from "@/lib/notificacoes";

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

interface ShellUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  roleLabel: string; // rótulo já resolvido (papel fixo ou nome do perfil custom)
}

interface AppShellProps {
  user: ShellUser;
  nav: PublicNavItem[];
  notificacoes: Notificacao[];
  children: React.ReactNode;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Modo brilho (easter egg, fora do changelog de propósito): dois cliques
// rápidos na logo ligam/desligam. O estado vive no atributo data-sparkle do
// <html> (o globals.css tem todos os efeitos) e persiste em localStorage; o
// script no layout raiz reaplica antes do primeiro paint, igual ao tema.
const SPARKLE_KEY = "vs-sparkle";
const DUPLO_CLIQUE_MS = 400;

// Estrelinhas do burst ao ligar: direções/tamanhos fixos (pré-calculados) pra
// espalhar bem sem sorteio a cada clique.
// Água da barra lateral (modo brilho): cada clique de navegação sobe o nível
// da "maré" (--agua-nivel, em % da altura da barra). Cliques rápidos acumulam
// e o mar sobe; parado, desce um degrau a cada tique até a linha de base.
const NIVEL_BASE = 8;
const NIVEL_MAX = 30;
const GANHO_POR_CLIQUE = 7;
const DESCIDA_POR_TIQUE = 2.5;
const TIQUE_MS = 400;

const ESTRELAS = [
  { dx: "-26px", dy: "-20px", dr: "-40deg", tam: 12, cor: "var(--vs-turquesa)", atraso: "0ms" },
  { dx: "24px", dy: "-26px", dr: "45deg", tam: 10, cor: "var(--vs-agua)", atraso: "40ms" },
  { dx: "30px", dy: "6px", dr: "60deg", tam: 13, cor: "var(--vs-teal)", atraso: "80ms" },
  { dx: "-30px", dy: "8px", dr: "-60deg", tam: 9, cor: "var(--vs-agua)", atraso: "20ms" },
  { dx: "-14px", dy: "-32px", dr: "-20deg", tam: 10, cor: "var(--vs-turquesa)", atraso: "100ms" },
  { dx: "12px", dy: "-34px", dr: "30deg", tam: 11, cor: "var(--vs-turquesa)", atraso: "60ms" },
  { dx: "20px", dy: "-8px", dr: "80deg", tam: 8, cor: "var(--vs-agua)", atraso: "120ms" },
  { dx: "-22px", dy: "-2px", dr: "-80deg", tam: 8, cor: "var(--vs-teal)", atraso: "140ms" },
];

export function AppShell({ user, nav, notificacoes, children }: AppShellProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  // Uma única verificação de versão alimenta os dois pontos: o botão ao lado do
  // sino e o modal de novidades.
  const atualizacao = useNovaVersao();

  // Easter egg do modo brilho: conta dois cliques rápidos na logo.
  const ultimoCliqueLogo = useRef(0);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    if (burst === 0) return;
    const t = setTimeout(() => setBurst(0), 900);
    return () => clearTimeout(t);
  }, [burst]);

  function cliqueLogo() {
    const agora = Date.now();
    const duplo = agora - ultimoCliqueLogo.current <= DUPLO_CLIQUE_MS;
    ultimoCliqueLogo.current = duplo ? 0 : agora;
    if (!duplo) return;

    const el = document.documentElement;
    const ligar = el.getAttribute("data-sparkle") !== "on";
    if (ligar) {
      el.setAttribute("data-sparkle", "on");
      // A cascata da navegação roda SÓ neste instante de "reveal". Fora daqui
      // os itens nunca reanimam (a entrada re-executando a cada navegação era
      // o que fazia a barra lateral "retrair" ao trocar de tela).
      el.setAttribute("data-sparkle-reveal", "");
      window.setTimeout(() => el.removeAttribute("data-sparkle-reveal"), 1200);
    } else {
      el.removeAttribute("data-sparkle");
      el.removeAttribute("data-sparkle-reveal");
    }
    try {
      if (ligar) localStorage.setItem(SPARKLE_KEY, "on");
      else localStorage.removeItem(SPARKLE_KEY);
    } catch {
      // localStorage indisponível (aba privada etc.): vale só nesta aba.
    }
    if (ligar) setBurst((b) => b + 1);
  }

  // Posição do item ativo pra barrinha deslizante da navegação (modo brilho).
  // Medida de verdade (offsetTop/offsetHeight) pra aguentar rótulo em 2 linhas.
  const navRef = useRef<HTMLElement | null>(null);
  const [glide, setGlide] = useState<{ top: number; height: number } | null>(null);

  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const ativo = el.querySelector<HTMLElement>('[data-active="true"]');
    // offsetHeight 0 = aside escondido (mobile fechado); some com a barrinha.
    if (!ativo || ativo.offsetHeight === 0) {
      setGlide(null);
      return;
    }
    setGlide({ top: ativo.offsetTop, height: ativo.offsetHeight });
  }, [pathname, mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  // Maré da barra lateral: sobe no clique, desce sozinha com o tempo.
  const [nivelAgua, setNivelAgua] = useState(NIVEL_BASE);

  useEffect(() => {
    if (nivelAgua <= NIVEL_BASE) return;
    const t = setTimeout(() => {
      setNivelAgua((n) => Math.max(NIVEL_BASE, n - DESCIDA_POR_TIQUE));
    }, TIQUE_MS);
    return () => clearTimeout(t);
  }, [nivelAgua]);

  function cliqueNav() {
    closeMobile();
    setNivelAgua((n) => Math.min(NIVEL_MAX, n + GANHO_POR_CLIQUE));
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="app-header sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted md:hidden"
            aria-label="Alternar menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            {/* A logo fica fora do Link de propósito: dois cliques nela são o
                easter egg do modo brilho (um clique não faz nada; o caminho
                pra home continua no título ao lado). */}
            <button
              type="button"
              onClick={cliqueLogo}
              className="app-logo relative flex h-9 w-9 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-border"
              aria-label="Logo Vital Scheffer"
            >
              <VitalLogo className="h-6 w-6" />
              {burst > 0 ? (
                <span key={burst} aria-hidden className="sparkle-burst">
                  {ESTRELAS.map((e, i) => (
                    <Sparkles
                      key={i}
                      className="sparkle-star"
                      style={
                        {
                          width: e.tam,
                          height: e.tam,
                          color: e.cor,
                          animationDelay: e.atraso,
                          "--dx": e.dx,
                          "--dy": e.dy,
                          "--dr": e.dr,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </span>
              ) : null}
            </button>
            <Link href="/" className="flex items-center">
              <span className="app-title text-lg font-semibold tracking-tight text-card-foreground">
                Vital Ops
              </span>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium text-card-foreground">{user.name}</p>
            <p className="text-xs text-muted-foreground">
              {user.email} · {user.roleLabel}
            </p>
          </div>
          <NotificacoesBell notificacoes={notificacoes} />
          <BotaoAtualizar visivel={atualizacao.temAtualizacao} />
          <ReportDialog />
          <ThemeToggle />
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
          } fixed inset-x-0 top-16 bottom-0 z-20 overflow-y-auto border-b border-border bg-card p-4 md:sticky md:top-16 md:bottom-auto md:block md:h-[calc(100vh-4rem)] md:w-64 md:shrink-0 md:self-start md:border-b-0 md:border-r`}
        >
          {/* O "mar" fica atrás da navegação (nav é relative, pinta por cima).
              O clip evita que as ondas gigantes criem barra de rolagem. */}
          <span aria-hidden className="agua-clip">
            <span className="agua" style={{ "--agua-nivel": nivelAgua } as React.CSSProperties} />
          </span>
          <nav ref={navRef} className="relative flex flex-col gap-1">
            {glide ? <span aria-hidden className="nav-glide" style={glide} /> : null}
            {nav.map((item, index) => {
              const Icon = ICONS[item.icon];
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  onClick={cliqueNav}
                  data-active={active ? "true" : undefined}
                  style={{ "--nav-i": index } as React.CSSProperties}
                  className={`nav-item ${active ? "nav-item-active" : ""} flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

      <NovaVersaoModal
        aberto={atualizacao.modalAberto}
        novidades={atualizacao.novidades}
        onAdiar={atualizacao.adiarModal}
      />
    </div>
  );
}
