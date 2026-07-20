// Notificação in-app mostrada no sininho do topo. Tipo puro (sem banco), pra
// poder importar no componente cliente. A montagem (que toca o banco) fica na
// (app)/layout.tsx.
export interface Notificacao {
  id: string;
  texto: string;
  href: string;
}
