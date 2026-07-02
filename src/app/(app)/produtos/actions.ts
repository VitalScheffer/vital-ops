"use server";

import { z } from "zod";

import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";
import { requestHeaders } from "@/lib/request";

// A geração da planilha acontece 100% no navegador (não toca no banco). O único
// contato com o servidor é registrar a auditoria (REQUISITOS §5): quem gerou,
// quantos produtos/relações e o nome do arquivo baixado.
const registroPlanilhaSchema = z.object({
  arquivoNome: z.string().trim().min(1).max(200),
  totalProdutos: z.number().int().nonnegative(),
  totalEstrutura: z.number().int().nonnegative(),
  totalErros: z.number().int().nonnegative(),
});

export type RegistroPlanilha = z.infer<typeof registroPlanilhaSchema>;

export interface RegistroPlanilhaResult {
  ok: boolean;
}

export async function registrarPlanilhaGerada(input: RegistroPlanilha): Promise<RegistroPlanilhaResult> {
  const session = await auth();
  if (!session?.user?.email) {
    return { ok: false };
  }

  const parsed = registroPlanilhaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false };
  }

  const { arquivoNome, totalProdutos, totalEstrutura, totalErros } = parsed.data;
  const trechoErros = totalErros > 0 ? ` (${totalErros} linha(s) com erro ficaram de fora)` : "";

  await audit({
    actor: { id: session.user.id, email: session.user.email },
    action: "produto.gerar_planilha",
    entity: "ProdutoImport",
    summary: `Gerou a planilha do Omie "${arquivoNome}" com ${totalProdutos} produto(s) e ${totalEstrutura} relação(ões) de estrutura${trechoErros}.`,
    after: { arquivoNome, totalProdutos, totalEstrutura, totalErros },
    req: await requestHeaders(),
  });

  return { ok: true };
}
