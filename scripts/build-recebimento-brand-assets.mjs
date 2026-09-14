import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pastaMarca = path.join(raiz, "public", "brand");
const caminhoIcone = path.join(pastaMarca, "vital-icon.png");
const caminhoWordmarkSvg = path.join(pastaMarca, "vital-scheffer-text-white.svg");
const caminhoLockup = path.join(pastaMarca, "vital-scheffer-lockup-white.png");
const caminhoLockupPlanilha = path.join(pastaMarca, "vital-scheffer-lockup-spreadsheet.png");
const caminhoAssetTs = path.join(raiz, "src", "lib", "recebimento", "logoHeaderAsset.ts");
const caminhoAssetPlanilhaTs = path.join(raiz, "src", "lib", "recebimento", "logoSpreadsheetAsset.ts");

// Canvas grande para que o Excel e o pdf-lib reduzam a arte, nunca a ampliem.
// A folga direita impede o recorte da ultima letra do wordmark.
const LARGURA = 840;
const ALTURA = 384;
const ICONE_LARGURA = 312;
const ICONE_ALTURA = 384;
const WORDMARK_X = 320;
const WORDMARK_Y = 80;
const WORDMARK_LARGURA = 520;
const WORDMARK_ALTURA = 296;

// Caixa inteira da celula B1 no XLSX. O logo fica centralizado horizontalmente
// e no centro visual aprovado, sem depender de offsets fracionarios que podem
// ser reinterpretados durante a importacao pelo Google Planilhas.
const PLANILHA_LARGURA = 159;
const PLANILHA_ALTURA = 123;
const PLANILHA_LOGO_LARGURA = 145;
const PLANILHA_LOGO_ALTURA = Math.round(PLANILHA_LOGO_LARGURA * (ALTURA / LARGURA));
const PLANILHA_LOGO_X = Math.round((PLANILHA_LARGURA - PLANILHA_LOGO_LARGURA) / 2);
const PLANILHA_LOGO_Y = 14;

const [iconeOriginal, wordmarkSvg] = await Promise.all([
  sharp(caminhoIcone)
    .resize({ width: ICONE_LARGURA, height: ICONE_ALTURA, fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer(),
  sharp(await readFile(caminhoWordmarkSvg))
    .resize({ width: WORDMARK_LARGURA, height: WORDMARK_ALTURA, fit: "fill" })
    .png()
    .toBuffer(),
]);

const mascaraIcone = await sharp(iconeOriginal).extractChannel("alpha").toBuffer();
const icone = await sharp({
  create: {
    width: ICONE_LARGURA,
    height: ICONE_ALTURA,
    channels: 3,
    background: "#FFFFFF",
  },
})
  .joinChannel(mascaraIcone)
  .png()
  .toBuffer();

const lockup = await sharp({
  create: {
    width: LARGURA,
    height: ALTURA,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([
    { input: icone, left: 0, top: 0 },
    { input: wordmarkSvg, left: WORDMARK_X, top: WORDMARK_Y },
  ])
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(caminhoLockup, lockup);

const lockupPlanilhaReduzido = await sharp(lockup)
  .resize({ width: PLANILHA_LOGO_LARGURA, height: PLANILHA_LOGO_ALTURA, fit: "fill" })
  .png()
  .toBuffer();
const lockupPlanilha = await sharp({
  create: {
    width: PLANILHA_LARGURA,
    height: PLANILHA_ALTURA,
    channels: 4,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  },
})
  .composite([{ input: lockupPlanilhaReduzido, left: PLANILHA_LOGO_X, top: PLANILHA_LOGO_Y }])
  .png({ compressionLevel: 9 })
  .toBuffer();

await writeFile(caminhoLockupPlanilha, lockupPlanilha);

const base64 = lockup.toString("base64");
const conteudoTs =
  `// Gerado por scripts/build-recebimento-brand-assets.mjs. Nao edite manualmente.\n` +
  `// Lockup branco de ${LARGURA} x ${ALTURA}px, com transparencia e proporcao preservada.\n` +
  `export const LOGO_VITAL_SCHEFFER_HEADER_PNG_BASE64 =\n  "${base64}";\n`;

await writeFile(caminhoAssetTs, conteudoTs, "utf8");

const base64Planilha = lockupPlanilha.toString("base64");
const conteudoPlanilhaTs =
  `// Gerado por scripts/build-recebimento-brand-assets.mjs. Nao edite manualmente.\n` +
  `// Caixa transparente de ${PLANILHA_LARGURA} x ${PLANILHA_ALTURA}px para ancoragem inteira em B1.\n` +
  `export const LOGO_VITAL_SCHEFFER_SPREADSHEET_PNG_BASE64 =\n  "${base64Planilha}";\n`;

await writeFile(caminhoAssetPlanilhaTs, conteudoPlanilhaTs, "utf8");

console.log(
  `Marca de Recebimento gerada: ${LARGURA}x${ALTURA}px (${lockup.length} bytes); ` +
    `planilha ${PLANILHA_LARGURA}x${PLANILHA_ALTURA}px (${lockupPlanilha.length} bytes).`,
);
