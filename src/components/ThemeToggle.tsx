"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

// Botão de tema: cicla Automático (segue o sistema) -> Claro -> Escuro. O valor
// escolhido fica em localStorage e vira o atributo data-theme no <html> (o
// globals.css tem a paleta por data-theme). O script no layout aplica o mesmo
// valor antes do render pra não piscar.

type Modo = "sistema" | "claro" | "escuro";

const CHAVE = "vs-theme";
const ORDEM: Modo[] = ["sistema", "claro", "escuro"];
// localStorage guarda direto o valor do data-theme ("light"/"dark") ou nada.
const PARA_ATTR: Record<Modo, "light" | "dark" | null> = { sistema: null, claro: "light", escuro: "dark" };

function lerModo(): Modo {
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "light" ? "claro" : t === "dark" ? "escuro" : "sistema";
  } catch {
    return "sistema";
  }
}

function aplicar(modo: Modo): void {
  const attr = PARA_ATTR[modo];
  const el = document.documentElement;
  if (attr) el.setAttribute("data-theme", attr);
  else el.removeAttribute("data-theme");
}

// Troca o tema SEM piscar: corta as transições de CSS de todos os elementos
// durante a troca (senão cada `transition-colors`/etc. anima a cor por ~0,15s,
// o que aparece como piscada/borrão), aplica o tema de uma vez e reativa as
// transições no quadro seguinte (hover etc. voltam a animar normalmente).
function aplicarSemPisca(modo: Modo): void {
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none !important;}";
  document.head.appendChild(style);
  aplicar(modo);
  // Força o navegador a recalcular/pintar já com o tema novo e sem transição.
  window.getComputedStyle(document.body).getPropertyValue("background-color");
  requestAnimationFrame(() => style.remove());
}

// useSyncExternalStore: lê o modo atual sem quebrar a hidratação (o servidor
// renderiza "sistema" e o cliente reconcilia pro valor real) e sem setState em
// efeito. Reage a mudanças em outra aba (storage) e nesta aba (evento próprio).
function subscribe(callback: () => void): () => void {
  window.addEventListener("storage", callback);
  window.addEventListener("vs-theme-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("vs-theme-change", callback);
  };
}

const ICONE: Record<Modo, typeof Sun> = { sistema: Monitor, claro: Sun, escuro: Moon };
const ROTULO: Record<Modo, string> = { sistema: "automático", claro: "claro", escuro: "escuro" };

export function ThemeToggle() {
  const modo = useSyncExternalStore(subscribe, lerModo, () => "sistema" as Modo);

  function alternar() {
    const novo = ORDEM[(ORDEM.indexOf(modo) + 1) % ORDEM.length];
    try {
      const attr = PARA_ATTR[novo];
      if (attr) localStorage.setItem(CHAVE, attr);
      else localStorage.removeItem(CHAVE);
    } catch {
      // localStorage indisponível (aba privada etc.): aplica só nesta sessão.
    }
    aplicarSemPisca(novo);
    window.dispatchEvent(new Event("vs-theme-change"));
  }

  const Icone = ICONE[modo];
  const proximo = ORDEM[(ORDEM.indexOf(modo) + 1) % ORDEM.length];

  return (
    <button
      type="button"
      onClick={alternar}
      className="flex items-center justify-center rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
      aria-label={`Tema: ${ROTULO[modo]}. Clique para mudar para ${ROTULO[proximo]}.`}
      title={`Tema: ${ROTULO[modo]} (clique para alternar)`}
    >
      <Icone className="h-4 w-4" />
    </button>
  );
}
