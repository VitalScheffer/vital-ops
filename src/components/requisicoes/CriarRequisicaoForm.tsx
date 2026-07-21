"use client";

import { Plus, SendHorizonal, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";

import { buscarProdutosOmie, criarRequisicao, saldoDoProduto } from "@/app/(app)/requisicoes/actions";
import { FormFeedback } from "@/components/FormFeedback";
import { ProdutoSkuField } from "@/components/requisicoes/ProdutoSkuField";
import { Select } from "@/components/ui/Select";
import type { Setor } from "@/lib/contracts";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form";

interface CriarRequisicaoFormProps {
  setores: Setor[];
  defaultNome: string;
  // Setor do próprio usuário (membership) — vem pré-selecionado.
  defaultSetorId?: string;
}

interface LinhaItem {
  key: number;
  sku: string;
  // Descrição do produto escolhido na busca (só exibição — some quando o SKU é
  // digitado à mão).
  descricao?: string;
  // Unidade de medida do cadastro do Omie (KG, M3, UN...) — preenchida ao
  // escolher o produto e mostrada travada ao lado da quantidade, pra quem pede
  // saber em que unidade está pedindo. Não vai no payload: o servidor lê a
  // unidade do Omie de novo na criação (o cliente não define esse dado).
  unidade?: string;
  quantidade: string;
}

const inputClass =
  "rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

function novaLinha(key: number): LinhaItem {
  return { key, sku: "", quantidade: "" };
}

function itensValidos(linhas: LinhaItem[]): { sku: string; quantidade: number }[] {
  return linhas
    .map((linha) => ({ sku: linha.sku.trim(), quantidade: Number(linha.quantidade) }))
    .filter((item) => item.sku.length > 0 && Number.isFinite(item.quantidade) && item.quantidade > 0);
}

export function CriarRequisicaoForm({ setores, defaultNome, defaultSetorId }: CriarRequisicaoFormProps) {
  const [state, formAction, pending] = useActionState(criarRequisicao, IDLE_FORM_STATE);
  const [linhas, setLinhas] = useState<LinhaItem[]>([novaLinha(0)]);
  const [proximaKey, setProximaKey] = useState(1);
  const [observacao, setObservacao] = useState("");

  // Reset do carrinho quando a criação dá certo — padrão "ajustar estado
  // durante o render" (React 19), sem useEffect.
  const [ultimoSucesso, setUltimoSucesso] = useState<FormState | null>(null);
  if (state.status === "success" && state !== ultimoSucesso) {
    setUltimoSucesso(state);
    setLinhas([novaLinha(proximaKey)]);
    setProximaKey(proximaKey + 1);
    setObservacao("");
  }

  const itens = itensValidos(linhas);
  const semSetores = setores.length === 0;
  const podeEnviar = itens.length > 0 && !pending && !semSetores;

  const atualizarLinha = (key: number, campo: "sku" | "quantidade", valor: string) => {
    setLinhas((atual) => atual.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  };

  // SKU digitado à mão perde a descrição e a unidade escolhidas (não batem mais
  // com o produto).
  const digitarSku = (key: number, valor: string) => {
    setLinhas((atual) =>
      atual.map((l) => (l.key === key ? { ...l, sku: valor, descricao: undefined, unidade: undefined } : l)),
    );
  };

  const escolherProduto = (key: number, codigo: string, descricao: string, unidade?: string) => {
    setLinhas((atual) => atual.map((l) => (l.key === key ? { ...l, sku: codigo, descricao, unidade } : l)));
  };

  const adicionarLinha = () => {
    setLinhas((atual) => [...atual, novaLinha(proximaKey)]);
    setProximaKey(proximaKey + 1);
  };

  const removerLinha = (key: number) => {
    setLinhas((atual) => (atual.length > 1 ? atual.filter((l) => l.key !== key) : atual));
  };

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="req-nome" className="text-sm font-medium text-card-foreground">
            Quem está pedindo
          </label>
          <input
            id="req-nome"
            name="solicitanteNome"
            required
            defaultValue={defaultNome}
            placeholder="Nome de quem precisa do material"
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="req-setor" className="text-sm font-medium text-card-foreground">
            Setor
          </label>
          {semSetores ? (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Nenhum setor cadastrado ainda. Peça a um Gestor ou Administrador para cadastrar os
              setores na tela <span className="font-medium text-card-foreground">Usuários e setores</span>.
            </p>
          ) : (
            <Select id="req-setor" name="setorId" required defaultValue={defaultSetorId ?? ""}>
              <option className="bg-card text-foreground" value="" disabled>
                Escolha o setor
              </option>
              {setores.map((setor) => (
                <option key={setor.id} className="bg-card text-foreground" value={setor.id}>
                  {setor.nome}
                </option>
              ))}
            </Select>
          )}
        </div>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-card-foreground">Itens do pedido</legend>
        <div className="flex flex-col gap-2">
          {linhas.map((linha, index) => (
            <div key={linha.key} className="flex items-start gap-2">
              <ProdutoSkuField
                value={linha.sku}
                descricao={linha.descricao}
                onChange={(valor) => digitarSku(linha.key, valor)}
                onPick={(codigo, descricao, unidade) =>
                  escolherProduto(linha.key, codigo, descricao, unidade)
                }
                index={index}
                buscar={buscarProdutosOmie}
                saldoDe={saldoDoProduto}
              />
              <input
                value={linha.quantidade}
                onChange={(e) => atualizarLinha(linha.key, "quantidade", e.target.value)}
                type="number"
                min={0}
                step="any"
                placeholder="Qtd"
                aria-label={`Quantidade do item ${index + 1}`}
                className={`${inputClass} w-24`}
              />
              {/* Unidade do Omie: preenchida sozinha e TRAVADA — só informa se o
                  item é pedido em KG, M3, UN... Sem produto escolhido (ou sem
                  unidade no cadastro), fica vazia com um traço. */}
              <input
                value={linha.unidade ?? ""}
                readOnly
                disabled
                tabIndex={-1}
                placeholder="—"
                title="Unidade de medida do cadastro do Omie"
                aria-label={`Unidade de medida do item ${index + 1}`}
                className={`${inputClass} w-16 cursor-not-allowed bg-muted/50 text-center text-muted-foreground`}
              />
              <button
                type="button"
                onClick={() => removerLinha(linha.key)}
                disabled={linhas.length === 1}
                aria-label={`Remover item ${index + 1}`}
                className="rounded-lg border border-border p-2 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={adicionarLinha}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-3 py-1.5 text-sm text-card-foreground transition-colors hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          Adicionar item
        </button>
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="req-obs" className="text-sm font-medium text-card-foreground">
          Observação (opcional)
        </label>
        <textarea
          id="req-obs"
          name="observacao"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Alguma informação extra para o gestor"
          className={inputClass}
        />
      </div>

      {/* Itens serializados — a Server Action valida com zod e contra o Omie. */}
      <input type="hidden" name="itens" value={JSON.stringify(itens)} />

      <FormFeedback state={state} />

      <button
        type="submit"
        disabled={!podeEnviar}
        className="inline-flex items-center justify-center gap-2 self-start rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <SendHorizonal className="h-4 w-4" />
        {pending ? "Enviando…" : "Enviar pedido"}
      </button>
    </form>
  );
}
