// Conversor STEP -> GLB para o visualizador 3D do configurador.
//
// Rode só quando o CAD mudar; o .glb resultante é versionado em
// `public/configurador/3d/`. O navegador NUNCA lê o STEP (8 MB de texto e ~35 s
// de tesselagem); ele baixa o GLB já pronto.
//
//   node scripts/step-para-glb.mjs "C:\caminho\MODELO.STEP" public/configurador/3d/carro-emergencia.glb
//
// O que o script faz, nesta ordem:
// 1. tessela o STEP com OpenCascade (occt-import-js, WASM);
// 2. joga fora o que não se vê (parafuso, rebite, porca, corrediça interna) —
//    é metade dos triângulos do arquivo;
// 3. agrupa cada malha numa PEÇA (ver `PECAS`), que é a unidade que o
//    configurador liga e desliga na tela;
// 4. junta as malhas de cada peça num nó só, nomeado `peca_<chave>`, com um
//    material por acabamento;
// 5. centraliza no chão, converte mm -> m e grava o GLB comprimido (meshopt).
//
// Regra de ouro: o nome do nó no GLB é o contrato com o front (`modelo3d.ts`).
// Renomeou peça aqui, renomeie lá.

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

import { Document, NodeIO } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, weld } from "@gltf-transform/functions";
import { MeshoptEncoder } from "meshoptimizer";

const require = createRequire(import.meta.url);
const occtimportjs = require("occt-import-js");

// --- Acabamentos -----------------------------------------------------------
// Cor em sRGB (como no editor) + parâmetros PBR. `configuravel: true` marca o
// acabamento que o formulário troca conforme o material escolhido (carbono
// pintado x inox); o visualizador acha essas malhas pelo NOME do material.
// Prefixos dos nomes que atravessam para o front. Sem `:` nem `.`: o three.js
// apaga esses caracteres ao carregar o glTF e o nó chegaria com outro nome.
const PREFIXO_PECA = "peca_";
const PREFIXO_ACABAMENTO = "acab_";

const ACABAMENTOS = {
  // Cinza de aço pintado. Era claro demais (#d7dade) e lia como branco; este é
  // um cinza médio neutro, que parece cinza em fundo claro e escuro.
  pintado: { cor: "#9aa0a6", metal: 0.2, rugosidade: 0.5, configuravel: true },
  inox: { cor: "#dfe3e8", metal: 1, rugosidade: 0.24 },
  cromado: { cor: "#e8ecf0", metal: 1, rugosidade: 0.12 },
  galvanizado: { cor: "#aeb4bb", metal: 0.85, rugosidade: 0.38 },
  plasticoPreto: { cor: "#17181c", metal: 0, rugosidade: 0.5 },
  plasticoAzul: { cor: "#0a4ecc", metal: 0, rugosidade: 0.42 },
  plasticoBranco: { cor: "#eceff3", metal: 0, rugosidade: 0.5 },
  borracha: { cor: "#1a1c1f", metal: 0, rugosidade: 0.9 },
  latao: { cor: "#b08d3c", metal: 0.9, rugosidade: 0.35 },
};

// --- Peças -----------------------------------------------------------------
// Duas formas de casar, nesta ordem:
// - `codigos`: prefixo do código do PDM ("COMRZ", "COMAD"). Usado para os itens
//   de catálogo (comprados), cujo código é igual em todos os produtos.
// - `palavras`: o que o nome DIZ ("SORO", "DESFIBRILADOR", "GAVETA"). É o que
//   faz a mesma tabela servir para o carro slim (CREHS), o grande (CREHI) e a
//   maca (MCPDS) — cada projeto numera as peças do seu jeito, mas todos as
//   chamam pelo mesmo nome.
//
// Vale a PRIMEIRA regra que casar, então ordem importa: o específico vem antes
// do genérico ("ESTRUTURA GAVETA" tem de cair em `gavetas`, não em `estrutura`).
//
// `chave` é o que o catálogo usa para ligar/desligar a peça.
const PECAS = [
  // Descartes: só encarecem o download e nunca aparecem na prévia.
  { chave: null, codigos: ["COMRT", "COMPA", "COMPC"], nota: "rebites, parafusos e porcas" },
  { chave: null, codigos: ["COMCD"], nota: "corrediças (ficam dentro da gaveta fechada)" },

  // Itens de catálogo (código igual em qualquer produto).
  { chave: "soro", acabamento: "plasticoAzul", codigos: ["COMGC", "COMMR", "COMMP"] },
  { chave: "regua", acabamento: "plasticoPreto", codigos: ["COMRU"] },
  { chave: "trava", acabamento: "latao", codigos: ["COMAD"] },
  { chave: "gavetas", acabamento: "plasticoPreto", codigos: ["COMPX"] },
  { chave: "rodizios", acabamento: "galvanizado", codigos: ["COMRZ", "COMBC"] },
  { chave: "oxigenio", acabamento: "borracha", codigos: ["COMVL"] },

  // Acessórios que o formulário liga e desliga, pelo nome da peça.
  { chave: "desfibrilador", acabamento: "cromado", palavras: ["DESFIBRILADOR"] },
  { chave: "soro", acabamento: "cromado", palavras: ["SORO"] },
  { chave: "oxigenio", acabamento: "plasticoBranco", palavras: ["CILINDRO", "OXIGENIO"] },
  { chave: "tabua", acabamento: "pintado", palavras: ["TABUA", "MASSAGEM"] },
  { chave: "regua", acabamento: "plasticoPreto", palavras: ["TOMADA"] },
  { chave: "divisorias", acabamento: "plasticoBranco", palavras: ["DIVISORIA"] },
  // Antes da trava: "TRAVA BRAÇO MOVIMENTO" é parte da alça, não da gaveta.
  { chave: "alca", acabamento: "cromado", palavras: ["BRACO MOVIMENTO", "BRACO PARA MOVIMENTO"] },
  { chave: "trava", acabamento: "pintado", palavras: ["TRAVA", "CADEADO"] },

  // Partes fixas, também pelo nome.
  { chave: "gavetao", acabamento: "pintado", palavras: ["GAVETAO"] },
  { chave: "gavetas", acabamento: "pintado", palavras: ["GAVETA"] },
  { chave: "tampo", acabamento: "pintado", palavras: ["TAMPO"] },
  { chave: "rodizios", acabamento: "galvanizado", palavras: ["RODIZIO"] },
  // Maca: o leito é a superfície onde o paciente deita; as grades, laterais.
  { chave: "leito", acabamento: "pintado", palavras: ["LEITO", "COLCHONETE"] },
  { chave: "grades", acabamento: "cromado", palavras: ["GRADE"] },
];

// O braço de movimento (a alça cromada) vem dentro do "CONJUNTO LATERAL DIR."
// como sólidos SEM nome — o STEP só nomeia as peças de chapa. Sem esta exceção
// a alça entraria em `estrutura` e mudaria de cor junto com a pintura.
const ALCA_SEM_NOME = "CREHS SM002";

function codigoDe(nome) {
  // "CREHS PC013 CCPTD R00 - APOIO..." -> "CREHS PC013"
  const partes = nome.trim().split(/\s+/);
  return partes.slice(0, 2).join(" ");
}

// Sem acento e em maiúsculo, para "REFORÇO"/"DIVISÓRIA" casarem escritos de
// qualquer jeito.
function semAcento(texto) {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
}

function classificar(nomeMalha, nomeNo) {
  const nome = nomeMalha || nomeNo;
  if (!nomeMalha && codigoDe(nomeNo) === ALCA_SEM_NOME) {
    return { chave: "alca", acabamento: "cromado" };
  }
  const codigo = codigoDe(nome);
  const limpo = semAcento(nome);
  for (const regra of PECAS) {
    const porCodigo = regra.codigos?.some((prefixo) => codigo.startsWith(prefixo));
    const porPalavra = regra.palavras?.some((palavra) => limpo.includes(palavra));
    if (porCodigo || porPalavra) {
      return { chave: regra.chave, acabamento: regra.acabamento };
    }
  }
  // Sobrou: é chapa/tubo da estrutura. Não é erro — é o caso comum.
  return { chave: "estrutura", acabamento: "pintado" };
}

function sRGBParaLinear(hex) {
  const inteiro = parseInt(hex.slice(1), 16);
  return [16, 8, 0].map((deslocamento) => {
    const canal = ((inteiro >> deslocamento) & 255) / 255;
    return canal <= 0.04045 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4;
  });
}

async function principal() {
  const [entrada, saida] = process.argv.slice(2);
  if (!entrada || !saida) {
    console.error('uso: node scripts/step-para-glb.mjs "<entrada.STEP>" <saida.glb>');
    process.exit(1);
  }

  console.log("lendo", entrada);
  const occt = await occtimportjs();
  const bytes = new Uint8Array(fs.readFileSync(entrada));

  console.time("tesselagem");
  const lido = occt.ReadStepFile(bytes, {
    linearUnit: "millimeter",
    linearDeflectionType: "bounding_box_ratio",
    linearDeflection: 0.002,
    angularDeflection: 0.5,
  });
  console.timeEnd("tesselagem");
  if (!lido.success) {
    throw new Error("OpenCascade não conseguiu ler o STEP.");
  }

  // Junta as malhas por (peça, acabamento). Guardamos os arrays crus e só
  // depois concatenamos, para não realocar a cada instância.
  const grupos = new Map();
  const descartados = new Map();

  function visitar(no) {
    for (const indice of no.meshes ?? []) {
      const malha = lido.meshes[indice];
      const { chave, acabamento } = classificar(malha.name, no.name);
      const triangulos = malha.index.array.length / 3;

      if (chave === null) {
        const codigo = codigoDe(malha.name || no.name);
        descartados.set(codigo, (descartados.get(codigo) ?? 0) + triangulos);
        continue;
      }

      const id = `${chave}|${acabamento}`;
      const grupo = grupos.get(id) ?? { chave, acabamento, partes: [], triangulos: 0 };
      grupo.partes.push(malha);
      grupo.triangulos += triangulos;
      grupos.set(id, grupo);
    }
    for (const filho of no.children ?? []) visitar(filho);
  }
  visitar(lido.root);

  // Caixa envolvente do que SOBROU (o descarte não deve influenciar o
  // enquadramento) para apoiar o modelo no chão e centrar em X/Z.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const grupo of grupos.values()) {
    for (const malha of grupo.partes) {
      const p = malha.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        for (let eixo = 0; eixo < 3; eixo++) {
          if (p[i + eixo] < min[eixo]) min[eixo] = p[i + eixo];
          if (p[i + eixo] > max[eixo]) max[eixo] = p[i + eixo];
        }
      }
    }
  }
  const ESCALA = 0.001; // mm -> m
  const deslocamento = [-(min[0] + max[0]) / 2, -min[1], -(min[2] + max[2]) / 2];

  // --- Montagem do glTF ---
  const doc = new Document();
  const buffer = doc.createBuffer();
  const cena = doc.createScene("modelo");

  const materiais = new Map();
  function material(chaveAcabamento) {
    if (!materiais.has(chaveAcabamento)) {
      const receita = ACABAMENTOS[chaveAcabamento];
      materiais.set(
        chaveAcabamento,
        doc
          .createMaterial(`${PREFIXO_ACABAMENTO}${chaveAcabamento}`)
          .setBaseColorFactor([...sRGBParaLinear(receita.cor), 1])
          .setMetallicFactor(receita.metal)
          .setRoughnessFactor(receita.rugosidade),
      );
    }
    return materiais.get(chaveAcabamento);
  }

  // Um NÓ POR PEÇA (não mais um bloco por chave). Cada peça vira
  // `peca_<chave>__<n>`: o front agrupa pela chave (visibilidade e material) e,
  // com as peças soltas, consegue explodir o modelo e separar cada gaveta. O
  // nome carrega a chave; o `__<n>` só desempata.
  let sequencia = 0;
  for (const grupo of [...grupos.values()].sort((a, b) => a.chave.localeCompare(b.chave))) {
    for (const parte of grupo.partes) {
      const p = parte.attributes.position.array;
      const posicoes = new Float32Array(p.length);
      for (let i = 0; i < p.length; i += 3) {
        posicoes[i] = (p[i] + deslocamento[0]) * ESCALA;
        posicoes[i + 1] = (p[i + 1] + deslocamento[1]) * ESCALA;
        posicoes[i + 2] = (p[i + 2] + deslocamento[2]) * ESCALA;
      }

      const primitiva = doc
        .createPrimitive()
        .setAttribute(
          "POSITION",
          doc.createAccessor().setType("VEC3").setArray(posicoes).setBuffer(buffer),
        )
        .setAttribute(
          "NORMAL",
          doc
            .createAccessor()
            .setType("VEC3")
            .setArray(new Float32Array(parte.attributes.normal.array))
            .setBuffer(buffer),
        )
        .setIndices(
          doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(new Uint32Array(parte.index.array))
            .setBuffer(buffer),
        )
        .setMaterial(material(grupo.acabamento));

      const nome = `${PREFIXO_PECA}${grupo.chave}__${sequencia++}`;
      cena.addChild(doc.createNode(nome).setMesh(doc.createMesh(nome).addPrimitive(primitiva)));
    }
  }

  // O visualizador web usa meshopt (arquivo minúsculo). O model-viewer do AR
  // NÃO decodifica meshopt, então o GLB de AR sai sem compressão — maior, mas
  // é baixado só quando o cliente abre o AR. `AR=1` gera essa variante.
  const paraAr = process.env.AR === "1";

  await MeshoptEncoder.ready;
  await doc.transform(dedup(), weld(), prune(), ...(paraAr ? [] : [meshopt({ encoder: MeshoptEncoder, level: "high" })]));

  const io = paraAr
    ? new NodeIO()
    : new NodeIO()
        .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
        .registerDependencies({ "meshopt.encoder": MeshoptEncoder });

  fs.mkdirSync(path.dirname(saida), { recursive: true });
  await io.write(saida, doc);

  // --- Relatório -------------------------------------------------------------
  const porPeca = new Map();
  for (const grupo of grupos.values()) {
    porPeca.set(grupo.chave, (porPeca.get(grupo.chave) ?? 0) + grupo.triangulos);
  }
  console.log("\npeças no GLB (triângulos):");
  for (const [chave, triangulos] of [...porPeca].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${chave.padEnd(16)} ${triangulos}`);
  }
  const descartadoTotal = [...descartados.values()].reduce((a, b) => a + b, 0);
  console.log(`\ndescartado: ${descartadoTotal} triângulos`);
  for (const [codigo, triangulos] of [...descartados].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${codigo.padEnd(16)} ${triangulos}`);
  }
  const tamanho = fs.statSync(saida).size;
  console.log(`\ngravado ${saida} — ${(tamanho / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `altura ${(max[1] - min[1]).toFixed(0)} mm, largura ${(max[0] - min[0]).toFixed(0)} mm, profundidade ${(max[2] - min[2]).toFixed(0)} mm`,
  );
}

await principal();
