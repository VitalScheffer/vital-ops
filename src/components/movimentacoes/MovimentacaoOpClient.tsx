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
  buscarSubstituto,
  conferirOp,
  continuarMovimento,
  executarMovimento,
  resumoOp,
  type ItemReservado,
  type LinhaConferida,
  type ResultadoConferenciaOp,
  type ResultadoExecucaoMovimento,
} from "@/app/(app)/movimentacoes/actions";
import { ConsumoOpPanel } from "@/components/movimentacoes/ConsumoOpPanel";
import { Select } from "@/components/ui/Select";
import type { GrupoItemMovimento } from "@/lib/contracts";
import type { OrigemSubstituto, Substituto } from "@/lib/depara/substituto";
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
// quando a pessoa pede "toda a BOM": elas são fabricadas, não retiradas.
const GRUPOS_PADRAO: GrupoItemMovimento[] = ["MAT", "COM"];

// De onde veio cada candidato. A diferença fica na própria opção porque ela
// muda o que a pessoa precisa conferir antes de mover.
const ROTULO_ORIGEM: Record<OrigemSubstituto, string> = {
  confirmado: " · De/Para confirmado",
  automatico: " · deduzido, confira",
  busca: " · você buscou, confira",
};

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

/**
 * O item que a linha vai MOVER de verdade.
 *
 * A OP pede um código; quando ele está sem saldo e a pessoa escolhe um cadastro
 * antigo, o que vai para o Omie é o antigo, e o código da OP fica registrado em
 * `substituiSku` para o histórico não mentir sobre o que a ordem pediu.
 */
interface ItemEfetivo {
  idProd: string;
  sku: string;
  unidade?: string;
  descricao: string;
  saldo: number;
  substituiSku?: string;
  avisos: string[];
  /** A unidade mudou e NÃO há fator: a quantidade tem que ser digitada. */
  exigeQuantidade: boolean;
  /** Quantidade já convertida pelo fator do De/Para, quando ele existe. */
  quantidadeSugerida?: number;
}

/** Todos os cadastros oferecidos para a linha: os deduzidos e os que a pessoa buscou. */
function candidatosDaLinha(linha: LinhaConferida, extras: Substituto[]): Substituto[] {
  const vistos = new Set((linha.substitutos ?? []).map((s) => s.codigo));
  return [...(linha.substitutos ?? []), ...extras.filter((e) => !vistos.has(e.codigo))];
}

function itemEfetivo(linha: LinhaConferida, escolha: string, extras: Substituto[] = []): ItemEfetivo {
  const substituto = candidatosDaLinha(linha, extras).find((s) => s.codigo === escolha);
  if (!substituto) {
    return {
      idProd: linha.idProd,
      sku: linha.sku,
      unidade: linha.unidade,
      descricao: linha.descricao,
      saldo: linha.saldoOrigem,
      avisos: [],
      exigeQuantidade: false,
    };
  }
  return {
    idProd: substituto.idProd,
    sku: substituto.codigo,
    unidade: substituto.unidade,
    descricao: substituto.descricao,
    saldo: substituto.saldo,
    substituiSku: linha.sku,
    avisos: substituto.avisos,
    // Com fator gravado no De/Para a conversão já foi feita no servidor: exigir
    // digitação aí seria pedir de novo um número que a empresa já decidiu.
    exigeQuantidade: substituto.unidadeMuda && substituto.quantidadeSugerida === undefined,
    quantidadeSugerida: substituto.quantidadeSugerida,
  };
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
  // Por linha (chave = idProd do item da OP): "" usa o código que a OP pede;
  // qualquer outro valor é o código do cadastro antigo escolhido no lugar dele.
  const [substitutos, setSubstitutos] = useState<Record<string, string>>({});
  // Cadastros que a pessoa ACHOU na busca, somados aos que o sistema deduziu.
  // A lista deduzida resolve o caso comum; a busca é o que salva quando ela
  // vem vazia (o casamento por geometria não achou nada) ou quando quem está
  // na tela sabe de qual código o material tem que sair.
  const [achados, setAchados] = useState<Record<string, Substituto[]>>({});
  const [execucao, setExecucao] = useState<ResultadoExecucaoMovimento | null>(null);
  const [executando, setExecutando] = useState(false);
  const [retomando, setRetomando] = useState<string | null>(null);
  const [reservados, setReservados] = useState<ItemReservado[]>([]);
  const reqId = useRef(0);

  const visiveis = useMemo(() => {
    const linhas = conferencia?.linhas ?? [];
    return tudo ? linhas : linhas.filter((l) => GRUPOS_PADRAO.includes(l.grupo));
  }, [conferencia, tudo]);
  const totalLinhas = conferencia?.linhas.length ?? 0;
  const escondidas = totalLinhas - visiveis.length;

  const mesmoLocal = origem === destino;
  const numeroCanonico = conferencia?.ordem?.numero ?? numeroOp;

  // Linha marcada só entra na movimentação com quantidade > 0. É o que segura o
  // caso do substituto em outra unidade: ao trocar, a quantidade é zerada e a
  // linha fica inelegível até alguém digitar quanto vai sair.
  const selecionadas = visiveis
    .filter((linha) => marcados.has(linha.idProd))
    .filter((linha) => (quantidades[linha.idProd] ?? 0) > 0);

  function aplicarConferencia(resultado: ResultadoConferenciaOp) {
    setConferencia(resultado);
    setSubstitutos({});
    setAchados({});
    setQuantidades(Object.fromEntries(resultado.linhas.map((l) => [l.idProd, l.quantidade])));
    // Já vem marcado o que dá para mover: linha sem saldo entra desmarcada, com
    // o motivo e as alternativas à vista, em vez de sumir da lista.
    setMarcados(
      new Set(
        resultado.linhas.filter((l) => GRUPOS_PADRAO.includes(l.grupo) && l.suficiente).map((l) => l.idProd),
      ),
    );
  }

  async function carregarReservados(numero: string) {
    const resumo = await resumoOp(numero);
    setReservados(resumo.ok ? resumo.itens : []);
  }

  async function buscar(recarregar = false) {
    const id = ++reqId.current;
    setBuscando(true);
    setExecucao(null);
    try {
      const resultado = await conferirOp({ numeroOp, origemCodigo: origem, recarregar });
      if (reqId.current !== id) return;
      aplicarConferencia(resultado);
      if (resultado.ok && resultado.ordem) await carregarReservados(resultado.ordem.numero);
      else setReservados([]);
    } finally {
      if (reqId.current === id) setBuscando(false);
    }
  }

  // Trocar a origem re-consulta o saldo: é assim que dá pra ver qual local tem
  // o material antes de mover.
  async function trocarOrigem(novo: string) {
    setOrigem(novo);
    setExecucao(null);
    if (!conferencia?.ok) return;
    const id = ++reqId.current;
    setBuscando(true);
    try {
      const resultado = await conferirOp({ numeroOp, origemCodigo: novo });
      if (reqId.current === id) aplicarConferencia(resultado);
    } finally {
      if (reqId.current === id) setBuscando(false);
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

  function podeMover(linha: LinhaConferida): boolean {
    const efetivo = itemEfetivo(linha, substitutos[linha.idProd] ?? "", achados[linha.idProd]);
    const quantidade = quantidades[linha.idProd] ?? 0;
    return quantidade > 0 && efetivo.saldo >= quantidade;
  }

  function marcarTodos(ligar: boolean) {
    setMarcados(ligar ? new Set(visiveis.filter(podeMover).map((l) => l.idProd)) : new Set());
  }

  // "Marcar tudo" do cabeçalho: liga o que dá para mover e desliga tudo. Só
  // entram as linhas com saldo e quantidade — marcar o que a execução vai
  // recusar não é seleção, é uma lista de erros pronta.
  const marcaveis = visiveis.filter(podeMover);
  const todosMarcados = marcaveis.length > 0 && marcaveis.every((l) => marcados.has(l.idProd));

  /**
   * Trocar o cadastro a mover ajusta a quantidade.
   *
   * Com o fator do De/Para gravado, a quantidade já vem convertida (a OP pede
   * 21,66 KG e a linha passa a mover 3,0671 M²). Sem fator, a quantidade é
   * ZERADA e a linha desmarcada: manter o número da OP ali seria oferecer 21,66
   * "kg" de um cadastro que está em M², e número já preenchido tende a ser
   * confirmado sem leitura.
   */
  function escolherSubstituto(linha: LinhaConferida, codigo: string) {
    setSubstitutos((atual) => ({ ...atual, [linha.idProd]: codigo }));
    const efetivo = itemEfetivo(linha, codigo, achados[linha.idProd]);
    if (efetivo.exigeQuantidade) {
      setQuantidades((atual) => ({ ...atual, [linha.idProd]: 0 }));
      setMarcados((atual) => {
        const proximo = new Set(atual);
        proximo.delete(linha.idProd);
        return proximo;
      });
      return;
    }
    setQuantidades((atual) => ({
      ...atual,
      [linha.idProd]: efetivo.quantidadeSugerida ?? linha.quantidade,
    }));
  }

  /** Junta o que a busca achou aos candidatos já oferecidos naquela linha. */
  function guardarAchados(linha: LinhaConferida, novos: Substituto[]) {
    setAchados((atual) => {
      const jaTem = new Set((atual[linha.idProd] ?? []).map((s) => s.codigo));
      return {
        ...atual,
        [linha.idProd]: [...(atual[linha.idProd] ?? []), ...novos.filter((n) => !jaTem.has(n.codigo))],
      };
    });
  }

  async function transferir() {
    if (selecionadas.length === 0 || mesmoLocal) return;
    setExecutando(true);
    try {
      const resultado = await executarMovimento({
        numeroOp: numeroCanonico,
        origemCodigo: origem,
        destinoCodigo: destino,
        itens: selecionadas.map((linha) => {
          const efetivo = itemEfetivo(linha, substitutos[linha.idProd] ?? "", achados[linha.idProd]);
          return {
            idProd: efetivo.idProd,
            sku: efetivo.sku,
            descricao: efetivo.descricao,
            unidade: efetivo.unidade,
            familia: linha.familia,
            grupo: linha.grupo,
            quantidade: quantidades[linha.idProd] ?? linha.quantidade,
            substituiSku: efetivo.substituiSku,
          };
        }),
      });
      setExecucao(resultado);
      await carregarReservados(numeroCanonico);
    } finally {
      setExecutando(false);
    }
  }

  async function retomar(movimentoId: string) {
    setRetomando(movimentoId);
    try {
      const resultado = await continuarMovimento({ movimentoId });
      setExecucao(resultado);
      if (conferencia?.ordem) await carregarReservados(conferencia.ordem.numero);
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
            {pendentes.length === 1
              ? "Uma movimentação ficou pela metade"
              : `${pendentes.length} movimentações ficaram pela metade`}
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
                  onClick={() => void retomar(p.id)}
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
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-10 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={todosMarcados}
                      onChange={(e) => marcarTodos(e.target.checked)}
                      disabled={marcaveis.length === 0}
                      title="Marcar/desmarcar todos os que dá para mover"
                      aria-label="Marcar todos"
                      className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
                    />
                  </th>
                  <th className="px-3 py-2">Item</th>
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
                    candidatos={candidatosDaLinha(linha, achados[linha.idProd] ?? [])}
                    escolha={substitutos[linha.idProd] ?? ""}
                    marcado={marcados.has(linha.idProd)}
                    quantidade={quantidades[linha.idProd] ?? 0}
                    origem={origem}
                    onToggle={() => alternar(linha.idProd)}
                    onQuantidade={(valor) => setQuantidades((atual) => ({ ...atual, [linha.idProd]: valor }))}
                    onSubstituto={(codigo) => escolherSubstituto(linha, codigo)}
                    onAchados={(novos) => guardarAchados(linha, novos)}
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

      {reservados.length > 0 ? (
        <ConsumoOpPanel
          numeroOp={numeroCanonico}
          itens={reservados}
          locais={locais}
          onAtualizar={setReservados}
        />
      ) : null}
    </div>
  );
}

function LinhaTabela({
  linha,
  candidatos,
  escolha,
  marcado,
  quantidade,
  origem,
  onToggle,
  onQuantidade,
  onSubstituto,
  onAchados,
}: {
  linha: LinhaConferida;
  candidatos: Substituto[];
  escolha: string;
  marcado: boolean;
  quantidade: number;
  origem: string;
  onToggle: () => void;
  onQuantidade: (valor: number) => void;
  onSubstituto: (codigo: string) => void;
  onAchados: (novos: Substituto[]) => void;
}) {
  const [termo, setTermo] = useState("");
  const [buscandoSub, setBuscandoSub] = useState(false);
  const [semResultado, setSemResultado] = useState(false);

  const efetivo = itemEfetivo(linha, escolha, candidatos);
  const excede = quantidade > efetivo.saldo;
  const faltaQuantidade = quantidade <= 0;
  const temSubstituto = candidatos.length > 0;
  // A busca aparece em toda linha SEM saldo, tenha ou não candidato deduzido:
  // é justamente quando a dedução não achou nada que digitar o código é a única
  // saída, e é aí que a lista pronta não ajudava.
  const podeBuscar = !linha.suficiente && !linha.sku.startsWith("#");

  async function procurar() {
    const q = termo.trim();
    if (q.length < 2) return;
    setBuscandoSub(true);
    setSemResultado(false);
    try {
      const resultado = await buscarSubstituto({
        termo: q,
        origemCodigo: origem,
        skuDaOp: linha.sku,
        quantidadePedida: linha.quantidade,
      });
      if (!resultado.ok || resultado.substitutos.length === 0) {
        setSemResultado(true);
        return;
      }
      onAchados(resultado.substitutos);
    } finally {
      setBuscandoSub(false);
    }
  }

  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2">
        <input
          type="checkbox"
          checked={marcado}
          onChange={onToggle}
          disabled={faltaQuantidade}
          className="h-4 w-4 accent-[var(--primary)] disabled:opacity-40"
        />
      </td>

      <td className="px-3 py-2">
        <span className="font-mono text-xs text-card-foreground">{efetivo.sku}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{efetivo.descricao}</span>

        {efetivo.substituiSku ? (
          <span className="mt-0.5 block text-xs text-warning">
            no lugar de <b className="font-mono">{efetivo.substituiSku}</b>, que a OP pede
          </span>
        ) : null}

        {linha.aviso ? <span className="mt-1 block text-xs text-danger">{linha.aviso}</span> : null}

        {temSubstituto ? (
          <div className="mt-2 flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">
              {linha.sku} está sem saldo aqui. Dá para mover um cadastro antigo no lugar:
            </span>
            <Select
              value={escolha}
              onChange={(e) => onSubstituto(e.target.value)}
              containerClassName="max-w-[26rem]"
              className="py-1 text-xs"
            >
              <option value="" className="bg-card text-foreground">
                {linha.sku} (saldo {numero(linha.saldoOrigem)})
              </option>
              {candidatos.map((substituto) => (
                <option key={substituto.codigo} value={substituto.codigo} className="bg-card text-foreground">
                  {substituto.codigo} (saldo {numero(substituto.saldo)}
                  {substituto.unidade ? ` ${substituto.unidade}` : ""})
                  {ROTULO_ORIGEM[substituto.origem]}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        {podeBuscar ? (
          <div className="mt-2 flex flex-col gap-1">
            {!temSubstituto ? (
              <span className="text-xs text-muted-foreground">
                {linha.sku} está sem saldo aqui e o sistema não achou equivalente sozinho. Busque o cadastro pelo
                código ou pela descrição:
              </span>
            ) : null}
            <div className="flex flex-wrap items-center gap-1">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={termo}
                  onChange={(e) => {
                    setTermo(e.target.value);
                    setSemResultado(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void procurar();
                  }}
                  placeholder="buscar outro código (PRD00620, CHAPA…)"
                  className="w-64 rounded-lg border border-border bg-field py-1 pl-7 pr-2 text-xs text-card-foreground outline-none focus-visible:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => void procurar()}
                disabled={buscandoSub || termo.trim().length < 2}
                className="rounded-lg border border-border px-2 py-1 text-xs text-muted-foreground disabled:opacity-60"
              >
                {buscandoSub ? "Buscando…" : "Buscar"}
              </button>
              {semResultado ? (
                <span className="text-xs text-warning">Nada encontrado com esse termo.</span>
              ) : null}
            </div>
          </div>
        ) : null}

        {efetivo.avisos.map((aviso) => (
          <span key={aviso} className="mt-1 block text-xs text-warning">
            {aviso}
          </span>
        ))}
      </td>

      <td className="px-3 py-2 text-xs text-muted-foreground">{ROTULO_GRUPO[linha.grupo]}</td>

      <td className="px-3 py-2 text-right">
        <input
          type="number"
          min={0}
          step="any"
          value={quantidade === 0 ? "" : quantidade}
          placeholder={efetivo.exigeQuantidade ? "digite" : "0"}
          onChange={(e) => onQuantidade(Number(e.target.value))}
          className={`w-28 rounded-lg border bg-field px-2 py-1 text-right text-sm text-card-foreground outline-none ${
            excede || faltaQuantidade ? "border-danger" : "border-border"
          }`}
        />
        <span className="ml-1 text-xs text-muted-foreground">{efetivo.unidade ?? ""}</span>
        {faltaQuantidade && efetivo.exigeQuantidade ? (
          <span className="mt-1 block text-xs text-warning">informe a quantidade nesta unidade</span>
        ) : null}
      </td>

      <td className={`px-3 py-2 text-right ${excede ? "text-danger" : "text-muted-foreground"}`}>
        {numero(efetivo.saldo)} {efetivo.unidade ?? ""}
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
