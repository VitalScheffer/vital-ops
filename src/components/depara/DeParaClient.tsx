"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  Check,
  PackageX,
  RefreshCw,
  Ruler,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";

import {
  buscarCadastro,
  buscarCodigoNovo,
  carregarFila,
  migrarLegado,
  pendenciasLegado,
  reativarLegado,
  removerDePara,
  salvarDePara,
  type LinhaFila,
  type OpcaoMat,
  type ResultadoFila,
  type ResultadoMigracaoLegado,
  type ResultadoPendencias,
} from "@/app/(app)/de-para/actions";
import { Select } from "@/components/ui/Select";
import { avaliarConversao, formatarFator, quantidadeNoLegado } from "@/lib/depara/conversao";

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
  const [escolhas, setEscolhas] = useState<Record<string, string>>(() => escolhasIniciais(filaInicial.linhas));
  const [fatores, setFatores] = useState<Record<string, string>>(() => fatoresIniciais(filaInicial.linhas));
  const [salvando, setSalvando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Busca direta no catálogo do Omie: o caminho para os cadastros que a fila
  // NÃO mostra (saldo zero em todos os locais, ou descrição que não se lê como
  // matéria-prima). É o que faltava para um PRD02227 poder ser ligado.
  const [termoCadastro, setTermoCadastro] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [encontrados, setEncontrados] = useState<LinhaFila[] | null>(null);

  // Códigos novos achados na busca livre, somados às opções do catálogo MAT.
  const [opcoesExtra, setOpcoesExtra] = useState<OpcaoMat[]>([]);

  // Aposentadoria: o painel e as pendências dele. A carga acontece no CLIQUE
  // que abre o painel, não numa renderização — buscar durante o render seria
  // efeito colateral disfarçado, e em StrictMode roda duas vezes.
  const [aposentando, setAposentando] = useState<string | null>(null);
  const [pendencias, setPendencias] = useState<ResultadoPendencias | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const painelAberto = useRef<string | null>(null);

  const reqId = useRef(0);

  const opcoes = useMemo(() => {
    const vistos = new Set((fila?.opcoes ?? []).map((o) => o.codigo));
    return [...(fila?.opcoes ?? []), ...opcoesExtra.filter((o) => !vistos.has(o.codigo))];
  }, [fila, opcoesExtra]);

  function aplicarLinhas(linhas: LinhaFila[]): void {
    setEscolhas((atual) => ({ ...escolhasIniciais(linhas), ...atual }));
    setFatores((atual) => ({ ...fatoresIniciais(linhas), ...atual }));
  }

  async function carregar(codigoLocal: string, recarregar = false) {
    const id = ++reqId.current;
    setCarregando(true);
    setAviso(null);
    try {
      const resultado = await carregarFila(codigoLocal, recarregar);
      if (reqId.current !== id) return;
      setFila(resultado);
      // Pré-seleciona a sugestão automática em cada linha ainda não decidida.
      setEscolhas(escolhasIniciais(resultado.linhas));
      setFatores(fatoresIniciais(resultado.linhas));
    } finally {
      if (reqId.current === id) setCarregando(false);
    }
  }

  async function procurarCadastro() {
    const termo = termoCadastro.trim();
    if (termo.length < 2) return;
    setBuscando(true);
    setAviso(null);
    try {
      const resultado = await buscarCadastro({ termo, localCodigo: local });
      if (!resultado.ok) {
        setAviso(resultado.erro ?? "Não consegui buscar no Omie.");
        return;
      }
      setEncontrados(resultado.linhas);
      aplicarLinhas(resultado.linhas);
    } finally {
      setBuscando(false);
    }
  }

  async function procurarCodigoNovo(termo: string) {
    const resultado = await buscarCodigoNovo(termo);
    if (!resultado.ok) {
      setAviso(resultado.erro ?? "Não consegui buscar códigos no Omie.");
      return;
    }
    if (resultado.opcoes.length === 0) {
      setAviso(`Nenhum código no padrão novo bate com "${termo}".`);
      return;
    }
    setOpcoesExtra((atual) => {
      const vistos = new Set(atual.map((o) => o.codigo));
      return [...atual, ...resultado.opcoes.filter((o) => !vistos.has(o.codigo))];
    });
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
    const opcao = opcoes.find((o) => o.codigo === escolhido);
    const confianca = semEquivalente
      ? "SEM_EQUIVALENTE"
      : escolhido === linha.sugestao.codigoNovo && linha.sugestao.confianca === "EXATA"
        ? "EXATA"
        : escolhido === linha.sugestao.codigoNovo
          ? "APROXIMADA"
          : "MANUAL";

    const fatorDigitado = Number(String(fatores[linha.codigo] ?? "").replace(",", "."));

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
        fatorConversao: Number.isFinite(fatorDigitado) && fatorDigitado > 0 ? fatorDigitado : null,
      });
      if (!resultado.ok) {
        setAviso(resultado.erro ?? "Não consegui salvar.");
        return;
      }
      setEncontrados(null);
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
      setEncontrados(null);
      await carregar(local);
    } finally {
      setSalvando(null);
    }
  }

  async function reativar(linha: LinhaFila) {
    setSalvando(linha.codigo);
    try {
      const resultado = await reativarLegado({ codigoLegado: linha.codigo });
      if (!resultado.ok) {
        setAviso(resultado.erro ?? "Não consegui reativar.");
        return;
      }
      setEncontrados(null);
      await carregar(local);
    } finally {
      setSalvando(null);
    }
  }

  async function abrirAposentadoria(codigoLegado: string) {
    if (aposentando === codigoLegado) {
      painelAberto.current = null;
      setAposentando(null);
      setPendencias(null);
      return;
    }
    painelAberto.current = codigoLegado;
    setAposentando(codigoLegado);
    setPendencias(null);
    setConferindo(true);
    try {
      const resultado = await pendenciasLegado({ codigoLegado });
      // A pessoa pode ter fechado o painel (ou aberto o de outra linha) enquanto
      // o Omie respondia; encaixar o resultado no painel errado seria mostrar as
      // pendências de um código como se fossem de outro.
      if (painelAberto.current !== codigoLegado) return;
      setPendencias(resultado);
    } finally {
      if (painelAberto.current === codigoLegado) setConferindo(false);
    }
  }

  function propsDaLinha(linha: LinhaFila) {
    return {
      linha,
      opcoes,
      escolhido: escolhas[linha.codigo] ?? "",
      fator: fatores[linha.codigo] ?? "",
      salvando: salvando === linha.codigo,
      aposentando: aposentando === linha.codigo,
      onEscolher: (codigo: string) => setEscolhas((atual) => ({ ...atual, [linha.codigo]: codigo })),
      onFator: (valor: string) => setFatores((atual) => ({ ...atual, [linha.codigo]: valor })),
      onBuscarCodigoNovo: (termo: string) => void procurarCodigoNovo(termo),
      onConfirmar: (semEquivalente: boolean) => void confirmar(linha, semEquivalente),
      onDesfazer: () => void desfazer(linha),
      onReativar: () => void reativar(linha),
      pendencias: aposentando === linha.codigo ? pendencias : null,
      conferindo: aposentando === linha.codigo && conferindo,
      onAposentar: () => void abrirAposentadoria(linha.codigo),
      onMigrou: () => {
        setAposentando(null);
        setEncontrados(null);
        void carregar(local, true);
      },
    };
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
          <span className="text-xs font-medium text-muted-foreground">Filtrar a fila</span>
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

      {/* Busca direta no catálogo. Separada do filtro acima de propósito: uma
          peneira o que já está na tela, a outra vai ao Omie procurar o que a
          fila nunca mostrou. */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
          <Search className="h-4 w-4" />
          Não achou o código na fila? Busque direto no Omie
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A fila lista só o que tem saldo neste local e se lê como matéria-prima. Cadastro zerado em todos os
          locais, ferramenta, componente comprado — nada disso aparece nela. Aqui você procura pelo código
          (PRD02227) ou por parte da descrição e liga o par mesmo assim.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <input
            value={termoCadastro}
            onChange={(e) => setTermoCadastro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void procurarCadastro();
            }}
            placeholder="PRD02227 ou SERRA FITA"
            className={`${inputClass} min-w-[16rem] flex-1`}
          />
          <button
            type="button"
            onClick={() => void procurarCadastro()}
            disabled={buscando || termoCadastro.trim().length < 2}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <Search className="h-4 w-4" />
            {buscando ? "Buscando…" : "Buscar cadastro"}
          </button>
          {encontrados ? (
            <button
              type="button"
              onClick={() => {
                setEncontrados(null);
                setTermoCadastro("");
              }}
              className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground"
            >
              Limpar
            </button>
          ) : null}
        </div>

        {encontrados && encontrados.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhum cadastro no Omie bate com esse código ou descrição.
          </p>
        ) : null}

        {encontrados && encontrados.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-3">
            {encontrados.map((linha) => (
              <Linha key={`busca-${linha.codigo}`} {...propsDaLinha(linha)} />
            ))}
          </ul>
        ) : null}
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
          {fila.aposentados > 0 ? ` ${fila.aposentados} aposentado(s) fora da fila.` : ""}
        </p>
      ) : null}

      {carregando && !fila ? <p className="text-sm text-muted-foreground">Consultando o Omie…</p> : null}

      <ul className="flex flex-col gap-3">
        {visiveis.map((linha) => (
          <Linha key={linha.codigo} {...propsDaLinha(linha)} />
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

function escolhasIniciais(linhas: readonly LinhaFila[]): Record<string, string> {
  return Object.fromEntries(
    linhas.map((linha) => [linha.codigo, linha.decidido?.codigoNovo ?? linha.sugestao.codigoNovo ?? ""]),
  );
}

function fatoresIniciais(linhas: readonly LinhaFila[]): Record<string, string> {
  return Object.fromEntries(
    linhas.map((linha) => [
      linha.codigo,
      linha.decidido?.fatorConversao ? String(linha.decidido.fatorConversao) : "",
    ]),
  );
}

interface LinhaProps {
  linha: LinhaFila;
  opcoes: OpcaoMat[];
  escolhido: string;
  fator: string;
  salvando: boolean;
  aposentando: boolean;
  pendencias: ResultadoPendencias | null;
  conferindo: boolean;
  onEscolher: (codigo: string) => void;
  onFator: (valor: string) => void;
  onBuscarCodigoNovo: (termo: string) => void;
  onConfirmar: (semEquivalente: boolean) => void;
  onDesfazer: () => void;
  onReativar: () => void;
  onAposentar: () => void;
  onMigrou: () => void;
}

function Linha({
  linha,
  opcoes,
  escolhido,
  fator,
  salvando,
  aposentando,
  pendencias,
  conferindo,
  onEscolher,
  onFator,
  onBuscarCodigoNovo,
  onConfirmar,
  onDesfazer,
  onReativar,
  onAposentar,
  onMigrou,
}: LinhaProps) {
  const [termoNovo, setTermoNovo] = useState("");
  const decidido = linha.decidido;
  const alertas = linha.sugestao.alertas;
  const opcao = opcoes.find((o) => o.codigo === escolhido);
  const aposentado = Boolean(decidido?.aposentadoEm);

  return (
    <li className={`rounded-xl border p-4 ${aposentado ? "border-border bg-muted/30" : "border-border bg-card"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-mono text-sm font-semibold text-card-foreground">{linha.codigo}</span>
          <span className="ml-2 text-sm text-muted-foreground">{linha.descricao}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          saldo <b className="text-card-foreground">{numero(linha.saldo)}</b>
          {linha.unidade ? ` ${linha.unidade}` : ""}
          {linha.saldoTotal !== undefined ? (
            <span className="ml-2">
              (todos os locais: <b className="text-card-foreground">{numero(linha.saldoTotal)}</b>)
            </span>
          ) : null}
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
              {decidido.fatorConversao ? (
                <span> · fator {formatarFator(decidido.fatorConversao)}</span>
              ) : null}
            </span>
          ) : (
            <span>Marcado como sem equivalente</span>
          )}
          {decidido.confirmadoPor ? <span className="text-muted-foreground">por {decidido.confirmadoPor}</span> : null}
        </p>
      ) : null}

      {aposentado ? (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          <PackageX className="h-3.5 w-3.5 shrink-0" />
          <span>
            Código antigo <b>aposentado</b>
            {decidido?.aposentadoPor ? ` por ${decidido.aposentadoPor}` : ""}
            {decidido?.saldoMigrado ? ` · ${numero(decidido.saldoMigrado)} migrado(s) para o código novo` : ""}
            {decidido?.inativadoNoOmieEm ? " · inativado no Omie" : " · ainda ATIVO no Omie"}
          </span>
        </p>
      ) : null}

      {!aposentado && !linha.jaNovo ? (
        <>
          <ConversaoCheck
            unidadeLegado={linha.unidade}
            unidadeNovo={opcao?.unidade ?? decidido?.unidadeNovo}
            fator={fator}
            onFator={onFator}
            disabled={salvando}
          />

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="flex min-w-[18rem] flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Código novo</span>
              <Select value={escolhido} onChange={(e) => onEscolher(e.target.value)} disabled={salvando}>
                <option value="" className="bg-card text-foreground">
                  escolher código
                </option>
                {opcoes.map((o) => (
                  <option key={o.codigo} value={o.codigo} className="bg-card text-foreground">
                    {o.codigo} · {o.descricao} ({o.unidade}){o.ambiguo ? " ⚠ cadastro ambíguo" : ""}
                  </option>
                ))}
              </Select>
            </label>

            {/* O seletor lista o catálogo MAT. Um cadastro antigo de ferramenta
                ou de componente comprado tem equivalente no padrão novo que não
                começa com MAT, e sem esta busca ele não aparece em lugar nenhum. */}
            <div className="flex items-end gap-1">
              <input
                value={termoNovo}
                onChange={(e) => setTermoNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && termoNovo.trim().length >= 2) onBuscarCodigoNovo(termoNovo.trim());
                }}
                placeholder="buscar outro código novo"
                className={`${inputClass} w-52 py-1.5 text-xs`}
              />
              <button
                type="button"
                onClick={() => termoNovo.trim().length >= 2 && onBuscarCodigoNovo(termoNovo.trim())}
                disabled={salvando || termoNovo.trim().length < 2}
                title="Procurar no catálogo do Omie e somar às opções acima"
                className="rounded-lg border border-border px-2 py-2 text-muted-foreground disabled:opacity-60"
              >
                <Search className="h-4 w-4" />
              </button>
            </div>

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

            {decidido?.codigoNovo ? (
              <button
                type="button"
                onClick={onAposentar}
                disabled={salvando}
                className="flex items-center gap-2 rounded-lg border border-warning/50 px-3 py-2 text-sm text-warning disabled:opacity-60"
              >
                <PackageX className="h-4 w-4" />
                {aposentando ? "Fechar" : "Aposentar código antigo"}
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {aposentado ? (
        <div className="mt-3">
          <button
            type="button"
            onClick={onReativar}
            disabled={salvando}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground disabled:opacity-60"
          >
            <Undo2 className="h-4 w-4" />
            {salvando ? "Reativando…" : "Reativar aqui"}
          </button>
        </div>
      ) : null}

      {aposentando ? (
        <PainelAposentar
          codigoLegado={linha.codigo}
          dados={pendencias}
          carregando={conferindo}
          onMigrou={onMigrou}
        />
      ) : null}
    </li>
  );
}

/**
 * O "check" de unidade da tela: as duas batem, ou existe um fator?
 *
 * Antes desta caixa, um par em unidades diferentes era salvo sem nada e a
 * conversão virava responsabilidade de quem estivesse movimentando, na mão, em
 * toda OP. O número certo daquele par é sempre o mesmo — ele pertence ao De/Para,
 * e é aqui que ele é decidido, uma vez.
 */
function ConversaoCheck({
  unidadeLegado,
  unidadeNovo,
  fator,
  onFator,
  disabled,
}: {
  unidadeLegado?: string;
  unidadeNovo?: string;
  fator: string;
  onFator: (valor: string) => void;
  disabled: boolean;
}) {
  const numeroFator = Number(String(fator).replace(",", "."));
  const avaliacao = avaliarConversao({
    unidadeLegado,
    unidadeNovo,
    fator: Number.isFinite(numeroFator) && numeroFator > 0 ? numeroFator : null,
  });

  if (avaliacao.situacao === "UNIDADE_DESCONHECIDA") {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">
        <Ruler className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {unidadeNovo ? avaliacao.mensagem : "Escolha o código novo para conferir a unidade."}
      </p>
    );
  }

  if (avaliacao.mesmaUnidade) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg bg-success-dim px-3 py-2 text-xs text-success">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        {avaliacao.mensagem}
      </p>
    );
  }

  const exemplo = quantidadeNoLegado(100, avaliacao);
  const completo = avaliacao.situacao === "COM_FATOR";

  return (
    <div
      className={`mt-3 rounded-lg px-3 py-2 text-xs ${
        completo ? "bg-success-dim text-success" : "bg-warning-dim text-warning"
      }`}
    >
      <p className="flex items-start gap-2">
        {completo ? (
          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        )}
        <span>
          A unidade muda: o novo está em <b>{avaliacao.unidadeNovo}</b> e o antigo em{" "}
          <b>{avaliacao.unidadeLegado}</b>. Sem um fator, a quantidade não se converte sozinha e cada
          movimentação vira uma digitação na mão.
        </span>
      </p>
      <label className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">1 {avaliacao.unidadeNovo} (novo) =</span>
        <input
          value={fator}
          onChange={(e) => onFator(e.target.value)}
          disabled={disabled}
          inputMode="decimal"
          placeholder="0,0000"
          className="w-28 rounded-lg border border-border bg-field px-2 py-1 text-right text-sm text-card-foreground outline-none focus-visible:border-primary"
        />
        <span className="text-muted-foreground">{avaliacao.unidadeLegado} (antigo)</span>
      </label>
      {completo && exemplo !== null ? (
        <p className="mt-2 text-muted-foreground">
          Conferência: 100 {avaliacao.unidadeNovo} pedidos numa OP saem como{" "}
          <b className="text-card-foreground">{numero(exemplo)}</b> {avaliacao.unidadeLegado} do cadastro antigo.
        </p>
      ) : null}
    </div>
  );
}

/**
 * O painel de aposentadoria: o que ainda usa o código, onde o saldo está e o
 * que vai acontecer.
 *
 * As pendências são carregadas antes de qualquer botão de ação aparecer. É a
 * diferença entre "inativei e descobri depois que tinha OP rodando" e uma
 * decisão tomada com a lista na frente.
 */
function PainelAposentar({
  codigoLegado,
  dados,
  carregando,
  onMigrou,
}: {
  codigoLegado: string;
  dados: ResultadoPendencias | null;
  carregando: boolean;
  onMigrou: () => void;
}) {
  const [inativar, setInativar] = useState(false);
  const [ciente, setCiente] = useState(false);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoMigracaoLegado | null>(null);

  async function executar() {
    setExecutando(true);
    setResultado(null);
    try {
      const saida = await migrarLegado({
        codigoLegado,
        inativarNoOmie: inativar,
        confirmaPendencias: ciente,
      });
      setResultado(saida);
      if (saida.aposentado) onMigrou();
    } finally {
      setExecutando(false);
    }
  }

  if (carregando || !dados) {
    return (
      <p className="mt-3 rounded-lg border border-border px-3 py-3 text-xs text-muted-foreground">
        Conferindo saldo, OPs, requisições e pedidos de compra no Omie…
      </p>
    );
  }

  if (!dados.ok) {
    return (
      <p className="mt-3 flex items-center gap-2 rounded-lg bg-danger-dim px-3 py-2 text-xs text-danger">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {dados.erro}
      </p>
    );
  }

  const p = dados.pendencias;
  const totalPendencias = p.ops.length + p.compras.length + p.requisicoes.length;

  return (
    <div className="mt-3 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning-dim/40 p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
        <ArrowRightLeft className="h-4 w-4" />
        Mover tudo de {dados.codigoLegado} para {dados.codigoNovo}
      </h4>

      {dados.conversao ? (
        <p className={`text-xs ${dados.conversao.podeMovimentar ? "text-muted-foreground" : "text-danger"}`}>
          {dados.conversao.mensagem}
        </p>
      ) : null}

      <div>
        <p className="text-xs font-medium text-card-foreground">Saldo a mover, local por local</p>
        {dados.saldos.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Zerado em todos os locais: não há saldo a mover, só a aposentadoria do cadastro.
          </p>
        ) : (
          <ul className="mt-1 flex flex-col gap-1">
            {dados.saldos.map((s) => (
              <li key={s.localCodigo} className="text-xs text-muted-foreground">
                {s.localNome}: <b className="text-card-foreground">{numero(s.saldo)}</b>
                {s.quantidadeNova !== undefined && s.quantidadeNova !== s.saldo ? (
                  <span> → {numero(s.quantidadeNova)} no código novo</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p className="text-xs font-medium text-card-foreground">
          Ainda rodando com este código: {totalPendencias === 0 ? "nada em aberto" : `${totalPendencias} documento(s)`}
        </p>
        {p.ops.map((op) => (
          <p key={`op-${op.numero}`} className="mt-1 text-xs text-warning">
            OP <b>{op.numero}</b> · {numero(op.quantidade)}
            {op.dataPrevisao ? ` · previsão ${op.dataPrevisao}` : ""}
            {op.reservado ? " · já reservado no Omie" : ""}
          </p>
        ))}
        {p.requisicoes.map((req) => (
          <p key={`req-${req.numero}`} className="mt-1 text-xs text-warning">
            Requisição <b>#{req.numero}</b> de {req.solicitante} · {numero(req.quantidade)} · {req.status.toLowerCase()}
          </p>
        ))}
        {p.compras.map((compra, i) => (
          <p key={`compra-${compra.numero}-${i}`} className="mt-1 text-xs text-warning">
            Pedido de compra <b>{compra.numero}</b> · {numero(compra.quantidade)}
            {compra.dataPrevisao ? ` · previsão ${compra.dataPrevisao}` : ""}
          </p>
        ))}
        {p.avisos.map((a) => (
          <p key={a} className="mt-1 text-xs text-danger">
            {a}
          </p>
        ))}
      </div>

      {dados.impedimento ? (
        <p className="flex items-start gap-2 rounded-lg bg-danger-dim px-3 py-2 text-xs text-danger">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {dados.impedimento}
        </p>
      ) : (
        <>
          <label className="flex items-start gap-2 text-xs text-card-foreground">
            <input
              type="checkbox"
              checked={inativar}
              onChange={(e) => setInativar(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
            />
            <span>
              Inativar o cadastro <b>{dados.codigoLegado}</b> no Omie depois de mover o saldo. Isso é escrita no
              ERP e a tela não desfaz: o cadastro some das buscas, dos pedidos e das estruturas novas.
            </span>
          </label>

          {totalPendencias > 0 || p.incompleto ? (
            <label className="flex items-start gap-2 text-xs text-warning">
              <input
                type="checkbox"
                checked={ciente}
                onChange={(e) => setCiente(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span>
                Li a lista acima e quero seguir mesmo com documento em aberto (ou com a conferência incompleta).
              </span>
            </label>
          ) : null}

          <button
            type="button"
            onClick={() => void executar()}
            disabled={executando || ((totalPendencias > 0 || p.incompleto) && !ciente)}
            className="flex w-fit items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            <ArrowRightLeft className="h-4 w-4" />
            {executando
              ? "Movendo…"
              : dados.saldos.length === 0
                ? "Aposentar código antigo"
                : `Mover ${numero(dados.saldoTotal)} e aposentar`}
          </button>
        </>
      )}

      {resultado ? <ResultadoMigracao resultado={resultado} /> : null}
    </div>
  );
}

function ResultadoMigracao({ resultado }: { resultado: ResultadoMigracaoLegado }) {
  if (!resultado.ok) {
    return (
      <p className="flex items-start gap-2 rounded-lg bg-danger-dim px-3 py-2 text-xs text-danger">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        {resultado.erro}
      </p>
    );
  }

  const pendentes = resultado.pendentes ?? 0;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <p className={`text-xs font-semibold ${pendentes > 0 ? "text-warning" : "text-success"}`}>
        {pendentes > 0
          ? `${pendentes} local(is) tiveram a saída lançada e a entrada não. O material está fora dos dois códigos até concluir.`
          : resultado.aposentado
            ? "Saldo migrado e código antigo aposentado."
            : "Migração processada."}
      </p>
      {resultado.avisoInativacao ? (
        <p className="text-xs text-warning">{resultado.avisoInativacao}</p>
      ) : null}
      {resultado.inativadoNoOmie ? (
        <p className="text-xs text-muted-foreground">Cadastro inativado no Omie.</p>
      ) : null}
      {resultado.motivoInterrupcao ? (
        <p className="text-xs text-warning">{resultado.motivoInterrupcao}</p>
      ) : null}
      {resultado.itens.map((item, i) => (
        <p key={`${item.localNome}-${i}`} className="text-xs text-muted-foreground">
          {item.localNome}: {numero(item.quantidadeLegado)} → {numero(item.quantidadeNovo)} ·{" "}
          <b className={item.status === "MIGRADO" ? "text-success" : "text-warning"}>{item.status}</b>
          {item.motivo ? ` · ${item.motivo}` : ""}
        </p>
      ))}
    </div>
  );
}
