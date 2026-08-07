import { createHash, timingSafeEqual } from "node:crypto";

// Autenticação da ponte do PCP: token de serviço no header
// `Authorization: Bearer <token>`, conferido contra `PCP_BRIDGE_TOKEN`.
//
// A ponte NASCE DESLIGADA: sem a variável no ambiente, a rota responde 503 e não
// toca no banco. É o estado padrão de quem clonou o repo e de qualquer deploy em
// que ninguém configurou nada — esquecer de configurar não pode virar rota
// aberta.

// Tamanho mínimo para a variável CONTAR como configurada. Um token curto é
// adivinhável, e "ponte no ar com segredo fraco" é pior que "ponte desligada".
// 32 caracteres é o que sai de `openssl rand -base64 32` (o .env.example manda
// gerar assim); 24 dá folga para outros geradores sem aceitar uma senha digitada
// à mão.
export const PCP_TOKEN_MIN_CARACTERES = 24;

// Retorna o token esperado, ou null quando a ponte está desligada (variável
// ausente, vazia, só espaço ou curta demais).
export function tokenEsperado(bruto: string | undefined | null): string | null {
  const token = (bruto ?? "").trim();
  if (token.length < PCP_TOKEN_MIN_CARACTERES) {
    return null;
  }
  return token;
}

// Extrai o token do header. Esquema case-insensitive (a RFC 7235 manda), um ou
// mais espaços/tabs de separação, e o valor só com caracteres imprimíveis ASCII.
// Header ausente, com outro esquema ou malformado devolve null — e o handler
// trata igual a token errado, sem dizer qual dos dois foi.
const BEARER = /^Bearer[ \t]+([\x21-\x7e]+)$/i;

export function tokenDoHeader(authorization: string | null | undefined): string | null {
  const casamento = BEARER.exec((authorization ?? "").trim());
  return casamento ? casamento[1] : null;
}

// Comparação em TEMPO CONSTANTE. Compara o sha256 dos dois lados, não os textos:
// o digest tem sempre 32 bytes, então o `timingSafeEqual` nunca lança pela
// diferença de comprimento (ele exige buffers do mesmo tamanho) e o tamanho do
// token de verdade não vaza pelo tempo de resposta.
export function tokenConfere(apresentado: string, esperado: string): boolean {
  return timingSafeEqual(digest(apresentado), digest(esperado));
}

// Chave de rate limit derivada do token. É o hash, nunca o token: a janela vive
// num Map em memória do processo, e segredo em claro fora do escopo de uso é
// segredo a mais para vazar num dump de heap.
export function chaveDoToken(token: string): string {
  return digest(token).toString("hex").slice(0, 32);
}

// Chave de rate limit derivada da ORIGEM da requisição (o primeiro IP do
// `x-forwarded-for`, ou o `x-real-ip`). Mesmo tratamento do token, por dois
// motivos diferentes:
//   TAMANHO — o valor cru é escolhido por quem chama e não tem limite de
//   tamanho nenhum; usado direto como chave, cada requisição escreveria no Map
//   da janela o número de bytes que o atacante quisesse. O digest fixa a chave
//   em 16 caracteres, aconteça o que acontecer com a entrada.
//   RUÍDO — o Map fica em memória do processo; guardar o IP em claro ali é
//   guardar dado de rede além do necessário (o IP que precisa ficar registrado
//   já vai no AuditLog, pelo `audit()`).
// 16 hex = 64 bits: colisão é irrelevante aqui porque o efeito de duas origens
// caírem no mesmo balde é contar JUNTO, ou seja, apertar o limite, nunca
// afrouxar.
export function chaveDaOrigem(origem: string): string {
  return digest(origem).toString("hex").slice(0, 16);
}

function digest(valor: string): Buffer {
  return createHash("sha256").update(valor, "utf8").digest();
}
