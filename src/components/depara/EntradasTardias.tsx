"use client";

import { AlertTriangle, ArrowRightLeft, PackageX } from "lucide-react";
import { useState } from "react";

import {
  migrarEntradaTardia,
  type EntradaNoAposentado,
  type ResultadoMigracaoLegado,
} from "@/app/(app)/de-para/actions";

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

/**
 * Entrou material num código que já foi aposentado.
 *
 * É o caso da nota fiscal que chega com o PRD antigo: o recebimento é lançado no
 * Omie no código velho, o saldo reaparece num cadastro que já deveria estar
 * zerado e ninguém percebe — o material existe, mas nenhuma OP nova o encontra,
 * porque as ordens pedem o código novo. Daí o aviso ficar no topo da tela e não
 * atrás de um filtro: enquanto esse saldo estiver do lado errado, ele está
 * invisível para a produção.
 *
 * O botão manda o saldo para o código novo pelo MESMO caminho da migração
 * original (saída no antigo, entrada no novo, no mesmo local, com o fator do
 * par). Não é uma correção improvisada: é a operação que já existe, disparada
 * por outro gatilho.
 */
export function EntradasTardias({ entradas }: { entradas: EntradaNoAposentado[] }) {
  const [lista, setLista] = useState(entradas);
  const [processando, setProcessando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ codigo: string; saida: ResultadoMigracaoLegado } | null>(null);

  if (lista.length === 0) return null;

  async function mandarParaONovo(codigoLegado: string) {
    setProcessando(codigoLegado);
    setResultado(null);
    try {
      const saida = await migrarEntradaTardia({ codigoLegado });
      setResultado({ codigo: codigoLegado, saida });
      if (saida.ok && saida.status === "CONCLUIDO") {
        setLista((atual) => atual.filter((e) => e.codigoLegado !== codigoLegado));
      }
    } finally {
      setProcessando(null);
    }
  }

  return (
    <div className="rounded-xl border border-warning/40 bg-warning-dim p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-warning">
        <PackageX className="h-4 w-4 shrink-0" />
        {lista.length === 1
          ? "Entrou material num código antigo que já estava aposentado"
          : `${lista.length} códigos antigos aposentados voltaram a ter saldo`}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        Alguma entrada (nota fiscal, devolução ou ajuste) caiu no código velho. Esse saldo está invisível para a
        produção: as OPs pedem o código novo e não vão encontrá-lo ali. Mande para o código novo — a operação é a
        mesma da migração, com o fator de conversão do par.
      </p>

      <ul className="mt-3 flex flex-col gap-2">
        {lista.map((entrada) => (
          <li
            key={entrada.codigoLegado}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-3 py-2"
          >
            <span className="text-sm text-card-foreground">
              <b className="font-mono">{entrada.codigoLegado}</b> está com{" "}
              <b>{numero(entrada.saldoAtual)}</b> de saldo
              {entrada.codigoNovo ? (
                <span className="text-muted-foreground">
                  {" "}
                  · deveria estar em <b className="font-mono">{entrada.codigoNovo}</b>
                </span>
              ) : null}
              {entrada.saldoMigrado > 0 ? (
                <span className="ml-2 text-xs text-muted-foreground">
                  (na aposentadoria foram migrados {numero(entrada.saldoMigrado)})
                </span>
              ) : null}
            </span>
            <button
              type="button"
              onClick={() => void mandarParaONovo(entrada.codigoLegado)}
              disabled={processando !== null || !entrada.codigoNovo}
              className="flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              {processando === entrada.codigoLegado ? "Movendo…" : "Mandar para o código novo"}
            </button>
          </li>
        ))}
      </ul>

      {resultado ? (
        <div className="mt-3 rounded-lg bg-card px-3 py-2 text-xs">
          {!resultado.saida.ok ? (
            <p className="flex items-start gap-2 text-danger">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {resultado.saida.erro}
            </p>
          ) : (
            <>
              <p className={resultado.saida.status === "CONCLUIDO" ? "text-success" : "text-warning"}>
                {resultado.codigo}:{" "}
                {resultado.saida.status === "CONCLUIDO"
                  ? "saldo mandado para o código novo."
                  : `ficou pendente (${resultado.saida.status}).`}
              </p>
              {resultado.saida.itens.map((item, i) => (
                <p key={`${item.localNome}-${i}`} className="mt-1 text-muted-foreground">
                  {item.localNome}: {numero(item.quantidadeLegado)} → {numero(item.quantidadeNovo)} · {item.status}
                  {item.motivo ? ` · ${item.motivo}` : ""}
                </p>
              ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
