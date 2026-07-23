import "react";

// O <model-viewer> é um custom element (web component) do Google, sem tipos de
// JSX próprios. Declaramos a tag para o TSX aceitar, com atributos livres —
// os nomes com hífen (ar-modes, camera-controls…) não cabem numa interface
// fechada, então um índice de strings basta.
declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        src?: string;
        alt?: string;
        ar?: boolean;
        exposure?: string;
        [atributo: string]: unknown;
      };
    }
  }
}
