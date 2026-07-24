// Política de conteúdo (CSP) das páginas. Montada por request, no proxy, porque
// o `script-src` carrega um nonce que precisa ser novo a cada resposta: nonce
// repetido é nonce adivinhável, e aí ele não filtra nada.
//
// Roda no runtime edge, então só APIs web aqui (nada de `Buffer`).

// 128 bits de aleatoriedade criptográfica. `crypto.getRandomValues` é o gerador
// seguro do runtime; `Math.random` não serve para isto de jeito nenhum.
export function nonceNovo(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binario = "";
  for (const byte of bytes) {
    binario += String.fromCharCode(byte);
  }
  return btoa(binario);
}

export function cspDaPagina(nonce: string, desenvolvimento: boolean): string {
  const script = [
    "'self'",
    `'nonce-${nonce}'`,
    // Deixa os scripts que JÁ passaram pelo nonce carregarem os pedaços seguintes
    // sem que cada chunk do Next precise estar listado aqui.
    "'strict-dynamic'",
    // O decoder meshopt do three.js e o model-viewer compilam WebAssembly. Sem
    // isto o modelo 3D simplesmente não abre.
    "'wasm-unsafe-eval'",
    // Só em desenvolvimento: o React usa `eval` para remontar o stack do
    // servidor no navegador. Em produção nem React nem Next usam.
    ...(desenvolvimento ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    // `style-src` fica com inline liberado de propósito, e por isso NÃO leva
    // nonce (nonce em style-src faz o navegador ignorar o 'unsafe-inline'). O
    // motivo é o atributo `style=` do React, usado em várias telas (gradiente do
    // login, visor do AR, etiquetas do 3D): a CSP nível 3 bloqueia atributo de
    // estilo junto com bloco de estilo. O risco que sobra é injeção de CSS, que
    // não executa código, e é muito menor que o de script inline.
    "style-src 'self' 'unsafe-inline'",
    `script-src ${script}`,
    // Worker do decoder meshopt e do model-viewer vêm de blob:.
    "worker-src 'self' blob:",
    // O "imprimir" das pranchas monta um iframe com o PDF em blob:.
    "frame-src 'self' blob:",
    "connect-src 'self' blob: data:",
    "upgrade-insecure-requests",
  ].join("; ");
}
