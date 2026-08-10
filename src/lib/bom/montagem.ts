// Descoberta do código da MONTAGEM (o produto pai que já está cadastrado no
// Omie e vai receber a árvore inteira da BOM).
//
// Na BOM real do CAD esse código NÃO aparece dentro da planilha: ele é o nome do
// arquivo ("MSVCH MT001 I0POL.xls"). Por isso a detecção é feita em cima do nome
// do arquivo, e serve só para PRÉ-PREENCHER o campo da tela — quem manda é o que
// o usuário confirmar ali, e o envio ainda confere o código no Omie antes de usar.

// Três blocos de 5 caracteres alfanuméricos separados por um espaço. Mesmo
// formato do CODE_PATTERN do parser, mas sem descrição (o nome do arquivo é só o
// código) e sem exigir que ocupe a string inteira ("BOM MSVCH MT001 I0POL v2").
const CODIGO_NO_NOME = /(?<![A-Z0-9])([A-Z0-9]{5}) ([A-Z0-9]{5}) ([A-Z0-9]{5})(?![A-Z0-9])/g;

// Prefixo do 2º bloco que identifica uma MONTAGEM ("MT001"). É EXIGIDO, não
// preferido: o campo pré-preenchido já monta as relações e o envio não obriga a
// conferência, então aceitar qualquer 5-5-5 faria uma BOM salva como
// "MSVCH PC010 ICPOL.xls" pendurar a árvore inteira dentro de uma PEÇA, calada.
// Sem código de montagem no nome, o usuário digita (é o caminho seguro).
const PREFIXO_MONTAGEM = "MT";

/**
 * Deixa o código no formato canônico do Omie: sem espaço sobrando e em
 * maiúsculas. Sem isso, "msvch mt001 i0pol" digitado na tela não casa com o
 * "MSVCH MT001 I0POL" do cadastro, e o envio acusaria de não existir uma
 * montagem que existe.
 */
export function normalizarCodigoMontagem(codigo: string): string {
  return codigo.replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * Extrai o código da montagem do nome do arquivo da BOM. Devolve null quando não
 * encontra um código de MONTAGEM (aí o usuário digita o código na mão).
 */
export function montagemDoNomeDoArquivo(nomeArquivo: string): string | null {
  const semExtensao = nomeArquivo.replace(/\.[a-z0-9]+$/i, "");
  // Normaliza separadores (underscore/hífen viram espaço) e colapsa espaços, pra
  // pegar também "MSVCH_MT001_I0POL".
  const normalizado = normalizarCodigoMontagem(semExtensao.replace(/[_\-.]+/g, " "));

  for (const match of normalizado.matchAll(CODIGO_NO_NOME)) {
    if (match[2].startsWith(PREFIXO_MONTAGEM)) return `${match[1]} ${match[2]} ${match[3]}`;
  }
  return null;
}
