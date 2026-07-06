import { ProdutosClient } from "@/components/produtos/ProdutosClient";

export const metadata = { title: "Produtos (BOM → Omie) — Vital Ops" };

// Credenciais do Omie são segredo de servidor — o cliente não enxerga
// process.env. Resolvemos aqui e passamos só um booleano para a UI decidir se
// mostra (ou não) o aviso de "envio indisponível". Com as credenciais no
// ambiente (produção), o usuário não vê nenhum jargão técnico.
function omiePronto(): boolean {
  return Boolean(process.env.OMIE_APP_KEY && process.env.OMIE_APP_SECRET);
}

// Módulo Produtos (Fase 2, parte local): converte a BOM do CAD na planilha
// oficial de importação de produtos do Omie. Todo o processamento roda no
// navegador; o servidor só registra a auditoria da geração. O envio automático
// via API do Omie é a próxima fase. Visível a qualquer usuário autenticado (o
// layout autenticado já garante a sessão).
export default function ProdutosPage() {
  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Produtos (BOM → Omie)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Converte a lista de peças exportada do CAD para o formato de importação de produtos do Omie: código,
          descrição, família e os campos obrigatórios já preenchidos — pronto pra revisar e importar.
        </p>
      </header>

      <ProdutosClient omiePronto={omiePronto()} />
    </div>
  );
}
