"use client";

import { CheckCircle2, FolderOpen, FolderUp, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent, InputHTMLAttributes } from "react";

interface FolderDropzoneProps {
  totalPdfs: number; // PDFs encontrados na pasta
  reconhecidos: number; // quantos têm código de desenho válido
  folderName: string | null;
  loading?: boolean;
  onFiles: (files: File[]) => void;
}

// `webkitdirectory` faz o seletor de arquivo escolher uma PASTA (recursiva). Não
// está na tipagem padrão do input do React, então injetamos via spread tipado.
const DIR_ATTRS = {
  webkitdirectory: "",
  directory: "",
} as unknown as InputHTMLAttributes<HTMLInputElement>;

function soPdfs(files: File[]): File[] {
  return files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
}

/* ---- leitura recursiva de uma pasta arrastada (entries API) ---- */
function entryParaFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function lerTodasEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const todas: FileSystemEntry[] = [];
    const passo = () =>
      reader.readEntries((lote) => {
        if (lote.length === 0) {
          resolve(todas);
          return;
        }
        todas.push(...lote);
        passo(); // readEntries devolve em lotes; repete até esvaziar
      }, reject);
    passo();
  });
}

async function percorrer(entry: FileSystemEntry, saida: File[]): Promise<void> {
  if (entry.isFile) {
    saida.push(await entryParaFile(entry as FileSystemFileEntry));
  } else if (entry.isDirectory) {
    const filhas = await lerTodasEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const filha of filhas) await percorrer(filha, saida);
  }
}

async function lerDataTransfer(dt: DataTransfer): Promise<File[]> {
  // Os entries têm que ser capturados de forma síncrona, antes de qualquer await.
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  const saida: File[] = [];
  for (const entry of entries) await percorrer(entry, saida);
  if (saida.length === 0 && dt.files.length > 0) return Array.from(dt.files);
  return saida;
}

export function FolderDropzone({
  totalPdfs,
  reconhecidos,
  folderName,
  loading,
  onFiles,
}: FolderDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);

  async function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArrastando(false);
    const files = e.dataTransfer.items?.length
      ? await lerDataTransfer(e.dataTransfer)
      : Array.from(e.dataTransfer.files);
    onFiles(soPdfs(files));
  }

  function handleInput(e: ChangeEvent<HTMLInputElement>) {
    onFiles(soPdfs(Array.from(e.target.files ?? [])));
  }

  const temPasta = folderName != null && totalPdfs > 0;
  const mostrarFormiguinhas = (loading || temPasta) && !arrastando;
  const corFormiguinhas = loading ? "text-primary" : "text-success";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-foreground">Pasta com os desenhos (PDFs)</span>
        <span className="text-xs text-muted-foreground">com subpastas</span>
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
              : temPasta
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
          multiple
          accept="application/pdf"
          className="hidden"
          onChange={handleInput}
          {...DIR_ATTRS}
        />

        {loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-primary">Lendo a pasta...</p>
            <p className="text-xs text-muted-foreground/70">Só um instante</p>
          </>
        ) : temPasta ? (
          <>
            <CheckCircle2 className="h-8 w-8 text-success" />
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <FolderOpen className="h-4 w-4 shrink-0 text-success" />
              <span className="max-w-[260px] truncate">{folderName}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              {totalPdfs} PDF{totalPdfs === 1 ? "" : "s"} na pasta · {reconhecidos} desenho
              {reconhecidos === 1 ? "" : "s"} com código
            </p>
            <p className="text-xs text-primary">clique ou arraste outra pasta para trocar</p>
          </>
        ) : (
          <>
            <FolderUp className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
            <p className="text-sm text-muted-foreground">
              Arraste a pasta aqui ou <span className="font-medium text-primary">clique para escolher</span>
            </p>
            <p className="text-xs text-muted-foreground/70">
              todos os PDFs de dentro dela (e das subpastas) são lidos no seu navegador
            </p>
          </>
        )}
      </div>
    </div>
  );
}
