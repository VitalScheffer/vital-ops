import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig, isPublicPath } from "@/lib/auth.config";
import { cspDaPagina, nonceNovo } from "@/lib/csp";

// Proxy = "middleware" no Next.js 16 (renomeado). Faz duas coisas:
//   1. barra quem não tem sessão (exceto nas rotas públicas);
//   2. gera o nonce da CSP e carimba a política na resposta.
//
// Usa só a config edge-safe (sem Prisma). A autorização FINA (quem pode ver
// qual módulo) continua nas páginas e nas server actions.
const { auth } = NextAuth(authConfig);

// CUIDADO AO MEXER: passar uma função para `auth()` desliga o redirect
// automático do callback `authorized`. No next-auth, `handleAuth` faz
// `else if (userMiddlewareOrRoute) { ... } else if (!authorized) { redirect }`:
// com função própria, o segundo ramo nunca roda. Por isso a checagem de sessão
// está repetida aqui de forma explícita, com a MESMA `isPublicPath` do callback.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (!isPublicPath(pathname) && !req.auth?.user) {
    const destino = req.nextUrl.clone();
    destino.pathname = "/login";
    destino.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(destino);
  }

  // Rota de API define a própria política (ver o handler do anexo, que devolve
  // `default-src 'none'; sandbox`). Carimbar a da página por cima só somaria
  // duas CSP na mesma resposta, e o navegador aplica a interseção das duas.
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const nonce = nonceNovo();
  const csp = cspDaPagina(nonce, process.env.NODE_ENV === "development");

  // O nonce entra nos headers da REQUEST porque é assim que o Next o encontra:
  // ele lê a CSP da request, extrai o `nonce-...` e aplica sozinho nos scripts
  // que ele mesmo injeta (runtime do React, bundles da página). O `x-nonce` é
  // para o nosso script de tema, que o layout carimba à mão.
  const headersDaRequest = new Headers(req.headers);
  headersDaRequest.set("x-nonce", nonce);
  headersDaRequest.set("Content-Security-Policy", csp);

  const resposta = NextResponse.next({ request: { headers: headersDaRequest } });
  resposta.headers.set("Content-Security-Policy", csp);
  return resposta;
});

export const config = {
  // Roda em todas as rotas, menos assets estáticos e otimização de imagem.
  //
  // Arquivo de `public/` (foto do produto, modelo 3D) também fica de fora, pela
  // EXTENSÃO. Sem isso a foto do configurador quebra: o otimizador do Next
  // busca o PNG original por HTTP no próprio servidor, essa busca interna não
  // leva o cookie de sessão, e o proxy responde com o redirecionamento para
  // /login em vez da imagem. O preço é que esses arquivos ficam legíveis por
  // quem tiver a URL exata — são as mesmas fotos e modelos que qualquer
  // vendedor logado já vê.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpe?g|gif|svg|webp|avif|ico|glb|mjs)$).*)",
  ],
};
