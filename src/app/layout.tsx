import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Vital Ops — Vital Scheffer",
  description: "Plataforma interna de operações da Vital Scheffer.",
};

// Aplica o tema salvo (claro/escuro forçado no botão) e o modo brilho (easter
// egg da logo) ANTES do primeiro paint, pra não piscar. Sem valor salvo, nada
// é setado e o app segue o sistema.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('vs-theme');if(t==='dark'||t==='light'){document.documentElement.setAttribute('data-theme',t);}if(localStorage.getItem('vs-sparkle')==='on'){document.documentElement.setAttribute('data-sparkle','on');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        {children}
      </body>
    </html>
  );
}
