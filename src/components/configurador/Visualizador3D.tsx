"use client";

import {
  Check,
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Maximize2,
  RotateCcw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import {
  acabamentoDaPeca,
  mudanca,
  type Destaque,
  type Estado3d,
  type TipoDestaque,
} from "@/lib/configurador/modelo3d";

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

// Inox polido. É o único material que o front cria: o resto da aparência vem do
// CAD, mas este muda com a escolha do vendedor e por isso mora aqui.
const INOX = { cor: 0xdfe3e8, metalico: 1, rugosidade: 0.24 };

// De onde a câmera olha (à direita, um pouco acima e à frente) e quanta folga
// sobra em volta do produto.
const DIRECAO_CAMERA = new THREE.Vector3(0.9, 0.5, 1);
const FOLGA = 1.12;

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

  // Monta a cena uma vez por arquivo. Tudo que é criado aqui é destruído no
  // retorno: WebGL não tem coletor de lixo, e contexto vazado trava a aba
  // depois de algumas navegações.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let vivo = true;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        // Serrilhado por multiamostragem custa banda de memória em tela grande.
        // Numa tela densa (retina, celular) o próprio pixel já resolve, e aí ele
        // sai; na tela comum ele fica, que é onde faz falta.
        antialias: window.devicePixelRatio < 1.5,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      onFalhaRef.current?.();
      return;
    }

    // Teto de resolução: em tela densa, desenhar 2x em cada eixo é 4x de
    // trabalho por quadro para uma diferença que quase não se vê num painel
    // deste tamanho. É a mudança que mais tira travada em vídeo integrado.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(container.clientWidth, container.clientHeight || 1);
    renderer.toneMapping = THREE.NeutralToneMapping;
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
    // quando há o que refletir. A "sala" procedural do three faz esse papel sem
    // baixar textura nenhuma.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    cena.environment = ambiente;
    pmrem.dispose();

    const luz = new THREE.DirectionalLight(0xffffff, 1.6);
    luz.position.set(2, 3, 2.5);
    cena.add(luz);
    cena.add(new THREE.AmbientLight(0xffffff, 0.35));

    const controles = new OrbitControls(camera, renderer.domElement);
    controles.enableDamping = true;
    controles.enablePan = false;
    controles.zoomSpeed = 0.8;
    // Giro livre nos dois eixos, como em qualquer visualizador de CAD: dá para
    // olhar o carro por baixo (rodízios, base) e por cima (tampo).

    // Peças e centro do modelo: preenchidos quando o arquivo chega, mas
    // declarados aqui porque os marcadores precisam deles para achar a peça.
    interface PecaCarregada {
      no: THREE.Object3D;
      pintaveis: THREE.Mesh[];
      centro: THREE.Vector3;
    }
    const pecasCarregadas = new Map<string, PecaCarregada>();
    const centroDoModelo = new THREE.Vector3();

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

    // Giro automático: guarda o ângulo de partida e o de chegada e caminha
    // entre os dois. Qualquer arrasto do usuário cancela (o `start` abaixo).
    let giro: { de: number; para: number; phi: number; raio: number; inicio: number } | null = null;
    controles.addEventListener("start", () => {
      giro = null;
    });

    // Desenho SOB DEMANDA. Antes o laço rodava a 60 quadros por segundo para
    // sempre, mesmo com o produto parado, e disputava a linha principal com a
    // rolagem da página: era daí que vinha a travada. Agora cada mexida pede um
    // quadro, e o laço se desliga sozinho quando a cena assenta.
    let animacao = 0;
    let precisaDesenhar = false;

    function laco(agora: number) {
      if (giro) {
        const parte = Math.min((agora - giro.inicio) / GIRO_MS, 1);
        // easeInOutCubic: sai e chega devagar, sem tranco.
        const suave = parte < 0.5 ? 4 * parte ** 3 : 1 - (-2 * parte + 2) ** 3 / 2;
        const theta = giro.de + (giro.para - giro.de) * suave;
        camera.position.setFromSphericalCoords(giro.raio, giro.phi, theta).add(controles.target);
        camera.lookAt(controles.target);
        if (parte === 1) giro = null;
        precisaDesenhar = true;
      }

      // `update()` devolve true enquanto a inércia do arrasto ainda está
      // acabando; é o que mantém o laço vivo até o produto parar de verdade.
      const assentando = controles.update();
      if (assentando || precisaDesenhar) {
        renderer.render(cena, camera);
        if (transitorio || fixos.length > 0) posicionarMarcadores();
        precisaDesenhar = false;
      }

      animacao = assentando || giro ? requestAnimationFrame(laco) : 0;
    }

    function pedirQuadro() {
      precisaDesenhar = true;
      if (animacao === 0) animacao = requestAnimationFrame(laco);
    }

    // Enquanto o dedo/mouse está no produto, o laço fica ligado: o `update()`
    // só passa a valer depois que o controle processa o movimento.
    controles.addEventListener("change", pedirQuadro);

    function ajustarAo(alvo: HTMLElement) {
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
      if (alvo instanceof HTMLElement) ajustarAo(alvo);
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

        // Índice das peças: o nó que se acende e apaga, as malhas que trocam de
        // acabamento e o centro (medido AGORA, com tudo visível, para o
        // marcador saber apontar até peça que foi apagada depois).
        for (const no of modelo.children) {
          if (!no.name.startsWith(PREFIXO_PECA)) continue;
          const pintaveis: THREE.Mesh[] = [];
          no.traverse((filho) => {
            const malha = filho as THREE.Mesh;
            if (malha.isMesh && (malha.material as THREE.Material).name === MATERIAL_CONFIGURAVEL) {
              malha.userData.materialCad = malha.material;
              pintaveis.push(malha);
            }
          });
          const centro = new THREE.Box3().setFromObject(no).getCenter(new THREE.Vector3());
          pecasCarregadas.set(no.name.slice(PREFIXO_PECA.length), { no, pintaveis, centro });
        }

        cena.add(modelo);
        cena.add(sombraDeContato(modelo));

        const esfera = new THREE.Box3()
          .setFromObject(modelo)
          .getBoundingSphere(new THREE.Sphere());
        centroDoModelo.copy(esfera.center);

        function enquadrar() {
          // Distância em que o produto inteiro cabe na MENOR abertura da tela (a
          // vertical num painel largo, a horizontal num painel estreito).
          const fovVertical = (camera.fov * Math.PI) / 180;
          const fovHorizontal = 2 * Math.atan(Math.tan(fovVertical / 2) * camera.aspect);
          const distancia =
            (esfera.radius / Math.sin(Math.min(fovVertical, fovHorizontal) / 2)) * FOLGA;
          camera.position
            .copy(esfera.center)
            .addScaledVector(DIRECAO_CAMERA.clone().normalize(), distancia);
          controles.target.copy(esfera.center);
          // Dá para chegar perto de um detalhe (a trava, o suporte de soro) sem
          // atravessar o produto, e afastar até enxergar o carro inteiro.
          controles.minDistance = esfera.radius * 0.45;
          controles.maxDistance = distancia * 2;
          controles.update();
          pedirQuadro();
        }
        enquadrar();

        // Gira até a peça só quando ela está escondida atrás do produto. O
        // deslocamento dela em relação ao centro é o que diz para que lado ela
        // olha; peça central (tampo, estrutura) não pede giro nenhum.
        function girarAte(ancora: THREE.Vector3) {
          const lado = new THREE.Vector3(ancora.x - esfera.center.x, 0, ancora.z - esfera.center.z);
          if (lado.length() < esfera.radius * 0.12) return;

          const atual = new THREE.Spherical().setFromVector3(
            camera.position.clone().sub(controles.target),
          );
          const desejado = Math.atan2(lado.x, lado.z);
          // Diferença pelo caminho mais curto: sem isto o giro pode dar a volta
          // pelo lado longo quando os ângulos cruzam o -180°.
          const diferenca = Math.atan2(
            Math.sin(desejado - atual.theta),
            Math.cos(desejado - atual.theta),
          );
          if (Math.abs(diferenca) < GIRO_MINIMO) return;
          giro = {
            de: atual.theta,
            para: atual.theta + diferenca,
            phi: atual.phi,
            raio: atual.radius,
            inicio: performance.now(),
          };
          pedirQuadro();
        }

        cenaRef.current = {
          enquadrar,
          anexar(alvo) {
            if (!alvo || renderer.domElement.parentElement === alvo) return;
            observador.disconnect();
            alvo.append(renderer.domElement, camada);
            observador.observe(alvo);
            ajustarAo(alvo);
          },
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
            for (const [chave, { no, pintaveis }] of pecasCarregadas) {
              no.visible = !atual.ocultas.has(chave);
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
      clearTimeout(sumico);
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
      renderer.domElement.remove();
      renderer.dispose();
      cenaRef.current = null;
      setCarregado(false);
    };
  }, [arquivo]);

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
          fica num div só dela, sem irmão que o React possa remover embaixo. */}
      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {!carregado && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Carregando 3D{progresso > 0 ? ` ${progresso}%` : ""}
          </p>
        )}
      </div>

      {ampliado && (
        <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-border bg-card/90 px-3 py-1 text-[11px] text-muted-foreground backdrop-blur">
          {anotacoes.length === 0
            ? "Tudo no padrão: nada para apontar no modelo."
            : anotando
              ? `Apontando ${anotacoes.length} ${anotacoes.length === 1 ? "mudança" : "mudanças"} em relação ao padrão.`
              : "Etiquetas escondidas."}
        </p>
      )}

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
