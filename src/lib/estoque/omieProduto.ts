// Situação do CADASTRO de produto no Omie. Hoje só uma pergunta: o código antigo
// já está inativo?
//
// Aqui NÃO há escrita, e isso é deliberado. A API do Omie não inativa produto:
// o `AlterarProduto` com `{codigo_produto, inativo: "S"}` responde "Produto
// alterado com sucesso!" e não grava nada. Provado em 28/09/2026 no PRD00240:
// a resposta veio com sucesso, o cadastro continuou `inativo: "N"` e o `dAlt`
// ficou em 10/07/2026. O automacao-lotes já tinha registrado o mesmo (o campo
// `inativo` não é aceito nem na inclusão nem na alteração). Inativar é pela tela
// do Omie; o que o VitalOps faz é CONFERIR e só marcar quando lê "S".
//
// Módulo PURO no sentido do resto do estoque: recebe `chamar` por parâmetro.

import type { ChamarFn } from "./omieEstoque";

function texto(valor: unknown): string | undefined {
  if (valor === undefined || valor === null) return undefined;
  return String(valor);
}

/** O cadastro está inativo no Omie? `undefined` = a resposta não disse. */
export async function produtoInativo(idProd: string, chamar: ChamarFn): Promise<boolean | undefined> {
  const resp = await chamar("geral/produtos/", "ConsultarProduto", {
    codigo_produto: Number(idProd),
  });
  const inativo = texto(resp?.inativo)?.toUpperCase();
  return inativo === undefined ? undefined : inativo === "S";
}

/** Texto para quem precisa inativar: a tela do Omie é o único caminho. */
export function instrucaoInativar(codigo: string): string {
  return (
    `Falta inativar o ${codigo} na tela do Omie: a API do Omie não inativa cadastro ` +
    "(responde \"alterado com sucesso\" e ignora o campo). Depois de inativar lá, use \"Conferir no Omie\"."
  );
}
