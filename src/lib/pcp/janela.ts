// Janela fixa de contagem em memória. Usada duas vezes na ponte do PCP: para
// frear o volume de chamadas por token e para não deixar uma enxurrada de
// tentativas recusadas inundar o AuditLog.
//
// LIMITAÇÃO CONHECIDA (serverless): o contador vive no processo. Na Vercel cada
// instância tem o seu, e instâncias sobem e descem — o limite efetivo é
// `limite × instâncias vivas`, e um deploy zera tudo. Isto é um FREIO contra
// laço maluco do cliente e contra flood barato, não uma garantia de quota. Para
// garantia de verdade o contador precisa ser compartilhado (Redis/Upstash ou uma
// tabela com contagem atômica) — o que só vale a pena se a ponte crescer.

export interface Janela {
  limite: number;
  janelaMs: number;
}

export interface ResultadoJanela {
  permitido: boolean;
  // Segundos até a janela virar (vai no header Retry-After).
  esperarSegundos: number;
}

interface Contador {
  usos: number;
  expiraEm: number;
}

const contadores = new Map<string, Contador>();

// Acima disto, varre e descarta o que já expirou. Sem a varredura o Map cresce
// para sempre com chaves mortas (cada IP que bateu uma vez fica lá).
const CHAVES_ANTES_DA_LIMPEZA = 512;

export function registrarUso(chave: string, janela: Janela, agora = Date.now()): ResultadoJanela {
  if (contadores.size > CHAVES_ANTES_DA_LIMPEZA) {
    limparExpiradas(agora);
  }

  const atual = contadores.get(chave);
  if (!atual || atual.expiraEm <= agora) {
    contadores.set(chave, { usos: 1, expiraEm: agora + janela.janelaMs });
    return { permitido: true, esperarSegundos: 0 };
  }

  atual.usos += 1;
  if (atual.usos > janela.limite) {
    return {
      permitido: false,
      esperarSegundos: Math.max(1, Math.ceil((atual.expiraEm - agora) / 1000)),
    };
  }
  return { permitido: true, esperarSegundos: 0 };
}

// Só para os testes: zera o estado entre casos.
export function limparJanelas(): void {
  contadores.clear();
}

function limparExpiradas(agora: number): void {
  for (const [chave, contador] of contadores) {
    if (contador.expiraEm <= agora) {
      contadores.delete(chave);
    }
  }
}
