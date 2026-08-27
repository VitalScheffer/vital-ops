// Dispara o download de um Blob no navegador (browser-only).
export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // A revogação síncrona pode cancelar o download antes de o navegador
  // consumir o href, especialmente em arquivos gerados de forma assíncrona.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
