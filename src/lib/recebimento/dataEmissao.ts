const FUSO_SAO_PAULO = "America/Sao_Paulo";

export function dataEmissaoSaoPaulo(data: string): Date {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!partes) return new Date(Number.NaN);

  const [, ano, mes, dia] = partes;
  const valor = new Date(`${data}T00:00:00-03:00`);
  if (
    valor.getUTCFullYear() !== Number(ano) ||
    valor.getUTCMonth() !== Number(mes) - 1 ||
    valor.getUTCDate() !== Number(dia)
  ) {
    return new Date(Number.NaN);
  }
  return valor;
}

export function dataEmissaoSaoPauloDoIso(iso: string | Date): Date {
  const valor = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(valor.getTime())) return new Date(Number.NaN);

  const dataCivil = `${valor.getUTCFullYear()}-${String(valor.getUTCMonth() + 1).padStart(2, "0")}-${String(
    valor.getUTCDate(),
  ).padStart(2, "0")}`;
  return dataEmissaoSaoPaulo(dataCivil);
}

export function hojeSaoPaulo(agora = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value;
  return `${parte("year")}-${parte("month")}-${parte("day")}`;
}
