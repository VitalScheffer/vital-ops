import { PranchasClient } from "@/components/pranchas/PranchasClient";

export const metadata = { title: "Pranchas (compilar desenhos) — Vital Ops" };

// Módulo Pranchas: junta os desenhos de um conjunto num PDF único pronto para
// impressão. Sobe o BOM (PDF com os códigos) e a pasta com os PDFs dos desenhos;
// o sistema casa cada peça pela versão/revisão e compila tudo. Todo o
// processamento roda no navegador (nenhum arquivo vai para o servidor). Visível
// a qualquer usuário autenticado (o layout autenticado já garante a sessão).
export default function PranchasPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Pranchas (compilar desenhos)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chega de entrar na pasta e baixar desenho por desenho. Suba o BOM do conjunto e a pasta dos desenhos: o
          sistema acha cada prancha na versão e revisão certas e devolve um PDF único pronto para plotar.
        </p>
      </header>

      <PranchasClient />
    </div>
  );
}
