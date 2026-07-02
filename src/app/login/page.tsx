import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Boxes, ClipboardList, ShieldCheck } from "lucide-react";

import { VitalLogo } from "@/components/VitalLogo";
import { auth, signIn } from "@/lib/auth";

export const metadata = {
  title: "Entrar — Vital Ops",
};

// Sem borda estática: quem faz a borda de cada campo é a "formiguinha" (SVG tracejado).
const inputClass =
  "w-full rounded-lg bg-field px-3 py-2.5 text-sm text-card-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/25";

const isDev = process.env.NODE_ENV !== "production";

const FEATURES = [
  { icon: Boxes, text: "Cadastro de produtos (BOM → Omie)" },
  { icon: ClipboardList, text: "Requisições com aprovação do gestor" },
  { icon: ShieldCheck, text: "Auditoria de tudo, por setor" },
];

// Login interno por e-mail + senha (Auth.js/Credentials), restrito ao domínio
// corporativo. A validação da senha (bcrypt) e do domínio roda no authorize.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  const { error } = await searchParams;

  async function login(formData: FormData) {
    "use server";
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    try {
      await signIn("credentials", { email, password, redirectTo: "/" });
    } catch (err) {
      // Falha de credencial → volta pro login com aviso. O redirect de sucesso
      // (NEXT_REDIRECT) NÃO é um AuthError, então é repropagado abaixo.
      if (err instanceof AuthError) {
        redirect("/login?error=credentials");
      }
      throw err;
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-8 sm:py-12">
      <div className="grid w-full max-w-3xl overflow-hidden rounded-2xl border border-border bg-card shadow-lg md:grid-cols-2">
        {/* Painel de marca — gradiente petróleo → teal, conteúdo centralizado */}
        <div
          className="relative flex flex-col items-center justify-center gap-6 p-8 text-center text-white"
          style={{ background: "linear-gradient(150deg, var(--vs-petroleo), var(--vs-teal))" }}
        >
          {/* logo num quadradinho BRANCO pra não sumir no fundo */}
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md">
            <VitalLogo className="h-9 w-9" />
          </span>

          <div>
            <h1 className="vital-ops-title text-4xl font-extrabold tracking-tight">Vital Ops</h1>
            <p className="mx-auto mt-3 max-w-[15rem] text-sm leading-relaxed text-white/85">
              Operações internas num só lugar, integrado ao Omie.
            </p>
          </div>

          <ul className="flex flex-col gap-2.5 text-left">
            {FEATURES.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-2.5 text-sm text-white/90">
                <Icon className="h-4 w-4 shrink-0 text-white/75" />
                {text}
              </li>
            ))}
          </ul>

          <p className="text-xs text-white/70">
            Acesso restrito a{" "}
            <strong className="font-semibold text-white">@vitalscheffer.com.br</strong>
          </p>

          {/* barra de acento inferior (petróleo → teal → turquesa → água) */}
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-1"
            style={{
              background:
                "linear-gradient(90deg, var(--vs-petroleo), var(--vs-teal), var(--vs-turquesa), var(--vs-agua))",
            }}
          />
        </div>

        {/* Formulário */}
        <div className="flex flex-col justify-center p-8">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Entrar</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use suas credenciais internas.</p>

          <form action={login} className="mt-6 flex flex-col gap-4">
            {/* cada campo com sua PRÓPRIA formiguinha (borda tracejada animada) */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="email" className="text-sm font-medium text-card-foreground">
                  E-mail
                </label>
                <div className="relative">
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full text-brand-turquesa"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="calc(100% - 2px)"
                      height="calc(100% - 2px)"
                      rx="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="7 7"
                      className="animate-marching-ants"
                    />
                  </svg>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nome@vitalscheffer.com.br"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="password" className="text-sm font-medium text-card-foreground">
                  Senha
                </label>
                <div className="relative">
                  <svg
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full text-brand-turquesa"
                  >
                    <rect
                      x="1"
                      y="1"
                      width="calc(100% - 2px)"
                      height="calc(100% - 2px)"
                      rx="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeDasharray="7 7"
                      className="animate-marching-ants"
                    />
                  </svg>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className={inputClass}
                  />
                </div>
              </div>
            </div>

            {error ? (
              <p className="rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
                E-mail ou senha inválidos.
              </p>
            ) : null}

            <button
              type="submit"
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold text-white shadow-sm transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-turquesa"
              style={{ background: "var(--vs-turquesa)" }}
            >
              Entrar
              <span aria-hidden>→</span>
            </button>
          </form>

          {isDev ? (
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-3 text-xs text-muted-foreground">
              <p className="font-medium text-card-foreground">Logins de desenvolvimento</p>
              <p className="mt-1">
                admin@vitalscheffer.com.br · <strong>vital123</strong>
              </p>
              <p>
                gestor@vitalscheffer.com.br · <strong>vital123</strong>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
