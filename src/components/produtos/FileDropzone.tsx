"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, UploadCloud, X } from "lucide-react";
import { useRef, useState } from "react";
import type { DragEvent } from "react";

interface FileDropzoneProps {
  label: string;
  hint: string;
  accept: string;
  file: File | null;
  onChange: (file: File | null) => void;
  optional?: boolean;
  loading?: boolean;
}

export function FileDropzone({ label, hint, accept, file, onChange, optional, loading }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onChange(dropped);
  }

  // Tracejado girando: enquanto lê (azul) e também com a planilha já colocada
  // (verde), pra ficar sempre visível quando há um arquivo.
  const mostrarFormiguinhas = (loading || !!file) && !arrastando;
  const corFormiguinhas = loading ? "text-primary" : "text-success";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {optional && <span className="text-xs text-muted-foreground">opcional</span>}
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
          mostrarFormiguinhas
            ? `border-transparent ${loading ? "bg-primary/5" : "bg-success-dim"}`
            : arrastando
              ? "border-primary bg-primary/10"
              : file
                ? "border-success bg-success-dim"
                : "border-border bg-card hover:border-primary/50 hover:bg-primary/5"
        }`}
      >
        {mostrarFormiguinhas && (
          <svg aria-hidden="true" className={`pointer-events-none absolute inset-0 h-full w-full ${corFormiguinhas}`}>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              rx="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="7 7"
              className="animate-marching-ants"
            />
          </svg>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />

        {loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-primary">Lendo planilha...</p>
            <p className="text-xs text-muted-foreground/70">Só um instante</p>
          </>
        ) : file ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-success" />
              <span className="max-w-[260px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Remover arquivo"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : (
          <>
            <UploadCloud className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
            <p className="text-sm text-muted-foreground">
              Arraste o arquivo aqui ou <span className="font-medium text-primary">clique para escolher</span>
            </p>
            <p className="text-xs text-muted-foreground/70">{hint}</p>
          </>
        )}
      </div>
    </div>
  );
}
