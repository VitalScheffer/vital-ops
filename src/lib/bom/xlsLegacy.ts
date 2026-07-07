import * as XLSX from "xlsx";

// Leitor de fallback para .xls BINÁRIO ANTIGO (BIFF8 dentro de um contêiner OLE)
// que o SheetJS não consegue abrir e estoura "Slurp error" — caso das BOMs
// exportadas pelo software do CAD. Em vez de depender do parser completo do
// SheetJS (que aborta num registro que não entende), varremos os registros BIFF
// de forma TOLERANTE e extraímos só o que a BOM precisa: as células da primeira
// planilha (Nº / PEÇA / QTD). O framing dos registros (tipo 2 bytes + tamanho 2
// bytes) é íntegro nesses arquivos, então dá pra pular o que não interessa.
//
// IMPORTANTE: roda no NAVEGADOR (a leitura da BOM é client-side). Por isso NADA
// de Buffer/Node — só Uint8Array, DataView e TextDecoder (universais).
//
// Usado só quando o SheetJS falha (ver lerBomDeArquivo). Retorna a grade (linhas
// de valores) igual ao sheet_to_json({header:1}), ou null se não for um BIFF que
// a gente entenda (aí o chamador mostra a mensagem amigável).

const REC_BOF = 0x0809;
const REC_EOF = 0x000a;
const REC_SST = 0x00fc;
const REC_LABELSST = 0x00fd;
const REC_LABEL = 0x0204;
const REC_RK = 0x027e;
const REC_NUMBER = 0x0203;
const REC_MULRK = 0x00bd;

const DOCTYPE_WORKSHEET = 0x0010;

// content do CFB vem como Array<number> (xlsx 0.18.5) ou Uint8Array (versões
// novas). Normaliza para Uint8Array sem copiar quando já é o tipo certo.
function paraUint8(content: ArrayLike<number>): Uint8Array {
  return content instanceof Uint8Array ? content : Uint8Array.from(content);
}

const decLatin1 = new TextDecoder("windows-1252");
const decUtf16 = new TextDecoder("utf-16le");

interface Registro {
  type: number;
  body: Uint8Array;
  view: DataView;
}

type Celula = { r: number; c: number; v: string | number };

function rkParaNumero(rk: number): number {
  const centavos = rk & 1;
  const ehInteiro = rk & 2;
  const val = rk & 0xfffffffc;
  let n: number;
  if (ehInteiro) {
    n = val >> 2;
  } else {
    // val são os 30 bits altos de um double; recompõe em 8 bytes (4 baixos = 0).
    const buf = new ArrayBuffer(8);
    new DataView(buf).setInt32(4, val, true);
    n = new DataView(buf).getFloat64(0, true);
  }
  return centavos ? n / 100 : n;
}

// SST: tabela de strings compartilhadas. Simples de propósito (esses arquivos
// trazem o SST num único registro, sem CONTINUE). Parse tolerante das strings
// Unicode BIFF8; em caso de dúvida, para e devolve o que já leu.
function lerSst(body: Uint8Array): string[] {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const strings: string[] = [];
  let p = 8; // pula cstTotal (4) + cstUnique (4)
  while (p + 3 <= body.length && strings.length < 20000) {
    const cch = dv.getUint16(p, true);
    p += 2;
    const flags = dv.getUint8(p);
    p += 1;
    const highByte = flags & 0x01;
    const temFar = flags & 0x04;
    const temRich = flags & 0x08;
    let cRun = 0;
    let cbExt = 0;
    if (temRich) {
      cRun = dv.getUint16(p, true);
      p += 2;
    }
    if (temFar) {
      cbExt = dv.getInt32(p, true);
      p += 4;
    }
    let s: string;
    if (highByte) {
      s = decUtf16.decode(body.subarray(p, p + cch * 2));
      p += cch * 2;
    } else {
      s = decLatin1.decode(body.subarray(p, p + cch));
      p += cch;
    }
    p += cRun * 4 + Math.max(0, cbExt);
    strings.push(s);
  }
  return strings;
}

function lerRegistros(stream: Uint8Array): Registro[] {
  const dv = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const recs: Registro[] = [];
  let pos = 0;
  while (pos + 4 <= stream.length) {
    const type = dv.getUint16(pos, true);
    const size = dv.getUint16(pos + 2, true);
    if (pos + 4 + size > stream.length) break; // framing rompeu — para em segurança
    const body = stream.subarray(pos + 4, pos + 4 + size);
    recs.push({ type, body, view: new DataView(body.buffer, body.byteOffset, body.byteLength) });
    pos += 4 + size;
  }
  return recs;
}

export function lerXlsLegado(bytes: Uint8Array): unknown[][] | null {
  let recs: Registro[];
  let sst: string[] = [];
  try {
    const cfb = XLSX.CFB.read(bytes, { type: "array" });
    let stream: Uint8Array | undefined;
    for (const entry of cfb.FileIndex) {
      if (/^workbook$|^book$/i.test(entry.name) && entry.content) {
        stream = paraUint8(entry.content as ArrayLike<number>);
        break;
      }
    }
    if (!stream) return null;
    recs = lerRegistros(stream);
    const sstRec = recs.find((r) => r.type === REC_SST);
    if (sstRec) sst = lerSst(sstRec.body);
  } catch {
    return null;
  }

  if (recs.length === 0) return null;

  // Coleta as células só da PRIMEIRA planilha (do primeiro BOF de worksheet até o
  // EOF dele) — assim não misturamos dados de Sheet2/Sheet3.
  const celulas: Celula[] = [];
  let emPrimeiraPlanilha = false;
  let jaProcessouUma = false;

  for (const rec of recs) {
    if (rec.type === REC_BOF) {
      const docType = rec.body.length >= 4 ? rec.view.getUint16(2, true) : 0;
      if (docType === DOCTYPE_WORKSHEET && !jaProcessouUma) emPrimeiraPlanilha = true;
      continue;
    }
    if (rec.type === REC_EOF) {
      if (emPrimeiraPlanilha) {
        emPrimeiraPlanilha = false;
        jaProcessouUma = true;
      }
      continue;
    }
    if (!emPrimeiraPlanilha) continue;

    const b = rec.body;
    const v = rec.view;
    if (rec.type === REC_LABELSST && b.length >= 10) {
      const isst = v.getUint32(6, true);
      celulas.push({ r: v.getUint16(0, true), c: v.getUint16(2, true), v: sst[isst] ?? "" });
    } else if (rec.type === REC_LABEL && b.length >= 9) {
      const cch = v.getUint16(6, true);
      const flags = v.getUint8(8);
      const s =
        flags & 1
          ? decUtf16.decode(b.subarray(9, 9 + cch * 2))
          : decLatin1.decode(b.subarray(9, 9 + cch));
      celulas.push({ r: v.getUint16(0, true), c: v.getUint16(2, true), v: s });
    } else if (rec.type === REC_RK && b.length >= 10) {
      celulas.push({ r: v.getUint16(0, true), c: v.getUint16(2, true), v: rkParaNumero(v.getInt32(6, true)) });
    } else if (rec.type === REC_NUMBER && b.length >= 14) {
      celulas.push({ r: v.getUint16(0, true), c: v.getUint16(2, true), v: v.getFloat64(6, true) });
    } else if (rec.type === REC_MULRK && b.length >= 6) {
      const r = v.getUint16(0, true);
      let c = v.getUint16(2, true);
      let off = 4;
      while (off + 6 <= b.length - 2) {
        celulas.push({ r, c, v: rkParaNumero(v.getInt32(off + 2, true)) });
        off += 6;
        c++;
      }
    }
  }

  if (celulas.length === 0) return null;

  let maxR = 0;
  let maxC = 0;
  for (const cel of celulas) {
    if (cel.r > maxR) maxR = cel.r;
    if (cel.c > maxC) maxC = cel.c;
  }
  // Guarda contra índice absurdo (evita alocar grade gigante).
  if (maxR > 100000 || maxC > 1000) return null;

  const grid: unknown[][] = Array.from({ length: maxR + 1 }, () => Array<unknown>(maxC + 1).fill(""));
  for (const cel of celulas) grid[cel.r][cel.c] = cel.v;
  return grid;
}
