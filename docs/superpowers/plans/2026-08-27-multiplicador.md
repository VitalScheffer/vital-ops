# Multiplicador de BOMs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, browser-only batch BOM multiplier with QTD and PESO controls and PDF batch printing.

**Architecture:** Client-only library modules locate the BOM headers and update only recognized numeric cells. Spreadsheet files are rewritten by SheetJS; digital PDFs retain their original pages and receive only value overlays. The new page is guarded by the existing Pranchas permission and exposed in the existing navigation.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, SheetJS, pdfjs-dist, pdf-lib.

**Spec:** `docs/superpowers/specs/2026-08-27-multiplicador-design.md`

## Global Constraints

- Process every document locally in the browser; no server upload, database write, or NextStep contract change.
- Accept `.pdf`, `.xls`, `.xlsx`, and `.csv` only.
- A factor must be finite and greater than zero.
- Never change a PDF or spreadsheet when a requested column cannot be unambiguously identified.

---

### Task 1: Build and test numeric normalization and BOM-column discovery

**Files:**
- Create: `src/lib/multiplicador/celulas.ts`
- Create: `src/lib/multiplicador/celulas.test.ts`

**Interfaces:**
- Produces `localizarColunas(cabecalho: unknown[]): ColunasBom`, `multiplicarNumero(valor: unknown, fator: number): number`, and `validarFator(fator: number): void`.

- [ ] **Step 1: Write failing tests** for `"2,50" × 10 = 25`, a QTD/PESO header, and missing selected column errors.
- [ ] **Step 2: Run** `npx vitest run src/lib/multiplicador/celulas.test.ts` **and confirm failures due to the module not existing.**
- [ ] **Step 3: Implement the smallest header and number helpers.**
- [ ] **Step 4: Re-run** `npx vitest run src/lib/multiplicador/celulas.test.ts` **and confirm green.**

### Task 2: Transform spreadsheets while retaining their workbook structure

**Files:**
- Create: `src/lib/multiplicador/planilha.ts`
- Create: `src/lib/multiplicador/planilha.test.ts`

**Interfaces:**
- Consumes `ColunasBom`, `localizarColunas`, and `multiplicarNumero` from `celulas.ts`.
- Produces `multiplicarPlanilha(file: File, opcoes: OpcoesMultiplicacao): Promise<ArquivoGerado>`.

- [ ] **Step 1: Write a failing test** that builds a workbook with QTD/PESO, requests QTD only, reads the generated workbook, and expects QTD to change while PESO and description remain literal originals.
- [ ] **Step 2: Run** `npx vitest run src/lib/multiplicador/planilha.test.ts` **and confirm failure.**
- [ ] **Step 3: Implement reading, header discovery, selected-cell update, and write-back with the original book type.**
- [ ] **Step 4: Re-run** `npx vitest run src/lib/multiplicador/planilha.test.ts` **and confirm green.**

### Task 3: Transform digital PDFs and combine outputs

**Files:**
- Create: `src/lib/multiplicador/pdf.ts`
- Create: `src/lib/multiplicador/pdf.test.ts`

**Interfaces:**
- Consumes text positions from `extrairItensDeTexto` and multiplication helpers.
- Produces `multiplicarPdf(file: File, opcoes: OpcoesMultiplicacao): Promise<ArquivoGerado>` and `juntarPdfsMultiplicados(arquivos: ArquivoGerado[]): Promise<Uint8Array>`.

- [ ] **Step 1: Write failing tests** for a generated one-page PDF with a BOM header and for combining two generated results into two pages.
- [ ] **Step 2: Run** `npx vitest run src/lib/multiplicador/pdf.test.ts` **and confirm failure.**
- [ ] **Step 3: Implement coordinate-based column matching, overlaying only selected numeric values, and PDF combination.**
- [ ] **Step 4: Re-run** `npx vitest run src/lib/multiplicador/pdf.test.ts` **and confirm green.**

### Task 4: Add the protected screen, navigation, and batch interaction

**Files:**
- Create: `src/app/(app)/multiplicador/page.tsx`
- Create: `src/components/multiplicador/MultiplicadorClient.tsx`
- Modify: `src/lib/navigation.ts`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/lib/navigation.test.ts`

**Interfaces:**
- Consumes `multiplicarPlanilha`, `multiplicarPdf`, and `juntarPdfsMultiplicados`.
- Produces the `/multiplicador` page and a `Multiplicador` navigation entry governed by `canViewPranchas`.

- [ ] **Step 1: Write failing navigation test** asserting the Pranchas-authorized user sees `Multiplicador` and an unauthorized role does not.
- [ ] **Step 2: Run** `npx vitest run src/lib/navigation.test.ts` **and confirm failure.**
- [ ] **Step 3: Implement the route guard, navigation icon, file list, per-file factor/toggles, individual downloads, and print-batch download.**
- [ ] **Step 4: Re-run targeted tests and** `npx tsc --noEmit` **to confirm green.**

### Task 5: Publish notes and full verification

**Files:**
- Modify: `src/lib/changelog.ts`
- Modify: `SESSION_LOG.md`

- [ ] **Step 1: Add the short end-user changelog entry for Multiplicador.**
- [ ] **Step 2: Run** `npm test`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- [ ] **Step 3: Append the session report to `SESSION_LOG.md` with commands and validation outcome.**
- [ ] **Step 4: Commit the feature without assistant attribution.**
