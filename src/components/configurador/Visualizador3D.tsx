"use client";

import {
  Check,
  Eye,
  EyeOff,
  Layers,
  Link2,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Ruler,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  acabamentoDaPeca,
  mudanca,
  type Destaque,
  type Estado3d,
  type TipoDestaque,
} from "@/lib/configurador/modelo3d";
import { QUALIDADES, type Qualidade } from "@/lib/configurador/qualidade";

// Visualizador do modelo 3D do produto. Carrega UM arquivo com todas as peças e
// obedece ao `Estado3d`: apaga a peça que a escolha não pede e troca o material
// das peças pintáveis. Trocar de opção não recarrega nada — por isso a resposta
// é imediata.
//
// Este componente é pesado (three.js) e só entra na página pelo `next/dynamic`
// do `PreviewProduto`, com `ssr: false`: sem WebGL no servidor e sem custo para
// quem nunca abre o configurador.
//
// O React não toca em nada da cena: o efeito de montagem devolve um punhado de
// COMANDOS e é só isso que os outros efeitos e os botões chamam. Mexer nos
// objetos do three direto do render é o caminho curto para cena e tela saírem
// de sincronia.

// Contrato com `scripts/step-para-glb.mjs`: nó de peça e material configurável.
const PREFIXO_PECA = "peca_";
const MATERIAL_CONFIGURAVEL = "acab_pintado";

// Inox escovado. É o único material que o front cria: o resto da aparência vem
// do CAD, mas este muda com a escolha do vendedor e por isso mora aqui. Metal
// PARCIAL de propósito (0.5, não 1): metal puro não tem cor própria e fica
// escuro onde reflete tom fraco; a base difusa clara é o que mantém o prata
// aparente mesmo nas faces sem brilho direto — assim o inox lê mais claro que
// o carbono, como aço polido de verdade.
const INOX = { cor: 0xe6eaee, metalico: 0.5, rugosidade: 0.3 };

// Fundo de estúdio (lightbox): claro no centro, escurecendo nas bordas, para
// dar volume e destacar o contorno do produto. Fixo nos dois temas de
// propósito — é o backdrop de uma foto de produto, não parte da interface.
const FUNDO_ESTUDIO = "radial-gradient(circle at 50% 38%, #f3f5f6 0%, #c8ced3 100%)";

// Receita de cada nível de qualidade. "Padrão" reproduz o visual leve de sempre
// (uma luz e reflexo cheio — é o que já estava no ar). "Alta" e "Máxima" baixam
// a exposição e o reflexo (para o cinza aparecer em vez de estourar), acendem
// luz de preenchimento e contraluz (dão volume) e trocam o borrão do chão por
// sombra projetada de verdade. "Máxima" ainda desenha em resolução cheia e com
// sombra mais definida — as bordas ficam mais limpas.
interface Receita {
  exposicao: number; // toneMappingExposure
  reflexo: number; // scene.environmentIntensity
  chave: number; // luz principal
  preenchimento: number; // luz de preenchimento (mata sombra dura)
  contra: number; // contraluz (separa do fundo)
  ambiente: number; // luz ambiente chapada
  sombraReal: boolean; // sombra projetada x borrão
  sombraMapa: number; // resolução do mapa de sombra
  pixelMax: number; // teto de resolução
}

const RECEITAS: Record<Qualidade, Receita> = {
  padrao: {
    exposicao: 1,
    reflexo: 1,
    chave: 1.6,
    preenchimento: 0,
    contra: 0,
    ambiente: 0.35,
    sombraReal: false,
    sombraMapa: 1024,
    pixelMax: 1.5,
  },
  alta: {
    exposicao: 0.92,
    reflexo: 0.8,
    chave: 2.3,
    preenchimento: 0.7,
    contra: 1.1,
    ambiente: 0.16,
    sombraReal: true,
    sombraMapa: 2048,
    pixelMax: 1.75,
  },
  maxima: {
    exposicao: 0.92,
    reflexo: 0.8,
    chave: 2.3,
    preenchimento: 0.7,
    contra: 1.1,
    ambiente: 0.16,
    sombraReal: true,
    sombraMapa: 4096,
    pixelMax: 2,
  },
};

// De onde a câmera olha (à direita, um pouco acima e à frente) e quanta folga
// sobra em volta do produto.
const DIRECAO_CAMERA = new THREE.Vector3(0.9, 0.5, 1);
const FOLGA = 1.12;

// Vistas rápidas: de que direção a câmera olha o produto. A "3/4" é o ângulo
// herói (o de abertura); as outras são as ortográficas de sempre num catálogo.
const VISTAS = [
  { chave: "tresQuartos", rotulo: "3/4", dir: new THREE.Vector3(0.9, 0.5, 1) },
  { chave: "frente", rotulo: "Frente", dir: new THREE.Vector3(0, 0.18, 1) },
  { chave: "lado", rotulo: "Lado", dir: new THREE.Vector3(1, 0.18, 0.05) },
  { chave: "cima", rotulo: "Cima", dir: new THREE.Vector3(0.001, 1, 0.35) },
] as const;

type ChaveVista = (typeof VISTAS)[number]["chave"];

// Quanto tempo o marcador do "mudou aqui" fica na tela.
const DESTAQUE_MS = 3800;
// Quanto tempo o botão de copiar fica dizendo que copiou.
const AVISO_COPIA_MS = 2200;

// Medidas da etiqueta, para desviar uma da outra na tela. Aproximadas de
// propósito: medir cada pílula no DOM a cada quadro custaria recálculo de
// layout, e o que importa aqui é não empilhar texto em cima de texto.
const ALTURA_PILULA = 26;
const LARGURA_PILULA = 150;
const HASTE_MINIMA = 16;
// Só gira sozinho se a peça estiver mais de ~50° fora da frente da câmera. Peça
// que já está à vista não justifica mexer no ângulo que a pessoa escolheu.
const GIRO_MINIMO = 0.9;
const GIRO_MS = 650;

// Ícones (SVG, traço, 24x24 do lucide) do marcador, por tipo de mudança.
const DESENHO_ICONE: Record<TipoDestaque, string> = {
  acendeu: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/><path d="M12 8v8"/>',
  apagou: '<circle cx="12" cy="12" r="10"/><path d="M8 12h8"/>',
  acabamento:
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C10 11.1 9 13 9 15a7 7 0 0 0 7 7z"/>',
};

interface Cena {
  aplicar: (estado: Estado3d) => void;
  enquadrar: () => void;
  // Aponta o que acabou de mudar: rótulo preso na peça e, se ela estiver do
  // outro lado, um giro suave até ela. Some sozinho depois de alguns segundos.
  destacar: (destaque: Destaque) => void;
  // Marca TUDO que difere do padrão, de uma vez e sem sumir. É o que a tela
  // ampliada mostra: lá não dá para marcar opção, então o que interessa é ver
  // onde esta configuração foge do modelo de série.
  anotar: (destaques: readonly Destaque[]) => void;
  // Toque: dentro da tela ampliada o dedo gira o produto; no painel ele precisa
  // continuar rolando a página.
  modoAmpliado: (ampliado: boolean) => void;
  // Move a tela do WebGL para outro container. É o que permite a mesma cena
  // (mesmo contexto, mesmo modelo carregado) aparecer no painel e, ao ampliar,
  // dentro do portal — sem recarregar nada.
  anexar: (container: HTMLElement | null) => void;
  // Troca o nível de qualidade sem recarregar o modelo: mexe em luz, sombra,
  // exposição, resolução e oclusão de ambiente.
  qualidade: (nivel: Qualidade) => void;
  // Voa suave até uma das vistas rápidas (frente, lado, cima, 3/4).
  vista: (chave: ChaveVista) => void;
  // Voa até uma peça e a enquadra de perto (clique no 3D ou na especificação).
  focar: (chave: string) => void;
  // Espalha as peças a partir do centro: 0 = montado, 1 = todo aberto.
  explodir: (fracao: number) => void;
  // Liga/desliga a régua de cotas (A×L×P).
  mostrarCotas: (mostrar: boolean) => void;
  // Liga/desliga o giro automático (turntable).
  girarAuto: (ligar: boolean) => void;
}

interface Visualizador3DProps {
  arquivo: string;
  estado: Estado3d;
  // O que esta configuração tem de diferente do padrão. Vira uma etiqueta presa
  // em cada peça quando a prévia é ampliada.
  anotacoes: readonly Destaque[];
  // Começa com as etiquetas ligadas. É o caso da tela do cliente: ele abre o
  // link justamente para ver o que foi pedido de diferente. No configurador
  // elas ficam desligadas até ampliar, para não tampar o produto no painel.
  anotarDeInicio?: boolean;
  // Nível de qualidade atual e como avisar quando o usuário troca. Controlado
  // pelo pai porque o configurador precisa saber qual nível o vendedor escolheu
  // para gravá-lo no link do cliente.
  qualidade: Qualidade;
  aoMudarQualidade: (nivel: Qualidade) => void;
  // Pedido externo de focar uma peça (clique num item da especificação). O
  // `nonce` muda a cada pedido para focar de novo a mesma peça.
  foco?: { chave: string; nonce: number };
  // Avisa qual peça acabou de ganhar foco (clique no 3D ou na especificação),
  // para o pai mostrar o cartão de informação. `null` quando desfoca.
  aoFocar?: (chave: string | null) => void;
  // Endereço da tela de conferência desta configuração. Vindo preenchido,
  // aparece o botão que copia o link para mandar ao cliente.
  aoCopiarLink?: () => Promise<boolean>;
  // Avisa o formulário quando o 3D não abre (sem WebGL, arquivo fora do ar),
  // para a tela voltar a mostrar a foto em vez de um retângulo vazio.
  onFalha?: () => void;
}

export default function Visualizador3D({
  arquivo,
  estado,
  anotacoes,
  anotarDeInicio,
  qualidade,
  aoMudarQualidade,
  foco,
  aoFocar,
  aoCopiarLink,
  onFalha,
}: Visualizador3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cenaRef = useRef<Cena | null>(null);
  const [carregado, setCarregado] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [ampliado, setAmpliado] = useState(false);
  const [anotando, setAnotando] = useState(Boolean(anotarDeInicio));
  const [linkCopiado, setLinkCopiado] = useState<boolean | null>(null);

  // Guardado por referência para o efeito de montagem ler o nível inicial sem
  // ter `qualidade` como dependência (senão a cena WebGL remontaria a cada
  // troca de nível em vez de só reconfigurar).
  const qualidadeRef = useRef(qualidade);
  useEffect(() => {
    qualidadeRef.current = qualidade;
  }, [qualidade]);

  // A abertura cinematográfica só roda na tela do cliente; lida por referência
  // para não entrar como dependência do efeito de montagem.
  const anotarDeInicioRef = useRef(anotarDeInicio);
  useEffect(() => {
    anotarDeInicioRef.current = anotarDeInicio;
  }, [anotarDeInicio]);

  const [autoGiro, setAutoGiro] = useState(false);
  // Fração da explosão (0 = montado, 1 = todo aberto).
  const [explosao, setExplosao] = useState(0);

  function alternarAmpliado() {
    // Ampliar liga as etiquetas: é para isso que se amplia. Desligar de novo é
    // um clique no olho, e a escolha vale até fechar.
    if (!ampliado) setAnotando(true);
    setAmpliado((valor) => !valor);
  }

  async function copiarLink() {
    const copiou = (await aoCopiarLink?.()) ?? false;
    setLinkCopiado(copiou);
    setTimeout(() => setLinkCopiado(null), AVISO_COPIA_MS);
  }

  // Guardado por referência, e não usado como dependência: um `onFalha` recriado
  // no render do pai remontaria a cena WebGL inteira a cada tecla digitada.
  const onFalhaRef = useRef(onFalha);
  useEffect(() => {
    onFalhaRef.current = onFalha;
  }, [onFalha]);

  // Aviso de foco por referência: o pai troca `aoFocar` a cada render, e ele não
  // pode virar dependência do efeito de montagem.
  const aoFocarRef = useRef(aoFocar);
  useEffect(() => {
    aoFocarRef.current = aoFocar;
  }, [aoFocar]);

  const [cotas, setCotas] = useState(false);

  // Monta a cena uma vez por arquivo. Tudo que é criado aqui é destruído no
  // retorno: WebGL não tem coletor de lixo, e contexto vazado trava a aba
  // depois de algumas navegações.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let vivo = true;
    let renderer: THREE.WebGLRenderer;
    try {
      // Antialiasing por multiamostragem sempre ligado: a travada de antes vinha
      // do laço eterno (já resolvido com desenho sob demanda), não do MSAA. Nos
      // níveis Alta/Máxima ainda sobe a resolução; no Máxima o SSAO desenha por
      // um composer à parte.
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      onFalhaRef.current?.();
      return;
    }

    renderer.setSize(container.clientWidth, container.clientHeight || 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = "h-full w-full";
    // O OrbitControls bloqueia todo gesto de toque sobre a tela; devolvemos o
    // arrasto vertical ao navegador para a página continuar rolando no celular
    // (arrastar de lado gira o produto, arrastar para baixo rola a página).
    renderer.domElement.style.touchAction = "pan-y";

    const cena = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      35,
      container.clientWidth / (container.clientHeight || 1),
      0.05,
      50,
    );

    // Sem mapa de ambiente, inox e cromado ficariam pretos: metal só tem cor
    // quando há o que refletir. Um estúdio claro (softboxes) dá reflexos de
    // catálogo, bem melhor que o cinza chapado do RoomEnvironment.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const estudio = criarEstudioEnv();
    const ambiente = pmrem.fromScene(estudio, 0.03).texture;
    cena.environment = ambiente;
    estudio.traverse((objeto) => {
      const malha = objeto as THREE.Mesh;
      if (malha.isMesh) {
        malha.geometry.dispose();
        (malha.material as THREE.Material).dispose();
      }
    });
    pmrem.dispose();

    // Luz de 3 pontos: chave (principal, e a que projeta a sombra), preenchimento
    // (do lado oposto, suaviza a sombra dura) e contraluz (por trás, destaca o
    // contorno). No nível Padrão só a chave fica acesa, reproduzindo o de antes.
    const luzChave = new THREE.DirectionalLight(0xffffff, 1.6);
    luzChave.position.set(2.6, 3.6, 2.4);
    const luzPreenchimento = new THREE.DirectionalLight(0xffffff, 0);
    luzPreenchimento.position.set(-3, 1.6, 1.2);
    const luzContra = new THREE.DirectionalLight(0xffffff, 0);
    luzContra.position.set(-1.4, 2.6, -3);
    const luzAmbiente = new THREE.AmbientLight(0xffffff, 0.35);
    cena.add(luzChave, luzChave.target, luzPreenchimento, luzContra, luzAmbiente);

    // Sombra no chão em duas formas, trocadas pelo nível: o borrão barato
    // (`sombraBlob`) e a projetada de verdade sobre um plano (`sombraPlano`).
    // Ambos nascem quando o modelo chega (dependem do tamanho dele).
    let sombraBlob: THREE.Mesh | null = null;
    let sombraPlano: THREE.Mesh | null = null;
    // Remove os ouvintes de clique (registrados quando o modelo chega).
    let limparClique: (() => void) | undefined;
    // Régua de cotas (A×L×P): a caixa e os rótulos, e se estão à mostra.
    let caixaCotas: THREE.Box3Helper | null = null;
    const rotulosCota: { elemento: HTMLElement; ancora: THREE.Vector3 }[] = [];
    let cotasVisiveis = false;

    // Reconfigura a cena para um nível. Não recria nada (o renderer e o modelo
    // continuam os mesmos): só ajusta intensidades, visibilidade, resolução da
    // sombra e teto de resolução. Some com o borrão quando entra a sombra real
    // e vice-versa.
    function aplicarQualidade(nivel: Qualidade) {
      const r = RECEITAS[nivel];
      renderer.toneMappingExposure = r.exposicao;
      cena.environmentIntensity = r.reflexo;
      luzChave.intensity = r.chave;
      luzPreenchimento.intensity = r.preenchimento;
      luzContra.intensity = r.contra;
      luzAmbiente.intensity = r.ambiente;
      luzChave.castShadow = r.sombraReal;
      if (luzChave.shadow.mapSize.width !== r.sombraMapa) {
        luzChave.shadow.mapSize.set(r.sombraMapa, r.sombraMapa);
        // Descarta o mapa atual para o three recriar no tamanho novo.
        luzChave.shadow.map?.dispose();
        luzChave.shadow.map = null;
      }
      if (sombraBlob) sombraBlob.visible = !r.sombraReal;
      if (sombraPlano) sombraPlano.visible = r.sombraReal;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, r.pixelMax));
      const alvo = renderer.domElement.parentElement;
      if (alvo) redimensionar(alvo);
      pedirQuadro();
    }

    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.enablePan = false;
    controles.zoomSpeed = 0.8;
    controles.autoRotateSpeed = 1.4; // giro automático devagar, de vitrine
    // Giro livre nos dois eixos, como em qualquer visualizador de CAD: dá para
    // olhar o carro por baixo (rodízios, base) e por cima (tampo).

    // Peças e centro do modelo: preenchidos quando o arquivo chega, mas
    // declarados aqui porque os marcadores precisam deles para achar a peça.
    // Cada CHAVE reúne vários nós (o GLB traz uma peça por nó, `peca_<chave>__n`):
    // ligar/desligar e trocar material valem para todos os nós da chave.
    interface PecaCarregada {
      nos: THREE.Object3D[];
      pintaveis: THREE.Mesh[];
      centro: THREE.Vector3;
    }
    const pecasCarregadas = new Map<string, PecaCarregada>();
    const centroDoModelo = new THREE.Vector3();
    // Cada nó com a sua posição original e a direção para onde voa ao explodir
    // (radial, a partir do centro do modelo).
    const explodiveis: { no: THREE.Object3D; origem: THREE.Vector3; direcao: THREE.Vector3 }[] = [];
    let amplitudeExplosao = 1;
    let explosaoAtual = 0;

    // Tira o `__<n>` do fim: "gaveta__7" -> "gaveta".
    const chaveDaPeca = (nome: string) => nome.slice(PREFIXO_PECA.length).replace(/__\d+$/, "");

    // Camada dos marcadores ("mudou aqui"): pílula com ícone, haste e ponto na
    // peça. É DOM cru, irmão da tela do WebGL, porque a posição deles muda a
    // cada quadro — passar isso por estado do React seria um render por quadro.
    const camada = document.createElement("div");
    camada.className = "pointer-events-none absolute inset-0 z-10 overflow-hidden";
    container.append(renderer.domElement, camada);

    interface Marcador {
      elemento: HTMLElement;
      // A haste cresce quando duas etiquetas vizinhas na tela se cobrem.
      haste: HTMLElement;
      ancora: THREE.Vector3;
    }
    // Um transitório (o que o vendedor acabou de mexer) e os fixos (o que difere
    // do padrão, na tela ampliada). Listas separadas porque a vida deles é
    // diferente: um some sozinho, os outros ficam.
    let transitorio: Marcador | null = null;
    let fixos: Marcador[] = [];
    let sumico: ReturnType<typeof setTimeout> | undefined;

    function criarMarcador(destaque: Destaque): Marcador {
      const elemento = document.createElement("div");
      elemento.className =
        "absolute left-0 top-0 flex -translate-x-1/2 -translate-y-full flex-col items-center transition-opacity duration-200";
      // A pílula fica numa camada acima das hastes e dos pontos (z-20 contra
      // z-10): assim o ponto de UMA etiqueta nunca cai em cima do texto da
      // outra, independente da ordem em que foram criadas.
      elemento.innerHTML =
        '<span class="relative z-20 flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-card/95 px-2 py-1 text-[11px] font-medium text-card-foreground shadow-lg backdrop-blur">' +
        '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-primary"></svg>' +
        "<span></span></span>" +
        '<span class="relative z-10 w-px bg-primary"></span>' +
        '<span class="relative z-10 h-2 w-2 rounded-full bg-primary ring-2 ring-card"></span>';
      elemento.querySelector("svg")!.innerHTML = DESENHO_ICONE[destaque.tipo];
      elemento.querySelector("span > span")!.textContent = destaque.texto;

      const peca = destaque.peca ? pecasCarregadas.get(destaque.peca) : undefined;
      const ancora = (peca?.centro ?? centroDoModelo).clone();
      camada.appendChild(elemento);
      return { elemento, haste: elemento.children[1] as HTMLElement, ancora };
    }

    // Projeta cada âncora na tela e desvia as etiquetas que se cobrem: quem
    // chega depois num lugar já ocupado ganha haste mais comprida e sobe. É por
    // quadro de propósito — quem decide se duas etiquetas se cobrem é o ângulo
    // da câmera, que muda o tempo todo.
    function posicionarMarcadores() {
      const largura = renderer.domElement.clientWidth;
      const altura = renderer.domElement.clientHeight;

      // Primeiro onde cada peça caiu na tela; depois onde cabe cada pílula.
      // Em duas passadas porque a pílula precisa desviar TAMBÉM do ponto das
      // outras (cada etiqueta é uma camada só dela, então um ponto desenhado
      // depois passaria por cima de um texto desenhado antes).
      const pontos: { marcador: Marcador; x: number; y: number }[] = [];

      // O transitório entra por último: ele é o "acabei de mexer aqui" e fica
      // no lugar mais perto da peça.
      for (const marcador of [...fixos, transitorio]) {
        if (!marcador) continue;
        const ponto = marcador.ancora.clone().project(camera);
        // z > 1 = atrás da câmera; sem isto a etiqueta reaparece espelhada do
        // outro lado da tela.
        if (ponto.z > 1) {
          marcador.elemento.style.visibility = "hidden";
          continue;
        }
        marcador.elemento.style.visibility = "visible";
        pontos.push({
          marcador,
          x: (ponto.x * 0.5 + 0.5) * largura,
          y: (-ponto.y * 0.5 + 0.5) * altura,
        });
      }

      const ocupados: { x: number; topo: number }[] = [];
      for (const { marcador, x, y } of pontos) {
        const atrapalha = (topo: number) =>
          ocupados.some(
            (outro) =>
              Math.abs(outro.x - x) < LARGURA_PILULA && Math.abs(outro.topo - topo) < ALTURA_PILULA,
          ) ||
          pontos.some(
            (outro) =>
              outro.marcador !== marcador &&
              Math.abs(outro.x - x) < LARGURA_PILULA / 2 &&
              outro.y > topo &&
              outro.y < topo + ALTURA_PILULA,
          );

        let haste = HASTE_MINIMA;
        let topo = y - haste - ALTURA_PILULA;
        let tentativas = 0;
        while (tentativas++ < 6 && topo > ALTURA_PILULA && atrapalha(topo)) {
          haste += ALTURA_PILULA + 4;
          topo = y - haste - ALTURA_PILULA;
        }

        ocupados.push({ x, topo });
        marcador.haste.style.height = `${haste}px`;
        marcador.elemento.style.left = `${x}px`;
        marcador.elemento.style.top = `${y}px`;
      }
    }

    // Rótulos das cotas: projeta cada âncora (meio de uma aresta da caixa) na
    // tela. Sem hastes nem anti-colisão — são só três e ficam longe uns dos
    // outros.
    function posicionarCotas() {
      const largura = renderer.domElement.clientWidth;
      const altura = renderer.domElement.clientHeight;
      for (const { elemento, ancora } of rotulosCota) {
        const ponto = ancora.clone().project(camera);
        elemento.style.visibility = ponto.z > 1 ? "hidden" : "visible";
        elemento.style.left = `${(ponto.x * 0.5 + 0.5) * largura}px`;
        elemento.style.top = `${(-ponto.y * 0.5 + 0.5) * altura}px`;
      }
    }

    // Voo de câmera: caminha suave da posição/alvo atuais até um destino. É o
    // motor das vistas rápidas, do foco ao clicar numa peça e da abertura
    // cinematográfica. Qualquer arrasto do usuário cancela (o `start` abaixo).
    interface Voo {
      posDe: THREE.Vector3;
      posPara: THREE.Vector3;
      alvoDe: THREE.Vector3;
      alvoPara: THREE.Vector3;
      inicio: number;
      duracao: number;
    }
    let voo: Voo | null = null;
    // Giro automático (turntable). Ligado, o produto roda sozinho; o laço fica
    // vivo enquanto isso.
    let autoGiro = false;
    let retomarGiro: ReturnType<typeof setTimeout> | undefined;

    function voar(posPara: THREE.Vector3, alvoPara: THREE.Vector3, duracao = GIRO_MS) {
      voo = {
        posDe: camera.position.clone(),
        posPara: posPara.clone(),
        alvoDe: controles.target.clone(),
        alvoPara: alvoPara.clone(),
        inicio: performance.now(),
        duracao,
      };
      pedirQuadro();
    }

    controles.addEventListener("start", () => {
      voo = null;
      // Pega no produto = pausa o giro automático; volta sozinho depois de um
      // tempo parado, para o cliente mexer sem brigar com a rotação.
      controles.autoRotate = false;
      clearTimeout(retomarGiro);
    });
    controles.addEventListener("end", () => {
      if (!autoGiro) return;
      retomarGiro = setTimeout(() => {
        controles.autoRotate = true;
        pedirQuadro();
      }, 2500);
    });

    // Desenho SOB DEMANDA. Antes o laço rodava a 60 quadros por segundo para
    // sempre, mesmo com o produto parado, e disputava a linha principal com a
    // rolagem da página: era daí que vinha a travada. Agora cada mexida pede um
    // quadro, e o laço se desliga sozinho quando a cena assenta.
    let animacao = 0;
    let precisaDesenhar = false;

    function laco(agora: number) {
      if (voo) {
        const parte = Math.min((agora - voo.inicio) / voo.duracao, 1);
        // easeInOutCubic: sai e chega devagar, sem tranco.
        const suave = parte < 0.5 ? 4 * parte ** 3 : 1 - (-2 * parte + 2) ** 3 / 2;
        camera.position.lerpVectors(voo.posDe, voo.posPara, suave);
        controles.target.lerpVectors(voo.alvoDe, voo.alvoPara, suave);
        if (parte === 1) voo = null;
        precisaDesenhar = true;
      }

      // `update()` devolve true enquanto a inércia do arrasto (ou o giro
      // automático) ainda mexe a câmera; é o que mantém o laço vivo.
      const assentando = controles.update();
      if (assentando || precisaDesenhar) {
        renderer.render(cena, camera);
        if (transitorio || fixos.length > 0) posicionarMarcadores();
        if (cotasVisiveis) posicionarCotas();
        precisaDesenhar = false;
      }

      animacao = assentando || voo || controles.autoRotate ? requestAnimationFrame(laco) : 0;
    }

    function pedirQuadro() {
      precisaDesenhar = true;
      if (animacao === 0) animacao = requestAnimationFrame(laco);
    }

    // Enquanto o dedo/mouse está no produto, o laço fica ligado: o `update()`
    // só passa a valer depois que o controle processa o movimento.
    controles.addEventListener("change", pedirQuadro);

    function redimensionar(alvo: HTMLElement) {
      const largura = alvo.clientWidth;
      const altura = alvo.clientHeight;
      if (largura === 0 || altura === 0) return;
      renderer.setSize(largura, altura);
      camera.aspect = largura / altura;
      camera.updateProjectionMatrix();
      pedirQuadro();
    }

    // Observa o container ATUAL (ele muda quando a prévia é ampliada), por isso
    // o tamanho vem do alvo do evento e não de uma variável fixa.
    const observador = new ResizeObserver((entradas) => {
      const alvo = entradas[0]?.target;
      if (alvo instanceof HTMLElement) redimensionar(alvo);
    });
    observador.observe(container);

    const materialInox = new THREE.MeshStandardMaterial({
      color: new THREE.Color(INOX.cor).convertSRGBToLinear(),
      metalness: INOX.metalico,
      roughness: INOX.rugosidade,
    });

    const carregador = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    carregador.load(
      arquivo,
      (glb) => {
        if (!vivo) return;
        const modelo = glb.scene;

        // Índice das peças, agrupando os nós pela CHAVE (o GLB traz uma peça por
        // nó). Guarda as malhas pintáveis e o centro do grupo (medido AGORA, com
        // tudo visível, para o marcador achar peça que foi apagada depois).
        const caixaPorChave = new Map<string, THREE.Box3>();
        for (const no of modelo.children) {
          if (!no.name.startsWith(PREFIXO_PECA)) continue;
          const chave = chaveDaPeca(no.name);
          const grupo = pecasCarregadas.get(chave) ?? {
            nos: [],
            pintaveis: [],
            centro: new THREE.Vector3(),
          };
          grupo.nos.push(no);
          no.traverse((filho) => {
            const malha = filho as THREE.Mesh;
            if (!malha.isMesh) return;
            // Toda peça projeta e recebe sombra (a projetada só existe nos
            // níveis Alta/Máxima; quando desligada não custa nada).
            malha.castShadow = true;
            malha.receiveShadow = true;
            if ((malha.material as THREE.Material).name === MATERIAL_CONFIGURAVEL) {
              malha.userData.materialCad = malha.material;
              grupo.pintaveis.push(malha);
            }
          });
          pecasCarregadas.set(chave, grupo);

          const caixa = new THREE.Box3().setFromObject(no);
          caixaPorChave.set(chave, (caixaPorChave.get(chave) ?? caixa.clone()).union(caixa));
        }
        for (const [chave, caixa] of caixaPorChave) {
          caixa.getCenter(pecasCarregadas.get(chave)!.centro);
        }

        cena.add(modelo);

        const esfera = new THREE.Box3()
          .setFromObject(modelo)
          .getBoundingSphere(new THREE.Sphere());
        centroDoModelo.copy(esfera.center);

        // Prepara a explosão: cada nó guarda a posição de origem e uma direção
        // radial (para longe do centro). Peça central (offset ~0) sobe um pouco,
        // para o tampo e afins não ficarem presos no meio.
        amplitudeExplosao = esfera.radius * 1.15;
        for (const no of modelo.children) {
          if (!no.name.startsWith(PREFIXO_PECA)) continue;
          const centroNo = new THREE.Box3().setFromObject(no).getCenter(new THREE.Vector3());
          const direcao = centroNo.clone().sub(esfera.center);
          if (direcao.length() < esfera.radius * 0.05) direcao.set(0, 1, 0);
          direcao.normalize();
          explodiveis.push({ no, origem: no.position.clone(), direcao });
        }

        // Cotas (A×L×P): a caixa envolvente do modelo montado e três rótulos em
        // centímetros nos meios das arestas. Nascem escondidos; um botão liga.
        const caixaModelo = new THREE.Box3().setFromObject(modelo);
        const min = caixaModelo.min;
        const max = caixaModelo.max;
        const tamanho = caixaModelo.getSize(new THREE.Vector3());
        caixaCotas = new THREE.Box3Helper(caixaModelo, new THREE.Color(0x334155));
        const linhaCota = caixaCotas.material as THREE.LineBasicMaterial;
        linhaCota.transparent = true;
        linhaCota.opacity = 0.55;
        caixaCotas.visible = false;
        cena.add(caixaCotas);

        const cm = (metros: number) => Math.round(metros * 100);
        const criarRotuloCota = (texto: string, ancora: THREE.Vector3) => {
          const elemento = document.createElement("div");
          elemento.className =
            "absolute left-0 top-0 hidden -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-card/95 px-1.5 py-0.5 text-[11px] font-semibold text-card-foreground shadow backdrop-blur";
          elemento.textContent = texto;
          camada.appendChild(elemento);
          rotulosCota.push({ elemento, ancora });
        };
        criarRotuloCota(`L ${cm(tamanho.x)} cm`, new THREE.Vector3((min.x + max.x) / 2, min.y, max.z));
        criarRotuloCota(`P ${cm(tamanho.z)} cm`, new THREE.Vector3(max.x, min.y, (min.z + max.z) / 2));
        criarRotuloCota(`A ${cm(tamanho.y)} cm`, new THREE.Vector3(max.x, (min.y + max.y) / 2, max.z));

        // Borrão (sombra barata do nível Padrão).
        sombraBlob = sombraDeContato(modelo);
        cena.add(sombraBlob);

        // Sombra projetada de verdade (níveis Alta/Máxima): um plano no chão que
        // recebe a sombra, e a luz-chave configurada para cobrir o modelo.
        sombraPlano = new THREE.Mesh(
          new THREE.PlaneGeometry(esfera.radius * 6, esfera.radius * 6),
          new THREE.ShadowMaterial({ opacity: 0.3 }),
        );
        sombraPlano.rotation.x = -Math.PI / 2;
        sombraPlano.position.set(esfera.center.x, 0.001, esfera.center.z);
        sombraPlano.receiveShadow = true;
        sombraPlano.visible = false;
        cena.add(sombraPlano);

        const raio = esfera.radius;
        luzChave.position.set(esfera.center.x + raio * 1.6, raio * 3, esfera.center.z + raio * 1.6);
        luzChave.target.position.copy(esfera.center);
        luzChave.target.updateMatrixWorld();
        luzChave.shadow.bias = -0.0004;
        luzChave.shadow.normalBias = 0.02;
        const camSombra = luzChave.shadow.camera;
        camSombra.left = -raio * 1.7;
        camSombra.right = raio * 1.7;
        camSombra.top = raio * 1.7;
        camSombra.bottom = -raio * 1.7;
        camSombra.near = raio * 0.5;
        camSombra.far = raio * 8;
        camSombra.updateProjectionMatrix();

        aplicarQualidade(qualidadeRef.current);

        // Distância em que uma esfera de raio `r` cabe na MENOR abertura da tela
        // (a vertical num painel largo, a horizontal num painel estreito).
        function distanciaPara(r: number, folga: number) {
          const fovVertical = (camera.fov * Math.PI) / 180;
          const fovHorizontal = 2 * Math.atan(Math.tan(fovVertical / 2) * camera.aspect);
          return (r / Math.sin(Math.min(fovVertical, fovHorizontal) / 2)) * folga;
        }

        // Câmera olhando o produto inteiro do ângulo `direcao`. `voando` faz a
        // transição suave (vistas rápidas); sem ele, corta na hora (enquadrar).
        function olharDe(direcao: THREE.Vector3, voando: boolean) {
          const distancia = distanciaPara(esfera.radius, FOLGA);
          const posicao = esfera.center
            .clone()
            .addScaledVector(direcao.clone().normalize(), distancia);
          if (voando) voar(posicao, esfera.center);
          else {
            camera.position.copy(posicao);
            controles.target.copy(esfera.center);
            controles.update();
            pedirQuadro();
          }
        }

        function enquadrar() {
          // Dá para chegar perto de um detalhe (a trava, o suporte de soro) sem
          // atravessar o produto, e afastar até enxergar o carro inteiro.
          controles.minDistance = esfera.radius * 0.45;
          controles.maxDistance = distanciaPara(esfera.radius, FOLGA) * 2;
          olharDe(DIRECAO_CAMERA, false);
        }
        enquadrar();

        // Voa até uma peça e a enquadra de perto, mantendo o ângulo atual da
        // câmera (só aproxima e recentra). É o que roda ao clicar numa peça ou
        // num item da especificação.
        function focarPeca(chave: string) {
          const peca = pecasCarregadas.get(chave);
          if (!peca) return;
          const caixa = new THREE.Box3();
          for (const no of peca.nos) caixa.expandByObject(no);
          if (caixa.isEmpty()) return;
          const centro = caixa.getCenter(new THREE.Vector3());
          const raioPeca = Math.max(
            caixa.getSize(new THREE.Vector3()).length() / 2,
            esfera.radius * 0.12,
          );
          const direcao = camera.position.clone().sub(controles.target).normalize();
          const distancia = Math.min(
            distanciaPara(raioPeca, 1.7),
            distanciaPara(esfera.radius, FOLGA),
          );
          voar(centro.clone().addScaledVector(direcao, distancia), centro);
          aoFocarRef.current?.(chave);
        }

        // Espalha as peças a partir do centro. `fracao` 0 = montado, 1 = todo
        // aberto; anima suave até o alvo pedido.
        function explodir(fracao: number) {
          explosaoAtual = Math.max(0, Math.min(1, fracao));
          for (const { no, origem, direcao } of explodiveis) {
            no.position.copy(origem).addScaledVector(direcao, explosaoAtual * amplitudeExplosao);
          }
          pedirQuadro();
        }

        // Gira até a peça quando ela está escondida atrás do produto — usado ao
        // apontar uma mudança. Mantém a distância; só troca o ângulo horizontal.
        function girarAte(ancora: THREE.Vector3) {
          const lado = new THREE.Vector3(ancora.x - esfera.center.x, 0, ancora.z - esfera.center.z);
          if (lado.length() < esfera.radius * 0.12) return;

          const relativo = camera.position.clone().sub(controles.target);
          const atual = new THREE.Spherical().setFromVector3(relativo);
          const desejado = Math.atan2(lado.x, lado.z);
          const diferenca = Math.atan2(
            Math.sin(desejado - atual.theta),
            Math.cos(desejado - atual.theta),
          );
          if (Math.abs(diferenca) < GIRO_MINIMO) return;
          const destino = new THREE.Spherical(atual.radius, atual.phi, atual.theta + diferenca);
          voar(new THREE.Vector3().setFromSpherical(destino).add(controles.target), controles.target);
        }

        // Abertura cinematográfica: começa um pouco girada e mais longe e voa
        // até o ângulo herói. Só na tela do cliente (`anotarDeInicio`), para o
        // configurador do vendedor não ficar animando a cada ajuste.
        if (anotarDeInicioRef.current) {
          const distancia = distanciaPara(esfera.radius, FOLGA);
          const giroInicial = new THREE.Vector3(-0.4, 0.35, 1);
          camera.position
            .copy(esfera.center)
            .addScaledVector(giroInicial.normalize(), distancia * 1.25);
          controles.update();
          voar(
            esfera.center.clone().addScaledVector(DIRECAO_CAMERA.clone().normalize(), distancia),
            esfera.center,
            1400,
          );
        }

        // Clicar numa peça a enquadra de perto. Distingue clique de arrasto
        // (o arrasto gira o produto): só conta como clique quando o ponteiro
        // quase não andou entre apertar e soltar.
        const raycaster = new THREE.Raycaster();
        const ndc = new THREE.Vector2();
        let apertouEm: { x: number; y: number } | null = null;

        function chaveNoPonto(evento: PointerEvent): string | null {
          const caixa = renderer.domElement.getBoundingClientRect();
          ndc.set(
            ((evento.clientX - caixa.left) / caixa.width) * 2 - 1,
            -((evento.clientY - caixa.top) / caixa.height) * 2 + 1,
          );
          raycaster.setFromCamera(ndc, camera);
          for (const acerto of raycaster.intersectObject(modelo, true)) {
            let no: THREE.Object3D | null = acerto.object;
            while (no && !no.name.startsWith(PREFIXO_PECA)) no = no.parent;
            if (no?.visible) return chaveDaPeca(no.name);
          }
          return null;
        }

        function aoApertar(evento: PointerEvent) {
          apertouEm = { x: evento.clientX, y: evento.clientY };
        }
        function aoSoltar(evento: PointerEvent) {
          if (!apertouEm) return;
          const andou = Math.hypot(evento.clientX - apertouEm.x, evento.clientY - apertouEm.y);
          apertouEm = null;
          if (andou > 6) return; // foi arrasto, não clique
          const chave = chaveNoPonto(evento);
          if (chave) focarPeca(chave);
        }
        renderer.domElement.addEventListener("pointerdown", aoApertar);
        renderer.domElement.addEventListener("pointerup", aoSoltar);
        limparClique = () => {
          renderer.domElement.removeEventListener("pointerdown", aoApertar);
          renderer.domElement.removeEventListener("pointerup", aoSoltar);
        };

        cenaRef.current = {
          enquadrar,
          anexar(alvo) {
            if (!alvo || renderer.domElement.parentElement === alvo) return;
            observador.disconnect();
            alvo.append(renderer.domElement, camada);
            observador.observe(alvo);
            redimensionar(alvo);
          },
          vista(chave) {
            const vista = VISTAS.find((item) => item.chave === chave);
            if (vista) olharDe(vista.dir.clone(), true);
          },
          focar: focarPeca,
          explodir,
          mostrarCotas(mostrar) {
            cotasVisiveis = mostrar;
            if (caixaCotas) caixaCotas.visible = mostrar;
            for (const { elemento } of rotulosCota) {
              elemento.style.display = mostrar ? "block" : "none";
            }
            if (mostrar) posicionarCotas();
            pedirQuadro();
          },
          girarAuto(ligar) {
            autoGiro = ligar;
            controles.autoRotate = ligar;
            clearTimeout(retomarGiro);
            pedirQuadro();
          },
          qualidade: aplicarQualidade,
          destacar(destaque) {
            transitorio?.elemento.remove();
            transitorio = criarMarcador(destaque);
            posicionarMarcadores();
            clearTimeout(sumico);
            sumico = setTimeout(() => {
              transitorio?.elemento.remove();
              transitorio = null;
            }, DESTAQUE_MS);
            girarAte(transitorio.ancora);
            pedirQuadro();
          },
          anotar(destaques) {
            for (const marcador of fixos) marcador.elemento.remove();
            fixos = destaques.map(criarMarcador);
            posicionarMarcadores();
            pedirQuadro();
          },
          modoAmpliado(ampliado) {
            renderer.domElement.style.touchAction = ampliado ? "none" : "pan-y";
          },
          aplicar(atual) {
            for (const [chave, { nos, pintaveis }] of pecasCarregadas) {
              const oculta = atual.ocultas.has(chave);
              for (const no of nos) no.visible = !oculta;
              const inox = acabamentoDaPeca(atual, chave) === "inox";
              for (const malha of pintaveis) {
                malha.material = inox
                  ? materialInox
                  : (malha.userData.materialCad as THREE.Material);
              }
            }
            pedirQuadro();
          },
        };
        setCarregado(true);
      },
      (evento) => {
        if (vivo && evento.total > 0) {
          setProgresso(Math.round((evento.loaded / evento.total) * 100));
        }
      },
      () => {
        if (vivo) onFalhaRef.current?.();
      },
    );

    return () => {
      vivo = false;
      if (animacao !== 0) cancelAnimationFrame(animacao);
      controles.removeEventListener("change", pedirQuadro);
      limparClique?.();
      clearTimeout(sumico);
      clearTimeout(retomarGiro);
      observador.disconnect();
      controles.dispose();
      camada.remove();
      cena.traverse((objeto) => {
        const malha = objeto as THREE.Mesh;
        if (!malha.isMesh) return;
        malha.geometry.dispose();
        const materiais = Array.isArray(malha.material) ? malha.material : [malha.material];
        // O material do CAD pode estar guardado (a peça está em inox agora):
        // sem ele na conta, sobra material vivo depois de sair da página.
        for (const material of [...materiais, malha.userData.materialCad]) {
          (material as THREE.Material | undefined)?.dispose();
        }
      });
      materialInox.dispose();
      ambiente.dispose();
      luzChave.shadow.map?.dispose();
      caixaCotas?.geometry.dispose();
      renderer.domElement.remove();
      renderer.dispose();
      cenaRef.current = null;
      setCarregado(false);
    };
  }, [arquivo]);

  // Aplica o nível de qualidade escolhido. Roda na troca e logo após o
  // carregamento (por isso `carregado` é dependência).
  useEffect(() => {
    cenaRef.current?.qualidade(qualidade);
  }, [qualidade, carregado]);

  // Liga/desliga o giro automático.
  useEffect(() => {
    cenaRef.current?.girarAuto(autoGiro);
  }, [autoGiro, carregado]);

  // Espalha/monta as peças conforme o slider.
  useEffect(() => {
    cenaRef.current?.explodir(explosao);
  }, [explosao, carregado]);

  // Liga/desliga a régua de cotas.
  useEffect(() => {
    cenaRef.current?.mostrarCotas(cotas);
  }, [cotas, carregado]);

  // Foco pedido de fora (clique num item da especificação). O `nonce` faz o
  // efeito rodar de novo mesmo focando a mesma peça duas vezes seguidas.
  useEffect(() => {
    if (foco) cenaRef.current?.focar(foco.chave);
  }, [foco, carregado]);

  // Aplica as escolhas e aponta o que mudou. Roda a cada mudança de estado e
  // também logo depois do carregamento — por isso `carregado` é dependência.
  const anterior = useRef<Estado3d | null>(null);
  useEffect(() => {
    cenaRef.current?.aplicar(estado);
    const antes = anterior.current;
    anterior.current = estado;
    // No primeiro estado não há "mudou": é assim que o produto começa.
    if (!antes || !cenaRef.current) return;
    const destaque = mudanca(antes, estado);
    if (destaque) cenaRef.current.destacar(destaque);
  }, [estado, carregado]);

  // Etiquetas de tudo que difere do padrão, cada uma apontando a sua peça.
  useEffect(() => {
    cenaRef.current?.anotar(anotando ? anotacoes : []);
  }, [anotando, anotacoes, carregado]);

  // Ampliar não recarrega a cena: a mesma tela do WebGL é levada para o
  // container do portal.
  useEffect(() => {
    cenaRef.current?.anexar(containerRef.current);
    cenaRef.current?.modoAmpliado(ampliado);
    if (!ampliado) return;

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setAmpliado(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [ampliado, carregado]);

  const botao =
    "pointer-events-auto flex items-center gap-1.5 rounded-lg border border-border bg-card/90 px-2 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur transition-colors hover:text-card-foreground";

  const conteudo = (
    <div
      className={
        ampliado
          ? "relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
          : "relative flex h-full flex-col"
      }
    >
      {/* A tela do WebGL é filha do `containerRef` e NÃO do React: por isso ela
          fica num div só dela, sem irmão que o React possa remover embaixo.
          O fundo de estúdio (claro, igual nos dois temas) é o que faz o cinza
          do produto parecer cinza: sobre o card escuro da tela do cliente, o
          modelo claro contra o preto lia como branco. */}
      <div className="relative min-h-0 flex-1" style={{ background: FUNDO_ESTUDIO }}>
        <div ref={containerRef} className="absolute inset-0" />
        {!carregado && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando 3D{progresso > 0 ? ` ${progresso}%` : ""}
          </p>
        )}
      </div>

      {ampliado && (
        <p className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {anotacoes.length === 0
            ? "Tudo no padrão: nada para apontar no modelo."
            : anotando
              ? `Apontando ${anotacoes.length} ${anotacoes.length === 1 ? "mudança" : "mudanças"} em relação ao padrão.`
              : "Etiquetas escondidas."}
        </p>
      )}

      {/* Barra da câmera: giro automático (turntable) e vistas rápidas. Clicar
          numa peça do 3D também aproxima nela. */}
      <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border bg-card/90 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setAutoGiro((valor) => !valor)}
          title={autoGiro ? "Parar o giro" : "Girar sozinho"}
          aria-label={autoGiro ? "Parar o giro" : "Girar sozinho"}
          aria-pressed={autoGiro}
          className={`pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
            autoGiro
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-card-foreground"
          }`}
        >
          {autoGiro ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          Girar
        </button>
        <span className="mx-0.5 h-4 w-px bg-border" />
        {VISTAS.map((vista) => (
          <button
            key={vista.chave}
            type="button"
            onClick={() => cenaRef.current?.vista(vista.chave)}
            title={`Vista ${vista.rotulo}`}
            className="pointer-events-auto rounded-full px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-card-foreground"
          >
            {vista.rotulo}
          </button>
        ))}
        <span className="mx-0.5 h-4 w-px bg-border" />
        {/* Explodir: arrastar o cursor separa as peças (abre as gavetas e
            mostra o interior); o próprio slider é o controle. */}
        <div className="pointer-events-auto flex items-center gap-1.5 pl-1 pr-2">
          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(explosao * 100)}
            onChange={(evento) => setExplosao(Number(evento.target.value) / 100)}
            title="Explodir / montar"
            aria-label="Explodir o modelo"
            className="h-1 w-16 cursor-pointer accent-[var(--color-primary)] sm:w-24"
          />
        </div>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <button
          type="button"
          onClick={() => setCotas((valor) => !valor)}
          title={cotas ? "Esconder medidas" : "Mostrar medidas"}
          aria-label={cotas ? "Esconder medidas" : "Mostrar medidas"}
          aria-pressed={cotas}
          className={`pointer-events-auto flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors ${
            cotas
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-card-foreground"
          }`}
        >
          <Ruler className="h-3.5 w-3.5" />
          Medidas
        </button>
      </div>

      {/* Seletor de qualidade: o vendedor escolhe qual nível mandar (vai no
          link do cliente) e o cliente também pode trocar. */}
      <div
        className="pointer-events-none absolute left-2 top-2 flex overflow-hidden rounded-lg border border-border bg-card/90 backdrop-blur"
        role="group"
        aria-label="Qualidade do 3D"
      >
        {QUALIDADES.map((nivel) => (
          <button
            key={nivel.chave}
            type="button"
            onClick={() => aoMudarQualidade(nivel.chave)}
            title={`Qualidade ${nivel.rotulo}: ${nivel.descricao}`}
            aria-pressed={qualidade === nivel.chave}
            className={`pointer-events-auto px-2 py-1 text-[11px] font-medium transition-colors ${
              qualidade === nivel.chave
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-card-foreground"
            }`}
          >
            {nivel.rotulo}
          </button>
        ))}
      </div>

      <div className="pointer-events-none absolute right-2 top-2 flex gap-1">
        <button
          type="button"
          onClick={() => cenaRef.current?.enquadrar()}
          title="Reenquadrar"
          aria-label="Reenquadrar"
          className={botao}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {ampliado && "Reenquadrar"}
        </button>
        {anotacoes.length > 0 && (
          <button
            type="button"
            onClick={() => setAnotando((valor) => !valor)}
            title={anotando ? "Esconder o que mudou" : "Mostrar o que mudou"}
            aria-label={anotando ? "Esconder o que mudou" : "Mostrar o que mudou"}
            aria-pressed={anotando}
            className={botao}
          >
            {anotando ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            {ampliado && (anotando ? "Esconder mudanças" : "Mostrar mudanças")}
          </button>
        )}
        {aoCopiarLink && (
          <button
            type="button"
            onClick={copiarLink}
            title="Copiar link para o cliente ver este modelo"
            aria-label="Copiar link para o cliente ver este modelo"
            className={botao}
          >
            {linkCopiado === null ? (
              <Link2 className="h-3.5 w-3.5" />
            ) : linkCopiado ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <TriangleAlert className="h-3.5 w-3.5 text-warning" />
            )}
            {(ampliado || linkCopiado !== null) &&
              (linkCopiado === null
                ? "Link do cliente"
                : linkCopiado
                  ? "Link copiado"
                  : "Não consegui copiar")}
          </button>
        )}
        <button
          type="button"
          onClick={alternarAmpliado}
          title={ampliado ? "Fechar" : "Ampliar"}
          aria-label={ampliado ? "Fechar" : "Ampliar"}
          className={botao}
        >
          {ampliado ? <X className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          {ampliado && "Fechar"}
        </button>
      </div>
    </div>
  );

  if (!ampliado) return conteudo;

  // Direto no <body>: dentro do painel, qualquer ancestral com transform,
  // filtro ou opacidade viraria a referência do `fixed` e a janela ampliada
  // sairia do lugar — inclusive com o botão de fechar fora da tela.
  return createPortal(
    <div
      onClick={(evento) => {
        if (evento.target === evento.currentTarget) setAmpliado(false);
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3 sm:p-6"
    >
      {conteudo}
    </div>,
    document.body,
  );
}

// Ambiente de estúdio para os reflexos do metal. Uma caixa CLARA por inteiro
// (sem nenhuma parede escura, senão o inox vira preto) com softboxes brilhantes
// e um degradê teto→chão. Vira mapa de ambiente por PMREM (não baixa nada) e dá
// ao inox/cromado o reflexo alongado de foto de catálogo.
function criarEstudioEnv(): THREE.Scene {
  const cena = new THREE.Scene();

  // Caixa clara em volta (interior à mostra). Base um pouco mais escura que o
  // teto só para dar direção ao reflexo, mas ainda clara.
  const caixa = new THREE.Mesh(
    new THREE.BoxGeometry(30, 30, 30),
    new THREE.MeshStandardMaterial({ color: 0xe9edf1, side: THREE.BackSide }),
  );
  cena.add(caixa);
  const chao = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0xaeb4bb }),
  );
  chao.rotation.x = -Math.PI / 2;
  chao.position.y = -14.9;
  cena.add(chao);
  const teto = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 30),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
  );
  teto.rotation.x = Math.PI / 2;
  teto.position.y = 14.9;
  cena.add(teto);

  // Softboxes: painéis que emitem luz, os brilhos de estúdio no metal.
  const softbox = (
    l: number,
    a: number,
    intensidade: number,
    posicao: [number, number, number],
  ) => {
    const luz = new THREE.Mesh(
      new THREE.PlaneGeometry(l, a),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(intensidade) }),
    );
    luz.position.set(...posicao);
    luz.lookAt(0, 0, 0);
    cena.add(luz);
  };
  softbox(7, 12, 3, [11, 4, 5]);
  softbox(7, 12, 3, [-11, 4, 3]);
  softbox(12, 5, 2.4, [0, 11, 4]);

  return cena;
}

// Sombra de contato: um borrão redondo no chão, do tamanho da base do produto.
// É o que tira a sensação de objeto flutuando, sem o custo de sombra de verdade.
function sombraDeContato(modelo: THREE.Object3D): THREE.Mesh {
  const tela = document.createElement("canvas");
  tela.width = 128;
  tela.height = 128;
  const pincel = tela.getContext("2d")!;
  const gradiente = pincel.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradiente.addColorStop(0, "rgba(0,0,0,0.38)");
  gradiente.addColorStop(0.6, "rgba(0,0,0,0.12)");
  gradiente.addColorStop(1, "rgba(0,0,0,0)");
  pincel.fillStyle = gradiente;
  pincel.fillRect(0, 0, 128, 128);

  const tamanho = new THREE.Box3().setFromObject(modelo).getSize(new THREE.Vector3());
  const lado = Math.max(tamanho.x, tamanho.z) * 1.5;
  const sombra = new THREE.Mesh(
    new THREE.PlaneGeometry(lado, lado),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(tela),
      transparent: true,
      depthWrite: false,
    }),
  );
  sombra.rotation.x = -Math.PI / 2;
  sombra.position.y = 0.002;
  return sombra;
}
