// Símbolo da Vital Scheffer em SVG. Cores de marca FIXAS (iguais às do nextstep):
// traços em turquesa e a "cabeça" em água — idêntico em tema claro e escuro
// (não usa currentColor, pra não ficar branco/preto conforme o tema).

const TRACO = "#13B6A8"; // turquesa (var(--vs-turquesa) no nextstep)

interface VitalLogoProps {
  className?: string;
  /** Cor de destaque da cabeça. Padrão: água da marca (igual ao nextstep). */
  destaque?: string;
}

export function VitalLogo({ className, destaque = "#5FD0C4" }: VitalLogoProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={className}
      fill="none"
      role="img"
      aria-label="Vital Scheffer"
    >
      <g transform="translate(1 1)">
        <path
          d="M 15 25 C 15 18.8 13.2 15.8 10.8 13.6 C 9.2 12.1 8 11.3 7 10.8"
          fill="none"
          stroke={TRACO}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <path
          d="M 15 25 C 15 18.8 16.8 15.8 19.2 13.6 C 20.8 12.1 22 11.3 23 10.8"
          fill="none"
          stroke={TRACO}
          strokeWidth="3.2"
          strokeLinecap="round"
        />
        <circle cx="15" cy="6.2" r="3.2" fill={destaque} />
      </g>
    </svg>
  );
}
