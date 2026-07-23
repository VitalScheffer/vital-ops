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
  pintado: { cor: "#d7dade", metal: 0.1, rugosidade: 0.55, configuravel: true },
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
// Cada regra casa pelo CÓDIGO da peça (o prefixo "CREHS PC013" / "COMRZ G3PCF"
// que vem do PDM), que é estável — o resto do nome tem acento e abreviação e
// muda de revisão para revisão. Vale a PRIMEIRA regra que casar, então ordem
// importa: o específico vem antes do genérico.
//
// `chave` é o que o catálogo usa para ligar/desligar a peça.
const PECAS = [
  // Descartes: só encarecem o download e nunca aparecem na prévia.
  { chave: null, codigos: ["COMRT", "COMPA", "COMPC"], nota: "rebites, parafusos e porcas" },
  { chave: null, codigos: ["COMCD"], nota: "corrediças (ficam dentro da gaveta fechada)" },

  // Acessórios que o formulário liga e desliga.
  { chave: "soro", acabamento: "cromado", codigos: ["CREHS PC016"] },
  { chave: "soro", acabamento: "plasticoAzul", codigos: ["COMGC", "COMMR", "COMMP"] },
  { chave: "desfibrilador", acabamento: "cromado", codigos: ["CREHS SM006", "CREHS PC017"] },
  { chave: "desfibrilador", acabamento: "pintado", codigos: ["CREHS PC018"] },
  { chave: "oxigenio", acabamento: "plasticoBranco", codigos: ["CREHS PC013"] },
  { chave: "oxigenio", acabamento: "borracha", codigos: ["COMVL"] },
  { chave: "tabua", acabamento: "pintado", codigos: ["CREHS PC019"] },
  { chave: "tabua", acabamento: "plasticoBranco", codigos: ["CREHS PC020"] },
  { chave: "regua", acabamento: "plasticoPreto", codigos: ["COMRU"] },
  { chave: "trava", acabamento: "pintado", codigos: ["CREHS SM004", "CREHS PC007"] },
  { chave: "trava", acabamento: "latao", codigos: ["COMAD"] },
  { chave: "divisorias", acabamento: "plasticoBranco", codigos: ["CREHS PC021", "CREHS PC022"] },

  // Partes fixas do carro.
  { chave: "tampo", acabamento: "pintado", codigos: ["CREHS PC010"] },
  { chave: "gavetas", acabamento: "pintado", codigos: ["CREHS PC008", "CREHS PC009"] },
  { chave: "gavetao", acabamento: "pintado", codigos: ["CREHS PC011", "CREHS PC012"] },
  { chave: "gavetas", acabamento: "plasticoPreto", codigos: ["COMPX"] },
  { chave: "rodizios", acabamento: "galvanizado", codigos: ["COMRZ", "COMBC"] },
  { chave: "alca", acabamento: "cromado", codigos: ["CREHS PC004", "CREHS PC005"] },
  { chave: "estrutura", acabamento: "pintado", codigos: ["CREHS PC", "CREHS SM", "COMDB"] },
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

function classificar(nomeMalha, nomeNo) {
  const nome = nomeMalha || nomeNo;
  if (!nomeMalha && codigoDe(nomeNo) === ALCA_SEM_NOME) {
    return { chave: "alca", acabamento: "cromado" };
  }
  const codigo = codigoDe(nome);
  for (const regra of PECAS) {
    if (regra.codigos.some((prefixo) => codigo.startsWith(prefixo))) {
      return { chave: regra.chave, acabamento: regra.acabamento };
    }
  }
  return { chave: "estrutura", acabamento: "pintado", desconhecida: nome };
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
  const desconhecidas = new Set();

  function visitar(no) {
    for (const indice of no.meshes ?? []) {
      const malha = lido.meshes[indice];
      const { chave, acabamento, desconhecida } = classificar(malha.name, no.name);
      const triangulos = malha.index.array.length / 3;

      if (chave === null) {
        const codigo = codigoDe(malha.name || no.name);
        descartados.set(codigo, (descartados.get(codigo) ?? 0) + triangulos);
        continue;
      }
      if (desconhecida) desconhecidas.add(desconhecida);

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

  const malhasPorPeca = new Map();
  for (const grupo of [...grupos.values()].sort((a, b) => a.chave.localeCompare(b.chave))) {
    let vertices = 0;
    let indices = 0;
    for (const parte of grupo.partes) {
      vertices += parte.attributes.position.array.length / 3;
      indices += parte.index.array.length;
    }

    const posicoes = new Float32Array(vertices * 3);
    const normais = new Float32Array(vertices * 3);
    const elementos = new Uint32Array(indices);
    let deslocamentoVertice = 0;
    let cursorIndice = 0;

    for (const parte of grupo.partes) {
      const p = parte.attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        posicoes[deslocamentoVertice * 3 + i] = (p[i] + deslocamento[0]) * ESCALA;
        posicoes[deslocamentoVertice * 3 + i + 1] = (p[i + 1] + deslocamento[1]) * ESCALA;
        posicoes[deslocamentoVertice * 3 + i + 2] = (p[i + 2] + deslocamento[2]) * ESCALA;
      }
      normais.set(parte.attributes.normal.array, deslocamentoVertice * 3);
      const ind = parte.index.array;
      for (let i = 0; i < ind.length; i++) {
        elementos[cursorIndice + i] = ind[i] + deslocamentoVertice;
      }
      deslocamentoVertice += p.length / 3;
      cursorIndice += ind.length;
    }

    const primitiva = doc
      .createPrimitive()
      .setAttribute(
        "POSITION",
        doc.createAccessor().setType("VEC3").setArray(posicoes).setBuffer(buffer),
      )
      .setAttribute(
        "NORMAL",
        doc.createAccessor().setType("VEC3").setArray(normais).setBuffer(buffer),
      )
      .setIndices(doc.createAccessor().setType("SCALAR").setArray(elementos).setBuffer(buffer))
      .setMaterial(material(grupo.acabamento));

    const existente = malhasPorPeca.get(grupo.chave);
    if (existente) {
      existente.addPrimitive(primitiva);
    } else {
      malhasPorPeca.set(grupo.chave, doc.createMesh(grupo.chave).addPrimitive(primitiva));
    }
  }

  for (const [chave, malha] of malhasPorPeca) {
    cena.addChild(doc.createNode(`${PREFIXO_PECA}${chave}`).setMesh(malha));
  }

  await MeshoptEncoder.ready;
  await doc.transform(
    dedup(),
    weld(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: "high" }),
  );

  const io = new NodeIO()
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
  if (desconhecidas.size > 0) {
    console.log("\nsem regra própria (caíram em `estrutura`):");
    for (const nome of desconhecidas) console.log(`  ${nome}`);
  }
  const tamanho = fs.statSync(saida).size;
  console.log(`\ngravado ${saida} — ${(tamanho / 1024 / 1024).toFixed(2)} MB`);
  console.log(
    `altura ${(max[1] - min[1]).toFixed(0)} mm, largura ${(max[0] - min[0]).toFixed(0)} mm, profundidade ${(max[2] - min[2]).toFixed(0)} mm`,
  );
}

await principal();
