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

// Prefixo do 2º bloco que identifica uma MONTAGEM ("MT001"). Quando o nome traz
// mais de um código, o de montagem ganha.
const PREFIXO_MONTAGEM = "MT";

/**
 * Extrai o código da montagem do nome do arquivo da BOM. Devolve null quando não
 * encontra nada no formato 5-5-5 (aí o usuário digita o código na mão).
 */
export function montagemDoNomeDoArquivo(nomeArquivo: string): string | null {
  const semExtensao = nomeArquivo.replace(/\.[a-z0-9]+$/i, "");
  // Normaliza separadores (underscore/hífen viram espaço) e colapsa espaços, pra
  // pegar também "MSVCH_MT001_I0POL".
  const normalizado = semExtensao.replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

  const candidatos: string[] = [];
  for (const match of normalizado.matchAll(CODIGO_NO_NOME)) {
    candidatos.push(`${match[1]} ${match[2]} ${match[3]}`);
  }
  if (candidatos.length === 0) return null;

  const montagem = candidatos.find((c) => c.split(" ")[1].startsWith(PREFIXO_MONTAGEM));
  return montagem ?? candidatos[0];
}
