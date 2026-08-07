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
//
// MEMÓRIA: este Map vive no MESMO processo que serve o resto do app. Parte das
// chaves nasce de valor escolhido por quem chama (a origem da requisição sai de
// `x-forwarded-for`), então o tamanho do Map não pode depender de quantas
// chaves diferentes alguém decidir inventar. Duas travas cuidam disso:
//   1. quem monta a chave passa um valor de tamanho FIXO (ver `chaveDaOrigem`
//      em `./token`), e não o header cru;
//   2. `MAXIMO_DE_CHAVES` aqui embaixo é um teto duro de quantidade.

export interface Janela {
  limite: number;
  janelaMs: number;
  // O que fazer quando o Map já está no teto de chaves e a chave pedida é NOVA.
  // Não tem default de propósito: a escolha muda o que acontece sob ataque, e
  // cada janela precisa decidir isso explicitamente (o compilador cobra).
  //   "recusar"  = falha FECHADO: chave nova no teto conta como não permitida.
  //   "permitir" = falha ABERTO: passa, mas sem criar contador (o freio some
  //                enquanto o Map estiver cheio).
  noTetoDeChaves: "permitir" | "recusar";
}

export interface ResultadoJanela {
  permitido: boolean;
  // Segundos até a janela virar (vai no header Retry-After).
  esperarSegundos: number;
  // Quantos usos a chave já acumulou NESTA janela (contando o atual). Zero
  // quando a chave nem chegou a ser criada por causa do teto. Serve para quem
  // precisa relatar o volume, não só decidir passa/não passa.
  usos: number;
}

interface Contador {
  usos: number;
  expiraEm: number;
}

const contadores = new Map<string, Contador>();

// Acima disto, varre e descarta o que já expirou. Sem a varredura o Map cresce
// para sempre com chaves mortas (cada IP que bateu uma vez fica lá).
const CHAVES_ANTES_DA_LIMPEZA = 512;

// Teto DURO de chaves vivas. A varredura acima só descarta o que já expirou —
// dentro da janela ela não devolve nada, e sem este teto bastava variar o
// `x-forwarded-for` a cada requisição para o Map crescer sem limite (cada
// entrada viva por 5 minutos) e para a varredura virar um custo por requisição
// dimensionado por quem ataca. Com o teto, o pior caso é conhecido: no máximo
// 1024 entradas e 1024 iterações de varredura, ambos irrisórios.
//
// Fica acima de CHAVES_ANTES_DA_LIMPEZA de propósito: a limpeza sempre roda
// antes de o teto ser consultado, então só se chega ao teto com chaves VIVAS.
const MAXIMO_DE_CHAVES = 1024;

export function registrarUso(chave: string, janela: Janela, agora = Date.now()): ResultadoJanela {
  if (contadores.size > CHAVES_ANTES_DA_LIMPEZA) {
    limparExpiradas(agora);
  }

  const atual = contadores.get(chave);
  if (!atual || atual.expiraEm <= agora) {
    // Reaproveitar uma chave EXPIRADA não faz o Map crescer, então o teto só
    // vale para chave que ainda não existe.
    if (!atual && contadores.size >= MAXIMO_DE_CHAVES) {
      return noTeto(janela);
    }
    contadores.set(chave, { usos: 1, expiraEm: agora + janela.janelaMs });
    return { permitido: true, esperarSegundos: 0, usos: 1 };
  }

  atual.usos += 1;
  if (atual.usos > janela.limite) {
    return {
      permitido: false,
      esperarSegundos: Math.max(1, Math.ceil((atual.expiraEm - agora) / 1000)),
      usos: atual.usos,
    };
  }
  return { permitido: true, esperarSegundos: 0, usos: atual.usos };
}

// Só para os testes: zera o estado entre casos.
export function limparJanelas(): void {
  contadores.clear();
}

// Só para os testes: quantas chaves estão vivas agora. É o que prova que o teto
// segura, sem expor o conteúdo do Map.
export function totalDeJanelas(): number {
  return contadores.size;
}

function noTeto(janela: Janela): ResultadoJanela {
  if (janela.noTetoDeChaves === "permitir") {
    return { permitido: true, esperarSegundos: 0, usos: 0 };
  }
  return {
    permitido: false,
    esperarSegundos: Math.max(1, Math.ceil(janela.janelaMs / 1000)),
    usos: 0,
  };
}

function limparExpiradas(agora: number): void {
  for (const [chave, contador] of contadores) {
    if (contador.expiraEm <= agora) {
      contadores.delete(chave);
    }
  }
}
