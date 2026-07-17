"use client";

import { Loader2, Search } from "lucide-react";
import { useRef, useState } from "react";

import { buscarProdutosOmie, saldoDoProduto } from "@/app/(app)/requisicoes/actions";
import type { ProdutoResumo } from "@/lib/estoque/omieEstoque";

const inputClass =
  "w-full rounded-lg border border-border bg-field px-3 py-2 text-sm text-card-foreground outline-none focus-visible:border-primary";

// Espera de digitação antes de buscar (evita uma chamada por tecla).
const DEBOUNCE_MS = 350;

interface ProdutoSkuFieldProps {
  value: string;
  descricao?: string;
  onChange: (value: string) => void;
  onPick: (codigo: string, descricao: string) => void;
  index: number;
}

// Campo de código do produto COM busca: o solicitante digita parte da descrição
// (ex.: "cama") ou o código e escolhe na lista (clicar preenche o SKU). Continua
// aceitando um SKU digitado à mão (a Server Action valida contra o Omie no
// envio). Sem useEffect: a busca é agendada no onChange (debounce por ref) e o
// dropdown fecha no blur do container.
export function ProdutoSkuField({ value, descricao, onChange, onPick, index }: ProdutoSkuFieldProps) {
  const [resultados, setResultados] = useState<ProdutoResumo[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ativo, setAtivo] = useState(-1);
  // Saldo do Omie do produto escolhido (mostrado ao lado da descrição).
  const [saldo, setSaldo] = useState<number | null>(null);
  const [saldoSku, setSaldoSku] = useState("");
  const [saldoCarregando, setSaldoCarregando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);
  const saldoReq = useRef(0);

  function limparSaldo() {
    saldoReq.current++;
    setSaldo(null);
    setSaldoSku("");
    setSaldoCarregando(false);
  }

  async function buscar(termo: string) {
    const id = ++reqId.current;
    setCarregando(true);
    setErro(null);
    try {
      const resultado = await buscarProdutosOmie(termo);
      if (reqId.current !== id) return;
      if (resultado.ok) {
        setResultados(resultado.produtos);
        setAberto(true);
        setAtivo(-1);
      } else {
        setResultados([]);
        setErro(resultado.erro ?? "Não consegui buscar.");
        setAberto(true);
      }
    } finally {
      if (reqId.current === id) setCarregando(false);
    }
  }

  function agendarBusca(termo: string) {
    if (timer.current) clearTimeout(timer.current);
    if (termo.trim().length < 2) {
      reqId.current++; // descarta buscas em voo
      setResultados([]);
      setAberto(false);
      setCarregando(false);
      return;
    }
    timer.current = setTimeout(() => buscar(termo), DEBOUNCE_MS);
  }

  async function escolher(produto: ProdutoResumo) {
    onPick(produto.codigo, produto.descricao);
    setAberto(false);
    setResultados([]);
    setAtivo(-1);
    // Saldo do Omie ao lado (best-effort: se falhar, só não mostra o número).
    const id = ++saldoReq.current;
    setSaldoSku(produto.codigo);
    setSaldo(null);
    setSaldoCarregando(true);
    try {
      const resultado = await saldoDoProduto(produto.codigo);
      if (saldoReq.current === id) setSaldo(resultado.ok ? (resultado.saldo ?? null) : null);
    } finally {
      if (saldoReq.current === id) setSaldoCarregando(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!aberto || resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAtivo((a) => (a + 1) % resultados.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setAtivo((a) => (a <= 0 ? resultados.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      // Com a lista aberta, Enter escolhe o item destacado (ou só fecha a lista);
      // nunca envia o formulário sem querer com o termo de busca no lugar do SKU.
      e.preventDefault();
      if (ativo >= 0) escolher(resultados[ativo]);
      else setAberto(false);
    } else if (e.key === "Escape") {
      setAberto(false);
    }
  }

  return (
    <div
      className="relative flex-1"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
      }}
    >
      <div className="relative">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            limparSaldo();
            agendarBusca(e.target.value);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (resultados.length > 0) setAberto(true);
          }}
          placeholder="Busque por nome (ex.: cama) ou código"
          aria-label={`Produto do item ${index + 1}`}
          autoComplete="off"
          className={`${inputClass} pr-8 font-mono`}
        />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
          {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </span>
      </div>

      {descricao ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {descricao}
          {saldoSku === value && (saldoCarregando || saldo !== null) ? (
            <span className="ml-1 font-medium text-card-foreground">
              · estoque no Omie: {saldoCarregando ? "…" : (saldo ?? 0).toLocaleString("pt-BR")}
            </span>
          ) : null}
        </p>
      ) : null}

      {aberto ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
          {erro ? (
            <p className="px-3 py-2 text-sm text-destructive">{erro}</p>
          ) : resultados.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {carregando ? "Buscando…" : "Nenhum produto encontrado."}
            </p>
          ) : (
            <ul>
              {resultados.map((produto, i) => (
                <li key={produto.codigo}>
                  <button
                    type="button"
                    onClick={() => escolher(produto)}
                    className={`flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-muted ${
                      i === ativo ? "bg-muted" : ""
                    }`}
                  >
                    <span className="font-mono text-xs text-card-foreground">{produto.codigo}</span>
                    <span className="text-sm text-card-foreground">{produto.descricao}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
