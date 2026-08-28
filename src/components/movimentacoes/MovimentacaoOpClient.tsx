"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Layers,
  RefreshCw,
  Search,
  Send,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  conferirOp,
  continuarMovimento,
  executarMovimento,
  type LinhaConferida,
  type ResultadoConferenciaOp,
  type ResultadoExecucaoMovimento,
} from "@/app/(app)/movimentacoes/actions";
import { Select } from "@/components/ui/Select";
import type { GrupoItemMovimento } from "@/lib/contracts";
import { destinoSugerido, origemSugerida } from "@/lib/estoque/locais";

export interface LocalOpcao {
  codigo: string;
  descricao: string;
  padrao: boolean;
}

export interface PendenteResumo {
  id: string;
  numeroOp: string;
  origemNome: string;
  destinoNome: string;
  itensPendentes: number;
  criadoEm: string;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

const ROTULO_GRUPO: Record<GrupoItemMovimento, string> = {
  MAT: "Matéria-prima",
  COM: "Comprado",
  SBM: "Submontagem",
  PECA: "Peça",
  OUTRO: "Outro",
};

// O que a fábrica separa e leva pra produção. Submontagem e peça só entram
// quando a pessoa pede "toda a BOM" — elas são fabricadas, não retiradas.
const GRUPOS_PADRAO: GrupoItemMovimento[] = ["MAT", "COM"];

const OUTCOME_LABEL: Record<string, string> = {
  TRANSFERIDO: "transferido ✓",
  SAIDA_OK: "saiu da origem, NÃO entrou no destino",
  FALHA: "falha ✗",
  PENDENTE: "não movimentado",
};

function outcomeClass(status: string): string {
  if (status === "TRANSFERIDO") return "text-primary";
  if (status === "SAIDA_OK") return "text-warning";
  if (status === "FALHA") return "text-danger";
  return "text-muted-foreground";
}

function numero(valor: number, casas = 4): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

interface Props {
  locais: LocalOpcao[];
  pendentes: PendenteResumo[];
}

export function MovimentacaoOpClient({ locais, pendentes }: Props) {
  const origemPadrao = origemSugerida(locais);

  const [numeroOp, setNumeroOp] = useState("");
  const [origem, setOrigem] = useState(origemPadrao);
  const [destino, setDestino] = useState(() => destinoSugerido(locais, origemPadrao));
  const [conferencia, setConferencia] = useState<ResultadoConferenciaOp | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [tudo, setTudo] = useState(false);
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [execucao, setExecucao] = useState<ResultadoExecucaoMovimento | null>(null);
  const [executando, setExecutando] = useState(false);
  const [retomando, setRetomando] = useState<string | null>(null);
  const reqId = useRef(0);

  const visiveis = useMemo(() => {
    const linhas = conferencia?.linhas ?? [];
    return tudo ? linhas : linhas.filter((l) => GRUPOS_PADRAO.includes(l.grupo));
  }, [conferencia, tudo]);
  const totalLinhas = conferencia?.linhas.length ?? 0;
  const escondidas = totalLinhas - visiveis.length;

  const selecionadas = visiveis.filter((l) => marcados.has(l.idProd));
  const mesmoLocal = origem === destino;

  async function buscar(recarregar = false) {
    const id = ++reqId.current;
    setBuscando(true);
    setExecucao(null);
    try {
      const resultado = await conferirOp({ numeroOp, origemCodigo: origem, recarregar });
      if (reqId.current !== id) return;
      setConferencia(resultado);
      // Já vem marcado o que dá para mover: linha sem saldo entra desmarcada,
      // com o motivo à vista, em vez de sumir da lista.
      const iniciais = new Set(
        resultado.linhas.filter((l) => GRUPOS_PADRAO.includes(l.grupo) && l.suficiente).map((l) => l.idProd),
      );
      setMarcados(iniciais);
      setQuantidades(Object.fromEntries(resultado.linhas.map((l) => [l.idProd, l.quantidade])));
    } finally {
      if (reqId.current === id) setBuscando(false);
    }
  }

  // Trocar a origem re-consulta o saldo: é assim que dá pra ver qual local tem
  // o material antes de mover.
  async function trocarOrigem(novo: string) {
    setOrigem(novo);
    setExecucao(null);
    if (conferencia?.ok) {
      const id = ++reqId.current;
      setBuscando(true);
      try {
        const resultado = await conferirOp({ numeroOp, origemCodigo: novo });
        if (reqId.current !== id) return;
        setConferencia(resultado);
        setMarcados(
          new Set(resultado.linhas.filter((l) => GRUPOS_PADRAO.includes(l.grupo) && l.suficiente).map((l) => l.idProd)),
        );
      } finally {
        if (reqId.current === id) setBuscando(false);
      }
    }
  }

  function alternar(idProd: string) {
    setMarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(idProd)) proximo.delete(idProd);
      else proximo.add(idProd);
      return proximo;
    });
  }

  function marcarTodos(ligar: boolean) {
    setMarcados(ligar ? new Set(visiveis.filter((l) => l.suficiente).map((l) => l.idProd)) : new Set());
  }

  async function transferir() {
    if (selecionadas.length === 0 || mesmoLocal) return;
    setExecutando(true);
    try {
      const resultado = await executarMovimento({
        numeroOp: conferencia?.ordem?.numero ?? numeroOp,
        origemCodigo: origem,
        destinoCodigo: destino,
        itens: selecionadas.map((linha) => ({
          idProd: linha.idProd,
          sku: linha.sku,
          descricao: linha.descricao,
          unidade: linha.unidade,
          familia: linha.familia,
          grupo: linha.grupo,
          quantidade: quantidades[linha.idProd] ?? linha.quantidade,
        })),
      });
      setExecucao(resultado);
    } finally {
      setExecutando(false);
    }
  }

  async function retomar(movimentoId: string) {
    setRetomando(movimentoId);
    try {
      setExecucao(await continuarMovimento({ movimentoId }));
    } finally {
      setRetomando(null);
    }
  }

  const nomeLocal = (codigo: string) => locais.find((l) => l.codigo === codigo)?.descricao ?? codigo;

  return (
    <div className="flex flex-col gap-6">
      {pendentes.length > 0 ? (
        <div className="rounded-xl border border-warning/40 bg-warning-dim p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-warning">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            {pendentes.length === 1 ? "Uma movimentação ficou pela metade" : `${pendentes.length} movimentações ficaram pela metade`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Nesses itens a saída foi lançada na origem e a entrada no destino não. O material está fora dos dois
            locais até você concluir. Concluir manda só a entrada que falta, sem baixar nada de novo.
          </p>
          <ul className="mt-3 flex flex-col gap-2">
            {pendentes.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-card px-3 py-2">
                <span className="text-sm text-card-foreground">
                  OP <b>{p.numeroOp}</b> · {p.itensPendentes} item(ns) · {p.origemNome} → {p.destinoNome}
                  <span className="ml-2 text-xs text-muted-foreground">{p.criadoEm}</span>
                </span>
                <button
                  type="button"
                  onClick={() => retomar(p.id)}
                  disabled={retomando !== null}
                  className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                >
                  {retomando === p.id ? "Concluindo…" : "Concluir entrada"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Número da OP</span>
          <input
            value={numeroOp}
            onChange={(e) => setNumeroOp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void buscar();
            }}
            placeholder="2026/00802"
            className={inputClass}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Sai de</span>
          <Select value={origem} onChange={(e) => void trocarOrigem(e.target.value)}>
            {locais.map((local) => (
              <option key={local.codigo} value={local.codigo} className="bg-card text-foreground">
                {local.descricao}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Vai para</span>
          <Select value={destino} onChange={(e) => setDestino(e.target.value)}>
            {locais.map((local) => (
              <option key={local.codigo} value={local.codigo} className="bg-card text-foreground">
                {local.descricao}
              </option>
            ))}
          </Select>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void buscar()}
            disabled={buscando || numeroOp.trim().length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {buscando ? "Buscando…" : "Buscar OP"}
          </button>
          <button
            type="button"
            onClick={() => void buscar(true)}
            disabled={buscando || numeroOp.trim().length === 0}
            title="Reler as ordens no Omie (ignora o cache de 2 minutos)"
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${buscando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {mesmoLocal ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Origem e destino são o mesmo local. Escolha locais diferentes.
        </p>
      ) : null}

      {conferencia && !conferencia.ok ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {conferencia.erro}
            {conferencia.ambiguas?.length ? (
              <span className="mt-1 block text-xs">Encontrei: {conferencia.ambiguas.join(", ")}.</span>
            ) : null}
          </span>
        </p>
      ) : null}

      {conferencia?.ok && conferencia.ordem ? (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-sm font-semibold text-card-foreground">OP {conferencia.ordem.numero}</span>
            <span className="text-sm text-muted-foreground">
              {conferencia.ordem.produtoCodigo} · {conferencia.ordem.produtoDescricao}
            </span>
            <span className="text-sm text-muted-foreground">
              Quantidade a produzir: <b className="text-card-foreground">{numero(conferencia.ordem.quantidade)}</b>
            </span>
            {conferencia.ordem.dataPrevisao ? (
              <span className="text-sm text-muted-foreground">Previsão: {conferencia.ordem.dataPrevisao}</span>
            ) : null}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {conferencia.ordem.totalItensOmie} linhas na OP do Omie, agrupadas em {totalLinhas} itens (o mesmo
            material aparece uma vez por peça que o consome). As quantidades já vêm multiplicadas pela quantidade da
            ordem, na unidade de cada cadastro.
          </p>
          {conferencia.ordem.concluida ? (
            <p className="mt-2 flex items-center gap-2 text-xs text-warning">
              <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
              Esta OP já está marcada como concluída no Omie. Confirme se é ela mesma antes de movimentar.
            </p>
          ) : null}
        </div>
      ) : null}

      {conferencia?.ok && totalLinhas > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setTudo((v) => !v)}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-card-foreground"
            >
              <Layers className="h-3.5 w-3.5" />
              {tudo ? "Mostrar só matéria-prima e comprados" : `Mostrar toda a BOM (+${escondidas})`}
            </button>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <button type="button" onClick={() => marcarTodos(true)} className="underline underline-offset-2">
                marcar os que têm saldo
              </button>
              <button type="button" onClick={() => marcarTodos(false)} className="underline underline-offset-2">
                desmarcar todos
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2">Código</th>
                  <th className="px-3 py-2">Descrição</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Quantidade</th>
                  <th className="px-3 py-2 text-right">Saldo na origem</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((linha) => (
                  <LinhaTabela
                    key={linha.idProd}
                    linha={linha}
                    marcado={marcados.has(linha.idProd)}
                    quantidade={quantidades[linha.idProd] ?? linha.quantidade}
                    onToggle={() => alternar(linha.idProd)}
                    onQuantidade={(valor) =>
                      setQuantidades((atual) => ({ ...atual, [linha.idProd]: valor }))
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selecionadas.length} item(ns) selecionado(s) · {nomeLocal(origem)}{" "}
              <ArrowRight className="inline h-3.5 w-3.5" /> {nomeLocal(destino)}
            </p>
            <button
              type="button"
              onClick={() => void transferir()}
              disabled={executando || selecionadas.length === 0 || mesmoLocal}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {executando ? "Transferindo…" : "Transferir para o destino"}
            </button>
          </div>
        </div>
      ) : null}

      {execucao ? <ResultadoExecucao resultado={execucao} /> : null}
    </div>
  );
}

function LinhaTabela({
  linha,
  marcado,
  quantidade,
  onToggle,
  onQuantidade,
}: {
  linha: LinhaConferida;
  marcado: boolean;
  quantidade: number;
  onToggle: () => void;
  onQuantidade: (valor: number) => void;
}) {
  const excede = quantidade > linha.saldoOrigem;
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2">
        <input type="checkbox" checked={marcado} onChange={onToggle} className="h-4 w-4 accent-[var(--primary)]" />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-card-foreground">{linha.sku}</td>
      <td className="px-3 py-2">
        <span className="text-card-foreground">{linha.descricao}</span>
        {linha.aviso ? <span className="mt-1 block text-xs text-danger">{linha.aviso}</span> : null}
        {linha.alternativa ? (
          <span className="mt-1 block text-xs text-warning">
            O saldo está no código antigo <b className="font-mono">{linha.alternativa.codigoLegado}</b> (
            {numero(linha.alternativa.saldo)} na origem): {linha.alternativa.descricaoLegado}.
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground">{ROTULO_GRUPO[linha.grupo]}</td>
      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          step="any"
          value={quantidade}
          onChange={(e) => onQuantidade(Number(e.target.value))}
          className={`w-28 rounded-lg border bg-field px-2 py-1 text-right text-sm text-card-foreground outline-none ${
            excede ? "border-danger" : "border-border"
          }`}
        />
        <span className="ml-1 text-xs text-muted-foreground">{linha.unidade ?? ""}</span>
      </td>
      <td className={`px-3 py-2 text-right ${excede ? "text-danger" : "text-muted-foreground"}`}>
        {numero(linha.saldoOrigem)} {linha.unidade ?? ""}
      </td>
    </tr>
  );
}

function ResultadoExecucao({ resultado }: { resultado: ResultadoExecucaoMovimento }) {
  if (!resultado.ok) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {resultado.erro}
      </p>
    );
  }

  const pendentes = resultado.pendentes ?? 0;
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <p className={`flex items-center gap-2 text-sm font-semibold ${pendentes > 0 ? "text-warning" : "text-primary"}`}>
        {pendentes > 0 ? <TriangleAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
        {pendentes > 0
          ? `${pendentes} item(ns) saíram da origem e não entraram no destino. Use "Concluir entrada" no aviso do topo.`
          : "Movimentação concluída."}
      </p>

      {resultado.motivoInterrupcao ? (
        <p className="rounded-lg bg-warning-dim px-3 py-2 text-xs text-warning">{resultado.motivoInterrupcao}</p>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Código</th>
              <th className="px-3 py-2 text-right">Quantidade</th>
              <th className="px-3 py-2">Situação</th>
            </tr>
          </thead>
          <tbody>
            {resultado.itens.map((item) => (
              <tr key={item.sku} className="border-t border-border align-top">
                <td className="px-3 py-2 font-mono text-xs text-card-foreground">{item.sku}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {numero(item.quantidade)} {item.unidade ?? ""}
                </td>
                <td className={`px-3 py-2 text-xs ${outcomeClass(item.outcome)}`}>
                  {OUTCOME_LABEL[item.outcome] ?? item.outcome}
                  {item.motivo ? <span className="mt-1 block text-muted-foreground">{item.motivo}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
