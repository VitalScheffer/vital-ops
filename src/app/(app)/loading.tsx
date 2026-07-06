// loading.tsx cria uma fronteira de Suspense para TODO o grupo (app): ao clicar
// numa tab, este esqueleto aparece NA HORA (o shell/menu continua fixo) enquanto
// o servidor renderiza a página real. Isso mata a sensação de "travou ao clicar"
// e ainda deixa o prefetch do <Link> efetivo (o Next prefetcha até esta fronteira).
export default function AppLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-col gap-2">
        <div className="h-7 w-56 animate-pulse rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="h-28 animate-pulse rounded-3xl bg-muted/60" />
        <div className="h-28 animate-pulse rounded-3xl bg-muted/60" />
      </div>
      <div className="flex flex-col gap-3 rounded-3xl border border-border bg-card p-5">
        <div className="h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-5/6 animate-pulse rounded bg-muted/60" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted/60" />
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
