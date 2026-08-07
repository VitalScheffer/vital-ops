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
  SELECAO_CONFIGURACAO,
} from "@/lib/pcp/configuracoes";
import { type Janela, registrarUso } from "@/lib/pcp/janela";
import { chaveDoToken, tokenConfere, tokenDoHeader, tokenEsperado } from "@/lib/pcp/token";

// GET /api/pcp/configuracoes — ponte de LEITURA para o PCP (Django, na AWS).
//
// O PCP puxa daqui as configurações do configurador para abrir Ordem de
// Produção. Só leitura: esta rota não escreve nada no banco além do registro de
// auditoria de tentativa recusada.
//
// Autenticação por TOKEN DE SERVIÇO (`Authorization: Bearer <PCP_BRIDGE_TOKEN>`),
// não por sessão do Auth.js — do outro lado da ponte não existe usuário logado.
// Por isso `/api/pcp/` está liberado do guard de sessão em `src/lib/auth.config.ts`
// (`isServiceApiPath`); sem aquela liberação o proxy responderia o redirect para
// /login antes deste handler rodar.
//
// Nunca cacheada: `dynamic` desliga qualquer prerender e a resposta vai com
// `Cache-Control: no-store`. Resposta guardada em cache intermediário seria
// resposta autenticada servida a quem não apresentou token.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Freio de volume por token. 60 chamadas/minuto cobre com folga um sync
// incremental (o PCP puxa de minutos em minutos) e segura um laço acidental do
// cliente. Ver a limitação do contador em memória em `@/lib/pcp/janela`.
const LIMITE_POR_TOKEN: Janela = { limite: 60, janelaMs: 60_000 };

// Quantas RECUSAS por origem viram registro no AuditLog dentro da janela.
// AUDITORIA (REQUISITOS §5): leitura de rotina bem-sucedida NÃO é auditada — o
// PCP consulta em laço e cada sync viraria dezenas de linhas iguais, afogando a
// tela de auditoria justamente onde ela precisa ser lida. Fica registrado só o
// que interessa à segurança: tentativa com credencial ausente/errada. E mesmo
// essa entra com teto, senão quem tem a URL enche a tabela de graça mandando
// token inválido em rajada (mesmo raciocínio do `loginGuard`, que só audita
// falha de conta existente).
const LIMITE_DE_AUDITORIA: Janela = { limite: 5, janelaMs: 5 * 60_000 };

// Teto GLOBAL das recusas auditadas na mesma janela. A chave por origem sai de
// `x-forwarded-for`, que quem chama consegue variar à vontade: sozinho, aquele
// teto seria contornado trocando o header a cada tentativa. Este segundo teto
// não depende de nada que venha na requisição.
const LIMITE_DE_AUDITORIA_GLOBAL: Janela = { limite: 30, janelaMs: 5 * 60_000 };

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
    await registrarRecusa(request);
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
    { configuracoes, total: configuracoes.length },
    200,
  );
}

async function registrarRecusa(request: Request): Promise<void> {
  const porOrigem = registrarUso(
    `pcp:recusa:${origemDaRequisicao(request.headers)}`,
    LIMITE_DE_AUDITORIA,
  ).permitido;
  const noGeral = registrarUso("pcp:recusa", LIMITE_DE_AUDITORIA_GLOBAL).permitido;
  if (!porOrigem || !noGeral) {
    return;
  }

  try {
    await audit({
      actor: { id: null, email: ATOR_PONTE },
      action: "pcp.acesso_negado",
      entity: "PcpBridge",
      // NUNCA o token (nem prefixo, nem hash): AuditLog é lido por pessoas na
      // tela de auditoria, e credencial apresentada não vira histórico.
      summary: "Tentativa de leitura da ponte do PCP sem token válido.",
      req: request.headers,
    });
  } catch {
    // Auditoria falhando não pode virar 500 nem mudar a resposta de recusa.
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
