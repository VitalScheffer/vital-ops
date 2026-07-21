"use client";

import { useState } from "react";

import { ConfiguracaoCard, type ConfiguracaoDaFila } from "@/components/projetos/ConfiguracaoCard";
import { Panel } from "@/components/Panel";

const ABAS = [
  { id: "abertas", label: "Em aberto" },
  { id: "atendidas", label: "Atendidas" },
  { id: "todas", label: "Todas" },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

interface FilaProjetosProps {
  itens: ConfiguracaoDaFila[];
  totalAbertas: number;
  totalFechadas: number;
}

function filtrar(itens: ConfiguracaoDaFila[], aba: AbaId): ConfiguracaoDaFila[] {
  if (aba === "abertas") {
    return itens.filter((item) => item.aberta);
  }
  if (aba === "atendidas") {
    return itens.filter((item) => item.status === "ATENDIDA");
  }
  return itens;
}

// A troca de aba é estado local, não navegação: antes cada clique era uma ida ao
// servidor com as consultas todas de novo, e a tela demorava a responder. Os
// itens das três abas já vêm carregados, então filtrar é instantâneo.
export function FilaProjetos({ itens, totalAbertas, totalFechadas }: FilaProjetosProps) {
  const [aba, setAba] = useState<AbaId>("abertas");

  const visiveis = filtrar(itens, aba);
  const carregados = filtrar(itens, aba).length;
  const total =
    aba === "abertas"
      ? totalAbertas
      : aba === "todas"
        ? totalAbertas + totalFechadas
        : itens.filter((item) => item.status === "ATENDIDA").length;

  const descricao =
    total > carregados
      ? `Mostrando ${carregados} de ${total}. Responda as primeiras para as próximas aparecerem.`
      : aba === "abertas"
        ? "Do pedido mais antigo para o mais novo, para ninguém ficar para trás."
        : "Da resposta mais recente para a mais antiga.";

  return (
    <>
      <nav className="flex flex-wrap gap-2">
        {ABAS.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            onClick={() => setAba(opcao.id)}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              aba === opcao.id
                ? "bg-primary text-primary-foreground"
                : "border border-border text-card-foreground hover:bg-muted"
            }`}
          >
            {opcao.label}
          </button>
        ))}
      </nav>

      <Panel title="Fila" description={descricao}>
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {aba === "abertas"
              ? "Nenhuma configuração aguardando resposta."
              : "Nenhuma configuração nesta lista."}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visiveis.map((item) => (
              <ConfiguracaoCard key={item.id} item={item} />
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
