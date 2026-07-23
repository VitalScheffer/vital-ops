"use client";

import { AlertTriangle, Box, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useState } from "react";

import type { ProdutoCatalogo } from "@/lib/configurador/catalogo";
import type { Estado3d } from "@/lib/configurador/modelo3d";

// O three.js só é baixado por quem abre um produto que tem modelo, e só no
// navegador (`ssr: false`): WebGL não existe no servidor.
const Visualizador3D = dynamic(() => import("@/components/configurador/Visualizador3D"), {
  ssr: false,
  loading: () => (
    <p className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" />
      Carregando 3D
    </p>
  ),
});

const AVISOS_VISIVEIS = 3;

interface PreviewProdutoProps {
  produto: ProdutoCatalogo;
  // Foto de referência das escolhas atuais; é o que aparece quando o produto
  // não tem modelo 3D (ou quando o 3D não abre no aparelho).
  imagem: string;
  estado: Estado3d;
  // No celular a prévia fica grudada no alto da tela e precisa ser baixa para
  // não engolir as opções.
  compacto?: boolean;
}

export function PreviewProduto({ produto, imagem, estado, compacto }: PreviewProdutoProps) {
  const [falhou, setFalhou] = useState(false);
  const aoFalhar = useCallback(() => setFalhou(true), []);
  const modelo = falhou ? undefined : produto.modelo3d;

  return (
    // `shrink-0`: dentro do painel do Resumo (uma coluna flex que rola por
    // dentro), sem isto a prévia é o item que cede espaço e o 3D vai
    // encolhendo conforme a lista de "fora do padrão" cresce.
    <section className="shrink-0 overflow-hidden rounded-xl border border-border bg-card">
      <div className={`${compacto ? "h-44" : "h-64"} bg-muted/40`}>
        {modelo ? (
          <Visualizador3D arquivo={modelo.arquivo} estado={estado} onFalha={aoFalhar} />
        ) : (
          <Image
            key={imagem}
            src={imagem}
            alt={`Foto de referência: ${produto.nome}`}
            width={produto.imagemLargura}
            height={produto.imagemAltura}
            className="h-full w-full bg-white object-contain"
            preload
          />
        )}
      </div>

      <div className="border-t border-border px-3 py-2">
        {modelo ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Box className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Modelo 3D do desenho {modelo.desenho}. Arraste para girar.
            </span>
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">Foto de referência do produto.</p>
        )}

        {modelo && estado.avisos.length > 0 && (
          <div className="mt-1.5 flex gap-1.5 border-t border-border pt-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
            <ul className="min-w-0">
              {estado.avisos.slice(0, AVISOS_VISIVEIS).map((aviso) => (
                <li key={aviso.grupoRotulo}>
                  <span className="text-card-foreground">{aviso.grupoRotulo}:</span> {aviso.texto}
                </li>
              ))}
              {estado.avisos.length > AVISOS_VISIVEIS && (
                <li>e mais {estado.avisos.length - AVISOS_VISIVEIS} na lista de fora do padrão.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
