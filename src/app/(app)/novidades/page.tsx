import { Sparkles } from "lucide-react";

import { CHANGELOG } from "@/lib/changelog";

export const metadata = { title: "Novidades — Vital Ops" };

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" });

function formatDate(date: string): string {
  return dateFormat.format(new Date(`${date}T00:00:00`));
}

// Changelog em pt-BR (item 4), lido de src/lib/changelog.ts — timeline simples
// com o que mudou na plataforma e quando.
export default function NovidadesPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Novidades</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O que mudou na plataforma, em ordem cronológica.
        </p>
      </header>

      <ol className="relative flex flex-col gap-6 border-l border-border pl-6">
        {CHANGELOG.map((entry) => (
          <li key={`${entry.date}-${entry.title}`} className="relative">
            <span className="absolute -left-[1.95rem] flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {formatDate(entry.date)}
              </p>
              <h2 className="mt-1 text-base font-semibold text-card-foreground">{entry.title}</h2>
              <ul className="mt-3 flex flex-col gap-1.5">
                {entry.items.map((item) => (
                  <li key={item} className="flex gap-2 text-sm text-muted-foreground">
                    <span aria-hidden="true" className="text-primary">
                      •
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
