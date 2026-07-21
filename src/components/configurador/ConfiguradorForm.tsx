"use client";

import { AlertTriangle, CheckCircle2, SendHorizonal } from "lucide-react";
import Image from "next/image";
import { useActionState, useState } from "react";

import { criarConfiguracao } from "@/app/(app)/configurador/actions";
import { FormFeedback } from "@/components/FormFeedback";
import type { ProdutoCatalogo } from "@/lib/configurador/catalogo";
import {
  escolhasPadrao,
  foraDoPadrao,
  montarCodigo,
  resolverSelecoes,
  TEXTO_LIVRE_MAX,
  type EscolhaBruta,
} from "@/lib/configurador/codigo";
import { IDLE_FORM_STATE, type FormState } from "@/lib/form";

const inputClass =
  "w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

const OBSERVACOES_MAX = 1000;

interface ConfiguradorFormProps {
  produto: ProdutoCatalogo;
}

// Formulário do configurador. Renderiza o produto INTEIRO a partir do catálogo —
// nenhuma opção da maca está escrita aqui; trocar/incluir produto é mexer só em
// `catalogo.ts`. A prévia (código e desvios) usa as MESMAS funções puras que a
// Server Action usa para valer, então o que o vendedor vê é o que é gravado.
export function ConfiguradorForm({ produto }: ConfiguradorFormProps) {
  const [state, formAction, pending] = useActionState(criarConfiguracao, IDLE_FORM_STATE);
  const [escolhas, setEscolhas] = useState<Record<string, EscolhaBruta>>(() =>
    escolhasPadrao(produto),
  );
  const [observacoes, setObservacoes] = useState("");

  // Volta ao modelo padrão quando o envio dá certo (React 19: ajuste de estado
  // durante o render, sem useEffect).
  const [ultimoSucesso, setUltimoSucesso] = useState<FormState | null>(null);
  if (state.status === "success" && state !== ultimoSucesso) {
    setUltimoSucesso(state);
    setEscolhas(escolhasPadrao(produto));
    setObservacoes("");
  }

  function escolher(grupoCodigo: string, opcaoCodigo: string) {
    setEscolhas((atual) => {
      // Trocar de opção descarta o texto livre da anterior (o "200 kg" não faz
      // sentido depois de voltar para "120 kg").
      const mesmaOpcao = atual[grupoCodigo]?.opcao === opcaoCodigo;
      return {
        ...atual,
        [grupoCodigo]: { opcao: opcaoCodigo, texto: mesmaOpcao ? atual[grupoCodigo]?.texto : "" },
      };
    });
  }

  function mudarTexto(grupoCodigo: string, texto: string) {
    setEscolhas((atual) => {
      const escolha = atual[grupoCodigo];
      if (!escolha) return atual;
      return { ...atual, [grupoCodigo]: { ...escolha, texto } };
    });
  }

  const resolucao = resolverSelecoes(produto, escolhas);
  const selecoes = resolucao.ok ? resolucao.selecoes : [];
  const desvios = foraDoPadrao(selecoes);
  const codigo = resolucao.ok ? montarCodigo(produto, selecoes) : null;

  const payload = Object.entries(escolhas)
    .filter(([, escolha]) => Boolean(escolha?.opcao))
    .map(([grupo, escolha]) => ({
      grupo,
      opcao: escolha.opcao,
      texto: escolha.texto?.trim() || undefined,
    }));

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input type="hidden" name="produtoSlug" value={produto.slug} />
      <input type="hidden" name="escolhas" value={JSON.stringify(payload)} />
      <input type="hidden" name="observacoes" value={observacoes} />

      <div className="flex flex-col gap-6">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <Image
            src={produto.imagem}
            alt={`Foto de referência: ${produto.nome}`}
            width={produto.imagemLargura}
            height={produto.imagemAltura}
            className="h-auto w-full bg-white object-contain"
            priority
          />
          <p className="border-t border-border px-4 py-3 text-sm text-muted-foreground">
            {produto.descricao}
          </p>
        </div>

        {produto.grupos.map((grupo) => {
          const escolhido = escolhas[grupo.codigo]?.opcao;
          const opcaoEscolhida = grupo.opcoes.find((opcao) => opcao.codigo === escolhido);
          return (
            <fieldset key={grupo.codigo} className="rounded-xl border border-border bg-card p-4">
              <legend className="px-1 text-sm font-semibold text-card-foreground">
                {grupo.rotulo}
              </legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {grupo.opcoes.map((opcao) => {
                  const marcado = escolhido === opcao.codigo;
                  return (
                    <label
                      key={opcao.codigo}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                        marcado
                          ? "border-primary bg-primary/5 text-card-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`grupo__${grupo.codigo}`}
                        value={opcao.codigo}
                        checked={marcado}
                        onChange={() => escolher(grupo.codigo, opcao.codigo)}
                        className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                      />
                      <span>{opcao.rotulo}</span>
                      {opcao.padrao && (
                        <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          padrão
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {opcaoEscolhida?.exigeTexto && (
                <div className="mt-3">
                  <label className="text-xs font-medium text-muted-foreground">
                    {opcaoEscolhida.textoRotulo ?? "Informe o valor"}
                    <input
                      type="text"
                      value={escolhas[grupo.codigo]?.texto ?? ""}
                      onChange={(evento) => mudarTexto(grupo.codigo, evento.target.value)}
                      placeholder={opcaoEscolhida.textoPlaceholder}
                      maxLength={TEXTO_LIVRE_MAX}
                      className={`mt-1 ${inputClass}`}
                    />
                  </label>
                </div>
              )}
            </fieldset>
          );
        })}

        <div className="rounded-xl border border-border bg-card p-4">
          <label className="text-sm font-semibold text-card-foreground">
            Observações adicionais
            <p className="mt-1 text-xs font-normal text-muted-foreground">
              Algo que o cliente pediu e não está nas opções acima. Opcional.
            </p>
            <textarea
              value={observacoes}
              onChange={(evento) => setObservacoes(evento.target.value)}
              rows={4}
              maxLength={OBSERVACOES_MAX}
              placeholder="Ex.: cliente pediu pintura em cor específica."
              className={`mt-2 ${inputClass}`}
            />
          </label>
        </div>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:sticky lg:top-20">
        <div>
          <h2 className="text-sm font-semibold text-card-foreground">Resumo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Código gerado a partir das opções marcadas. Combinações iguais geram o mesmo código.
          </p>
          <p className="mt-2 break-all rounded-lg bg-muted px-3 py-2 font-mono text-xs text-card-foreground">
            {codigo ?? "Complete as opções para gerar o código."}
          </p>
        </div>

        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-card-foreground">
            {desvios.length === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-success" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-warning" />
            )}
            Fora do padrão
          </h3>
          {desvios.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Tudo igual ao modelo da foto.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {desvios.map((desvio) => (
                <li key={desvio.grupoCodigo} className="text-xs text-card-foreground">
                  <span className="text-muted-foreground">{desvio.grupoRotulo}:</span>{" "}
                  {desvio.texto ? `${desvio.opcaoRotulo} (${desvio.texto})` : desvio.opcaoRotulo}
                </li>
              ))}
            </ul>
          )}
        </div>

        {!resolucao.ok && (
          <p className="rounded-lg bg-danger-dim px-3 py-2 text-xs text-danger">{resolucao.erro}</p>
        )}

        <FormFeedback state={state} />

        <button
          type="submit"
          disabled={pending || !resolucao.ok}
          className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendHorizonal className="h-4 w-4" />
          {pending ? "Enviando..." : "Enviar para Projetos"}
        </button>
      </aside>
    </form>
  );
}
