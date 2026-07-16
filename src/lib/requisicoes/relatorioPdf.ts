// Gerador do PDF do relatório de requisições — CLIENT-ONLY (mesma abordagem do
// módulo Pranchas: pdf-lib no navegador, nada sobe pro servidor). Só desenha as
// linhas montadas por `montarLinhasRelatorio` (a lógica de conteúdo é pura e
// testada em relatorio.ts).

import type { LinhaRelatorio } from "./relatorio";

const A4 = { largura: 595.28, altura: 841.89 };
const MARGEM = 40;
const LARGURA_UTIL = A4.largura - MARGEM * 2;

interface EstiloLinha {
  tamanho: number;
  negrito: boolean;
  cinza: boolean;
  espacoAntes: number;
}

const ESTILOS: Record<LinhaRelatorio["estilo"], EstiloLinha> = {
  titulo: { tamanho: 16, negrito: true, cinza: false, espacoAntes: 0 },
  subtitulo: { tamanho: 10, negrito: false, cinza: true, espacoAntes: 2 },
  secao: { tamanho: 11, negrito: true, cinza: false, espacoAntes: 6 },
  normal: { tamanho: 9, negrito: false, cinza: false, espacoAntes: 2 },
  detalhe: { tamanho: 8.5, negrito: false, cinza: true, espacoAntes: 2 },
};

// A fonte padrão (Helvetica) só codifica WinAnsi/Latin-1 — pt-BR passa, mas um
// caractere exótico numa descrição derrubaria o encode. Troca o que não cabe.
function paraWinAnsi(texto: string): string {
  return Array.from(texto)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 32 && code <= 255 ? ch : "?";
    })
    .join("");
}

export async function gerarRelatorioPdf(linhas: readonly LinhaRelatorio[]): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const fonte = await doc.embedFont(StandardFonts.Helvetica);
  const fonteNegrito = await doc.embedFont(StandardFonts.HelveticaBold);

  let pagina = doc.addPage([A4.largura, A4.altura]);
  let y = A4.altura - MARGEM;

  const quebrar = (texto: string, tamanho: number, negrito: boolean): string[] => {
    const f = negrito ? fonteNegrito : fonte;
    const palavras = texto.split(" ");
    const saida: string[] = [];
    let atual = "";
    for (const palavra of palavras) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (f.widthOfTextAtSize(tentativa, tamanho) <= LARGURA_UTIL) {
        atual = tentativa;
        continue;
      }
      if (atual) saida.push(atual);
      atual = palavra;
    }
    if (atual) saida.push(atual);
    return saida.length > 0 ? saida : [""];
  };

  for (const linha of linhas) {
    const estilo = ESTILOS[linha.estilo];
    const texto = paraWinAnsi(linha.texto);
    const alturaLinha = estilo.tamanho + 3;

    if (texto === "") {
      y -= alturaLinha;
      continue;
    }

    y -= estilo.espacoAntes;
    for (const pedaco of quebrar(texto, estilo.tamanho, estilo.negrito)) {
      if (y - alturaLinha < MARGEM) {
        pagina = doc.addPage([A4.largura, A4.altura]);
        y = A4.altura - MARGEM;
      }
      y -= alturaLinha;
      pagina.drawText(pedaco, {
        x: MARGEM,
        y,
        size: estilo.tamanho,
        font: estilo.negrito ? fonteNegrito : fonte,
        color: estilo.cinza ? rgb(0.35, 0.35, 0.35) : rgb(0.1, 0.1, 0.1),
      });
    }
  }

  return doc.save();
}
