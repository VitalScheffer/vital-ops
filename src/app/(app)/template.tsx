// template.tsx (diferente de layout.tsx) é RE-MONTADO a cada navegação dentro do
// grupo (app). Por isso é o lugar certo para a animação de entrada de tela: a
// classe .animate-page-in reexecuta a cada troca de rota (fade + leve subida).
// Respeita prefers-reduced-motion (a animação vira no-op no CSS).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
