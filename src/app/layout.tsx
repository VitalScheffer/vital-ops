import type { Metadata } from "next";
import { headers } from "next/headers";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vital Ops — Vital Scheffer",
  description: "Plataforma interna de operações da Vital Scheffer.",
};

// Aplica o tema salvo (claro/escuro forçado no botão) e o modo brilho (easter
// egg da logo) ANTES do primeiro paint, pra não piscar. Sem valor salvo, nada
// é setado e o app segue o sistema.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('vs-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}if(localStorage.getItem('vs-sparkle')==='on'){document.documentElement.setAttribute('data-sparkle','on');}}catch(e){}})();`;

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // O Next carimba o nonce sozinho nos scripts DELE; este aqui é nosso, então
  // precisa pegar o nonce à mão. Sem ele, a CSP bloqueia o script e a tela pisca
  // no tema errado antes de acertar. O `x-nonce` vem do proxy (src/proxy.ts).
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
