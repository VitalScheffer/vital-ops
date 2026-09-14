// Agrupamento por semana (segunda a domingo) do checklist de Recebimento de
// NF. É calculado na leitura a partir de `dataEmissao` — não fica persistido
// no banco, então mudar a data de uma nota já reorganiza ela na semana certa.

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function dataNoCalendarioSaoPaulo(data: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return new Date(Date.UTC(Number(parte("year")), Number(parte("month")) - 1, Number(parte("day"))));
}

function inicioDaSemana(data: Date): Date {
  const dia = dataNoCalendarioSaoPaulo(data);
  // getDay(): 0 = domingo ... 6 = sábado. Queremos segunda-feira como início.
  const deslocamento = (dia.getUTCDay() + 6) % 7;
  dia.setUTCDate(dia.getUTCDate() - deslocamento);
  return dia;
}

function fimDaSemana(inicio: Date): Date {
  const fim = new Date(inicio);
  fim.setUTCDate(fim.getUTCDate() + 6);
  return fim;
}

function dd(data: Date): string {
  return String(data.getUTCDate()).padStart(2, "0");
}

/** Rótulo exibido no cabeçalho de cada seção, ex.: "Agosto 10-16". */
export function rotuloSemana(data: Date): string {
  const inicio = inicioDaSemana(data);
  const fim = fimDaSemana(inicio);
  const mesInicio = MESES[inicio.getUTCMonth()];
  if (inicio.getUTCMonth() === fim.getUTCMonth()) {
    return `${mesInicio} ${dd(inicio)}-${dd(fim)}`;
  }
  const mesFim = MESES[fim.getUTCMonth()];
  return `${mesInicio} ${dd(inicio)} - ${mesFim} ${dd(fim)}`;
}

/** Chave estável (ordenável) da semana, ex.: "2026-08-10". */
function chaveSemana(data: Date): string {
  const inicio = inicioDaSemana(data);
  const ano = inicio.getUTCFullYear();
  const mes = String(inicio.getUTCMonth() + 1).padStart(2, "0");
  return `${ano}-${mes}-${dd(inicio)}`;
}

export interface GrupoSemana<T> {
  chave: string;
  rotulo: string;
  inicio: Date;
  itens: T[];
}

/** Agrupa itens por semana (segunda-domingo) da data extraída, mais recente primeiro. */
export function agruparPorSemana<T>(itens: readonly T[], dataDe: (item: T) => Date): GrupoSemana<T>[] {
  const porChave = new Map<string, GrupoSemana<T>>();
  for (const item of itens) {
    const data = dataDe(item);
    const chave = chaveSemana(data);
    let grupo = porChave.get(chave);
    if (!grupo) {
      grupo = { chave, rotulo: rotuloSemana(data), inicio: inicioDaSemana(data), itens: [] };
      porChave.set(chave, grupo);
    }
    grupo.itens.push(item);
  }
  return Array.from(porChave.values()).sort((a, b) => b.inicio.getTime() - a.inicio.getTime());
}
