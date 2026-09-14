const LIMITE_NOTAS_NO_NOME = 4;

function trechoSeguro(valor: string): string {
  return (
    valor
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 24) || "sem-numero"
  );
}

function carimboSaoPaulo(data: Date): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(data);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((parte) => parte.type === tipo)?.value ?? "00";
  return `${valor("year")}-${valor("month")}-${valor("day")}_${valor("hour")}-${valor("minute")}-${valor("second")}`;
}

export function nomeArquivoRecebimento(
  numerosNotas: readonly string[],
  extraidoEm: Date,
  extensao: "xlsx" | "pdf",
): string {
  const notas = [...new Set(numerosNotas.map(trechoSeguro))];
  const exibidas = notas.slice(0, LIMITE_NOTAS_NO_NOME);
  const prefixo = exibidas.length === 1 ? `nf-${exibidas[0]}` : `nfs-${exibidas.join("-")}`;
  const restantes = notas.length - exibidas.length;
  const complemento = restantes > 0 ? `-mais-${restantes}` : "";

  return `recebimento-${prefixo}${complemento}-extraido-em-${carimboSaoPaulo(extraidoEm)}.${extensao}`;
}
