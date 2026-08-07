import { after } from "next/server";

import { audit } from "@/lib/audit";
import type { PcpConfiguracoesResponse, PcpErro } from "@/lib/contracts";
import {
  mensagemDeParametrosInvalidos,
  pcpConfiguracoesQuerySchema,
} from "@/lib/contracts";
import { prisma } from "@/lib/db";
import {
  filtroDeConfiguracoes,
  ORDEM_CONFIGURACOES,
  paraPayloadPcp,
  proximoDesdeDaPagina,
  SELECAO_CONFIGURACAO,
} from "@/lib/pcp/configuracoes";
import { type Janela, registrarUso } from "@/lib/pcp/janela";
import {
  chaveDaOrigem,
  chaveDoToken,
  tokenConfere,
  tokenDoHeader,
  tokenEsperado,
} from "@/lib/pcp/token";

// GET /api/pcp/configuracoes — ponte de LEITURA para o PCP (Django, na AWS).
//
// O PCP puxa daqui as configurações do configurador para abrir Ordem de
// Produção. Só leitura: esta rota não escreve nada no banco além do registro de
// auditoria de tentativa recusada.
//
// Autenticação por TOKEN DE SERVIÇO (`Authorization: Bearer <PCP_BRIDGE_TOKEN>`),
// não por sessão do Auth.js — do outro lado da ponte não existe usuário logado.
// Por isso ESTE caminho exato (`/api/pcp/configuracoes`) está na lista de rotas
// de serviço em `src/lib/auth.config.ts` (`isServiceApiPath`); sem aquela
// liberação o proxy responderia o redirect para /login antes deste handler
// rodar. A lista é exata, não prefixo: rota nova sob `/api/pcp/` nasce dentro do
// guard, e liberar exige escrever o caminho lá.
//
// Nunca cacheada: `dynamic` desliga qualquer prerender e a resposta vai com
// `Cache-Control: no-store`. Resposta guardada em cache intermediário seria
// resposta autenticada servida a quem não apresentou token.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Freio de volume por token. 60 chamadas/minuto cobre com folga um sync
// incremental (o PCP puxa de minutos em minutos) e segura um laço acidental do
// cliente. Ver a limitação do contador em memória em `@/lib/pcp/janela`.
// `noTetoDeChaves: "permitir"` — falha ABERTO de propósito, e só aqui. Esta
// chave só existe depois de um token VÁLIDO, então não é ela que enche o Map;
// quem enche são as chaves de recusa, que qualquer um cria. Falhar fechado aqui
// entregaria o contrário do que se quer: quem inunda o Map com recusas
// derrubaria o sync legítimo do PCP com 429. O que se perde no teto é o freio
// de volume de um cliente que JÁ tem o segredo — risco muito menor que a ponte
// parada.
const LIMITE_POR_TOKEN: Janela = { limite: 60, janelaMs: 60_000, noTetoDeChaves: "permitir" };

// Quantas RECUSAS por origem viram registro no AuditLog dentro da janela.
// AUDITORIA (REQUISITOS §5): leitura de rotina bem-sucedida NÃO é auditada — o
// PCP consulta em laço e cada sync viraria dezenas de linhas iguais, afogando a
// tela de auditoria justamente onde ela precisa ser lida. Fica registrado só o
// que interessa à segurança: tentativa com credencial ausente/errada. E mesmo
// essa entra com teto, senão quem tem a URL enche a tabela de graça mandando
// token inválido em rajada (mesmo raciocínio do `loginGuard`, que só audita
// falha de conta existente).
//
// `noTetoDeChaves: "recusar"` — falha FECHADO: com o Map de janelas no teto, uma
// origem nova conta como "não permitido" e a recusa dela NÃO vira linha. Aberto
// aqui seria pior dos dois lados (memória e AuditLog crescendo por quem escolhe
// o header), e o silêncio não fica invisível: cai no resumo abaixo.
const LIMITE_DE_AUDITORIA: Janela = {
  limite: 5,
  janelaMs: 5 * 60_000,
  noTetoDeChaves: "recusar",
};

// Teto GLOBAL das recusas auditadas na mesma janela. A chave por origem sai de
// `x-forwarded-for`, que quem chama consegue variar à vontade: sozinho, aquele
// teto seria contornado trocando o header a cada tentativa. Este segundo teto
// não depende de nada que venha na requisição. (A chave é fixa, então nunca
// esbarra no teto de chaves; a política fica declarada por completude.)
const LIMITE_DE_AUDITORIA_GLOBAL: Janela = {
  limite: 30,
  janelaMs: 5 * 60_000,
  noTetoDeChaves: "recusar",
};

// O teto acima protege a tabela, mas sozinho ele APAGA a trilha: gastando as 30
// recusas da janela (6 chamadas por minuto), quem sonda garante que a próxima
// tentativa — a que interessa — não vira linha nenhuma, e a auditoria fica cega
// de graça. Então o apagão vira ele mesmo um registro: UMA linha de resumo por
// janela, ação própria, com a contagem de recusas. Uma linha a mais por janela
// não afoga tabela nenhuma, e some da tela sozinha quando ninguém está sondando.
const LIMITE_DE_RESUMO: Janela = { limite: 1, janelaMs: 5 * 60_000, noTetoDeChaves: "recusar" };

// Chaves FIXAS (não saem de nada que venha na requisição).
const CHAVE_RECUSA_GLOBAL = "pcp:recusa";
const CHAVE_RECUSA_RESUMO = "pcp:recusa:resumo";

// Ator de sistema: a ponte não tem usuário. `actorEmail` é obrigatório no
// AuditLog, então usa um identificador fixo e reconhecível no filtro da tela.
const ATOR_PONTE = "ponte-pcp@sistema";

export async function GET(request: Request): Promise<Response> {
  const esperado = tokenEsperado(process.env.PCP_BRIDGE_TOKEN);
  if (!esperado) {
    // Ponte desligada (variável ausente/vazia): 503, sem tocar no banco. É o
    // estado padrão de quem não configurou nada, e é intencional.
    return responder({ erro: "ponte desativada" }, 503);
  }

  const apresentado = tokenDoHeader(request.headers.get("authorization"));
  if (!apresentado || !tokenConfere(apresentado, esperado)) {
    registrarRecusa(request);
    // Corpo genérico: não diferencia header ausente de token errado. Contar essa
    // diferença é entregar de graça metade do trabalho de quem está sondando.
    return responder({ erro: "nao autorizado" }, 401);
  }

  const uso = registrarUso(chaveDoToken(apresentado), LIMITE_POR_TOKEN);
  if (!uso.permitido) {
    return responder({ erro: "muitas requisicoes" }, 429, {
      "Retry-After": String(uso.esperarSegundos),
    });
  }

  const parametros = new URL(request.url).searchParams;
  const consulta = pcpConfiguracoesQuerySchema.safeParse({
    status: parametros.get("status") ?? undefined,
    desde: parametros.get("desde") ?? undefined,
    limite: parametros.get("limite") ?? undefined,
  });
  if (!consulta.success) {
    // Aqui a mensagem PODE ser específica: fala de parâmetro de consulta, que
    // não é informação sensível, e é o que faz o cliente do outro lado se
    // corrigir sozinho.
    return responder(
      {
        erro: "parametros invalidos",
        detalhe: mensagemDeParametrosInvalidos(consulta.error),
      },
      400,
    );
  }

  const registros = await prisma.configuracao.findMany({
    where: filtroDeConfiguracoes(consulta.data),
    select: SELECAO_CONFIGURACAO,
    orderBy: ORDEM_CONFIGURACOES,
    // Teto SEMPRE aplicado: mesmo sem `limite` na URL o schema já entrega o
    // default. Nunca devolver a tabela inteira.
    take: consulta.data.limite,
  });

  const configuracoes = registros.map(paraPayloadPcp);
  return responder<PcpConfiguracoesResponse>(
    {
      configuracoes,
      total: configuracoes.length,
      // Marca d'água da próxima chamada, calculada aqui em vez de deduzida do
      // outro lado — ver o protocolo em `pcpConfiguracoesResponseSchema`.
      proximoDesde: proximoDesdeDaPagina(configuracoes, consulta.data.desde),
    },
    200,
  );
}

function registrarRecusa(request: Request): void {
  // A chave da origem é HASH de tamanho fixo, nunca o header cru: o valor de
  // `x-forwarded-for` é escolhido por quem chama e vira chave de um Map que fica
  // na memória deste processo.
  const porOrigem = registrarUso(
    `pcp:recusa:${chaveDaOrigem(origemDaRequisicao(request.headers))}`,
    LIMITE_DE_AUDITORIA,
  );
  const noGeral = registrarUso(CHAVE_RECUSA_GLOBAL, LIMITE_DE_AUDITORIA_GLOBAL);

  if (porOrigem.permitido && noGeral.permitido) {
    auditarDepoisDaResposta({
      action: "pcp.acesso_negado",
      // NUNCA o token (nem prefixo, nem hash): AuditLog é lido por pessoas na
      // tela de auditoria, e credencial apresentada não vira histórico.
      summary: "Tentativa de leitura da ponte do PCP sem token válido.",
      cabecalhos: request.headers,
    });
    return;
  }

  // Daqui para baixo a recusa NÃO virou linha (teto por origem, teto global ou
  // teto de chaves da janela). Uma linha de resumo por janela transforma o
  // apagão em sinal na tela de auditoria.
  if (!registrarUso(CHAVE_RECUSA_RESUMO, LIMITE_DE_RESUMO).permitido) {
    return;
  }

  auditarDepoisDaResposta({
    action: "pcp.acesso_negado_suprimido",
    summary:
      `Teto de auditoria da ponte do PCP atingido: ${noGeral.usos} recusas contadas nesta ` +
      "janela de 5 min. As recusas seguintes NÃO viram registro individual até a janela virar. " +
      "O IP desta linha é o da tentativa que bateu no teto, não necessariamente o da origem do volume.",
    cabecalhos: request.headers,
  });
}

interface LinhaDeAuditoria {
  action: string;
  summary: string;
  cabecalhos: Headers;
}

// O insert de auditoria não segura a resposta 401. `after()` (next/server,
// estável desde a 15.1 — ver node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/after.md, que lista Route Handlers entre os lugares suportados)
// roda a tarefa depois que a resposta foi enviada. Dois ganhos: requisição sem
// credencial não fica esperando o banco, e o tempo do 401 para de variar
// conforme a linha foi ou não gravada — que era um jeito de quem sonda medir,
// pelo relógio, se já tinha estourado o teto de auditoria.
function auditarDepoisDaResposta(linha: LinhaDeAuditoria): void {
  const tarefa = async () => {
    try {
      await audit({
        actor: { id: null, email: ATOR_PONTE },
        action: linha.action,
        entity: "PcpBridge",
        summary: linha.summary,
        req: linha.cabecalhos,
      });
    } catch {
      // Auditoria falhando não pode virar 500 nem mudar a resposta de recusa.
    }
  };

  try {
    after(tarefa);
  } catch {
    // `after` só existe dentro do escopo de requisição do Next e LANÇA fora dele
    // (erro E468). Quem chama o handler direto — os testes — cai aqui, e a
    // tarefa roda mesmo assim. Perder a auditoria por causa do contexto seria
    // trocar um detalhe de execução por um buraco na trilha.
    void tarefa();
  }
}

// Só para a chave da janela de auditoria (o IP que vai gravado no AuditLog quem
// extrai é o `audit()`). Na Vercel o IP real chega em x-forwarded-for.
function origemDaRequisicao(cabecalhos: Headers): string {
  const bruto = (
    cabecalhos.get("x-forwarded-for")?.split(",")[0] ??
    cabecalhos.get("x-real-ip") ??
    ""
  ).trim();
  return bruto || "desconhecida";
}

function responder<T extends PcpConfiguracoesResponse | PcpErro>(
  corpo: T,
  status: number,
  extras?: Record<string, string>,
): Response {
  return Response.json(corpo, {
    status,
    headers: {
      // Resposta autenticada não pode ficar guardada em lugar nenhum.
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      // Ninguém deveria abrir esta rota num navegador; se abrir, não executa
      // nada. E sem CORS de propósito: o consumidor é servidor-a-servidor.
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...extras,
    },
  });
}
