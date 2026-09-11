"use client";

import { FileDown, FileSpreadsheet, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  adicionarItemRecebimento,
  criarNotaRecebimento,
  editarNotaRecebimento,
  marcarCheckRecebimento,
  marcarColunaRecebimento,
  removerItemRecebimento,
  removerNotaRecebimento,
} from "@/app/(app)/recebimento/actions";
import { Panel } from "@/components/Panel";
import { baixarBlob } from "@/lib/bom/download";
import { RECEBIMENTO_EVENTOS, type ItemRecebimentoDTO, type NotaRecebimentoDTO, type RecebimentoEvento } from "@/lib/contracts";
import { nomeArquivoRecebimento } from "@/lib/recebimento/nomeArquivo";
import { gerarRecebimentoPdf } from "@/lib/recebimento/pdf";
import { gerarRecebimentoXlsx } from "@/lib/recebimento/planilha";
import { dataEmissaoSaoPaulo, dataEmissaoSaoPauloDoIso, hojeSaoPaulo } from "@/lib/recebimento/dataEmissao";
import { agruparPorSemana } from "@/lib/recebimento/semanas";

const EVENTO_LABEL: Record<RecebimentoEvento, string> = {
  materialRecebido: "Material recebido",
  temOC: "Tem OC",
  ocAprovado: "OC Aprovado",
  nfeLancada: "NF-e lançada",
};

const EVENTO_CURTO: Record<RecebimentoEvento, string> = {
  materialRecebido: "Material",
  temOC: "Tem OC",
  ocAprovado: "OC Aprov.",
  nfeLancada: "NF-e",
};

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";
const botaoSecundario =
  "inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-card-foreground transition-colors hover:bg-muted disabled:opacity-60";
const botaoPrimario =
  "inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60";
const botaoPerigo =
  "inline-flex items-center gap-1.5 rounded-lg bg-danger px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50";

function hojeISO(): string {
  return hojeSaoPaulo();
}

function dataBr(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(dataEmissaoSaoPauloDoIso(iso));
}

interface RecebimentoClientProps {
  notasIniciais: NotaRecebimentoDTO[];
}

// Tela de checklist manual (sem integração com o Omie): quem marca é o
// próprio usuário. Notas ficam em `useState` e todas as mutações atualizam o
// estado local direto (otimista nos checkboxes) — não dependemos do
// `revalidatePath` da action pra a UI refletir a mudança na hora.
export function RecebimentoClient({ notasIniciais }: RecebimentoClientProps) {
  const [notas, setNotas] = useState(notasIniciais);
  const [pending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);

  const [novoNumero, setNovoNumero] = useState("");
  const [novoFornecedor, setNovoFornecedor] = useState("");
  const [novaData, setNovaData] = useState(hojeISO());

  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edNumero, setEdNumero] = useState("");
  const [edFornecedor, setEdFornecedor] = useState("");
  const [edData, setEdData] = useState("");

  const [novoProduto, setNovoProduto] = useState<Record<string, string>>({});
  const [confirmando, setConfirmando] = useState<string | null>(null);

  const grupos = useMemo(() => {
    return agruparPorSemana(notas, (nota) => dataEmissaoSaoPauloDoIso(nota.dataEmissao)).map((grupo) => ({
      ...grupo,
      itens: [...grupo.itens].sort((a, b) => new Date(b.dataEmissao).getTime() - new Date(a.dataEmissao).getTime()),
    }));
  }, [notas]);

  function criar() {
    if (!novoNumero.trim() || !novoFornecedor.trim() || !novaData) {
      setErro("Preencha número, fornecedor e data da NF.");
      return;
    }
    setErro(null);
    startTransition(async () => {
      const resultado = await criarNotaRecebimento({
        numero: novoNumero.trim(),
        fornecedor: novoFornecedor.trim(),
        dataEmissao: novaData,
      });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui criar a NF.");
        return;
      }
      setNotas((atual) => [...atual, resultado.nota]);
      setNovoNumero("");
      setNovoFornecedor("");
      setNovaData(hojeISO());
    });
  }

  function iniciarEdicao(nota: NotaRecebimentoDTO) {
    setEditandoId(nota.id);
    setEdNumero(nota.numero);
    setEdFornecedor(nota.fornecedor);
    setEdData(dataEmissaoSaoPauloDoIso(nota.dataEmissao).toISOString().slice(0, 10));
    setErro(null);
  }

  function salvarEdicao() {
    if (!editandoId) return;
    if (!edNumero.trim() || !edFornecedor.trim() || !edData) {
      setErro("Preencha número, fornecedor e data da NF.");
      return;
    }
    const id = editandoId;
    const numero = edNumero.trim();
    const fornecedor = edFornecedor.trim();
    setErro(null);
    startTransition(async () => {
      const resultado = await editarNotaRecebimento({ id, numero, fornecedor, dataEmissao: edData });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui salvar a NF.");
        return;
      }
      setNotas((atual) =>
        atual.map((n) => (n.id === id ? { ...n, numero, fornecedor, dataEmissao: dataEmissaoSaoPaulo(edData).toISOString() } : n)),
      );
      setEditandoId(null);
    });
  }

  function removerNota(id: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await removerNotaRecebimento({ id });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui remover a NF.");
        return;
      }
      setNotas((atual) => atual.filter((n) => n.id !== id));
      setConfirmando(null);
    });
  }

  function adicionarProduto(notaId: string) {
    const produto = (novoProduto[notaId] ?? "").trim();
    if (!produto) return;
    setErro(null);
    startTransition(async () => {
      const resultado = await adicionarItemRecebimento({ notaId, produto });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui adicionar o produto.");
        return;
      }
      setNotas((atual) => atual.map((n) => (n.id === notaId ? { ...n, itens: [...n.itens, resultado.item] } : n)));
      setNovoProduto((atual) => ({ ...atual, [notaId]: "" }));
    });
  }

  function removerProduto(notaId: string, itemId: string) {
    setErro(null);
    startTransition(async () => {
      const resultado = await removerItemRecebimento({ id: itemId });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui remover o produto.");
        return;
      }
      setNotas((atual) => atual.map((n) => (n.id === notaId ? { ...n, itens: n.itens.filter((i) => i.id !== itemId) } : n)));
      setConfirmando(null);
    });
  }

  // Otimista: muda na hora e só desfaz se a action falhar — é o comportamento
  // esperado de um checklist (marcação rápida, produto a produto).
  function alternarCheck(notaId: string, item: ItemRecebimentoDTO, evento: RecebimentoEvento, marcado: boolean) {
    setNotas((atual) =>
      atual.map((n) => (n.id !== notaId ? n : { ...n, itens: n.itens.map((i) => (i.id === item.id ? { ...i, [evento]: marcado } : i)) })),
    );
    startTransition(async () => {
      const resultado = await marcarCheckRecebimento({ itemId: item.id, evento, marcado });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui salvar a marcação.");
        setNotas((atual) =>
          atual.map((n) =>
            n.id !== notaId ? n : { ...n, itens: n.itens.map((i) => (i.id === item.id ? { ...i, [evento]: !marcado } : i)) },
          ),
        );
      }
    });
  }

  function alternarColuna(notaId: string, evento: RecebimentoEvento, marcado: boolean) {
    setNotas((atual) => atual.map((n) => (n.id !== notaId ? n : { ...n, itens: n.itens.map((i) => ({ ...i, [evento]: marcado })) })));
    startTransition(async () => {
      const resultado = await marcarColunaRecebimento({ notaId, evento, marcado });
      if (resultado.status === "error") {
        setErro(resultado.message ?? "Não consegui salvar a marcação.");
      }
    });
  }

  function exportar(formato: "xlsx" | "pdf") {
    const dados = notas.map((n) => ({
      numero: n.numero,
      fornecedor: n.fornecedor,
      dataEmissao: dataEmissaoSaoPauloDoIso(n.dataEmissao),
      itens: n.itens,
    }));
    const extraidoEm = new Date();
    const geradoEm = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short",
      timeZone: "America/Sao_Paulo",
    }).format(extraidoEm);
    const nomeArquivo = nomeArquivoRecebimento(
      notas.map((nota) => nota.numero),
      extraidoEm,
      formato,
    );
    startTransition(async () => {
      if (formato === "xlsx") {
        const bytes = await gerarRecebimentoXlsx(dados, geradoEm);
        baixarBlob(
          new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
          nomeArquivo,
        );
        return;
      }
      const bytes = await gerarRecebimentoPdf(dados, geradoEm);
      baixarBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), nomeArquivo);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <Panel
        title="Nova NF"
        description="Informe o número, o fornecedor e a data de emissão para começar o checklist desta nota."
      >
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Nº da NF
            <input value={novoNumero} onChange={(e) => setNovoNumero(e.target.value)} className={inputClass} placeholder="Ex.: 12345" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Fornecedor
            <input
              value={novoFornecedor}
              onChange={(e) => setNovoFornecedor(e.target.value)}
              className={inputClass}
              placeholder="Nome do fornecedor"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Data de emissão
            <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className={inputClass} />
          </label>
          <button type="button" onClick={criar} disabled={pending} className={botaoPrimario}>
            <Plus className="h-4 w-4" /> Adicionar NF
          </button>
        </div>
      </Panel>

      <Panel
        title={`Notas (${notas.length})`}
        description="Marque produto a produto o que já foi recebido, tem OC, teve a OC aprovada e teve a NF-e lançada — agrupado por semana."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={() => exportar("xlsx")} disabled={notas.length === 0 || pending} className={botaoSecundario}>
              <FileSpreadsheet className="h-3.5 w-3.5" /> Exportar Excel
            </button>
            <button type="button" onClick={() => exportar("pdf")} disabled={notas.length === 0 || pending} className={botaoSecundario}>
              <FileDown className="h-3.5 w-3.5" /> Exportar PDF
            </button>
          </div>
        }
      >
        {erro ? <p className="mb-4 rounded-lg bg-danger-dim px-3 py-2 text-sm text-danger">{erro}</p> : null}

        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma NF registrada ainda. Adicione a primeira acima.</p>
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map((grupo) => (
              <section key={grupo.chave} className="flex flex-col gap-4">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{grupo.rotulo}</h3>
                {grupo.itens.map((nota) => (
                  <div key={nota.id} className="rounded-xl border border-border bg-card p-4">
                    {editandoId === nota.id ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Nº da NF
                          <input value={edNumero} onChange={(e) => setEdNumero(e.target.value)} className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Fornecedor
                          <input value={edFornecedor} onChange={(e) => setEdFornecedor(e.target.value)} className={inputClass} />
                        </label>
                        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                          Data de emissão
                          <input type="date" value={edData} onChange={(e) => setEdData(e.target.value)} className={inputClass} />
                        </label>
                        <button type="button" onClick={salvarEdicao} disabled={pending} className={botaoPrimario}>
                          Salvar
                        </button>
                        <button type="button" onClick={() => setEditandoId(null)} className={botaoSecundario}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap gap-x-6 gap-y-1">
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Nº da NF</p>
                            <p className="text-sm font-semibold text-card-foreground">{nota.numero}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Fornecedor</p>
                            <p className="text-sm font-semibold text-card-foreground">{nota.fornecedor}</p>
                          </div>
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Data de emissão
                            </p>
                            <p className="text-sm font-semibold text-card-foreground">{dataBr(nota.dataEmissao)}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => iniciarEdicao(nota)} className={botaoSecundario}>
                            <Pencil className="h-3.5 w-3.5" /> Editar
                          </button>
                          {confirmando === `nota:${nota.id}` ? (
                            <>
                              <button type="button" onClick={() => removerNota(nota.id)} disabled={pending} className={botaoPerigo}>
                                <Trash2 className="h-3.5 w-3.5" /> {pending ? "Removendo…" : "Confirmar"}
                              </button>
                              <button type="button" onClick={() => setConfirmando(null)} className={botaoSecundario}>
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button type="button" onClick={() => setConfirmando(`nota:${nota.id}`)} className={botaoSecundario}>
                              <Trash2 className="h-3.5 w-3.5" /> Remover NF
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[640px] text-sm">
                        <thead>
                          <tr className="border-b border-border bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-2.5 font-medium">Produto</th>
                            {RECEBIMENTO_EVENTOS.map((evento) => {
                              const total = nota.itens.length;
                              const marcados = nota.itens.filter((i) => i[evento]).length;
                              const todosMarcados = total > 0 && marcados === total;
                              return (
                                <th key={evento} className="px-4 py-2.5 text-center font-medium">
                                  <span className="flex flex-col items-center gap-1.5">
                                    {EVENTO_CURTO[evento]}
                                    <input
                                      type="checkbox"
                                      checked={todosMarcados}
                                      disabled={total === 0}
                                      onChange={(e) => alternarColuna(nota.id, evento, e.target.checked)}
                                      aria-label={`Marcar/desmarcar todos: ${EVENTO_LABEL[evento]}`}
                                      title={`Marcar/desmarcar todos: ${EVENTO_LABEL[evento]}`}
                                      className="h-4 w-4 cursor-pointer accent-primary"
                                    />
                                  </span>
                                </th>
                              );
                            })}
                            <th className="w-10 px-4 py-2.5"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {nota.itens.map((item) => (
                            <tr key={item.id} className="border-b border-border/60 last:border-0">
                              <td className="px-4 py-3 font-medium text-card-foreground">{item.produto}</td>
                              {RECEBIMENTO_EVENTOS.map((evento) => (
                                <td key={evento} className="px-4 py-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={item[evento]}
                                    onChange={(e) => alternarCheck(nota.id, item, evento, e.target.checked)}
                                    aria-label={`${EVENTO_LABEL[evento]} — ${item.produto}`}
                                    className="h-4 w-4 cursor-pointer accent-primary"
                                  />
                                </td>
                              ))}
                              <td className="px-4 py-3 text-center">
                                {confirmando === `item:${item.id}` ? (
                                  <button
                                    type="button"
                                    onClick={() => removerProduto(nota.id, item.id)}
                                    title="Confirmar exclusão do produto"
                                    className="text-danger hover:opacity-80"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmando(`item:${item.id}`)}
                                    title="Remover produto"
                                    className="text-muted-foreground hover:text-danger"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {nota.itens.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum produto ainda.</p>
                      ) : null}
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <input
                        value={novoProduto[nota.id] ?? ""}
                        onChange={(e) => setNovoProduto((atual) => ({ ...atual, [nota.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            adicionarProduto(nota.id);
                          }
                        }}
                        placeholder="Nome do produto"
                        className={`${inputClass} flex-1`}
                      />
                      <button type="button" onClick={() => adicionarProduto(nota.id)} disabled={pending} className={botaoSecundario}>
                        <Plus className="h-3.5 w-3.5" /> Produto
                      </button>
                    </div>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
