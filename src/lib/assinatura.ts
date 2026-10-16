/*
 * ╔═══════════════════════════════════════════════════════════════════════════════╗
 * ║  ░▒▓███████████████████████████████████████████████████████████████████████▓▒░  ║
 * ║  ░▒▓█                                                                     █▓▒░  ║
 * ║  ░▒▓█   ██╗   ██╗██╗████████╗ █████╗ ██╗         ██████╗ ██████╗ ███████╗ █▓▒░  ║
 * ║  ░▒▓█   ██║   ██║██║╚══██╔══╝██╔══██╗██║        ██╔═══██╗██╔══██╗██╔════╝ █▓▒░  ║
 * ║  ░▒▓█   ██║   ██║██║   ██║   ███████║██║        ██║   ██║██████╔╝███████╗ █▓▒░  ║
 * ║  ░▒▓█   ╚██╗ ██╔╝██║   ██║   ██╔══██║██║        ██║   ██║██╔═══╝ ╚════██║ █▓▒░  ║
 * ║  ░▒▓█    ╚████╔╝ ██║   ██║   ██║  ██║███████╗   ╚██████╔╝██║     ███████║ █▓▒░  ║
 * ║  ░▒▓█     ╚═══╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝╚══════╝    ╚═════╝ ╚═╝     ╚══════╝ █▓▒░  ║
 * ║  ░▒▓█                                                                     █▓▒░  ║
 * ║  ░▒▓█  ─────── · ✧ ✦ ★ ✦ ✧ · ───────────────────── · ✧ ✦ ★ ✦ ✧ · ───────  █▓▒░  ║
 * ║  ░▒▓█    ✧ ✦ ★  DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER  ★ ✦ ✧    █▓▒░  ║
 * ║  ░▒▓█  ─────── · ✧ ✦ ★ ✦ ✧ · ───────────────────── · ✧ ✦ ★ ✦ ✧ · ───────  █▓▒░  ║
 * ║  ░▒▓█                                                                     █▓▒░  ║
 * ║  ░▒▓███████████████████████████████████████████████████████████████████████▓▒░  ║
 * ╚═══════════════════════════════════════════════════════════════════════════════╝
 */

export const ASSINATURA_CODIGO =
  "DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER" as const;

export const EVENTO_BANDEIRA_VENTO = "vs-wind-flag" as const;
export const DURACAO_BANDEIRA_MS = 10_000;

const CLIQUES_GATILHO = 4;
const JANELA_CLIQUES_MS = 1800;

const QUADROS_SHIMMER = [
  "░▒▓█ ✧ ✦ ★  DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER  ★ ✦ ✧ █▓▒░",
  "▒▓█░ ✦ ★ ✧  DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER  ✧ ★ ✦ ░█▓▒",
  "▓█░▒ ★ ✧ ✦  DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER  ✦ ✧ ★ ▒░█▓",
  "█░▒▓ ✧ ✦ ★  DESENVOLVIDO POR VITOR CAMILLO - VITAL SCHEFFER  ★ ✦ ✧ ▓▒░█",
] as const;

let assinaturaIniciada = false;
let historicoCliques: number[] = [];

/**
 * Registra cliques rápidos no botão de tema ou de notificações.
 * Ao atingir 4 cliques rápidos (dentro de 1,8s), dispara o easter egg da
 * bandeira tremulando com vento na tela inteira por 10 segundos.
 */
export function registrarPulsoInteracao(): void {
  if (typeof window === "undefined") return;
  const agora = Date.now();
  historicoCliques = historicoCliques.filter((t) => agora - t <= JANELA_CLIQUES_MS);
  historicoCliques.push(agora);

  if (historicoCliques.length >= CLIQUES_GATILHO) {
    historicoCliques = [];
    window.dispatchEvent(new CustomEvent(EVENTO_BANDEIRA_VENTO));
  }
}

export function registrarAssinaturaCodigo(): () => void {
  if (typeof window === "undefined" || assinaturaIniciada) {
    return () => {};
  }
  assinaturaIniciada = true;

  const html = document.documentElement;
  html.setAttribute("data-watermark", QUADROS_SHIMMER[0]);

  const comentario = document.createComment(` ${QUADROS_SHIMMER[0]} `);
  html.insertBefore(comentario, html.firstChild);

  console.info(
    `%c ✦ ${ASSINATURA_CODIGO} ✦ `,
    [
      "background: linear-gradient(135deg, #0a5560 0%, #0e7c86 50%, #13b6a8 100%)",
      "color: #ffffff",
      "font-family: 'Segoe UI', system-ui, sans-serif",
      "font-size: 11px",
      "font-weight: 700",
      "letter-spacing: 0.1em",
      "padding: 6px 14px",
      "border-radius: 6px",
      "border: 1px solid #5fd0c4",
      "text-shadow: 0 0 8px rgba(95, 208, 196, 0.8)",
    ].join("; "),
  );

  let passo = 0;
  const timer = window.setInterval(() => {
    passo = (passo + 1) % QUADROS_SHIMMER.length;
    const quadro = QUADROS_SHIMMER[passo];
    comentario.nodeValue = ` ${quadro} `;
    html.setAttribute("data-watermark", quadro);
  }, 450);

  return () => {
    window.clearInterval(timer);
    assinaturaIniciada = false;
  };
}
