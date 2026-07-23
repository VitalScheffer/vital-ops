import { notFound } from "next/navigation";

import { ConferenciaCliente } from "@/components/configurador/ConferenciaCliente";
import { produtoPorSlug } from "@/lib/configurador/catalogo";
import { decodificarEscolhas } from "@/lib/configurador/compartilhar";
import { resolverSelecoes } from "@/lib/configurador/codigo";

// Tela de conferência do cliente. É a ÚNICA página do sistema aberta sem login
// (ver `isPublicPath` em `auth.config.ts`), e por isso segue duas regras:
//
// 1. não toca no banco. A configuração inteira vem da URL, então este endereço
//    não é uma chave para nada guardado: trocar o que vem depois de `?c=` só
//    monta outro carro na tela, nunca revela o pedido de outro cliente;
// 2. não mostra nada de dentro de casa. Só produto, opções escolhidas e o
//    modelo 3D — sem preço, sem nome de vendedor, sem observação interna.

interface ConferenciaPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ c?: string | string[] }>;
}

export async function generateMetadata({ params }: ConferenciaPageProps) {
  const { slug } = await params;
  const produto = produtoPorSlug(slug);
  return {
    title: produto ? `${produto.nome} — Vital Scheffer` : "Vital Scheffer",
    description: produto?.resumo,
    // Link de cliente não é página para achar no Google.
    robots: { index: false, follow: false },
  };
}

export default async function ConferenciaPage({ params, searchParams }: ConferenciaPageProps) {
  const { slug } = await params;
  const { c } = await searchParams;
  const produto = produtoPorSlug(slug);
  if (!produto) {
    notFound();
  }

  const escolhas = decodificarEscolhas(produto, Array.isArray(c) ? c[0] : c);
  const resolucao = resolverSelecoes(produto, escolhas);
  // `decodificarEscolhas` parte do padrão e só aceita o que casa com o
  // catálogo, então não resolver aqui seria catálogo quebrado, não URL torta.
  if (!resolucao.ok) {
    notFound();
  }

  return (
    <ConferenciaCliente produto={produto} escolhas={escolhas} selecoes={resolucao.selecoes} />
  );
}
