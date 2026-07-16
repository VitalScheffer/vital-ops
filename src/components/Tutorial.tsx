"use client";

import {
  BookOpenCheck,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  HelpCircle,
  PackageMinus,
  ScrollText,
  Sparkles,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

import { type TutorialIcon, tutorialSeenKey, tutorialStepsFor } from "@/lib/tutorial";

const ICONS: Record<TutorialIcon, typeof HelpCircle> = {
  welcome: Sparkles,
  roles: UserCog,
  products: Boxes,
  requisicoes: ClipboardList,
  baixas: PackageMinus,
  users: Users,
  audit: ScrollText,
  reopen: BookOpenCheck,
};

interface TutorialProps {
  // Identidade estável do usuário (id) para persistir "visto" por pessoa.
  userKey: string;
  // Chaves dos itens de navegação que o usuário vê (já resolvidas no servidor
  // a partir do papel + RolePermission) — define quais passos aparecem.
  navKeys: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function hasSeen(userKey: string): boolean {
  if (!userKey || typeof window === "undefined") {
    return true; // sem chave/ambiente não abre sozinho
  }
  try {
    return window.localStorage.getItem(tutorialSeenKey(userKey)) === "1";
  } catch {
    return true;
  }
}

function markSeen(userKey: string): void {
  if (!userKey || typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(tutorialSeenKey(userKey), "1");
  } catch {
    // localStorage indisponível (modo privado): apenas não persiste.
  }
}

export function Tutorial({ userKey, navKeys, open, onOpenChange }: TutorialProps) {
  const steps = useMemo(() => tutorialStepsFor(navKeys), [navKeys]);
  const [stepIndex, setStepIndex] = useState(0);
  const [wasOpen, setWasOpen] = useState(open);
  const titleId = useId();

  // Auto-abre no PRIMEIRO login de cada pessoa (persistido por usuário).
  useEffect(() => {
    if (hasSeen(userKey)) {
      return;
    }
    onOpenChange(true);
    // Só depende do userKey: dispara uma vez por usuário ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userKey]);

  // Volta ao primeiro passo sempre que o modal (re)abre — ajuste no render.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStepIndex(0);
    }
  }

  const close = () => {
    markSeen(userKey);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // close depende de userKey/onOpenChange, estáveis o suficiente para o efeito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || steps.length === 0) {
    return null;
  }

  const safeIndex = Math.min(stepIndex, steps.length - 1);
  const step = steps[safeIndex];
  const Icon = ICONS[step.icon];
  const isFirst = safeIndex === 0;
  const isLast = safeIndex === steps.length - 1;

  const goPrev = () => setStepIndex((index) => Math.max(0, index - 1));
  const goNext = () => {
    if (isLast) {
      close();
      return;
    }
    setStepIndex((index) => Math.min(steps.length - 1, index + 1));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Fechar tutorial"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/50"
        tabIndex={-1}
      />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Passo {safeIndex + 1} de {steps.length}
              </p>
              <h2 id={titleId} className="text-base font-semibold text-card-foreground">
                {step.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Fechar tutorial"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-6 py-5 text-sm text-card-foreground">
          {step.body.map((paragraph) => (
            <p key={paragraph} className="leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {steps.map((dot, index) => (
              <span
                key={dot.key}
                className={`h-1.5 rounded-full transition-all ${
                  index === safeIndex ? "w-5 bg-primary" : "w-1.5 bg-border"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-card-foreground transition-colors hover:bg-muted disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {isLast ? "Concluir" : "Próximo"}
              {isLast ? null : <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
