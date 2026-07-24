// Regras de anexo de report. Ficam aqui, puras, porque valem nos DOIS lados: no
// upload (o que entra) e na entrega (como sai). Se as duas pontas divergirem,
// abre exatamente o buraco que estas regras existem para fechar.
//
// O ataque que isto bloqueia: o MIME de um anexo é escolhido por quem envia. Um
// arquivo declarado `image/svg+xml` era devolvido com esse Content-Type e
// `Content-Disposition: inline`, então abrir o anexo executava o script de
// dentro do SVG no domínio da aplicação, com a sessão de quem abriu (na prática,
// o admin, que é quem abre anexo para tratar report).

// Só estes abrem na aba. Formatos de imagem que o navegador decodifica como
// pixel, nunca como documento: nenhum deles roda script. SVG fica de fora de
// propósito, é imagem que é documento.
const IMAGENS_INLINE = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// Aceitos, mas sempre baixados em vez de abertos. Aqui o conteúdo não importa:
// o navegador não renderiza um anexo baixado. `application/octet-stream` é o
// que o próprio navegador manda quando não sabe o tipo do arquivo.
const ARQUIVOS_ANEXAVEIS = new Set([
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.oasis.opendocument.spreadsheet",
  "text/csv",
  "text/plain",
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
]);

export function mimeDeAnexoPermitido(mime: string): boolean {
  return IMAGENS_INLINE.has(mime) || ARQUIVOS_ANEXAVEIS.has(mime);
}

export interface EntregaAnexo {
  contentType: string;
  disposition: "inline" | "attachment";
}

// Como devolver um anexo já guardado. O Content-Type sai DAQUI, não do banco:
// anexo gravado antes desta regra pode ter qualquer coisa no campo, e o que não
// reconhecemos vira download de bytes opacos em vez de algo que o navegador
// tente interpretar.
export function entregaDeAnexo(mimeGravado: string): EntregaAnexo {
  if (IMAGENS_INLINE.has(mimeGravado)) {
    return { contentType: mimeGravado, disposition: "inline" };
  }
  if (ARQUIVOS_ANEXAVEIS.has(mimeGravado)) {
    return { contentType: mimeGravado, disposition: "attachment" };
  }
  return { contentType: "application/octet-stream", disposition: "attachment" };
}

// Lista legível para a mensagem de recusa: quem anexou um arquivo que não passou
// precisa saber o que vale, senão tenta de novo às cegas.
export const EXTENSOES_ACEITAS = "PNG, JPG, GIF, WEBP, PDF, XLS/XLSX, ODS, CSV, TXT e ZIP";
