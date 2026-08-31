"use client";

import { AlertTriangle, Check, RefreshCw, Search, Undo2, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  carregarFila,
  removerDePara,
  salvarDePara,
  type LinhaFila,
  type OpcaoMat,
  type ResultadoFila,
} from "@/app/(app)/de-para/actions";
import { Select } from "@/components/ui/Select";

export interface LocalOpcao {
  codigo: string;
  descricao: string;
  padrao: boolean;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

const ROTULO_CONFIANCA: Record<string, string> = {
  EXATA: "exata",
  APROXIMADA: "aproximada",
  MANUAL: "escolha manual",
  SEM_EQUIVALENTE: "sem equivalente",
};

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

interface Props {
  locais: LocalOpcao[];
  /** Local já consultado no servidor (evita uma tela vazia piscando na abertura). */
  localInicial: string;
  filaInicial: ResultadoFila;
}

export function DeParaClient({ locais, localInicial, filaInicial }: Props) {
  // A primeira fila vem PRONTA do servidor. Carregar no cliente exigiria um
  // efeito na montagem, e efeito que só serve para disparar a primeira busca é
  // exatamente o que a regra do React desaconselha: as buscas seguintes têm um
  // evento de verdade (trocar o local, clicar em recarregar).
  const [local, setLocal] = useState(localInicial);
  const [fila, setFila] = useState<ResultadoFila | null>(filaInicial);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState("");
  const [soPendentes, setSoPendentes] = useState(true);
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      filaInicial.linhas.map((linha) => [
        linha.codigo,
        linha.decidido?.codigoNovo ?? linha.sugestao.codigoNovo ?? "",
      ]),
    ),
  );
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const reqId = useRef(0);

  async function carregar(codigoLocal: string, recarregar = false) {
    const id = ++reqId.current;
    setCarregando(true);
    setAviso(null);
    try {
      const resultado = await carregarFila(codigoLocal, recarregar);
      if (reqId.current !== id) return;
      setFila(resultado);
      // Pré-seleciona a sugestão automática em cada linha ainda não decidida.
      setEscolhas(
        Object.fromEntries(
          resultado.linhas.map((linha) => [
            linha.codigo,
            linha.decidido?.codigoNovo ?? linha.sugestao.codigoNovo ?? "",
          ]),
        ),
      );
    } finally {
      if (reqId.current === id) setCarregando(false);
    }
  }

  const visiveis = useMemo(() => {
    const linhas = fila?.linhas ?? [];
    const termo = busca.trim().toLowerCase();
    return linhas.filter((linha) => {
      if (soPendentes && linha.decidido) return false;
      if (!termo) return true;
      return (
        linha.codigo.toLowerCase().includes(termo) ||
        linha.descricao.toLowerCase().includes(termo) ||
        (linha.sugestao.codigoNovo ?? "").toLowerCase().includes(termo)
      );
    });
  }, [fila, busca, soPendentes]);

  async function confirmar(linha: LinhaFila, semEquivalente: boolean) {
    const escolhido = escolhas[linha.codigo] ?? "";
    if (!semEquivalente && !escolhido) {
      setAviso(`Escolha o código novo de ${linha.codigo} ou marque "sem equivalente".`);
      return;
    }
    const opcao = fila?.opcoes.find((o) => o.codigo === escolhido);
    const confianca = semEquivalente
      ? "SEM_EQUIVALENTE"
      : escolhido === linha.sugestao.codigoNovo && linha.sugestao.confianca === "EXATA"
        ? "EXATA"
        : escolhido === linha.sugestao.codigoNovo
          ? "APROXIMADA"
          : "MANUAL";

    setSalvando(linha.codigo);
    setAviso(null);
    try {
      const resultado = await salvarDePara({
        codigoLegado: linha.codigo,
        descricaoLegado: linha.descricao,
        unidadeLegado: linha.unidade,
        codigoNovo: semEquivalente ? null : escolhido,
        descricaoNovo: opcao?.descricao,
        unidadeNovo: opcao?.unidade,
        confianca,
        motivo: linha.sugestao.motivo,
      });
      if (!resultado.ok) {
        setAviso(resultado.erro ?? "Não consegui salvar.");
        return;
      }
      await carregar(local);
    } finally {
      setSalvando(null);
    }
  }

  async function desfazer(linha: LinhaFila) {
    setSalvando(linha.codigo);
    try {
      const resultado = await removerDePara({ codigoLegado: linha.codigo });
      if (!resultado.ok) {
        setAviso(resultado.erro ?? "Não consegui remover.");
        return;
      }
      await carregar(local);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Local de estoque</span>
          <Select
            value={local}
            onChange={(e) => {
              setLocal(e.target.value);
              void carregar(e.target.value);
            }}
          >
            {locais.map((l) => (
              <option key={l.codigo} value={l.codigo} className="bg-card text-foreground">
                {l.descricao}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">Buscar</span>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Código antigo, descrição ou código novo"
              className={`${inputClass} w-full pl-9`}
            />
          </div>
        </label>

        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => setSoPendentes((v) => !v)}
            className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-medium text-card-foreground"
          >
            {soPendentes ? "Mostrar também os já ligados" : "Mostrar só os pendentes"}
          </button>
          <button
            type="button"
            onClick={() => void carregar(local, true)}
            disabled={carregando}
            title="Reler o catálogo e a posição de estoque no Omie"
            className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {aviso ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {aviso}
        </p>
      ) : null}

      {fila && !fila.ok ? (
        <p className="flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {fila.erro}
        </p>
      ) : null}

      {fila?.ok ? (
        <p className="text-sm text-muted-foreground">
          {fila.total} cadastro(s) antigo(s) ATIVOS com saldo neste local se leem como matéria-prima.{" "}
          {fila.decididos} já ligado(s). Mostrando {visiveis.length}.
        </p>
      ) : null}

      {carregando && !fila ? <p className="text-sm text-muted-foreground">Consultando o Omie…</p> : null}

      <ul className="flex flex-col gap-3">
        {visiveis.map((linha) => (
          <Linha
            key={linha.codigo}
            linha={linha}
            opcoes={fila?.opcoes ?? []}
            escolhido={escolhas[linha.codigo] ?? ""}
            salvando={salvando === linha.codigo}
            onEscolher={(codigo) => setEscolhas((atual) => ({ ...atual, [linha.codigo]: codigo }))}
            onConfirmar={(semEquivalente) => void confirmar(linha, semEquivalente)}
            onDesfazer={() => void desfazer(linha)}
          />
        ))}
      </ul>

      {fila?.ok && visiveis.length === 0 ? (
        <p className="rounded-lg border border-border bg-card px-3 py-4 text-sm text-muted-foreground">
          {soPendentes
            ? "Nenhum código antigo pendente neste local. Tudo que tem saldo aqui já está ligado."
            : "Nada bate com a busca."}
        </p>
      ) : null}
    </div>
  );
}

function Linha({
  linha,
  opcoes,
  escolhido,
  salvando,
  onEscolher,
  onConfirmar,
  onDesfazer,
}: {
  linha: LinhaFila;
  opcoes: OpcaoMat[];
  escolhido: string;
  salvando: boolean;
  onEscolher: (codigo: string) => void;
  onConfirmar: (semEquivalente: boolean) => void;
  onDesfazer: () => void;
}) {
  const decidido = linha.decidido;
  const alertas = linha.sugestao.alertas;

  return (
    <li className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-sm font-semibold text-card-foreground">{linha.codigo}</span>
          <span className="ml-2 text-sm text-muted-foreground">{linha.descricao}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          saldo <b className="text-card-foreground">{numero(linha.saldo)}</b>
          {linha.unidade ? ` ${linha.unidade}` : ""}
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{linha.sugestao.motivo}</p>

      {alertas.map((alerta) => (
        <p key={alerta} className="mt-2 flex items-start gap-2 rounded-lg bg-warning-dim px-3 py-2 text-xs text-warning">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {alerta}
        </p>
      ))}

      {decidido ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">
          <Check className="h-3.5 w-3.5 shrink-0" />
          {decidido.codigoNovo ? (
            <span>
              Ligado a <b className="font-mono">{decidido.codigoNovo}</b> (
              {ROTULO_CONFIANCA[decidido.confianca] ?? decidido.confianca})
            </span>
          ) : (
            <span>Marcado como sem equivalente</span>
          )}
          {decidido.confirmadoPor ? <span className="text-muted-foreground">por {decidido.confirmadoPor}</span> : null}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-[18rem] flex-1 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Código novo (MAT)</span>
          <Select value={escolhido} onChange={(e) => onEscolher(e.target.value)} disabled={salvando}>
            <option value="" className="bg-card text-foreground">
              escolher código
            </option>
            {opcoes.map((opcao) => (
              <option key={opcao.codigo} value={opcao.codigo} className="bg-card text-foreground">
                {opcao.codigo} · {opcao.descricao} ({opcao.unidade}){opcao.ambiguo ? " ⚠ cadastro ambíguo" : ""}
              </option>
            ))}
          </Select>
        </label>

        <button
          type="button"
          onClick={() => onConfirmar(false)}
          disabled={salvando}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <Check className="h-4 w-4" />
          {salvando ? "Salvando…" : decidido ? "Atualizar" : "Confirmar"}
        </button>

        <button
          type="button"
          onClick={() => onConfirmar(true)}
          disabled={salvando}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
        >
          <X className="h-4 w-4" />
          Sem equivalente
        </button>

        {decidido ? (
          <button
            type="button"
            onClick={onDesfazer}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
          >
            <Undo2 className="h-4 w-4" />
            Desfazer
          </button>
        ) : null}
      </div>
    </li>
  );
}
